# Guía curada: Legacy — puntos de cuenta y perks (WoW Forever)

Origen: **curado** (escrito a mano en el repo wow-forever, `standalone/guide-legacy.js`).

Sistema "Legacy" lanzado con WoW: Forever (nov-2026, cliente oficial 1.60.x; lanzamiento del juego: 5-nov-2026).

## Fuentes

- wowfdb.com/legacy/ — datos del cliente POST-LAUNCH build 1.60.1.70888: los 21 perks con valores POR RANGO de los 3 árboles, costo por rango, gates de columna (5/10 pts por árbol) y perks enlazados.
- foreverdb.net/article/legacy-system-explained — cliente build 1.60.1.70205 + posts de Blizzard: 65 challenges, cap de 16 pts/personaje, track hasta nivel 90, máx ~29 pts que un solo PJ puede ganar, desbloqueo con el primer punto ganado, Talented = 5 ranks.
- zephras.com/forever + wowforever.gg + wowforevertalentcalculator.org — mismos datos del cliente (builds 70425+): confirman gates y prereqs.
- thewowdb.com/wow-forever/legacy-points/ — tablas del cliente BETA 1.60.1.70338 (65 ranks; post-launch son 69 con Talented en 5).
- azeroth.wiki/forever/legacy + /forever/guides/legacy-* — guía post-launch: Progress Track (15/25/40/55 → Innkeeper Wiley en Ratchet), tecla Y.
- warcraftmaps.com/guides/scarce-materials + /gold/{herb,mining,skinning}-spots — cliente 1.60.1.70685 + spawn data Classic: los 9 materiales "Scarce", qué craftean y hotspots (SIN drop rates).
- mmonster.co/wow-forever/guides/farming/scarce-materials — loot records del beta (Wowhead ForeverDB): bestias que sueltan Pristine Leather/Hide.
- theforeverguides.com/professions/{ore,herb,leather,skinning}-farming/ — rutas de skill por zona (beta datamined + Wowhead Forever), bandas de leather/herb por nivel de bestia.
- github.com/ClassicWoWCommunity/forever-bugs issue #375 + foros de Blizzard — REGLA DE NIVEL de escasos: el tier depende del NIVEL DEL PERSONAJE (≤25 → tier 1, ≥26 → tier 2; límite del tier 3 sin confirmar). Testeado exhaustivamente en beta; Blizzard NO lo confirmó oficialmente.

## Correcciones respecto a los datos beta

- Talented: beta lo listaba como 1 rank; post-launch son 5 ranks (cada rango adelanta el inicio de talentos de clase un nivel: 9→5).
- Reinforce: beta texto sugería -20%; los rangos reales son 8/16/24/32/40%.
- Ranks totales: beta 65 → post-launch 69 (Talented +4).

## Aún sin confirmar

- Drop rates exactos de escasos y si escalan con el skill del gatherer.
- Nivel exacto donde cambia tier 2 → tier 3 (probablemente ~46, sin confirmar).
- Zonas exactas de Rosecap/Stranglevine/Bauxite/Pitchblende/Pristine Scale.
- Si el perk enlazado necesita rango máximo o solo estar aprendido (foreverdb asume rango máximo; los archivos del juego solo piden abrirlo).

## Puntos de cuenta

- Los **Legacy Points** se ganan a nivel **cuenta** completando **Legacy Challenges** (tipo achievements). Cada personaje gasta desde ese total común: lo que gasta uno **no** le quita puntos a los demás. Un class trainer puede resetear los perks.
- Cada personaje puede colocar **máx. 16 puntos** (cap de temporada). El total ganado puede ser 0–65; un solo personaje puede llegar a ganar ~29 como máximo. Con más de 16 ganados, cada personaje sigue pudiendo gastar solo 16.
- Hay **3 árboles** de perks: **Adventure**, **Resourcefulness** y **Professions**. Cada rango cuesta **1 punto** (verificado en el cliente post-launch). En el árbol: clic izquierdo agrega un rango, clic derecho lo quita. Nada se confirma hasta pulsar **Apply Changes**.
- El panel se desbloquea al ganar tu **primer Legacy Point** — para la mayoría, el primer personaje en **nivel 25**. Tecla por defecto: **Y** (Options → Keybindings → Toggle Legacy Pane).
- El **Progress Track** muestra el total de puntos ganados y la recompensa de cada umbral (15/25/40/55; el track llega a 90); se reclama en **Innkeeper Wiley, Ratchet**.

