# Vista «Subasta × Pawn» — cruce determinista de ofertas con mis pesos

Estado: **implementado** (fase 1 cerrada: catálogo de stats + puntuador + vista).
Rama `main`. Idioma de trabajo: español. Sin red en tiempo de cálculo.

Misión: dada (a) la tabla de ofertas que el plugin ya ingiere y (b) la escala Pawn
capturada del personaje, rankear ofertas por **cuánto valen para mí según mis propios
pesos**, con fórmula declarada, reproducible y byte-idéntica para la misma entrada.
DAVI puede explicar la tabla; nunca producirla.

---

## 1. Reconocimiento (verificado contra el cliente y el addon instalados)

Todo lo de abajo se comprobó en el cliente real, no en documentación de terceros.

| Hecho | Evidencia |
|---|---|
| `C_Item.GetItemStats` **existe** en este cliente y responde a ítems que **no llevo puestos** | `Interface/AddOns/ForeverDungeonJournal/Systems/LootFilter.lua:482-486` lo llama con `"item:" .. itemID` para botín (nunca equipado) y lo envuelve en `pcall`, tratando `next(stats) == nil` como «not loaded yet» |
| Fallback con la API antigua y uso defensivo | `Simulationcraft/forever/stats.lua:70-78`: `(C_Item and C_Item.GetItemStats) or _G.GetItemStats` |
| Pawn ya usa la API para un link cualquiera (reliquias) | `Pawn/Pawn.lua:4706`: `C_Item.GetItemStats(ItemLink, Stats)` |
| El cliente produce las claves `ITEM_MOD_*` (el espacio de nombres de stats) | `strings Wow.exe` registra 133 constantes `ITEM_MOD_*` / `RESISTANCE*_NAME` (lista exacta en el fixture de tests) |
| Posiciones de retorno verificadas: `ilvl` = 4.º, `reqLevel` = 5.º, `InvType` = 9.º de `GetItemInfo` | `Pawn/Pawn.lua:1422` (`ItemLevel`), `:942` (`MinLevel`), `:2091`/`:4227` (`select(9)` → `InvType`) |
| Metadatos de tipo sin caché completa: `GetItemInfoInstant` → `ItemID, _, _, InvType, ItemTexture, ItemClassID, ItemSubClassID` | `Pawn/Pawn.lua:1341` y `:1388` (mismo `select` y orden) |
| `ilvl` efectivo | `C_Item.GetDetailedItemLevelInfo(link)` — `Pawn/Pawn.lua:1422`, `:1623` |
| Ítem no cacheado → `GetItemInfo` devuelve nil | `Pawn/Pawn.lua:1389-1395`: «We didn't get a new item link… not in the user's local WoW cache» |
| Espacio de claves de los **pesos** Pawn (destino de la suma) | `Pawn/TooltipParsing.lua` (90 claves: `Agility`, `Stamina`, `CritRating`, `Ap`, `Rap`, `SpellDamage`, `Mp5`, `Armor`, …) y `Pawn/ScaleTemplates.lua` |
| El cliente Forever **no** tiene `C_Timer` | `addon/WoWForeverBridge/Bridge.lua:9` — «Nada de C_Timer/API moderna» |
| Un array Lua llega a JS como objeto con claves string | `standalone/market.js:769-779`; mitigado con `listaNumerada()` en `desktop/src/pawn.js:176-183` |

**Conclusión del hueco de datos.** `GetItemStats` responde para ítems no equipados
**si el cliente los tiene cacheados** (los recibió de la subasta o del botín en esta
sesión); si no, devuelve vacío. Por eso el diseño **no asume** el catálogo completo:
cosecha con cursor persistente y reintenta lo que quedó sin resolver. Si no hay
catálogo, la vista nace `SIN DATOS` con motivo `sin-catalogo-stats`.

Los stats de `GetItemStats` vienen en claves `ITEM_MOD_*`; los pesos Pawn en claves
propias (`Stamina`, `CritRating`, …). **Sin una tabla de equivalencia declarada la
suma daría 0 en silencio.** Esa tabla es parte del contrato (§3.3) y está testeada
contra las 133 claves que el cliente registra.

