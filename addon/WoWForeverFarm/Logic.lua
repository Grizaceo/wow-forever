-- WoW Forever Farm — lógica pura del contador de sesión (sin API de WoW).
-- Testeable con lua5.1 (addon/tests/test_farm.lua). El pegamento con el juego
-- vive en Farm.lua; aquí solo hay tiempo, conteos y botín.
--
-- WoWForeverFarmDB = { version=1, sessions = { [i] = sesión cerrada }, current = sesión abierta|nil,
--                      ui = { shown, point... } }
-- Sesión (v=1): marcas unix en segundos; duraciones en segundos; cobre en cobre.
--   start, stop, level, class, faction, active, paused, combat, looting, fights, deaths,
--   kills  = { [npcId] = n }            GUIDs de criaturas muertas (deduplicados)
--   killBy = { target=n, cleu=n, loot=n }  método que vio cada muerte primero
--   corpses= { [npcId] = n }            cadáveres saqueados
--   items  = { [npcId] = { [itemId] = qty } }   botín de cadáver por mob
--   skins  = { [npcId] = n }, skinItems = { [npcId] = { [itemId] = qty } }
--   gather = { [objectId] = n }, gatherItems = { [objectId] = { [itemId] = qty } }
--   other  = { [itemId] = qty }         botín sin origen conocido
--   money  = { loot=c, merchant=c, other=c }, coinsBy = { [npcId] = c }
--   zones  = { [uiMapId] = segundos }, path = "mapa:x,y;..." (cada 30 s, acotado)
--   ammo   = { start=n, stop=n }, bags = { start=libres, stop=libres }
--   methods= { loot=bool, target=bool, cleu=bool, position=bool, auctionator=bool, ammo=bool, bags=bool }
-- Ningún nombre de personaje ni de reino se guarda.

local Logic = {}

Logic.VERSION = 1
Logic.MAX_SESSIONS = 200
Logic.MAX_PATH = 480          -- 4 h a una muestra cada 30 s
Logic.MAX_KEYS = 2000         -- tope de claves por tabla de conteo (SavedVariables acotado)
Logic.GAP_PAUSE = 120         -- s sin latido (cierre, crash) se cuentan como pausa

local function count(t, k, n)
  if k == nil then return end
  local cur = t[k]
  if cur == nil then
    local size = t.__n or 0
    if size >= Logic.MAX_KEYS then return end
    t.__n = size + 1
    cur = 0
  end
  t[k] = cur + (n or 1)
end

local function sub(t, k)
  local s = t[k]
  if s == nil then s = {}; t[k] = s end
  return s
end

