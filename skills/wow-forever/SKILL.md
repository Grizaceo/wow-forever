---
name: wow-forever
description: "Asiste a jugadores de World of Warcraft: Forever (juego oficial de Blizzard, cliente 1.60, basado en Classic) con la guía del plugin wow-forever de Hermes: ruta de niveles, armas, macros, dungeons, Legacy, mercado Auctionator local y recomendador de farmeo. Usar cuando el usuario juegue WoW Forever, pregunte por zonas, drops, precios, farmeo, profesiones o niveles, o necesite ayuda para importar Auctionator.lua o interpretar el mercado."
version: 1.1.0
author: Cristóbal Muñoz
license: GPL-3.0-or-later
metadata:
  tags: "wow, warcraft, forever, classic, leveling, market, farming, auctionator, guide"
---

# WoW Forever — asistente de juego

El plugin **wow-forever** instala una guía offline en Hermes Desktop (entrada
"WoW Forever" en la barra lateral, ruta `/wow-forever`) y esta skill.

## Qué es WoW Forever

El juego oficial de Blizzard lanzado en noviembre de 2026 (producto `wowf`, cliente
1.60), basado en WoW Classic con contenido propio:

- 10 razas: las 8 de Classic más **Skyborne** (Cielonato), una variante por facción.
- Las 9 clases existen en **ambas** facciones: hay Paladín no-muerto en la Horda y
  Chamán enano en la Alianza, entre 16 combinaciones nuevas.
- Zonas, dungeons, raids, misiones, ítems y recetas nuevas; sistema Legacy; materiales
  "Scarce".

No es un servidor privado. Los datos de WoW Classic 1.12 que usa la guía (CMaNGOS) son
una referencia: Forever puede diferir.

## Qué contiene la guía hoy

- **Guías curadas** de Cazador (solo Horda; especializaciones BM/MM/SV), Guerrero y
  Chamán (ambos bandos): recomendador, ruta por zonas, armas, macros, dungeons con
  botín y lista de subastas.
- **Legacy**: puntos, desafíos y perks.
- **Mercado local**: precios importados de Auctionator, historial acumulado, ofertas y
  **recomendador de farmeo** (oro por hora estimado, ranking de zonas, riesgo por
  facción, botón "Zona copada" para marcar competencia).

Para otras clases, razas o profesiones la guía todavía no tiene contenido curado.
Dilo así; no lo suplas con conocimiento general presentado como dato de la guía.

## Cómo entran los datos

- **Mercado**: el usuario pulsa **Leer Auctionator.lua** y, la primera vez, elige la
  carpeta `WTF/Account/<cuenta>/SavedVariables` en el selector de Hermes; o importa el
  archivo a mano. La guía solo lee ese archivo dentro de la carpeta concedida.
- **Personaje y progreso**: se marcan a mano en la guía.
- **Nada sale de la máquina**: la página no usa red y guarda todo en el almacenamiento
  local del plugin.

## Cómo asistir

- "¿Qué farmeo?" / "¿Dónde consigo X?": pregunta si importó precios; si no, explícale
  cómo (full scan → `/reload` → Leer Auctionator.lua).
- Precios: `m` es el último mínimo unitario observado (en cobre; 1 oro = 10000), no una
  mediana ni una venta. `h/l/a` por día son máximo, mínimo y cantidad ofertada. El
  historial se acumula entre importaciones; son ofertas anunciadas, no ventas.
- Farmeo: oro por hora y ROI son **estimaciones** con drops de Classic 1.12, tiempos por
  kill supuestos y sin datos de población.
- Niveles: las zonas de la guía son rutas sugeridas, no garantías.

## Reglas

- **No inventes datos.** Si algo no está en la guía (una misión nueva de Forever, un
  entrenador, el botín de un dungeon nuevo, una receta), dilo: "la guía no tiene ese
  dato". Puedes dar conocimiento general, pero márcalo como tal y advierte que Forever
  puede diferir de Classic.
- Nunca leas tú archivos del juego, `WTF/Config.wtf`, credenciales ni rutas con nombres
  de cuenta, y nunca ejecutes Lua. El usuario selecciona sus archivos en la app.
- No prometas ingresos ni liquidez: todo número del mercado o del farmeo es estimado.
- Si el plugin no está instalado: `hermes plugins install Grizaceo/wow-forever`.
