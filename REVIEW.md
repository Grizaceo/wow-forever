# REVIEW — fase 1

## Qué hice

- `desktop/src/simc.js` (nuevo): parser puro `parsearSimc` del export string de
  SimulationCraft (sin DOM, sin eval; lo no reconocido va a `desconhecidas`),
  persistencia `ctx.storage['personaje-simc']` (`{v:1, origem, texto, capturado,
  erro}`), `sincronizarPersonagem` y `propostaPerfil` (propone nivel, reino,
  raza/facción solo si validan contra `personaje.json`, y profesiones; nunca
  sobrescribe sin pasar por `validarPerfil`).
- `desktop/src/bridge.js`: `parseBridge` ahora extrae `WoWForeverBridgeDB.personagem`
  y `.personagemErro` con topes (simc ≤512 KiB, erro ≤4 KiB); campos aditivos,
  el journal de mercado no cambia.
- `desktop/src/bridge-sync.js`: cada ingesta llama `sincronizarPersonagem` antes
  del early-return de «diario vacío», con try/catch propio para no tumbar la
  importación de mercado.
- `addon/WoWForeverBridge/Personaje.lua` (nuevo, TOC → v1.1.0, `OptionalDeps` +=
  `Simulationcraft`): llama `SimulationcraftAPI.GetSimcProfile` dentro de `pcall`,
  throttle 300 s en `PLAYER_ENTERING_WORLD`, captura forzada en logout/quit y
  `/wfbp personagem`. Errores van a `personagemErro` sin borrar el último export
  bueno; `SimulationcraftAPI` ausente = silencio.
- UI: `desktop/src/vistas/personaje-simc.jsx` (tarjeta con chip de origen
  juego/pegado, fecha y frescura >7 días, stats, equipo por slot con nombre de
  ítem, talentos, profesiones, contador de líneas no reconocidas, pegado manual,
  copia del export y botón «Aplicar» de la propuesta de perfil). Integrada en
  `vistas/personaje.jsx`; DAVI recibe solo un resumen acotado como parte `simc`
  (`davi.js` + checkbox en `preguntar-davi.jsx` + i18n es/en).
- Tests: `tests/simc.test.mjs` (21 casos), +16 checks en `addon/tests/test_bridge.lua`
  (68 total), suite de navegador `desktop/test/vista-personaje-simc.mjs` (11).
- Docs: `docs/DESKTOP.md` (sección «Estado del personaje»), `docs/MODELO-DATOS.md`
  (clave `personaje-simc`). Gates actualizados: EXPECT_NODE 307, EXPECT_LUA 68,
  nueva suite browser (TOTAL 334).

## Comandos y salida

```text
$ node --test tests/simc.test.mjs        → 21 pass / 0 fail
$ node --test tests/                     → 307 pass / 0 fail
$ lua5.1 addon/tests/test_bridge.lua     → 68 checks, 0 fallos
$ cd desktop && node build.mjs           → plugin.js 6786856 chars
$ python3 scripts/check_desktop_bundle.py → OK (6798380 bytes)
$ DESKTOP_PLUGIN=$PWD/desktop/plugin.js node desktop/test/vista-personaje-simc.mjs
  → 11 PASS, 0 red, 0 errores de JS
$ node scripts/run-gates.mjs             → GATES: 18/18 verdes (browser TOTAL 334)
```

## Evidencia de datos

Todo verificado contra los archivos instalados del cliente
(`~/Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_forever_/`):

- `Interface/AddOns/Simulationcraft/core.lua:1598-1600` —
  `SimulationcraftAPI = { GetSimcProfile = Simulationcraft.GetSimcProfile }`:
  API global invocable real (no hace falta raspar UI ni portapapeles).
- `core.lua:1109` — `function Simulationcraft:GetSimcProfile(debugOutput, noBags,
  showMerchant, links)`; el cuerpo (1109-1465) no usa `self` → se llama con nil.
- `core.lua:542` `GetItemStringFromItemLink` y `core.lua:646` — líneas de equipo
  `slot=,id=…,enchant_id=…,gem_id=a/b,bonus_id=…`.
- `extras.lua:173-191` `simcSlotNames` (head…ammo) + `extras.lua:232` slot
  Forever `ranged`; `core.lua:1401/1419/1445` secciones `### Gear from Bags`,
  `### Weekly Reward Choices`, `### End of Weekly Reward Choices`.
- `forever/stats.lua:102` (`character_stats_gear`) y líneas `# skills=`/`# buffs=`;
  `forever/pet.lua:35/41/50` (`pet_family/pet_level/pet_abilities`);
  `forever/legacytalents.lua` (`legacy_talents=`).
- `Simulationcraft.toc` — `SavedVariables: SimulationCraftDB`, pero el addon solo
  usa AceDB (`libs/AceDB-3.0/AceDB-3.0.lua:212-217`, perfiles/minimapa): **no
  guarda exports** → la vía (a) del plan queda descartada con evidencia.