---

## 2. Fórmula (contrato, no sugerencia)

Para una escala `e` con pesos `pesos`:

```
score(item, e)  = Σ_stat stats[item][stat] * pesos[stat]
delta(item, e)  = score(item, e) − score(equipado[slot(item)], e)
plata_por_punto = precio_plata(item) / delta(item, e)      (solo si delta > 0)
orden           = delta DESC, empate por itemID ASC
```

Reglas duras:

- stats que no aparecen en `pesos` valen 0; no se interpolan ni se adivinan;
- ítem sin stats cosechados → **excluido** `sin-stats` (nunca score 0 silencioso);
- stats presentes pero cuya clave no está en la tabla de equivalencia → la fila se
  emite con `sin_mapa: [claves]` y un aviso visible: se declara lo que no se pudo usar;
- slot desconocido (equipLoc fuera de la tabla de §3.4) → excluido `sin-slot`;
- sin escala capturada o sin pesos → vista entera `SIN DATOS` (`sin-escala-pawn`);
- `delta ≤ 0` → la fila existe (el orden es delta DESC) pero `plata_por_punto` es
  `null` y se muestra «—» con nota `sin-ganancia`: no se divide por cero ni por negativo;
- redondeo **solo** de presentación a 2 decimales; el cálculo interno usa el valor completo;
- cero aleatoriedad, cero `Date.now()` dentro del cálculo, cero red;
- misma entrada → misma tabla, byte a byte (test golden con dos fixtures fijos).

Comparación con lo equipado: por `equipLoc` normalizado (§3.4). Si hay **varios**
ítems equipados del mismo tipo (anillos, abalorios, una mano), `equipado[slot]` es el
de **menor score** — es el que la oferta reemplazaría — con empate resuelto por índice
de slot ascendente. Slot vacío → línea base 0 y la fila lo declara (`equipado: 'vacio'`).

---

## 3. Contrato de datos nuevo

### 3.1 Addon → `WoWForeverBridgeDB.pawnCatalogo`

Escrito por `addon/WoWForeverBridge/Pawn.lua` (misma familia que `pawn`), leído por
`desktop/src/pawn-catalogo.js`. Claves cortas por tamaño del SavedVariables.

```lua
WoWForeverBridgeDB.pawnCatalogo = {
  v = 1,
  colhido = 1732233600,   -- epoch de la última escritura con al menos un ítem resuelto
  ciclo = 7,              -- ciclos de cosecha completados desde el inicio
  cursor = 4213,          -- último itemID procesado (ASC); 0 = reinicio de vuelta
  volta = 2,              -- vueltas completas sobre la lista de ids
  fonte = 1874,           -- ids numéricos vistos en AUCTIONATOR_PRICE_DATABASE
  resolvidos = 612,       -- ítems presentes en `itens`
  pendentes = 1262,       -- ids de la fuente sin stats todavía (no cacheados)
  truncado = false,       -- true si se alcanzó MAX_ITENS y se dejó de cosechar
  itens = {
    [4213] = { i = 44, r = 40, l = "INVTYPE_CHEST", c = 4, s = 3,
               k = { ITEM_MOD_STAMINA_SHORT = 12, ITEM_MOD_AGILITY_SHORT = 8 } },
  },
}
```

- `i` = ilvl, `r` = requiredLevel, `l` = equipLoc (`INVTYPE_*`), `c` = classID,
  `s` = subClassID, `k` = stats crudos (`ITEM_MOD_*` → entero).
- Sin nombre de ítem ni de personaje: el plugin ya tiene catálogo propio de nombres.
- Fuente de ids: el global `AUCTIONATOR_PRICE_DATABASE` que el addon **ya** lee
  (`Bridge.lua:46-49`), solo claves decimales positivas, ordenadas ASC.
- Cosecha por lotes (`MAX_LOTE = 200` por ciclo, `MAX_TICK = 25` por frame en
  `OnUpdate`): `GetItemInfo(id)` → si devuelve link, `GetItemInfoInstant` +
  `GetDetailedItemLevelInfo` + `GetItemStats(link)` dentro de `pcall`. Sin
  `C_Timer`, sin esperas de frames que bloqueen.
