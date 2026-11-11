# WoW Forever para Hermes

Guía offline de **World of Warcraft: Forever** dentro de Hermes: ruta de niveles,
armas, macros, dungeons, Legacy y un mercado con tus precios de Auctionator, más una
skill para que tu agente te asista mientras juegas.

## Estado

En desarrollo, en la rama `agent/claude-code/fuente-y-datos`; `main` todavía tiene la
versión anterior. Lo que hace hoy:

- **Cualquier personaje**: eliges facción, raza (las 10, Skyborne incluida), clase (las 9 en
  ambas facciones), nivel y profesiones. La guía se adapta.
- **Clase**: entrenadores de tu facción con coordenadas, hechizos por nivel, misiones de clase
  y armas y armaduras que puedes usar.
- **Ruta**: zonas a tu nivel con sus misiones, y las bandas curadas cuando tu clase tiene guía.
- **Profesiones**: recetas con su dificultad, reactivos, cómo se aprenden, costo y margen con
  tus precios, plan de subida y de dónde sale cada material.
- **Dungeons**: jefes en orden con su botín, filtro de lo que tu clase puede usar, y los 9
  dungeons nuevos de Forever con sus jefes.
- **Mercado**: importa tu `Auctionator.lua`, acumula el historial, marca ofertas y recomienda
  dónde farmear.
- **Guía curada** (Cazador de la Horda, Guerrero y Chamán de ambas facciones) y **Legacy**.
- **Skill del agente** `wow-forever`.

Interfaz en español con botón para inglés, en tema claro u oscuro. Todo dato dice si viene de
WoW Classic 1.12 (aproximado para Forever), del cliente de Forever o de la guía curada, y lo
que no está en ninguna fuente publicable se muestra como **sin datos**.

WoW Forever es el juego oficial de Blizzard (cliente 1.60).

## Instalación

```sh
hermes plugins install Grizaceo/wow-forever
```

O desde Hermes Desktop: **Plugins → instalar desde git** con `Grizaceo/wow-forever`.
La mitad de escritorio aparece en la barra lateral como **WoW Forever** tras el
próximo arranque de la app. El agente funciona en cualquier superficie de Hermes.

## Precios de Auctionator

1. En el juego, haz un **full scan** con Auctionator.
2. `/reload` o vuelve a entrar, para que el juego guarde los datos.
3. En la guía → **Mercado local** → **Leer Auctionator.lua**. La primera vez, Hermes
   abre su selector de carpetas: elige `WTF/Account/<tu cuenta>/SavedVariables`.
   Hermes recuerda ese permiso; puedes revocarlo en **Capacidades → Plugins → Acceso
   a carpetas**. También puedes importar el archivo a mano con **Importar
   Auctionator.lua**.

Cada importación suma sus días al historial de cada ítem, aunque Auctionator solo
guarde unas tres semanas.

## Qué lee y qué guarda

- **Lee** únicamente `Auctionator.lua` dentro de la carpeta que concedes con el
  selector de Hermes (busca hasta 4 niveles de subcarpetas dentro de ella). Nada fuera
  de esa carpeta. El archivo se interpreta como datos: nunca se ejecuta Lua.
- **Guarda** el progreso de la guía y los precios normalizados en el almacenamiento
  propio del plugin en tu máquina. Puedes borrarlos desde la app.
- **Sin red**: la página bloquea toda conexión (`connect-src 'none'`), sin telemetría.
- **Sin procesos** ni acceso al juego en ejecución.
- La skill del agente no trae herramientas propias: no lee archivos ni usa red por su
  cuenta.

## Cómo funciona

```
tools/fuentes.json ── tools/descargar-fuentes.py ──▶ ~/.cache/wow-forever-drops
   (versiones y sha256 fijados)                         │
                         tools/build-drop-data.py ◀──────┤──▶ tools/build-datos-juego.py
                                   │                                 │
                         standalone/drop-data.js                    data/*.json
                                   │                                 │
                                   │                 tools/build-catalogo-mercado.py
                                   │                                 │
                                   │                  standalone/market-catalog.js
                                   └───────────────┬─────────────────┘
                        desktop/src/ (React + SDK) ── desktop/build.mjs ──▶ desktop/plugin.js
```

- Las fuentes de datos están fijadas por versión y sha256 en `tools/fuentes.json`:
  CMaNGOS classic-db (commit `28ef625`), tablas del cliente Classic Era 1.15.9.70576 y
  del cliente WoW Forever 1.60.1.70888 (en inglés y español), vía wago.tools.
- Los generadores son deterministas: con las mismas entradas producen los mismos bytes.
- La mitad de escritorio son componentes React del SDK de Hermes (`desktop/src/`), empaquetados
  sin minificar por esbuild en un solo `desktop/plugin.js`; `desktop/BUNDLE.json` guarda su
  sha256 y un test lo reconstruye y compara. Solo importa `@hermes/plugin-sdk` y React. Ver
  `docs/DESKTOP.md`.
- Mismo id interno que la versión anterior (`wow-hunter-guide`): Hermes guarda los datos y
  permisos por id, así que el progreso, los precios y el permiso de carpeta se conservan.
- Cada dato dice de dónde viene: generado de CMaNGOS 1.12, generado del cliente de
  Forever, o curado a mano.

Tests:

```sh
python3 -m unittest discover -s tests     # datos, lint de Hermes, bundle reproducible
node --test tests/                         # lógica pura (perfil, crafteo, mercado, ruta, guía)
PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/navegador.mjs   # y desktop/test/vista-*.mjs
```

## Cómo se hizo

El mantenedor decidió el alcance, las fuentes de datos admitidas y qué se publica;
revisa cada rama antes de fusionarla. El código lo escribieron agentes de IA
(Claude Code y Devin) bajo esa dirección. Lo verificado en cada paso queda en los
tests del repo. No se verificó dentro del juego: macros, rutas y estimaciones de oro
por hora.

## Límites

- Los datos de 1.12 (misiones, entrenadores, botín, spawns) son una referencia: Forever
  cambió zonas, ítems y botín. El contenido nuevo de Forever que solo existe en el
  servidor (misiones nuevas, entrenadores de Paladín de la Horda y Chamán de la
  Alianza, zona de inicio Skyborne, botín de los dungeons nuevos) no tiene todavía una
  fuente que se pueda publicar: la guía lo muestra como **sin datos**.
- Oro por hora, ROI y ofertas son estimaciones sobre precios anunciados, no ventas.
- Las macros y rutas curadas no se probaron en el juego.

## Licencia

GPL-3.0-or-later (`LICENSE`). Origen y licencia de cada dataset en `LICENSE-DATA.md`.
World of Warcraft y sus nombres son marcas de Blizzard Entertainment. Proyecto sin
afiliación con Blizzard y de uso no comercial.
