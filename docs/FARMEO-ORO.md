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
(`game_event_creature`), unidos por enlace simple a ≤ 60 yd. Cada campamento:
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
se prueban conjuntos de 1 y 2 zonas. Salida: tramos `{campamento, minutos, oro}`,
total con rango (pesimista/central/optimista) y alternativas dentro del rango.

## Contador de sesión (WoWForeverFarm)

En el juego: `/wff` muestra u oculta la ventana; `/wff start|pause|stop|reset`.
Ventana: tiempo activo, % en combate, % saqueando, muertes y muertes/h, monedas y
valor del botín (vendedor y subasta estimada vía la API pública de Auctionator si
está), oro/h en vivo.

Eventos (solo API pública; todo protegido con `pcall` y detección de funciones):

| Mide | Fuente |
|---|---|
| Combate | `PLAYER_REGEN_DISABLED/ENABLED` |
| Saqueo, botín y origen | `LOOT_READY`/`LOOT_OPENED`/`LOOT_CLOSED`, `GetLootSlotInfo/Link/Type`, `GetLootSourceInfo` (GUID → npcId/objeto) |
| Desuello / recolección | segundo saqueo del mismo GUID de criatura / GUID de objeto |
| Muertes | GUIDs muertos vistos por objetivo (`UnitIsDead`), `PARTY_KILL` si el registro de combate está disponible, y GUIDs saqueados; se guarda qué método funcionó |
| Monedas | `PLAYER_MONEY` (delta) dentro y fuera del saqueo, y ventas a vendedor (`MERCHANT_SHOW/CLOSED`) |
| Muertes del jugador | `PLAYER_DEAD` |
| Lugar | `C_Map.GetBestMapForUnit` + `C_Map.GetPlayerMapPosition` cada 10 s (si existe) |
| Munición y bolsas | cuenta del slot de munición; casillas libres al inicio y al final |

**Sin probar en Forever.** La API es Mainline 12.1.5 con restricciones de Midnight
(valores secretos en combate). Lo que falle se degrada: el contador sigue midiendo
tiempo y monedas, y la sesión guarda `metodos` para que el plugin sepa qué confiar.
Checklist de verificación en el juego: ver `addon/WoWForeverFarm/VERIFICAR.md`.

## Calibración y estilo del jugador

Desde las sesiones (`desktop/src/farm-sesiones.js`, puro):
- **Por sesión:** duración, activo, combate/saqueo/resto, muertes/h, s por muerte,
  dinero/h, valor/h (vendedor y subasta), predicho por el motor para lo mismo, error.
- **Estilo (`perfilJugador`):** `k_dps` = pelea observada / pelea predicha para los
  mobs muertos; `t_botín`, `t_desuello`; `pausas` = resto no explicado por caminata;
  medianas con al menos 30 muertes, si no, valores por defecto.
- **Botín:** probabilidad por (mob, ítem) con prior Beta desde CMaNGOS (peso n₀ = 50
  muertes) y conteos observados; monedas por mob con media observada.
- El motor usa el estilo calibrado si el usuario lo activa ("usar mis métricas").

## Capa agéntica

- Desktop escribe `data/farmeo-agente.json` (schema 1) cuando cambian las sesiones,
  el estilo o el plan: sin nombre de personaje, solo agregados y conteos.
- `consultar.py farmeo-sesiones | farmeo-sesion ID | farmeo-estilo | farmeo-plan |
  farmeo-calibracion` lo leen (solo lectura, como el resto del script).
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
