# La mitad Desktop

`desktop/plugin.js` es un solo módulo ES legible que genera `desktop/build.mjs` (esbuild, sin
minificar) desde `desktop/src/`. Hermes Desktop lo carga en la barra lateral como
**WoW Forever** (ruta `/wow-forever`).

## Reglas

- Solo se importa `@hermes/plugin-sdk`, `react` y `react/jsx-runtime`; todo lo demás va en el
  bundle. Nada de `eval`, `new Function`, `import()`, `innerHTML`/`dangerouslySetInnerHTML`,
  `<script>`, `window.hermesDesktop` ni tocar el DOM de la app.
- Archivos: solo `ctx.files` (la carpeta `'data'` del plugin y la carpeta que el usuario
  concede para `Auctionator.lua`, `TradeSkillMaster.lua` y `WoWForeverBridge.lua`, en
  `src/auctionator.js`, `src/tsm.js` y `src/bridge-sync.js`). Sin red.
- Sin globales: ningún módulo escribe en `window`. Los módulos de `standalone/` se importan como
  CommonJS (`module.exports`); el motor de farmeo recibe sus datos con `configure({...})`.
- Colores solo con las variables del tema (`src/estilos.js`: `C`, `S`, `CALIDAD`,
  `DIFICULTAD`); nunca `#hex` ni `rgb()`. Así la página sigue al tema claro u oscuro.
- Textos con `t(lang, clave)` (`src/i18n.js`); cada sección agrega los suyos con
  `agregarTextos(es, en)` desde su propio archivo. Inglés por defecto, español opcional.
- Nombres del juego con `nombre(n, lang)` (`src/datos.js`); ítems con `<NombreItem id lang />`.
- Cada dato muestra su origen con `<Origen f=… />` y lo que falta con `<Hueco>`: nunca se
  inventa un dato que no esté en `data/` o en las guías curadas.
