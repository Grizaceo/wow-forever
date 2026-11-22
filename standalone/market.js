/*
 * market.js — HunterMarket
 *
 * A safe, dependency-free local parser for the Auctionator SavedVariables file
 * of the WoW "Forever" client (game type `camelot`, legacy AH).
 *
 * It reads the whole SavedVariables buffer as DATA (never executes Lua) and
 * extracts the price database. Item history is decoded from either a Lua table
 * (as written for the current realm at logout) or a CBOR blob string (as kept
 * for other realms), matching Auctionator 3.x / `__dbversion` 8, realm
 * `version` 2. See Source/Variables/Main.lua and Source/Database/Mixin.lua.
 *
 * Public surface (UMD — `window.HunterMarket` and `module.exports`):
 *   parseAuctionator(bytes: Uint8Array) -> snapshot
 *   workerSource : string  (self-contained Blob Worker source)
 *   MAX_BYTES    : number  (8388608)
 *
 * snapshot = {
 *   schemaVersion: 1,
 *   importedAt:    ISO string,
 *   sourceVersion: 8,
 *   realms: [ { name: string,
 *               items: [ { sourceKey: string,
 *                          itemId: number|null,      // only for a plain decimal key
 *                          unitPriceCopper: integer, // item `m` (last seen minimum price)
 *                          observedDay: integer|null,// max day present in `h`
 *                          history: [ { day, low, high, available } ] // ascending day
 *                        } ] } ],
 *   warnings: [ string ]  // generic + byte offset, never raw file content
 * }
 *
 * Field semantics (from Source/Database/Mixin.lua):
 *   h[day] = highest "low price" seen that day  -> history.high
 *   l[day] = lowest "low price" (saved only when it differs from h) -> history.low
 *            history.low = l[day] ?? h[day]
 *   a[day] = highest AVAILABLE quantity that day (supply, not sales) -> history.available
 *   day    = days since 2020-01-01 UTC (Auctionator.Constants.SCAN_DAY_0)
 *
 * Safety: depth <= 32, total entries <= 250000, input <= MAX_BYTES. Overflow,
 * duplicate keys, prototype keys, Lua expressions, truncated CBOR and unknown
 * versions are rejected (parseAuctionator throws). Malformed item payloads are
 * never guessed: the item is skipped with a specific warning.
 */
