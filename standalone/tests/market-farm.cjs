'use strict';

/*
 * Tests del motor de farmeo (market-farm.js) — auditoría cuantitativa.
 *
 * Correr: node --test standalone/tests/market-farm.cjs
 *
 * Fixtures sintéticos, sin red y sin datos reales del juego. Verifican las
 * correcciones H2, H3, H6, H7, H8, H9, H10 y el hallazgo "raros" de la
 * auditoría: cotas físicas, SIN DATOS, etiquetas de heurística y coherencia
 * de unidades. Ningún número pretende calibración empírica.
 */

const test = require('node:test');
const assert = require('node:assert');

function fresh() {
  const p = require.resolve('../market-farm.js');
  delete require.cache[p];
  return require('../market-farm.js');
}

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

/* ------------------------------------------------- H2: agregado de camps */

test('H2: un sitio usa la cota física max(camp), no la suma 1/0.5/0.25', () => {
  const F = fresh();
  assert.equal(F.campAggregate([100, 100, 100]), 100);
  assert.equal(F.campAggregate([160, 100, 100]), 160);
  assert.equal(F.campAggregate([], 'single'), 0);
});

test('H2: rotación sin tiempo declarado no resucita la suma ponderada', () => {
  const F = fresh();
  assert.equal(F.campAggregate([100, 100, 100], 'rotation'), 100);
  assert.equal(F.campAggregate([100, 100, 100], 'rotation', [1, 0.5, 0.25]), 100);
});

test('H2: rotación con pesos de tiempo declarados (suma <= 1) sí pondera', () => {
  const F = fresh();
  assert.equal(F.campAggregate([100, 80, 60], 'rotation', [0.5, 0.3, 0.2]), 86);
  assert.equal(F.campAggregate([100, 80, 60], 'rotation', [0.4, 0.2, 0.1]), 62); // 40+16+6
});

/* -------------------------------------------- H3: cota de tasa y spawns */

const mob = (over = {}) => ({
  kind: 'mob', rank: 'normal', lvlMin: 60, lvlMax: 60, spawns: 1, respawnSec: 604800, ...over,
});

test('H3: respawn conocido usa la cota exacta, sin piso de 60 s', () => {
  const F = fresh();
  const r = F.rateInfo(mob(), 60);
  assert.ok(near(r.rate, 1 / 168, 1e-12));
  assert.ok(near(r.spawnCap, 1 / 168, 1e-12));
  assert.equal(r.respawnKnown, true);
  assert.equal(r.approx, false);
  assert.equal(r.basis, 'spawn-cap');
});

test('H3: respawn ausente queda marcado como aproximación (fallback 60 s)', () => {
  const F = fresh();
  const r = F.rateInfo(mob({ respawnSec: null }), 60);
  assert.ok(near(r.spawnCap, 60, 1e-12));
  assert.equal(r.respawnKnown, false);
  assert.equal(r.approx, true);
  assert.equal(r.basis, 'respawn-fallback-60s');
});

test('H3: la cota de ciclo y la de spawns se reportan por separado', () => {
  const F = fresh();
  const r = F.rateInfo(mob(), 60);
  assert.ok(r.cycleRate > 1);            // ~102.86 bajas/h por ciclo
  assert.ok(r.spawnCap < r.cycleRate);   // la restricción espacial manda
  assert.ok(near(r.rate, Math.min(r.cycleRate, r.spawnCap), 1e-12));
});

/* ------------------------------------- raros: tasa con respawn, no 0,2/h */

test('raros: con respawn conocido la tasa es la cota física, no RARE_K fijo', () => {
  const F = fresh();
  const r = F.rareRate({ spawns: 1, respawnSec: 604800 });
  assert.ok(near(r.rate, 1 / 168, 1e-12));
  assert.equal(r.approx, false);
  assert.equal(r.basis, 'spawn-cap');
});

