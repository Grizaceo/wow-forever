// Prueba de la pestaña Mercado en navegador real (Chromium + React):
// importación desde la carpeta concedida y manual, persistencia al reabrir,
// búsqueda ES/EN, detalle con SVG, borrado con confirmación, fallo de escritura
// y recomendador de farmeo, en tema claro y oscuro, sin red ni errores JS.
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/vista-mercado.mjs
import { iniciar, exportarEstado as exportar, PERFILES } from './arnes.mjs'

const FIXTURE = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Prueba"]={version=2,' +
  '["2589"]={m=120,h={["2140"]=130},l={["2140"]=120},a={["2140"]=20}},' +
  '["6469"]={m=99999,h={["2141"]=100000},l={["2141"]=99999},a={["2141"]=5}}}}'
const FIXTURE_MANUAL = 'AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Manual"]={version=2,' +
  '["2589"]={m=200,h={["2142"]=210},l={["2142"]=200},a={["2142"]=7}}}}'

const a = await iniciar()
const { check } = a


const texto = (p) => p.evaluate(() => document.body.innerText)
const esperar = (p, re) => p.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout: 15000 })

// ---------- Sesión 1: claro, Cazador de la Horda, sin datos ----------
let { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda })
await p.click('[data-tab="mercado"]')
await p.getByText('Todavía no importaste precios').first().waitFor()
check('mercado vacío invita a importar', true)
check('la pestaña Mercado existe sin datos', await p.locator('[data-tab="mercado"]').count() === 1)
check('export CLI deshabilitado sin snapshot', await p.getByRole('button', { name: 'Exportar precios para el CLI' }).first().isDisabled())

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
check('miniatura local por id en la tabla', await p.evaluate(() =>
  [...document.querySelectorAll('[role="img"]')].some((e) => getComputedStyle(e).backgroundImage.startsWith('url("data:image/webp;base64,'))))
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

const campControl = p.getByRole('combobox', { name: 'Campamentos' })
await campControl.selectOption('rotation')
const rotacion = (await exportar(p)).storage['farm-settings']
check('rotación aplica y guarda los pesos por defecto sin editar campos',
  rotacion?.campMode === 'rotation' && JSON.stringify(rotacion.campWeights) === '[0.5,0.3,0.2]', rotacion)
await campControl.selectOption('single')

const previo = await exportar(p)
const vp=previo.storage['market-v2-pointer']
check('persistió puntero conjunto v2', vp?.revision>=1,vp)
const vb=JSON.parse(previo.archivos[`market-v2-${vp.slot}.json`])
check('bundle contiene mercado e historial v2',vb.market.snapshot.schemaVersion===2 && vb.history.v===2)
check('respaldo legado durable',!!previo.archivos['pre-v2-backup.json'])

// ---------- Export de precios al CLI: formato canónico {valores, reino, fecha} ----------
await p.getByRole('button', { name: 'Exportar precios para el CLI' }).first().click()
await esperar(p, /Exportado precios-cli\.json/)
check('export CLI: confirma reino e ítems exportados', /reino Prueba/.test(await texto(p)) && /2 ítems con precio/.test(await texto(p)))
const cli = JSON.parse(await p.evaluate(() => archivosData.get('precios-cli.json')))
check('export CLI: formato canónico (schemaVersion/reino/fecha/valores)', cli.schemaVersion === 1 && cli.reino === 'Prueba' && typeof cli.fecha === 'string' && cli.valores && typeof cli.valores === 'object', cli)
check('export CLI: precios exactos del reino seleccionado', cli.valores['2589'] === 120 && cli.valores['6469'] === 99999 && Object.keys(cli.valores).length === 2, cli.valores)
check('export CLI: muestra el comando consultar.py maxeo --precios', /consultar\.py maxeo --precios/.test(await texto(p)) && /precios-cli\.json/.test(await texto(p)))
await p.getByRole('button', { name: 'Copiar comando' }).first().click()
check('export CLI: copiar comando va al portapapeles', await p.evaluate(() => window.copiados >= 1 && /precios-cli\.json/.test(window.copiado || '')), await p.evaluate(() => window.copiado))
await p.evaluate(() => { window.fallarEscritura = true })
await p.getByRole('button', { name: 'Exportar precios para el CLI' }).first().click()
await esperar(p, /No se exportó/)
check('export CLI: fallo de escritura muestra error (no confirma éxito)', /No se exportó/.test(await texto(p)) && !/Exportado precios-cli\.json/.test(await texto(p)))
await p.evaluate(() => { window.fallarEscritura = false })
await cerrar()

// ---------- Sesión 2: oscuro, mismos datos → persisten; import manual ----------
;({ p, cerrar } = await a.abrir('oscuro', previo))
await p.click('[data-tab="mercado"]')
await p.getByText('Paño de lino').first().waitFor()
check('oscuro: datos persisten al reabrir', /2 de 2 claves/.test(await texto(p)))
check('oscuro: historial acumulado informado', await p.getByText(/Historial acumulado/).count() >= 1)
check('oscuro:realm sigue en Prueba', await p.locator('select[aria-label="Realm de subasta"]').inputValue() === 'Prueba')

