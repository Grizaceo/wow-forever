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

-- ===== Catálogo de stats por ítem (itemID -> stats) =====
-- Pawn solo expone valores del equipo puesto (PawnGetInventoryItemValues): para
-- puntuar ofertas de subasta hace falta un catálogo itemID -> stats, y los stats
-- de un ítem solo existen dentro del cliente. Se cosecha aquí, no contra una
-- base externa, y se graba en WoWForeverBridgeDB.pawnCatalogo.
--
-- APIs (verificadas en este cliente):
--   GetItemInfo(id | 'item:id') -> nil si el ítem no está cacheado
--                                  (Pawn.lua:1389-1395: "not in the local cache")
--   C_Item.GetItemInfoInstant(link) -> ItemID, _, _, InvType, Texture, ClassID, SubClassID
--                                  (Pawn.lua:1341 y :1388)
--   C_Item.GetDetailedItemLevelInfo(link) -> ilvl real (Pawn.lua:1422)
--   C_Item.GetItemStats(link) -> tabla de stats ITEM_MOD_*/RESISTANCE*_NAME;
--     responde para ítems NO equipados con la sola condición de estar cacheados
--     (ForeverDungeonJournal/Systems/LootFilter.lua:482-486 lo usa así con
--     "item:<id>" y trata `next(stats) == nil` como "not loaded yet";
--     Simulationcraft/forever/stats.lua:70-78 usa la variante global).
--     Las 133 claves posibles están registradas en Wow.exe (ver fixture de tests).

local MAX_LOTE = 200 -- ids intentados por ciclo de cosecha
local MAX_TICK = 25 -- ids por frame: nunca bloquear el cliente
local MAX_ITENS = 3000 -- tope del catálogo (tamaño del SavedVariables)
local MAX_STATS = 40 -- stats por ítem
local MAX_SLOTS = 19 -- slots de equipo del jugador
local INTERVALO_CATALOGO = 300 -- segundos entre ciclos automáticos
local lastCatalogo = 0
local fila, filaIdx, filaCursor, filaVolta, filaIds = nil, 0, 0, false, nil

local function apiItemInfo()
  return (C_Item and C_Item.GetItemInfo) or GetItemInfo
end

local function apiItemInfoInstant()
  return (C_Item and C_Item.GetItemInfoInstant) or GetItemInfoInstant
end

local function apiStats()
  local fn = (C_Item and C_Item.GetItemStats) or GetItemStats
  if type(fn) ~= 'function' then return nil end
  return fn
end

-- Datos de un link: id, ilvl, equipLoc, classID, subClassID y (si getStats)
-- los stats crudos normalizados. Sin stats no se descarta: el plugin decide.
local function dadosDoLink(link, getStats)
  local inst = apiItemInfoInstant()
  if type(inst) ~= 'function' then return nil end
  local okI, id, _, _, invType, _, classID, subClassID = pcall(inst, link)
  if not okI or type(id) ~= 'number' or id <= 0 then return nil end
  local rec = { id = id }
  if type(invType) == 'string' and invType ~= '' then rec.l = invType end
  if type(classID) == 'number' then rec.c = classID end
  if type(subClassID) == 'number' then rec.s = subClassID end
  local lvl = C_Item and C_Item.GetDetailedItemLevelInfo
  if type(lvl) == 'function' then
    local okL, v = pcall(lvl, link)
    if okL and type(v) == 'number' and v >= 0 and v <= 1000 then rec.i = math.floor(v) end
  end
  if getStats then
    local ok, stats = pcall(getStats, link)
    if ok and type(stats) == 'table' then
      local k, truncado = Logic.normalizarStats(stats, MAX_STATS)
      if next(k) ~= nil then rec.k = k end
      if truncado then rec.t = true end
    end
  end
  return rec
end

