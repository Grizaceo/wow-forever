-- WoW Forever Farm — contador de sesión de farmeo (pegamento con el juego).
-- Mide tiempo activo, combate, saqueo, muertes, botín por mob y dinero para que
-- el plugin WoW Forever de Hermes compare lo estimado con lo que realmente
-- ganas. Solo API pública de Blizzard (+ la API pública de Auctionator si está
-- para estimar precios en vivo). Nada sale de tu PC: todo queda en
-- WoWForeverFarmDB (SavedVariables), que se escribe con /reload o al salir.
--
-- Todo acceso a la API va protegido (pcall + detección): si algo no existe o
-- está restringido en este cliente, el contador sigue con lo que sí funciona y
-- la sesión lo anota en `methods`.

local L = WoWForeverFarmLogic
local ADDON = 'WoWForeverFarm'

local db
local session            -- sesión abierta (db.current)
local lootSources = {}   -- GUIDs del botín abierto (para atribuir el dinero)
local lootMoneyBase = nil
local lootHandled = false
local merchantOpen = false
local lastMoney = nil
local ui                 -- ventana

local unpack = unpack or table.unpack
local function now() return time() end
local function pack(...) return { n = select('#', ...), ... } end
-- Llama a f protegida y devuelve TODOS sus valores (GetItemInfo da 17).
local function safe(f, ...)
  if type(f) ~= 'function' then return nil end
  local r = pack(pcall(f, ...))
  if r[1] then return unpack(r, 2, r.n) end
  return nil
end
local function secret(v)
  -- Midnight: algunos valores son "secretos" en combate; no se usan.
  return type(issecretvalue) == 'function' and issecretvalue(v) or false
end
local function chat(msg)
  if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage('|cFF00FF00WoW Forever Farm|r ' .. msg) end
end

-- ------------------------------------------------------------ precios en vivo
local function price(itemId)
  local vendor, ah = 0, nil
  local getInfo = (C_Item and C_Item.GetItemInfo) or GetItemInfo
  local sell = select(11, safe(getInfo, itemId))
  if type(sell) == 'number' then vendor = sell end
  local api = Auctionator and Auctionator.API and Auctionator.API.v1
  if api and api.GetAuctionPriceByItemID then
    local p = safe(api.GetAuctionPriceByItemID, ADDON, itemId)
    if type(p) == 'number' and p > 0 then ah = math.floor(p * 0.95) end
  end
  return vendor, ah
end

-- ------------------------------------------------------------ lecturas del juego
local function playerInfo()
  local _, class = safe(UnitClass, 'player')
  local faction = safe(UnitFactionGroup, 'player')
  return { level = safe(UnitLevel, 'player'), class = class, faction = faction }
end

local function freeSlots()
  local total, any = 0, false
  for bag = 0, 4 do
    local n
    if C_Container and C_Container.GetContainerNumFreeSlots then n = safe(C_Container.GetContainerNumFreeSlots, bag)
    else n = safe(GetContainerNumFreeSlots, bag) end
    if type(n) == 'number' then total, any = total + n, true end
  end
  return any and total or nil
end

local function ammoCount()
  local slot = safe(GetInventorySlotInfo, 'AmmoSlot')
  if not slot then return nil end
  local n = safe(GetInventoryItemCount, 'player', slot)
  return type(n) == 'number' and n or nil
end

local function samplePosition(s)
  if not (C_Map and C_Map.GetBestMapForUnit) then return end
  local map = safe(C_Map.GetBestMapForUnit, 'player')
  if type(map) ~= 'number' then return end
  local x, y
  local pos = C_Map.GetPlayerMapPosition and safe(C_Map.GetPlayerMapPosition, map, 'player')
  if pos and pos.GetXY then x, y = safe(pos.GetXY, pos) end
  L.position(s, now(), map, x, y)
  L.mark(s, 'position', true)
end

