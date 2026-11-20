-- WoW Forever Bridge — captura do estado do personagem via SimulationCraft.
-- Chama SimulationcraftAPI.GetSimcProfile (API pública do addon SimulationCraft
-- 12.1.5-04, exposta em core.lua:1599) dentro de pcall e grava o export em
-- WoWForeverBridgeDB.personagem = { simc=string, capturado=unix, origem='addon' }.
-- Se a chamada falhar grava só WoWForeverBridgeDB.personagemErro = { erro, capturado }
-- — nunca apaga um export bom anterior. Sem C_Timer/API moderna (cliente 1.60).
--
-- GetSimcProfile(self, debugOutput, noBags, showMerchant, links): o corpo não usa
-- `self` (verificado em core.lua:1109-1465), por isso vai nil. Pedimos
-- debugOutput=false, noBags=true (sem a seção "Gear from Bags", que o parser
-- do plugin não precisa) e showMerchant=false.

local Logic = WoWForeverBridgeLogic

local frame = CreateFrame('Frame')
frame:RegisterEvent('PLAYER_ENTERING_WORLD')
frame:RegisterEvent('PLAYER_LOGOUT')
frame:RegisterEvent('PLAYER_QUITING')

local INTERVALO = 300 -- segundos entre capturas automáticas
-- Mesmo tope que o plugin aceita em bridge.js (512 KiB, PERSONAGEM_MAX):
-- export maior é recusado aqui com personagemErro, em vez de gravado e
-- descartado em silêncio na sincronização.
local MAX_SIMC = 512 * 1024
local lastCaptura = 0

local function chat(msg)
  DEFAULT_CHAT_FRAME:AddMessage('|cFF00FF00WoW Forever|r ' .. msg)
end

local function garantirDB()
  if type(WoWForeverBridgeDB) ~= 'table' then
    WoWForeverBridgeDB = Logic.ensure(WoWForeverBridgeDB)
  end
  return WoWForeverBridgeDB
end

local function capture(force)
  local ok, err = pcall(function()
    -- SimulationCraft ausente/desativado: silêncio (o plugin declara "sem captura").
    if type(SimulationcraftAPI) ~= 'table' or type(SimulationcraftAPI.GetSimcProfile) ~= 'function' then return end
    local j = garantirDB()
    local now = time()
    if not force and now - lastCaptura < INTERVALO then return end
    lastCaptura = now
    local profile, simcErro = SimulationcraftAPI.GetSimcProfile(nil, false, true, false)
    if type(profile) == 'string' and profile ~= '' and #profile <= MAX_SIMC then
      j.personagem = { simc = profile, capturado = now, origem = 'addon' }
      j.personagemErro = nil
    else
      local motivo
      if type(simcErro) == 'string' and simcErro ~= '' then motivo = simcErro
      elseif type(profile) ~= 'string' then motivo = 'sem string de export'
      elseif #profile > MAX_SIMC then motivo = 'export demasiado grande'
      else motivo = 'export vazio' end
      j.personagemErro = { erro = tostring(motivo), capturado = now }
    end
  end)
  if not ok then
    local j = garantirDB()
    j.personagemErro = { erro = tostring(err), capturado = time() }
  end
end

frame:SetScript('OnEvent', function(_, event)
  if event == 'PLAYER_ENTERING_WORLD' then
    garantirDB()
    capture(false)
  else
    -- logout/quit: captura final antes do flush de SavedVariables.
    capture(true)
  end
end)

SLASH_WOWFOREVERBRIDGE2 = '/wfbp'
SlashCmdList['WOWFOREVERBRIDGE2'] = function(msg)
  local cmd = string.lower(string.match(msg or '', '^(%S*)') or '')
  if cmd == 'personagem' or cmd == 'simc' then
    capture(true)
    local j = WoWForeverBridgeDB
    if type(j) == 'table' and type(j.personagem) == 'table' then
      chat('personagem: export SimC guardado (capturado=' .. tostring(j.personagem.capturado) ..
        '). El plugin WoW Forever lo lee al sincronizar el puente.')
    elseif type(j) == 'table' and type(j.personagemErro) == 'table' then
      chat('personagem: la captura falló — ' .. tostring(j.personagemErro.erro))
    else
      chat('personagem: sin captura. ¿SimulationCraft instalado? Prueba /reload y /wfbp personagem.')
    end
  else
    chat('uso: /wfbp personagem')
  end
end
