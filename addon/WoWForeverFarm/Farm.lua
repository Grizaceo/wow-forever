-- WoW Forever Farm — contador de sesión de farmeo (pegamento con el juego).
-- Mide tiempo, combate, saqueo, muertes, botín (objetos y monedas) y dinero para
-- que el plugin WoW Forever de Hermes compare lo estimado con lo que realmente
-- ganas. Solo API pública de Blizzard (+ la API pública de Auctionator si está
-- para estimar precios en vivo). Nada sale de tu PC: todo queda en
-- WoWForeverFarmDB (SavedVariables), que se escribe con /reload o al salir.
--
-- Cómo cuenta sin registro de combate: WoW Forever cierra COMBAT_LOG_EVENT_* a
-- los addons. Igual que el registro de mazmorras de DungeonJournal, las
-- muertes llegan por PARTY_KILL / UNIT_DIED (GUID), las líneas de XP y de
-- «Has matado» (nombre), y los cadáveres vistos o saqueados; Logic.killSignal
-- junta los avisos de una misma muerte. Lo que el cliente entrega como valor
-- secreto se ignora. El botín recibido sale de las líneas «Recibes botín» y
-- el dinero de PLAYER_MONEY.
--
-- Todo acceso a la API va protegido (pcall + detección): si algo no existe o
-- está restringido, el contador sigue con lo que sí funciona y la sesión lo
-- anota en `methods` y `signals` (/wff test lo muestra).

local L = WoWForeverFarmLogic
local ADDON = 'WoWForeverFarm'
local MAX_ROWS = 8          -- filas de botín en la ventana

local db
local session            -- sesión abierta (db.current)
local lootSources = {}   -- GUIDs del botín abierto (para atribuir el dinero)
local lootMoneyBase = nil
local lootHandled = false
local merchantOpen = false
local lastMoney = nil
local fightUntil = 0     -- fin de la última pelea + 3 s (para «X muere.»)
local names = {}         -- nombre en minúsculas -> npcId (aprendido de unidades vistas)
local npcNames = {}      -- npcId -> nombre en minúsculas
local engaged, engagedN = {}, 0      -- GUID -> momento en que peleaba contigo
local engagedNames = {}              -- nombre en minúsculas -> momento
local corpseSeen, corpseN = {}, 0    -- cadáveres ya avisados
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
  -- Midnight/Forever: algunos valores llegan "secretos"; no se usan.
  return type(issecretvalue) == 'function' and issecretvalue(v) or false
end
local function plain(v)
  if v == nil or secret(v) then return nil end
  return v
end
local function lower(s)
  s = plain(s)
  if type(s) ~= 'string' or s == '' then return nil end
  return string.lower(s)
end
local function chat(msg)
  if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage('|cFF00FF00WoW Forever Farm|r ' .. msg) end
end
local function running() return session and session.state == 'running' end

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

-- Líneas de chat en el idioma del cliente (formatos globales de Blizzard).
local pats
local function patterns()
  if pats then return pats end
  pats = {
    lootMulti = L.pattern(_G.LOOT_ITEM_SELF_MULTIPLE, true),
    loot = L.pattern(_G.LOOT_ITEM_SELF, true),
    xp = L.pattern(_G.COMBATLOG_XPGAIN_FIRSTPERSON, false),
    slain = L.pattern(_G.SELFKILLOTHER, true),
    dies = L.pattern(_G.UNITDIESOTHER, true),
  }
  return pats
end

-- ------------------------------------------------------------ muertes
local function signal(how, guid, name, extra)
  if not running() then return false end
  local nm = lower(name)
  if not nm and guid then
    local _, id = L.parseGUID(guid)
    nm = id and npcNames[id] or nil
  end
  local sig = { how = how, guid = guid, name = nm, npc = nm and names[nm] or nil }
  if extra then for k, v in pairs(extra) do sig[k] = v end end
  local new = L.killSignal(session, now(), sig)
  L.mark(session, how, true)
  return new
end

local function inFight()
  return (session and session.combatSince ~= nil) or now() <= fightUntil
end

local function remember(guid, name, t)
  if not engaged[guid] then
    engagedN = engagedN + 1
    if engagedN > 300 then
      local fresh, n = {}, 0
      for g, at in pairs(engaged) do if t - at < 300 then fresh[g] = at; n = n + 1 end end
      engaged, engagedN = fresh, n + 1
    end
  end
  engaged[guid] = t
  local nm = lower(name)
  if nm then engagedNames[nm] = t end
