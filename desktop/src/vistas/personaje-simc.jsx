// Estado del personaje leído del export de SimulationCraft (parser puro en
// ../simc.js). Muestra procedencia (addon vs pegado), fecha y frescura; permite
// pegar el export a mano y copiar el texto guardado. Nunca muestra el export
// entero ni lo manda a DAVI: solo un resumen acotado vía onResumen.
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@hermes/plugin-sdk'
import { CLAVE, MAX_TEXTO, lerPersonagem, guardarPersonagem, parsearSimc, propostaPerfil } from '../simc.js'
import { D, nombre } from '../datos.js'
import { C, S } from '../estilos.js'
import { agregarTextos, t } from '../i18n.js'
import { Aviso, NombreItem, Tarjeta } from '../ui.jsx'

agregarTextos({
  'simc.titulo': 'Estado del personaje (SimulationCraft)',
  'simc.origem.addon': 'Leído del juego',
  'simc.origem.addon.ayuda': 'WoWForeverBridge + SimulationCraft lo capturaron dentro del juego; el plugin lo lee del diario del puente.',
  'simc.origem.pegado': 'Pegado a mano',
  'simc.origem.pegado.ayuda': 'Texto del export pegado por ti; no viene del juego.',
  'simc.vazio': 'Todavía no hay estado del personaje.',
  'simc.vazio.ayuda': 'Con SimulationCraft y WoWForeverBridge 1.1+ en el juego, el addon guarda el export solo (/wfbp personagem lo fuerza). También puedes pegarlo aquí.',
  'simc.actual': 'Actual',
  'simc.viejo': 'Desactualizado',
  'simc.capturado': 'Capturado',
  'simc.releer': 'Actualizar',
  'simc.leyendo': 'Leyendo…',
  'simc.erro': 'La última captura del juego falló',
  'simc.clase': 'Clase', 'simc.spec': 'Spec', 'simc.nivel': 'Nv', 'simc.raza': 'Raza',
  'simc.reino': 'Reino', 'simc.rol': 'Rol', 'simc.faccion': 'Facción',
  'simc.stats': 'Stats', 'simc.vida': 'Vida', 'simc.armadura': 'Armadura',
  'simc.equipo': 'Equipo puesto', 'simc.equipo.vacio': 'Sin equipo en el export',
  'simc.ilvl': 'ilvl {n}',
  'simc.talentos': 'Talentos', 'simc.talentos.si': 'Exportados por el addon',
  'simc.talentos.no': 'No declarados en el export',
  'simc.talentos.grupos': '{n} grupo(s) adicionales',
  'simc.profissoes': 'Profesiones (del juego)',
  'simc.desconhecidas': '{n} líneas no reconocidas',
  'simc.pegar': 'Pegar export de SimulationCraft',
  'simc.pegar.ayuda': 'En el juego: /simc copia el export al portapapeles; pégalo aquí.',
  'simc.guardar': 'Guardar export',
  'simc.guardado': 'Export guardado.',
  'simc.muyLargo': 'El texto supera el máximo permitido.',
  'simc.copiar': 'Copiar export',
  'simc.copiado': 'Copiado. Pégalo donde lo necesites.',
  'simc.noCopiado': 'No se pudo copiar. Selecciona el texto y cópialo a mano:',
  'simc.proposta': 'El export propone actualizar tu perfil',
  'simc.aplicar': 'Aplicar al perfil',
  'simc.aplicado': 'Perfil actualizado con los datos del export.',
  'simc.sinParsear': 'El texto guardado no se reconoce como un export de SimulationCraft.',
  'simc.slot.head': 'Cabeza', 'simc.slot.neck': 'Cuello', 'simc.slot.shoulder': 'Hombros',
  'simc.slot.back': 'Espalda', 'simc.slot.chest': 'Pecho', 'simc.slot.shirt': 'Camisa',
  'simc.slot.tabard': 'Tabardo', 'simc.slot.wrist': 'Muñecas', 'simc.slot.hands': 'Manos',
  'simc.slot.waist': 'Cintura', 'simc.slot.legs': 'Piernas', 'simc.slot.feet': 'Pies',
  'simc.slot.finger1': 'Dedo 1', 'simc.slot.finger2': 'Dedo 2',
  'simc.slot.trinket1': 'Accesorio 1', 'simc.slot.trinket2': 'Accesorio 2',
  'simc.slot.main_hand': 'Mano princ.', 'simc.slot.off_hand': 'Mano sec.',
  'simc.slot.ranged': 'A distancia', 'simc.slot.ammo': 'Proyectiles',
}, {
  'simc.titulo': 'Character state (SimulationCraft)',
  'simc.origem.addon': 'Read from the game',
  'simc.origem.addon.ayuda': 'WoWForeverBridge + SimulationCraft captured it in game; the plugin reads it from the bridge journal.',
  'simc.origem.pegado': 'Pasted by hand',
  'simc.origem.pegado.ayuda': 'Export text you pasted; it did not come from the game.',
  'simc.vazio': 'No character state yet.',
  'simc.vazio.ayuda': 'With SimulationCraft and WoWForeverBridge 1.1+ in game, the addon saves the export by itself (/wfbp personagem forces it). You can also paste it here.',
  'simc.actual': 'Current',
  'simc.viejo': 'Stale',
  'simc.capturado': 'Captured',
  'simc.releer': 'Refresh',
  'simc.leyendo': 'Reading…',
  'simc.erro': 'The last in-game capture failed',
  'simc.clase': 'Class', 'simc.spec': 'Spec', 'simc.nivel': 'Lv', 'simc.raza': 'Race',
  'simc.reino': 'Realm', 'simc.rol': 'Role', 'simc.faccion': 'Faction',
  'simc.stats': 'Stats', 'simc.vida': 'Health', 'simc.armadura': 'Armor',
  'simc.equipo': 'Equipped gear', 'simc.equipo.vacio': 'No gear in the export',
  'simc.ilvl': 'ilvl {n}',
  'simc.talentos': 'Talents', 'simc.talentos.si': 'Exported by the addon',
  'simc.talentos.no': 'Not declared in the export',
  'simc.talentos.grupos': '{n} additional group(s)',
  'simc.profissoes': 'Professions (from game)',
  'simc.desconhecidas': '{n} unrecognized lines',
  'simc.pegar': 'Paste SimulationCraft export',
  'simc.pegar.ayuda': 'In game: /simc copies the export to the clipboard; paste it here.',
  'simc.guardar': 'Save export',
  'simc.guardado': 'Export saved.',
  'simc.muyLargo': 'The text exceeds the allowed size.',
  'simc.copiar': 'Copy export',
  'simc.copiado': 'Copied. Paste it wherever you need it.',
  'simc.noCopiado': 'Could not copy. Select the text and copy it by hand:',
  'simc.proposta': 'The export proposes updating your profile',
  'simc.aplicar': 'Apply to profile',
  'simc.aplicado': 'Profile updated with the export data.',
  'simc.sinParsear': 'The saved text is not recognized as a SimulationCraft export.',
  'simc.slot.head': 'Head', 'simc.slot.neck': 'Neck', 'simc.slot.shoulder': 'Shoulders',
  'simc.slot.back': 'Back', 'simc.slot.chest': 'Chest', 'simc.slot.shirt': 'Shirt',
  'simc.slot.tabard': 'Tabard', 'simc.slot.wrist': 'Wrists', 'simc.slot.hands': 'Hands',
  'simc.slot.waist': 'Waist', 'simc.slot.legs': 'Legs', 'simc.slot.feet': 'Feet',
  'simc.slot.finger1': 'Finger 1', 'simc.slot.finger2': 'Finger 2',
  'simc.slot.trinket1': 'Trinket 1', 'simc.slot.trinket2': 'Trinket 2',
  'simc.slot.main_hand': 'Main hand', 'simc.slot.off_hand': 'Off hand',
  'simc.slot.ranged': 'Ranged', 'simc.slot.ammo': 'Ammo',
})

