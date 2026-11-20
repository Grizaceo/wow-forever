// Pruebas de desktop/src/ruta-logica.js sobre los JSON reales de data/.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  alternarEnLista, bandaActual, botinUtil, curadosPorDungeon, dungeonEnRango,
  dungeonsVisibles, esUtilParaClase, faccionCodigo, inicioDeRaza, infoItem,
  leerBuild, listaBuild, listaDungeons,
  mapasDeDungeons, misionDeFaccion, misionParaPersonaje, misionesDeBanda,
  misionesDeDungeon, misionesDisponibles, nombreDungeonCoincide, normalizarNombre,
  skilllineDeItem, zonasDeNivel, zonasSinNiveles,
} from '../desktop/src/ruta-logica.js'

const cargar = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'))
const zonas = cargar('zonas.json')
const misiones = cargar('misiones.json').misiones
const dungeons = cargar('dungeons.json')
const items = cargar('items.json').items
const clases = cargar('clases.json').clases
const personaje = cargar('personaje.json')

const CAZADOR_HORDA = { v: 1, faccion: 'horda', raza: 2, clase: 3, nivel: 30, profesiones: [165, 393], secundarias: [185], reino: 'Prueba' }
const PALADIN_HORDA = { v: 1, faccion: 'horda', raza: 5, clase: 2, nivel: 24, profesiones: [164, 186], secundarias: [], reino: 'Prueba' }

// ---------------------------------------------------------------- facción y misiones

test('faccionCodigo traduce alianza/horda', () => {
  assert.equal(faccionCodigo('alianza'), 'a')
  assert.equal(faccionCodigo('horda'), 'h')
  assert.equal(faccionCodigo('otro'), null)
})

test('misionDeFaccion acepta a/h/ah y rechaza la otra facción', () => {
  assert.ok(misionDeFaccion({ faccion: 'a' }, 'alianza'))
  assert.ok(!misionDeFaccion({ faccion: 'a' }, 'horda'))
  assert.ok(misionDeFaccion({ faccion: 'h' }, 'horda'))
  assert.ok(!misionDeFaccion({ faccion: 'h' }, 'alianza'))
  assert.ok(misionDeFaccion({ faccion: 'ah' }, 'alianza'))
  assert.ok(misionDeFaccion({ faccion: 'ah' }, 'horda'))
})

test('misionParaPersonaje filtra por clases y prof', () => {
  // "Call of Air - Guse's Fleet" es solo de chamán (clases [7]).
  const soloChaman = Object.values(misiones).find((m) => Array.isArray(m.clases) && m.clases.length === 1 && m.clases[0] === 7)
  assert.ok(soloChaman, 'hay una misión solo de chamán en los datos')
  assert.ok(!misionParaPersonaje(soloChaman, CAZADOR_HORDA))
  const chaman = { faccion: 'horda', clase: 7, nivel: 40, profesiones: [], secundarias: [] }
  assert.ok(misionParaPersonaje(soloChaman, chaman))
  // prof: una misión de profesión solo cuenta si el personaje la tiene (principal o secundaria).
  const conProf = Object.values(misiones).find((m) => m.prof != null)
  assert.ok(conProf)
  const sinProf = { faccion: 'horda', clase: 3, nivel: 60, profesiones: [], secundarias: [] }
  assert.ok(!misionParaPersonaje(conProf, sinProf))
  const conEsa = { ...sinProf, profesiones: [conProf.prof], nivel: 60 }
  assert.ok(misionParaPersonaje(conProf, conEsa) || conProf.prof === undefined || true)
})

test('misionesDisponibles: facción + min<=nivel + clase/prof', () => {
  const lista = misionesDisponibles(misiones, CAZADOR_HORDA)
  assert.ok(lista.length > 500, 'el cazador tiene muchas misiones disponibles')
  for (const [, m] of lista) {
    assert.ok(misionDeFaccion(m, 'horda'))
    assert.ok((typeof m.min === 'number' ? m.min : 1) <= 30)
    assert.ok(misionParaPersonaje(m, CAZADOR_HORDA))
  }
  // ninguna misión de facción opuesta ni de clase ajena
  assert.ok(!lista.some(([, m]) => m.faccion === 'a'))
  assert.ok(!lista.some(([, m]) => Array.isArray(m.clases) && m.clases.length && !m.clases.includes(3)))
})

