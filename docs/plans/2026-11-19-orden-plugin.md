# Plan de orden del plugin WoW Forever

Fecha: 2026-11-19 · Autor: DAVI · Estado: **Fase 0 (auditoría) completa — pendiente visto bueno**.
Repo: `~/wow-forever` · HEAD `90b6e5e` (limpio, ahead 13 de origin/main) · Deploy byte-idéntico (`sha256 dad16865…`).

> Método: auditoría primero, ejecución por fases con OK explícito, una causa por commit,
> gates completos tras cada fase, nada destructivo sin consulta. Este documento es el
> deliverable de Fase 0; no ejecuta refactor ni borrado.

---

## 0. Baseline verificado (evidencia real, no asumida)

### Gates — todos VERDES antes de tocar nada

| Gate | Comando | Resultado |
|---|---|---|
| Node | `node --test tests/` | **261 pass, 0 fail** |
| Python | `python3 -m unittest discover -s tests` | **87 OK** |
| Lua | `lua addon/tests/test_bridge.lua` | **52 checks, 0 fallos** |
| Navegador (10 suites) | `node desktop/test/<suite>.mjs` | **307 checks, red 0, errores 0** |
| Build | `cd desktop && node build.mjs` | OK |
| Bundle check | `python3 scripts/check_desktop_bundle.py` | OK (6,745,191 B) |

Desglose navegador: navegador 34 · mercado-auto 11 · mercado-procedencia 24 · tsm 28 ·
vista-mercado 55 · vista-davi 50 · vista-guia 28 · vista-profesiones 27 · vista-ruta-dungeons 31 · bridge 19 = **307**.

### Bundle: composición REAL (metafile esbuild con las opciones exactas de `build.mjs`)

- `desktop/plugin.js`: **6,745,191 B, SIN MINIFICAR por diseño**.
  - `desktop/build.mjs:24` `minify:false`, `:28` `lineLimit:200`, `:23` `target:es2020`, `:29` `charset:utf8`.
  - Gate `tests/test_desktop.py::test_legible` (líneas 62–73): exige >2000 líneas y rechaza
    líneas de **código** >400 chars (los datos generados van como strings y están exentos).
    **Minificar rompe este gate.**
- Composición (`bytesInOutput`, total 6,741,538):