test('raros: sin respawn, 0,2/h se declara calibración aproximada', () => {
  const F = fresh();
  const r = F.rareRate({ spawns: 1, respawnSec: null });
  assert.equal(r.rate, 0.2);
  assert.equal(r.approx, true);
  assert.equal(r.basis, 'RARE_K-heuristic');
});

test('raros: rateInfo coincide con rareRate para una fuente rara', () => {
  const F = fresh();
  const src = { kind: 'rare-obs', rank: 'rare', spawns: 1, respawnSec: 604800 };
  assert.ok(near(F.rateInfo(src, 60).rate, F.rareRate(src).rate, 1e-12));
});

/* ----------------------------------------- H6: liquidez SIN DATOS / L */

test('H6: historial sin available es SIN DATOS, nunca piso 0.15', () => {
  const F = fresh();
  const r = F.liquidityInfo({ history: [], observedDay: 100 }, 100);
  assert.equal(r.factor, null);
  assert.match(r.basis, /oferta anunciada/i);
  assert.equal(r.label, 'SIN DATOS');
});

test('H6: available ausente explícito también es SIN DATOS', () => {
  const F = fresh();
  const r = F.liquidityInfo({ history: [{ day: 100, available: null }], observedDay: 100 }, 100);
  assert.equal(r.factor, null);
  assert.equal(r.label, 'SIN DATOS');
});

test('H6: L con oferta conocida sigue la curva logarítmica acotada', () => {
  const F = fresh();
  const zero = F.liquidityInfo({ history: [{ day: 100, available: 0 }], observedDay: 100 }, 100);
  const five = F.liquidityInfo({ history: [{ day: 100, available: 5 }], observedDay: 100 }, 100);
  const many = F.liquidityInfo({ history: [{ day: 100, available: 20 }], observedDay: 100 }, 100);
  assert.equal(zero.factor, 0.15);
  assert.ok(near(five.factor, Math.log10(6) / Math.log10(21), 1e-12));
  assert.equal(many.factor, 1);
  assert.equal(five.label, 'proxy-ofertas');
  assert.equal(five.available, 5);
});

test('H6: observación vieja aplica el recorte por antigüedad sobre L conocida', () => {
  const F = fresh();
  const freshL = F.liquidityInfo({ history: [{ day: 100, available: 5 }], observedDay: 100 }, 100);
  const oldL = F.liquidityInfo({ history: [{ day: 90, available: 5 }], observedDay: 90 }, 100);
  assert.ok(near(oldL.factor, freshL.factor * 0.5, 1e-12));
  assert.equal(oldL.recent, false);
});

/* -------------------------------------------- H7: clamp de outlier */

test('H7: clamp 50x se aplica y se rotula como freno conservador', () => {
  const F = fresh();
  const r = F.clampOutlier(8_000_000, 100_000, 1); // 800g vs vendedor 10g
  assert.equal(r.price, 5_000_000);                // 500g
  assert.equal(r.clamped, true);
  assert.equal(r.doubtful, true);
  assert.match(r.rule, /50×/);
});

test('H7: con ≥3 ofertas o sin vendedor no hay clamp', () => {
  const F = fresh();
  assert.equal(F.clampOutlier(8_000_000, 100_000, 5).clamped, false);
  assert.equal(F.clampOutlier(8_000_000, 0, 1).clamped, false);
  assert.equal(F.clampOutlier(300_000, 100_000, 1).clamped, false);
});

/* ------------------------------------------- H8: bonus de útiles */

test('H8: bonus de útiles es heurístico, por conteo y sólo AH', () => {
  const F = fresh();
  assert.equal(F.usefulBonusFor(0).factor, 0);
  assert.equal(F.usefulBonusFor(5).factor, 0.1);
  assert.equal(F.usefulBonusFor(10).factor, 0.2);
  assert.equal(F.usefulBonusFor(20).factor, 0.2);
  const b = F.usefulBonusFor(10);
  assert.equal(b.basis, 'conteo-de-items-utiles');
  assert.equal(b.appliesTo, 'ah-only');
  assert.equal(b.heuristic, true);
});

