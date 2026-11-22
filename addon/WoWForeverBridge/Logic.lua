-- WoW Forever Bridge — lógica pura (sin API de WoW). Testeable con lua5.1.
-- Formato de datos: el global público AUCTIONATOR_PRICE_DATABASE de Auctionator
-- (__dbversion 8, reino version 2, campos m/h/l/a documentados en el parser
-- propio market.js del repo). Este addon NO usa código de Auctionator.
--
-- Diario: WoWForeverBridgeDB = { version=1, retentionDays=14,
--   entries = { [día] = { day=día, at=unix, realm=nombre,
--     items = { [sourceKey] = { d=díaObservado, m=cobre, hi=..., lo=..., av=... } } } } }
-- Una entrada por día de reloj; los ítems llevan su propio día de observación.
-- Semántica diaria idéntica a Auctionator: hi=max de mínimos, lo=min, av=max
-- disponible, m=último mínimo visto. El plugin fusiona el diario en su histórico.

local Logic = {}

local EPOCH = 1577836800 -- 2020-01-01 UTC (SCAN_DAY_0 de Auctionator)
local DAY = 86400

function Logic.dayOf(ts)
  return math.floor((ts - EPOCH) / DAY)
end

-- Observación más reciente de un ítem {m, h={[día]=precio}, l, a}.
-- Acepta claves de día numéricas o string numérico. Sin h fechado -> nil.
function Logic.latestObs(item)
  if type(item) ~= 'table' or type(item.h) ~= 'table' then return nil end
  local maxDay, hi = nil, nil
  for d, p in pairs(item.h) do
    local dn = tonumber(d)
    if dn and type(p) == 'number' and p > 0 and dn >= 0 then
      if maxDay == nil or dn > maxDay then maxDay, hi = dn, p end
    end
  end
  if maxDay == nil then return nil end
  local lo = hi
  if type(item.l) == 'table' then
    local lv = item.l[maxDay]
    if lv == nil then lv = item.l[tostring(maxDay)] end
    if type(lv) == 'number' and lv > 0 then lo = lv end
  end
  if lo > hi then lo = hi end
  local av = nil
  if type(item.a) == 'table' then
    local a = item.a[maxDay]
    if a == nil then a = item.a[tostring(maxDay)] end
    if type(a) == 'number' and a >= 0 then av = a end
  end
  local m = item.m
  if type(m) ~= 'number' or m <= 0 then m = hi end
  return { d = maxDay, m = m, hi = hi, lo = lo, av = av }
end

-- Huella barata del reino: cambia cuando cualquier observación cambia.
function Logic.fingerprint(realm)
  if type(realm) ~= 'table' then return nil end
  local n, sum = 0, 0
  for k, item in pairs(realm) do
    if k ~= 'version' and type(item) == 'table' then
      local obs = Logic.latestObs(item)
      if obs then
        n = n + 1
        sum = sum + obs.d + obs.m + obs.hi + obs.lo + (obs.av or 0)
      end
    end
  end
  return n .. ':' .. sum
end

-- Fusiona el estado actual del reino en la entrada del día en curso.
-- Devuelve el nº de ítems añadidos o cambiados.
function Logic.mergeEntry(entry, realm, ts, realmName)
  local changed = 0
  entry.at = ts
  entry.realm = realmName
  entry.items = entry.items or {}
  for k, item in pairs(realm) do
    if k ~= 'version' then
      local key = nil
      if type(k) == 'string' then key = k elseif type(k) == 'number' then key = tostring(k) end
      local obs = nil
      if key then obs = Logic.latestObs(item) end
      if obs then
        local old = entry.items[key]
        if old == nil or obs.d > old.d then
          entry.items[key] = obs
          changed = changed + 1
        elseif obs.d == old.d then
          local hi = math.max(old.hi, obs.hi)
          local lo = math.min(old.lo, obs.lo)
          local av = old.av
          if obs.av ~= nil then av = (av == nil) and obs.av or math.max(av, obs.av) end
          if hi ~= old.hi or lo ~= old.lo or av ~= old.av or obs.m ~= old.m then
            entry.items[key] = { d = obs.d, m = obs.m, hi = hi, lo = lo, av = av }
            changed = changed + 1
          end
        end
        -- obs.d < old.d: observación más vieja; el histórico del plugin ya la tiene.
      end
    end
  end
  return changed
end