end

-- Una unidad vista (objetivo, mouseover, placa de nombre): aprende su nombre,
-- anota si pelea contigo o tu mascota y cuenta su cadáver si es tuyo.
local function observe(unit)
  if not running() or type(unit) ~= 'string' then return end
  if not plain(safe(UnitExists, unit)) or plain(safe(UnitIsPlayer, unit)) then return end
  local guid = plain(safe(UnitGUID, unit))
  local kind, npc = L.parseGUID(guid)
  if kind ~= 'creature' or not npc then return end
  local name = plain(safe(UnitName, unit))
  local nm = lower(name)
  if nm then names[nm] = npc; npcNames[npc] = nm end
  local tapDenied = plain(safe(UnitIsTapDenied, unit))     -- muerte de otro jugador
  if plain(safe(UnitIsDead, unit)) then
    -- Un cadáver se avisa una sola vez (el objetivo se mira cada 0,5 s).
    if not tapDenied and not corpseSeen[guid] then
      corpseN = corpseN + 1
      if corpseN > 2000 then corpseSeen, corpseN = {}, 1 end
      corpseSeen[guid] = true
      signal('target', guid, name)
    end
    return
  end
  if tapDenied then return end
  local threat = plain(safe(UnitThreatSituation, 'player', unit))
  if threat == nil then threat = plain(safe(UnitThreatSituation, 'pet', unit)) end
  if threat ~= nil or (unit == 'target' and inFight()) then remember(guid, name, now()) end
end

local function scanPlates()
  for i = 1, 40 do
    local u = 'nameplate' .. i
    if plain(safe(UnitExists, u)) then observe(u) end
  end
end

-- ------------------------------------------------------------ sesión
local function start(clockNow)
  if session and session.state ~= 'stopped' then return false end
  session = L.newSession(now(), playerInfo(), { armed = not clockNow })
  db.current = session
  session.ammo.start = ammoCount()
  session.bags.start = freeSlots()
  L.mark(session, 'ammo', session.ammo.start ~= nil)
  L.mark(session, 'bags', session.bags.start ~= nil)
  L.mark(session, 'auctionator', Auctionator and Auctionator.API and Auctionator.API.v1 and true or false)
  L.mark(session, 'secretos', type(issecretvalue) == 'function')
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
local EVENTS = {
  'PLAYER_ENTERING_WORLD', 'PLAYER_REGEN_DISABLED', 'PLAYER_REGEN_ENABLED',
  'LOOT_READY', 'LOOT_OPENED', 'LOOT_CLOSED', 'PLAYER_MONEY', 'MERCHANT_SHOW', 'MERCHANT_CLOSED',
  'PLAYER_DEAD', 'PLAYER_ALIVE', 'PLAYER_UNGHOST',
  'PARTY_KILL', 'UNIT_DIED', 'CHAT_MSG_COMBAT_XP_GAIN', 'CHAT_MSG_COMBAT_HOSTILE_DEATH', 'CHAT_MSG_LOOT',
  'PLAYER_TARGET_CHANGED', 'UPDATE_MOUSEOVER_UNIT', 'NAME_PLATE_UNIT_ADDED',
}
local registered = {}
for _, ev in ipairs(EVENTS) do
  registered[ev] = pcall(frame.RegisterEvent, frame, ev) and true or false
end

