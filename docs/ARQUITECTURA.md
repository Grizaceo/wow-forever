# Arquitectura — capas y grafo de dependencias

WoW Forever tiene tres capas. Este documento mapea **qué importa qué** con
evidencia del fuente y clasifica `standalone/` como la **capa motor compartida**
(la app standalone legada `index.html` fue retirada en la Fase 5 del plan de
orden).

Complementa: `docs/DESKTOP.md` (plugin React), `docs/TESTING.md` (gates),
`docs/MODELO-DATOS.md` (almacén v2), `docs/MERCADOS-PROCEDENCIA.md` (procedencia),
`standalone/MARKET.md` (semántica del motor de mercado).

## Las tres capas

```
data/*.json  +  data/MANIFEST.json          ← generado por tools/build-datos-juego.py
   │  (CMaNGOS classic-db GPL-3.0 + tablas del cliente; LICENSE-DATA.md)
   │
   └──► desktop/src/datos.js  (importa 7 JSON crudo: items, clases, profesiones,
                               zonas, misiones, dungeons, personaje)

standalone/   ← capa MOTOR compartida (market*.js, guías curadas, drop-data)
   │
   ├──► desktop/src/mercado-logica.js, bridge.js, tsm.js, auctionator.js,
   │    almacen.js, datos.js   (importan el motor)
   └──► tests/ y standalone/tests/*.cjs     (cubertura del motor)

desktop/src/  ← plugin React (vistas/, almacén v2, sondeo 30 s, puente, TSM,
               `legado.js` = limpieza de claves de storage heredadas)
   └──► desktop/build.mjs ──▶ desktop/plugin.js  (bundle ESM legible, ~6,7 MB)
```

**Dato clave:** el bundle Desktop inlinea `data/*.json` **crudo** (vía `datos.js`)
y el motor de `standalone/`. El antiguo catálogo pre-construido
(`standalone/market-catalog.js` + `tools/build-catalogo-mercado.py`) era exclusivo
de la app `file://` y se retiró con ella: Desktop construye el catálogo en runtime
con `catalogoMercado()` (`desktop/src/mercado-logica.js`) sobre `data/` cruda.

## Grafo verificado: `desktop/src/` → `standalone/`

| Módulo `desktop/src/` | Importa de `standalone/` |
|---|---|
| `datos.js` | `drop-data.js`, `guide-hunter.js`, `guide-legacy.js` (+ 7 `data/*.json`) |
| `mercado-logica.js` | `market.js`, `market-history.js`, `market-deals.js`, `market-chart.js`, `market-farm.js`, `market-identity.js`, `market-source.js`, `market-compare.js` |
| `bridge.js`, `tsm.js` | `market.js` (parser) |
| `auctionator.js`, `almacen.js` | `market-identity.js`, `market-history.js` |

`market-history.js` es el **núcleo del motor** (lo importan `almacen.js`,
`mercado-logica.js`, 7 suites de `tests/` y los `.cjs` de standalone). `market-identity.js`
es el segundo más compartido (3 módulos desktop + 9 tests). `market.js` es el parser
Auctionator/TSM/puente.

## Clasificación de `standalone/`

### MOTOR COMPARTIDO — los módulos que el bundle Desktop inlinea

`market.js` · `market-history.js` · `market-identity.js` · `market-source.js` ·
`market-compare.js` · `market-deals.js` · `market-farm.js` · `market-chart.js` ·
`drop-data.js` · `guide-hunter.js` · `guide-legacy.js`

Son la lógica de mercado reutilizable + datos generados/curados. `desktop/src/` los
importa; `tests/` los cubre. **No son código muerto.**

### DATOS CURADOS EN REVISIÓN — 2 módulos (solo `tests/ruta-logica.test.mjs`)

| Módulo | Rol | Estado |
|---|---|---|
| `guide-shaman.js`, `guide-warrior.js` | Guías curadas de Chamán/Guerrero | **Retiradas del Desktop en 2.0.0** (`datos.js:17-22`): nombraban ítems/misiones/jefes/razas inexistentes (`tools/auditar-curado.mjs` lo detectó). Esas clases usan solo datos generados en Desktop. Siguen como fixture de `tests/ruta-logica.test.mjs`. Pendientes de reescritura auditada o retiro. |

`GUIAS = { 3: GUIDE_HUNTER }` en `datos.js`: solo Cazador (id de clase 3) tiene capa
curada activa en Desktop. Toda guía nueva debe pasar `tests/curado-datos.test.mjs`.

### RETIRADO (Fase 5 del plan de orden)

- `index.html` + `market-ui.js`: la app standalone `file://` + IndexedDB, reemplazada
  por las vistas React del plugin Desktop.
- `market-catalog.js` + `tools/build-catalogo-mercado.py` + `tests/test_datos.py::
  test_catalogo_reproducible`: catálogo pre-construido exclusivo de esa app.
- `standalone/tests/*.mjs` (6 suites Playwright de la app) + `tests/README.md`.
  Se conservan los `.cjs` del motor (cobertura única, ahora en el runner canónico).

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
  esbuild y la medición de carga son la Fase 4 del plan de orden.

## Por qué `standalone/` NO se renombra a `engine/`

El nombre `standalone/` es histórico: nació como app independiente y hoy es la capa
motor compartida. Renombrarlo a `engine/` tocaría **~30+ rutas de import** en
`desktop/src/`, `tests/` y los generadores, más la doc — alto riesgo de rotura para
beneficio cosmético. **Decisión: mantener `standalone/`** (documentado aquí y en
`docs/DESKTOP.md`). Si algún día se separan los datos curados en revisión
(`guide-shaman/warrior`) del motor, recién ahí tendría sentido una reorganización —
como cambio estructural propio, con gates y OK del usuario.
