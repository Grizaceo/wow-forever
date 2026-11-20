# Mercado local de Auctionator

> **Alcance:** este documento describe la **app standalone** (`index.html`, `file://`,
> IndexedDB) y su motor de mercado compartido. El **plugin Desktop** actual (React en
> `desktop/src/`, almacén v2, puente WoWForeverBridge, TSM, sondeo 30 s, build
> `desktop/build.mjs`) se documenta en **`docs/DESKTOP.md`**. Las secciones de precarga
> (`market-local-scan.js`) y build público (`--public`) son **históricas**: fueron retiradas.

## Uso

Abrir `index.html`, pestaña **Mercado local**.

1. Hacer un full scan en Auctionator dentro del juego.
2. Usar `/reload` o cerrar sesión para que WoW escriba SavedVariables.
3. En Hermes Desktop, el botón **Leer Auctionator.lua del juego** busca el
   archivo solo: recorre el home en busca de `SavedVariables/Auctionator.lua`
   (priorizando rutas típicas de WoW), prefiere el que contiene la base de
   precios y el más grande entre varios candidatos, y recuerda la ruta para
   las próximas lecturas. Si no lo encuentra, abre una vez el selector de
   archivos. Fuera de Hermes, o como alternativa, seleccionar `Auctionator.lua`
   desde el selector de la app. Es el archivo de SavedVariables, no el código
   del addon. No hace falta copiar toda la carpeta WTF ni ningún archivo de
   configuración o credenciales.
4. Seleccionar el realm de subasta. Es independiente del selector geográfico
   Kalimdor/Reinos del Este de la guía.
5. Buscar por ID, nombre conocido, dungeon o boss; abrir un ítem para ver
   historial y referencias locales.

La app no vigila archivos ni ejecuta el Lua: la selección (o el permiso de
carpeta otorgado una vez) autoriza la lectura de ese archivo en memoria. Solo
se conserva el resultado normalizado de precios: no el Lua original, rutas,
cuentas, personajes ni otras variables. No se envían datos a servicios ni
modelos.

## Qué significan los valores

### Scan precargado en esta instalación local

Por petición del usuario, `market-local-scan.js` contiene únicamente el snapshot
normalizado del SavedVariables más reciente al preparar la precarga (4480 ítems,
un realm; archivo guardado el 2026-11-09 a las 21:48, UTC-03). Es un archivo local
privado: no publicarlo junto con la guía. No contiene el Lua, cuentas ni personajes.

Al recargar la guía se guarda una sola vez, en la misma transacción que su marca
de aplicación. No sustituye una importación de navegador posterior a la preparación
de la precarga. Las siguientes importaciones manuales tienen prioridad. Borrar los
precios mantiene la marca para que no reaparezcan al recargar ese perfil. El botón
borra IndexedDB, no este archivo: otro perfil nuevo puede volver a precargarlo.
Esto no vigila el juego ni incorpora automáticamente futuros scans; para ellos
se usa el selector habitual.

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
  medianaLow, minLow, available, ratio, reasons}`.
- `kind`: `sin-datos` (<2 días de muestra o mediana inválida), `oferta`
  (descuento ≥20% bajo la mediana), `sobreprecio` (prima ≥20%), `estable`.
  Umbrales configurables vía `opts` (`offerPct`, `overPct`, `minDays`).
- `confidence`: base por días (≥7 alta, ≥4 media, resto baja); si el día
  observado tuvo ≤2 ofertas (`available`) baja un nivel — un mínimo de 1-2
  publicaciones es más ruidoso. `available` null no penaliza.
- `score` para ordenar "Mejores ofertas": `discount × pesoConfianza ×
  pesoTendencia` (tendencia `sube` amplifica, `baja` atenúa).
- Acepta entradas de snapshot y filas compactas del store.

UI: badges `oferta −N%`/`caro +N%` en la tabla (con tooltip de mediana,
muestra y confianza), orden "Mejores ofertas", filtro "Solo ofertas (bajo
la mediana histórica)" y párrafo "Análisis de oferta (approx)" en el
detalle. Todo approx: son ofertas anunciadas, no ventas.

## Fuentes y filtro por nivel

El catálogo estático se extrae del addon ForeverDungeonJournal instalado, con
referencias de archivo/línea y hashes SHA-256 del material fuente. No usa datos
Retail ni una consulta externa. La cobertura exacta está declarada en
`market-catalog.js` y se muestra en la pantalla.

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
  (All Rights Reserved, solo local): rares y contenedores observados por el
  addon **RareScanner** instalado, con probabilidades de drop observadas y
  uiMapIDs de hotspots conocidos. Nunca se publica ni se commitea; el build
  `--public` la excluye. Es opcional: si falta, la app funciona igual sin la
  capa observada.
- **Catálogo — `market-catalog.js` → `window.HunterMarketCatalog`**: nombres y
  fuentes de dungeon del addon ForeverDungeonJournal (ver sección anterior).

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
precio×(1−5% de corte AH)` con K = bajas u acciones por hora según rank,
niveles, spawns y respawn (supuestos fijos en el código: ~20–90 s por baja
según rango, 10 s por recolección). La liquidez L del ítem modula el valor de
zona: `log10(1+oferta)` acotado, penalizada si el precio no es reciente
(>3 días).

