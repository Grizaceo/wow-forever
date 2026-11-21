# TASK — Equipo inteligente: SimC + Pawn + mercado (woW-forever)

> Runbook para un agente ejecutor (Devin CLI, SWE-2, bypass).
> **DAVI es el revisor y el arquitecto.** Tú ejecutas **una fase por corrida** y entregas evidencia.
> No diseñas la arquitectura ni cambias el alcance. Si algo del plan no se sostiene contra la realidad, **paras y lo reportas**.

---

## 0. Contrato de trabajo

- **FASE ACTIVA: 2** ← la cambia DAVI entre corridas. Ejecuta **solo** esa fase. No adelantes fases.
- Al terminar: `REVIEW.md` (raíz del repo) con lo que pedí en §10. Sin `REVIEW.md` la entrega se rechaza.
- **Commits locales** por fase, mensaje `feat(equipo): fase N — <qué>`. **Nunca `git push`.**
- No toques `~/.hermes/` (ni `desktop-plugins`, ni `plugins`): el despliegue y la instalación los hace DAVI.
- Si un dato del plan contradice el repo o el cliente, **no lo parchees en silencio**: anótalo en `REVIEW.md` bajo `## Contradicciones` y detente en ese punto.

## 1. Repo y estado de partida

- Repo: `/home/gris96/wow-forever` (rama `main`, publicado en `github.com/Grizaceo/wow-forever`).
- Estado al abrir la fase 2: **gates 18/18**, node **307**, python **86**, lua **68**, navegador **334** (11 suites), `desktop/plugin.js` **6.798.457 bytes** (sha256 `627b3d6d…`), commits locales `551fb9c` (fase 1) y `c5d1f4b` (docs de testing), `main` **ahead 2** sin push.
- Producto: guía offline de WoW Forever para Hermes Desktop (plugin nativo de Hermes, sin red).
- Idioma de la UI: español por defecto. **Hay dos diccionarios** (`const TEXTOS = { es: ES, en: EN }`, `desktop/src/i18n.js:83`), no tres: usa `agregarTextos({es}, {en})` y `t(lang, 'clave')`; nunca dupliques claves.
- Componentes: solo los de `@hermes/plugin-sdk` (`Button, Checkbox, Input, Select, SegmentedControl`) y estilos de `desktop/src/estilos.js` (`C`, `S`, `DIFICULTAD`). **`S.nota` no existe.**
- Datos generados: `data/*.json` + `data/MANIFEST.json` (sha256 por archivo). **No editar a mano**; se regeneran con `tools/build-datos-juego.py` y un test compara contra el manifiesto.
- El addon `WoWForeverBridge` **1.1.0** (con `Personaje.lua`) ya está instalado en el cliente y en el repo; el bundle del desktop ya está desplegado. No hace falta desplegar nada para probar.

## 2. Objetivo

Que el plugin sepa **quién es tu personaje de verdad** (stats, equipo puesto, talentos) leído de **SimulationCraft**, sepa **qué mejora** según **Pawn**, y **recomiende ofertas de subasta que sean mejora real y estén baratas contra su propio histórico de precios** (Auctionator + TSM, que ya se importan).

Entregables por fase:

1. **Estado del personaje** desde el export string de SimC (parser propio en JS + captura desde el addon). ✅ fase 1
2. **Escala Pawn** (pesos por stat + valor del equipo puesto) desde el addon Pawn. ← **fase 2, esta corrida**
3. **Stats por ítem** (`InventoryType`, stats primarios/secundarios, armadura/daño, requisitos) para los 22.821 ítems del catálogo — hoy **no existen**.
4. **Recomendador de equipo** en la UI + contexto para DAVI: ΔPawn por slot, precio actual, percentil histórico, y «barato / sin histórico».
5. **Ruta de oro del personaje real**: el recomendador de farmeo/ROI que ya existe, alimentado con el estado real (nivel/clase/spec/profesiones de SimC, equipo de Pawn) para decir la mejor ruta de farmeo en oro y qué ítem conviene farmear. ← fase 5, diseño en §9

## 3. Hechos verificados hoy (no los re-verifiques, pero úsalos)

Cliente y addons **están en este PC** (Wine/Battle.net, no hace falta adivinar nada):

