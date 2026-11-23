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

## 7. Matriz de validación de sistemas operativos (honesta)

| Sistema | Validado en esta auditoría | **No** validado |
| --- | --- | --- |
| **Linux** | Node 26.12.0, `node --test` con fixtures sintéticas; 92 pruebas de sincronización en verde y 381/381 en la suite completa. Revisión del código del SDK (`plugin-files.ts`, `plugin-files-ops.ts`, `plugin-files-guards.ts`). | Cliente WoW real, app Hermes desktop real, diálogo de permisos real, selector real del SDK. |
| **Windows** | Sólo revisión estática del contrato del SDK (`path.win32`, `toRel()` con `/`, `REL_PATH_MAX=1024`, rechazo de `:`/UNC/dispositivos reservados) y fixtures sintéticas ejecutadas **en Linux**. | Host Windows real, NTFS/OneDrive, UNC, ADS, nombres reservados, selector nativo, WoW real. |
| **macOS** | Sólo revisión estática del contrato del SDK (guardia `..namedfork`, `caseless` en Darwin) y fixtures sintéticas ejecutadas **en Linux**. | Host macOS real, APFS case-insensitive, diálogo de permisos real, WoW real. |

**Revisión adicional (SimC / Pawn).** `desktop/src/simc.js` normaliza saltos
CRLF y CR (`replace(/\r\n?/g, '\n')`), `desktop/src/pawn.js` ordena con
comparación `<` determinista en lugar de `localeCompare` (sin dependencia del
locale del sistema) y `desktop/src/subasta-pawn.js` usa `localeCompare` sólo
para ordenar razones de exclusión en la UI, nunca para identidad ni
procedencia. No se encontró bug de plataforma en esos parsers y no se
modificaron.

**Conclusión:** la compatibilidad multiplataforma se validó por *contrato y
fixtures deterministas*, **no** ejecutando Windows ni macOS. Antes de afirmar
soporte de primera clase en esos sistemas hay que correr las mismas pruebas en
un host real y repetir el checklist §2–§6 con permisos reales.

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
node --test tests/*.test.mjs
# ℹ tests 381 / pass 381 / fail 0 (suite completa de Node en este checkout)

# Preparar las dependencias del proyecto y Chromium una vez:
npm ci --prefix desktop
cd desktop && npx playwright install chromium && cd ..
node desktop/test/mercado-auto.mjs
node desktop/test/vista-mercado.mjs
```

Bugs concretos corregidos (con regresión en rojo antes del fix, verde después):

1. **Auctionator**: la lectura directa en la raíz devolvía antes de completar
   el descubrimiento; una copia suelta ganaba sobre una cuenta anidada. Ahora
   es un candidato más y dos candidatos válidos dan `ambiguous`.
2. **Auctionator**: no validaba `truncated`, ni rutas inseguras del listado
   (`../Config.wtf`, `Cuenta\Auctionator.lua`); ahora falla cerrado sin leer.
3. **TSM/puente/Auctionator**: `safePath` local con tope 2048 y que toleraba
   `\` y `..namedfork`; se unificó en `desktop/src/sync-path.js` con el
   contrato real del SDK (1024 / 255, sólo `/`).

Archivos propios de esta auditoría: `desktop/src/sync-path.js`,
`desktop/src/auctionator.js`, `desktop/src/bridge-sync.js`,
`desktop/src/tsm-sync.js`, `tests/sync-path.test.mjs`,
`tests/auctionator-discovery.test.mjs` y este documento. No se tocó
`app.jsx`, vistas, runner, `package.json`, CI ni bundles.
