# Arquitectura — capas y grafo de dependencias

WoW Forever tiene tres capas. Este documento mapea **qué importa qué** con
evidencia del fuente, clasifica `standalone/` (que no es un cementerio: es la capa
motor compartida **más** la app standalone legada), y explica por qué no se renombra.

Complementa: `docs/DESKTOP.md` (plugin React), `docs/TESTING.md` (gates),
`docs/MODELO-DATOS.md` (almacén v2), `docs/MERCADOS-PROCEDENCIA.md` (procedencia).

## Las tres capas

```
data/*.json  +  data/MANIFEST.json          ← generado por tools/build-datos-juego.py
   │  (CMaNGOS classic-db GPL-3.0 + tablas del cliente; LICENSE-DATA.md)
   │
   ├──► desktop/src/datos.js  (importa 7 JSON crudo: items, clases, profesiones,
   │                           zonas, misiones, dungeons, personaje)
   └──► tools/build-catalogo-mercado.py ──► standalone/market-catalog.js
                                             (catálogo pre-construido de la APP STANDALONE)

standalone/   ← capa MOTOR compartida (market*.js, guías curadas, drop-data)
   │            + app standalone legada (index.html, market-ui.js, market-catalog.js)
   │
   ├──► desktop/src/mercado-logica.js, bridge.js, tsm.js, auctionator.js,
   │    almacen.js, datos.js   (importan el motor)
   └──► standalone/index.html  (app legada file:// + IndexedDB)

desktop/src/  ← plugin React (vistas/, almacén v2, sondeo 30 s, puente, TSM)
   └──► desktop/build.mjs ──► desktop/plugin.js  (bundle ESM legible, ~6,7 MB)
```

**Dato clave:** el bundle Desktop inlinea `data/*.json` **crudo** (vía `datos.js`),
**no** `standalone/market-catalog.js`. El catálogo pre-construido es solo de la app
standalone. Ambos derivan de `data/`, pero por caminos distintos.

## Grafo verificado: `desktop/src/` → `standalone/`

| Módulo `desktop/src/` | Importa de `standalone/` |
|---|---|
| `datos.js` | `drop-data.js`, `guide-hunter.js`, `guide-legacy.js` (+ 7 `data/*.json`) |
| `mercado-logica.js` | `market.js`, `market-history.js`, `market-deals.js`, `market-chart.js`, `market-farm.js`, `market-identity.js`, `market-source.js`, `market-compare.js` |
| `bridge.js`, `tsm.js` | `market.js` (parser) |
| `auctionator.js`, `almacen.js` | `market-identity.js`, `market-history.js` |

`market-history.js` es el **núcleo del motor** (lo importan `almacen.js`,
`mercado-logica.js`, 7 suites de `tests/` y 3 `.cjs` de standalone). `market-identity.js`
es el segundo más compartido (3 módulos desktop + 9 tests). `market.js` es el parser
Auctionator/TSM/puente.

## Clasificación de `standalone/` (15 módulos `.js`)

### MOTOR COMPARTIDO — 11 módulos (el bundle Desktop los inlinea)

`market.js` · `market-history.js` · `market-identity.js` · `market-source.js` ·
`market-compare.js` · `market-deals.js` · `market-farm.js` · `market-chart.js` ·
`drop-data.js` · `guide-hunter.js` · `guide-legacy.js`

Son la lógica de mercado reutilizable + datos generados/curados. `desktop/src/` los
importa; `tests/` los cubre; la app standalone también los usa. **No son código muerto.**

### APP LEGADA — 4 módulos (solo `index.html` / tests, NO `desktop/src/`)

