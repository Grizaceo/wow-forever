/* farm-plan.js — motor de farmeo v2: oro realizado por hora de sesión.
 *
 * Puro (sin red, sin DOM). Lee el dataset de drops schema 2 (configure) y
 * recibe por parámetro el mercado (ítems con historial), las ventas propias
 * (tope de venta) y el estilo del jugador (calibración por sesiones).
 * Diseño y fórmulas: docs/FARMEO-ORO.md. Todo número es una estimación con
 * drops de Classic 1.12 (CMaNGOS) salvo lo calibrado con sesiones propias.
 *
 *   configure({HunterDropData})
 *   marketModel(items, {today, windowDays})        -> Map itemId -> precio robusto
 *   sellCaps(market, sales, {kappa, days})          -> Map itemId -> unidades vendibles/sesión
 *   farms(ctx)                                      -> campamentos candidatos (limpiar / solo X)
 *   hourly(farm, ctx)                               -> oro/h de un campamento solo, con desglose
 *   plan(ctx, {hours})                              -> plan de sesión con rango y alternativas
 *   itemFarms(itemId, ctx)                          -> campamentos donde cae el ítem (oro/h completo)
 *
 * ctx = { profile:{level, fac, cls, prof:{skin}, group}, market, caps,
 *         style (parámetros del jugador), settings:{pvp, zoneComp} }
 */
'use strict';
const Farm = require('./market-farm.js');

const AH_CUT = 0.05;
const THIN_MAX_AVAIL = 5;
const DAY_MS = 86400000, EPOCH = Date.UTC(2020, 0, 1);
const COMP = { low: 1, med: 0.75, high: 0.45 };
// Estilo por defecto: supuestos declarados, reemplazables por la calibración.
const STYLE_DEFAULT = Object.freeze({
  dpsK: 2.0,          // DPS = dpsK × nivel (cazador con mascota ≈ 80 a nivel 40)
  lootSec: 2,         // abrir y recoger el botín
  skinSec: 2,         // desollar
  downtime: 0.15,     // comer, beber, esperar enfriamientos
  speed: 9,           // yardas/s fuera de combate (Aspecto del guepardo; montura ≈ 14)
  bagFree: 45,        // casillas libres al empezar
  bagTripMin: 6,      // ida y vuelta a un vendedor cuando se llenan las bolsas
  shotSec: 2.5,       // un disparo cada 2,5 s en combate (solo cazador)
  uncertainty: 0.2,   // ± relativo de ritmo para el rango pesimista/optimista
  source: 'default',
});
const PARAMS = Object.freeze({ kappa: 0.05, windowDays: 14, maxUp: 2, maxDown: 15, minCampShare: 0.8 });

let D = null, IDX = null;
function configure(o) { if (o && o.HunterDropData) { D = o.HunterDropData; IDX = null; } return api; }
const today = () => Math.floor((Date.now() - EPOCH) / DAY_MS);
const isInt = Number.isSafeInteger;

/* ----------------------------------------------------------- índice del dataset */
function index() {
  if (IDX) return IDX;
  if (!D || D.schemaVersion !== 2) { IDX = { ok: false }; return IDX; }
  const units = new Map(); // npcId -> Map itemId -> unidades esperadas por muerte (directo)
  const add = (map, e, iid, u) => {
    let m = map.get(e); if (!m) { m = new Map(); map.set(e, m); }
    m.set(iid, (m.get(iid) || 0) + u);
  };
  for (const [iid, it] of Object.entries(D.items || {})) {
    for (const s of it[10] || []) if (s[0] === 'm') add(units, String(s[1]), Number(iid), s[2] / 100 * (s[3] + s[4]) / 2);
  }
  for (const [e, flat] of Object.entries(D.mobLoot || {})) {
    for (let k = 0; k + 2 < flat.length; k += 3) add(units, e, flat[k], flat[k + 1] / 10000 * flat[k + 2] / 10);
  }
  const skin = new Map();
  for (const [e, flat] of Object.entries(D.skinLoot || {})) {
    for (let k = 0; k + 2 < flat.length; k += 3) add(skin, e, flat[k], flat[k + 1] / 10000 * flat[k + 2] / 10);
  }
  IDX = { ok: true, units, skin };
  return IDX;
}
const zoneName = zk => D?.zones?.[zk]?.[0] || String(zk);
const itemName = iid => D?.items?.[String(iid)]?.[0] || `#${iid}`;
const sellOf = iid => D?.items?.[String(iid)]?.[9] || 0;
const stackOf = iid => D?.itemStack?.[String(iid)] || 1;

