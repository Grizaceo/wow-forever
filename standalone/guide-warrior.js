/* Guía Warrior — WoW: Forever (clase + ambos bandos).
   Consumida por index.html vía window.GUIDE_WARRIOR. Contenido público de la guía.
   NOTA: tabla de armas y fuentes por validar in-game (datos Classic Era 1.12). */
(function(){
'use strict';

/* ---------- ARMAS ----------
   t = tipo (sword/axe/mace/dagger/polearm/staff/bow/gun) · f = grupo de filtro
   ("2h" dos manos · "1h" una mano · "rng" a distancia).
   q = rareza de color. ~ = dps aproximado. La mayoría son compartidas entre
   facciones (vendors, dungeon drops, forja); las quests de facción se marcan. */
const W_SHARED = [
  {id:"crudesword",n:"Crude Short Sword",t:"sword",f:"1h",dps:1.6,lvl:1,src:"Vendor — entrenadores de arma",q:"common"},
  {id:"crudeaxe",n:"Crude Axe",t:"axe",f:"1h",dps:1.7,lvl:1,src:"Vendor — entrenadores de arma",q:"common"},
  {id:"soldiersword",n:"Soldier's Sword",t:"sword",f:"1h",dps:3.4,lvl:5,src:"Vendor — ciudad",q:"common"},
  {id:"soldieraxe",n:"Soldier's Axe",t:"axe",f:"1h",dps:3.5,lvl:5,src:"Vendor — ciudad",q:"common"},
  {id:"fineblade",n:"Fine Longsword",t:"sword",f:"1h",dps:5.0,lvl:11,src:"Vendor — ciudad",q:"common"},
  {id:"fineaxe",n:"Fine Axe",t:"axe",f:"1h",dps:5.1,lvl:11,src:"Vendor — ciudad",q:"common"},
  {id:"finemace",n:"Fine Mace",t:"mace",f:"1h",dps:5.2,lvl:11,src:"Vendor — ciudad",q:"common"},
  {id:"masterwork",n:"Masterwork Longsword",t:"sword",f:"1h",dps:7.0,lvl:17,src:"Vendor — ciudad",q:"common"},
  {id:"masteraxe",n:"Masterwork Axe",t:"axe",f:"1h",dps:7.1,lvl:17,src:"Vendor — ciudad",q:"common"},
  {id:"bigbattle",n:"Big Battle Axe",t:"axe",f:"2h",dps:8.6,lvl:20,src:"Vendor / drops ~",q:"uncommon",approx:true},
  {id:"gordunni",n:"Gordunni Ogre-Rend",t:"axe",f:"2h",dps:12.4,lvl:19,src:"Quest — Wailing Caverns (cualquier facción)",q:"uncommon",note:"El 2H icónico del warrior bajo nivel"},
  {id:"spiteblade",n:"Spiteblade",t:"sword",f:"1h",dps:11.8,lvl:21,src:"Drop raro — Wailing Caverns ~",q:"rare",approx:true},
  {id:"halycon",n:"Halycon",t:"sword",f:"2h",dps:15.4,lvl:30,src:"Drop — Wailing Caverns / Hillsbrad ~",q:"rare",approx:true},
  {id:"rondel",n:"Rondel of Ancestry",t:"axe",f:"1h",dps:13.2,lvl:40,src:"Forja — blacksmithing",q:"rare"},
  {id:"whirlwindaxe",n:"Whirlwind Axe",t:"axe",f:"2h",dps:18.6,lvl:40,src:"Morgan Sternbraid — SM Armory",q:"rare"},
  {id:"ironsong",n:"Ironsong Glaive",t:"polearm",f:"2h",dps:19.8,lvl:46,src:"Forja — blacksmithing (receta rara)",q:"rare",note:"La polearm crafteada clásica"},
  {id:"thrashblade",n:"Thrash Blade",t:"sword",f:"1h",dps:14.8,lvl:47,src:"Quest — Maraudon",q:"uncommon"},
  {id:"eviscerator",n:"Eviscerator",t:"axe",f:"2h",dps:20.8,lvl:48,src:"Forja — blacksmithing",q:"rare"},
  {id:"bloodseeker",n:"Bloodseeker",t:"axe",f:"2h",dps:25.4,lvl:50,src:"The Big Bad Wolf — Zul'Farrak",q:"rare",note:"Carísima en subasta — farmeala"},
  {id:"darkward",n:"Darkmaster's Ward",t:"mace",f:"1h",dps:31.0,lvl:52,src:"Raro — Blackrock Depths ~",q:"rare",approx:true},
  {id:"barbarous",n:"Barbarous Blade",t:"sword",f:"2h",dps:25.0,lvl:55,src:"Revelosh — Dire Maul North (Tribute)",q:"rare"},
  {id:"archaicdef",n:"Archaic Defender",t:"mace",f:"1h",dps:29.5,lvl:56,src:"Raro BRD (~3%)",q:"rare",note:"El clásico 1H pre-raid"},
  {id:"bow1",n:"Composite Longbow",t:"bow",f:"rng",dps:14.0,lvl:30,src:"Vendor / drops — arco stat stick",q:"uncommon",approx:true},
  {id:"gun1",n:"Deadeye Gun",t:"gun",f:"rng",dps:20.0,lvl:45,src:"Drop raro / subasta — gun stat stick",q:"rare",approx:true},
];

/* Ids únicos por facción: el progreso (owned/cur) no se mezcla al cambiar de bando. */
function facWeapons(fac){
  return W_SHARED.map(w=>({...w,id:w.id+"::"+fac}));
}

/* ---------- DUNGEONS (loot warrior) ---------- */
const DUNGEONS_W = [
  {n:"Ragefire Chasm", loc:"Orgrimmar", cont:"K", r:[13,18], note:"XP flojo para warrior — solo si sobra tiempo.",
   loot:[["Cavedweller Tunic","Túnica — Taragaman"]]},
  {n:"Wailing Caverns", loc:"Los Barrens", cont:"K", r:[17,24], key:true,
   note:"Tu quest de arma: Gordunni Ogre-Rend te cambia el daño.",
   loot:[["Gordunni Ogre-Rend","Hacha 2H 12.4 dps — quest"],["Halycon","Espada 2H — ~"],["Spiteblade","Espada 1H — ~"],["Gordunni Cuirass","Pecho mail del set"],["Gordunni Bracers","Brazales mail del set"]]},
  {n:"Shadowfang Keep", loc:"Bosque de Argénteos", cont:"E", r:[22,30],
   note:"Cerca de Silverpine — tu dungeon EK temprana.",
   loot:[["Blackwolf Armguards","Brazales — ~"],["Wolfmaster Cape","Capa — Fenrus"]]},
  {n:"Blackfathom Deeps", loc:"Ashenvale", cont:"K", r:[20,27],
   loot:[["Naga Battle Gloves","Guantes mail — Lady Sarevess"],["Glowing Thresher Cape","Capa — Old Serra'kis"]]},
  {n:"Razorfen Kraul", loc:"Sur de Barrens", cont:"K", r:[25,33],
   loot:[["Mantle of Thieves","Hombros cuero — hunter"]]},
  {n:"Gnomeregan", loc:"Dun Morogh (transportador en Booty Bay)", cont:"E", r:[28,35],
   note:"Largo pero buen XP; el Thermaplugg's Left Arm es stat stick 2H.",
   loot:[["Thermaplugg's Left Arm","Hacha 2H azul — Stat stick"],["Mechanical Dragonling","Mascota"]]},
  {n:"Scarlet Monastery — Armory", loc:"Tirisfal", cont:"E", r:[32,38], key:true,
   loot:[["Whirlwind Axe","Hacha 2H 18.6 dps — Morgan Sternbraid"],["Herod's Shoulder","Hombros mail — Herod"],["Ravager","Hacha 2H proc — Herod (stat stick)"]]},
  {n:"Scarlet Monastery — Cathedral", loc:"Tirisfal", cont:"E", r:[35,40],
   loot:[["Mograine's Might","Maza 2H — Mograine (stat stick)"],["Patronizing Leggings","Pantalones mail — ~"]]},
  {n:"Razorfen Downs", loc:"Sur de Barrens", cont:"K", r:[37,46], note:"Poco para warrior.",
   loot:[["Dragon's Breath","Daga"]]},
  {n:"Zul'Farrak", loc:"Tanaris", cont:"K", r:[42,50], key:true,
   loot:[["Bloodseeker","Hacha 2H 25.4 dps — Big Bad Wolf"],["Big Bad Pauldrons","Hombros mail"],["Ripsaw","Hacha 1H — stat stick"]]},
  {n:"Maraudon", loc:"Desolace", cont:"K", r:[45,52], key:true,
   note:"Thrash Blade por quest y arena para la quest de clase 50.",
   loot:[["Thrash Blade","Espada 1H 14.8 dps — quest"],["Mark of the Chosen","Trinket — quest"],["Charstone Dirk","Daga — Princesa Theradras"],["Landslide","Maza 2H — ~"]]},
  {n:"Sunken Temple (Atal'Hakkar)", loc:"Swamp of Sorrows", cont:"E", r:[50,55],
   note:"Tu quest de clase 50 — trinket de daño melee.",
   loot:[["Idol of the Moon","Trinket caster (no warrior)"]]},
  {n:"Blackrock Depths", loc:"Montaña Roca Negra", cont:"E", r:[52,58],
   loot:[["Darkmaster's Ward","Maza 1H — raro ~"],["Blackstone Ring","Anillo +hit — Princesa Moira"],["Hand of Justice","Trinket melee — Angerforge"]]},
  {n:"Dire Maul East / North", loc:"Feralas", cont:"K", r:[55,60], key:true,
   note:"A 60 farmeá DM East SOLO y Tribute de North (PvE).",
   loot:[["Barbarous Blade","Espada 2H 25 dps — Revelosh (North)"],["Tarnished Elven Ring","Anillo — Tribute (North)"],["Counterattack Lodestone","Trinket — Tribute (North)"],["Wolfblade","Daga — Tribute (North)"]]},
  {n:"Scholomance", loc:"Western Plaguelands", cont:"E", r:[55,60],
   loot:[["Beaststalker (T0)","Set dungeon — tokens Scholo/ZF/BRD/SFK"]]},
  {n:"Stratholme", loc:"Eastern Plaguelands", cont:"E", r:[55,60],
   loot:[["Dawnforge","Hacha 2H — Baron Rivendare (UD) ~"]]},
  {n:"Lower/Upper Blackrock Spire", loc:"Montaña Roca Negra", cont:"E", r:[55,60],
   loot:[["The Immolator","Maza 2H — UBRS ~"],["Truestrike Shoulders","Hombros — Pyroguard (UBRS)"]]},
];

/* ---------- MACROS warrior ---------- */
const MACROS_W = [
  {lvl:1,cat:"DPS",n:"Ataque que nunca se apaga",
   code:"#showtooltip\n/startattack\n/targetenemy [noharm]\n/targetenemy [dead]",
   desc:"Auto Attack + cambia al enemigo cercano si el tuyo murió o no tenés target. Tu botón por defecto."},
  {lvl:1,cat:"DPS",n:"Heroic Strike en la misma pulsación",
   code:"#showtooltip Heroic Strike\n/cast Heroic Strike",
   desc:"HS gasta rage y usa GCD: spameala mientras tengas rage. Tu golpe principal de daño melee."},
  {lvl:4,cat:"DPS",n:"Charge + golpe",
   code:"#showtooltip Charge\n/cast Charge\n/cast Heroic Strike",
   desc:"Charge (4+) te deja pegado al mob y HS sale enseguida. Fuera de melee no carga — acercate primero."},
  {lvl:8,cat:"CC",n:"Hamstring siempre",
   code:"#showtooltip Hamstring\n/cast Hamstring",
   desc:"Baja velocidad de huida. Obligatoria en cada mob que corre: kitear o que no escape."},
  {lvl:10,cat:"DPS",n:"Overpower tras esquivar",
   code:"#showtooltip Overpower\n/cast Overpower",
   desc:"Solo funciona después de que el mob te esquiva un golpe. Si no hay dodge, no sale — por eso va en su propia tecla."},
  {lvl:10,cat:"DPS",n:"Battle Stance por defecto",
   code:"#showtooltip Battle Stance\n/cast Battle Stance",
   desc:"Battle = + AP, la stance de leveling. Defensive solo si vas a tankear; Berserker suma crit pero quita defensa."},
  {lvl:16,cat:"AoE",n:"Thunder Clap en pack",
   code:"#showtooltip Thunder Clap\n/cast Thunder Clap",
   desc:"Golpea a todos los enemigos cerca y baja su ataque. Imprescindible en pulls de 2+. Gasta rage."},
  {lvl:20,cat:"DPS",n:"Sunder Armor x2 + golpe",
   code:"#showtooltip\n/castsequence reset=combat Sunder Armor, Sunder Armor, Heroic Strike",
   desc:"Dos Sunders bajan la armadura del mob (más daño para vos y el grupo) y HS cierra. Se resetea al salir de combate."},
  {lvl:24,cat:"DPS",n:"Execute (<20%)",
   code:"#showtooltip Execute\n/cast [combat] Execute",
   desc:"Solo bajo 20% de vida: daño enorme por rage. Tu botón de remate — spamealo en la fase final."},
  {lvl:32,cat:"AoE",n:"Whirlwind en stunlock",
   code:"#showtooltip Whirlwind\n/cast Whirlwind",
   desc:"Golpea a todos con tus armas. Arms la usa directo; verificala según tu spec."},
  {lvl:40,cat:"Defensa",n:"Defensive Stance tank",
   code:"#showtooltip Defensive Stance\n/cast Defensive Stance",
   desc:"+vida, menos daño. Para tankear dungeons con grupo o cuando un caster te one-shottea."},
  {lvl:46,cat:"DPS",n:"Sweeping Strikes cleave",
   code:"#showtooltip Sweeping Strikes\n/cast Sweeping Strikes",
   desc:"Tus golpes melee golpean también al segundo objetivo. Con 2+ mobs pegados multiplica el daño."},
  {lvl:52,cat:"PvP",n:"Pummel interrupt",
   code:"#showtooltip Pummel\n/cast [@focus,exists,harm] Pummel; Pummel",
   desc:"Interrumpe el cast del focus/target (Arms/Fury). La contraparte melee del Kick de los casters."},
  {lvl:52,cat:"PvP",n:"Shield Bash interrupt",
   code:"#showtooltip Shield Bash\n/cast [@focus,exists,harm] Shield Bash; Shield Bash",
   desc:"Con escudo (Prot): interrumpe el cast del focus o del target. Sin escudo no funciona."},
  {lvl:58,cat:"DPS",n:"Berserker Rage (bajo)",
   code:"#showtooltip Berserker Rage\n/cast Berserker Rage",
   desc:"Enrage: +attack power, inmune a fear/sap, pero -defensa. Úsala cuando ya tenés aggro y vida de sobra."},
];

/* ---------- BARRA warrior ---------- */
const BAR_W = [
  {k:"|°",o:[{m:"Ataque que nunca se apaga",t:"Auto Attack"}]},
  {k:"1",o:[{m:"Heroic Strike en la misma pulsación",t:"Heroic Strike"}]},
  {k:"2",o:[{m:"Charge + golpe",t:"Charge"},{s:"Charge",lvl:4,t:"Charge"}]},
  {k:"3",o:[{m:"Hamstring siempre",t:"Hamstring"},{s:"Hamstring",lvl:8,t:"Hamstring"}]},
  {k:"4",o:[{m:"Overpower tras esquivar",t:"Overpower"},{s:"Overpower",lvl:10,t:"Overpower"}]},
  {k:"5",o:[{m:"Sunder Armor x2 + golpe",t:"Sunder x2"},{s:"Sunder Armor",lvl:4,t:"Sunder"}]},
  {k:"6",o:[{m:"Battle Stance por defecto",t:"Battle Stance"},{s:"Battle Stance",lvl:10,t:"Battle"}]},
  {k:"Q",o:[{m:"Thunder Clap en pack",t:"Thunder Clap"},{s:"Thunder Clap",lvl:8,t:"Thunder Clap"}]},
  {k:"W",move:true},{k:"E",move:true},{k:"R",move:true},
  {k:"T",o:[{m:"Defensive Stance tank",t:"Defensive"}]},
  {k:"A",move:true},{k:"S",move:true},{k:"D",move:true},
  {k:"F",o:[{m:"Shield Bash interrupt",t:"Shield Bash"},{s:"Pummel",lvl:52,t:"Pummel"}]},
  {k:"G",o:[{m:"Execute (<20%)",t:"Execute"},{s:"Execute",lvl:24,t:"Execute"}]},
  {k:"Z",o:[{m:"Whirlwind en stunlock",t:"Whirlwind"}]},
  {k:"X",o:[{m:"Sweeping Strikes cleave",t:"Sweeping"}]},
  {k:"C",o:[{m:"Berserker Rage (bajo)",t:"Berserker Rage"}]},
  {k:"V",o:[{m:"Pummel interrupt",t:"Pummel"}]},
];
const BAR_ROWS_W = [["|°","1","2","3","4","5","6"],["Q","W","E","R","T"],["A","S","D","F","G"],["Z","X","C","V"]];
const BAR_OFFSET_W = [0,1.5,1.75,2.25];
const BAR_MOUSE_W = [
  {k:"clic izq",o:[{m:"Charge + golpe",t:"Charge"}]},
  {k:"clic der",o:[{m:"Hamstring siempre",t:"Hamstring"}]},
];
const BAR_CLICK_W = ["Battle Stance por defecto","Defensive Stance tank","Berserker Rage (bajo)"];
const BAR_ALT1_W = ["Sunder Armor x2 + golpe","Overpower tras esquivar"];

/* ---------- REGLAS FOREVER warrior ---------- */
const MACRO_RULES_W = `<div class="mst"><span class="tdot"></span><span class="txt"><b>Rage es el recurso:</b> pegás para generar y gastás en Heroic/Execute. No entres al pull grande sin rage — HS en exceso la desperdicia.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Stances:</b> Battle (+AP) para daño, Defensive (+vida) para tank, Berserker (+crit) para burst. Cambiar de stance tiene GCD — swappeá entre pulls.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Overpower</b> solo tras un dodge del mob — si no hay dodge, el botón no hace nada (no es un bug).</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Execute</b> exige <20% de vida del mob y gasta toda la rage — guardala para el tramo final.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Interrupts:</b> Shield Bash (con escudo, Prot) y Pummel (52+, Arms/Fury) en casters del grupo — no en el melee.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Thunder Clap</b> pega a todos y baja su ataque — en packs de 2+ es más eficiente que singles.</span></div>
    <div class="mst"><span class="tdot"></span><span class="txt"><b>Dual Wield (20):</b> dos 1H de fuerza/stamina rinden más que un 2H para Arms/Fury; Prot prefiere escudo + 1H.</span></div>`;

/* ---------- BANDAS warrior ---------- */
const BANDS_WH_K = [
  {min:1,max:9,zones:"Durotar (Valle de los Desafíos → Sen'jin)",
   notes:"Estándar: quest de clase 10 (Battle Shout + Charge si Arms). Arma 1H de fuerza de vendor. A 8-9 ya podés probar Charge."},
  {min:10,max:17,zones:"Los Barrens (Crossroads)",
   notes:"Quests de la zona + primeros drops. A 16-17 WC abre: tu quest Gordunni Ogre-Rend (2H axe) es EL salto de daño.",
   dung:"Wailing Caverns (17+) — Gordunni set + quest del arma"},
  {min:18,max:24,zones:"Barrens → Stonetalon → Ashenvale",
   notes:"Spiteblade/Halycon si te tocan (~). Ensillá Charge y Thunder Clap. Sos melee puro — sin pet, sin rango.",
   dung:"WC si te falta la quest · BFD (20+) · SFK (22+)"},
  {min:25,max:29,zones:"Sur de Barrens / Hillsbrad / Thousand Needles",
   notes:"Mail a 40 está lejos — hasta entonces cuero agi/stam. Quests de Tarren Mill. RFK para XP si te queda cerca.",
   dung:"Razorfen Kraul (25+) · SFK · Gnomeregan opcional"},
  {min:30,max:37,zones:"Shimmering Flats → Dustwallow / STV",
   notes:"Shimmering Flats = grind 30-35 top. En STV la cadena Nesingwary da gold y XP. A 32+ SM Armory: Whirlwind Axe es TU arma.",
   dung:"SM Armory (32+, Whirlwind Axe + Herod's Shoulder) · SM Cathedral (35+)"},
  {min:38,max:43,zones:"STV / Desolace / Arathi / Dustwallow",
   notes:"Badlands (Kargath) es buen hub Horde 38-45. A 40 entrená MAIL — es tu armadura de leveling.",
   dung:"SM Cathedral · Badlands quests"},
  {min:44,max:49,zones:"Tanaris / Feralas / Hinterlands",
   notes:"Maraudon: Thrash Blade por quest. Zul'Farrak: Bloodseeker del Big Bad Wolf — la mejor 2H del tramo.",
   dung:"Zul'Farrak (42+, Bloodseeker) · Maraudon (45+)"},
  {min:50,max:54,zones:"Un'goro / Felwood / Western Plaguelands",
   notes:"Quest de clase 50 en Sunken Temple (Swamp of Sorrows) — trinket de daño para Arms/Fury.",
   dung:"Sunken Temple (50+) · BRD (52+): Hand of Justice si tank"},
  {min:55,max:60,zones:"EPL / Winterspring / Silithus + dungeons",
   notes:"DM East/North farmeable a 60. Bloodseeker→Barbarous Blade→pre-raid: Archaic Defender (1H) o 2H épicas.",
   dung:"DM East/North · Strat UD · Scholo · LBRS/UBRS · BRD restos"},
];
const BANDS_WH_E = [
  {min:1,max:9,zones:"Tirisfal Glades (o Durotar)",
   notes:"Troll en Durotar; si empezás en EK, Tirisfal (Brill) rinde igual. Hub Sepulcro para quests 10-20."},
  {min:10,max:19,zones:"Silverpine Forest (El Sepulcro)",
   notes:"Hub del Sepulcro → Pyrewood → Ambermill. Weapon/armor vendors en Entrañas (Cima del Trueno). WC por zep UC→Org vale para Gordunni.",
   dung:"Shadowfang Keep (18+) · WC vía zep a Org"},
  {min:20,max:29,zones:"Hillsbrad Foothills (Molino Tarren)",
   notes:"Quests de Tarren Mill + Alterac nevado. Mail vendor en Cima del Trueno.",
   dung:"SFK · SM Graveyard/Library (26+)"},
  {min:30,max:37,zones:"STV (Grom'gol) / Arathi / Swamp of Sorrows",
   notes:"Zep UC→Grom'gol directo a STV. Cadena Nesingwary. SM Armory al 32: Whirlwind Axe.",
   dung:"SM Armory (32+) · SM Cathedral (35+)"},
  {min:38,max:43,zones:"STV / Badlands (Kargath) / Swamp of Sorrows",
   notes:"Kargath = hub Horde EK 38-45. Entrená mail al 40.",
   dung:"SM Cathedral · Badlands quests"},
  {min:44,max:49,zones:"Hinterlands / Searing Gorge / Blasted Lands",
   notes:"Maraudon en Kalimdor (zep→Org→Desolace) — Thrash Blade + arena clase 50. ZF Bloodseeker.",
   dung:"ST (48+, en continente) · Mara/ZF vía Kalimdor"},
  {min:50,max:54,zones:"Searing Gorge / Burning Steppes / WPL",
   notes:"ST es tu dungeon de clase 50 en EK. BRD al 52 para Darkmaster's Ward / Archaic Defender.",
   dung:"Sunken Temple (50+) · BRD (52+)"},
  {min:55,max:60,zones:"EPL / WPL / Blackrock Mountain",
   notes:"EK = endgame: Strat, Scholo, Spire, BRD todos acá. DM East pide viaje a Feralas.",
   dung:"Strat UD · Scholo · LBRS/UBRS · BRD · DM East vía Kalimdor"},
];
const BANDS_WA_EK = [
  {min:1,max:9,zones:"Elwynn Forest (Northshire) o Dun Morogh (Anvilmar)",
   notes:"Humano en Elwynn, enano en Dun Morogh — ambos rinden. Quests de clase 10 (Battle Shout + Charge Arms). Arma 1H de fuerza vendor."},
  {min:10,max:17,zones:"Westfall / Loch Modan / Darkshore",
   notes:"Hub Goldshire/Thelsamar/Auberdine. Quests de la zona + primeros drops de mail. A 16-17 WC abre — la quest Gordunni Ogre-Rend (2H axe) la puede hacer cualquier facción.",
   dung:"Wailing Caverns (17+) · Shadowfang Keep (18+, cerca de Silverpine)"},
  {min:18,max:24,zones:"Redridge / Duskwood / Ashenvale",
   notes:"Lakeshire/Lakmodan hubs. SFK está en tu continente (18+) — buen XP y loot. WC si te falta la quest del arma.",
   dung:"SFK (18+) · WC · BFD (20+, Ashenvale — lejos pero vale)"},
  {min:25,max:29,zones:"Wetlands / Arathi / Thousand Needles",
   notes:"Menethil/Auberdine/Refuge Pointe hubs. Quests de Wetlands + Arathi (Hammertoe). RFK para XP si viajás.",
   dung:"Razorfen Kraul (25+, lejos) · SFK restos"},
  {min:30,max:37,zones:"Arathi / Dustwallow / Tanaris",
   notes:"Ratchet (Tanaris) es el hub 30-40 por excelencia — vendors, quests, a Booty Bay. SM Armory al 32: Whirlwind Axe.",
   dung:"SM Armory (32+, Whirlwind Axe + Herod's Shoulder) · SM Cathedral (35+)"},
  {min:38,max:43,zones:"Tanaris / Feralas / Hinterlands",
   notes:"Hammertoe's dig / Nijel's Point. A 40 mail — tu armadura. Hinterlands (Aerie Peak) quests 45+.",
   dung:"SM Cathedral · Zul'Farrak se acerca (42+)"},
  {min:44,max:49,zones:"Feralas / Hinterlands / Un'goro",
   notes:"Zul'Farrak (Tanaris): Bloodseeker del Big Bad Wolf. Maraudon en Desolace — Thrash Blade por quest.",
   dung:"Zul'Farrak (42+, Bloodseeker) · Maraudon (45+)"},
  {min:50,max:54,zones:"Un'goro / Felwood / Western Plaguelands",
   notes:"ST en Swamp of Sorrows (en tu continente): quest de clase 50 + trinkets. BRD al 52.",
   dung:"Sunken Temple (50+) · BRD (52+): Hand of Justice / Darkmaster's Ward"},
  {min:55,max:60,zones:"Eastern Plaguelands / Winterspring / Silithus + BRD",
   notes:"Stratholme (Dawnforge del Baron) y BRD son tus endgame EK. DM East pide viaje a Feralas.",
   dung:"Stratholme UD · Scholomance · LBRS/UBRS · BRD · DM East"},
];
const BANDS_WA_K = [
  {min:1,max:9,zones:"Darkshore (Audrey's Hollow) o Teldrassil (Dolanaar)",
   notes:"Noche/elfo en Darkshore, noche en Teldrassil — ambos EK-sur. Quests de clase 10. A 10-12 podés zep a Auberdine→Menethil."},
  {min:10,max:17,zones:"Darkshore / Ashenvale",
   notes:"Hub Auberdine. BFD está en Ashenvale (20+) — tu primer raid-dungeon real. WC por zep a Org si querés la quest del arma.",
   dung:"Blackfathom Deeps (20+) · SFK (18+, cerca de Silverpine)"},
  {min:18,max:24,zones:"Ashenvale / Stonetalon / Desolace",
   notes:"Zep Auberdine→Menethil→Wetlands para seguir en EK, o quedate en Kalimdor: Ashenvale→Stonetalon→Desolace. BFD cierra tu rango.",
   dung:"BFD (20+) · SFK si volviste a EK"},
  {min:25,max:29,zones:"Desolace / Dustwallow / Thousand Needles",
   notes:"Hubs Nijel's/Nightmare Isle. RFK lejos — preferí SFK/BFD si volviste. Mail sigue siendo tu armadura.",
   dung:"SFK restos · Maraudon se acerca (45)"},
  {min:30,max:37,zones:"Dustwallow / Tanaris (Ratchet)",
   notes:"Ratchet = la meca 30-40. Quests + vendors. SM Armory al 32: Whirlwind Axe — tu arma.",
   dung:"SM Armory (32+) · SM Cathedral (35+)"},
  {min:38,max:43,zones:"Tanaris / Feralas / Hinterlands",
   notes:"Hinterlands (Aerie Peak) 45+. A 40 mail. ZF al 42: Bloodseeker.",
   dung:"SM Cathedral · Zul'Farrak (42+, Bloodseeker)"},
  {min:44,max:49,zones:"Feralas / Hinterlands / Un'goro",
   notes:"Maraudon (Desolace): Thrash Blade por quest. DM East/North al 55+.",
   dung:"Zul'Farrak · Maraudon (45+)"},
  {min:50,max:54,zones:"Un'goro / Felwood / Silithus",
   notes:"ST pide zep a EK (Swamp of Sorrows) — tu quest de clase 50 está ahí. BRD también en EK.",
   dung:"Sunken Temple (50+, vía EK) · BRD (52+, vía EK)"},
  {min:55,max:60,zones:"Felwood / Winterspring / Silithus + dungeons EK",
   notes:"Endgame: todo lo pesado está en EK — Strat, Scholo, Spire, BRD. DM East/North en Feralas (tu continente).",
   dung:"DM East/North · Strat · Scholo · LBRS/UBRS · BRD"},
];

/* ---------- MILESTONES warrior ---------- */
const MILE_M = [
  {lvl:10,cat:"Clase",txt:"Quest de clase: Battle Shout + Charge (Arms) o taunt (Prot)"},
  {lvl:12,cat:"Vendor",txt:"Arma 1H de fuerza (vendor ciudad)"},
  {lvl:17,cat:"Dungeon",txt:"WC: quest Gordunni Ogre-Rend — tu 2H de leveling",loc:"K"},
  {lvl:20,cat:"Clase",txt:"Dual Wield — 2×1H fuerza/stam o 2H según pref"},
  {lvl:25,cat:"Dungeon",txt:"Razorfen Kraul: XP + posibles piezas",loc:"K"},
  {lvl:30,cat:"Zona",txt:"Shimmering Flats (Horda) / Ratchet-Tanaris (Alianza): grind 30-37",loc:"K"},
  {lvl:32,cat:"Dungeon",txt:"SM Armory: Whirlwind Axe (18.6 dps) — salto de daño",loc:"E"},
  {lvl:35,cat:"Dungeon",txt:"SM Cathedral: Mograine's Might (stat stick 2H)",loc:"E"},
  {lvl:40,cat:"Clase",txt:"¡Entrená MAIL! Tu armadura de leveling"},
  {lvl:42,cat:"Dungeon",txt:"Zul'Farrak: Bloodseeker (25.4 dps) — farmeala del Big Bad Wolf",loc:"K"},
  {lvl:45,cat:"Quest",txt:"Maraudon: Thrash Blade por quest + arena clase 50",loc:"K"},
  {lvl:46,cat:"Forja",txt:"Ironsong Glaive / Rondel of Ancestry (BS)"},
  {lvl:48,cat:"Forja",txt:"Eviscerator (2H axe crafteada)"},
  {lvl:50,cat:"Clase",txt:"Quest de clase (ST): trinket de daño melee — en EK",loc:"E"},
  {lvl:52,cat:"Dungeon",txt:"BRD: Darkmaster's Ward / Archaic Defender / Hand of Justice",loc:"E"},
  {lvl:55,cat:"Dungeon",txt:"DM East/North farmeable solo a 60: Barbarous Blade",loc:"K"},
  {lvl:56,cat:"Dungeon",txt:"Pre-raid: Archaic Defender (1H) + set mail",loc:"E"},
  {lvl:60,cat:"Meta",txt:"BiS pre-raid: 2H épica o dual-wield + T0/trinkets melee"},
];

(typeof module==='object'&&module&&module.exports?module.exports:window).GUIDE_WARRIOR={
id:"warrior",name:"Warrior",icon:"sword",title:"Senda del Guerrero",accent:"#8a4a26",
specs:{arms:"Arms",fury:"Fury",protection:"Protection"},defaultSpec:"arms",
specNote:"Arms = el DPS clásico de leveling. Protection para tankear. Fury escala peor en Classic.",
prefs:[["2h","2 manos"],["1h","1 mano"],["any","Cualq."]],defaultPref:"any",
prefNote:"Arms = el DPS clásico de leveling. Protection si vas a tankear dungeons. Fury escala peor en Classic.",
useEng:false,
types:{sword:"Espada",axe:"Hacha",mace:"Maza",dagger:"Daga",polearm:"Astil",staff:"Bastón",bow:"Arco",gun:"Gun"},
badges:{sword:"sword",axe:"axe",mace:"mace",dagger:"dagger",polearm:"pole",staff:"staff",bow:"bow",gun:"gun"},
typeFilters:[["all","Todas"],["2h","2 manos"],["1h","1 manos"],["rng","A distancia"]],
simc:{slot:"main_hand",pet:false,racePref:{},
  rows:h=>[
    ["FUE",h.num("character_stats","strength")],
    ["Stamina",h.num("character_stats","stamina")],
    ["Vida",h.num("character_stats","health")],
    ["AGI",h.num("character_stats","agility")],
    ["AP melee",h.ap("melee")],
    ["Crit",h.pct("crit","melee")],
    ["Hit",h.pct("hit","melee")],
    ["Haste",h.pct("haste","melee")],
    ["Armadura",h.num("defense","armor")],
    ["Defensa",h.num("defense","defense_skill")]
  ]},
macros:MACROS_W,
bar:{keys:BAR_W,rows:BAR_ROWS_W,offset:BAR_OFFSET_W,mouse:BAR_MOUSE_W,click:BAR_CLICK_W,alt1:BAR_ALT1_W},
macroRules:MACRO_RULES_W,
barNotes:{
  intro:"Cada tecla queda fija del 12 al 60: lo punteado se llena solo cuando llegás al nivel. Clic en una tecla para ver su macro. Warrior = rage: generás pegando, gastás en golpes.",
  dungeon:" <b>En dungeon:</b> Sunder + Thunder Clap siempre; Def Stance si tank; interrupts en casters.",
  altNote:"para cambiar de arma/stance rápido.",
  before:"<b>Antes de empezar:</b> tené Battle Stance por defecto (Arms/Fury). Cambiar de stance tiene GCD — swappeá entre pulls, no en combate."
},
dungeons:DUNGEONS_W,
ahList:[
  ["Ironsong Glaive","Polearm épica crafteada","La mejor 2H pre-raid si tenés BS"],
  ["Eviscerator","Hacha 2H crafteada","Alternativa BS — menos demandada que Ironsong"],
  ["Archaic Defender","Maza 1H BRD (~3%)","La 1H icónica — dual wield o stat stick"],
  ["Darkmaster's Ward","Maza 1H BRD raro","Estadística caster-melee — vale la pena"],
  ["Bloodseeker","Hacha 2H ZF","Farmeala — en AH vuela"],
  ["Barbarous Blade","Espada 2H DM North","Farmeable solo a 60"],
],
extras:{
  ahTitle:"Lista de compras — Subasta (BoE)",
  tipsTitle:"Tips de warrior",
  tips:[
    ["Arma:","Str > stamina > agi(casi nada). Plate siempre que puedas — mail hasta 40, plate después. Dual wield (20) rinde en Arms/Fury."],
    ["Rage:","generás con auto-attack y la gastás en Heroic/Execute. Nunca la dejes en 0 antes del pull — entrá con 20+."],
    ["Stances:","Battle para daño, Defensive para tank, Berserker para burst. El swap tiene GCD — planificalo."],
    ["Interrupts:","Shield Bash (escudo) / Pummel (52+) en casters del grupo — no en el melee."],
    ["Thunder Clap:","pega a todos y baja su ataque — en packs es mejor que singles."],
    ["Execute:","solo <20% de vida del mob — guardá la rage para el tramo final."],
  ],
  warn:"La guía usa datos de Classic Era / vanilla 1.12 (la base de Forever). Si el server retocó drops o stats, verificá cada ítem in-game — la ruta de zonas y dungeons igual aplica."
},
factions:{
  horde:{
    weapons:facWeapons("horde"),
    milestones:MILE_M,
    routes:{kalimdor:BANDS_WH_K,ek:BANDS_WH_E},
    recExtra:({lvl,os,state,icon})=>{
      let h="";
      if(lvl>=17&&lvl<24&&!os.has("gordunni::horde")&&state.cur!=="gordunni::horde")
        h+=`<div class="card danger"><h3>${icon("skull")} Objetivo #1: Gordunni Ogre-Rend</h3>
          <div class="muted">Al 17-19 entrá a <b>Wailing Caverns</b> (SO de Crossroads) por la quest — te da la <span class="q-uncommon">Gordunni Ogre-Rend</span> (hacha 2H ~12.4 dps) que te lleva hasta los 30.</div></div>`;
      if(lvl>=42&&lvl<=50)
        h+=`<div class="card warn"><h3>${icon("scroll")} Objetivo #2: Bloodseeker</h3>
          <div class="muted">En <b>Zul'Farrak</b> el Big Bad Wolf tira la <span class="q-rare">Bloodseeker</span> (25.4 dps) — la mejor 2H del tramo. Carísima en subasta: farmeala vos.</div></div>`;
      if(lvl>=50&&lvl<=58)
        h+=`<div class="card warn"><h3>${icon("pin")} Pre-raid: elegí tu arma</h3>
          <div class="muted">2H épica / <b>Archaic Defender</b> (1H, BRD ~3%) / dual wield 1H. Tu spec: <b>${{arms:"Arms",fury:"Fury",protection:"Prot"}[state.spec]}</b>.</div></div>`;
      return h;
    }
  },
  alliance:{
    weapons:facWeapons("alliance"),
    milestones:MILE_M,
    routes:{ek:BANDS_WA_EK,kalimdor:BANDS_WA_K},
    recExtra:({lvl,os,state,icon})=>{
      let h="";
      if(lvl>=17&&lvl<24&&!os.has("gordunni::alliance")&&state.cur!=="gordunni::alliance")
        h+=`<div class="card danger"><h3>${icon("skull")} Objetivo #1: Gordunni Ogre-Rend</h3>
          <div class="muted">La quest de WC la puede hacer cualquier facción — <b>Wailing Caverns</b> (Kalimdor). Zep a Org si venís de EK-sur.</div></div>`;
      if(lvl>=42&&lvl<=50)
        h+=`<div class="card warn"><h3>${icon("scroll")} Objetivo #2: Bloodseeker</h3>
          <div class="muted"><b>Zul'Farrak</b> (Tanaris): Bloodseeker del Big Bad Wolf — farmeala, no la compres.</div></div>`;
      if(lvl>=50&&lvl<=58)
        h+=`<div class="card warn"><h3>${icon("pin")} Pre-raid: elegí tu arma</h3>
          <div class="muted">2H épica / <b>Archaic Defender</b> (1H, BRD ~3%) / dual wield 1H.</div></div>`;
      return h;
    }
  }
}
};
})();