| Módulo | Rol | Estado |
|---|---|---|
| `market-ui.js` | UI de la app standalone (1159 líneas, DOM directo) | Reemplazada en Desktop por las vistas React (`desktop/src/vistas/`). Viva solo para `index.html`. |
| `market-catalog.js` | Catálogo pre-construido (generado por `tools/build-catalogo-mercado.py`) | Lo usa `index.html`. Desktop usa `data/items.json` crudo. `tests/test_datos.py` verifica su regeneración byte-idéntica. |
| `guide-shaman.js`, `guide-warrior.js` | Guías curadas de Chamán/Guerrero | **Retiradas del Desktop en 2.0.0** (`datos.js:17-22`): nombraban ítems/misiones/jefes/razas inexistentes (`tools/auditar-curado.mjs` lo detectó). Esas clases usan solo datos generados en Desktop. Siguen en standalone para la app legada y `tests/ruta-logica.test.mjs`. Pendientes de reescritura auditada. |

`GUIAS = { 3: GUIDE_HUNTER }` en `datos.js`: solo Cazador (id de clase 3) tiene capa
curada activa en Desktop. Toda guía nueva debe pasar `tests/curado-datos.test.mjs`.

## Build del bundle (`desktop/build.mjs`)

- Entry `src/plugin.src.jsx`, esbuild `bundle:true`, `format:esm`, `target:es2020`.
- **Inlinea todo** salvo `EXTERNAL = ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime']`
  (el cargador de Hermes Desktop solo admite esos imports; el resto va en línea).
- `minify:false` + `lineLimit:200`: el gate `tests/test_desktop.py::test_legible` rechaza
  líneas de código > 400 chars. **No minificar** es deliberado (legibilidad del bundle).
- `charset:utf8`, `legalComments:'none'`, `sourcemap:false`, `jsx:automatic`.
- Post-proceso: escapa caracteres invisibles (​‌‍⁠﻿) a `\uXXXX`
  porque el escáner del instalador los marca aunque estén en strings.
- Escribe `BUNDLE.json` (sha256 + bytes + esbuild version + data_manifest). Dos builds
  con las mismas entradas dan los mismos bytes (`test_build_reproducible`).
- **Sin `import()` dinámico**: el host no lo admite → no hay code-splitting posible.
- Tamaño actual: **6.745.191 bytes** (`scripts/check_desktop_bundle.py`). Composición
  dominada por datos (`data/*.json` + `drop-data.js`); el análisis fino con metafile de
  esbuild y la medición de carga son la Fase 4 del plan de orden (requiere OK aparte).

## Por qué `standalone/` NO se renombra a `engine/`

El nombre `standalone/` es histórico pero **honesto sobre su doble rol**: contiene el
motor compartido (11 módulos que Desktop importa) **y** la app standalone legada
(`index.html` + `market-ui.js` + `market-catalog.js`). Renombrarlo a `engine/`:

1. Sería **deshonesto**: no es solo motor; también es la app legada completa.
2. Tocaría **~30+ rutas de import** en `desktop/src/`, `tests/`, `standalone/tests/` y
   `index.html`, más los generadores (`build-catalogo-mercado.py`, `build-datos-juego.py`)
   y la doc. Alto riesgo de rotura para beneficio cosmético.
3. El plan de orden (deuda 1) pedía "documentarlo como capa motor **o** moverlo con
   aliases". Se elige **documentar** (este archivo + los banners de alcance en
   `standalone/MARKET.md` y `standalone/tests/README.md`), que resuelve la confusión sin
   movimiento estructural.

**Decisión: mantener `standalone/`, documentar el doble rol.** Si en el futuro se separa
la app legada del motor, recién ahí tendría sentido un `engine/` con aliases — como
cambio estructural propio, con gates y OK del usuario, no mezclado con comportamiento.

## App standalone legada (`index.html`)

Superficie vieja: un solo HTML abierto por `file://`, estado en IndexedDB, UI DOM
(`market-ui.js`), catálogo pre-construido (`market-catalog.js`). **No es el plugin
Desktop** (React, almacén v2 en archivos JSON del host, puente, TSM, sondeo 30 s). Se
conserva como referencia histórica y banco de pruebas del motor; su retiro/consolidación
es la Fase 5 del plan (condicional, requiere OK). Ver `standalone/MARKET.md`.