| Qué | Ruta |
|---|---|
| Raíz del cliente | `~/Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_forever_/` |
| AddOns | `…/_forever_/Interface/AddOns/` |
| SavedVariables | `…/_forever_/WTF/Account/<cuenta>/SavedVariables/` (el nombre de cuenta lleva `#`: **usa `find`, no globs**) |
| Dump de tablas del cliente | `~/.cache/wow-forever-drops/wowf/ItemSparse.csv` (y `wowf/esMX/ItemSparse.csv`) |

Addons instalados relevantes (versiones reales):

- `Pawn` **2.14.3** — `## SavedVariables: PawnCommon`. **Hechos de la fase 1 confirmados y ampliados:**
  - SavedVariables de cuenta `Pawn.lua` = **9.886 bytes**: `PawnCommon` con `["Scales"]` que trae **29 entradas** con `Provider`, `ClassID`, `SpecID`, `Role`, `LocalizedName`, colores… y **ningún campo `Values`**: los pesos **no** están persistidos.
  - SavedVariables por personaje `…/WTF/Account/<cuenta>/<realm>/<Personaje>/SavedVariables/Pawn.lua` = **2.238 bytes**: `PawnOptions` con `LastVersion`, `LastPlayerFullName`, `AutoSelectScales` y `ItemLevels[{ID, Level, Link}]`. Tampoco trae pesos. **Ojo: contiene el nombre del personaje → jamás a fixtures, docs ni commits.**
  - Los pesos **sí** son legibles en runtime: `PawnGetAllStatValues(ScaleName)` devuelve `PawnCommon.Scales[ScaleName].Values` (tabla stat→valor) — `Pawn.lua:5146-5166`; falla con `VgerCore.Fail` si Pawn no está inicializado o el nombre de escala no existe (es *case-sensitive*).
  - Firma/retorno de las otras APIs, leídas del fuente instalado:
    - `PawnGetInventoryItemValues(UnitName)` → **tres retornos**: `TotalValues, Count, TotalItemLevel`. `TotalValues` es un array ordenado de `{ScaleName, Value, 0, LocalizedName}`; `TotalItemLevel` es el item level promedio (`Pawn.lua:2028-2095`).
    - `PawnGetAllScalesEx()` → array de `{Name, LocalizedName, Header, IsVisible, IsProvider}` (`Pawn.lua:5203+`).
    - `PawnGetDefaultScale(ClassID, SpecID, NoStats)` → `{ClassID, SpecID, PerCharacterOptions, Values}` (`Pawn.lua:834-857`). Es la escala **por defecto** para clase/spec, no necesariamente la activa.
    - `PawnGetAllScales()` → nombres (`Pawn.lua:5205`), `PawnGetItemData(ItemLink)`, `PawnGetItemDataForInventorySlot(Slot, Unenchanted, UnitName)`, `PawnCanItemHaveStats`, `PawnAddStatsToTable`, `PawnCombineStats` existen todas.
    - **No existe** `PawnGetScaleForPlayer` ni equivalente: la «escala activa» hay que inferirla (ver §6).
  - `PawnCommon` es global en el juego: el addon puede leer `PawnCommon.Scales[...]` directamente, sin depender de que Pawn esté inicializado del todo.
- `Simulationcraft` **12.1.5-04** — `## SavedVariables: SimulationCraftDB`; `Simulationcraft.lua` es un stub de **192 bytes**: **no guarda ningún export**. `SimulationcraftAPI.GetSimcProfile(self, debugOutput, noBags, showMerchant, links)` está en `core.lua:1598-1600` y su cuerpo **no usa `self`** (por eso la fase 1 la llama con `nil`). El export incluye `professions=<nombre>=<skill>,…` (la fase 1 ya parsea skill por profesión en `simc.js`).
- `Auctionator`, `TradeSkillMaster` — ya integrados (`desktop/src/auctionator.js`, `tsm.js`, `bridge.js`, `bridge-sync.js`).
- `WoWForeverBridge` **1.1.0** (nuestro, en `addon/WoWForeverBridge/`): `Logic.lua`, `Bridge.lua`, `Personaje.lua`, `## SavedVariables: WoWForeverBridgeDB`, `## OptionalDeps: Auctionator, Simulationcraft`, eventos `PLAYER_ENTERING_WORLD`, `PLAYER_LOGOUT`, `PLAYER_QUITING`, `AUCTION_HOUSE_CLOSED`; captura final antes del flush. `Personaje.lua` escribe `WoWForeverBridgeDB.personagem = {simc, capturado, origem='addon'}` y, en fallo, `personagemErro = {erro, capturado}` (nunca borra un export bueno). Tope compartido `512 * 1024`.
- **Sin captura en vivo todavía**: `SavedVariables/WoWForeverBridge.lua` no tiene `personagem` ni `personagemErro` porque el cliente no se abrió desde el despliegue. Eso **no** bloquea la fase 2: el addon debe quedar listo y probado con fixtures, y la captura se valida cuando el humano entre al mundo.