- Texto curado con HTML de las guías: `<TextoRico html=… />` (lista blanca, sin innerHTML).

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/plugin.src.jsx` | registro en el SDK (barra lateral, ruta, paleta). Id interno `wow-hunter-guide`: con el mismo id, Hermes conserva el almacenamiento y los permisos de la versión anterior |
| `src/app.jsx` | carga lo guardado, perfil del jugador, pestañas |
| `src/almacen.js` | almacén durable v2: progreso (`build`), mercado e historial en bundle `market-v2-*`/`price-history-v2-*`; respaldo pre-v2 troceado y rollback |
| `src/auctionator.js` | lee `Auctionator.lua` de la carpeta concedida |
| `src/mercado-auto.js` | sondeo automático de Auctionator cada 30 s (cola, revisión, puntero) |
| `src/tsm.js` / `src/tsm-sync.js` | contabilidad personal TSM (CSV como datos) y su sondeo cada 30 s |
| `src/bridge-sync.js` | sondeo del diario WoWForeverBridge cada 30 s (una entrada por día) |
| `src/item-stats.js` | catálogo de stats por ítem (`pawn-stats`) y equipo puesto por slot; normaliza y persiste |
| `src/subasta-pawn.js` | puntuador puro Subasta × Pawn (score, delta, plata por punto, exclusiones) |
| `src/vistas/subasta-pawn.jsx` | sub-pestaña Subasta × Pawn dentro de Mercado |
| `src/datos.js` | `data/*.json`, `drop-data`, guías curadas y ayudas |
| `src/ui.jsx`, `src/estilos.js`, `src/i18n.js` | piezas, estilos y textos comunes |
| `src/davi.js`, `src/davi-transporte.js` | «Preguntar al agente»: contexto puro (allowlist, acotes) y transporte insert → portapapeles → manual |
| `src/vistas/preguntar-davi.jsx` | botón + panel de las tres pestañas (pregunta, conmutadores, vista previa) |
| `src/vistas/*.jsx` | una sección por archivo |
| `../src/perfil.js` | validación del perfil (módulo puro, compartido con tests de Node) |

Cada vista recibe las mismas props:
`{ ctx, almacen, estado, recargar, perfil, guardarPerfil, razaSupuesta, lang, irA }`, donde
`estado` es `{ build, market, history, revision }` leído de `almacen.read()` y `recargar()`
vuelve a leerlo tras guardar.

## Navegación

- **Character** abre **Profile** y agrupa **Route** y **Professions**. La antigua pestaña **Class** pasa a cuatro desplegables opcionales dentro de Profile (entrenadores, hechizos, misiones y competencias), cerrados por defecto e independientes. Una preferencia antigua `clase` vuelve a Profile sin perder datos.
- **Professions** concentra la selección de profesiones principales (máximo dos) y secundarias; Profile ya no repite ese bloque. Los cambios conservan los demás campos del perfil.
- **Market** queda como segunda sección principal, sin cambios en su navegación interna.
- **Others and Configuration** agrupa **Dungeons**, **Curated guide** (solo si hay guía para el perfil),
  **Legacy** y **Settings**. Settings incluye idioma de la interfaz y recarga de datos locales.
- La preferencia `pestana` guarda la vista concreta, compatible con los identificadores antiguos.

## Seguimiento automático de Auctionator

- El archivo de precios es `WTF/Account/<cuenta>/SavedVariables/Auctionator.lua`, **no**
  el código del addon en `Interface/AddOns/Auctionator`. Concede SavedVariables una vez
  con **Leer Auctionator.lua** o **Elegir otra carpeta**. También se admite una carpeta
  superior (búsqueda acotada a 80 directorios y cuatro niveles).
- `src/mercado-auto.js` inicia un sondeo cada 30 segundos con `ctx.setInterval` al
  registrar el plugin. Funciona aunque Mercado no esté montado; requiere Hermes abierto
  y el plugin habilitado. El timer es scoped y `ctx.onDispose` detiene trabajo futuro.
- El sondeo nunca abre el selector: si falta/revocaste el permiso, espera. Si encuentra
  varias cuentas, pide elegir SavedVariables; no adivina por tamaño. La carpeta elegida
  explícitamente se recuerda en `auctionator-folder`.
- Lua se interpreta como datos, no se ejecuta. Se conservan bytes binarios vía
  `readDataUrl` para los blobs CBOR de reinos. El límite de importación sigue en 8 MiB.
- Solo bytes distintos y válidos actualizan el scan; el histórico se fusiona con el
  acumulado. Importación manual y automática comparten cola y leen revisiones actuales.
  Si falla el guardado del historial, no se marca el archivo como procesado y se reintenta.
- El conmutador persiste en `auctionator-auto` (activo por defecto). Borrar precios pausa
  el seguimiento para evitar que el siguiente sondeo los repueble sin consentimiento.
- Al revocar la carpeta preferida, se descarta su identificador obsoleto y se buscan datos
  solo entre los permisos actuales. Varias cuentas siguen siendo ambiguas; una búsqueda
  incompleta se rechaza incluso si ya encontró un archivo. En hosts sin `folders`, queda
  disponible el selector manual, pero no el sondeo silencioso.
- Cada resultado nuevo limpia errores y avisos transitorios anteriores. Pausar no promete
  reintentos mientras el seguimiento esté desactivado.
- Descargar el plugin cancela trabajo encolado o detenido antes de la primera escritura.
  Una operación que ya inició la escritura del snapshot termina su guardado de historial
  para no cortar la pareja a mitad; no emite notificaciones tras `dispose`. No se puede
  cancelar retroactivamente una escritura ya enviada al SDK.
- El borrado usa dos guardados, no una transacción atómica: si solo se confirmó el vaciado
  del historial, la UI lo informa expresamente. Ante un guardado incierto indica
  **Otros y configuración → Configuración → Recargar datos** para comprobar el estado;
  nunca garantiza que todos los datos se conservaron.
- Tras escanear en el juego, `/reload` o cerrar sesión permite que WoW escriba las
  SavedVariables al disco. El plugin no puede leer datos que sigan solo en memoria del juego.

Pruebas específicas:

```sh
node --test tests/auctionator-auto.test.mjs tests/mercado-auto.test.mjs tests/auctionator-lectura.test.mjs
node desktop/test/mercado-auto.mjs
node desktop/test/vista-mercado.mjs
```

La prueba de navegador usa Chromium + React reales y dobles de ctx para permisos/archivos
más un reloj controlado: comprueba sondeo fuera de Mercado, búsqueda desde raíz de WoW,
deduplicación, acumulación, pausa al borrar, reanudación y descarga del plugin.

## Contabilidad personal TSM · Mis ventas

En Mercado → Ofertas, Auctionator (escaneo y precios) y Mis ventas TSM se presentan
en columnas iguales, alineadas arriba cuando el contenedor lo permite. Cada columna
tiene una base de 560 px; en paneles estrechos se apilan. Las tablas conservan scroll
horizontal local, sin ensanchar toda la página. La distribución no cambia importaciones.
La primera entrega descriptiva añade el resumen personal `tsm-descriptiva-v1`, sin predicción
ni persistencia nueva: [método, límites y contrato](TSM-VALORACION.md).

- `src/tsm.js` importa como **datos** `TradeSkillMasterDB` del addon TSM 4: campos
  `r@<reino>@internalData@csvSales/csvBuys/csvExpired/csvCancelled`. Se comprueba la cabecera
  CSV exacta; un esquema desconocido, Lua ejecutable, truncamiento o cantidades/importes
  fuera del rango seguro rechazan la lectura completa. Límites: 8 MiB de entrada, 50.000
  operaciones y 3,5 MiB de snapshot normalizado. Las fixtures son sintéticas, contrastadas
  con el serializador del addon; no equivalen a validar una cuenta real.
- El descubrimiento inicial es automático: reutiliza la carpeta autorizada para Auctionator,
  o los permisos SDK existentes si no hay preferencia Auctionator. Busca el nombre exacto
  `TradeSkillMaster.lua` en el permiso, hasta 120 directorios y 6 niveles; excluye Interface,
  Data, Cache, Logs y .git. No lee Config.wtf, credenciales ni `.bak`. Ante ambigüedad,
  listado truncado, rutas inválidas o búsqueda incompleta no importa ni escoge al azar.
  Un archivo encontrado en la raíz no evita completar la búsqueda: una copia suelta no debe
  ganar silenciosamente sobre una cuenta anidada. Solo tras comprobar unicidad se lee el archivo.
- Solo si no existe permiso, **Leer TradeSkillMaster.lua** solicita una carpeta una vez:
  raíz del juego, WTF o SavedVariables, sin elegir archivos. **Elegir carpeta TSM** permite
  resolver varias cuentas/cambiar la fuente. La ubicación única queda fijada en `tsm-location`
  (ID del permiso y ruta relativa): si desaparece o se revoca, no adopta otra cuenta.
- `src/tsm-sync.js` restaura al cargar el plugin y sondea cada 30 s, también fuera de Mercado.
  Está activo por defecto; una pausa explícita o el borrado siguen desactivándolo. Nunca
  abre un selector en segundo plano; sin `folders`/`list` del SDK permanece el modo manual.
  Las pruebas Chromium verifican que una sola concesión para Auctionator descubre ambos
  addons, sin botón TSM, sin segundo selector y sin leer Config.wtf (datos sintéticos).
- **No es un ledger incremental**: cada lectura válida reemplaza el snapshot completo de la
  fuente. TSM acumula cantidades en filas mutables; anexar filas o deduplicar por hash de fila
  duplicaría ventas. Una importación idéntica no reescribe. Un archivo incompleto/ilegible no
  sustituye datos previos. Los recortes/borrados del propio TSM se reflejan en la siguiente
  importación válida; no se promete recuperar operaciones previas a instalarlo.
- Se descartan compradores, vendedores, personajes y `profileKeys` antes de guardar.
  Permanecen reino, tipo, identificador/variante del objeto, cantidad, precio unitario en
  cobre, fecha y origen. `price × quantity` es el importe registrado; `stackSize` no se
  multiplica de nuevo. El hash de entrada vive solo en memoria y no se conservan bytes crudos.
- Persistencia independiente: `tsm-a.json`/`tsm-b.json` en `'data'` y `tsm-pointer` en storage.
  Se verifica el archivo escrito antes del índice y se relee este último. Un índice incierto
  bloquea escrituras hasta **Reabrir TSM**, no garantiza conservación ficticia. Si falta el índice
  pero quedan slots, bloquea toda importación para no pisar respaldos huérfanos. La cola serializa
  importación, sondeo, pausa y borrado. `dispose` impide iniciar escrituras nuevas; una ya
  enviada completa su commit sin publicar UI. El borrado es lógico (no borrado seguro del
  soporte): confirma snapshot vacío y pausa el sondeo; no borra precios Auctionator.
- El resumen principal filtra ventas `Auction` y conserva reino/variante literal; muestra
  precio típico diario, unidades positivas resumidas, registros contables, días distintos,
  período de ventas registradas y motivos de evidencia insuficiente. La contabilidad de
  todos los canales permanece en un desplegable, separada de la referencia personal.
  Los objetos con registros TSM pero sin ventas de subasta (solo compras, expiradas,
  canceladas o ventas por correo) siguen en la lista, después de las valoraciones, con su
  contabilidad y el aviso «sin valoración». Los importes se muestran con `<Dinero>`.
  Expiraciones/cancelaciones pueden repetir unidades: no son ventas perdidas ni tasa de venta.
- La atribución preexistente a `Ledger/Mail.lua` de `floor((bid - ahcut) / quantity + 0.5)`
  no verifica la versión instalada: el importe de correo puede ya descontar comisión y
  redondear por unidad. Presentamos **importe registrado**; no reconstruimos bruto ni
  descontamos comisión de nuevo. Tampoco inferimos beneficio, fabricación o depósitos.
- No se cruza TSM–Auctionator por nombre de reino o ID base. TSM v1 no acredita identidad
  económica ni equivalencia de variantes entre formatos. La UI lo dice en llano («TSM y
  Auctionator se muestran por separado») y mantiene las fuentes consultables por separado,
  sin delta económico.
  Auctionator sigue mostrando anuncios, no operaciones ejecutadas. No se envía
  contabilidad a chat/red. Método y límites: [TSM-VALORACION.md](TSM-VALORACION.md).

Pruebas específicas (datos sintéticos, SDK simulado, Chromium/React reales, sin abrir juego):

```sh
node --test tests/tsm.test.mjs
node desktop/test/tsm.mjs
```

## Puente WoWForeverBridge (diario por día)

`WoWForeverBridge` (addon propio, v1.0.1, en `addon/WoWForeverBridge/`) captura
cada escaneo de Auctionator en un **diario por día** (`WoWForeverBridge.lua`,
SavedVariables `WoWForeverBridgeDB`). A diferencia del `Auctionator.lua` —que el
addon sobrescribe y poda a ~21 días—, el diario conserva una entrada por día con
retención configurable en el juego (`/wfb days N`). El histórico sobrevive aunque
Auctionator descarte sus propios días.

- `src/bridge-sync.js` lo sondea **cada 30 s** con el mismo contrato acotado que
  Auctionator/TSM: solo el archivo del diario, dentro de la carpeta concedida
  (`auctionator-folder`), búsqueda limitada, sin selector en segundo plano.
- Varias cuentas → pide elegir el SavedVariables; no adivina. Grant revocado o
  archivo ausente → estado visible («instalá el addon y `/reload`»), nunca un
  selector silencioso.
- El puente es **transporte, no exportador verificado**: los precios que trae se
  etiquetan con procedencia **UNKNOWN** por diseño (ver
  `docs/MERCADOS-PROCEDENCIA.md`). No es un bug a corregir.
- El diario se fusiona en el mismo histórico v2 que Auctionator; no crea un canal
  aparte. La UI muestra «Puente» como fuente junto a Auctionator y TSM.

Pruebas específicas:

```sh
lua addon/tests/test_bridge.lua
node --test tests/bridge-sync.test.mjs
node desktop/test/bridge.mjs
```

## Estado del personaje (SimulationCraft)

Desde la v1.1.0 el puente también captura el **export de SimulationCraft**:
`addon/WoWForeverBridge/Personaje.lua` llama a `SimulationcraftAPI.GetSimcProfile`
(API pública del addon SimulationCraft 12.1.5-04, `core.lua:1599`) dentro de `pcall`
y guarda el resultado en `WoWForeverBridgeDB.personaje = {simc, capturado, origem}`.
Si la llamada falla guarda solo `personagemErro = {erro, capturado}` — nunca borra
el último export bueno. Captura automática al entrar al mundo (throttle 300 s) y
forzada al logout/quit; `/wfbp personagem` la fuerza a mano.

- `desktop/src/bridge.js` (`parseBridge`) extrae ambos bloques del diario con
  topes (simc ≤ 512 KiB, erro ≤ 4 KiB); `bridge-sync.js` los pasa a
  `sincronizarPersonagem` (`desktop/src/simc.js`) en cada ingesta, gane o no el
  mercado. Un `capturado` más nuevo del addon reemplaza al anterior; un `pegado`
  manual solo cede ante una captura real.
- El parser `parsearSimc` (puro, sin DOM) entiende el formato real del addon
  Forever: cabecera `clase="Nombre"`, `level/race/server/spec/role`, talentos
  activos y por grupos (`# talents=`), `legacy_talents`, equipo por slot
  (`slot=,id=…,enchant_id=…,gem_id=…,bonus_id=…` con `# Nombre (ilvl)` encima),
  bolsas (`bagN=,id=`), `### Gear from Bags` comentado → `equipable`, recompensas
  semanales aparte, `# character_stats*`, `# skills=`, `# buffs=`, líneas de
  combate y bloque de mascota (`pet_*`). Lo no reconocido va a `desconhecidas`;
  ausente queda `null`, nunca 0.
- La pestaña **Personaje** muestra la tarjeta «Estado del personaje»: origen
  (juego vs pegado), fecha y frescura (>7 días = desactualizado), stats, equipo por
  slot, talentos y profesiones, propuesta de perfil (nivel/reino/raza/facción/
  profesiones, solo si validan contra `personaje.json`) y pegado manual del export.
- El agente recibe solo un **resumen acotado** (identidad + stats primarios + conteo de
  equipo + fecha de captura) como parte `simc` del contexto, con su límite
  declarado; el export crudo nunca se adjunta.

Pruebas específicas:

```sh
node --test tests/simc.test.mjs
lua addon/tests/test_bridge.lua
```

## Escala Pawn (pesos y valor del equipo)

Desde la v1.2.0 el puente también captura la **escala Pawn** del personaje:
`addon/WoWForeverBridge/Pawn.lua` lee `PawnCommon.Scales` (global del addon Pawn
2.14.3) y elige la escala activa por `ClassID`/`SpecID` —no hay API de «escala
activa»—, extrae los pesos de `Scale.Values` (o `PawnGetAllStatValues`, solo
claves numéricas, máx. 40) y el valor del equipo con
`PawnGetInventoryItemValues('player')` (`Pawn.lua:2028-2101`), todo dentro de
`pcall`. Resultado en `WoWForeverBridgeDB.pawn`; en fallo, `pawnErro` sin borrar
la captura buena. `/wfbpawn` (o `/wfbp pawn`) fuerza la captura.

**Cuándo se captura (y por qué).** Pawn apaga sus proveedores al salir:
`PawnOnLogout()` (`Pawn.lua:524`) llama `PawnUnitializePlugins()`
(`Pawn.lua:5665-5676`), que deja `ProviderActive = nil` y `Values = nil` en toda
escala de proveedor. Como Pawn carga antes (`P` < `W`), en `PLAYER_LOGOUT` su
handler corre primero y una captura ingenua grabaría «sin escala para classID N»
en cada salida. Por eso (v1.2.1):

- la captura final va en **`PLAYER_LEAVING_WORLD`**, que dispara antes del
  apagado de Pawn (`pcall` al registrarlo por si el cliente no lo conoce);
- `pluginsAtivos()` distingue «Pawn apagado» de «falta la escala»: sin
  proveedores vivos la captura sale en silencio, sin `pawnErro` y sin pisar la
  captura buena;
- el `pawnErro` real (Pawn vivo y ninguna escala con el `ClassID`) incluye
  `escalas=N, ativas=M` para diagnosticar sin abrir el juego;
- si el equipo vuelve con `ilvl` pero sin valores por escala (Pawn aún no
  cacheó los ítems: `PawnAddStatToTable` descarta `Amount == 0`,
  `Pawn.lua:2693`), hay **un reintento acotado** a los 45 s y como máximo dos
  intentos por entrada al mundo.

- `desktop/src/pawn.js` (puro): `parsePawnScales` lee el `PawnCommon` de
  `SavedVariables/Pawn.lua` (catálogo: nombre, localized, provider, classID,
  specID, role, `temPesos`); `parsePawnCaptura` normaliza el bloque del diario;
  `escalaDoJogador` elige la escala con motivo declarado (captura > clase+spec >
  clase > null).
- **Tablas Lua = objetos.** `parseSavedVariables` (`standalone/market.js:769`)
  devuelve toda tabla como objeto con claves string: `{a,b,c}` llega como
  `{1:a,2:b,3:c}`. Por eso `parsePawnCaptura` normaliza con `listaNumerada()` en
  vez de `Array.isArray` (que en producción nunca se cumplía y tiraba
  `equipo.valores` y `candidatas`); ordena por índice numérico y descarta la
  lista entera si aparece una clave no numérica.
- Ojo: `PawnUnitializePlugins` borra `Scale.Values` de las escalas de proveedor
  antes de serializar (`Pawn.lua:5665-5671`), así que el `Pawn.lua` de cuenta
  **no** trae pesos (`temPesos:false`); en runtime sí existen
  (`PawnAddPluginScale`, `Pawn.lua:5779`) y por eso la captura es en vivo.
- `bridge-sync.js` sincroniza `pawn`/`pawnErro` en cada ingesta y lee el
  `Pawn.lua` hermano del diario como catálogo (`pawn-catalogo`).
- La tarjeta «Escala Pawn» (solo en Mercado → Subasta × Pawn) muestra la escala, el chip de
  procedencia, la fecha, los pesos ordenados y el ilvl del equipo; sin captura
  lo declara y explica `/wfbpawn`. El agente recibe un resumen acotado como parte
  `pawn` del contexto, con el límite «pesos del juego, no simulación de DPS».

Pruebas específicas:

```sh
node --test tests/pawn.test.mjs
lua addon/tests/test_bridge.lua
DESKTOP_PLUGIN=$PWD/desktop/plugin.js node desktop/test/vista-pawn.mjs
```

## Subasta × Pawn (catálogo de stats de ítems y ranking)

La sub-pestaña **Subasta × Pawn** (dentro de Mercado) responde «¿cuánto vale esta
oferta *para este personaje*?» sin inventar nada: el ranking lo produce una
fórmula declarada, no un modelo.

**Cadena de datos.** `addon/WoWForeverBridge/Pawn.lua` cosecha el catálogo de
stats de los ítems que aparecen en la subasta importada
(`C_Item.GetItemStats("item:<id>")` dentro de `pcall`, copiando
`LootFilter.lua:482-486`) y lo escribe en `WoWForeverBridgeDB.pawnCatalogo`
(`i`=ilvl, `l`=equipLoc, `c`/`s`=class/subclass, `k`=stats crudos, `t`=truncado)
junto al conteo `resolvidos`/`pendentes` y el cursor del ciclo. La cosecha avanza
en `OnUpdate` (`MAX_TICK` ids por frame), no bloquea y repite cada
`INTERVALO_CATALOGO`. `/wfbpawn catalogo` la fuerza.

- `desktop/src/bridge.js` — `parseBridge` expone `pawnCatalogo` (el parser
  descarta campos no declarados: cualquier campo nuevo del puente se añade aquí).
- `desktop/src/item-stats.js` (puro) — `recItem` idempotente, `MAPA_STATS`
  (crudo → clave Pawn) con `CLAVES_PAWN` para que **re-normalizar no degrade**,
  `slotDeEquipLoc`, `parseEquipado` (acepta `id` o `itemID`), `estadoPawnStats` y
  `sincronizarPawnStats`. Storage: clave **`pawn-stats`** (no confundir con
  `pawn-catalogo`, que son las escalas Pawn).
- `desktop/src/subasta-pawn.js` (puro) — `rankear({ofertas, escala, equipado,
  catalogo})`:
  `score = Σ stats × pesos`, `delta = score(ítem) − score(equipado del slot)`,
  `plata/punto = (precio_cobre ÷ 100) ÷ delta` (`null` si `delta ≤ 0`), orden
  `delta` DESC y empate `itemID` ASC. `precioPorItem` toma el mínimo **solo de
  precios > 0** y agrega por `itemID`.
- `desktop/src/vistas/subasta-pawn.jsx` — presentación: aviso de que no es
  recomendación ni DPS, fórmula visible, tabla, exclusiones con motivo y
  procedencia (escala + fecha, catálogo + fecha, reino + snapshot).

**Límites que la vista declara en vez de disimular:** sin captura Pawn
(`/wfbpawn`), sin catálogo (`/wfbp catalogo` + `/reload`) o sin ofertas
importadas, cada estado nace `SIN DATOS` con su siguiente paso. Un ítem sin
stats, con slot desconocido, con el slot equipado sin stats («a ciegas») o sin
ninguna oferta con precio válido se excluye con motivo contado, no se puntúa a 0.

Pruebas específicas:

```sh
node --test tests/item-stats.test.mjs tests/subasta-pawn.test.mjs
DESKTOP_PLUGIN=$PWD/desktop/plugin.js node desktop/test/vista-subasta-pawn.mjs
```

## Almacenamiento v2 y respaldo pre-v2

Mercado e historial viven en un **conjunto v2** (`market-v2-a.json` o
`market-v2-b.json`) con un único puntero `market-v2-pointer` `{slot, revision}`.
Cada slot es un envoltorio `{version: 1, revision, market, history}` o, si supera
4 MiB UTF-8, un manifiesto `{version: 2, revision, parts, bytes, sha256}` seguido
de `market-v2-<slot>.part-NNN.json` (≤3 MiB por parte, hasta 32 MiB por conjunto).
Se escribe en el slot inactivo, se reconstruye y verifica el contenido antes de
publicar el puntero. El lector CLI `consultar.py` acepta ambos formatos; se debe
elegir el slot por puntero, nunca por `mtime`.

- **v1 legacy** (`market-a/b.json`, `price-history-a/b.json`, punteros
  `market-pointer` / `price-history-pointer`) se **retiene** tras la migración:
  `rollbackToBackup` lo restaura. No se borra automáticamente.
- **Respaldo pre-v2**: antes de migrar se guarda el estado v1 completo en
  `pre-v2-backup.json`. El host limita `writeText` a **4 MiB**
  (`electron/plugin-files-ops.ts`) y un respaldo A/B puede superar ese tope (caso
  real ~5,27 MiB): se parte en **trozos ≤3 MiB** (`pre-v2-backup.part-NNN.json`)
  + un **manifiesto**; `readBackupDoc` reensambla el documento lógico al leer.
  Los dobles de test DEBEN replicar el tope real o una suite verde miente.
- **Rollback en dos pasos**: la UI pide confirmación, restaura los slots v1 y
  deja el puntero v2 intacto hasta confirmar; si algo falla, el respaldo nunca se
  sobrescribe (es la única copia).
- **Condición de retiro de v1**: solo cuando el rollback deje de ser necesario
  (v2 estable + respaldo verificado tras un periodo de gracia) y con OK
  explícito. Hoy v1 + respaldo se conservan.
- Estado en disco verificado (2026-11-19): v2 activo, 7300 ítems / 57 863 filas
  de historial; respaldo troceado (manifiesto 148 B + part-000 3 MiB +
  part-001 2,37 MB).

## Claves heredadas del localStorage (`src/legado.js`)

La 1.0.0 guardaba en el localStorage del navegador, con el prefijo crudo
`wow-hunter-guide.` y **sin** el namespace que usa hoy el SDK
(`hermes.plugin.<id>.`), la ruta del Auctionator.lua que el usuario elegía a
mano. Desde la 2.0.0 el acceso es por carpeta concedida (`ctx.files` +
`ctx.storage`), así que esa clave quedó huérfana: 0 referencias en el código y
en todo el historial del repo.

`limpiarClavesHeredadas()` la borra en cada carga del plugin con la **API
estándar del navegador** (`window.localStorage`), que es la misma que usa el
propio host de Hermes para su almacenamiento. Por eso **no** hace falta tocar
el LevelDB ni usar herramientas de leveldb: basta con que el plugin se cargue
(al iniciar Hermes). Es idempotente (si la clave no está, no escribe) y tolera
contextos sin almacenamiento.

- `ctx.storage.remove()` **no** sirve para esto: el SDK prefija sus claves con
  `hermes.plugin.<id>.` y la clave fósil vive fuera de ese namespace.
- No se toca el namespace `wow-hunter-guide` (id del plugin, carpeta de datos) ni
  los contratos de storage v2 / respaldo troceado.
- Test: `node --test tests/legado.test.mjs` (6 casos) y la suite de navegador
  `desktop/test/navegador.mjs` (siembra la fósil en Chromium y comprueba que
  desaparece al cargar el bundle real).

## Agregar o cambiar una sección

1. Escribe la vista en `src/vistas/<seccion>.jsx` (y sus piezas en `src/vistas/<seccion>/`).
2. La lógica pura va en `src/<algo>.js` o `../src/<algo>.js`, con tests `node:test` en
   `tests/<algo>.test.mjs`.
3. Prueba en navegador en `desktop/test/vista-<seccion>.mjs` con `desktop/test/arnes.mjs`.
4. `cd desktop && node build.mjs`, y luego:

```sh
python3 -m unittest discover -s tests          # incluye el lint de Hermes y el build reproducible
node --test tests/
lua addon/tests/test_bridge.lua
PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/navegador.mjs
PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/vista-<seccion>.mjs
```
