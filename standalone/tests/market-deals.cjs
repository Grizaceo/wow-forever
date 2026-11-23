'use strict';

/*
 * Tests for HunterDeals (market-deals.js) — deterministic deal/overprice
 * classification vs historical median, with confidence and liquidity rules.
 * All fixtures are synthetic. Run: node tests/market-deals.cjs
 */

const test = require('node:test');
const assert = require('node:assert');

require('../market-history.js'); // sets globalThis.HunterHistory for the module
const D = require('../market-deals.js');

const hist = (...entries) => entries.map(([day, low, available]) => ({
  day, low, high: low, available: available === undefined ? null : available,
}));
const item = (price, observedDay, history, sourceKey = 'k') => ({
  sourceKey, itemId: null, unitPriceCopper: price, observedDay, history,
});
// 5 días de mínimo constante 1000, available configurable.
const fiveDays = (avail) => hist(...[2501, 2502, 2503, 2504, 2505].map(d => [d, 1000, avail]));

test('dealInfo returns sin-datos with fewer than MIN_DAYS sample days', () => {
  const d = D.dealInfo(item(700, 2505, hist([2505, 1000])));
  assert.strictEqual(d.kind, 'sin-datos');
  assert.strictEqual(d.score, null);
  assert.strictEqual(d.days, 1);
  assert.strictEqual(d.confidence, 'ninguna');
});

test('dealInfo sin-datos on invalid item / price / missing stats', () => {
  assert.strictEqual(D.dealInfo(null).kind, 'sin-datos');
  assert.strictEqual(D.dealInfo({}).kind, 'sin-datos');
  assert.strictEqual(D.dealInfo(item(0, 2505, fiveDays(10))).kind, 'sin-datos');
  assert.strictEqual(D.dealInfo(item(-5, 2505, fiveDays(10))).kind, 'sin-datos');
  assert.strictEqual(D.dealInfo(item(700, 2505, [])).kind, 'sin-datos');
});

test('dealInfo classifies oferta at >=20% below median', () => {
  const d = D.dealInfo(item(800, 2505, fiveDays(10))); // -20% exacto
  assert.strictEqual(d.kind, 'oferta');
  assert.ok(Math.abs(d.discount - 0.2) < 1e-9);
  assert.ok(d.score > 0);
  const d2 = D.dealInfo(item(700, 2505, fiveDays(10))); // -30%
  assert.strictEqual(d2.kind, 'oferta');
  assert.ok(Math.abs(d2.discount - 0.3) < 1e-9);
  assert.ok(d2.score > d.score);
});

test('dealInfo classifies sobreprecio at >=20% above median', () => {
  const d = D.dealInfo(item(1250, 2505, fiveDays(10))); // +25%
  assert.strictEqual(d.kind, 'sobreprecio');
  assert.ok(d.discount < 0);
  assert.ok(d.score < 0);
  assert.ok(d.reasons[0].includes('25%'));
});

test('dealInfo classifies estable inside the band', () => {
  const d = D.dealInfo(item(1050, 2505, fiveDays(10))); // +5% sobre mediana
  assert.strictEqual(d.kind, 'estable');
  assert.ok(Math.abs(d.discount - -0.05) < 1e-9);
  assert.ok(d.score < 0); // prima leve → score negativo pero no 'sobreprecio'
});

test('dealInfo floor is 2 days: 2 days classifies with baja confidence', () => {
  const two = hist([2504, 1000, 10], [2505, 1000, 10]);
  const d = D.dealInfo(item(700, 2505, two));
  assert.strictEqual(d.kind, 'oferta');
  assert.strictEqual(d.confidence, 'baja'); // 2 días nunca llega a media
  assert.strictEqual(d.days, 2);
  // 1 día sigue siendo sin-datos
  assert.strictEqual(D.dealInfo(item(700, 2505, hist([2505, 1000, 10]))).kind, 'sin-datos');
});

test('confidence: alta needs >=7 days, media >=4, else baja', () => {
  const days7 = hist(...[2499, 2500, 2501, 2502, 2503, 2504, 2505].map(d => [d, 1000, 10]));
  const d7 = D.dealInfo(item(800, 2505, days7));
  assert.strictEqual(d7.confidence, 'alta');
  assert.strictEqual(d7.kind, 'oferta');
  const d5 = D.dealInfo(item(800, 2505, fiveDays(10)));
  assert.strictEqual(d5.confidence, 'media');
  const d3 = D.dealInfo(item(800, 2505, hist([2503, 1000, 10], [2504, 1000, 10], [2505, 1000, 10])));
  assert.strictEqual(d3.confidence, 'baja');
  assert.strictEqual(d3.kind, 'oferta');
});