local function readLoot()
  if lootHandled or not running() then return end
  lootHandled = true
  local n = plain(safe(GetNumLootItems)) or 0
  local slots, sources, distinct = {}, {}, 0
  for i = 1, n do
    local slotType = plain(safe(GetLootSlotType, i))
    local _, _, qty = safe(GetLootSlotInfo, i)
    qty = plain(qty)
    local link = plain(safe(GetLootSlotLink, i))
    local guid = plain((safe(GetLootSourceInfo, i)))   -- guid1, qty1, guid2, qty2...
    if guid and not sources[guid] then sources[guid] = true; distinct = distinct + 1 end
    if slotType ~= 2 then  -- 2 = dinero (LOOT_SLOT_MONEY)
      slots[#slots + 1] = { guid = guid, itemId = L.itemId(link), qty = type(qty) == 'number' and qty or 1 }
    elseif guid then
      slots[#slots + 1] = { guid = guid }
    end
  end
  L.mark(session, 'loot', n > 0)
  L.loot(session, slots, nil, now())
  lootSources = sources
  lootSources.__count = distinct
  lootMoneyBase = safe(GetMoney)
end

local function moneyChanged()
  local m = plain(safe(GetMoney))
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
          if kind == 'creature' then L.loot(session, {}, { npcId = id, copper = delta }, now()) end
        end
      end
    end
  end
  lastMoney = m
end

local function onChat(event, text)
  text = plain(text)
  if type(text) ~= 'string' or not running() then return end
  local p = patterns()
  if event == 'CHAT_MSG_LOOT' then
    local id, q = L.parseLoot(text, p)
    if id and L.received(session, id, q) then L.mark(session, 'lootchat', true) end
  elseif event == 'CHAT_MSG_COMBAT_XP_GAIN' then
    local name, xp = L.parseXP(text, p.xp)
    if name then signal('xp', nil, name, { xp = xp }) end
  elseif event == 'CHAT_MSG_COMBAT_HOSTILE_DEATH' then
    local a = L.match(p.slain, text)
    if a and a[1] then signal('slain', nil, a[1]) return end
    a = L.match(p.dies, text)
    local nm = a and lower(a[1])
    -- «X muere.» también sale con muertes ajenas: solo cuenta en pelea y si X peleaba contigo.
    if nm and inFight() and engagedNames[nm] and now() - engagedNames[nm] < 60 then signal('dies', nil, a[1]) end
  end
end

frame:SetScript('OnEvent', function(_, event, ...)
  if event == 'PLAYER_ENTERING_WORLD' then
    WoWForeverFarmDB = L.ensure(WoWForeverFarmDB)
    db = WoWForeverFarmDB
    session = db.current
    if session then L.beat(session, now()) end
    lastMoney = plain(safe(GetMoney))
    if db.ui.shown and ui then ui:Show() end
    if ui and ui.restore then ui.restore() end
    return
  end
  if not session then return end
  local t = now()
  if event == 'PLAYER_REGEN_DISABLED' then L.combatStart(session, t)
  elseif event == 'PLAYER_REGEN_ENABLED' then
    fightUntil = t + 3
    observe('target')
    L.combatEnd(session, t)
  elseif event == 'LOOT_READY' or event == 'LOOT_OPENED' then
    L.lootOpen(session, t); readLoot()
  elseif event == 'LOOT_CLOSED' then
    L.lootClose(session, t)
    lootHandled, lootMoneyBase, lootSources = false, nil, {}
  elseif event == 'PLAYER_MONEY' then moneyChanged()
  elseif event == 'MERCHANT_SHOW' then merchantOpen = true
  elseif event == 'MERCHANT_CLOSED' then merchantOpen = false
  elseif event == 'PLAYER_DEAD' then L.playerDead(session, t)
  elseif event == 'PLAYER_ALIVE' or event == 'PLAYER_UNGHOST' then
    if not plain(safe(UnitIsDeadOrGhost, 'player')) then L.playerAlive(session, t) end
  elseif event == 'PARTY_KILL' then
    -- Tu grupo (tú o tu mascota) dio el golpe final. El GUID puede llegar oculto:
    -- la muerte cuenta igual, sin saber de qué mob era.
    local _, target = ...
    local guid = plain(target)
    if type(guid) == 'string' then signal('party', guid)
    else signal('party', nil, nil, { hidden = true }) end
  elseif event == 'UNIT_DIED' then
    -- Cualquier muerte cercana: solo cuenta si ese mob peleaba contigo.
    local guid = plain((...))
    if type(guid) == 'string' and engaged[guid] then signal('died', guid) end
  elseif event == 'CHAT_MSG_LOOT' or event == 'CHAT_MSG_COMBAT_XP_GAIN' or event == 'CHAT_MSG_COMBAT_HOSTILE_DEATH' then
    onChat(event, (...))
  elseif event == 'PLAYER_TARGET_CHANGED' then observe('target')
  elseif event == 'UPDATE_MOUSEOVER_UNIT' then observe('mouseover')
  elseif event == 'NAME_PLATE_UNIT_ADDED' then observe((...))
  end
end)

-- Latido: tiempo, objetivo, placas en pelea, posición y ventana en vivo.
local acc, plateAcc, posAcc, uiAcc = 0, 0, 0, 0
local refreshUI
frame:SetScript('OnUpdate', function(_, dt)
  acc, plateAcc, posAcc, uiAcc = acc + dt, plateAcc + dt, posAcc + dt, uiAcc + dt
  if running() then
    if acc >= 0.5 then acc = 0; observe('target') end
    if plateAcc >= 1 then plateAcc = 0; if inFight() then scanPlates() end end
    if posAcc >= 10 then posAcc = 0; L.beat(session, now()); samplePosition(session) end
  end
  if uiAcc >= 1 then uiAcc = 0; if refreshUI then refreshUI() end end
end)

-- ------------------------------------------------------------ ventana
local function itemLabel(iid)
  local getInfo = (C_Item and C_Item.GetItemInfo) or GetItemInfo
  local name, _, quality = safe(getInfo, iid)
  local icon = (C_Item and C_Item.GetItemIconByID and safe(C_Item.GetItemIconByID, iid)) or safe(GetItemIcon, iid)
  if type(name) ~= 'string' then
    if C_Item and C_Item.RequestLoadItemDataByID then safe(C_Item.RequestLoadItemDataByID, iid) end
    name = 'objeto ' .. iid
  end
  local color = type(quality) == 'number' and ITEM_QUALITY_COLORS and ITEM_QUALITY_COLORS[quality]
  local hex = (color and type(color.hex) == 'string') and color.hex or '|cffffffff'
  return hex .. name .. '|r', icon
end

local function buildUI()
  local ok, f = pcall(CreateFrame, 'Frame', 'WoWForeverFarmFrame', UIParent, BackdropTemplateMixin and 'BackdropTemplate' or nil)
  if not ok or not f then return nil end
  f:SetSize(280, 180)
  f:SetPoint('CENTER', UIParent, 'CENTER', 300, 0)
  if f.SetBackdrop then
    f:SetBackdrop({ bgFile = 'Interface\\Tooltips\\UI-Tooltip-Background', edgeFile = 'Interface\\Tooltips\\UI-Tooltip-Border',
      tile = true, tileSize = 16, edgeSize = 12, insets = { left = 3, right = 3, top = 3, bottom = 3 } })
    f:SetBackdropColor(0, 0, 0, 0.8)
  end
  f:SetMovable(true); f:EnableMouse(true); f:RegisterForDrag('LeftButton')
  f:SetScript('OnDragStart', f.StartMoving)
  f:SetScript('OnDragStop', function(self)
    self:StopMovingOrSizing()
    local p, _, rp, x, y = safe(self.GetPoint, self)
    if db and p then db.ui.point = { p, rp, x, y } end
  end)
  f.restore = function()
    local pt = db and db.ui and db.ui.point
    if type(pt) == 'table' and type(pt[1]) == 'string' then
      f:ClearAllPoints()
      f:SetPoint(pt[1], UIParent, pt[2] or pt[1], tonumber(pt[3]) or 0, tonumber(pt[4]) or 0)
    end
  end
  local function text(font, x, y, justify)
    local fs = f:CreateFontString(nil, 'OVERLAY', font)
    fs:SetPoint(justify == 'RIGHT' and 'TOPRIGHT' or 'TOPLEFT', f, justify == 'RIGHT' and 'TOPRIGHT' or 'TOPLEFT', x, y)
    fs:SetJustifyH(justify or 'LEFT')
    return fs
  end
  f.title = text('GameFontNormal', 10, -8)
  f.clock = text('GameFontHighlightLarge', 10, -26)
  f.side = text('GameFontDisableSmall', -10, -30, 'RIGHT')
  f.lines = {}
  for i = 1, 4 do f.lines[i] = text('GameFontHighlightSmall', 10, -50 - (i - 1) * 16) end
  f.lootTitle = text('GameFontNormalSmall', 10, -116)
  f.rows = {}
  for i = 1, MAX_ROWS + 1 do
    local y = -132 - (i - 1) * 16
    local row = { icon = f:CreateTexture(nil, 'ARTWORK'), name = text('GameFontHighlightSmall', 28, y), value = text('GameFontHighlightSmall', -10, y, 'RIGHT') }
    row.icon:SetSize(14, 14)
    row.icon:SetPoint('TOPLEFT', f, 'TOPLEFT', 10, y + 1)
    f.rows[i] = row
  end
  local function button(label, x, onClick)
    local b = CreateFrame('Button', nil, f, 'UIPanelButtonTemplate')
    b:SetSize(84, 20); b:SetPoint('BOTTOMLEFT', f, 'BOTTOMLEFT', x, 8)
    b:SetText(label); b:SetScript('OnClick', onClick)
    return b
  end
  f.main = button('Iniciar', 8, function()
    local cmd = 'start'
    if session then
      if session.armed and session.state == 'running' then cmd = 'ya'
      else cmd = session.state == 'running' and 'pause' or 'resume' end
    end
    SlashCmdList['WOWFOREVERFARM'](cmd)
  end)
  f.stop = button('Terminar', 98, function() SlashCmdList['WOWFOREVERFARM']('stop') end)
  f.hide = button('Ocultar', 188, function() SlashCmdList['WOWFOREVERFARM']('hide') end)
  f:Hide()
  return f
end

local function setRows(list, from)
  local shown = math.min(#list, MAX_ROWS)
  for i = 1, MAX_ROWS + 1 do
    local row, it = ui.rows[i], list[i]
    if i <= shown and it then
      local label, icon = itemLabel(it.id)
      row.icon:SetTexture(icon)
      row.icon:Show()
      row.name:SetText(it.q .. '× ' .. label)
      row.value:SetText(it.value > 0 and L.money2(it.value) or '')
    elseif i == shown + 1 and #list > MAX_ROWS then
      row.icon:Hide()
      row.name:SetText(string.format('|cff999999… y %d más|r', #list - MAX_ROWS))
      row.value:SetText('')
    else
      row.icon:Hide(); row.name:SetText(''); row.value:SetText('')
    end
  end
  local n = 0
  for _, it in ipairs(list) do n = n + it.q end
  ui.lootTitle:SetText(#list > 0 and string.format('Botín · %d objetos%s', n, from == 'ventana' and ' (ventanas)' or '') or 'Botín · nada aún')
  local rows = shown + ((#list > MAX_ROWS) and 1 or 0)
  ui:SetHeight(132 + math.max(1, rows) * 16 + 36)
end

refreshUI = function()
  if not ui or not ui:IsShown() then return end
  local s = session and L.summary(session, now(), price)
  local lines = ui.lines
  if not s then
    ui.title:SetText('Farmeo · sin sesión')
    ui.clock:SetText('0:00'); ui.side:SetText('')
    lines[1]:SetText('Pulsa Iniciar o escribe /wff start:')
    lines[2]:SetText('el reloj arranca en tu primera pelea.')
    lines[3]:SetText(''); lines[4]:SetText('')
    setRows({}, 'chat')
    ui.main:SetText('Iniciar')
    return
  end
  local pct = function(x) return s.active > 0 and math.floor(100 * x / s.active + 0.5) or 0 end
  if s.state ~= 'running' then ui.title:SetText('Farmeo · en pausa')
  elseif s.armed then ui.title:SetText('Farmeo · esperando el primer mob')
  else ui.title:SetText('Farmeo · en curso') end
  ui.clock:SetText(L.clock(s.active))
  local side = {}
  if s.travel >= 1 then side[#side + 1] = 'viaje ' .. L.clock(s.travel) end
  if s.paused >= 1 then side[#side + 1] = 'pausa ' .. L.clock(s.paused) end
  ui.side:SetText(table.concat(side, ' · '))
  lines[1]:SetText(string.format('Muertes %d · %d/h%s%s', s.kills, math.floor(s.killsPerHour + 0.5),
    s.fightPerKill and string.format(' · pelea %ds', math.floor(s.fightPerKill + 0.5)) or '',
    s.deaths > 0 and string.format(' · tú %d (%s)', s.deaths, L.clock(s.dead)) or ''))
  lines[2]:SetText(string.format('Combate %d%% · Saqueo %d%% · Resto %d%%', pct(s.combat), pct(s.looting), pct(s.rest)))
  lines[3]:SetText('Monedas ' .. L.money2(s.coins) .. ' · objetos ≈ ' .. L.money2(s.lootAH))
  lines[4]:SetText('Oro/h ≈ ' .. L.money2(s.goldPerHourAH) .. ' (vendedor ' .. L.money2(s.goldPerHourVendor) .. ')')
  setRows(s.items, s.itemsFrom)
  if s.state ~= 'running' then ui.main:SetText('Seguir')
  elseif s.armed then ui.main:SetText('Empezar ya')
  else ui.main:SetText('Pausar') end
end

ui = buildUI()

-- ------------------------------------------------------------ comandos
local function signalsText(s)
  local keys = { 'party', 'party_oculto', 'died', 'xp', 'slain', 'dies', 'target', 'loot' }
  local out = {}
  for _, k in ipairs(keys) do
    local n = s and s.signals and s.signals[k]
    if n and n > 0 then out[#out + 1] = k .. ' ' .. n end
  end
  return #out > 0 and table.concat(out, ', ') or 'ninguno aún'
end

-- /wff test: qué ve el contador de tu objetivo y qué avisos llegaron.
local function diagnose()
  local function show(v)
    if secret(v) then return 'SECRETO' end
    return tostring(v)
  end
  chat('valores secretos en este cliente: ' .. (type(issecretvalue) == 'function' and 'sí' or 'no')
    .. ' · PARTY_KILL ' .. (registered.PARTY_KILL and 'sí' or 'no')
    .. ' · UNIT_DIED ' .. (registered.UNIT_DIED and 'sí' or 'no'))
  local guid, name = safe(UnitGUID, 'target'), safe(UnitName, 'target')
  local kind, npc = L.parseGUID(plain(guid))
  chat('objetivo: guid=' .. show(guid) .. ' nombre=' .. show(name) .. ' npc=' .. tostring(kind == 'creature' and npc or '-')
    .. ' muerto=' .. show(safe(UnitIsDead, 'target')) .. ' ajeno=' .. show(safe(UnitIsTapDenied, 'target'))
    .. ' amenaza=' .. show(safe(UnitThreatSituation, 'player', 'target')))
  local p = patterns()
  chat('líneas de chat: botín ' .. (p.loot and 'sí' or 'no') .. ' · XP ' .. (p.xp and 'sí' or 'no')
    .. ' · «has matado» ' .. (p.slain and 'sí' or 'no'))
  chat('avisos de muerte en esta sesión: ' .. signalsText(session))
end

SLASH_WOWFOREVERFARM1 = '/wff'
SlashCmdList['WOWFOREVERFARM'] = function(msg)
  local cmd = string.lower(string.match(msg or '', '^(%S*)') or '')
  WoWForeverFarmDB = L.ensure(WoWForeverFarmDB)
  db = WoWForeverFarmDB
  session = db.current
  local t = now()
  if cmd == 'start' or cmd == 'ya' and not session then
    if start(cmd == 'ya') then
      chat(cmd == 'ya' and 'sesión iniciada; el reloj ya corre.'
        or 'sesión iniciada: el reloj arranca en tu primera pelea (el viaje se anota aparte). /wff ya lo arranca ahora.')
    else chat('ya hay una sesión abierta (/wff stop para cerrarla).') end
    if ui then ui:Show(); db.ui.shown = true; refreshUI() end
  elseif cmd == 'ya' then
    if L.engage(session, t) then chat('el reloj corre desde ahora.') end
  elseif cmd == 'pause' then
    if L.pause(session, t) then chat('sesión en pausa.') end
  elseif cmd == 'resume' then
    if L.resume(session, t) then chat('sesión reanudada.') end
  elseif cmd == 'stop' then
    local s, kept = stop()
    if s then
      local sm = L.summary(s, t, price)
      chat(string.format('sesión cerrada: %s, %d muertes, monedas %s, objetos ≈ %s.%s',
        L.clock(sm.active), sm.kills, L.money2(sm.coins), L.money2(sm.lootAH),
        kept and ' Guardada: /reload para que el plugin la lea.' or ' Muy corta (<30 s de reloj): no se guardó.'))
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
      .. ' Avisos de muerte: ' .. signalsText(session) .. '.')
  elseif cmd == 'test' then
    diagnose()
  else
    if ui then
      if ui:IsShown() then ui:Hide(); db.ui.shown = false else ui:Show(); db.ui.shown = true; refreshUI() end
    end
    chat('/wff start|ya|pause|resume|stop|reset|status|test|hide')
  end
end
