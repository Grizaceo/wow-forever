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


-- ===== líneas de chat en el idioma del cliente
local EN = {
  lootMulti = L.pattern('You receive loot: %sx%d.', true),
  loot = L.pattern('You receive loot: %s.', true),
  xp = L.pattern('%s dies, you gain %d experience.', false),
  slain = L.pattern('You have slain %s!', true),
  dies = L.pattern('%s dies.', true),
}
local AIR = '|cffffffff|Hitem:7069::::::::40:::::|h[Elemental Air]|h|r'
local iid, q = L.parseLoot('You receive loot: ' .. AIR .. 'x3.', EN)
eq(iid, 7069, 'botín múltiple: ítem'); eq(q, 3, 'botín múltiple: cantidad')
iid, q = L.parseLoot('You receive loot: ' .. AIR .. '.', EN)
eq(iid, 7069, 'botín simple: ítem'); eq(q, 1, 'botín simple: 1')
iid = L.parseLoot('[Loot]: You receive loot: ' .. AIR .. '.', EN)
eq(iid, 7069, 'botín con etiqueta antepuesta')
eq(L.parseLoot('Grommash receives loot: ' .. AIR .. '.', EN), nil, 'botín de otro jugador no cuenta')
local xn, xa = L.parseXP('Whirlwind Shredder dies, you gain 120 experience. (+60 exp Rested bonus)', EN.xp)
eq(xn, 'Whirlwind Shredder', 'XP: nombre'); eq(xa, 120, 'XP: cantidad sin el bonus')
xn, xa = L.parseXP('Rock Elemental dies, you gain 1,234 experience.', EN.xp)
eq(xa, 1234, 'XP con separador de miles')
eq(L.match(EN.slain, 'You have slain Ridge Huntress!')[1], 'Ridge Huntress', '«Has matado»')
eq(L.match(EN.dies, 'Ridge Huntress dies.')[1], 'Ridge Huntress', '«X muere.»')
local pos = L.match(L.pattern('%2$s gana %1$d.', true), 'Ana gana 5.')
eq(pos and pos[2], 'Ana', 'formato posicional: segundo argumento'); eq(pos and pos[1], '5', 'formato posicional: primero')
eq(L.pattern(nil), nil, 'sin formato no hay patrón'); eq(L.match(nil, 'x'), nil, 'sin patrón no hay coincidencia')

-- ===== muertes sin registro de combate: avisos de una misma muerte se juntan
local GA, GB = 'Creature-0-1-1-1-2732-A', 'Creature-0-1-1-1-2732-B'
local w = L.newSession(0, {})
ok(L.killSignal(w, 10, { how = 'party', guid = GA }), 'PARTY_KILL con GUID cuenta')
ok(not L.killSignal(w, 10, { how = 'died', guid = GA }), 'UNIT_DIED del mismo GUID no duplica')
ok(not L.killSignal(w, 11, { how = 'xp', name = 'Ridge Huntress', xp = 300 }), 'la línea de XP de esa muerte se junta')
eq(w.kills[2732], 1, 'una muerte'); eq(w.xp, 300, 'XP sumada'); eq(w.killBy.party, 1, 'vista primero por PARTY_KILL')
ok(L.killSignal(w, 12, { how = 'party', guid = GB }), 'otro GUID al mismo tiempo es otra muerte')
-- dos PARTY_KILL ocultos a la vez (área) y sus dos líneas de XP
ok(L.killSignal(w, 20, { how = 'party', hidden = true }), 'PARTY_KILL oculto cuenta')
ok(L.killSignal(w, 20, { how = 'party', hidden = true }), 'segundo PARTY_KILL oculto cuenta')
eq(w.killsAnon, 2, 'dos muertes sin mob conocido')
ok(not L.killSignal(w, 20, { how = 'xp', name = 'Ridge Huntress', npc = 2732, xp = 300 }), 'XP pone nombre a la primera')
ok(not L.killSignal(w, 21, { how = 'xp', name = 'Ridge Huntress', npc = 2732, xp = 300 }), 'XP pone nombre a la segunda')
eq(w.killsAnon, 0, 'ninguna anónima'); eq(w.kills[2732], 4, 'cuatro muertes del mob')
eq(w.signals.party, 4, 'avisos PARTY_KILL'); eq(w.signals.party_oculto, 2, 'avisos ocultos')
-- muerte anónima y su cadáver saqueado más tarde: se le pone mob, no se duplica
ok(L.killSignal(w, 30, { how = 'party', hidden = true }), 'otra oculta')
ok(not L.killSignal(w, 45, { how = 'loot', guid = 'Creature-0-1-1-1-4127-C' }), 'el saqueo identifica la muerte oculta')
eq(w.killsAnon, 0, 'ya no anónima'); eq(w.kills[4127], 1, 'era del mob 4127')
-- muerte por nombre (sin GUID) y su cadáver saqueado
ok(L.killSignal(w, 50, { how = 'xp', name = 'Ridge Huntress', npc = 2732, xp = 300 }), 'muerte solo por XP')
ok(not L.killSignal(w, 60, { how = 'loot', guid = 'Creature-0-1-1-1-2732-D' }), 'su saqueo no la duplica')
eq(w.kills[2732], 5, 'cinco del mob 2732')
-- cadáver de una muerte que ningún aviso vio: cuenta
ok(L.killSignal(w, 70, { how = 'loot', guid = 'Creature-0-1-1-1-4127-E' }), 'saqueo sin aviso previo cuenta')
eq(w.killBy.loot, 1, 'vista primero por saqueo')
ok(not L.killSignal(w, 71, { how = 'party', guid = 'Player-1-ABC' }), 'un jugador muerto no cuenta')
eq(L.summary(w, 100, nil).kills, 7, 'resumen: total de muertes')
-- «X muere.» de otra muerte en la ventana de fusión no se confunde con un nombre distinto
local z = L.newSession(0, {})
L.killSignal(z, 5, { how = 'party', guid = GA, name = 'Ridge Huntress' })
ok(L.killSignal(z, 5, { how = 'slain', name = 'Rock Elemental' }), 'otro nombre en la ventana = otra muerte')
ok(not L.killSignal(z, 6, { how = 'slain', name = 'Ridge Huntress' }), 'el mismo nombre se junta')

