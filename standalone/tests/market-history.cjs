'use strict';

/*
 * Tests for HunterHistory (market-history.js) — deterministic accumulation of
 * Auctionator daily price history: compact store, snapshot merge, stats,
 * trimming and byte-budget fitting. All fixtures are synthetic; the optional
 * real-fixture section only reports REDACTED METRICS (counts, days, bytes).
 *
 * Run:  node tests/market-history.cjs
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const H = require('../market-history.js');
const { parseAuctionator } = require('../market.js');

/* ---------------------------------------------------------------- helpers */

const EPOCH = Date.UTC(2020, 0, 1);
const DAY = 86400000;
const dayOf = (iso) => Math.floor((Date.parse(iso + 'T00:00:00Z') - EPOCH) / DAY);

const hist = (...entries) => entries.map(([day, low, high, available]) => ({
  day, low, high: high === undefined ? low : high, available: available === undefined ? null : available,
}));
const item = (sourceKey, price, observedDay, history, itemId = null) => ({
  sourceKey, itemId, unitPriceCopper: price, observedDay, history,
});
const snap = (importedAt, realms, warnings = []) => ({
  schemaVersion: 1, sourceVersion: 8, importedAt, realms, warnings,
});
const realm = (name, items) => ({ name, items });

/* ---------------------------------------------------------- row codec */

test('row codec round-trips all four canonical forms', () => {
  const cases = [
    { day: 10, low: 100, high: 100, available: null },   // [d,l]
    { day: 10, low: 100, high: 100, available: 5 },     // [d,l,a]
    { day: 10, low: 100, high: 150, available: null },  // [d,l,h,null]
    { day: 10, low: 100, high: 150, available: 0 },     // [d,l,h,0]
    { day: 10, low: 100, high: 150, available: 7 },     // [d,l,h,a]
  ];
  for (const h of cases) {
    const row = H.entryToRow(h);
    assert.deepStrictEqual(H.rowToEntry(row), h);
    assert.ok(row.length >= 2 && row.length <= 4);
  }
  assert.deepStrictEqual(H.entryToRow({ day: 1, low: 5, high: 5, available: null }), [1, 5]);
  assert.deepStrictEqual(H.entryToRow({ day: 1, low: 5, high: 5, available: 3 }), [1, 5, 3]);
  assert.deepStrictEqual(H.entryToRow({ day: 1, low: 5, high: 9, available: null }), [1, 5, 9, null]);
});

/* ------------------------------------------------------- mergeEntries */

test('mergeEntries unions disjoint days sorted ascending', () => {
  const oldH = hist([10, 100], [30, 300]);
  const newH = hist([20, 200], [40, 400]);
  const out = H.mergeEntries(oldH, newH);
  assert.deepStrictEqual(out.map(e => e.day), [10, 20, 30, 40]);
  assert.strictEqual(out[1].low, 200);
});

test('mergeEntries prefers the newer import on duplicate (day) and takes the whole entry', () => {
  // available conflict rule: the newer file's whole daily aggregate wins
  // (low/high/available together — never field-wise).
  const oldH = hist([10, 100, 120, 8], [20, 200]);
  const newH = hist([10, 90, 140, 3]);
  const out = H.mergeEntries(oldH, newH);
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out[0], { day: 10, low: 90, high: 140, available: 3 });
  assert.deepStrictEqual(out[1], { day: 20, low: 200, high: 200, available: null });
});

/* ----------------------------------------------------- mergeSnapshots */

const prevSnap = snap('2026-01-01T00:00:00Z', [
  realm('PvP', [
    item('6469', 1000, 30, hist([10, 100], [20, 200, 250, 4])),
    item('111', 500, 25, hist([15, 50])),
    item('6469:var', 700, 28, hist([12, 70])),
  ]),
  realm('Solo', [item('222', 300, 22, hist([18, 30]))]),
]);
const nextSnap = snap('2026-01-02T00:00:00Z', [
  realm('PvP', [
    item('6469', 900, 30, hist([20, 210], [30, 190])),       // shared day 20 rewritten + new day 30
    item('999', 50, 30, hist([30, 5])),                      // new item
  ]),
  realm('Otro', [item('333', 10, 30, hist([30, 1]))]),        // new realm
], ['aviso nuevo']);

