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
