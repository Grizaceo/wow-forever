# Mercado local de Auctionator — motor compartido

> **Alcance:** este documento describe la **semántica del motor de mercado**
> (`market*.js`, `drop-data.js`), compartido por el plugin Desktop (React en
> `desktop/src/`, almacén v2, puente WoWForeverBridge, TSM, sondeo 30 s, build
> `desktop/build.mjs`). La **app standalone** (`index.html`, `file://`,
> IndexedDB) fue **retirada** (Fase 5 del plan de orden): sus secciones de uso,
> precarga y persistencia IndexedDB eran propias de esa app. El plugin Desktop
> se documenta en **`docs/DESKTOP.md`**.

## Métricas por ítem: ruta completa

`itemMetrics` elige la mejor fuente elegible por rendimiento efectivo:

```
campDenom = muertes/h × probabilidad × cantidad media
routeFactor = viaje.factor × riesgo.mult × competencia.mult
denom = campDenom × routeFactor
gph = denom × precio neto por unidad                 # cobre/h
coste por unidad = oro/h objetivo × 10000 / denom    # cobre/unidad
margen relativo = (precio neto − coste) / coste
```

El campo histórico `roi` conserva ese margen frente al objetivo de tiempo;
**no es un retorno sobre capital ni una venta garantizada**. `campGph`
conserva el bruto del campamento para explicar el descuento en tabla y detalle.
La vía por ítem no aplica la liquidez de zona. El score de zonas incluye
bonus de útiles y no debe presentarse como ingreso efectivo garantizado.

`routeCamps`, `alternativeCamps` y `spawnTotal` describen opciones elegibles
del mismo ítem y zona. Desempatan rutas con igual rendimiento; **no suman
drops simultáneos ni sustituyen la cota de spawns/respawn del campamento**.
No son densidad geográfica medida: no conocemos recorridos reales ni
competencia observada. Desolace reconoce vuelo de ambas facciones; corregir la etiqueta no reduce
los 22/25 minutos supuestos de viaje. La UI no
afirma que el personaje lo haya desbloqueado. Viaje, PvP y competencia son
supuestos aproximados y modificables, no telemetría del servidor.

Regresión sintética: Horda, nivel 38, competencia baja, sesión 2 h, precios
17100c Magic Dust / 3999c Elemental Air (no cotizaciones actuales). Con PvP,
Air supera el margen de Dust; al quitar PvP el orden puede invertirse. No se
codifica una preferencia universal por un ítem.

## Uso

En el plugin Desktop: pestaña **Mercado**, botón de importación
(**Leer Auctionator.lua del juego** / **Elegir carpeta TSM** / diario del
puente). El flujo es el mismo que tenía la app: full scan en Auctionator dentro
del juego, `/reload` para que WoW escriba SavedVariables, importar el archivo
desde la carpeta concedida, elegir el realm de subasta y buscar por ID, nombre,
dungeon o boss.

Solo se conserva el resultado normalizado de precios: no el Lua original,
rutas, cuentas, personajes ni otras variables. No se envían datos a servicios
ni modelos.

## Qué significan los valores

### Scan precargado (histórico, retirado)

La sección «Scan precargado en esta instalación local» describía
`market-local-scan.js`, un snapshot normalizado privado que la app standalone
precargaba en IndexedDB. **Ambos fueron retirados** junto con la app: el plugin
Desktop importa siempre las fuentes del usuario (Auctionator, TSM, diario del
puente) y no tiene precarga. Se conserva el significado de los campos porque el
formato del snapshot normalizado es el mismo que usa el motor.

- `m`: último mínimo unitario anunciado observado, en cobre. No es mediana ni
  precio al que se haya realizado una venta. 1 oro = 10000 cobre.
- `h[día]`: máximo de los mínimos registrados en ese día.
- `l[día]`: mínimo del día; si no está, coincide con `h[día]`.
- `a[día]`: máxima cantidad ofertada observada en el día. No son ventas,
  compradores ni necesariamente el stock actual.
- Los días son UTC desde 2020-01-01. Fecha de importación y fecha del ítem son
  distintas; importar hoy no rejuvenece un precio antiguo.
- Reciente: hasta tres días inclusive; fechas futuras y sin fecha no pasan ese
  filtro. El umbral sirve para inspección, no garantiza que el precio siga vivo.
- Se preserva cada clave de Auctionator. Variantes no se fusionan con el ID
  base ni heredan nombres/fuentes no confirmados.

La base de precios puede mezclar observaciones de búsquedas y full scans. El
formato no demuestra que una instantánea sea un full scan completo. Los ítems
sin precio en el scan no se consideran objetos imposibles ni mercancía agotada.

## Historial acumulado de precios