Guarda contra precios outlier: una oferta mínima única o casi nula puede ser
un anzuelo (p. ej. un listing suelto a 50000g). Si el ítem tiene `available ≤ 2`
en el historial del `observedDay` (`null` cuenta como 0), su precio de venta a
vendedor `sellPriceCopper` del dataset es >0 y el precio listado supera
`OUTLIER_VENDOR_MULT×sell` (=50×), todas las estimaciones usan
`50×sellPriceCopper` como precio de referencia en lugar del precio real
(`doubtful=true`). El neto sigue siendo `floor(refPrice×(1−5%))`; el flag se
expone en `itemMetrics`/`topItems` y la tabla, el detalle y las tarjetas avisan
"precio dudoso (≤2 ofertas, tope 50× vendedor)". En el scan real 29 de 2862
ítems con precio del dataset cumplían la condición.

Las rarezas y los cofres no usan la tasa por entidad (en la práctica dominaban
el score: cada rare hasta ~2 bajas/h y cada cofre hasta 6 aperturas/h). En su
lugar hay un presupuesto por zona. Rareza: EV por baja de cada rare elegible
= Σ `chance×avgCount×net×L` de sus fuentes con ítems de tu scan;
`rareValue = min(1, 0.2×N_eligibles) × media del EV` (ceros incluidos).
Cofres: EV por apertura de cada tipo de cofre (objeto público `chest` u
observado RareScanner) y `chestValue = min(4, 0.05×puntos) × EV medio
ponderado por puntos`, donde los puntos son los spawns del cofre en la zona
(públicos por zona + spots conocidos RareScanner). Ojo: los "puntos de cofre
conocidos" son pools del mapa, no cofres simultáneos — el tope de 4
aperturas/h lo refleja. A nivel ítem (tabla, mejor fuente, detalle) las
fuentes rare usan K=0.2 bajas/h y las de cofre K=`min(4, 0.05×puntos de esa
zona)`.

Las zonas se puntúan por el valor de sus mejores camps (1.º + 0.5·2.º +
0.25·3.º, solo mobs/objetos normales — rares y cofres van por presupuesto),
más `rareValue` y `chestValue`, más bonus por ítems útiles para tu
clase/arma preferida. Los útiles salen de TODO el dataset de la zona (no solo
del scan): ítems con fuente elegible en la zona y chance ≥0.5% o de rareza,
filtrados por calidad ≥verde, nivel requerido, clase permitida y equipo usable
(Bow/Gun/etc. según tu `pref`); cada uno muestra el nombre de su fuente.

**Oro de vendedor ("oro puro")**: además del término AH, cada zona suma
`vendorGph` — la venta a NPC de TODOS los drops elegibles de sus mobs y
objetos públicos (no depende del scan), ponderada por los 3 mejores
campamentos como `zoneBase` y excluyendo los ítems presentes en el scan (esos
ya los computa el término AH). Los ítems del scan sin precio AH usan como
piso su `sellPriceCopper` sin comisión (`vendorFloor` en `metrics()`). Las
fuentes observadas RareScanner no aportan al término vendor: son loot valioso,
no basura. El resultado se muestra como badge `≈X/h vendedor`.

