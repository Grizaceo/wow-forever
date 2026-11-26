// Prueba de la vista de clase: procedencia (etiquetas de fuente, fuente desconocida,
// fuente no declarada) y alcance (hechizos de CLASE frente a misiones de FACCIÓN).
//
//   node desktop/test/vista-clase.mjs
//
// Usa el arnés común (desktop/test/arnes.mjs) y el bundle real; para lo que el bundle no
// puede producir (una clave de fuente que el repo no reconoce, un perfil incompleto) monta
// un doble sintético con los MISMOS componentes del repo (desktop/src/ui.jsx y
// desktop/src/vistas/clase.jsx) y datos sintéticos: no toca data/ ni el juego.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrirVista, iniciar, PERFILES } from './arnes.mjs'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..', '..')
const tmp = mkdtempSync(path.join(tmpdir(), 'wow-p0-clase-'))
// El bundle de prueba pesa ~10 MB: se borra al salir, también si un check falla.
// Si no se puede borrar (p. ej. un archivo bloqueado), no cambia el resultado del test.
process.on('exit', () => { try { rmSync(tmp, { recursive: true, force: true }) } catch {} })

// El bundle se construye aparte: desktop/plugin.js es un artefacto que regenera el
// integrador; aquí se usa el bundle recién hecho desde desktop/src. Con
// DESKTOP_PLUGIN=… se usa ese bundle en su lugar (así se puede correr la suite contra
// el bundle viejo y ver el rojo antes del cambio).
const propio = process.env.DESKTOP_PLUGIN ? null : path.join(tmp, 'plugin.js')
if (propio) execFileSync(process.execPath, ['build.mjs', '--out', propio], { cwd: path.join(raiz, 'desktop'), stdio: 'inherit' })

const PALADIN_HORDA = PERFILES.paladinHorda                                    // clase 2, horda
const PALADIN_ALIANZA = { v: 1, faccion: 'alianza', raza: 1, clase: 2, nivel: 24, profesiones: [164], secundarias: [], reino: 'Prueba' }
const CHAMAN_HORDA = { v: 1, faccion: 'horda', raza: 2, clase: 7, nivel: 24, profesiones: [171], secundarias: [], reino: 'Prueba' }

// ---------------------------------------------------------------- 1) bundle real
const a = propio ? await iniciar({ plugin: propio }) : await iniciar()
const { check } = a

// La clase es opcional y vive en Perfil: cuatro desplegables nativos que montan su
// contenido al abrirse. Se abren todos para leer cada bloque por su `data-tarjeta`.
const BLOQUES_CLASE = ['clase-entrenadores', 'clase-hechizos', 'clase-misiones', 'clase-competencias']
async function abrirDesplegables(p, dentro = '') {
  for (const id of BLOQUES_CLASE) {
    const d = p.locator(`${dentro} [data-tarjeta="${id}"]`.trim())
    if (await d.count() && await d.getAttribute('open') === null) await d.locator('summary').click()
  }
}
async function abrirClase(p) {
  await abrirVista(p, 'perfil')
  await p.locator('[data-tarjeta="clase-hechizos"]').waitFor()
  await abrirDesplegables(p)
}

const hechizos = (p) => p.locator('[data-tarjeta="clase-hechizos"] tbody tr td:nth-child(2)').allInnerTexts()
const idsMision = (p) => p.locator('[data-tarjeta="clase-misiones"] [data-mision]').count()
const verTodos = async (p) => {
  const b = p.locator('[data-tarjeta="clase-hechizos"] button', { hasText: 'Ver todos' })
  if (await b.count()) await b.first().click()
}

// Cazador Horda: las tres tarjetas con su fuente, y el alcance declarado.
let { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda })
await abrirClase(p)
await p.locator('[data-tarjeta="clase-hechizos"]').waitFor()
check('clase: la tarjeta de hechizos declara que la lista es de toda la clase', await p.evaluate(() =>
  /no por facción/i.test(document.querySelector('[data-tarjeta="clase-hechizos"]').innerText)))
check('clase: la tarjeta de misiones declara que son por facción', await p.evaluate(() =>
  /por facción/i.test(document.querySelector('[data-tarjeta="clase-misiones"]').innerText) &&
  /Horda/i.test(document.querySelector('[data-tarjeta="clase-misiones"]').innerText)))
check('clase: cada bloque lleva su etiqueta de fuente', await p.locator('[data-origen="cmangos-1.12"]').count() >= 3 &&
  await p.locator('[data-origen="cliente-forever"]').count() >= 1)
check('clase: las etiquetas de fuente se distinguen entre sí', await p.evaluate(() => {
  const cm = document.querySelector('[data-origen="cmangos-1.12"]')
  const cl = document.querySelector('[data-origen="cliente-forever"]')
  return !!cm && !!cl && cm.innerText.trim() !== cl.innerText.trim() &&
    /Classic 1\.12/i.test(cm.innerText) && /Cliente Forever/i.test(cl.innerText)
}))
check('clase: la ficha declara las fuentes de su registro', await p.locator('[data-fuentes="clase"] [data-origen]').count() >= 2)
await cerrar()

