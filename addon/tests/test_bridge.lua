-- Tests del puente WoW Forever Bridge. Ejecutar: lua5.1 addon/tests/test_bridge.lua
-- (desde la raíz del repo). Sin WoW: API mockeada; solo lógica y pegamento.
local failures, checks = 0, 0
local function ok(cond, msg)
  checks = checks + 1
  if not cond then failures = failures + 1; print('FAIL: ' .. msg) end
end
local function eq(a, b, msg) ok(a == b, msg .. ' (esperado ' .. tostring(b) .. ', obtenido ' .. tostring(a) .. ')') end

dofile('addon/WoWForeverBridge/Logic.lua')
local L = WoWForeverBridgeLogic

-- dayOf: epoch 2020-01-01 UTC, igual que SCAN_DAY_0 de Auctionator.
eq(L.dayOf(1577836800), 0, 'dayOf epoch')
eq(L.dayOf(1577836800 + 86400 * 2500), 2500, 'dayOf 2500')
eq(L.dayOf(1577836800 + 86399), 0, 'dayOf borde inferior')

-- latestObs: semántica h/l/a; claves numéricas y string.
local item = { m = 140, h = { [2500] = 150, [2501] = 140 }, l = { [2501] = 120 }, a = { [2501] = 7 } }
local o = L.latestObs(item)
eq(o.d, 2501, 'latestObs día más reciente'); eq(o.hi, 140, 'latestObs hi=h[max]')
eq(o.lo, 120, 'latestObs lo=l[max]'); eq(o.av, 7, 'latestObs av'); eq(o.m, 140, 'latestObs m')
local o2 = L.latestObs({ m = 90, h = { ['2500'] = 90 } })
eq(o2.d, 2500, 'latestObs clave string'); eq(o2.lo, 90, 'latestObs lo=h sin l'); eq(o2.av, nil, 'latestObs av ausente')
ok(L.latestObs({ m = 90 }) == nil, 'latestObs sin h -> nil')
ok(L.latestObs({ h = {} }) == nil, 'latestObs h vacío -> nil')
local o3 = L.latestObs({ h = { [2500] = 100 }, l = { [2500] = 500 } })
eq(o3.lo, 100, 'latestObs lo>hi se recorta a hi')
local o4 = L.latestObs({ h = { [2500] = 100 }, m = 0 })
eq(o4.m, 100, 'latestObs m inválido cae a hi')

-- fingerprint: estable ante el mismo estado, cambia ante precio/día/cantidad.
local realm = { version = 2, ['2589'] = item, ['1000'] = { m = 50, h = { [2500] = 50 }, a = { [2500] = 3 } } }
local fp1 = L.fingerprint(realm)
eq(L.fingerprint(realm), fp1, 'fingerprint estable')
realm['1000'].a[2500] = 9
ok(L.fingerprint(realm) ~= fp1, 'fingerprint cambia con cantidad')
realm['1000'].a[2500] = 3
realm['2589'].h[2502] = 130
ok(L.fingerprint(realm) ~= fp1, 'fingerprint cambia con nuevo día')

-- mergeEntry: extremos diarios hi=max lo=min av=max m=último; día nuevo reemplaza.
local entry = { day = 2501, items = {} }
local r1 = { version = 2, ['2589'] = { m = 140, h = { [2501] = 140 }, l = { [2501] = 120 }, a = { [2501] = 7 } } }
eq(L.mergeEntry(entry, r1, 100, 'PvP'), 1, 'mergeEntry añade ítem nuevo')
local r2 = { version = 2, ['2589'] = { m = 135, h = { [2501] = 160 }, l = { [2501] = 110 }, a = { [2501] = 9 } } }
eq(L.mergeEntry(entry, r2, 200, 'PvP'), 1, 'mergeEntry actualiza mismo día')
local it = entry.items['2589']
eq(it.hi, 160, 'merge hi=max'); eq(it.lo, 110, 'merge lo=min'); eq(it.av, 9, 'merge av=max'); eq(it.m, 135, 'merge m=último')
eq(entry.at, 200, 'merge at'); eq(entry.realm, 'PvP', 'merge realm')
eq(L.mergeEntry(entry, r2, 300, 'PvP'), 0, 'merge idéntico no cuenta cambio')
local r3 = { version = 2, ['2589'] = { m = 100, h = { [2502] = 100 } } }
L.mergeEntry(entry, r3, 400, 'PvP')
eq(entry.items['2589'].d, 2502, 'merge día nuevo reemplaza')
local r4 = { version = 2, ['2589'] = { m = 999, h = { [2499] = 999 } } }
L.mergeEntry(entry, r4, 500, 'PvP')
eq(entry.items['2589'].d, 2502, 'merge día viejo no retrocede')