- `Pawn/Pawn.lua:5146` `PawnGetAllStatValues`, `:834` `PawnGetDefaultScale`,
  `:908` `PawnCanItemHaveStats`, `:1328` `PawnGetItemData` — APIs reales para la
  fase 2. `PawnCommon.Scales` se puebla en runtime (`Pawn.lua:627-647`); los
  pesos numéricos están en `Scale.Values`, no en el stub de 9 KB que sugería el
  plan (el archivo real tiene >5000 líneas).
- `WTF/Account/<cuenta>/SavedVariables/WoWForeverBridge.lua` = 1.389.473 bytes:
  el bloque `personagem` (un export ~50-200 KB) es marginal, sin riesgo de cuota.

## Contradicciones

- **«tres diccionarios de i18n»**: el repo tiene solo dos (`agregarTextos(es, en)`
  en `desktop/src/i18n.js:81,90`). Los textos nuevos van en es y en; no existe
  tercera variante que actualizar.
- **Pawn.lua «9.886 bytes»**: el archivo real pesa cientos de KB y miles de
  líneas. La afirmación «sin pesos numéricos» hay que revisarla en fase 2:
  `PawnCommon.Scales[ScaleName].Values` existe y `PawnGetAllStatValues`
  (`Pawn.lua:5146`) lo expone; el comentario en `:5157-5160` muestra que
  devuelve copia de `Values`. Los pesos probablemente SÍ son obtenibles en
  runtime — lo confirmará la fase 2, no la 1.
- **`SimulationCraftDB.profiles[*].simc`**: confirmado ausente (AceDB solo
  guarda opciones de UI). Se usó la vía (b) del plan: bloque nuevo en
  `WoWForeverBridgeDB`.

## Huecos

- Talentos: el export trae el string crudo (`talents=CdE…`, `# talents=` por
  grupo, `legacy_talents=`) pero **no** se decodifican a puntos/nodos: la fase 1
  solo declara «exportados / no declarados» y conserva el string para fases
  futuras. Requiere tabla de talentos Forever que hoy no existe en `data/`.
- `# character_stats_*` y líneas de combate se parsean a mapas `nombre→valor`
  sin validar semántica por clase (los nombres de stats los define el addon);
  stats ausentes quedan fuera del objeto, no en 0.
- `pet_info`/`pet_stats` se guardan planos; `pet_info` puede llevar valores no
  numéricos (tipo de mascota) — se conservan como texto.
- El nombre del personaje (`class="Nombre"`) se guarda en `p.nome` del objeto
  parseado pero **no** se muestra ni se propone al perfil (dato personal).

## Qué necesita un humano

- **Probar en el juego real**: instalar/recargar WoWForeverBridge 1.1.0 +
  SimulationCraft, entrar al mundo (o `/wfbp personagem`), `/reload`, y verificar
  que `WoWForeverBridgeDB.personagem` aparece en el SavedVariables y que el
  plugin lo sincroniza en la pestaña Personaje. Los tests cubren el formato con
  fixtures, no el cliente en vivo.
- Confirmar que `GetSimcProfile(nil,false,true,false)` (sin bags ni merchant)
  es la combinación deseada: hoy exporta equipo puesto + stats + talentos; las
  bolsas comentadas quedan en `equipable` solo si el usuario exporta con bags.

## Riesgos

- Si el addon SimulationCraft cambia el formato del export (versión mayor), el
  parser es tolerante pero los campos nuevos caerán en `desconhecidas` — la UI
  muestra el contador, no rompe.
- `propostaPerfil` propone profesiones solo cuando el export las lista; si el
  addon omitiera la línea `professions=` en un personaje sin profesiones, el
  perfil manual no se toca (decisión conservadora, documentada).
- El export crudo contiene el nombre del personaje y queda en
  `ctx.storage`/`WoWForeverBridgeDB`; nunca se adjunta a DAVI ni sale del plugin
  salvo copia manual del usuario.
- `personagemErro` más nuevo que el último buen export se muestra como chip de
  error conservando los datos buenos — si el usuario interpreta mal la frescura,
  puede fiarse de un export viejo (la UI lo marca «Desactualizado» >7 días).

## Revisión DAVI (arquitecto)

Correcciones aplicadas sobre la entrega antes de aceptar la fase:

- **Dato personal en `REVIEW.md`**: la ruta citada traía el identificador real de
  cuenta (`WTF/Account/<id>#1/…`). Reemplazado por `WTF/Account/<cuenta>/…`
  (§4.8). El identificador no debe volver a aparecer en docs ni commits.
- **Tope de export desalineado**: el addon aceptaba hasta 700.000 caracteres y el
  plugin descarta en silencio cualquier `simc` mayor de 512 KiB
  (`bridge.js`, `PERSONAGEM_MAX`). Alineado a `512 * 1024` en
  `addon/WoWForeverBridge/Personaje.lua`: un export mayor ahora produce
  `personagemErro` visible en vez de guardarse y perderse sin aviso.
- **i18n**: la propuesta de perfil mostraba «Facción → …» con el texto fijo en
  español. Movido a la clave `simc.faccion` en los dos diccionarios.

