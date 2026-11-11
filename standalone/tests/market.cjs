'use strict';

/*
 * Tests for HunterMarket (market.js) — a safe, dependency-free local parser for
 * the Auctionator SavedVariables file of the WoW "Forever" client.
 *
 * Run:  node tests/market.cjs
 *
 * Nothing here executes Lua. The real SavedVariables fixture (if present) is
 * read in place and only REDACTED METRICS are reported (realm count, item
 * count, byte count). No account names, no private paths, no copied files.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const mod = require('../market.js');
const { parseAuctionator, workerSource, MAX_BYTES } = mod;

/* ------------------------------------------------------------------ helpers */

// ASCII -> bytes
function A(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}
function cat(...chunks) {
  let n = 0;
  for (const c of chunks) n += c.length;
  const o = new Uint8Array(n);
  let p = 0;
  for (const c of chunks) {
    o.set(c, p);
    p += c.length;
  }
  return o;
}
// CBOR head for a given major type + length
function ha(major, len) {
  if (len < 24) return Uint8Array.from([(major << 5) | len]);
  if (len < 256) return Uint8Array.from([(major << 5) | 24, len]);
  if (len < 65536) return Uint8Array.from([(major << 5) | 25, (len >> 8) & 255, len & 255]);
  return Uint8Array.from([
    (major << 5) | 26,
    (len >>> 24) & 255,
    (len >>> 16) & 255,
    (len >>> 8) & 255,
    len & 255,
  ]);
}
const ci = (n) => (n >= 0 ? ha(0, n) : ha(1, -1 - n));
const cbs = (u8) => cat(ha(2, u8.length), u8); // byte string (what C_EncodingUtil emits)
const cts = (s) => cat(ha(3, A(s).length), A(s)); // text string
const carr = (items) => cat(ha(4, items.length), ...items);
const cmap = (pairs) => cat(ha(5, pairs.length), ...pairs.flat());

// Encode a raw byte blob as a Lua short string literal the way WoW writes it.
function luaStr(u8) {
  let o = '"';
  for (let i = 0; i < u8.length; i++) {
    const b = u8[i];
    if (b === 0x22) o += '\\"';
    else if (b === 0x5c) o += '\\\\';
    else if (b === 0x0a) o += '\\n';
    else if (b === 0x0d) o += '\\r';
    else if (b >= 32 && b < 127) o += String.fromCharCode(b);
    else o += '\\' + String(b).padStart(3, '0');
  }
  return o + '"';
}
function sv(...lines) {
  return A(lines.join('\n') + '\n');
}
// build a CBOR realm blob: version + a set of [key, itemBytes] pairs
function cborRealm(version, items) {
  return cmap([[cbs(A('version')), ci(version)], ...items]);
}
// build an item map from a plain description
function cborItem(spec) {
  const pairs = [];
  for (const k of Object.keys(spec)) {
    const v = spec[k];
    if (k === 'm') pairs.push([cbs(A('m')), ci(v)]);
    else if (k === 'emptyArr') pairs.push([cbs(A(v)), carr([])]);
    else {
      // v is a map of day -> number
      const days = Object.keys(v).map((d) => [cbs(A(d)), ci(v[d])]);
      pairs.push([cbs(A(k)), cmap(days)]);
    }
  }
  return cmap(pairs);
}

/* ------------------------------------------------------------- contract/UMD */

test('UMD surface exposes parseAuctionator, workerSource, MAX_BYTES', () => {
  assert.strictEqual(typeof parseAuctionator, 'function');
  assert.strictEqual(typeof workerSource, 'string');
  assert.strictEqual(MAX_BYTES, 8 * 1024 * 1024);
  assert.ok(workerSource.length > 100);
});

/* --------------------------------------------------------- synthetic: Lua table */

test('parses a Lua-table realm: itemId, unitPriceCopper, observedDay, history', () => {
  const db =
    '{ ["__dbversion"] = 8, ["TestRealm"] = { version = 2, ' +
    '["15115"] = { m = 600, h = { ["2504"] = 600, ["2505"] = 700 }, ' +
    'l = { ["2505"] = 500 }, a = { ["2504"] = 31, ["2505"] = 10 } } } }';
  const r = parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = ' + db));

  assert.strictEqual(r.schemaVersion, 1);
  assert.strictEqual(r.sourceVersion, 8);
  assert.ok(typeof r.importedAt === 'string' && !Number.isNaN(Date.parse(r.importedAt)));
  assert.ok(Array.isArray(r.warnings));

  assert.strictEqual(r.realms.length, 1);
  assert.strictEqual(r.realms[0].name, 'TestRealm');
  const items = r.realms[0].items;
  assert.strictEqual(items.length, 1);

  const it = items[0];
  assert.strictEqual(it.sourceKey, '15115');
  assert.strictEqual(it.itemId, 15115);
  assert.strictEqual(it.unitPriceCopper, 600);
  assert.strictEqual(it.observedDay, 2505);

  assert.strictEqual(it.history.length, 2);
  // ascending order
  assert.deepStrictEqual(it.history[0], { day: 2504, low: 600, high: 600, available: 31 });
  // low comes from l when it differs from h
  assert.deepStrictEqual(it.history[1], { day: 2505, low: 500, high: 700, available: 10 });
  assert.strictEqual(it.history[it.history.length - 1].day, it.observedDay);
});

