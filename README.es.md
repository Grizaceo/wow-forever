# WoW Forever para Hermes

[English](README.md)

Guía offline de **World of Warcraft: Forever** dentro de Hermes, para cualquier raza, clase y
facción, con una skill para que tu agente responda con los mismos datos.

## Estado

- **En desarrollo**, en la rama `agent/claude-code/fuente-y-datos`. `main` todavía tiene la
  versión anterior, que solo cubría tres clases.
- Todavía no está en el catálogo de plugins de Hermes. Probado en Linux con Hermes Agent
  v0.23.0, que es la versión mínima.
- WoW Forever es el juego oficial de Blizzard (producto `wowf`, cliente 1.60), no un servidor
  privado. Este proyecto no tiene afiliación con Blizzard.

## Instalación

```sh
hermes plugins install Grizaceo/wow-forever --ref <commit de 40 caracteres>
hermes plugins enable wow-forever
```

La página **WoW Forever** aparece en la barra lateral de Hermes Desktop la próxima vez que se
abre la app. La skill `wow-forever:wow-forever` funciona en cualquier superficie de Hermes.

## Qué hace

- **Personaje**: facción, raza (las 10, Skyborne incluida), clase (las 9 en ambas facciones),
  nivel y profesiones. Marca las combinaciones nuevas de Forever, como Paladín no-muerto o
  Chamán enano.
- **Clase**: entrenadores de tu facción con coordenadas, hechizos por nivel, misiones de clase,
  y las armas y armaduras que puedes usar.
- **Ruta**: zonas para tu nivel con las misiones de tu facción, más las bandas de la guía curada
  si tu clase tiene una.
- **Profesiones**: recetas con su dificultad, reactivos y cómo se aprenden; costo y margen con
  tus precios; plan de subida; de dónde sale cada material, y los entrenadores del siguiente
  tramo.
- **Dungeons**: jefes en orden con su botín, filtro de lo que tu clase puede usar, y los 9
  dungeons nuevos de Forever con sus jefes.
- **Mercado**: importa tu `Auctionator.lua`, acumula el historial, marca ofertas y recomienda
  dónde farmear.
- **Guía curada** (Cazador de la Horda, y Guerrero y Chamán de ambas facciones) y **Legacy**.
- **Skill del agente**: responde preguntas como «soy Paladín no-muerto nivel 24, ¿dónde
  entreno?» o «¿qué subo de herrería con 120 de skill?» consultando los datos del plugin. El
  botón **Copiar perfil para el agente** de la pestaña Personaje le pasa tu personaje al chat.

La interfaz está en español, con un botón para inglés, en tema claro u oscuro. Cada dato dice si
viene de WoW Classic 1.12 (aproximado para Forever), del cliente de Forever o de la guía
curada. Lo que no está en ninguna fuente publicable se muestra como **sin datos**.

### Precios de Auctionator

1. En el juego, haz un **full scan** con Auctionator.
2. Escribe `/reload` o vuelve a entrar, para que el juego guarde los datos.
3. En la guía, ve a **Mercado** → **Leer Auctionator.lua**. La primera vez, Hermes abre su
   selector de carpetas: elige `WTF/Account/<tu cuenta>/SavedVariables`. Hermes recuerda ese
   permiso, y puedes revocarlo en **Capacidades → Plugins → Acceso a carpetas**. También puedes
   importar el archivo a mano con **Importar Auctionator.lua**.

Cada importación suma sus días al historial de cada ítem, aunque Auctionator solo guarde unas
tres semanas.

## Qué lee, qué guarda y qué ejecuta

- **Lee** únicamente `Auctionator.lua` dentro de la carpeta que concedes con el selector de
  Hermes (lo busca hasta 4 niveles de subcarpetas dentro de ella), y sus propios `data/`.
  El archivo se interpreta como datos: nunca se ejecuta Lua.
- **Guarda** tu perfil, el progreso de la guía y los precios normalizados en el almacenamiento
  propio del plugin, en tu máquina. Puedes borrarlos desde la app.