Datos y modelos internos:

- `data/items.json`: `{meta, items, huecos}`; `items[id] = [es, en, calidad, nivel_req, nivel_item, venta_cobre, clase, subclase, ligado, compra_cobre, vendedor, dps_x10]` — **sin stats ni `InventoryType`**.
- `perfil` en `ctx.storage` (v1): `{v, faccion, raza, clase, nivel, profesiones, secundarias, reino}`; validador en `src/perfil.js`; resumen para el agente en `perfilParaAgente()`.
- Parser Lua de SavedVariables ya existente: `HunterMarket.parseSavedVariables(bytes, 'NombreGlobal')` (usado por `bridge.js` y `tsm.js`). **Reúsalo**, no escribas otro.
- Lectura de archivos del juego: `ctx.files.requestFolder/readText/list` (grant por plugin, recordado). `ctx.files.writeText` escribe **solo** en la carpeta de datos del plugin, no en la concedida: **no hay canal de escritura hacia el juego**.
- Mercado: snapshot v2 con `history:[{day, low, high, available}]` por ítem; precios = **ofertas anunciadas** (`unitPriceCopper`), no ventas cerradas. Ya existe histórico; **no existe** cálculo de percentil.
- `data/profesiones.json`: `profesiones[<skillLineId>] = {n:{es,en}, tipo, tiers, recoleccion, entrenadores, recetas:[…]}`; cada receta trae `{spell, n:{es,en}, crea:[itemId,count], reactivos:[[itemId,count],…], rango:{aprende, amarillo, verde, gris}, receta_item, vendedores}` (**181 recetas** en Alquimia, **1.12 CMaNGOS**). El campo `rango.aprende` **es** el skill mínimo de la receta: sirve para filtrar por el skill real del personaje.
- Panel de venta ya existente: `desktop/src/vistas/profesiones/venta.jsx` ordena recetas por **neto = precio del plato − 5 % de subasta − reactivos comprados**, con nota fija de límites… pero su propia nota admite el hueco: *«tu skill no limita lo que puedes comprar»* → **no** filtra por skill ni por profesión del personaje, y no forma parte de ninguna vista de rutas.
- Patrón de UI con límites declarados: `desktop/src/vistas/profesiones/venta.jsx` (panel «Qué vender», `data-venta-fila` para los tests, nota fija de límites).
- **Fase 1 ya en el árbol**: `desktop/src/simc.js` (parser puro, exporta `CLAVE = 'personaje-simc'`, `parsearSimc`, propuesta de `perfil`, `estado` v1 `{v, origem, texto, capturado, erro}`), `addon/WoWForeverBridge/Personaje.lua`, `desktop/src/vistas/personaje-simc.jsx`, `tests/simc.test.mjs` (21 casos), suite `desktop/test/vista-personaje-simc.mjs` (11 checks). Reutiliza todo eso; no lo reescribas.

Motor de farmeo y ROI que **ya existe** (fase 5 lo alimenta, no lo reescribe):

- `standalone/market-farm.js` (1.545.269 bytes de datos aparte, motor puro): API `ENV.HunterFarm = {index, byZone, byMob, sources, itemMetrics, matchStats, rank, progression, travelFor, profRecommendations, trafficZones, spotCoords, fmt}`; `configure({HunterDropData, HunterMarketCatalog, HunterHistory, …})`.
  - `perfil` que consume: `{level, cls, fac, spec, pref, hubZones}`.
  - `ajustes` que consume: `{comp, zoneComp, gph, prof:{skin,herb,mine}, group, pvp, n, session}`.
  - `itemMetrics(scanItem, profile, settings)` → `{K, u, net, gph, farmCostPerUnit, margin, roi, doubtful, vendorFloor}`; `roi = margin / farmCost` (`market-farm.js:288`).
