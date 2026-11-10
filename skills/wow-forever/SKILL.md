---
name: wow-forever
description: "Asiste a jugadores de WoW Forever (servidor privado Classic 1.12) con la guía desktop del plugin wow-forever de Hermes: sendas de clase/facción, ruta de niveles, armas, macros, loot de dungeons, mercado Auctionator local y recomendador de farmeo. Usar cuando el usuario juegue WoW Forever, pregunte por zonas/drops/precios/farmeo/niveles, o necesite ayuda para exportar Auctionator.lua o interpretar los datos del mercado."
version: 1.0.0
author: Cristóbal Muñoz
license: GPL-3.0-or-later
metadata:
  tags: "wow, warcraft, forever, classic, leveling, market, farming, auctionator, guide"
---

# WoW Forever — asistente de juego

El plugin **wow-forever** instala dos cosas en Hermes: una guía de juego
offline en la app de escritorio (entrada "WoW Forever" en la barra lateral,
ruta `/wow-hunter-guide`) y esta skill, para que el agente pueda asesorar
sobre WoW Forever con el mismo modelo mental que la guía.

## Qué es WoW Forever

Servidor privado de World of Warcraft basado en **Classic 1.12** (era
Cmangos) con contenido propio: ítems y mobs exclusivos tienen IDs >25000 y
no existen en Classic retail. Las mecánicas siguen el progresivo oficial de
Classic (niveles 1–60, factions, Dungeon/Heroic, ZG/AQ40/AQ20, Tier sets).

## Qué contiene la guía (pestañas)

- **Recomendador**: nivel, spec, arma preferida, continente, engineering y
  equipo equipado → arma ideal, ruta sugerida y prioridades del nivel.
- **Ruta**: progresión por zonas y bandas de nivel, con milestones.
- **Armas**: mejores armas por facción/nivel para la spec elegida.
- **Macros**: macros de clase listas para copiar.
- **Dungeons**: loot por dungeon/boss con fuentes del addon
  ForeverDungeonJournal.
- **Mercado local**: precios Auctionator importados + **recomendador de
  farmeo** (oro/hora estimado, ROI, ranking de zonas A/B, progresión por
  nivel, riesgo de facción, botón "Zona copada" para marcar competencia).
- **Extras/AH**: utilidades de casa de subastas.

Clases disponibles: **Hunter** (solo Horda: BM/MM/SV), **Warrior**
(Arms/Fury/Prot, ambos bandos) y **Shaman** (Elemental/Enhancement/
Restoration, ambos bandos). El progreso es manual y local a cada usuario.

## Cómo entran los datos (importante)

- **Mercado**: el usuario exporta `Auctionator.lua` (SavedVariables) desde
  su cliente WoW Forever y lo importa en la pestaña Mercado local. El plugin
  lo parsea offline; no hay carga manual de precios.
- **Personaje/progreso**: se marca a mano en la guía (nivel, armas,
  equipo). No hay export de estado de personaje desde addons.
- **Nada sale de la máquina**: la guía no hace red ni toca el juego. Los
  datos persisten en el almacenamiento local de Hermes del usuario.

## Cómo asistir

- Si el usuario pregunta "qué farmeo / dónde consigo X": mirá primero si
  tiene mercado importado; si no, explicale cómo exportar Auctionator.lua
  (full scan → `/reload` o relog → archivo en
  `WTF/Account/<cuenta>/SavedVariables/Auctionator.lua`). Jamás leas tú el
  WTF ni nombres de cuenta: el usuario selecciona el archivo en la app.
- Para precios: `m` es el último mínimo unitario observado (cobre; 1 oro =
  10000), NO mediana ni venta confirmada; `h/l/a` por día son máx/mín/
  cantidad ofertada. Fechas viejas no se rejuvenecen al importar.
- Para farmeo: oro/hora y ROI son **estimaciones aproximadas** — drops del
  emulador Classic 1.12 (no de Forever), tiempos por kill supuestos, sin
  datos de población real. La competencia se ajusta a mano ("Zona copada"
  o selector por zona).
- Para niveles: las zonas de la guía son rutas de leveo, no garantías de
  loot; el loot de dungeons es referencia por nivel de grupo.
- Cobertura realista del mercado: ~66% de los ítems del scan tienen fuente
  de farmeo; los exclusivos de Forever (IDs >25000) casi no tienen datos.

## Reglas duras

- Nunca ejecutes Lua ni abras `WTF/Config.wtf`, credenciales ni rutas con
  nombres de cuenta. El usuario exporta y selecciona archivos por su cuenta.
- No prometas ingresos ni liquidez: todo número del mercado/farmeo es una
  estimación etiquetada como tal en la app.
- Si el usuario no tiene el plugin instalado: `hermes plugins install
  Grizaceo/wow-forever` o instalar desde git en la app de escritorio.