// Paladín: mismo hechizo en las dos faciones, misiones distintas, SIN DATOS con motivo.
;({ p, cerrar } = await a.abrir('claro', { perfil: PALADIN_HORDA }))
await abrirClase(p)
await p.locator('[data-tarjeta="clase-hechizos"]').waitFor()
await verTodos(p)
const hechizosHorda = await hechizos(p)
const misionesHorda = await idsMision(p)
check('paladín horda: SIN DATOS con motivo declarado para los entrenadores', await p.evaluate(() => {
  const t = document.querySelector('[data-tarjeta="clase-entrenadores"]').innerText
  return /Sin datos:/i.test(t) && /Motivo declarado:/i.test(t) &&
    /combinacion valida del cliente sin entrenadores de clase en CMaNGOS 1\.12/i.test(t)
}))
check('paladín horda: sus misiones de clase siguen visibles (14)', misionesHorda === 14)
await cerrar()

;({ p, cerrar } = await a.abrir('claro', { perfil: PALADIN_ALIANZA }))
await abrirClase(p)
await p.locator('[data-tarjeta="clase-hechizos"]').waitFor()
await verTodos(p)
const hechizosAlianza = await hechizos(p)
const misionesAlianza = await idsMision(p)
check('paladín: la lista de hechizos es idéntica en las dos facciones', hechizosHorda.length > 0 &&
  hechizosHorda.length === hechizosAlianza.length &&
  hechizosHorda.join('|') === hechizosAlianza.join('|'))
check('paladín: las misiones de clase son distintas por facción (14 horda / 88 alianza)',
  misionesHorda === 14 && misionesAlianza === 88)
check('paladín alianza: con entrenadores no hay SIN DATOS', await p.evaluate(() =>
  !/Sin datos:/i.test(document.querySelector('[data-tarjeta="clase-entrenadores"]').innerText)))
await cerrar()

// Chamán: el otro caso sin entrenadores (Alianza) y el resto con lista completa.
;({ p, cerrar } = await a.abrir('claro', { perfil: PERFILES.chamanAlianza }))
await abrirClase(p)
await p.locator('[data-tarjeta="clase-hechizos"]').waitFor()
check('chamán alianza: SIN DATOS con motivo declarado para los entrenadores', await p.evaluate(() => {
  const t = document.querySelector('[data-tarjeta="clase-entrenadores"]').innerText
  return /Sin datos:/i.test(t) && /Motivo declarado:/i.test(t) &&
    /combinacion valida del cliente sin entrenadores de clase en CMaNGOS 1\.12/i.test(t)
}))
check('chamán alianza: sus misiones de clase siguen visibles (13)', await idsMision(p) === 13)
await cerrar()

;({ p, cerrar } = await a.abrir('claro', { perfil: CHAMAN_HORDA }))
await abrirClase(p)
await p.locator('[data-tarjeta="clase-hechizos"]').waitFor()
check('chamán horda: el mismo caso tiene lista de misiones de su facción (73)', await idsMision(p) === 73)
await cerrar()
await a.terminar('vista-clase')

// ---------------------------------------------------------------- 2) doble sintético
// Monta los componentes reales del repo con datos sintéticos para los casos que el
// bundle de producción no puede generar: una clave de fuente desconocida y un perfil
// incompleto.
const sintetico = path.join(tmp, 'sintetico.jsx')
writeFileSync(sintetico, `
import { Tabs, TabsList, TabsTrigger } from '@hermes/plugin-sdk'
import { Origen } from ${JSON.stringify(path.join(raiz, 'desktop', 'src', 'ui.jsx'))}
import { VistaClase } from ${JSON.stringify(path.join(raiz, 'desktop', 'src', 'vistas', 'clase.jsx'))}

const DATOS = {
  clases: {
    clases: {
      2: {
        n: { es: 'Paladín', en: 'Paladin' },
        f: 'fuenta-que-no-existe',
        hechizos: [{ spell: 1, n: { es: 'Golpe sagrado', en: 'Holy Strike' }, nivel: 1, costo: 100 }],
        entrenadores: { alianza: [{ npc: 1, n: { es: 'Entrenador', en: 'Trainer' }, zona: null, x: 1, y: 1 }], horda: [] },
        misiones: { alianza: [10], horda: [] },
        competencias: [{ id: 1, n: { es: 'Maza', en: 'Mace' } }],
      },
    },
    huecos: [],
  },
  misiones: { misiones: { 10: { t: { es: 'Misión de prueba', en: 'Test quest' }, nivel: 1, min: 1, zona: null } } },
  zonas: { zonas: {} },
  dungeons: { clasicos: {} },
  personaje: { facciones: { alianza: { n: { es: 'Alianza', en: 'Alliance' } }, horda: { n: { es: 'Horda', en: 'Horde' } } } },
}

const PERFIL = { v: 1, faccion: 'horda', raza: 2, clase: 2, nivel: 10 }

export default {
  id: 'p0-sintetico',
  name: 'P0 sintetico',
  version: '0.0.0',
  description: 'Doble de prueba: procedencia y alcance con datos sintéticos.',
  register(ctx) {
    ctx.registerMany([
      { id: 'route', area: 'routes', data: { path: '/p0' }, render: () => (
        <Tabs value="a" onValueChange={() => {}}>
          <TabsList><TabsTrigger value="a">A</TabsTrigger></TabsList>
          <div>
            <div data-zona="fuentes">
              <Origen f="cliente-forever" lang="es" />
              <Origen f="cmangos-1.12" lang="es" />
              <Origen f="curado" lang="es" />
              <Origen f="fuenta-que-no-existe" lang="es" />
              <Origen f="" lang="es" fallback />
              <Origen lang="es" fallback />
            </div>
            <div data-zona="clase-desconocida"><VistaClase perfil={PERFIL} lang="es" datos={DATOS} /></div>
            <div data-zona="clase-sin-clase"><VistaClase perfil={{ v: 1, faccion: 'horda', raza: 2, nivel: 10 }} lang="es" datos={DATOS} /></div>
            <div data-zona="clase-sin-faccion"><VistaClase perfil={{ v: 1, raza: 2, clase: 2, nivel: 10 }} lang="es" datos={DATOS} /></div>
          </div>
        </Tabs>
      ) },
    ])
  },
}
`)

