/*
 * market-source.js — fuente AISLADA y validada de observaciones frescas.
 *
 * NO es el export crudo de Auctionator: ese histórico mezcla mercados y no
 * etiqueta neutral/capital (topología no verificada). Este módulo acepta solo
 * un documento explícito con identidad acreditada y ventana de observación
 * fresca; todo lo demás fail-closed. Sin eval, sin red, sin datos del juego.
 *
 * Superficie (UMD — window.HunterSource y module.exports):
 *   SCHEMA, MAX_BYTES
 *   validObservationInput(value) -> boolean
 *   parseSeparateSourceObservations(bytes|string) -> snapshot v2
 */
(function () {
  'use strict';

  var Identity = (typeof module === 'object' && module && module.exports)
    ? require('./market-identity.js')
    : (typeof globalThis !== 'undefined' && globalThis.HunterIdentity) || (typeof self !== 'undefined' && self.HunterIdentity);

  var SCHEMA = 'wow-forever/separate-source-observations/v1';
  var MAX_BYTES = 8 * 1024 * 1024;
  var EPOCH = Date.UTC(2020, 0, 1);
  var DAY_MS = 86400000;
  var MAX_WINDOW = 31;
  var MAX_REALMS = 100;
  var MAX_ITEMS = 100000;
  var MAX_KEY = 300;

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isInt(v) { return typeof v === 'number' && Number.isSafeInteger(v); }
  function isDay(v) { return isInt(v) && v >= 0 && v <= 100000; }
  function isIso(v) { return typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v)); }
  function key(v) { return typeof v === 'string' && v.length >= 1 && v.length <= MAX_KEY && !/[\u0000-\u001f\u007f]/.test(v); }
  function dayOf(iso) { return Math.floor((Date.parse(iso) - EPOCH) / DAY_MS); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function validObservationInput(v) {
    if (!isObj(v) || v.schema !== SCHEMA) return false;
    if (!isObj(v.identity) || !isObj(v.observation) || !Array.isArray(v.items) && !Array.isArray(v.realms)) return false;
    var obs = v.observation;
    if (!own(obs, 'scope') || obs.scope !== 'fresh-scan') return false;
    if (!isDay(obs.fromDay) || !isDay(obs.toDay) || obs.toDay < obs.fromDay) return false;
    if (obs.toDay - obs.fromDay > MAX_WINDOW) return false;
    if (!isIso(obs.capturedAt) || obs.toDay > dayOf(obs.capturedAt)) return false;
    // Debe poder acreditarse con metadatos explícitos (sin región deducida).
    try {
      Identity.accreditedIdentity({
        game: v.identity.game, region: v.identity.region, ruleset: v.identity.ruleset,
        auctionPool: v.identity.auctionPool, postingChannel: v.identity.postingChannel,
        localScope: v.identity.localScope, rawSourceKey: v.identity.rawSourceKey || 'isolated',
        fromDay: obs.fromDay, toDay: obs.toDay, sourceLabel: v.identity.sourceLabel,
        verifiedAt: v.identity.verifiedAt || obs.capturedAt,
      });
    } catch (e) { return false; }

    var realms = Array.isArray(v.realms) ? v.realms : [{ realm: v.identity.rawSourceKey || 'isolated', items: v.items }];
    if (realms.length < 1 || realms.length > MAX_REALMS) return false;
    var total = 0;
    for (var r = 0; r < realms.length; r++) {
      var realm = realms[r];
      if (!isObj(realm) || !key(realm.realm) || !Array.isArray(realm.items)) return false;
      var seen = Object.create(null);
      for (var i = 0; i < realm.items.length; i++) {
        var it = realm.items[i];
        if (!isObj(it) || !key(it.sourceKey)) return false;
        if (seen[it.sourceKey] !== undefined) return false; // ambiguo: se rechaza
        seen[it.sourceKey] = true;
        total++;
        if (total > MAX_ITEMS) return false;
        if (!(isInt(it.unitPriceCopper) && it.unitPriceCopper > 0)) return false;
        if (!isDay(it.observedDay) || it.observedDay < obs.fromDay || it.observedDay > obs.toDay) return false;
        if (it.available !== null && it.available !== undefined && !(isInt(it.available) && it.available >= 0)) return false;
        // itemId es pista de catálogo SOLO para claves decimales exactas: una
        // variante nunca se promueve al ID base.
        if (it.itemId !== null && it.itemId !== undefined) {
          if (!isInt(it.itemId) || it.itemId <= 0) return false;
          if (!/^[0-9]+$/.test(it.sourceKey) || Number(it.sourceKey) !== it.itemId) return false;
        }
      }
    }
    return true;
  }

  function toBytes(input) {
    if (typeof input === 'string') return new TextEncoder().encode(input);
    if (input instanceof Uint8Array) return input;
    if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input && typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    throw new Error('entrada inválida');
  }

  function parseSeparateSourceObservations(input, adapterVerified) {
    if (adapterVerified !== true) throw new Error('No hay adaptador verificado que acredite esta fuente aislada');
    var bytes = toBytes(input);
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('entrada fuera de tamaño');
    // Rechazo explícito del export crudo: nunca se le otorga procedencia.
    var asText = new TextDecoder().decode(bytes);
    if (asText.indexOf('AUCTIONATOR_PRICE_DATABASE') >= 0) throw new Error('export crudo de Auctionator no es fuente aislada');
    var doc;
    try { doc = JSON.parse(asText); } catch (e) { throw new Error('documento ilegible'); }
    if (!validObservationInput(doc)) throw new Error('observaciones aisladas inválidas');

    var obs = doc.observation;
    var realms = Array.isArray(doc.realms) ? doc.realms : [{ realm: doc.identity.rawSourceKey || 'isolated', items: doc.items }];
    var out = [];
    for (var r = 0; r < realms.length; r++) {
      var realm = realms[r];
      var identity = Identity.accreditedIdentity({
        game: doc.identity.game, region: doc.identity.region, ruleset: doc.identity.ruleset,
        auctionPool: doc.identity.auctionPool, postingChannel: doc.identity.postingChannel,
        localScope: doc.identity.localScope, rawSourceKey: realm.realm,
        fromDay: obs.fromDay, toDay: obs.toDay, sourceLabel: doc.identity.sourceLabel,
        verifiedAt: doc.identity.verifiedAt || obs.capturedAt,
      });
      var items = [];
      for (var i = 0; i < realm.items.length; i++) {
        var it = realm.items[i];
        var id = /^[0-9]+$/.test(it.sourceKey) && (it.itemId === undefined || it.itemId === null)
          ? Number(it.sourceKey) : (it.itemId === undefined || it.itemId === null ? null : it.itemId);
        var available = it.available === undefined ? null : it.available;
        items.push({
          sourceKey: it.sourceKey,
          itemId: id,
          unitPriceCopper: it.unitPriceCopper,
          observedDay: it.observedDay,
          available: available,
          confirmed: true,
          // Serie mínima confirmada: solo el día observado, nunca un histórico
          // heredado ni una promoción de variante.
          history: [{ day: it.observedDay, low: it.unitPriceCopper, high: it.unitPriceCopper, available: available }],
        });
      }
      out.push({ name: realm.realm, identity: identity, items: items });
    }
    return {
      schemaVersion: 2,
      sourceVersion: 8,
      importedAt: new Date().toISOString(),
      observation: { scope: 'fresh-scan', fromDay: obs.fromDay, toDay: obs.toDay, capturedAt: obs.capturedAt },
      realms: out,
      warnings: [],
    };
  }

  var api = {
    SCHEMA: SCHEMA, MAX_BYTES: MAX_BYTES,
    validObservationInput: validObservationInput,
    parseSeparateSourceObservations: parseSeparateSourceObservations,
  };
  var root = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (root) root.HunterSource = api;
})();