/* ------------------------------------------------------------------ mercado */
// Precio robusto: mediana de mínimos diarios de la ventana; p25/p75 para el rango.
function marketModel(items, opt = {}) {
  const win = opt.windowDays || PARAMS.windowDays;
  const out = new Map();
  for (const it of items || []) {
    if (!it || !isInt(it.itemId) || it.itemId <= 0) continue;
    const end = isInt(it.observedDay) ? it.observedDay : null;
    const lows = [], avs = [];
    for (const h of Array.isArray(it.history) ? it.history : []) {
      if (!h || !isInt(h.day) || (end != null && (h.day > end || h.day <= end - win))) continue;
      if (isInt(h.low) && h.low > 0) lows.push(h.low);
      if (isInt(h.available) && h.available >= 0) avs.push(h.available);
    }
    if (!lows.length && isInt(it.unitPriceCopper) && it.unitPriceCopper > 0) lows.push(it.unitPriceCopper);
    if (!lows.length) continue;
    const q = (a, p) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
    const avail = avs.length ? q(avs, 0.5) : null;
    const prev = out.get(it.itemId);
    const rec = { price: q(lows, 0.5), p25: q(lows, 0.25), p75: q(lows, 0.75), days: lows.length, avail,
      thin: avail != null && avail <= THIN_MAX_AVAIL };
    if (!prev || rec.days > prev.days) out.set(it.itemId, rec);
  }
  return out;
}

// Tope de unidades vendibles por sesión a precio de subasta. Ventas propias
// (TSM) mandan si hay historial; si no κ × ofertas publicadas; delgado → 0.
function sellCaps(market, sales, opt = {}) {
  const kappa = Number.isFinite(opt.kappa) && opt.kappa >= 0 ? opt.kappa : PARAMS.kappa;
  const caps = new Map();
  for (const [iid, m] of market || new Map()) {
    const own = sales && (sales.get ? sales.get(iid) : sales[iid]);
    if (own && Number.isFinite(own.perDay) && own.perDay > 0 && (own.events || 0) >= 3) {
      caps.set(iid, { units: own.perDay, basis: 'ventas-propias' });
    } else if (m.thin) {
      caps.set(iid, { units: 0, basis: 'mercado-delgado' });
    } else if (m.avail != null) {
      caps.set(iid, { units: kappa * m.avail, basis: 'kappa-ofertas' });
    } else {
      caps.set(iid, { units: 0, basis: 'sin-ofertas' });
    }
  }
  return caps;
}

// Valor por unidad: subasta neta si supera al vendedor; si no, vendedor.
function unitValue(iid, ctx, priceKey = 'price') {
  const sell = sellOf(iid), m = ctx.market?.get(iid);
  const ah = m && !m.thin ? Math.floor(m[priceKey] * (1 - AH_CUT)) : 0;
  return { ah: ah > sell ? ah : 0, vendor: sell };
}

/* --------------------------------------------------------------- campamentos */
function style(ctx) { return { ...STYLE_DEFAULT, ...(ctx.style || {}) }; }

function mobOk(e, ctx) {
  const m = D.mobs[e], x = D.mobX[e];
  if (!m || !x) return false;
  const p = ctx.profile || {}, L = p.level || 1, side = p.fac === 'alliance' ? 'a' : 'h';
  if (!(m[7] || 'ah').includes(side)) return false;
  if (m[3] !== 'normal') return false;
  return m[2] <= L + PARAMS.maxUp && (ctx.allLevels || m[2] >= L - PARAMS.maxDown);
}

function zoneOk(zk, ctx) {
  const z = D.zones[zk];
  if (!z) return false;
  if (z[2] === 'city') return false;
  if ((z[2] === 'instance' || String(zk).charCodeAt(0) === 105) && !ctx.profile?.group) return false;
  return true;
}

