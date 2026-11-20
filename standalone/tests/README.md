# Browser regression checks

The application is a standalone HTML entry point with local scripts, not the unrelated dike-desk workspace.
These tests use Node.js and Playwright with Chromium. They never open the game,
run `open.sh`, use your regular browser profile or make HTTP(S) requests.

## Run

If `playwright` is installed in this project's module search path:

```sh
node tests/browser.mjs
```

Otherwise point `PLAYWRIGHT_MODULE` at an existing Playwright ESM entry point.
Set `CHROMIUM_PATH` only when not using Playwright's default installed browser.
No dependencies are installed automatically.

Local environment used for the verified run:

```sh
PLAYWRIGHT_MODULE=/home/gris96/.hermes/hermes-agent/node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/index.mjs \
CHROMIUM_PATH=/home/gris96/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
REPORT_PATH=/home/gris96/.hermes/cache/scratch/wow-hunter-after-fixes-tests.json \
node tests/browser.mjs
```

`REPORT_PATH` is optional; its parent directory must exist. Failed assertions
or browser exceptions exit nonzero. Assertions cover all seven tabs at four
levels, persistence, item eligibility, inventory synchronization in both
directions, migration, macro spec compatibility, HTML escaping of imported pet
fields, snapshot round trips, preservation of subsequent edits, invalid input
and page-level overflow at 390px.

## Local market

No package installation is required for the parser, history, deals or chart tests:

```sh
node tests/market.cjs
node tests/market-history.cjs
node tests/market-deals.cjs
node tests/market-chart.cjs
# catálogo: tests/test_datos.py en la raíz (python3 -m unittest tests.test_datos)
```

The market browser harness uses the same `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`
and optional `REPORT_PATH` environment variables:

```sh
node tests/market-browser.mjs
```

It selects synthetic SavedVariables through the actual file input, parses in a
Blob Worker, persists to real IndexedDB, reloads, separates realms, checks copper
conversion, historical dates, unknown IDs, sourced-name lookup and level ranges.
It also exercises rejected executable/version-invalid input, previous-snapshot
preservation, an injected storage failure, cancellation/overlap, local deletion
and mobile layout. The cancellation test delays a Worker without returning a fake
parser result; the following import uses the real Worker again.

Fixtures are never installed in the game or stored in the user's browser profile.
Real-export checks are separate and must emit only aggregate counts, not raw
SavedVariables, account directory names or character data. See `../MARKET.md`.

`node tests/local-scan-browser.mjs` verifies the one-shot preload with synthetic
data: atomic marker/snapshot persistence, visible price, reload, later manual
imports, deliberate deletion, preservation of newer imports and storage abort.
It currently has eight passing checks. All three committed browser harnesses
override the private preload; real-preload verification is separate and offline.

`node tests/history-browser.mjs` verifies accumulated price history with
synthetic two-day imports: the merge keeps one growing series per item, the
persisted snapshot stays a small recent window, store-only items keep their
days, stats and the SVG price chart show in the detail view, reloads preserve
everything, re-imports are idempotent and clearing wipes both channels.

`node tests/deals-browser.mjs` verifies Phase 2 deal detection end to end:
synthetic multi-day imports produce oferta/caro badges vs the historical
median, the "Mejores ofertas" sort ranks deals first, the "Solo ofertas"
filter isolates them and the detail view shows the approx analysis — all
offline.

## Farm recommender and public build

`node tests/farm-browser.mjs` exercises the offline farm recommender in two
isolated Chromium contexts (same `PLAYWRIGHT_MODULE`/`CHROMIUM_PATH`/`REPORT_PATH`
variables): one with a synthetic RareScanner overlay (including an escaped
`<img onerror>` name probe) and one with the public dataset only. It covers the
drop dataset contract, matching stats, zone/mob indexes, per-zone spawn
counts, per-item metrics, faction and level eligibility, zone ranking with
rare/chest budgets and dataset-wide useful items, "Zona copada" persistence,
risk labels, progression, the market table farm column/filters/sorting, the
skinning toggle, per-item price sparklines + median-vs-today metrics in the
farm cards, and mobile overflow — all offline.

`node tests/public-build.mjs` está **vacío actualmente**: el split público/privado
del plugin fue retirado (build único `desktop/build.mjs`, sin `--public` ni
`market-local-scan.js`). El archivo quedó como placeholder, pendiente de retiro o
reimplementación.

## Scope

SimC fixtures are deliberately synthetic. Passing does not validate a real
Forever export, item stats, drop rates, in-game macros, a Hermes plugin or a
3D character renderer. Those require separate integration checks.