- Adaptador actual del desktop: `desktop/src/mercado-logica.js` → `perfilMotor(perfil, hubZones)` (solo entiende clases **1 Guerrero, 3 Cazador, 7 Chamán**; el resto puntúa sin bonus de equipo), `hubZonesDe(nivel, rutas, zonasJson, faccion)`, `ajustesBase(perfil)` (profesiones **binarias** por SkillLine 393 Desuello, 182 Herboristería, 186 Minería) y `normalizarAjustes`.
- Vista actual: `desktop/src/vistas/mercado/farmeo.jsx` (zonas A/B, camps, ítems útiles, competencia por zona). Usa `perfil` declarado: **no** mira el estado SimC ni Pawn.
- Datos de drops en el repo: `standalone/drop-data.js` (CMaNGOS classic-db, GPL-3.0, schemaVersion 1) con campos documentados en `DATA.fields`:
  - `zones[key] = [name, continent|dungeon|raid, alliance|horde|contested|city|instance, lvlMin, lvlMax]` (72 zonas)
  - `mobs[npcId] = [name, lvlMin, lvlMax, rank, mainZoneKey, mainZoneSpawns, respawnSec, farmableBy(a|h|ah), otherZones?]` (2.477)
  - `objects[goId] = [name, chest|herb|ore|fish, mainZoneKey, mainZoneSpawns, respawnSec, otherZones?]` (183)
  - `items[itemId] = [name, quality, class, subclass, invType, reqLevel, itemLevel, bonding, allowableClass, sellPriceCopper, sources[[m|o|s|p, id, chancePct, minCount, maxCount]], world?[mobLvlMin, mobLvlMax, mobCount, medianChancePct]]` (5.424)
  - **No hay requisito de skill por nodo**: `objects` no trae skill mínimo. Cualquier filtro por skill de profesión debe declararse como proxy (§9).

## 4. Reglas duras

1. **Prohibido inventar APIs de addons.** Todo símbolo global que uses en Lua debe existir en el addon instalado y quedar citado en `REVIEW.md` con archivo:línea.
2. **Sin red.** Nada de descargas, ni `curl`, ni librerías nuevas que traigan datos. Solo datos locales.
3. **Sin simulaciones falsas.** Si no hay datos para un ítem, no se recomienda: se declara el hueco. Nunca rellenes stats con valores plausibles.
4. **No toques `desktop/plugin.js` ni `BUNDLE.json` a mano**: se generan con `cd desktop && node build.mjs` y se validan con `python3 scripts/check_desktop_bundle.py` desde la raíz.
5. **No cambies contratos de `ctx.storage` sin migración** y sin test de migración (mira `oficios.js` y `recetas-propias.js` como patrón: `{v:1, …}`, siembra solo si la clave no existe).
6. **i18n**: cualquier texto nuevo va en los dos diccionarios (es, en). Si el patcheo por clave falla por duplicados, usa contexto amplio.
7. **Tests primero donde haya lógica pura** (parser, recomendador). Nada de `try/catch` que se trague errores para "que pase".
8. **Nada de datos personales en el repo**: el nombre del personaje/cuenta **no** entra en fixtures, docs ni commits. Anonimiza (`Personaje`, `Reino`) en cualquier fixture.
9. **No reescribas** `mercado-logica.js`, `bridge-sync.js` ni `market-farm.js`: extiéndelos.

## 5. Fase 1 — Estado del personaje desde SimC ✅ (cerrada, no la re-hagas)

Implementada en `551fb9c` + `c5d1f4b`. Solo toca algo de aquí si la fase 2 lo necesita (p. ej. ampliar el contexto de DAVI).

## 6. Fase 2 — Pawn: pesos y valor del equipo ← **FASE ACTIVA**

**Objetivo:** que el plugin tenga la escala Pawn real del personaje —pesos por stat y valor Pawn del equipo puesto— con procedencia y fecha, capturada del juego.