/* ---------------------------------- H9: riesgo / competencia / viaje */

test('H9: riesgo y competencia se declaran heurísticos, sin calibración', () => {
  const F = fresh();
  const r = F.riskInfo('contested', 'horde', { pvp: true });
  assert.equal(r.level, 'media');
  assert.equal(r.mult, 0.85);
  assert.equal(r.heuristic, true);
  assert.match(r.basis, /sin datos de población/i);
  assert.equal(F.MODEL.competition.heuristic, true);
});

test('H9: PvP desactivado elimina el multiplicador de riesgo', () => {
  const F = fresh();
  assert.equal(F.riskInfo('alliance', 'horde', { pvp: false }).mult, 1);
  assert.equal(F.riskInfo('contested', 'horde', { pvp: false }).mult, 1);
});

test('H9: factor de viaje = sesión/(sesión+traslado) y se rotula approximated', () => {
  const F = fresh();
  const one = F.travelFor('Eastern Plaguelands', 'horde', [], 1);
  const two = F.travelFor('Eastern Plaguelands', 'horde', [], 2);
  const four = F.travelFor('Eastern Plaguelands', 'horde', [], 4);
  assert.equal(two.min, 45);
  assert.ok(near(one.factor, 1 / 1.75, 1e-12));
  assert.ok(near(two.factor, 2 / 2.75, 1e-12));
  assert.ok(near(four.factor, 4 / 4.75, 1e-12));
  assert.equal(two.approx, true);
});

/* ------------------------------------- H10: ROI de metrics es margen */

test('H10: retorno/coste y margen/coste son conceptos distintos', () => {
  const F = fresh();
  const m = F.marginInfo(33, 100);
  assert.ok(near(m.returnOverCost, 0.33, 1e-12));
  assert.ok(near(m.netOverCost, -0.67, 1e-12));
  assert.equal(m.net, -67);
  assert.equal(m.label, 'retorno/coste');
  assert.match(m.note, /no es ROI sobre capital/i);
  assert.equal(m.heuristic, false);
});

test('H10: con comisión AH (1.000 -> 950) el neto es -50 sobre coste 1.000', () => {
  const F = fresh();
  const m = F.marginInfo(950, 1000);
  assert.equal(m.net, -50);
  assert.ok(near(m.netOverCost, -0.05, 1e-12));
  assert.ok(near(m.returnOverCost, 0.95, 1e-12));
});

/* ------------------------------- contrato de metadatos del modelo */

test('modelo: la liquidez es proxy de ofertas, jamás ventas realizadas', () => {
  const F = fresh();
  assert.equal(F.MODEL.liquidity.heuristic, true);
  assert.match(F.MODEL.liquidity.basis, /oferta anunciada/i);
  assert.doesNotMatch(F.MODEL.liquidity.basis, /ventas realizadas/i);
});

test('modelo: ítem y zona aplican la misma liquidez (F0 farmeo-oro)', () => {
  const F = fresh();
  assert.equal(F.MODEL.itemMetrics.liquidityApplied, true);
  assert.equal(F.MODEL.zoneEntry.liquidityApplied, true);
});

/* -------------------------------- integración con fixture sintético */

function fixture(extraMobs = []) {
  const F = fresh();
  F.configure({
    HunterDropData: {
      zones: { '1': ['Westfall', 'horde', 'horde', 1, 10] },
      mobs: {
        '100': ['Lobo', 3, 4, 'normal', '1', 3, 120, 'ah'],
        ...Object.fromEntries(extraMobs.map((m, i) => [String(200 + i), m])),
      },
      objects: {},
      items: { '500': ['Piel', 1, 4, 0, 0, 5, 5, 0, 0, 100, [['m', 100, 50, 1, 2], ...extraMobs.map((_, i) => ['m', 200 + i, 50, 1, 2])]] },
    },
    HunterMarketCatalog: { items: { '500': { name: 'Piel' } } },
  });
  return F;
}
const scan = () => [{ itemId: 500, unitPriceCopper: 10000, observedDay: 0, history: [] }];
const prof = { level: 10, fac: 'horde', cls: 'hunter' };