- Cursor ascendente que **salta ids ya resueltos**; al llegar al final vuelve a 0,
  incrementa `volta`, poda `itens` de ids que ya no están en la fuente (subasta
  cambió) y reintenta los pendientes. Tope `MAX_ITENS = 3000`.
- Si `GetItemInfo` devuelve nil el ítem queda pendiente: nunca se inventa el valor.
- `/wfbp catalogo` (o `/wfbpawn catalogo`) fuerza un ciclo completo y reporta
  `resolvidos/pendentes` por chat.

### 3.2 Equipo puesto por slot → `WoWForeverBridgeDB.pawn.equipado`

El delta necesita los stats del ítem equipado **de ese slot**, y la captura actual
solo guarda los valores por escala del conjunto (`equipo.valores`). Se añade:

```lua
pawn.equipado = { [5] = { id = 4213, i = 44, l = "INVTYPE_CHEST", k = { … } }, … }
```

19 slots (`GetInventoryItemLink('player', slot)`), solo los que tengan link. Se
captura en el mismo punto que el resto de `pawn` y **no** sustituye a
`equipo.valores` (que sigue siendo el valor que calcula Pawn, útil como contraste).
`posicionEquipo` es la tabla de slots → `equipLoc` normalizado de §3.4.

### 3.3 Tabla de equivalencia stats crudos → claves Pawn

En `desktop/src/pawn-catalogo.js`, declarada y testeada:

`ITEM_MOD_STAMINA_SHORT → Stamina`, `…_AGILITY_SHORT → Agility`, `…_STRENGTH_SHORT →
Strength`, `…_INTELLECT_SHORT → Intellect`, `…_SPIRIT_SHORT → Spirit`,
`…_ATTACK_POWER_SHORT`/`…_MELEE_ATTACK_POWER_SHORT → Ap`, `…_RANGED_ATTACK_POWER_SHORT →
Rap`, `…_FERAL_ATTACK_POWER_SHORT → FeralAp`, `…_CRIT_RATING_SHORT`/`CRIT_MELEE`/
`CRIT_RANGED → CritRating`, `…_CRIT_SPELL_RATING_SHORT → SpellCritRating`,
`…_HIT_RATING_SHORT`/`HIT_MELEE`/`HIT_RANGED → HitRating`, `…_HIT_SPELL_RATING_SHORT →
SpellHitRating`, `…_HASTE_RATING_SHORT → HasteRating`, `…_EXPERTISE_RATING_SHORT →
ExpertiseRating`, `…_DODGE_RATING_SHORT → DodgeRating`, `…_PARRY_RATING_SHORT →
ParryRating`, `…_BLOCK_RATING_SHORT → BlockRating`, `…_BLOCK_VALUE_SHORT → BlockValue`,
`…_DEFENSE_SKILL_RATING_SHORT → DefenseRating`, `…_RESILIENCE_RATING_SHORT →
ResilienceRating`, `…_SPELL_PENETRATION_SHORT → SpellPenetration`,
`…_ARMOR_PENETRATION_RATING_SHORT → ArmorPenetration`, `…_MASTERY_RATING_SHORT →
MasteryRating`, `ITEM_MOD_VERSATILITY → Versatility`, `…_SPELL_HEALING_DONE_SHORT →
Healing`, `…_SPELL_DAMAGE_DONE_SHORT → SpellDamage`, `…_SPELL_POWER_SHORT →
SpellPower`, `…_{FIRE,FROST,NATURE,SHADOW,ARCANE,HOLY}_DAMAGE_DONE_SHORT →
{Fire,Frost,Nature,Shadow,Arcane,Holy}SpellDamage`, `RESISTANCE0_NAME → Armor`,
`RESISTANCE{2,3,4,5,6}_NAME → Fire/Frost/Nature/Shadow/ArcaneResist`,
`…_MANA_REGENERATION_SHORT → Mp5`, `…_HEALTH_REGEN_SHORT → Hp5`,
`…_MOVEMENT_SPEED_SHORT`/`…_SPEED_SHORT → MovementSpeed`, `…_CR_LIFESTEAL_SHORT →
Leech`, `…_DAMAGE_PER_SECOND_SHORT → Dps`.