// Importación manual por <input type=file>.
await p.locator('input[type="file"][accept=".lua"]').setInputFiles({ name: 'Auctionator.lua', mimeType: 'text/plain', buffer: Buffer.from(FIXTURE_MANUAL, 'utf8') })
await esperar(p, /Importación guardada/)
check('importación manual desde archivo .lua', await p.getByText('Importación guardada').count() === 1)
await p.waitForFunction(() => document.querySelector('select[aria-label="Realm de subasta"]')?.value === 'Manual', null, { timeout: 10000 })
check('realm Manual queda seleccionado', await p.locator('select[aria-label="Realm de subasta"]').inputValue() === 'Manual')
check('el scan nuevo muestra su propio realm', /1 de 1 claves/.test(await texto(p)))
check('precio manual 200c = 2s', /2s/.test(await texto(p)))

// Fallo de escritura: se conserva lo anterior.
await p.evaluate(() => { window.fallarEscritura = true })
await p.locator('input[type="file"][accept=".lua"]').setInputFiles({ name: 'Auctionator.lua', mimeType: 'text/plain', buffer: Buffer.from(FIXTURE, 'utf8') })
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

// ---------- Sesión 3: Auctionator.lua real con blob CBOR crudo (no es UTF-8) ----------
// WoW guarda los reinos no actuales como CBOR dentro de una cadena Lua, con bytes crudos.
// Con readText (UTF-8 con pérdida) fallaba «cbor trailing data»; la lectura usa readDataUrl.
const B = (s) => [...Buffer.from(s, 'latin1')]
const cabeza = (mayor, n) => [(mayor << 5) | n] // longitudes < 24 bastan aquí
const cbs = (s) => [...cabeza(2, B(s).length), ...B(s)]
const mapa = (pares) => [...cabeza(5, pares.length), ...pares.flat(Infinity)]
const itemCbor = mapa([[cbs('m'), [0x18, 200]], [cbs('h'), mapa([[cbs('2504'), [0x18, 200]]])], [cbs('a'), mapa([[cbs('2504'), [3]]])]])
const blob = mapa([[cbs('version'), [2]], [cbs('2589'), itemCbor]])
const crudo = blob.flatMap((b) => b === 0x22 ? [0x5c, 0x22] : b === 0x5c ? [0x5c, 0x5c] : b === 0x0a ? [0x5c, 0x6e] : b === 0 ? [0x5c, 0x30, 0x30, 0x30] : [b])
const FIXTURE_CBOR = Buffer.concat([
  Buffer.from('AUCTIONATOR_PRICE_DATABASE={__dbversion=8,["Actual"]={version=2,["2589"]={m=120,h={["2504"]=120},a={["2504"]=5}}},["Otro"]="', 'latin1'),
  Buffer.from(crudo), Buffer.from('"}', 'latin1')]).toString('base64')
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda }))
await p.click('[data-tab="mercado"]')
await p.getByText('Todavía no importaste precios').first().waitFor()
await p.evaluate((b64) => { window.carpetaConcedida = { name: 'SavedVariables', files: { 'Auctionator.lua': { b64 } } } }, FIXTURE_CBOR)
await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().click()
await esperar(p, /Importación guardada|No se importó/)
check('lee un Auctionator.lua con blob CBOR crudo (bytes no UTF-8)', await p.getByText('Importación guardada').count() === 1, await texto(p))
const reinos = await p.locator('select[aria-label="Realm de subasta"] option').allTextContents()
check('importa el reino actual y el del blob CBOR', ['Actual', 'Otro'].every((r) => reinos.some((o) => o.includes(r))), reinos)

// Host sin readDataUrl: la lectura cae a readText y un archivo UTF-8 sigue importando.
await p.evaluate((fix) => { window.sinDataUrl = true; window.carpetaConcedida = { name: 'SavedVariables', files: { 'Auctionator.lua': fix } } }, FIXTURE)
await p.getByRole('button', { name: 'Leer Auctionator.lua' }).first().click()
await esperar(p, /Importación guardada|No se importó/)
check('sin readDataUrl, readText sigue importando un archivo UTF-8', await p.getByText('Importación guardada').count() === 1)
await cerrar()

// Fallo del bundle v2: ni mercado ni histórico se eliminan a medias.
;({ p, cerrar } = await a.abrir('claro', previo))
await p.click('[data-tab="mercado"]')
await p.getByText('Paño de lino').first().waitFor()
await p.evaluate(() => { window.fallarMercado = true })
await p.getByRole('button', { name: 'Borrar precios locales' }).first().click()
await p.getByRole('button', { name: '¿Confirmar borrado?' }).first().click()
await esperar(p, /Se conservan los datos/)
check('fallo atómico conserva los datos', /Se conservan los datos/.test(await texto(p)))
check('borrado parcial conserva el snapshot', await p.getByText('Paño de lino').count() >= 1)
check('borrado parcial deja automático pausado', await p.getByRole('checkbox', { name: /Seguimiento automático/ }).isChecked() === false)
const parcial=await exportar(p)
const hp=parcial.storage['market-v2-pointer']
check('histórico intacto en disco', JSON.stringify(hp)===JSON.stringify(previo.storage['market-v2-pointer']) && parcial.archivos[`market-v2-${hp.slot}.json`]===previo.archivos[`market-v2-${hp.slot}.json`])
await cerrar()
await a.terminar('mercado')
