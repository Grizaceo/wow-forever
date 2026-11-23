# Sincronización de addons: instalación, descubrimiento y recuperación

Guía de operación y solución de problemas para la sincronización local de
**Auctionator**, **TradeSkillMaster (TSM)**, **WoWForeverBridge**,
**SimulationCraft (SimC)** y **Pawn** en Windows, macOS y Linux. Aplica a
terceros que usen el plugin de escritorio sin acceso a archivos privados.

> **Límites de privacidad (no negociables).** El plugin sólo lee archivos dentro
> de una carpeta que el usuario concede explícitamente con el selector del SDK.
> Nunca lee `WTF/Config.wtf`, credenciales ni `.bak`; no envía rutas ni nombres
> de cuenta a servicios externos, ni ejecuta Lua: los archivos `.lua` se interpretan como **datos** mediante
> parsers estrictos. Ningún sondeo abre un selector en segundo plano. El agente
> que escribe esta guía **no abrió archivos del juego ni de cuenta**.

---

## 1. Mapa de archivos (igual en los tres sistemas operativos)

El SDK de Hermes devuelve siempre rutas relativas separadas por `/`
(`toRel()` hace `parts.join('/')`), también en Windows. Por eso **la ruta
esperada no cambia de OS**:

| Fuente | Ruta relativa dentro de la carpeta concedida |
| --- | --- |
| Auctionator | `WTF/Account/<cuenta>/SavedVariables/Auctionator.lua` |
| TSM | `WTF/Account/<cuenta>/SavedVariables/TradeSkillMaster.lua` |
| WoWForeverBridge | `WTF/Account/<cuenta>/SavedVariables/WoWForeverBridge.lua` |
| Pawn (sólo con consentimiento explícito) | `.../SavedVariables/Pawn.lua` |
| SimC / Pawn / stats | vía el diario del puente, no leyendo sus archivos propios |

Concesión recomendada: la carpeta `SavedVariables` **de la cuenta que jugás**.
Conceder `WTF` o la raíz del juego funciona, pero el descubrimiento es acotado
(y una copia suelta en la raíz ya no gana silenciosamente sobre una cuenta
anidada: ver §4).

---

## 2. Instalación y descubrimiento

1. Instalá los addons en `Interface/AddOns/`. El diario del puente lo escribe
   el addon propio `WoWForeverBridge` v1.0.1 (`addon/WoWForeverBridge/`).
2. En Hermes: **Otros y configuración → Configuración** → elegí la carpeta
   correspondiente (Auctionator / TSM / puente). El motor **no** busca en
   disco fuera de los permisos concedidos.
3. Si ya concediste una carpeta para otro fin, ese permiso se reutiliza: el
   puente puede usar la carpeta de Auctionator o TSM, y TSM puede usar la de
   Auctionator. No se pide otra concesión sin una acción explícita.
4. El sondeo corre cada **30 s** mientras el plugin esté habilitado y Hermes
   abierto; no depende de que la pestaña Mercado esté montada.

**Búsqueda acotada (fail closed).** El recorrido se detiene y reporta error si
el listado está truncado, si supera 4.000 entradas por directorio, 120
directorios o profundidad 6 (Auctionator: 80 directorios / profundidad 4), o
si una ruta no es segura. Se omiten `Interface`, `Data`, `Cache`, `Logs` y
`.git`. Un listado incompleto **nunca** se trata como «no encontré nada».

