# Modelo de datos

Todo lo que muestran la página de Hermes Desktop y la skill del agente sale de los
archivos de `data/`. Los genera `tools/build-datos-juego.py` a partir de las entradas
fijadas en `tools/fuentes.json` (se bajan con `tools/descargar-fuentes.py`). Ninguno se
edita a mano: lo curado vive aparte y se declara como curado.

> **Alcance:** este documento describe los **datos curados/generados** de `data/` y el
> perfil del jugador. El **almacenamiento runtime** del mercado/historial (bundle v2,
> respaldo pre-v2 troceado, diario del puente WoWForeverBridge, rollback) se documenta
> en **`docs/DESKTOP.md`**.

## Fuentes y cómo se marcan

| Clave `f` | Qué es | Fidelidad a Forever |
|---|---|---|
| `cmangos-1.12` | CMaNGOS classic-db, commit fijado (GPL-3.0) | Referencia de 1.12: Forever puede diferir. La interfaz lo muestra como aproximado |
| `cliente-forever` | Tablas del cliente WoW Forever 1.60.1.70888 vía wago.tools, en inglés y `esMX` | Fiel en lo que el cliente define (razas, clases, recetas, ítems, zonas, jefes de dungeons). No incluye datos del servidor: spawns, entrenadores, botín |
| `curado` | Texto o tabla escrita a mano en el repo, con sus referencias | Tan fiel como su autor; cada pieza cita de dónde sale |

Cada archivo de `data/` lleva un bloque `meta`:

```json
{"meta": {"esquema": 1, "origen": "generado", "fuentes": ["cmangos-1.12", "cliente-forever"],
          "generador": "tools/build-datos-juego.py", "builds": {"cliente-forever": "1.60.1.70888"}}}
```

Cuando una colección mezcla fuentes, cada registro lleva su propio `f`. Los nombres
visibles van como `n: {"es": "...", "en": "..."}`; si falta el español se usa el inglés.
El dump de CMaNGOS no trae traducciones, así que los títulos de misión y los nombres de
NPC van solo en inglés; lo que viene del cliente (razas, clases, ítems, recetas, zonas,
jefes) sí trae español.

**Huecos explícitos.** Lo que debería existir y no tiene una fuente publicable no se
omite en silencio: va a una lista `huecos` con `{tema, clase?, faccion?, raza?, motivo}`
(`faccion` siempre `alianza` u `horda`).
Los tests fallan si una combinación válida queda sin dato y sin hueco declarado.

## Archivos

### `data/personaje.json`

- `facciones`: `alianza`, `horda`, con nombre.
- `razas`: por ID del cliente → `n`, `faccion`, `inicio` (zona y mapa de inicio de
  CMaNGOS para las 8 clásicas; `null` más un hueco para Skyborne).
- `clases`: por ID → `n`, `token` (`WARRIOR`…).
- `combinaciones`: `[[raza, clase, nueva]]` desde CharBaseInfo del cliente; `nueva`
  indica que no existía en 1.12 (no está en `playercreateinfo` de CMaNGOS).

### `data/clases.json`

Por clase:

- `entrenadores`: `{alianza: [...], horda: [...]}`, cada uno `{npc, n, zona, x, y}`
  (`cmangos-1.12`); `x`, `y` en porcentaje del mapa de la zona, como en el juego.
- `hechizos`: `[{spell, n, nivel, costo}]` enseñados por entrenadores de clase
  (`cmangos-1.12`; nombre del cliente cuando existe).
- `misiones`: `{alianza: [questId], horda: [questId]}` (misiones de clase).
- `competencias`: líneas de arma y armadura que la clase puede usar (`cliente-forever`).
- `huecos`: por ejemplo, Paladín de la Horda y Chamán de la Alianza no tienen
  entrenadores ni misiones en 1.12.

### `data/profesiones.json`

Por profesión (ID de SkillLine: 171 Alquimia, 164 Herrería, 333 Encantamiento,
202 Ingeniería, 182 Herboristería, 165 Peletería, 186 Minería, 393 Desuello,
197 Sastrería; secundarias 185 Cocina, 129 Primeros auxilios, 356 Pesca):

- `n`, `tipo` (`principal` o `secundaria`), `recoleccion` (bool).
- `entrenadores`: `{alianza, horda}` con `{npc, n, zona, x, y, max}`; `max` es el skill
  más alto que enseña.
