/* market-deals.js — clasificación determinista de ofertas y sobreprecios.
 *
 * Módulo puro (sin red, sin DOM, sin datos del juego). Compara el último
 * mínimo anunciado (`unitPriceCopper`) contra la mediana de los mínimos
 * diarios históricos (`HunterHistory.priceStats`), ajustada por confianza
 * (días de muestra + liquidez observada) y tendencia.
 *
 * Todo es approx: los precios son ofertas anunciadas, no ventas; los días
 * sin observación no cuentan; una "oferta" es una pista para investigar,
 * nunca una recomendación de compra.
 *
 * Reglas (umbrales configurables vía opts de dealInfo):
 *  - 'sin-datos': menos de minDays (2) días de muestra o mediana inválida.
 *  - 'oferta':     descuento >= offerPct (20%) bajo la mediana histórica.
 *  - 'sobreprecio': prima >= overPct (20%) sobre la mediana histórica.
 *  - 'estable':    cualquier otro caso con datos suficientes.
 *  - Confianza: base por días (>=7 alta, >=4 media, resto baja — con el
 *    piso de 2 días todo resultado sale 'baja' hasta tener 4+); si el día
 *    observado tuvo <=2 ofertas (available) baja un nivel — un mínimo de 1-2
 *    publicaciones es más ruidoso. available null no penaliza (dato ausente,
 *    no liquidez baja).
 *  - score (para ordenar "mejores ofertas"): discount * pesoConfianza *
 *    pesoTendencia. Positivo = bajo la mediana. 'sube' amplifica (un precio
 *    bajo en mercado al alza es más notable), 'baja' atenúa.
 *
 * Superficie (UMD — window.HunterDeals y module.exports):
 *   dealInfo(item, opts) -> {kind,score,discount,confidence,days,
 *                           medianaLow,minLow,available,ratio,reasons}
 *   MIN_DAYS/OFFER_PCT/OVER_PCT/HIGH_DAYS/MID_DAYS/THIN_AVAIL (constantes)
 */
(function () {
  'use strict';

  var MIN_DAYS = 2;
  var OFFER_PCT = 0.20;
  var OVER_PCT = 0.20;
  var HIGH_DAYS = 7;
  var MID_DAYS = 4;
  var THIN_AVAIL = 2;
  var CONF_W = { alta: 1, media: 0.8, baja: 0.55 };
  var TREND_W = { sube: 1.15, baja: 0.9, estable: 1, 'sin-datos': 1 };
  var CONF_NAME = { 0: 'baja', 1: 'media', 2: 'alta' };

  function histLib() {
    if (typeof module === 'object' && module && module.exports) {
      try { return require('./market-history.js'); } catch (e) { /* sin stats */ }
    }
    var root = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this;
    return root && root.HunterHistory ? root.HunterHistory : null;
  }

  function numOpt(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function intOpt(v, d) { return Number.isSafeInteger(v) && v > 0 ? v : d; }

  // Acepta entradas {day,low,...,available} y filas compactas del store
  // ([d,l] | [d,l,a] | [d,l,h,a]). Devuelve {day,available} válido o null.
  function entryParts(e) {
    if (Array.isArray(e)) {
      if (e.length < 2 || !Number.isSafeInteger(e[0])) return null;
      var avail = null;
      if (e.length === 3) avail = e[2] == null ? null : e[2];
      else if (e.length >= 4) avail = e[3] == null ? null : e[3];
      return { day: e[0], available: avail };
    }
    if (e && typeof e === 'object' && Number.isSafeInteger(e.day)) {
      return { day: e.day, available: e.available == null ? null : e.available };
    }
    return null;
  }

  // Liquidez del día observado (o la observación con available más reciente).
  function lastAvailable(item) {
    var h = item && item.history;
    var list = Array.isArray(h) ? h : [];
    var observed = item.observedDay;
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var p = entryParts(list[i]);
      if (!p || p.available === null) continue;
      if (observed !== null && observed !== undefined && p.day === observed) return p.available;
      if (!best || p.day > best.day) best = { day: p.day, available: p.available };
    }
    return best ? best.available : null;
  }

  function empty(days) {
    return {
      kind: 'sin-datos', score: null, discount: null, confidence: 'ninguna',
      days: days | 0, medianaLow: null, minLow: null, available: null,
      ratio: null, reasons: [],
    };
  }

  function dealInfo(item, opts) {
    var o = opts || {};
    var offerPct = numOpt(o.offerPct, OFFER_PCT);
    var overPct = numOpt(o.overPct, OVER_PCT);
    var minDays = intOpt(o.minDays, MIN_DAYS);
    if (!item || typeof item !== 'object') return empty(0);
    var cur = item.unitPriceCopper;
    if (!Number.isSafeInteger(cur) || cur <= 0) return empty(0);
    var H = histLib();
    if (!H || typeof H.priceStats !== 'function') return empty(0);
    var st = H.priceStats(item);
    if (!st) return empty(0);
    var days = st.diasMuestra | 0;
    if (!st.medianaLow || st.medianaLow <= 0 || days < minDays) {
      var out0 = empty(days);
      out0.medianaLow = st.medianaLow;
      out0.minLow = st.minLow;
      return out0;
    }
    var avail = lastAvailable(item);
    var ratio = cur / st.medianaLow;
    // (mediana - actual)/mediana da bordes más limpios que 1-ratio en FP.
    var discount = (st.medianaLow - cur) / st.medianaLow;
    var EPS = 1e-9;
    var base = days >= HIGH_DAYS ? 2 : days >= MID_DAYS ? 1 : 0;
    var liq = (avail !== null && avail <= THIN_AVAIL) ? -1 : 0;
    var lvl = Math.max(0, Math.min(2, base + liq));
    var confidence = CONF_NAME[lvl];
    var out = {
      kind: 'estable', score: null, discount: discount, confidence: confidence,
      days: days, medianaLow: st.medianaLow, minLow: st.minLow,
      available: avail, ratio: ratio, reasons: [],
    };
    var pct = Math.round(Math.abs(discount) * 100);
    if (discount >= offerPct - EPS) {
      out.kind = 'oferta';
      out.reasons.push('Precio actual ' + pct + '% bajo la mediana histórica (approx).');
    } else if (discount <= -overPct + EPS) {
      out.kind = 'sobreprecio';
      out.reasons.push('Precio actual ' + pct + '% sobre la mediana histórica (approx).');
    } else {
      out.reasons.push('Precio cercano a la mediana histórica (approx).');
    }
    if (confidence !== 'alta') {
      out.reasons.push('Confianza ' + confidence + ' (' + days + ' día' + (days === 1 ? '' : 's') +
        ' de muestra' + (avail !== null && avail <= THIN_AVAIL ? ', pocas ofertas ese día' : '') + ').');
    }
    out.score = discount * (CONF_W[confidence] || 0.55) * (TREND_W[st.tendencia] || 1);
    return out;
  }

  var HunterDeals = {
    MIN_DAYS: MIN_DAYS, OFFER_PCT: OFFER_PCT, OVER_PCT: OVER_PCT,
    HIGH_DAYS: HIGH_DAYS, MID_DAYS: MID_DAYS, THIN_AVAIL: THIN_AVAIL,
    dealInfo: dealInfo,
  };

  var root = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this;
  // Como módulo (Node, bundle de Desktop) solo se exporta: no se toca el global.
  if (typeof module === 'object' && module && module.exports) module.exports = HunterDeals;
  else if (root) root.HunterDeals = HunterDeals;
})();