const b = await iniciar({ plugin: sintetico })
const { p: ps, cerrar: cerrarS } = await b.abrir('claro')
await ps.locator('[data-zona="fuentes"]').waitFor()
await abrirDesplegables(ps, '[data-zona="clase-desconocida"]')
b.check('procedencia: las tres fuentes conocidas se distinguen entre sí', await ps.evaluate(() => {
  const chips = [...document.querySelectorAll('[data-zona="fuentes"] [data-origen]')]
  const conocidos = chips.filter((x) => ['cliente-forever', 'cmangos-1.12', 'curado'].includes(x.dataset.origen))
  return conocidos.length === 3 && new Set(conocidos.map((x) => x.innerText.trim())).size === 3
}))
b.check('procedencia: una fuente desconocida se ve y no se etiqueta como conocida', await ps.evaluate(() => {
  const chips = [...document.querySelectorAll('[data-zona="fuentes"] [data-origen]')]
  const desconocida = chips.find((x) => x.dataset.origen === 'fuenta-que-no-existe')
  if (!desconocida) return false
  const texto = desconocida.innerText
  return desconocida.dataset.desconocida === '1' && texto.includes('fuenta-que-no-existe') &&
    !/Classic 1\.12/i.test(texto) && !/Cliente Forever/i.test(texto) && !/Curado/i.test(texto)
}))
b.check('procedencia: una fuente vacía o ausente se declara, no desaparece', await ps.evaluate(() => {
  const chips = [...document.querySelectorAll('[data-zona="fuentes"] [data-origen]')]
  const sinDeclarar = chips.filter((x) => x.dataset.origen === 'sin-declarar')
  return sinDeclarar.length === 2 && sinDeclarar.every((x) => /Fuente no declarada/i.test(x.innerText))
}))
b.check('procedencia: la ficha de clase muestra la fuente desconocida de su registro', await ps.evaluate(() => {
  const chip = document.querySelector('[data-zona="clase-desconocida"] [data-fuentes="clase"] [data-origen="fuenta-que-no-existe"]')
  return !!chip && /Fuente desconocida/i.test(chip.innerText) && /fuenta-que-no-existe/.test(chip.innerText)
}))
b.check('procedencia: la fuente desconocida no borra las etiquetas conocidas de los bloques', await ps.evaluate(() =>
  !!document.querySelector('[data-zona="clase-desconocida"] [data-tarjeta="clase-hechizos"] [data-origen="cmangos-1.12"]')))
b.check('perfil incompleto: sin clase se dice qué falta, sin romperse', await ps.evaluate(() => {
  const t = document.querySelector('[data-zona="clase-sin-clase"]').innerText
  return /Sin datos:/i.test(t) && /clase/i.test(t)
}))
b.check('perfil incompleto: sin facción se dice que los datos son por facción', await ps.evaluate(() => {
  const t = document.querySelector('[data-zona="clase-sin-faccion"]').innerText
  return /Sin datos:/i.test(t) && /facc/i.test(t)
}))
b.check('misiones sin datos: la facción sin misiones lo dice explícitamente', await ps.evaluate(() => {
  const t = document.querySelector('[data-zona="clase-desconocida"] [data-tarjeta="clase-misiones"]').innerText
  return /Sin datos:/i.test(t)
}))
await cerrarS()
await b.terminar('vista-clase-sintetico')