Auctionator solo retiene ~21 días de historial por ítem
(`PRICE_HISTORY_DAYS` por defecto) y cada guardado de SavedVariables trae
únicamente la ventana reciente observada (escaneos reales recientes: 1–2
días). Para construir series más largas, la app acumula las entradas diarias
entre importaciones en un store propio y determinista
(`market-history.js`, módulo puro).

### Reglas de merge

- La identidad de un ítem es `(realm, sourceKey)`: `itemId` es solo una pista
  de catálogo y las variantes (`id:variant`) nunca se mezclan con el ID base.
- Por `(realm, sourceKey, day)` gana **el import más reciente**: la entrada
  del día es un agregado diario (`low`/`high`/`available` juntos), así que se
  toma la entrada entera del archivo más nuevo, nunca una mezcla por campo.
- `unitPriceCopper` y `observedDay` siempre provienen del import más reciente
  que incluyó ese ítem; los días que el archivo nuevo no trajo se conservan.
- Ítems o realms presentes solo en el store se conservan (su historia no se
  pierde aunque el ítem desaparezca del scan), pero solo se muestran cuando
  el ítem vuelve a aparecer en una importación: sin precio actual no hay
  oferta que listar.
- El merge es aditivo e idempotente: re-importar el mismo archivo no duplica
  días ni cambia el resultado.

### Almacenamiento y presupuesto

El snapshot persistido (`snapshot` en IndexedDB / `data/market-*.json` en
Hermes Desktop) guarda solo una **ventana reciente de 5 días por ítem** —
resistencia ante pérdida del store, no la serie completa. La serie completa
vive en un canal aparte:

- Standalone: clave `history` del mismo object store IndexedDB.
- Desktop: op `history` → `data/price-history-a.json` / `price-history-b.json`
  con el mismo patrón slot + read-back + puntero
  (`price-history-pointer`) que el mercado. Una historia corrupta o ausente
  se degrada a store vacío (es dato reconstruible), sin bloquear el mercado.

El store usa una codificación compacta `[day,low]` / `[day,low,available]` /
`[day,low,high,available]` (~21 bytes/entrada medida sobre datos reales vs
~104 del formato objeto). `fitStore` recorta al presupuesto de modo
determinista: primero descarta los **días más antiguos globalmente** y, como
último recurso imposible en la práctica, ítems enteros en orden de clave.
Presupuesto efectivo ~4,19 MB (margen bajo el límite duro de 4 MiB por
archivo de `ctx.files`), lo que hoy equivale a decenas de semanas de
historial al ritmo de ~4.000 observaciones/día; los días más viejos se
pierden primero si el límite se alcanza.

La vista de trabajo fusiona store + ventana reciente en cada carga
(`applyStore`); el detalle de cada ítem muestra la serie acumulada completa
y una línea de estadísticas aproximadas (`priceStats`: mínimo, mediana y
media del mínimo diario, tendencia por mitades y días de muestra). Son
estimaciones sobre ofertas anunciadas, no ventas.

### Gráficos de fluctuación

`market-chart.js` (módulo puro) dibuja la serie acumulada como SVG
determinista — mismo input, mismo SVG, sin dependencias:

- `priceChart(history, opts)`: gráfico con ejes del **mínimo diario** en el
  detalle del ítem — línea + área, mediana histórica punteada y marcador del
  precio actual solo si cae dentro del rango observado (un mínimo "dudoso" de
  pocas ofertas no aplana la escala). Acepta tanto entradas de snapshot
  `{day,low,...}` como filas compactas del store.
- `sparkline(history, opts)`: versión mínima sin ejes para las tarjetas de
  **Farmeo recomendado**, donde cada ítem de tu scan (y cada útil que también
  esté en el scan) muestra su sparkline + badge de tendencia + mediana vs
  precio actual ("tiempo × precio").

Ambos usan el día real como eje X: los días sin observación no se interpolan
y se ven como huecos. Colores vía variables CSS del tema. Todo texto es
propio del módulo (fechas y cobre formateado); nada del ítem entra al SVG.

### Detección de ofertas (Fase 2)

`market-deals.js` (módulo puro) clasifica cada ítem comparando el último
mínimo anunciado (`unitPriceCopper`) contra la **mediana de los mínimos
diarios** históricos (`priceStats`), con ajustes deterministas:

- `dealInfo(item, opts)` → `{kind, score, discount, confidence, days,
  medianaLow, minLow, available, ratio, reasons, ranking}`.
- `kind`: `sin-datos` (<2 días de muestra o mediana inválida), `oferta`
  (descuento ≥20% bajo la mediana), `sobreprecio` (prima ≥20%), `estable`.
  Umbrales configurables vía `opts` (`offerPct`, `overPct`, `minDays`).