**Contrato de ruta (validación antes de fijar).** Se rechazan rutas vacías, con
`\` (el SDK nunca las emite), `..`, `.`, `..namedfork`, unidad `C:`, ADS
`archivo:stream`, NUL/control, o segmentos de más de 255 caracteres; el largo
total se limita a **1024**, igual que `REL_PATH_MAX` del SDK. Antes había un
tope local de 2048 y se toleraban barras invertidas: ese desajuste está
corregido en `desktop/src/sync-path.js`.

---

## 3. Permisos

| Situación | Comportamiento |
| --- | --- |
| Primera vez, sin concesiones | Estado visible «elegí carpeta». No se abre picker solo. |
| Permiso revocado | Se descarta el id guardado y se espera una nueva elección. No se adopta otra cuenta en silencio, salvo que ya exista una concesión explícita para el mismo fin. |
| Varias cuentas | Estado de **ambigüedad**; pedí que elijas la carpeta de tu cuenta. Nunca se elige «la más grande» ni la primera. |
| Host sin `folders()` | Sólo selector manual; sin sondeo silencioso. |
| `list()` no disponible (SDK antiguo) | Fallback: lectura directa del nombre exacto en la raíz concedida; sin recorrido. |

---

## 4. Ambigüedad de cuentas

Síntomas y significado:

- `Hay varias carpetas con precios. Elegí otra carpeta…` → varios
  `Auctionator.lua` válidos dentro de la misma concesión.
- `Hay varias cuentas con TSM…` / `Hay varias cuentas con el diario del
  puente.` → varios archivos del mismo tipo bajo la carpeta concedida.
- **Copia en la raíz + cuenta anidada:** antes Auctionator ganaba la copia de
  la raíz sin terminar la búsqueda; ahora **ambos** son candidatos y el
  resultado es `ambiguous`. Elegí `WTF/Account/<tu cuenta>/SavedVariables`.

La ruta, el nombre de cuenta, reino, región y facción **nunca** se usan para
inferir procedencia. La adquisición de Auctionator queda como
`auctionator-raw`, `confidence: 'unknown'`, `comparable: false`,
`reason: 'server-topology-unverified'`. El puente es **transporte**, no
exportador verificado: su procedencia es `UNKNOWN` por diseño
(`docs/MERCADOS-PROCEDENCIA.md`). No es un bug a corregir.

---

## 5. Recarga y ciclo de escritura de WoW

WoW escribe los `SavedVariables` al hacer `/reload` o al cerrar sesión. Si
escaneaste en el juego y el plugin sigue mostrando datos viejos:

1. `/reload` (o logout) en el cliente.
2. En Hermes: **Otros y configuración → Configuración → Recargar datos**.
3. Esperá un ciclo de sondeo (≤30 s).

Si el diario del puente no aparece: instalá el addon, verificá que esté
 habilitado en la lista de addons del personaje y hacé `/reload`. El estado
 «instalá el addon y `/reload`» es visible; el plugin no cambia de cuenta ni
 abre el picker para «ayudar».

---

## 6. Recuperación de escritura fallida

El almacén v2 (`desktop/src/almacen.js`) persiste en slot **A/B inactivo**,
con puntero confirmado por lectura exacta:

- `writeText` del SDK admite hasta **4 MiB** de UTF-8. Un conjunto >4 MiB y
  ≤32 MiB se divide en partes de **3 MiB** más un *manifest* con
  `{version, revision, parts, bytes, sha256}`. Cada parte se verifica por
  tamaño y el conjunto completo por SHA-256 antes de mover el puntero.
- Un puntero no confirmado (`market-v2-pointer`) **bloquea** escrituras
  posteriores para no sobreescribir un estado incierto. Mensaje:
  `No se pudo confirmar el conjunto v2; usa Recargar datos en Configuración`.
- Si la lectura de vuelta del puntero difiere, el puntero no se mueve y se
  conserva el snapshot anterior.
- Si el historial falla al fusionar, el archivo **no** se marca como
  procesado: se reintenta en el próximo ciclo. Sólo se omiten bytes idénticos
  (`lastBytes`), nunca una falla.

**Procedimiento de recuperación:**
**Otros y configuración → Configuración → Recargar datos**. Si vuelve el
mismo error, revisá permisos de escritura de la carpeta de datos del plugin y
que quede espacio para el conjunto (≤32 MiB). No borres archivos a mano sin
un respaldo: un puntero huérfano hace que el plugin falle cerrado en vez de
sobrescribir historial.

Errores de importación que **no** son pérdida de datos:

| `status/error` | Causa típica | Acción |
| --- | --- | --- |
| `missing-snapshot` | No hay snapshot válido todavía | Esperar al próximo sondeo / elegir carpeta |
| `invalid-observation` / `invalid` | Parser rechazó el archivo | Verificá que no esté truncado; `/reload` y reintentar |
| `unknown-provenance` | Origen no verificado | No se importa: es la guardia de procedencia |
| `load` / `plan` / `save` | Falló lectura del almacén, plan o escritura | Recargar datos; revisar permisos |
| `limit` | Búsqueda incompleta o carpeta amplia | Conceder `SavedVariables` de la cuenta |
| `invalid-path` | Listado con ruta insegura | No se lee la ruta insegura; reelegir carpeta |
| `ambiguous` | Varias cuentas o copia en raíz | Elegir explícitamente una cuenta |

---

## Limitaciones deliberadas del descubrimiento

Si cualquier listado es incompleto o contiene una ruta insegura, se detiene toda
la búsqueda: no es posible descartar otra cuenta en la parte no enumerada. No se
elige silenciosamente el primer archivo válido. Para recuperarse, conceder una
carpeta más específica: el `SavedVariables` de la cuenta deseada. No hace falta
borrar archivos ni mover la cuenta. Se rechaza `:` también en Linux/macOS como
política portable, aunque allí pueda ser un nombre válido; seleccionar una carpeta
más profunda evita incluir un ancestro con ese carácter en la ruta relativa.

## 7. Matriz de validación de sistemas operativos (honesta)

| Sistema | Validado en esta auditoría | **No** validado |
| --- | --- | --- |
| **Linux** | Suite Node 388/388 con fixtures sintéticas (92 pruebas de sync); Python 121/121 con instalación sintética del agente-half; standalone, build reproducible y revisión del contrato del SDK. CI nativa Node 22 / Python 3.12; gates Lua y 443 checks Chromium. | Cliente WoW real, app Hermes desktop real, diálogo de permisos real, selector real del SDK. |
| **Windows** | CI en runner Windows: Node 22, Python 3.12, standalone, build y bundle-check. Las mismas fixtures de sincronización pasan en ese SO. Revisión estática de las restricciones del SDK. | WoW/Hermes reales; selector y permisos nativos; integración con OneDrive/UNC/ADS y nombres reservados. |
| **macOS** | CI en runner macOS: Node 22, Python 3.12, standalone, build y bundle-check. Las mismas fixtures de sincronización pasan en ese SO. Revisión estática de las restricciones del SDK. | WoW/Hermes reales; selector y permisos nativos; integración real con APFS case-insensitive. |

**Revisión adicional (SimC / Pawn).** `desktop/src/simc.js` normaliza saltos
CRLF y CR (`replace(/\r\n?/g, '\n')`), `desktop/src/pawn.js` ordena con
comparación `<` determinista en lugar de `localeCompare` (sin dependencia del
locale del sistema) y `desktop/src/subasta-pawn.js` usa `localeCompare` sólo
para ordenar razones de exclusión en la UI, nunca para identidad ni
procedencia. No se encontró bug de plataforma en esos parsers y no se
modificaron.

**Evidencia remota:** [run 45087986470](https://github.com/Grizaceo/wow-forever/actions/runs/45087986470),
commit `b81f5c6728b6d79384a77e96d52e52522246c1d1`: los cuatro jobs terminaron
en verde. Se corrigió tanto la enumeración de tests en Node 22 como la decodificación
UTF-8 de JSON de Node en los tests Python de Windows.

**Conclusión:** las fixtures y builds se ejecutaron en los tres SO mediante CI;
esto **no** valida tres instalaciones de WoW ni el selector real del SDK. Antes
de afirmar soporte de primera clase hay que repetir el checklist §2–§6 en la
app y cliente reales, con permisos reales, en cada sistema.

La distribución incluye el bundle regenerado y el runner canónico ejecuta
también las suites de navegador con fixtures. Estos tests no sustituyen
la validación del selector y del cliente de juego en cada sistema.

---

## 8. Evidencia y comandos

```bash
cd wow-forever
node --test tests/sync-path.test.mjs tests/auctionator-discovery.test.mjs \
  tests/auctionator-auto.test.mjs tests/auctionator-lectura.test.mjs \
  tests/tsm.test.mjs tests/bridge-sync.test.mjs tests/bridge.test.mjs \
  tests/mercado-auto.test.mjs tests/market-source.test.mjs tests/market-sync.test.mjs
