-- WoW Forever Farm — lógica pura del contador de sesión (sin API de WoW).
-- Testeable con lua5.1 (addon/tests/test_farm.lua). El pegamento con el juego
-- vive en Farm.lua; aquí solo hay tiempo, conteos y botín.
--
-- WoWForeverFarmDB = { version=1, sessions = { [i] = sesión cerrada }, current = sesión abierta|nil,
--                      ui = { shown, point = { punto, relativo, x, y } } }
-- Sesión (v=1): marcas unix en segundos; duraciones en segundos; cobre en cobre.
--   start, stop, level, class, faction, active, paused, combat, looting, fights, deaths,
--   travel  = s desde Iniciar hasta la primera pelea con muerte (el reloj arranca ahí)
--   deadTime= s muerto o como fantasma (dentro del tiempo activo)
--   kills  = { [npcId] = n }            muertes con mob conocido (deduplicadas)
--   killsAnon = n                       muertes sin mob conocido (el cliente lo ocultó)
--   killBy = { [método] = n }           método que vio cada muerte primero:
--            party (PARTY_KILL), died (UNIT_DIED), xp (chat de XP), slain («Has matado»),
--            dies («X muere.» en pelea), target (cadáver visto), loot (cadáver saqueado), cleu
--   signals= { [método] = n }           todos los avisos recibidos (diagnóstico)
--   xp     = XP de muertes (chat)
--   corpses= { [npcId] = n }            cadáveres saqueados
--   items  = { [npcId] = { [itemId] = qty } }   botín de cadáver por mob
--   skins  = { [npcId] = n }, skinItems = { [npcId] = { [itemId] = qty } }
--   gather = { [objectId] = n }, gatherItems = { [objectId] = { [itemId] = qty } }
--   other  = { [itemId] = qty }         botín sin origen conocido
--   got    = { [itemId] = qty }         lo que de verdad entró a tus bolsas («Recibes botín»)
--   money  = { loot=c, merchant=c, other=c }, coinsBy = { [npcId] = c }
--   coinCorpses = { [npcId] = n }       cadáveres saqueados solos en su ventana: los
--            únicos cuyas monedas se pueden atribuir (coinsBy sale de ellos)
--   zones  = { [uiMapId] = segundos }, path = "mapa:x,y;..." (cada 30 s, acotado)
--   ammo   = { start=n, stop=n }, bags = { start=libres, stop=libres }
--   methods= { [método o lectura] = bool }
-- Ningún nombre de personaje ni de reino se guarda.

local Logic = {}

Logic.VERSION = 1
Logic.MAX_SESSIONS = 200
Logic.MAX_PATH = 480          -- 4 h a una muestra cada 30 s
Logic.MAX_KEYS = 2000         -- tope de claves por tabla de conteo (SavedVariables acotado)
Logic.GAP_PAUSE = 120         -- s sin latido (cierre, crash) se cuentan como pausa
Logic.MERGE = 3               -- s: avisos distintos de una misma muerte
Logic.ARMED_FIGHT = 30        -- s: una pelea terminada justo antes del primer saqueo cuenta
Logic.MAX_DEAD = 5000         -- GUIDs muertos recordados por sesión

-- Cadáver visto o saqueado: llega tarde y solo confirma o pone nombre a una muerte.
local WEAK = { target = true, loot = true }

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

