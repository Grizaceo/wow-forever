/* ================= LEGACY — puntos de cuenta y perks (WoW: Forever) =================
   Sistema "Legacy" lanzado con WoW: Forever (nov-2026, cliente oficial 1.60.x;
   lanzamiento del juego: 5-nov-2026).

   FUENTES (todo hardcodeado; la app es 100% offline, nada se consulta en runtime):
   - wowfdb.com/legacy/ — datos del cliente POST-LAUNCH build 1.60.1.70888:
     los 21 perks con valores POR RANGO de los 3 árboles, costo por rango,
     gates de columna (5/10 pts por árbol) y perks enlazados.
   - foreverdb.net/article/legacy-system-explained — cliente build 1.60.1.70205
     + posts de Blizzard: 65 challenges, cap de 16 pts/personaje, track hasta
     nivel 90, máx ~29 pts que un solo PJ puede ganar, desbloqueo con el primer
     punto ganado, Talented = 5 ranks.
   - zephras.com/forever + wowforever.gg + wowforevertalentcalculator.org —
     mismos datos del cliente (builds 70425+): confirman gates y prereqs.
   - thewowdb.com/wow-forever/legacy-points/ — tablas del cliente BETA
     1.60.1.70338 (65 ranks; post-launch son 69 con Talented en 5).
   - azeroth.wiki/forever/legacy + /forever/guides/legacy-* — guía post-launch:
     Progress Track (15/25/40/55 → Innkeeper Wiley en Ratchet), tecla Y.
   - warcraftmaps.com/guides/scarce-materials + /gold/{herb,mining,skinning}-spots
     — cliente 1.60.1.70685 + spawn data Classic: los 9 materiales "Scarce",
     qué craftean y hotspots (SIN drop rates).
   - mmonster.co/wow-forever/guides/farming/scarce-materials — loot records del
     beta (Wowhead ForeverDB): bestias que sueltan Pristine Leather/Hide.
   - theforeverguides.com/professions/{ore,herb,leather,skinning}-farming/ —
     rutas de skill por zona (beta datamined + Wowhead Forever), bandas de
     leather/herb por nivel de bestia.
   - github.com/ClassicWoWCommunity/forever-bugs issue #375 + foros de Blizzard —
     REGLA DE NIVEL de escasos: el tier depende del NIVEL DEL PERSONAJE
     (≤25 → tier 1, ≥26 → tier 2; límite del tier 3 sin confirmar). Testeado
     exhaustivamente en beta; Blizzard NO lo confirmó oficialmente.

   CORRECCIONES vs datos beta (documentadas):
   - Talented: beta lo listaba como 1 rank; post-launch son 5 ranks
     (cada rango adelanta el inicio de talentos de clase un nivel: 9→5).
   - Reinforce: beta texto sugería -20%; los rangos reales son 8/16/24/32/40%.
   - Ranks totales: beta 65 → post-launch 69 (Talented +4).

   AÚN SIN CONFIRMAR (marcado approx en la UI):
   - Drop rates exactos de escasos y si escalan con el skill del gatherer.
   - Nivel exacto donde cambia tier 2 → tier 3 (probablemente ~46, sin confirmar).
   - Zonas exactas de Rosecap/Stranglevine/Bauxite/Pitchblende/Pristine Scale.
   - Si el perk enlazado necesita rango máximo o solo estar aprendido
     (foreverdb asume rango máximo; los archivos del juego solo piden abrirlo). */