-- prune: retención y tope.
local j = { version = 1, retentionDays = 14, entries = {} }
for d = 2490, 2505 do j.entries[d] = { day = d, items = {} } end
L.prune(j, 2505, 60)
ok(j.entries[2490] == nil, 'prune poda fuera de retención')
ok(j.entries[2491] ~= nil, 'prune conserva dentro de retención (2505-14=2491)')
local j2 = { version = 1, retentionDays = 60, entries = {} }
for d = 1, 80 do j2.entries[d] = { day = d, items = {} } end
L.prune(j2, 80, 60)
local n = 0; for _ in pairs(j2.entries) do n = n + 1 end
eq(n, 60, 'prune tope duro'); ok(j2.entries[1] == nil and j2.entries[80] ~= nil, 'prune conserva las recientes')

-- ensure: corrupto -> diario nuevo; retención inválida -> 14.
local fresh = L.ensure(nil)
eq(fresh.version, 1, 'ensure nil'); eq(fresh.retentionDays, 14, 'ensure retención por defecto')
eq(L.ensure({ version = 2 }).version, 1, 'ensure versión desconocida')
local bad = L.ensure({ version = 1, retentionDays = 999, entries = 'x' })
eq(bad.retentionDays, 14, 'ensure retención inválida'); ok(type(bad.entries) == 'table', 'ensure entries inválidas')

-- ===== Pegamento Bridge.lua con API de WoW mockeada =====
local events, scripts = {}, {}
local chatLog = {}
local nowValue = 1577836800 + 86400 * 2501 + 3600
_G.CreateFrame = function()
  local f = {}
  function f:RegisterEvent(e) events[e] = true end
  function f:SetScript(h, fn) scripts[h] = fn end
  return f
