// Regresión de rendimiento al cambiar de pestaña en el plugin Desktop.
//
// Mide el coste real de montar la vista de destino en Chromium (el arnés común,
// sin red) y comprueba que las optimizaciones de miniaturas y catálogo siguen
// vigentes. Umbrales con holgura: son guardas de regresión, no SLO de producto.
//
//   node test/tab-performance.mjs                  # usa desktop/plugin.js
//   DESKTOP_PLUGIN=ruta/a/otro.js node test/tab-performance.mjs
//   TAB_PERF_REPS=8 node test/tab-performance.mjs
//
// React y Playwright se resuelven desde desktop/package.json, como el arnés.
// HERMES_DESKTOP_PKG sigue disponible como override explícito.
import { iniciar, PERFILES } from './arnes.mjs'

const REPS = Number(process.env.TAB_PERF_REPS || 6)
if (!Number.isInteger(REPS) || REPS < 1) throw new Error('TAB_PERF_REPS debe ser entero positivo')
const LIMITE_DUNGEONS = Number(process.env.TAB_PERF_DUNGEONS_MS || 500)
const LIMITE_PROFESIONES = Number(process.env.TAB_PERF_PROFESIONES_MS || 150)
const LIMITE_RUTA = 250 // tab "normal": no debe degradarse con el cambio

const a = await iniciar()
const { check } = a
const { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda, idioma: 'es' })

// Devuelve medianas de ms entre el click y el contenido de la vista de destino.
// Descarta 2 cambios de calentamiento: el primer montaje paga la compilación
// de la hoja de estilo del sprite y no es representativo.
async function medir(pares) {
  return p.evaluate(async ({ pares, reps }) => {
    const GRUPO = {
      perfil: 'personaje', ruta: 'personaje', clase: 'personaje', profesiones: 'personaje',
      configuracion: 'otros', dungeons: 'otros', guia: 'otros', legacy: 'otros',
    }
    const panelDe = (id) => {
      const t = document.querySelector(`[data-tab="${id}"]`)
      return t && document.getElementById(t.getAttribute('aria-controls'))
    }
    const visible = (id) => {
      const panel = panelDe(id)
      return !!panel && !panel.hidden && panel.textContent.trim().length > 60
    }
    const esperar = (id) => new Promise((res, reject) => {
      if (visible(id)) return res()
      let fin = false
      let timer
      const acabar = (error) => {
        if (fin) return
        fin = true
        obs.disconnect()
        clearTimeout(timer)
        if (error) reject(error); else res()
      }
      const obs = new MutationObserver(() => { if (visible(id)) acabar() })
      obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true })
      timer = setTimeout(() => acabar(new Error('vista no visible después de 6000 ms: ' + id)), 6000)
    })
    const activar = async (id) => {
      const grupo = GRUPO[id]
      if (grupo) {
        const tg = document.querySelector(`[data-tab="${grupo}"]`)
        if (tg && tg.getAttribute('aria-selected') !== 'true') { tg.click(); await esperar(grupo) }
      }
      const t = document.querySelector(`[data-tab="${id}"]`)
      if (!t) throw new Error('pestaña no encontrada: ' + id)
      t.click()
      await esperar(id)
    }
    const salida = {}
    for (const [desde, hasta] of pares) {
      for (let i = 0; i < 2; i++) { await activar(desde); await activar(hasta) }
      const tiempos = []
      for (let i = 0; i < reps; i++) {
        await activar(desde)
        const t0 = performance.now()
        document.querySelector(`[data-tab="${hasta}"]`).click()
        await esperar(hasta)
        tiempos.push(performance.now() - t0)
      }
      tiempos.sort((x, y) => x - y)
      salida[`${desde}->${hasta}`] = {
        mediana: Math.round(tiempos[tiempos.length >> 1] * 10) / 10,
        min: Math.round(tiempos[0] * 10) / 10,
        max: Math.round(tiempos[tiempos.length - 1] * 10) / 10,
      }
    }
    return salida
  }, { pares, reps: REPS })
}