const SLOTS = ['head', 'neck', 'shoulder', 'back', 'chest', 'shirt', 'tabard', 'wrist',
  'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2',
  'main_hand', 'off_hand', 'ranged', 'ammo']
const STATS = ['strength', 'agility', 'stamina', 'intellect', 'spirit', 'health']
const STAT_LABEL = { strength: 'FUE', agility: 'AGI', stamina: 'RES', intellect: 'INT', spirit: 'ESP', health: 'VID' }
// Un export con más de 7 días sin captura nueva se marca «desactualizado».
const VIEJO_S = 7 * 86400

const fecha = (unix) => {
  if (!Number.isInteger(unix) || unix <= 0) return '—'
  try { return new Date(unix * 1000).toLocaleString() } catch { return '—' }
}

// Una línea acotada para DAVI: identidad + stats primarios + conteo de equipo.
// Nunca incluye el export crudo ni talentos decodificados.
export function resumenSimc(registro, p, lang) {
  if (!registro || !p) return null
  const partes = []
  if (p.version) partes.push('SimC ' + p.version)
  partes.push(p.clase != null && D.personaje.clases[String(p.clase)]
    ? nombre(D.personaje.clases[String(p.clase)].n, lang) : (p.claseToken || t(lang, 'simc.sinParsear')))
  if (Number.isInteger(p.nivel)) partes.push(t(lang, 'simc.nivel') + ' ' + p.nivel)
  if (p.raza != null && D.personaje.razas[String(p.raza)]) partes.push(nombre(D.personaje.razas[String(p.raza)].n, lang))
  if (p.reino) partes.push(String(p.reino).replace(/_/g, ' '))
  const stats = STATS.filter((k) => Number.isFinite(p.stats?.[k])).map((k) => STAT_LABEL[k] + p.stats[k])
  if (stats.length) partes.push(stats.join(' '))
  const nEquipo = Object.keys(p.equipo || {}).length
  if (nEquipo) partes.push(t(lang, 'simc.equipo') + ': ' + nEquipo)
  if (p.talentos?.ativo) partes.push(t(lang, 'simc.talentos.si'))
  const capt = registro.capturado ? ' · ' + t(lang, 'simc.capturado') + ' ' + fecha(registro.capturado) : ''
  return partes.join(' · ') + capt
}

