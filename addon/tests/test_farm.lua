-- Tests del contador WoW Forever Farm. Ejecutar: lua5.1 addon/tests/test_farm.lua
-- (desde la raíz del repo). Sin WoW: lógica pura y pegamento con API mockeada.
local failures, checks = 0, 0
local function ok(cond, msg)
  checks = checks + 1
  if not cond then failures = failures + 1; print('FAIL: ' .. msg) end
end
local function eq(a, b, msg) ok(a == b, msg .. ' (esperado ' .. tostring(b) .. ', obtenido ' .. tostring(a) .. ')') end

dofile('addon/WoWForeverFarm/Logic.lua')
local L = WoWForeverFarmLogic

-- ===== GUIDs y enlaces
local k, id = L.parseGUID('Creature-0-3299-1-21-11578-0000123456')
eq(k, 'creature', 'GUID criatura: tipo'); eq(id, 11578, 'GUID criatura: npcId')
k, id = L.parseGUID('GameObject-0-3299-1-21-1731-0000123456')
eq(k, 'object', 'GUID objeto: tipo'); eq(id, 1731, 'GUID objeto: id')
k, id = L.parseGUID('Player-6926-007FCECD')
eq(k, 'other', 'GUID jugador no es criatura')
eq(L.parseGUID(nil), 'other', 'GUID nil')
eq(L.itemId('|cffffffff|Hitem:7069::::::::40:::::|h[Elemental Air]|h|r'), 7069, 'itemId desde enlace')
eq(L.itemId('nada'), nil, 'enlace inválido')

-- ===== tiempo activo, pausa, combate y saqueo
local s = L.newSession(1000, { level = 40, class = 'HUNTER', faction = 'Horde' })
L.combatStart(s, 1010); L.combatEnd(s, 1030)
L.lootOpen(s, 1031); L.lootClose(s, 1033)
L.pause(s, 1100)
eq(s.state, 'paused', 'pausa cambia estado')
L.combatStart(s, 1150)
eq(s.combatSince, nil, 'en pausa no cuenta combate')
L.resume(s, 1200)
eq(s.paused, 100, 'pausa acumula 100 s')
local sm = L.summary(s, 1300, nil)
eq(sm.active, 200, 'activo = 100 antes + 100 después de la pausa')
eq(sm.combat, 20, 'combate 20 s'); eq(sm.looting, 2, 'saqueo 2 s')
eq(sm.rest, 178, 'resto = activo - combate - saqueo')
eq(s.fights, 1, 'una pelea')
-- combate abierto cuenta en vivo
L.combatStart(s, 1300)
eq(L.summary(s, 1310, nil).combat, 30, 'combate abierto suma en vivo')
L.combatEnd(s, 1310)

-- hueco largo (relog/crash) se cuenta como pausa
local g = L.newSession(0, {})
L.beat(g, 10)
L.beat(g, 1000)
eq(g.paused, 990, 'hueco > GAP_PAUSE es pausa')
eq(L.summary(g, 1000, nil).active, 10, 'el hueco no suma tiempo activo')

-- ===== muertes deduplicadas entre métodos
local guidA, guidB = 'Creature-0-1-1-1-11578-A1', 'Creature-0-1-1-1-11578-B2'
local m = L.newSession(0, {})
ok(L.kill(m, guidA, 'target'), 'muerte nueva por objetivo')
ok(not L.kill(m, guidA, 'cleu'), 'la misma muerte por registro no se duplica')
ok(L.kill(m, guidB, 'cleu'), 'otra muerte por registro')
ok(not L.kill(m, 'Player-1-2', 'target'), 'jugadores no cuentan')
eq(m.kills[11578], 2, 'dos muertes del npc 11578')
eq(m.killBy.target, 1, 'método objetivo'); eq(m.killBy.cleu, 1, 'método registro')

-- ===== botín: cadáver, desuello, recolección y sin origen
local b = L.newSession(0, {})
local g1, g2 = 'Creature-0-1-1-1-4127-X1', 'Creature-0-1-1-1-4127-X2'
L.loot(b, { { guid = g1, itemId = 4234, qty = 1 }, { guid = g1, itemId = 2589, qty = 2 }, { guid = g2, itemId = 2589, qty = 1 } })
eq(b.corpses[4127], 2, 'dos cadáveres en un saqueo de área')
eq(b.items[4127][2589], 3, 'tela de ambos cadáveres')
eq(b.kills[4127], 2, 'el saqueo también cuenta la muerte')
eq(b.killBy.loot, 2, 'método saqueo')
L.loot(b, { { guid = g1, itemId = 4304, qty = 1 } })
eq(b.skins[4127], 1, 'segundo saqueo del mismo GUID = desuello')
eq(b.skinItems[4127][4304], 1, 'cuero va al desuello')
eq(b.items[4127][4304], nil, 'el cuero no se mezcla con el botín de cadáver')
L.loot(b, { { guid = 'GameObject-0-1-1-1-1731-Z', itemId = 2770, qty = 2 } })
eq(b.gather[1731], 1, 'objeto = recolección'); eq(b.gatherItems[1731][2770], 2, 'mineral recolectado')
L.loot(b, { { itemId = 6948, qty = 1 } })
eq(b.other[6948], 1, 'botín sin origen')
L.loot(b, {}, { npcId = 4127, copper = 125 })
eq(b.coinsBy[4127], 125, 'monedas de un único origen')

