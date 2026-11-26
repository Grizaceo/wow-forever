# Farmeo para maximizar oro — diseño

Estado: **implementado** en la rama `agent/claude-code/farmeo-oro` (F0–F4); el contador
WoWForeverFarm **falta verificarlo en el cliente Forever** (`addon/WoWForeverFarm/VERIFICAR.md`).
Aprobado por el mantenedor el 2026-11-25. Reemplaza el puntaje heurístico de `market-farm.js` por un
modelo de oro realizado, con un contador de sesión en el juego y herramientas para
el agente.

## Objetivo

Recomendar dónde y cómo farmear para **maximizar el oro que el jugador termina
ganando por hora de sesión**. Nada más entra al puntaje: el equipo útil, la hora del
reloj o un "oro/h de referencia" fijo se muestran como información, no ordenan.

## Por qué cambia (resumen del análisis)

Medido contra CMaNGOS classic-db (el mismo volcado del dataset) y un mercado real:

| Problema del motor 2.2.0 | Efecto |
|---|---|
| La ruta por ítem valora solo ese ítem, sin liquidez ni piso de ofertas | Recomienda ítems con 1–3 ofertas a decenas de g/h |
| Sin tope de venta | Supone que se vende todo lo farmeado a precio de subasta |
| Precio = último mínimo | El mismo campamento vale ×1,7 según el día |
| Dataset sin monedas, sin botín compartido (>30 tablas), tope de 15 fuentes por ítem | El motor ve el 7–19 % del valor de vendedor por muerte (peor a más nivel) |
| Spawns de eventos (guerra de AQ, invasiones) tratados como permanentes | Zonas que no rinden en el top |
| Ritmo fijo (20 s + 15 s) y todos los spawns de la zona como un campamento | Mobs dispersos (p. ej. 356 yd entre spawns) parecen campamentos densos |
| Campamento = un tipo de mob | No existe "limpiar todo lo que hay", que es como se farmea |

## Arquitectura

```
CMaNGOS + tablas cliente ─► tools/build-drop-data.py ─► standalone/drop-data.js (schema 2)
                                                          │ mobs + monedas + vida + botín compartido agregado
                                                          │ botín por mob (mobLoot) sin tope de fuentes
                                                          │ campamentos espaciales (camps), sin eventos
                                                          ▼
Auctionator / puente ─► historial (mediana de mínimos, ofertas)        ┐
TSM (ventas propias) ─► tope de venta por ítem                         ├─► standalone/farm-plan.js
WoWForeverFarm.lua (sesiones) ─► desktop/src/farm-sesiones.js ─► calibración ┘   (motor v2, puro)
                                                          │
                     ┌────────────────────────────────────┼─────────────────────────────┐
                     ▼                                    ▼                             ▼
        Mercado → Farmeo: plan de sesión     Mercado → columna/detalle:          data/farmeo-agente.json
        + campamentos + mis sesiones         campamentos donde cae el ítem       ─► consultar.py farmeo-*
                                             (oro/h del campamento completo)     ─► SKILL.md §Farmeo
```

### Por qué un addon aparte para las sesiones

`WoWForeverBridge.lua` guarda ~50.000 observaciones por día de mercado y ya supera
los 8 MiB que el plugin acepta leer (un caso real: 22,8 MB con 7 días). Un addon
guarda todos sus SavedVariables en un único archivo, así que las sesiones van en
**WoWForeverFarm** (`addon/WoWForeverFarm`, SavedVariables `WoWForeverFarmDB`,
archivo `WoWForeverFarm.lua`): pequeño, se lee en milisegundos y no depende del
tamaño del diario de mercado. Se instala junto al puente; ninguno exige al otro.

## Modelo