test('mergeSnapshots unions items and realms, prefers next on conflicts', () => {
  const out = H.mergeSnapshots(prevSnap, nextSnap);
  const pvp = out.realms.find(r => r.name === 'PvP');
  const keys = pvp.items.map(i => i.sourceKey);
  assert.deepStrictEqual(keys, ['6469', '999', '111', '6469:var']);
  const it = pvp.items.find(i => i.sourceKey === '6469');
  // Scalars from the newest import; history merged per day.
  assert.strictEqual(it.unitPriceCopper, 900);
  assert.strictEqual(it.observedDay, 30);
  assert.deepStrictEqual(it.history.map(e => e.day), [10, 20, 30]);
  const d20 = it.history.find(e => e.day === 20);
  assert.deepStrictEqual(d20, { day: 20, low: 210, high: 210, available: null }); // next wins
  assert.deepStrictEqual(it.history.find(e => e.day === 30), { day: 30, low: 190, high: 190, available: null });
  assert.strictEqual(pvp.items.find(i => i.sourceKey === '111').unitPriceCopper, 500); // prev-only kept
  assert.ok(out.realms.some(r => r.name === 'Solo'));       // prev-only realm kept
  assert.ok(out.realms.some(r => r.name === 'Otro'));       // next-only realm added
  assert.strictEqual(out.importedAt, '2026-01-02T00:00:00Z');
  assert.deepStrictEqual(out.warnings, ['aviso nuevo']);
});

test('mergeSnapshots does not mutate its inputs', () => {
  const prevBefore = JSON.stringify(prevSnap);
  const nextBefore = JSON.stringify(nextSnap);
  H.mergeSnapshots(prevSnap, nextSnap);
  assert.strictEqual(JSON.stringify(prevSnap), prevBefore);
  assert.strictEqual(JSON.stringify(nextSnap), nextBefore);
});

test('mergeSnapshots keeps variants separate from the base itemId', () => {
  const prev = snap('a', [realm('PvP', [
    item('6469', 100, 5, hist([5, 100])),
    item('6469:variant', 200, 5, hist([5, 200])),
  ])]);
  const next = snap('b', [realm('PvP', [
    item('6469:variant', 180, 6, hist([6, 180])),
  ])]);
  const out = H.mergeSnapshots(prev, next);
  const pvp = out.realms[0];
  assert.strictEqual(pvp.items.length, 2);
  const base = pvp.items.find(i => i.sourceKey === '6469');
  const variant = pvp.items.find(i => i.sourceKey === '6469:variant');
  assert.deepStrictEqual(base.history.map(e => e.day), [5]);
  assert.deepStrictEqual(variant.history.map(e => e.day), [5, 6]);
});

test('mergeSnapshots tolerates null/empty inputs', () => {
  assert.strictEqual(H.mergeSnapshots(null, nextSnap), nextSnap);
  assert.strictEqual(H.mergeSnapshots(prevSnap, null), prevSnap);
  const empty = H.mergeSnapshots(prevSnap, snap('c', []));
  assert.strictEqual(empty.realms.length, 2);
});

/* ------------------------------------------------------------- stats */

test('priceStats returns nulls for empty history', () => {
  const st = H.priceStats(item('1', 100, null, []));
  assert.deepStrictEqual(st, { minLow: null, medianaLow: null, avgLow: null, tendencia: null, diasMuestra: 0 });
});

test('priceStats computes min/median/avg over daily lows', () => {
  // lows: 100, 200, 300, 400 → min 100, mediana 250, avg 250
  const st = H.priceStats(item('1', 400, 40, hist([10, 100], [20, 200], [30, 300], [40, 400])));
  assert.strictEqual(st.minLow, 100);
  assert.strictEqual(st.medianaLow, 250);
  assert.strictEqual(st.avgLow, 250);
  assert.strictEqual(st.diasMuestra, 4);
  assert.strictEqual(st.tendencia, 'sube'); // newer half median 350 > older 150
});

test('priceStats odd count and stable/down trends', () => {
  const st = H.priceStats(item('1', 100, 5, hist([1, 100], [2, 100], [3, 100], [4, 100], [5, 100])));
  assert.strictEqual(st.medianaLow, 100);
  assert.strictEqual(st.tendencia, 'estable');
  const down = H.priceStats(item('1', 50, 4, hist([1, 400], [2, 300], [3, 200], [4, 100])));
  assert.strictEqual(down.tendencia, 'baja');
});

