// node --test tests/cuantitativo.test.mjs — correcciones cuantitativas de la auditoría.
// H1 comisión AH, H4 probabilidad approximate, H5 crafts fraccionales, H11 series robustas,
// H12 saturación explícita, H13 resumen de cobertura. Valores a mano, sin datos reales.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AH_CUT, TENDENCIA_ROBUSTA, PROB_SUBIDA_AVISO,
  mediana, medianaMovil, tendenciaRobusta, preciosHistoricos,
  rutaMaxeo, roiRuta, probSubida,
} from '../src/crafteo.js'

const fila = (compra, vendedor) => ['X', 'X', 1, 0, 0, 0, 0, 0, 0, compra, vendedor]
const filaV = (venta) => ['X', 'X', 1, 0, 0, venta, 0, 0, 0, 0, 0]
const ITEMS = {
  100: fila(0, 0), 300: filaV(20), 301: filaV(30), 302: filaV(2000),
}
const rango = (aprende, amarillo, verde, gris) => ({ aprende, amarillo, verde, gris })
const R = (spell, como, rg, reactivos, extra = {}) => ({ spell, como, rango: rg, reactivos, n: { es: 'r' + spell }, ...extra })
const S = (day, low, avail) => ({ day, low, avail })

const rA = R(1, 'entrenador', rango(0, 10, 10, 10), [[100, 1]], { crea: [300, 1] })

// H1 — la subasta se valora NETO de comisión (5%).
test('H1: retorno estimado neto de comisión AH, suelo vendedor intacto', () => {
  assert.equal(AH_CUT, 0.05)
  const roi = roiRuta([rA], 0, 10, { 100: 10, 300: 50 }, ITEMS)
  assert.equal(roi.retornoVendedor, 200) // 10 × 20, sin comisión
  assert.equal(roi.retornoEstimado, 475) // 10 × (50 × 0,95)
  assert.equal(roi.roiEstimado, 4.75) // retorno/coste
  assert.equal(roi.netoEstimado, 375)
  assert.equal(roi.comisionAH, 0.05)
  assert.equal(roi.rentabilidadVendedor, 1) // (200-100)/100, separado del ratio retorno/coste
  assert.equal(roi.rentabilidadEstimada, 3.75)
  assert.match(roi.convencionRetorno, /retorno\/coste/)
})

test('H1: AH por debajo del vendedor no hunde el suelo', () => {
  const roi = roiRuta([rA], 0, 10, { 100: 10, 300: 5 }, ITEMS)
  assert.equal(roi.retornoVendedor, 200)
  assert.equal(roi.retornoEstimado, 200) // max(5×0,95 ; 20) = 20
})

// H5 — el coste usa crafts fraccionales; el retorno también. Redondeo sólo al presentar.
test('H5: retorno calculado con crafts exactos, no con el entero de la vista', () => {
  const rFrac = R(7, 'entrenador', rango(0, 0, 4, 5), [[100, 1]], { crea: [301, 1] })
  const ruta = rutaMaxeo([rFrac], 2, 3, { 100: 10 }, ITEMS)
  assert.equal(ruta.pasos[0].crafteos, 2) // presentación
  assert.ok(Math.abs(ruta.pasos[0].crafteosExactos - 5 / 3) < 1e-12)
  const roi = roiRuta([rFrac], 2, 3, { 100: 10 }, ITEMS)
  assert.equal(roi.coste, 17) // 10 × 5/3 redondeado una sola vez
  assert.equal(roi.retornoVendedor, 50) // (5/3) × 30, NO 2 × 30 = 60
  assert.equal(roi.retornoEstimado, 50)
})

