# Stack de tests canónico — WoW Forever

Cuatro harnesses conviven en el repo. Este documento define cuál es el **stack
canónico** (el que corre el runner único y el que hay que mantener verde), qué
cubre cada uno, y el estado del harness legado de `standalone/`.

## Runner único

```sh
node scripts/run-gates.mjs               # todo, reporta conteos, exit 0/1
node scripts/run-gates.mjs --keep-going  # no corta al primer fallo
```

Corre los gates canónicos en orden, parsea los conteos y los compara con los
esperados. Si un conteo difiere (p. ej. se añadieron tests), lo marca como fallo
aunque los tests pasen: hay que actualizar `EXPECT_*` en el runner a propósito.
No escribe artefactos persistentes salvo el build (`desktop/plugin.js`, que sale
byte-idéntico si no hay cambios en `desktop/src/`).

## Gates canónicos y conteos esperados

| Harness | Comando | Esperado | Qué cubre |
|---|---|---|---|
| `tests/` (node) | `node --test tests/` | **372** pass, 0 fail | lógica de `desktop/src/` + motor: mercado v2/atómico/sync/migración, puente (`bridge*.test.mjs`), TSM, ROI, ruta/maxeo, guía, perfil, recetas propias, niveles de oficio, personaje SimC (`simc.test.mjs`), escala Pawn (`pawn.test.mjs`), catálogo de stats de ítems y equipo por slot (`item-stats.test.mjs`), puntuador Subasta × Pawn (`subasta-pawn.test.mjs`), unificación de etiquetas de reino y presupuesto del histórico (`market-reino-unificado.test.mjs`), techos del parser Lua (`parser-limites.test.mjs`), preguntar-davi, referencias-skill, claves heredadas |
| `tests/` (python) | `python3 -m unittest discover -s tests` | **98** OK | datos (`test_datos`, catálogo reproducible), desktop (`test_desktop`), maxeo, ROI, skill (`consultar.py`), reproducibilidad de `data/`+drops+bundle |
| `addon/tests/` (lua) | `lua5.1 addon/tests/test_bridge.lua` | **180** checks, 0 fallos | diario del puente WoWForeverBridge (captura, poda, retención, epoch) + captura SimC de `Personaje.lua` (eventos, `/wfbp`, `personagemErro`, conservación del export bueno) + captura Pawn de `Pawn.lua` (escala por ClassID/SpecID, pesos, `equipo.ilvl`, `pawnErro`, `/wfbpawn`, wrapper `/wfbp pawn`, captura final en `PLAYER_LEAVING_WORLD`, silencio cuando Pawn ya desinicializó sus proveedores, reintento acotado del equipo) + cosecha del catálogo de stats (`idsDaFonte`, lote por frames, cursor/vuelta, poda) |
| `desktop/test/` (navegador) | 14 suites, ver abajo | **434** checks, red 0, errores 0 | bundle real en Chromium headless con dobles del SDK |
| build | `cd desktop && node build.mjs` | OK | bundle esbuild reproducible |
| bundle-check | `python3 scripts/check_desktop_bundle.py desktop/plugin.js` | OK | tamaño/líneas/contratos del bundle |

### Suites navegador (434; 435 con `HERMES_SDK_TABS=1`)

`navegador 67 · mercado-auto 14 · mercado-procedencia 24 · tsm 38 · vista-mercado 57 ·
vista-davi 50 · vista-guia 28 · vista-profesiones 41 · vista-ruta-dungeons 31 ·
vista-personaje-simc 11 · vista-pawn 15 · vista-subasta-pawn 28 · bridge 19 · farm-routing 11`

Cada suite imprime al final una línea JSON `{"suite":…,"pasadas":N,"red":0,"errores":0}`.
El arnés (`desktop/test/arnes.mjs`) carga `desktop/plugin.js` en un Chromium headless
con dobles de `ctx.files`/`ctx.storage`/`ctx.ui` que **replican el tope real del host**
(`writeText` ≤ 4 MiB UTF-8 **por archivo**, `electron/plugin-files-ops.ts`). Los archivos
del SDK viven en un mapa aparte del `localStorage` de preferencias; la reapertura recibe
ambos estados. `red` cuenta requests de red
(debe ser 0: el plugin no tiene red) y `errores` errores de página/consola.