- `confidence`: SOLO días de muestra (≥7 alta, ≥4 media, resto baja; con el
  piso de 2 días todo sale 'baja' hasta 4+). Es confianza **estadística**:
  el conteo de ofertas anunciadas (`available`) NO la baja ni cambia el score;
  se informa aparte en `available`/`reasons` (≤2 → "pocas ofertas anunciadas,
  conteo de ofertas, no ventas"). `available` null = dato ausente, no penaliza.
- `score` para ordenar "Mejores ofertas": `discount × pesoConfianza ×
  pesoTendencia`. Es un **ranking heurístico**: pesos elegidos a mano
  (confianza 1/0,8/0,55; tendencia 1,15/0,9/1), sin calibración externa ni
  validación con ventas — no es probabilidad ni promesa de colocación.
  `ranking` expone `{formula, heuristic, confWeight, trendWeight, trend}`
  para poder rotular la cifra; las tablas de pesos van congeladas. El estado
  `plana` de crafteo se normaliza explícitamente a `estable` (mismo peso).
  Tendencia `sube` amplifica, `baja` atenúa; `sin-datos` usa peso neutro.
- Acepta entradas de snapshot y filas compactas del store.

UI: badges `oferta −N%`/`caro +N%` en la tabla (con tooltip de mediana,
muestra y confianza), orden "Mejores ofertas", filtro "Solo ofertas (bajo
la mediana histórica)" y párrafo "Análisis de oferta (approx)" en el
detalle. Todo approx: son ofertas anunciadas, no ventas.

## Fuentes y filtro por nivel

El catálogo se construye en runtime desde `data/` (`items.json` +
`dungeons.json`, vía `catalogoMercado()` en `desktop/src/mercado-logica.js`):
nombre, jefe, dungeon y rango de niveles de cada ítem del botín de jefes. No
usa datos Retail ni una consulta externa; la cobertura exacta se declara en
`data/` (`huecos`) y se muestra en la pantalla.

Los nombres se resuelven solo para IDs simples conocidos. Los demás permanecen
como `Ítem #ID` o variante sin ID simple; se pueden buscar por clave.

El filtro de nivel compara exclusivamente el nivel de tu ficha con el rango de
grupo documentado para la dungeon. No demuestra que puedas matar ese boss solo,
que tu equipo baste, que el objeto sea comerciable ni que encuentres compradores.
Las fuentes son candidatos para investigar, NO recomendaciones de ingresos.
El mercado estima oro/hora aproximado de farmeo con supuestos documentados
(sección siguiente); sigue sin ser precio de venta ni prueba de liquidez.

## Dataset de drops y farmeo

El recomendador de farmeo (`market-farm.js`, sección **Farmeo recomendado** de
la pestaña Mercado) cruza el scan de Auctionator con datasets estáticos
generados offline. Nada se consulta en red ni en el juego.

### Capas y licencias

