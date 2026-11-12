/* RETIRADA en la 2.0.0: la página y la skill ya no la publican (ver desktop/src/datos.js).
   tools/auditar-curado.mjs mostró que nombra armas y botín que no existen, una ruta para
   draenei (raza que Forever no tiene), «sin 2H» cuando la clase sí las usa y niveles de
   hechizos equivocados. Se conserva solo como borrador para reescribirla.

   Guía Shaman — WoW: Forever (clase + ambos bandos).
   Consumida por index.html vía window.GUIDE_SHAMAN. Contenido público de la guía.
   NOTA: tabla de armas y fuentes por validar in-game (datos Classic Era 1.12).
   Shaman en Classic: solo armas 1H (hacha/maza/daga) + escudo; sin 2H ni rango.
   Mail a 40 (cuero antes). Totems: quests de clase 10/30/40. */
(function(){
'use strict';

/* ---------- ARMAS (todas 1H: axe/mace/dagger) ---------- */
const W_SHARED = [
  {id:"crudeaxeS",n:"Crude Axe",t:"axe",dps:1.7,lvl:1,src:"Vendor — entrenadores de arma",q:"common"},
  {id:"crudemaceS",n:"Crude Mace",t:"mace",dps:1.6,lvl:1,src:"Vendor — entrenadores de arma",q:"common"},
  {id:"soldieraxeS",n:"Soldier's Axe",t:"axe",dps:3.5,lvl:5,src:"Vendor — ciudad",q:"common"},
  {id:"soldiermaceS",n:"Soldier's Mace",t:"mace",dps:3.4,lvl:5,src:"Vendor — ciudad",q:"common"},
  {id:"fineaxeS",n:"Fine Axe",t:"axe",dps:5.1,lvl:11,src:"Vendor — ciudad",q:"common"},
  {id:"finemaceS",n:"Fine Mace",t:"mace",dps:5.2,lvl:11,src:"Vendor — ciudad",q:"common"},
  {id:"finestaffS",n:"Fine Dagger",t:"dagger",dps:4.8,lvl:11,src:"Vendor — ciudad",q:"common"},
  {id:"masteraxeS",n:"Masterwork Axe",t:"axe",dps:7.1,lvl:17,src:"Vendor — ciudad",q:"common"},
  {id:"mastermaceS",n:"Masterwork Mace",t:"mace",dps:7.0,lvl:17,src:"Vendor — ciudad",q:"common"},
  {id:"balancedaxeS",n:"Balanced Axe",t:"axe",dps:9.8,lvl:23,src:"Vendor — ciudad",q:"common"},
  {id:"balancedmaceS",n:"Balanced Mace",t:"mace",dps:9.6,lvl:23,src:"Vendor — ciudad",q:"common"},
  {id:"waraxeS",n:"War Axe",t:"axe",dps:12.4,lvl:31,src:"Vendor — ciudad",q:"common"},
  {id:"warmaceS",n:"War Mace",t:"mace",dps:12.2,lvl:31,src:"Vendor — ciudad",q:"common"},
  {id:"heavyaxeS",n:"Heavy Axe",t:"axe",dps:15.8,lvl:39,src:"Vendor — ciudad",q:"common"},
  {id:"heavymaceS",n:"Heavy Mace",t:"mace",dps:15.5,lvl:39,src:"Vendor — ciudad",q:"common"},
  {id:"massiveaxeS",n:"Massive Axe",t:"axe",dps:19.2,lvl:47,src:"Vendor — ciudad",q:"common"},
  {id:"massivemaceS",n:"Massive Mace",t:"mace",dps:18.8,lvl:47,src:"Vendor — ciudad",q:"common"},
  {id:"rondelS",n:"Rondel of Ancestry",t:"axe",dps:13.2,lvl:40,src:"Forja — blacksmithing",q:"rare"},
  {id:"charstone",n:"Charstone Dirk",t:"dagger",dps:14.6,lvl:47,src:"Quest — Maraudon (Princesa Theradras)",q:"uncommon"},
  {id:"doomhowl",n:"Doomhowl",t:"axe",dps:27.5,lvl:50,src:"Raro — ~",q:"rare",approx:true},
  {id:"feralgnash",n:"Feralgnash",t:"dagger",dps:24.0,lvl:52,src:"Raro — ~",q:"rare",approx:true},
  {id:"wolfblade",n:"Wolfblade",t:"dagger",dps:16.8,lvl:55,src:"Tribute — Dire Maul North",q:"rare"},
  {id:"darkwardS",n:"Darkmaster's Ward",t:"mace",dps:31.0,lvl:52,src:"Raro — Blackrock Depths ~",q:"rare",approx:true},
  {id:"archaicdefS",n:"Archaic Defender",t:"mace",dps:29.5,lvl:56,src:"Raro BRD (~3%)",q:"rare",note:"El clásico 1H pre-raid — shaman lo usa"},
];
function facWeapons(fac){ return W_SHARED.map(w=>({...w,id:w.id+"::"+fac})); }

/* ---------- DUNGEONS (loot shaman: mail/cuero + armas 1H) ---------- */
const DUNGEONS_S = [
  {n:"Ragefire Chasm", loc:"Orgrimmar", cont:"K", r:[13,18], note:"XP flojo — solo si sobra tiempo.",
   loot:[["Cavedweller Tunic","Túnica — Taragaman"]]},
  {n:"Wailing Caverns", loc:"Los Barrens", cont:"K", r:[17,24], key:true,
   note:"Tu quest de clase de totems está acá — no te la saltees.",
   loot:[["Gordunni Cuirass","Pecho mail del set"]]},
  {n:"Shadowfang Keep", loc:"Bosque de Argénteos", cont:"E", r:[22,30],
   loot:[["Blackwolf Armguards","Brazales — ~"],["Wolfmaster Cape","Capa — Fenrus"]]},
  {n:"Blackfathom Deeps", loc:"Ashenvale", cont:"K", r:[20,27],
   loot:[["Naga Battle Gloves","Guantes mail — Lady Sarevess"],["Glowing Thresher Cape","Capa — Old Serra'kis"]]},
  {n:"Razorfen Kraul", loc:"Sur de Barrens", cont:"K", r:[25,33],
   loot:[["Mantle of Thieves","Hombros cuero — hunter"]]},
  {n:"Gnomeregan", loc:"Dun Morogh (transportador en Booty Bay)", cont:"E", r:[28,35],
   loot:[["Thermaplugg's Left Arm","Hacha 2H azul — no usable (2H)"],["Mechanical Dragonling","Mascota"]]},
  {n:"Scarlet Monastery — Armory", loc:"Tirisfal", cont:"E", r:[32,38], key:true,
   loot:[["Herod's Shoulder","Hombros mail — Herod"],["Ravager","Hacha 2H proc — Herod (NO usable: 2H)"]]},
  {n:"Scarlet Monastery — Cathedral", loc:"Tirisfal", cont:"E", r:[35,40],
   loot:[["Mograine's Might","Maza 2H — Mograine (NO usable: 2H)"],["Patronizing Leggings","Pantalones mail — ~"]]},
  {n:"Razorfen Downs", loc:"Sur de Barrens", cont:"K", r:[37,46], note:"Poco para shaman.",
   loot:[["Dragon's Breath","Daga"]]},
  {n:"Zul'Farrak", loc:"Tanaris", cont:"K", r:[42,50], key:true,
   loot:[["Big Bad Pauldrons","Hombros mail"],["Ripsaw","Hacha 1H — stat stick"]]},
  {n:"Maraudon", loc:"Desolace", cont:"K", r:[45,52], key:true,
   note:"Charstone Dirk por quest — tu daga del tramo.",
   loot:[["Charstone Dirk","Daga 14.6 dps — quest"],["Mark of the Chosen","Trinket — quest"],["Landslide","Maza 2H — NO usable (2H)"]]},
  {n:"Sunken Temple (Atal'Hakkar)", loc:"Swamp of Sorrows", cont:"E", r:[50,55],
   note:"Tu quest de clase 50 — trinket de curación/daño.",
   loot:[["Idol of the Moon","Trinket caster"]]},
  {n:"Blackrock Depths", loc:"Montaña Roca Negra", cont:"E", r:[52,58],
   loot:[["Darkmaster's Ward","Maza 1H — raro ~"],["Blackstone Ring","Anillo +hit — Princesa Moira"],["Hand of Justice","Trinket melee — Angerforge"]]},
  {n:"Dire Maul East / North", loc:"Feralas", cont:"K", r:[55,60], key:true,
   loot:[["Wolfblade","Daga — Tribute (North)"],["Tarnished Elven Ring","Anillo — Tribute (North)"],["Counterattack Lodestone","Trinket — Tribute (North)"]]},
  {n:"Scholomance", loc:"Western Plaguelands", cont:"E", r:[55,60],
   loot:[["Beaststalker (T0)","Set dungeon — tokens"]]},
  {n:"Stratholme", loc:"Eastern Plaguelands", cont:"E", r:[55,60],
   loot:[["Dawnforge","Hacha 2H — Baron Rivendare (NO usable: 2H) ~"]]},
  {n:"Lower/Upper Blackrock Spire", loc:"Montaña Roca Negra", cont:"E", r:[55,60],
   loot:[["The Immolator","Maza 2H — UBRS (NO usable: 2H) ~"],["Truestrike Shoulders","Hombros — Pyroguard (UBRS)"]]},
];

/* ---------- MACROS shaman ---------- */
const MACROS_S = [
  {lvl:1,cat:"DPS",n:"Ataque que nunca se apaga",
   code:"#showtooltip\n/startattack\n/targetenemy [noharm]\n/targetenemy [dead]",
   desc:"Auto Attack + cambia al enemigo cercano si el tuyo murió o no tenés target."},
  {lvl:1,cat:"Curación",n:"Lightning Shield en vos",
   code:"#showtooltip Lightning Shield\n/cast !Lightning Shield",
   desc:"El escudo de relámpago permanente: te devuelve daño cuando te pegan. El ! evita que se apague al volver a pulsar."},
  {lvl:4,cat:"Núcleo",n:"Flame Shock + golpe",
   code:"#showtooltip Flame Shock\n/cast Flame Shock",
   desc:"Flame Shock (DoT de fuego) — tu primer shock. Pone el debuff que mejora tu daño."},
  {lvl:6,cat:"Imbue",n:"Rockbiter imbue",
   code:"#showtooltip Rockbiter Weapon\n/cast Rockbiter Weapon",
   desc:"Imbue melee: +daño en tu golpe blanco. Enhancement lo usa siempre; casters cambian a Flametongue."},
  {lvl:8,cat:"Núcleo",n:"Lightning Bolt",
   code:"#showtooltip Lightning Bolt\n/cast Lightning Bolt",
   desc:"Tu nuke principal de caster/Elemental — cast 2.5s, mucho daño. Frená el auto-attack para castearlo."},
  {lvl:8,cat:"Curación",n:"Healing Wave",
   code:"#showtooltip Healing Wave\n/cast [@player] Healing Wave",
   desc:"Curación directa pesada — para vos o el focus. Cast largo: usala fuera de melee."},
  {lvl:10,cat:"Totem",n:"Searing Totem al suelo",
   code:"#showtooltip Searing Totem\n/cast Searing Totem",
   desc:"Totem de daño melee — pega solo. Lo bajás con /totem o al morir. Ocupa el slot de fuego."},
  {lvl:10,cat:"Totem",n:"Earthbind Totem",
   code:"#showtooltip Earthbind Totem\n/cast Earthbind Totem",
   desc:"Ralentiza a los enemigos cerca — kiting de mobs que huyen. Slot tierra."},
  {lvl:16,cat:"Núcleo",n:"Frost Shock slow",
   code:"#showtooltip Frost Shock\n/cast Frost Shock",
   desc:"Shock de escarcha: daño + slow. Tu botón anti-escape y de control."},
  {lvl:20,cat:"Forma",n:"Ghost Wolf",
   code:"#showtooltip Ghost Wolf\n/cast !Ghost Wolf",
   desc:"Forma de lobo: +15% velocidad de viaje. El ! alterna — salí de combate antes de montar."},
  {lvl:20,cat:"Curación",n:"Chain Heal",
   code:"#showtooltip Chain Heal\n/cast [@focus] Chain Heal",
   desc:"Curación en cadena — pega al focus y salta a aliados cerca. La curación de grupo del resto."},
  {lvl:30,cat:"Imbue",n:"Windfury imbue",
   code:"#showtooltip Windfury Weapon\n/cast Windfury Weapon",
   desc:"Imbue procs de ataque extra — Enhancement dual-wield lo ama. Swappea con Rockbiter según fase."},
  {lvl:40,cat:"Imbue",n:"Flametongue imbue",
   code:"#showtooltip Flametongue Weapon\n/cast Flametongue Weapon",
   desc:"Imbue caster: +daño de spells. Elemental/Restoration lo usan en vez de Rockbiter/Windfury."},
  {lvl:40,cat:"Totem",n:"Mana Spring Totem",
   code:"#showtooltip Mana Spring Totem\n/cast Mana Spring Totem",
   desc:"Regenera mana del grupo — slot agua. Imprescindible para casters en grupo."},
  {lvl:50,cat:"Curación",n:"Cure Disease/Poison",
   code:"#showtooltip Cure Disease\n/cast Cure Disease\n/cast Cure Poison",
   desc:"Cura tus enfermedades y venenos — los mobs de Plaguelands y ST los traen. Úsala seguido."},
];

/* ---------- BARRA shaman ---------- */
const BAR_S = [
  {k:"|°",o:[{m:"Ataque que nunca se apaga",t:"Auto Attack"}]},
  {k:"1",o:[{m:"Lightning Shield en vos",t:"Lightning Shield"}]},
  {k:"2",o:[{m:"Flame Shock + golpe",t:"Flame Shock"},{s:"Flame Shock",lvl:4,t:"Flame Shock"}]},
  {k:"3",o:[{m:"Frost Shock slow",t:"Frost Shock"},{s:"Frost Shock",lvl:16,t:"Frost Shock"}]},
  {k:"4",o:[{m:"Rockbiter imbue",t:"Rockbiter"},{s:"Rockbiter Weapon",lvl:6,t:"Rockbiter"}]},
  {k:"5",o:[{m:"Windfury imbue",t:"Windfury"}]},
  {k:"6",o:[{m:"Lightning Bolt",t:"Lightning Bolt"},{s:"Lightning Bolt",lvl:6,t:"Lightning Bolt"}]},
  {k:"Q",o:[{m:"Searing Totem al suelo",t:"Searing Totem"},{s:"Searing Totem",lvl:10,t:"Searing"}]},
  {k:"W",move:true},{k:"E",move:true},{k:"R",move:true},
  {k:"T",o:[{m:"Ghost Wolf",t:"Ghost Wolf"}]},
  {k:"A",move:true},{k:"S",move:true},{k:"D",move:true},
  {k:"F",o:[{m:"Healing Wave",t:"Healing Wave"},{s:"Healing Wave",lvl:8,t:"Healing Wave"}]},
  {k:"G",o:[{m:"Chain Heal",t:"Chain Heal"}]},
  {k:"Z",o:[{m:"Earthbind Totem",t:"Earthbind"}]},
  {k:"X",o:[{m:"Mana Spring Totem",t:"Mana Spring"}]},
  {k:"C",o:[{m:"Cure Disease/Poison",t:"Cure"}]},
  {k:"V",o:[{m:"Flametongue imbue",t:"Flametongue"}]},
];
const BAR_ROWS_S = [["|°","1","2","3","4","5","6"],["Q","W","E","R","T"],["A","S","D","F","G"],["Z","X","C","V"]];
const BAR_OFFSET_S = [0,1.5,1.75,2.25];
const BAR_MOUSE_S = [
  {k:"clic izq",o:[{m:"Ghost Wolf",t:"Ghost Wolf"}]},
  {k:"clic der",o:[{m:"Lightning Shield en vos",t:"Lightning Shield"}]},
];
const BAR_CLICK_S = ["Ghost Wolf","Lightning Shield en vos","Healing Wave"];
const BAR_ALT1_S = ["Rockbiter imbue","Windfury imbue"];

/* ---------- REGLAS FOREVER shaman ---------- */
const MACRO_RULES_S = `<div class="mst"><span class="tdot"></span><span class="txt"><b>Totems ocupan 4 slots</b> (tierra/fuego/agua/aire): solo uno por elemento a la vez. Cambiar de totem tiene GCD — planificalo entre pulls, no en combate.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Shocks comparten GCD</b> entre sí: Flame→Frost→Earth en cadena para kitear o burst. No puedes castearlos todos en el mismo GCD.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Weapon imbues</b> (Rockbiter/Windfury/Flametongue) swappean con GCD — cambialos entre pulls o fuera de combate.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Lightning Bolt</b> es cast 2.5s — el auto-attack lo cancela: frená antes de castearlo o usá ! para que no se resetee.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Ghost Wolf</b> es forma de viaje (+velocidad) — salí antes de montar o quedate en combate sin bonus.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Totems del grupo:</b> en party compartís totémicos — poné los de buff (Strength of Earth, Grace of Air, Disease Cleansing) y que otro ponga los de daño.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Mail a 40:</b> antes cuero/agilidad-inteligencia; después mail con los stats de tu spec (Enh: str/stam/hit; Ele/Resto: int/spirit).</span></div>`;

/* ---------- BANDAS shaman ---------- */
const BANDS_SH_K = [
  {min:1,max:9,zones:"Durotar (Valle de los Desafíos → Sen'jin)",
   notes:"Quest de clase 10: llamás a los primeros totems (Searing/Earthbind/Mana Spring/Ghost Wolf). Arma 1H de fuerza vendor. Enhancement: dual wield apenas puedas (20)."},
  {min:10,max:17,zones:"Los Barrens (Crossroads)",
   notes:"Quests de la zona + primeros drops. WC para la cadena de totems (¡no te la saltees!). A 16-17 ya podés tankear WC con totems.",
   dung:"Wailing Caverns (17+) — totems + gear"},
  {min:18,max:24,zones:"Barrens → Stonetalon → Ashenvale",
   notes:"BFD a 20+: buen XP para shaman (totems + heals). Ensillá shocks y Ghost Wolf.",
   dung:"BFD (20+) · SFK (22+) · WC restos"},
  {min:25,max:29,zones:"Sur de Barrens / Hillsbrad / Thousand Needles",
   notes:"Quests de Tarren Mill. RFK para XP. Tu arma sigue siendo 1H — dual wield si Enh.",
   dung:"Razorfen Kraul (25+) · SFK restos"},
  {min:30,max:37,zones:"Shimmering Flats → Dustwallow / STV",
   notes:"Shimmering Flats = grind 30-35. En STV la cadena Nesingwary. A 30: quest de totems mejorados. A 32+ SM Armory.",
   dung:"SM Armory (32+) · SM Cathedral (35+) — ojo: su loot estrella es 2H, vos querés las piezas mail"},
  {min:38,max:43,zones:"STV / Desolace / Arathi / Dustwallow",
   notes:"Badlands (Kargath) hub Horde 38-45. A 40: MAIL + quest de totems final. Dual wield Enhancement.",
   dung:"SM Cathedral · Badlands quests"},
  {min:44,max:49,zones:"Tanaris / Feralas / Hinterlands",
   notes:"Maraudon: Charstone Dirk por quest — tu daga. Zul'Farrak para mail/gear.",
   dung:"Zul'Farrak (42+) · Maraudon (45+)"},
  {min:50,max:54,zones:"Un'goro / Felwood / Western Plaguelands",
   notes:"Quest de clase 50 en Sunken Temple — trinket de curación o daño según spec.",
   dung:"Sunken Temple (50+) · BRD (52+): Darkmaster's Ward / Archaic Defender"},
  {min:55,max:60,zones:"EPL / Winterspring / Silithus + dungeons",
   notes:"DM East/North farmeable a 60. Pre-raid: Archaic Defender (mace) o dual wield + T0.",
   dung:"DM East/North · Strat UD · Scholo · LBRS/UBRS · BRD restos"},
];
const BANDS_SH_E = [
  {min:1,max:9,zones:"Tirisfal Glades (o Durotar)",
   notes:"Horde shaman = orco/troll/taureno. Si estás en EK, Tirisfal (Brill) rinde igual que Barrens para este tramo."},
  {min:10,max:17,zones:"Silverpine Forest (El Sepulcro)",
   notes:"Hub del Sepulcro → Pyrewood → Ambermill. Weapon vendors en Entrañas. WC por zep UC→Org para totems.",
   dung:"Shadowfang Keep (18+) · WC vía zep"},
  {min:20,max:29,zones:"Hillsbrad Foothills (Molino Tarren)",
   notes:"Quests de Tarren Mill + Alterac. Mail vendor en Cima del Trueno.",
   dung:"SFK · SM Graveyard/Library (26+)"},
  {min:30,max:37,zones:"STV (Grom'gol) / Arathi / Swamp of Sorrows",
   notes:"Zep UC→Grom'gol a STV. Cadena Nesingwary. Totems mejorados al 30. SM Armory al 32.",
   dung:"SM Armory (32+) · SM Cathedral (35+)"},
  {min:38,max:43,zones:"STV / Badlands (Kargath) / Swamp of Sorrows",
   notes:"Kargath hub Horde EK 38-45. A 40 mail + totems finales.",
   dung:"SM Cathedral · Badlands quests"},
  {min:44,max:49,zones:"Hinterlands / Searing Gorge / Blasted Lands",
   notes:"Maraudon en Kalimdor (zep→Org→Desolace): Charstone Dirk. ZF para gear.",
   dung:"ST (48+, en continente) · Mara/ZF vía Kalimdor"},
  {min:50,max:54,zones:"Searing Gorge / Burning Steppes / WPL",
   notes:"ST = tu quest de clase 50 en EK. BRD al 52 para Archaic Defender / Darkmaster's Ward.",
   dung:"Sunken Temple (50+) · BRD (52+)"},
  {min:55,max:60,zones:"EPL / WPL / Blackrock Mountain",
   notes:"EK = endgame: Strat, Scholo, Spire, BRD. DM East pide viaje a Feralas.",
   dung:"Strat UD · Scholo · LBRS/UBRS · BRD · DM East vía Kalimdor"},
];
const BANDS_SH_WA_EK = [
  {min:1,max:9,zones:"Azuremyst Isle (Dun Algaz / Ammen Vale)",
   notes:"Draenei shaman empieza en Azuremyst — el único bando-clase que arranca acá. Quests de clase 10: primeros totems (Searing/Earthbind/Mana Spring/Ghost Wolf). Arma 1H vendor."},
  {min:10,max:17,zones:"Azuremyst → Bloodmyst Isle → exodar/Hubbardton?",
   notes:"Terminás Azuremyst y pasás a Bloodmyst. A 12-15 zep a EK (Menethil/Lakeshire) o quedate en Bloodmyst. Quests de la zona.",
   dung:"Wailing Caverns (17+, via Kalimdor u Org) · Shadowfang Keep (18+, EK)"},
  {min:18,max:24,zones:"EK: Redridge / Duskwood / Loch Modan",
   notes:"Lakeshire / Darkshire / Astranaar hubs. SFK en tu continente (18+) — buen XP y loot. WC para totems si viajas a Kalimdor.",
   dung:"SFK (18+) · BFD (20+, Ashenvale)"},
  {min:25,max:29,zones:"Wetlands / Arathi / Thousand Needles",
   notes:"Menethil/Refuge Pointe hubs. Quests de Wetlands + Arathi.",
   dung:"Razorfen Kraul (25+) · SFK restos"},
  {min:30,max:37,zones:"Arathi / Dustwallow / Tanaris",
   notes:"Ratchet (Tanaris) = meca 30-40. Quests + vendors. Totems mejorados al 30. SM Armory al 32.",
   dung:"SM Armory (32+) · SM Cathedral (35+)"},
  {min:38,max:43,zones:"Tanaris / Feralas / Hinterlands",
   notes:"Hinterlands (Aerie Peak). A 40 mail + totems finales. ZF al 42.",
   dung:"SM Cathedral · Zul'Farrak (42+)"},
  {min:44,max:49,zones:"Feralas / Hinterlands / Un'goro",
   notes:"Maraudon (Desolace): Charstone Dirk por quest. Bloodseeker es 2H — no la uses, buscá mazas/dagas 1H.",
   dung:"Zul'Farrak · Maraudon (45+)"},
  {min:50,max:54,zones:"Un'goro / Felwood / Western Plaguelands",
   notes:"ST en Swamp of Sorrows: quest de clase 50 (trinket curación/daño). BRD al 52.",
   dung:"Sunken Temple (50+) · BRD (52+): Archaic Defender / Darkmaster's Ward"},
  {min:55,max:60,zones:"Eastern Plaguelands / Winterspring / Silithus + BRD",
   notes:"Stratholme, Scholo, Spire, BRD en EK. DM East pide viaje a Feralas.",
   dung:"Stratholme UD · Scholomance · LBRS/UBRS · BRD · DM East"},
];
const BANDS_SH_WA_K = [
  {min:1,max:9,zones:"Azuremyst / Bloodmyst → zep a Kalimdor",
   notes:"Draenei: terminás las islas y zepás a Kalimdor (Auberdine/Dolanaar) o seguís en EK. Acá solo aplica si elegiste Kalimdor — la ruta de Eastern Kingdoms es la principal para Alliance shaman."},
  {min:10,max:19,zones:"Darkshore / Ashenvale",
   notes:"Hub Auberdine. BFD en Ashenvale (20+) — tu primer raid-dungeon. WC por zep a Org para totems.",
   dung:"Blackfathom Deeps (20+) · SFK si volviste a EK"},
  {min:20,max:29,zones:"Ashenvale / Stonetalon / Desolace",
   notes:"Ashenvale→Stonetalon→Desolace. BFD cierra tu rango. Alternativa: volvé a EK (Wetlands).",
   dung:"BFD (20+) · SFK restos"},
  {min:30,max:37,zones:"Desolace / Dustwallow / Tanaris",
   notes:"Ratchet = hub 30-40. Totems mejorados al 30. SM Armory al 32.",
   dung:"SM Armory (32+) · SM Cathedral (35+)"},
  {min:38,max:43,zones:"Tanaris / Feralas / Hinterlands",
   notes:"Hinterlands (Aerie Peak) 45+. A 40 mail. ZF al 42.",
   dung:"SM Cathedral · Zul'Farrak (42+)"},
  {min:44,max:49,zones:"Feralas / Hinterlands / Un'goro",
   notes:"Maraudon: Charstone Dirk. DM East/North al 55+.",
   dung:"Zul'Farrak · Maraudon (45+)"},
  {min:50,max:54,zones:"Un'goro / Felwood / Silithus",
   notes:"ST/BRD en EK — zep a Menethil. Tu quest de clase 50 está en ST.",
   dung:"Sunken Temple (50+, vía EK) · BRD (52+, vía EK)"},
  {min:55,max:60,zones:"Felwood / Winterspring + dungeons EK",
   notes:"Endgame en EK: Strat, Scholo, Spire, BRD. DM East/North en Feralas (tu continente).",
   dung:"DM East/North · Strat · Scholo · LBRS/UBRS · BRD"},
];

/* ---------- MILESTONES shaman (compartidos por facción) ---------- */
const MILE_M_S = [
  {lvl:10,cat:"Clase",txt:"Quest de clase: llamás a los primeros totems (Searing/Earthbind/Mana Spring/Ghost Wolf)",loc:"K"},
  {lvl:12,cat:"Vendor",txt:"Arma 1H de fuerza (vendor ciudad)"},
  {lvl:17,cat:"Dungeon",txt:"WC: cadena de totems + gear",loc:"K"},
  {lvl:20,cat:"Clase",txt:"Dual Wield (Enhancement) o escudo+1H (Ele/Resto); Ghost Wolf",loc:"K"},
  {lvl:25,cat:"Dungeon",txt:"Razorfen Kraul: XP + gear",loc:"K"},
  {lvl:30,cat:"Clase",txt:"Quest de totems mejorados (las 4 clases de totem suben de nivel)",loc:"K"},
  {lvl:32,cat:"Dungeon",txt:"SM Armory: piezas mail/int — su loot estrella es 2H (no usable)",loc:"E"},
  {lvl:35,cat:"Dungeon",txt:"SM Cathedral: gear caster",loc:"E"},
  {lvl:40,cat:"Clase",txt:"¡MAIL! + quest de totems finales",loc:"K"},
  {lvl:42,cat:"Dungeon",txt:"Zul'Farrak: gear mail/cuero — Bloodseeker es 2H, saltala",loc:"K"},
  {lvl:45,cat:"Quest",txt:"Maraudon: Charstone Dirk por quest — tu daga 1H",loc:"K"},
  {lvl:50,cat:"Clase",txt:"Quest de clase (ST): trinket de curación o daño — en EK",loc:"E"},
  {lvl:52,cat:"Dungeon",txt:"BRD: Archaic Defender (mace) / Darkmaster's Ward",loc:"E"},
  {lvl:55,cat:"Dungeon",txt:"DM East/North farmeable solo a 60: Wolfblade (daga)",loc:"K"},
  {lvl:56,cat:"Dungeon",txt:"Pre-raid: Archaic Defender o dual wield + T0",loc:"E"},
  {lvl:60,cat:"Meta",txt:"BiS pre-raid: weapon caster o dual wield + T0/trinkets"},
];

(typeof module==='object'&&module&&module.exports?module.exports:window).GUIDE_SHAMAN={
id:"shaman",name:"Shaman",icon:"staff",title:"Senda del Chamán",accent:"#2e5f96",
specs:{elemental:"Elemental",enhancement:"Enhancement",restoration:"Restoration"},defaultSpec:"enhancement",
specNote:"Enhancement = el DPS/solo de leveling (dual wield + shocks). Elemental pega más pero es caster frágil. Restoration si vas a healer.",
prefs:[["axe","Hachas"],["mace","Mazas"],["dagger","Dagas"],["any","Cualq."]],defaultPref:"any",
prefNote:"Shaman solo usa armas 1H (hacha/maza/daga) + escudo — sin 2H ni rango en Classic. Enh: dual wield; Ele/Resto: 1H+escudo o stat stick.",
useEng:false,
types:{axe:"Hacha",mace:"Maza",dagger:"Daga"},
badges:{axe:"axe",mace:"mace",dagger:"dagger"},
typeFilters:[["all","Todas"],["axe","Hachas"],["mace","Mazas"],["dagger","Dagas"]],
simc:{slot:"main_hand",pet:false,racePref:{}},
macros:MACROS_S,
bar:{keys:BAR_S,rows:BAR_ROWS_S,offset:BAR_OFFSET_S,mouse:BAR_MOUSE_S,click:BAR_CLICK_S,alt1:BAR_ALT1_S},
macroRules:MACRO_RULES_S,
barNotes:{
  intro:"Cada tecla queda fija del 12 al 60: lo punteado se llena solo cuando llegás al nivel. Clic en una tecla para ver su macro. Shaman = totens + shocks + imbues.",
  dungeon:" <b>En dungeon:</b> Searing/Earthbind/Mana Spring según el pull; Ghost Wolf para salir.",
  altNote:"para swappear imbues rápido.",
  before:"<b>Antes de empezar:</b> tené un totem por elemento siempre activo. Los shocks comparten GCD — no encadenes los tres en un pull."
},
dungeons:DUNGEONS_S,
ahList:[
  ["Archaic Defender","Maza 1H BRD (~3%)","El 1H icónico — lo usan shaman y warrior"],
  ["Darkmaster's Ward","Maza 1H BRD raro","Stats caster-melee — vale para Ele/Resto"],
  ["Wolfblade","Daga DM Tribute","Farmeable solo a 60 — Enh dagger"],
  ["Rondel of Ancestry","Hacha 1H forja","La axe crafteada — stat stick melee"],
  ["Charstone Dirk","Daga Mara quest","Tu daga 45-50"],
],
extras:{
  ahTitle:"Lista de compras — Subasta (BoE)",
  tipsTitle:"Tips de shaman",
  tips:[
    ["Arma:","Str (Enh) o Int (Ele/Resto) > stam/spirit. Shaman NO usa 2H ni rango — todo es 1H + escudo. Mail a 40."],
    ["Totems:","4 slots (tierra/fuego/agua/aire) — uno por elemento. En grupo compartís totémicos: buff de stats + el de daño lo pone otro."],
    ["Imbues:","Rockbiter (melee plano), Windfury (procs, Enh), Flametongue (caster). Swappean con GCD — fuera de combate."],
    ["Shocks:","Flame DoT + Frost slow + Earth burst — comparten GCD entre sí, no los encadenes todos."],
    ["Ghost Wolf:","forma de viaje +15% velocidad — salí antes de montar o quedate caminando."],
    ["Casteo:","Lightning Bolt/Healing Wave son largos — frená el auto-attack o usá ! para que no se cancele."],
    ["Mail:","cuero antes de 40, mail después — nunca plate."],
  ],
  warn:"La guía usa datos de Classic Era / vanilla 1.12 (la base de Forever). Si el server retocó drops o stats, verificá cada ítem in-game — la ruta de zonas y dungeons igual aplica."
},
factions:{
  horde:{
    weapons:facWeapons("horde"),
    milestones:MILE_M_S,
    routes:{kalimdor:BANDS_SH_K,ek:BANDS_SH_E},
    recExtra:({lvl,os,state,icon})=>{
      let h="";
      if(lvl>=30&&lvl<=45)
        h+=`<div class="card warn"><h3>${icon("scroll")} No te saltees las quests de totems</h3>
          <div class="muted">Al 10, 30 y 40 hay quests de clase que mejoran tus 4 totems — son tu identidad de clase. Sin ellas los totems quedan débiles toda la guía.</div></div>`;
      if(lvl>=45&&lvl<=52)
        h+=`<div class="card warn"><h3>${icon("pin")} Ojo: Bloodseeker es 2H</h3>
          <div class="muted">En Zul'Farrak el Big Bad Wolf tira la <span class="q-rare">Bloodseeker</span> — <b>no la podés equipar</b> (shaman no usa 2H). Tu arma es 1H: buscá mazas/dagas con hit/haste/int según spec.</div></div>`;
      if(lvl>=50&&lvl<=58)
        h+=`<div class="card warn"><h3>${icon("star")} Pre-raid: arma + T0</h3>
          <div class="muted">Ele/Resto: arma caster (int/spirit) o 1H+escudo. Enh: dual wield 1H (Archaic Defender + dagger). Tu spec: <b>${{elemental:"Elemental",enhancement:"Enhancement",restoration:"Resto"}[state.spec]}</b>.</div></div>`;
      return h;
    }
  },
  alliance:{
    weapons:facWeapons("alliance"),
    milestones:MILE_M_S,
    routes:{ek:BANDS_SH_WA_EK,kalimdor:BANDS_SH_WA_K},
    recExtra:({lvl,os,state,icon})=>{
      let h="";
      if(lvl>=10&&lvl<20)
        h+=`<div class="card key"><h3>${icon("pin")} Empieza en Azuremyst</h3>
          <div class="muted">Sos draenei: tu ruta principal es <b>Azuremyst → Bloodmyst → zep a EK</b>. La ruta Kalimdor es la alternativa si preferís Darkshore/Ashenvale.</div></div>`;
      if(lvl>=30&&lvl<=45)
        h+=`<div class="card warn"><h3>${icon("scroll")} No te saltees las quests de totems</h3>
          <div class="muted">Al 10, 30 y 40 las quests de clase mejoran tus totems — tu identidad de clase.</div></div>`;
      if(lvl>=45&&lvl<=52)
        h+=`<div class="card warn"><h3>${icon("pin")} Ojo: Bloodseeker es 2H</h3>
          <div class="muted"><b>No la podés equipar</b> — buscá mazas/dagas 1H con hit/haste/int.</div></div>`;
      if(lvl>=50&&lvl<=58)
        h+=`<div class="card warn"><h3>${icon("star")} Pre-raid: arma + T0</h3>
          <div class="muted">Ele/Resto: arma caster o 1H+escudo. Enh: dual wield 1H.</div></div>`;
      return h;
    }
  }
}
};
})();
