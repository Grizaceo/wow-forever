// Macros y barra (viewMacros + viewBar + macroList + jumpToMacro de index.html).
// Copiar usa ctx.os.writeClipboard (nunca navigator.clipboard ni DOM).
import { useEffect, useRef, useState } from 'react'
import { Button, SearchField, SegmentedControl } from '@hermes/plugin-sdk'
import { C, S } from '../../estilos.js'
import { t, agregarTextos } from '../../i18n.js'
import { Origen, Tarjeta, TextoRico } from '../../ui.jsx'
import { curMf, macroCats, macroLen, slotView, usableFor } from '../../guia-logica.js'
import { Detalle, Icono, P, Placa } from './piezas.jsx'

agregarTextos({
  'guia.mac.titulo': 'Macros meta — WoW: Forever',
  'guia.mac.usables': '{u} de {t} usables a tu nivel',
  'guia.mac.ayuda': 'En el juego: /macro → Nuevo → pegá → arrastrá a la barra. Los spells van en inglés; límite 255 caracteres (cada macro trae su contador).',
  'guia.mac.audit': 'Cómo usarlas y notas de auditoría',
  'guia.mac.auditTexto': 'Con <b>#showtooltip</b> el botón muestra ícono y cooldown. Si tu cliente está en español, usá los nombres de tu libro.<br><b>Sin probar in-game:</b> revisadas contra las notas oficiales de Blizzard y guías que leen datos del cliente (ForeverDB, endgametools, wowclassicforever.info, wowf.io, Method).',
  'guia.mac.reglas': 'Reglas de Forever que cambian macros',
  'guia.mac.reglasSub': 'reglas del servidor que cambian el comportamiento',
  'guia.mac.buscar': 'Buscar macro, spell o comando… (ej: trap, focus, pet)',
  'guia.mac.todas': 'Todas',
  'guia.mac.usablesCat': '{n} usables a tu nivel',
  'guia.mac.nada': 'Ninguna macro coincide',
  'guia.mac.limpiar': 'limpiar filtros',
  'guia.mac.disponibles': 'Disponibles ahora',
  'guia.mac.nMacros': '{n} macros',
  'guia.mac.proximas': 'Próximas por nivel',
  'guia.mac.proximasSub': 'llegan con tu nivel',
  'guia.mac.otraSpec': 'Requieren otra spec',
  'guia.mac.otraSpecSub': 'fuera de tu build actual',
  'guia.mac.usableYa': 'usable ya',
  'guia.mac.otraSpecBadge': 'requiere otra spec',
  'guia.mac.talento': 'talento {spec}',
  'guia.mac.otraSpecTag': ' · otra spec',
  'guia.mac.tecla': 'tecla {k}',
  'guia.mac.caracteres': 'caracteres usados / límite del juego',
  'guia.mac.copiar': 'copiar',
  'guia.mac.copiado': '¡copiado!',
  'guia.mac.ctrlc': 'Ctrl+C',
  'guia.mac.lvlN': 'lvl {n}+',
  'guia.mac.llegaAl': 'llega al {n}',
  'guia.bar.titulo': 'Tu barra a lvl {lvl}',
  'guia.bar.solo': 'Solo',
  'guia.bar.dungeon': 'Dungeon',
  'guia.bar.leyenda1': 'macro lista',
  'guia.bar.leyenda2': 'spell del libro (hasta que llegue la macro)',
  'guia.bar.leyenda3': 'llega más adelante',
  'guia.bar.leyenda4': 'movimiento / libre',
  'guia.bar.sinTecla': 'Sin tecla, a clic:',
  'guia.bar.alt1': 'Alternativa para el 1:',
  'guia.bar.antes': 'Antes de empezar:',
  'guia.bar.libre': 'libre', 'guia.bar.mover': 'mover', 'guia.bar.macro': 'macro', 'guia.bar.spell': 'spell',
  'guia.bar.llega': 'lvl {n}',
}, {
  'guia.mac.titulo': 'Meta macros — WoW: Forever',
  'guia.mac.usables': '{u} of {t} usable at your level',
  'guia.mac.ayuda': 'In game: /macro → New → paste → drag to the bar. Spells are in English; 255-character limit (each macro shows its counter).',
  'guia.mac.audit': 'How to use them and audit notes',
  'guia.mac.auditTexto': 'With <b>#showtooltip</b> the button shows icon and cooldown. If your client is in Spanish, use your spellbook names.<br><b>Untested in-game:</b> reviewed against official Blizzard notes and guides that read client data (ForeverDB, endgametools, wowclassicforever.info, wowf.io, Method).',
  'guia.mac.reglas': 'Forever rules that change macros',
  'guia.mac.reglasSub': 'server rules that change behavior',
  'guia.mac.buscar': 'Search macro, spell or command… (e.g. trap, focus, pet)',
  'guia.mac.todas': 'All',
  'guia.mac.usablesCat': '{n} usable at your level',
  'guia.mac.nada': 'No macro matches',
  'guia.mac.limpiar': 'clear filters',
  'guia.mac.disponibles': 'Available now',
  'guia.mac.nMacros': '{n} macros',
  'guia.mac.proximas': 'Upcoming by level',
  'guia.mac.proximasSub': 'they unlock with your level',
  'guia.mac.otraSpec': 'Require another spec',
  'guia.mac.otraSpecSub': 'outside your current build',
  'guia.mac.usableYa': 'usable now',
  'guia.mac.otraSpecBadge': 'requires another spec',
  'guia.mac.talento': 'talent {spec}',
  'guia.mac.otraSpecTag': ' · another spec',
  'guia.mac.tecla': 'key {k}',
  'guia.mac.caracteres': 'characters used / game limit',
  'guia.mac.copiar': 'copy',
  'guia.mac.copiado': 'copied!',
  'guia.mac.ctrlc': 'Ctrl+C',
  'guia.mac.lvlN': 'lv {n}+',
  'guia.mac.llegaAl': 'comes at {n}',
  'guia.bar.titulo': 'Your bar at lv {lvl}',
  'guia.bar.solo': 'Solo',
  'guia.bar.dungeon': 'Dungeon',
  'guia.bar.leyenda1': 'ready macro',
  'guia.bar.leyenda2': 'spellbook spell (until the macro unlocks)',
  'guia.bar.leyenda3': 'unlocks later',
  'guia.bar.leyenda4': 'movement / free',
  'guia.bar.sinTecla': 'No key, on click:',
  'guia.bar.alt1': 'Alternative for 1:',
  'guia.bar.antes': 'Before you start:',
  'guia.bar.libre': 'free', 'guia.bar.mover': 'move', 'guia.bar.macro': 'macro', 'guia.bar.spell': 'spell',
  'guia.bar.llega': 'lv {n}',
})