### Campamento espacial
Spawns normales atacables por la facción, de todos los tipos, sin spawns de eventos
(`game_event_creature`/`game_event_gameobject` con evento positivo; se conservan los
eventos que se repiten cada día, como «Nights»), unidos por enlace simple a ≤ 60 yd. Cada campamento:
zona, centro (coordenadas de mapa), spawns, composición por mob, distancia mediana al
vecino y respawn. Estrategias: **limpiar** (mezcla ponderada por spawns) y **solo X**
(un tipo; la caminata usa la distancia entre spawns de ese tipo).

### Ritmo
```
t_muerte  = vida_media / DPS(nivel)·k_dps + t_botín + s·t_desuello + d_vecino / v
r_ciclo   = 3600 · (1 − pausas) / t_muerte
r_spawn   = Σ spawns · 3600 / respawn
muertes/h = (r_ciclo⁻² + r_spawn⁻²)^(−1/2)
```
Parámetros del jugador (`k_dps`, `t_botín`, `t_desuello`, `pausas`, `v`) con valores
por defecto declarados; la calibración por sesiones los reemplaza.

### Valor por muerte y venta
```
V        = monedas + Σ_i p_i · n̄_i · valor_i     (directo + compartido + desuello)
valor_i  = max(vendedor_i, 0,95 · precio_i)       precio_i = mediana de mínimos diarios (ventana)
tope C_i = ventas propias TSM/día si hay historial; si no κ · ofertas (κ = 5 %); ≤ 5 ofertas → vendedor
```
Las unidades sobre el tope se valoran a precio de vendedor (ingreso cóncavo).

### Planificador de sesión
`oro(plan) = Σ_c muertes_c·(monedas_c − munición_c) + Σ_i [min(U_i,C_i)·subasta_i + resto·vendedor_i]`,
con `U_i` sumado sobre todos los campamentos del plan (tope **compartido**). Bloques de
10 min por ganancia marginal por minuto; entrar a una zona cuesta su viaje de ida;
cada vez que se llenan las bolsas, un viaje al vendedor (6 min) que también sale de
las horas de la sesión (igual que en el oro/h de un campamento solo);
se prueban conjuntos de 1 y 2 zonas. Salida: tramos `{campamento, minutos, oro}`,
total con rango (pesimista/central/optimista) y alternativas dentro del rango.

## Contador de sesión (WoWForeverFarm)

En el juego: `/wff` muestra u oculta la ventana; `/wff start|ya|pause|resume|stop|reset|status|test`.
Ventana: reloj, viaje, % en combate, % saqueando, muertes y muertes/h, monedas,
valor de los objetos (vendedor y subasta estimada vía la API pública de Auctionator
si está), oro/h en vivo y la **lista del botín recibido** (icono, cantidad y valor).

**Reloj (como el registro de mazmorras de DungeonJournal):** `/wff start` arma la
sesión y el reloj arranca al comienzo de la primera pelea con muerte (o del primer
saqueo/recolección); el camino previo queda como `travel`. Así el ritmo medido es
el del campamento, comparable con el que predice el motor; el viaje del plan se
compara aparte.

**Sin registro de combate.** Forever cierra `COMBAT_LOG_EVENT_*` a los addons. El
addon de la comunidad DungeonJournal (Exehn) ya registra muertes en Forever con
`PARTY_KILL`, `UNIT_DIED` y las líneas de chat de XP y de muerte, ignorando lo que
llega como valor secreto; WoWForeverFarm sigue el mismo enfoque (código propio). Cada
aviso de una misma muerte se junta en una sola (`Logic.killSignal`, ventana de 3 s);
una muerte cuyo GUID llega oculto cuenta sin mob (`killsAnon`) y el saqueo posterior
le pone mob.

Eventos (solo API pública; todo protegido con `pcall` y detección de funciones):