try {
  await p.locator('#wf-raza').waitFor()

  // 1) Navegación y estado: los grupos y hojas siguen alcanzables y el perfil
  //    se conserva al ida y vuelta (la optimización no toca el ciclo de vida).
  const hojas = [
    ['personaje', 'perfil', '#wf-raza'], ['personaje', 'ruta', '[data-tab="ruta"][aria-selected="true"]'],
    ['personaje', 'clase', '[data-tab="clase"][aria-selected="true"]'],
    ['personaje', 'profesiones', '#wf-profesion'],
    ['mercado', 'mercado', '[data-tab="mercado"][aria-selected="true"]'],
    ['otros', 'configuracion', '[data-tab="configuracion"][aria-selected="true"]'],
    ['otros', 'dungeons', '[data-dungeon]'], ['otros', 'guia', '[data-tab="guia"][aria-selected="true"]'],
    ['otros', 'legacy', '[data-tab="legacy"][aria-selected="true"]'],
  ]
  for (const [grupo, hoja, selector] of hojas) {
    const g = p.locator(`[data-tab="${grupo}"]`)
    if (await g.getAttribute('aria-selected') !== 'true') await g.click()
    await p.locator(`[data-tab="${hoja}"]`).click()
    await p.locator(selector).first().waitFor()
  }
  check('navegación agrupada y hojas intactas', true, { hojas: hojas.length })

  await p.locator('[data-tab="personaje"]').click()
  await p.locator('[data-tab="perfil"]').click()
  await p.locator('#wf-nivel').fill('31')
  await p.locator('[data-tab="otros"]').click()
  await p.locator('[data-tab="dungeons"]').click()
  await p.locator('[data-tab="personaje"]').click()
  const nivel = await p.locator('#wf-nivel').inputValue()
  check('estado del perfil survive al cambio de pestaña', nivel === '31', { nivel })

  // 2) Fidelidad de los iconos: un solo sprite en CSS, ningún estilo en línea
  //    con el data URI gigante y coords de background correctas.
  await p.locator('[data-tab="otros"]').click()
  await p.locator('[data-tab="dungeons"]').click()
  const iconos = await p.evaluate(() => {
    const hojas = [...document.querySelectorAll('#wf-iconos-sprite')]
    const els = [...document.querySelectorAll('.wf-icono')]
    const enLinea = [...document.querySelectorAll('[style*="data:image/webp"]')].length
    const estilos = els.slice(0, 20).map((e) => {
      const c = getComputedStyle(e)
      return { bg: c.backgroundImage.slice(0, 60), size: c.backgroundSize, pos: c.backgroundPosition }
    })
    return {
      hojas: hojas.length, total: els.length, enLinea, estilos,
      css: hojas[0] ? hojas[0].textContent.slice(0, 80) : '',
    }
  })
  check('sprite inyectado una sola vez', iconos.hojas === 1, { hojas: iconos.hojas })
  check('iconos renderizan con la clase compartida', iconos.total > 0, { total: iconos.total })
  check('sin data URI en estilos en línea', iconos.enLinea === 0, { enLinea: iconos.enLinea })
  check('background del sprite conservado', iconos.estilos.every((e) => e.bg.startsWith('url("data:image/webp;base64,')), iconos.estilos[0])
  check('background-size conservado', iconos.estilos.every((e) => e.size === '1280px 680px'), iconos.estilos[0])
  check('posiciones de icono distintas', new Set(iconos.estilos.map((e) => e.pos)).size > 1, iconos.estilos.slice(0, 3))

  // Simula una hoja de una versión anterior que sobrevive a una recarga.
  await p.locator('[data-tab="configuracion"]').click()
  await p.evaluate(() => {
    document.getElementById('wf-iconos-sprite')?.remove()
    const vieja = document.createElement('style')
    vieja.id = 'wf-iconos-sprite'
    vieja.textContent = '.wf-icono{background-image:none}'
    document.head.appendChild(vieja)
  })
  await p.locator('[data-tab="dungeons"]').click()
  const recuperado = await p.evaluate(() => ({
    hojas: document.querySelectorAll('#wf-iconos-sprite').length,
    bg: getComputedStyle(document.querySelector('.wf-icono')).backgroundImage.slice(0, 30),
  }))
  check('sprite antiguo reemplazado sin duplicados', recuperado.hojas === 1 && recuperado.bg.startsWith('url("data:image/webp;base64,'), recuperado)

  // 3) Rendimiento: mismas medidas que en la auditoría, con calentamiento.
  const m = await medir([
    ['perfil', 'ruta'],
    ['perfil', 'profesiones'],
    ['configuracion', 'dungeons'],
  ])
  console.log('MEDIDAS ' + JSON.stringify(m))
  check('cambio a dungeons dentro del umbral', m['configuracion->dungeons'].mediana < LIMITE_DUNGEONS,
    { ms: m['configuracion->dungeons'].mediana, limite: LIMITE_DUNGEONS })
  check('cambio a profesiones dentro del umbral', m['perfil->profesiones'].mediana < LIMITE_PROFESIONES,
    { ms: m['perfil->profesiones'].mediana, limite: LIMITE_PROFESIONES })
  check('pestaña normal no se degrada', m['perfil->ruta'].mediana < LIMITE_RUTA,
    { ms: m['perfil->ruta'].mediana, limite: LIMITE_RUTA })

  // 4) El catálogo cacheado sigue sirviendo al revisitar profesiones.
  await p.locator('[data-tab="personaje"]').click()
  await p.locator('[data-tab="profesiones"]').click()
  const una = await p.locator('body').innerText()
  await p.locator('[data-tab="otros"]').click()
  await p.locator('[data-tab="personaje"]').click()
  await p.locator('[data-tab="profesiones"]').click()
  const dos = await p.locator('body').innerText()
  check('profesiones idéntica al revisitar', una === dos, { longitud: [una.length, dos.length] })
} finally {
  await cerrar()
  await a.terminar('tab-performance')
}