test('integración: ruta expone SIN DATOS, modo camp y heurísticas en la respuesta', () => {
  const F = fixture();
  const r = F.rank(scan(), prof, { gph: 5, session: 2, campMode: 'single' });
  assert.equal(r.all.length, 1);
  const z = r.A;
  assert.equal(z.campMode, 'single');
  assert.ok(z.liqUnknown > 0);
  assert.equal(z.travel.approx, true);
  assert.equal(z.risk.heuristic, true);
  assert.equal(z.comp.heuristic, true);
  assert.ok(z.heuristics);
  assert.ok(z.reasons.some(t => /SIN DATOS/.test(t)));
  assert.ok(z.reasons.some(t => /heurísticos/.test(t)));
  assert.ok(Number.isFinite(z.score));
});

test('integración: rotación con pesos declarados baja zoneBase frente a un sitio', () => {
  const extra = [['Oso', 4, 5, 'normal', '1', 3, 120, 'ah', null, null, '1']];
  const single = fixture(extra).rank(scan(), prof, { gph: 5, campMode: 'single' }).A;
  const rot = fixture(extra).rank(scan(), prof, { gph: 5, campMode: 'rotation', campWeights: [0.5, 0.3, 0.2] }).A;
  assert.ok(rot.zoneBase < single.zoneBase);
  // Pesos [1,0,0] declaran "sólo el mejor": debe coincidir con un sitio.
  const rotFull = fixture(extra).rank(scan(), prof, { gph: 5, campMode: 'rotation', campWeights: [1, 0, 0] }).A;
  assert.equal(rotFull.zoneBase, single.zoneBase);
});

test('integración: rareza con respawn conocido no usa 0,2/h en el ranking', () => {
  const rare = ['Raro', 3, 4, 'rare', '1', 1, 604800, 'ah', null, null, '1'];
  const F = fixture([rare]);
  const z = F.rank(scan(), prof, { gph: 5, campMode: 'single' }).A;
  assert.ok(near(z.rareRateSum, 1 / 168, 1e-9));
  assert.equal(z.rareApprox, false);
});

test('integración: itemMetrics rotula ROI como margen y declara la liquidez', () => {
  const F = fixture();
  const m = F.itemMetrics(scan()[0], prof, { gph: 5, session: 2 });
  const first = m.best || (Array.isArray(m) ? m[0] : Object.values(m)[0]);
  assert.ok(first);
  assert.equal(m.liquidityApplied, true);
  assert.equal(m.liquidity.label, 'SIN DATOS'); // sin available: sin ajuste
  assert.equal(m.roiLabel, 'retorno/coste');
  assert.ok(typeof first.rateApprox === 'boolean');
  assert.ok(Number.isFinite(m.returnOverCost) || m.returnOverCost === null || m.returnOverCost === undefined);
});


function twoCamps({ rares = false } = {}) {
  const F = fresh();
  F.configure({ HunterDropData: {
    zones: { '1': ['Westfall', 'horde', 'horde', 1, 10] },
    mobs: {
      '100': ['Lobo', 3, 4, rares ? 'rare' : 'normal', '1', rares ? 1 : 3, rares ? 36000 : 120, 'ah'],
      '200': ['Oso', 3, 4, rares ? 'rare' : 'normal', '1', rares ? 1 : 3, rares ? 360000 : 120, 'ah'],
    },
    objects: {},
    items: Object.fromEntries([100, 200].map((mob, i) => [500 + i,
      ['Drop', 1, 4, 0, 0, 5, 5, 0, 0, 100, [['m', mob, 50, 1, 2]]]])),
  } });
  return F;
}
const observation = (itemId, price) => ({ itemId, unitPriceCopper: price, history: [] });