test('variant keys are preserved verbatim and get itemId null (non-simple)', () => {
  const db =
    '{ ["__dbversion"] = 8, ["R"] = { version = 2, ' +
    '["gr:11508:of_the_bear"] = { m = 1234, h = { ["2504"] = 1234 }, a = { ["2504"] = 2 } }, ' +
    '["g:11508:60"] = { m = 55, h = { ["2504"] = 55 } }, ' +
    '["p:12345"] = { m = 9, h = { ["2504"] = 9 } } } }';
  const r = parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = ' + db));
  const byKey = new Map(r.realms[0].items.map((i) => [i.sourceKey, i]));
  assert.strictEqual(byKey.get('gr:11508:of_the_bear').itemId, null);
  assert.strictEqual(byKey.get('g:11508:60').itemId, null);
  assert.strictEqual(byKey.get('p:12345').itemId, null);
  assert.strictEqual(byKey.get('gr:11508:of_the_bear').unitPriceCopper, 1234);
});

test('observedDay comes from h, never from a (a may have a later day)', () => {
  const db =
    '{ ["__dbversion"] = 8, ["R"] = { version = 2, ' +
    '["900"] = { m = 100, h = { ["2504"] = 600 }, a = { ["2504"] = 31, ["2509"] = 5 } } } }';
  const r = parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = ' + db));
  const it = r.realms[0].items[0];
  assert.strictEqual(it.observedDay, 2504);
  assert.strictEqual(it.history.length, 1);
  assert.strictEqual(it.history[0].day, 2504);
  assert.strictEqual(it.history[0].available, 31);
});

test('l is used only when present/valid; available is null when a is absent; 0 allowed', () => {
  const db =
    '{ ["__dbversion"] = 8, ["R"] = { version = 2, ' +
    '["1"] = { m = 5, h = { ["10"] = 100, ["11"] = 200 }, l = { ["10"] = 0 } }, ' +
    '["2"] = { m = 5, h = { ["10"] = 100 }, a = { ["10"] = 0 } } } }';
  const r = parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = ' + db));
  const byKey = new Map(r.realms[0].items.map((i) => [i.sourceKey, i]));
  // l = 0 is not a valid price -> fall back to high
  assert.strictEqual(byKey.get('1').history[0].low, 100);
  assert.strictEqual(byKey.get('1').history[1].low, 200);
  assert.strictEqual(byKey.get('1').history[0].available, null);
  // available 0 is a valid quantity
  assert.strictEqual(byKey.get('2').history[0].available, 0);
});

test('numeric day keys and an items map with empty h (observedDay null, history [])', () => {
  const db =
    '{ ["__dbversion"] = 8, ["R"] = { version = 2, ' +
    '["7"] = { m = 42, h = { [300] = 42, [301] = 43 } }, ' +
    '["8"] = { m = 10, h = {} } } }';
  const r = parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = ' + db));
  const byKey = new Map(r.realms[0].items.map((i) => [i.sourceKey, i]));
  assert.deepStrictEqual(byKey.get('7').history, [
    { day: 300, low: 42, high: 42, available: null },
    { day: 301, low: 43, high: 43, available: null },
  ]);
  assert.strictEqual(byKey.get('7').observedDay, 301);
  assert.strictEqual(byKey.get('8').observedDay, null);
  assert.deepStrictEqual(byKey.get('8').history, []);
});

/* ------------------------------------------------------------- synthetic: CBOR */

test('parses a CBOR-blob realm (byte-string keys) identically', () => {
  const item = cborItem({
    a: { 2504: 31 },
    l: 'emptyArr',
    m: 600,
    h: { 2504: 600 },
  });
  const realm = cborRealm(2, [[cbs(A('15115')), item]]);
  const buf = sv('AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8, ["PvP"] = ' + luaStr(realm) + ' }');
  const r = parseAuctionator(buf);
  assert.strictEqual(r.realms.length, 1);
  assert.strictEqual(r.realms[0].name, 'PvP');
  const it = r.realms[0].items[0];
  assert.strictEqual(it.sourceKey, '15115');
  assert.strictEqual(it.itemId, 15115);
  assert.strictEqual(it.unitPriceCopper, 600);
  assert.strictEqual(it.observedDay, 2504);
  assert.deepStrictEqual(it.history, [{ day: 2504, low: 600, high: 600, available: 31 }]);
});