end
_G.GetRealmName = function() return 'PvP' end
_G.time = function() return nowValue end
_G.DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) chatLog[#chatLog + 1] = m end }
_G.SlashCmdList = {}
_G.AUCTIONATOR_PRICE_DATABASE = { __dbversion = 8, ['PvP'] = { version = 2, ['2589'] = { m = 140, h = { [2501] = 140 }, a = { [2501] = 5 } } } }
dofile('addon/WoWForeverBridge/Bridge.lua')
ok(events['PLAYER_ENTERING_WORLD'] and events['AUCTION_HOUSE_CLOSED'] and events['PLAYER_LOGOUT'], 'Bridge registra eventos clave')
ok(type(SlashCmdList['WOWFOREVERBRIDGE']) == 'function', 'Bridge registra /wfb')

-- Login: inicializa diario y captura el estado cargado.
scripts['OnEvent'](nil, 'PLAYER_ENTERING_WORLD')
ok(type(WoWForeverBridgeDB) == 'table' and WoWForeverBridgeDB.version == 1, 'login crea diario')
local day = L.dayOf(nowValue)
ok(WoWForeverBridgeDB.entries[day] ~= nil, 'login captura estado inicial')
eq(WoWForeverBridgeDB.entries[day].items['2589'].m, 140, 'login captura precio')

-- Escaneo: cambia la DB; el ticker (20 s) la captura.
AUCTIONATOR_PRICE_DATABASE['PvP']['2589'].h[2501] = 150
AUCTIONATOR_PRICE_DATABASE['PvP']['2589'].m = 150
scripts['OnUpdate'](nil, 21)
eq(WoWForeverBridgeDB.entries[day].items['2589'].hi, 150, 'ticker captura escaneo')

-- Mismo estado: el ticker no duplica trabajo (sin cambio de huella).
local atBefore = WoWForeverBridgeDB.entries[day].at
scripts['OnUpdate'](nil, 21)
eq(WoWForeverBridgeDB.entries[day].at, atBefore, 'ticker sin cambios no re-fusiona')

-- Cierre de AH: captura final aunque la huella no cambie (force).
nowValue = nowValue + 10
scripts['OnEvent'](nil, 'AUCTION_HOUSE_CLOSED')
eq(WoWForeverBridgeDB.entries[day].at, nowValue, 'cierre AH captura final')

-- Nuevo día de reloj: entrada nueva; la vieja se conserva (histórico).
nowValue = nowValue + 86400
AUCTIONATOR_PRICE_DATABASE['PvP']['2589'].h[2502] = 120
scripts['OnUpdate'](nil, 21)
ok(WoWForeverBridgeDB.entries[day + 1] ~= nil, 'nuevo día crea entrada nueva')
ok(WoWForeverBridgeDB.entries[day] ~= nil, 'día anterior se conserva en el diario')

-- /wfb days y purge.
SlashCmdList['WOWFOREVERBRIDGE']('days 7')
eq(WoWForeverBridgeDB.retentionDays, 7, '/wfb days fija retención')
SlashCmdList['WOWFOREVERBRIDGE']('purge')
ok(next(WoWForeverBridgeDB.entries) == nil, '/wfb purge vacía el diario')

-- DB ausente o versión desconocida: no rompe, no captura.
AUCTIONATOR_PRICE_DATABASE = nil
scripts['OnUpdate'](nil, 21)
scripts['OnEvent'](nil, 'PLAYER_LOGOUT')
ok(true, 'sin DB el puente no revienta')
AUCTIONATOR_PRICE_DATABASE = { __dbversion = 99 }
scripts['OnUpdate'](nil, 21)
ok(true, 'versión desconocida se ignora')

-- ===== Personaje.lua (captura SimC) =====
events, scripts = {}, {}
_G.SimulationcraftAPI = {
  GetSimcProfile = function(_, debug, noBags, showMerchant)
    assert(debug == false and noBags == true and showMerchant == false, 'GetSimcProfile args (debug/noBags/showMerchant)')
    return 'hunter="T"\nlevel=30\nrace=human\nserver=reino\nspec=unknown\n# Checksum: x\n', nil
  end,
}
local simcCalls = 0
local realGet = SimulationcraftAPI.GetSimcProfile
SimulationcraftAPI.GetSimcProfile = function(...)
  simcCalls = simcCalls + 1
  return realGet(...)
end
dofile('addon/WoWForeverBridge/Personaje.lua')
ok(events['PLAYER_ENTERING_WORLD'] and events['PLAYER_LOGOUT'] and events['PLAYER_QUITING'], 'Personaje registra eventos')
ok(type(SlashCmdList['WOWFOREVERBRIDGE2']) == 'function', 'Personaje registra /wfbp')

scripts['OnEvent'](nil, 'PLAYER_ENTERING_WORLD')
ok(type(WoWForeverBridgeDB.personagem) == 'table', 'PEW captura export')
eq(WoWForeverBridgeDB.personagem.capturado, nowValue, 'personagem capturado=now')
eq(WoWForeverBridgeDB.personagem.origem, 'addon', 'personagem origem')
ok(WoWForeverBridgeDB.personagem.simc:find('level=30', 1, true) ~= nil, 'simc contiene level=30')
local calls1 = simcCalls

nowValue = nowValue + 60
scripts['OnEvent'](nil, 'PLAYER_ENTERING_WORLD')
eq(simcCalls, calls1, 'throttle 300s no recaptura')

SlashCmdList['WOWFOREVERBRIDGE2']('personagem')
eq(simcCalls, calls1 + 1, '/wfbp personagem fuerza captura')

-- API que lanza error: se conserva el último export bueno y se registra o erro.
SimulationcraftAPI.GetSimcProfile = function() error('boom simc') end
nowValue = nowValue + 400
scripts['OnEvent'](nil, 'PLAYER_LOGOUT')
ok(WoWForeverBridgeDB.personagem.simc:find('level=30', 1, true) ~= nil, 'export bueno se conserva tras erro')
ok(type(WoWForeverBridgeDB.personagemErro) == 'table', 'personagemErro registrado')
eq(WoWForeverBridgeDB.personagemErro.capturado, nowValue, 'personagemErro capturado=now')
ok(tostring(WoWForeverBridgeDB.personagemErro.erro):find('boom', 1, true) ~= nil, 'personagemErro mensaje')

-- SimC devolviendo erro na 2a saida: também vai p/ personagemErro.
SimulationcraftAPI.GetSimcProfile = function() return nil, 'spec no escolhida' end
nowValue = nowValue + 400
scripts['OnEvent'](nil, 'PLAYER_QUITING')
eq(WoWForeverBridgeDB.personagemErro.erro, 'spec no escolhida', 'erro da API de 2a saida')
ok(WoWForeverBridgeDB.personagem.simc:find('level=30', 1, true) ~= nil, 'export bom segue intacto')

-- SimulationcraftAPI ausente: silencio, sem erro novo, sem quebrar.
_G.SimulationcraftAPI = nil
local erroAntes = WoWForeverBridgeDB.personagemErro.capturado
SlashCmdList['WOWFOREVERBRIDGE2']('simc')
eq(WoWForeverBridgeDB.personagemErro.capturado, erroAntes, 'sem API nao grava erro novo')
ok(true, 'sem SimulationcraftAPI no revienta')

print(string.format('test_bridge.lua: %d checks, %d fallos', checks, failures))
os.exit(failures == 0 and 0 or 1)
