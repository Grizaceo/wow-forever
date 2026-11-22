---
name: wow-forever
description: "Asiste a jugadores de World of Warcraft: Forever (juego oficial de Blizzard, cliente 1.60, basado en Classic) con los datos del plugin wow-forever de Hermes: entrenadores, hechizos y misiones de clase, zonas por nivel, profesiones (recetas, plan de subida, materiales), dungeons con jefes y botín, ítems, la guía curada del Cazador de la Horda, Legacy y el mercado local (Auctionator, contabilidad TSM y diario del puente WoWForeverBridge). Usar cuando el usuario juegue WoW Forever o pregunte por su personaje, dónde entrenar o subir de nivel, profesiones, drops, dungeons, precios o farmeo. Assists WoW Forever players (any race, class and faction) with the plugin's offline game data."
version: 2.1.0
author: Cristóbal Muñoz
license: GPL-3.0-or-later
metadata:
  tags: "wow, warcraft, forever, classic, leveling, professions, dungeons, market, auctionator, guide"
---

# WoW Forever: asistente de juego

El plugin **wow-forever** trae una guía offline para Hermes Desktop (entrada "WoW Forever" en la
barra lateral, ruta `/wow-forever`) y esta skill. Las dos usan los mismos datos, los archivos
`data/*.json` del plugin, así que respondes con lo mismo que muestra la página.

WoW Forever es el juego oficial de Blizzard lanzado en noviembre de 2026 (producto `wowf`,
cliente 1.60), basado en WoW Classic. Trae 10 razas: las 8 de Classic más **Skyborne**
(Cielonato), una variante por facción. Las 9 clases están en **ambas** facciones, así que hay
Paladín no-muerto y Chamán enano. También agrega zonas, dungeons, raids, misiones, ítems y
recetas nuevas, y el sistema Legacy. No es un servidor privado.

## 1. El personaje del jugador

El perfil vive en el almacenamiento de la página de Desktop y tú no lo ves. Consíguelo así:

- Puede usar **Preguntar a DAVI** en **Personaje**, **Profesiones** o el detalle de un ítem en **Mercado**: revisa la pregunta y el contexto, elige incluir perfil/precios y confirma la inserción en el borrador del chat. No se envía automáticamente; si no hay compositor disponible, se copia para pegar o queda texto seleccionable. Trata ese contexto como una instantánea, no como lectura del juego en vivo.
- Pide que pulse **Copiar perfil para el agente** en la pestaña **Personaje** de la guía y lo
  pegue. Llega como una línea así:
  `Mi personaje de WoW Forever (plugin wow-forever): Horda · No-muerto (Undead, raza 5) · Paladín (Paladin, clase 2) · nivel 24 · profesiones: Herrería (Blacksmithing, id 164)`
- O pregúntale facción, raza, clase y nivel, y para profesiones su skill actual (la página no lo
  copia).
- Si solo te da parte de los datos, responde con lo que alcanza y pregunta lo que falta cuando
  cambie la respuesta. Por ejemplo, los entrenadores de clase dependen de la facción.

## 2. Consultar los datos

Los JSON son compactos y grandes: no los abras con herramientas de lectura de archivos. Usa el
script de solo lectura de esta skill con la terminal:

```sh
python3 ${HERMES_SKILL_DIR}/scripts/consultar.py <orden> [opciones]
```

(Si `python3` no existe, usa `python`. El script solo lee `data/` del plugin, sin red y sin
escribir nada. `--en` pone los nombres en inglés primero, y `--max N` cambia cuántas filas
muestra, 15 por defecto.)

| Pregunta | Orden |
|---|---|
| ¿Mi raza y clase existen? ¿Es nueva? ¿Dónde empiezo? | `perfil --raza no-muerto --clase paladin --nivel 24` |
| ¿Dónde entreno? (entrenadores de clase) | `entrenadores --clase paladin --faccion horda` |
| ¿Qué hechizos aprendo ahora o pronto? | `hechizos --clase paladin --nivel 24` |
| Misiones de clase | `misiones-clase --clase chaman --faccion alianza --nivel 20` |
| ¿Dónde subo de nivel? | `zonas --faccion horda --nivel 24` |
| ¿Qué subo de herrería con 120 de skill? | `profesion herreria --skill 120 --faccion horda` |
| ¿Cómo se aprende o qué pide una receta? | `receta "bronze bracers"` |
| ¿Dónde consigo un ítem? ¿Qué es? (jefe y %, misión que lo da, vendedor, DPS) | `item "venomstrike"` (o un id; `--detalle` con varios) |
| ¿Qué dungeons hago a mi nivel? | `dungeons --nivel 24` |
| Jefes y botín de un dungeon (útil para mi clase) | `dungeon "deadmines" --clase guerrero` |
| Buscar una misión y sus recompensas | `mision "call of water" --faccion horda` (o un id) |
| ¿Qué datos faltan? | `huecos --tema entrenadores` |
| ¿De dónde salen los datos? | `fuentes` |