test('multiple realms, mixing Lua table and CBOR blob, and ignoring other globals', () => {
  const realmA = cborRealm(2, [[cbs(A('100')), cborItem({ m: 7, h: { 5: 7 }, a: { 5: 1 } })]]);
  const db =
    '{ ["__dbversion"] = 8, ["Blob"] = ' + luaStr(realmA) + ', ' +
    '["Table"] = { version = 2, ["200"] = { m = 8, h = { [6] = 8 } } } }';
  const buf = sv(
    'AUCTIONATOR_CONFIG = { ["debug"] = false }',
    'AUCTIONATOR_PRICE_DATABASE = ' + db,
    'AUCTIONATOR_SHOPPING_LISTS = {}'
  );
  const r = parseAuctionator(buf);
  const names = r.realms.map((x) => x.name).sort();
  assert.deepStrictEqual(names, ['Blob', 'Table']);
});

test('missing or nil price database yields no realms and a warning', () => {
  const r1 = parseAuctionator(sv('AUCTIONATOR_CONFIG = { ["debug"] = false }'));
  assert.deepStrictEqual(r1.realms, []);
  assert.ok(r1.warnings.length >= 1);

  const r2 = parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = nil'));
  assert.deepStrictEqual(r2.realms, []);
});

/* --------------------------------------------------------- garbage tolerance */

test('item without a valid price is skipped with a warning, others survive', () => {
  const db =
    '{ ["__dbversion"] = 8, ["R"] = { version = 2, ' +
    '["1"] = { h = { ["10"] = 100 } }, ' + // no m
    '["2"] = { m = 0, h = { ["10"] = 100 } }, ' + // price not > 0
    '["3"] = { m = 50, h = { ["10"] = 100 } } } }';
  const r = parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = ' + db));
  const keys = r.realms[0].items.map((i) => i.sourceKey);
  assert.deepStrictEqual(keys, ['3']);
  assert.ok(r.warnings.length >= 2);
});

test('realm with an unsupported version is skipped with a warning', () => {
  const db =
    '{ ["__dbversion"] = 8, ["Old"] = { version = 3, ["1"] = { m = 5, h = {} } }, ' +
    '["New"] = { version = 2, ["1"] = { m = 5, h = { ["1"] = 5 } } } }';
  const r = parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = ' + db));
  assert.deepStrictEqual(r.realms.map((x) => x.name), ['New']);
  assert.ok(r.warnings.length >= 1);
});

/* ------------------------------------------------------------------ rejections */

function expectThrow(fn, re) {
  assert.throws(fn, (e) => e instanceof Error && (re ? re.test(e.message) : true));
}

test('rejects unknown __dbversion', () => {
  expectThrow(
    () => parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 7 }')),
    /version/i
  );
});

test('rejects duplicate keys', () => {
  expectThrow(
    () =>
      parseAuctionator(
        sv('AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8, ["R"] = { version = 2, ["1"] = { m = 5 }, ["1"] = { m = 6 } } }')
      ),
    /duplicate/i
  );
});

test('rejects prototype-poisoning keys without leaking the key text', () => {
  let thrown;
  try {
    parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8, ["__proto__"] = { version = 2 } }'));
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown instanceof Error);
  assert.ok(!/__proto__/.test(thrown.message), 'message must not echo the raw key');
});

test('rejects Lua expressions in data position', () => {
  expectThrow(() =>
    parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8, ["R"] = GetData() }'))
  );
  expectThrow(() =>
    parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 1 + 7 }'))
  );
});

test('rejects truncated CBOR blob', () => {
  // map declaring 5 entries but with no body
  const truncated = Uint8Array.from([0xa5]);
  expectThrow(() =>
    parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8, ["R"] = ' + luaStr(truncated) + ' }'))
  );
});

test('rejects CBOR nesting deeper than 32', () => {
  let blob = carr([]);
  for (let i = 0; i < 40; i++) blob = carr([blob]);
  expectThrow(() =>
    parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8, ["R"] = ' + luaStr(blob) + ' }'))
  );
});

test('rejects CBOR claim beyond entry budget', () => {
  // a map header declaring 250001 entries (no body needed to trip the budget)
  const big = cat(ha(5, 250001));
  expectThrow(() =>
    parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8, ["R"] = ' + luaStr(big) + ' }'))
  );
});

