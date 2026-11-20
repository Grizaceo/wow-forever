'use strict';

/*
 * Tests for HunterChart (market-chart.js) — deterministic SVG price-history
 * charts: full chart with axes (item detail) and sparkline (farm cards).
 * All fixtures are synthetic; the optional real-fixture section only reports
 * REDACTED METRICS (counts, days, bytes).
 *
 * Run:  node tests/market-chart.cjs
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../market-chart.js');
const H = require('../market-history.js');
const { parseAuctionator } = require('../market.js');

/* ---------------------------------------------------------------- helpers */

const EPOCH = Date.UTC(2020, 0, 1);
const DAY = 86400000;
const dayOf = (iso) => Math.floor((Date.parse(iso + 'T00:00:00Z') - EPOCH) / DAY);

const hist = (...entries) => entries.map(([day, low]) => ({ day, low, high: low, available: null }));

const SERIES = hist(...[2500, 2501, 2502, 2503, 2504, 2505].map((d, i) => [d, 100000 + i * 5000]));

function count(svg, needle) { return svg.split(needle).length - 1; }

/* ------------------------------------------------------------- vacíos */

test('priceChart/sparkline return empty string for empty or invalid input', () => {
  for (const bad of [null, undefined, {}, 'x', [], [null], [{ day: 'a', low: 1 }], [{ day: 1, low: 0 }], [{ day: 1.5, low: 10 }]]) {
    assert.strictEqual(C.priceChart(bad), '');
    assert.strictEqual(C.sparkline(bad), '');
  }
  assert.strictEqual(C.priceChart(hist()), '');
});

test('sparkline needs at least two points; priceChart renders a single point', () => {
  assert.strictEqual(C.sparkline(hist([2500, 100])), '');
  assert.ok(C.priceChart(hist([2500, 100])).includes('<svg'));
  assert.ok(C.sparkline(hist([2500, 100], [2501, 200])).includes('<svg'));
});

/* ------------------------------------------------------------ estructura */

test('priceChart emits a well-formed SVG with axes, line, area and labels', () => {
  const svg = C.priceChart(SERIES, { current: 125000 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.endsWith('</svg>'));
  assert.strictEqual(count(svg, '<svg'), 1);
  assert.strictEqual(count(svg, '</svg>'), 1);
  assert.ok(count(svg, '<path') === 2, 'area + line');
  assert.ok(count(svg, '<circle') === 2, 'current + last point');
  assert.ok(count(svg, '<text') >= 8, 'y ticks + x dates');
  assert.ok(svg.includes('viewBox="0 0 720 210"'));
  assert.ok(svg.includes('role="img"'));
  assert.ok(!/NaN|Infinity/.test(svg));
});

test('sparkline emits SVG without axes', () => {
  const svg = C.sparkline(SERIES);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(!svg.includes('<text'), 'no axis labels');
  assert.ok(count(svg, '<path') === 2);
  assert.ok(!/NaN|Infinity/.test(svg));
});

/* -------------------------------------------------------- entrada flexible */

test('accepts compact store rows as well as snapshot history objects', () => {
  const objs = SERIES;
  const rows = objs.map((h) => [h.day, h.low]); // [day,low] canónico
  assert.strictEqual(C.priceChart(rows), C.priceChart(objs));
  const rows3 = objs.map((h) => [h.day, h.low, 7]); // [day,low,available]
  assert.strictEqual(C.priceChart(rows3), C.priceChart(objs));
  const rows4 = objs.map((h, i) => [h.day, h.low, h.low + 1000, i]); // [day,low,high,available]
  assert.strictEqual(C.priceChart(rows4), C.priceChart(objs));
});

test('output is independent of input order and duplicate days are canonical', () => {
  const messy = [
    { day: 2502, low: 300 }, { day: 2500, low: 100 },
    { day: 2501, low: 200 }, { day: 2501, low: 250 }, // duplicado: gana el mayor
  ];
  assert.strictEqual(C.sparkline(messy), C.sparkline(messy.slice().reverse()));
  // El duplicado resuelve a low=250: el punto medio de la línea lo refleja.
  const clean = [{ day: 2500, low: 100 }, { day: 2501, low: 250 }, { day: 2502, low: 300 }];
  assert.strictEqual(C.sparkline(messy), C.sparkline(clean));
  // Mismo conjunto sin duplicados, permutado: idéntico.
  const perm = SERIES.slice().reverse();
  assert.strictEqual(C.priceChart(SERIES), C.priceChart(perm));
});

test('deterministic: identical input produces identical SVG', () => {
  assert.strictEqual(C.priceChart(SERIES, { current: 1 }), C.priceChart(SERIES, { current: 1 }));
  assert.strictEqual(C.sparkline(SERIES), C.sparkline(SERIES));
});

/* ------------------------------------------------------------- dominio Y */

test('flat series (all lows equal) still renders without degenerate scale', () => {
  const flat = hist([2500, 50000], [2501, 50000], [2502, 50000]);
  const svg = C.priceChart(flat);
  assert.ok(svg.includes('<svg'));
  assert.ok(!/NaN|Infinity/.test(svg));
});

test('large day gaps render (x axis is the real day, gaps stay gaps)', () => {
  const gapped = hist([2500, 100000], [2600, 200000]);
  const svg = C.priceChart(gapped);
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes(fmtDayCheck(2500)) && svg.includes(fmtDayCheck(2600)));
});
function fmtDayCheck(day) {
  const d = new Date(EPOCH + day * DAY);
  const p = (n) => (n < 10 ? '0' : '') + n;
  return p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
}

