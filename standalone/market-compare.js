/*
 * market-compare.js — motor de comparación PURO (sin red, sin DOM, sin reloj).
 *
 * El reloj lo pasa el llamador (todayDay). Nunca se compara procedencia
 * desconocida, se fusionan variantes con su ID base, se inventan tasas de
 * comisión (5%/15%) ni se afirma liquidez o beneficio garantizado.
 *
 * Superficie (UMD — window.HunterCompare y module.exports):
 *   compare(pools, options) -> { status, reasons, rows, coverage, liquidityClaim:null }
 *
 * pool  = { id, identity, rows:[{sourceKey,itemId,unitPriceCopper,observedDay,
 *          available,confirmed,coverage}], alternateChannel? }
 * options = { todayDay, freshDays=3, skewMax=5,
 *             commission:{ [channel]:{rateBps,verified,sourceLabel,asOfDay} } }
 */
(function () {
  'use strict';

  var Identity = (typeof module === 'object' && module && module.exports)
    ? require('./market-identity.js')
    : (typeof globalThis !== 'undefined' && globalThis.HunterIdentity) || (typeof self !== 'undefined' && self.HunterIdentity);

  var MAX_KEY = 300;

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isInt(v) { return typeof v === 'number' && Number.isSafeInteger(v); }
  function validKey(v) { return typeof v === 'string' && v.length >= 1 && v.length <= MAX_KEY && !/[\u0000-\u001f\u007f]/.test(v); }
  function blocked(reasons) {
    return { status: 'blocked', reasons: reasons, rows: [], coverage: {}, liquidityClaim: null, asOfDay: null, freshDays: null };
  }

  function commissionFor(options, channel, alternate) {
    var map = (options && isObj(options.commission)) ? options.commission : {};
    var c = alternate || (typeof channel === 'string' ? map[channel] : null);
    if (!isObj(c) || !isInt(c.rateBps) || c.rateBps < 0 || c.rateBps > 10000) {
      return { present: false, verified: false, rateBps: null, sourceLabel: null, asOfDay: null };
    }
    return {
      present: true,
      verified: c.verified === true && validKey(String(c.sourceLabel || '')) && isInt(c.asOfDay) && c.asOfDay >= 0 && c.asOfDay <= options.todayDay,
      rateBps: c.rateBps,
      sourceLabel: c.sourceLabel || null,
      asOfDay: c.asOfDay || null,
    };
  }

  // neto = precio por unidad - comisión. Cálculo entero en cobre; si el
  // producto excede safe-integer, se marca overflow y el neto es nulo.
  function netOf(unitPriceCopper, commission) {
    if (!commission.present || !commission.verified) {
      return { netCopper: null, scenario: true, reason: commission.present ? 'commission-unverified' : 'commission-unknown' };
    }
    var product = unitPriceCopper * commission.rateBps;
    if (!Number.isSafeInteger(product)) return { netCopper: null, scenario: true, reason: 'commission-overflow' };
    var fee = Math.round(product / 10000);
    var net = unitPriceCopper - fee;
    if (!Number.isSafeInteger(net) || net < 0) return { netCopper: null, scenario: true, reason: 'commission-overflow' };
    return { netCopper: net, scenario: false, reason: null };
  }

  function aggregate(pool) {
    var itemRows = 0, scannedRows = 0;
    for (var i = 0; i < pool.rows.length; i++) {
      var c = pool.rows[i].coverage;
      if (isObj(c)) {
        itemRows += isInt(c.itemRows) ? c.itemRows : 0;
        scannedRows += isInt(c.scannedRows) ? c.scannedRows : 0;
      }
    }
    return {
      id: pool.id, rowCount: pool.rows.length, itemRows: itemRows, scannedRows: scannedRows,
      hasCoverage: scannedRows > 0 && itemRows <= scannedRows,
    };
  }

  function compare(pools, options) {
    var opt = isObj(options) ? options : {};
    var todayDay = isInt(opt.todayDay) ? opt.todayDay : null;
    var freshDays = isInt(opt.freshDays) && opt.freshDays >= 0 ? opt.freshDays : 3;
    var skewMax = typeof opt.skewMax === 'number' && opt.skewMax >= 0 ? opt.skewMax : 5;
    if (todayDay === null) return blocked(['missing-today']);
    if (!Array.isArray(pools) || pools.length < 1 || pools.length > 2) return blocked(['pool-count']);

    for (var p = 0; p < pools.length; p++) {
      var pool = pools[p];
      if (!isObj(pool) || !Identity.validateIdentity(pool.identity).ok || !Array.isArray(pool.rows)) {
        return blocked(['invalid-pool']);
      }
    }

    var pair = null;
    if (pools.length === 2) {
      pair = Identity.compatible(pools[0].identity, pools[1].identity);
      if (!pair.ok) return blocked([pair.reason]);
    } else if (pools[0].identity.provenance.confidence !== 'verified') {
      return blocked(['unknown-provenance']);
    }

    // Validación de filas antes de cualquier cálculo: precio entero positivo,
    // día no futuro, clave exacta, variante sin promoción a ID base.
    for (var q = 0; q < pools.length; q++) {
      var seenKeys = Object.create(null);
      for (var i = 0; i < pools[q].rows.length; i++) {
        var r = pools[q].rows[i];
        if (!isObj(r) || !validKey(r.sourceKey)) return blocked(['invalid-sourceKey']);
        if (seenKeys[r.sourceKey]) return blocked(['duplicate-sourceKey']);
        seenKeys[r.sourceKey] = true;
        if (!isInt(r.unitPriceCopper) || r.unitPriceCopper <= 0) return blocked(['invalid-price']);
        if (!isInt(r.observedDay) || r.observedDay > todayDay) return blocked(['future-observation']);
        if (r.itemId !== null && r.itemId !== undefined) {
          if (!isInt(r.itemId) || r.itemId <= 0) return blocked(['invalid-itemId']);
          if (!/^[0-9]+$/.test(r.sourceKey) || Number(r.sourceKey) !== r.itemId) return blocked(['variant-promotion']);
        }
      }
    }

    if (pair && pair.samePool) return blocked(['shared-pool-use-single-series']);
    var byA = Object.create(null), byB = Object.create(null);
    for (var a = 0; a < pools[0].rows.length; a++) byA[pools[0].rows[a].sourceKey] = pools[0].rows[a];
    if (pools.length === 2) for (var b = 0; b < pools[1].rows.length; b++) byB[pools[1].rows[b].sourceKey] = pools[1].rows[b];

    // Sesgo: solo entre filas presentes en ambos lados. No se compara
    // ausencia como cero.
    var keys = Object.keys(byA);
    if (pools.length === 2) {
      var extra = Object.keys(byB);
      for (var e = 0; e < extra.length; e++) if (keys.indexOf(extra[e]) < 0) keys.push(extra[e]);
      for (var s = 0; s < keys.length; s++) {
        var ka = byA[keys[s]], kb = byB[keys[s]];
        if (!ka || !kb) continue;
        var lo = Math.min(ka.unitPriceCopper, kb.unitPriceCopper);
        var hi = Math.max(ka.unitPriceCopper, kb.unitPriceCopper);
        if (lo > 0 && (hi - lo) / lo > skewMax) return blocked(['excessive-skew']);
      }
    }

    var rows = [];
    var coverage = { A: aggregate(pools[0]) };
    if (pools.length === 2) coverage.B = aggregate(pools[1]);

    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var ra = byA[key], rb = pools.length === 2 ? byB[key] : null;
      var reasons = [];
      var sideA = ra ? sideOf(ra, commissionFor(opt, pools[0].identity.postingChannel), todayDay, freshDays, reasons, 'a') : null;
      var sideB = rb ? sideOf(rb, commissionFor(opt, pools[1].identity.postingChannel), todayDay, freshDays, reasons, 'b') : null;
      var netScenario = (sideA ? sideA.scenario : true) || (sideB ? sideB.scenario : true);
      var delta = null;
      if (ra && rb) {
        var useNet = !netScenario && sideA.netCopper !== null && sideB.netCopper !== null;
        var diff = useNet
          ? sideB.netCopper - sideA.netCopper
          : rb.unitPriceCopper - ra.unitPriceCopper;
        delta = Number.isSafeInteger(diff) ? diff : null;
        if (diff !== null && !Number.isSafeInteger(diff)) { netScenario = true; reasons.push('delta-overflow'); }
      }

      var row = {
        sourceKey: key,
        itemId: ra ? ra.itemId : (rb ? rb.itemId : null),
        variantOf: null,
        grossCopper: ra ? ra.unitPriceCopper : null,
        a: sideA,
        b: sideB,
        deltaCopper: delta,
        netScenario: netScenario,
        commission: {
          a: sideA ? sideA.commission : null,
          b: sideB ? sideB.commission : null,
        },
        recommendation: null,
        reasons: reasons,
        coverage: { a: ra ? ra.coverage || null : null, b: rb ? rb.coverage || null : null },
      };

      if (pools.length === 1) {
        var alt = pools[0].alternateChannel;
        if (isObj(alt) && isObj(alt.commission)) {
          var altNet = netOf(ra.unitPriceCopper, commissionFor(opt, alt.channel, alt.commission));
          row.channels = [
            { channel: pools[0].identity.postingChannel, grossCopper: ra.unitPriceCopper, netCopper: sideA.netCopper, commission: sideA.commission },
            { channel: alt.channel, grossCopper: ra.unitPriceCopper, netCopper: altNet.netCopper, commission: commissionFor(opt, alt.channel, alt.commission) },
          ];
          if (altNet.reason) row.reasons.push(altNet.reason);
          row.netScenario = true; // dos canales nunca son dos series de precios
        } else {
          row.channels = [{ channel: pools[0].identity.postingChannel, grossCopper: ra.unitPriceCopper, netCopper: sideA.netCopper }];
        }
      } else if (!netScenario && sideA && sideB && !sideA.stale && !sideB.stale && sideA.confirmed && sideB.confirmed &&
                 sideA.coverage && sideB.coverage && delta !== null && delta !== 0) {
        row.recommendation = 'scenario';
      }
      rows.push(row);
    }

    return {
      status: pools.length === 1 ? 'single-pool' : 'comparable',
      reasons: [],
      rows: rows,
      coverage: coverage,
      liquidityClaim: null,
      asOfDay: todayDay,
      freshDays: freshDays,
      poolRelationship: pair ? pair.reason : null,
    };
  }

  function sideOf(row, commission, todayDay, freshDays, reasons, prefix) {
    var net = netOf(row.unitPriceCopper, commission);
    if (net.reason) reasons.push(prefix + ':' + net.reason);
    var age = todayDay - row.observedDay;
    return {
      unitPriceCopper: row.unitPriceCopper,
      grossCopper: row.unitPriceCopper,
      netCopper: net.netCopper,
      scenario: net.scenario,
      observedDay: row.observedDay,
      ageDays: age,
      stale: age > freshDays,
      confirmed: row.confirmed === true,
      available: row.available === undefined ? null : row.available,
      coverage: row.coverage || null,
      commission: commission,
    };
  }

  var api = { compare: compare, netOf: netOf };
  var root = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (root) root.HunterCompare = api;
})();
