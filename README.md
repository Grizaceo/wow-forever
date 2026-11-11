# WoW Forever para Hermes

Guía offline de **World of Warcraft: Forever** dentro de Hermes: ruta de niveles,
armas, macros, dungeons, Legacy y un mercado con tus precios de Auctionator, más una
skill para que tu agente te asista mientras juegas.

## Estado

En desarrollo, rama por rama. Lo que funciona hoy:

- **Guías curadas** de Cazador (Horda), Guerrero y Chamán (ambos bandos), y la pestaña
  Legacy.
- **Mercado local**: importa tu `Auctionator.lua`, acumula historial por ítem, marca
  ofertas y recomienda zonas de farmeo según tu nivel y facción.
- **Skill del agente** `wow-forever`.

En construcción (ver `docs/MODELO-DATOS.md`):

- Cualquier personaje: las 10 razas, las 9 clases en ambas facciones y las 12
  profesiones, con datos generados desde fuentes publicadas (`data/`).
- Una mitad de escritorio hecha con componentes del SDK de Hermes. La actual muestra
  la app HTML dentro de un iframe aislado; funciona, pero no cumple todavía las reglas
  del catálogo de plugins.

WoW Forever es el juego oficial de Blizzard (cliente 1.60). Parte de los datos viene de
WoW Classic 1.12 y se marca como aproximada donde Forever puede diferir.

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
                                   │
            standalone/tools/build-desktop-plugin.py ──▶ desktop/plugin.js
```

- Las fuentes de datos están fijadas por versión y sha256 en `tools/fuentes.json`:
  CMaNGOS classic-db (commit `28ef625`), tablas del cliente Classic Era 1.15.9.70576 y
  del cliente WoW Forever 1.60.1.70888 (en inglés y español), vía wago.tools.
- Los generadores son deterministas: con las mismas entradas producen los mismos bytes.
  `standalone/tests/public-build.mjs` reconstruye `desktop/plugin.js` y comprueba que
  coincide con el versionado.
- Cada dato dice de dónde viene: generado de CMaNGOS 1.12, generado del cliente de
  Forever, o curado a mano.

Tests: `python3 -m unittest discover -s tests`, `node --test tests/` y los de
`standalone/tests/` (ver su README).

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