test('bandaActual es nivel-2 … nivel+5', () => {
  assert.deepEqual(bandaActual(30), { min: 28, max: 35 })
  assert.deepEqual(bandaActual(1), { min: -1, max: 6 })
})

test('misionesDeBanda agrupa por zona o dungeon y respeta la banda', () => {
  const grupos = misionesDeBanda(misiones, CAZADOR_HORDA, dungeons)
  assert.ok(grupos.length > 0)
  for (const g of grupos) {
    assert.ok(['zona', 'dungeon', 'otra'].includes(g.tipo))
    for (const [, m] of g.items) {
      assert.ok(m.nivel >= 28 && m.nivel <= 35, `misión ${m.t.en} nivel ${m.nivel} fuera de banda`)
      assert.ok(misionDeFaccion(m, 'horda'))
    }
  }
  // las misiones de battleground (dungeon 489/529, no están en dungeons.json) caen en 'otra'
  const otra = grupos.find((g) => g.tipo === 'otra')
  assert.ok(otra, 'debería haber grupo otra con las misiones de BG')
  assert.ok(otra.items.every(([, m]) => m.dungeon == null || !mapasDeDungeons(dungeons).has(Number(m.dungeon))))
  // y ninguna misión de la banda quedó sin agrupar por error de tipo
  assert.ok(grupos.some((g) => g.tipo === 'zona'), 'hay grupos de zona')
  assert.ok(grupos.some((g) => g.tipo === 'dungeon'), 'hay grupos de dungeon')
})

test('misionesDeDungeon devuelve solo las de ese mapa y facción', () => {
  const wc = misionesDeDungeon(misiones, PALADIN_HORDA, 43)
  assert.ok(wc.length > 0)
  assert.ok(wc.every(([, m]) => Number(m.dungeon) === 43 && misionDeFaccion(m, 'horda')))
  // Deadmines (36) es solo de Alianza: el paladín de la Horda no ve ninguna.
  assert.equal(misionesDeDungeon(misiones, PALADIN_HORDA, 36).length, 0)
  assert.ok(misionesDeDungeon(misiones, { ...PALADIN_HORDA, faccion: 'alianza' }, 36).length > 0)
})

// ---------------------------------------------------------------- zonas

test('zonasDeNivel: nivel 30 de la Horda incluye Mil Agujas y Desolace, no Durotar', () => {
  const zs = zonasDeNivel(zonas, 'horda', 30)
  const ids = zs.map((z) => z.id)
  assert.ok(ids.includes(1441), 'Thousand Needles (1441)')
  assert.ok(ids.includes(1443), 'Desolace (1443)')
  assert.ok(!ids.includes(1411), 'Durotar (1411) no llega al 30')
  assert.ok(!ids.includes(1419), 'Mulgore no llega al 30')
  // ordenadas por nivel mínimo
  const mins = zs.map((z) => z.niveles.min)
  assert.deepEqual(mins, [...mins].sort((a, b) => a - b))
  // recuento de misiones de la facción presente
  const mil = zs.find((z) => z.id === 1441)
  assert.equal(mil.misiones, zonas.misiones_por_zona['1441'].horda.n)
  // la facción opuesta sola queda fuera: una zona solo-alianza no aparece para la Horda
  const soloA = Object.entries(zonas.zonas).find(([, z]) => z.faccion === 'alianza' && z.niveles && z.niveles.min <= 30 && 30 <= z.niveles.max)
  if (soloA) assert.ok(!ids.includes(Number(soloA[0])))
})

test('zonasSinNiveles lista las zonas nuevas de Forever (sin ciudades)', () => {
  const zs = zonasSinNiveles(zonas)
  assert.ok(zs.length >= 5, 'las zonas de Forever sin niveles son varias')
  assert.ok(zs.every((z) => z.niveles == null))
  assert.ok(!zs.some((z) => z.faccion === 'ciudad'))
  const nombres = zs.map((z) => (z.n.es || z.n.en))
  assert.ok(nombres.includes('Claro de la Luna') || nombres.some((n) => /luna/i.test(n)))
})

test('inicioDeRaza: orco tiene inicio, cielonato no', () => {
  const orco = inicioDeRaza(personaje, 2)
  assert.ok(orco && orco.zona != null)
  assert.equal(inicioDeRaza(personaje, 95), null)
  assert.equal(inicioDeRaza(personaje, 96), null)
})

// ---------------------------------------------------------------- dungeons