Entorno (el runner lo autodescubre; también se puede fijar a mano):

```sh
export PLAYWRIGHT_MODULE=/home/gris96/.hermes/hermes-agent/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/index.mjs
export CHROMIUM_PATH=/home/gris96/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome
node desktop/test/<suite>.mjs
```

React/ReactDOM/esbuild se **prestan** del checkout de Hermes (`~/.hermes/hermes-agent`)
vía symlinks en `desktop/node_modules`; no están en el `package.json` del repo y el
store pnpm no es transitivo. Si el arnés no arranca, recrear esos symlinks (ver
`docs/DESKTOP.md`). Los gates de navegador no requieren instalar nada en el repo.

## Tests del motor en `standalone/tests/` (gate `node motor .cjs`)

`standalone/` es la **capa motor** compartida (`market.js`, `market-history.js`, …)
que `desktop/src/` importa. Sus tests unitarios `.cjs` (`node:test`) cubren el motor
de forma **única** (parser/deals/chart) y **sí entran al runner canónico**:

- `market.cjs`, `market-history.cjs`, `market-deals.cjs`, `market-chart.cjs`, `market-farm.cjs`: 116 tests,
  114 pass / 2 skipped.
- **Retirados** (Fase 5 del plan de orden): la app standalone legada `index.html` +
  `market-ui.js` + `market-catalog.js` + sus 6 suites Playwright `.mjs` (reemplazada
  por las vistas React del Desktop). También antes (Fase 2): `desktop-state.mjs`
  (importaba `../desktop/state.mjs` inexistente → `ERR_MODULE_NOT_FOUND`).

### Privacidad: «real fixture» de los `.cjs` neutralizado (stat-only + opt-in)

`market.cjs`, `market-history.cjs` y `market-chart.cjs` buscaban y **leían el
contenido** de `Auctionator.lua` bajo
`~/Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_forever_/WTF` si ese
árbol existe, lo que violaba el contrato de privacidad del proyecto (**solo stat**:
existencia/mtime/bytes; nunca contenido ni nombres/rutas de cuenta).

**Resuelto:** las tres secciones ahora hacen solo `statSync` (bytes) por defecto y se
marcan `skipped`. La validación de contenido contra el archivo real sigue disponible
como diagnóstico manual opt-in:

```bash
WOW_FOREVER_REAL_FIXTURE=1 node --test standalone/tests/market.cjs
```

Por eso el runner canónico **sí ejecuta** los `.cjs` (sin la variable: jamás leen
SavedVariables). El stack canónico (`tests/`, `desktop/test/`) usa fixtures sintéticos
y dobles de la carpeta concedida.

## Reproducibilidad

- `tests/test_reproducible.py`: regenera `data/` + `drop-data.js` desde las entradas
  fijadas en `~/.cache/wow-forever-drops` y compara hashes/MANIFEST. Se salta si faltan
  esas entradas. Usa un temp bajo `.workshop/tmp/` y **lo limpia al terminar**
  (`tearDownClass`), para no acumular artefactos corrida tras corrida.
- `tests/test_desktop.py::test_build_reproducible`: `node build.mjs --out TMP` y compara
  byte a byte con `desktop/plugin.js`. **Falla si `desktop/src/` tiene WIP sin commitear**
  (el bundle commiteado no coincide con el fuente): commitear o terminar el WIP antes.

## Contratos que los tests protegen (no romper)

- Respaldo pre-v2 **troceado ≤ 3 MiB + manifiesto**; `readBackupDoc`/`commitV2`/
  `rollbackToBackup`. Los dobles de `desktop/test/` y `tests/` **replican el tope de
  4 MiB** de `writeText` del host; un doble sin ese tope enmascara el bug de truncado.
- Diario del puente (una entrada por día, sobrevive la poda de Auctionator).
- Procedencia **UNKNOWN** del puente = diseño (transporte, no exportador verificado).
