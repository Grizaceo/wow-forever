// TDD: núcleo puro de valoración descriptiva TSM (primera entrega).
// Sin reloj interno, sin red, sin persistencia: todo se inyecta en la llamada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { METODO_TSM, valorarTsm, listarValoracionesTsm } from '../desktop/src/tsm-valoracion.js'

const DAY = 86400000
const NOW = Date.UTC(2026, 0, 29, 12, 0, 0) // fecha fija, nunca Date.now()
const SEC = Math.floor(NOW / 1000)
const rec = (o = {}) => ({ kind: 'sale', itemString: 'i:2589', itemId: 2589, quantity: 1, unitPriceCopper: 100, time: SEC, source: 'Auction', ...o })
const snap = (records, realms = [{ name: 'Prueba', records }]) => ({ v: 1, importedAt: '2026-01-01T00:00:00.000Z', realms })
const opts = (o = {}) => ({ nowMs: NOW, ...o })
const SUM_KEYS = ['units', 'records', 'days', 'firstSale', 'lastSale', 'medianCopper', 'q1Copper', 'q3Copper', 'minCopper', 'maxCopper', 'daily']

test('expone exactamente la API acordada con import ES', () => {
  assert.equal(typeof METODO_TSM, 'string')
  assert.ok(METODO_TSM.length > 0)
  assert.equal(typeof valorarTsm, 'function')
  assert.equal(typeof listarValoracionesTsm, 'function')
})

test('valorarTsm devuelve la forma estable acordada para una sola venta', () => {
  const r = valorarTsm(snap([rec({ quantity: 2 })]), 'Prueba', 'i:2589', opts())
  assert.equal(r.methodVersion, METODO_TSM)
  assert.deepEqual(r.config, { windowDays: 28, minDays: 5, staleDays: 7, dispersionLimit: 0.5 })
  assert.equal(r.realmName, 'Prueba')
  assert.equal(r.itemString, 'i:2589')
  assert.equal(r.itemId, 2589)
  assert.equal(r.evaluatedAt, NOW)
  assert.equal(r.windowStart, NOW - 28 * DAY)
  assert.deepEqual(Object.keys(r.window), SUM_KEYS)
  assert.deepEqual(Object.keys(r.history), SUM_KEYS)
  assert.deepEqual(Object.keys(r.excluded), ['future', 'zero', 'invalid', 'outsideWindow'])
  assert.ok(Array.isArray(r.reasons))
  assert.equal(typeof r.sufficient, 'boolean')
  assert.equal(r.window.units, 2)
  assert.equal(r.window.records, 1)
  assert.equal(r.window.days, 1)
  assert.equal(r.window.firstSale, SEC) // SEGUNDOS epoch, igual que TSM
  assert.equal(r.window.lastSale, SEC)
  assert.equal(r.window.minCopper, 100)
  assert.equal(r.window.maxCopper, 100)
  assert.equal(r.history.records, 1)
})

test('resultado es determinista, no mutenta la entrada y queda congelado en profundidad', () => {
  const s = snap([rec({ quantity: 3 }), rec({ time: SEC - 3 * 86400, unitPriceCopper: 200 })])
  const before = structuredClone(s)
  const a = valorarTsm(s, 'Prueba', 'i:2589', opts())
  const b = valorarTsm(s, 'Prueba', 'i:2589', opts())
  assert.deepEqual(a, b)
  assert.deepEqual(s, before)
  for (const x of [a, a.config, a.window, a.history, a.excluded, a.reasons, a.window.daily, a.window.daily[0]]) {
    assert.equal(Object.isFrozen(x), true)
  }
})

test('nowMs es obligatorio y finito: nunca se consulta un reloj interno', () => {
  const s = snap([rec()])
  assert.throws(() => valorarTsm(s, 'Prueba', 'i:2589'), /nowMs/)
  for (const bad of [NaN, Infinity, -Infinity, '123', null, undefined, {}]) {
    assert.throws(() => valorarTsm(s, 'Prueba', 'i:2589', { nowMs: bad }), /nowMs/)
  }
})

test('config se normaliza y se valida sin inventar resultados', () => {
  const s = snap([rec()])
  for (const bad of [{ windowDays: -1 }, { windowDays: NaN }, { windowDays: Infinity }, { windowDays: '28' },
    { minDays: -1 }, { minDays: NaN }, { staleDays: -1 }, { staleDays: Infinity },
    { dispersionLimit: -0.1 }, { dispersionLimit: NaN }, { dispersionLimit: Infinity },
    { windowDays: 1e308 }]) {
    assert.throws(() => valorarTsm(s, 'Prueba', 'i:2589', opts(bad)))
  }
  const r = valorarTsm(s, 'Prueba', 'i:2589', opts({ windowDays: 7, minDays: 2, staleDays: 3, dispersionLimit: 0.25 }))
  assert.deepEqual(r.config, { windowDays: 7, minDays: 2, staleDays: 3, dispersionLimit: 0.25 })
  assert.equal(r.windowStart, NOW - 7 * DAY)
})