Razas, clases, facciones y profesiones se aceptan en español o inglés, con o sin tildes, o por
ID. Si el script dice que un nombre es ambiguo (por ejemplo, «cielonato» sin facción), pasa
`--faccion` o el ID.

## 3. Guías curadas

La guía escrita a mano del **Cazador de la Horda** (ruta por bandas, armas, dungeons, lista
de subasta y macros) y la de **Legacy** están en
`references/`. Lee primero `references/INDICE.md` con
`skill_view(name="wow-forever:wow-forever", file_path="references/INDICE.md")` y luego solo el
archivo de la clase y facción del jugador. Las demás clases y facciones no tienen guía
curada (las de Guerrero y Chamán se retiraron por errores): dilo y usa los datos generados.

## 4. Cómo responder

- **Di de dónde sale cada dato**, como la página:
  - **Classic 1.12**: generado de CMaNGOS (WoW 1.12). Es aproximado: Forever puede diferir. Así
    vienen entrenadores, coordenadas, hechizos, misiones y botín.
  - **cliente Forever**: generado de las tablas del cliente 1.60. Así vienen razas, clases,
    recetas, ítems, zonas y jefes de dungeons.
  - **curado**: escrito a mano en la guía, sin probar en el juego salvo que diga lo contrario.
- **No inventes datos.** Si el script responde **SIN DATOS**, dilo con su motivo: «la guía no
  tiene ese dato» y por qué. Por ejemplo, los entrenadores de Paladín de la Horda y de Chamán
  de la Alianza son nuevos de Forever y no están en 1.12, y el botín de los dungeons nuevos solo
  existe en el servidor.
- **Primero la guía, después lo demás.** Empieza siempre por lo que dicen los datos del plugin,
  con su origen. Si agregas algo de la web o de tu conocimiento general, ponlo después, en un
  párrafo aparte que lo diga («fuera de la guía: …»), con su fuente, y avisa que la guía no lo
  verificó. Nunca presentes un dato de la web como si fuera de la guía.
- Si la guía curada y los datos generados no coinciden (por ejemplo, de dónde sale un arma),
  dilo y muestra los dos con su origen. No elijas en silencio.
- Coordenadas: porcentaje del mapa de la zona (x, y), como las del juego.
- Profesiones: naranja sube siempre, amarillo casi siempre, verde rara vez y gris nunca. El
  plan de subida es una estimación con la regla de Classic, sin precios. Las recetas nuevas de
  Forever no traen el skill para aprenderlas ni cómo se consiguen, así que no las recomiendes
  como si ya sirvieran.
- Responde en el idioma del usuario. Los nombres del juego llevan el inglés entre paréntesis,
  porque muchos juegan con el cliente en inglés. Usa el nombre tal como lo trae el dato: los
  hechizos, misiones y NPC de 1.12 solo vienen en inglés, y no los traduzcas tú, porque una
  traducción inventada no coincide con el juego.

## 5. Mercado y farmeo

Los precios del mercado viven en la página, no en `data/`, y tú no los ves. Se alimentan de
tres fuentes locales: **Auctionator** (precios anunciados), la **contabilidad TSM** (§6) y el
**diario del puente WoWForeverBridge** (abajo).

- Para activar el seguimiento: en el juego, hacer un **full scan** con Auctionator, luego
  `/reload`, y en **Mercado** → **Leer Auctionator.lua** conceder una vez la carpeta
  `WTF/Account/<cuenta>/SavedVariables` (no `Interface/AddOns/Auctionator`). También se admite
  una carpeta superior, con búsqueda acotada; si hay varias cuentas, elegir SavedVariables
  de la cuenta concreta. **Elegir otra carpeta** cambia esa preferencia.