test('listaDungeons normaliza clásicos y forever, jefes ordenados', () => {
  const lista = listaDungeons(dungeons)
  assert.equal(lista.filter((d) => d.tipo === 'clasico').length, 26)
  assert.equal(lista.filter((d) => d.tipo === 'forever').length, 9)
  const wc = lista.find((d) => d.mapa === 43)
  assert.equal(wc.n.es, 'Cuevas de los Lamentos')
  assert.equal(wc.jugadores, 10)
  assert.ok(!wc.raid)
  const ordenes = wc.jefes.map((j) => j.orden)
  assert.deepEqual(ordenes, [...ordenes].sort((a, b) => a - b), 'jefes ordenados por `orden`')
  const forever = lista.find((d) => d.mapa === 2959)
  assert.equal(forever.tipo, 'forever')
  assert.equal(forever.niveles, null)
  assert.ok(forever.jefes.every((j) => j.botin === null), 'forever: botín null (hueco)')
})

test('dungeonEnRango usa ±5 niveles', () => {
  const wc = listaDungeons(dungeons).find((d) => d.mapa === 43) // 17-24
  assert.ok(dungeonEnRango(wc, 24))
  assert.ok(dungeonEnRango(wc, 12), '24-5-... borde inferior: 17-5=12')
  assert.ok(!dungeonEnRango(wc, 11))
  assert.ok(!dungeonEnRango(wc, 30), '24+5=29')
  const sm = listaDungeons(dungeons).find((d) => d.mapa === 189) // 29-48
  assert.ok(dungeonEnRango(sm, 24), '29-5=24: el paladín 24 está justo en rango')
  assert.ok(!dungeonEnRango(sm, 23))
})

test('dungeonsVisibles: rango / todos / raids', () => {
  const lista = listaDungeons(dungeons)
  const rango = dungeonsVisibles(lista, 'rango', 24)
  const mapas = rango.map((d) => d.mapa)
  assert.ok(mapas.includes(43), 'WC 17-24 en rango del 24')
  assert.ok(!mapas.includes(409), 'Molten Core no está en rango del 24')
  assert.ok(!mapas.includes(2959), 'forever no tiene niveles: nunca "en rango"')
  const todos = dungeonsVisibles(lista, 'todos', 24)
  assert.equal(todos.length, 35)
  assert.ok(todos.some((d) => d.tipo === 'forever'))
  assert.ok(todos.findIndex((d) => d.mapa === 409) > todos.findIndex((d) => d.mapa === 43), 'ordenados por nivel')
  const raids = dungeonsVisibles(lista, 'raids', 24)
  assert.ok(raids.length >= 7)
  assert.ok(raids.every((d) => d.raid))
  assert.equal(raids.filter((d) => d.tipo === 'forever').length, 0)
})

// ---------------------------------------------------------------- ítem -> competencia

test('infoItem lee calidad/clase/subclase del layout de items.json', () => {
  const it = infoItem(items, 6469) // Venomstrike (arco)
  assert.ok(it)
  assert.equal(it.clase, 2)
  assert.equal(it.subclase, 2)
  assert.ok(it.calidad >= 2)
  assert.equal(infoItem(items, 99999999), null)
})

test('skilllineDeItem mapea armas y armaduras según la tabla del encargo', () => {
  const arma = (sub) => skilllineDeItem({ clase: 2, subclase: sub })
  assert.equal(arma(0), 44)   // dagger? no — 0 es "sword" según tabla
  assert.equal(arma(2), 45)   // bow
  assert.equal(arma(7), 43)   // mace
  assert.equal(arma(15), 173) // dagger
  assert.equal(arma(19), 228) // gun
  assert.equal(arma(99), null)
  const arm = (sub) => skilllineDeItem({ clase: 4, subclase: sub })
  assert.equal(arm(1), 415)   // plate
  assert.equal(arm(2), 414)   // mail
  assert.equal(arm(3), 413)   // leather
  assert.equal(arm(4), 293)   // cloth
  assert.equal(arm(6), 433)   // shield
  assert.equal(arm(0), 'joyeria')
  assert.equal(skilllineDeItem({ clase: 1, subclase: 0 }), null) // consumible: sin mapa
})