test('ranking de un campamento no suma vendedor de otro campamento', () => {
  const z = twoCamps().rank([observation(500, 4000)], prof, { campMode: 'single' }).A;
  assert.equal(z.gph, 256500);
  assert.equal(z.vendorGph, 0);
  assert.equal(z.camps[0].id, '100');
});

test('ranking de rotación asigna un único presupuesto a los dos canales', () => {
  const z = twoCamps().rank([observation(500, 4000)], prof,
    { campMode: 'rotation', campWeights: [0.5, 0.3, 0.2] }).A;
  assert.equal(z.gph, 128250 + 2025);
  assert.equal(z.vendorGph, 2025);
});

test('ranking pondera cada raro por su propia tasa de aparición', () => {
  const F = twoCamps({ rares: true });
  const value = (a, b) => F.rank([observation(500, a), observation(501, b)], prof, {}).A.rareValue;
  assert.ok(near(value(1000, 4000), 99.75));
  assert.ok(near(value(4000, 1000), 292.125));
});

test('precio de referencia no interpreta oferta desconocida como cero', () => {
  const F = fresh();
  const item = { ...observation(999999, 8000000), observedDay: 10, sellPriceCopper: 100000 };
  assert.equal(F.referencePrice(item).price, 8000000);
  assert.equal(F.referencePrice({ ...item, history: [{ day: 10, available: 0 }] }).price, 5000000);
});

test('respawn positivo conocido menor de 60 s no se sustituye por el fallback', () => {
  const info = fresh().rateInfo(mob({ respawnSec: 30 }), 60);
  assert.equal(info.spawnCap, 120);
  assert.equal(info.rate, Math.min(info.cycleRate, 120));
});

/* ------------------------------------ F0 farmeo-oro: oro, no heurísticas */

const DAY0 = Math.floor((Date.now() - Date.UTC(2020, 0, 1)) / 86400000);
const obs = (itemId, low, available, days = [0]) => ({
  itemId, unitPriceCopper: low, observedDay: DAY0,
  history: days.map((d, i) => ({ day: DAY0 - d, low: Array.isArray(low) ? low[i] : low, high: Array.isArray(low) ? low[i] : low, available })),
});

test('F0: precio de referencia = mediana de mínimos de la ventana, no el último', () => {
  const F = fresh();
  const it = { ...obs(1, [900, 100, 120, 110], 50, [0, 1, 2, 3]), unitPriceCopper: 900 };
  const rp = F.referencePrice(it);
  assert.equal(rp.price, 115);            // mediana de 100,110,120,900
  assert.equal(rp.priceDays, 4);
  const viejo = { ...it, history: [...it.history, { day: DAY0 - 30, low: 5, high: 5, available: 50 }] };
  assert.equal(F.referencePrice(viejo).price, 115); // fuera de la ventana de 14 días
});

test('F0: el canal es el mejor entre subasta neta y vendedor', () => {
  const F = fresh();
  const barato = { ...obs(1, 50, 100), sellPriceCopper: 80 };   // subasta neta 47 < vendedor 80
  const rp = F.referencePrice(barato);
  assert.equal(rp.vendorFloor, true);
  assert.equal(rp.ahNet, 47);
  const caro = { ...obs(1, 1000, 100), sellPriceCopper: 80 };
  assert.equal(F.referencePrice(caro).vendorFloor, false);
  assert.equal(F.referencePrice(caro).ahNet, 950);
});

test('F0: con ≤5 ofertas no hay canal de subasta (mercado delgado)', () => {
  const F = fresh();
  const delgado = { ...obs(1, 90000, 3), sellPriceCopper: 500 };
  const rp = F.referencePrice(delgado);
  assert.equal(rp.thin, true);
  assert.equal(rp.vendorFloor, true);
  assert.equal(F.referencePrice({ ...obs(1, 90000, 6), sellPriceCopper: 500 }).thin, false);
  assert.equal(F.referencePrice({ ...obs(1, 90000, null), sellPriceCopper: 500 }).thin, false); // sin dato: no se asume
});