test('solo cuenta ventas Auction del reino y de la variante exacta', () => {
  const s = snap([], [{ name: 'Prueba', records: [
    rec({ quantity: 2 }),
    rec({ source: 'COD', quantity: 5, unitPriceCopper: 999 }),
    rec({ kind: 'buy', quantity: 7, unitPriceCopper: 50 }),
    rec({ kind: 'expire', quantity: 9, unitPriceCopper: null }),
    rec({ itemString: 'i:2589:99', itemId: 2589, quantity: 4, unitPriceCopper: 250 }),
  ] }, { name: 'Otro', records: [rec({ quantity: 11, unitPriceCopper: 777 })] }])
  const a = valorarTsm(s, 'Prueba', 'i:2589', opts())
  assert.equal(a.window.units, 2)
  assert.equal(a.window.records, 1)
  assert.equal(a.window.minCopper, 100)
  assert.equal(valorarTsm(s, 'Prueba', 'i:2589:99', opts()).window.units, 4)
  const b = valorarTsm(s, 'Otro', 'i:2589', opts())
  assert.equal(b.window.units, 11)
  assert.equal(b.window.minCopper, 777)
})

test('bordes de ventana incluidos; futuros, antiguos y ceros se contabilizan por separado', () => {
  const records = [
    rec({ quantity: 2 }),                                          // dentro
    rec({ quantity: 6, unitPriceCopper: 120, time: SEC - 28 * 86400 }), // borde inferior exacto
    rec({ quantity: 1, unitPriceCopper: 130 }),                    // borde superior exacto (now)
    rec({ quantity: 3, unitPriceCopper: 1000, time: SEC + 1 }),     // futuro
    rec({ quantity: 4, unitPriceCopper: 50, time: SEC - 30 * 86400 }), // antiguo
    rec({ quantity: 5, unitPriceCopper: 0, time: SEC - 1 }),        // precio cero
    rec({ quantity: 0, unitPriceCopper: 100, time: SEC - 1 }),      // unidades cero
  ]
  const r = valorarTsm(snap(records), 'Prueba', 'i:2589', opts())
  assert.deepEqual(r.excluded, { future: 1, zero: 2, invalid: 0, outsideWindow: 1 })
  assert.equal(r.window.records, 3)
  assert.equal(r.window.units, 9)
  assert.equal(r.window.minCopper, 100)
  // history no aplica ventana: incluye el registro antiguo válido y >0
  assert.equal(r.history.records, 4)
  assert.equal(r.history.units, 13)
  assert.equal(r.history.minCopper, 50)
})