(function () {
  'use strict';

  function HunterMarketFactory() {
    'use strict';

    var MAX_BYTES = 8 * 1024 * 1024;
    var DEPTH_LIMIT = 32;
    // Un diario real del puente guarda ~75.000 entradas por día (7.368 ítems ×
    // 4 campos + metadatos) y el addon retiene 14 días: ~1.050.000 entradas.
    // Con el techo anterior (250.000) el archivo dejaba de leerse en la cuarta
    // jornada y todo el puente quedaba sin importar. Sigue siendo un guardrail:
    // MAX_BYTES (8 MiB) acota antes el trabajo real del parser.
    var ENTRIES_LIMIT = 1200000;
    var DAY_MIN = 0;
    var DAY_MAX = 100000;
    var WARN_CAP = 1000;
    var MAX_SAFE = 9007199254740991;

    /* ------------------------------------------------------------ failures */
    function fail(msg) {
      throw new Error(msg);
    }
    function failAt(msg, pos) {
      throw new Error(msg + ' (offset ' + (pos | 0) + ')');
    }

    /* -------------------------------------------------------------- values */
    function LuaStr(raw, pos) {
      this.raw = raw;
      this.pos = pos;
    }
    function LuaTable(pos) {
      this.pos = pos;
      this.entries = [];
      this.index = new Map();
    }
    LuaTable.prototype.set = function (key, val, pos) {
      var c = canonKey(key, pos);
      if (this.index.has(c)) failAt('duplicate key', pos);
      this.index.set(c, val);
      this.entries.push([key, val]);
    };
    LuaTable.prototype.get = function (name) {
      var v = this.index.get('s:' + name);
      return v === undefined ? undefined : v;
    };

    function guardKeyText(text, pos) {
      if (text === '__proto__' || text === 'prototype' || text === 'constructor') {
        failAt('invalid key', pos);
      }
    }
    function canonKey(k, pos) {
      if (k instanceof LuaStr) {
        var s = utf8(k.raw);
        guardKeyText(s, k.pos);
        return 's:' + s;
      }
      if (typeof k === 'number') return '#' + k;
      if (typeof k === 'boolean') return 'b:' + k;
      if (k === null) return 'nil:';
      failAt('unsupported key', pos);
    }

    /* ----------------------------------------------------------- encoding */
    function utf8(bytes) {
      var out = '';
      var i = 0;
      var n = bytes.length;
      while (i < n) {
        var b0 = bytes[i++];
        if (b0 < 0x80) {
          out += String.fromCharCode(b0);
          continue;
        }
        var cp;
        var extra;
        if (b0 >= 0xc2 && b0 <= 0xdf) {
          cp = b0 & 0x1f;
          extra = 1;
        } else if (b0 >= 0xe0 && b0 <= 0xef) {
          cp = b0 & 0x0f;
          extra = 2;
        } else if (b0 >= 0xf0 && b0 <= 0xf4) {
          cp = b0 & 0x07;
          extra = 3;
        } else {
          out += '\ufffd';
          continue;
        }
        var ok = true;
        for (var k = 0; k < extra; k++) {
          if (i >= n) {
            ok = false;
            break;
          }
          var bx = bytes[i];
          if ((bx & 0xc0) !== 0x80) {
            ok = false;
            break;
          }
          cp = (cp << 6) | (bx & 0x3f);
          i++;
        }
        if (!ok) {
          out += '\ufffd';
          continue;
        }
        if (cp > 0xffff) {
          cp -= 0x10000;
          out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        } else {
          out += String.fromCharCode(cp);
        }
      }
      return out;
    }
    function utf8bytes(s) {
      var out = [];
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      return Uint8Array.from(out);
    }
    function halfToNum(h) {
      var sign = h & 0x8000 ? -1 : 1;
      var exp = (h >> 10) & 0x1f;
      var frac = h & 0x3ff;
      if (exp === 0) return sign * Math.pow(2, -14) * (frac / 1024);
      if (exp === 31) return frac ? NaN : sign * Infinity;
      return sign * Math.pow(2, exp - 15) * (1 + frac / 1024);
    }
    function isDigit(c) {
      return c >= 0x30 && c <= 0x39;
    }
    function isHex(c) {
      return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
    }
    function hexVal(c) {
      if (c >= 0x30 && c <= 0x39) return c - 0x30;
      if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10;
      if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10;
      return -1;
    }
    function isNameStart(c) {
      return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
    }
    function isNameChar(c) {
      return isNameStart(c) || isDigit(c);
    }

    /* -------------------------------------------------------- Lua reader */
    function LuaReader(b) {
      this.b = b;
      this.p = 0;
      this.n = b.length;
      this.entries = 0;
    }
    LuaReader.prototype.skip = function () {
      var b = this.b;
      var n = this.n;
      for (;;) {
        while (this.p < n) {
          var c = b[this.p];
          if (c === 32 || c === 9 || c === 10 || c === 13) this.p++;
          else break;
        }
        if (b[this.p] === 0x2d && b[this.p + 1] === 0x2d) {
          this.p += 2;
          if (b[this.p] === 0x5b && b[this.p + 1] === 0x5b) {
            this.p += 2;
            while (this.p < n && !(b[this.p] === 0x5d && b[this.p + 1] === 0x5d)) this.p++;
            this.p = Math.min(n, this.p + 2);
          } else {
            while (this.p < n && b[this.p] !== 10) this.p++;
          }
          continue;
        }
        break;
      }
    };
    LuaReader.prototype.readName = function () {
      var s = this.p;
      if (!isNameStart(this.b[this.p])) failAt('malformed data', this.p);
      this.p++;
      while (isNameChar(this.b[this.p])) this.p++;
      return utf8(this.b.subarray(s, this.p));
    };
    LuaReader.prototype.readNumber = function () {
      var b = this.b;
      var start = this.p;
      if (b[this.p] === 0x2d) this.p++;
      if (b[this.p] === 0x30 && (b[this.p + 1] === 0x78 || b[this.p + 1] === 0x58)) {
        this.p += 2;
        var hs = this.p;
        while (isHex(b[this.p])) this.p++;
        if (this.p === hs) failAt('malformed data', start);
        var hv = parseInt(utf8(b.subarray(hs, this.p)), 16);
        if (!isFinite(hv)) failAt('malformed data', start);
        return hv;
      }
      var ds = this.p;
      while (isDigit(b[this.p])) this.p++;
      if (b[this.p] === 0x2e) {
        this.p++;
        while (isDigit(b[this.p])) this.p++;
      }
      if (b[this.p] === 0x65 || b[this.p] === 0x45) {
        this.p++;
        if (b[this.p] === 0x2b || b[this.p] === 0x2d) this.p++;
        while (isDigit(b[this.p])) this.p++;
      }
      if (this.p === ds && b[start] !== 0x2e) failAt('malformed data', start);
      var num = Number(utf8(b.subarray(start, this.p)));
      if (!isFinite(num)) failAt('malformed data', start);
      return num;
    };
    LuaReader.prototype.readString = function () {
      var b = this.b;
      var n = this.n;
      var start = this.p;
      var q = b[this.p++];
      var out = [];
      while (this.p < n) {
        var c = b[this.p++];
        if (c === q) return new LuaStr(Uint8Array.from(out), start);
        if (c !== 0x5c) {
          out.push(c);
          continue;
        }
        if (this.p >= n) break;
        var e = b[this.p++];
        if (e === 0x6e) out.push(10);
        else if (e === 0x72) out.push(13);
        else if (e === 0x74) out.push(9);
        else if (e === 0x61) out.push(7);
        else if (e === 0x62) out.push(8);
        else if (e === 0x66) out.push(12);
        else if (e === 0x76) out.push(11);
        else if (e === 0x5c) out.push(92);
        else if (e === 0x22) out.push(34);
        else if (e === 0x27) out.push(39);
        else if (e === 0x0a) out.push(10);
        else if (e === 0x0d) {
          if (b[this.p] === 0x0a) this.p++;
          out.push(10);
        } else if (isDigit(e)) {
          var v = e - 0x30;
          var count = 1;
          while (count < 3 && isDigit(b[this.p])) {
            v = v * 10 + (b[this.p] - 0x30);
            this.p++;
            count++;
          }
          if (v > 255) failAt('malformed data', start);
          out.push(v);
        } else if (e === 0x78) {
          var h1 = hexVal(b[this.p]);
          if (h1 < 0) failAt('malformed data', start);
          this.p++;
          var h2 = hexVal(b[this.p]);
          if (h2 >= 0) {
            h1 = h1 * 16 + h2;
            this.p++;
          }
          out.push(h1 & 255);
        } else if (e === 0x7a) {
          while (
            this.p < n &&
            (b[this.p] === 32 || b[this.p] === 9 || b[this.p] === 10 || b[this.p] === 13)
          )
            this.p++;
        } else {
          out.push(e);
        }
      }
      failAt('malformed data', start);
    };
    LuaReader.prototype.longString = function () {
      var start = this.p;
      this.p++;
      var eq = 0;
      while (this.b[this.p] === 0x3d) {
        eq++;
        this.p++;
      }
      if (this.b[this.p] !== 0x5b) failAt('malformed data', start);
      this.p++;
      if (this.b[this.p] === 0x0a) this.p++;
      var out = [];
      for (;;) {
        if (this.p >= this.n) failAt('malformed data', start);
        if (this.b[this.p] === 0x5d) {
          var save = this.p;
          this.p++;
          var k = 0;
          while (k < eq && this.b[this.p] === 0x3d) {
            k++;
            this.p++;
          }
          if (k === eq && this.b[this.p] === 0x5d) {
            this.p++;
            return new LuaStr(Uint8Array.from(out), start);
          }
          this.p = save + 1;
          out.push(0x5d);
        } else {
          out.push(this.b[this.p++]);
        }
      }
    };
    LuaReader.prototype.value = function (depth) {
      if (depth > DEPTH_LIMIT) failAt('nesting too deep', this.p);
      this.skip();
      var c = this.b[this.p];
      if (c === 0x7b) return this.table(depth);
      if (c === 0x22 || c === 0x27) return this.readString();
      if (c === 0x5b && (this.b[this.p + 1] === 0x5b || this.b[this.p + 1] === 0x3d)) {
        return this.longString();
      }
      if (c === 0x2d || isDigit(c) || c === 0x2e) return this.readNumber();
      if (isNameStart(c)) {
        var name = this.readName();
        if (name === 'true') return true;
        if (name === 'false') return false;
        if (name === 'nil') return null;
        failAt('unsupported expression', this.p);
      }
      failAt('malformed data', this.p);
    };
    LuaReader.prototype.addEntry = function (t, key, val, pos) {
      this.entries++;
      if (this.entries > ENTRIES_LIMIT) failAt('too many entries', this.p);
      t.set(key, val, pos);
    };
    LuaReader.prototype.table = function (depth) {
      var pos = this.p;
      this.p++;
      var t = new LuaTable(pos);
      var idx = 1;
      this.skip();
      if (this.b[this.p] === 0x7d) {
        this.p++;
        return t;
      }
      for (;;) {
        this.skip();
        if (this.b[this.p] === 0x7d) {
          this.p++;
          break;
        }
        if (this.b[this.p] === 0x5b) {
          this.p++;
          var key = this.value(depth + 1);
          this.skip();
          if (this.b[this.p] !== 0x5d) failAt('malformed data', this.p);
          this.p++;
          this.skip();
          if (this.b[this.p] !== 0x3d) failAt('malformed data', this.p);
          this.p++;
          var val = this.value(depth + 1);
          this.addEntry(t, key, val, pos);
        } else if (isNameStart(this.b[this.p])) {
          var save = this.p;
          var name = this.readName();
          this.skip();
          if (this.b[this.p] === 0x3d) {
            this.p++;
            var v2 = this.value(depth + 1);
            this.addEntry(t, new LuaStr(utf8bytes(name), save), v2, pos);
          } else {
            this.p = save;
            var v3 = this.value(depth + 1);
            this.addEntry(t, idx++, v3, pos);
          }
        } else {
          var v4 = this.value(depth + 1);
          this.addEntry(t, idx++, v4, pos);
        }
        this.skip();
        if (this.b[this.p] === 0x2c || this.b[this.p] === 0x3b) {
          this.p++;
          continue;
        }
        if (this.b[this.p] === 0x7d) {
          this.p++;
          break;
        }
        failAt('malformed data', this.p);
      }
      return t;
    };
    LuaReader.prototype.globals = function () {
      var list = [];
      this.skip();
      while (this.p < this.n) {
        this.skip();
        if (this.p >= this.n) break;
        if (this.b[this.p] === 0x3b) {
          this.p++;
          continue;
        }
        var name = this.readName();
        this.skip();
        if (this.b[this.p] !== 0x3d) failAt('malformed data', this.p);
        this.p++;
        var val = this.value(0);
        list.push({ name: name, value: val });
        this.skip();
      }
      return list;
    };

    /* ------------------------------------------------------- CBOR reader */
    function CborReader(b) {
      this.b = b;
      this.p = 0;
      this.n = b.length;
      this.entries = 0;
    }
    CborReader.prototype.need = function (k) {
      if (this.p + k > this.n) failAt('cbor truncated', this.p);
    };
    CborReader.prototype.u8 = function () {
      this.need(1);
      return this.b[this.p++];
    };
    CborReader.prototype.uint = function (k) {
      this.need(k);
      var v = 0;
      for (var i = 0; i < k; i++) v = v * 256 + this.b[this.p + i];
      this.p += k;
      return v;
    };
    CborReader.prototype.len = function (mt) {
      if (mt < 24) return mt;
      if (mt === 24) return this.uint(1);
      if (mt === 25) return this.uint(2);
      if (mt === 26) return this.uint(4);
      if (mt === 27) {
        var hi = this.uint(4);
        var lo = this.uint(4);
        if (hi > 0x1fffff) failAt('cbor length overflow', this.p);
        return hi * 4294967296 + lo;
      }
      failAt('unsupported cbor', this.p);
    };
    CborReader.prototype.float = function (k) {
      this.need(k);
      var view = new DataView(this.b.buffer, this.b.byteOffset + this.p, k);
      var v;
      if (k === 8) v = view.getFloat64(0, false);
      else if (k === 4) v = view.getFloat32(0, false);
      else v = halfToNum(view.getUint16(0, false));
      this.p += k;
      if (!isFinite(v)) failAt('non-finite number', this.p);
      return v;
    };
    CborReader.prototype.value = function (depth) {
      if (depth > DEPTH_LIMIT) failAt('nesting too deep', this.p);
      var ib = this.u8();
      var mt = ib >> 5;
      var av = ib & 31;
      if (mt === 0) {
        var iv = this.len(av);
        if (iv > MAX_SAFE) failAt('number overflow', this.p);
        return iv;
      }
      if (mt === 1) {
        var nv = this.len(av);
        if (nv > MAX_SAFE) failAt('number overflow', this.p);
        return -1 - nv;
      }
      if (mt === 2 || mt === 3) {
        var sp = this.p;
        var L = this.len(av);
        this.need(L);
        var raw = this.b.subarray(this.p, this.p + L);
        this.p += L;
        return new LuaStr(Uint8Array.from(raw), sp);
      }
      if (mt === 4) {
        var LA = this.len(av);
        this.entries += LA;
        if (this.entries > ENTRIES_LIMIT) failAt('too many entries', this.p);
        var arr = new LuaTable(this.p);
        for (var i = 0; i < LA; i++) arr.set(i + 1, this.value(depth + 1), this.p);
        return arr;
      }
      if (mt === 5) {
        var LM = this.len(av);
        this.entries += LM;
        if (this.entries > ENTRIES_LIMIT) failAt('too many entries', this.p);
        var map = new LuaTable(this.p);
        for (var j = 0; j < LM; j++) {
          var key = this.value(depth + 1);
          var val = this.value(depth + 1);
          map.set(key, val, this.p);
        }
        return map;
      }
      if (mt === 6) {
        this.len(av);
        return this.value(depth + 1);
      }
      if (mt === 7) {
        if (av === 20) return false;
        if (av === 21) return true;
        if (av === 22 || av === 23) return null;
        if (av === 24) {
          this.u8();
          return null;
        }
        if (av === 25) return this.float(2);
        if (av === 26) return this.float(4);
        if (av === 27) return this.float(8);
        return null;
      }
      failAt('unsupported cbor', this.p);
    };

    /* --------------------------------------------------------- conversion */
    function keyToString(k) {
      if (k instanceof LuaStr) return utf8(k.raw);
      if (typeof k === 'number') return String(k);
      if (typeof k === 'boolean') return String(k);
      return null;
    }
    function dayKey(x) {
      if (typeof x === 'number') return Number.isInteger(x) ? x : null;
      if (x instanceof LuaStr) {
        var s = utf8(x.raw);
        if (!/^[0-9]+$/.test(s)) return null;
        var d = Number(s);
        return Number.isSafeInteger(d) ? d : null;
      }
      return null;
    }
    function validPrice(v) {
      return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
    }
    function validQty(v) {
      return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
    }
    function lookupDay(t, d) {
      var want = String(d);
      var e = t.entries;
      for (var i = 0; i < e.length; i++) {
        var k = e[i][0];
        if (k instanceof LuaStr) {
          if (utf8(k.raw) === want) return e[i][1];
        } else if (typeof k === 'number' && k === d) {
          return e[i][1];
        }
      }
      return undefined;
    }
    function realmVersion(t) {
      var v = t.get('version');
      if (v === undefined) return undefined;
      if (typeof v === 'number') return v;
      if (v instanceof LuaStr) {
        var s = utf8(v.raw);
        return /^[0-9]+$/.test(s) ? Number(s) : NaN;
      }
      return NaN;
    }
    function buildItem(keyText, item, warnings) {
      if (!(item instanceof LuaTable)) return null;
      var m = item.get('m');
      if (!validPrice(m)) {
        warn(warnings, 'item skipped: invalid price at offset ' + item.pos);
        return null;
      }
      var hT = item.get('h');
      var lT = item.get('l');
      var aT = item.get('a');
      var hist = [];
      var observed = null;
      if (hT instanceof LuaTable) {
        for (var i = 0; i < hT.entries.length; i++) {
          var day = dayKey(hT.entries[i][0]);
          var high = hT.entries[i][1];
          if (day === null || day < DAY_MIN || day > DAY_MAX) {
            warn(warnings, 'day skipped at offset ' + hT.pos);
            continue;
          }
          if (!validPrice(high)) {
            warn(warnings, 'price skipped at offset ' + hT.pos);
            continue;
          }
          var low = high;
          if (lT instanceof LuaTable) {
            var lv = lookupDay(lT, day);
            if (lv !== undefined) {
              if (validPrice(lv)) low = lv;
              else warn(warnings, 'low skipped at offset ' + lT.pos);
            }
          }
          var avail = null;
          if (aT instanceof LuaTable) {
            var av = lookupDay(aT, day);
            if (av !== undefined) {
              if (validQty(av)) avail = av;
              else warn(warnings, 'quantity skipped at offset ' + aT.pos);
            }
          }
          hist.push({ day: day, low: low, high: high, available: avail });
          if (observed === null || day > observed) observed = day;
        }
      } else if (hT !== undefined) {
        warn(warnings, 'item skipped: malformed history at offset ' + item.pos);
        return null;
      }
      hist.sort(function (x, y) {
        return x.day - y.day;
      });
      var itemId = null;
      if (/^[0-9]+$/.test(keyText)) {
        var n = Number(keyText);
        if (Number.isSafeInteger(n) && n > 0) itemId = n;
      }
      return {
        sourceKey: keyText,
        itemId: itemId,
        unitPriceCopper: m,
        observedDay: observed,
        history: hist,
      };
    }
    function warn(list, msg) {
      if (list.length < WARN_CAP) list.push(msg);
    }

    function toBytes(input) {
      if (input instanceof Uint8Array) return input;
      if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) {
        return new Uint8Array(input);
      }
      if (input && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      }
      fail('invalid input');
    }

    function parseAuctionator(input) {
      var bytes = toBytes(input);
      if (bytes.length > MAX_BYTES) fail('input exceeds maximum size');

      var warnings = [];
      var snapshot = {
        schemaVersion: 1,
        importedAt: new Date().toISOString(),
        sourceVersion: 8,
        realms: [],
        warnings: warnings,
      };

      var globals = new LuaReader(bytes).globals();
      var db;
      for (var g = 0; g < globals.length; g++) {
        if (globals[g].name === 'AUCTIONATOR_PRICE_DATABASE') db = globals[g].value;
      }
      if (db === undefined || db === null) {
        warn(warnings, 'no price database found');
        return snapshot;
      }
      if (!(db instanceof LuaTable)) fail('unexpected price database');
      if (db.get('__dbversion') !== 8) fail('unsupported database version');

      for (var e = 0; e < db.entries.length; e++) {
        var key = keyToString(db.entries[e][0]);
        var val = db.entries[e][1];
        if (key === '__dbversion') continue;
        if (key === null) {
          warn(warnings, 'realm skipped at offset ' + db.pos);
          continue;
        }
        var realmTable = val;
        if (val instanceof LuaStr) {
          var cr = new CborReader(val.raw);
          realmTable = cr.value(0);
          if (cr.p !== val.raw.length) failAt('cbor trailing data', cr.p);
        }
        if (!(realmTable instanceof LuaTable)) {
          warn(warnings, 'realm skipped at offset ' + db.pos);
          continue;
        }
        if (realmVersion(realmTable) !== 2) {
          warn(warnings, 'realm skipped: unsupported version at offset ' + realmTable.pos);
          continue;
        }
        var items = [];
        for (var q = 0; q < realmTable.entries.length; q++) {
          var ik = keyToString(realmTable.entries[q][0]);
          var iv = realmTable.entries[q][1];
          if (ik === 'version') continue;
          if (ik === null) {
            warn(warnings, 'entry skipped at offset ' + realmTable.pos);
            continue;
          }
          if (!(iv instanceof LuaTable)) {
            warn(warnings, 'entry skipped: malformed at offset ' + realmTable.pos);
            continue;
          }
          var built = buildItem(ik, iv, warnings);
          if (built) items.push(built);
        }
        snapshot.realms.push({ name: key, items: items });
      }
      return snapshot;
    }

    // Shared data-only reader for other SavedVariables importers. No eval, Lua
    // runtime or permissive expression parsing. Limits/duplicate-key checks are
    // the same as Auctionator; plain null-prototype objects cannot pollute JS.
    function parseSavedVariables(bytes, globalName) {
      if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_BYTES) fail('invalid input size');
      var globals = new LuaReader(bytes).globals(), seen = new Set(), selected;
      for (var i = 0; i < globals.length; i++) {
        var g = globals[i];
        if (seen.has(g.name)) fail('duplicate global');
        seen.add(g.name);
        if (g.name === globalName) selected = g.value;
      }
      if (!(selected instanceof LuaTable)) fail('missing data table');
      function plain(v) {
        if (v instanceof LuaStr) return utf8(v.raw);
        if (!(v instanceof LuaTable)) return v;
        var out = Object.create(null);
        for (var j = 0; j < v.entries.length; j++) {
          var key = plain(v.entries[j][0]);
          if (Object.prototype.hasOwnProperty.call(out, key)) fail('ambiguous key');
          out[key] = plain(v.entries[j][1]);
        }
        return out;
      }
      return plain(selected);
    }
    return { parseAuctionator: parseAuctionator, parseSavedVariables: parseSavedVariables, MAX_BYTES: MAX_BYTES };
  }

  var HunterMarket = HunterMarketFactory();
  HunterMarket.workerSource =
    "(function(){'use strict';var M=(" +
    HunterMarketFactory.toString() +
    ')();' +
    'self.onmessage=function(ev){var out;try{var data=ev&&ev.data;var bytes;' +
    "if(typeof ArrayBuffer!=='undefined'&&data instanceof ArrayBuffer){bytes=new Uint8Array(data);}" +
    "else if(typeof ArrayBuffer!=='undefined'&&ArrayBuffer.isView(data)){bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);}" +
    "else{throw new Error('invalid input');}" +
    'out={ok:true,snapshot:M.parseAuctionator(bytes)};}catch(err){' +
    "var msg=(err&&typeof err.message==='string'&&err.message)?err.message.slice(0,200):'parse failed';" +
    "msg=msg.replace(/[\\r\\n]+/g,' ');out={ok:false,error:msg};}" +
    'self.postMessage(out);};})();';

  var root = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this;
  // Como módulo (Node, bundle de Desktop) solo se exporta: no se toca el global.
  if (typeof module === 'object' && module && module.exports) module.exports = HunterMarket;
  else if (root) root.HunterMarket = HunterMarket;
})();
