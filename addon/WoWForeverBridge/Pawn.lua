-- WoW Forever Bridge — captura da escala Pawn (pesos por stat + valor do equipo).
-- Lê PawnCommon.Scales (global do addon Pawn 2.14.3) e PawnGetInventoryItemValues
-- dentro de pcall e grava em WoWForeverBridgeDB.pawn. Em falha grava só
-- WoWForeverBridgeDB.pawnErro = { erro, capturado } — nunca apaga uma captura boa.
-- PawnCommon é somente leitura: nada é escrito de volta no Pawn.
--
-- APIs usadas (verificadas en Pawn.lua instalado):
--   PawnGetAllStatValues(ScaleName)      -> PawnCommon.Scales[ScaleName].Values
--                                          (Pawn.lua:5146-5162)
--   PawnGetInventoryItemValues('player') -> TotalValues, Count, ItemLevel
--                                          (Pawn.lua:2028-2101)
--   UnitClass('player')                  -> _, _, ClassID
--   VgerCore.SpecsExist + GetSpecialization() -> SpecID (Pawn.lua:839-843)
-- Não existe API "escala ativa": a candidata é inferida por ClassID/SpecID.
--   Em SavedVariables as escalas de provedor perdem .Values (Pawn.lua:5665-5671),
--   mas em runtime existem (PawnAddPluginScale, Pawn.lua:5779) — por isso a
--   captura precisa acontecer dentro do jogo.
--   Mesmo motivo para capturar em PLAYER_LEAVING_WORLD e não em PLAYER_LOGOUT:
--   PawnOnLogout() (Pawn.lua:524) apaga ProviderActive/Values antes do nosso
--   handler rodar. Já desinicializado, a captura sai em silêncio em vez de
--   gravar um pawnErro falso.

local Logic = WoWForeverBridgeLogic

local frame = CreateFrame('Frame')
frame:RegisterEvent('PLAYER_ENTERING_WORLD')
frame:RegisterEvent('PLAYER_LOGOUT')
frame:RegisterEvent('PLAYER_QUITING')
-- PLAYER_LEAVING_WORLD dispara ANTES de PLAYER_LOGOUT, cuando Pawn todavía
-- tiene vivos los proveedores: es el último punto donde pesos y equipo son
-- legibles. En pcall porque un cliente viejo puede no conocer el evento.
pcall(frame.RegisterEvent, frame, 'PLAYER_LEAVING_WORLD')

local INTERVALO = 300 -- segundos entre capturas automáticas
local MAX_PESOS = 40
local MAX_EQUIPE = 8
local MAX_CANDIDATAS = 3
local REINTENTO_EQUIPO = 45 -- segundos tras entrar al mundo para reintentar el equipo
local MAX_REINTENTOS = 2
local lastCaptura = 0
local pendenteEquipo, tentativasEquipo = 0, 0

local function chat(msg)
  DEFAULT_CHAT_FRAME:AddMessage('|cFF00FF00WoW Forever|r ' .. msg)
end

local function garantirDB()
  if type(WoWForeverBridgeDB) ~= 'table' then
    WoWForeverBridgeDB = Logic.ensure(WoWForeverBridgeDB)
  end
  return WoWForeverBridgeDB
end

local function texto(v)
  return type(v) == 'string' and v ~= '' and v or nil
end

-- Pawn apaga los proveedores al salir: PawnOnLogout() (Pawn.lua:524) llama
-- PawnUnitializePlugins() (Pawn.lua:5665-5676), que deja ProviderActive = nil y
-- Values = nil en toda escala de proveedor. Pawn carga antes que este addon
-- (P < W), así que en PLAYER_LOGOUT su handler corre primero: sin esta guarda
-- leeríamos "sin escala para classID N" y grabaríamos un error falso.
-- Devuelve vivo, total de escalas y escalas con datos (diagnóstico del error).
local function pluginsAtivos()
  if type(PawnCommon) ~= 'table' or type(PawnCommon.Scales) ~= 'table' then return false, 0, 0 end
  local total, ativas, temProvedor = 0, 0, false
  for _, escala in pairs(PawnCommon.Scales) do
    if type(escala) == 'table' then
      total = total + 1
      if escala.Provider ~= nil then
        temProvedor = true
        if escala.ProviderActive == true then ativas = ativas + 1 end
      elseif type(escala.Values) == 'table' then
        ativas = ativas + 1 -- escala custom: nunca la desinicializa Pawn
      end
    end
  end
  -- Sin escalas de proveedor no hay nada que Pawn pueda apagar al salir.
  return (not temProvedor) or ativas > 0, total, ativas
