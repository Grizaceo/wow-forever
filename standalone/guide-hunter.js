/* Guía Hunter — WoW: Forever (datos de clase + facción Horda).
   Consumida por index.html vía window.GUIDE_HUNTER. Contenido público de la guía. */
(function(){
'use strict';
const WEAPONS = [
  {id:"hornwood", n:"Hornwood Recurve Bow", t:"bow", dps:2.4, lvl:3, src:"Vendor — cualquier bowyer", q:"common"},
  {id:"huntingbow", n:"Hunting Bow", t:"bow", dps:4.6, lvl:6, src:"World drop verde (mobs 7-15)", q:"uncommon", note:"+3 AP vs bestias"},
  {id:"hickory", n:"Hickory Shortbow", t:"bow", dps:3.8, lvl:7, src:"Quest 'Securing the Lines' — Durotar", q:"uncommon"},
  {id:"orcish", n:"Orcish Battle Bow", t:"bow", dps:5.5, lvl:10, src:"Quest 'Centaur Bracers' — Barrens", q:"uncommon"},
  {id:"laminated", n:"Laminated Recurve Bow", t:"bow", dps:5.8, lvl:11, src:"Vendor bowyer", q:"common"},
  {id:"finelong", n:"Fine Longbow", t:"bow", dps:7.4, lvl:14, src:"Vendor bowyer", q:"common"},
  {id:"reinforced", n:"Reinforced Bow", t:"bow", dps:7.5, lvl:16, src:"Vendor bowyer (Orgrimmar / Cima del Trueno)", q:"common"},
  {id:"blunderbuss", n:"Deadly Blunderbuss", t:"gun", dps:8.6, lvl:16, src:"Ingeniería", q:"uncommon", eng:true, approx:true},
  {id:"precision", n:"Precision Bow", t:"bow", dps:11.9, lvl:19, src:"BoE — subasta", q:"rare", approx:true},
  {id:"venomstrike", n:"Venomstrike", t:"bow", dps:9.6, lvl:19, src:"Lord Serpentis — Wailing Caverns (~17%)", q:"rare", note:"+ proc de naturaleza: pega más de lo que dice el DPS"},
  {id:"naga", n:"Naga Heartpiercer", t:"bow", dps:10.6, lvl:21, src:"Lady Sarevess — Blackfathom Deeps (~20%)", q:"uncommon"},
  {id:"cliffrunner", n:"Cliffrunner's Aim", t:"bow", dps:12.0, lvl:22, src:"Quest 'The Sacred Flame' — cadena desde Cima del Trueno", q:"uncommon"},
  {id:"nightstalker", n:"Nightstalker Bow", t:"bow", dps:12.2, lvl:23, src:"BoE — subasta", q:"rare", approx:true},
  {id:"moonsight", n:"Moonsight Rifle", t:"gun", dps:10.6, lvl:24, src:"Ingeniería", q:"uncommon", eng:true, approx:true},
  {id:"silverplated", n:"Silver-plated Shotgun", t:"gun", dps:12.4, lvl:26, src:"Ingeniería", q:"uncommon", eng:true, approx:true},
  {id:"sturdy", n:"Sturdy Recurve", t:"bow", dps:13.0, lvl:27, src:"Vendor — Cima del Trueno / Entrañas", q:"common"},
  {id:"plunder", n:"Bow of Plunder", t:"bow", dps:11.35, lvl:28, src:"Quest 'Dangerous!' — Molino Tarren, Hillsbrad", q:"uncommon", note:"mejor daño máximo que Venomstrike"},
  {id:"searing", n:"Bow of Searing Arrows", t:"bow", dps:23.6, lvl:34, src:"BoE épico — subasta (caro)", q:"epic", approx:true, note:"+ proc de fuego"},
  {id:"mithrilblund", n:"Mithril Blunderbuss", t:"gun", dps:16.6, lvl:36, src:"Ingeniería", q:"uncommon", eng:true, approx:true},
  {id:"mhheavy", n:"Mithril Heavy-bore Rifle", t:"gun", dps:20.4, lvl:41, src:"Ingeniería", q:"uncommon", eng:true, approx:true},
  {id:"massive", n:"Massive Longbow", t:"bow", dps:22.0, lvl:42, src:"Vendor — Cima del Trueno / Entrañas", q:"common"},
  {id:"mhbow", n:"Master Hunter's Bow", t:"bow", dps:19.4, lvl:43, src:"Quest élite 'Big Game Hunter' — STV (Hemet Nesingwary)", q:"uncommon"},
  {id:"mhrifle", n:"Master Hunter's Rifle", t:"gun", dps:19.4, lvl:43, src:"Quest élite 'Big Game Hunter' — STV (Hemet Nesingwary)", q:"uncommon"},
  {id:"verdant", n:"Verdant Keeper's Aim", t:"bow", dps:28.2, lvl:45, src:"Quest 'Corruption of Earth and Seed' — Maraudon", q:"uncommon"},
  {id:"highland", n:"Highland Bow", t:"bow", dps:23.6, lvl:46, src:"Quest 'Return to Primal Torntusk' — Hinterlands", q:"uncommon"},
  {id:"thorium", n:"Thorium Rifle", t:"gun", dps:31.4, lvl:47, src:"Ingeniería", q:"uncommon", eng:true, note:"+17 AP ranged"},
  {id:"megashot", n:"Megashot Rifle", t:"gun", dps:27.4, lvl:48, src:"Tinkerer Gizlock — Maraudon (~33%)", q:"rare", note:"+19 AP ranged · velocidad 1.7"},
  {id:"dhc", n:"Dwarven Hand Cannon", t:"gun", dps:32.8, lvl:53, src:"BoE épico — subasta (caro)", q:"epic", note:"+ proc de fuego"},
  {id:"satyr", n:"Satyr's Bow", t:"bow", dps:29.8, lvl:53, src:"Zevrim Thornhoof — Dire Maul East", q:"rare", note:"+3 agi +1% hit · farmeable SOLO a 60"},
  {id:"blackcrow", n:"Blackcrow", t:"crossbow", dps:30.3, lvl:54, src:"Shadow Hunter Vosh'gajin — LBRS (~7%)", q:"rare", note:"+3 agi +1% hit · pre-raid BiS"},
  {id:"screeching", n:"Screeching Bow", t:"bow", dps:29.0, lvl:55, src:"Baroness Anastari — Stratholme UD", q:"rare", approx:true},
  {id:"ancient", n:"Ancient Bone Bow", t:"bow", dps:31.3, lvl:56, src:"Mini-bosses — Scholomance (~3%)", q:"rare", note:"+11 agi"},
  {id:"riphook", n:"Riphook", t:"bow", dps:30.2, lvl:56, src:"Shadow Hunter Vosh'gajin — LBRS (~8%)", q:"rare", note:"proc daño de sombra"},
  {id:"arcanite", n:"Flawless Arcanite Rifle", t:"gun", dps:34.0, lvl:56, src:"Ingeniería", q:"rare", eng:true, approx:true},
];

const DUNGEONS = [
  {n:"Ragefire Chasm", loc:"Orgrimmar", cont:"K", r:[13,18], note:"Loot pobre para hunter — solo si cae un grupo gratis.",
   loot:[["Cavedweller Bracers","Brazales — Taragaman"],["Subterranean Cape","Capa — Oggleflint"]]},
  {n:"Wailing Caverns", loc:"Los Barrens", cont:"K", r:[17,24], key:true,
   note:"LA dungeon de hunter de bajo nivel. Venomstrike es el objetivo #1.",
   loot:[["Venomstrike","Arco azul 9.6 dps + proc — Lord Serpentis ~17%"],["Mutant Scale Breastplate","Pecho mail — Mutanus the Devourer"],["Serpent's Shoulders","Hombros agi — Lady Anacondra"],["Leggings of the Fang","Pantalones agi — Lord Cobrahn"],["Footpads of the Fang","Botas agi"],["Armor of the Fang","Pecho cuero — set Embrace of the Viper"]]},
  {n:"Blackfathom Deeps", loc:"Ashenvale", cont:"K", r:[20,27],
   loot:[["Naga Heartpiercer","Arco 10.6 dps — Lady Sarevess ~20%"],["Naga Battle Gloves","Guantes mail — Lady Sarevess"],["Glowing Thresher Cape","Capa — Old Serra'kis"],["Bite of Serra'kis","Daga — Old Serra'kis"]]},
  {n:"Shadowfang Keep", loc:"Bosque de Argénteos", cont:"E", r:[22,30],
   loot:[["Feline Mantle","Hombros agi — Wolf Master Nandos"],["Wolfmaster Cape","Capa agi — Fenrus the Devourer"],["Odo's Ley Staff","Staff (stat stick) — Odo the Blindwatcher"]]},
  {n:"Razorfen Kraul", loc:"Sur de Barrens", cont:"K", r:[25,33],
   loot:[["Ferine Leggings","Pantalones cuero agi — Agathelos the Raging"],["Mantle of Thieves","Hombros cuero"],["Corpsemaker","2H axe — Charlga Razorflank (stat stick)"]]},
  {n:"Gnomeregan", loc:"Dun Morogh (transportador en Booty Bay)", cont:"E", r:[28,35],
   note:"Largo y lejos, pero buen XP. Horda entra con la quest del transportador en Booty Bay.",
   loot:[["Thermaplugg's Left Arm","2H axe azul — stat stick (¡a pesar del nombre, NO es un gun!)"],["Charged Gear","Anillo con stats aleatorios"]]},
  {n:"Scarlet Monastery — Armory", loc:"Tirisfal", cont:"E", r:[32,38],
   loot:[["Herod's Shoulder","Hombros mail — Herod"],["Ravager","2H axe con proc de torbellino — Herod (stat stick)"]]},
  {n:"Scarlet Monastery — Cathedral", loc:"Tirisfal", cont:"E", r:[35,40],
   loot:[["Mograine's Might","2H mace — Mograine (stat stick)"]]},
  {n:"Razorfen Downs", loc:"Sur de Barrens", cont:"K", r:[37,46], note:"Opcional — poco loot útil para hunter.",
   loot:[["Dragon's Blood Necklace","Cuello — Amnennar"]]},
  {n:"Zul'Farrak", loc:"Tanaris", cont:"K", r:[42,50],
   loot:[["Big Bad Pauldrons","Hombros mail"],["Gahz'rilla Scale Armor","Pecho mail — Gahz'rilla"],["Ripsaw","Hacha (stat stick)"]]},
  {n:"Maraudon", loc:"Desolace", cont:"K", r:[45,52], key:true,
   note:"Segunda dungeon clave: arco por quest + el gun azul del leveling.",
   loot:[["Megashot Rifle","Gun azul 27.4 dps +19 RAP — Gizlock ~33%"],["Verdant Keeper's Aim","Arco 28.2 dps — QUEST 'Corruption of Earth and Seed'"],["Thrash Blade","Espada — quest (stat stick)"],["Mark of the Chosen","Trinket — quest 'The Pariah's Instructions'"],["Charstone Dirk","Daga — Princesa Theradras"]]},
  {n:"Sunken Temple (Atal'Hakkar)", loc:"Swamp of Sorrows", cont:"E", r:[50,55],
   note:"Acá se completa la quest de clase de nivel 50.",
   loot:[["Devilsaur Eye","Trinket: +150 AP y +hit por 20s — elegir si MM/SV"],["Devilsaur Tooth","Trinket: +200 AP al pet 20s — elegir si BM"],["Hunting Spear","Polearm (3ª opción, la peor)"]]},
  {n:"Blackrock Depths", loc:"Montaña Roca Negra", cont:"E", r:[52,58],
   loot:[["Blackstone Ring","Anillo +hit — Princesa Moira"],["Ribbly's Quiver","¡Quiver azul de 14 slots! — Ribbly Screwspigot"],["Hand of Justice","Trinket melee — Angerforge (disputable con melees)"]]},
  {n:"Dire Maul East / North", loc:"Feralas", cont:"K", r:[55,60], key:true,
   note:"A 60 un hunter puede farmear DM East y el Tribute de North SOLO.",
   loot:[["Satyr's Bow","Arco 29.8 dps +1% hit — Zevrim Thornhoof (East)"],["Tarnished Elven Ring","Anillo — Tribute (North)"],["Counterattack Lodestone","Trinket — Tribute (North)"],["Barbarous Blade","2H sword (stat stick) — Tribute (North)"]]},
  {n:"Scholomance", loc:"Western Plaguelands", cont:"E", r:[55,60],
   loot:[["Ancient Bone Bow","Arco 31.3 dps +11 agi — mini-bosses ~3%"],["Beaststalker (T0)","Piezas del set de dungeon"]]},
  {n:"Stratholme", loc:"Eastern Plaguelands", cont:"E", r:[55,60],
   loot:[["Cape of the Black Baron","Capa +agi/+AP — Barón Rivendare"],["Mask of the Unforgiven","Cabeza +hit/crit — The Unforgiven (raro)"],["Screeching Bow","Arco — Baroness Anastari"]]},
  {n:"Lower/Upper Blackrock Spire", loc:"Montaña Roca Negra", cont:"E", r:[55,60],
   loot:[["Blackcrow","Ballesta 30.3 dps +1% hit — Vosh'gajin (LBRS)"],["Riphook","Arco 30.2 dps — Vosh'gajin (LBRS)"],["Truestrike Shoulders","Hombros — Pyroguard Emberseer (UBRS)"]]},
];

const BANDS = [
  {min:1,max:9, zones:"Durotar (Valle de los Desafíos → Sen'jin)",
   notes:"Al 10 hacé la quest de clase para domar tu primer pet. Hickory Shortbow sale de 'Securing the Lines'."},
  {min:10,max:17, zones:"Los Barrens (Crossroads)",
   notes:"'Centaur Bracers' → Orcish Battle Bow. Vendor Reinforced Bow al 16. Pets raros cerca: Humar the Pridelord y Takk the Leaper. A 17 ya podés entrar a WC.",
   dung:"Wailing Caverns se abre al final del rango (17+)"},
  {min:18,max:24, zones:"Barrens → Stonetalon Mountains → Ashenvale",
   notes:"Venomstrike = prioridad absoluta, te dura hasta los 30. Cadena 'The Sacred Flame' (Cima del Trueno) → Cliffrunner's Aim.",
   dung:"Wailing Caverns · BFD (20+) · Shadowfang Keep (22+)"},
  {min:25,max:29, zones:"Sur de Barrens / Hillsbrad / Thousand Needles",
   notes:"Sturdy Recurve al 27 (vendor). Quest 'Dangerous!' al 28 (Molino Tarren) → Bow of Plunder. RFK da Ferine Leggings.",
   dung:"Razorfen Kraul (25+) · SFK si te faltó algo"},
  {min:30,max:37, zones:"Shimmering Flats (1K Needles) → Dustwallow / STV",
   notes:"Shimmering Flats es de los mejores spots de grind 30-35. En STV empezá la cadena de Nesingwary.",
   dung:"SM Armory (32+, Herod's Shoulder + Ravager) · SM Cathedral (35+) · Gnomeregan opcional"},
  {min:38,max:43, zones:"STV / Desolace / Arathi / Dustwallow",
   notes:"Al 43 'Big Game Hunter' → Master Hunter's Bow o Rifle (19.4 dps): salto enorme de daño. A 40 entrená MAIL.",
   dung:"SM Cathedral · RFD opcional"},
  {min:44,max:49, zones:"Tanaris / Feralas / Hinterlands",
   notes:"Maraudon es la prioridad: Verdant Keeper's Aim por quest (28.2 dps) y Megashot Rifle si vas por guns. Highland Bow en Hinterlands.",
   dung:"Zul'Farrak (42+) · Maraudon (45+)"},
  {min:50,max:54, zones:"Un'goro / Felwood / Western Plaguelands",
   notes:"Quest de clase en Sunken Temple: Devilsaur Eye si sos MM/SV, Devilsaur Tooth si sos BM.",
   dung:"Sunken Temple (50+) · BRD (52+): Blackstone Ring + Ribbly's Quiver"},
  {min:55,max:60, zones:"EPL / Winterspring / Silithus + dungeons",
   notes:"Recta final pre-raid: Satyr's Bow (DM East), Blackcrow/Riphook (LBRS), Ancient Bone Bow (Scholo), T0 Beaststalker.",
   dung:"DM East · Stratholme · Scholomance · LBRS/UBRS · BRD restos"},
];

/* Bandas — Reinos del Este */
const EKBANDS = [
  {min:1,max:9, zones:"Tirisfal Glades (o Durotar)",
   notes:"Un trol lo normal es empezar en Durotar; si ya estás en EK tan chico, Tirisfal (Brill) rinde igual para levelear."},
  {min:10,max:19, zones:"Silverpine Forest (El Sepulcro)",
   notes:"Hub del Sepulcro → Pyrewood Village → Ambermill → Fenris Isle. Bowyer en Entrañas (Reinforced Bow al 16). Al 17-19 el zep UC→Org + Crossroads por Venomstrike vale el viaje.",
   dung:"Shadowfang Keep (18-25, Feline Mantle + Wolfmaster Cape) · WC vía zep"},
  {min:20,max:29, zones:"Hillsbrad Foothills (Molino Tarren)",
   notes:"Quests de Tarren Mill + parte nevada de Alterac Mountains. Al 28 'Dangerous!' → Bow of Plunder, gratis y sin salir de EK.",
   dung:"SFK (22+) si faltó · SM Graveyard/Library (26+)"},
  {min:30,max:37, zones:"STV (Grom'gol) / Arathi / Swamp of Sorrows",
   notes:"El zep UC→Grom'gol te deja en STV directo: empezá la cadena Nesingwary temprano. Arathi (Hammerfall) y Stonard alternan quests.",
   dung:"SM Armory (32+, Herod's Shoulder + Ravager) · SM Cathedral (35+) · Gnomeregan opcional"},
  {min:38,max:43, zones:"STV / Badlands (Kargath) / Swamp of Sorrows",
   notes:"Al 43 'Big Game Hunter' → Master Hunter's Bow o Rifle (19.4 dps). Badlands (Kargath) es buen hub Horde 38-45. A 40 entrená MAIL.",
   dung:"SM Cathedral · Badlands quests"},
  {min:44,max:49, zones:"Hinterlands / Searing Gorge / Blasted Lands",
   notes:"Revantusk Village (Hinterlands): 'Return to Primal Torntusk' → Highland Bow. Maraudon queda en Kalimdor, pero Verdant Keeper's Aim (28.2 dps) justifica el viaje (zep→Org→Desolace).",
   dung:"ST (48+, Swamp of Sorrows — en tu continente) · Mara si viajás"},
  {min:50,max:54, zones:"Searing Gorge / Burning Steppes / WPL",
   notes:"La quest de clase 50 es EN Sunken Temple (Swamp of Sorrows) — en tu continente. Devilsaur Eye (MM/SV) o Tooth (BM).",
   dung:"Sunken Temple (50+) · BRD (52+): Blackstone Ring + Ribbly's Quiver"},
  {min:55,max:60, zones:"EPL / WPL / Blackrock Mountain",
   notes:"EK es el continente endgame: Strat, Scholo, Spire y BRD están todos acá. DM East (Satyr's Bow) pide viaje a Feralas (Kalimdor).",
   dung:"Strat UD · Scholo · LBRS/UBRS · BRD · DM East vía Kalimdor"},
];

const MILESTONES = [
  {lvl:10, cat:"Clase", txt:"Quest de clase: domar tu primer pet (trainer, Durotar)"},
  {lvl:11, cat:"Vendor", txt:"Laminated Recurve Bow en cualquier bowyer"},
  {lvl:14, cat:"Vendor", txt:"Fine Longbow en bowyer"},
  {lvl:16, cat:"Vendor", txt:"Reinforced Bow en bowyer (Orgrimmar/Cima del Trueno/Entrañas)"},
  {lvl:17, cat:"Dungeon", txt:"¡WC! Farmeá Venomstrike (Lord Serpentis) + piezas de agilidad", loc:"K"},
  {lvl:20, cat:"Clase", txt:"Dual Wield desbloqueado — 2 armas 1H de agi, o un 2H stat stick"},
  {lvl:20, cat:"Quest", txt:"Cadena 'The Sacred Flame' (Cima del Trueno) → Cliffrunner's Aim", loc:"K"},
  {lvl:25, cat:"Dungeon", txt:"Razorfen Kraul: Ferine Leggings, Mantle of Thieves, Corpsemaker"},
  {lvl:27, cat:"Vendor", txt:"Sturdy Recurve en Cima del Trueno/Entrañas"},
  {lvl:28, cat:"Quest", txt:"'Dangerous!' en Molino Tarren → Bow of Plunder", loc:"E"},
  {lvl:30, cat:"Zona", txt:"Shimmering Flats: uno de los mejores grind 30-35 del juego", loc:"K"},
  {lvl:32, cat:"Dungeon", txt:"SM Armory: Herod's Shoulder + Ravager"},
  {lvl:37, cat:"Quest", txt:"Empezá 'Welcome to the Jungle' (Nesingwary, STV) — cadena larga", loc:"E"},
  {lvl:40, cat:"Clase", txt:"¡Entrená MAIL! Cambiá cuero por malla con agi/stam"},
  {lvl:42, cat:"Vendor", txt:"Massive Longbow (22.0 dps) en TB/Entrañas"},
  {lvl:43, cat:"Quest", txt:"'Big Game Hunter' → Master Hunter's Bow o Rifle (19.4 dps)", loc:"E"},
  {lvl:45, cat:"Quest", txt:"Maraudon: 'Corruption of Earth and Seed' → Verdant Keeper's Aim (28.2)", loc:"K"},
  {lvl:46, cat:"Quest", txt:"Hinterlands: 'Return to Primal Torntusk' → Highland Bow", loc:"E"},
  {lvl:48, cat:"Dungeon", txt:"Mara: Megashot Rifle (Gizlock) — el gun azul del leveling", loc:"K"},
  {lvl:50, cat:"Clase", txt:"Quest de clase (ST): Devilsaur Eye si MM/SV, Devilsaur Tooth si BM", loc:"E"},
  {lvl:52, cat:"Dungeon", txt:"BRD: Blackstone Ring (+hit) y Ribbly's Quiver (14 slots)", loc:"E"},
  {lvl:53, cat:"Dungeon", txt:"Satyr's Bow en DM East (farmeable solo a 60) / Dwarven Hand Cannon en AH", loc:"K"},
  {lvl:56, cat:"Dungeon", txt:"Pre-raid farm: Ancient Bone Bow, Blackcrow/Riphook, T0 Beaststalker"},
  {lvl:60, cat:"Meta", txt:"DM East solo → Satyr's. Pre-raid BiS: Blackcrow o Satyr's + piezas agi/hit"},
];

const AH_LIST = [
  ["Precision Bow","Arco azul (~19)","Compralo si no te cayó Venomstrike"],
  ["Nightstalker Bow","Arco azul (~23)","Alternativa si no fuiste a BFD"],
  ["Feet of the Lynx","Botas agi (~19)","Clásico twink, barato a veces"],
  ["Sentry Cloak","Capa (~19)","Buena capa de leveling"],
  ["Icemail Jerkin","Pecho mail (~29)","Aguanta hasta los 40"],
  ["Bow of Searing Arrows","Arco ÉPICO (34)","Carísimo — solo si sobra el oro"],
  ["Dwarven Hand Cannon","Gun ÉPICO (53)","La mejor opción de gun pre-raid vía oro"],
];

/* Macros meta — WoW: Forever (cliente moderno 1.60.x: /petattack, [mod:], @mouseover, @focus, @cursor).
   lvl = desde cuándo sirve (nivel del spell clave según talentsforever / ForeverDB). Spells en inglés.
   Auditadas 2026-11-06 contra las notas de Blizzard (3-nov), ForeverDB, endgametools, wowclassicforever.info,
   wowf.io y Method. Ninguna probada in-game todavía. Límite del juego: 255 caracteres por macro. */
const MACROS = [
  {lvl:1, cat:"DPS", n:"Auto Shot que nunca se apaga",
   code:"#showtooltip Auto Shot\n/cleartarget [dead]\n/targetenemy [noharm]\n/cast !Auto Shot",
   desc:"Si tu objetivo murió (o no tenés), toma el enemigo más cercano y arranca Auto Shot; el ! evita que una segunda pulsación lo apague. Tu botón de ataque por defecto."},
  {lvl:1, cat:"Pet", n:"Pet ataca mouseover u objetivo",
   code:"/petattack [@mouseover,harm,nodead][]",
   desc:"Manda el pet al enemigo bajo el cursor, o a tu objetivo si no hay nada bajo él. Sacá adds del healer sin cambiar de target. Meta: bindeala a Shift + rueda ↑."},
  {lvl:1, cat:"Melee", n:"Raptor + Mongoose en un botón",
   code:"#showtooltip\n/startattack\n/cast Raptor Strike\n/cast Mongoose Bite",
   desc:"Raptor Strike es de \"próximo golpe\" y NO usa GCD: sale en la misma pulsación que Mongoose Bite (llega al 16 y solo se activa tras esquivar). Para el weaving no hace falta otra macro: activá la opción <b>Auto Attack/Auto Shot</b> y el juego cambia solo entre melee y rango."},
  {lvl:6, cat:"Pull", n:"Marca + manda el pet",
   code:"#showtooltip Hunter's Mark\n/cast Hunter's Mark\n/petattack",
   desc:"Tu apertura estándar: marcás y el pet entra a agarrar aggro antes de tu primer tiro. Antes del 10 (sin pet) igual te sirve para marcar."},
  {lvl:6, cat:"DPS", n:"Marca al vuelo (mouseover)",
   code:"#showtooltip Hunter's Mark\n/cast [@mouseover,harm,nodead][] Hunter's Mark",
   desc:"Marcá al bicho bajo el cursor sin soltar tu objetivo: el próximo pull, o el add que corre al healer. Si algún día vas SV, además alimenta Expose Prey."},
  {lvl:6, cat:"Pull", n:"Apertura en 3 toques",
   code:"#showtooltip\n/castsequence reset=target/combat Hunter's Mark, Serpent Sting, Arcane Shot\n/cast !Auto Shot",
   desc:"Tres pulsaciones: Marca → Serpent → Arcane, con Auto Shot andando. Se resetea al cambiar de objetivo o al salir de combate, así no volvés a marcar de más."},
  {lvl:10, cat:"Pet", n:"Pet vuelve + pasiva",
   code:"/petpassive\n/petfollow",
   desc:"La tecla más importante del hunter: retira al pet de un mal pull y evita que rompa CC. Meta (Method): pet siempre en pasiva y esta tecla en Shift + rueda ↓."},
  {lvl:10, cat:"Pet", n:"Pet Move: mandalo a un punto",
   code:"/petmoveto",
   desc:"Comando nuevo de Forever: aparece un círculo, hacés clic en el suelo y el pet va y se queda ahí. Sirve para sacarlo del camino de un patrullero o para pullear de a uno. Vuelve con la tecla de follow, y montar también lo resetea. Bindeala al botón del medio del mouse. Si el comando no anda, bindeá \"Move To\" desde la barra del pet."},
  {lvl:10, cat:"Pet", n:"Growl on/off (para grupos)",
   code:"#showtooltip Growl\n/petautocasttoggle Growl",
   desc:"Solo: Growl prendido para que el pet agarre aggro primero. En grupo: apagalo antes de cada dungeon o le roba el aggro al tank. El borde animado del ícono te muestra si está en autocast."},
  {lvl:10, cat:"Pet", n:"Alimentar al pet",
   code:"#showtooltip Feed Pet\n/cast Feed Pet\n/use Tough Jerky",
   desc:"La felicidad sigue existiendo y pega directo en el daño del pet: 75% infeliz, 100% contento, 125% feliz. Cambiá Tough Jerky por la comida exacta de tu pet (cada familia come cosas distintas). No anda en combate."},
  {lvl:10, cat:"Pull", n:"Tag rápido",
   code:"#showtooltip Arcane Shot\n/dismount\n/cleartarget [dead]\n/targetenemy [noharm]\n/petattack\n/cast Arcane Shot",
   desc:"Desmonta, toma el enemigo más cercano si no tenés objetivo (o si murió), manda el pet y dispara: reclamás el mob antes que nadie."},
  {lvl:10, cat:"Aspecto", n:"Hawk / Monkey (Ctrl) / Cheetah (Shift)",
   code:"#showtooltip\n/cast [mod:shift] !Aspect of the Cheetah; [mod:ctrl] !Aspect of the Monkey; !Aspect of the Hawk",
   desc:"Hawk para pegar, Ctrl para Monkey si te están pegando en melee, Shift para correr con Cheetah (llega al 20 y te aturde 4s si recibís daño). El ! evita apagar el aspecto al re-apretar."},
  {lvl:10, cat:"Grupo", n:"Asistir al tank (focus)",
   code:"#showtooltip Auto Shot\n/focus [mod:shift,help]\n/stopmacro [mod:shift]\n/assist [@focus,help,nodead]\n/cast [harm,nodead] !Auto Shot\n/petattack [harm,nodead]",
   desc:"Al entrar al dungeon, seleccioná al tank y apretá con Shift: queda guardado como focus. Después, cada pulsación toma el objetivo del tank, dispara y manda al pet. Sin focus, ataca tu objetivo actual. Reemplaza a Misdirection, que en Forever no existe."},
  {lvl:12, cat:"Pet", n:"Cuidado del pet 3-en-1",
   code:"#showtooltip\n/cast [@pet,dead][mod:shift] Revive Pet; [nopet] Call Pet; Mend Pet",
   desc:"Revive si murió, llama si falta, cura si está vivo. Mend Pet llega al 12. Si el juego no detecta al pet muerto (en Classic a veces pasa), Shift fuerza Revive Pet."},
  {lvl:12, cat:"Pet", n:"Pet + habilidad de familia",
   code:"#showtooltip Savage Rend\n/petattack\n/cast Savage Rend",
   desc:"Cada familia trae una habilidad nueva (pet lvl 12; Mine! y Furious Howl desde el 10). No usan tu GCD. Cambiá el nombre por la tuya: Savage Rend (raptor), Web (araña), Swipe (oso), Pinch (cangrejo), Furious Howl (lobo), Tendon Rip (hiena), Dismember (crocolisco), Dust Cloud (zancaalta), Sonic Blast (murciélago), Mine! (ave rapaz)."},
  {lvl:12, cat:"Grupo", n:"Sacarle el add al healer",
   code:"#showtooltip Distracting Shot\n/petattack [@mouseover,harm,nodead][]\n/cast [@mouseover,harm,nodead][] Distracting Shot",
   desc:"Pasá el cursor sobre el bicho que le está pegando al healer: Distracting Shot te lo pone encima y el pet va a buscarlo, sin cambiar tu objetivo."},
  {lvl:12, cat:"Control", n:"Concussive / Wing Clip (Shift)",
   code:"#showtooltip\n/cast [mod:shift] Wing Clip; [@mouseover,harm,nodead][] Concussive Shot",
   desc:"Concussive (CD 12s) para frenar al que se te viene, con mouseover; Shift = Wing Clip si ya lo tenés encima. Kiteo de leveling y de PvP en una sola tecla."},
  {lvl:14, cat:"Control", n:"Scare Beast (focus o mouseover)",
   code:"#showtooltip Scare Beast\n/cast [@focus,harm,nodead][@mouseover,harm,nodead][] Scare Beast",
   desc:"Asustá a la bestia de tu focus, o a la del cursor, sin cambiar de objetivo. Te salva en pulls dobles de animales. Cast 1.5s, CD 30s, 10 yardas."},
  {lvl:20, cat:"Trampa", n:"Todas las trampas en una tecla",
   code:"#showtooltip\n/cast [mod:shift] Immolation Trap; [mod:ctrl] Frost Trap; [mod:alt] Explosive Trap; Freezing Trap",
   desc:"Desde el 3-nov todas las trampas comparten <b>un solo CD de 30s</b>: podés tener 1 de fuego y 1 de escarcha activas, pero no tirarlas seguidas. Por eso alcanza una tecla: Freezing para el add, Shift = Immolation (lvl 16), Ctrl = Frost (28), Alt = Explosive (34). Se pueden poner en combate."},
  {lvl:20, cat:"DPS", n:"Aimed / Multi en una tecla",
   code:"#showtooltip\n/cast [mod:shift] Multi-Shot; Aimed Shot",
   desc:"Aimed Shot (de trainer al 20, cast 2s) comparte 6s de CD con Multi-Shot: con una sola tecla tenés las dos. Shift = Multi para packs."},
  {lvl:22, cat:"PvP", n:"Stings por modificador",
   code:"#showtooltip\n/cast [mod:shift] Scorpid Sting; [mod:ctrl] Viper Sting; Serpent Sting",
   desc:"Serpent por defecto; Shift = Scorpid contra melee; Ctrl = Viper contra casters (llega al 36 y en Forever tiene CD de 15s)."},
  {lvl:25, cat:"BM", n:"Arcane / Summon Hawk (Shift)", tal:"bm",
   code:"#showtooltip\n/cast [mod:shift] Summon Hawk; Arcane Shot\n/cast !Auto Shot",
   desc:"Summon Hawk (talento BM de fila 4) comparte el CD de 6s de Arcane: una tecla, dos opciones. El hawk aparece sobre tu objetivo y se le queda pegado 18s, así que Shift va para mobs largos o élites; Arcane (buffeado +30% el 3-nov) para el resto. Requiere el talento."},
  {lvl:26, cat:"Burst", n:"Rapid Fire + trinkets + Berserking",
   code:"#showtooltip Rapid Fire\n/use 13\n/use 14\n/cast Berserking\n/cast Rapid Fire",
   desc:"Trinkets de uso + Berserking (racial trol) + Rapid Fire, que en Forever acelera melee y rango un 40% por 15s (CD 5 min). Si un slot no tiene trinket de uso, esa línea no hace nada. Si no sale todo de una, apretá de nuevo."},
  {lvl:30, cat:"Defensa", n:"Feign Death limpio",
   code:"#showtooltip Feign Death\n/stopcasting\n/stopattack\n/petpassive\n/petfollow\n/cast Feign Death",
   desc:"Corta el cast (aunque estés en medio de un Aimed), frena todo, deja al pet pasivo y a tu lado, y hace FD para dropear amenaza. CD 30s en Forever. Ya no hace falta para trampear: las trampas van en combate."},
  {lvl:30, cat:"BM", n:"Intimidation + pet", tal:"bm",
   code:"#showtooltip Intimidation\n/petattack\n/cast Intimidation",
   desc:"Manda al pet y suelta Intimidation: stun en su próximo golpe, que encima es crítico garantizado. Guardala como stun o interrupt, no la gastes junto con Bestial Wrath."},
  {lvl:30, cat:"PvP", n:"Scatter → Freezing Trap", tal:"mm",
   code:"#showtooltip\n/petpassive\n/petfollow\n/castsequence reset=6 Scatter Shot, Freezing Trap",
   desc:"Solo si tenés Scatter Shot (talento MM de fila 5). 1ª pulsación: Scatter, y el pet se aparta para no romperlo. 2ª: Freezing Trap a tus pies. Si la trampa está en CD (es compartido), la secuencia espera hasta resetear."},
  {lvl:32, cat:"PvP", n:"Flare en el cursor",
   code:"#showtooltip Flare\n/cast [@cursor] Flare",
   desc:"Tira Flare directo donde apunta el mouse, sin círculo de targeteo. Para destapar rogues y druidas en stealth."},
  {lvl:40, cat:"Aspecto", n:"Montura o Cheetah",
   code:"#showtooltip\n/cast [indoors][combat] !Aspect of the Cheetah\n/use [outdoors,nocombat,nomounted] Whistle of the Emerald Raptor\n/dismount [mounted]",
   desc:"Al aire libre y fuera de combate te monta; adentro o en combate, Cheetah; si ya estás montado, te baja. Cambiá el nombre por el de tu montura tal como figura en la bolsa o el diario (la primera llega al 40)."},
  {lvl:40, cat:"BM", n:"Bestial Wrath + pet", tal:"bm",
   code:"#showtooltip Bestial Wrath\n/petattack\n/cast Bestial Wrath",
   desc:"Manda al pet y lo enfurece (Bestial Wrath, talento BM de fila 7). Combinala con la macro de Rapid Fire para el burst."},
  {lvl:60, cat:"Grupo", n:"Tranquilizing Shot (mouseover o focus)",
   code:"#showtooltip Tranquilizing Shot\n/cast [@mouseover,harm,nodead][@focus,harm,nodead][] Tranquilizing Shot",
   desc:"Tranq al boss bajo el cursor o a tu focus sin soltar tu objetivo, para la rotación de tranq en raid contra los bosses que entran en Frenzy (Magmadar y compañía)."},
];

/* Barra recomendada (BM leveling). Cada tecla lista opciones en orden de preferencia:
   {m} = macro de MACROS por nombre exacto · {s,lvl} = spell suelto del libro mientras no llega la macro.
   dg = qué va en esa tecla en modo dungeon. Una macro con tal solo cuenta si coincide con tu spec. */
const BAR = [
  {k:"|°", o:[{m:"Montura o Cheetah", t:"Montura / Cheetah"}]},
  {k:"1", o:[{m:"Marca + manda el pet", t:"Marca + pet"}]},
  {k:"2", o:[{m:"Auto Shot que nunca se apaga", t:"Auto Shot"}], dg:{m:"Asistir al tank (focus)", t:"Asistir al tank"}},
  {k:"3", o:[{m:"Stings por modificador", t:"Stings"},{s:"Serpent Sting", lvl:4, t:"Serpent Sting"}]},
  {k:"4", o:[{m:"Arcane / Summon Hawk (Shift)", t:"Arcane / Hawk"},{s:"Arcane Shot", lvl:6, t:"Arcane Shot"}]},
  {k:"5", o:[{m:"Aimed / Multi en una tecla", t:"Aimed / Multi"},{s:"Multi-Shot", lvl:18, t:"Multi-Shot"}]},
  {k:"6", o:[{m:"Bestial Wrath + pet", t:"Bestial Wrath"}]},
  {k:"Q", o:[{m:"Pet + habilidad de familia", t:"Habilidad del pet"}]},
  {k:"W", move:true},
  {k:"E", o:[{m:"Concussive / Wing Clip (Shift)", t:"Concussive / Wing Clip"}]},
  {k:"R", o:[{m:"Raptor + Mongoose en un botón", t:"Raptor + Mongoose"}]},
  {k:"T", o:[{m:"Hawk / Monkey (Ctrl) / Cheetah (Shift)", t:"Aspectos"}]},
  {k:"A", move:true}, {k:"S", move:true}, {k:"D", move:true},
  {k:"F", o:[{m:"Cuidado del pet 3-en-1", t:"Cuidado del pet"}]},
  {k:"G", o:[{m:"Todas las trampas en una tecla", t:"Trampas"},{s:"Immolation Trap", lvl:16, t:"Immolation Trap"}]},
  {k:"Z", o:[{m:"Scare Beast (focus o mouseover)", t:"Scare Beast"}]},
  {k:"X", o:[{m:"Rapid Fire + trinkets + Berserking", t:"Rapid Fire + Berserking"}]},
  {k:"C", o:[{m:"Feign Death limpio", t:"Feign Death"}]},
  {k:"V", o:[{m:"Intimidation + pet", t:"Intimidation"},{m:"Scatter → Freezing Trap", t:"Scatter → Trap"}]},
];
const BAR_ROWS = [["|°","1","2","3","4","5","6"],["Q","W","E","R","T"],["A","S","D","F","G"],["Z","X","C","V"]];
const BAR_OFFSET = [0,1.5,1.75,2.25]; // corrimiento de cada fila, en anchos de tecla (como un teclado real)
const BAR_MOUSE = [
  {k:"⇧ rueda ↑", o:[{m:"Pet ataca mouseover u objetivo", t:"Pet ataca"}]},
  {k:"⇧ rueda ↓", o:[{m:"Pet vuelve + pasiva", t:"Pet vuelve"}]},
  {k:"clic rueda", o:[{m:"Pet Move: mandalo a un punto", t:"Pet Move"}]},
  {k:"lateral", o:[{m:"Marca al vuelo (mouseover)", t:"Marca al vuelo"}], dg:{m:"Sacarle el add al healer", t:"Sacar el add"}},
];
const BAR_CLICK = ["Alimentar al pet","Growl on/off (para grupos)","Flare en el cursor","Tranquilizing Shot (mouseover o focus)"];
const BAR_ALT1 = ["Tag rápido","Apertura en 3 toques"];
(typeof module==='object'&&module&&module.exports?module.exports:window).GUIDE_HUNTER={
id:"hunter",name:"Hunter",icon:"bow",title:"Senda del Cazador",accent:"#4e7a2e",
specs:{bm:"Beast Mastery",mm:"Marksmanship",sv:"Survival"},defaultSpec:"bm",
prefs:[["bow","Arco"],["gun","Gun"],["any","Cualq."]],defaultPref:"bow",
prefNote:"Trol = Bow Specialization. Los guns azules de Horda son escasos hasta el 48.",
useEng:true,
types:{bow:"Arco",gun:"Gun",crossbow:"Ballesta"},
badges:{bow:"bow",gun:"gun",crossbow:"xbow"},
typeFilters:[["all","Todas"],["bow","Arcos"],["gun","Guns"],["crossbow","Ballestas"]],
specNote:"Beast Mastery es la spec ideal para levelear (el pet tanquea).",
prefChips:{bow:"racial arco"},
simc:{slot:"ranged",pet:true,racePref:{troll:"bow"},
  rows:h=>[
    ["AGI",h.num("character_stats","agility")],
    ["Stamina",h.num("character_stats","stamina")],
    ["Vida",h.num("character_stats","health")],
    ["AP rango",h.ap("ranged")],
    ["Crit",h.pct("crit","ranged")],
    ["Hit",h.pct("hit","ranged_modifier")],
    ["Haste",h.pct("haste","ranged")],
    ["Experto",h.pct("combat_modifiers","expertise_ranged")],
    ["Armadura",h.num("defense","armor")],
    ["Defensa",h.num("defense","defense_skill")]
  ]},
macros:MACROS,
bar:{keys:BAR,rows:BAR_ROWS,offset:BAR_OFFSET,mouse:BAR_MOUSE,click:BAR_CLICK,alt1:BAR_ALT1},
macroRules:`<div class="mst"><span class="tdot"></span><span class="txt"><b>Trampas:</b> van en combate y podés tener 1 de fuego + 1 de escarcha activas, pero desde el 3-nov <b>todas comparten un solo CD de 30s</b>. Una tecla con modificadores alcanza.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Raptor Strike no usa GCD</b> (es de próximo golpe): entra en la misma pulsación que Mongoose Bite.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Aimed Shot</b> es de trainer al 20 y comparte 6s de CD con Multi-Shot; <b>Summon Hawk</b> (BM) comparte el de Arcane Shot.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Pet:</b> sus comandos y habilidades no usan tu GCD, así que van en la misma tecla que un tiro. Habilidad de familia desde pet lvl 10-12, y comando nuevo <b>Move To</b> (/petmoveto).</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Auto Shot</b> pide 0.5s quieto para disparar: frená un instante tras kitear. Activá la opción <b>Auto Attack/Auto Shot</b> (agregada el 16-oct): cambia sola entre melee y rango y reemplaza las macros de weaving.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Focus existe</b> en Forever (las macros con @focus andan). <b>Misdirection no</b>: es de TBC. En dungeons usá la macro de asistir al tank.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Pet en pasiva</b> para que su IA no pise tus órdenes: lo mandás vos con las macros.</span></div>`,
barNotes:{
  intro:"Cada tecla queda fija del 12 al 60: lo punteado se llena solo cuando llegás al nivel. Clic en una tecla para ver su macro. Las marcas ⇧ / Ctrl / Alt avisan que la macro cambia con ese modificador.",
  dungeon:" <b>En dungeon:</b> apagá Growl y fijá al tank con Shift+2.",
  altNote:"Tag rápido si en la zona te roban los mobs.",
  before:"<b>Antes de empezar:</b> quitá el atajo Shift+1…6 (cambiar página de barra) en Opciones → Atajos, si no el Shift de las macros del 3 al 5 no anda. Si usás Q/E para moverte de costado, pasá esas dos a otras teclas."
},
dungeons:DUNGEONS,
ahList:AH_LIST,
extras:{
  ahTitle:"Lista de compras — Subasta (BoE)",
  tipsTitle:"Tips de hunter",
  tips:[
    ["Melee = stat stick.","Solo aportan stats: agi/stam/AP. Corpsemaker, Ravager, Barbarous Blade, o dos 1H de agi tras dual wield (20)."],
    ["Scopes:","sirven para arcos y guns (+3/+7 daño). Un scope en Venomstrike o Satyr's vale cada centavo."],
    ["Quiver/ammo pouch:","dan velocidad de ataque — subí de tamaño siempre. El azul es Ribbly's Quiver (14 slots, BRD)."],
    ["Pets:","gatos y raptors rinden mejor. En Barrens: Humar the Pridelord y Takk the Leaper. A 37: Broken Tooth (Badlands, 1.0 speed) para PvP."],
    ["Ammo:","usá siempre las flechas/balas de mayor nivel — es DPS gratis."],
    ["Stats:","Agilidad > AP ranged > stamina > int. Cuero antes de 40, mail después."]
  ],
  warn:"La guía usa datos de Classic Era / vanilla 1.12 (la base de Forever). Si el server retocó drops o stats, verificá cada ítem in-game — la ruta de zonas y dungeons igual aplica."
},
factions:{
  horde:{
    weapons:WEAPONS,
    milestones:MILESTONES,
    routes:{kalimdor:BANDS,ek:EKBANDS},
    recExtra:({lvl,os,dps,state,icon,locBadge})=>{
      const SPEC={bm:"BM",mm:"MM",sv:"SV"};
      let h="";
      if(state.pref==="gun"&&!state.eng)
        h+=`<div class="card warn"><h3>${icon("alert")} Guns para Horda</h3>
          <div class="muted">Escasos hasta Megashot Rifle (48). Subí <b>Ingeniería</b> (tilde arriba) para ver los crafteados, o pasate a arco — tu racial te lo agradece.</div></div>`;
      if(lvl>=13&&lvl<21&&!os.has("venomstrike")&&state.cur!=="venomstrike"&&state.realm==="kalimdor")
        h+=`<div class="card danger"><h3>${icon("skull")} Objetivo #1: Venomstrike</h3>
          <div class="muted">Desde 17-19 buscá grupo para <b>Wailing Caverns</b> (SO de Crossroads). <span class="q-rare">Venomstrike</span> cae de Lord Serpentis (~17%) y te lleva hasta los 30. Plan B: Precision Bow en la subasta.</div></div>`;
      if(lvl>=12&&lvl<22&&!os.has("venomstrike")&&state.cur!=="venomstrike"&&state.realm==="ek")
        h+=`<div class="card warn"><h3>${icon("pin")} Estás en EK — ¿viaje por Venomstrike?</h3>
          <div class="muted">WC queda en Kalimdor: zep de Entrañas → Orgrimmar + corrida a Crossroads (~15 min). <span class="q-rare">Venomstrike</span> sigue siendo el mejor arco de tu rango. Si no viajás: <b>Reinforced Bow</b> (vendor, 16) → <b>Bow of Plunder</b> (quest 'Dangerous!', 28, Molino Tarren).</div></div>`;
      if(lvl>=48&&lvl<=58)
        h+=`<div class="card warn"><h3>${icon("scroll")} Quest de clase 50 — Sunken Temple</h3>
          <div class="muted">Al cerrar la cadena elegí: <b>Devilsaur Eye</b> (+150 AP +hit — MM/SV) o <b>Devilsaur Tooth</b> (+200 AP al pet — BM). Tu spec: <b>${{bm:"BM → Tooth",mm:"MM → Eye",sv:"SV → Eye"}[state.spec]}</b>.</div></div>`;
      return h;
    }
  }
}
};
})();
