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

WoWForeverBridgeLogic = Logic