## Progress Track

| Puntos | Recompensa | Qué es |
|---|---|---|
| 15 | Holstered Replica Ironforge Air Rifle | Juguete de tiroteo: vos y otros jugadores con la réplica pueden stunearse; Even lleva el marcador. |
| 25 | Spectral Bear Cub | Compañero espectral pequeño que te sigue. |
| 40 | Spectral Bear Tabard | Tabardo con temática de oso espectral. |
| 55 | Reins of the Spectral Bear | Mount épico de oso espectral, +100% velocidad de carrera. |

Reclamo en Innkeeper Wiley, Ratchet. Los umbrales son de puntos GANADOS por la cuenta, no los 16 que puede gastar cada personaje.

## Legacy Challenges

65 challenges = ~65 puntos ganables (verificado en cliente post-launch; el beta listaba 131 achievements por duplicados). Cada personaje gasta su propio cupo de 16 desde ese total.

### Clases

**~27 pts** · 9 clases × 3 hitos — 1 punto cada uno, primera vez

- **Novice** — llegar a nivel 25 con la clase
- **Experienced** — llegar a nivel 45 con la clase
- **Master** — llegar a nivel 60 con la clase

Tu clase actual se resalta abajo. Con alts de otras clases se completan las 9.

### Aventura

**~2 pts** · Misiones y logros de mundo

- **Lord Valthalak Laid to Rest** — questline de Upper Blackrock Spire (An Earnest Proposition → Saving the Best for Last)
- **Explorer** — tener un personaje con el achievement Explore Azeroth
- **Beta (16 pts)** — premio único por jugar la beta — ya no aplica post-launch

El cliente lista cada requisito dos veces (131 achievements / 66 textos en beta); no está claro por qué.

### Dungeons (Spelunker)

**~3 pts** · 3 challenges: hay que matar al boss final de CADA dungeon del set, en un solo personaje

- **Novice Spelunker · 6 dungeons (nv ~13–30)** — Ragefire Chasm *o* Hall of Thanes · Ruins of Lordaeron · Wailing Caverns · The Deadmines · Shadowfang Keep · Excavation Site: Wetlands
- **Experienced Spelunker · 10 dungeons (nv ~24–46)** — City of Dalaran · Blackfathom Deeps · Gnomeregan · The Drowned City · Scarlet Monastery (4 alas) · Razorfen Krawl · Krol'dok Stronghold
- **Master Spelunker · 17 dungeons (nv ~37–62)** — Razorfen Downs · Uldaman · Zul'Farrak · Maraudon · Alcaz Prison · Temple of Atal'Hakkar · Blackrock Depths · Blackmaw Hold · Lower+Upper Blackrock Spire · Scholomance · Stratholme (Live y Dead) · Dire Maul (E/N/W) · The Shaper's Terrace

City of Dalaran, The Drowned City, Krol'dok Stronghold, Alcaz Prison, Blackmaw Hold, Shaper's Terrace y Hall of Thanes son dungeons NUEVOS de Forever — no existen en Classic.

### PvP

**~12 pts** · Rangos de honor, reputaciones y Season Journey

- **Rangos de honor (5 pts)** — Sergeant · Knight-Lieutenant/Blood Guard · Lieutenant-Commander/Champion · Field Marshal/Warlord · Grand Marshal/High Warlord
- **Reputaciones BG (4 pts)** — exaltado con Frostwolf/Stormpike (AV) · Defilers/League of Arathor (AB) · Warsong Outriders/Silverwing (WSG) · Darkspear Raiders/Theramore (DSI)
- **Field of Honor (3 pts)** — semanas 4, 7 y 10 del journey

Los rangos alternativos (Horda/Alianza) valen lo mismo.

### Raids

**~3 pts** · Encuentros de raid