test('priceStats reports sin-datos below 4 sample days', () => {
  const st = H.priceStats(item('1', 100, 3, hist([1, 500], [2, 400], [3, 300])));
  assert.strictEqual(st.diasMuestra, 3);
  assert.strictEqual(st.tendencia, 'sin-datos');
  assert.strictEqual(st.minLow, 300);
  assert.strictEqual(st.medianaLow, 400);
});

test('priceStats accepts a bare history array and row arrays', () => {
  const st = H.priceStats(hist([1, 100], [2, 200], [3, 300], [4, 400]));
  assert.strictEqual(st.diasMuestra, 4);
  const rows = [[1, 100], [2, 200], [3, 300], [4, 400]];
  assert.strictEqual(H.priceStats(rows).diasMuestra, 4);
});

/* ------------------------------------------------- trim snapshot window */

test('trimSnapshotHistory keeps the last N calendar days per item', () => {
  const s = snap('t', [realm('PvP', [
    item('a', 1, 40, hist([10, 10], [20, 20], [30, 30], [38, 38], [39, 39], [40, 40])),
    item('b', 1, 12, hist([10, 10], [12, 12])),
  ])]);
  const out = H.trimSnapshotHistory(s, 5);
  const a = out.realms[0].items.find(i => i.sourceKey === 'a');
  // lastDay=40, keep day>=36 → days 38,39,40
  assert.deepStrictEqual(a.history.map(e => e.day), [38, 39, 40]);
  const b = out.realms[0].items.find(i => i.sourceKey === 'b');
  assert.strictEqual(b.history.length, 2); // span 2 < 5 → untouched
});

test('trimSnapshotHistory returns the same object when nothing is trimmed', () => {
  const s = snap('t', [realm('PvP', [item('a', 1, 3, hist([1, 1], [2, 2], [3, 3]))])]);
  assert.strictEqual(H.trimSnapshotHistory(s, 5), s);
  // keepDays=1 is the degenerate boundary: only the newest calendar day stays.
  const one = H.trimSnapshotHistory(s, 1);
  assert.notStrictEqual(one, s);
  assert.deepStrictEqual(one.realms[0].items[0].history.map(e => e.day), [3]);
});

/* ------------------------------------------------------------- store */

const storeSnap = snap('t0', [
  realm('PvP', [
    item('6469', 1000, 30, hist([10, 100, 120, 8], [20, 200], [30, 300])),
    item('111', 500, 25, hist([15, 50])),
    item('empty', 5, null, []),
  ]),
]);

test('storeFromSnapshot encodes compact rows and skips empty histories', () => {
  const st = H.storeFromSnapshot(storeSnap);
  assert.ok(H.validStore(st));
  const rows = st.realms.PvP.items['6469'];
  assert.deepStrictEqual(rows, [[10, 100, 120, 8], [20, 200], [30, 300]]);
  assert.ok(!('empty' in st.realms.PvP.items));
});

test('storeMerge accumulates across imports preferring the newest per day', () => {
  const s1 = H.storeFromSnapshot(storeSnap);
  const newer = snap('t1', [realm('PvP', [item('6469', 900, 35, hist([20, 210], [35, 250]))])]);
  const merged = H.storeMerge(s1, newer);
  assert.ok(H.validStore(merged));
  assert.deepStrictEqual(merged.realms.PvP.items['6469'], [[10, 100, 120, 8], [20, 210], [30, 300], [35, 250]]);
  // store-only items and realms survive untouched
  assert.deepStrictEqual(merged.realms.PvP.items['111'], [[15, 50]]);
});

test('storeMerge does not mutate inputs and handles null store', () => {
  const s1 = H.storeFromSnapshot(storeSnap);
  const before = JSON.stringify(s1);
  const out = H.storeMerge(s1, snap('t', [realm('PvP', [item('6469', 1, 1, hist([1, 1]))])]));
  assert.strictEqual(JSON.stringify(s1), before);
  assert.deepStrictEqual(H.storeMerge(null, storeSnap).realms.PvP.items['6469'].length, 3);
  assert.deepStrictEqual(H.storeMerge(undefined, null), { v: 1, realms: {} });
});