test('F0: la ruta por ítem de un mercado delgado vale lo del vendedor', () => {
  const F = fixture();
  const lleno = F.itemMetrics({ ...obs(500, 10000, 50) }, prof, { gph: 5, session: 2, comp: 'low' });
  const delgado = F.itemMetrics({ ...obs(500, 10000, 3) }, prof, { gph: 5, session: 2, comp: 'low' });
  assert.ok(delgado.gph > 0);
  assert.ok(near(delgado.gph / lleno.gph, 100 / 9500, 1e-9)); // vendedor 100 c frente a subasta neta 9500 c
});

test('F0: la competencia automática no depende de la hora del reloj', () => {
  const F = fixture();
  F.index();
  const a = F.compFor('1', 'Westfall', { comp: 'auto', zoneComp: {} }, { hubZones: '' });
  const b = F.compFor('1', 'Westfall', { comp: 'auto', zoneComp: {} }, { hubZones: 'Westfall' });
  assert.equal(a.comp, 'med');
  assert.equal(b.comp, 'high');
  assert.doesNotMatch(a.why + b.why, /horario/);
});

test('F0: los ítems útiles se informan pero no suben el puntaje', () => {
  const F = fixture();
  const z = F.rank(scan(), prof, { gph: 5, session: 2, comp: 'low' }).A;
  assert.equal(z.usefulBonus, 0);
  assert.equal(z.score, z.scoreNoBonus);
  assert.match(F.MODEL.usefulBonus.basis, /no entra al puntaje/);
});

test('recolección: con tu skill, los nodos que piden más no cuentan; sin skill queda el proxy de iLvl', () => {
  const F = fresh();
  F.configure({ HunterDropData: {
    zones: { '1': ['Westfall', 'horde', 'horde', 1, 10] },
    mobs: {},
    objects: { '700': ['Hierba fácil', 'herb', '1', 10, 300], '701': ['Hierba difícil', 'herb', '1', 10, 300] },
    objSkill: { '701': 150 },
    items: {
      '510': ['Hoja', 1, 7, 0, 0, 0, 5, 0, -1, 100, [['o', 700, 100, 1, 1]]],
      '511': ['Flor', 1, 7, 0, 0, 0, 15, 0, -1, 100, [['o', 701, 100, 1, 1]]],
    },
  } });
  const sc = [{ itemId: 510, unitPriceCopper: 1000, observedDay: 0, history: [] },
    { itemId: 511, unitPriceCopper: 5000, observedDay: 0, history: [] }];
  const zona = (extra) => F.profRecommendations(sc, prof, { prof: { herb: true }, campMode: 'single', ...extra })[0]?.zones[0];
  const sin = zona({}), bajo = zona({ skill: { herb: 100 } }), alto = zona({ skill: { herb: 200 } });
  assert.deepEqual([...sin.items].sort(), ['Flor', 'Hoja'], 'sin skill: el proxy de iLvl deja pasar ambas');
  assert.deepEqual(bajo.items, ['Hoja'], 'skill 100 < 150: la Flor no se recolecta');
  assert.deepEqual([...alto.items].sort(), ['Flor', 'Hoja']);
  assert.ok(bajo.gph < alto.gph, 'sin el nodo caro rinde menos');
  assert.equal(sin.gph, alto.gph);
  assert.equal(zona({ skill: { herb: 'x' } }).gph, sin.gph, 'un skill inválido se ignora');
  // ≤5 ofertas: la recolección tampoco valora la Flor a subasta (queda a vendedor).
  const delgado = [sc[0], { itemId: 511, unitPriceCopper: 5000, observedDay: 0, history: [{ day: 0, low: 5000, high: 5000, available: 2 }] }];
  const zd = F.profRecommendations(delgado, prof, { prof: { herb: true }, campMode: 'single' })[0]?.zones[0];
  assert.ok(zd.gph < sin.gph, 'el mercado delgado no se valora a subasta en la recolección');
});