- **Sin red**: la página bloquea toda conexión (`connect-src 'none'`). No hay telemetría.
- **Sin procesos** ni acceso al juego en ejecución. La página no lanza nada.
- **La skill** no registra herramientas. Trae un script de Python de solo lectura,
  `skills/wow-forever/scripts/consultar.py`, que el agente corre con su propia terminal (bajo
  las aprobaciones de Hermes). Solo usa la biblioteca estándar, solo lee `data/` del plugin, no
  escribe archivos y no usa red.

## Cómo funciona

```
tools/fuentes.json ── tools/descargar-fuentes.py ──▶ ~/.cache/wow-forever-drops
   (versiones y sha256 fijados)                         │
                         tools/build-drop-data.py ◀──────┤──▶ tools/build-datos-juego.py
                                   │                                 │
                         standalone/drop-data.js                    data/*.json ──▶ skills/wow-forever/scripts/consultar.py
                                   │                                 │
                                   │                 tools/build-catalogo-mercado.py
                                   │                                 │
                                   │                  standalone/market-catalog.js
                                   └───────────────┬─────────────────┘
                        desktop/src/ (React + SDK) ── desktop/build.mjs ──▶ desktop/plugin.js

standalone/guide-*.js (curado) ── tools/build-referencias-skill.mjs ──▶ skills/wow-forever/references/*.md
```

- Las fuentes de datos están fijadas por versión y sha256 en `tools/fuentes.json`: CMaNGOS
  classic-db (commit `28ef625`), y las tablas del cliente Classic Era 1.15.9.70576 y del
  cliente WoW Forever 1.60.1.70888 (en inglés y español), vía wago.tools. El detalle está en
  `docs/MODELO-DATOS.md`.
- Los generadores son deterministas: con las mismas entradas producen los mismos bytes, y un
  test lo comprueba contra `data/MANIFEST.json`.
- La mitad de escritorio son componentes React del SDK de Hermes (`desktop/src/`), empaquetados
  sin minificar por esbuild en un solo `desktop/plugin.js`. `desktop/BUNDLE.json` guarda su
  sha256, y un test lo reconstruye y lo compara. Solo importa `@hermes/plugin-sdk` y React.
  Ver `docs/DESKTOP.md`.
- La página conserva el id interno de la versión anterior (`wow-hunter-guide`): Hermes guarda
  datos y permisos por id, así que el progreso, los precios y el permiso de carpeta se
  mantienen.
- La skill y la página comparten los datos y las reglas. Un test compara la dificultad de cada
  receta en el script de Python y en la lógica de la página.

Tests:

```sh
python3 -m unittest discover -s tests     # datos, lint de Hermes, bundle reproducible, skill
node --test tests/                         # lógica pura (perfil, crafteo, mercado, ruta, guía, referencias)
PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/navegador.mjs   # y desktop/test/vista-*.mjs
```

## Cómo se hizo

El mantenedor decidió el alcance, las fuentes de datos admitidas y qué se publica, y revisa cada
rama antes de fusionarla. El código lo escribieron agentes de IA (Claude Code y Devin) bajo esa
dirección. Lo verificado en cada paso queda en los tests del repo. No se verificó dentro del
juego: macros, rutas y estimaciones de oro por hora.

## Límites

- Los datos de 1.12 (misiones, entrenadores, botín, spawns) son una referencia: Forever cambió
  zonas, ítems y botín. El contenido nuevo de Forever que solo existe en el servidor no tiene
  todavía una fuente que se pueda publicar, y la guía lo muestra como **sin datos**. Eso
  incluye misiones nuevas, entrenadores de Paladín de la Horda y Chamán de la Alianza, la zona
  de inicio Skyborne, el botín de los dungeons nuevos y cómo se aprenden casi todas las
  recetas nuevas.
- Forever movió algunos mapas: las coordenadas de 1.12 en Mulgore, Eastern Plaguelands,
  Redridge y Stormwind pueden no coincidir con el juego.
- Oro por hora, ROI y ofertas son estimaciones sobre precios anunciados, no ventas.
- Las macros y rutas curadas no se probaron en el juego.
- Algunos ítems clásicos no traen nombre en español en el cliente esMX y se muestran en inglés.

## Licencia

GPL-3.0-or-later (`LICENSE`). Origen y licencia de cada dataset en `LICENSE-DATA.md`. World of
Warcraft y sus nombres son marcas de Blizzard Entertainment. Proyecto sin afiliación con
Blizzard y de uso no comercial.