| Mide | Fuente |
|---|---|
| Combate | `PLAYER_REGEN_DISABLED/ENABLED` |
| Saqueo, botín y origen | `LOOT_READY`/`LOOT_OPENED`/`LOOT_CLOSED`, `GetLootSlotInfo/Link/Type`, `GetLootSourceInfo` (GUID → npcId/objeto); `LOOT_SLOT_CLEARED` para saber si un cadáver quedó con botín |
| Desuello / recolección | segundo saqueo del mismo GUID de criatura, una vez vaciado el cadáver (reabrir uno que quedó con botín no cuenta, y nada después del desuello) / GUID de objeto |
| Muertes | `PARTY_KILL` (GUID o, si es secreto, muerte sin mob), `UNIT_DIED` de un mob que peleaba contigo (amenaza), `CHAT_MSG_COMBAT_XP_GAIN` y `CHAT_MSG_COMBAT_HOSTILE_DEATH` («Has matado X», nombre), cadáver visto (objetivo, mouseover, placas; no ajeno; solo cuenta si ese mob peleó contigo en la sesión, si no solo nombra una muerte ya contada) y saqueado; `killBy` = método que la vio primero, `signals` = todos los avisos |
| Botín recibido | `CHAT_MSG_LOOT` con `LOOT_ITEM_SELF(_MULTIPLE)` en el idioma del cliente (`got`); si no llega, lo de las ventanas de botín |
| Tu muerte | `PLAYER_DEAD` → `PLAYER_ALIVE`/`PLAYER_UNGHOST` (`deadTime`) |
| Monedas | `PLAYER_MONEY` (delta) dentro y fuera del saqueo, y ventas a vendedor (`MERCHANT_SHOW/CLOSED`); por mob (`coinsBy`) solo en ventanas de un único cadáver, que se cuentan en `coinCorpses` |
| Lugar | `C_Map.GetBestMapForUnit` + `C_Map.GetPlayerMapPosition` cada 10 s (si existe) |
| Munición y bolsas | cuenta del slot de munición; casillas libres al inicio y al final |

**Sin probar en Forever.** La API es Mainline 12.1.5 con restricciones de Midnight
(valores secretos). Lo que falle se degrada: el contador sigue midiendo tiempo y
monedas, y la sesión guarda `methods` y `signals` para que el plugin sepa qué confiar
(`/wff test` muestra en el juego qué ve el contador). Las sesiones con más de 10 %
de muertes sin mob no ajustan los drops por mob.
Checklist de verificación en el juego: ver `addon/WoWForeverFarm/VERIFICAR.md`.

## Calibración y estilo del jugador

Desde las sesiones (`desktop/src/farm-sesiones.js`, puro):
- **Por sesión:** duración, activo, combate/saqueo/resto, muertes/h, s por muerte,
  dinero/h, valor/h (vendedor y subasta), predicho por el motor para lo mismo, error.
- **Estilo (`perfilJugador`):** `k_dps` = pelea observada / pelea predicha para los
  mobs muertos; `t_botín`, `t_desuello`; `pausas` = resto no explicado por caminata;
  medianas con al menos 30 muertes, si no, valores por defecto.
- **Botín:** probabilidad por (mob, ítem) con prior Beta desde CMaNGOS (peso n₀ = 50
  muertes) y conteos observados; monedas por mob con media observada sobre los
  cadáveres saqueados solos (`coinCorpses`, peso n₀ = 20), no sobre todos.
- El motor usa el estilo calibrado si el usuario lo activa ("usar mis métricas").

## Meta, recolección y pesca (2.4.0)

- **Meta de oro**: el jugador escribe su meta y su oro actual en Farmeo (oro entero,
  `meta`/`tengo` en `farm-settings`). `FarmPlan.goal(best, meta, tengo)` da las horas
  hasta la meta con el oro/h central del plan y el rango pesimista/optimista. El plugin
  no fija precios de montura ni dual spec: no están verificados en Forever.
- **Skill de recolección**: el dataset trae `objSkill` (skill mínimo de cada nodo de
  hierbas, menas y pesca, de `Lock.csv`). «Por tu profesión» (motor heredado) descarta
  los nodos sobre el skill que el jugador escribió en Profesiones (`skill-182`,
  `skill-186`, o `niveles-oficio`); sin skill conocido queda el proxy de iLvl ≤ nivel+10.