// Unidades por muerte de un mob (directo + desuello si corresponde). Con
// sesiones propias (ctx.observed) cada ítem se ajusta con un prior desde
// CMaNGOS de peso N0 muertes: (N0·prior + unidades vistas) / (N0 + muertes).
const N0_DROPS = 50, N0_COINS = 20;
function killUnits(e, ctx) {
  const ix = index(), out = new Map();
  for (const [iid, u] of ix.units.get(e) || []) out.set(iid, u);
  if (ctx.profile?.prof?.skin) for (const [iid, u] of ix.skin.get(e) || []) out.set(iid, (out.get(iid) || 0) + u);
  const obs = ctx.observed?.mobs?.get(String(e));
  if (obs && obs.kills > 0) {
    const ids = new Set([...out.keys(), ...obs.items.keys()]);
    for (const iid of ids) {
      if (!ctx.profile?.prof?.skin && obs.skinOnly?.has(iid)) continue;
      out.set(iid, (N0_DROPS * (out.get(iid) || 0) + (obs.items.get(iid) || 0)) / (N0_DROPS + obs.kills));
    }
  }
  return out;
}
function killCoins(e, ctx) {
  const prior = D.mobX[e][1], obs = ctx.observed?.mobs?.get(String(e));
  if (!obs || !(obs.corpses > 0) || !Number.isFinite(obs.coins)) return prior;
  return (N0_COINS * prior + obs.coins) / (N0_COINS + obs.corpses);
}

function softRate(cycle, cap) { return cap > 0 && cycle > 0 ? Math.pow(Math.pow(cycle, -2) + Math.pow(cap, -2), -0.5) : 0; }

function buildFarm(kind, id, zk, members, nnYards, ctx, extra) {
  const st = style(ctx), L = ctx.profile?.level || 1, dps = st.dpsK * L;
  const skinOn = !!ctx.profile?.prof?.skin;
  let n = 0; for (const [, c] of members) n += c;
  let fight = 0, handle = 0, coins = 0, rest = 0, cap = 0;
  const units = new Map();
  for (const [e, c] of members) {
    const w = c / n, x = D.mobX[e], m = D.mobs[e];
    fight += w * x[0] / dps;
    handle += w * (st.lootSec + (skinOn && x[5] ? st.skinSec : 0));
    coins += w * killCoins(e, ctx); rest += w * x[3];
    cap += c * 3600 / Math.max(30, m[6] || 300);
    for (const [iid, u] of killUnits(e, ctx)) units.set(iid, (units.get(iid) || 0) + w * u);
  }
  const travel = nnYards / st.speed;
  const cycle = 3600 * (1 - st.downtime) / (fight + handle + travel);
  const z = D.zones[zk];
  const comp = COMP[ctx.settings?.zoneComp?.[zk]] || 1;
  const risk = Farm.riskInfo(z?.[2], ctx.profile?.fac, { pvp: ctx.settings?.pvp !== false });
  const rate = softRate(cycle, cap) * comp;
  const names = members.slice().sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => D.mobs[e][0]);
  return { id, kind, zoneKey: zk, zone: zoneName(zk), members: members.map(([e, c]) => ({ npcId: Number(e), name: D.mobs[e][0], spawns: c })),
    names, spawns: n, nnYards, fightSec: fight, handleSec: handle, travelSec: travel, cycleRate: cycle, spawnCap: cap,
    rate, riskMult: risk.mult, riskLevel: risk.level, comp, coins, rest, units, ...extra };
}

let FARMS_KEY = null, FARMS = null;
function farms(ctx) {
  if (!index().ok) return [];
  const p = ctx.profile || {}, st = style(ctx);
  const key = JSON.stringify([p.level, p.fac, !!p.prof?.skin, !!p.group, !!ctx.allLevels, ctx.settings?.pvp !== false, ctx.settings?.zoneComp || {}, st, ctx.observed?.key || null]);
  if (FARMS_KEY === key && FARMS) return FARMS;
  const out = [];
  // Limpiar un campamento espacial: todos los mobs elegibles del grupo.
  D.camps.forEach((c, i) => {
    const [zk, mx, my, nn, mix] = c;
    if (!zoneOk(zk, ctx)) return;
    let tot = 0, ok = 0; const members = [];
    for (const [e, n] of mix) { tot += n; if (mobOk(String(e), ctx)) { ok += n; members.push([String(e), n]); } }
    if (!members.length || ok < PARAMS.minCampShare * tot || ok < 4) return;
    out.push(buildFarm('clear', `c${i}`, zk, members, nn, ctx, { mapX: mx / 10, mapY: my / 10 }));
  });
  // Solo un tipo de mob en su zona principal: caminata = distancia entre sus spawns.
  for (const [e, m] of Object.entries(D.mobs)) {
    if (!mobOk(e, ctx) || !zoneOk(m[4], ctx) || !(m[5] >= 3)) continue;
    out.push(buildFarm('target', `t${e}`, m[4], [[e, m[5]]], D.mobX[e][4], ctx, {}));
  }
  FARMS_KEY = key; FARMS = out;
  return out;
}