1. **`desktop/src/pawn.js`** — parser **puro** (sin DOM, sin SDK), reusando `HunterMarket.parseSavedVariables`:
   - `parsePawnScales(texto)` → `{versao, escalas: [{nome, localized, provider, classID, specID, role, temPesos}], errores}` desde `PawnCommon` (SavedVariables). **Nunca inventes pesos**: si la entrada no tiene `Values`, `temPesos:false`.
   - `parsePawnCaptura(valor)` → normaliza `WoWForeverBridgeDB.pawn` (lo que escribe el addon, §6.2): `{v, escala, localized, provider, classID, specID, pesos:{stat→número}, equipo:{valores:[{escala,valor,localized}], ilvl}, capturado, origem:'addon', truncado}`; acota tamaños y descarta lo inválido (devuelve `null`, no basura).
   - `escalaDoJogador(catalogo, captura, {clase, spec})` → elige la escala con motivo declarado, en este orden: (a) la capturada por el addon; (b) escala del catálogo con `classID == clase` y `specID == spec`; (c) `classID == clase`; (d) `null` + motivo. Devuelve `{escala, motivo, candidatas}`.
2. **Captura desde el addon** — en `addon/WoWForeverBridge/Personaje.lua` (o `Pawn.lua` nuevo listado en el `.toc` **después** de `Logic.lua`), siguiendo el patrón ya usado por `personagem` (pcall, nunca borra una captura buena, deja `pawnErro` si falla):
   - Disparadores: `PLAYER_ENTERING_WORLD`, `PLAYER_LOGOUT`, `PLAYER_QUITING` y `/wfbp pawn` (y `/wfbp` para todo). Registra el slash en `SLASH_WOWFOREVERBRIDGE3` / `SlashCmdList['WOWFOREVERBRIDGE3']` (el 1 y el 2 ya están tomados).
   - Escala activa (**inferida, no hay API**): lee `PawnCommon.Scales` (global) y elige la candidata con `(not Scale.Provider) or Scale.ProviderActive` cuyo `ClassID == select(3, UnitClass('player'))`; si `VgerCore and VgerCore.SpecsExist` y `GetSpecialization` existe, prefiere la de `SpecID == GetSpecialization()`. Guarda hasta **3** candidatas con `LocalizedName`, `Provider`, `ClassID`, `SpecID`, `Role`.
   - Pesos: `PawnCommon.Scales[nome].Values` o `PawnGetAllStatValues(nome)` dentro de `pcall`; **solo claves numéricas** (descarta tablas anidadas: `Values` puede traer sub-tablas), máximo 40 claves, recortando y marcando `truncado = true` si sobra.
   - Valor del equipo: `PawnGetInventoryItemValues('player')` → `valores = {{nome, valor, 0, localized}, …}` (máx 8 entradas) e `ilvl = TotalItemLevel`.
   - Forma escrita: `WoWForeverBridgeDB.pawn = {escala, localized, provider, classID, specID, pesos = {...}, equipo = {valores = {...}, ilvl = n}, capturado = time(), origem = 'addon', truncado = false}`; fallo → `WoWForeverBridgeDB.pawnErro = {erro, capturado}`.
   - Todos los accesos a Pawn con guardas (`if PawnCommon and PawnCommon.Scales then`, `if PawnGetInventoryItemValues then`, `if VgerCore and VgerCore.SpecsExist then`). Si no hay Pawn, silencio: el plugin declara «sin captura de Pawn».
   - **No** toques `PawnCommon` (solo lectura) y **no** guardes nombres de personaje.
3. **`desktop/src/bridge.js`**: leer `pawn` y `pawnErro` del SavedVariables con los mismos topes/validaciones que `personagem` (pesos: ≤40 claves numéricas; `equipo.valores`: ≤8; `ilvl` entero 0..1000; texto: ≤4096). Sin `try/catch` mudo: entrada inválida → `null`.
4. **UI**: en `desktop/src/vistas/personaje-simc.jsx` (o bloque nuevo en la pestaña Personaje), tarjeta «Escala Pawn» con: chip de procedencia (`t(lang, 'pawn.origem.addon')` vs `'pawn.semCaptura'`), fecha de captura, `LocalizedName`/`Provider`, y los pesos ordenados descendente. Sin captura: «sin captura de Pawn» + qué hacer (`/wfbp pawn`). Todos los textos por `t(lang, …)` en es/en; añade `data-pawn-fila` a las filas para el test.
5. **`desktop/src/davi.js`**: el contexto incluye la escala Pawn activa y su procedencia **con límites** (pesos del juego, no simulación de DPS), sin volcar el export crudo.
6. **Tests**: `tests/pawn.test.mjs` (≥10: catálogo sin `Values`, con `Values`, `Provider` inactivo, clase que no coincide, spec ausente, captura con `truncado`, captura basura, `ilvl` inválido, escala inexistente, empate entre candidatas) + bloque lua en `addon/tests/test_bridge.lua` (captura con Pawn falso, sin Pawn, `pcall` que falla, no borrar captura buena) + suite `desktop/test/vista-pawn.mjs` (≤12 checks) y su par en `scripts/run-gates.mjs` + `docs/TESTING.md`.