-- Equipo puesto, slot por slot (para el delta contra lo equipado). No sustituye
-- a equipo.valores, que sigue siendo el valor que calcula Pawn.
local function lerEquipado(getStats)
  local ger = GetInventoryItemLink
  if type(ger) ~= 'function' then return nil end
  local out, n = {}, 0
  for slot = 1, MAX_SLOTS do
    local ok, link = pcall(ger, 'player', slot)
    if ok and type(link) == 'string' then
      local rec = dadosDoLink(link, getStats)
      if rec then
        out[slot] = rec
        if rec.k then n = n + 1 end
      end
    end
  end
  return n > 0 and out or nil
end

-- Asegura y sanea el bloque pawnCatalogo del SavedVariables.
local function catDB(j)
  local cat = Logic.ensureCatalogo(j.pawnCatalogo)
  j.pawnCatalogo = cat
  return cat
end

-- Ids de la fuente: el mismo reino de Auctionator que ya ingiere el puente.
local function idsDaSubasta()
  local db = AUCTIONATOR_PRICE_DATABASE
  if type(db) ~= 'table' or db.__dbversion ~= 8 then return nil end
  local nome = (type(GetRealmName) == 'function') and GetRealmName() or nil
  local realm = Logic.currentRealm(db, nome)
  if not realm then return nil end
  return Logic.idsDaFonte(realm)
end

-- Cierra el lote en curso: avanza el cursor, cuenta la vuelta y poda. También
-- recalcula resolvidos/pendientes a partir del catálogo real (nunca del deseo).
local function fecharLote(cat)
  cat.cursor = filaCursor or 0
  if filaVolta then
    cat.volta = (cat.volta or 0) + 1
    if type(filaIds) == 'table' then Logic.podarCatalogo(cat.itens, filaIds) end
  end
  local total = 0
  for _ in pairs(cat.itens) do total = total + 1 end
  cat.resolvidos = total
  cat.pendentes = math.max(0, (cat.fonte or 0) - total)
  cat.truncado = total >= MAX_ITENS or nil
  fila, filaIdx, filaVolta, filaIds = nil, 0, false, nil
end

-- Prepara el próximo lote (cursor persistente). Devuelve true si hay ids que
-- intentar en este ciclo; si no queda ninguno pendiente, cierra el lote igual
-- (para avanzar cursor y podar) y devuelve false.
local function iniciarCiclo(forcar)
  local agora = time()
  if not forcar and agora - lastCatalogo < INTERVALO_CATALOGO then return false end
  if not apiStats() then return false end
  local ids = idsDaSubasta()
  if not ids or #ids == 0 then return false end
  local cat = catDB(garantirDB())
  lastCatalogo = agora
  cat.fonte = #ids
  cat.ciclo = (cat.ciclo or 0) + 1
  local lote = Logic.loteColheita(ids, cat.cursor or 0, cat.itens, MAX_LOTE)
  fila, filaIdx, filaCursor, filaVolta, filaIds = lote.ids, 1, lote.cursor, lote.volta, ids
  if #lote.ids == 0 then
    fecharLote(cat)
    return false
  end
  return true
end

-- Procesa hasta MAX_TICK ids de la fila. Sin C_Timer: se llama desde OnUpdate
-- (y en modo síncrono desde el comando de chat).
local function passarFila(maxTick)
  if not fila then return 0 end
  local getStats = apiStats()
  local info = apiItemInfo()
  if not getStats or type(info) ~= 'function' then
    fila, filaIdx, filaVolta, filaIds = nil, 0, false, nil
    return 0
  end
  local cat = catDB(garantirDB())
  local novos, n = 0, 0
  while filaIdx <= #fila and n < (maxTick or MAX_TICK) do
    local id = fila[filaIdx]
    filaIdx = filaIdx + 1
    n = n + 1
    if cat.itens[id] == nil then
      local ok, _, link = pcall(info, id)
      if not (ok and type(link) == 'string') then
        ok, _, link = pcall(info, 'item:' .. id)
      end
      if ok and type(link) == 'string' then
        local rec = dadosDoLink(link, getStats)
        if rec and rec.k then
          cat.itens[id] = rec
          novos = novos + 1
        end
      end
    end
  end
  if novos > 0 then cat.colhido = time() end
  if filaIdx > #fila then fecharLote(cat) end
  return novos
