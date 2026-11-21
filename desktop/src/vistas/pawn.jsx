// Tarjeta «Escala Pawn»: pesos por stat y valor del equipo puesto, leídos de la
// captura del addon (WoWForeverBridgeDB.pawn) y del catálogo PawnCommon
// (SavedVariables/Pawn.lua). Todo viene del juego; sin captura se dice
// explícitamente y nunca se inventa una escala ni sus pesos.
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import {
  lerPawn, lerCatalogoPawn, escalaDoJogador,
} from '../pawn.js'
import { C, S } from '../estilos.js'
import { agregarTextos, t } from '../i18n.js'
import { Tarjeta } from '../ui.jsx'

agregarTextos({
  'pawn.titulo': 'Escala Pawn',
  'pawn.semCaptura': 'Sin captura de Pawn',
  'pawn.semCaptura.ayuda': 'Con Pawn en el juego, WoWForeverBridge guarda la escala activa al entrar al mundo. Para forzarla: /wfbpawn (o /wfbp pawn).',
  'pawn.origem.addon': 'Leído del juego',
  'pawn.origem.addon.ayuda': 'Pawn.lua del addon WoWForeverBridge leyó PawnCommon y el equipo dentro del juego; el plugin lo lee del diario del puente.',
  'pawn.erro': 'La última captura de Pawn falló',
  'pawn.pesos': 'Pesos por stat',
  'pawn.equipo': 'Valor del equipo puesto',
  'pawn.semPesos': 'La escala capturada no trajo pesos.',
  'pawn.truncado': 'La lista de pesos quedó recortada por tamaño.',
  'pawn.catalogo': 'Catálogo de escalas',
  'pawn.catalogo.n': '{n} escalas en Pawn.lua',
  'pawn.catalogo.ayuda': 'SavedVariables/Pawn.lua no guarda los pesos de las escalas de proveedor (Pawn los borra al cerrar); solo el catálogo.',
  'pawn.consent': 'Leer Pawn.lua (catálogo de escalas) de la carpeta concedida. Sin esta casilla el plugin no abre ese archivo.',
  'pawn.consent.ayuda': 'Pawn.lua está fuera de los tres archivos que el plugin declara leer. Se lee solo si lo autorizas aquí; puedes revocarlo cuando quieras.',
  'pawn.catalogo.elegida': 'Escala según tu clase',
  'pawn.motivo.capturada': 'Capturada por el addon',
  'pawn.motivo.catalogo-clase-spec': 'Clase y spec del catálogo',
  'pawn.motivo.catalogo-clase': 'Solo clase (spec desconocida)',
  'pawn.motivo.sin-coincidencia': 'Ninguna escala coincide con tu clase',
  'pawn.spec': 'spec {n}',
  'pawn.valores': '{n} valores de escala',
}, {
  'pawn.titulo': 'Pawn scale',
  'pawn.semCaptura': 'No Pawn capture',
  'pawn.semCaptura.ayuda': 'With Pawn in game, WoWForeverBridge saves the active scale when you enter the world. To force it: /wfbpawn (or /wfbp pawn).',
  'pawn.origem.addon': 'Read from the game',
  'pawn.origem.addon.ayuda': 'WoWForeverBridge’s Pawn.lua read PawnCommon and your gear inside the game; the plugin reads it from the bridge journal.',
  'pawn.erro': 'The last Pawn capture failed',
  'pawn.pesos': 'Stat weights',
  'pawn.equipo': 'Equipped gear value',
  'pawn.semPesos': 'The captured scale came without weights.',
  'pawn.truncado': 'The weight list was trimmed for size.',
  'pawn.catalogo': 'Scale catalog',
  'pawn.catalogo.n': '{n} scales in Pawn.lua',
  'pawn.catalogo.ayuda': 'SavedVariables/Pawn.lua does not store provider scale weights (Pawn clears them on logout); catalog only.',
  'pawn.consent': 'Read Pawn.lua (scale catalog) from the granted folder. Without this box the plugin does not open that file.',
  'pawn.consent.ayuda': 'Pawn.lua is outside the three files the plugin declares it reads. It is read only if you allow it here; you can revoke it at any time.',
  'pawn.catalogo.elegida': 'Scale matching your class',
  'pawn.motivo.capturada': 'Captured by the addon',
  'pawn.motivo.catalogo-clase-spec': 'Class and spec from the catalog',
  'pawn.motivo.catalogo-clase': 'Class only (spec unknown)',
  'pawn.motivo.sin-coincidencia': 'No scale matches your class',
  'pawn.spec': 'spec {n}',
  'pawn.valores': '{n} scale values',
})

