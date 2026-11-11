# Modelo de datos

Todo lo que muestran la página de Hermes Desktop y la skill del agente sale de los
archivos de `data/`. Los genera `tools/build-datos-juego.py` a partir de las entradas
fijadas en `tools/fuentes.json` (se bajan con `tools/descargar-fuentes.py`). Ninguno se
edita a mano: lo curado vive aparte y se declara como curado.

## Fuentes y cómo se marcan

| Clave `f` | Qué es | Fidelidad a Forever |
|---|---|---|
| `cmangos-1.12` | CMaNGOS classic-db, commit fijado (GPL-3.0) | Referencia de 1.12: Forever puede diferir. La interfaz lo muestra como aproximado |
| `cliente-forever` | Tablas del cliente WoW Forever 1.60.1.70888 vía wago.tools, en inglés y `esMX` | Fiel en lo que el cliente define (razas, clases, recetas, ítems, zonas). No incluye datos del servidor: spawns, entrenadores, botín |
| `curado` | Texto o tabla escrita a mano en el repo, con sus referencias | Tan fiel como su autor; cada pieza cita de dónde sale |

Cada archivo de `data/` lleva un bloque `meta`:

```json
{"meta": {"esquema": 1, "origen": "generado", "fuentes": ["cmangos-1.12", "cliente-forever"],
          "generador": "tools/build-datos-juego.py", "builds": {"cliente-forever": "1.60.1.70888"}}}
```

Cuando una colección mezcla fuentes, cada registro lleva su propio `f`. Los nombres
visibles van como `n: {"es": "...", "en": "..."}`; si falta el español se usa el inglés.

**Huecos explícitos.** Lo que debería existir y no tiene una fuente publicable no se
omite en silencio: va a una lista `huecos` con `{tema, clase?, faccion?, raza?, motivo}`.
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
  (`cmangos-1.12`).
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
  rango: {aprende, amarillo, verde, gris}, como: "entrenador"|"receta"|"desconocido",
  receta_item, vendedores: {alianza, horda}, f}]`.
  - `amarillo` y `gris` vienen del cliente (`TrivialSkillLineRankLow/High`); `verde` es
    su punto medio (regla de Classic); `aprende` es el requisito del entrenador o del
    objeto receta. Si no se conoce, es `null`.
  - Entran las recetas del cliente que existen en 1.12 o que crean o usan ítems del
    rango de Forever (ID 240000 o más). Las del rango 200000–239999 son restos de
    Season of Discovery que trae el cliente y se excluyen. El recuento de excluidas
    queda en `meta`.
- `huecos`.

### `data/items.json`

`id → [es, en, calidad, nivel_req, nivel_item, venta_cobre, clase, subclase, ligado]`
desde ItemSparse e Item del cliente, sin el rango 200000–239999. Sirve para nombrar los
ítems importados de Auctionator, las recetas y el botín, y para el costo de vendedor.

### `data/zonas.json`

- `zonas`: por ID de UiMap → `n`, `continente`, `niveles` (rangos oficiales de Classic,
  marcados `curado`), `faccion` (`alianza`, `horda`, `disputada`, `ciudad`).
  Las zonas nuevas de Forever salen del cliente con `niveles: null` y un hueco.
- `ciudades`: capitales con casa de subastas, por facción.
- `misiones_por_zona`: `{zona: {alianza: {n, min, max}, horda: {...}}}`: el esqueleto de
  la ruta de niveles por facción (`cmangos-1.12`).

### `data/misiones.json`

`questId → {t: {es, en}, nivel, min, zona, faccion: "a"|"h"|"ah", clases?, prof?, prev?}`
(`cmangos-1.12`; títulos en español de `locales_quest`).

### `data/dungeons.json`

- `clasicos`: por mapa → `n`, `niveles`, `jugadores`, `jefes: [{npc, n, botin: [[item,
  prob]]}]` (`cmangos-1.12`).
- `forever`: los mapas de instancia nuevos del cliente, con nombre y sin jefes ni
  botín, más un hueco por cada uno.

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

## Guías curadas

Las guías escritas a mano (hoy Cazador, Guerrero y Chamán en `standalone/guide-*.js`) se
mantienen como capa curada encima de lo generado. Al pasar a la mitad Desktop nueva se
convierten a este esquema común:

```json
{"id": "cazador-horda", "tipo": "clase", "clave": 3, "faccion": "horda",
 "origen": "curado", "refs": ["..."],
 "secciones": [{"titulo": "...", "niveles": [10, 19], "texto": "...", "items": [], "aprox": false}]}
```

`tipo` puede ser `clase`, `profesion` o `zona`. La página muestra primero lo generado y
encima lo curado, con su etiqueta.