-- ------------------------------------------------------------ sesión
local function start()
  if session and session.state ~= 'stopped' then return false end
  session = L.newSession(now(), playerInfo())
  db.current = session
  session.ammo.start = ammoCount()
  session.bags.start = freeSlots()
  L.mark(session, 'ammo', session.ammo.start ~= nil)
  L.mark(session, 'bags', session.bags.start ~= nil)
  L.mark(session, 'auctionator', Auctionator and Auctionator.API and Auctionator.API.v1 and true or false)
  lastMoney = safe(GetMoney)
  if safe(UnitAffectingCombat, 'player') then L.combatStart(session, now()) end
  return true
end

local function stop()
  if not session then return nil end
  session.ammo.stop = ammoCount()
  session.bags.stop = freeSlots()
  local s = L.finish(session, now())
  local kept = L.store(db, s)
  db.current, session = nil, nil
  return s, kept
end

-- ------------------------------------------------------------ eventos
local frame = CreateFrame('Frame')
frame:RegisterEvent('PLAYER_ENTERING_WORLD')
for _, ev in ipairs({ 'PLAYER_REGEN_DISABLED', 'PLAYER_REGEN_ENABLED', 'LOOT_READY', 'LOOT_OPENED', 'LOOT_CLOSED',
  'PLAYER_MONEY', 'MERCHANT_SHOW', 'MERCHANT_CLOSED', 'PLAYER_DEAD' }) do
  pcall(frame.RegisterEvent, frame, ev)
end
-- El registro de combate puede no estar disponible para addons (Midnight).
local cleuOk = pcall(frame.RegisterEvent, frame, 'COMBAT_LOG_EVENT_UNFILTERED')