- `recetas`: `[{spell, n, crea: [item, cantidad], reactivos: [[item, cantidad]...],
  rango: {aprende, amarillo, verde, gris}, como: "entrenador"|"receta"|"automatica"|"desconocido",
  receta_item, vendedores: {alianza, horda}, f}]`.
  - `crea` es `null` en los encantamientos: aplican un efecto, no crean un ítem.
  - `como`: el entrenador de 1.12 lista el hechizo que enseña la receta y se traduce
    al de la receta; `automatica` es una receta que se aprende sola al tomar la
    profesión (`AcquireMethod = 1` en el cliente). En Forever, el ítem-plan que enseña
    cada receta se deriva del cliente (`ItemEffect` TriggerType=6 LEARN + `ItemXItemEffect`
    + `Item.csv`): las recetas nuevas con plan pasan a `receta` con su `receta_item`.
    Solo quedan en `desconocido` las que el cliente no expone cómo se aprenden (dato del
    servidor: entrenador/loot/misión de Forever). El relleno es aditivo: no altera ninguna
    receta `cmangos-1.12`.
  - `amarillo` y `gris` vienen del cliente (`TrivialSkillLineRankLow/High`); `verde` es
    su punto medio (regla de Classic); `aprende` es el umbral de aprendizaje: requisito del
    entrenador (1.12) o `RequiredSkillRank` del ítem-plan (`ItemSparse` del cliente). En
    Forever `MinSkillLineRank` NO es el umbral (viene 1 en casi todas las recetas), no se
    usa. Si no se conoce, es `null`. Puede superar al `amarillo` (Forever rebalanceó los
    colores); esas anomalías quedan declaradas en `huecos`.
  - Entran las recetas del cliente que existen en 1.12 o que crean o usan ítems del
    rango de Forever (ID 240000 o más). Las del rango 200000–239999 son restos de
    Season of Discovery que trae el cliente y se excluyen. El recuento de excluidas
    queda en `meta`.
- `tiers`: `[{id, indice}]` — skilllines hijas de la profesión en el cliente
  (`SkillLine.ParentSkillLineID`/`ParentTierIndex`). Es la estructura de tiers del
  cliente, NO los tramos de rango (75/150/225/300), que siguen viniendo de los
  entrenadores de 1.12 (`max`) y pueden diferir en Forever.
- `huecos`: incluye los huecos de recetas de Forever (`adquisicion_forever`,
  `naranja_forever`), las anomalías de umbral (`umbral_sobre_amarillo`) y los planes
  Classic que el cliente reeditó (`plan_cliente_vs_cmangos`, se conserva CMaNGOS).

### `data/items.json`

`id → [es, en, calidad, nivel_req, nivel_item, venta_cobre, clase, subclase, ligado,
compra_cobre, vendedor, dps_x10]`; `compra_cobre` es el precio de compra al vendedor
(cliente), `vendedor` vale 1 si algún vendedor de 1.12 lo vende sin tope (reactivos como
hilo o viales), 2 si solo con stock limitado y 0 si ninguno, y `dps_x10` es el DPS de un
arma en 1.12 por 10 (0 si no es arma). Nombre y stats salen de ItemSparse del cliente
Forever; los ítems que el cliente tiene (Item.csv) pero sin nombre publicado los completa
CMaNGOS 1.12, y sus IDs quedan en `meta.ids_cmangos`. Sin el rango 200000–239999. Sirve
para nombrar los ítems importados de Auctionator, las recetas, el botín y las recompensas,
para el costo de vendedor y para auditar las guías curadas.

### `data/zonas.json`

- `zonas`: por ID de UiMap → `n`, `continente`, `niveles` (rangos oficiales de Classic,
  marcados `curado`), `faccion` (`alianza`, `horda`, `disputada`, `ciudad`).
  Las zonas nuevas de Forever salen del cliente con `niveles: null` y un hueco.
- `ciudades`: capitales con casa de subastas, por facción.
- `misiones_por_zona`: `{zona: {alianza: {n, min, max}, horda: {...}}}`: el esqueleto de
  la ruta de niveles por facción (`cmangos-1.12`).

### `data/misiones.json`

`questId → {t: {es, en}, nivel, min, zona, dungeon?, categoria?, faccion: "a"|"h"|"ah",
clases?, prof?, prev?, recompensas?}` (`cmangos-1.12`; títulos solo en inglés). `zona` sale
del área de la misión y, si no, de dónde está quien la da; `dungeon` es el mapa cuando la
misión es de un dungeon; `categoria` es el `ZoneOrSort` negativo (clase, profesión, evento);
`recompensas` son los ítems que da, fijos y a elegir.

### `data/dungeons.json`

