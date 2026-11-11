// Prueba de la pestaña Mercado en navegador real (Chromium + React):
// importación desde la carpeta concedida y manual, persistencia al reabrir,
// búsqueda ES/EN, detalle con SVG, borrado con confirmación, fallo de escritura
// y recomendador de farmeo, en tema claro y oscuro, sin red ni errores JS.
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/vista-mercado.mjs
import { iniciar, PERFILES, PREF } from './arnes.mjs'

const FIXTURE = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,' +
  '["2589"]={m=120,h={["2140"]=130},l={["2140"]=120},a={["2140"]=20}},' +
  '["6469"]={m=99999,h={["2141"]=100000},l={["2141"]=99999},a={["2141"]=5}}}}'
const FIXTURE_MANUAL = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Manual"]={version=2,' +
  '["2589"]={m=200,h={["2142"]=210},l={["2142"]=200},a={["2142"]=7}}}}'

const a = await iniciar()
const { check } = a

// Exporta localStorage de la página al formato `previo` de a.abrir().
async function exportar(p) {
  const crudo = await p.evaluate(() => {
    const o = {}
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k) }
    return o
  })
  const previo = { storage: {}, archivos: {} }
  for (const [k, v] of Object.entries(crudo)) {
    if (k.startsWith('archivo.')) previo.archivos[k.slice(8)] = v
    else if (k === PREF + 'perfil') previo.perfil = JSON.parse(v)
    else previo.storage[k.slice(PREF.length)] = JSON.parse(v)
  }
  return previo
}

const texto = (p) => p.evaluate(() => document.body.innerText)
const esperar = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout: 15000 })

// ---------- Sesión 1: claro, Cazador de la Horda, sin datos ----------
let { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda })
await p.click('[data-tab="mercado"]')
await p.getByText('Todavía no importaste precios').first().waitFor()
check('mercado vacío invita a importar', true)
check('la pestaña Mercado existe sin datos', await p.locator('[data-tab="mercado"]').count() === 1)

// Carpeta concedida con Auctionator.lua dentro del permiso.
await p.evaluate((fix) => { window.carpetaConcedida = { name: 'SavedVariables', files: { 'Auctionator.lua': fix } } }, FIXTURE)
await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().click()
await esperar(p, /Importación guardada/)
check('importa desde la carpeta concedida', await p.getByText('Importación guardada').count() === 1)
check('solo leyó dentro del permiso', await p.evaluate(() => window.lecturas.includes('Auctionator.lua') && window.lecturas.every((r) => !r.includes('..'))), await p.evaluate(() => window.lecturas))
check('el selector se abrió una vez', await p.evaluate(() => window.selectorAbierto === 1), await p.evaluate(() => window.selectorAbierto))

// Segunda lectura: la carpeta ya está concedida, no vuelve a abrir el selector.
await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().click()
await esperar(p, /Importación guardada/)
check('la segunda lectura reusa la carpeta sin selector', await p.evaluate(() => window.selectorAbierto === 1 && window.lecturas.filter((r) => r === 'Auctionator.lua').length >= 2), await p.evaluate(() => ({ s: window.selectorAbierto, l: window.lecturas })))

// Tabla: realm, nombres ES, columnas.
check('realm Prueba seleccionado', await p.locator('select[aria-label="Realm de subasta"]').inputValue() === 'Prueba')
const tabla = await texto(p)
check('nombres en español (Paño de lino)', /Paño de lino/.test(tabla))
check(' Venomstrike visible', /Venomstrike/.test(tabla))
check('precio en cobre visible', /12s|1s 20c|120c/.test(tabla) || /12s/.test(tabla))
check('aviso de datos antiguos (>3 días)', await p.getByText('Los precios tienen más de 3 días').count() === 1)
check('contador de claves', /2 de 2 claves/.test(tabla))

// Búsqueda en español e inglés.
await p.locator('input[type="search"]').fill('lino')
await p.waitForTimeout(120)
check('búsqueda ES "lino" filtra a 1', /1 de 2 claves/.test(await texto(p)))
await p.locator('input[type="search"]').fill('linen')
await p.waitForTimeout(120)
check('búsqueda EN "linen" encuentra el ítem', /1 de 2 claves/.test(await texto(p)))
await p.locator('input[type="search"]').fill('venomstrike')
await p.waitForTimeout(120)
check('búsqueda por nombre EN "venomstrike"', /1 de 2 claves/.test(await texto(p)) && /Venomstrike/.test(await texto(p)))
await p.locator('input[type="search"]').fill('2589')
await p.waitForTimeout(120)
check('búsqueda por ID numérico', /1 de 2 claves/.test(await texto(p)) && /Paño de lino/.test(await texto(p)))
await p.locator('input[type="search"]').fill('')
await p.waitForTimeout(120)