El total AH se multiplica por bonus de útiles (máx. 20%) y luego, junto al
vendor, por riesgo de facción (propia 1.0, disputada 0.85, enemiga 0.6; PvP
desactivable), competencia (auto = media, sube si la zona aparece en tu banda
de nivel o en horario pico 18–23; o manual/por zona) **y factor de traslado**.

**Traslado**: tabla `TRAVEL` curada por zona×facción con minutos estimados de
ida y vuelta al punto de venta más cercano (basada en flight paths de Classic
1.12, aproximada). `factor = sesión ÷ (sesión + viaje/60)` con la sesión de
farmeo elegible (1/2/4 h, default 2 h, persistida en `state.farm.session`).
Zonas donde tu facción no tiene vuelo propio castigan fuerte (p. ej. Westfall
para la Horda ≈ 55 min → ×0.69 con sesión de 2 h); si la zona está en tu banda
de nivel de la guía el viaje se descuenta ×0.5. La card muestra badge
`viaje ~N min` (+ `sin vuelo` / `tu ruta`) y una línea en `reasons`.

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

El scan normalizado se guarda en IndexedDB (`wowhunter-market-v1`, store
`market`) del navegador/origen que abre la app. El reemplazo de snapshot y realm
es transaccional y lee de vuelta el snapshot antes de completar. No se actualiza
la vista de datos hasta confirmar el guardado. Un error de lectura, validación
o almacenamiento conserva el último scan válido. Durante el breve commit la
cancelación se deshabilita para no prometer un rollback que no pueda garantizar.

Desde la fase de historial acumulado, cada importación hace dos guardados:
primero el snapshot con ventana reciente (transacción de siempre) y después
el store compacto del historial (clave `history`). Si el segundo falla, el
scan igual queda guardado y la próxima importación reintenta el merge, que es
aditivo. **Borrar precios locales** elimina ambos canales.

Cambiar de navegador, perfil, origen o mover la app puede separar el almacén.
El modo privado o borrar datos del navegador puede eliminarlo. No se incluye en
el enlace de build ni se comparte al copiarlo. **Borrar precios locales** pide
confirmación y elimina solo datos de mercado de esta app, no el juego ni la
ficha del hunter. El guardado de la ficha sigue siendo independiente.

## Desarrollo y verificación

- `market.js`: parser y fuente autocontenida del Worker.
- `market-ui.js`: importación, IndexedDB, búsqueda, tablas, historial,
  filtros y integración del farmeo.
- `market-history.js`: merge determinista de historiales, store compacto,
  estadísticas y ajuste al presupuesto de bytes.
- `market-chart.js`: gráficos SVG deterministas del historial (detalle y
  tarjetas de farmeo).
- `market-farm.js`: motor puro de recomendación de farmeo + renderer.
- `market-catalog.js`: catálogo estático derivado, sin datos de cuentas.
- `drop-data.js` / `drop-data-private.js`: datasets públicos/privados de drops
  (generados, no editar a mano).
- `tools/build-catalogo-mercado.py`: reconstrucción del catálogo desde `data/` (`--out FILE`).
- `tools/build-drop-data.py`: generación de los datasets de drops.
- `desktop/build.mjs`: bundle del plugin Desktop (`node build.mjs [--out FILE]`).
- `tests/market.cjs`: pruebas unitarias del parser, fixtures sintéticas.
- `tests/market-history.cjs`: merge, store compacto, stats y presupuesto.
- `tests/market-chart.cjs`: SVG determinista, ejes, formatos y fixture real.
- `tests/test_datos.py` (raíz): pruebas del catálogo/datos, incluye `test_catalogo_reproducible`.
- `tests/market-browser.mjs`: flujo offline en Chromium aislado.
- `tests/history-browser.mjs`: acumulación de historial entre importaciones.
- `tests/farm-browser.mjs`: recomendador de farmeo en Chromium aislado.
- `tests/public-build.mjs`: vacío actualmente; el split público/privado fue retirado.
- `tests/browser.mjs`: regresiones del resto de la guía y pestaña nueva.