/* ------------------------------------------------------------------- valor */
// Oro de un plan {farmIdx: minutos}: el tope de venta es COMPARTIDO entre
// campamentos (dos que sueltan lo mismo se reparten el cupo).
function planValue(alloc, list, ctx, scen = {}) {
  const st = style(ctx), k = scen.rateK || 1, priceKey = scen.priceKey || 'price';
  const units = new Map(); let gold = 0, coins = 0, rest = 0, ammo = 0, kills = 0, slots = 0;
  for (const [i, mins] of alloc) {
    const f = list[i]; const kk = f.rate * k * f.riskMult * mins / 60;
    kills += kk; coins += kk * f.coins; rest += kk * f.rest;
    if (ctx.profile?.cls === 'hunter' || ctx.profile?.cls === 3) ammo += kk * f.fightSec / st.shotSec * ammoCost(ctx.profile?.level || 1);
    for (const [iid, u] of f.units) units.set(iid, (units.get(iid) || 0) + kk * u);
  }
  const parts = new Map(); let ahGold = 0, vendorGold = rest;
  for (const [iid, q] of units) {
    const v = unitValue(iid, ctx, priceKey), cap = ctx.caps?.get(iid)?.units ?? 0;
    const qAh = v.ah > 0 ? Math.min(q, cap) : 0, g = qAh * v.ah + (q - qAh) * v.vendor;
    ahGold += qAh * v.ah; vendorGold += (q - qAh) * v.vendor;
    parts.set(iid, { units: q, gold: g, ahUnits: qAh });
    slots += q / stackOf(iid);
  }
  gold = coins + ahGold + vendorGold - ammo;
  return { gold, coins, ahGold, vendorGold, ammo, kills, slots, parts };
}
function ammoCost(L) { return L >= 40 ? 5 : L >= 25 ? 1.5 : L >= 10 ? 0.25 : 0.05; }

function hourly(f, ctx) {
  const v = planValue(new Map([[0, 60]]), [f], ctx);
  const st = style(ctx), trips = Math.floor(v.slots / st.bagFree), tripMin = trips * st.bagTripMin;
  const gph = v.gold * 60 / (60 + tripMin);
  return { ...v, gph, bagTrips: trips };
}

/* --------------------------------------------------------------- planificador */
const BLOCK = 10;
function greedy(list, ctx, T) {
  const st = style(ctx);
  const alloc = new Map(), zones = new Map(); let used = 0, g0 = 0;
  for (;;) {
    let best = null;
    for (let i = 0; i < list.length; i++) {
      if (alloc.size >= 3 && !alloc.has(i)) continue;
      const zk = list[i].zoneKey, z = D.zones[zk];
      // Primera zona: ida y vuelta a vender; cada zona extra: el traslado (≈ media vuelta).
      const trip = Farm.travelFor(z?.[0], ctx.profile?.fac, '', 2).min || 0;
      const extra = zones.has(zk) ? 0 : zones.size ? trip / 2 : trip;
      if (used + BLOCK + extra > T) continue;
      const a = new Map(alloc); a.set(i, (a.get(i) || 0) + BLOCK);
      const g = planValue(a, list, ctx).gold, gain = (g - g0) / (BLOCK + extra);
      if (!best || gain > best.gain) best = { gain, i, g, extra, zk };
    }
    if (!best || best.gain <= 0) break;
    alloc.set(best.i, (alloc.get(best.i) || 0) + BLOCK);
    used += BLOCK + best.extra; g0 = best.g;
    if (!zones.has(best.zk)) zones.set(best.zk, best.extra);
  }
  // Bolsas llenas: viajes al vendedor descontados del tiempo de farmeo.
  const v = planValue(alloc, list, ctx), trips = Math.floor(v.slots / st.bagFree);
  return { alloc, zones, gold: v.gold, value: v, bagTrips: trips, travelMin: [...zones.values()].reduce((s, x) => s + x, 0) };
}