- **Conqueror of the Wilds** — encuentros de Hyjal Summit
- **Conqueror of the Deeps** — encuentros de Barrow Deeps
- **Conqueror of the Lair** — derrotar a Onyxia

Requieren nivel 60 y grupo.

### Oficios de craft

**~18 pts** · 6 profesiones de creación × 3 hitos de skill

- **150 skill** — Journeyman — Alchemy, Blacksmithing, Enchanting, Engineering, Leatherworking, Tailoring (6 pts)
- **225 skill** — Expert — las mismas 6 (6 pts)
- **300 skill** — Artisan — las mismas 6 (6 pts)

**Herbalism, Mining, Skinning, Cooking, Fishing y First Aid NO dan puntos** — los hitos de skill solo existen para los 6 crafts. Recolección ≠ puntos directos.

## Árboles de perks

### Professions

recolección, crafts, pesca y vendors · 23 ranks

- **Working Overtime** — skill · 5 ranks · req: libre — +4/8/12/16/20% a la probabilidad de ganar skill en cualquier tradeskill primario, secundario o de clase.
- **Bountiful Harvest** — recolección · 5 ranks · req: libre — Descubrís **20/40/60/80/100% más materiales escasos** (Scarce) de Mining, Herbalism y Skinning.
- **Master Chef** — craft · 5 ranks · req: 5 pts en Professions — 10/20/30/40/50% de probabilidad de resultado extra al cocinar.
- **Luremaster** — pesca · 2 ranks · req: 5 pts en Professions — 25/50% de pez extra al pescar con carnada activa.
- **Bartering** — vendors · 2 ranks · req: 5 pts en Professions — -5/10% al precio de **ítems** de todos los vendors (no aplica a training ni repairs).
- **Performance Bonus** — crates · 3 ranks · req: 5 pts + Bountiful Harvest 5 — 5/10/15% de recibir el doble de Merchant's Favor al entregar crates a la ACA / Durotar Supply.
- **Dedicated Study** — skill · 1 ranks · req: 10 pts + Bartering 2 — +1 skill a tu tradeskill más bajo (primario/secundario). Si todo está en 300: 2–4 Esencias Elementales al azar.

### Adventure

leveling, quests y viaje · 23 ranks

- **Well Rested** — descanso · 5 ranks · req: libre — +4/8/12/16/20% a la XP de descanso acumulada y a su tope.
- **Thrill of Adventure** — combate · 5 ranks · req: libre — Recuperás 1/2/3/4/5% de tu HP y maná máx en 10s cada vez que das el killing blow a un enemigo no trivial. No en dungeons/raids/BGs.
- **High Alert** — pvp · 2 ranks · req: 5 pts en Adventure — Detectás stealth como si tuvieras +1/+2 niveles. Inefectivo en Battlegrounds.
- **Talented** — talentos · 5 ranks · req: 5 pts + Well Rested 5 — Los talentos de clase empiezan antes: rango 1 = lvl 9 … rango 5 = lvl 5 (el total sigue capeado en 51).
- **Field Guide** — camp · 3 ranks · req: 5 pts en Adventure — -8/17/25% de cooldown al agregar features de campamento.
- **Field Medicine** — ventas · 2 ranks · req: 5 pts en Adventure — -5/10s a la duración del efecto Recently Bandaged al usar vendas. No en dungeons/raids/BGs.
- **Frequent Flier** — viaje · 1 ranks · req: 10 pts + Field Guide 3 — -50% al costo de flight paths y tu mount de FP vuela 20% más rápido.

### Resourcefulness

economía, reputación y honor · 23 ranks