**Aceptación:** con la captura del addon, el plugin muestra los **pesos reales por stat** de la escala del personaje y el valor Pawn total del equipo puesto, con procedencia y fecha; sin captura, lo dice explícitamente y no inventa una escala. Con un `Pawn.lua` real de la cuenta (que **no** trae `Values`), el parser debe devolver el catálogo con `temPesos:false` y `escalaDoJogador` debe explicar por qué no hay pesos.

## 7. Fase 3 — Stats por ítem (la pieza que falta)

1. `tools/build-stats-items.py` → `data/items-stats.json` desde `~/.cache/wow-forever-drops/wowf/ItemSparse.csv` (y `esMX` si hace falta), con:
   `id → {inv_type, slot, stats:{str,agi,sta,int,spi,hp,armor,ap,hit,crit,dodge,parry,res…}, arma:{dano_min,dano_max,velocidad,tipo}, nivel_item, nivel_req, binds, clases?}`
   - `InventoryType` es **imprescindible**: sin él no se puede comparar por slot. Si el CSV no lo trae, dilo y busca la tabla equivalente.
   - Solo ítems de `data/items.json` (22.821). Nada de rangos 200000–239999.
2. Entrada en `data/MANIFEST.json` + test de integridad (cobertura, tipos, sin nulos raros) y actualización de `docs/MODELO-DATOS.md`.
3. Si algún campo no existe en el cliente, queda `null` y se declara en `huecos`. Prohibido estimar.

**Aceptación:** puedo pedir el ítem X y ver sus stats, su slot y su requisito, con `null` donde el cliente no lo da.

## 8. Fase 4 — Recomendador de equipo

1. `desktop/src/equipo-logica.js` (puro):
   - **Candidatos**: ítems con precio en el snapshot vigente y `available ≥ umbral` (declara el umbral y su fuente).
   - **Filtros**: competencia de la clase (`data/clases.json.competencias`), `nivel_req ≤ nivel`, `slot` con pieza equipada comparable, no es el mismo ítem, no es receta/reactivo.
   - **ΔPawn** = `valorPawn(candidato) − valorPawn(equipado[slot])`. Calcula el valor con `pesos × stats` de `items-stats.json` y, cuando exista, **contrasta** con el valor del addon (si discrepan >5 %, se declara en la fila).
   - **Baratura**: percentil del `low` de hoy contra el histórico del propio ítem (`n ≥ 5` días); `barato` si `p ≤ 25 %`; si `n < 5`, «sin histórico» y **no** se llama barato.
   - **Ranking**: solo ΔPawn > 0; ordena por ΔPawn y ofrece el cociente ΔPawn por oro. Devuelve `{filas, descartes, limites}` con los motivos de cada descarte (sin motivos, no vale).
2. Vista `desktop/src/vistas/equipo.jsx` + `vistas/equipo/*`: tabla con slot, ítem, ΔPawn, precio, percentil, «comprar / esperar / sin histórico», y **nota fija** de límites (pesos Pawn, precios anunciados, sin simulación DPS).
3. Integración con `desktop/src/davi.js`: el contexto incluye stats, equipo y las mejores 3 ofertas **con sus límites** (`LIMITE_*` + `limites`), para que DAVI pueda explicar sin inventar.
4. Tests: `tests/equipo-logica.test.mjs` (≥10: sin histórico, Δ negativo, empate de precio, ítem no comparable, competencia inválida, slot vacío) + bloque nuevo en `desktop/test/` para la vista.

**Aceptación:** con el mercado real, la pestaña muestra ofertas ordenadas por mejora, con precio, percentil y motivo; y para cada fila se puede decir por qué está ahí.

## 9. Fase 5 — Ruta de oro del personaje real (diseño cerrado; **no la ejecutes en esta corrida**)