- **Pública — `drop-data.js` → `window.HunterDropData`** (GPL-3.0-or-later):
  mobs, objetos, zonas e ítems derivados de **CMaNGOS classic-db**
  (`ClassicDB_1_12_1_z2815`, <https://github.com/cmangos/classic-db>) más
  tablas de cliente WoW Classic Era vía **wago.tools** (UiMapAssignment, UiMap,
  AreaTable, Map, Lock, FactionTemplate). Texto completo de la licencia y la
  atribución en `LICENSE-DATA.md`. Los nombres de World of Warcraft son
  marcas/derechos de Blizzard Entertainment: uso no comercial, sin afiliación.
- **Privada — `drop-data-private.js` → `window.HunterDropDataPrivate`**
  (All Rights Reserved, solo local, gitignored): rares y contenedores
  observados por el addon **RareScanner** instalado, con probabilidades de
  drop observadas y uiMapIDs de hotspots conocidos. Nunca se publica ni se
  commitea. Es opcional: si falta, el motor funciona igual sin la capa
  observada.
- **Catálogo**: nombre/fuente de cada ítem del botín, construido en runtime
  desde `data/` (`catalogoMercado()`); ya no existe el archivo pre-construido
  `market-catalog.js` (era exclusivo de la app retirada).

### Regeneración

```sh
SRC=~/.cache/wow-forever-drops
curl -L -o $SRC/ClassicDB.sql.gz https://raw.githubusercontent.com/cmangos/classic-db/master/Full_DB/ClassicDB_1_12_1_z2815.sql.gz
for t in UiMapAssignment UiMap AreaTable Map Lock FactionTemplate; do
  curl -A Mozilla/5.0 -o $SRC/$t.csv "https://wago.tools/db2/$t/csv?product=wow_classic_era"; done
python3 tools/build-drop-data.py            # público + privado (RareScanner local)
python3 tools/build-drop-data.py --no-private   # solo la capa pública
node tools/fetch-forever-spawns.mjs --kind s    # coords verificadas (azeroth.wiki)
```

El script es determinista (mismas entradas → salida idéntica), solo stdlib, y
nunca ejecuta Lua. Los datos son referencia **Classic 1.12**, no observaciones
de Forever: las probabilidades de drop son estimaciones del emulador
("approx"), la zona sale de un heurístico de rectángulos (~87% de acuerdo en
una validación ruidosa) y los spawns/respawns son valores del emulador, no
población en vivo.

### Matching

El scan de Auctionator solo trae `itemId` numérico: la coincidencia es por ID,
nunca por nombre. El nombre para mostrar se resuelve en orden catálogo FDJ →
dataset público → `Ítem #ID`. Un fallback por nombre vía catálogo FDJ está
implementado pero rinde 0 coincidencias (los IDs del catálogo no se solapan
con los del scan de otra manera).

### Motor y ranking (aprox)

Cada fuente de drop se normaliza (mob, piel, pillo, objeto, rareza/cofre
observado RareScanner) con probabilidad, cantidad media, bando, nivel y zona.
Un mob u objeto que spawnea en varias zonas genera una fuente por zona, con
los spawns propios de esa zona (`otherZones` del dataset: pares
`[zoneKey, spawns]`). Una fuente es elegible según facción, profesiones
(piel/hierbas/minería), nivel del mob, regla de grupo/solitario e instancias.
Oro/hora estimado por ítem×fuente: `K × chance × avgCount ×
precio×(1−5% de corte AH)`. `K` se descompone en `rateInfo(src, level)`:
`cycleRate` (bajas/recolecciones por hora según rango, niveles y tiempos de
20–90 s por baja y 10 s por recolección) y `spawnCap = spawns×3600/respawnSec`,
y se toma `min(cycleRate, spawnCap)`. Si no hay `respawnSec`, se usa un piso de
60 s **sólo como fallback declarado como aproximado** (`respawnKnown:false`,
`basis:'respawn-fallback-60s'`); no es un dato observado. La liquidez L del
ítem modula **sólo la vía de zona**: `log10(1+oferta)` acotado a [0,15; 1],
penalizado ×0,5 si el precio no es reciente (>3 días). Si el ítem no tiene
`available` en su `observedDay`, L es **SIN DATOS (`factor:null`) y no se
aplica ningún ajuste**: `available` es profundidad de oferta anunciada, no
volumen vendido. Las métricas por ítem (`itemMetrics`, tabla) no integran L;
la vía de zona (`rank`) sí. `MODEL.itemMetrics.liquidityApplied=false` y
`MODEL.zoneEntry.liquidityApplied=true` lo declaran.

Guarda contra precios outlier: una oferta mínima única o casi nula puede ser
un anzuelo (p. ej. un listing suelto a 50000g). Si el ítem tiene `available ≤ 2`
en el historial del `observedDay` (si falta el dato, no se aplica el recorte), su precio de venta a
vendedor `sellPriceCopper` del dataset es >0 y el precio listado supera
`OUTLIER_VENDOR_MULT×sell` (=50×), todas las estimaciones usan
`50×sellPriceCopper` como precio de referencia en lugar del precio real
(`referencePrice()` → `clampOutlier()`). Es un **freno conservador heurístico**,
no una prueba de que el precio fuera erróneo: sin acceso al juego no se puede
validar la legitimidad de un listing concreto. `doubtful=true`, `clamped=true` y
`rule` exponen cuándo se aplicó. En el scan real 29 de 2862
ítems con precio del dataset cumplían la condición.

Las rarezas y los cofres no usan la tasa por entidad (en la práctica dominaban
el score: cada rare hasta ~2 bajas/h y cada cofre hasta 6 aperturas/h). En su
lugar hay un presupuesto por zona. Rareza: EV por baja de cada rare elegible
= Σ `chance×avgCount×net×L` de sus fuentes con ítems de tu scan;
`rareValue = Σ(tasa del raro × su EV)`, escalando todas las tasas por
`min(1, 1/Σ tasas)` si el total supera 1/h. La misma escala se usa para el
valor de vendedor por baja. La tasa se obtiene con
`rareRate()`, que usa `spawns×3600/respawnSec` **si se conoce el respawn** (cota
física, `approx:false`) y, si no, `RARE_K = 0,2 bajas/h` marcado
explícitamente como calibración aproximada (`approx:true`,
`basis:'RARE_K-heuristic'`). El ranking expone `rareRateSum` y `rareApprox`.
Cofres: EV por apertura de cada tipo de cofre (objeto público `chest` u
observado RareScanner) y `chestValue = min(4, 0.05×puntos) × EV medio
ponderado por puntos`, donde los puntos son los spawns del cofre en la zona
(públicos por zona + spots conocidos RareScanner). Ojo: los "puntos de cofre
conocidos" son pools del mapa, no cofres simultáneos — el tope de 4
aperturas/h lo refleja. A nivel ítem (tabla, mejor fuente, detalle) las
fuentes rare usan `rareRate()` y las de cofre K=`min(4, 0.05×puntos de esa
zona)`.

Las zonas ordenan los campamentos por **AH + vendedor del mismo sitio** antes
de aplicar multiplicadores. El modo de un sitio toma el máximo combinado;
la rotación reparte un único presupuesto de tiempo sobre ese mismo orden (tres
pesos no negativos de suma ≤1). Desktop aplica los pesos iniciales 0,5 / 0,3 /
0,2 al activar la rotación sin pesos guardados; el motor directo, sin pesos
válidos, cae a un sitio. Los raros y cofres son términos incidentales modelados
por separado, no una ruta física medida.

**Oro de vendedor**: el cálculo reúne los drops elegibles de mobs/objetos
públicos que no están en el scan y los pisos de vendedor de ítems del scan sin
precio AH. Estos pisos no pagan comisión ni reciben el ajuste L. La porción de
vendedor se toma de los mismos campamentos y pesos que la porción AH; el
vendedor de raros/cofres usa los topes de sus respectivos encuentros. Los
ítems útiles se cuentan en toda la zona elegible para clase/arma preferida; no
implican un ingreso marginal medido.

El total AH se multiplica por `usefulBonusFor(n).factor = min(0,2, 0,02×n)`
y luego, junto al vendor, por riesgo de facción (propia 1.0, disputada 0.85,
enemiga 0.6; PvP desactivable), competencia (auto = media, sube si la zona
aparece en tu banda de nivel o en horario pico 18–23; o manual/por zona) **y
factor de traslado**. `scoreNoBonus` expone el score sin el bonus de útiles
para comparar sensibilidad. El bonus de útiles es **heurístico por conteo**:
multiplica sólo la vía AH, sin valorar marginalmente cada ítem útil. El riesgo
y la competencia son **heurísticos declarados** (`MODEL.risk.heuristic`,
`MODEL.competition.heuristic`): no hay datos de población que los validen y no
se ha inventado calibración. `compFor()` y `riskInfo()` devuelven `heuristic:true`
y `basis`.

**Traslado**: tabla `TRAVEL` curada por zona×facción con minutos estimados de
ida y vuelta al punto de venta más cercano (basada en flight paths de Classic
1.12, aproximada). `factor = sesión ÷ (sesión + viaje/60)` con la sesión de
farmeo elegible (1/2/4 h, default 2 h, persistida en `state.farm.session`).
Zonas donde tu facción no tiene vuelo propio castigan fuerte (p. ej. Westfall
para la Horda ≈ 55 min → ×0.69 con sesión de 2 h); si la zona está en tu banda
de nivel de la guía el viaje se descuenta ×0.5. La card muestra badge
`viaje ~N min` (+ `sin vuelo` / `tu ruta`) y una línea en `reasons`. Es una
aproximación declarada (`MODEL.travel.heuristic`, `travelFor().approx`), no un
tiempo medido en juego.

**ROI = retorno/coste, no retorno de capital.** `roi` legado sigue siendo
`margen / farmCost`, donde `farmCost = gphRef×10000 / (K×chance×avgCount)` es
coste de tiempo imputado, no capital invertido. `metrics()` también expone
`marginPct = (net−farmCost)/farmCost`, `returnOverCost = net/farmCost`,
`roiLabel='retorno/coste'` y `roiNote` para que la UI y los tests no
reinterpreten la cifra. `marginInfo()` es la función pura detrás de esto.

**Superficie de auditoría (toda heurística, sin calibración inventada).**
`HunterFarm.MODEL` publica `risk`, `competition`, `travel`, `liquidity`,
`outlier`, `usefulBonus`, `rare` (heurísticos) y `roi`, `itemMetrics`,
`zoneEntry` (declaraciones de aplicación). Funciones puras exportadas:
`campAggregate`, `clampOutlier`, `liquidityInfo`, `referencePrice`, `rareRate`,
`rateInfo`, `usefulBonusFor`, `marginInfo`, `riskInfo`. Ninguna afirma ventas
reales, población de jugadores ni legitimidad de precios observados en juego.
Los tests enfocados viven en `standalone/tests/market-farm.cjs`.

**Guía de farmeo**: `GUIDE_FARMS`/`GUIDE_PRINCIPLES` (curados del video de
recomendaciones) se renderizan como card "Granjas de la guía" con los spots
de tu nivel ±2, su zona del dataset, drops y estimación — informativa, no
modifica el score. Las zonas de la guía activas llevan badge `guía` en las
cards del ranking.

**Por tu profesión**: `profRecommendations` rankea las mejores zonas por cada
oficio activo (Piel/Hierbas/Minería) con `profGph` — el valor/hora de los
materiales del oficio en cada zona candidata, con las mismas reglas de
`vendorGph` (top-3 entidades, elegibilidad completa) pero filtrado a fuentes
del oficio: `skin` en cadáveres, nodos `herb`/`ore`. El valor unitario es el
mejor canal real: AH neto si el material está en tu scan, si no `sellPrice`.
Los materiales con `itemLevel > nivel+10` se excluyen — los nodos de
hierbas/menas no tienen nivel propio y el iLvl es el proxy del tier que tu
personaje puede recolectar. El `gph` mostrado descuenta riesgo de facción y
factor de traslado como el ranking principal. Las profesiones del SimC
importado (`Skinning`/`Herbalism`/`Mining`) pre-marcan los checks del toolbar
de farmeo al aplicar el perfil. La card "Por tu profesión" lista el top-3 por
oficio con sus materiales principales; las zonas top llevan badge `tu prof`
en las cards del ranking.

**Skin-along**: dentro de la sección de Piel, `alongZones` recomienda zonas de
"recoger lo que otros cazan" — las zonas de las bandas de quests de tu guía
(`GUIDE_<clase>.factions[fac].routes`, parseadas a zoneKeys por nombre con
alias STV/EPL/WPL/1K Needles/etc.) donde tu nivel tiene misiones o farmeo
guiado. Solo aplica a piel: los nodos de hierbas/menas no los mata nadie.
El score es `profGph × 0.5` (eficiencia estimada: otros compiten por las
mismas pieles) × riesgo × traslado, y cada zona muestra las bandas de nivel
donde aparece (`quests nv 25-29`). Sin guía para tu clase/facción (p.ej.
hunter alianza) la sección no se muestra.

**Coordenadas verificadas (Forever)**: `drop-data-forever.js` →
`window.HunterDropForever` guarda coords de mapa `[x, y, zoneSlug]` por entry
ID de mob, relevadas de **azeroth.wiki/forever** — la DB comunitaria del
cliente oficial de WoW Forever (coords publicadas por mob, no spawn tables).
Se generan con `tools/fetch-forever-spawns.mjs` (indexa las páginas de zona
`creature-|npc-|rare-<entryId>` y lee el meta description de cada mob;
`--kind s|m|all`, `--ids`, `--out`). Cubre hoy los 266 mobs con fuente de
piel: 212 con coords, el resto son mobs de instancia (sin mapa outdoor) o
retirados/renombrados en Forever — el censo del script también reporta qué
mobs del dataset CMaNGOS existen en el server real. En las cards de zona, la
sección "Camps principales" muestra `x, y` junto al camp cuando el mob tiene
coord verificada **en la misma zona** (las coords son relativas al mapa de la
zona; si azeroth.wiki lo lista en otra zona no se muestran para no confundir
el mapa). Objetos (hierbas/menas) no tienen coords públicas por spawn.

**Limitación honesta:** no hay datos de población offline, así que la
competencia real no se conoce. El botón **Zona copada** y el selector por zona
(manual) son la forma de marcar zonas sobre-farmeadas; el "auto" solo usa el
texto de tu guía actual y la hora. Todo número mostrado es aproximado y está
etiquetado como tal; no son ventas ni garantías de ingreso.

### Cobertura medida (agregado, estática)

Scan de referencia: 4480 ítems. El dataset público de drops matchea 2876
(64.2%); con fuentes de farmeo específicas 2734 (61.0%); solo world-drop 142.
La capa privada RareScanner aporta 2243 (50.1%). El catálogo FDJ aporta 93
(2.1%). El fallback por nombre aporta 0. Cualquier capa pública: 2951 (65.9%);
todas las capas: 3014 (67.3%). IDs exclusivos de Forever (>25000): 622, de
los cuales 81 tienen cobertura. La fracción del valor listado (precio ×
cantidad ofertada) con cobertura es 76.5%. El dataset contiene 5424 ítems,
2477 mobs, 183 objetos y 72 zonas; la capa privada 484 rares y 52 contenedores.

## Seguridad, persistencia y recuperación

`market.js` interpreta un subconjunto restringido de datos Lua y CBOR; nunca
invoca Lua, `eval`, `load`, `dofile` o código del archivo. El límite de entrada es
8 MiB. El parseo corre en un Worker local, con cancelación y tiempo acotado; el
control de importación rechaza solapamientos. Una versión exterior distinta de
DB 8 rechaza el archivo; realms con versión interior distinta de 2 se omiten
con aviso, conservando los realms compatibles. Los ítems inválidos se omiten
con aviso y los datos truncados se rechazan: no se inventan precios plausibles.

El snapshot normalizado se guarda en el almacén del plugin Desktop
(`ctx.files`, bundle v2 — ver `docs/DESKTOP.md` y `docs/MODELO-DATOS.md`). La
app standalone lo guardaba en IndexedDB (`wowhunter-market-v1`); esa
persistencia ya no existe.

Desde la fase de historial acumulado, cada importación hace dos guardados:
primero el snapshot con ventana reciente y después el store compacto del
historial. Si el segundo falla, el scan igual queda guardado y la próxima
importación reintenta el merge, que es aditivo. **Borrar precios locales**
elimina ambos canales.

El merge es aditivo e idempotente: re-importar el mismo archivo no duplica
días ni cambia el resultado. Cambiar de navegador, perfil u origen puede
separar el almacén; borrarlo elimina los datos de mercado, no el juego ni la
ficha del personaje.

## Desarrollo y verificación

- `market.js`: parser Auctionator/TSM/puente y fuente autocontenida del Worker.
- `market-history.js`: merge determinista de historiales, store compacto,
  estadísticas y ajuste al presupuesto de bytes.
- `market-chart.js`: gráficos SVG deterministas del historial.
- `market-deals.js`: detección de ofertas vs mediana histórica.
- `market-farm.js`: motor puro de recomendación de farmeo.
- `market-identity.js`, `market-source.js`, `market-compare.js`: identidad de
  ítems, procedencia de fuentes y comparación de pools.
- `drop-data.js` / `drop-data-private.js`: datasets públicos/privados de drops
  (generados, no editar a mano).
- `tools/build-drop-data.py`: generación de los datasets de drops.
- `desktop/build.mjs`: bundle del plugin Desktop (`node build.mjs [--out FILE]`).
- `tests/market.cjs`, `tests/market-history.cjs`, `tests/market-chart.cjs`,
  `tests/market-deals.cjs`: pruebas unitarias del motor (`node:test`), dentro
  del runner canónico (`node motor .cjs`).
- Las suites de la app retirada (`*.mjs` de navegador) ya no existen; la
  cobertura de UI vive en `desktop/test/` (12 suites, 347 checks).

Los tests usan fixtures sintéticas; no demuestran mecánicas ni compatibilidad
del servidor. La validación contra un `Auctionator.lua` real es opt-in manual
(`WOW_FOREVER_REAL_FIXTURE=1`, ver `docs/TESTING.md`) y nunca publica contenido
bruto ni nombres de cuenta.

El catálogo del mercado ya no es un archivo generado: Desktop lo construye en
runtime con `catalogoMercado()` (`desktop/src/mercado-logica.js`) desde
`data/items.json` + `data/dungeons.json`. Es determinista y no accede a
SavedVariables ni a entradas externas; la cobertura exacta se declara en
`data/` (`huecos`).

## Plugin de Hermes Desktop

El plugin es una implementación React en `desktop/src/`, compilada con
`desktop/build.mjs` (esbuild) a `desktop/plugin.js` y desplegada en
`~/.hermes/desktop-plugins/wow-forever/` (ruta `/wow-forever`). El namespace de
datos sigue siendo el legacy `wow-hunter-guide`
(`~/.config/Hermes/plugin-files/data/wow-hunter-guide/`) por compatibilidad.

Usa `ctx.files` en vez de IndexedDB: mercado e historial en un **bundle v2**
(`market-v2-*`, `price-history-v2-*`) con puntero `market-v2-pointer`, respaldo
pre-v2 troceado (≤3 MiB + manifiesto) y rollback en dos pasos. El detalle
completo (almacén v2, puente WoWForeverBridge, sondeo 30 s, TSM) está en
**`docs/DESKTOP.md`**.

Regenerar el bundle Desktop tras tocar `desktop/*`: `cd desktop && node build.mjs`.
La precarga `market-local-scan.js`, el split público/privado (`--public`,
`dist/`) y la app `index.html` fueron **retirados**: el build es único y cada
usuario importa sus propias fuentes (Auctionator, TSM, diario del puente).

## Guías por clase/facción

En Desktop las guías viven en `desktop/src/vistas/` (React) sobre los datos
generados de `data/` más las guías curadas de `standalone/guide-*.js`
(`guide-hunter.js`, `guide-legacy.js`; ver `docs/ARQUITECTURA.md`). Las guías
curadas de Chamán y Guerrero fueron retiradas del Desktop en la 2.0.0 por nombrar
datos inexistentes, y sus archivos se borraron del repo el 2026-11-20. De ellas solo
se conserva la parte validada —la lista curada de dungeons— como fixture en
`tests/fixtures/guias-curadas.json`, que consume `tests/ruta-logica.test.mjs`;
publicarlas de nuevo exigiría una reescritura auditada desde cero.

## Roadmap de analítica de precios

Estado al 2026-11-10: **Fases 1 y 2 completas** — historial acumulado
entre imports (store compacto determinista, presupuesto ~4 MiB, merge por
`(realm, sourceKey, day)` con victoria del import más reciente),
estadísticas `priceStats` en el detalle, gráficos SVG `market-chart.js`
(precio mínimo diario con ejes + sparkline "tiempo × precio" en tarjetas
de farmeo) y detección de ofertas `market-deals.js` (deal score vs
mediana histórica con confianza por días+liquidez y tendencia; badges,
orden "Mejores ofertas" y filtro "Solo ofertas").

### Fase 2 — Ofertas y sobreprecios (implementada)

Comparar `unitPriceCopper` actual contra las estadísticas históricas:

- Deal score = precio actual vs mediana/mínimo histórico + confianza
  estadística (días de muestra) + tendencia (`priceStats.tendencia`).
  `available` es conteo de ofertas anunciadas: no es confianza ni volumen
  vendido, se informa aparte y no altera el score. Ranking heurístico (pesos
  a mano, sin calibración ni validación con ventas), no predicción de venta.
- UI: orden "Mejores ofertas", badges de oferta/sobreprecio y filtro
  "solo ofertas". Umbrales configurables; toda estimación etiquetada
  "approx" (son ofertas anunciadas, no ventas).
- El gráfico `priceChart` ya está integrado en el detalle: los ítems
  marcados como oferta lo muestran sin trabajo extra.

### Fase 3 — Comparador vs vendors NPC

"Cuándo un ítem sale más barato en un NPC que en subasta". Requiere dataset
nuevo `vendor-data.js` **público** derivado de classic-db/CMaNGOS (mismas
reglas GPL que `drop-data.js`, documentado en `LICENSE-DATA.md`):
vendor→{nombre,zona,ítems[{itemId,precioCobre}]} + índice reverso
itemId→vendors. En 1.12 los precios de vendor son fijos. Badge "más barato
en NPC: nombre (zona) — ahorrás X" cuando vendorPrice < mínimo de subasta;
costo de viaje como constante documentada (heurística, no dato del juego).
Los datos de vendor también alimentan la Fase 4.

### Fase 4 — Mejoras inteligentes al nivelar

Recomendaciones tipo "conviene comprar X azul por Y oro — te dura ~N niveles".
Inputs disponibles: guía por clase (ruta/dungeons/quests), `drop-data.js`,
el catálogo construido desde `data/`, stats del personaje (import `/simc`),
precios+historial.

Fuentes candidatas a investigar:

- **Questie** (addon): **verificado 2026-11-10 — no sirve para esto.**
  Questie 12.6.5 corre en WoW Forever (`Questie_Forever.toc`) y escribe
  SavedVariables, pero solo `QuestieConfig`/`QuestieConfigCharacter` y
  `QuestieTrace` (dumps de mapa). El estado de misiones (completadas, en
  curso, disponibles) vive solo en memoria y no se persiste ni tiene
  comando de exportación. Lo que sí aporta: **QuestieDB_Forever.toc** con
  la DB completa de quests (~32k) en CBOR/base64 parseable offline —
  sirve para el dataset quest→recompensa sin raspar CMaNGOS.
- **Progreso personal de quests**: la vía limpia es un **addon propio
  mínimo** (la visión de largo plazo ya lo contempla) que vuelque el quest
  log a un archivo/SV bajo demanda — parser restringido del lado del
  plugin, solo IDs/estado, jamás nombres. Alternativa más débil: sugerir
  "lo que sigue según la guía" sin saber completadas reales.
- **Quest→recompensa**: el `.toc` de QuestieDB ya contiene los metadatos
  (objetivos, NPCs inicio/fin, recompensas) — parsearlo a dataset público
  con licencia documentada sería el camino, en vez de CMaNGOS.
- **Pawn / SimulationCraft**: `Pawn.lua` existe en SavedVariables pero
  solo tiene `PawnCommon` por ahora; si aparecen `PawnPlayer`/pesos de
  stats por spec serían el input ideal para "presupuesto de stats".
  `/simc` ya parsea nivel/arma/stats.

### Largo plazo

Módulos deterministas y reutilizables primero; después un addon propio de
WoW Forever que exporte datos más ricos (stats/Pawn, equipo real, quests) y
reciba recomendaciones de vuelta — plugin↔addon cableado. Primero features
standalone en el plugin.
