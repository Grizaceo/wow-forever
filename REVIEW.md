# REVIEW — fase 2

## Qué hice

- `desktop/src/pawn.js` (nuevo, puro): `parsePawnScales` (catálogo `PawnCommon` de `SavedVariables/Pawn.lua` → `{versao, escalas:[{nome, localized, provider, classID, specID, role, temPesos, pesos?}], erros}`), `parsePawnCaptura` (normaliza `WoWForeverBridgeDB.pawn`, `null` si inválido), `escalaDoJogador` (captura > clase+spec > clase > null, con `motivo`, `candidatas`, `temPesos`), persistencia `ctx.storage['pawn']` + `['pawn-catalogo']` y `sincronizarPawn`/`sincronizarCatalogoPawn`.
- `addon/WoWForeverBridge/Pawn.lua` (nuevo, toc v1.2.0): captura en `PLAYER_ENTERING_WORLD`/`PLAYER_LOGOUT`/`PLAYER_QUITING` + `/wfbpawn` y `/wfbp pawn` (wrapper sobre `SlashCmdList['WOWFOREVERBRIDGE2']`); guarda `WoWForeverBridgeDB.pawn = {v, escala, localized, provider, classID, specID, pesos, equipo, candidatas, capturado, origem, truncado}` y `pawnErro` en fallo, sin borrar captura buena.
- `desktop/src/bridge.js`: `parseBridge` extrae `pawn` (vía `parsePawnCaptura`, inválido → `null`) y `pawnErro` (≤4096) del diario.
- `desktop/src/bridge-sync.js`: sincroniza `pawn`/`pawnErro` en cada ingesta y lee el `Pawn.lua` hermano del diario como catálogo.
- UI: `desktop/src/vistas/pawn.jsx` (tarjeta «Escala Pawn» con `data-pawn-fila`, chip de procedencia, fecha, pesos descendente, ilvl, estado «sin captura» con `/wfbpawn`), integrada en `personaje.jsx`; DAVI recibe la parte `pawn` con límite declarado (`davi.js`, `preguntar-davi.jsx`, `i18n.js` es/en).
- Tests: `tests/pawn.test.mjs` (17 casos), bloque Pawn en `addon/tests/test_bridge.lua` (+27 checks → 95), suite `desktop/test/vista-pawn.mjs` (13 checks). Conteos actualizados en `scripts/run-gates.mjs` y `docs/TESTING.md` (node 324, lua 95, navegador 347 en 12 suites); `docs/DESKTOP.md` documenta la pieza.

## Comandos y salida