**Objetivo:** el recomendador de farmeo/ROI que ya existe debe responder «¿qué me conviene farmear con **este** personaje?» usando el estado real (nivel, clase, spec, profesiones con skill de SimC; equipo/ilvl de Pawn) cruzado con el mercado vigente y el dataset de drops — en vez del perfil declarado y de profesiones binarias.

1. **`desktop/src/jugador.js`** (puro) — fusión de fuentes con procedencia por campo:
   - `jugadorDe({perfil, estadoSimc, capturaPawn})` → `{nivel, clase, spec, faccion, profesiones:[{id, nombre, skill}], ilvl, arma, procedencia:{nivel:'simc'|'perfil', …}, conflictos:[{campo, declarado, leido}], huecos:[]}`.
   - Precedencia: SimC manda en `nivel`, `clase`, `spec` y `profesiones` (con `skill`); `perfil` manda en `faccion` (el export no la trae) y en lo que SimC no dé; Pawn manda en `ilvl`.
   - Los conflictos **no** se resuelven en silencio: se listan para que la UI ofrezca «actualizar el perfil».
2. **`desktop/src/ruta-oro.js`** (puro) — adaptador + agregador, sin reescribir el motor:
   - `perfilParaMotor(jugador, hubZones)` → `{level: jugador.nivel, cls: mapa(jugador.clase), fac, spec: jugador.spec || '', pref:'any', hubZones}`. Mapa de clase: 1 warrior, 3 hunter, 7 shaman; el resto `'otro'` y una nota «sin ajuste por equipo de clase».
   - `ajustesPara(jugador)` → `ajustesBase` + `prof` por presencia de SkillLine 182/186/393 **y** `skill` real del export, más el hueco declarado «el dataset no trae skill mínimo por nodo».
   - `rutasOro({jugador, dropData, catalogo, mercado, historial, ajustes, ahora})`:
     - Reutiliza `itemMetrics` y `rank` del motor para cada ítem con fuente alcanzable; agrega por **zona**: `gph` (suma ponderada por fuentes), `roi` mediano, `margen`, `riesgo`, `competencia`, `nFuentes`, `nItems`.
     - **Filtros de alcanzabilidad declarados**: `mob.lvlMin ≤ nivel+3` (la banda de la zona debe solapar), `farmableBy` compatible con la facción, `items[].reqLevel ≤ nivel`, `objects` de tipo `herb`/`ore` solo si el jugador tiene esa profesión, y `doubtful` marcado (nunca oculto).
     - Devuelve `{rutas:[{zonaKey, zona, gph, roi, gphSesion, items:[…], porque:[…]}], porItem:[{itemId, fuente, gph, roi, margen, descartes}], descartes:[{que, motivo}], limites:[…]}`. **Cada fila lleva `porque` numérico** (chance del dataset × precio vigente × ritmo del motor) y **cada descarte su motivo**.
     - Determinista: sin `Date.now()` dentro de la lógica pura (recibe `ahora`).
   - Límites que se declaran siempre: precios anunciados (no ventas), chances del dataset CMaNGOS aproximadas a Forever, sin simulación de DPS, skill por nodo no disponible, ritmo (kills/h) del motor no ajustado por equipo.
2. bis **Rutas de crafteo con tu skill** (`desktop/src/ruta-crafteo.js`, puro) — la otra mitad de «aprovechar tus profesiones»:
   - Entrada: `jugador.profesiones[{id, skill}]` (de SimC) + `data/profesiones.json` + precios vigentes del snapshot.
   - Filtro: solo profesiones que el personaje tiene, solo recetas con `rango.aprende ≤ skill`. Receta sin `aprende` → **hueco declarado**, no se asume que se puede craftear.
   - Neto por crafteo = `precio(crea) × count × (1 − 0.05)` − `Σ precio(reactivo) × count`, **la misma fórmula y la misma nota** que `vistas/profesiones/venta.jsx`. Si esa fórmula está embebida en el `.jsx`, extráela a `desktop/src/venta-logica.js` y haz que el panel la consuma: el panel y sus tests deben seguir verdes, sin cambio de comportamiento.
   - Se recomienda solo si **todos** los reactivos tienen precio vigente; si falta uno → descarte con motivo `sin precio de reactivo`. Los materiales que el jugador podría recolectar llevan `costoOportunidad` = precio de venta del material (declarado, nunca «gratis»).
   - Orden por defecto: neto por crafteo. Ganancia por hora **solo** si la vista recibe un parámetro explícito de crafteos/hora del usuario; nunca inventes ese ritmo.
   - Devuelve `{rutasCrafteo:[{profesion, receta, neto, netoPorHora, skillReq, skill, reactivos, porque}], descartes, limites}`.