Ver `tests/README.md` para los comandos de navegador. Las pruebas sintéticas
comprueban el contrato; no demuestran mecánicas ni compatibilidad del servidor.
Una importación real de SavedVariables se valida por separado y sin publicar
contenido bruto ni nombres de cuenta.

Comprobación local de esta implementación: 24 pruebas del parser, 28 del
historial acumulado, 15 de los gráficos, 52 del catálogo, 39 del flujo de
mercado, 18 del flujo de acumulación, 38 del recomendador de farmeo, 14 del
split público/privado del plugin, 8 de la precarga local, 17+33 de
escritorio y 76 regresiones de la guía, todas verdes. El flujo real en Chromium aislado importó 4480 ítems,
verificó paginación y recarga, sin errores JavaScript ni solicitudes HTTP(S).

El catálogo se genera **solo desde `data/`** (CMaNGOS classic-db + tablas del cliente
WoW Forever), reemplazando al extractor antiguo del addon ForeverDungeonJournal. Para
regenerarlo: `python3 tools/build-catalogo-mercado.py [--out FILE]`. Es determinista y
byte-idéntico a `standalone/market-catalog.js` (lo verifica
`tests/test_datos.py::test_catalogo_reproducible`). No accede a SavedVariables ni a
entradas externas; la cobertura exacta se declara en `market-catalog.js`.

## Variante plugin de Hermes Desktop

El plugin Desktop **ya no es un bundle de esta app standalone**: es una implementación
React separada en `desktop/src/`, compilada con `desktop/build.mjs` (esbuild) a
`desktop/plugin.js` y desplegada en `~/.hermes/desktop-plugins/wow-forever/` (ruta
`/wow-forever`). El namespace de datos sigue siendo el legacy `wow-hunter-guide`
(`~/.config/Hermes/plugin-files/data/wow-hunter-guide/`) por compatibilidad.

En vez de IndexedDB, el plugin usa `ctx.files`: mercado e historial en un **bundle v2**
(`market-v2-*`, `price-history-v2-*`) con puntero `market-v2-pointer`, respaldo pre-v2
troceado (≤3 MiB + manifiesto) y rollback en dos pasos. El detalle completo (almacén v2,
puente WoWForeverBridge, sondeo 30 s, TSM) está en **`docs/DESKTOP.md`**. Este documento
describe la app standalone (`index.html`, `file://`, IndexedDB), que sigue disponible sin
Hermes.

Regenerar el bundle Desktop tras tocar `desktop/*`: `cd desktop && node build.mjs`. La
precarga `market-local-scan.js` y el split público/privado (`--public`, `dist/`) fueron
**retirados**: el build es único y cada usuario importa sus propias fuentes (Auctionator,
TSM, diario del puente).

## Guías por clase/facción

`index.html` ya no contiene el contenido de una sola clase: cada guía vive en
`guide-<clase>.js` (`window.GUIDE_*`) con specs, armas por facción, macros,
barras, bandas de zonas, milestones, loot de dungeons y hooks `recExtra`.
Selector de Clase + Bando en la barra lateral; el progreso (armas/ruta/equipo)
se reinicia al cambiar de guía (con confirmación). Estado nuevo: `cls`, `fac`
(los builds viejos cargan como hunter/Horda). Deep-links incluyen `cls`/`fac`.

Guías incluidas: **Hunter** (BM/MM/SV), **Warrior** (Arms/Fury/Prot) y
**Shaman** (Elemental/Enhancement/Restoration — armas solo 1H, totems, ambos
bandos; Alliance shaman = draenei, ruta principal Azuremyst/Bloodmyst→EK).

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

- Deal score = precio actual vs mediana/mínimo histórico + liquidez
  (`available` del día más reciente) + tendencia (`priceStats.tendencia`).
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
`market-catalog.js`, stats del personaje (import `/simc`), precios+historial.

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
