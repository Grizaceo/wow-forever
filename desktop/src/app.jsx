// Página principal: carga lo guardado, mantiene el perfil del jugador y muestra las secciones.
import { Component, useCallback, useEffect, useMemo, useState } from 'react'
import { Button, SegmentedControl, Tabs, TabsList, TabsTrigger } from '@hermes/plugin-sdk'
import { migrarPerfil, validarPerfil } from '../../src/perfil.js'
import { D, guiaCurada, nombre } from './datos.js'
import { S } from './estilos.js'
import { t } from './i18n.js'
import { VistaPersonaje } from './vistas/personaje.jsx'
import { VistaClase } from './vistas/clase.jsx'
import { VistaRuta } from './vistas/ruta.jsx'
import { VistaProfesiones } from './vistas/profesiones.jsx'
import { VistaDungeons } from './vistas/dungeons.jsx'
import { VistaMercado } from './vistas/mercado.jsx'
import { VistaGuia } from './vistas/guia.jsx'
import { VistaLegacy } from './vistas/legacy.jsx'

const PESTANAS = [
  ['personaje', VistaPersonaje], ['clase', VistaClase], ['ruta', VistaRuta], ['profesiones', VistaProfesiones],
  ['dungeons', VistaDungeons], ['mercado', VistaMercado], ['guia', VistaGuia], ['legacy', VistaLegacy],
]

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

export function App({ ctx, almacen, sincronizador, ventas }) {
  const [estado, setEstado] = useState(null)
  const [error, setError] = useState('')
  const [perfil, setPerfil] = useState(null)
  const [razaSupuesta, setRazaSupuesta] = useState(false)
  const [lang, setLang] = useState(() => (ctx.storage.get('idioma', 'es') === 'en' ? 'en' : 'es'))
  const [pestana, setPestana] = useState(() => ctx.storage.get('pestana', 'personaje'))
  const [vuelta, setVuelta] = useState(0)

  const recargar = useCallback(() => setVuelta((v) => v + 1), [])
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

  const cambiarLang = (l) => { setLang(l); try { ctx.storage.set('idioma', l) } catch { /* preferencia */ } }
  const cambiarPestana = (p) => { setPestana(p); try { ctx.storage.set('pestana', p) } catch { /* preferencia */ } }

  const listo = perfil && validarPerfil(perfil, D.personaje).ok
  const visibles = useMemo(() => PESTANAS.filter(([id]) =>
    id === 'personaje' || id === 'legacy' || (listo && (id !== 'guia' || guiaCurada(perfil)))), [listo, perfil])
  const activa = visibles.some(([id]) => id === pestana) ? pestana : 'personaje'
  const Vista = (visibles.find(([id]) => id === activa) || PESTANAS[0])[1]

  const resumen = listo
    ? [nombre(D.personaje.razas[perfil.raza].n, lang), nombre(D.personaje.clases[perfil.clase].n, lang),
       t(lang, 'clase.nivel') + ' ' + perfil.nivel, nombre(D.personaje.facciones[perfil.faccion].n, lang)].join(' · ')
    : t(lang, 'perfil.vacio')

  return (
    <div style={S.pagina}>
      <div style={S.cabecera}>
        <strong>{t(lang, 'app')}</strong>
        <span style={{ ...S.sub, flex: 1 }}>{resumen}</span>
        <SegmentedControl value={lang} onChange={cambiarLang} options={[{ id: 'es', label: 'ES' }, { id: 'en', label: 'EN' }]} />
        <Button variant="outline" size="xs" onClick={async () => { await almacen.reset(); recargar() }}>{t(lang, 'reintentar')}</Button>
      </div>
      <div style={{ padding: '6px 16px 0' }}>
        <Tabs value={activa} onValueChange={cambiarPestana}>
          <TabsList>
            {visibles.map(([id]) => <TabsTrigger key={id} value={id}>{t(lang, 'tab.' + id)}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>
      <div style={S.cuerpo}>
        {error ? <div role="alert" style={S.aviso}>{error}</div>
          : !estado || !perfil ? <p role="status" style={S.sub}>{t(lang, 'cargando')}</p>
          : <Contencion key={activa}>
              <Vista ctx={ctx} almacen={almacen} sincronizador={sincronizador} ventas={ventas} estado={estado} recargar={recargar} perfil={perfil}
                guardarPerfil={guardarPerfil} razaSupuesta={razaSupuesta} lang={lang} irA={cambiarPestana} />
            </Contencion>}
      </div>
    </div>
  )
}