// H4 — probabilidad lineal aproximada: esperanza por punto, sin verificación del servidor.
test('H4: probSubida lineal y aviso explícito de aproximación', () => {
  assert.equal(probSubida(rango(0, 0, 4, 5), 2), 0.6)
  assert.equal(probSubida(rango(0, 10, 10, 10), 2), 1)
  assert.equal(probSubida(rango(0, 0, 4, 5), 5), 0)
  assert.match(PROB_SUBIDA_AVISO, /aproximad/)
  assert.match(PROB_SUBIDA_AVISO, /NO verificada/)
  assert.match(PROB_SUBIDA_AVISO, /esperanza/)
  const ruta = rutaMaxeo([rA], 0, 10, { 100: 10 }, ITEMS)
  assert.equal(ruta.avisoProbabilidad, PROB_SUBIDA_AVISO)
})

// H11 — mediana de mínimos y tendencia por mitades, con tamaño mínimo y umbral documentado.
test('H11: la mediana ignora el outlier y la tendencia compara mitades', () => {
  const serie = [S(2504, 1000, 1), S(2505, 100, 1), S(2506, 100, 1), S(2507, 100, 1)]
  assert.equal(mediana([1000, 100, 100, 100]), 100)
  assert.deepEqual(medianaMovil(serie), { media: 100, n: 4, desde: 2504, hasta: 2507 })
  assert.deepEqual(tendenciaRobusta(serie),
    { direccion: 'baja', deltaPct: -81.8, medianaPrimera: 550, medianaSegunda: 100, n: 4 })
  assert.equal(tendenciaRobusta([S(2504, 100, 1), S(2505, 103, 1)]), null) // bajo mínimo
  assert.equal(tendenciaRobusta([S(2504, 100, 1), S(2505, 100, 1), S(2506, 100, 1), S(2507, 103, 1)]).direccion, 'plana') // 1,5% < 5%
  assert.equal(TENDENCIA_ROBUSTA.minPuntos, 4)
  assert.equal(TENDENCIA_ROBUSTA.umbralPct, 5)
})

test('H11: preciosHistoricos(opts.robusto) usa mediana y tendencia robusta', () => {
  const { precios, meta } = preciosHistoricos(
    { 100: [[2504, 1000, 1], [2505, 100, 1], [2506, 100, 1], [2507, 100, 1]] },
    null, { robusto: true })
  assert.equal(precios.get(100), 100)
  assert.equal(meta[100].direccion, 'baja')
  assert.equal(meta[100].medianaPrimera, 550)
})

// H12 — sin tasa de venta observada no se inventa saturación; con ella se aplica explícitamente.
test('H12: retorno lineal no asume ventas; saturación sólo si el llamador la da', () => {
  const rSat = R(8, 'entrenador', rango(0, 150, 150, 150), [[100, 1]], { crea: [302, 1] })
  const sinSaturar = roiRuta([rSat], 0, 150, { 100: 1 }, ITEMS)
  assert.equal(sinSaturar.retornoEstimado, 300000) // 150 × 2000
  assert.equal(sinSaturar.retornoEstimadoAjustado, null)
  assert.equal(sinSaturar.saturacion, null)
  const conSaturar = roiRuta([rSat], 0, 150, { 100: 1 }, ITEMS, { saturacion: 0.74 })
  assert.equal(conSaturar.retornoEstimado, 300000) // el sin ajustar queda intacto
  assert.equal(conSaturar.retornoEstimadoAjustado, 222000) // 111 de 150 a 2000
  assert.equal(conSaturar.roiEstimadoAjustado, 1480) // 222000 / 150
  assert.match(conSaturar.avisoSaturacion, /NO está garantizada/)
})

// H13 — la cobertura es sobre recetas con adquisición conocida, nunca cota inferior.
test('H13: resumen declara recetas consideradas y adquisiciones sin dato', () => {
  const sinAcq = R(10, 'receta', rango(0, 10, 10, 10), [[100, 1]],
    { receta_item: 999, vendedores: {}, crea: [300, 1] })
  const roi = roiRuta([rA, sinAcq], 0, 10, { 100: 10 }, ITEMS)
  assert.equal(roi.recetasConsideradas, 1)
  assert.equal(roi.adquisicionesSinDato, 1)
  assert.match(roi.avisoCobertura, /no es una cota inferior/)
})