- Con **Seguimiento automático** activo, el plugin sondea cada 30 segundos mientras Hermes
  esté abierto, incluso fuera de la pestaña Mercado. No abre selectores en segundo plano.
  Solo importa bytes distintos y válidos, fusionando el histórico local. Borrar precios
  pausa el sondeo para no repoblar lo borrado; se puede reanudar con el conmutador.
- **Diario del puente WoWForeverBridge**: un addon compañero (v1.3.0) captura cada escaneo de
  Auctionator en un diario por día (`WoWForeverBridge.lua`, SavedVariables `WoWForeverBridgeDB`)
  que sobrevive la poda de ~21 días de Auctionator. El plugin lo sondea con el mismo
  seguimiento automático (30 s) desde la misma carpeta concedida; no abre otro selector. Es
  **transporte, no exportador verificado**: sus precios se marcan **UNKNOWN** por diseño. Si el
  usuario pregunta por qué hay historial aunque Auctionator pode sus días, es el diario del
  puente. El addon se instala en el juego (la primera vez requiere reiniciar el cliente,
  `/reload` no basta) y la retención se configura con `/wfb days N` (1–60, por defecto 14);
  otros comandos: `/wfb capture`, `/wfb purge`, `/wfb` (estado).
- Los precios que solo estén en memoria del juego requieren `/reload` o cerrar sesión para
  llegar al disco. No confundir un sondeo sin cambios con un fallo del importador. También
  puede usar **Importar archivo .lua**, pero eso no concede acceso automático a su carpeta.
- Al reparar este flujo, verificar bytes con `readDataUrl` (hay blobs CBOR no UTF-8), cola
  compartida para importación manual/automática/borrado, revisiones leídas dentro de la cola
  y reintento si no se pudo guardar el histórico. `docs/DESKTOP.md` describe el diseño y
  `desktop/test/mercado-auto.mjs` prueba el ciclo de vida con Chromium y reloj controlado.
- Al corregir lifecycle, cancelar importaciones encoladas y comprobar `stopped` antes de
  la primera escritura; si el snapshot ya empezó a guardarse, terminar el historial sin
  publicar tras `dispose`, porque cortar entre ambos puede perder días. Probar con promesas
  bloqueadas, no solo invocar un poll después de descargar.
- Probar recuperación de carpeta revocada, limpieza de errores anteriores y fallos en la
  segunda fase del borrado: no prometer conservación de datos si el historial ya se vació
  o el commit quedó incierto. Mantener el rechazo de búsquedas incompletas/ambiguas.
- Si el panel dice **«Estado v2 inválido; no se escribió»**, comparar la etiqueta de reino del
  snapshot guardado con la del scan nuevo: Auctionator rotula el mismo servidor «PvP» o
  «PvP Horde» según la facción del personaje activo. Con identidad opaca (todo `UNKNOWN`) el
  nombre no separa pools, y la fusión duplicaba los ítems hasta pasar los 4 MiB de `writeText`.
  El plan conserva la etiqueta del scan nuevo, lo declara en `snapshot.warnings` y mueve el
  histórico al nombre nuevo con `mergeRows`. No recortar el store por debajo de
  `MIN_STORE_BYTES` (256 KiB): mejor fallar explícito que guardar un histórico vacío.
- Si el panel dice **«Bridge: too many entries (offset N)»**, el límite es del parser Lua, no del
  validador del plugin: el diario guarda ~75.000 entradas por día y la retención por defecto
  (14 días) pide ~1.050.000. Techo actual `ENTRIES_LIMIT` 1.200.000 con `MAX_BYTES` 8 MiB.
  Para medir sin exponer datos, parsear con una copia del parser de tope elevado que solo
  imprima conteos y tamaños.
- Antes de diagnosticar «SIN DATOS» en Subasta × Pawn, confirmar que el addon **instalado**
  tiene la cosecha: `grep -c pawnCatalogo .../Interface/AddOns/WoWForeverBridge/Pawn.lua`. El
  repo puede estar al día y el juego correr una copia vieja; copiar `addon/WoWForeverBridge/*`
  y pedir `/reload`.
- Verificar el arreglo en disco, no en la UI: `market-v2-{a,b}.json` debe avanzar de revisión cada
  30 s, con un solo reino y `history` conservando la serie de 14 días.
- Si el usuario te pega números de la página: `m` es el último mínimo unitario observado, en
  cobre (1 oro = 10000), no una venta. Oro por hora, ROI y ofertas son **estimaciones** con
  drops de Classic 1.12 y sin datos de población.

