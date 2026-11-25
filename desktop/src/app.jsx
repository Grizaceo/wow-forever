// Página principal: carga lo guardado, mantiene el perfil del jugador y muestra las secciones.
import { Component, useCallback, useEffect, useId, useState } from 'react'
import { Button, SegmentedControl, Tabs, TabsList, TabsTrigger } from '@hermes/plugin-sdk'
import { migrarPerfil, validarPerfil } from '../../src/perfil.js'
import { D, guiaCurada, nombre, setIdioma } from './datos.js'
import { S } from './estilos.js'
import { t } from './i18n.js'
import { VistaPersonaje } from './vistas/personaje.jsx'
import { VistaRuta } from './vistas/ruta.jsx'
import { VistaProfesiones } from './vistas/profesiones.jsx'
import { VistaDungeons } from './vistas/dungeons.jsx'
import { VistaMercado } from './vistas/mercado.jsx'
import { VistaGuia } from './vistas/guia.jsx'
import { VistaLegacy } from './vistas/legacy.jsx'

const GRUPOS = ['personaje', 'mercado', 'otros']
const SUBPESTANAS = {
  personaje: ['perfil', 'ruta', 'profesiones'],
  otros: ['dungeons', 'guia', 'legacy', 'configuracion'],
}
const INICIO = { personaje: 'perfil', mercado: 'mercado', otros: 'configuracion' }
const VISTAS = {
  perfil: VistaPersonaje, ruta: VistaRuta, profesiones: VistaProfesiones,
  dungeons: VistaDungeons, guia: VistaGuia, legacy: VistaLegacy, mercado: VistaMercado,
}

function Navegacion({ ids, activa, elegir, lang, etiqueta, secundaria = false, children }) {
  const uid = useId()
  const idTab = (id) => `${uid}-tab-${id}`
  const idPanel = (id) => `${uid}-panel-${id}`
  return <Tabs value={activa} onValueChange={elegir} style={S.navegacion}>
    <div style={secundaria ? S.filaSecundaria : S.filaPrincipal}>
      <TabsList aria-label={etiqueta} style={secundaria ? S.listaSecundaria : S.listaPrincipal}>
        {ids.map((id) => <TabsTrigger key={id} value={id} id={idTab(id)} data-tab={id} aria-controls={idPanel(id)}
          style={secundaria ? (id === activa ? S.enlaceSecundarioActivo : S.enlaceSecundario) : undefined}>{t(lang, 'tab.' + id)}</TabsTrigger>)}
      </TabsList>
    </div>
    {ids.map((id) => <div key={id} id={idPanel(id)} role="tabpanel" aria-labelledby={idTab(id)} hidden={id !== activa}
      tabIndex={id === activa && (secundaria || !SUBPESTANAS[id]) ? 0 : undefined} style={id === activa ? S.panelNavegacion : undefined}>
      {id === activa ? children : null}
    </div>)}
  </Tabs>
}

function Configuracion({ lang, cambiarLang, reabrir, errorLectura }) {
  const [estado, setEstado] = useState('')
  return <>
    <section style={S.tarjeta}>
      <strong>{t(lang, 'config.idioma')}</strong>
      <div><SegmentedControl value={lang} onChange={cambiarLang} options={[{ id: 'en', label: 'EN' }, { id: 'es', label: 'ES' }]} /></div>
    </section>
    <section style={S.tarjeta}>
      <strong>{t(lang, 'config.datos')}</strong>
      <span style={S.sub}>{t(lang, 'config.datosNota')}</span>
      <div><Button variant="outline" size="xs" disabled={estado === 'cargando'} onClick={async () => {
        setEstado('cargando')
        try { await reabrir(); setEstado('') }
        catch { setEstado('error') }
      }}>{t(lang, 'reintentar')}</Button></div>
      {estado === 'error' && <span role="alert" style={S.aviso}>{t(lang, 'config.error')}</span>}
      {errorLectura && <span role="alert" style={S.aviso}>{errorLectura}</span>}
    </section>
  </>
}