- `clasicos`: por mapa → `n`, `niveles`, `jugadores`, `raid?`, `jefes: [{encuentro,
  orden, npc, n, botin: [[item, prob]]}]`. La lista y el orden de jefes vienen del
  cliente (`DungeonEncounter`); la criatura de cada encuentro, de `instance_encounters`
  de CMaNGOS o, si falta, de la criatura del mapa con el mismo nombre; el botín, de
  CMaNGOS (`cmangos-1.12`). Los jefes sin criatura vinculada (encuentros de grupo,
  invocados) quedan con `npc: null`, botín vacío y un hueco `botin`.
- `forever`: los 9 dungeons nuevos que nombra el buscador de grupos del cliente
  (`LFGDungeons`), con sus jefes del cliente y `botin: null`, más un hueco `botin`
  por cada uno: el botín es dato del servidor.

### `data/MANIFEST.json`

sha256 y bytes de cada archivo de `data/`, las fuentes y sus builds. Un test regenera
todo en una carpeta temporal y compara contra este manifiesto.

## Perfil del jugador

Se guarda en `ctx.storage` bajo la clave `perfil`:

```json
{"v": 1, "faccion": "horda", "raza": 5, "clase": 2, "nivel": 24,
 "profesiones": [164, 186], "secundarias": [185, 356], "reino": "Nombre del reino"}
```

Reglas, en `src/perfil.js` (módulo ES puro, sin DOM):

- `raza` y `clase` deben formar una combinación de `personaje.json`; `faccion` sale de
  la raza.
- `nivel` entre 1 y 60.
- Hasta 2 profesiones principales, sin repetir; secundarias, cualquier subconjunto de
  Cocina, Primeros auxilios y Pesca.
- `migrarPerfil(estadoViejo)` convierte el estado de la guía actual
  (`cls: "hunter"|"warrior"|"shaman"`, `fac`, `lvl`) sin perder nivel ni facción.

### Estado del personaje desde SimulationCraft

Clave `personaje-simc` en `ctx.storage` (módulo `desktop/src/simc.js`):

```json
{"v": 1, "origem": "addon", "texto": "<export SimC crudo>", "capturado": 1763300000,
 "erro": null}
```

- `origem`: `addon` (lo escribió `WoWForeverBridgeDB.personaje` dentro del juego) o
  `pegado` (lo pegó el usuario en la pestaña Personaje). `capturado` es unix;
  `erro` guarda el último fallo de captura del addon sin borrar el último export
  bueno.
- `texto` es el export **crudo** de SimulationCraft (nunca sale del plugin salvo
  que el usuario lo copie a mano). El parser puro `parsearSimc` lo convierte en un
  objeto con clase/nivel/raza/reino, stats de `# character_stats*`, equipo por slot
  (`# Nombre (ilvl)` + `slot=,id=…`), talentos, profesiones, mascota y una lista
  `desconhecidas` con todo lo no reconocido. Nunca evalúa el texto.
- `propostaPerfil(personagem, perfil, datos)` propone campos del export que difieren
  del perfil manual (nivel, reino, raza/facción solo si son válidas para la clase,
  profesiones); la vista pide confirmación antes de aplicar.

## Guías curadas

Las guías escritas a mano (hoy Cazador de la Horda y Legacy en `standalone/guide-*.js`;
las de Guerrero y Chamán se retiraron en la 2.0.0 porque nombraban ítems, jefes y razas que
no existen) se mantienen como capa curada encima de lo generado.
`tools/auditar-curado.mjs` las compara con `data/`: razas por clase y facción, lugares de
otras expansiones, ítems (tipo, calidad, nivel, DPS, vendedor, BoE, crafteo), botín por jefe
y probabilidad, misiones y sus recompensas, hechizos por nivel, y consejos escritos para un
personaje concreto. Lo que los datos no pueden decidir (talentos, habilidades del pet,
botín de cofres o de raros) queda en `tools/curado-revisado.json` con su motivo, y
`tests/curado-datos.test.mjs` falla con cualquier hallazgo nuevo sin revisar. Al pasar a la mitad Desktop nueva se
convierten a este esquema común:

```json
{"id": "cazador-horda", "tipo": "clase", "clave": 3, "faccion": "horda",
 "origen": "curado", "refs": ["..."],
 "secciones": [{"titulo": "...", "niveles": [10, 19], "texto": "...", "items": [], "aprox": false}]}
```

`tipo` puede ser `clase`, `profesion` o `zona`. La página muestra primero lo generado y
encima lo curado, con su etiqueta.