end

-- Ciclo completo de forma síncrona (comando de chat): hasta MAX_LOTE ids.
local function cosecharAgora()
  if not iniciarCiclo(true) then return false end
  passarFila(#fila)
  return true
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
    local equipado = lerEquipado(apiStats())
    j.pawn = {
      v = 1,
      escala = escolhida.nome,
      localized = escolhida.localized,
      provider = escolhida.provider,
      classID = escolhida.classID,
      specID = escolhida.specID,
      pesos = pesos,
      equipo = equipo,
      equipado = equipado,
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
-- En el mismo OnUpdate avanza la cosecha de stats: MAX_TICK ids por frame, y un
-- ciclo nuevo cada INTERVALO_CATALOGO. Sin trabajo pendiente sale de inmediato.
frame:SetScript('OnUpdate', function(_, elapsed)
  if fila then passarFila(MAX_TICK) end
  if not fila then iniciarCiclo(false) end
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

-- Reporte de la cosecha para el chat (sin PII: solo conteos).
local function reportCatalogo()
  local j = WoWForeverBridgeDB
  local cat = type(j) == 'table' and j.pawnCatalogo or nil
  if type(cat) ~= 'table' then
    chat('catálogo de stats: sin datos. ¿Auctionator con escaneos? Prueba /wfbpawn catalogo.')
    return
  end
  chat('catálogo de stats: ' .. tostring(cat.resolvidos or 0) .. '/' .. tostring(cat.fonte or 0) ..
    ' ítems con stats (pendientes no cacheados: ' .. tostring(cat.pendentes or 0) ..
    ', vueltas: ' .. tostring(cat.volta or 0) ..
    ', truncado: ' .. tostring(cat.truncado == true) .. ').')
end

SLASH_WOWFOREVERBRIDGE3 = '/wfbpawn'
SlashCmdList['WOWFOREVERBRIDGE3'] = function(msg)
  local cmd = string.lower(string.match(msg or '', '^(%S*)') or '')
  if cmd == '' or cmd == 'pawn' then
    capturarPawn(true)
    reportPawn()
  elseif cmd == 'catalogo' then
    if not apiStats() then
      chat('catálogo de stats: este cliente no expone GetItemStats, así que no se pueden leer stats de ítem.')
    elseif cosecharAgora() then
      reportCatalogo()
    else
      -- Distinguir las tres causas reales: sin Auctionator, con versión
      -- inesperada o con el reino actual fuera de su base. Sin esto el usuario
      -- solo veía «nada que cosechar» y no sabía qué mirar.
      local db = AUCTIONATOR_PRICE_DATABASE
      local reino = (type(GetRealmName) == 'function') and GetRealmName() or nil
      local motivo
      if type(db) ~= 'table' then
        motivo = 'Auctionator no tiene su base cargada (¿addon desactivado o sin escaneos?)'
      elseif db.__dbversion ~= 8 then
        motivo = 'Auctionator con __dbversion ' .. tostring(db.__dbversion) .. ' (se espera 8)'
      elseif not Logic.currentRealm(db, reino) then
        motivo = 'el reino «' .. tostring(reino or '?') .. '» no aparece en la base de Auctionator'
      else
        motivo = 'no quedan ítems pendientes en el lote'
      end
      chat('catálogo de stats: nada que cosechar — ' .. motivo .. '.')
    end
  else
    chat('uso: /wfbpawn [catalogo]')
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
    elseif cmd == 'catalogo' then
      if cosecharAgora() then
        reportCatalogo()
      else
        chat('catálogo de stats: nada que cosechar (sin Auctionator cacheado o sin API de stats).')
      end
    else
      prevWfbp(msg)
    end
  end
end
