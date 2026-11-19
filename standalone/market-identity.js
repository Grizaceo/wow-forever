/*
 * market-identity.js — contrato PURO de identidad económica (capital/neutral).
 *
 * Sin red, sin DOM, sin datos del juego, sin reloj. La identidad NUNCA se
 * deduce de un nombre de reino, carpeta, facción o ciudad: valores no
 * acreditados son el centinela explícito UNKNOWN. Un ámbito opaco local
 * (`localScope`) se recibe del llamador; jamás se deriva de una ruta/cuenta.
 *
 * Superficie (UMD — window.HunterIdentity y module.exports):
 *   UNKNOWN, GAME, RULESETS
 *   unknownIdentity(rawSourceKey, localScope) -> identity (fail-closed)
 *   accreditedIdentity(meta)                  -> identity (verificado, validado)
 *   validateIdentity(input)                   -> { ok, identity|null, errors }
 *   identityKey(identity)                     -> string canónica (JSON array)
 *   itemIdentityKey(identity, sourceKey)      -> string canónica
 *   compatible(a, b)                          -> { ok, samePool, comparableChannels, reason }
 *   canCompare(a, b)                          -> boolean
 */
(function () {
  'use strict';

  var UNKNOWN = 'UNKNOWN';
  var GAME = 'wow-forever';
  var RULESETS = ['PvE', 'PvP', 'HC', 'RP'];
  var MAX_KEY = 300;
  var MAX_SCOPE = 120;
  var MAX_LABEL = 60;

  var ID_KEYS = ['game', 'region', 'ruleset', 'auctionPool', 'postingChannel', 'localScope', 'provenance', 'rawSourceKey'];
  var PROV_KEYS = ['method', 'confidence', 'scope', 'verifiedAt'];
  var SCOPE_KEYS = ['observationKind', 'fromDay', 'toDay', 'sourceLabel'];
  var METHODS = ['unknown', 'legacy-import', 'separate-source-observation'];

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function hasOnly(o, keys) {
    if (!isObj(o)) return false;
    var ks = Object.keys(o);
    for (var i = 0; i < ks.length; i++) if (keys.indexOf(ks[i]) < 0) return false;
    return true;
  }
  function isInt(v) { return typeof v === 'number' && Number.isSafeInteger(v); }
  function isDay(v) { return v === null || (isInt(v) && v >= 0 && v <= 100000); }
  function isIso(v) { return typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v)); }
  function cleanText(s, max) {
    return typeof s === 'string' && s.length >= 1 && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s);
  }
  // Un ámbito opaco NO puede parecerse a una cuenta/ruta: se rechazan
  // separadores de ruta y marcadores de WTF/account.
  function safeLocalScope(s) {
    return cleanText(s, MAX_SCOPE) && !/[\/\\]/.test(s) &&
      !/(account|wtf|savedvariables|interface)/i.test(s);
  }
  function knownOrUnknown(v) { return typeof v === 'string' && (v === UNKNOWN || cleanText(v, MAX_KEY)); }

  function unknownIdentity(rawSourceKey, localScope) {
    return {
      game: UNKNOWN,
      region: UNKNOWN,
      ruleset: UNKNOWN,
      auctionPool: UNKNOWN,
      postingChannel: null,
      localScope: safeLocalScope(localScope) ? localScope : 'local:unknown',
      provenance: {
        method: 'unknown',
        confidence: 'unknown',
        scope: { observationKind: 'legacy', fromDay: null, toDay: null, sourceLabel: 'Auctionator.lua' },
        verifiedAt: null,
      },
      rawSourceKey: typeof rawSourceKey === 'string' ? rawSourceKey.slice(0, MAX_KEY) : '',
    };
  }

  // Construye una identidad VERIFICADA a partir de metadatos explícitos. No
  // hay valores por defecto para región/ruleset/pool: si faltan, falla.
  function accreditedIdentity(meta) {
    var m = isObj(meta) ? meta : {};
    var id = {
      game: m.game,
      region: m.region,
      ruleset: m.ruleset,
      auctionPool: m.auctionPool,
      postingChannel: m.postingChannel === undefined ? null : m.postingChannel,
      localScope: m.localScope,
      rawSourceKey: m.rawSourceKey,
      provenance: {
        method: 'separate-source-observation',
        confidence: 'verified',
        scope: {
          observationKind: 'fresh-scan',
          fromDay: m.fromDay,
          toDay: m.toDay,
          sourceLabel: m.sourceLabel,
        },
        verifiedAt: m.verifiedAt,
      },
    };
    var v = validateIdentity(id);
    if (!v.ok) throw new Error('identidad no acreditada: ' + v.errors.join('; '));
    return v.identity;
  }

  function validateIdentity(input) {
    var errors = [];
    if (!hasOnly(input, ID_KEYS)) return { ok: false, identity: null, errors: ['shape'] };
    var id = input;
    if (id.game !== UNKNOWN && id.game !== GAME) errors.push('game');
    if (!knownOrUnknown(id.region)) errors.push('region');
    if (id.ruleset !== UNKNOWN && RULESETS.indexOf(id.ruleset) < 0) errors.push('ruleset');
    if (!knownOrUnknown(id.auctionPool)) errors.push('auctionPool');
    if (id.postingChannel !== null && id.postingChannel !== UNKNOWN && !cleanText(id.postingChannel, MAX_KEY)) errors.push('postingChannel');
    if (!safeLocalScope(id.localScope)) errors.push('localScope');
    if (typeof id.rawSourceKey !== 'string' || id.rawSourceKey.length < 1 || id.rawSourceKey.length > MAX_KEY || /[\u0000-\u001f\u007f]/.test(id.rawSourceKey)) errors.push('rawSourceKey');

    var p = id.provenance;
    if (!hasOnly(p, PROV_KEYS)) {
      errors.push('provenance.shape');
    } else {
      if (METHODS.indexOf(p.method) < 0) errors.push('provenance.method');
      if (p.confidence !== 'unknown' && p.confidence !== 'verified') errors.push('provenance.confidence');
      if (!hasOnly(p.scope, SCOPE_KEYS)) {
        errors.push('provenance.scope.shape');
      } else {
        if (p.scope.observationKind !== 'fresh-scan' && p.scope.observationKind !== 'legacy') errors.push('scope.kind');
        if (!isDay(p.scope.fromDay) || !isDay(p.scope.toDay)) errors.push('scope.days');
        if (p.scope.fromDay !== null && p.scope.toDay !== null && p.scope.toDay < p.scope.fromDay) errors.push('scope.order');
        if (!(p.scope.sourceLabel === null || cleanText(p.scope.sourceLabel, MAX_LABEL))) errors.push('scope.label');
      }
      if (p.verifiedAt !== null && !isIso(p.verifiedAt)) errors.push('verifiedAt');
      if (p.confidence === 'verified') {
        if (p.method !== 'separate-source-observation') errors.push('verified.method');
        if (id.game !== GAME || id.region === UNKNOWN || id.ruleset === UNKNOWN || id.auctionPool === UNKNOWN) errors.push('verified.scope');
        if (p.scope.observationKind !== 'fresh-scan' || p.verifiedAt === null) errors.push('verified.observation');
      }
      if (p.confidence === 'unknown' && p.method === 'separate-source-observation') errors.push('unknown.method');
    }
    return errors.length ? { ok: false, identity: null, errors: errors } : { ok: true, identity: freeze(id), errors: [] };
  }

  function freeze(id) {
    return {
      game: id.game, region: id.region, ruleset: id.ruleset, auctionPool: id.auctionPool,
      postingChannel: id.postingChannel, localScope: id.localScope, rawSourceKey: id.rawSourceKey,
      provenance: {
        method: id.provenance.method, confidence: id.provenance.confidence,
        scope: {
          observationKind: id.provenance.scope.observationKind,
          fromDay: id.provenance.scope.fromDay, toDay: id.provenance.scope.toDay,
          sourceLabel: id.provenance.scope.sourceLabel,
        },
        verifiedAt: id.provenance.verifiedAt,
      },
    };
  }

  // Serialización canónica: un array JSON es inequívoco (sin concatenaciones
  // ambiguas con ':'). Dos identidades distintas nunca colisionan.
  function identityKey(identity) {
    var v = validateIdentity(identity);
    if (!v.ok) throw new Error('identidad inválida');
    var id = v.identity;
    return JSON.stringify([id.game, id.region, id.ruleset, id.auctionPool, id.postingChannel, id.localScope, id.rawSourceKey]);
  }
  function itemIdentityKey(identity, sourceKey) {
    if (typeof sourceKey !== 'string' || sourceKey.length < 1 || sourceKey.length > MAX_KEY) throw new Error('sourceKey inválida');
    return JSON.stringify([identityKey(identity), sourceKey]);
  }

  function compatible(a, b) {
    var va = validateIdentity(a), vb = validateIdentity(b);
    if (!va.ok || !vb.ok) return { ok: false, samePool: false, comparableChannels: false, reason: 'invalid-identity' };
    var x = va.identity, y = vb.identity;
    if (x.provenance.confidence !== 'verified' || y.provenance.confidence !== 'verified') {
      return { ok: false, samePool: false, comparableChannels: false, reason: 'unknown-provenance' };
    }
    if (x.game !== y.game) return { ok: false, samePool: false, comparableChannels: false, reason: 'different-game' };
    if (x.region !== y.region) return { ok: false, samePool: false, comparableChannels: false, reason: 'different-region' };
    if (x.ruleset !== y.ruleset) return { ok: false, samePool: false, comparableChannels: false, reason: 'different-ruleset' };
    if (x.localScope !== y.localScope) return { ok: false, samePool: false, comparableChannels: false, reason: 'different-local-scope' };
    return {
      ok: true,
      samePool: x.auctionPool === y.auctionPool,
      comparableChannels: x.auctionPool === y.auctionPool && x.postingChannel !== y.postingChannel,
      reason: x.auctionPool === y.auctionPool ? 'same-pool' : 'separate-pools',
    };
  }
  function canCompare(a, b) { return compatible(a, b).ok; }

  var api = {
    UNKNOWN: UNKNOWN, GAME: GAME, RULESETS: RULESETS,
    unknownIdentity: unknownIdentity,
    accreditedIdentity: accreditedIdentity,
    validateIdentity: validateIdentity,
    identityKey: identityKey,
    itemIdentityKey: itemIdentityKey,
    compatible: compatible,
    canCompare: canCompare,
  };
  var root = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (root) root.HunterIdentity = api;
})();