-- ------------------------------------------------------------ líneas de chat
-- Un formato de Blizzard («%s dies, you gain %d experience.») como patrón de
-- Lua, en el idioma del cliente. Admite %s, %d y las formas %1$s de algunos
-- idiomas; las capturas vuelven en el orden de los argumentos.
function Logic.pattern(fmt, anchorEnd)
  if type(fmt) ~= 'string' or fmt == '' then return nil end
  local out, order, i, n = {}, {}, 1, #fmt
  while i <= n do
    local c = string.sub(fmt, i, i)
    if c == '%' then
      local pos, conv = string.match(fmt, '^%%(%d)%$([sd])', i)
      local len = 4
      if not conv then conv = string.match(fmt, '^%%([sd])', i); len = 2 end
      if conv then
        order[#order + 1] = tonumber(pos) or (#order + 1)
        out[#out + 1] = (conv == 'd') and '([%d%.,]+)' or '(.-)'
        i = i + len
      elseif string.sub(fmt, i + 1, i + 1) == '%' then
        out[#out + 1] = '%%'; i = i + 2
      else
        out[#out + 1] = '%%'; i = i + 1
      end
    elseif string.find(c, '[%^%$%(%)%.%[%]%*%+%-%?]') then
      out[#out + 1] = '%' .. c; i = i + 1
    else
      out[#out + 1] = c; i = i + 1
    end
  end
  return { pat = '^' .. table.concat(out) .. (anchorEnd and '$' or ''), order = order }
end

-- Argumentos de una línea según su patrón, o nil. Si el cliente antepone una
-- etiqueta («[Botín]: ») se prueba otra vez sin el ancla del comienzo.
function Logic.match(p, text)
  if not p or type(text) ~= 'string' then return nil end
  local caps = { string.match(text, p.pat) }
  if #caps == 0 then caps = { string.match(text, string.sub(p.pat, 2)) } end
  if #caps == 0 then return nil end
  local args = {}
  for k, idx in ipairs(p.order) do args[idx] = caps[k] end
  return args
end

local function number(s)
  if type(s) == 'number' then return s end
  if type(s) ~= 'string' then return nil end
  return tonumber((string.gsub(s, '[^%d]', '')))
end

-- «Recibes botín: [X]x3.» -> itemId, 3. pats = { lootMulti=, loot= }.
function Logic.parseLoot(text, pats)
  if type(pats) ~= 'table' then return nil end
  local a = Logic.match(pats.lootMulti, text)
  if a then
    local id, q = Logic.itemId(a[1]), number(a[2])
    if id then return id, (q and q > 0) and q or 1 end
  end
  a = Logic.match(pats.loot, text)
  if a then
    local id = Logic.itemId(a[1])
    if id then return id, 1 end
  end
  return nil
end

-- «X muere, ganas 120 de experiencia.» -> 'X', 120.
function Logic.parseXP(text, pat)
  local a = Logic.match(pat, text)
  if not a or type(a[1]) ~= 'string' or a[1] == '' then return nil end
  local xp = number(a[2])
  if not xp or xp <= 0 then return nil end
  return a[1], xp
end

-- ------------------------------------------------------------ sesión y tiempo
-- opts.armed: el reloj espera la primera pelea con muerte (el viaje no cuenta).
function Logic.newSession(now, info, opts)
  info, opts = info or {}, opts or {}
  return {
    v = Logic.VERSION, start = now, stop = nil, state = 'running', lastBeat = now, resumedAt = now,
    armed = opts.armed and true or nil, travel = 0,
    level = info.level, class = info.class, faction = info.faction,
    active = 0, paused = 0, combat = 0, looting = 0, fights = 0, deaths = 0, deadTime = 0,
    combatSince = nil, lootSince = nil, deadSince = nil,
    kills = {}, killsAnon = 0, killBy = {}, signals = {}, xp = 0,
    deadGuids = {}, lootedGuids = {}, recent = {}, noGuid = {},
    corpses = {}, items = {}, skins = {}, skinItems = {}, gather = {}, gatherItems = {}, other = {}, got = {},
    fishing = 0, fishItems = {},
    money = { loot = 0, merchant = 0, other = 0 }, coinsBy = {}, coinCorpses = {},
    zones = {}, path = '', pathN = 0, lastPath = nil, lastZoneAt = nil,
    ammo = {}, bags = {}, methods = {},
  }
end

-- Sesiones abiertas con la versión 0.1.0 del addon no traen los campos nuevos.
local function upgrade(s)
  s.killBy = s.killBy or {}
  s.signals = s.signals or {}
  s.recent = s.recent or {}
  s.noGuid = s.noGuid or {}
  s.got = s.got or {}
  s.killsAnon = s.killsAnon or 0
  s.travel = s.travel or 0
  s.deadTime = s.deadTime or 0
  s.xp = s.xp or 0
  s.deadGuids = s.deadGuids or {}
  s.lootedGuids = s.lootedGuids or {}
  s.fishing = s.fishing or 0
  s.fishItems = s.fishItems or {}
  s.coinCorpses = s.coinCorpses or {}
end
Logic.upgrade = upgrade

-- Tiempo hasta `now`: al viaje mientras espera la primera pelea, si no al activo.
local function flush(s, now)
  if s.state == 'running' and s.resumedAt then
    local dt = math.max(0, now - s.resumedAt)
    if s.armed then s.travel = (s.travel or 0) + dt else s.active = s.active + dt end
    s.resumedAt = now
  end
end

local function closeDead(s, now)
  if s.deadSince then
    if not s.armed then s.deadTime = (s.deadTime or 0) + math.max(0, now - s.deadSince) end
    s.deadSince = nil
  end
end

function Logic.beat(s, now)
  if not s then return end
  if s.lastBeat and now - s.lastBeat > Logic.GAP_PAUSE and s.state == 'running' then
    -- Hueco largo (relog, crash): no se cuenta como farmeo.
    s.paused = s.paused + (now - s.lastBeat)
    s.resumedAt = now
    s.combatSince, s.lootSince, s.deadSince = nil, nil, nil
  end
  flush(s, now)
  s.lastBeat = now
end

function Logic.pause(s, now)
  if not s or s.state ~= 'running' then return false end
  Logic.combatEnd(s, now); Logic.lootClose(s, now); closeDead(s, now)
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

-- Primera pelea con muerte (o primer saqueo): el reloj arranca al comienzo de
-- esa pelea y lo anterior queda como viaje. Devuelve true si arrancó ahora.
function Logic.engage(s, now)
  if not s or not s.armed or s.state ~= 'running' then return false end
  flush(s, now)
  local begin = now
  if s.combatSince then
    begin = s.combatSince
    s.fights = s.fights + 1
  elseif s.armedFight and now - s.armedFight[2] <= Logic.ARMED_FIGHT then
    begin = s.armedFight[1]
    s.combat = s.combat + math.max(0, s.armedFight[2] - s.armedFight[1])
    s.fights = s.fights + 1
  end
  s.armedFight = nil
  local back = math.min(s.travel or 0, math.max(0, now - begin))
  s.travel, s.active = (s.travel or 0) - back, s.active + back
  s.armed = nil
  return true
end

function Logic.combatStart(s, now)
  if not s or s.state ~= 'running' or s.combatSince then return end
  s.combatSince = now
  if not s.armed then s.fights = s.fights + 1 end
end

function Logic.combatEnd(s, now)
  if not s or not s.combatSince then return end
  if s.armed then
    s.armedFight = { s.combatSince, now }     -- cuenta solo si trae una muerte
  else
    s.combat = s.combat + math.max(0, now - s.combatSince)
  end
  s.combatSince = nil
end

function Logic.lootOpen(s, now)
  if not s or s.state ~= 'running' or s.lootSince then return end
  s.lootSince = now
end

function Logic.lootClose(s, now)
  if not s or not s.lootSince then return end
  if not s.armed then s.looting = s.looting + math.max(0, now - s.lootSince) end
  s.lootSince = nil
end

-- ------------------------------------------------------------ muertes
-- Sin registro de combate (Forever lo cierra a los addons), una muerte llega
-- por varios avisos: PARTY_KILL y UNIT_DIED (GUID, a veces oculto), las líneas
-- de XP y de «Has matado» (nombre), el cadáver visto y el saqueado (GUID).
-- killSignal junta los avisos de una misma muerte y la cuenta una sola vez.
-- sig = { how=, guid=?, npc=?, name=?, xp=?, hidden=? }. Devuelve true si es nueva.
local function markDead(s, guid)
  if guid and not s.deadGuids[guid] then
    s.deadGuids[guid] = true
    s.deadN = (s.deadN or 0) + 1
  end
end

local function prune(s, now)
  local r, keep = s.recent, {}
  for i = 1, #r do
    if now - r[i].t <= 10 then keep[#keep + 1] = r[i] end
  end
  while #keep > 30 do table.remove(keep, 1) end
  s.recent = keep
end

local function sameDeath(s, now, how, guid, npc, name)
  for _, e in ipairs(s.recent) do
    if now - e.t <= Logic.MERGE and not e.h[how]
        and not (guid and e.guid)
        and not (npc and e.npc and npc ~= e.npc)
        and not (name and e.name and name ~= e.name) then
      return e
    end
  end
  return nil
end

local function newKill(s, now, how, guid, npc, name)
  markDead(s, guid)
  if npc then
    count(s.kills, npc, 1)
    if not guid then s.noGuid[npc] = (s.noGuid[npc] or 0) + 1 end
  else
    s.killsAnon = (s.killsAnon or 0) + 1
  end
  s.killBy[how] = (s.killBy[how] or 0) + 1
  s.recent[#s.recent + 1] = { t = now, guid = guid, npc = npc, name = name, h = { [how] = true } }
  Logic.engage(s, now)
  return true
end

function Logic.killSignal(s, now, sig)
  if not s or s.state ~= 'running' or type(sig) ~= 'table' then return false end
  upgrade(s)
  now = now or s.lastBeat or 0
  local how = type(sig.how) == 'string' and sig.how or 'otro'
  s.signals[how] = (s.signals[how] or 0) + 1
  if sig.hidden then s.signals[how .. '_oculto'] = (s.signals[how .. '_oculto'] or 0) + 1 end
  local guid, npc = nil, tonumber(sig.npc)
  if sig.guid ~= nil then
    local kind, id = Logic.parseGUID(sig.guid)
    if kind ~= 'creature' or not id then return false end   -- jugadores, mascotas, objetos
    guid, npc = sig.guid, id
  end
  local name = (type(sig.name) == 'string' and sig.name ~= '') and string.lower(sig.name) or nil
  if type(sig.xp) == 'number' and sig.xp > 0 then s.xp = (s.xp or 0) + sig.xp end
  prune(s, now)
  if guid and s.deadGuids[guid] then return false end
  if guid and (s.deadN or 0) >= Logic.MAX_DEAD then return false end

  -- ¿Otro aviso de una muerte recién contada? Se le suma lo que este sabe.
  local e = sameDeath(s, now, how, guid, npc, name)
  if e then
    e.h[how] = true
    if guid and not e.guid then
      e.guid = guid; markDead(s, guid)
      if e.npc and (s.noGuid[e.npc] or 0) > 0 then s.noGuid[e.npc] = s.noGuid[e.npc] - 1 end
    end
    if npc and not e.npc then
      e.npc = npc
      s.killsAnon = math.max(0, (s.killsAnon or 0) - 1)
      count(s.kills, npc, 1)
      if not e.guid then s.noGuid[npc] = (s.noGuid[npc] or 0) + 1 end
    end
    if name and not e.name then e.name = name end
    return false
  end

  if WEAK[how] then
    if not guid then return false end
    -- Un cadáver de una muerte ya contada sin GUID (por nombre o anónima): se
    -- le pone su GUID y no se cuenta otra vez.
    if npc and (s.noGuid[npc] or 0) > 0 then
      s.noGuid[npc] = s.noGuid[npc] - 1
      markDead(s, guid)
      return false
    end
    if (s.killsAnon or 0) > 0 then
      s.killsAnon = s.killsAnon - 1
      markDead(s, guid)
      count(s.kills, npc, 1)
      return false
    end
    -- Un cadáver que solo miraste (objetivo, mouseover) y que no peleó contigo
    -- en la sesión: muerto antes de /wff start, o por guardias o PNJ. Sirve para
    -- nombrar una muerte ya contada, no para contar una nueva ni arrancar el reloj.
    if how == 'target' and sig.fought == false then return false end
  end
  return newKill(s, now, how, guid, npc, name)
end

-- Compatibilidad: muerte vista con su GUID por `method`.
function Logic.kill(s, guid, method, now)
  if type(guid) ~= 'string' then return false end
  return Logic.killSignal(s, now or (s and s.lastBeat), { guid = guid, how = method })
end

-- ------------------------------------------------------------ botín y dinero
-- Una ventana de botín: slots = { { guid=, itemId=, qty= } , ... } ya
-- resueltos por Farm.lua (cada slot con su GUID de origen). Clasifica:
-- 1er saqueo de un GUID de criatura = cadáver; 2º = desuello; GUID de objeto =
-- recolección. Reabrir un cadáver que quedó con botín (Logic.lootLeft: bolsas
-- llenas, un BoP sin confirmar) no es desuello y lo que muestra ya se contó; nada
-- después del desuello se cuenta. Devuelve el número de orígenes contados.
-- lootedGuids[g]: 1 = cadáver saqueado, 2 = desollado; negativo = quedó con botín.
function Logic.loot(s, slots, singleSourceMoney, now)
  if not s or s.state ~= 'running' or type(slots) ~= 'table' then return 0 end
  upgrade(s)
  now = now or s.lastBeat or 0
  local seenHere, nsrc, reopen, corpseNpc = {}, 0, {}, nil
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
          corpseNpc = id
          Logic.killSignal(s, now, { guid = g, how = 'loot' })
        elseif before == 1 then
          s.lootedGuids[g] = 2
          count(s.skins, id, 1)
        else
          if before < 0 then s.lootedGuids[g] = -before end
          reopen[g] = true
        end
      end
      if not reopen[g] then
        local bucket = (s.lootedGuids[g] == 2) and sub(s.skinItems, id) or sub(s.items, id)
        if sl.itemId then count(bucket, sl.itemId, sl.qty or 1) end
      end
    elseif kind == 'object' and id then
      if not seenHere[g] then
        seenHere[g] = true
        nsrc = nsrc + 1
        count(s.gather, id, 1)
        Logic.engage(s, now)
      end
      if sl.itemId then count(sub(s.gatherItems, id), sl.itemId, sl.qty or 1) end
    elseif sl.itemId then
      count(s.other, sl.itemId, sl.qty or 1)
    end
  end
  -- Un solo cadáver nuevo en la ventana: sus monedas (si trae) se le atribuyen
  -- (coinsBy); se cuenta aunque no traiga, para no sobrestimar la media.
  if nsrc == 1 and corpseNpc then count(s.coinCorpses, corpseNpc, 1) end
  if singleSourceMoney and singleSourceMoney.npcId and (singleSourceMoney.copper or 0) > 0 then
    count(s.coinsBy, singleSourceMoney.npcId, singleSourceMoney.copper)
  end
  return nsrc
end

-- La ventana se cerró con slots sin recoger de estos GUIDs: el cadáver (o el
-- desuello) quedó con botín y la próxima ventana suya será una reapertura.
function Logic.lootLeft(s, guids)
  if not s or s.state ~= 'running' or type(guids) ~= 'table' then return 0 end
  upgrade(s)
  local n = 0
  for g in pairs(guids) do
    local v = s.lootedGuids[g]
    if v == 1 or v == 2 then s.lootedGuids[g] = -v; n = n + 1 end
  end
  return n
end

-- Pesca: una captura por ventana de botín de pesca (IsFishingLoot). El corcho es
-- un objeto del mundo, así que sin esto la captura contaría como recolección.
-- La primera captura arranca el reloj armado, igual que la primera muerte.
function Logic.fishLoot(s, slots, now)
  if not s or s.state ~= 'running' or type(slots) ~= 'table' then return false end
  upgrade(s)
  now = now or s.lastBeat or 0
  Logic.engage(s, now)
  s.fishing = s.fishing + 1
  for _, sl in ipairs(slots) do
    if sl.itemId then count(s.fishItems, sl.itemId, sl.qty or 1) end
  end
  return true
end

-- Lo que de verdad entró a las bolsas («Recibes botín: …»).
function Logic.received(s, itemId, qty)
  if not s or s.state ~= 'running' or type(itemId) ~= 'number' then return false end
  upgrade(s)
  count(s.got, itemId, (type(qty) == 'number' and qty > 0) and qty or 1)
  return true
end

-- Cambio de dinero: contexto 'loot' | 'merchant' | 'other'. Solo suma ingresos
-- en 'loot'; en vendedor y otros guarda el neto (compras restan).
function Logic.money(s, delta, ctx)
  if not s or s.state ~= 'running' or type(delta) ~= 'number' or delta == 0 then return end
  local k = (ctx == 'loot' or ctx == 'merchant') and ctx or 'other'
  if k == 'loot' and delta < 0 then k = 'other' end
  s.money[k] = (s.money[k] or 0) + delta
end

-- Tu muerte: cuenta y, hasta revivir, el tiempo de vuelta al cadáver.
function Logic.playerDead(s, now)
  if not s or s.state ~= 'running' then return end
  s.deaths = s.deaths + 1
  if now and not s.deadSince then s.deadSince = now end
end

function Logic.playerAlive(s, now)
  if not s or s.state ~= 'running' then return end
  closeDead(s, now)
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

-- ------------------------------------------------------------ resumen
local function hasKeys(t)
  for k in pairs(t or {}) do if k ~= '__n' then return true end end
  return false
end

-- Unidades obtenidas por ítem: lo recibido según el chat si el cliente lo
-- informa; si no, lo que mostraron las ventanas de botín.
function Logic.units(s)
  local per, from = {}, 'ventana'
  local function add(iid, q)
    if iid ~= '__n' and type(q) == 'number' then per[iid] = (per[iid] or 0) + q end
  end
  if hasKeys(s.got) then
    from = 'chat'
    for iid, q in pairs(s.got) do add(iid, q) end
  else
    for _, tbl in ipairs({ s.items, s.skinItems, s.gatherItems }) do
      for _, bag in pairs(tbl or {}) do
        if type(bag) == 'table' then for iid, q in pairs(bag) do add(iid, q) end end
      end
    end
    for iid, q in pairs(s.other or {}) do add(iid, q) end
    for iid, q in pairs(s.fishItems or {}) do add(iid, q) end
  end
  return per, from
end

-- Métricas en vivo. price(itemId) -> vendor, ah|nil (cobre por unidad).
-- items: botín ordenado por valor { id, q, vendor, value }.
function Logic.summary(s, now, price)
  if not s then return nil end
  local live = s.state == 'running' and not s.armed
  local active = s.active + ((live and s.resumedAt) and math.max(0, now - s.resumedAt) or 0)
  local travel = (s.travel or 0) + ((s.armed and s.state == 'running' and s.resumedAt) and math.max(0, now - s.resumedAt) or 0)
  local combat = s.combat + ((live and s.combatSince) and (now - s.combatSince) or 0)
  local looting = s.looting + ((live and s.lootSince) and (now - s.lootSince) or 0)
  local dead = (s.deadTime or 0) + ((live and s.deadSince) and (now - s.deadSince) or 0)
  local kills = s.killsAnon or 0
  for k, n in pairs(s.kills) do if k ~= '__n' then kills = kills + n end end
  local per, from = Logic.units(s)
  local vendor, ah, list = 0, 0, {}
  for iid, q in pairs(per) do
    local v, a = 0, nil
    if price then v, a = price(iid) end
    v = v or 0
    local value = math.max(v, a or 0) * q
    vendor, ah = vendor + v * q, ah + value
    list[#list + 1] = { id = iid, q = q, vendor = v * q, value = value }
  end
  table.sort(list, function(x, y)
    if x.value ~= y.value then return x.value > y.value end
    if x.q ~= y.q then return x.q > y.q end
    return x.id < y.id
  end)
  local coins = s.money.loot or 0
  local hours = active / 3600
  return {
    state = s.state, armed = s.armed and true or false, active = active, travel = travel, paused = s.paused,
    combat = combat, looting = looting, dead = dead,
    rest = math.max(0, active - combat - looting), kills = kills, fights = s.fights, deaths = s.deaths,
    killsPerHour = hours > 0 and kills / hours or 0,
    fishing = s.fishing or 0, fishingPerHour = hours > 0 and (s.fishing or 0) / hours or 0,
    fightPerKill = kills > 0 and combat / kills or nil,
    xp = s.xp or 0, xpPerHour = hours > 0 and (s.xp or 0) / hours or 0,
    coins = coins, lootVendor = vendor, lootAH = ah, merchant = s.money.merchant or 0,
    items = list, itemsFrom = from,
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
  upgrade(s)
  if s.state == 'paused' then Logic.resume(s, now) end
  Logic.combatEnd(s, now); Logic.lootClose(s, now); closeDead(s, now)
  flush(s, now)
  s.stop, s.state = now, 'stopped'
  s.deadGuids, s.lootedGuids, s.deadN, s.recent, s.noGuid, s.armedFight = nil, nil, nil, nil, nil, nil
  s.combatSince, s.lootSince, s.resumedAt, s.pausedAt, s.lastBeat, s.deadSince = nil, nil, nil, nil, nil, nil
  s.lastPath, s.lastZone, s.lastZoneAt = nil, nil, nil
  s.armed = nil
  for _, k in ipairs({ 'kills', 'corpses', 'items', 'skins', 'skinItems', 'gather', 'gatherItems', 'other', 'got', 'fishItems', 'coinsBy', 'coinCorpses', 'zones' }) do
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
  if db.current then upgrade(db.current) end
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
