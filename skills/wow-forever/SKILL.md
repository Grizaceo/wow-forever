---
name: wow-forever
description: "Asiste a jugadores de World of Warcraft: Forever (juego oficial de Blizzard, cliente 1.60, basado en Classic) con los datos del plugin wow-forever de Hermes: entrenadores, hechizos y misiones de clase, zonas por nivel, profesiones (recetas, plan de subida, materiales), dungeons con jefes y botín, ítems, guías curadas (Cazador, Guerrero, Chamán), Legacy y el mercado Auctionator local. Usar cuando el usuario juegue WoW Forever o pregunte por su personaje, dónde entrenar o subir de nivel, profesiones, drops, dungeons, precios o farmeo. Assists WoW Forever players (any race, class and faction) with the plugin's offline game data."
version: 2.0.0
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
| ¿Dónde consigo un ítem? ¿Qué es? | `item "venomstrike"` (o un id; `--detalle` con varios) |
| ¿Qué dungeons hago a mi nivel? | `dungeons --nivel 24` |
| Jefes y botín de un dungeon (útil para mi clase) | `dungeon "deadmines" --clase guerrero` |
| Buscar una misión | `mision "call of water" --faccion horda` (o un id) |
| ¿Qué datos faltan? | `huecos --tema entrenadores` |
| ¿De dónde salen los datos? | `fuentes` |

Razas, clases, facciones y profesiones se aceptan en español o inglés, con o sin tildes, o por
ID. Si el script dice que un nombre es ambiguo (por ejemplo, «cielonato» sin facción), pasa
`--faccion` o el ID.

## 3. Guías curadas

Las guías escritas a mano (Cazador de la Horda, y Guerrero y Chamán de ambas facciones, con ruta
por bandas, armas, dungeons, lista de subasta y macros) y la de **Legacy** están en
`references/`. Lee primero `references/INDICE.md` con
`skill_view(name="wow-forever:wow-forever", file_path="references/INDICE.md")` y luego solo el
archivo de la clase y facción del jugador. Las demás clases no tienen guía curada: dilo y usa
los datos generados.

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

Los precios importados de Auctionator viven en la página, no en `data/`, y tú no los ves.

- Para importarlos: en el juego, hacer un **full scan** con Auctionator, luego `/reload`, y en la
  guía ir a **Mercado** → **Leer Auctionator.lua**. La primera vez, Hermes pide elegir la carpeta
  `WTF/Account/<cuenta>/SavedVariables`. La guía solo lee ese archivo dentro de esa carpeta.
- Si el usuario te pega números de la página: `m` es el último mínimo unitario observado, en
  cobre (1 oro = 10000), no una venta. Oro por hora, ROI y ofertas son **estimaciones** con
  drops de Classic 1.12 y sin datos de población.

## Reglas

- Nunca leas tú archivos del juego, `WTF/Config.wtf`, credenciales ni rutas con nombres de
  cuenta, y nunca ejecutes Lua. El usuario elige sus archivos en la app.
- No prometas ingresos, drops ni tiempos: todo número del mercado o del farmeo es estimado.
- Si el plugin no está instalado: `hermes plugins install Grizaceo/wow-forever`.
