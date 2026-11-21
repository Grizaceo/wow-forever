// «Preguntar a DAVI»: botón + panel. Compone la pregunta con solo el contexto seleccionado
// (instantánea congelada al abrir), deja editar la pregunta y excluir/incluir perfil y
// precios, y al confirmar inserta el texto en el chat con host.composer.insertText. Si no
// se puede insertar, copia al portapapeles; si eso falla, el texto queda seleccionable.
// Nunca llama submit ni setDraft, y no escribe en ctx.storage.
import { useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Input, host } from '@hermes/plugin-sdk'
import { C, S } from '../estilos.js'
import { t } from '../i18n.js'
import { Aviso, Tarjeta } from '../ui.jsx'
import { enviarDavi } from '../davi-transporte.js'
import { partesDisponibles, previsualizarDavi } from '../davi.js'

export function PreguntarDavi({ ctx, lang, seccion, snapshot, preguntaInicial = '' }) {
  const [abierto, setAbierto] = useState(false)
  const [congelado, setCongelado] = useState(null)
  const [pregunta, setPregunta] = useState('')
  const [activas, setActivas] = useState(() => new Set())
  const [fase, setFase] = useState('edicion') // edicion | enviando | insertado | copiado | manual
  const [aviso, setAviso] = useState(null)
  const busy = useRef(false)

  const abrir = () => {
    if (busy.current) return
    // La instantánea se congela aquí: editar la pregunta o los bloques no cambia el contexto,
    // y tampoco lo hace cambiar la selección con el panel abierto.
    setCongelado(snapshot)
    setPregunta(preguntaInicial)
    setActivas(new Set(partesDisponibles(snapshot)))
    setFase('edicion')
    setAviso(null)
    busy.current = false
    setAbierto(true)
  }

  const alternar = (parte) => setActivas((prev) => {
    const n = new Set(prev)
    if (n.has(parte)) n.delete(parte)
    else n.add(parte)
    return n
  })

  const textoVista = useMemo(
    () => previsualizarDavi({ pregunta, snapshot: congelado, activas, lang }),
    [pregunta, congelado, activas, lang],
  )

  const confirmar = async () => {
    if (busy.current || fase === 'insertado') return
    const texto = textoVista.trim()
    if (!texto) return
    busy.current = true
    setFase('enviando')
    setAviso(null)
    const r = await enviarDavi({ host, ctx, texto })
    busy.current = false
    if (r.estado === 'insertado') {
      setFase('insertado')
      setAviso({ clave: 'davi.insertado' })
    } else if (r.estado === 'copiado') {
      setFase('copiado')
      setAviso({ clave: 'davi.copiado' })
    } else {
      setFase('manual')
      setAviso({ clave: 'davi.manual' })
    }
  }

  const partes = partesDisponibles(congelado || snapshot)
  const deshabilitado = fase === 'enviando' || fase === 'insertado'

  return (
    <>
      <Button size="xs" variant="outline" onClick={abrir} disabled={!snapshot || fase === 'enviando'} title={t(lang, 'davi.botonAyuda')}>
        {t(lang, 'davi.boton')}
      </Button>
      {abierto && congelado ? (
        <Tarjeta titulo={t(lang, 'davi.titulo', { seccion })}
          extra={<Button size="xs" variant="outline" disabled={fase === 'enviando'} onClick={() => { if (!busy.current) setAbierto(false) }}>{t(lang, 'davi.cerrar')}</Button>}>
          <label style={S.campo} htmlFor="wf-davi-pregunta">
            <span style={S.etiqueta}>{t(lang, 'davi.pregunta')}</span>
            <Input id="wf-davi-pregunta" value={pregunta} disabled={deshabilitado} maxLength={280}
              placeholder={t(lang, 'davi.preguntaAyuda')} onChange={(e) => setPregunta(e.target.value)} />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {partes.includes('perfil') ? (
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Checkbox disabled={deshabilitado} checked={activas.has('perfil')} onCheckedChange={() => alternar('perfil')} />
                {t(lang, 'davi.partes.perfil')}
              </label>
            ) : null}
            {partes.includes('precios') ? (
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Checkbox disabled={deshabilitado} checked={activas.has('precios')} onCheckedChange={() => alternar('precios')} />
                {t(lang, 'davi.partes.precios')}
              </label>
            ) : null}
            {partes.includes('simc') ? (
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Checkbox disabled={deshabilitado} checked={activas.has('simc')} onCheckedChange={() => alternar('simc')} />
                {t(lang, 'davi.partes.simc')}
              </label>
            ) : null}
            {partes.includes('pawn') ? (
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Checkbox disabled={deshabilitado} checked={activas.has('pawn')} onCheckedChange={() => alternar('pawn')} />
                {t(lang, 'davi.partes.pawn')}
              </label>
            ) : null}
          </div>
          <div style={S.etiqueta}>{t(lang, 'davi.vistaPreviaAyuda')}</div>
          <textarea readOnly value={textoVista} aria-label={t(lang, 'davi.vistaPrevia')}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: '100%', minHeight: 170, resize: 'vertical', fontFamily: 'var(--font-mono, monospace)',
              fontSize: 12, color: C.texto, background: C.fondo2, border: `1px solid ${C.borde}`,
              borderRadius: 4, padding: 8, userSelect: 'text', whiteSpace: 'pre-wrap',
            }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Button size="xs" onClick={confirmar} disabled={deshabilitado || !textoVista.trim()}>
              {fase === 'enviando' ? t(lang, 'davi.enviando') : t(lang, 'davi.confirmar')}
            </Button>
            <span style={S.sub}>{t(lang, 'davi.ayuda')}</span>
          </div>
          {aviso ? <Aviso>{t(lang, aviso.clave)}</Aviso> : null}
        </Tarjeta>
      ) : null}
    </>
  )
}