- **Gourmand** — comida · 3 ranks · req: libre — +33/67/100% a la duración de los buffs de comida.
- **The Quick and the Dead** — muerte · 2 ranks · req: libre — +5% velocidad muerto por 1 min → +10% por 2 min; tras resucitar, hechizos útiles sin costo de recurso por el mismo tiempo (o hasta entrar en combate).
- **Reinforce** — durabilidad · 5 ranks · req: libre — -8/16/24/32/40% de pérdida de durabilidad al morir.
- **For Great Honor** — pvp · 5 ranks · req: 5 pts en Resourcefulness — +2/4/6/8/10% a los Honor Points ganados.
- **Permanence** — party · 2 ranks · req: 5 pts + Gourmand 3 — Buffs de party/raid de stats largos duran +50/100%; el descanso en camp también +50/100%.
- **Diplomat** — rep · 5 ranks · req: 5 pts en Resourcefulness — +2/4/6/8/10% a las ganancias de reputación.
- **Reagent Economy** — reagents · 1 ranks · req: 10 pts + Quick and the Dead 2 — Tus habilidades de clase ya no requieren reagents comprables a vendors (los soul shards de Warlock siguen haciendo falta).

Verificado en el cliente post-launch (builds 70205/70425/70888): cada rango = 1 punto. Los perks se abren por columnas: los de columna 2 piden 5 pts en el árbol, los de columna 3 piden 10 pts, y algunos además necesitan otro perk a rango máximo (marcado en req). El orden de desbloqueo es el listado; un perk bloqueado no puede financiar su propio desbloqueo.

## Materiales escasos

- **Frilled Lichen** — Herbalism · ilvl 25
  → Cerulean Dye · Alchemy (amarillo 50): 2× hierba + vial · 131 recetas, 108 Tailoring
  recetas desde skill 50 · hierbas nv 15–100 (Earthroot/Mageroyal/Briarthorn/Bruiseweed) · solo PJ ≤25 según la beta
- **Rosecap** — Herbalism · ilvl 45
  → Magenta Dye · Alchemy (amarillo 130) · 62 recetas, 52 Tailoring
  recetas desde skill 130 · sin fuente confirmada en beta · tier 2 (PJ ≥26)
- **Stranglevine** — Herbalism · ilvl 60
  → Viridian Dye · Alchemy (amarillo 230) · 15 recetas
  recetas desde skill 230 · sin fuente confirmada · tier 3
- **Pyrite** — Mining · ilvl 25
  → Sulfuric Acid · Alchemy (amarillo 50) · 42 recetas, 30 Blacksmithing · Pyrite directo: 12 recetas, 9 Tailoring
  recetas desde skill 50 · reportes: vetas Copper–Iron · solo PJ ≤25 según la beta
- **Bauxite** — Mining · ilvl 45
  → Sandpaper · Engineering (amarillo 130): 2× Bauxite + lienzo · 27 recetas, 25 Blacksmithing
  recetas desde skill 130 · reportes: vetas Gold–Mithril · tier 2
- **Pitchblende** — Mining · ilvl 60
  → Azerothium Bar · Mining + Carbón · 13 recetas (armas top-end)
  recetas desde skill 275 · reportes: vetas Truesilver+ · tier 3
- **Pristine Leather** — Skinning · ilvl 25
  → se usa directo · 126 recetas: 80 Leatherworking · 30 Blacksmithing · 16 Tailoring · primera a skill 80
  bestias nv ~11–26 · zonas: Westfall, Barrens, Darkshore, Loch Modan (+WC, SFK, Duskwood, Silverpine, Redridge) · solo PJ ≤25 según la beta
- **Pristine Hide** — Skinning · ilvl 45
  → se usa directo · 46 recetas (43 Leatherworking)
  bestias nv 25–34 · Kraul Bat (RFK) · Maddened Rotclaw (Wetlands) · Scarlet Tracking Hound (Scarlet Monastery) · Aku'mai Snapjaw (BFD) · tier 2
- **Pristine Scale** — Skinning · ilvl 60
  → se usa directo · 16 recetas (12 Leatherworking) · primera a skill 235
  sin fuente confirmada — el beta capaba en nv 30 · tier 3

