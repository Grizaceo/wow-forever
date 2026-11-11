/* market-chart.js — gráficos SVG deterministas del historial de precios.
 *
 * Módulo puro (sin red, sin DOM, sin datos del juego): devuelve strings SVG
 * listos para innerHTML. Los colores usan variables del tema (var(--gold)…)
 * con fallbacks, así el mismo SVG sirve en file:// y en el build desktop.
 *
 * Convenciones:
 *  - Entrada: historial de snapshot [{day,low,high,available}] o filas
 *    compactas del store ([day,low] | [day,low,available] | [day,low,high,available]).
 *  - day = días desde 2020-01-01 UTC (mismo EPOCH que market.js / market-ui.js).
 *  - Solo se dibuja el mínimo diario (`low`), la misma métrica que priceStats.
 *    Los días sin observación no se interpolan: el eje X es el día real, así
 *    que los huecos se ven como huecos.
 *  - Mismo input → mismo SVG (sin Date.now, sin azar, orden normalizado).
 *
 * Superficie (UMD — window.HunterChart y module.exports):
 *   priceChart(history, opts) -> SVG con ejes (panel de detalle de ítem)
 *   sparkline(history, opts)  -> SVG mínimo sin ejes (tarjetas de farmeo)
 * opts: {current} último mínimo en cobre (marca "hoy", solo si cae en rango);
 *       {w,h,pad} overrides de geometría; {title} texto del <title> accesible.
 */