| Capa | Bytes | % |
|---|---|---|
| **data/ JSON inline** | 4,055,861 | **60.2 %** |
| **standalone/** | 2,166,585 | **32.1 %** |
| desktop/src/vistas | 313,192 | 4.6 % |
| desktop/src (resto) | 158,849 | 2.4 % |
| desktop/src/vistas/profesiones | 30,387 | 0.5 % |
| src/ raíz (motor) | 16,664 | 0.2 % |

  - data/: items.json **2,328,275** · profesiones.json 773,703 · misiones.json 705,181 ·
    clases.json 149,623 · dungeons.json 81,770 · zonas.json 13,687 · personaje.json 3,622.
  - standalone/: **drop-data.js 1,937,933** · market-farm.js 63,606 · guide-hunter.js 43,625 ·
    market-history.js 32,425 · market.js 26,954 · guide-legacy.js 21,712 · resto.
  - **≈92 % del bundle es DATOS estáticos; el código es ~7.7 %.**
- Restricción del host: `scripts/check_desktop_bundle.py` replica `runtime-loader.ts`:
  solo imports a `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`, `react/jsx-dev-runtime`;
  **prohíbe `import()` dinámico, `eval(`, `new Function`**. → No hay code-splitting en chunks
  fetchables; los datos deben ir inline.

### Tiempo de carga baseline (arnés headless, 3 corridas, perfil Cazador Horda)

- `iniciar()` (build IIFE + launch Chromium): **1540 ms**.
- `abrir()` (contexto + goto + seed + eval bundle + mount React + esperar tab):
  **mediana 3085 ms** (3461 / 3070 / 3085).
- Métrica proxy reproducible; el delta antes/después bajo el mismo arnés es significativo.
  Protocolo: wrapper con `iniciar / abrir×3 / terminar`; `DESKTOP_PLUGIN` apunta al bundle
  instalado para la verificación post-deploy.

### Datos vivos (solo agregados, namespace legacy `wow-hunter-guide`)

- Almacén **v2 ACTIVO**: `market-v2-pointer='b'`; `market-v2-b.json` schemaVersion 2, reino PvP,
  1 realm, **7300 ítems**. `price-history-pointer='b'`; history.v 2, 1 scope,
  **7300 ítems / 57,863 filas**, días **2026-11-09 → 11-19**.
- **v1 RETENIDO** (pre-migración, para rollback): market-a/b.json (825 KB c/u),
  price-history-a/b.json (2.7 MB c/u).
- **Respaldo pre-v2**: `pre-v2-backup.json` **5,245,766 B** (formato `wow-forever/pre-v2-backup`,
  1 parte). El contrato troceado (>4 MiB → partes ≤4 MiB + manifiesto) está implementado en
  `desktop/src/almacen.js` y testeado en node.
- Procedencia **UNKNOWN por diseño** (puente = transporte, no exportador verificado). **No es bug.**
- Grant fósil Windows **`auction-path` PRESENTE** en storage vivo; **0 referencias en código**
  (rg repo + addon). Inerte.
- Namespace `wow-hunter-guide` es **intencional** (`desktop/src/plugin.src.jsx:7–8`: el host
  guarda datos/grants por id interno; renombrar los perdería). El README también lo documenta.

### Higiene ya ejecutada (riesgo cero, autorizada por el brief)

- Borrados `.workshop/tmp/repro-*` (12 dirs, ~145 MB) + `__pycache__` (tests/tools/skills).
  No trackeados. `.workshop` 2.5 MB → 8 KB.
- **Leak detectado**: `tests/test_reproducible.py:33` usa `tempfile.mkdtemp` sin cleanup →
  regenera los `repro-*` en cada corrida. Fix pendiente (test-only, riesgo bajo).

---

## 1. Veredicto por deuda del brief (evidencia archivo:línea)

### Deuda 1 — `standalone/` (2.8 MB): NO es cementerio, es capa motor VIVA
- `desktop/src/mercado-logica.js:6,8,9` importa `market.js`, `market-deals.js`, `market-chart.js`;
  `datos.js`, `guia-logica.js`, `ruta-logica.js` y vistas/{dungeons,guia,legacy,mercado/grafico,ruta}.jsx
  importan de `standalone/`. metafile: standalone = **32.1 % del bundle**.
- `market-history.js` es el motor compartido (importado por 8+ tests, bridge-sync, mercado-auto).
- **Decisión recomendada: DOCUMENTAR como capa engine; NO renombrar a `engine/` en esta sesión.**
  Renombrar toca 40+ archivos, tests, tools, docs y el build (`resolveDir`); movimiento estructural
  de alto riesgo y beneficio cosmético. Si se quiere, fase separada con aliases de compatibilidad
  + gates completos. **Nada aquí es borrable.**

### Deuda 2 — `legacy.jsx`: MONTADO y USABLE. NO está muerto
- `desktop/src/app.jsx:23` import VistaLegacy; `:34` PESTANAS incluye
  `{id:'legacy', et:'Legacy', Comp:VistaLegacy}` **sin condición**; `:91` se monta siempre.
  La suite navegador verifica que la pestaña legacy se pinta.
- **Discrepancia con el brief ("si está muerto, retirarlo"): está vivo. No retirar.**
  (23,048 B en bundle, 0.34 %.)

### Deuda 3 — Bundle 6.75 MB: el peso es DATOS (92 %), no código; unminified por diseño
- Minificar rompe `test_legible`. Code-splitting prohibido por el host. Opciones reales:
  - **(a) Documentar el rationale** (offline, single-file, todas las clases, datos inline) y cerrar
    como *by-design* si el load-time (~3.1 s) es aceptable.
  - **(b) Reducir redundancia de datos** con evidencia: solapamiento items.json ↔ drop-data.js
    (nombres/IDs duplicados), campos de items.json no consumidos por la UI. Solo con prueba de
    uso cero. Riesgo medio.
  - **(c) Compresión inline** (gzip/base64 + `DecompressionStream` en runtime, sin `import()`):
    podría bajar ~6 MB de datos a ~1.5–2 MB. Cambio **arquitectónico** (carga async, ripple en
    `datos.js` y consumidores); fase separada + OK explícito + gates legible/reproducible/load-time.
- **Recomendación: medir y documentar (a); investigar (b) con evidencia; (c) solo como spike
  futuro con OK. No hay "minify y listo".** Ningún cambio de comportamiento mezclado con
  movimiento estructural en el mismo commit.

### Deuda 4 — v1/v2 coexistencia + grant fósil
- v1 retenido para rollback (`almacen.js` `rollbackToBackup` / `readBackupDoc`).
  **NO retirar v1 ahora.** Documentar ciclo de vida y condición de retiro (p.ej. tras N días de
  v2 estable + backup verificado + OK usuario).
- `auction-path`: inerte (0 refs). Limpieza **OPCIONAL** de la clave en storage vivo — requiere
  OK (toca datos del usuario, aunque sea un grant muerto). No es código.

### Deuda 5 — Cuatro harnesses → runner único + doc stack
- Harnesses: (1) `tests/` node 28 `.mjs` (261) + python 6 `.py` (87); (2) `desktop/test/`
  10 suites navegador (307) + `arnes.mjs`; (3) `standalone/tests/` 4 `.cjs` node + 7 `.mjs`
  navegador (app standalone) + `desktop-state.mjs` **ROTO**; (4) `addon/tests/test_bridge.lua` (52).
- **`standalone/tests/desktop-state.mjs` SOBRA**: importa `../desktop/state.mjs` INEXISTENTE →
  `ERR_MODULE_NOT_FOUND` (verificado ejecutándolo). Reemplazado por `tests/market-atomic.test.mjs`
  + `tests/market-storage-v2.test.mjs` (almacén v2, tope 4 MiB, respaldo troceado, rollback).
  Retiro seguro con evidencia.
- **`standalone/tests/*.cjs` NO son redundantes**: son los ÚNICOS tests unitarios directos de
  `market.js` (core), `market-deals.js`, `market-chart.js`. Los `tests/*.test.mjs` cubren
  market-history/identity/compare/source, no esos tres. Consumidos por `desktop/src/mercado-logica.js`.
  **Mantener** (o migrar a `tests/` ESM preservando cobertura). El runner debe invocarlos.
- **Tope 4 MiB en dobles**: SÍ replicado en node (`market-atomic.test.mjs:9`,
  `market-storage-v2.test.mjs:13–16`: writeText cap 4 MiB; prueban manifiesto troceado, partes
  ≤4 MiB, rollback, backup incompleto). El arnés navegador NO replica el tope, pero ninguna suite
  navegador escribe >4 MiB (el contrato troceado se verifica en node). Hardening opcional:
  añadir el tope al `arnes.mjs` writeText por fidelidad.
- **Runner único**: crear `scripts/run-gates.*` que corra todo con un comando y reporte conteo
  esperado vs real (261/87/52/307 + build + bundlecheck + `.cjs`). Documentar el stack canónico.

### Deuda 6 — Docs desalineados (verificado contra archivos actuales)
- **`README.md` / `README.es.md`**: NO mencionan el addon puente WoWForeverBridge, TSM
  Accounting.lua, sondeo automático 30 s, almacenamiento v2/respaldo troceado. La sección Market
  solo describe import manual de Auctionator. La sección Tests omite lua + standalone + la lista
  completa de suites. Drift bilingüe: estructuralmente paralelos (121/120 líneas), ambos stale
  por igual. **Actualizar ambos en sync.**
- **`plugin.json:6`** description: solo "imports your Auctionator prices" → añadir TSM + puente.
- **`docs/DESKTOP.md`** (162 líneas): headings Reglas / Estructura / Seguimiento Auctionator /
  TSM Mis ventas / Agregar sección; **0 hits puente/bridge**. Falta sección del puente + ciclo
  storage v1/v2/respaldo.
- **`docs/MERCADOS-PROCEDENCIA.md`** (49 líneas): documenta UNKNOWN, v2, trust gate, rollback
  2 pasos ✓; pero NO el respaldo **TROCEADO** (>4 MiB → partes + manifiesto) ni el puente como
  fuente diaria. Completar.
- **`docs/MODELO-DATOS.md`**: documenta el modelo de `data/` (correcto en su scope, **NO stale**).
  El storage runtime (v2/respaldo/puente) NO está documentado en ningún doc del repo — vive en la
  dev skill global. **FALTA**: doc de storage lifecycle en el repo (sección DESKTOP.md o STORAGE.md).
- **`docs/PROFESIONES-INTELIGENTES.md:186–193`**: "el histórico real en disco es v1, no v2" →
  **FALSO hoy** (v2 activo verificado). Ejemplos CLI (líneas 81, 86, 176, 216) usan
  `market-a.json` / `price-history-b.json` (v1 legacy). Actualizar a v2 + aclarar retención v1.
- **`standalone/MARKET.md`**: refs `build-desktop-plugin.py` (INEXISTENTE) +
  `~/.hermes/desktop-plugins/wow-hunter-guide/plugin.js` (legacy). Actualizar a `desktop/build.mjs`
  + wow-forever.
- **`standalone/tests/README.md`**: refs `catalog.py` (INEXISTENTE), playwright `dike-desk`
  (stale). Actualizar.
- **Skills**: repo `skills/wow-forever/SKILL.md` == agent-half
  `~/.hermes/plugins/wow-forever/skills/wow-forever/SKILL.md` (idénticos, 13,615 B, sha igual).
  La gameplay skill **NO documenta el puente** (0 hits; el puente está en la dev skill global).
  La dev skill global `wow-forever-local-data` tiene secciones legacy (repo wow-hunter-guide,
  build-desktop-plugin.py) + "242 tests" stale. **Reconciliar**: actualizar gameplay (puente + v2),
  scopar legacy en dev skill, fijar conteos reales (261/87/52/307). Sin duplicar lecciones.

### Deuda 7 — Naming `wow-hunter-guide` vs `wow-forever`: INTENCIONAL, no renombrar
- `plugin.src.jsx:7–8` lo explica: el host guarda datos/grants por id interno; renombrar perdería
  progreso/precios/grant. El README también lo documenta (carryover).
- Renombrar toca data dir, grants.json, claves de storage (market-v2-*, perfil, build, etc.).
  **Solo proponer con plan de migración; NO ejecutar sin OK explícito.** Recomendación: documentar
  y dejar (costo/beneficio no justifica la migración en esta sesión).

### Deuda 8 — Higiene local: hecha + fix leak
- Caches borrados (arriba). `.gitignore` ya excluye `*.private.js`, `.workshop/`, `__pycache__`
  → **no aflojar**.
- Fix `test_reproducible.py` mkdtemp leak (TemporaryDirectory context manager o addCleanup).
  Test-only, riesgo bajo.

---

## 2. Clasificación SOBRA / MERGE / FALTA

### SOBRA (retiro propuesto CON evidencia; nada por intuición)

| Ítem | Evidencia | Acción | Riesgo |
|---|---|---|---|
| `standalone/tests/desktop-state.mjs` | importa `desktop/state.mjs` inexistente → ERR_MODULE_NOT_FOUND; reemplazado por market-atomic/market-storage-v2 | borrar (tracked) | bajo |
| `.workshop/tmp/repro-*` | mkdtemp leak, no trackeados | ya borrado + fix test | bajo |
| grant `auction-path` (storage vivo) | 0 refs código, presente en LevelDB | limpiar clave (OPCIONAL, OK usuario) | bajo |
| `standalone/index.html` + 7 browser tests + `guide-shaman/warrior.js` | superficie web legacy; desktop la supersede; guide-shaman/warrior aún usados por `index.html:473–474` y `tests/ruta-logica.test.mjs:275–276` (**NO muertos globalmente**) | VERIFICAR solapamiento con desktop/test/vista-* y que las suites standalone pasan; retiro CONDICIONAL con OK | medio |

### MERGE / CONSOLIDAR
- 4 harnesses → `scripts/run-gates.*` único + doc del stack canónico.
- `standalone/tests/*.cjs`: mantener (cobertura única de market/deals/chart) o migrar a `tests/` ESM.
- Skills gameplay (repo + agent-half) y dev (global): reconciliar sin duplicar lecciones.

### FALTA
- Doc puente + storage v2/respaldo troceado en el repo (README, DESKTOP.md, MERCADOS-PROCEDENCIA.md, plugin.json).
- Corregir PROFESIONES-INTELIGENTES.md (v1→v2), standalone/MARKET.md, standalone/tests/README.md (refs muertas).
- Runner único de gates.
- Fix leak `test_reproducible.py`.
- (Opcional) tope 4 MiB en arnés navegador por fidelidad.
- (Opcional, con OK) reducción de redundancia de datos / compresión inline.

---

## 3. Fases propuestas (una causa por commit, gates completos tras cada fase)

**Fase 1 — Docs (riesgo BAJO).** Actualizar README.md/es (puente, TSM, 30 s, v2/respaldo, stack
tests), plugin.json description, DESKTOP.md (sección puente + storage lifecycle),
MERCADOS-PROCEDENCIA.md (troceado + puente fuente), PROFESIONES-INTELIGENTES.md (v2 activo),
standalone/MARKET.md + standalone/tests/README.md (refs muertas). Reconciliar skills gameplay+dev.
Commits `docs:` por grupo. Gates: python (test_skill/referencias/curado), node, build+bundlecheck.

**Fase 2 — Harness (riesgo BAJO-MEDIO).** Crear `scripts/run-gates.*` (runner único, reporte
conteo esperado). Borrar `desktop-state.mjs` (evidencia fallo). Fix leak `test_reproducible.py`.
Decidir `.cjs` (migrar a tests/ o invocar desde runner). Commits `chore:`/`fix:`/`test:`.
Gates: TODOS + runner reporta 261/87/52/307 verdes.

**Fase 3 — Motor doc (riesgo BAJO).** Documentar `standalone/` como capa engine (README
"How it works" + DESKTOP.md estructura + nota de arquitectura). **SIN renombrar.** Commit `docs:`.
Gates: build + python + node.

**Fase 4 — Bundle (riesgo MEDIO-ALTO, OPCIONAL, requiere OK del enfoque).** Load-time baseline
hecho (3085 ms). Investigar redundancia items.json ↔ drop-data.js y campos no consumidos
(evidencia de uso cero). Proponer reducción segura O spike de compresión inline. NINGÚN cambio
de comportamiento en el mismo commit que movimiento estructural. Gates completos + test_legible
+ test_build_reproducible + load-time antes/después. Solo si Cristóbal aprueba el enfoque; si no,
cerrar deuda 3 como *by-design* documentado.

**Fase 5 — Limpieza condicional (riesgo BAJO-MEDIO, OPCIONAL, requiere OK).** Grant
`auction-path` (storage vivo). Retiro standalone legacy app+tests+guide-shaman/warrior SI se
verifica superseded y solapamiento cubierto. Commits `chore:`. Gates completos. Deploy si toca código.

**Deploy (al cerrar fases de código aprobadas: 2, 4, 5).** Backup del directorio instalado →
copia → sha256 byte-idéntico → suite bridge contra bundle instalado
(`DESKTOP_PLUGIN=~/.hermes/desktop-plugins/wow-forever/plugin.js node desktop/test/bridge.mjs`)
→ verificación en vivo por data dir (solo agregados: revision, conteos, rango de días).

---

## 4. Lo que NO se hace (límites)
- No minificar sin OK explícito para cambiar el gate `test_legible`.
- No renombrar `standalone/`→`engine/` ni el namespace `wow-hunter-guide` (movimientos grandes
  sin beneficio funcional; migración de namespace solo con plan + OK).
- No retirar v1 (rollback depende).
- No tocar contratos: respaldo troceado (`readBackupDoc`/`commitV2`/`rollbackToBackup`), diario
  del puente, procedencia UNKNOWN, topes del host replicados en los dobles.
- No push sin autorización explícita. No tocar núcleo Hermes ni otros perfiles. No GUIs en
  monitor ASUS (DP-1, ws 1). No leer contenido de SavedVariables (solo stat). No features nuevas.
- No borrar por intuición: todo retiro con evidencia de uso cero + OK.

## 5. Prioridad recomendada
1. **Fases 1–3** (docs + harness + motor doc): cierran la mayor parte de la deuda con riesgo
   bajo y gates verdes.
2. **Fase 4** (bundle): solo si el load-time o el tamaño se consideran problema; enfoque a aprobar.
3. **Fase 5** (limpieza condicional): opcional, con OK por tocar storage vivo / borrar tracked.

Informe final: gates antes/después, tamaños antes/después, lista de commits, deudas abiertas y
por qué. Actualizar la skill `wow-forever-local-data` con las lecciones (no log de la sesión).


---

## 6. Cierre de Fases 1–3 (2026-11-19) — EJECUTADO Y VERDE

**Estado:** Fases 1–3 (aprobadas) completas. **10 commits locales**, ahead 23, árbol limpio,
**sin push**. Bundle **byte-idéntico** al deploy (`dad16865…`, 6.745.191 B) → **sin deploy**
(ninguna fase tocó `desktop/src/`). Gates verificados **2× con el runner único nuevo**
(`node scripts/run-gates.mjs` → **16/16**, exit 0).

| Gate | Baseline Fase 0 | Tras Fases 1–3 |
|---|---|---|
| node --test tests/ | 261 / 0 fail | 261 ✓ |
| python3 -m unittest | 87 OK | 87 ✓ |
| lua test_bridge.lua | 52 / 0 | 52 ✓ |
| 10 suites navegador | 307 (red 0, err 0) | 307 ✓ |
| build + bundle-check | OK · 6.745.191 B | OK · 6.745.191 B ✓ |

Load-time baseline (Fase 0): **3085 ms**. `.workshop/tmp`: **0 B** tras el fix del leak.

**Commits:** Fase 0 `b163e02` (plan) · Fase 1 `986c481` `3d94de0` `2e6b49a` `05962cc` `1dacab0`
(docs + skill repo) · Fase 2 `6362969` (retiro desktop-state roto) `84ffcfc` (fix leak tearDownClass)
`01bbce5` (runner + docs/TESTING.md) · Fase 3 `4e092aa` (docs/ARQUITECTURA.md + punteros README).

**Deudas cerradas con evidencia:** 1 (standalone = motor 11 módulos + app legada 4, documentado,
NO renombrado) · 2 (legacy.jsx VIVO en app.jsx:34, no se retira) · 5 (stack canónico + runner único) ·
6 (docs bilingües alineados + skill global `wow-forever-local-data` **v1.5.0** sin duplicar) ·
8 (higiene caches + leak fix; .gitignore intacto).

### ⚠️ Incidente de privacidad (Fase 0) — reconocido y mitigado
En la investigación baseline (~21:17) se ejecutaron `standalone/tests/*.cjs`; su «real fixture»
(`market.cjs:420`, `market-history.cjs:410`) hace `readFileSync`+`parseAuctionator` sobre
`Auctionator.lua` VIVO del WTF concedido → **violó el límite stat-only**. Solo se loguearon
agregados (conteos/bytes/rango días/estadísticos de muestra), sin nombres de cuenta/personaje ni
contenido crudo. **Correctivo:** runner canónico los EXCLUYE; documentado en docs/TESTING.md +
skill global; artefactos (`cjs-*.log`, `leveldb.txt`) borrados de scratch. No se repitió en Fases 1–3.
**Fix permanente (neutralizar real-fixture → stat-only/sintético) PENDIENTE de OK** (cambio de código de test).

### Deudas abiertas (requieren OK explícito)
- **Fase 4 · Bundle (deuda 3):** ~92 % datos (data/*.json ~60 % + drop-data.js ~29 %), código ~7,7 %.
  `minify:false` deliberado (gate test_legible ≤400 chars/línea); host prohíbe `import()` dinámico →
  sin code-splitting. Margen limitado sin cambio de comportamiento; enfoque a aprobar o cerrar *by-design*.
- **Fase 5 · Limpieza condicional:** grant fósil `auction-path` (0 refs, muerto) en grants.json;
  retiro app standalone legada (index.html+market-ui.js+market-catalog.js); **neutralizar real-fixture .cjs**.
- **Deuda 7 · Namespace wow-hunter-guide→wow-forever:** intencional (compatibilidad). Renombrar toca
  data dir+grants+storage → solo plan de migración + OK explícito, NO ejecutado.

**Skill global actualizada:** `wow-forever-local-data` v1.5.0 (runner único, conteos 261/87/52/307,
standalone doble rol, ⚠️ privacidad .cjs, leak fix). Sin duplicar la sección de puente existente.

**Posición:** PARADO en espera del visto bueno de Cristóbal para Fases 4–5 y el fix de privacidad.