```
$ node --test tests/pawn.test.mjs
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

```
$ lua5.1 addon/tests/test_bridge.lua
test_bridge.lua: 95 checks, 0 fallos
```

```
$ cd desktop && node build.mjs && cd ..
plugin.js 6809308 chars
```

```
$ python3 scripts/check_desktop_bundle.py desktop/plugin.js
… 6820861 bytes … OK
```

```
$ DESKTOP_PLUGIN=$PWD/desktop/plugin.js node desktop/test/vista-pawn.mjs
PASS pawn: estado vacío declara que no hay captura
PASS pawn: el estado vacío explica cómo capturar (/wfbpawn)
PASS pawn: tarjeta «Escala Pawn» visible
PASS pawn: chip «Leído del juego»
PASS pawn: filas de pesos data-pawn-fila
PASS pawn: peso Agility 1.5 visible
PASS pawn: nombre de escala y proveedor
PASS pawn: ilvl del equipo puesto
PASS pawn: catálogo declara 4 escalas
PASS pawn: DAVI ofrece «Incluir escala Pawn»
PASS pawn: captura sin pesos lo declara (no inventa)
PASS pawn: sin filas de pesos
PASS sin red ni errores de JS
{"suite":"vista-pawn","pasadas":13,"red":0,"errores":0}
```

```
$ node scripts/run-gates.mjs
✓ node tests/                esperado=324     obtenido=324     tests=324 fail=0
✓ python tests/              esperado=86      obtenido=86      OK
✓ node motor .cjs            esperado=78      obtenido=78
✓ lua bridge                 esperado=95      obtenido=95      fallos=0
✓ build desktop              esperado=OK      obtenido=OK      plugin.js 6809308 chars
✓ bundle-check               esperado=OK      obtenido=OK      6820861 bytes
✓ browser:navegador          esperado=36      obtenido=36
✓ browser:mercado-auto       esperado=11      obtenido=11
✓ browser:mercado-procedencia esperado=24      obtenido=24
✓ browser:tsm                esperado=28      obtenido=28
✓ browser:vista-mercado      esperado=55      obtenido=55
✓ browser:vista-davi         esperado=50      obtenido=50
✓ browser:vista-guia         esperado=28      obtenido=28
✓ browser:vista-profesiones  esperado=41      obtenido=41
✓ browser:vista-ruta-dungeons esperado=31      obtenido=31
✓ browser:bridge             esperado=19      obtenido=19
✓ browser:vista-personaje-simc esperado=11      obtenido=11
✓ browser:vista-pawn         esperado=13      obtenido=13
✓ browser TOTAL              esperado=347     obtenido=347
GATES: 19/19 verdes — TODO VERDE ✓
```

Verificación extra contra el cliente real (no va a fixtures):

```
$ node --input-type=module -e "…parsePawnScales(readFileSync(Pawn.lua de cuenta))…"
versao 2.1403 escalas 29 erros []
→ las 29 escalas '"Classic":*' con temPesos:false (aceptación del runbook)
```

## Evidencia de datos

APIs/símbolos de Pawn usados en `addon/WoWForeverBridge/Pawn.lua`, todos existentes en `~/Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_forever_/Interface/AddOns/Pawn/`:

- `PawnCommon` (global, `## SavedVariables: PawnCommon` en `Pawn.toc`): `PawnCommon.Scales` — leído solo, nunca escrito.
- `PawnCommon.Scales[nome].Values` — pesos; en runtime las escalas de proveedor sí lo tienen (`PawnAddPluginScale`, `Pawn.lua:5780`), pero `PawnUnitializePlugins` lo borra antes de serializar (`Pawn.lua:5665-5671`), de ahí que el `Pawn.lua` guardado no traiga pesos.
- `PawnGetAllStatValues(ScaleName)` → `PawnCommon.Scales[ScaleName].Values` — `Pawn.lua:5146-5162` (usado como fallback en `pcall`).
- `PawnGetInventoryItemValues('player')` → `TotalValues, Count, TotalItemLevel`; entradas `{ScaleName, Value, 0, LocalizedName}` — `Pawn.lua:2028-2101`.
- Criterio de escala activa inferida: `(not Scale.Provider) or Scale.ProviderActive` (mismo de `PawnGetAllScales`, `Pawn.lua:5208-5212` y `PawnGetAllScalesEx`, `Pawn.lua:5248`) + `ClassID == select(3, UnitClass('player'))` + preferencia `SpecID == GetSpecialization()` cuando `VgerCore.SpecsExist` (patrón de `PawnGetDefaultScale`, `Pawn.lua:837-843`).
- `VgerCore.SpecsExist`, `GetSpecialization`, `UnitClass`, `time`, `DEFAULT_CHAT_FRAME`, `CreateFrame`, `SLASH_*`/`SlashCmdList` — API estándar del cliente, con guardas.
- No existe `PawnGetScaleForPlayer` (confirmado por búsqueda en `Pawn.lua`): la «escala activa» se infiere como pide el runbook.
- `WoWForeverBridgeDB.pawn` / `pawnErro` — campos nuevos del SavedVariables propio; `parseSavedVariables` (`standalone/market.js:759`) los lee sin eval.

## Contradicciones