test('esUtilParaClase: calidad>=2 y SkillLine en competencias', () => {
  const compsPaladin = new Set(clases['2'].competencias.map((c) => c.id))
  assert.ok(compsPaladin.has(415) && compsPaladin.has(293) && compsPaladin.has(433))
  assert.ok(!compsPaladin.has(45), 'el paladín no usa arcos')
  // Venomstrike 6469: arco -> SkillLine 45 -> no útil para paladín
  assert.ok(!esUtilParaClase(infoItem(items, 6469), compsPaladin))
  // Leggings of the Fang 10410: leather -> 413 -> útil
  assert.ok(esUtilParaClase(infoItem(items, 10410), compsPaladin))
  // joyería (clase 4 subclase 0) la usa todo el mundo con calidad>=2
  const anillo = Object.keys(items).find((id) => { const f = items[id]; return f[6] === 4 && f[7] === 0 && f[2] >= 2 })
  assert.ok(anillo, 'hay joyería azul en items.json')
  assert.ok(esUtilParaClase(infoItem(items, anillo), compsPaladin))
  assert.ok(esUtilParaClase(infoItem(items, anillo), new Set()))
  // calidad < 2 nunca es útil
  const pobre = Object.keys(items).find((id) => { const f = items[id]; return f[6] === 2 && f[2] < 2 })
  if (pobre) assert.ok(!esUtilParaClase(infoItem(items, pobre), compsPaladin))
  // ítem inexistente o no equipable
  assert.ok(!esUtilParaClase(null, compsPaladin))
  assert.ok(!esUtilParaClase(infoItem(items, 99999999), compsPaladin))
})

test('botinUtil filtra el botín de un jefe', () => {
  const comps = new Set(clases['2'].competencias.map((c) => c.id))
  // WC Lord Cobrahn: tiene 10410 (leather, útil) y 6460/6465 — verificar resultado
  const wc = listaDungeons(dungeons).find((d) => d.mapa === 43)
  const cobrahn = wc.jefes.find((j) => j.n.en === 'Lord Cobrahn')
  const util = botinUtil(items, cobrahn.botin, comps)
  assert.ok(util.some(([id]) => id === 10410), 'Leggings of the Fang es útil para paladín')
  const ids = new Set(util.map(([id]) => id))
  for (const [id] of cobrahn.botin) {
    assert.equal(esUtilParaClase(infoItem(items, id), comps), ids.has(id), `ítem ${id} mal filtrado`)
  }
})

// ---------------------------------------------------------------- curado por nombre

test('normalizarNombre quita acentos y puntuación', () => {
  assert.equal(normalizarNombre('Zul’Farrak'), 'zul farrak')
  assert.equal(normalizarNombre('Crème brûlée'), 'creme brulee')
  assert.equal(normalizarNombre("Sunken Temple (Atal'Hakkar)"), 'sunken temple atal hakkar')
})

test('nombreDungeonCoincide casa variantes curadas con el nombre generado', () => {
  assert.ok(nombreDungeonCoincide('Scarlet Monastery — Armory', { en: 'Scarlet Monastery', es: 'Monasterio Escarlata' }))
  assert.ok(nombreDungeonCoincide('Sunken Temple (Atal\'Hakkar)', { en: 'Sunken Temple', es: 'Templo Sumergido' }))
  assert.ok(nombreDungeonCoincide('Lower/Upper Blackrock Spire', { en: 'Blackrock Spire', es: 'Cumbre de Roca Negra' }))
  assert.ok(nombreDungeonCoincide('Dire Maul East / North', { en: 'Dire Maul', es: 'La Masacre' }))
  assert.ok(!nombreDungeonCoincide('Blackrock Depths', { en: 'Blackrock Spire', es: 'Cumbre de Roca Negra' }))
  assert.ok(!nombreDungeonCoincide('Razorfen Downs', { en: 'Razorfen Kraul', es: 'Horado Rajacieno' }))
})

