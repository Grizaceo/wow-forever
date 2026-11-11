// Vista "Guía curada" (Cazador, Guerrero, Chamán): port de viewRec/viewWeapons/
// viewMacros/viewExtras + importación /simc de standalone/index.html.
// Nivel, clase y facción salen del PERFIL; el resto del progreso vive en
// estado.build (JSON con las mismas claves que index.html, claves desconocidas
// conservadas). Sin rutas ni dungeons: eso es de otro encargo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Input, SegmentedControl, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hermes/plugin-sdk'
import { D, guiaCurada, nombre } from '../datos.js'
import { C, S } from '../estilos.js'
import { t, agregarTextos } from '../i18n.js'
import { Hueco, Origen, Tarjeta } from '../ui.jsx'
import {
  aplicarSimc, bands, bandOf, curDps, dungeonsEnRango, fmtDps, leerBuild, macroKeyMap,
  mejorObtenida, parseSimcProfile, pickSimcWeapon, proximasArmas, SIMC_GUIA, weaponLookup,
} from '../guia-logica.js'
import { VistaRec } from './guia/recomendador.jsx'
import { VistaArmas } from './guia/armas.jsx'
import { VistaMacros } from './guia/macros.jsx'
import { VistaExtras } from './guia/extras.jsx'
import { SimcCard } from './guia/piezas.jsx'

agregarTextos({
  'guia.sinGuiaClase': 'Todavía no hay guía curada para esta clase en WoW: Forever.',
  'guia.sinGuiaFac': 'La guía curada de {clase} solo cubre la Horda por ahora; tu facción queda para una actualización futura.',
  'guia.build.titulo': 'Tu build',
  'guia.build.spec': 'Talentos',
  'guia.build.pref': 'Arma preferida',
  'guia.build.continente': 'Continente',
  'guia.build.arma': 'Arma equipada',
  'guia.build.otra': 'Otra (dps manual)',
  'guia.build.dpsArma': 'DPS del arma',
  'guia.build.nombre': 'Nombre',
  'guia.build.nombrePh': 'Tu personaje',
  'guia.build.ing': 'Ingeniería',
  'guia.build.armaAyuda': 'El arma que usás para el cálculo de DPS y candidatas.',
  'guia.sub.rec': 'Recomendador', 'guia.sub.weapons': 'Armas', 'guia.sub.macros': 'Macros', 'guia.sub.extras': 'Extras',
  'guia.realm.kalimdor': 'Kalimdor', 'guia.realm.ek': 'Reinos del Este',
  'guia.si': 'Sí', 'guia.no': 'No',
  'guia.datos.titulo': 'Datos del juego (/simc)',
  'guia.simc.boton': 'Importar /simc',
  'guia.simc.ayuda': 'Pega el perfil que exporta /simc en el juego: nivel, arma con DPS real, pet y stats.',
  'guia.simc.instrucciones': 'En el juego escribí /simc, esperá a que cargue el perfil y copiá todo el texto. Pegalo abajo — la app detecta tu nivel, el arma equipada (con su DPS real), el pet, ingeniería y tus stats.',
  'guia.simc.vacio': 'Pegá acá el perfil de /simc…',
  'guia.simc.cancelar': 'Cancelar',
  'guia.simc.importar': 'Importar',
  'guia.simc.importarOtro': 'Importar otro perfil',
  'guia.simc.quitar': 'Quitar import',
  'guia.simc.errorVacio': 'No encontré datos de personaje — ¿copiaste el perfil completo de /simc?',
  'guia.simc.errorClase': 'Ojo: tu personaje es {clase} — todavía no hay guía para esa clase.',
  'guia.simc.avisoOtra': 'El perfil importado es de {otra} pero tu guía es {guia} — se aplican los datos compatibles.',
  'guia.simc.importado': 'Importado: {notas}.',
  'guia.ficha.capturaAyuda': 'Subí una captura de tu personaje del juego (queda solo en este dispositivo)',
  'guia.ficha.quitarAyuda': 'Volver al retrato de clase',
}, {
  'guia.sinGuiaClase': 'There is no curated guide for this class in WoW: Forever yet.',
  'guia.sinGuiaFac': 'The curated guide for {clase} only covers the Horde for now; your faction is left for a future update.',
  'guia.build.titulo': 'Your build',
  'guia.build.spec': 'Talents',
  'guia.build.pref': 'Preferred weapon',
  'guia.build.continente': 'Continent',
  'guia.build.arma': 'Equipped weapon',
  'guia.build.otra': 'Other (manual dps)',
  'guia.build.dpsArma': 'Weapon dps',
  'guia.build.nombre': 'Name',
  'guia.build.nombrePh': 'Your character',
  'guia.build.ing': 'Engineering',
  'guia.build.armaAyuda': 'The weapon used for the dps math and candidates.',
  'guia.sub.rec': 'Advisor', 'guia.sub.weapons': 'Weapons', 'guia.sub.macros': 'Macros', 'guia.sub.extras': 'Extras',
  'guia.realm.kalimdor': 'Kalimdor', 'guia.realm.ek': 'Eastern Kingdoms',
  'guia.si': 'Yes', 'guia.no': 'No',
  'guia.datos.titulo': 'Game data (/simc)',
  'guia.simc.boton': 'Import /simc',
  'guia.simc.ayuda': 'Paste the profile /simc exports in game: level, weapon with real dps, pet and stats.',
  'guia.simc.instrucciones': 'In game type /simc, wait for the profile to load and copy all the text. Paste it below — the app picks up your level, equipped weapon (with real dps), pet, engineering and stats.',
  'guia.simc.vacio': 'Paste your /simc profile here…',
  'guia.simc.cancelar': 'Cancel',
  'guia.simc.importar': 'Import',
  'guia.simc.importarOtro': 'Import another profile',
  'guia.simc.quitar': 'Remove import',
  'guia.simc.errorVacio': 'No character data found — did you copy the full /simc profile?',
  'guia.simc.errorClase': 'Heads up: your character is {clase} — there is no guide for that class yet.',
  'guia.simc.avisoOtra': 'The imported profile is {otra} but your guide is {guia} — compatible data is applied.',
  'guia.simc.importado': 'Imported: {notas}.',
  'guia.ficha.capturaAyuda': 'Upload a screenshot of your in-game character (stays on this device)',
  'guia.ficha.quitarAyuda': 'Back to the class portrait',
})