test('applyStore merges store series into the snapshot view', () => {
  const st = H.storeFromSnapshot(storeSnap);
  const shallow = snap('t2', [realm('PvP', [
    item('6469', 900, 35, hist([20, 210], [35, 250])), // latest import only has 2 days
    item('999', 10, 35, hist([35, 1])),               // no store history
  ])]);
  const view = H.applyStore(shallow, st);
  const it = view.realms[0].items.find(i => i.sourceKey === '6469');
  assert.deepStrictEqual(it.history.map(e => e.day), [10, 20, 30, 35]);
  assert.strictEqual(it.unitPriceCopper, 900); // scalars untouched
  const nw = view.realms[0].items.find(i => i.sourceKey === '999');
  assert.strictEqual(nw.history.length, 1);
  // store-only item '111' does NOT appear (no current price)
  assert.ok(!view.realms[0].items.some(i => i.sourceKey === '111'));
  // inputs untouched
  assert.strictEqual(shallow.realms[0].items[0].history.length, 2);
});

test('applyStore returns snapshot unchanged when store is missing/invalid/empty-add', () => {
  const shallow = snap('t', [realm('PvP', [item('a', 1, 1, hist([1, 1]))])]);
  assert.strictEqual(H.applyStore(shallow, null), shallow);
  assert.strictEqual(H.applyStore(shallow, { v: 2, realms: {} }), shallow);
  const st = H.storeFromSnapshot(shallow);
  assert.strictEqual(H.applyStore(shallow, st), shallow); // identical → same ref
});

test('store round-trip: snapshot -> store -> applyStore reproduces history', () => {
  const st = H.storeFromSnapshot(storeSnap);
  const restored = snap('t', storeSnap.realms.map(r => realm(r.name, r.items.map(i => ({ ...i, history: [] })))));
  const view = H.applyStore(restored, st);
  const it = view.realms[0].items.find(i => i.sourceKey === '6469');
  assert.deepStrictEqual(it.history, storeSnap.realms[0].items[0].history);
});

/* -------------------------------------------------------- validStore */

test('validStore accepts good stores and rejects malformed ones', () => {
  assert.ok(H.validStore(H.emptyStore()));
  assert.ok(H.validStore(H.storeFromSnapshot(storeSnap)));
  const bad = [
    null, {}, { v: 2, realms: {} }, { v: 1 }, { v: 1, realms: [] },
    { v: 1, realms: { R: { items: { k: 'x' } } } },
    { v: 1, realms: { R: { items: { k: [[1]] } } } },                    // row too short
    { v: 1, realms: { R: { items: { k: [[1, 0]] } } } },                 // low <= 0
    { v: 1, realms: { R: { items: { k: [[1, 5, -1]] } } } },             // negative avail
    { v: 1, realms: { R: { items: { k: [[1, 5, 4, 9]] } } } },           // high < low
    { v: 1, realms: { R: { items: { k: [[1, 5], [1, 6]] } } } },         // dup day
    { v: 1, realms: { R: { items: { k: [[5, 1], [3, 2]] } } } },         // unsorted days
    { v: 1, realms: { R: { items: {}, extra: 1 } } },                    // extra realm key
    { v: 1, realms: { '': { items: {} } } },                             // empty realm name
  ];
  const results = bad.map(s => H.validStore(s));
  assert.deepStrictEqual(results, new Array(bad.length).fill(false));
  // len3 [d,l,a] is the canonical high==low + available form → valid.
  assert.ok(H.validStore({ v: 1, realms: { R: { items: { k: [[1, 5, 3]] } } } }));
  assert.ok(H.validStore({ v: 1, realms: { R: { items: { k: [[1, 5, 4]] } } } }));   // avail=4, still len3
  assert.ok(H.validStore({ v: 1, realms: { R: { items: { k: [[1, 5, 7, null]] } } } })); // len4 avail null
});

test('validStore boundary: max realms/items/entries respected', () => {
  const manyRealms = { v: 1, realms: {} };
  for (let i = 0; i < 101; i++) manyRealms.realms['r' + i] = { items: {} };
  assert.strictEqual(H.validStore(manyRealms), false);
  const oneRealm = { v: 1, realms: { R: { items: {} } } };
  for (let i = 0; i < 100001; i++) oneRealm.realms.R.items['k' + i] = [[1, 1]];
  assert.strictEqual(H.validStore(oneRealm), false);
});

/* ------------------------------------------------------------ fitStore */