-- ===== dinero por contexto
L.money(b, 300, 'loot'); L.money(b, 5000, 'merchant'); L.money(b, -200, 'merchant'); L.money(b, -50, 'loot'); L.money(b, 77, 'other')
eq(b.money.loot, 300, 'monedas de botín')
eq(b.money.merchant, 4800, 'neto del vendedor')
eq(b.money.other, 27, 'otro (incluye un débito en saqueo)')

-- ===== posición: tiempo por mapa y ruta acotada
local p = L.newSession(0, {})
L.position(p, 0, 1443, 0.5, 0.25)
L.position(p, 10, 1443, 0.51, 0.25)
L.position(p, 40, 1418, 0.1, 0.2)
eq(p.zones[1443], 40, 'tiempo por mapa (con tope de 60 s por muestra)')
eq(p.pathN, 2, 'ruta cada 30 s')
ok(string.find(p.path, '^1443:50.0,25.0;1418:10.0,20.0$') ~= nil, 'formato de ruta: ' .. p.path)

-- ===== resumen con precios
local r = L.newSession(0, {})
L.loot(r, { { guid = g1, itemId = 7069, qty = 2 } })
L.money(r, 1000, 'loot')
local price = function(iid) if iid == 7069 then return 400, 5000 end return 0, nil end
local rs = L.summary(r, 3600, price)
eq(rs.lootVendor, 800, 'valor de vendedor'); eq(rs.lootAH, 10000, 'valor de subasta estimado')
eq(rs.goldPerHourAH, 11000, 'oro/h con subasta'); eq(rs.goldPerHourVendor, 1800, 'oro/h a vendedor')
eq(rs.kills, 1, 'muerte por saqueo en el resumen')