# ℹ tests 92 / pass 92 / fail 0   (subconjunto de sincronización)
node scripts/test-node.mjs
# ℹ tests 388 / pass 388 / fail 0 (suite completa de Node en este checkout)

# Preparar las dependencias del proyecto y Chromium una vez:
npm ci --prefix desktop
cd desktop && npx playwright install chromium && cd ..
node desktop/test/mercado-auto.mjs
node desktop/test/vista-mercado.mjs
```

**Conteo histórico vs. validación local actual.** Los números del bloque anterior
son los de la CI publicada (Node 22 / Python 3.12 en Linux, Windows y macOS,
run `45087986470`, commit `b81f5c6`): 388 Node y 121 Python. **No** incluyen las
validaciones añadidas después en esta rama. En el chequeo local de este checkout
(Node **v26.12.0**, 2026-11-22) `python3 -m unittest discover -s tests` da
**122 OK** (el test nuevo de CLI aislada, §9) y los suites navegador focales
`node desktop/test/navegador.mjs` (51) y `node desktop/test/vista-clase.mjs`
(14 + 9 = 23) dan 0 red / 0 errores. Estas cifras locales **no están publicadas
en CI** y no se atribuyen a los runners Node 22/Windows/macOS de la tabla §7.
El runner canónico completo (`node scripts/run-gates.mjs`) no se ejecutó en este
trabajo de integración: sus defaults ya se actualizaron a 122 Python, pero el
resultado «todo verde» del run completo está pendiente.

Bugs concretos corregidos (con regresión en rojo antes del fix, verde después):

1. **Auctionator**: la lectura directa en la raíz devolvía antes de completar
   el descubrimiento; una copia suelta ganaba sobre una cuenta anidada. Ahora
   es un candidato más y dos candidatos válidos dan `ambiguous`.
2. **Auctionator**: no validaba `truncated`, ni rutas inseguras del listado
   (`../Config.wtf`, `Cuenta\Auctionator.lua`); ahora falla cerrado sin leer.
3. **TSM/puente/Auctionator**: `safePath` local con tope 2048 y que toleraba
   `\` y `..namedfork`; se unificó en `desktop/src/sync-path.js` con el
   contrato real del SDK (1024 / 255, sólo `/`).

Archivos de la corrección de sincronización: `desktop/src/sync-path.js`,
`desktop/src/auctionator.js`, `desktop/src/bridge-sync.js`,
`desktop/src/tsm-sync.js`, `tests/sync-path.test.mjs`,
`tests/auctionator-discovery.test.mjs` y este documento. La integración completa
incluye además cambios de rendimiento, CI y el bundle regenerado; no se
desplegó sobre la instalación existente como parte de esta auditoría.

## 9. Sincronización del agente-half: `contracts/` viaja con el helper

La sincronización del agente-half copia a `~/.hermes/plugins/wow-forever/` el
subconjunto que consume el agente: `data/`, `skills/` y `consultar.py`. Ese
subconjunto estaba incompleto. `skills/wow-forever/scripts/perfil.py` abre
`Path(__file__).resolve().parents[3] / 'contracts' / 'perfil-v1.json'`; sin
`contracts/` el helper muere al importar, y `src/perfil.js` pierde su fuente de
verdad en el bundle. No hay script de sync versionado: la receta es manual y
está documentada en la skill `wow-forever-local-data`.

Payload mínimo del agente-half (P0) — es lo que copian las pruebas aisladas:

```text
data/                                # personaje.json y el resto (la CLI carga data/ bajo demanda)
skills/                              # scripts/perfil.py y scripts/consultar.py
contracts/perfil-v1.json             # contrato compartido JS/Python
```

Verificación sin tocar el plugin instalado (dos pruebas en
`tests/test_perfil.py::TestInstalacionSinteticaAgentHalf`):

- `test_helper_valida_desde_instalacion_sintetica` copia **sólo** el helper y el
  contrato (`contracts/perfil-v1.json` + `skills/.../perfil.py`), ejecuta
  `perfil.py` con `python -I` y `cwd='/'`, compara con `validar_perfil` y comprueba
  el control negativo (sin `contracts/` → error que nombra `perfil-v1.json`).
  No es, por sí sola, una prueba del payload completo.
- `test_cli_real_desde_instalacion_sintetica` sí copia el payload entero
  (`data/`, `skills/.../perfil.py`, `skills/.../consultar.py`, `contracts/`) a un
  `TemporaryDirectory` bajo TMPDIR y ejecuta la CLI real
  `consultar.py --datos <data aislada> perfil --raza 5 --clase 2 --faccion horda`
  con `cwd='/'` y sin `PYTHONPATH`/`WOW_FOREVER_DATA`. Comprueba la salida válida
  y el control negativo: al quitar `perfil.py` la CLI responde `error: falta el
  helper canónico perfil.py (contrato perfil-v1)` con código 2. Esa importación
  del helper en `consultar.py` es el punto crítico del sync del agente-half.

La CLI se invoca sin `-I` porque la skill usa `python3 <skill>/scripts/consultar.py`:
con `-I` Python no añade el directorio del script a `sys.path` y el helper
hermano no se importa (en ese modo la orden `perfil` falla con el error anterior).
Ninguna de las dos pruebas abre selector, lee SavedVariables ni escribe en
`~/.hermes`. Total local: 122 tests Python OK (Node v26.12.0, no publicado en CI).

La instalación real revisada en este checkout **no** tenía `contracts/` ni
`perfil.py`; este cambio no despliega. El despliegue posterior debe añadir
`contracts/` a la lista de rsync del agente-half.