class Contencion extends Component {
  constructor(p) { super(p); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { console.error('[wow-forever] la sección falló:', error) }
  render() {
    if (!this.state.error) return this.props.children
    return <div role="alert" style={S.aviso}>{String(this.state.error && this.state.error.message || this.state.error)}</div>
  }
}

// Guarda en ctx.storage y confirma releyendo: si no se confirma, se avisa.
async function guardarConfirmado(ctx, clave, valor) {
  await ctx.storage.set(clave, valor)
  if (JSON.stringify(await ctx.storage.get(clave)) !== JSON.stringify(valor)) throw new Error('No se confirmó el guardado de ' + clave + '.')
}

function perfilInicial(guardado, build) {
  if (guardado) return { ...validarPerfil(guardado, D.personaje), razaSupuesta: false }
  let viejo = null
  try { viejo = build ? JSON.parse(build) : null } catch { viejo = null }
  const m = migrarPerfil(viejo, D.personaje)
  return { perfil: m.perfil, ok: validarPerfil(m.perfil, D.personaje).ok, errores: [], razaSupuesta: m.razaSupuesta }
}

export function App({ ctx, almacen, sincronizador, ventas, puente, farmeo }) {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')
  const [perfil, setPerfil] = useState(null)
  const [razaSupuesta, setRazaSupuesta] = useState(false)
  const [lang, setLang] = useState(() => {
    const inicial = ctx.storage.get('idioma', 'en') === 'es' ? 'es' : 'en'
    setIdioma(inicial)
    return inicial
  })
  const [pestana, setPestana] = useState(() => ctx.storage.get('pestana', 'perfil'))
  const [vuelta, setVuelta] = useState(0)

  const recargar = useCallback(() => setVuelta((v) => v + 1), [])
  const releer = async () => { await almacen.reset(); recargar() }
  useEffect(() => {
    let previous = sincronizador?.getState().changed
    return sincronizador?.subscribe(s => {
      if (s.changed !== previous) { previous = s.changed; recargar() }
    })
  }, [sincronizador, recargar])
  useEffect(() => {
    let vivo = true
    setError('')
    almacen.read().then((v) => {
      if (!vivo) return
      setEstado(v)
      setPerfil((actual) => {
        if (actual) return actual
        const ini = perfilInicial(ctx.storage.get('perfil', null), v.build)
        setRazaSupuesta(ini.razaSupuesta)
        return ini.perfil
      })
    }).catch((e) => { if (vivo) setError(e.message || String(e)) })
    return () => { vivo = false }
  }, [almacen, ctx, vuelta])

  const guardarPerfil = useCallback(async (nuevo) => {
    const r = validarPerfil(nuevo, D.personaje)
    setPerfil(r.perfil)
    setRazaSupuesta(false)
    if (r.ok) await guardarConfirmado(ctx, 'perfil', r.perfil)
    return r
  }, [ctx])

  const cambiarLang = (l) => {
    const idioma = l === 'es' ? 'es' : 'en'
    setIdioma(idioma)
    setLang(idioma)
    try { ctx.storage.set('idioma', idioma) } catch { /* preferencia */ }
  }
  const cambiarPestana = (p) => {
    const destino = p === 'clase' ? 'perfil' : INICIO[p] || p
    setPestana(destino)
    try { ctx.storage.set('pestana', destino) } catch { /* preferencia */ }
  }

  const listo = perfil && validarPerfil(perfil, D.personaje).ok
  const grupo = pestana === 'mercado' ? 'mercado'
    : SUBPESTANAS.otros.includes(pestana) ? 'otros' : 'personaje'
  const visibles = SUBPESTANAS[grupo]?.filter((id) =>
    ['perfil', 'legacy', 'configuracion'].includes(id) || (listo && (id !== 'guia' || guiaCurada(perfil))))
  const activa = visibles?.includes(pestana) ? pestana : INICIO[grupo]
  const Vista = VISTAS[activa]

  const resumen = listo
    ? [nombre(D.personaje.razas[perfil.raza].n, lang), nombre(D.personaje.clases[perfil.clase].n, lang),
       t(lang, 'clase.nivel') + ' ' + perfil.nivel, nombre(D.personaje.facciones[perfil.faccion].n, lang)].join(' · ')
    : t(lang, 'perfil.vacio')

  const cuerpo = <div key={activa} style={S.cuerpo}>
    {activa === 'configuracion'
      ? <Configuracion lang={lang} cambiarLang={cambiarLang} reabrir={releer} errorLectura={error} />
      : error ? <div role="alert" style={S.aviso}>{error} <Button variant="outline" size="xs" onClick={() => releer().catch(e => setError(e.message || String(e)))}>{t(lang, 'reintentar')}</Button></div>
      : !estado || !perfil ? <p role="status" style={S.sub}>{t(lang, 'cargando')}</p>
      : activa === 'mercado' && !listo ? <div style={S.tarjeta}>
          <span>{t(lang, 'mercado.sinPerfil')}</span>
          <div><Button size="xs" onClick={() => cambiarPestana('personaje')}>{t(lang, 'tab.personaje')}</Button></div>
        </div>
      : <Contencion>
          <Vista ctx={ctx} almacen={almacen} sincronizador={sincronizador} ventas={ventas} puente={puente} farmeo={farmeo} estado={estado} recargar={recargar} perfil={perfil}
            guardarPerfil={guardarPerfil} razaSupuesta={razaSupuesta} lang={lang} irA={cambiarPestana} />
        </Contencion>}
  </div>

  return (
    <div style={S.pagina}>
      <div style={S.cabecera}>
        <strong>{t(lang, 'app')}</strong>
        <span style={S.sub}>{resumen}</span>
      </div>
      <Navegacion ids={GRUPOS} activa={grupo} elegir={cambiarPestana} lang={lang} etiqueta={t(lang, 'nav.principal')}>
        {visibles ? <Navegacion ids={visibles} activa={activa} elegir={cambiarPestana} lang={lang}
          etiqueta={t(lang, 'nav.' + grupo)} secundaria>{cuerpo}</Navegacion> : cuerpo}
      </Navegacion>
    </div>
  )
}
