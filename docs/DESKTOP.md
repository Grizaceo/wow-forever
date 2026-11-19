# La mitad Desktop

`desktop/plugin.js` es un solo módulo ES legible que genera `desktop/build.mjs` (esbuild, sin
minificar) desde `desktop/src/`. Hermes Desktop lo carga en la barra lateral como
**WoW Forever** (ruta `/wow-forever`).

## Reglas

- Solo se importa `@hermes/plugin-sdk`, `react` y `react/jsx-runtime`; todo lo demás va en el
  bundle. Nada de `eval`, `new Function`, `import()`, `innerHTML`/`dangerouslySetInnerHTML`,
  `<script>`, `window.hermesDesktop` ni tocar el DOM de la app.
- Archivos: solo `ctx.files` (la carpeta `'data'` del plugin y la carpeta que el usuario
  concede para `Auctionator.lua`, en `src/auctionator.js`). Sin red.
- Sin globales: ningún módulo escribe en `window`. Los módulos de `standalone/` se importan como
  CommonJS (`module.exports`); el motor de farmeo recibe sus datos con `configure({...})`.
- Colores solo con las variables del tema (`src/estilos.js`: `C`, `S`, `CALIDAD`,
  `DIFICULTAD`); nunca `#hex` ni `rgb()`. Así la página sigue al tema claro u oscuro.
- Textos con `t(lang, clave)` (`src/i18n.js`); cada sección agrega los suyos con
  `agregarTextos(es, en)` desde su propio archivo. Español por defecto, inglés opcional.
- Nombres del juego con `nombre(n, lang)` (`src/datos.js`); ítems con `<NombreItem id lang />`.
- Cada dato muestra su origen con `<Origen f=… />` y lo que falta con `<Hueco>`: nunca se
  inventa un dato que no esté en `data/` o en las guías curadas.
- Texto curado con HTML de las guías: `<TextoRico html=… />` (lista blanca, sin innerHTML).

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/plugin.src.jsx` | registro en el SDK (barra lateral, ruta, paleta). Id interno `wow-hunter-guide`: con el mismo id, Hermes conserva el almacenamiento y los permisos de la versión anterior |
| `src/app.jsx` | carga lo guardado, perfil del jugador, pestañas |
| `src/almacen.js` | almacén durable: progreso de la guía (`build`), mercado e historial (mismo formato que antes) |
| `src/auctionator.js` | lee `Auctionator.lua` de la carpeta concedida |
| `src/datos.js` | `data/*.json`, `drop-data`, guías curadas y ayudas |
| `src/ui.jsx`, `src/estilos.js`, `src/i18n.js` | piezas, estilos y textos comunes |
| `src/davi.js`, `src/davi-transporte.js` | «Preguntar a DAVI»: contexto puro (allowlist, acotes) y transporte insert → portapapeles → manual |
| `src/vistas/preguntar-davi.jsx` | botón + panel de las tres pestañas (pregunta, conmutadores, vista previa) |
| `src/vistas/*.jsx` | una sección por archivo |
| `../src/perfil.js` | validación del perfil (módulo puro, compartido con tests de Node) |

Cada vista recibe las mismas props:
`{ ctx, almacen, estado, recargar, perfil, guardarPerfil, razaSupuesta, lang, irA }`, donde
`estado` es `{ build, market, history, revision }` leído de `almacen.read()` y `recargar()`
vuelve a leerlo tras guardar.

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
  del historial, la UI lo informa expresamente. Ante un guardado incierto indica Reabrir
  para comprobar el estado, nunca garantiza que todos los datos se conservaron.
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
- La tabla separa reino/variantes y muestra unidades vendidas/compradas, medias ponderadas,
  ingresos registrados, compras y última venta. Expiraciones/cancelaciones son **unidades en
  intentos de subasta**: pueden repetir el mismo objeto; no son ventas perdidas ni tasa de venta.
  Ingresos no son beneficio neto: `Ledger/Mail.lua` calcula ventas de correo como
  `floor((bid - ahcut) / quantity + 0.5)`. TSM ya descuenta ahí comisión y redondea por unidad.
  No reconstruimos bruto, ni descontamos comisiones de nuevo; faltan fabricación y depósitos.
- La referencia Auctionator solo se ofrece para el **mismo reino** y objetos base sin variantes.
  Son precios anunciados, no operaciones ejecutadas. Inventario, profesiones y recomendaciones
  personales de farmeo quedan fuera de esta fase. No se envía contabilidad a chat/red.

Pruebas específicas (datos sintéticos, SDK simulado, Chromium/React reales, sin abrir juego):

```sh
node --test tests/tsm.test.mjs
node desktop/test/tsm.mjs
```

## Agregar o cambiar una sección

1. Escribe la vista en `src/vistas/<seccion>.jsx` (y sus piezas en `src/vistas/<seccion>/`).
2. La lógica pura va en `src/<algo>.js` o `../src/<algo>.js`, con tests `node:test` en
   `tests/<algo>.test.mjs`.
3. Prueba en navegador en `desktop/test/vista-<seccion>.mjs` con `desktop/test/arnes.mjs`.
4. `cd desktop && node build.mjs`, y luego:

```sh
python3 -m unittest discover -s tests          # incluye el lint de Hermes y el build reproducible
node --test tests/
PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/navegador.mjs
PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/vista-<seccion>.mjs
```