local function readLoot()
  if lootHandled or not session or session.state ~= 'running' then return end
  lootHandled = true
  local n = safe(GetNumLootItems) or 0
  local slots, sources, distinct = {}, {}, 0
  for i = 1, n do
    local slotType = safe(GetLootSlotType, i)
    local _, _, qty = safe(GetLootSlotInfo, i)
    local link = safe(GetLootSlotLink, i)
    local src = { safe(GetLootSourceInfo, i) }   -- guid1, qty1, guid2, qty2...
    local guid = src[1]
    if guid and secret(guid) then guid = nil end
    if guid and not sources[guid] then sources[guid] = true; distinct = distinct + 1 end
    if slotType ~= 2 then  -- 2 = dinero (LOOT_SLOT_MONEY)
      slots[#slots + 1] = { guid = guid, itemId = L.itemId(link), qty = type(qty) == 'number' and qty or 1 }
    elseif guid then
      slots[#slots + 1] = { guid = guid }
    end
  end
  L.mark(session, 'loot', n > 0)
  L.loot(session, slots, nil)
  lootSources = sources
  lootSources.__count = distinct
  lootMoneyBase = safe(GetMoney)
end

local function moneyChanged()
  local m = safe(GetMoney)
  if type(m) ~= 'number' then return end
  if session and lastMoney then
    local delta = m - lastMoney
    local ctx = merchantOpen and 'merchant' or (lootMoneyBase and 'loot') or 'other'
    L.money(session, delta, ctx)
    -- Un solo origen en la ventana de botín: las monedas son de ese mob.
    if ctx == 'loot' and delta > 0 and lootSources.__count == 1 then
      for g in pairs(lootSources) do
        if g ~= '__count' then
          local kind, id = L.parseGUID(g)
          if kind == 'creature' then L.loot(session, {}, { npcId = id, copper = delta }) end
        end
      end
    end
  end
  lastMoney = m
end

local function checkTarget()
  if not session or session.state ~= 'running' then return end
  if not safe(UnitExists, 'target') or safe(UnitIsPlayer, 'target') then return end
  if not safe(UnitIsDead, 'target') then return end
  if UnitIsTapDenied and safe(UnitIsTapDenied, 'target') then return end  -- muerte de otro jugador
  local guid = safe(UnitGUID, 'target')
  if guid and not secret(guid) and L.kill(session, guid, 'target') then L.mark(session, 'target', true) end
end

frame:SetScript('OnEvent', function(_, event)
  if event == 'PLAYER_ENTERING_WORLD' then
    WoWForeverFarmDB = L.ensure(WoWForeverFarmDB)
    db = WoWForeverFarmDB
    session = db.current
    if session then L.beat(session, now()) end
    lastMoney = safe(GetMoney)
    if db.ui.shown and ui then ui:Show() end
    return
  end
  if not session then return end
  local t = now()
  if event == 'PLAYER_REGEN_DISABLED' then L.combatStart(session, t)
  elseif event == 'PLAYER_REGEN_ENABLED' then L.combatEnd(session, t); checkTarget()
  elseif event == 'LOOT_READY' or event == 'LOOT_OPENED' then
    L.lootOpen(session, t); readLoot()
  elseif event == 'LOOT_CLOSED' then
    L.lootClose(session, t)
    lootHandled, lootMoneyBase, lootSources = false, nil, {}
  elseif event == 'PLAYER_MONEY' then moneyChanged()
  elseif event == 'MERCHANT_SHOW' then merchantOpen = true
  elseif event == 'MERCHANT_CLOSED' then merchantOpen = false
  elseif event == 'PLAYER_DEAD' then L.playerDead(session)
  elseif event == 'COMBAT_LOG_EVENT_UNFILTERED' then
    local info = { safe(CombatLogGetCurrentEventInfo) }
    local sub, srcGuid, dstGuid = info[2], info[4], info[8]
    if sub == 'PARTY_KILL' and dstGuid and not secret(dstGuid) then
      local me, pet = safe(UnitGUID, 'player'), safe(UnitGUID, 'pet')
      if srcGuid == me or (pet and srcGuid == pet) then
        if L.kill(session, dstGuid, 'cleu') then L.mark(session, 'cleu', true) end
      end
    end
  end
end)

-- Latido: tiempo activo, objetivo muerto, posición y ventana en vivo.
local acc, posAcc, uiAcc = 0, 0, 0
local refreshUI
frame:SetScript('OnUpdate', function(_, dt)
  acc, posAcc, uiAcc = acc + dt, posAcc + dt, uiAcc + dt
  if session and session.state == 'running' then
    if acc >= 0.5 then acc = 0; checkTarget() end
    if posAcc >= 10 then posAcc = 0; L.beat(session, now()); samplePosition(session) end
  end
  if uiAcc >= 1 then uiAcc = 0; if refreshUI then refreshUI() end end
end)

-- ------------------------------------------------------------ ventana
local function buildUI()
  local ok, f = pcall(CreateFrame, 'Frame', 'WoWForeverFarmFrame', UIParent, BackdropTemplateMixin and 'BackdropTemplate' or nil)
  if not ok or not f then return nil end
  f:SetSize(260, 150)
  f:SetPoint('CENTER', UIParent, 'CENTER', 300, 0)
  if f.SetBackdrop then
    f:SetBackdrop({ bgFile = 'Interface\\Tooltips\\UI-Tooltip-Background', edgeFile = 'Interface\\Tooltips\\UI-Tooltip-Border',
      tile = true, tileSize = 16, edgeSize = 12, insets = { left = 3, right = 3, top = 3, bottom = 3 } })
    f:SetBackdropColor(0, 0, 0, 0.8)
  end
  f:SetMovable(true); f:EnableMouse(true); f:RegisterForDrag('LeftButton')
  f:SetScript('OnDragStart', f.StartMoving)
  f:SetScript('OnDragStop', f.StopMovingOrSizing)
  f.lines = {}
  for i = 1, 6 do
    local fs = f:CreateFontString(nil, 'OVERLAY', i == 1 and 'GameFontNormal' or 'GameFontHighlightSmall')
    fs:SetPoint('TOPLEFT', f, 'TOPLEFT', 10, -8 - (i - 1) * 16)
    fs:SetJustifyH('LEFT')
    f.lines[i] = fs
  end
  local function button(label, x, onClick)
    local b = CreateFrame('Button', nil, f, 'UIPanelButtonTemplate')
    b:SetSize(76, 20); b:SetPoint('BOTTOMLEFT', f, 'BOTTOMLEFT', x, 8)
    b:SetText(label); b:SetScript('OnClick', onClick)
    return b
  end
  f.main = button('Iniciar', 8, function() SlashCmdList['WOWFOREVERFARM'](session and (session.state == 'running' and 'pause' or 'resume') or 'start') end)
  f.stop = button('Terminar', 90, function() SlashCmdList['WOWFOREVERFARM']('stop') end)
  f.hide = button('Ocultar', 172, function() SlashCmdList['WOWFOREVERFARM']('hide') end)
  f:Hide()
  return f
end

refreshUI = function()
  if not ui or not ui:IsShown() then return end
  local s = session and L.summary(session, now(), price)
  local lines = ui.lines
  if not s then
    lines[1]:SetText('Farmeo · sin sesión')
    lines[2]:SetText('Pulsa Iniciar o escribe /wff start')
    for i = 3, 6 do lines[i]:SetText('') end
    ui.main:SetText('Iniciar')
    return
  end
  local pct = function(x) return s.active > 0 and math.floor(100 * x / s.active + 0.5) or 0 end
  lines[1]:SetText('Farmeo · ' .. (s.state == 'running' and 'en curso' or 'en pausa'))
  lines[2]:SetText('Tiempo ' .. L.clock(s.active) .. (s.paused > 0 and ('  (pausa ' .. L.clock(s.paused) .. ')') or ''))
  lines[3]:SetText(string.format('Combate %d%% · Saqueo %d%% · Resto %d%%', pct(s.combat), pct(s.looting), pct(s.rest)))
  lines[4]:SetText(string.format('Muertes %d (%d/h)%s', s.kills, math.floor(s.killsPerHour + 0.5),
    s.fightPerKill and string.format(' · pelea %ds', math.floor(s.fightPerKill + 0.5)) or ''))
  lines[5]:SetText('Monedas ' .. L.money2(s.coins) .. ' · botín ' .. L.money2(s.lootAH))
  lines[6]:SetText('Oro/h ≈ ' .. L.money2(s.goldPerHourAH) .. ' (vendedor ' .. L.money2(s.goldPerHourVendor) .. ')')
  ui.main:SetText(s.state == 'running' and 'Pausar' or 'Seguir')
end

ui = buildUI()

-- ------------------------------------------------------------ comandos
SLASH_WOWFOREVERFARM1 = '/wff'
SlashCmdList['WOWFOREVERFARM'] = function(msg)
  local cmd = string.lower(string.match(msg or '', '^(%S*)') or '')
  WoWForeverFarmDB = L.ensure(WoWForeverFarmDB)
  db = WoWForeverFarmDB
  session = db.current
  local t = now()
  if cmd == 'start' then
    if start() then chat('sesión iniciada. /wff pause, /wff stop. Se guarda con /reload o al salir.')
    else chat('ya hay una sesión abierta (/wff stop para cerrarla).') end
    if ui then ui:Show(); db.ui.shown = true end
  elseif cmd == 'pause' then
    if L.pause(session, t) then chat('sesión en pausa.') end
  elseif cmd == 'resume' then
    if L.resume(session, t) then chat('sesión reanudada.') end
  elseif cmd == 'stop' then
    local s, kept = stop()
    if s then
      local sm = L.summary(s, t, price)
      chat(string.format('sesión cerrada: %s activos, %d muertes, monedas %s, botín ≈ %s.%s',
        L.clock(sm.active), sm.kills, L.money2(sm.coins), L.money2(sm.lootAH),
        kept and ' Guardada: /reload para que el plugin la lea.' or ' Muy corta (<30 s): no se guardó.'))
    else chat('no hay sesión abierta.') end
  elseif cmd == 'reset' then
    db.current, session = nil, nil
    chat('sesión abierta descartada.')
  elseif cmd == 'hide' then
    if ui then ui:Hide() end; db.ui.shown = false
  elseif cmd == 'status' then
    local sm = session and L.summary(session, t, price)
    chat(string.format('%d sesiones guardadas; %s.', #db.sessions,
      sm and ('abierta: ' .. L.clock(sm.active) .. ', ' .. sm.kills .. ' muertes') or 'ninguna abierta')
      .. ' Registro de combate: ' .. (cleuOk and 'sí' or 'no') .. '.')
  else
    if ui then
      if ui:IsShown() then ui:Hide(); db.ui.shown = false else ui:Show(); db.ui.shown = true; refreshUI() end
    end
    chat('/wff start|pause|resume|stop|reset|status|hide')
  end
end
