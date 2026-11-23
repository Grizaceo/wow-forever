# CI reproducible

`.github/workflows/ci.yml` corre en `push`, `pull_request` y `workflow_dispatch`.
Permisos: `contents: read` (sin secretos ni credenciales de juego).

## Jobs

| Job | OS | Qué ejecuta |
|---|---|---|
| `tests` | ubuntu, macos, windows | `npm ci` en `desktop/`; `node --test tests/`; los seis `standalone/tests/*.cjs`; `python -m unittest discover -s tests`; build del bundle y `check_desktop_bundle.py` |
| `gates-linux` | ubuntu | lo anterior **más** Lua (`lua5.1`) y las 15 suites Chromium de `desktop/test/`, a través de `node scripts/run-gates.mjs --keep-going` |

Node 22 y Python 3.12 fijados con `actions/setup-*`. Versiones de npm fijadas en
`desktop/package-lock.json`: esbuild 0.28.2, Playwright 1.64.0, React/ReactDOM
19.3.0. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` evita descargas duplicadas durante
`npm ci`; el job de gates instala Chromium con `npx playwright install --with-deps chromium`.

## Reproducir en local

```sh
cd desktop && npm ci && npx playwright install chromium && cd ..
node scripts/run-gates.mjs --keep-going
```

Sin Chromium/Lua solo los gates portables:

```sh
cd desktop && npm ci && cd ..
node --test tests/
node --test standalone/tests/market.cjs standalone/tests/market-history.cjs \
  standalone/tests/market-deals.cjs standalone/tests/market-chart.cjs \
  standalone/tests/market-farm.cjs standalone/tests/market-farm-routing.cjs
python3 -m unittest discover -s tests
cd desktop && npm run build && cd ..
python3 scripts/check_desktop_bundle.py desktop/plugin.js
```

## Diseño y límites

- **Sin rutas privadas**: ni el runner ni el arnés buscan dependencias en
  `~/.hermes` ni browsers en `~/.cache/ms-playwright`. Todo se resuelve desde
  `desktop/node_modules` gracias al lock.
- **Overrides conservados**: `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` y
  `HERMES_DESKTOP_PKG` siguen funcionando para apuntar a otra instalación.
- **Sin fixtures privados**: `WOW_FOREVER_REAL_FIXTURE` nunca se define en CI;
  los tests de SavedVariables reales quedan en modo stat-only/skip.
  `HERMES_AGENT_DIR` y `~/.cache/wow-forever-drops` solo habilitan tests
  adicionales si están presentes; su ausencia no falla el workflow.
- **Conteos canónicos** (`EXPECT_*` en `scripts/run-gates.mjs`) detectan tests
  que desaparecen o se saltan. Defaults sincronizados con el árbol vivo: node
  381, python 98, lua 180, `.cjs` 123, navegador 419. Para ramas con tests nuevos
  aún no versionados existen `WOW_GATES_EXPECT_{NODE,PY,LUA,CJS}=N`; CI **no** los
  define. Si se añaden suites o tests, actualizarlos a la vez que `docs/TESTING.md`.
- `desktop/test/tab-performance.mjs` está integrado en `BROWSER`: comprueba
  navegación, estado, fidelidad del sprite y medianas con umbrales de regresión.
- No se publican artefactos, no se hace `git push` y el build se ejecuta sobre
  el workspace efímero del job; `desktop/plugin.js` versionado no se toca en remoto.