const SUBTABS = ['rec', 'weapons', 'macros', 'extras']
const VISTAS = { rec: VistaRec, weapons: VistaArmas, macros: VistaMacros, extras: VistaExtras }
const FAC_A_FACCION = { horde: 'horda', alliance: 'alianza' }

export function VistaGuia({ ctx, almacen, estado, recargar, perfil, guardarPerfil, lang }) {
  const curada = useMemo(() => guiaCurada(perfil), [perfil])
  if (!curada) {
    return (
      <Tarjeta titulo={t(lang, 'tab.guia')} extra={<Origen f="curado" lang={lang} />}>
        <Hueco lang={lang}>{t(lang, 'guia.sinGuiaClase')}</Hueco>
      </Tarjeta>
    )
  }
  if (!curada.datos) {
    return (
      <Tarjeta titulo={curada.guia.name + ' · ' + t(lang, 'tab.guia')} extra={<Origen f="curado" lang={lang} />}>
        <Hueco lang={lang}>{t(lang, 'guia.sinGuiaFac', { clase: curada.guia.name })}</Hueco>
      </Tarjeta>
    )
  }
  return <GuiaPrincipal ctx={ctx} almacen={almacen} estado={estado} recargar={recargar}
    perfil={perfil} guardarPerfil={guardarPerfil} lang={lang} curada={curada} />
}