test('thin liquidity (available<=2) is an offer count, not statistical confidence', () => {
  const days7 = hist(...[2499, 2500, 2501, 2502, 2503, 2504, 2505].map(d => [d, 1000, 10]));
  const hi = D.dealInfo(item(800, 2505, days7));
  assert.strictEqual(hi.confidence, 'alta');
  // observedDay=2505 con available=1 → se informa, pero NO baja la confianza ni el score.
  const thin = hist(...[2499, 2500, 2501, 2502, 2503, 2504].map(d => [d, 1000, 10]).concat([[2505, 1000, 1]]));
  const lo = D.dealInfo(item(800, 2505, thin));
  assert.strictEqual(lo.confidence, 'alta');
  assert.strictEqual(lo.available, 1);
  assert.strictEqual(lo.score, hi.score);
  assert.ok(lo.reasons.some(r => r.includes('pocas ofertas')));
  assert.ok(lo.reasons.some(r => r.includes('no ventas')));
  // available null tampoco penaliza: dato ausente, no liquidez baja ni venta.
  const nul = hist(...[2499, 2500, 2501, 2502, 2503, 2504, 2505].map(d => [d, 1000]));
  assert.strictEqual(D.dealInfo(item(800, 2505, nul)).confidence, 'alta');
});

test('trend weight: same discount scores higher when market rises', () => {
  // Tres historias con la MISMA mediana (1000) y mismo precio actual (700)
  // → mismo discount 0.3; solo cambia la tendencia → el score lo refleja.
  const rising = hist([2501, 900], [2502, 950], [2503, 1000], [2504, 1050], [2505, 1100]);
  const flat = fiveDays(10);
  const falling = hist([2501, 1100], [2502, 1050], [2503, 1000], [2504, 950], [2505, 900]);
  const dUp = D.dealInfo(item(700, 2505, rising));
  const dFlat = D.dealInfo(item(700, 2505, flat));
  const dDown = D.dealInfo(item(700, 2505, falling));
  assert.strictEqual(dUp.medianaLow, 1000);
  assert.strictEqual(dFlat.medianaLow, 1000);
  assert.strictEqual(dDown.medianaLow, 1000);
  assert.ok(Math.abs(dUp.discount - 0.3) < 1e-9 && Math.abs(dFlat.discount - 0.3) < 1e-9 && Math.abs(dDown.discount - 0.3) < 1e-9);
  assert.ok(dUp.score > dFlat.score && dFlat.score > dDown.score, { up: dUp.score, flat: dFlat.score, down: dDown.score });
});

test('custom thresholds via opts', () => {
  const d = D.dealInfo(item(850, 2505, fiveDays(10)), { offerPct: 0.1 });
  assert.strictEqual(d.kind, 'oferta'); // -15% >= 10% custom
  const d2 = D.dealInfo(item(850, 2505, fiveDays(10)), { offerPct: 0.5 });
  assert.strictEqual(d2.kind, 'estable');
  const d3 = D.dealInfo(item(700, 2505, hist([2505, 1000, 10])), { minDays: 1 });
  assert.strictEqual(d3.kind, 'oferta'); // con minDays=1 ya opina
});

test('compact store rows are accepted (history as arrays)', () => {
  const rows = [[2501, 1000, 10], [2502, 1000, 10], [2503, 1000, 10], [2504, 1000, 10], [2505, 1000, 1]];
  const d = D.dealInfo(item(700, 2505, rows));
  assert.strictEqual(d.kind, 'oferta');
  assert.strictEqual(d.available, 1); // observedDay=2505 → su available (conteo de ofertas)
  assert.strictEqual(d.confidence, 'media'); // 5 días → media; available NO baja la confianza
  assert.ok(d.reasons.some(r => r.includes('pocas ofertas')));
});

test('determinism: same input produces identical output', () => {
  const it = item(700, 2505, fiveDays(10));
  assert.deepStrictEqual(D.dealInfo(it), D.dealInfo(it));
  const it2 = item(700, 2505, fiveDays(10));
  assert.deepStrictEqual(D.dealInfo(it), D.dealInfo(it2));
});

test('median is computed over daily lows, not current price', () => {
  // lows variables → mediana real
  const h = hist([2501, 800], [2502, 900], [2503, 1000], [2504, 1100], [2505, 1200]);
  const d = D.dealInfo(item(950, 2505, h)); // mediana=1000 → -5% estable
  assert.strictEqual(d.kind, 'estable');
  assert.strictEqual(d.medianaLow, 1000);
});

/* ------------------------------------------------------------------------- *
 * H14 (auditoría cuantitativa) — ranking de ofertas.
 * El score es un ranking HEURÍSTICO: los pesos están elegidos a mano y no
 * invalidados con ventas. La confianza es estadística (días de muestra) y
 * NO se deriva del conteo de ofertas anunciadas (`available`), que jamás es
 * una venta. Estos tests fijan ese contrato antes de tocar el motor.
 * ------------------------------------------------------------------------- */