-- GUID de Mainline: "Creature-0-3299-1-21-11578-0000123456" (tipo y campo 6 = id).
-- Devuelve kind ('creature'|'object'|'other'), id numérico o nil.
function Logic.parseGUID(guid)
  if type(guid) ~= 'string' then return 'other', nil end
  local kind, rest = string.match(guid, '^(%a+)%-(.+)$')
  if not kind then return 'other', nil end
  local parts = {}
  for p in string.gmatch(rest, '[^%-]+') do parts[#parts + 1] = p end
  local id = tonumber(parts[5])
  if kind == 'Creature' or kind == 'Vehicle' then return 'creature', id end
  if kind == 'GameObject' then return 'object', id end
  return 'other', id
end

-- itemID de un enlace "|Hitem:12345:..." o nil.
function Logic.itemId(link)
  if type(link) ~= 'string' then return nil end
  return tonumber(string.match(link, 'item:(%d+)'))
end

function Logic.newSession(now, info)
  info = info or {}
  return {
    v = Logic.VERSION, start = now, stop = nil, state = 'running', lastBeat = now, resumedAt = now,
    level = info.level, class = info.class, faction = info.faction,
    active = 0, paused = 0, combat = 0, looting = 0, fights = 0, deaths = 0,
    combatSince = nil, lootSince = nil,
    kills = {}, killBy = { target = 0, cleu = 0, loot = 0 }, deadGuids = {}, lootedGuids = {},
    corpses = {}, items = {}, skins = {}, skinItems = {}, gather = {}, gatherItems = {}, other = {},
    money = { loot = 0, merchant = 0, other = 0 }, coinsBy = {},
    zones = {}, path = '', pathN = 0, lastPath = nil, lastZoneAt = nil,
    ammo = {}, bags = {}, methods = {},
  }
end

-- Tiempo activo acumulado hasta `now` (no avanza en pausa).
local function flush(s, now)
  if s.state == 'running' and s.resumedAt then
    s.active = s.active + math.max(0, now - s.resumedAt)
    s.resumedAt = now
  end
end

function Logic.beat(s, now)
  if not s then return end
  if s.lastBeat and now - s.lastBeat > Logic.GAP_PAUSE and s.state == 'running' then
    -- Hueco largo (relog, crash): no se cuenta como farmeo.
    s.paused = s.paused + (now - s.lastBeat)
    s.resumedAt = now
    s.combatSince, s.lootSince = nil, nil
  end
  flush(s, now)
  s.lastBeat = now
end

function Logic.pause(s, now)
  if not s or s.state ~= 'running' then return false end
  Logic.combatEnd(s, now); Logic.lootClose(s, now)
  flush(s, now)
  s.state, s.pausedAt = 'paused', now
  return true
end

function Logic.resume(s, now)
  if not s or s.state ~= 'paused' then return false end
  s.paused = s.paused + math.max(0, now - (s.pausedAt or now))
  s.state, s.pausedAt, s.resumedAt, s.lastBeat = 'running', nil, now, now
  return true
end

function Logic.combatStart(s, now)
  if not s or s.state ~= 'running' or s.combatSince then return end
  s.combatSince = now
  s.fights = s.fights + 1
end

function Logic.combatEnd(s, now)
  if not s or not s.combatSince then return end
  s.combat = s.combat + math.max(0, now - s.combatSince)
  s.combatSince = nil
end

function Logic.lootOpen(s, now)
  if not s or s.state ~= 'running' or s.lootSince then return end
  s.lootSince = now
end

function Logic.lootClose(s, now)
  if not s or not s.lootSince then return end
  s.looting = s.looting + math.max(0, now - s.lootSince)
  s.lootSince = nil
end

-- Muerte vista por algún método. Deduplica por GUID; devuelve true si es nueva.
function Logic.kill(s, guid, method)
  if not s or s.state ~= 'running' or type(guid) ~= 'string' then return false end
  local kind, id = Logic.parseGUID(guid)
  if kind ~= 'creature' or not id then return false end
  if s.deadGuids[guid] then return false end
  local n = s.deadN or 0
  if n >= 5000 then return false end      -- acota la tabla de GUIDs
  s.deadGuids[guid] = true
  s.deadN = n + 1
  count(s.kills, id, 1)
  s.killBy[method] = (s.killBy[method] or 0) + 1
  return true
end

-- Una ventana de botín: slots = { { guid=, itemId=, qty=, money= } , ... } ya
-- resueltos por Farm.lua (cada slot con su GUID de origen). Clasifica:
-- 1er saqueo de un GUID de criatura = cadáver; 2º = desuello; GUID de objeto =
-- recolección. Devuelve el número de orígenes contados.
function Logic.loot(s, slots, singleSourceMoney)
  if not s or s.state ~= 'running' or type(slots) ~= 'table' then return 0 end
  local seenHere, nsrc = {}, 0
  for _, sl in ipairs(slots) do
    local kind, id = Logic.parseGUID(sl.guid)
    local g = sl.guid
    if kind == 'creature' and id then
      if not seenHere[g] then
        seenHere[g] = true
        nsrc = nsrc + 1
        local before = s.lootedGuids[g]
        if before == nil then
          s.lootedGuids[g] = 1
          count(s.corpses, id, 1)
          Logic.kill(s, g, 'loot')
        elseif before == 1 then
          s.lootedGuids[g] = 2
          count(s.skins, id, 1)
        end
      end
      local bucket = (s.lootedGuids[g] == 2) and sub(s.skinItems, id) or sub(s.items, id)
      if sl.itemId then count(bucket, sl.itemId, sl.qty or 1) end
    elseif kind == 'object' and id then
      if not seenHere[g] then
        seenHere[g] = true
        nsrc = nsrc + 1
        count(s.gather, id, 1)
      end
      if sl.itemId then count(sub(s.gatherItems, id), sl.itemId, sl.qty or 1) end
    elseif sl.itemId then
      count(s.other, sl.itemId, sl.qty or 1)
    end
  end
  if singleSourceMoney and singleSourceMoney.npcId and (singleSourceMoney.copper or 0) > 0 then
    count(s.coinsBy, singleSourceMoney.npcId, singleSourceMoney.copper)
  end
  return nsrc
end

-- Cambio de dinero: contexto 'loot' | 'merchant' | 'other'. Solo suma ingresos
-- en 'loot'; en vendedor y otros guarda el neto (compras restan).
function Logic.money(s, delta, ctx)
  if not s or s.state ~= 'running' or type(delta) ~= 'number' or delta == 0 then return end
  local k = (ctx == 'loot' or ctx == 'merchant') and ctx or 'other'
  if k == 'loot' and delta < 0 then k = 'other' end
  s.money[k] = (s.money[k] or 0) + delta
end

function Logic.playerDead(s)
  if s and s.state == 'running' then s.deaths = s.deaths + 1 end
end

-- Muestra de posición: tiempo por mapa (desde la muestra anterior) y ruta cada 30 s.
function Logic.position(s, now, mapId, x, y)
  if not s or s.state ~= 'running' or type(mapId) ~= 'number' then return end
  if s.lastZoneAt and s.lastZone then
    local dt = math.min(60, math.max(0, now - s.lastZoneAt))
    count(s.zones, s.lastZone, dt)
  end
  s.lastZone, s.lastZoneAt = mapId, now
  if type(x) == 'number' and type(y) == 'number' and (s.lastPath == nil or now - s.lastPath >= 30)
      and s.pathN < Logic.MAX_PATH then
    local pt = string.format('%d:%.1f,%.1f', mapId, x * 100, y * 100)
    s.path = (s.pathN > 0) and (s.path .. ';' .. pt) or pt
    s.pathN = s.pathN + 1
    s.lastPath = now
  end
end

function Logic.mark(s, key, value)
  if s then s.methods[key] = value and true or false end
end

-- Métricas en vivo. price(itemId) -> vendor, ah|nil (cobre por unidad).
function Logic.summary(s, now, price)
  if not s then return nil end
  local active = s.active
  if s.state == 'running' and s.resumedAt then active = active + math.max(0, now - s.resumedAt) end
  local combat = s.combat + ((s.combatSince and now - s.combatSince) or 0)
  local looting = s.looting + ((s.lootSince and now - s.lootSince) or 0)
  local kills = 0
  for k, n in pairs(s.kills) do if k ~= '__n' then kills = kills + n end end
  local vendor, ah = 0, 0
  local function add(tbl)
    for _, bag in pairs(tbl) do
      if type(bag) == 'table' then
        for iid, q in pairs(bag) do
          if iid ~= '__n' then
            local v, a = 0, nil
            if price then v, a = price(iid) end
            vendor = vendor + (v or 0) * q
            ah = ah + math.max(v or 0, a or 0) * q
          end
        end
      end
    end
  end
  add(s.items); add(s.skinItems); add(s.gatherItems); add({ s.other })
  local coins = s.money.loot or 0
  local hours = active / 3600
  return {
    state = s.state, active = active, paused = s.paused, combat = combat, looting = looting,
    rest = math.max(0, active - combat - looting), kills = kills, fights = s.fights, deaths = s.deaths,
    killsPerHour = hours > 0 and kills / hours or 0,
    fightPerKill = kills > 0 and combat / kills or nil,
    coins = coins, lootVendor = vendor, lootAH = ah, merchant = s.money.merchant or 0,
    goldPerHourVendor = hours > 0 and (coins + vendor) / hours or 0,
    goldPerHourAH = hours > 0 and (coins + ah) / hours or 0,
  }
end

-- Quita los auxiliares de una tabla de conteo antes de guardar.
local function clean(t)
  if type(t) ~= 'table' then return t end
  t.__n = nil
  for _, v in pairs(t) do if type(v) == 'table' then v.__n = nil end end
  return t
end

-- Cierra la sesión y la deja lista para SavedVariables.
function Logic.finish(s, now)
  if not s then return nil end
  if s.state == 'paused' then Logic.resume(s, now) end
  Logic.combatEnd(s, now); Logic.lootClose(s, now)
  flush(s, now)
  s.stop, s.state = now, 'stopped'
  s.deadGuids, s.lootedGuids, s.deadN = nil, nil, nil
  s.combatSince, s.lootSince, s.resumedAt, s.pausedAt, s.lastBeat = nil, nil, nil, nil, nil
  s.lastPath, s.lastZone, s.lastZoneAt = nil, nil, nil
  for _, k in ipairs({ 'kills', 'corpses', 'items', 'skins', 'skinItems', 'gather', 'gatherItems', 'other', 'coinsBy', 'zones' }) do
    clean(s[k])
  end
  return s
end

-- Guarda una sesión cerrada (si tuvo actividad) y poda a MAX_SESSIONS.
function Logic.store(db, s)
  if not s or (s.active or 0) < 30 then return false end
  db.sessions[#db.sessions + 1] = s
  while #db.sessions > Logic.MAX_SESSIONS do table.remove(db.sessions, 1) end
  return true
end

-- Saneamiento al cargar: SavedVariables corrupto nunca rompe el addon.
function Logic.ensure(db)
  if type(db) ~= 'table' or db.version ~= 1 then
    return { version = 1, sessions = {}, current = nil, ui = {} }
  end
  if type(db.sessions) ~= 'table' then db.sessions = {} end
  local ok = {}
  for _, s in ipairs(db.sessions) do
    if type(s) == 'table' and s.v == Logic.VERSION and type(s.start) == 'number' then ok[#ok + 1] = s end
  end
  db.sessions = ok
  if type(db.current) ~= 'table' or db.current.v ~= Logic.VERSION or db.current.state == 'stopped' then db.current = nil end
  if type(db.ui) ~= 'table' then db.ui = {} end
  return db
end

-- Formato corto para la ventana: 3725 -> "1:02:05".
function Logic.clock(sec)
  sec = math.floor(sec or 0)
  local h, m, x = math.floor(sec / 3600), math.floor(sec % 3600 / 60), sec % 60
  if h > 0 then return string.format('%d:%02d:%02d', h, m, x) end
  return string.format('%d:%02d', m, x)
end

-- 123456 -> "12g 34s"; 950 -> "9s 50c".
function Logic.money2(c)
  c = math.floor((c or 0) + 0.5)
  local neg = c < 0 and '-' or ''
  c = math.abs(c)
  local g, s2, b = math.floor(c / 10000), math.floor(c % 10000 / 100), c % 100
  if g > 0 then return string.format('%s%dg %02ds', neg, g, s2) end
  return string.format('%s%ds %02dc', neg, s2, b)
end

WoWForeverFarmLogic = Logic