function GuiaPrincipal({ ctx, almacen, estado, recargar, perfil, guardarPerfil, lang, curada }) {
  const { guia: G, fac: facKey, datos: GF } = curada
  const ctxGuia = useMemo(() => ({ G, GF, facKey, perfil }), [G, GF, facKey, perfil])

  // estado.build → objeto normalizado (claves desconocidas incluidas).
  const [build, setBuild] = useState(() => leerBuild(estado.build, ctxGuia))
  const ref = useRef(build)
  useEffect(() => {
    const b = leerBuild(estado.build, ctxGuia)
    ref.current = b
    setBuild(b)
  }, [estado.build, ctxGuia])

  const [errorG, setErrorG] = useState('')
  const [sub, setSub] = useState(() => (SUBTABS.includes(build.tab) ? build.tab : 'rec'))
  const [simcOpen, setSimcOpen] = useState(false)
  const [simcTxt, setSimcTxt] = useState('')
  const [simcErr, setSimcErr] = useState('')
  const [simcNota, setSimcNota] = useState('')
  const [dpsTxt, setDpsTxt] = useState(String(build.customDps || ''))
  const avatarRef = useRef(null)
  useEffect(() => { setDpsTxt(String(build.customDps || '')) }, [build.customDps])

  // Escribe el build nuevo (estado al instante + almacén durable + recarga).
  const guardar = useCallback((mutar) => {
    const base = ref.current
    const nuevo = typeof mutar === 'function' ? mutar(base) : { ...base, ...mutar }
    if (!nuevo || typeof nuevo !== 'object') return Promise.resolve(false)
    ref.current = nuevo
    setBuild(nuevo)
    return almacen.build(JSON.stringify(nuevo))
      .then(() => { setErrorG(''); recargar() })
      .catch((e) => { setErrorG(e && e.message ? e.message : String(e)) })
  }, [almacen, recargar])

  const cambiarSub = (s) => { setSub(s); guardar((b) => ({ ...b, tab: s })) }

  // --- avatar: captura del juego → data URL (mismo proceso que index.html) ---
  const onAvatarFile = (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f || !f.type.startsWith('image/') || f.size > 10 * 1024 * 1024) return
    const rd = new FileReader()
    rd.onload = () => {
      const img = new Image()
      img.onload = () => {
        try {
          const s = Math.min(1, 256 / Math.max(img.width, img.height))
          const c = document.createElement('canvas')
          c.width = Math.max(1, Math.round(img.width * s))
          c.height = Math.max(1, Math.round(img.height * s))
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
          guardar((b) => ({ ...b, avatar: c.toDataURL('image/jpeg', .8) }))
        } catch { /* imagen no procesable: se ignora */ }
      }
      img.src = rd.result
    }
    rd.readAsDataURL(f)
  }

  // --- importación /simc (applySimcProfile de index.html, nivel → perfil) ---
  const importarSimc = async () => {
    const d = parseSimcProfile(simcTxt)
    if (!d.level && !d.weapon && !d.name && !(d.pet && d.pet.pet_family)) {
      setSimcErr(t(lang, 'guia.simc.errorVacio')); return
    }
    setSimcErr('')
    const wLookup = weaponLookup(GF.weapons || [])
    const want = d.className ? SIMC_GUIA[d.className] : null
    const avisos = []
    if (want && want !== G.id) avisos.push(t(lang, 'guia.simc.avisoOtra', { otra: want, guia: G.id }))
    else if (d.className && !SIMC_GUIA[d.className]) avisos.push(t(lang, 'guia.simc.errorClase', { clase: d.className }))
    pickSimcWeapon(d, (G.simc && G.simc.slot) || 'main_hand', wLookup)
    let res = null
    await guardar((base) => {
      res = aplicarSimc(base, d, { G, weapons: GF.weapons || [], dungeons: G.dungeons || [] })
      return res.state
    })
    if (res && res.nivel) {
      try { await guardarPerfil({ ...perfil, nivel: res.nivel }) } catch { /* el nivel queda en el build igual */ }
    }
    const notas = (res ? res.notes : []).concat(avisos).join(' · ')
    setSimcNota(notas ? t(lang, 'guia.simc.importado', { notas }) : '')
    setSimcOpen(false); setSimcTxt('')
  }

  // --- derivadas del build (lo que las vistas consumen) ---
  const lvl = Number.isFinite(+perfil.nivel) ? Math.min(60, Math.max(1, Math.trunc(+perfil.nivel))) : build.lvl
  const weapons = GF.weapons || []
  const os = new Set(build.owned), gs = new Set(build.gear), ss = new Set(build.steps)
  const dps = curDps(build, weapons)
  const cands = proximasArmas(weapons, { lvl, pref: build.pref, eng: build.eng, os, cur: build.cur, dps })
  const ownedBetter = mejorObtenida(weapons, { lvl, eng: build.eng, os, cur: build.cur, dps })
  const bs = bands(GF, build.realm)
  const band = bandOf(bs, lvl)
  const nextBand = bs.find((b) => b.min > lvl)
  const rc = build.realm === 'ek' ? 'E' : 'K'
  const dungs = dungeonsEnRango(G.dungeons, lvl, rc)
  const miles = (GF.milestones || []).map((m, i) => ({ m, i }))
    .filter((x) => x.m.lvl >= lvl - 2 && x.m.lvl <= lvl + 10).sort((a, b) => a.m.lvl - b.m.lvl)
  const facDato = D.personaje.facciones[FAC_A_FACCION[facKey] || 'horda']
  const facLabel = facDato ? nombre(facDato.n, lang) : facKey
  const wLookup = weaponLookup(weapons)
  const armaOps = [
    { value: 'other', label: t(lang, 'guia.build.otra') },
    ...weapons.slice().sort((a, b) => a.lvl - b.lvl || a.dps - b.dps)
      .map((w) => ({ value: w.id, label: `${w.n} (${fmtDps(w)} dps)` })),
  ]

  const v = {
    G, GF, fac: facKey, lvl, lang, ctx, build, guardar, perfil, guardarPerfil,
    os, gs, ss, dps, cands, ownedBetter, dungs, miles, band, nextBand, rc,
    weapons, wLookup, tipos: G.types || {}, MACRO_KEY: macroKeyMap(G.bar || { keys: [], mouse: [] }),
    realmLabel: t(lang, 'guia.realm.' + (build.realm === 'ek' ? 'ek' : 'kalimdor')),
    facLabel, onAvatar: () => avatarRef.current && avatarRef.current.click(),
    onAvatarDel: () => guardar((b) => ({ ...b, avatar: null })),
  }
  const Vista = VISTAS[sub] || VistaRec

  return (
    <>
      <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarFile} />

      <Tarjeta titulo={t(lang, 'guia.build.titulo')} extra={<Origen f="curado" lang={lang} />}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 22px', alignItems: 'flex-end' }}>
          <div style={S.campo}>
            <span style={S.etiqueta}>{t(lang, 'guia.build.spec')}</span>
            <SegmentedControl value={build.spec} onChange={(id) => guardar((b) => ({ ...b, spec: id }))}
              options={Object.entries(G.specs || {}).map(([id, label]) => ({ id, label }))} />
            {G.specNote ? <span style={S.sub}>{G.specNote}</span> : null}
          </div>
          <div style={S.campo}>
            <span style={S.etiqueta}>{t(lang, 'guia.build.pref')}</span>
            <SegmentedControl value={build.pref} onChange={(id) => guardar((b) => ({ ...b, pref: id }))}
              options={(G.prefs || []).map(([id, label]) => ({ id, label }))} />
            {G.prefNote ? <span style={S.sub}>{G.prefNote}</span> : null}
          </div>
          <div style={S.campo}>
            <span style={S.etiqueta}>{t(lang, 'guia.build.continente')}</span>
            <SegmentedControl value={build.realm} onChange={(id) => guardar((b) => ({ ...b, realm: id }))}
              options={Object.keys(GF.routes || {}).map((k) => ({ id: k, label: t(lang, 'guia.realm.' + k) }))} />
          </div>
          {G.useEng ? (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 5, cursor: 'pointer' }}>
              <Checkbox checked={!!build.eng} onCheckedChange={(val) => guardar((b) => ({ ...b, eng: !!val }))} />
              <span style={{ fontSize: 12 }}>{t(lang, 'guia.build.ing')}</span>
            </label>
          ) : null}
          <div style={S.campo}>
            <span style={S.etiqueta}>{t(lang, 'guia.build.arma')}</span>
            <Select value={build.cur} onValueChange={(val) => guardar((b) => ({ ...b, cur: val, weaponDps: null }))}>
              <SelectTrigger aria-label={t(lang, 'guia.build.arma')}><SelectValue /></SelectTrigger>
              <SelectContent>
                {armaOps.map((o) => <SelectItem key={o.value || 'none'} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {build.cur === 'other' ? (
            <div style={S.campo}>
              <span style={S.etiqueta}>{t(lang, 'guia.build.dpsArma')}</span>
              <Input value={dpsTxt} inputMode="decimal" style={{ width: 110 }}
                onChange={(e) => setDpsTxt(e.target.value)}
                onBlur={() => { const n = parseFloat(dpsTxt); guardar((b) => ({ ...b, customDps: Number.isFinite(n) ? Math.max(0, n) : 0 })) }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }} />
            </div>
          ) : null}
          <div style={S.campo}>
            <span style={S.etiqueta}>{t(lang, 'guia.build.nombre')}</span>
            <Input value={build.name} maxLength={20} placeholder={t(lang, 'guia.build.nombrePh')}
              style={{ width: 170 }} onChange={(e) => guardar((b) => ({ ...b, name: e.target.value }))} />
          </div>
        </div>
        {errorG ? <div role="alert" style={S.aviso}>{errorG}</div> : null}
      </Tarjeta>

      <Tarjeta titulo={t(lang, 'guia.datos.titulo')} extra={<Origen f="curado" lang={lang} />}>
        {build.simc ? <SimcCard simc={build.simc} G={G} lang={lang} /> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant={build.simc ? 'outline' : 'default'} size="xs" onClick={() => setSimcOpen((o) => !o)}>
            {build.simc ? t(lang, 'guia.simc.importarOtro') : t(lang, 'guia.simc.boton')}
          </Button>
          {build.simc ? (
            <Button variant="ghost" size="xs" onClick={() => guardar((b) => ({ ...b, simc: null }))}>{t(lang, 'guia.simc.quitar')}</Button>
          ) : <span style={S.sub}>{t(lang, 'guia.simc.ayuda')}</span>}
        </div>
        {simcOpen ? (
          <div style={{ marginTop: 10 }}>
            <p style={{ ...S.sub, margin: '0 0 6px' }}>{t(lang, 'guia.simc.instrucciones')}</p>
            <textarea value={simcTxt} onChange={(e) => setSimcTxt(e.target.value)}
              placeholder={t(lang, 'guia.simc.vacio')}
              style={{ width: '100%', minHeight: 150, resize: 'vertical', boxSizing: 'border-box',
                background: C.fondo3, color: C.texto, border: `1px solid ${C.borde2}`, borderRadius: 6, padding: 8,
                fontFamily: 'Consolas,"Cascadia Mono",monospace', fontSize: 12 }} />
            {simcErr ? <div role="alert" style={{ ...S.aviso, marginTop: 6 }}>{simcErr}</div> : null}
            {simcNota ? <div style={{ ...S.sub, marginTop: 6 }}>{simcNota}</div> : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button size="xs" onClick={importarSimc}>{t(lang, 'guia.simc.importar')}</Button>
              <Button variant="ghost" size="xs" onClick={() => { setSimcOpen(false); setSimcErr('') }}>{t(lang, 'guia.simc.cancelar')}</Button>
            </div>
          </div>
        ) : null}
        {!simcOpen && simcNota ? <div style={{ ...S.sub, marginTop: 6 }}>{simcNota}</div> : null}
      </Tarjeta>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <SegmentedControl value={sub} onChange={cambiarSub}
          options={SUBTABS.map((s) => ({ id: s, label: t(lang, 'guia.sub.' + s) }))} />
      </div>
      <Vista v={v} lang={lang} />
    </>
  )
}