// Sub-etiquetas de la barra (vienen de slotView en español; se traducen acá).
function subBarra(v, lang) {
  const s = v.sub
  if (s === 'libre') return t(lang, 'guia.bar.libre')
  if (s === 'mover') return t(lang, 'guia.bar.mover')
  if (s === 'macro') return t(lang, 'guia.bar.macro')
  if (s === 'spell') return t(lang, 'guia.bar.spell')
  const m = /^lvl (\d+)$/.exec(s)
  if (m) return t(lang, 'guia.bar.llega', { n: m[1] })
  return s
}

const KC_ESTADO = {
  ready: { ...P.kcReady, ks: P.ksReady }, spell: { ...P.kcSpell, ks: P.ksSpell },
  soon: { ...P.kcSoon, ks: P.ksSoon }, free: P.kcFree, move: P.kcMove,
}
const MROW_ESTADO = {
  ready: { borderColor: C.verde }, spell: { borderColor: C.amarillo },
  soon: { borderStyle: 'dashed', opacity: .62 }, free: { opacity: .3 }, move: { opacity: .3, borderStyle: 'dotted' },
}

function Tecla({ b, sctx, onJump, lang }) {
  const v = slotView(b, sctx)
  const est = KC_ESTADO[v.cls] || {}
  const inner = (<>
    <span style={P.kk}>{b.k}</span>
    {v.mods && v.mods.length ? <span style={P.km}>{v.mods.join(' ')}</span> : null}
    <span style={P.kn}>{v.t}</span>
    <span style={{ ...P.ks, ...(est.ks || {}) }}>{subBarra(v, lang)}</span>
  </>)
  const estilo = { ...P.kcBase, ...est, cursor: v.mi >= 0 ? 'pointer' : 'default' }
  if (v.mi >= 0) return <button type="button" className="kc" style={estilo} title={v.tip} onClick={() => onJump(v.mi)}>{inner}</button>
  return <div className="kc" style={estilo} title={v.tip}>{inner}</div>
}