(function () {
  'use strict';

  var EPOCH = Date.UTC(2020, 0, 1), DAY = 86400000;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Acepta {day,low,...} y filas compactas; devuelve {day,low} válido o null.
  function toPoint(h) {
    var day, low;
    if (Array.isArray(h)) {
      if (h.length < 2) return null;
      day = h[0]; low = h[1];
    } else if (h && typeof h === 'object') {
      day = h.day; low = h.low;
    } else return null;
    if (!Number.isSafeInteger(day) || !Number.isSafeInteger(low) || low <= 0) return null;
    return { day: day, low: low };
  }

  // Ordena por día y deduplica. Las historias mergeadas nunca repiten día;
  // si un input trajera duplicados, gana el low mayor (elección conservadora
  // y determinista, independiente del orden del array).
  function points(history) {
    var list = Array.isArray(history) ? history : [];
    var byDay = new Map();
    for (var i = 0; i < list.length; i++) {
      var p = toPoint(list[i]);
      if (!p) continue;
      var prev = byDay.get(p.day);
      if (prev === undefined || p.low > prev) byDay.set(p.day, p.low);
    }
    var days = Array.from(byDay.keys()).sort(function (a, b) { return a - b; });
    return days.map(function (d) { return { day: d, low: byDay.get(d) }; });
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDay(day) {
    var d = new Date(EPOCH + day * DAY);
    return pad2(d.getUTCDate()) + '/' + pad2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  }
  // Cobre compacto para ejes: 156000 -> "15.6g", 45200 -> "4.5g", 8500 -> "85s".
  function fmtCopper(c) {
    c = Math.round(c);
    if (c >= 10000) {
      var g = c / 10000;
      return (g >= 100 ? Math.round(g) : Math.round(g * 10) / 10) + 'g';
    }
    if (c >= 100) return Math.round(c / 100) + 's';
    return c + 'c';
  }
  function niceStep(raw) {
    if (!(raw > 0) || !isFinite(raw)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function medianOf(vals) {
    var s = vals.slice().sort(function (a, b) { return a - b; });
    var n = s.length;
    return n % 2 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2);
  }

  var C = {
    line: 'var(--gold,#c9aa68)',
    end: 'var(--gold2,#f8b700)',
    area: 'var(--gold,#c9aa68)',
    dim: 'var(--dim,#8a8272)',
    axis: 'var(--border2,#4a3d24)',
    grid: 'var(--border,#33291a)',
  };

  function render(pts, o) {
    var W = o.w, H = o.h, P = o.pad;
    var n = pts.length;
    var lows = pts.map(function (p) { return p.low; });
    var lo = Math.min.apply(null, lows), hi = Math.max.apply(null, lows);
    var cur = o.current != null && Number.isFinite(o.current) && o.current > 0 ? o.current : null;
    // El precio actual no estira el dominio: un mínimo dudoso (pocas ofertas)
    // aplanaría la serie. Solo se dibuja si cae dentro del rango observado.
    if (hi <= lo) { var pad = Math.max(1, Math.round(lo * 0.05)); lo -= pad; hi += pad; }

    var x0 = P.l, x1 = W - P.r, y0 = P.t, y1 = H - P.b;
    var plotW = Math.max(1, x1 - x0), plotH = Math.max(1, y1 - y0);
    var dMin = pts[0].day, dMax = pts[n - 1].day;
    var sx = function (d) { return dMax > dMin ? x0 + (d - dMin) / (dMax - dMin) * plotW : x0 + plotW / 2; };
    var sy = function (v) { return y1 - (v - lo) / (hi - lo) * plotH; };
    var f1 = function (v) { return Math.round(v * 10) / 10; };

    var parts = [];
    parts.push('<svg class="mchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" style="width:100%;height:auto;display:block"><title>' + esc(o.title) + '</title>');

    // Área + línea del mínimo diario.
    var coords = pts.map(function (p) { return f1(sx(p.day)) + ',' + f1(sy(p.low)); });
    var firstX = coords[0].split(',')[0], lastX = coords[n - 1].split(',')[0];
    parts.push('<path d="M' + coords.join(' L') + ' L' + lastX + ',' + y1 + ' L' + firstX + ',' + y1 + ' Z" style="fill:' + C.area + ';fill-opacity:.10"/>');
    parts.push('<path d="M' + coords.join(' L') + '" fill="none" stroke-linejoin="round" stroke-linecap="round" style="stroke:' + C.line + ';stroke-width:1.6"/>');

    // Mediana histórica (referencia, no objetivo).
    var med = medianOf(lows);
    if (med > lo && med < hi) {
      parts.push('<line x1="' + x0 + '" y1="' + f1(sy(med)) + '" x2="' + x1 + '" y2="' + f1(sy(med)) + '" stroke-dasharray="4 3" style="stroke:' + C.dim + ';stroke-width:1"/>');
    }

    // Precio actual (solo si cae dentro del dominio).
    if (cur != null && cur >= lo && cur <= hi && dMax > dMin) {
      parts.push('<circle cx="' + f1(sx(dMax)) + '" cy="' + f1(sy(cur)) + '" r="3" style="fill:' + C.end + '"/>');
    }
    // Punto final de la serie.
    parts.push('<circle cx="' + lastX + '" cy="' + coords[n - 1].split(',')[1] + '" r="3" style="fill:' + C.end + '"/>');

    if (o.axes) {
      // Eje Y: ticks "nice" en cobre compacto.
      var step = niceStep((hi - lo) / 4);
      var firstTick = Math.ceil(lo / step) * step;
      parts.push('<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" style="stroke:' + C.axis + '"/>');
      parts.push('<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" style="stroke:' + C.axis + '"/>');
      var seen = {};
      for (var k = 0; k < 6; k++) {
        var v = Math.round((firstTick + k * step) * 100) / 100;
        if (v > hi || seen[v]) break;
        seen[v] = true;
        var ty = f1(sy(v));
        parts.push('<line x1="' + (x0 - 4) + '" y1="' + ty + '" x2="' + x0 + '" y2="' + ty + '" style="stroke:' + C.axis + '"/>');
        parts.push('<text x="' + (x0 - 7) + '" y="' + f1(ty + 3) + '" font-size="9.5" text-anchor="end" style="fill:' + C.dim + '">' + esc(fmtCopper(v)) + '</text>');
      }
      // Eje X: hasta 5 fechas, espaciadas por índice (deduplicadas).
      var xIdx = {};
      for (var i = 0; i <= 4; i++) {
        var idx = Math.round(i * (n - 1) / 4);
        if (xIdx[idx]) continue;
        xIdx[idx] = true;
        var px = f1(sx(pts[idx].day));
        parts.push('<line x1="' + px + '" y1="' + y1 + '" x2="' + px + '" y2="' + (y1 + 4) + '" style="stroke:' + C.axis + '"/>');
        parts.push('<text x="' + px + '" y="' + (y1 + 15) + '" font-size="9.5" text-anchor="middle" style="fill:' + C.dim + '">' + esc(fmtDay(pts[idx].day)) + '</text>');
      }
    }
    parts.push('</svg>');
    return parts.join('');
  }

  function priceChart(history, opts) {
    var o = opts || {};
    var pts = points(history);
    if (!pts.length) return '';
    return render(pts, {
      w: o.w || 720, h: o.h || 210,
      pad: o.pad || { l: 52, r: 12, t: 12, b: 30 },
      axes: o.axes !== false,
      current: o.current,
      title: o.title || 'Historial del precio mínimo diario (aprox, ofertas anunciadas)',
    });
  }

  function sparkline(history, opts) {
    var o = opts || {};
    var pts = points(history);
    if (pts.length < 2) return '';
    return render(pts, {
      w: o.w || 150, h: o.h || 34,
      pad: o.pad || { l: 4, r: 4, t: 5, b: 5 },
      axes: false,
      current: null,
      title: o.title || 'Tendencia del mínimo diario (aprox)',
    });
  }

  var HunterChart = { priceChart: priceChart, sparkline: sparkline, fmtCopper: fmtCopper, fmtDay: fmtDay };

  var root = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this;
  if (typeof module === 'object' && module && module.exports) module.exports = HunterChart;
  if (root) root.HunterChart = HunterChart;
})();