test('registros numéricamente inseguros se cuentan como invalid y no contaminan el resumen', () => {
  const records = [rec({ quantity: 1 })]
  for (const bad of [NaN, Infinity, -5, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    records.push(rec({ unitPriceCopper: bad }))
  }
  records.push(rec({ quantity: 1.5 }), rec({ time: 0 }), rec({ time: 9007199254740992 }))
  const r = valorarTsm(snap(records), 'Prueba', 'i:2589', opts())
  assert.equal(r.excluded.invalid, 8)
  assert.equal(r.window.records, 1)
  assert.equal(r.window.units, 1)
  assert.equal(r.window.minCopper, 100)
  assert.throws(() => valorarTsm({ realms: 'x' }, 'Prueba', 'i:2589', opts()))
  assert.throws(() => valorarTsm(snap([rec()]), '', 'i:2589', opts()))
})

test('listarValoracionesTsm devuelve variantes exactas con venta Auction incluso antiguas, futuras o cero', () => {
  const records = [
    rec({ quantity: 1 }),
    rec({ quantity: 1, time: SEC + 10 }),
    rec({ quantity: 1, unitPriceCopper: 0 }),
    rec({ quantity: 1, time: SEC - 40 * 86400 }),
    rec({ itemString: 'i:2589:99', itemId: 2589, quantity: 1, unitPriceCopper: 250 }),
    rec({ source: 'COD', itemString: 'i:999', itemId: 999, quantity: 1 }),
    rec({ kind: 'buy', itemString: 'i:888', itemId: 888, quantity: 1 }),
    rec({ itemString: 'i:777', itemId: 777, quantity: 1, unitPriceCopper: NaN }),
  ]
  const list = listarValoracionesTsm(snap(records), 'Prueba', opts())
  assert.deepEqual(list.map(v => v.itemString), ['i:2589', 'i:2589:99', 'i:777'])
  assert.deepEqual(list.map(v => v.itemId), [2589, 2589, 777])
  for (const v of list) {
    assert.equal(v.methodVersion, METODO_TSM)
    assert.equal(v.realmName, 'Prueba')
    assert.deepEqual(Object.keys(v.window), SUM_KEYS)
  }
  assert.equal(Object.isFrozen(list), true)
})

test('listar respeta el reino, las opciones y es estable; valida aun sin variantes', () => {
  const s = snap([rec({ itemString: 'i:2589:99', itemId: 2589 })], [
    { name: 'Prueba', records: [rec({ itemString: 'i:2589:99', itemId: 2589 })] },
    { name: 'Otro', records: [rec({ itemString: 'i:5', itemId: 5 })] },
  ])
  assert.deepEqual(listarValoracionesTsm(s, 'Otro', opts()).map(v => v.itemString), ['i:5'])
  assert.deepEqual(listarValoracionesTsm(s, 'Prueba', opts()), listarValoracionesTsm(s, 'Prueba', opts()))
  assert.deepEqual(listarValoracionesTsm(s, 'Inexistente', opts()), [])
  assert.throws(() => listarValoracionesTsm(s, 'Prueba', {}), /nowMs/)
  assert.deepEqual(listarValoracionesTsm(s, 'Prueba', opts({ windowDays: 7 }))[0].config,
    { windowDays: 7, minDays: 5, staleDays: 7, dispersionLimit: 0.5 })
})

test('la mediana diaria pondera unidades por cuantil inversa CDF, no por registros', () => {
  const records = [
    rec({ quantity: 1, unitPriceCopper: 100 }),
    rec({ quantity: 1, unitPriceCopper: 200 }),
    rec({ quantity: 8, unitPriceCopper: 300 }),
  ]
  const r = valorarTsm(snap(records), 'Prueba', 'i:2589', opts())
  assert.equal(r.window.daily[0].units, 10)
  assert.equal(r.window.daily[0].records, 3)
  assert.equal(r.window.daily[0].medianCopper, 300) // acumulado 10 >= 5; la no ponderada sería 200
  assert.equal(r.window.medianCopper, 300)
  const otro = valorarTsm(snap([rec({ quantity: 8, unitPriceCopper: 100 }), rec({ quantity: 2, unitPriceCopper: 1000 })]), 'Prueba', 'i:2589', opts())
  assert.equal(otro.window.daily[0].medianCopper, 100)
})

test('entre días la mediana promedia los dos centrales y q1/q3 usan interpolación tipo 7', () => {
  const precios = [10, 20, 30, 40]
  const records = precios.map((p, i) => rec({ unitPriceCopper: p, time: SEC - (3 - i) * 86400 }))
  const r = valorarTsm(snap(records), 'Prueba', 'i:2589', opts())
  assert.deepEqual(r.window.daily.map(d => d.medianCopper), [10, 20, 30, 40])
  assert.equal(r.window.days, 4)
  assert.equal(r.window.medianCopper, 25)   // (20+30)/2
  assert.equal(r.window.q1Copper, 17.5)     // 10 + .75*(20-10)
  assert.equal(r.window.q3Copper, 32.5)     // 30 + .25*(40-30)
  assert.equal(r.window.minCopper, 10)
  assert.equal(r.window.maxCopper, 40)
  const cinco = valorarTsm(snap([10, 20, 30, 40, 50].map((p, i) => rec({ unitPriceCopper: p, time: SEC - (4 - i) * 86400 }))), 'Prueba', 'i:2589', opts())
  assert.deepEqual(cinco.window.daily.map(d => d.medianCopper), [10, 20, 30, 40, 50])
  assert.equal(cinco.window.medianCopper, 30)
  assert.equal(cinco.window.q1Copper, 20)
  assert.equal(cinco.window.q3Copper, 40)
})

test('los días son UTC enteros y ordenados; history conserva los anteriores a la ventana', () => {
  const d28 = Math.floor(Date.UTC(2026, 0, 28) / DAY)
  const d29 = Math.floor(Date.UTC(2026, 0, 29) / DAY)
  const records = [
    rec({ unitPriceCopper: 10, time: Math.floor(Date.UTC(2026, 0, 29, 0, 0, 0) / 1000) }),
    rec({ unitPriceCopper: 20, time: Math.floor(Date.UTC(2026, 0, 28, 23, 59, 59) / 1000) }),
    rec({ unitPriceCopper: 30, time: SEC - 40 * 86400 }),
  ]
  const r = valorarTsm(snap(records), 'Prueba', 'i:2589', opts())
  assert.deepEqual(r.window.daily.map(d => d.day), [d28, d29])
  assert.equal(r.history.days, 3)
  assert.equal(r.window.days, 2)
  assert.equal(r.history.firstSale, SEC - 40 * 86400)            // segundos
  assert.equal(r.history.lastSale, Math.floor(Date.UTC(2026, 0, 29, 0, 0, 0) / 1000))
  assert.equal(r.window.firstSale, Math.floor(Date.UTC(2026, 0, 28, 23, 59, 59) / 1000))
  assert.equal(r.window.lastSale, Math.floor(Date.UTC(2026, 0, 29, 0, 0, 0) / 1000))
})

test('sin ventas válidas el resumen es vacío y seguro, sin NaN ni infinitos', () => {
  const r = valorarTsm(snap([]), 'Prueba', 'i:2589', opts())
  for (const s of [r.window, r.history]) {
    assert.equal(s.units, 0)
    assert.equal(s.records, 0)
    assert.equal(s.days, 0)
    assert.equal(s.firstSale, null)
    assert.equal(s.lastSale, null)
    assert.equal(s.medianCopper, null)
    assert.equal(s.q1Copper, null)
    assert.equal(s.q3Copper, null)
    assert.equal(s.minCopper, null)
    assert.equal(s.maxCopper, null)
    assert.deepEqual(s.daily, [])
  }
})

test('snapshot ausente tras borrar lista vacío sin romper el ciclo de vida', () => {
  assert.deepEqual(listarValoracionesTsm(null, 'Prueba', opts()), [])
  assert.deepEqual(listarValoracionesTsm(undefined, 'Prueba', opts()), [])
  assert.deepEqual(listarValoracionesTsm(null, 'Prueba', opts({ windowDays: 7 })), [])
  assert.throws(() => listarValoracionesTsm(null, 'Prueba', {}), /nowMs/)
  assert.equal(Object.isFrozen(listarValoracionesTsm(null, 'Prueba', opts())), true)
})

test('listar agrupa las variantes en una sola pasada: no reescanea registros por ítem', () => {
  const records = Array.from({ length: 60 }, (_, i) => rec({ itemString: `i:${100 + (i % 6)}`, itemId: 100 + (i % 6) }))
  const realm = { name: 'Prueba' }
  let lecturas = 0
  Object.defineProperty(realm, 'records', { get() { lecturas++; return records } })
  const list = listarValoracionesTsm({ v: 1, realms: [realm] }, 'Prueba', opts())
  assert.equal(list.length, 6)
  assert.equal(lecturas, 1)
})

test('sumas fuera de rango y fechas tope fallan cerrado sin desbordar', () => {
  const max = Number.MAX_SAFE_INTEGER
  assert.throws(() => valorarTsm(snap([rec({ quantity: max }), rec({ quantity: max })]), 'Prueba', 'i:2589', opts()), /rango/)
  const limite = valorarTsm(snap([rec({ time: 8640000000000 })]), 'Prueba', 'i:2589', opts())
  assert.equal(limite.excluded.future, 1)
  assert.equal(limite.window.records, 0)
  assert.equal(limite.window.firstSale, null)
})

test('sin ventas: reason no-sales y suficiencia falsa', () => {
  const r = valorarTsm(snap([]), 'Prueba', 'i:2589', opts())
  assert.deepEqual(r.reasons, ['no-sales'])
  assert.equal(r.sufficient, false)
})

test('días insuficientes se marcan, pero cinco días estables son suficientes', () => {
  const cuatro = [10, 20, 30, 40].map((p, i) => rec({ unitPriceCopper: p, time: SEC - (3 - i) * 86400 }))
  const r = valorarTsm(snap(cuatro), 'Prueba', 'i:2589', opts())
  assert.deepEqual(r.reasons, ['insufficient-days', 'wide-dispersion'])
  assert.equal(r.sufficient, false)
  const cinco = [100, 100, 100, 100, 100].map((_, i) => rec({ time: SEC - (4 - i) * 86400 }))
  const ok = valorarTsm(snap(cinco), 'Prueba', 'i:2589', opts())
  assert.deepEqual(ok.reasons, [])
  assert.equal(ok.sufficient, true)
})

test('stale usa lastSale en segundos y respeta el borde exacto de 7 días', () => {
  const vieja = valorarTsm(snap([rec({ time: SEC - 8 * 86400 })]), 'Prueba', 'i:2589', opts({ minDays: 1 }))
  assert.deepEqual(vieja.reasons, ['stale'])
  const borde = valorarTsm(snap([rec({ time: SEC - 7 * 86400 })]), 'Prueba', 'i:2589', opts({ minDays: 1 }))
  assert.deepEqual(borde.reasons, [])
  assert.equal(borde.sufficient, true)
})

test('dispersión (q3-q1)/median dispara wide-dispersion solo por encima del límite', () => {
  const anchos = [10, 20, 30, 40].map((p, i) => rec({ unitPriceCopper: p, time: SEC - (3 - i) * 86400 }))
  const a = valorarTsm(snap(anchos), 'Prueba', 'i:2589', opts({ minDays: 2 }))
  assert.equal(a.dispersion, 0.6)
  assert.deepEqual(a.reasons, ['wide-dispersion'])
  const justo = [10, 20, 30].map((p, i) => rec({ unitPriceCopper: p, time: SEC - (2 - i) * 86400 }))
  const j = valorarTsm(snap(justo), 'Prueba', 'i:2589', opts({ minDays: 2 }))
  assert.equal(j.dispersion, 0.5)
  assert.deepEqual(j.reasons, [])
  const config = valorarTsm(snap(anchos), 'Prueba', 'i:2589', opts({ minDays: 2, dispersionLimit: 0.7 }))
  assert.deepEqual(config.reasons, [])
})

test('razones multiple salen en orden estable', () => {
  const records = [10, 20, 30, 40].map((p, i) => rec({ unitPriceCopper: p, time: SEC - 8 * 86400 - (3 - i) * 86400 }))
  const r = valorarTsm(snap(records), 'Prueba', 'i:2589', opts())
  assert.deepEqual(r.reasons, ['insufficient-days', 'stale', 'wide-dispersion'])
  assert.equal(r.sufficient, false)
})

test('stackSize nunca se multiplica y un registro agregado cuenta como un registro', () => {
  const r = valorarTsm(snap([
    rec({ quantity: 40, unitPriceCopper: 120, stackSize: 20 }),
    rec({ quantity: 60, unitPriceCopper: 120, stackSize: 20 }),
  ]), 'Prueba', 'i:2589', opts())
  assert.equal(r.window.units, 100)
  assert.equal(r.window.records, 2)
  assert.equal(r.window.daily[0].records, 2)
  assert.equal(r.window.minCopper, 120)
  assert.equal(r.window.maxCopper, 120)
})

test('no se recortan extremos ni se fabrican intervalos de confianza', () => {
  const r = valorarTsm(snap([rec({ quantity: 1, unitPriceCopper: 1 }), rec({ quantity: 1, unitPriceCopper: 1000000 })]), 'Prueba', 'i:2589', opts())
  assert.equal(r.window.minCopper, 1)
  assert.equal(r.window.maxCopper, 1000000)
  for (const clave of ['confidence', 'intervalo', 'confianza', 'interval', 'stock']) {
    assert.equal(Object.hasOwn(r, clave), false)
    assert.equal(Object.hasOwn(r.window, clave), false)
  }
})

test('recortes, correcciones y reimportación se reconstruyen sin estado oculto', () => {
  const originales = [rec({ quantity: 2 }), rec({ quantity: 3, unitPriceCopper: 200, time: SEC - 86400 })]
  const a = valorarTsm(snap(originales), 'Prueba', 'i:2589', opts({ minDays: 2 }))
  const corregidos = [rec({ quantity: 2 }), rec({ quantity: 7, unitPriceCopper: 500, time: SEC - 86400 })]
  const b = valorarTsm(snap(corregidos), 'Prueba', 'i:2589', opts({ minDays: 2 }))
  assert.notDeepEqual(a, b)
  const recortado = [rec({ quantity: 2 })]
  const c = valorarTsm(snap(recortado), 'Prueba', 'i:2589', opts({ minDays: 2 }))
  assert.equal(c.history.records, 1)
  assert.equal(c.history.units, 2)
  assert.deepEqual(valorarTsm(snap(originales), 'Prueba', 'i:2589', opts({ minDays: 2 })), a)
  assert.deepEqual(valorarTsm(snap(corregidos), 'Prueba', 'i:2589', opts({ minDays: 2 })), b)
  assert.deepEqual(listarValoracionesTsm(snap([]), 'Prueba', opts()), [])
})