function plan(ctx, opt = {}) {
  const hours = [1, 2, 3, 4].includes(+opt.hours) ? +opt.hours : 2, T = hours * 60;
  const all = farms(ctx);
  if (!all.length) return null;
  const scored = all.map(f => ({ f, g: hourly(f, ctx).gph })).filter(x => x.g > 0).sort((a, b) => b.g - a.g);
  const pool = scored.slice(0, 120).map(x => x.f);
  const zones = [...new Set(pool.map(f => f.zoneKey))].slice(0, 8);
  const sets = zones.map(z => [z]);
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) sets.push([zones[i], zones[j]]);
  const results = [];
  for (const S of sets) {
    const list = pool.filter(f => S.includes(f.zoneKey));
    const r = greedy(list, ctx, T);
    if (!r.alloc.size) continue;
    const st = style(ctx), u = st.uncertainty;
    const low = planValue(r.alloc, list, ctx, { rateK: 1 - u, priceKey: 'p25' }).gold;
    const high = planValue(r.alloc, list, ctx, { rateK: 1 + u, priceKey: 'p75' }).gold;
    const tripMin = r.bagTrips * st.bagTripMin;
    const legs = [...r.alloc].sort((a, b) => b[1] - a[1]).map(([i, mins]) => {
      const f = list[i], v = planValue(new Map([[i, mins]]), list, ctx);
      return { farm: describe(f, ctx), minutes: mins, gold: v.gold };
    });
    const top = [...r.value.parts].sort((a, b) => b[1].gold - a[1].gold).slice(0, 6)
      .map(([iid, p]) => ({ itemId: iid, name: itemName(iid), units: p.units, gold: p.gold, ahUnits: p.ahUnits, capBasis: ctx.caps?.get(iid)?.basis || 'sin-ofertas' }));
    results.push({ zones: [...r.zones.keys()].map(z => ({ zoneKey: z, name: zoneName(z), travelMin: r.zones.get(z) || 0 })), legs, hours,
      gold: r.gold, gph: r.gold / hours, low: low / hours, high: high / hours,
      travelMin: r.travelMin, bagTrips: r.bagTrips, bagTripMin: tripMin,
      coins: r.value.coins, ahGold: r.value.ahGold, vendorGold: r.value.vendorGold, ammo: r.value.ammo, kills: r.value.kills, top });
  }
  results.sort((a, b) => b.gph - a.gph);
  if (!results.length) return null;
  const best = results[0];
  // Alternativas: otros planes cuyo valor central cae dentro del rango del mejor.
  const used = r => [...new Set(r.legs.map(l => l.farm.zoneKey))].sort().join('+');
  const seen = new Set([used(best)]);
  const alternatives = [];
  for (const r of results.slice(1)) {
    const k = used(r);  // un par de zonas que solo usa una repite el plan de esa zona
    if (seen.has(k) || r.gph < best.low) continue;
    seen.add(k); alternatives.push(r);
    if (alternatives.length >= 3) break;
  }
  return { best, alternatives, style: style(ctx), params: { kappa: ctx.kappa ?? PARAMS.kappa, hours } };
}

function describe(f, ctx) {
  const h = hourly(f, ctx);
  const tot = h.coins + h.ahGold + h.vendorGold;
  const top = [...h.parts].sort((a, b) => b[1].gold - a[1].gold).slice(0, 4)
    .map(([iid, p]) => ({ itemId: iid, name: itemName(iid), share: tot > 0 ? p.gold / tot : 0, perKill: f.units.get(iid) || 0 }));
  return { id: f.id, kind: f.kind, zoneKey: f.zoneKey, zone: f.zone, names: f.names, members: f.members, spawns: f.spawns,
    mapX: f.mapX ?? null, mapY: f.mapY ?? null, nnYards: f.nnYards, rate: f.rate, fightSec: f.fightSec,
    gph: h.gph, coinsShare: tot > 0 ? h.coins / tot : 0, ahShare: tot > 0 ? h.ahGold / tot : 0, vendorShare: tot > 0 ? h.vendorGold / tot : 0,
    ammoPerHour: h.ammo, bagTrips: h.bagTrips, riskLevel: f.riskLevel, top };
}