Son bonus drops de nodos/menas/cadáveres NORMALES de tu oficio — no hay nodos especiales. REGLA DE NIVEL (testeada exhaustivamente en beta, bug report #375; Blizzard NO la confirmó): el tier de escaso depende del NIVEL DEL PERSONAJE, no del mob ni del skill ni de la zona — PJ ≤25 solo consigue tier 1 (PL/FL/Pyrite), PJ ≥26 pasa a la tabla tier 2 (PH/Rosecap/Bauxite). Implicación, si la regla se confirma: un personaje de nivel 26 o más ya no consigue Pristine Leather ni Frilled Lichen (quedan para un alt de nivel 25 o menos) y en Skinning le toca Pristine Hide. Drop rates exactos y el límite del tier 3 siguen sin confirmar (approx).

## Dónde farmear por oficio

### Skinning

- **Light Leather · beasts nv 6–25 (mejor 11–20)** — nv 1–20 · ambas facciones
  Zonas iniciales · Durotar · The Barrens · Westfall · Darkshore · Silverpine · Redridge · Loch Modan · Wetlands
  Warmup de Skinning; vendor vale hasta ~20-25 según la guía de oro. Top beta: Black Dragon Whelp (Redridge 17-18), Starving/Rabid Dire Wolf (Duskwood 19-21), Great Goretusk (Redridge 16-17), Young Wetlands Crocolisk (Wetlands 21-22).
- **Medium Leather · beasts nv 16–35 (mejor 21–30)** — nv 20–30 · ambas facciones
  Darkshore · Loch Modan · The Barrens (Field of Giants oeste — la mejor zona del juego para este cuero) · Ashenvale · Hillsbrad · Duskwood · Wetlands
  Las bestias nv 21-30 dan Medium Leather; con un personaje de nivel 26 o más, además, los escasos de tier 2 (regla de la beta, sin confirmar).
- **Heavy Leather · beasts nv 26–45 (mejor 31–40)** — nv 30–45 · ambas facciones
  Arathi Highlands · Desolace · Stranglethorn Vale · Wetlands · Duskwood
  Siguiente tier de cuero normal; también Thick Leather desde beasts nv 36+ (STV, Tanaris, Feralas, Hinterlands, Dustwallow).
- **Thick → Rugged Leather · beasts nv 36–60** — nv 45–60 · ambas facciones
  Stranglethorn · Tanaris · Feralas · The Hinterlands · Dustwallow Marsh (Thick) → Un'Goro · Felwood · Winterspring · Burning Steppes · Azshara · Silithus (Rugged)
  Tier alto; Rugged pide beasts nv 46-60.
- **★ Pristine Leather (escaso tier 1) — PJ ≤25 según la beta** — nv 1–25 · ambas facciones
  Westfall · The Barrens (38% de los loots del beta) · Darkshore · Loch Modan · Wailing Caverns · Shadowfang Keep · Duskwood · Silverpine · Redridge
  Bestias nv ~11–26. Según la regla de nivel de la beta (sin confirmar), un personaje de nivel 26 o más ya no lo consigue: farmealo con un alt de nivel 25 o menos y despellejá también las bestias grises.
- **★ Pristine Hide (escaso tier 2) — PJ ≥26 según la beta** — nv 26–34 · ambas facciones
  Razorfen Krawl (Kraul Bat, Sur del Barrens) · Wetlands (Maddened Rotclaw) · Scarlet Monastery (Scarlet Tracking Hound, Tirisfal) · Blackfathom Deeps (Aku'mai Snapjaw)
  Bestias nv 25–34. Según la beta, es el escaso de los personajes de nivel 26 o más; hubo pocos registros.
- **★ Pristine Scale (escaso tier 3)** — nv 35–60 · ambas facciones
  sin confirmar
  Ninguna fuente lo vio caer (beta cap nv 30). Si existe, probablemente bestias de tier alto.

### Herbalism

- **Peacebloom · Silverleaf (skill 1)** — nv 1–15 · ambas facciones
  Durotar · The Barrens · Dun Morogh · Mulgore · Westfall
  Hierbas de entrada; Peacebloom en Thorn Hill oeste y Sen'jin.
- **Earthroot (skill 15)** — nv 15–25 · ambas facciones
  The Barrens (Merchant Coast, NE de Thorn Hill, Sur de Ratchet — top mundial) · Westfall · Dun Morogh · Teldrassil
  El Barrens es LA zona de hierbas de la Horda.
- **Mageroyal (skill 50)** — nv 25–40 · ambas facciones
  The Barrens (261 puntos — zona #1, Lushwater Oasis, Sludge Fen) · Ashenvale · Darkshore · Westfall
  Mageroyal y Earthroot conviven en el Barrens.
- **Briarthorn (skill 70)** — nv 40–55 · ambas facciones
  Duskwood (Raven Hill, Brightwood) · The Barrens · Darkshore · Westfall · Razorfen Krawl
  Siguiente skill de hierba.
- **Stranglekelp (skill 85) · Bruiseweed (skill 100)** — nv 50–60 · ambas facciones
  Wetlands (mejor Stranglekelp) · Ashenvale · Stranglethorn Vale · Hinterlands · Hillsbrad · Redridge · Silverpine · Wailing Caverns · Blackfathom Deeps
  Bruiseweed pica skill 100 — llega con nivel alto o hierbalismo dedicado.
- **★ Frilled Lichen (escaso tier 1) — PJ ≤25 según la beta** — nv 1–25 · ambas facciones
  cualquier nodo de Earthroot/Mageroyal/Briarthorn/Bruiseweed
  Sale de las hierbas de skill 15–100. Según la beta (sin confirmar), solo para personajes de nivel 25 o menos.
- **★ Rosecap / Stranglevine (escasos tier 2/3)** — nv 26–60 · ambas facciones
  sin confirmar
  Zonas exactas no publicadas. Con la regla de la beta, un personaje de nivel 26 o más tiraría a la tabla tier 2 (Rosecap) — aprox.

### Mining

- **Copper Vein (skill 1)** — nv 1–10 · ambas facciones
  Durotar (Skull Rock) · The Barrens · Westfall (Jangolode Mine — la mejor del juego) · Tirisfal · Elwynn
  Cobre hasta skill ~65.
- **Tin Vein (skill 65) · Silver Vein (~150)** — nv 10–20 · ambas facciones
  Wetlands (Excavation Site — la mejor) · Westfall (Gold Coast Quarry) · Redridge · Silverpine · Hillsbrad (Azurelode) · Ashenvale · Thousand Needles
  Estaño pide skill 65 — con Mining bajo conviene farmeo de skill primero.
- **Iron Deposit (skill 125) · Gold (~155)** — nv 20–35 · ambas facciones
  Arathi Highlands · Desolace · Stranglethorn Vale · Thousand Needles
  Hierro pide skill 125: subí Mining antes de venir.
- **Mithril (~175) · Truesilver (~200)** — nv 35–50 · ambas facciones
  Azshara · Tanaris · The Hinterlands · Searing Gorge · Badlands
  Tier alto de menas.
- **Thorium Vein (skill 245–275)** — nv 50–60 · ambas facciones
  Un'Goro Crater · Winterspring · Burning Steppes · Eastern Plaguelands · Silithus
  Menas de endgame; Rich/Small Thorium.
- **★ Pyrite (escaso tier 1) — PJ ≤25 según la beta** — nv 1–25 · ambas facciones
  vetas Copper–Iron (reportes de jugadores, sin confirmar)
  Recetas desde skill 50; drop rate desconocido.
- **★ Bauxite / Pitchblende (escasos tier 2/3)** — nv 26–60 · ambas facciones
  reportes: Gold–Mithril (Bauxite) · Truesilver+ (Pitchblende) — sin confirmar
  Bauxite pide skill 130 de recipes, Pitchblende 275 — mid/endgame de Mining.

Spots rankeados por densidad de nodos/beasts y guards según spawn data Classic (warcraftmaps, build 1.60.1.70685) + rutas de skill ForeverDB/Wowhead (theforeverguides). NO hay rates por hora confirmados — son laps caminables, no promesas de oro. Recordá la regla de nivel de los escasos (reportada en la beta, sin confirmar por Blizzard): desde el nivel 26 la tabla pasa a tier 2 y Pristine Leather y Frilled Lichen dejan de caer. Para Skinning: cada bestia se despelleja una sola vez, no dejes cadáveres.

## Desbloqueo del panel

El panel Legacy se desbloquea al ganar tu primer Legacy Point — para la mayoría, el primer personaje en **nivel 25** (tecla Y). Mientras tanto los puntos se siguen ganando a nivel cuenta.