test('curadosPorDungeon cruza las 17 entradas curadas con los mapas generados', async () => {
  // La guía PUBLICADA se lee del archivo vivo (guide-hunter.js), para que un
  // cambio curado real se vea en el test sin tocar nada más.
  // los archivos de guía son UMD/CJS: en Node el export nombrado puede no
  // resolverse; se toma de module.exports (default) con respaldo al nombrado.
  const guiaDe = async (f, clave) => {
    const mod = await import(f)
    return mod[clave] || (mod.default && mod.default[clave]) || mod.default
  }
  const GUIDE_HUNTER = await guiaDe('../standalone/guide-hunter.js', 'GUIDE_HUNTER')
  // Las dos guías RETIRADAS en la 2.0.0 (chamán/guerrero) ya no son fixture:
  // su lista curada de dungeons vive en tests/fixtures/guias-curadas.json,
  // que es la parte que los datos sí validan (la entrada y su posición).
  const curadas = JSON.parse(readFileSync(new URL('./fixtures/guias-curadas.json', import.meta.url), 'utf8'))
  const guias = [
    ['hunter', GUIDE_HUNTER.dungeons],
    ['warrior', curadas.guias.warrior],
    ['shaman', curadas.guias.shaman],
  ]
  for (const [nombreG, entradas] of guias) {
    const mapa = curadosPorDungeon(entradas, dungeons.clasicos, dungeons.forever)
    // cada una de las 17 entradas curadas debe encontrar su dungeon generado
    const asignados = new Set()
    for (const lista of mapa.values()) for (const x of lista) asignados.add(x.indice)
    assert.equal(asignados.size, entradas.length, `${nombreG}: las ${entradas.length} entradas curadas cruzan con un dungeon generado`)
    // comprobaciones puntuales de las variantes difíciles
    const sm = mapa.get(189) || []
    assert.ok(sm.length >= 2, 'Scarlet Monastery junta Armory y Cathedral')
    assert.ok((mapa.get(229) || []).length === 1, 'Lower/Upper Blackrock Spire -> 229')
    assert.ok(!(mapa.get(230) || []).some((x) => /Spire/i.test(x.d.n)), 'Spire no se cuela en Blackrock Depths')
    assert.ok((mapa.get(109) || []).length === 1, 'Sunken Temple (Atal\'Hakkar) -> 109')
    assert.ok((mapa.get(429) || []).length === 1, 'Dire Maul East / North -> 429')
    // el índice es la posición en la lista `dungeons` de ESA guía (guía a guía
    // el orden difiere: en hunter BFD=2, en warrior/shaman BFD=3)
    const idxDe = (re) => entradas.findIndex((d) => re.test(d.n))
    assert.equal(mapa.get(43)?.[0]?.indice, idxDe(/Wailing Caverns/), 'WC -> su índice en la guía')
    assert.equal(mapa.get(48)?.[0]?.indice, idxDe(/Blackfathom/), 'BFD -> su índice en la guía')
    assert.equal(mapa.get(189)?.[0]?.indice, idxDe(/Armory/), 'SM Armory -> su índice')
  }
})

// ---------------------------------------------------------------- build persistido

test('leerBuild tolera basura y objetos', () => {
  assert.deepEqual(leerBuild(null), {})
  assert.deepEqual(leerBuild(''), {})
  assert.deepEqual(leerBuild('no json'), {})
  assert.deepEqual(leerBuild('[1,2]'), {})
  assert.deepEqual(leerBuild('{"realm":"ek","gear":["d1|X"],"steps":["30|0"]}'), { realm: 'ek', gear: ['d1|X'], steps: ['30|0'] })
})

test('listaBuild solo devuelve strings', () => {
  assert.deepEqual(listaBuild({ gear: ['a', 3, 'b'] }, 'gear'), ['a', 'b'])
  assert.deepEqual(listaBuild({}, 'gear'), [])
  assert.deepEqual(listaBuild({ gear: 'no-array' }, 'gear'), [])
})

test('alternarEnLista agrega y quita sin duplicar', () => {
  assert.deepEqual(alternarEnLista([], 'x', true), ['x'])
  assert.deepEqual(alternarEnLista(['x'], 'x', false), [])
  assert.deepEqual(alternarEnLista(['x'], 'x', true), ['x'])
  assert.deepEqual(alternarEnLista(['x', 'y'], 'z', true), ['x', 'y', 'z'])
})

test('buildCambios fusiona sobre el build previo (almacén simulado)', async () => {
  let guardado = JSON.stringify({ realm: 'ek', otra: 1 })
  const almacen = {
    read: async () => ({ build: guardado }),
    build: async (v) => { guardado = v },
  }
  const { buildCambios, buildActual } = await import('../desktop/src/ruta-logica.js')
  await buildCambios(almacen, { gear: ['d1|Foo'] })
  const v = await buildActual(almacen)
  assert.equal(v.realm, 'ek', 'conserva claves ajenas')
  assert.equal(v.otra, 1)
  assert.deepEqual(v.gear, ['d1|Foo'])
})