- **`/wfbp` «para todo»**: el runbook pide disparadores «`/wfbp pawn` (y `/wfbp` para todo)» sin definir el comportamiento de `/wfbp` a secas. Implementé `/wfbpawn` + wrapper para que `/wfbp pawn` capture Pawn y `/wfbp personagem|simc` siga intacto; `/wfbp` sin argumentos mantiene el uso de fase 1 (`uso: /wfbp personagem`). Si la intención era que `/wfbp` a secas capture ambos, hay que decirlo.
- **`spec` en `escalaDoJogador`/UI**: el runbook pasa `{clase, spec}` pero `perfil` (v1) no tiene `specID` numérico (el export SimC da `spec` como token, p. ej. `unknown`). La UI llama con `spec: null` → motivo `catalogo-clase`; la spec solo la aprovecha la captura del addon (que sí trae `specID` real). Fase 5 (`jugador.js`) puede mapear spec si hace falta.
- **`candidatas`**: el runbook pide «guarda hasta 3 candidatas con `LocalizedName`, Provider, ClassID, SpecID, Role»; incluí además `nome` (la clave interna) porque sin ella la candidata no es identificable ni casable con el catálogo. `parsePawnCaptura` las re-normaliza.
- **Catálogo `Pawn.lua`**: el runbook no dice de dónde sale el texto para `parsePawnScales`; lo leí del `Pawn.lua` hermano del diario en la carpeta SavedVariables concedida (mismo canal que `WoWForeverBridge.lua`). Si el humano concede otra carpeta, el catálogo queda ausente y la UI solo muestra la captura — degrada sin romper.
- **Versión del addon**: subí el `.toc` a 1.2.0 (el runbook no lo pedía; el deploy lo hace DAVI).

## Huecos

- **Sin captura real todavía**: `SavedVariables/WoWForeverBridge.lua` aún no tiene `pawn`/`pawnErro` (el cliente no se abrió desde el despliegue). Todo lo probado es con mocks/fixtures; la captura en vivo queda pendiente del humano.
- **`PawnGetInventoryItemValues` puede devolver `nil`** si falta data de algún ítem equipado (`Pawn.lua:2078-2086`): en ese caso `equipo` queda `null` y la UI solo muestra escala/pesos — declarado, no inventado.
- **`GetSpecialization` puede no existir** en el cliente 1.60: el addon lo guarda con guarda (`VgerCore.SpecsExist and GetSpecialization`); sin spec, la candidata se elige solo por `ClassID`. Pawn mismo cae a `GetPrimaryTalentTree()` (`Pawn.lua:4521`); no lo implementé por seguir el runbook al pie — si en vivo la spec nunca se detecta, es el primer sitio a mirar.
- **`ProviderActive` no persiste** en SavedVariables: en el catálogo del archivo todas las escalas `"Classic":*` tienen `Provider="Classic"` sin `ProviderActive`; `temPesos:false` es lo correcto ahí (los pesos solo existen en runtime). El filtro `ProviderActive` solo aplica a la captura en vivo.

## Qué necesita un humano

1. Instalar/recargar `WoWForeverBridge` **1.2.0** en el cliente y entrar al mundo con Pawn activo.
2. En el plugin: conceder la carpeta SavedVariables si hace falta, pulsar «Actualizar» en la tarjeta Escala Pawn (o esperar el sondeo de 30 s del puente).
3. Verificar que aparece la escala real con pesos y `ilvl`; si no, `/wfbpawn` en el juego y `/reload`, y mirar `pawnErro`.
4. Confirmar que el `Pawn.lua` de cuenta se lee como catálogo (línea «N escalas en Pawn.lua» bajo la tarjeta).

## Riesgos

- Si la inferencia de escala activa elige mal (p. ej. varias escalas custom del mismo `ClassID`), la UI lo muestra con su motivo y candidatas — no es silencioso, pero la fase 4 dependerá de esta elección para el ΔPawn.
- `PawnGetInventoryItemValues` itera slots y consulta datos de ítems: si Pawn no está inicializado (`PawnIsInitialized` false) falla con `VgerCore.Fail` → `pcall` lo captura y `equipo` queda `null`; nunca rompe la captura de pesos.
- El wrapper de `/wfbp` depende de que `Personaje.lua` cargue antes que `Pawn.lua` (orden del `.toc`); si se reordena, `/wfbp pawn` dejaría de funcionar (el resto sigue).
- `pawn-catalogo` crece con el `Pawn.lua` del usuario (tope 200 escalas, campos acotados); sin datos de escalas no se guarda nada.