3. **UI**: sub-pestaña «Ruta de oro» dentro de Mercado (`desktop/src/vistas/mercado/farmeo.jsx` o `vistas/mercado/ruta-oro.jsx`): cabecera con chip de procedencia del jugador («leído del juego: nivel 35 · Herboristería 300 · ilvl 33»), **dos bloques**: «Farmear» (rutas por zona/ítem, ordenables por oro/hora y por ROI) y «Craftear y vender» (recetas que tu skill permite), desplegable «por qué» por fila, y nota fija de límites. `data-ruta-fila` / `data-crafteo-fila` para los tests.
4. **`desktop/src/davi.js`**: contexto con el jugador, las 3 mejores rutas y sus límites, para que DAVI explique sin inventar.
5. **Tests**: `tests/jugador.test.mjs` (≥8), `tests/ruta-oro.test.mjs` (≥10: sin mercado, sin fuente, nivel insuficiente, profesión ausente, roi negativo, empate de gph, zona de facción contraria, `doubtful`, descartes con motivo, determinismo), `tests/ruta-crafteo.test.mjs` (≥8: skill insuficiente, receta sin `aprende`, reactivo sin precio, neto negativo, costo de oportunidad del material propio, empate, profesión ausente, determinismo) + suite navegador (≤12 checks) registrada en el runner y en `docs/TESTING.md`.

**Aceptación:** con el personaje real, el panel dice cuál es la mejor ruta de oro (zona, oro/hora estimado, ROI por ítem) y **por qué**, aprovechando las profesiones del personaje; el bloque de crafteo muestra **solo** recetas que su skill permite, con neto y porqué; cada descarte tiene motivo; sin captura, cae al perfil declarado y lo dice.

## 10. Gates y comandos (desde `/home/gris96/wow-forever`)

```bash
node scripts/run-gates.mjs                 # debe seguir 18/18; actualiza EXPECT_NODE / EXPECT_BROWSER_TOTAL / ['vista-x', N] solo si añadiste tests
cd desktop && node build.mjs && cd ..      # regenera desktop/plugin.js  (¡desde desktop/, no desde la raíz!)
python3 scripts/check_desktop_bundle.py desktop/plugin.js   # debe decir OK (bytes cambiarán)
```

Harness de navegador contra el bundle recién construido:

```bash
export PLAYWRIGHT_MODULE=$(ls -d ~/.hermes/hermes-agent/node_modules/.pnpm/playwright@*/node_modules/playwright/index.mjs | head -1)
export CHROMIUM_PATH=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome | head -1)
DESKTOP_PLUGIN=$PWD/desktop/plugin.js node desktop/test/<suite>.mjs
```

**Los conteos se actualizan en tres sitios**: `EXPECT_NODE` y el par `[suite, checks]` de `BROWSER` en `scripts/run-gates.mjs`, y la tabla + desglose de `docs/TESTING.md`.

## 11. Entrega (`REVIEW.md`, raíz del repo)

```markdown
# REVIEW — fase N
## Qué hice            (3–6 bullets, archivos concretos)
## Comandos y salida    (bloques literales: gates, build, bundle-check, suite nueva)
## Evidencia de datos   (qué leí del cliente/addons: ruta + archivo:línea de cada API usada)
## Contradicciones      (lo que el plan decía y la realidad no sostiene)
## Huecos              (qué no se pudo obtener y por qué)
## Qué necesita un humano (si algo requiere entrar al juego, digámoslo exacto)
## Riesgos             (qué se rompe si esto está mal)
```

## 12. Prohibido

- `git push`, `hermes plugins …`, tocar `~/.hermes/**`.
- Reescribir la lógica de mercado (`mercado-logica.js`, `bridge-sync.js`, `market-farm.js`) en vez de reutilizarla.
- Añadir dependencias npm o Python nuevas sin autorización.
- "Arreglar" tests cambiando el test en lugar del código.
- Dejar `git status` sucio o artefactos fuera del scratch.