function Raton({ b, sctx, onJump, lang }) {
  const v = slotView(b, sctx)
  const inner = (<>
    <span style={P.mrowMk}>{b.k}</span>
    <span style={{ flex: 1, minWidth: 0 }}>{v.t}</span>
    <span style={P.mrowKs}>{subBarra(v, lang)}</span>
  </>)
  const estilo = { ...P.mrow, ...(MROW_ESTADO[v.cls] || {}), cursor: v.mi >= 0 ? 'pointer' : 'default' }
  if (v.mi >= 0) return <button type="button" className="mrow" style={estilo} title={v.tip} onClick={() => onJump(v.mi)}>{inner}</button>
  return <div className="mrow" style={estilo} title={v.tip}>{inner}</div>
}

function VistaBarra({ v, lang, onJump }) {
  const { G, build, lvl } = v
  const B = G.bar || {}
  const N = G.barNotes || {}
  const byK = Object.fromEntries((B.keys || []).map((b) => [b.k, b]))
  const unit = '((100% - 36px)/7 + 6px)'
  const sctx = { mdg: !!build.mdg, spec: build.spec, lvl, macros: G.macros || [] }
  const specN = (G.specs || {})[build.spec] || build.spec
  return (
    <Tarjeta titulo={
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Icono n="kbd" size={14} />{t(lang, 'guia.bar.titulo', { lvl })}
        <span style={P.muted}>{specN} · {build.mdg ? t(lang, 'guia.bar.dungeon') : t(lang, 'guia.bar.solo')}</span>
      </span>
    } extra={<>
      <SegmentedControl value={build.mdg ? '1' : '0'} onChange={(val) => v.guardar((b) => ({ ...b, mdg: val === '1' }))}
        options={[{ id: '0', label: t(lang, 'guia.bar.solo') }, { id: '1', label: t(lang, 'guia.bar.dungeon') }]} />
      <Origen f="curado" lang={lang} />
    </>}>
      {N.intro ? <div style={P.tip}><TextoRico html={N.intro} /></div> : null}
      <div style={P.kbwrap}>
        <div style={P.kb}>
          {(B.rows || []).map((r, i) => (
            <div key={i} style={P.kbrow}>
              {(B.offset || [])[i] ? <span style={{ ...P.kcoff, width: `calc(${unit} * ${(B.offset || [])[i]} - 6px)` }} /> : null}
              {r.map((k) => { const b = byK[k]; return b ? <Tecla key={k} b={b} sctx={sctx} onJump={onJump} lang={lang} /> : null })}
            </div>
          ))}
        </div>
        <div style={P.mouse}>
          <div style={P.mt}>{lang === 'en' ? 'Mouse' : 'Mouse'}</div>
          {(B.mouse || []).map((b, i) => <Raton key={i} b={b} sctx={sctx} onJump={onJump} lang={lang} />)}
        </div>
      </div>
      <div style={P.legend}>
        <span><i style={{ ...P.legendI, background: C.fondo3, borderColor: C.verde }} />{t(lang, 'guia.bar.leyenda1')}</span>
        <span><i style={{ ...P.legendI, borderColor: C.amarillo }} />{t(lang, 'guia.bar.leyenda2')}</span>
        <span><i style={{ ...P.legendI, border: `1px dashed ${C.amarillo}`, borderColor: 'transparent' }} />{t(lang, 'guia.bar.leyenda3')}</span>
        <span><i style={{ ...P.legendI, borderColor: C.borde2, opacity: .4 }} />{t(lang, 'guia.bar.leyenda4')}</span>
      </div>
      {(B.click || []).length ? (
        <div style={P.chipln}><b style={{ color: C.texto }}>{t(lang, 'guia.bar.sinTecla')}</b> {(B.click || []).map((n) => <MacroChip key={n} n={n} v={v} lang={lang} onJump={onJump} />)}</div>
      ) : null}
      {(B.alt1 || []).length ? (
        <div style={P.chipln}><b style={{ color: C.texto }}>{t(lang, 'guia.bar.alt1')}</b> {(B.alt1 || []).map((n) => <MacroChip key={n} n={n} v={v} lang={lang} onJump={onJump} />)}
          {N.altNote ? <span>— <TextoRico html={N.altNote} /></span> : null}</div>
      ) : null}
      {N.before ? <div style={{ ...P.tip, marginTop: 10 }}><b>{t(lang, 'guia.bar.antes')}</b> <TextoRico html={N.before} />{build.mdg && N.dungeon ? <TextoRico html={N.dungeon} /> : null}</div> : null}
    </Tarjeta>
  )
}

