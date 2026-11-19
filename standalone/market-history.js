/* market-history.js — acumulación determinista del historial de precios.
 *
 * Módulo puro (sin red, sin DOM, sin datos del juego). Dos representaciones:
 *
 *  - Snapshot (schema v1 de market.js): items con history:[{day,low,high,
 *    available}] — la forma que consume toda la UI.
 *  - Store compacto: {v:1, realms:{name:{items:{sourceKey:[[...],...]}}}}
 *    donde cada fila codifica una entrada de historial:
 *      [day,low]                    high==low, available==null
 *      [day,low,available]          high==low
 *      [day,low,high,available]     high!=low (available puede ser null)
 *    El merge y las estadísticas trabajan sobre filas; la UI solo ve snapshots.
 *
 * Reglas deterministas (documentadas en MARKET.md):
 *  - La identidad de un ítem es (realm, sourceKey): itemId es solo una pista
 *    de catálogo y las variantes no se mezclan con el ID base.
 *  - Por (realm, sourceKey, day) gana el import más reciente: la entrada del
 *    día es un agregado diario y la versión más nueva es la más completa, así
 *    que se toma la entrada entera (low/high/available juntos, no por campo).
 *  - Ítems o realms presentes solo en el store se conservan (su historia no se
 *    pierde aunque el ítem desaparezca del scan); solo se muestran cuando el
 *    ítem vuelve a aparecer en un import (sin precio actual no hay oferta).
 *  - Al superar el presupuesto de bytes se descartan primero los días más
 *    antiguos (globalmente), y como último recurso los ítems enteros en orden
 *    de clave. Nunca se recorta por ítem: el recorte es por día.
 *
 * Superficie (UMD — window.HunterHistory y module.exports):
 *   mergeSnapshots(prev,next)         -> snapshot fusionado (schema v1)
 *   mergeEntries(oldHist,newHist)     -> history fusionada (prefiere newHist)
 *   priceStats(item|history)          -> {minLow,medianaLow,avgLow,tendencia,diasMuestra}
 *   trimSnapshotHistory(snap,days)    -> snapshot con ventana reciente por ítem
 *   emptyStore() / validStore(s)
 *   storeFromSnapshot(snap) / storeMerge(store,snap) / applyStore(snap,store)
 *   fitStore(store,maxBytes)          -> store recortado para caber en maxBytes
 */