test('H14: statistical confidence (days) stays distinct from offer count (available)', () => {
  const many = D.dealInfo(item(700, 2505, fiveDays(10)));
  const thin = D.dealInfo(item(700, 2505, fiveDays(1)));
  const unknown = D.dealInfo(item(700, 2505, fiveDays(null)));
  // Mismos 5 días → misma confianza estadística, tenga 10, 1 o 0 ofertas anunciadas.
  for (const d of [many, thin, unknown]) {
    assert.strictEqual(d.days, 5);
    assert.strictEqual(d.confidence, 'media');
  }
  assert.strictEqual(many.available, 10);
  assert.strictEqual(thin.available, 1);
  assert.strictEqual(unknown.available, null);
  // El conteo de ofertas no entra en el peso de confianza ni cambia el score.
  assert.strictEqual(many.score, thin.score);
  assert.strictEqual(many.score, unknown.score);
  // El conteo se informa aparte y se rotula como ofertas, nunca como ventas.
  assert.ok(thin.reasons.some(r => /ofertas/i.test(r) && /no ventas/i.test(r)),
    'debe rotular available como ofertas anunciadas, no ventas');
});

test('H14: score exposes its heuristic ranking basis and frozen hand-chosen weights', () => {
  const d = D.dealInfo(item(700, 2505, fiveDays(10))); // -30%, 5 días, estable
  assert.ok(d.ranking, 'la salida debe exponer la base del ranking');
  assert.strictEqual(d.ranking.heuristic, true);
  assert.strictEqual(d.ranking.formula, 'discount*confWeight*trendWeight');
  assert.strictEqual(d.ranking.confWeight, 0.8);
  assert.strictEqual(d.ranking.trendWeight, 1);
  assert.strictEqual(d.ranking.trend, 'estable');
  assert.ok(Math.abs(d.score - 0.3 * 0.8) < 1e-9);
  assert.ok(d.reasons.some(r => /heur/i.test(r)), 'debe rotular los pesos como heurísticos, no calibrados');
  assert.ok(Object.isFrozen(D.CONF_W) && Object.isFrozen(D.TREND_W),
    'las tablas de pesos deben estar congeladas contra deriva accidental');
});

test('H14: crafteo state "plana" is normalized to "estable" for the ranking', () => {
  assert.strictEqual(D.normalizarTendencia('plana'), 'estable');
  assert.strictEqual(D.normalizarTendencia('estable'), 'estable');
  assert.strictEqual(D.normalizarTendencia('sube'), 'sube');
  assert.strictEqual(D.normalizarTendencia('baja'), 'baja');
  assert.strictEqual(D.normalizarTendencia('sin-datos'), 'sin-datos');
  assert.strictEqual(D.TREND_W.plana, 1); // alias explícito, mismo peso que estable
  // Un priceStats externo que devuelva 'plana' no debe caer en un peso misterioso.
  const H = require('../market-history.js');
  const original = H.priceStats;
  H.priceStats = () => ({ minLow: 900, medianaLow: 1000, avgLow: 1000, tendencia: 'plana', diasMuestra: 5 });
  try {
    const d = D.dealInfo(item(700, 2505, fiveDays(10)));
    assert.strictEqual(d.ranking.trend, 'estable');
    assert.strictEqual(d.ranking.trendWeight, 1);
    assert.ok(Math.abs(d.score - 0.24) < 1e-9); // 30% × media 0,8 × estable 1
  } finally {
    H.priceStats = original;
  }
});

test('H14: audit examples stay reproducible and labelled as unvalidated heuristic', () => {
  // A: 30% de descuento, 4 días (media 0,8), tendencia sube (1,15) → 0,276.
  const rising4 = hist([2502, 900, 10], [2503, 950, 10], [2504, 1050, 10], [2505, 1100, 10]);
  const a = D.dealInfo(item(700, 2505, rising4));
  // B: 25% de descuento, 7 días (alta 1), estable → 0,25.
  const flat7 = hist(...[2499, 2500, 2501, 2502, 2503, 2504, 2505].map(d => [d, 1000, 10]));
  const b = D.dealInfo(item(750, 2505, flat7));
  assert.strictEqual(a.confidence, 'media');
  assert.strictEqual(b.confidence, 'alta');
  assert.strictEqual(a.ranking.trend, 'sube');
  assert.strictEqual(b.ranking.trend, 'estable');
  assert.ok(Math.abs(a.score - 0.276) < 1e-9, `A=${a.score}`);
  assert.ok(Math.abs(b.score - 0.25) < 1e-9, `B=${b.score}`);
  // Efecto matemático intencionado, pero no validado con ventas: se rotula.
  assert.ok(a.score > b.score);
  assert.ok(a.ranking.heuristic && b.ranking.heuristic);
  assert.ok(a.reasons.some(r => /heur/i.test(r)));
});