test('rejects input larger than MAX_BYTES', () => {
  const huge = new Uint8Array(MAX_BYTES + 1);
  expectThrow(() => parseAuctionator(huge));
});

test('error messages carry no raw payload (no newlines, bounded length)', () => {
  let thrown;
  try {
    parseAuctionator(sv('AUCTIONATOR_PRICE_DATABASE = { ["__dbversion"] = 8, ["R"] = GetData() }'));
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown && typeof thrown.message === 'string');
  assert.ok(!/[\n\r]/.test(thrown.message));
  assert.ok(thrown.message.length < 200);
});

/* --------------------------------------------------------------------- worker */

function runWorker(payload) {
  let posted = null;
  const fakeSelf = { postMessage: (m) => (posted = m) };
  // eslint-disable-next-line no-new-func
  const start = new Function('self', workerSource);
  start(fakeSelf);
  assert.strictEqual(typeof fakeSelf.onmessage, 'function');
  fakeSelf.onmessage({ data: payload });
  return posted;
}

test('workerSource is self-contained', () => {
  assert.ok(!/importScripts/.test(workerSource));
  assert.ok(!/\bfetch\s*\(/.test(workerSource));
  assert.ok(!/XMLHttpRequest/.test(workerSource));
  assert.ok(!/\brequire\s*\(/.test(workerSource));
  assert.ok(!/loadFile|readFileSync/.test(workerSource));
});

test('worker posts {ok:true, snapshot} using the same parser', () => {
  const db = '{ ["__dbversion"] = 8, ["R"] = { version = 2, ["1"] = { m = 5, h = { ["2"] = 5 } } } }';
  const bytes = sv('AUCTIONATOR_PRICE_DATABASE = ' + db);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const out = runWorker(ab);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.snapshot.schemaVersion, 1);
  assert.strictEqual(out.snapshot.realms[0].items[0].sourceKey, '1');
});

test('worker posts {ok:false, error} with a safe message on failure', () => {
  const out = runWorker(new Uint8Array(MAX_BYTES + 8).buffer);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(typeof out.error, 'string');
  assert.ok(!/[\n\r]/.test(out.error));
});

/* --------------------------------------------------------------- real fixture */

test('real SavedVariables fixture (in place, redacted metrics only)', () => {
  const roots = [
    path.join(
      process.env.HOME || '',
      'Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_forever_/WTF'
    ),
  ];
  let target = null;
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length && !target) {
      const dir = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (e.name === 'Auctionator.lua' && fs.statSync(full).size > 1000) target = full;
      }
    }
  }
  if (!target) {
    console.log('REAL FIXTURE: not present — skipped');
    return;
  }

  const bytes = new Uint8Array(fs.readFileSync(target));
  const r = parseAuctionator(bytes);

  let items = 0;
  let withHistory = 0;
  let maxDay = 0;
  let minDay = Infinity;
  for (const realm of r.realms) {
    assert.ok(realm.name.length > 0);
    for (const it of realm.items) {
      items++;
      if (!(Number.isSafeInteger(it.unitPriceCopper) && it.unitPriceCopper > 0)) {
        throw new Error('real item has invalid unitPriceCopper');
      }
      if (it.itemId !== null && !(Number.isSafeInteger(it.itemId) && it.itemId > 0)) {
        throw new Error('real item has invalid itemId');
      }
      if (it.observedDay !== null) {
        assert.ok(it.observedDay >= 0 && it.observedDay <= 100000);
        if (it.observedDay > maxDay) maxDay = it.observedDay;
        if (it.observedDay < minDay) minDay = it.observedDay;
      }
      if (it.history.length) {
        withHistory++;
        let prev = -1;
        for (const h of it.history) {
          assert.ok(h.day >= prev, 'history must be ascending');
          prev = h.day;
          assert.ok(h.high > 0 && h.low > 0 && h.low <= h.high);
          assert.ok(h.available === null || (Number.isSafeInteger(h.available) && h.available >= 0));
        }
        assert.strictEqual(it.history[it.history.length - 1].day, it.observedDay);
      }
    }
  }

  assert.ok(r.realms.length >= 1, 'expected at least one realm');
  assert.ok(items > 0, 'expected at least one item');
  assert.strictEqual(r.sourceVersion, 8);

  // Redacted metrics only: counts + byte size. No realm names, no paths.
  console.log(
    `REAL FIXTURE: realms=${r.realms.length} items=${items} bytes=${bytes.length} ` +
      `withHistory=${withHistory} dayRange=${minDay}..${maxDay} warnings=${r.warnings.length}`
  );
});