-- ===== reloj: arranca en la primera pelea con muerte; lo anterior es viaje
local a = L.newSession(100, {}, { armed = true })
L.beat(a, 110)
L.combatStart(a, 120)
eq(L.summary(a, 122, nil).active, 0, 'armado: el reloj no corre')
ok(L.killSignal(a, 125, { how = 'party', guid = GA }), 'primera muerte')
L.combatEnd(a, 130)
local as = L.summary(a, 160, nil)
eq(as.armed, false, 'ya no espera'); eq(as.travel, 20, 'viaje hasta el comienzo de la pelea')
eq(as.active, 40, 'reloj desde el comienzo de la pelea'); eq(as.combat, 10, 'la pelea cuenta entera'); eq(as.fights, 1, 'una pelea')
local a2 = L.newSession(0, {}, { armed = true })
L.combatStart(a2, 10); L.combatEnd(a2, 20)
eq(L.summary(a2, 25, nil).combat, 0, 'pelea sin muerte antes de empezar no cuenta')
L.loot(a2, { { guid = 'Creature-0-1-1-1-4127-F', itemId = 2589, qty = 1 } }, nil, 100)
local a2s = L.summary(a2, 100, nil)
eq(a2s.travel, 100, 'una pelea vieja no adelanta el reloj'); eq(a2s.fights, 0, 'ni suma peleas')
local a3 = L.newSession(0, {}, { armed = true })
L.loot(a3, { { guid = 'GameObject-0-1-1-1-1731-Z', itemId = 2770, qty = 1 } }, nil, 50)
eq(L.summary(a3, 80, nil).active, 30, 'recolectar también arranca el reloj')
local a4 = L.newSession(0, {}, { armed = true })
ok(L.engage(a4, 40), '/wff ya arranca el reloj'); ok(not L.engage(a4, 50), 'solo una vez')
eq(L.summary(a4, 60, nil).active, 20, 'reloj desde /wff ya')