function MacroChip({ n, v, lang, onJump }) {
  const m = (v.G.macros || []).find((x) => x.n === n)
  if (!m) return null
  const i = v.G.macros.indexOf(m)
  const ok = usableFor(m, v.lvl, v.build.spec)
  return (
    <button type="button" style={{ ...P.chipBtn, ...(ok ? {} : { opacity: .62 }) }}
      title={`${m.n}${ok ? '' : ' — ' + t(lang, 'guia.mac.llegaAl', { n: m.lvl })}`}
      onClick={() => onJump(i)}>
      {m.n}{ok ? '' : ` · ${m.lvl}`}
    </button>
  )
}

function MacroCard({ m, i, v, lang, onJump, flash, registerRef }) {
  const { G, build, ctx, MACRO_KEY } = v
  const len = macroLen(m.code)
  const ok = usableFor(m, v.lvl, build.spec)
  const talOk = !m.tal || m.tal === build.spec
  const key = MACRO_KEY[m.n]
  const [cop, setCop] = useState('')
  const specN = (G.specs || {})[build.spec] || build.spec
  const copiar = async () => {
    try {
      const bien = await ctx.os.writeClipboard(m.code)
      // index.html: si no se puede copiar, el código queda para Ctrl+C
      setCop(bien ? 'copiado' : 'ctrlc')
      setTimeout(() => setCop(''), 1400)
    } catch { setCop('ctrlc'); setTimeout(() => setCop(''), 1400) }
  }
  const badgeEstado = ok
    ? <Placa tono="now">{t(lang, 'guia.mac.usableYa')}</Placa>
    : m.lvl > v.lvl
      ? <Placa tono="soon">{m.lvl - v.lvl <= 1 ? t(lang, 'guia.rec.enNivel', { n: m.lvl - v.lvl }) : t(lang, 'guia.rec.enNiveles', { n: m.lvl - v.lvl })}</Placa>
      : <Placa tono="soon">{t(lang, 'guia.mac.otraSpecBadge')}</Placa>
  return (
    <div ref={registerRef} id={'mc-' + i} className="mac"
      style={{ ...S.tarjeta, ...(flash === i ? { boxShadow: `0 0 0 2px ${C.amarillo}` } : {}) }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <b style={{ fontSize: 13 }}>{m.n}</b>
        <Placa tono="cat" estilo={{ marginLeft: 'auto' }}>{m.cat}</Placa>
        <Placa tono="plain">{t(lang, 'guia.mac.lvlN', { n: m.lvl })}</Placa>
        {badgeEstado}
        {m.tal ? (
          <Placa tono={talOk ? 'tal' : 'talOff'} title={talOk ? t(lang, 'guia.mac.talento', { spec: m.tal.toUpperCase() }) : specN + t(lang, 'guia.mac.otraSpecTag')}>
            {t(lang, 'guia.mac.talento', { spec: m.tal.toUpperCase() })}{talOk ? '' : t(lang, 'guia.mac.otraSpecTag')}
          </Placa>
        ) : null}
        {key ? <Placa tono="key" title={t(lang, 'guia.mac.tecla', { k: key })}>{t(lang, 'guia.mac.tecla', { k: key })}</Placa> : null}
        <span title={t(lang, 'guia.mac.caracteres')} style={{ ...P.mlen, ...(len > 255 ? P.mlenOver : {}) }}>{len}/255</span>
        <Button size="xs" variant="outline" onClick={copiar} title={t(lang, 'guia.mac.caracteres')}>
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <Icono n="copy" size={12} />{cop === 'copiado' ? t(lang, 'guia.mac.copiado') : cop === 'ctrlc' ? t(lang, 'guia.mac.ctrlc') : t(lang, 'guia.mac.copiar')}
          </span>
        </Button>
      </div>
      {m.desc ? <div style={{ ...P.muted, marginTop: 2 }}><TextoRico html={m.desc} /></div> : null}
      <pre style={P.mcode}>{m.code}</pre>
    </div>
  )
}

export function VistaMacros({ v, lang }) {
  const { G, build, guardar, ctx } = v
  const mcr = G.macros || []
  const cats = macroCats(mcr)
  const [mq, setMq] = useState('')
  const cardRefs = useRef(new Map())
  const [pendingJump, setPendingJump] = useState(null)
  const [flash, setFlash] = useState(-1)
  const flashT = useRef(null)

  const mf = curMf(build.mf, cats)
  const q = mq.trim().toLowerCase()
  const pool = mcr.filter((m) => (mf === 'all' || m.cat === mf) && (!q || (m.n + '\n' + m.code + '\n' + m.desc).toLowerCase().includes(q)))
  const usableN = mcr.filter((m) => usableFor(m, v.lvl, build.spec)).length
  const now = pool.filter((m) => usableFor(m, v.lvl, build.spec))
  const later = pool.filter((m) => m.lvl > v.lvl)
  const other = pool.filter((m) => m.lvl <= v.lvl && !usableFor(m, v.lvl, build.spec))

  const registerRef = (i) => (el) => { if (el) cardRefs.current.set(i, el); else cardRefs.current.delete(i) }
  const saltar = (el, i) => {
    const fd = el.closest('details')
    if (fd) fd.open = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlash(i)
    clearTimeout(flashT.current)
    flashT.current = setTimeout(() => setFlash(-1), 1400)
  }
  const jumpToMacro = (i) => {
    const el = cardRefs.current.get(i)
    if (!el) {
      // la macro está filtrada: limpia búsqueda y categoría y salta cuando renderice
      setMq('')
      guardar((b) => ({ ...b, mf: 'all' }))
      setPendingJump(i)
      return
    }
    saltar(el, i)
  }
  useEffect(() => {
    if (pendingJump == null) return
    const i = pendingJump
    setPendingJump(null)
    const el = cardRefs.current.get(i)
    if (el) saltar(el, i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJump, mq, build.mf])

  const listaVacia = !pool.length
  const nadaTexto = t(lang, 'guia.mac.nada') +
    (q ? ` con "${mq.trim()}"` : '') +
    (mf !== 'all' ? ` en ${mf}` : '') + '.'

  return (
    <>
      <Tarjeta titulo={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icono n="scroll" size={14} />{t(lang, 'guia.mac.titulo')}
          <span style={P.muted}>{t(lang, 'guia.mac.usables', { u: usableN, t: mcr.length })}</span>
        </span>
      } extra={<Origen f="curado" lang={lang} />}>
        <div style={P.tip}>{t(lang, 'guia.mac.ayuda')}</div>
        <Detalle titulo={t(lang, 'guia.mac.audit')}>
          <div style={P.tip}><TextoRico html={t(lang, 'guia.mac.auditTexto')} /></div>
        </Detalle>
      </Tarjeta>

      <VistaBarra v={v} lang={lang} onJump={jumpToMacro} />

      {G.macroRules ? (
        <Detalle titulo={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icono n="alert" size={14} />{t(lang, 'guia.mac.reglas')}</span>}
          meta={t(lang, 'guia.mac.reglasSub')} extra={<Origen f="curado" lang={lang} />}>
          <TextoRico html={G.macroRules} />
        </Detalle>
      ) : null}

      <Tarjeta extra={<Origen f="curado" lang={lang} />}>
        <SearchField placeholder={t(lang, 'guia.mac.buscar')} value={mq} onChange={setMq} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {[['all', t(lang, 'guia.mac.todas')], ...cats.map((c) => [c, c])].map(([f, label]) => {
            const n = mcr.filter((m) => (f === 'all' || m.cat === f) && usableFor(m, v.lvl, build.spec)).length
            const activo = mf === f
            return (
              <button key={f} type="button"
                style={{ ...P.chipBtn, ...(activo ? { borderColor: C.acento, color: C.acento, fontWeight: 600 } : {}) }}
                title={t(lang, 'guia.mac.usablesCat', { n })}
                onClick={() => guardar((b) => ({ ...b, mf: f }))}>
                {label} <span style={P.mlen}>{n}</span>
              </button>
            )
          })}
        </div>
      </Tarjeta>

      {listaVacia ? (
        <Tarjeta>
          <div style={P.muted}>{nadaTexto}{' '}
            <Button size="xs" variant="ghost" onClick={() => { setMq(''); guardar((b) => ({ ...b, mf: 'all' })) }}>{t(lang, 'guia.mac.limpiar')}</Button>
          </div>
        </Tarjeta>
      ) : (<>
        {now.length ? (<>
          <div style={P.bandhead}>
            <span>{t(lang, 'guia.mac.disponibles')}</span>
            <span style={P.bandheadZn}>{t(lang, 'guia.mac.nMacros', { n: now.length })}</span>
          </div>
          {now.map((m) => <MacroCard key={mcr.indexOf(m)} m={m} i={mcr.indexOf(m)} v={v} lang={lang} flash={flash} registerRef={registerRef(mcr.indexOf(m))} />)}
        </>) : null}
        {later.length ? (
          <Detalle titulo={t(lang, 'guia.mac.proximas')} meta={t(lang, 'guia.mac.proximasSub')} resumenExtra={<span style={P.dprog}>{later.length}</span>}>
            {later.map((m) => <MacroCard key={mcr.indexOf(m)} m={m} i={mcr.indexOf(m)} v={v} lang={lang} flash={flash} registerRef={registerRef(mcr.indexOf(m))} />)}
          </Detalle>
        ) : null}
        {other.length ? (
          <Detalle titulo={t(lang, 'guia.mac.otraSpec')} meta={t(lang, 'guia.mac.otraSpecSub')} resumenExtra={<span style={P.dprog}>{other.length}</span>}>
            {other.map((m) => <MacroCard key={mcr.indexOf(m)} m={m} i={mcr.indexOf(m)} v={v} lang={lang} flash={flash} registerRef={registerRef(mcr.indexOf(m))} />)}
          </Detalle>
        ) : null}
      </>)}
    </>
  )
}