Toda clave `ITEM_MOD_*` del cliente que **no** esté en la tabla (oficios, daño contra
tipos, resistencias a la escuela «holy», etc.) se considera fuera del modelo de Pawn:
no suma y se reporta en `sin_mapa` cuando aparece en un ítem puntuable.

### 3.4 `equipLoc` → slot normalizado

```
INVTYPE_HEAD → cabeza     INVTYPE_NECK → cuello      INVTYPE_SHOULDER → hombros
INVTYPE_CLOAK → espalda   INVTYPE_CHEST/ROBE → pecho INVTYPE_WRIST → munecas
INVTYPE_HAND → manos      INVTYPE_WAIST → cintura    INVTYPE_LEGS → piernas
INVTYPE_FEET → pies       INVTYPE_FINGER → anillo (2) INVTYPE_TRINKET → abalorio (2)
INVTYPE_WEAPON → arma1m (2)  INVTYPE_WEAPONMAINHAND → mano principal
INVTYPE_WEAPONOFFHAND → mano secundaria  INVTYPE_HOLDABLE → mano secundaria
INVTYPE_SHIELD → mano secundaria         INVTYPE_2HWEAPON → dos manos (ocupa ambas)
INVTYPE_RANGED/RANGEDRIGHT/THROWN → distancia   INVTYPE_RELIC → reliquia
```

Cualquier otro `INVTYPE_*` → `sin-slot`. `INVTYPE_2HWEAPON` se compara contra la mano
principal y la fila lo declara (`dos_manos: true`).

### 3.5 Plugin: storage y sincronización

- `'pawn-stats'` (nuevo): `{ v:1, colhido, resolvidos, pendentes, volta, truncado, itens }`
  normalizado, con tope de 3000 ítems y 40 stats por ítem.
- `bridge.js` → `parseBridge` añade `pawnCatalogo` (delegando en `parsePawnCatalogo`);
  campo nuevo explícito: el parser descarta lo desconocido, así que sin esto el
  catálogo no llega nunca (trampa conocida del repo).
- `bridge-sync.js` llama `sincronizarPawnStats(ctx, journal)` junto a
  `sincronizarPawn`, y se lee desde la vista con `lerPawnStats(ctx)`.

---

## 4. Módulos

| Archivo | Rol |
|---|---|
| `desktop/src/pawn-catalogo.js` | parser del catálogo, tabla de equivalencia, normalización de slot, sync |
| `desktop/src/subasta-pawn.js` | **puro**: `puntuar`, `deltaContraEquipado`, `plataPorPunto`, `rankear` |
| `desktop/src/vistas/subasta-pawn.jsx` | sub-pestaña dentro de Mercado |
| `desktop/src/vistas/mercado.jsx` | barra de sub-pestañas (`Mercado` / `Subasta × Pawn`) |
| `addon/WoWForeverBridge/Pawn.lua` | cosecha de stats + `equipado` por slot + `/wfbp catalogo` |
| `addon/WoWForeverBridge/Logic.lua` | matemática pura del cursor/lote (testeable con lua5.1) |

Salida de `rankear`:

```js
{
  estado: 'ok' | 'sin-datos',
  motivo: null | 'sin-escala-pawn' | 'sin-catalogo-stats' | 'sin-ofertas',
  escala: { nome, localized, capturado, pesos },
  filas: [{ itemID, equipLoc, slot, ilvl, precio, score, delta, plataPorPunto,
            equipado: 'comparado'|'vacio', sinMapa: [claves], dosManos }],
  excluidos: [{ itemID, motivo: 'sin-stats'|'sin-slot'|'precio-invalido' }],
  resumen: { ofertas, puntuadas, excluidas, sinMapa },
  procedencia: { precios: {fecha}, stats: {colhido}, escala: {capturado} },
}
```

`precio` = `unitPriceCopper` del snapshot (cobre). `precio_plata = precio/100`.

## 5. Vista