end

-- Diagnóstico de por qué el equipo viene sin valores: cuenta ítems con stats en
-- la caché de Pawn (Item.Stats sale de C_Item.GetItemStats, Pawn.lua:4664) y
-- escalas visibles para ESTE personaje (PawnIsScaleVisible exige
-- PerCharacterOptions[PawnPlayerFullName], Pawn.lua:5504-5521). Todo en pcall y
-- tolerante a globals ausentes: el diagnóstico nunca debe romper la captura.
local function diagnosticoEquipe(nomeEscala)
  local d = { itens = 0, comStats = 0, escalas = 0, visiveis = 0, temValues = false, perChar = false }
  if type(PawnCommon) ~= 'table' or type(PawnCommon.Scales) ~= 'table' then return d end
  for nome in pairs(PawnCommon.Scales) do
    d.escalas = d.escalas + 1
    local ok, vis = pcall(function() return PawnIsScaleVisible and PawnIsScaleVisible(nome) end)
    if ok and vis == true then d.visiveis = d.visiveis + 1 end
  end
  local escala = PawnCommon.Scales[nomeEscala]
  if type(escala) == 'table' then
    d.temValues = type(escala.Values) == 'table'
    local opcoes = escala.PerCharacterOptions
    if type(opcoes) == 'table' and PawnPlayerFullName ~= nil then
      d.perChar = type(opcoes[PawnPlayerFullName]) == 'table'
    end
  end
  if PawnGetItemDataForInventorySlot ~= nil and GetInventoryItemLink ~= nil then
    for slot = 1, 18 do
      if slot ~= 4 then
        local okLink, link = pcall(GetInventoryItemLink, 'player', slot)
        if okLink and link then
          d.itens = d.itens + 1
          local okItem, item = pcall(PawnGetItemDataForInventorySlot, slot, false, 'player')
          if okItem and type(item) == 'table' and type(item.Stats) == 'table' then
            local conta = 0
            for _ in pairs(item.Stats) do conta = conta + 1 end
            if conta > 0 then d.comStats = d.comStats + 1 end
          end
        end
      end
    end
  end
  return d
end