-- ===== lo recibido manda sobre la ventana; lista ordenada por valor
local gotS = L.newSession(0, {})
L.loot(gotS, { { guid = g1, itemId = 7069, qty = 2 }, { guid = g1, itemId = 2589, qty = 4 } })
local pr = function(i) if i == 7069 then return 400, 5000 end if i == 2589 then return 10, nil end return 0, nil end
local gs = L.summary(gotS, 3600, pr)
eq(gs.itemsFrom, 'ventana', 'sin chat: ventanas de botín'); eq(gs.items[1].id, 7069, 'el más valioso primero')
L.received(gotS, 7069, 1); L.received(gotS, 2589, 4)
gs = L.summary(gotS, 3600, pr)
eq(gs.itemsFrom, 'chat', 'con chat: lo recibido'); eq(gs.items[1].q, 1, 'solo 1 Aire entró (bolsas llenas)')
eq(gs.lootAH, 5040, 'valor de lo recibido'); eq(#gs.items, 2, 'dos ítems en la lista')

-- ===== tu muerte: tiempo de vuelta al cadáver
local d = L.newSession(0, {})
L.playerDead(d, 100); L.playerAlive(d, 160)
local ds = L.summary(d, 200, nil)
eq(ds.deaths, 1, 'una muerte tuya'); eq(ds.dead, 60, '60 s muerto')
L.playerDead(d, 300)
eq(L.summary(d, 330, nil).dead, 90, 'muerte abierta cuenta en vivo')
eq(L.finish(d, 340).deadTime, 100, 'al cerrar se suma')

-- ===== una sesión abierta con la versión 0.1.0 sigue funcionando
local old = L.newSession(0, {})
old.recent, old.noGuid, old.got, old.signals, old.killsAnon, old.travel, old.deadTime, old.xp = nil, nil, nil, nil, nil, nil, nil, nil
old.killBy = { target = 0, cleu = 0, loot = 0 }
local odb = L.ensure({ version = 1, sessions = {}, current = old })
ok(L.killSignal(odb.current, 5, { how = 'party', guid = GA }), 'sesión vieja acepta avisos nuevos')
ok(L.received(odb.current, 7069, 2), 'y botín recibido')
eq(L.summary(odb.current, 10, nil).kills, 1, 'y resume')

-- ===== Pegamento Farm.lua con API de WoW mockeada
local nowValue = 5000
local frames = {}
local SECRET = setmetatable({}, { __tostring = function() return 'secreto' end })
_G.issecretvalue = function(v) return v == SECRET end
local function newObj()
  local o = { text = '', shown = true }
  function o:SetPoint() end function o:SetSize() end function o:SetJustifyH() end function o:ClearAllPoints() end
  function o:SetText(t) self.text = t end function o:SetTexture(t) self.tex = t end
  function o:Show() self.shown = true end function o:Hide() self.shown = false end
  return o
end
local function newFrame()
  local fr = { events = {}, scripts = {}, shown = false }
  function fr:RegisterEvent(ev) if ev == 'COMBAT_LOG_EVENT_UNFILTERED' then error('forbidden') end self.events[ev] = true end
  function fr:SetScript(name, fn) self.scripts[name] = fn end
  function fr:SetSize() end function fr:SetPoint() end function fr:SetMovable() end function fr:EnableMouse() end
  function fr:RegisterForDrag() end function fr:SetBackdrop() end function fr:SetBackdropColor() end
  function fr:ClearAllPoints() end function fr:StopMovingOrSizing() end function fr:StartMoving() end
  function fr:GetPoint() return 'TOPLEFT', nil, 'TOPLEFT', 12, -34 end
  function fr:SetHeight(h) self.height = h end
  function fr:Show() self.shown = true end function fr:Hide() self.shown = false end function fr:IsShown() return self.shown end
  function fr:SetText(t) self.text = t end
  function fr:CreateFontString() return newObj() end
  function fr:CreateTexture() return newObj() end
  frames[#frames + 1] = fr
  return fr
end
_G.CreateFrame = function() return newFrame() end
_G.UIParent = {}
_G.time = function() return nowValue end
local chatLog = {}
_G.DEFAULT_CHAT_FRAME = { AddMessage = function(_, msg) chatLog[#chatLog + 1] = msg end }
_G.SlashCmdList = {}
_G.LOOT_ITEM_SELF = 'You receive loot: %s.'
_G.LOOT_ITEM_SELF_MULTIPLE = 'You receive loot: %sx%d.'
_G.COMBATLOG_XPGAIN_FIRSTPERSON = '%s dies, you gain %d experience.'
_G.SELFKILLOTHER = 'You have slain %s!'
_G.UNITDIESOTHER = '%s dies.'
local money = 10000
_G.GetMoney = function() return money end
_G.UnitClass = function() return 'Cazador', 'HUNTER', 3 end
_G.UnitFactionGroup = function() return 'Horde' end
_G.UnitLevel = function() return 40 end
_G.UnitAffectingCombat = function() return false end
local target = nil   -- { guid=, name=, dead=, threat=, tapDenied= }
_G.UnitExists = function(u) return u == 'target' and target ~= nil end
_G.UnitIsPlayer = function() return false end
_G.UnitGUID = function(u) return u == 'target' and target and target.guid or nil end
_G.UnitName = function(u) return u == 'target' and target and target.name or nil end
_G.UnitIsDead = function(u) return u == 'target' and target and target.dead or false end
_G.UnitIsTapDenied = function(u) return u == 'target' and target and target.tapDenied or false end
_G.UnitThreatSituation = function(who, u) return (who == 'player' and u == 'target' and target and target.threat) or nil end
_G.UnitIsDeadOrGhost = function() return false end
_G.GetItemInfo = function(iid) return 'Item' .. iid, nil, 1, 1, 1, 'x', 'x', 20, 'x', 'x', iid == 4234 and 60 or 10 end
_G.ITEM_QUALITY_COLORS = { [1] = { hex = '|cffffffff' } }
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
local win = frames[2]
ok(type(SlashCmdList['WOWFOREVERFARM']) == 'function', 'registra /wff')
ok(frames[1].events.LOOT_READY, 'escucha LOOT_READY')
ok(frames[1].events.PARTY_KILL and frames[1].events.UNIT_DIED, 'escucha PARTY_KILL y UNIT_DIED')
ok(frames[1].events.CHAT_MSG_LOOT and frames[1].events.CHAT_MSG_COMBAT_XP_GAIN, 'escucha botín y XP del chat')
ok(not frames[1].events.COMBAT_LOG_EVENT_UNFILTERED, 'no usa el registro de combate (cerrado en Forever)')
ev(nil, 'PLAYER_ENTERING_WORLD')
SlashCmdList['WOWFOREVERFARM']('start')
local cur = WoWForeverFarmDB.current
ok(cur ~= nil and cur.state == 'running', 'start abre sesión')
ok(cur.armed, 'el reloj espera la primera pelea')
eq(cur.level, 40, 'guarda nivel'); eq(cur.class, 'HUNTER', 'guarda clase')
ok(cur.methods.auctionator == false, 'sin Auctionator se anota')
ok(cur.methods.secretos == true, 'anota que el cliente tiene valores secretos')
upd(nil, 1.2)
ok(string.find(win.title.text, 'esperando') ~= nil, 'ventana: esperando el primer mob')
nowValue = 5010; ev(nil, 'PLAYER_REGEN_DISABLED')
nowValue = 5030; ev(nil, 'PLAYER_REGEN_ENABLED')
lootWin = { { guid = 'Creature-0-1-1-1-4127-K1', itemId = 4234, qty = 1 }, { guid = 'Creature-0-1-1-1-4127-K1', money = true } }
nowValue = 5031; ev(nil, 'LOOT_READY'); ev(nil, 'LOOT_OPENED')
ok(not cur.armed, 'el primer saqueo arranca el reloj')
money = 10125; ev(nil, 'PLAYER_MONEY')
ev(nil, 'CHAT_MSG_LOOT', 'You receive loot: |cffffffff|Hitem:4234::::|h[Heavy Leather]|h|r.')
nowValue = 5033; ev(nil, 'LOOT_CLOSED')
eq(cur.corpses[4127], 1, 'LOOT_READY + LOOT_OPENED cuentan un solo cadáver')
eq(cur.items[4127][4234], 1, 'ítem del cadáver')
eq(cur.got[4234], 1, 'ítem recibido según el chat')
eq(cur.money.loot, 125, 'monedas en saqueo')
eq(cur.coinsBy[4127], 125, 'monedas atribuidas al único origen')
eq(cur.combat, 20, 'la pelea previa al saqueo cuenta')
eq(cur.travel, 10, 'viaje antes de la pelea')
eq(cur.looting, 2, 'saqueo desde eventos')
-- PARTY_KILL con GUID visible, con GUID secreto, y la XP del chat
nowValue = 5040; ev(nil, 'PARTY_KILL', 'Player-1-ME', 'Creature-0-1-1-1-2732-P1')
eq(cur.kills[2732], 1, 'PARTY_KILL con GUID')
ev(nil, 'CHAT_MSG_COMBAT_XP_GAIN', 'Ridge Huntress dies, you gain 300 experience.')
eq(cur.xp, 300, 'XP del chat'); eq(cur.kills[2732], 1, 'la XP de esa muerte no la duplica')
nowValue = 5050; ev(nil, 'PARTY_KILL', SECRET, SECRET)
eq(cur.killsAnon, 1, 'PARTY_KILL con GUID secreto cuenta sin mob')
eq(cur.signals.party_oculto, 1, 'y se anota como oculto')
ev(nil, 'UNIT_DIED', 'Creature-0-1-1-1-3000-OTRO')
eq(cur.kills[3000], nil, 'UNIT_DIED de un mob que no peleaba contigo no cuenta')
target = { guid = 'Creature-0-1-1-1-2732-T1', name = 'Ridge Huntress', threat = 1 }
nowValue = 5060; ev(nil, 'PLAYER_TARGET_CHANGED')
ev(nil, 'UNIT_DIED', 'Creature-0-1-1-1-2732-T1')
eq(cur.kills[2732], 2, 'UNIT_DIED de tu objetivo en pelea cuenta')
target.dead = true; upd(nil, 0.6); upd(nil, 0.6)
eq(cur.kills[2732], 2, 'su cadáver visto no la duplica')
eq(cur.signals.target, 1, 'el cadáver se avisa una sola vez')
target = { guid = 'Creature-0-1-1-1-2732-T2', name = 'Ridge Huntress', dead = true, tapDenied = true }
ev(nil, 'PLAYER_TARGET_CHANGED')
eq(cur.kills[2732], 2, 'cadáver de otro jugador no cuenta')
ev(nil, 'CHAT_MSG_COMBAT_HOSTILE_DEATH', 'You have slain Rock Elemental!')
eq(cur.killsAnon, 2, '«Has matado» de un mob desconocido cuenta sin mob')
upd(nil, 1.2)
ok(string.find(win.title.text, 'en curso') ~= nil, 'ventana: en curso')
ok(string.find(win.rows[1].name.text, '1× ', 1, true) ~= nil, 'ventana: fila de botín ' .. tostring(win.rows[1].name.text))
ok(string.find(win.lootTitle.text, 'Botín') ~= nil, 'ventana: título del botín')
ev(nil, 'MERCHANT_SHOW'); money = 12125; ev(nil, 'PLAYER_MONEY'); ev(nil, 'MERCHANT_CLOSED')
eq(cur.money.merchant, 2000, 'venta al vendedor')
nowValue = 5070; ev(nil, 'PLAYER_DEAD')
nowValue = 5100; ev(nil, 'PLAYER_UNGHOST')
eq(cur.deadTime, 30, 'tiempo muerto hasta revivir')
SlashCmdList['WOWFOREVERFARM']('pause'); eq(cur.state, 'paused', '/wff pause')
nowValue = 5150; SlashCmdList['WOWFOREVERFARM']('resume'); eq(cur.state, 'running', '/wff resume')
target = { guid = SECRET, name = SECRET }
SlashCmdList['WOWFOREVERFARM']('test')
local testLog = table.concat(chatLog, '\n')
ok(string.find(testLog, 'guid=SECRETO', 1, true) ~= nil, '/wff test muestra valores secretos')
ok(string.find(testLog, 'party_oculto 1', 1, true) ~= nil, '/wff test lista los avisos')
nowValue = 5250; SlashCmdList['WOWFOREVERFARM']('stop')
eq(WoWForeverFarmDB.current, nil, 'stop cierra')
eq(#WoWForeverFarmDB.sessions, 1, 'stop guarda la sesión')
local saved = WoWForeverFarmDB.sessions[1]
eq(saved.active, 190, 'reloj desde la primera pelea, sin la pausa')
eq(saved.recent, nil, 'sin auxiliares de fusión al guardar')
ok(string.find(chatLog[#chatLog], 'sesión cerrada') ~= nil, 'resumen en el chat')
-- reload a mitad de sesión: la sesión abierta sobrevive; /wff ya arranca el reloj
SlashCmdList['WOWFOREVERFARM']('start')
nowValue = 5260
ev(nil, 'PLAYER_ENTERING_WORLD')
ok(WoWForeverFarmDB.current ~= nil and WoWForeverFarmDB.current.state == 'running', 'reload conserva la sesión abierta')
SlashCmdList['WOWFOREVERFARM']('ya')
ok(not WoWForeverFarmDB.current.armed, '/wff ya arranca el reloj')
SlashCmdList['WOWFOREVERFARM']('status')
ok(string.find(chatLog[#chatLog], 'Avisos de muerte') ~= nil, 'status informa los avisos')
SlashCmdList['WOWFOREVERFARM']('reset')
eq(WoWForeverFarmDB.current, nil, 'reset descarta la abierta')
win.scripts.OnDragStop(win)
eq(WoWForeverFarmDB.ui.point[1], 'TOPLEFT', 'la ventana recuerda su posición')

print(string.format('farm: %d checks, %d fallos', checks, failures))
if failures > 0 then os.exit(1) end