const fecha = (unix) => {
  if (!Number.isInteger(unix) || unix <= 0) return '—'
  try { return new Date(unix * 1000).toLocaleString() } catch { return '—' }
}

const MOTIVO = {
  'capturada': 'pawn.motivo.capturada',
  'catalogo-clase-spec': 'pawn.motivo.catalogo-clase-spec',
  'catalogo-clase': 'pawn.motivo.catalogo-clase',
  'sin-coincidencia': 'pawn.motivo.sin-coincidencia',
}

// Una línea acotada para DAVI: escala activa, procedencia, pesos de juego (no
// simulación) y valor del equipo. Nunca incluye candidatas ni datos de cuenta.
export function resumenPawn(registro, catalogo, { classe = null, spec = null } = {}, lang = 'es') {
  const esc = escalaDoJogador(catalogo, registro, { classe, spec })
  if (!esc.escala) return null
  const partes = []
  partes.push((esc.escala.localized || esc.escala.nome) +
    (esc.escala.provider ? ' (' + esc.escala.provider + ')' : ''))
  partes.push(t(lang, MOTIVO[esc.motivo] || esc.motivo))
  if (esc.temPesos) partes.push(t(lang, 'pawn.valores', { n: Object.keys(esc.escala.pesos || {}).length }))
  if (registro?.equipo?.ilvl != null) partes.push('ilvl ' + registro.equipo.ilvl)
  if (registro?.capturado) partes.push(t(lang, 'simc.capturado') + ' ' + fecha(registro.capturado))
  return 'Pawn: ' + partes.join(' · ')
}

