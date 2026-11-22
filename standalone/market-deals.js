/* market-deals.js — clasificación determinista de ofertas y sobreprecios.
 *
 * Módulo puro (sin red, sin DOM, sin datos del juego). Compara el último
 * mínimo anunciado (`unitPriceCopper`) contra la mediana de los mínimos
 * diarios históricos (`HunterHistory.priceStats`), ajustada por confianza
 * estadística (días de muestra) y tendencia.
 *
 * Todo es approx: los precios son ofertas anunciadas, no ventas; los días
 * sin observación no cuentan; una "oferta" es una pista para investigar,
 * nunca una recomendación de compra. `available` es un CONTEO DE OFERTAS
 * anunciadas: se informa aparte, nunca es confianza estadística ni volumen
 * vendido, y no altera el peso del score.
 *
 * Reglas (umbrales configurables vía opts de dealInfo):
 *  - 'sin-datos': menos de minDays (2) días de muestra o mediana inválida.
 *  - 'oferta':     descuento >= offerPct (20%) bajo la mediana histórica.
 *  - 'sobreprecio': prima >= overPct (20%) sobre la mediana histórica.
 *  - 'estable':    cualquier otro caso con datos suficientes.
 *  - Confianza: SOLO días de muestra (>=7 alta, >=4 media, resto baja — con
 *    el piso de 2 días todo sale 'baja' hasta tener 4+). Si el día observado
 *    tuvo pocas ofertas (available <= 2) se reporta en `available`/`reasons`
 *    como conteo de ofertas, SIN bajar la confianza ni cambiar el score.
 *  - Tendencia: `plana` (estado de crafteo) se normaliza a `estable`; `sube`
 *    amplifica (precio bajo en mercado al alza es más notable), `baja` atenúa;
 *    `sin-datos` usa peso neutro. Ningún estado cae a un peso misterioso.
 *  - score (ordenar "mejores ofertas"): discount * pesoConfianza *
 *    pesoTendencia. Es un RANKING HEURÍSTICO: los pesos están elegidos a mano,
 *    sin calibración externa ni validación con ventas; `ranking` expone los
 *    pesos aplicados para que UI/docs lo rotulen. No es probabilidad ni
 *    predicción de colocación en subasta.
 *
 * Superficie (UMD — window.HunterDeals y module.exports):
 *   dealInfo(item, opts) -> {kind,score,discount,confidence,days,
 *                           medianaLow,minLow,available,ratio,reasons,
 *                           ranking:{formula,heuristic,confWeight,
 *                                    trendWeight,trend}}
 *   normalizarTendencia(t) -> 'sube'|'baja'|'estable'|'sin-datos'
 *   MIN_DAYS/OFFER_PCT/OVER_PCT/HIGH_DAYS/MID_DAYS/THIN_AVAIL,
 *   CONF_W/TREND_W (congeladas, sin deriva accidental)
 */
(function () {
  'use strict';

  var MIN_DAYS = 2;
  var OFFER_PCT = 0.20;
  var OVER_PCT = 0.20;
  var HIGH_DAYS = 7;
  var MID_DAYS = 4;
  var THIN_AVAIL = 2;
  var CONF_W = Object.freeze({ alta: 1, media: 0.8, baja: 0.55 });
  var TREND_W = Object.freeze({ sube: 1.15, baja: 0.9, estable: 1, plana: 1, 'sin-datos': 1 });
  var CONF_NAME = Object.freeze({ 0: 'baja', 1: 'media', 2: 'alta' });
  // Alias explícito: crafteo usa `plana`, priceStats usa `estable`. Sin esto
  // el estado caía al peso por defecto 1 por accidente, no por contrato.
  var TREND_ALIAS = Object.freeze({ plana: 'estable' });

  function normalizarTendencia(t) {
    if (typeof t !== 'string') return 'sin-datos';
    if (Object.prototype.hasOwnProperty.call(TREND_ALIAS, t)) return TREND_ALIAS[t];
    return Object.prototype.hasOwnProperty.call(TREND_W, t) ? t : 'sin-datos';
  }

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
      ratio: null, reasons: [], ranking: null,
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
    // Confianza = tamaño de muestra (días), nada que ver con el conteo de
    // ofertas anunciadas: `available` no es venta ni incertidumbre estadística.
    var lvl = days >= HIGH_DAYS ? 2 : days >= MID_DAYS ? 1 : 0;
    var confidence = CONF_NAME[lvl];
    var tendencia = normalizarTendencia(st.tendencia);
    var confWeight = CONF_W[confidence];
    var trendWeight = TREND_W[tendencia];
    var out = {
      kind: 'estable', score: null, discount: discount, confidence: confidence,
      days: days, medianaLow: st.medianaLow, minLow: st.minLow,
      available: avail, ratio: ratio, reasons: [],
      // Ranking heurístico: se exponen los pesos aplicados para poder rotular
      // la cifra; no es probabilidad, no está calibrado con ventas.
      ranking: {
        formula: 'discount*confWeight*trendWeight', heuristic: true,
        confWeight: confWeight, trendWeight: trendWeight, trend: tendencia,
      },
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
      out.reasons.push('Confianza ' + confidence + ' (' + days + ' día' + (days === 1 ? '' : 's') + ' de muestra).');
    }
    if (avail !== null && avail <= THIN_AVAIL) {
      out.reasons.push('Dato de liquidez: pocas ofertas anunciadas ese día (' + avail +
        ') — conteo de ofertas, no ventas ni confianza estadística.');
    }
    out.reasons.push('Ranking heurístico: pesos elegidos a mano, sin calibración externa ni ventas verificadas.');
    out.score = discount * confWeight * trendWeight;
    return out;
  }

  var HunterDeals = {
    MIN_DAYS: MIN_DAYS, OFFER_PCT: OFFER_PCT, OVER_PCT: OVER_PCT,
    HIGH_DAYS: HIGH_DAYS, MID_DAYS: MID_DAYS, THIN_AVAIL: THIN_AVAIL,
    CONF_W: CONF_W, TREND_W: TREND_W,
    dealInfo: dealInfo, normalizarTendencia: normalizarTendencia,
  };

  var root = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this;
  // Como módulo (Node, bundle de Desktop) solo se exporta: no se toca el global.
  if (typeof module === 'object' && module && module.exports) module.exports = HunterDeals;
  else if (root) root.HunterDeals = HunterDeals;
})();