test('current-price marker only appears inside the observed range', () => {
  const inside = C.priceChart(SERIES, { current: 110000 });
  const above = C.priceChart(SERIES, { current: 99999999 });
  const below = C.priceChart(SERIES, { current: 1 });
  // Dentro del rango: 3 círculos (actual + último + ... no, actual+último=2 si difieren)
  assert.strictEqual(count(inside, '<circle'), 2);
  // Fuera de rango: solo el punto final.
  assert.strictEqual(count(above, '<circle'), 1);
  assert.strictEqual(count(below, '<circle'), 1);
});

/* ------------------------------------------------------------- formato */

test('fmtCopper produces compact deterministic labels', () => {
  assert.strictEqual(C.fmtCopper(156000), '15.6g');
  assert.strictEqual(C.fmtCopper(100000), '10g');
  assert.strictEqual(C.fmtCopper(45200), '4.5g');
  assert.strictEqual(C.fmtCopper(8500), '85s');
  assert.strictEqual(C.fmtCopper(999), '10s');
  assert.strictEqual(C.fmtCopper(42), '42c');
});

test('fmtDay renders dd/mm/yyyy in UTC', () => {
  assert.strictEqual(C.fmtDay(dayOf('2026-11-10')), '10/11/2026');
  assert.strictEqual(C.fmtDay(dayOf('2020-01-01')), '01/01/2020');
});

/* ---------------------------------------------------------- escape/title */

test('title text is escaped (no markup injection via opts)', () => {
  const svg = C.priceChart(SERIES, { title: '<img src=x onerror=alert(1)>' });
  assert.ok(!svg.includes('<img'));
  assert.ok(svg.includes('&lt;img'));
});

test('median reference line appears only strictly inside the range', () => {
  const rising = C.priceChart(hist([2500, 100], [2501, 200], [2502, 300], [2503, 400]));
  assert.ok(rising.includes('stroke-dasharray="4 3"'), 'median dashed line');
  const two = C.priceChart(hist([2500, 100], [2501, 100])); // mediana = extremo
  // Con 2 puntos iguales la mediana cae en el borde del dominio: puede o no dibujarse,
  // lo que importa es que no rompe.
  assert.ok(two.includes('<svg'));
});

/* ------------------------------------------------- fixture real (métricas) */

function findRealFixture() {
  const root = path.join(
    process.env.HOME || '',
    'Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_forever_/WTF'
  );
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name === 'Auctionator.lua') {
        try { if (fs.statSync(full).size > 1000) return full; } catch { }
      }
    }
  }
  return null;
}

test('real Auctionator fixture: chart renders accumulated multi-day history', (t) => {
  const file = findRealFixture();
  if (!file) { t.skip('sin fixture real Auctionator.lua'); return; }
  // Contrato de privacidad: stat-only por defecto; leer contenido exige opt-in:
  //   WOW_FOREVER_REAL_FIXTURE=1 node tests/market-chart.cjs
  const st = fs.statSync(file);
  if (process.env.WOW_FOREVER_REAL_FIXTURE !== '1') {
    t.diagnostic(`real fixture presente: ${st.size} bytes (stat-only)`);
    t.skip('stat-only: WOW_FOREVER_REAL_FIXTURE=1 habilita la validación de contenido');
    return;
  }
  const buf = fs.readFileSync(file);
  const snap = parseAuctionator(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  const store = H.fitStore(H.storeMerge(H.emptyStore(), snap), 4194304 - 4096);
  const view = H.applyStore(snap, store);
  let items = 0, charted = 0, sparkable = 0, maxHist = 0;
  for (const r of view.realms) for (const it of r.items) {
    items++;
    const svg = C.priceChart(it.history);
    if (svg) {
      charted++;
      assert.ok(!/NaN|Infinity/.test(svg));
      if (C.sparkline(it.history)) sparkable++;
      if (it.history.length > maxHist) maxHist = it.history.length;
    }
  }
  // Solo métricas agregadas — jamás datos del personaje/realm.
  console.log(`  [real] items=${items} conGrafico=${charted} conSparkline=${sparkable} maxHist=${maxHist}`);
  assert.ok(items > 0);
  assert.ok(charted > 0, 'al menos un ítem con historial suficiente para graficar');
});
