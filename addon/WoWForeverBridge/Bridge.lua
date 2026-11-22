-- WoW Forever Bridge — pegamento WoW. Captura cada escaneo de Auctionator en
-- WoWForeverBridgeDB (SavedVariables propio). El plugin WoW Forever de Hermes
-- lee ese diario desde la carpeta SavedVariables concedida y lo fusiona en su
-- histórico durable: aunque Auctionator pode días viejos, cada escaneo queda.
--
-- Solo lee el global público AUCTIONATOR_PRICE_DATABASE (nombre declarado en
-- el TOC de Auctionator) y la API pública de Blizzard. No usa código de
-- Auctionator, no toca otros addons y no envía nada fuera del PC.
-- Nada de C_Timer/API moderna: compatible con el cliente Forever (1.60).

local Logic = WoWForeverBridgeLogic

local frame = CreateFrame('Frame')
frame:RegisterEvent('PLAYER_ENTERING_WORLD')
frame:RegisterEvent('PLAYER_LOGOUT')
frame:RegisterEvent('PLAYER_QUITING')
frame:RegisterEvent('AUCTION_HOUSE_CLOSED')

local lastFp = nil
local elapsed = 0
local warned = false
local lastChat = 0

local function chat(msg)
  DEFAULT_CHAT_FRAME:AddMessage('|cFF00FF00WoW Forever|r ' .. msg)
end

-- Reino actual: la resolución vive en Logic.currentRealm (compartida con la
-- cosecha de stats de Pawn.lua): clave GetRealmName(); si no está (reinos
-- conectados), única entrada de reino que sea tabla plana version 2.
local function currentRealm(db)
  return Logic.currentRealm(db, GetRealmName())
end

local function capture(force)
  local ok, err = pcall(function()
    local db = AUCTIONATOR_PRICE_DATABASE
    if type(db) ~= 'table' or db.__dbversion ~= 8 then return end
    local realm, realmName = currentRealm(db)
    if not realm then return end
    local fp = Logic.fingerprint(realm)
    if not force and fp == lastFp then return end
    local now = time()
    local day = Logic.dayOf(now)
    local j = WoWForeverBridgeDB
    local entry = j.entries[day]
    if entry == nil then
      entry = { day = day, items = {} }
      j.entries[day] = entry
    end
    local changed = Logic.mergeEntry(entry, realm, now, realmName)
    lastFp = fp
    Logic.prune(j, day, 60)
    if changed > 0 and (now - lastChat) >= 60 then
      lastChat = now
      chat('escaneo capturado: ' .. changed .. ' ítems (' .. realmName .. '). El diario se guarda con /reload o al salir.')
    end
  end)
  if not ok and not warned then
    warned = true
    chat('aviso: el puente no pudo capturar (' .. tostring(err) .. '). El juego no se ve afectado.')
  end
end

frame:SetScript('OnUpdate', function(_, dt)
  elapsed = elapsed + dt
  if elapsed >= 20 then
    elapsed = 0
    capture(false)
  end
end)

frame:SetScript('OnEvent', function(_, event)
  if event == 'PLAYER_ENTERING_WORLD' then
    WoWForeverBridgeDB = Logic.ensure(WoWForeverBridgeDB)
    Logic.prune(WoWForeverBridgeDB, Logic.dayOf(time()), 60)
    lastFp = nil
    capture(true)
  else
    -- AH cerrada / logout / quit: captura final antes del flush de SavedVariables.
    capture(true)
  end
end)

SLASH_WOWFOREVERBRIDGE1 = '/wfb'
SlashCmdList['WOWFOREVERBRIDGE'] = function(msg)
  local cmd, arg = string.match(msg or '', '^(%S*)%s*(.-)$')
  cmd = string.lower(cmd or '')
  WoWForeverBridgeDB = Logic.ensure(WoWForeverBridgeDB)
  local j = WoWForeverBridgeDB
  if cmd == 'capture' then
    capture(true)
    chat('captura manual hecha.')
  elseif cmd == 'days' then
    local n = tonumber(arg)
    if n and n >= 1 and n <= 60 then
      j.retentionDays = math.floor(n)
      chat('retención del diario: ' .. j.retentionDays .. ' días.')
    else
      chat('uso: /wfb days 1..60')
    end
  elseif cmd == 'purge' then
    j.entries = {}
    lastFp = nil
    chat('diario del puente vacío.')
  else
    local n, items, minD, maxD = 0, 0, nil, nil
    for day, e in pairs(j.entries) do
      n = n + 1
      for _ in pairs(e.items or {}) do items = items + 1 end
      if minD == nil or day < minD then minD = day end
      if maxD == nil or day > maxD then maxD = day end
    end
    chat('diario: ' .. n .. ' días, ' .. items .. ' observaciones' ..
      (minD and (' (días ' .. minD .. '..' .. maxD .. ')') or '') ..
      ', retención ' .. j.retentionDays .. ' días. Comandos: /wfb capture|days N|purge')
  end
end