-- Poda por retención (días) y tope duro de entradas (conserva las recientes).
function Logic.prune(journal, nowDay, maxEntries)
  local ret = journal.retentionDays or 14
  local removed = 0
  for day in pairs(journal.entries) do
    if type(day) ~= 'number' or day < nowDay - ret then
      journal.entries[day] = nil
      removed = removed + 1
    end
  end
  local days = {}
  for day in pairs(journal.entries) do days[#days + 1] = day end
  table.sort(days)
  local cap = maxEntries or 60
  while #days > cap do
    journal.entries[days[1]] = nil
    table.remove(days, 1)
    removed = removed + 1
  end
  return removed
end

-- Saneamiento al cargar: un SavedVariables corrupto nunca rompe el addon.
function Logic.ensure(journal)
  if type(journal) ~= 'table' or journal.version ~= 1 then
    return { version = 1, retentionDays = 14, entries = {} }
  end
  if type(journal.entries) ~= 'table' then journal.entries = {} end
  local r = journal.retentionDays
  if type(r) ~= 'number' or r < 1 or r > 60 then journal.retentionDays = 14 end
  return journal
end

-- Reino actual: clave GetRealmName(); si no está (reinos conectados), única
-- entrada de reino que sea tabla plana version 2 (las demás son blobs CBOR).
-- Ambigüedad: no se adivina.
function Logic.currentRealm(db, name)
  if type(db) ~= 'table' then return nil, nil end
  local realm = name ~= nil and db[name] or nil
  if type(realm) == 'table' and realm.version == 2 then return realm, name end
  local found, foundName = nil, nil
  for k, v in pairs(db) do
    if k ~= '__dbversion' and type(v) == 'table' and v.version == 2 then
      if found then return nil, nil end
      found, foundName = v, k
    end
  end
  return found, foundName
end

-- ===== Cosecha del catálogo de stats (itemID -> stats) =====
-- Matemática pura, sin API de WoW: se prueba con lua5.1.

-- Ids numéricos de un reino de Auctionator: solo claves decimales positivas,
-- ASC y sin duplicados (un número y su cadena son el mismo ítem).
function Logic.idsDaFonte(realm)
  local ids, vistos = {}, {}
  if type(realm) ~= 'table' then return ids end
  for k in pairs(realm) do
    local s = nil
    if type(k) == 'number' then s = tostring(k) elseif type(k) == 'string' then s = k end
    if s and #s <= 9 and string.match(s, '^%d+$') then
      local id = tonumber(s)
      if id and id > 0 and not vistos[id] then
        vistos[id] = true
        ids[#ids + 1] = id
      end
    end
  end
  table.sort(ids)
  return ids
end

-- Siguiente lote a cosechar: recorre `ids` (ASC) desde el primer id > cursor,
-- salta los ya resueltos y devuelve hasta `maxLote` ids pendientes. Al llegar
-- al final da una vuelta (volta=true) para reintentar los no cacheados.
-- Nunca da más de una vuelta completa por lote: el bucle está acotado por #ids.
function Logic.loteColheita(ids, cursor, resolvidos, maxLote)
  local lote, n = {}, type(ids) == 'table' and #ids or 0
  local cur = type(cursor) == 'number' and cursor or 0
  if n == 0 or type(maxLote) ~= 'number' or maxLote < 1 then
    return { ids = lote, cursor = cur, volta = false }
  end
  local pos, tentativas, volta = 1, 0, false
  while pos <= n and ids[pos] <= cur do pos = pos + 1 end
  local novoCursor = cur
  while #lote < maxLote and tentativas < n do
    if pos > n then
      volta = true
      pos = 1
      novoCursor = 0
    end
    local id = ids[pos]
    if not (type(resolvidos) == 'table' and resolvidos[id] ~= nil) then
      lote[#lote + 1] = id
    end
    novoCursor = id
    pos = pos + 1
    tentativas = tentativas + 1
  end
  return { ids = lote, cursor = novoCursor, volta = volta }
end

-- Poda del catálogo: quita los ítems que ya no están en la fuente.
function Logic.podarCatalogo(itens, ids)
  local fonte, podados = {}, 0
  for i = 1, #(ids or {}) do fonte[ids[i]] = true end
  for id in pairs(itens or {}) do
    local n = tonumber(id)
    if not (n and fonte[n]) then
      itens[id] = nil
      podados = podados + 1
    end
  end
  return podados
end

-- Normaliza la tabla de C_Item.GetItemStats: solo claves string con números
-- distintos de 0, ordenadas y acotadas (determinismo byte a byte). Los valores
-- se redondean a 2 decimales (hay floats reales: DAMAGE_PER_SECOND_SHORT).
function Logic.normalizarStats(stats, maxStats)
  local out, truncado, claves = {}, false, {}
  if type(stats) ~= 'table' then return out, truncado end
  for k, v in pairs(stats) do
    if type(k) == 'string' and k ~= '' and type(v) == 'number' and v ~= 0 then
      claves[#claves + 1] = k
    end
  end
  table.sort(claves)
  local max = tonumber(maxStats) or 40
  for i = 1, #claves do
    if i > max then truncado = true break end
    out[claves[i]] = math.floor(stats[claves[i]] * 100 + 0.5) / 100
  end
  return out, truncado
end

-- Saneamiento del bloque pawnCatalogo (SavedVariables puede venir corrupto).
function Logic.ensureCatalogo(cat)
  if type(cat) ~= 'table' or cat.v ~= 1 then
    return { v = 1, itens = {} }
  end
  if type(cat.itens) ~= 'table' then cat.itens = {} end
  if type(cat.cursor) ~= 'number' or cat.cursor < 0 then cat.cursor = 0 end
  if type(cat.volta) ~= 'number' or cat.volta < 0 then cat.volta = 0 end
  if type(cat.ciclo) ~= 'number' or cat.ciclo < 0 then cat.ciclo = 0 end
  return cat
end

WoWForeverBridgeLogic = Logic