function bigStore(days, itemsPerDay) {
  // Synthetic store: `days` consecutive days, `itemsPerDay` items each with a
  // full-history row per day (worst case density).
  const st = { v: 1, realms: { R: { items: {} } } };
  for (let i = 0; i < itemsPerDay; i++) {
    const rows = [];
    for (let d = 0; d < days; d++) rows.push([1000 + d, 100 + (i % 50), 100 + (i % 50), i % 30]);
    st.realms.R.items['item' + i] = rows;
  }
  return st;
}

test('fitStore returns the same store when it already fits', () => {
  const st = H.storeFromSnapshot(storeSnap);
  assert.strictEqual(H.fitStore(st, 1024 * 1024), st);
});

test('fitStore drops oldest days first and keeps the newest', () => {
  const st = bigStore(60, 200); // 12k entries ~ maybe over a small budget
  const full = H.byteSize(st);
  const budget = Math.floor(full * 0.5);
  const out = H.fitStore(st, budget);
  assert.ok(H.byteSize(out) <= budget, `size ${H.byteSize(out)} > ${budget}`);
  assert.ok(H.validStore(out));
  // Every kept item's rows are a suffix of the original (oldest days dropped).
  const srcRows = st.realms.R.items.item0;
  const keptRows = out.realms.R.items.item0;
  const keptDays = keptRows.map(r => r[0]);
  const srcDays = srcRows.map(r => r[0]);
  assert.deepStrictEqual(keptDays, srcDays.slice(srcDays.length - keptDays.length));
  // The newest day must survive.
  assert.strictEqual(keptDays[keptDays.length - 1], srcDays[srcDays.length - 1]);
  // Deterministic: same input → same output.
  assert.strictEqual(H.byteSize(H.fitStore(st, budget)), H.byteSize(out));
});

test('fitStore never emits unsorted or duplicated days', () => {
  const st = bigStore(80, 100);
  const out = H.fitStore(st, 300 * 1024);
  assert.ok(H.validStore(out));
  for (const k of Object.keys(out.realms.R.items)) {
    const rows = out.realms.R.items[k];
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i][0] > rows[i - 1][0]);
  }
});

test('fitStore extreme budget still yields a valid (possibly tiny) store', () => {
  const st = bigStore(30, 50);
  const out = H.fitStore(st, 2048);
  assert.ok(H.validStore(out));
  assert.ok(H.byteSize(out) <= 2048 || H.byteSize(out) < H.byteSize(st));
});

/* ------------------------------------------- compactness vs object form */

test('compact rows are substantially smaller than object history', () => {
  const days = 40;
  const entries = [];
  for (let d = 0; d < days; d++) entries.push({ day: 2000 + d, low: 1000 + d, high: 1000 + d, available: 5 });
  const objBytes = JSON.stringify(entries).length;
  const rowBytes = JSON.stringify(entries.map(H.entryToRow)).length;
  assert.ok(rowBytes < objBytes * 0.5, `rows ${rowBytes} vs objects ${objBytes}`);
});

/* ------------------------------------------- real fixture (redacted only) */

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

test('real Auctionator.lua: store compaction keeps data valid (redacted metrics)', async (t) => {
  const file = findRealFixture();
  if (!file) { t.skip('no real Auctionator.lua fixture found'); return; }
  const buf = fs.readFileSync(file);
  const snap = parseAuctionator(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  const totalItems = snap.realms.reduce((n, r) => n + r.items.length, 0);
  const days = new Set();
  let histEntries = 0;
  for (const r of snap.realms) for (const i of r.items) for (const h of i.history) { days.add(h.day); histEntries++; }
  const st = H.storeFromSnapshot(snap);
  assert.ok(H.validStore(st));
  const storeBytes = H.byteSize(st);
  const view = H.applyStore(H.trimSnapshotHistory(snap, 5), st);
  assert.strictEqual(view.realms.reduce((n, r) => n + r.items.length, 0), totalItems);
  const sample = view.realms[0].items.find(i => i.history.length > 1) || view.realms[0].items[0];
  const stt = H.priceStats(sample);
  assert.ok(stt.diasMuestra >= 0);
  t.diagnostic(`real fixture: realms=${snap.realms.length} items=${totalItems} days=${days.size} histEntries=${histEntries} storeBytes=${storeBytes} sampleStats=${JSON.stringify(stt)}`);
});