(function () {
  'use strict';

  var Identity = (typeof module === 'object' && module && module.exports)
    ? require('./market-identity.js')
    : (typeof globalThis !== 'undefined' && globalThis.HunterIdentity) || (typeof self !== 'undefined' && self.HunterIdentity);

  var SCHEMA = 1;
  var SCHEMA_V2 = 2;
  var DAY_MIN = 0;
  var DAY_MAX = 100000;
  var MAX_REALMS = 100;
  var MAX_REALM_NAME = 300;
  var MAX_ITEMS_PER_REALM = 100000;
  var MAX_SOURCE_KEY = 300;
  var MAX_ROWS_PER_ITEM = 10000;
  var MAX_ENTRIES = 400000;
  var TREND_MIN_DAYS = 4;
  var TREND_EPS = 0.05;

  function isInt(v) { return typeof v === 'number' && Number.isSafeInteger(v); }
  function posInt(v) { return isInt(v) && v > 0; }
  function nonNegInt(v) { return isInt(v) && v >= 0; }
  function shortText(s, max) { return typeof s === 'string' && s.length > 0 && s.length <= max; }

  /* ------------------------------------------------- compact row codec */
  // Canonical: len2 [d,l] (h==l, a==null); len3 [d,l,a] (h==l); len4 [d,l,h,a].
  // len4 admite available null; len3 con null también decodifica (a==null).
  function entryToRow(h) {
    if (h.high === h.low) {
      return h.available === null || h.available === undefined
        ? [h.day, h.low]
        : [h.day, h.low, h.available];
    }
    return [h.day, h.low, h.high, h.available === null || h.available === undefined ? null : h.available];
  }
  function rowToEntry(r) {
    if (r.length === 2) return { day: r[0], low: r[1], high: r[1], available: null };
    if (r.length === 3) return { day: r[0], low: r[1], high: r[1], available: r[2] == null ? null : r[2] };
    return { day: r[0], low: r[1], high: r[2], available: r[3] == null ? null : r[3] };
  }
  function rowsFromHistory(history) {
    var out = [];
    var list = Array.isArray(history) ? history : [];
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (h && isInt(h.day) && posInt(h.low)) out.push(entryToRow(h));
    }
    return out;
  }
  function historyFromRows(rows) {
    var out = new Array(rows.length);
    for (var i = 0; i < rows.length; i++) out[i] = rowToEntry(rows[i]);
    return out;
  }
  function byDayRow(a, b) { return a[0] - b[0]; }

  /* ------------------------------------------------------------- merge */
  // Ambas listas vienen ordenadas por día y sin días repetidos; en empate gana
  // la lista "nueva" (el import más reciente). Devuelve filas ordenadas.
  function mergeRows(oldR, newR) {
    var out = [];
    var i = 0;
    var j = 0;
    var a;
    var b;
    while (i < oldR.length && j < newR.length) {
      a = oldR[i];
      b = newR[j];
      if (a[0] === b[0]) {
        out.push(b);
        i++;
        j++;
      } else if (a[0] < b[0]) {
        out.push(a);
        i++;
      } else {
        out.push(b);
        j++;
      }
    }
    while (i < oldR.length) out.push(oldR[i++]);
    while (j < newR.length) out.push(newR[j++]);
    return out;
  }
  // Versión a nivel de objetos {day,low,high,available} para snapshots.
  function mergeEntries(oldHist, newHist) {
    return historyFromRows(mergeRows(rowsFromHistory(oldHist), rowsFromHistory(newHist)));
  }

  /* --------------------------------------------------- snapshot-level merge */
  function mergeSnapshots(prev, next) {
    if (!prev || typeof prev !== 'object') return next;
    if (!next || typeof next !== 'object') return prev;
    var outRealms = [];
    var prevByRealm = new Map();
    var pr = Array.isArray(prev.realms) ? prev.realms : [];
    for (var p = 0; p < pr.length; p++) {
      if (pr[p] && typeof pr[p].name === 'string') prevByRealm.set(pr[p].name, pr[p]);
    }
    var nr = Array.isArray(next.realms) ? next.realms : [];
    var seen = new Set();
    for (var q = 0; q < nr.length; q++) {
      var realm = nr[q];
      if (!realm || typeof realm.name !== 'string') continue;
      seen.add(realm.name);
      var prevRealm = prevByRealm.get(realm.name);
      var prevItems = prevRealm && Array.isArray(prevRealm.items) ? prevRealm.items : [];
      var prevByKey = new Map();
      for (var x = 0; x < prevItems.length; x++) {
        if (prevItems[x] && typeof prevItems[x].sourceKey === 'string') {
          prevByKey.set(prevItems[x].sourceKey, prevItems[x]);
        }
      }
      var items = [];
      var ni = Array.isArray(realm.items) ? realm.items : [];
      var nextKeys = new Set();
      for (var y = 0; y < ni.length; y++) {
        var item = ni[y];
        if (!item || typeof item.sourceKey !== 'string') continue;
        nextKeys.add(item.sourceKey);
        var old = prevByKey.get(item.sourceKey);
        if (!old) {
          items.push(item);
          continue;
        }
        items.push({
          sourceKey: item.sourceKey,
          itemId: item.itemId !== undefined ? item.itemId : old.itemId,
          unitPriceCopper: item.unitPriceCopper !== undefined ? item.unitPriceCopper : old.unitPriceCopper,
          observedDay: item.observedDay !== undefined ? item.observedDay : old.observedDay,
          history: mergeEntries(old.history, item.history),
        });
      }
      // Ítems que solo existen en prev dentro de este realm.
      for (var z = 0; z < prevItems.length; z++) {
        var po = prevItems[z];
        if (po && typeof po.sourceKey === 'string' && !nextKeys.has(po.sourceKey)) {
          items.push(po);
        }
      }
      outRealms.push({ name: realm.name, items: items });
    }
    // Realms que solo existen en prev.
    for (var w = 0; w < pr.length; w++) {
      if (pr[w] && typeof pr[w].name === 'string' && !seen.has(pr[w].name)) {
        outRealms.push({ name: pr[w].name, items: Array.isArray(pr[w].items) ? pr[w].items.slice() : [] });
      }
    }
    return {
      schemaVersion: next.schemaVersion !== undefined ? next.schemaVersion : prev.schemaVersion,
      importedAt: next.importedAt !== undefined ? next.importedAt : prev.importedAt,
      sourceVersion: next.sourceVersion !== undefined ? next.sourceVersion : prev.sourceVersion,
      realms: outRealms,
      warnings: Array.isArray(next.warnings) ? next.warnings : (Array.isArray(prev.warnings) ? prev.warnings : []),
    };
  }

  /* ------------------------------------------------------------- stats */
  function medianOf(sorted) {
    var n = sorted.length;
    return n % 2 ? sorted[(n - 1) / 2] : Math.round((sorted[n / 2 - 1] + sorted[n / 2]) / 2);
  }
  // Acepta un ítem de snapshot ({history:[...]}) o una lista de historial.
  // Las estadísticas se calculan sobre el mínimo diario (`low`), el precio más
  // bajo observado cada día. Son aproximadas: los días sin observación no
  // cuentan como precio cero ni se interpolan.
  function priceStats(input) {
    var hist = Array.isArray(input) ? input : input && input.history;
    var list = Array.isArray(hist) ? hist : [];
    var entries = [];
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      var e = Array.isArray(h) ? rowToEntry(h) : h;
      if (e && isInt(e.day) && posInt(e.low)) entries.push(e);
    }
    entries.sort(function (a, b) { return a.day - b.day; });
    var n = entries.length;
    if (!n) return { minLow: null, medianaLow: null, avgLow: null, tendencia: null, diasMuestra: 0 };
    var min = Infinity;
    var sum = 0;
    var lows = new Array(n);
    for (var j = 0; j < n; j++) {
      var low = entries[j].low;
      lows[j] = low;
      if (low < min) min = low;
      sum += low;
    }
    lows.sort(function (a, b) { return a - b; });
    var tendencia = 'sin-datos';
    if (n >= TREND_MIN_DAYS) {
      var half = Math.floor(n / 2);
      var oldLows = entries.slice(0, half).map(function (e) { return e.low; }).sort(function (a, b) { return a - b; });
      var newLows = entries.slice(n - half).map(function (e) { return e.low; }).sort(function (a, b) { return a - b; });
      var mo = medianOf(oldLows);
      var mn = medianOf(newLows);
      if (mn > mo * (1 + TREND_EPS)) tendencia = 'sube';
      else if (mn < mo * (1 - TREND_EPS)) tendencia = 'baja';
      else tendencia = 'estable';
    }
    return {
      minLow: min,
      medianaLow: medianOf(lows),
      avgLow: Math.round(sum / n),
      tendencia: tendencia,
      diasMuestra: n,
    };
  }

  /* ------------------------------------------------- snapshot window trim */
  // Deja en cada ítem solo los últimos `keepDays` días calendario de su propia
  // serie (ventana relativa al día más reciente del ítem). Sirve para que el
  // snapshot persistido quede chico; la serie completa vive en el store.
  // Si ningún ítem necesita recorte devuelve el mismo objeto (sin copia).
  function trimSnapshotHistory(snapshot, keepDays) {
    if (!snapshot || !Array.isArray(snapshot.realms)) return snapshot;
    var k = Math.max(1, Math.floor(keepDays) || 1);
    var changed = false;
    var realms = snapshot.realms.map(function (realm) {
      if (!realm || !Array.isArray(realm.items)) return realm;
      var rChanged = false;
      var items = realm.items.map(function (item) {
        var h = item && item.history;
        if (!Array.isArray(h) || h.length < 2) return item;
        var lastDay = h[h.length - 1].day;
        var cut = lastDay - k + 1;
        if (h[0].day >= cut) return item;
        var kept = h.filter(function (e) { return e.day >= cut; });
        rChanged = true;
        changed = true;
        return Object.assign({}, item, { history: kept });
      });
      return rChanged ? Object.assign({}, realm, {items:items}) : realm;
    });
    return changed ? Object.assign({}, snapshot, {realms:realms}) : snapshot;
  }

  /* ------------------------------------------------------------- store */
  function emptyStore() {
    return { v: SCHEMA, realms: {} };
  }

  function validRow(r) {
    if (!Array.isArray(r) || r.length < 2 || r.length > 4) return false;
    if (!isInt(r[0]) || r[0] < DAY_MIN || r[0] > DAY_MAX) return false;
    if (!posInt(r[1])) return false;
    if (r.length === 2) return true;
    if (r.length === 3) {
      var a3 = r[2];
      return a3 == null ? true : nonNegInt(a3);
    }
    if (!posInt(r[2]) || r[2] < r[1]) return false;
    var a4 = r[3];
    return a4 == null ? true : nonNegInt(a4);
  }

  function validStore(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    if (s.v !== SCHEMA) return false;
    var realms = s.realms;
    if (!realms || typeof realms !== 'object' || Array.isArray(realms)) return false;
    var rnames = Object.keys(realms);
    if (rnames.length > MAX_REALMS) return false;
    var total = 0;
    for (var i = 0; i < rnames.length; i++) {
      var rn = rnames[i];
      if (!shortText(rn, MAX_REALM_NAME)) return false;
      var r = realms[rn];
      if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
      var rkeys = Object.keys(r);
      if (rkeys.length !== 1 || rkeys[0] !== 'items') return false;
      var items = r.items;
      if (!items || typeof items !== 'object' || Array.isArray(items)) return false;
      var keys = Object.keys(items);
      if (keys.length > MAX_ITEMS_PER_REALM) return false;
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        if (!shortText(k, MAX_SOURCE_KEY)) return false;
        var rows = items[k];
        if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_ITEM) return false;
        total += rows.length;
        if (total > MAX_ENTRIES) return false;
        var prevDay = -1;
        for (var m = 0; m < rows.length; m++) {
          var row = rows[m];
          if (!validRow(row)) return false;
          if (row[0] <= prevDay) return false;
          prevDay = row[0];
        }
      }
    }
    return true;
  }

  function storeFromSnapshot(snapshot) {
    var store = emptyStore();
    var realms = snapshot && Array.isArray(snapshot.realms) ? snapshot.realms : [];
    for (var i = 0; i < realms.length; i++) {
      var realm = realms[i];
      if (!realm || typeof realm.name !== 'string') continue;
      var items = Array.isArray(realm.items) ? realm.items : [];
      var sRealm = store.realms[realm.name];
      if (!sRealm) {
        sRealm = { items: {} };
        store.realms[realm.name] = sRealm;
      }
      for (var j = 0; j < items.length; j++) {
        var item = items[j];
        if (!item || typeof item.sourceKey !== 'string') continue;
        var rows = rowsFromHistory(item.history);
        if (!rows.length) continue;
        rows.sort(byDayRow);
        var ex = sRealm.items[item.sourceKey];
        sRealm.items[item.sourceKey] = ex ? mergeRows(ex, rows) : rows;
      }
    }
    return store;
  }

  // Upsert del historial completo de un snapshot nuevo sobre el store.
  // No muta ninguna entrada: devuelve un store nuevo.
  function storeMerge(store, snapshot) {
    var out = emptyStore();
    var oldRealms = store && store.realms && typeof store.realms === 'object' ? store.realms : {};
    var oldNames = Object.keys(oldRealms);
    for (var i = 0; i < oldNames.length; i++) {
      var rn = oldNames[i];
      var r = oldRealms[rn];
      if (!r || typeof r !== 'object' || !r.items || typeof r.items !== 'object') continue;
      var copy = { items: {} };
      var keys = Object.keys(r.items);
      for (var j = 0; j < keys.length; j++) copy.items[keys[j]] = r.items[keys[j]];
      out.realms[rn] = copy;
    }
    var realms = snapshot && Array.isArray(snapshot.realms) ? snapshot.realms : [];
    for (var q = 0; q < realms.length; q++) {
      var realm = realms[q];
      if (!realm || typeof realm.name !== 'string') continue;
      var items = Array.isArray(realm.items) ? realm.items : [];
      var sRealm = out.realms[realm.name];
      if (!sRealm) {
        sRealm = { items: {} };
        out.realms[realm.name] = sRealm;
      }
      for (var y = 0; y < items.length; y++) {
        var item = items[y];
        if (!item || typeof item.sourceKey !== 'string') continue;
        var rows = rowsFromHistory(item.history);
        if (!rows.length) continue;
        rows.sort(byDayRow);
        var ex = sRealm.items[item.sourceKey];
        sRealm.items[item.sourceKey] = ex ? mergeRows(ex, rows) : rows;
      }
    }
    return out;
  }

  // Vista de trabajo: snapshot cuyas histories son store ∪ snapshot.history,
  // ganando snapshot.history en los días compartidos (es el import más nuevo).
  // Los ítems del store que no están en el snapshot no aparecen (sin precio
  // actual no hay oferta que mostrar).
  function applyStore(snapshot, store) {
    if (!snapshot || !validStore(store)) return snapshot;
    var changed = false;
    var realms = snapshot.realms.map(function (realm) {
      var sRealm = realm && store.realms[realm.name];
      if (!sRealm) return realm;
      var rChanged = false;
      var items = realm.items.map(function (item) {
        var rows = item && sRealm.items[item.sourceKey];
        if (!rows || !rows.length) return item;
        var merged = mergeRows(rows, rowsFromHistory(item.history).sort(byDayRow));
        var hist = historyFromRows(merged);
        var same = hist.length === item.history.length;
        if (same) {
          for (var i = 0; i < hist.length; i++) {
            var a = hist[i];
            var b = item.history[i];
            if (a.day !== b.day || a.low !== b.low || a.high !== b.high || a.available !== b.available) {
              same = false;
              break;
            }
          }
        }
        if (same) return item;
        rChanged = true;
        changed = true;
        return Object.assign({}, item, {history:hist});
      });
      return rChanged ? Object.assign({}, realm, {items:items}) : realm;
    });
    return changed ? Object.assign({}, snapshot, {realms:realms}) : snapshot;
  }

  /* --------------------------------------------------------- size fitting */
  function utf8Len(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    return s.length;
  }
  function byteSize(v) { return utf8Len(JSON.stringify(v)); }

  // Recorta el store para que quepa en maxBytes descartando primero los días
  // más antiguos (globalmente). Si ni siquiera el día más nuevo entra, recorta
  // ítems enteros en orden de (realm, clave). Determinista: mismo store y mismo
  // presupuesto producen siempre el mismo resultado.
  function fitStore(store, maxBytes) {
    if (!validStore(store)) throw new Error('invalid history store');
    var max = Math.max(256, Math.floor(maxBytes));
    if (byteSize(store) <= max) return store;

    var daySet = {};
    var rnames = Object.keys(store.realms);
    for (var i = 0; i < rnames.length; i++) {
      var items = store.realms[rnames[i]].items;
      var keys = Object.keys(items);
      for (var j = 0; j < keys.length; j++) {
        var rows = items[keys[j]];
        for (var m = 0; m < rows.length; m++) daySet[rows[m][0]] = true;
      }
    }
    var days = Object.keys(daySet).map(Number).sort(function (a, b) { return a - b; });

    // Conserva los días >= cutoff (los días descartados son un prefijo global).
    function buildFromDay(cutoff) {
      var out = { v: SCHEMA, realms: {} };
      if (cutoff === null) return out;
      for (var a = 0; a < rnames.length; a++) {
        var rn = rnames[a];
        var srcItems = store.realms[rn].items;
        var ni = null;
        var ks = Object.keys(srcItems);
        for (var b = 0; b < ks.length; b++) {
          var rows = srcItems[ks[b]];
          var lo = 0;
          var hi = rows.length;
          while (lo < hi) {
            var mid = (lo + hi) >> 1;
            if (rows[mid][0] < cutoff) lo = mid + 1;
            else hi = mid;
          }
          if (lo >= rows.length) continue;
          if (!ni) ni = {};
          ni[ks[b]] = rows.slice(lo);
        }
        if (ni) out.realms[rn] = { items: ni };
      }
      return out;
    }

    // Búsqueda del menor índice de día que entra: días[0..idx-1] se descartan.
    var loI = 0;
    var hiI = days.length;
    while (loI < hiI) {
      var midI = (loI + hiI) >> 1;
      var cutoff = midI === days.length ? null : days[midI];
      if (byteSize(buildFromDay(cutoff)) <= max) hiI = midI;
      else loI = midI + 1;
    }
    var result = buildFromDay(loI === days.length ? null : days[loI]);
    if (byteSize(result) <= max) return result;

    // Último recurso (casi imposible): conservar un prefijo de ítems en orden
    // determinista (realm, clave) que entre en el presupuesto.
    var flat = [];
    var srnames = Object.keys(result.realms).sort();
    for (var c = 0; c < srnames.length; c++) {
      var sitems = result.realms[srnames[c]].items;
      var skeys = Object.keys(sitems).sort();
      for (var d = 0; d < skeys.length; d++) flat.push([srnames[c], skeys[d]]);
    }
    function buildPrefix(n) {
      var out2 = { v: SCHEMA, realms: {} };
      for (var e = 0; e < n; e++) {
        var rn2 = flat[e][0];
        var k2 = flat[e][1];
        if (!out2.realms[rn2]) out2.realms[rn2] = { items: {} };
        out2.realms[rn2].items[k2] = result.realms[rn2].items[k2];
      }
      return out2;
    }
    var loN = 0;
    var hiN = flat.length;
    while (loN < hiN) {
      var midN = (loN + hiN) >> 1;
      if (byteSize(buildPrefix(midN)) <= max) loN = midN + 1;
      else hiN = midN;
    }
    return buildPrefix(loN);
  }

  /* --------------------------- v2: ámbitos aislados (capital/neutral) ------- */

  var LEGACY_SCOPE = 'local:legacy';

  function safeName(s, max) {
    if (!shortText(s, max)) return false;
    if (/[\/\\\u0000-\u001f\u007f]/.test(s)) return false;
    if (/(account|wtf|savedvariables|__proto__|constructor|prototype)/i.test(s)) return false;
    return true;
  }
  function plainObject(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    var p = Object.getPrototypeOf(o);
    return p === Object.prototype || p === null;
  }
  function exactKeys(o, keys) {
    if (!plainObject(o)) return false;
    var k = Object.keys(o);
    if (k.length !== keys.length) return false;
    for (var i = 0; i < k.length; i++) if (keys.indexOf(k[i]) < 0) return false;
    return true;
  }
  function canonicalScopeKey(k) {
    if (typeof k !== 'string' || k.charAt(0) !== '[') return false;
    var arr;
    try { arr = JSON.parse(k); } catch (e) { return false; }
    return Array.isArray(arr) && arr.length === 7;
  }
  function legacyIdentity(localScope) {
    return Identity.unknownIdentity('legacy', safeName(localScope, 120) ? localScope : LEGACY_SCOPE);
  }

  function emptyStoreV2() { return { v: SCHEMA_V2, scopes: {} }; }

  function validStoreV2(s) {
    if (!exactKeys(s, ['v', 'scopes'])) return false;
    if (s.v !== SCHEMA_V2 || !plainObject(s.scopes)) return false;
    var keys = Object.keys(s.scopes);
    if (keys.length > 100) return false;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!canonicalScopeKey(k)) return false;
      var scope = s.scopes[k];
      if (!exactKeys(scope, ['identity', 'confirmation', 'realms'])) return false;
      if (!Identity.validateIdentity(scope.identity).ok || Identity.identityKey(scope.identity) !== k) return false;
      var c = scope.confirmation;
      if (c !== null && !(exactKeys(c, ['cutoffDay', 'verified']) && isInt(c.cutoffDay) && c.cutoffDay >= DAY_MIN && c.cutoffDay <= DAY_MAX && c.verified === true)) return false;
      if (!plainObject(scope.realms)) return false;
      if (!validStore({ v: SCHEMA, realms: scope.realms })) return false;
      var rnames = Object.keys(scope.realms);
      for (var r = 0; r < rnames.length; r++) {
        if (!safeName(rnames[r], MAX_REALM_NAME)) return false;
        var items = scope.realms[rnames[r]].items;
        var ikeys = Object.keys(items);
        for (var j = 0; j < ikeys.length; j++) if (!safeName(ikeys[j], MAX_SOURCE_KEY)) return false;
      }
    }
    return true;
  }

  function scopeKey(identity) { return Identity.identityKey(identity); }

  // Migración SOLO en memoria: envuelve el store v1 en un ámbito opaco
  // desconocido. No etiqueta capital/neutral ni reclasifica días antiguos.
  function migrateStoreV1(store, localScope) {
    if (store && store.v === SCHEMA_V2) {
      if (!validStoreV2(store)) throw new Error('invalid v2 store');
      return store;
    }
    if (!validStore(store)) throw new Error('invalid v1 store');
    var ident = legacyIdentity(localScope);
    var out = emptyStoreV2();
    out.scopes[Identity.identityKey(ident)] = { identity: ident, confirmation: null, realms: store.realms };
    return out;
  }

  function normalizeStore(store) {
    if (store && store.v === SCHEMA_V2) {
      if (!validStoreV2(store)) throw new Error('invalid v2 store');
      return store;
    }
    if (store && store.v === SCHEMA) return migrateStoreV1(store, LEGACY_SCOPE);
    throw new Error('invalid store');
  }

  function legacyView(store) {
    if (!validStoreV2(store)) throw new Error('invalid v2 store');
    var keys = Object.keys(store.scopes).sort();
    for (var i = 0; i < keys.length; i++) {
      var s = store.scopes[keys[i]];
      if (s.identity.provenance.confidence === 'unknown' && s.confirmation === null) {
        return { v: SCHEMA, realms: structuredClone(s.realms) };
      }
    }
    return { v: SCHEMA, realms: {} };
  }

  function scopeForSnapshot(snapshot, realm) {
    if (realm && Identity.validateIdentity(realm.identity).ok) return realm.identity;
    return legacyIdentity(LEGACY_SCOPE);
  }

  function cutoffOf(snapshot, identity) {
    if (!Identity.validateIdentity(identity).ok || identity.provenance.confidence !== 'verified') return null;
    var day = snapshot && snapshot.observation && isInt(snapshot.observation.toDay) ? snapshot.observation.toDay : null;
    if (day === null) {
      day = 0;
      var realms = snapshot && Array.isArray(snapshot.realms) ? snapshot.realms : [];
      for (var i = 0; i < realms.length; i++) {
        var items = Array.isArray(realms[i].items) ? realms[i].items : [];
        for (var j = 0; j < items.length; j++) if (isInt(items[j].observedDay) && items[j].observedDay > day) day = items[j].observedDay;
      }
    }
    return day > 0 ? { cutoffDay: day, verified: true } : null;
  }

  function storeV2FromSnapshot(snapshot) {
    var out = emptyStoreV2();
    var realms = snapshot && Array.isArray(snapshot.realms) ? snapshot.realms : [];
    for (var i = 0; i < realms.length; i++) {
      var realm = realms[i];
      if (!realm || typeof realm.name !== 'string') continue;
      var ident = scopeForSnapshot(snapshot, realm);
      var key = Identity.identityKey(ident);
      if (!out.scopes[key]) out.scopes[key] = { identity: ident, confirmation: cutoffOf(snapshot, ident), realms: {} };
      var sRealm = out.scopes[key].realms[realm.name];
      if (!sRealm) { sRealm = { items: {} }; out.scopes[key].realms[realm.name] = sRealm; }
      var items = Array.isArray(realm.items) ? realm.items : [];
      for (var j = 0; j < items.length; j++) {
        var item = items[j];
        if (!item || typeof item.sourceKey !== 'string') continue;
        var rows = rowsFromHistory(item.history).sort(byDayRow);
        if (!rows.length) continue;
        var ex = sRealm.items[item.sourceKey];
        sRealm.items[item.sourceKey] = ex ? mergeRows(ex, rows) : rows;
      }
    }
    return out;
  }

  function storeV2Merge(store, snapshot) {
    var base = normalizeStore(store);
    var next = storeV2FromSnapshot(snapshot);
    var out = emptyStoreV2();
    var keys = Object.keys(base.scopes);
    for (var i = 0; i < keys.length; i++) out.scopes[keys[i]] = structuredClone(base.scopes[keys[i]]);
    var nks = Object.keys(next.scopes);
    for (var q = 0; q < nks.length; q++) {
      var k = nks[q];
      if (!out.scopes[k]) { out.scopes[k] = structuredClone(next.scopes[k]); continue; }
      var dst = out.scopes[k], src = next.scopes[k];
      if (dst.confirmation === null && src.confirmation !== null) dst.confirmation = src.confirmation;
      var rks = Object.keys(src.realms);
      for (var r = 0; r < rks.length; r++) {
        var rn = rks[r];
        if (!dst.realms[rn]) { dst.realms[rn] = structuredClone(src.realms[rn]); continue; }
        var iks = Object.keys(src.realms[rn].items);
        for (var m = 0; m < iks.length; m++) {
          var sk = iks[m];
          var oldRows = dst.realms[rn].items[sk];
          dst.realms[rn].items[sk] = oldRows ? mergeRows(oldRows, src.realms[rn].items[sk]) : src.realms[rn].items[sk];
        }
      }
    }
    if (!validStoreV2(out)) throw new Error('merged store v2 invalid');
    return out;
  }

  function applyStoreV2(snapshot, store) {
    if (!snapshot || !validStoreV2(store)) return snapshot;
    var realms = Array.isArray(snapshot.realms) ? snapshot.realms : [];
    var changed = false;
    var outRealms = realms.map(function (realm) {
      var ident = scopeForSnapshot(snapshot, realm);
      var key = Identity.identityKey(ident);
      var scope = store.scopes[key];
      var sRealm = scope && scope.realms[realm.name];
      if (!sRealm) return realm;
      var rChanged = false;
      var items = (Array.isArray(realm.items) ? realm.items : []).map(function (item) {
        var rows = item && sRealm.items[item.sourceKey];
        if (!rows || !rows.length) return item;
        var merged = mergeRows(rows, rowsFromHistory(item.history).sort(byDayRow));
        var hist = historyFromRows(merged);
        var same = hist.length === (item.history || []).length;
        if (same) {
          for (var i = 0; i < hist.length; i++) {
            var a = hist[i], b = item.history[i];
            if (a.day !== b.day || a.low !== b.low || a.high !== b.high || a.available !== b.available) { same = false; break; }
          }
        }
        if (same) return item;
        rChanged = true; changed = true;
        return Object.assign({}, item, {history:hist});
      });
      return rChanged ? { name: realm.name, identity: realm.identity, items: items } : realm;
    });
    if (!changed) return snapshot;
    var out = { schemaVersion: snapshot.schemaVersion, realms: outRealms, warnings: snapshot.warnings };
    if (snapshot.importedAt !== undefined) out.importedAt = snapshot.importedAt;
    if (snapshot.sourceVersion !== undefined) out.sourceVersion = snapshot.sourceVersion;
    if (snapshot.observation !== undefined) out.observation = snapshot.observation;
    if (snapshot.cutoffDay !== undefined) out.cutoffDay = snapshot.cutoffDay;
    return out;
  }

  // Recorte GLOBAL por día entre todos los ámbitos (un mismo día cae en todos).
  function fitStoreV2(store, maxBytes) {
    if (!validStoreV2(store)) throw new Error('invalid v2 store');
    var max = Math.max(256, Math.floor(maxBytes));
    if (byteSize(store) <= max) return store;
    var keys = Object.keys(store.scopes);
    var daySet = {};
    for (var i = 0; i < keys.length; i++) {
      var rnames = Object.keys(store.scopes[keys[i]].realms);
      for (var r = 0; r < rnames.length; r++) {
        var items = store.scopes[keys[i]].realms[rnames[r]].items;
        var iks = Object.keys(items);
        for (var j = 0; j < iks.length; j++) {
          var rows = items[iks[j]];
          for (var m = 0; m < rows.length; m++) daySet[rows[m][0]] = true;
        }
      }
    }
    var days = Object.keys(daySet).map(Number).sort(function (a, b) { return a - b; });
    function build(cutoff) {
      var out = emptyStoreV2();
      if (cutoff === null) return out;
      for (var a = 0; a < keys.length; a++) {
        var scope = store.scopes[keys[a]];
        var scoped = null;
        var rns = Object.keys(scope.realms);
        for (var b = 0; b < rns.length; b++) {
          var srcItems = scope.realms[rns[b]].items;
          var ni = null;
          var sks = Object.keys(srcItems);
          for (var c = 0; c < sks.length; c++) {
            var rows2 = srcItems[sks[c]];
            var lo = 0, hi = rows2.length;
            while (lo < hi) {
              var mid = (lo + hi) >> 1;
              if (rows2[mid][0] < cutoff) lo = mid + 1; else hi = mid;
            }
            if (lo >= rows2.length) continue;
            if (!ni) ni = {};
            ni[sks[c]] = rows2.slice(lo);
          }
          if (ni) {
            if (!scoped) scoped = { identity: scope.identity, confirmation: scope.confirmation, realms: {} };
            scoped.realms[rns[b]] = { items: ni };
          }
        }
        if (scoped) out.scopes[keys[a]] = scoped;
      }
      return out;
    }
    var loI = 0, hiI = days.length;
    while (loI < hiI) {
      var midI = (loI + hiI) >> 1;
      if (byteSize(build(midI === days.length ? null : days[midI])) <= max) hiI = midI; else loI = midI + 1;
    }
    var result = build(loI === days.length ? null : days[loI]);
    if (byteSize(result) <= max) return result;
    // Último recurso: conservar ámbitos enteros en orden determinista.
    var out2 = emptyStoreV2();
    var sortedKeys = keys.slice().sort();
    for (var e = 0; e < sortedKeys.length; e++) {
      var candidate = emptyStoreV2();
      candidate.scopes[sortedKeys[e]] = result.scopes[sortedKeys[e]];
      if (byteSize(candidate) <= max) out2.scopes[sortedKeys[e]] = structuredClone(candidate.scopes[sortedKeys[e]]);
    }
    return out2;
  }

  var HunterHistory = {
    SCHEMA: SCHEMA,
    entryToRow: entryToRow,
    rowToEntry: rowToEntry,
    mergeRows: mergeRows,
    mergeEntries: mergeEntries,
    mergeSnapshots: mergeSnapshots,
    priceStats: priceStats,
    trimSnapshotHistory: trimSnapshotHistory,
    emptyStore: emptyStore,
    validStore: validStore,
    storeFromSnapshot: storeFromSnapshot,
    storeMerge: storeMerge,
    applyStore: applyStore,
    fitStore: fitStore,
    byteSize: byteSize,
    SCHEMA_V2: SCHEMA_V2,
    emptyStoreV2: emptyStoreV2,
    validStoreV2: validStoreV2,
    scopeKey: scopeKey,
    migrateStoreV1: migrateStoreV1,
    normalizeStore: normalizeStore,
    legacyView: legacyView,
    storeV2FromSnapshot: storeV2FromSnapshot,
    storeV2Merge: storeV2Merge,
    applyStoreV2: applyStoreV2,
    fitStoreV2: fitStoreV2,
  };

  var root = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this;
  // Como módulo (Node, bundle de Desktop) solo se exporta: no se toca el global.
  if (typeof module === 'object' && module && module.exports) module.exports = HunterHistory;
  else if (root) root.HunterHistory = HunterHistory;
})();
