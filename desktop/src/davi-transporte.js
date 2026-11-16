// Transporte de «Preguntar a DAVI»: adjunta el texto al chat de Hermes o, si no se puede,
// lo deja en el portapapeles y, si eso falla, para copia manual. Módulo puro: recibe
// `host` y `ctx` por parámetro (el componente le pasa el host del SDK) y nunca llama
// `submit` ni `setDraft`: solo `host.composer.insertText(null, texto, { mode: 'block' })`.
export async function enviarDavi({ host, ctx, texto }) {
  const limpio = typeof texto === 'string' ? texto.trim() : ''
  if (!limpio) return { estado: 'error', motivo: 'texto-vacio' }

  let motivoInsert = null
  const composer = host && host.composer
  if (composer && typeof composer.insertText === 'function') {
    try {
      const ok = await composer.insertText(null, limpio, { mode: 'block' })
      if (ok === true) return { estado: 'insertado', motivo: null }
      motivoInsert = 'insert-text-fallo'
    } catch {
      motivoInsert = 'insert-text-excepcion'
    }
  } else {
    motivoInsert = 'insert-text-no-disponible'
  }

  let motivoClip = null
  const os = ctx && ctx.os
  if (os && typeof os.writeClipboard === 'function') {
    try {
      const ok = await os.writeClipboard(limpio)
      if (ok === true) return { estado: 'copiado', motivo: motivoInsert }
      motivoClip = 'portapapeles-fallo'
    } catch {
      motivoClip = 'portapapeles-excepcion'
    }
  } else {
    motivoClip = 'portapapeles-no-disponible'
  }

  return { estado: 'manual', motivo: motivoInsert + '+' + motivoClip }
}