function ranking(ctx, n = 15) {
  return farms(ctx).map(f => ({ f, g: hourly(f, ctx).gph })).filter(x => x.g > 0)
    .sort((a, b) => b.g - a.g).slice(0, n).map(x => describe(x.f, ctx));
}

// Campamento "a medida" con la mezcla de mobs que mató el jugador en una
// sesión: sirve para comparar lo predicho con lo observado. members = [[npcId, muertes]].
function mixFarm(members, zoneKey, ctx) {
  if (!index().ok) return null;
  const ms = (members || []).map(([e, c]) => [String(e), c]).filter(([e, c]) => D.mobs[e] && D.mobX[e] && c > 0);
  if (!ms.length) return null;
  let n = 0, nn = 0;
  for (const [e, c] of ms) { n += c; nn += c * D.mobX[e][4]; }
  // Spawns del campamento: los de cada mob en su zona principal (cota de respawn).
  const spawnMembers = ms.map(([e]) => [e, Math.max(1, D.mobs[e][5] || 1)]);
  const f = buildFarm('mix', 'mix', zoneKey || D.mobs[ms[0][0]][4], spawnMembers, nn / n, ctx, {});
  // La composición por muertes manda en el valor por muerte (no los spawns).
  const byKill = buildFarm('mix', 'mix', zoneKey || D.mobs[ms[0][0]][4], ms, nn / n, ctx, {});
  return { ...f, fightSec: byKill.fightSec, handleSec: byKill.handleSec, coins: byKill.coins, rest: byKill.rest, units: byKill.units };
}

// Índice ítem -> campamentos (una pasada por todos): para la columna de Mercado.
let IIDX_KEY = null, IIDX = null;
function itemIndex(ctx) {
  const key = ctx.cacheKey || null;
  if (key && IIDX_KEY === key && IIDX) return IIDX;
  const c2 = ctx.allLevels ? ctx : { ...ctx, allLevels: true };
  const out = new Map();
  for (const f of farms(c2)) {
    const h = hourly(f, c2); if (!(h.gph > 0)) continue;
    const tot = h.coins + h.ahGold + h.vendorGold;
    for (const [iid, p] of h.parts) {
      let a = out.get(iid); if (!a) { a = []; out.set(iid, a); }
      a.push({ f, gph: h.gph, itemShare: tot > 0 ? p.gold / tot : 0, itemPerHour: f.rate * f.riskMult * (f.units.get(iid) || 0) });
    }
  }
  for (const a of out.values()) { a.sort((x, y) => y.gph - x.gph); a.length = Math.min(a.length, 3); }
  const res = { get(iid) { const a = out.get(Number(iid)); return a ? a.map(x => ({ ...describe(x.f, c2), itemShare: x.itemShare, itemPerHour: x.itemPerHour })) : [] }, size: out.size };
  if (key) { IIDX_KEY = key; IIDX = res; }
  return res;
}

// Campamentos donde cae un ítem, ordenados por el oro/h del campamento completo.
function itemFarms(itemId, ctx, n = 3) {
  const iid = Number(itemId), out = [];
  // Para "dónde cae" valen también mobs de nivel bajo (muertes rápidas).
  const c2 = ctx.allLevels ? ctx : { ...ctx, allLevels: true };
  for (const f of farms(c2)) {
    const u = f.units.get(iid); if (!u) continue;
    const h = hourly(f, c2), p = h.parts.get(iid);
    const tot = h.coins + h.ahGold + h.vendorGold;
    out.push({ farm: f, gph: h.gph, itemPerHour: f.rate * f.riskMult * u, itemShare: tot > 0 && p ? p.gold / tot : 0 });
  }
  out.sort((a, b) => b.gph - a.gph);
  return out.slice(0, n).map(x => ({ ...describe(x.farm, c2), itemPerHour: x.itemPerHour, itemShare: x.itemShare }));
}

const api = { configure, marketModel, sellCaps, farms, hourly, plan, ranking, itemFarms, itemIndex, mixFarm, unitValue, softRate,
  STYLE_DEFAULT, PARAMS, AH_CUT, THIN_MAX_AVAIL, N0_DROPS, N0_COINS, ammoCost,
  zoneName, itemName, sellOf,
  _reset() { FARMS_KEY = null; FARMS = null; IDX = null; IIDX_KEY = null; IIDX = null; } };
module.exports = api;