window.GUIDE_LEGACY = {

  /* Texto del sistema — bullets cortos para la card principal. */
  sys: [
    "Los <b>Legacy Points</b> se ganan a nivel <b>cuenta</b> completando <b>Legacy Challenges</b> (tipo achievements). Cada personaje gasta desde ese total común: lo que gasta uno <b>no</b> le quita puntos a los demás. Un class trainer puede resetear los perks.",
    "Cada personaje puede colocar <b>máx. 16 puntos</b> (cap de temporada). El total ganado puede ser 0–65; un solo personaje puede llegar a ganar ~29 como máximo. Con más de 16 ganados, cada personaje sigue pudiendo gastar solo 16.",
    "Hay <b>3 árboles</b> de perks: <b>Adventure</b>, <b>Resourcefulness</b> y <b>Professions</b>. Cada rango cuesta <b>1 punto</b> (verificado en el cliente post-launch). En el árbol: clic izquierdo agrega un rango, clic derecho lo quita. Nada se confirma hasta pulsar <b>Apply Changes</b>.",
    "El panel se desbloquea al ganar tu <b>primer Legacy Point</b> — para la mayoría, el primer personaje en <b>nivel 25</b>. Tecla por defecto: <b>Y</b> (Options → Keybindings → Toggle Legacy Pane).",
    "El <b>Progress Track</b> muestra el total de puntos ganados y la recompensa de cada umbral (15/25/40/55; el track llega a 90); se reclama en <b>Innkeeper Wiley, Ratchet</b>.",
  ],

  /* Progress Track — recompensas por puntos ganados (cuenta). azeroth.wiki. */
  progress: [
    [15, "Holstered Replica Ironforge Air Rifle", "Juguete de tiroteo: vos y otros jugadores con la réplica pueden stunearse; Even lleva el marcador."],
    [25, "Spectral Bear Cub", "Compañero espectral pequeño que te sigue."],
    [40, "Spectral Bear Tabard", "Tabardo con temática de oso espectral."],
    [55, "Reins of the Spectral Bear", "Mount épico de oso espectral, +100% velocidad de carrera."],
  ],
  progressNote: "Reclamo en Innkeeper Wiley, Ratchet. Los umbrales son de puntos GANADOS por la cuenta, no los 16 que puede gastar cada personaje.",

  /* Challenges — agrupados como el cliente los agrupa. pts = puntos máx. aprox.
     del grupo (cada challenge = 1 pt; el beta sumaba 16 extra por jugar la beta). */
  challenges: [
    { id:"class", name:"Clases", pts:27, desc:"9 clases × 3 hitos — 1 punto cada uno, primera vez",
      rows:[ ["Novice","llegar a nivel 25 con la clase"],["Experienced","llegar a nivel 45 con la clase"],["Master","llegar a nivel 60 con la clase"] ],
      note:"Tu clase actual se resalta abajo. Con alts de otras clases se completan las 9." },
    { id:"adv", name:"Aventura", pts:2, desc:"Misiones y logros de mundo",
      rows:[ ["Lord Valthalak Laid to Rest","questline de Upper Blackrock Spire (An Earnest Proposition → Saving the Best for Last)"],["Explorer","tener un personaje con el achievement Explore Azeroth"],["Beta (16 pts)","premio único por jugar la beta — ya no aplica post-launch"] ],
      note:"El cliente lista cada requisito dos veces (131 achievements / 66 textos en beta); no está claro por qué." },
    { id:"dgn", name:"Dungeons (Spelunker)", pts:3, desc:"3 challenges: hay que matar al boss final de CADA dungeon del set, en un solo personaje",
      rows:[
        ["Novice Spelunker · 6 dungeons (nv ~13–30)","Ragefire Chasm <i>o</i> Hall of Thanes · Ruins of Lordaeron · Wailing Caverns · The Deadmines · Shadowfang Keep · Excavation Site: Wetlands"],
        ["Experienced Spelunker · 10 dungeons (nv ~24–46)","City of Dalaran · Blackfathom Deeps · Gnomeregan · The Drowned City · Scarlet Monastery (4 alas) · Razorfen Krawl · Krol'dok Stronghold"],
        ["Master Spelunker · 17 dungeons (nv ~37–62)","Razorfen Downs · Uldaman · Zul'Farrak · Maraudon · Alcaz Prison · Temple of Atal'Hakkar · Blackrock Depths · Blackmaw Hold · Lower+Upper Blackrock Spire · Scholomance · Stratholme (Live y Dead) · Dire Maul (E/N/W) · The Shaper's Terrace"] ],
      note:"City of Dalaran, The Drowned City, Krol'dok Stronghold, Alcaz Prison, Blackmaw Hold, Shaper's Terrace y Hall of Thanes son dungeons NUEVOS de Forever — no existen en Classic." },
    { id:"pvp", name:"PvP", pts:12, desc:"Rangos de honor, reputaciones y Season Journey",
      rows:[ ["Rangos de honor (5 pts)","Sergeant · Knight-Lieutenant/Blood Guard · Lieutenant-Commander/Champion · Field Marshal/Warlord · Grand Marshal/High Warlord"],["Reputaciones BG (4 pts)","exaltado con Frostwolf/Stormpike (AV) · Defilers/League of Arathor (AB) · Warsong Outriders/Silverwing (WSG) · Darkspear Raiders/Theramore (DSI)"],["Field of Honor (3 pts)","semanas 4, 7 y 10 del journey"] ],
      note:"Los rangos alternativos (Horda/Alianza) valen lo mismo." },
    { id:"raid", name:"Raids", pts:3, desc:"Encuentros de raid",
      rows:[ ["Conqueror of the Wilds","encuentros de Hyjal Summit"],["Conqueror of the Deeps","encuentros de Barrow Deeps"],["Conqueror of the Lair","derrotar a Onyxia"] ],
      note:"Requieren nivel 60 y grupo." },
    { id:"craft", name:"Oficios de craft", pts:18, desc:"6 profesiones de creación × 3 hitos de skill",
      rows:[ ["150 skill","Journeyman — Alchemy, Blacksmithing, Enchanting, Engineering, Leatherworking, Tailoring (6 pts)"],["225 skill","Expert — las mismas 6 (6 pts)"],["300 skill","Artisan — las mismas 6 (6 pts)"] ],
      note:"<b>Herbalism, Mining, Skinning, Cooking, Fishing y First Aid NO dan puntos</b> — los hitos de skill solo existen para los 6 crafts. Recolección ≠ puntos directos." },
  ],
  challengesNote: "65 challenges = ~65 puntos ganables (verificado en cliente post-launch; el beta listaba 131 achievements por duplicados). Cada personaje gasta su propio cupo de 16 desde ese total.",

  /* Árboles de perks — valores POR RANGO verificados en cliente post-launch
     (wowfdb build 70888 + foreverdb build 70205). pre = costo real:
     "5pts" = gate de columna (5 pts en el árbol), "10pts" = gate alto,
     más el perk enlazado al rango máximo cuando aplica. */
  perks: {
    prof: {
      name:"Professions", sub:"recolección, crafts, pesca y vendors",
      perks:[
        { n:"Working Overtime", r:5, tag:"skill", fx:"+4/8/12/16/20% a la probabilidad de ganar skill en cualquier tradeskill primario, secundario o de clase.", pre:"libre" },
        { n:"Bountiful Harvest", r:5, tag:"gather", fx:"Descubrís <b>20/40/60/80/100% más materiales escasos</b> (Scarce) de Mining, Herbalism y Skinning.", pre:"libre" },
        { n:"Master Chef", r:5, tag:"craft", fx:"10/20/30/40/50% de probabilidad de resultado extra al cocinar.", pre:"5 pts en Professions" },
        { n:"Luremaster", r:2, tag:"fish", fx:"25/50% de pez extra al pescar con carnada activa.", pre:"5 pts en Professions" },
        { n:"Bartering", r:2, tag:"vendor", fx:"-5/10% al precio de <b>ítems</b> de todos los vendors (no aplica a training ni repairs).", pre:"5 pts en Professions" },
        { n:"Performance Bonus", r:3, tag:"crate", fx:"5/10/15% de recibir el doble de Merchant's Favor al entregar crates a la ACA / Durotar Supply.", pre:"5 pts + Bountiful Harvest 5" },
        { n:"Dedicated Study", r:1, tag:"skill", fx:"+1 skill a tu tradeskill más bajo (primario/secundario). Si todo está en 300: 2–4 Esencias Elementales al azar.", pre:"10 pts + Bartering 2" },
      ],
    },
    adv: {
      name:"Adventure", sub:"leveling, quests y viaje",
      perks:[
        { n:"Well Rested", r:5, tag:"xp", fx:"+4/8/12/16/20% a la XP de descanso acumulada y a su tope.", pre:"libre" },
        { n:"Thrill of Adventure", r:5, tag:"combat", fx:"Recuperás 1/2/3/4/5% de tu HP y maná máx en 10s cada vez que das el killing blow a un enemigo no trivial. No en dungeons/raids/BGs.", pre:"libre" },
        { n:"High Alert", r:2, tag:"pvp", fx:"Detectás stealth como si tuvieras +1/+2 niveles. Inefectivo en Battlegrounds.", pre:"5 pts en Adventure" },
        { n:"Talented", r:5, tag:"talent", fx:"Los talentos de clase empiezan antes: rango 1 = lvl 9 … rango 5 = lvl 5 (el total sigue capeado en 51).", pre:"5 pts + Well Rested 5" },
        { n:"Field Guide", r:3, tag:"camp", fx:"-8/17/25% de cooldown al agregar features de campamento.", pre:"5 pts en Adventure" },
        { n:"Field Medicine", r:2, tag:"heal", fx:"-5/10s a la duración del efecto Recently Bandaged al usar vendas. No en dungeons/raids/BGs.", pre:"5 pts en Adventure" },
        { n:"Frequent Flier", r:1, tag:"travel", fx:"-50% al costo de flight paths y tu mount de FP vuela 20% más rápido.", pre:"10 pts + Field Guide 3" },
      ],
    },
    res: {
      name:"Resourcefulness", sub:"economía, reputación y honor",
      perks:[
        { n:"Gourmand", r:3, tag:"food", fx:"+33/67/100% a la duración de los buffs de comida.", pre:"libre" },
        { n:"The Quick and the Dead", r:2, tag:"dead", fx:"+5% velocidad muerto por 1 min → +10% por 2 min; tras resucitar, hechizos útiles sin costo de recurso por el mismo tiempo (o hasta entrar en combate).", pre:"libre" },
        { n:"Reinforce", r:5, tag:"death", fx:"-8/16/24/32/40% de pérdida de durabilidad al morir.", pre:"libre" },
        { n:"For Great Honor", r:5, tag:"pvp", fx:"+2/4/6/8/10% a los Honor Points ganados.", pre:"5 pts en Resourcefulness" },
        { n:"Permanence", r:2, tag:"party", fx:"Buffs de party/raid de stats largos duran +50/100%; el descanso en camp también +50/100%.", pre:"5 pts + Gourmand 3" },
        { n:"Diplomat", r:5, tag:"rep", fx:"+2/4/6/8/10% a las ganancias de reputación.", pre:"5 pts en Resourcefulness" },
        { n:"Reagent Economy", r:1, tag:"reagent", fx:"Tus habilidades de clase ya no requieren reagents comprables a vendors (los soul shards de Warlock siguen haciendo falta).", pre:"10 pts + Quick and the Dead 2" },
      ],
    },
  },
  perksNote: "Verificado en el cliente post-launch (builds 70205/70425/70888): cada rango = 1 punto. Los perks se abren por columnas: los de columna 2 piden 5 pts en el árbol, los de columna 3 piden 10 pts, y algunos además necesitan otro perk a rango máximo (marcado en req). El orden de desbloqueo es el listado; un perk bloqueado no puede financiar su propio desbloqueo.",

  /* Materiales escasos — los 9 "Scarce" del cliente (warcraftmaps + mmonster).
     tier = item level 25/45/60. REGLA DE NIVEL (beta, no confirmada por Blizzard):
     el tier depende del NIVEL DEL PERSONAJE: ≤25 → tier 1, ≥26 → tier 2;
     el límite tier2→tier3 no está confirmado (probablemente ~46). */
  scarce: [
    ["Frilled Lichen","Herbalism","25","Cerulean Dye","Alchemy (amarillo 50): 2× hierba + vial · 131 recetas, 108 Tailoring","recetas desde skill 50 · hierbas nv 15–100 (Earthroot/Mageroyal/Briarthorn/Bruiseweed) · solo PJ ≤25"],
    ["Rosecap","Herbalism","45","Magenta Dye","Alchemy (amarillo 130) · 62 recetas, 52 Tailoring","recetas desde skill 130 · sin fuente confirmada en beta · tier 2 (PJ ≥26)"],
    ["Stranglevine","Herbalism","60","Viridian Dye","Alchemy (amarillo 230) · 15 recetas","recetas desde skill 230 · sin fuente confirmada · tier 3"],
    ["Pyrite","Mining","25","Sulfuric Acid","Alchemy (amarillo 50) · 42 recetas, 30 Blacksmithing · Pyrite directo: 12 recetas, 9 Tailoring","recetas desde skill 50 · reportes: vetas Copper–Iron · solo PJ ≤25"],
    ["Bauxite","Mining","45","Sandpaper","Engineering (amarillo 130): 2× Bauxite + lienzo · 27 recetas, 25 Blacksmithing","recetas desde skill 130 · reportes: vetas Gold–Mithril · tier 2"],
    ["Pitchblende","Mining","60","Azerothium Bar","Mining + Carbón · 13 recetas (armas top-end)","recetas desde skill 275 · reportes: vetas Truesilver+ · tier 3"],
    ["Pristine Leather","Skinning","25","se usa directo","126 recetas: 80 Leatherworking · 30 Blacksmithing · 16 Tailoring · primera a skill 80","bestias nv ~11–26 · zonas: Westfall, Barrens, Darkshore, Loch Modan (+WC, SFK, Duskwood, Silverpine, Redridge) · solo PJ ≤25"],
    ["Pristine Hide","Skinning","45","se usa directo","46 recetas (43 Leatherworking)","bestias nv 25–34 · Kraul Bat (RFK) · Maddened Rotclaw (Wetlands) · Scarlet Tracking Hound (Scarlet Monastery) · Aku'mai Snapjaw (BFD) · tier 2"],
    ["Pristine Scale","Skinning","60","se usa directo","16 recetas (12 Leatherworking) · primera a skill 235","sin fuente confirmada — el beta capaba en nv 30 · tier 3"],
  ],
  scarceNote: "Son bonus drops de nodos/menas/cadáveres NORMALES de tu oficio — no hay nodos especiales. REGLA DE NIVEL (testeada exhaustivamente en beta, bug report #375; Blizzard NO la confirmó): el tier de escaso depende del NIVEL DEL PERSONAJE, no del mob ni del skill ni de la zona — PJ ≤25 solo consigue tier 1 (PL/FL/Pyrite), PJ ≥26 pasa a la tabla tier 2 (PH/Rosecap/Bauxite). Implicación: tu Grizaceo nv 28 NO puede conseguir Pristine Leather ni Frilled Lichen — eso es para un alt ≤25; tu escaso de skinning es Pristine Hide. Drop rates exactos y el límite del tier 3 siguen sin confirmar (approx).",

  /* Spots de recolección por nivel — spawn data de Classic sobre terreno Forever
     (warcraftmaps, build 1.60.1.70685) + rutas de skill ForeverDB/Wowhead
     (theforeverguides). Sin rates/hora confirmados.
     fac: "h"=Horda, "a"=Alianza, "both"=ambas. lvl = rango de nivel del PJ. */
  gather: {
    skin: [
      { lvl:[1,20], fac:"both", what:"Light Leather · beasts nv 6–25 (mejor 11–20)", zones:"Zonas iniciales · Durotar · The Barrens · Westfall · Darkshore · Silverpine · Redridge · Loch Modan · Wetlands", note:"Warmup de Skinning; vendor vale hasta ~20-25 según la guía de oro. Top beta: Black Dragon Whelp (Redridge 17-18), Starving/Rabid Dire Wolf (Duskwood 19-21), Great Goretusk (Redridge 16-17), Young Wetlands Crocolisk (Wetlands 21-22)." },
      { lvl:[20,30], fac:"both", what:"Medium Leather · beasts nv 16–35 (mejor 21–30)", zones:"Darkshore · Loch Modan · The Barrens (Field of Giants oeste — la mejor zona del juego para este cuero) · Ashenvale · Hillsbrad · Duskwood · Wetlands", note:"Acá estás vos: las bestias nv 21-30 dan Medium Leather, y encima caen los escasos tier 2 si tu PJ es ≥26." },
      { lvl:[30,45], fac:"both", what:"Heavy Leather · beasts nv 26–45 (mejor 31–40)", zones:"Arathi Highlands · Desolace · Stranglethorn Vale · Wetlands · Duskwood", note:"Siguiente tier de cuero normal; también Thick Leather desde beasts nv 36+ (STV, Tanaris, Feralas, Hinterlands, Dustwallow)." },
      { lvl:[45,60], fac:"both", what:"Thick → Rugged Leather · beasts nv 36–60", zones:"Stranglethorn · Tanaris · Feralas · The Hinterlands · Dustwallow Marsh (Thick) → Un'Goro · Felwood · Winterspring · Burning Steppes · Azshara · Silithus (Rugged)", note:"Tier alto; Rugged pide beasts nv 46-60." },
      { lvl:[1,25], fac:"both", what:"★ Pristine Leather (escaso tier 1) — SOLO PJ ≤25", zones:"Westfall · The Barrens (38% de los loots del beta) · Darkshore · Loch Modan · Wailing Caverns · Shadowfang Keep · Duskwood · Silverpine · Redridge", note:"Bestias nv ~11–26. Tu nivel 28 YA NO puede conseguirlo (regla de nivel) — farmealo en un ALT ≤25; skinneá hasta las grises." },
      { lvl:[26,34], fac:"both", what:"★ Pristine Hide (escaso tier 2) — tu rango", zones:"Razorfen Krawl (Kraul Bat, Sur del Barrens) · Wetlands (Maddened Rotclaw) · Scarlet Monastery (Scarlet Tracking Hound, Tirisfal) · Blackfathom Deeps (Aku'mai Snapjaw)", note:"Bestias nv 25–34 — el escaso que te corresponde a nv 28+. En beta hubo pocos registros." },
      { lvl:[35,60], fac:"both", what:"★ Pristine Scale (escaso tier 3)", zones:"sin confirmar", note:"Ninguna fuente lo vio caer (beta cap nv 30). Si existe, probablemente bestias de tier alto." },
    ],
    herb: [
      { lvl:[1,15], fac:"both", what:"Peacebloom · Silverleaf (skill 1)", zones:"Durotar · The Barrens · Dun Morogh · Mulgore · Westfall", note:"Hierbas de entrada; Peacebloom en Thorn Hill oeste y Sen'jin." },
      { lvl:[15,25], fac:"both", what:"Earthroot (skill 15)", zones:"The Barrens (Merchant Coast, NE de Thorn Hill, Sur de Ratchet — top mundial) · Westfall · Dun Morogh · Teldrassil", note:"El Barrens es LA zona de hierbas de la Horda." },
      { lvl:[25,40], fac:"both", what:"Mageroyal (skill 50)", zones:"The Barrens (261 puntos — zona #1, Lushwater Oasis, Sludge Fen) · Ashenvale · Darkshore · Westfall", note:"Tu rango: Mageroyal + Earthroot conviven en el Barrens." },
      { lvl:[40,55], fac:"both", what:"Briarthorn (skill 70)", zones:"Duskwood (Raven Hill, Brightwood) · The Barrens · Darkshore · Westfall · Razorfen Krawl", note:"Siguiente skill de hierba." },
      { lvl:[50,60], fac:"both", what:"Stranglekelp (skill 85) · Bruiseweed (skill 100)", zones:"Wetlands (mejor Stranglekelp) · Ashenvale · Stranglethorn Vale · Hinterlands · Hillsbrad · Redridge · Silverpine · Wailing Caverns · Blackfathom Deeps", note:"Bruiseweed pica skill 100 — llega con nivel alto o hierbalismo dedicado." },
      { lvl:[1,25], fac:"both", what:"★ Frilled Lichen (escaso tier 1) — SOLO PJ ≤25", zones:"cualquier nodo de Earthroot/Mageroyal/Briarthorn/Bruiseweed", note:"Suelto de las hierbas nv 15–100 — solo lo consiguen personajes ≤25; a nv 28 ya no te toca." },
      { lvl:[26,60], fac:"both", what:"★ Rosecap / Stranglevine (escasos tier 2/3)", zones:"sin confirmar", note:"Zonas exactas no publicadas. Tu PJ ≥26 debería tirar a la tabla tier 2 (Rosecap) — aprox." },
    ],
    mine: [
      { lvl:[1,10], fac:"both", what:"Copper Vein (skill 1)", zones:"Durotar (Skull Rock) · The Barrens · Westfall (Jangolode Mine — la mejor del juego) · Tirisfal · Elwynn", note:"Cobre hasta skill ~65." },
      { lvl:[10,20], fac:"both", what:"Tin Vein (skill 65) · Silver Vein (~150)", zones:"Wetlands (Excavation Site — la mejor) · Westfall (Gold Coast Quarry) · Redridge · Silverpine · Hillsbrad (Azurelode) · Ashenvale · Thousand Needles", note:"Estaño pide skill 65 — con Mining bajo conviene farmeo de skill primero." },
      { lvl:[20,35], fac:"both", what:"Iron Deposit (skill 125) · Gold (~155)", zones:"Arathi Highlands · Desolace · Stranglethorn Vale · Thousand Needles", note:"Hierro pide skill 125 — probablemente lo deje tu alt o un mining dedicado." },
      { lvl:[35,50], fac:"both", what:"Mithril (~175) · Truesilver (~200)", zones:"Azshara · Tanaris · The Hinterlands · Searing Gorge · Badlands", note:"Tier alto de menas." },
      { lvl:[50,60], fac:"both", what:"Thorium Vein (skill 245–275)", zones:"Un'Goro Crater · Winterspring · Burning Steppes · Eastern Plaguelands · Silithus", note:"Menas de endgame; Rich/Small Thorium." },
      { lvl:[1,25], fac:"both", what:"★ Pyrite (escaso tier 1) — SOLO PJ ≤25", zones:"vetas Copper–Iron (reportes de jugadores, sin confirmar)", note:"Recetas desde skill 50; drop rate desconocido." },
      { lvl:[26,60], fac:"both", what:"★ Bauxite / Pitchblende (escasos tier 2/3)", zones:"reportes: Gold–Mithril (Bauxite) · Truesilver+ (Pitchblende) — sin confirmar", note:"Bauxite pide skill 130 de recipes, Pitchblende 275 — mid/endgame de Mining." },
    ],
  },
  gatherNote: "Spots rankeados por densidad de nodos/beasts y guards según spawn data Classic (warcraftmaps, build 1.60.1.70685) + rutas de skill ForeverDB/Wowhead (theforeverguides). NO hay rates por hora confirmados — son laps caminables, no promesas de oro. Recuerda la REGLA DE NIVEL de escasos: a nv 28 tu tabla es tier 2 — Pristine Leather y Frilled Lichen ya no te caen (van a un alt ≤25). Para skinsneado: las bestias solo se skinnean una vez — no dejes cadáveres.",

  /* Texto contextual por nivel (el resto de hitos se arma en viewLegacy). */
  now: {
    locked: "El panel Legacy se desbloquea al ganar tu primer Legacy Point — para la mayoría, el primer personaje en <b>nivel 25</b> (tecla Y). Mientras tanto los puntos se siguen ganando a nivel cuenta.",
  },
};