function Campo({ etiqueta, children }) {
  return (
    <div style={{ minWidth: 90 }}>
      <div style={S.etiqueta}>{etiqueta}</div>
      <div style={{ fontSize: 13 }}>{children ?? '—'}</div>
    </div>
  )
}

export function TarjetaSimc({ ctx, lang, perfil, onAplicar, puente, onResumen }) {
  const [registro, setRegistro] = useState(null)
  const [cargado, setCargado] = useState(false)
  const [pegado, setPegado] = useState('')
  const [estado, setEstado] = useState('')
  const [copia, setCopia] = useState(null)
  const [frescura, setFrescura] = useState(0)

  const leer = async () => {
    setEstado(t(lang, 'simc.leyendo'))
    // Si el puente está disponible, forzar una relectura silenciosa del diario:
    // es la vía por la que llega la captura del addon a ctx.storage. poll() y no
    // read(): read() abriría el selector de carpeta si no hay permiso concedido.
    if (puente && typeof puente.poll === 'function') {
      try { await puente.poll() } catch { /* el estado del puente se muestra en su pestaña */ }
    }
    const reg = await lerPersonagem(ctx)
    setRegistro(reg)
    setCargado(true)
    setFrescura(Date.now() / 1000)
    setEstado('')
  }

  useEffect(() => { void leer() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const parseado = useMemo(
    () => (registro?.texto ? parsearSimc(registro.texto) : null),
    [registro],
  )
  const p = parseado?.ok ? parseado.personagem : null

  useEffect(() => {
    onResumen?.(resumenSimc(registro, p, lang))
  }, [registro, p, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardarPegado = async () => {
    if (!pegado.trim()) return
    if (pegado.length > MAX_TEXTO) { setEstado(t(lang, 'simc.muyLargo')); return }
    const reg = await guardarPersonagem(ctx, {
      v: 1, origem: 'pegado', texto: pegado,
      capturado: Math.floor(Date.now() / 1000), erro: null,
    })
    if (!reg) { setEstado(t(lang, 'simc.muyLargo')); return }
    setRegistro(reg)
    setPegado('')
    setEstado(t(lang, 'simc.guardado'))
  }

  const copiar = async () => {
    if (!registro?.texto) return
    let ok = false
    try { ok = (await ctx.os.writeClipboard(registro.texto)) === true } catch { ok = false }
    setCopia({ ok, texto: registro.texto })
  }

  const proposta = p ? propostaPerfil(p, perfil, D.personaje) : null
  const aplicar = async () => {
    if (!proposta || typeof onAplicar !== 'function') return
    setEstado(t(lang, 'simc.leyendo'))
    try {
      await onAplicar(proposta.campos)
      setEstado(t(lang, 'simc.aplicado'))
    } catch (e) { setEstado(e?.message || String(e)) }
  }

  const cambios = proposta ? Object.keys(proposta.campos).map((k) => {
    if (k === 'nivel') return t(lang, 'simc.nivel') + ' → ' + proposta.campos.nivel
    if (k === 'clase') return t(lang, 'simc.clase') + ' → ' + nombre(D.personaje.clases[String(proposta.campos.clase)]?.n, lang)
    if (k === 'raza') return t(lang, 'simc.raza') + ' → ' + nombre(D.personaje.razas[String(proposta.campos.raza)]?.n, lang)
    if (k === 'faccion') return t(lang, 'simc.faccion') + ' → ' + proposta.campos.faccion
    if (k === 'reino') return t(lang, 'simc.reino') + ' → ' + proposta.campos.reino
    if (k === 'profissoes') return t(lang, 'perfil.profesiones') + ' → ' + proposta.campos.profissoes.map((id) => nombre(D.profesiones.profesiones[id]?.n, lang)).join(', ')
    if (k === 'secundarias') return t(lang, 'perfil.secundarias') + ' → ' + proposta.campos.secundarias.map((id) => nombre(D.profesiones.profesiones[id]?.n, lang)).join(', ')
    return k
  }) : []

  const viejo = registro?.capturado ? (frescura - registro.capturado) > VIEJO_S : false
  const armor = Number.isFinite(p?.combate?.defense?.armor_effective) ? p.combate.defense.armor_effective
    : Number.isFinite(p?.combate?.defense?.armor) ? p.combate.defense.armor : null

  return (
    <Tarjeta titulo={t(lang, 'simc.titulo')}>
      {!cargado ? <div style={S.sub}>{t(lang, 'simc.leyendo')}</div> : null}
      {cargado && !registro ? (
        <div style={S.sub}>{t(lang, 'simc.vazio')} {t(lang, 'simc.vazio.ayuda')}</div>
      ) : null}
      {registro ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span title={t(lang, registro.origem === 'addon' ? 'simc.origem.addon.ayuda' : 'simc.origem.pegado.ayuda')}
              style={{ ...S.chip, borderColor: registro.origem === 'addon' ? C.verde : C.azul, color: registro.origem === 'addon' ? C.verde : C.azul }}>
              {t(lang, registro.origem === 'addon' ? 'simc.origem.addon' : 'simc.origem.pegado')}
            </span>
            {registro.capturado ? (
              <span style={{ ...S.chip, borderColor: viejo ? C.amarillo : C.borde2, color: viejo ? C.amarillo : C.texto3 }}>
                {viejo ? t(lang, 'simc.viejo') : t(lang, 'simc.actual')} · {t(lang, 'simc.capturado')} {fecha(registro.capturado)}
              </span>
            ) : null}
            {registro.erro ? (
              <span title={registro.erro.msg} style={{ ...S.chip, borderColor: C.rojo, color: C.rojo }}>
                {t(lang, 'simc.erro')}
              </span>
            ) : null}
            <Button size="xs" variant="outline" onClick={() => { void leer() }}>{t(lang, 'simc.releer')}</Button>
          </div>
          {parseado && !parseado.ok ? <Aviso>{t(lang, 'simc.sinParsear')}</Aviso> : null}
          {p ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <Campo etiqueta={t(lang, 'simc.clase')}>
                  {p.clase != null ? nombre(D.personaje.clases[String(p.clase)]?.n, lang) : (p.claseToken || '—')}
                  {p.spec && p.spec !== 'unknown' ? <span style={S.etiqueta}> · {p.spec}</span> : null}
                </Campo>
                <Campo etiqueta={t(lang, 'simc.nivel')}>{Number.isInteger(p.nivel) ? p.nivel : '—'}</Campo>
                <Campo etiqueta={t(lang, 'simc.raza')}>
                  {p.raza != null ? nombre(D.personaje.razas[String(p.raza)]?.n, lang) : (p.razaToken || '—')}
                </Campo>
                <Campo etiqueta={t(lang, 'simc.reino')}>{p.reino ? String(p.reino).replace(/_/g, ' ') : '—'}</Campo>
                <Campo etiqueta={t(lang, 'simc.rol')}>{p.rol || '—'}</Campo>
              </div>
              <div>
                <div style={S.etiqueta}>{t(lang, 'simc.stats')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {STATS.map((k) => (
                    <span key={k} style={S.chip} title={k}>
                      {STAT_LABEL[k]} {Number.isFinite(p.stats?.[k]) ? p.stats[k] : '—'}
                    </span>
                  ))}
                  <span style={S.chip} title="armor">{t(lang, 'simc.armadura')} {armor ?? '—'}</span>
                </div>
              </div>
              <div>
                <div style={S.etiqueta}>{t(lang, 'simc.equipo')}</div>
                {Object.keys(p.equipo).length === 0 ? <div style={S.sub}>{t(lang, 'simc.equipo.vacio')}</div> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {SLOTS.filter((s) => p.equipo[s]).map((s) => {
                      const eq = p.equipo[s]
                      return (
                        <span key={s} style={S.chip} title={eq.nome || undefined}>
                          {t(lang, 'simc.slot.' + s)} · {eq.id != null ? <NombreItem id={eq.id} lang={lang} /> : `#?`}
                          {Number.isInteger(eq.ilvl) ? ' · ' + t(lang, 'simc.ilvl', { n: eq.ilvl }) : ''}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={S.chip} title={p.talentos?.grupos?.length ? t(lang, 'simc.talentos.grupos', { n: p.talentos.grupos.length }) : undefined}>
                  {t(lang, 'simc.talentos')}: {p.talentos?.ativo || p.talentos?.legacy ? t(lang, 'simc.talentos.si') : t(lang, 'simc.talentos.no')}
                </span>
                {p.profissoes?.length ? (
                  <span style={S.chip} title={t(lang, 'simc.profissoes')}>
                    {p.profissoes.map((x) => (D.profesiones.profesiones[x.id]?.n ? nombre(D.profesiones.profesiones[x.id].n, lang) : x.nome) + (x.skill != null ? ' ' + x.skill : '')).join(', ')}
                  </span>
                ) : null}
                {p.desconhecidas?.length ? (
                  <span style={S.etiqueta}>{t(lang, 'simc.desconhecidas', { n: p.desconhecidas.length })}</span>
                ) : null}
              </div>
              {proposta ? (
                <Aviso>
                  <div>{t(lang, 'simc.proposta')}: {cambios.join(' · ')}</div>
                  <div style={{ marginTop: 6 }}>
                    <Button size="xs" onClick={() => { void aplicar() }}>{t(lang, 'simc.aplicar')}</Button>
                  </div>
                </Aviso>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      <div>
        <div style={S.etiqueta}>{t(lang, 'simc.pegar')}</div>
        <div style={S.sub}>{t(lang, 'simc.pegar.ayuda')}</div>
        <textarea value={pegado} onChange={(e) => setPegado(e.target.value)} rows={4}
          placeholder="# SimC Addon …"
          style={{
            width: '100%', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: C.texto,
            background: C.fondo2, border: `1px solid ${C.borde}`, borderRadius: 4, padding: 8,
          }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
          <Button size="xs" variant="outline" disabled={!pegado.trim()} onClick={() => { void guardarPegado() }}>
            {t(lang, 'simc.guardar')}
          </Button>
          {registro?.texto ? (
            <Button size="xs" variant="outline" onClick={() => { void copiar() }}>{t(lang, 'simc.copiar')}</Button>
          ) : null}
        </div>
        {estado ? <div style={S.sub} role="status">{estado}</div> : null}
        {copia ? <div style={S.sub} role="status">{t(lang, copia.ok ? 'simc.copiado' : 'simc.noCopiado')}</div> : null}
        {copia && !copia.ok ? <pre style={{ ...S.sub, whiteSpace: 'pre-wrap', userSelect: 'text' }}>{copia.texto}</pre> : null}
      </div>
      <div style={S.sub}>{CLAVE} · storage del plugin</div>
    </Tarjeta>
  )
}