// Detalle con gráfico SVG.
await p.getByRole('button', { name: 'Paño de lino' }).first().click()
await p.getByText('Último mínimo anunciado').first().waitFor()
await p.getByText('Precio mínimo diario').first().waitFor()
check('detalle muestra gráfico SVG', await p.locator('section', { hasText: 'Precio mínimo diario' }).locator('svg path').count() > 0)
check('detalle muestra historial diario', await p.getByText('Historial diario').count() === 1)
check('detalle muestra fuentes documentadas', await p.getByText('Fuentes documentadas para investigar').count() === 1)
check('detalle muestra fuentes de drop', await p.getByText('Fuentes de drop (dataset)').count() === 1)
await p.getByRole('button', { name: 'Cerrar' }).first().click()

// Recomendador de farmeo con Cazador de la Horda nv 30.
check('sección de farmeo visible', await p.getByText('Farmeo recomendado').count() === 1)
check('tarjetas de zona con métricas approx', await p.getByText(/antes de multiplicadores/).count() > 0)
check('cobertura del scan informada', await p.getByText(/Cobertura del scan/).count() === 1)
check('estimaciones marcadas como approx', await p.getByText(/Estimaciones aproximadas/).count() === 1)
check('nivel y facción del perfil', await p.getByText(/vos nv 30/).count() > 0)

const previo = await exportar(p)
check('persistió market-pointer', previo.storage['market-pointer']?.revision >= 1, previo.storage['market-pointer'])
check('persistió price-history-pointer', previo.storage['price-history-pointer']?.revision >= 1, previo.storage['price-history-pointer'])
check('persistió market-a/b.json', Object.keys(previo.archivos).some((k) => /^market-[ab]\.json$/.test(k)))
check('persistió price-history-a/b.json', Object.keys(previo.archivos).some((k) => /^price-history-[ab]\.json$/.test(k)))
await cerrar()

// ---------- Sesión 2: oscuro, mismos datos → persisten; import manual ----------
;({ p, cerrar } = await a.abrir('oscuro', previo))
await p.click('[data-tab="mercado"]')
await p.getByText('Paño de lino').first().waitFor()
check('oscuro: datos persisten al reabrir', /2 de 2 claves/.test(await texto(p)))
check('oscuro: historial acumulado informado', await p.getByText(/Historial acumulado/).count() >= 1)
check('oscuro:realm sigue en Prueba', await p.locator('select[aria-label="Realm de subasta"]').inputValue() === 'Prueba')

// Importación manual por <input type=file>.
await p.locator('input[type="file"]').setInputFiles({ name: 'Auctionator.lua', mimeType: 'text/plain', buffer: Buffer.from(FIXTURE_MANUAL, 'utf8') })
await esperar(p, /Importación guardada/)
check('importación manual desde archivo .lua', await p.getByText('Importación guardada').count() === 1)
await p.waitForFunction(() => document.querySelector('select[aria-label="Realm de subasta"]')?.value === 'Manual', null, { timeout: 10000 })
check('realm Manual queda seleccionado', await p.locator('select[aria-label="Realm de subasta"]').inputValue() === 'Manual')
check('el scan nuevo muestra su propio realm', /1 de 1 claves/.test(await texto(p)))
check('precio manual 200c = 2s', /2s/.test(await texto(p)))

// Fallo de escritura: se conserva lo anterior.
await p.evaluate(() => { window.fallarEscritura = true })
await p.locator('input[type="file"]').setInputFiles({ name: 'Auctionator.lua', mimeType: 'text/plain', buffer: Buffer.from(FIXTURE, 'utf8') })
await esperar(p, /no se pudo guardar/i)
check('fallo de escritura muestra error', await p.getByText(/no se pudo guardar/i).count() === 1)
check('fallo de escritura conserva el scan anterior', await p.locator('select[aria-label="Realm de subasta"]').inputValue() === 'Manual' && /1 de 1 claves/.test(await texto(p)))
await p.evaluate(() => { window.fallarEscritura = false })

// Borrado con confirmación en dos pasos.
await p.getByRole('button', { name: 'Borrar precios locales' }).first().click()
await p.getByRole('button', { name: '¿Confirmar borrado?' }).first().waitFor()
check('borrado pide confirmación', true)
await p.getByRole('button', { name: '¿Confirmar borrado?' }).first().click()
await esperar(p, /Mercado local borrado/)
check('borrado vacía mercado e historial', await p.getByText('Todavía no importaste precios').count() >= 1)
check('tras borrar no quedan claves', /0 de 0|Todavía no importaste/.test(await texto(p)))
await cerrar()

await a.terminar('mercado')