Sub-pestaña **«Subasta × Pawn»** dentro de Mercado (la de Mercado queda por defecto,
así no cambian las 56 pruebas existentes). Columnas: ítem (nombre del catálogo +
icono), slot, ilvl, precio, `score`, `delta`, `plata_por_punto`, aviso de
`sin_mapa`, procedencia (fecha snapshot · fecha cosecha · fecha escala) y el aviso
fijo: «Ranking por fórmula con tus pesos Pawn. No es una recomendación, no es DPS y
no predice precios.» Estados vacíos con motivo explícito y el siguiente paso
(`/wfbp catalogo` + `/reload`) cuando falte el catálogo.

## 6. Pruebas

- `tests/item-stats.test.mjs`: parseo del bloque real escrito como Lua
  (`parseSavedVariables` → objetos con claves string, **la trampa de las tablas**),
  rechazo de basura, topes, tabla de equivalencia completa contra las 133 claves del
  cliente, normalización de `equipLoc`, `sincronizarPawnStats`.
- `tests/subasta-pawn.test.mjs`: fórmula con fixtures, exclusión por `sin-stats` y
  `sin-slot`, `delta` contra slot vacío y contra anillo peor, `plata_por_punto` nulo
  con delta ≤ 0, `sin_mapa`, y **golden de determinismo** (misma entrada → mismo JSON).
- `addon/tests/test_bridge.lua`: cursor/lote/vuelta/poda en `Logic` + cosecha con un
  `C_Item` falso (incluye el caso «no cacheado»).
- `desktop/test/vista-subasta-pawn.mjs`: estados vacíos con motivo, tabla ordenada,
  procedencia visible, aviso de fórmula, tablas Lua como objetos (fixture real de
  SavedVariables, no array JS).
- `run-gates.mjs`: conteos actualizados a mano (node, lua, y `BROWSER` + total).

## 7. Fases

- [x] F1 · Reconocimiento con evidencia (§1).
- [x] F2 · Cosecha en el addon (`pawnCatalogo`) + `equipado` por slot.
- [x] F3 · Parser + equivalencia + storage en el plugin (`desktop/src/item-stats.js`,
      clave `pawn-stats`, lectura en `bridge.js` y persistencia en `bridge-sync.js`).
- [x] F4 · Puntuador puro y ranking (`desktop/src/subasta-pawn.js`).
- [x] F5 · Sub-pestaña en Mercado (`desktop/src/vistas/subasta-pawn.jsx`).
- [x] F6 · Tests + gates verdes + docs. Ver §9 para los conteos reales.

## 8. Fuera de alcance

Simulación de DPS, «best in slot», predicción de precios, texto generado por modelo
dentro de la tabla, y cualquier escritura en el juego o en la subasta.

## 9. Cierre verificado

Corrida real de `node scripts/run-gates.mjs` el 2026-11-22: **20/20 gates verdes**.

| Gate | Esperado | Obtenido |
|---|---|---|
| node `tests/` | 353 | 353 (fail 0) |
| python `tests/` | 86 | 86 |
| node motor `.cjs` | 78 | 78 |
| lua bridge | 180 | 180 (fallos 0) |
| navegador (13 suites) | 377 | 377 (red 0, errores 0) |

Decisiones que el código terminó imponiendo sobre el diseño inicial:

- `mapearStats` es **idempotente**: el storage ya guarda claves Pawn, así que una
  clave canónica (`Agility`) se conserva en vez de reportarse como «sin mapa».
  Sin esto la tabla salía con `score: 0` y todo en `sinMapa`.
- `precioPorItem` ignora precios ≤ 0: un 0 en el snapshot no puede enmascarar el
  precio real al tomar el mínimo; si todas las ofertas del ítem son inválidas, el
  motivo es `precio-invalido`.
- El id del equipo puesto llega en `id` (no `itemID`) desde el SavedVariables del
  puente; `parseEquipado` acepta ambas formas y normaliza.
- Queda sin confirmar en vivo (no bloquea): que `C_Item.GetItemStats` responda para
  ítems de subasta no equipados en Interface 16001. Si no responde, la vista nace
  `SIN DATOS · sin catálogo de stats de ítems`, que es el comportamiento previsto.