- **Pesca**: no se estima. CMaNGOS classic-db no trae spawns de bancos de peces ni de
  restos de naufragio, y la pesca en agua abierta de zonas 130 (STV, Arathi, Desolace)
  da casi solo pescado de pocos cobres. Un modelo con esos datos diría «pescar no vale
  nada», contra lo que reportan los jugadores. En su lugar, WoWForeverFarm 0.3.0 cuenta
  las capturas (`IsFishingLoot`; `fishing`, `fishItems`) y Desktop marca la sesión como
  `tipo: 'pesca'` con capturas/h y su oro/h medido.

## Confianza en el dato (2.4.0)

- **Visto por ti en Forever**: los spawns y drops son de Classic 1.12; la única
  verificación en Forever que tiene el plugin son las sesiones del jugador. Cada
  campamento del ranking dice «visto por ti en Forever (N muertes)» si alguna sesión de
  WoWForeverFarm mató a uno de sus mobs, o «sin verificar»; el export lo lleva en
  `vistoMuertes` y `farmeo-mob` lo cita. No se usa ninguna base comunitaria de spawns.
- **Depende de un solo ítem**: si un ítem sostiene ≥ 80 % del oro del campamento
  (`CONC_SHARE`, `describe().concentrated`), la fila y `farmeo-mob` lo avisan: un cambio
  de su precio o de su drop real mueve el oro/h casi en la misma proporción (p. ej. los
  Whirlwind de Desolace, ~95 % Elemental Air).

## Capa agéntica

- Desktop escribe `data/farmeo-agente.json` (schema 1) cuando cambian las sesiones,
  el estilo o el plan: sin nombre de personaje, solo agregados y conteos.
- El archivo trae además `evaluacion` (`FarmPlan.evaluate`): el ranking de campamentos,
  cada mob elegible farmeado solo (hasta 300, con su puesto entre todos) y, por ítem que
  aparece, el precio usado (mediana de 14 días), el último mínimo, p25–p75, ofertas y tope
  de venta. Sirve para contrastar lo que dice una guía externa con los precios del jugador.
- `consultar.py farmeo-sesiones | farmeo-sesion ID | farmeo-estilo | farmeo-plan |
  farmeo-diagnostico | farmeo-ranking | farmeo-mob NOMBRE | farmeo-zona ZONA` lo leen
  (solo lectura, como el resto del script). Si un mob no está evaluado, `farmeo-mob` dice
  por qué con las mismas reglas del motor (nivel, rango, facción, spawns, ciudad o
  instancia) leyendo `standalone/drop-data.js`.
- `SKILL.md §Farmeo`: cómo arrancar una sesión, cómo leer las métricas y cómo
  aconsejar (cuello de botella: pelea, saqueo, caminata o pausas; predicho vs real;
  nunca inventar números).
- "Preguntar al agente" en la vista de sesiones adjunta un contexto con lista blanca.

## Fases y aceptación

| Fase | Contenido | Aceptación |
|---|---|---|
| F0 | Arreglos rápidos en `market-farm.js`: `max(subasta, vendedor)`, piso de ofertas y liquidez en la ruta por ítem, precio = mediana de la ventana, sin bonus de útiles ni competencia por reloj en el puntaje | Tests de regresión; gates verdes |
| F1 | Dataset v2 (monedas, vida, botín compartido agregado, `mobLoot`, campamentos, sin eventos) | ≥ 90 % del valor de vendedor por muerte visible; tamaño del bundle medido |
| F2 | `farm-plan.js` + vistas (plan, campamentos, columna de Mercado) | Escenarios conocidos reproducidos en tests |
| F3 | WoWForeverFarm + lectura de sesiones + calibración | Lua y Node verdes; checklist en el juego |
| F4 | Predicho vs real por sesión, export al agente, `consultar.py farmeo-*`, skill | Tests Python; contexto del agente con lista blanca |