-- Escolhe a escala do jogador entre PawnCommon.Scales. Não há API de "escala
-- ativa": filtramos escalas de provedor ativas ou custom do personagem
-- ((not Provider) or ProviderActive, mesmo critério de PawnGetAllScales,
-- Pawn.lua:5208-5212) com ClassID do jogador e preferimos SpecID == spec atual.
local function escolherEscala(classID, specID)
  local candidatas = {}
  for nome, escala in pairs(PawnCommon.Scales) do
    if type(escala) == 'table'
      and ((escala.Provider == nil) or escala.ProviderActive)
      and escala.ClassID == classID then
      candidatas[#candidatas + 1] = {
        nome = tostring(nome),
        localized = texto(escala.LocalizedName) or tostring(nome),
        provider = texto(escala.Provider),
        classID = escala.ClassID,
        specID = escala.SpecID,
        role = texto(escala.Role),
      }
    end
  end
  if #candidatas == 0 then return nil, {} end
  table.sort(candidatas, function(a, b)
    local aSpec = specID ~= nil and a.specID == specID
    local bSpec = specID ~= nil and b.specID == specID
    if aSpec ~= bSpec then return aSpec end
    return a.nome < b.nome
  end)
  local escolhida = candidatas[1]
  local guardadas = {}
  for i = 1, math.min(#candidatas, MAX_CANDIDATAS) do guardadas[i] = candidatas[i] end
  return escolhida, guardadas
end

-- Pesos da escala: PawnCommon.Scales[nome].Values ou PawnGetAllStatValues(none)
-- em pcall. Só chaves string com valores numéricos (Values pode trazer
-- sub-tabelas); no máximo MAX_PESOS, com truncado=true se sobrar.
local function lerPesos(nomeEscala)
  local values = nil
  local escala = PawnCommon.Scales[nomeEscala]
  if type(escala) == 'table' and type(escala.Values) == 'table' then
    values = escala.Values
  elseif PawnGetAllStatValues then
    local ok, v = pcall(PawnGetAllStatValues, nomeEscala)
    if ok and type(v) == 'table' then values = v end
  end
  local pesos, truncado = {}, false
  if values then
    local n = 0
    for k, v in pairs(values) do
      if type(k) == 'string' and k ~= '' and type(v) == 'number' then
        if n >= MAX_PESOS then truncado = true break end
        pesos[k] = v
        n = n + 1
      end
    end
  end
  return pesos, truncado
end

-- Valor do equipo posto: PawnGetInventoryItemValues('player') devolve
-- TotalValues, Count, TotalItemLevel (Pawn.lua:2028-2101). Guardamos até
-- MAX_EQUIPE entradas {escala, valor, localized} e o ilvl médio.
local function lerEquipe()
  if PawnGetInventoryItemValues == nil then return nil end
  local ok, total, _, ilvl = pcall(PawnGetInventoryItemValues, 'player')
  if not ok or type(total) ~= 'table' then return nil end
  local valores = {}
  local n = math.min(#total, MAX_EQUIPE)
  for i = 1, n do
    local e = total[i]
    if type(e) == 'table' and type(e[1]) == 'string' and type(e[2]) == 'number' then
      valores[#valores + 1] = { escala = e[1], valor = e[2], localized = texto(e[4]) }
    end
  end
  local ilvlOk = type(ilvl) == 'number' and ilvl >= 0 and ilvl <= 1000
  return { valores = valores, ilvl = ilvlOk and math.floor(ilvl) or nil }
end

local function capturarPawn(forcar)
  local ok, err = pcall(function()
    -- Pawn ausente/desativado: silêncio (o plugin declara "sin captura").
    if type(PawnCommon) ~= 'table' or type(PawnCommon.Scales) ~= 'table' then return end
    -- Pawn já desinicializado (logout/reload, ver pluginsAtivos): não é falha
    -- de dados, é Pawn apagado. Silêncio: nem captura, nem erro, nem throttle.
    local vivo, totalEscalas, escalasAtivas = pluginsAtivos()
    if not vivo then return end
    local j = garantirDB()
    local now = time()
    if not forcar and now - lastCaptura < INTERVALO then return end
    lastCaptura = now

    local _, _, classID = UnitClass('player')
    local specID
    if VgerCore and VgerCore.SpecsExist and GetSpecialization then
      specID = GetSpecialization()
    end

    local escolhida, candidatas = escolherEscala(classID, specID)
    if not escolhida then
      -- Falha real: Pawn vivo e ninguna escala con el ClassID del jugador.
      -- Se declara con el contexto de lo que sí había, para diagnosticar.
      j.pawnErro = {
        erro = 'pawn: sem escala para classID ' .. tostring(classID) ..
          ' (escalas=' .. tostring(totalEscalas) .. ', ativas=' .. tostring(escalasAtivas) .. ')',
        capturado = now,
      }
      return
    end

    local pesos, truncadoPesos = lerPesos(escolhida.nome)
    local equipo = lerEquipe()
    if type(equipo) == 'table' and #equipo.valores == 0 then
      -- Autopsia en el chat (temporal, sin comandos que tipear): dice qué ve
      -- Pawn cuando el equipo viene vacío. Se retira al cerrar el diagnóstico.
      local d = diagnosticoEquipe(escolhida.nome)
      equipo.diag = d
      chat('pawn diag: itens=' .. d.itens .. ' comStats=' .. d.comStats ..
        ' escalas=' .. d.escalas .. ' visiveis=' .. d.visiveis ..
        ' temValues=' .. tostring(d.temValues) .. ' perChar=' .. tostring(d.perChar) ..
        ' ilvl=' .. tostring(equipo.ilvl))
    end
    j.pawn = {
      v = 1,
      escala = escolhida.nome,
      localized = escolhida.localized,
      provider = escolhida.provider,
      classID = escolhida.classID,
      specID = escolhida.specID,
      pesos = pesos,
      equipo = equipo,
      candidatas = candidatas,
      capturado = now,
      origem = 'addon',
      truncado = truncadoPesos,
    }
    j.pawnErro = nil
  end)
  if not ok then
    local j = garantirDB()
    j.pawnErro = { erro = tostring(err), capturado = time() }
  end
end

local function reportPawn()
  local j = WoWForeverBridgeDB
  if type(j) == 'table' and type(j.pawn) == 'table' then
    chat('pawn: escala guardada — ' .. tostring(j.pawn.localized or j.pawn.escala) ..
      ' (capturado=' .. tostring(j.pawn.capturado) .. '). El plugin WoW Forever lo lee al sincronizar el puente.')
  elseif type(j) == 'table' and type(j.pawnErro) == 'table' then
    chat('pawn: la captura falló — ' .. tostring(j.pawnErro.erro))
  else
    chat('pawn: sin captura. ¿Pawn instalado? Prueba /reload y /wfbpawn.')
  end
end

-- Equipo incompleto: Pawn devolve ilvl mas nenhum valor por escala quando os
-- dados de ítem ainda não estão cacheados (PawnAddStatToTable descarta Amount 0,
-- Pawn.lua:2693). Não é dado ausente de verdade: é cedo. Se reintenta una vez.
local function equipamentoIncompleto()
  local j = WoWForeverBridgeDB
  if type(j) ~= 'table' or type(j.pawn) ~= 'table' then return false end
  local eq = j.pawn.equipo
  return type(eq) == 'table' and type(eq.valores) == 'table' and #eq.valores == 0
end

frame:SetScript('OnEvent', function(_, event)
  if event == 'PLAYER_ENTERING_WORLD' then
    garantirDB()
    tentativasEquipo = 0
    capturarPawn(false)
    if equipamentoIncompleto() then pendenteEquipo = REINTENTO_EQUIPO end
  elseif event == 'PLAYER_LEAVING_WORLD' then
    -- Salida del mundo: Pawn todavía vivo (PawnUnitializePlugins llega después,
    -- en PLAYER_LOGOUT). Es la captura final real; nada de reintentos aquí.
    pendenteEquipo = 0
    capturarPawn(true)
  else
    -- logout/quit: si Pawn ya se apagó, capturarPawn sale en silencio en vez de
    -- grabar un error falso. Si sigue vivo, captura igual que antes.
    pendenteEquipo = 0
    capturarPawn(true)
  end
end)

-- Un solo reintento del equipo (máx. MAX_REINTENTOS) para no capturar en bucle.
frame:SetScript('OnUpdate', function(_, elapsed)
  if pendenteEquipo <= 0 then return end
  pendenteEquipo = pendenteEquipo - (elapsed or 0)
  if pendenteEquipo > 0 then return end
  tentativasEquipo = tentativasEquipo + 1
  capturarPawn(true)
  if tentativasEquipo < MAX_REINTENTOS and equipamentoIncompleto() then
    pendenteEquipo = REINTENTO_EQUIPO
  else
    pendenteEquipo = 0
  end
end)

SLASH_WOWFOREVERBRIDGE3 = '/wfbpawn'
SlashCmdList['WOWFOREVERBRIDGE3'] = function(msg)
  local cmd = string.lower(string.match(msg or '', '^(%S*)') or '')
  if cmd == '' or cmd == 'pawn' then
    capturarPawn(true)
    reportPawn()
  else
    chat('uso: /wfbpawn')
  end
end

-- /wfbp pawn também força a captura (o handler de Personaje.lua segue intacto
-- para os demais subcomandos; SlashCmdList é uma tabela simples).
local prevWfbp = SlashCmdList['WOWFOREVERBRIDGE2']
if prevWfbp then
  SlashCmdList['WOWFOREVERBRIDGE2'] = function(msg)
    local cmd = string.lower(string.match(msg or '', '^(%S*)') or '')
    if cmd == 'pawn' then
      capturarPawn(true)
      reportPawn()
    else
      prevWfbp(msg)
    end
  end
end