-- ===== cierre, guardado y saneamiento
local f = L.finish(r, 3600)
eq(f.state, 'stopped', 'cierre'); eq(f.stop, 3600, 'marca de cierre')
eq(f.deadGuids, nil, 'sin tablas de GUIDs al guardar')
eq(f.kills.__n, nil, 'sin auxiliares de conteo')
eq(f.items[4127].__n, nil, 'sin auxiliares en subtablas')
local db = L.ensure(nil)
ok(L.store(db, f), 'sesión guardada')
ok(not L.store(db, L.finish(L.newSession(0, {}), 10)), 'sesión de 10 s no se guarda')
eq(#db.sessions, 1, 'una sesión')
for i = 1, L.MAX_SESSIONS + 5 do L.store(db, { v = 1, start = i, active = 60 }) end
eq(#db.sessions, L.MAX_SESSIONS, 'poda a MAX_SESSIONS')
local bad = L.ensure({ version = 1, sessions = { { v = 9 }, 'x', { v = 1, start = 5 } }, current = { v = 1, state = 'stopped' } })
eq(#bad.sessions, 1, 'ensure descarta sesiones inválidas')
eq(bad.current, nil, 'ensure descarta una sesión cerrada como abierta')
eq(L.ensure('basura').version, 1, 'ensure recupera SavedVariables corrupto')

-- ===== formatos
eq(L.clock(3725), '1:02:05', 'reloj h:mm:ss'); eq(L.clock(65), '1:05', 'reloj m:ss')
eq(L.money2(123456), '12g 34s', 'oro'); eq(L.money2(950), '9s 50c', 'plata')

-- ===== tope de claves (SavedVariables acotado)
local big = L.newSession(0, {})
for i = 1, L.MAX_KEYS + 10 do L.loot(big, { { itemId = i, qty = 1 } }) end
local n = 0
for kk in pairs(big.other) do if kk ~= '__n' then n = n + 1 end end
eq(n, L.MAX_KEYS, 'tope de claves por tabla')

-- ===== Pegamento Farm.lua con API de WoW mockeada
local nowValue = 5000
local frames, handlers = {}, {}
local function newFrame()
  local fr = { events = {}, scripts = {}, shown = false }
  function fr:RegisterEvent(ev) if ev == 'COMBAT_LOG_EVENT_UNFILTERED' then error('forbidden') end self.events[ev] = true end
  function fr:SetScript(name, fn) self.scripts[name] = fn end
  function fr:SetSize() end function fr:SetPoint() end function fr:SetMovable() end function fr:EnableMouse() end
  function fr:RegisterForDrag() end function fr:SetBackdrop() end function fr:SetBackdropColor() end
  function fr:Show() self.shown = true end function fr:Hide() self.shown = false end function fr:IsShown() return self.shown end
  function fr:SetText(t) self.text = t end
  function fr:CreateFontString() local fs = { text = '' } function fs:SetPoint() end function fs:SetJustifyH() end function fs:SetText(t) self.text = t end return fs end
  frames[#frames + 1] = fr
  return fr
end
_G.CreateFrame = function() return newFrame() end
_G.UIParent = {}
_G.time = function() return nowValue end
local chatLog = {}
_G.DEFAULT_CHAT_FRAME = { AddMessage = function(_, msg) chatLog[#chatLog + 1] = msg end }
_G.SlashCmdList = {}
local money = 10000
_G.GetMoney = function() return money end
_G.UnitClass = function() return 'Cazador', 'HUNTER', 3 end
_G.UnitFactionGroup = function() return 'Horde' end
_G.UnitLevel = function() return 40 end
_G.UnitAffectingCombat = function() return false end
_G.GetItemInfo = function(iid) return 'x', nil, 1, 1, 1, 'x', 'x', 20, 'x', 'x', iid == 4234 and 60 or 10 end
local lootWin = {}
_G.GetNumLootItems = function() return #lootWin end
_G.GetLootSlotType = function(i) return lootWin[i].money and 2 or 1 end
_G.GetLootSlotInfo = function(i) return 'tex', 'name', lootWin[i].qty or 1 end
_G.GetLootSlotLink = function(i) return lootWin[i].itemId and ('|Hitem:' .. lootWin[i].itemId .. ':|h') or nil end
_G.GetLootSourceInfo = function(i) return lootWin[i].guid, 1 end
-- Sin C_Map, sin munición, sin C_Container: el pegamento debe degradarse sin romper.
dofile('addon/WoWForeverFarm/Farm.lua')
local ev = frames[1].scripts.OnEvent
local upd = frames[1].scripts.OnUpdate
ok(type(SlashCmdList['WOWFOREVERFARM']) == 'function', 'registra /wff')
ok(frames[1].events.LOOT_READY, 'escucha LOOT_READY')
ok(not frames[1].events.COMBAT_LOG_EVENT_UNFILTERED, 'registro de combate prohibido no rompe la carga')
ev(nil, 'PLAYER_ENTERING_WORLD')
SlashCmdList['WOWFOREVERFARM']('start')
local cur = WoWForeverFarmDB.current
ok(cur ~= nil and cur.state == 'running', 'start abre sesión')
eq(cur.level, 40, 'guarda nivel'); eq(cur.class, 'HUNTER', 'guarda clase')
ok(cur.methods.auctionator == false, 'sin Auctionator se anota')
nowValue = 5010; ev(nil, 'PLAYER_REGEN_DISABLED')
nowValue = 5030; ev(nil, 'PLAYER_REGEN_ENABLED')
lootWin = { { guid = 'Creature-0-1-1-1-4127-K1', itemId = 4234, qty = 1 }, { guid = 'Creature-0-1-1-1-4127-K1', money = true } }
nowValue = 5031; ev(nil, 'LOOT_READY'); ev(nil, 'LOOT_OPENED')
money = 10125; ev(nil, 'PLAYER_MONEY')
nowValue = 5033; ev(nil, 'LOOT_CLOSED')
eq(cur.corpses[4127], 1, 'LOOT_READY + LOOT_OPENED cuentan un solo cadáver')
eq(cur.items[4127][4234], 1, 'ítem del cadáver')
eq(cur.money.loot, 125, 'monedas en saqueo')
eq(cur.coinsBy[4127], 125, 'monedas atribuidas al único origen')
eq(cur.combat, 20, 'combate desde eventos')
eq(cur.looting, 2, 'saqueo desde eventos')
ev(nil, 'MERCHANT_SHOW'); money = 12125; ev(nil, 'PLAYER_MONEY'); ev(nil, 'MERCHANT_CLOSED')
eq(cur.money.merchant, 2000, 'venta al vendedor')
upd(nil, 1.2)   -- refresco de la ventana sin errores
SlashCmdList['WOWFOREVERFARM']('pause'); eq(cur.state, 'paused', '/wff pause')
nowValue = 5100; SlashCmdList['WOWFOREVERFARM']('resume'); eq(cur.state, 'running', '/wff resume')
nowValue = 5200; SlashCmdList['WOWFOREVERFARM']('stop')
eq(WoWForeverFarmDB.current, nil, 'stop cierra')
eq(#WoWForeverFarmDB.sessions, 1, 'stop guarda la sesión')
local saved = WoWForeverFarmDB.sessions[1]
eq(saved.active, 133, 'tiempo activo sin la pausa')
ok(string.find(chatLog[#chatLog], 'sesión cerrada') ~= nil, 'resumen en el chat')
-- reload a mitad de sesión: la sesión abierta sobrevive
SlashCmdList['WOWFOREVERFARM']('start')
nowValue = 5260
ev(nil, 'PLAYER_ENTERING_WORLD')
ok(WoWForeverFarmDB.current ~= nil and WoWForeverFarmDB.current.state == 'running', 'reload conserva la sesión abierta')
SlashCmdList['WOWFOREVERFARM']('status')
ok(string.find(chatLog[#chatLog], 'Registro de combate: no') ~= nil, 'status informa el registro de combate')
SlashCmdList['WOWFOREVERFARM']('reset')
eq(WoWForeverFarmDB.current, nil, 'reset descarta la abierta')

print(string.format('farm: %d checks, %d fallos', checks, failures))
if failures > 0 then os.exit(1) end
