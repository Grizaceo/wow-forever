# Preguntar a DAVI — plan (2026-11-14)

Entrega 1, aprobada. Añade a las pestañas **Personaje**, **Profesiones** y **Mercado** un botón
**«Preguntar a DAVI»** que compone una pregunta con **solo** el contexto seleccionado y la pasa al
chat de Hermes. No toca el juego, no escribe almacenamiento nuevo y no usa red.

## Reglas del encargo

- Botón en las tres pestañas. En **Mercado** solo aparece con un **único ítem de detalle**
  seleccionado (`detalle`); en **Profesiones**, con la **profesión elegida** y, si hay, la **receta
  seleccionada** y **solo sus reactivos** (acotados).
- Vista previa con la **pregunta** (editable) y **solo** el contexto elegido. Dos conmutadores:
  **perfil** y **precios**. Excluir un bloque lo quita del texto.
- **Nunca** se incluye el historial completo ni el contenido de `Auctionator.lua`: el constructor
  copia solo una **lista explícita de campos** (allowlist) y acota reactivos y nombres.
- La selección se **congela** al abrir el panel: editar la pregunta o los conmutadores no cambia el
  contexto, y cambiar la selección detrás del panel no lo altera.
- **Procedencia** siempre visible: origen de los datos y **día observado** / **fecha de importación**.
  Se distingue **ofertas anunciadas** de **ventas** y se avisa de que la referencia de botín/farmeo es
  **Classic 1.12, no verificada en Forever**. El perfil se marca como **cargado a mano, no el juego
  en vivo**.
- Confirmar **inserta** con `import { host } from '@hermes/plugin-sdk'` y
  `await host.composer.insertText(null, texto, { mode: 'block' })`. **Nunca** `submit` ni `setDraft`.
  Si `insertText` devuelve `false` o lanza, se reintenta con `ctx.os.writeClipboard`; si eso falla,
  se muestra el texto **seleccionable** para copia manual. Con éxito confirmado, el botón queda
  **deshabilitado** y se guarda un `busy` para no insertar dos veces.
- Sin red, sin backend, sin `core`/`config`/`identity`, sin escrituras nuevas en `ctx.storage`.

## Archivos

- `desktop/src/davi.js` — constructores puros del contexto (allowlist, acotes) y `previsualizarDavi`.
- `desktop/src/davi-transporte.js` — `enviarDavi({ host, ctx, texto })`: insert → portapapeles → manual.
- `desktop/src/vistas/preguntar-davi.jsx` — botón + panel (pregunta, conmutadores, vista previa
  seleccionable, estados).
- `desktop/src/i18n.js` — textos `davi.*` (es + en).
- `desktop/src/vistas/personaje.jsx`, `profesiones.jsx`, `mercado.jsx` — botan el botón y construyen
  la instantánea de su selección.
- `src/perfil.js` — `perfilParaAgente(..., lang)` opcional (por defecto `es`) para que el resumen
  de perfil salga en el idioma de la interfaz.
- `desktop/test/sdk-mock.jsx` — `host.composer.insertText` simulado (sin `submit`/`setDraft`) y
  portapapeles con fallos simulables.
- `tests/preguntar-davi.test.mjs` — pruebas puras (allowlist, variante y reino cruzado, sin precios
  de perfil, transporte insert/`false`/`throw`/portapapeles).
- `desktop/test/vista-davi.mjs` — prueba de navegador con el arnés.
- `docs/plans/2026-11-14-preguntar-davi.md`, `README.es.md`, `README.md` y `docs/DESKTOP.md` (uso y
  límites).

## Orden (TDD)

1. Pruebas puras primero (`node --test tests/`): rojas.
2. `davi.js` + `davi-transporte.js`: verdes.
3. Prueba de navegador (arnés): preview sin efectos hasta confirmar, editar pregunta, conmutadores,
   insert `true`/`false`/`throw`, portapapeles y doble inserción.
4. Cableado de las tres vistas + i18n + mock del SDK.
5. `node build.mjs` → `desktop/plugin.js` + `desktop/BUNDLE.json`.
6. `python3 -m unittest discover -s tests`, `node --test tests/`, `desktop/test/navegador.mjs` y
   `desktop/test/vista-preguntar-davi.mjs`. Sin commit.

## Límites de esta entrega

- No abre el juego ni lee datos en vivo; el contexto es el que ya tiene la página.
- No incluye el historial por día ni el archivo `Auctionator.lua`; solo el mínimo anunciado, el día
  observado, la oferta máxima diaria y la fecha de importación.
- El panel es inline (no un modal del SDK) para no depender de superficie nueva.
- Sin persistencia: al cerrar el panel se pierde el borrador (no se escribe en `ctx.storage`).

## Estado final (2026-11-15)

Implementación revisada y probada directamente por DAVI. Sin push.

- `node --test tests/`: 107/107.
- `python3 -m unittest discover -s tests`: 51 OK; dos ResourceWarning de archivos sin cerrar en el test de versiones no bloquean la suite.
- `python3 scripts/check_desktop_bundle.py`: OK, bundle reproducible.
- Navegador headless con Chromium: DAVI 50, Mercado 45, Profesiones 17, Guía 28, Ruta/dungeons 31; cero errores JS y cero solicitudes de red en cada suite.
- Se reprodujo primero el fallo de reapertura durante una inserción pendiente y se corrigió bloqueando apertura/cierre/edición mientras espera confirmación.
- Se reprodujo primero la falta de procedencia temporal en Profesiones y se añadieron reino, fecha de importación y día observado solo para los ítems de la receta seleccionada; quedan dentro del bloque excluible de precios.
- Bundle instalado y hash verificado: `f8cd178313b350c9db6a054b41145486d23ae75c8411febcf2f6013e8a12e897`.
- Respaldo anterior: `/home/gris96/.hermes/backups/wow-forever/20261115-235215/`.
- SDK real inspeccionado: exporta `host` y ofrece inserción confirmada en modo `block` (añade, no reemplaza). No se ejecutó contra el compositor del usuario: CDP :9222 no disponible; no se reinició ni navegó su aplicación.
- La verificación de interfaz usa el SDK simulado, no acredita por sí sola una recarga ni una inserción en la ventana real de Hermes.
- Dependencias de test instaladas con `--no-save` en `desktop/node_modules/`; `desktop/package.json` no cambió.