## 6. Mis ventas · contabilidad TSM

- Separa siempre las operaciones personales TSM de los precios anunciados Auctionator. La
  página importa ventas, compras, expiraciones y cancelaciones; tú no ves su contenido salvo
  que el usuario lo comparta. No leas SavedVariables reales para comprobarlo.
- Descubrir TSM automáticamente desde grants SDK: priorizar `auctionator-folder`, buscar
  nombre exacto hasta 120 directorios/6 niveles y rechazar ambigüedad/listado incompleto.
  Completar la búsqueda aun con coincidencia en raíz: una copia suelta no debe ganar sobre
  una cuenta anidada; leer solo después de probar unicidad (salvo SDK antiguo sin list).
  No obligar a elegir archivos ni a conceder otra carpeta si Auctionator ya tiene acceso.
  Sin permisos solo el usuario concede juego/WTF/SavedVariables una vez en la app; nunca
  abrir selector en fondo. No explorar desde herramientas del agente las cuentas reales.
- Fijar fuente en `tsm-location` (grant/ruta relativa). Ante archivo desaparecido o grant
  revocado no cambiar de cuenta. Excluir Interface/Data/Cache/Logs/.git y nunca leer Config,
  credenciales ni .bak. Seguimiento inicial activo cada 30 s fuera de Mercado; respetar una
  pausa guardada y el borrado. `/reload` o cerrar sesión escribe los datos del juego.
- Probar descubrimiento desde raíz con fixtures anidadas y concesión Auctionator en Chromium,
  comprobando cero selectores TSM y cero lecturas Config/.bak. Al añadir fuentes independientes,
  los tests de controles deben seleccionar por nombre, nunca el primer checkbox de la página.
- Preserva la sustitución **completa** del snapshot: TSM modifica cantidades acumulativas de
  filas existentes; anexar o deduplicar por hashes de fila duplicaría operaciones. Un archivo
  idéntico no reescribe; uno inválido no sustituye lo anterior. Los recortes del addon también
  se reflejan: no prometer un archivo histórico independiente del origen.
- Conserva `price` como cobre unitario y `quantity` como unidades totales: no multiplicar otra
  vez por `stackSize`. Revisa `Transactions.lua`/`Auctions.lua` del código del addon al cambiar
  esquemas, no el archivo privado del jugador. Descarta nombres y `profileKeys` en el parser.
- No llames beneficio neto a ingresos ni unidades expiradas/canceladas a ventas perdidas:
  pueden ser intentos repetidos del mismo objeto. Las medias son ponderadas por unidades;
  los importes de ventas por correo ya descuentan comisión (`floor((bid-ahcut)/quantity+0.5)`
  en `Ledger/Mail.lua`). No reconstruir bruto ni descontar comisión dos veces: faltan depósitos
  y fabricación para beneficio. La referencia Auctionator
  requiere mismo reino y objeto base sin variantes.
- TSM usa su propia cola, slots e índice (`tsm-a/b.json`, `tsm-pointer`); nunca reutilizar los
  snapshots de Auctionator. Verificar archivo e índice por lectura, bloquear tras índice
  incierto hasta Reabrir TSM; si falta el índice, comprobar ambos slots antes de asumir vacío
  y bloquear si sobreviven archivos (incluso corruptos), evitando sobrescribir respaldos.
  Comprobar `stopped` inmediatamente antes de la primera escritura.
  Si esta ya empezó, completar commit sin publicar tras descarga. Pausar al borrar y avisar
  honestamente de fallos. Borrado lógico, no borrado seguro del soporte.
- Probar `node --test tests/tsm.test.mjs` y `node desktop/test/tsm.mjs`: fixtures sintéticas,
  promesas bloqueadas, fallo tras commit del índice, readback corrupto, importación repetida,
  cantidades mutables, restauración y Chromium claro/oscuro. No confundir esto con validación
  de una cuenta real. Diseño y límites en `docs/DESKTOP.md`.

## Reglas

- Nunca leas tú archivos del juego, `WTF/Config.wtf`, credenciales ni rutas con nombres de
  cuenta, y nunca ejecutes Lua. Solo la app descubre los archivos dentro de permisos concedidos por el usuario; el agente no lee las cuentas.
- No prometas ingresos, drops ni tiempos: todo número del mercado o del farmeo es estimado.
- Si el plugin no está instalado: `hermes plugins install Grizaceo/wow-forever`.