export function TarjetaPawn({ ctx, lang, perfil, puente, onResumen }) {
  const [registro, setRegistro] = useState(null)
  const [catalogo, setCatalogo] = useState(null)
  const [cargado, setCargado] = useState(false)
  const [estado, setEstado] = useState('')
  const [frescura, setFrescura] = useState(0)
  const [consentimiento, setConsentimiento] = useState(() => ctx.storage.get('pawn-consent', false) === true)

  const leer = async () => {
    setEstado(t(lang, 'simc.leyendo'))
    if (puente && typeof puente.poll === 'function') {
      try { await puente.poll() } catch { /* el estado del puente se muestra en su pestaña */ }
    }
    // El catálogo guardado se muestra siempre; el consentimiento solo gobierna
    // la lectura del archivo SavedVariables/Pawn.lua (bridge-sync.js).
    const [reg, cat] = await Promise.all([
      lerPawn(ctx),
      lerCatalogoPawn(ctx),
    ])
    setRegistro(reg)
    setCatalogo(cat)
    setCargado(true)
    setFrescura(Date.now() / 1000)
    setEstado('')
  }

  useEffect(() => { void leer() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const escolha = useMemo(
    () => escalaDoJogador(catalogo, registro, { classe: perfil?.clase ?? null, spec: null }),
    [catalogo, registro, perfil?.clase],
  )

  useEffect(() => {
    onResumen?.(resumenPawn(registro, catalogo, { classe: perfil?.clase ?? null, spec: null }, lang))
  }, [registro, catalogo, perfil?.clase, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const pesos = registro?.pesos && typeof registro.pesos === 'object'
    ? Object.entries(registro.pesos)
      .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    : []
  const valoresEquipo = Array.isArray(registro?.equipo?.valores) ? registro.equipo.valores : []
  const ilvl = Number.isInteger(registro?.equipo?.ilvl) ? registro.equipo.ilvl : null
  const viejo = registro?.capturado ? (frescura - registro.capturado) > 7 * 86400 : false
  const nEscalas = catalogo?.escalas?.length ?? 0

  const cambiarConsentimiento = (v) => {
    setConsentimiento(v)
    try { ctx.storage.set('pawn-consent', v) } catch { /* preferencia */ }
    void leer()
  }

  return (
    <Tarjeta titulo={t(lang, 'pawn.titulo')}>
      <label style={{ ...S.sub, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <input data-testid="pawn-consent" type="checkbox" checked={consentimiento}
          onChange={(e) => cambiarConsentimiento(e.target.checked)} style={{ marginTop: 2 }} />
        <span title={t(lang, 'pawn.consent.ayuda')}>{t(lang, 'pawn.consent')}</span>
      </label>
      {!cargado ? <div style={S.sub}>{t(lang, 'simc.leyendo')}</div> : null}
      {cargado && !registro ? (
        <div style={S.sub}>
          {t(lang, 'pawn.semCaptura')} — {t(lang, 'pawn.semCaptura.ayuda')}{' '}
          <Button size="xs" variant="outline" onClick={() => { void ler() }}>{t(lang, 'simc.releer')}</Button>
        </div>
      ) : null}
      {registro ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span title={t(lang, 'pawn.origem.addon.ayuda')}
              style={{ ...S.chip, borderColor: C.verde, color: C.verde }}>
              {t(lang, 'pawn.origem.addon')}
            </span>
            {registro.capturado ? (
              <span style={{ ...S.chip, borderColor: viejo ? C.amarillo : C.borde2, color: viejo ? C.amarillo : C.texto3 }}>
                {t(lang, 'simc.capturado')} {fecha(registro.capturado)}
              </span>
            ) : null}
            {registro.truncado ? (
              <span style={{ ...S.chip, borderColor: C.amarillo, color: C.amarillo }}>{t(lang, 'pawn.truncado')}</span>
            ) : null}
            {registro.erro ? (
              <span title={registro.erro.msg} style={{ ...S.chip, borderColor: C.rojo, color: C.rojo }}>
                {t(lang, 'pawn.erro')}
              </span>
            ) : null}
            <Button size="xs" variant="outline" onClick={() => { void ler() }}>{t(lang, 'simc.releer')}</Button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ minWidth: 90 }}>
              <div style={S.etiqueta}>{t(lang, 'pawn.catalogo.elegida')}</div>
              <div style={{ fontSize: 13 }}>
                {escolha.escala ? (escolha.escala.localized || escolha.escala.nome) : '—'}
                {escolha.escala?.provider ? <span style={S.etiqueta}> · {escolha.escala.provider}</span> : null}
                {Number.isInteger(escolha.escala?.specID) ? <span style={S.etiqueta}> · {t(lang, 'pawn.spec', { n: escolha.escala.specID })}</span> : null}
              </div>
              <div style={S.etiqueta}>{t(lang, MOTIVO[escolha.motivo] || escolha.motivo)}</div>
            </div>
            {ilvl !== null ? (
              <div style={{ minWidth: 90 }}>
                <div style={S.etiqueta}>{t(lang, 'pawn.equipo')}</div>
                <div style={{ fontSize: 13 }}>ilvl {ilvl} · {t(lang, 'pawn.valores', { n: valoresEquipo.length })}</div>
              </div>
            ) : null}
          </div>
          <div>
            <div style={S.etiqueta}>{t(lang, 'pawn.pesos')}</div>
            {pesos.length === 0 ? <div style={S.sub}>{t(lang, 'pawn.semPesos')}</div> : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {pesos.map(([stat, valor]) => (
                  <span key={stat} data-pawn-fila style={S.chip} title={stat}>
                    {stat} {valor}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
      {catalogo && nEscalas ? (
        <div style={S.sub}>
          {t(lang, 'pawn.catalogo')}: {t(lang, 'pawn.catalogo.n', { n: nEscalas })}
          {catalogo.versao != null ? ' · Pawn ' + catalogo.versao : ''}
          {' — '}{t(lang, 'pawn.catalogo.ayuda')}
        </div>
      ) : null}
      {estado ? <div style={S.sub} role="status">{estado}</div> : null}
    </Tarjeta>
  )
}
