// Prueba de la tarjeta «Escala Pawn» en el arnés de navegador (arnes.mjs):
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/vista-pawn.mjs
// Cubre: estado vacío, captura del addon con pesos y ilvl, catálogo de escalas,
// escala sin pesos y el checkbox de DAVI.
import { iniciar, PERFILES } from './arnes.mjs'

const a = await iniciar()
const { check } = a

const CAPTURA = {
  v: 1, origem: 'addon',
  escala: '"Classic":HUNTER1', localized: 'Hunter: Beast Mastery',
  provider: 'Classic', classID: 3, specID: 1,
  pesos: { Agility: 1.5, Strength: 1, Crit: 0.8, Hit: 0.5 },
  equipo: {
    valores: [
      { escala: '"Classic":HUNTER1', valor: 12.5, localized: 'Hunter: Beast Mastery' },
      { escala: '"Classic":HUNTER1', valor: 8, localized: null },
    ],
    ilvl: 33,
  },
  candidatas: [
    { nome: '"Classic":HUNTER1', localized: 'Hunter: Beast Mastery', provider: 'Classic', classID: 3, specID: 1, role: 'DAMAGER' },
    { nome: '"Classic":HUNTER2', localized: 'Hunter: Marksmanship', provider: 'Classic', classID: 3, specID: 2, role: 'DAMAGER' },
  ],
  capturado: Math.floor(Date.now() / 1000) - 3600,
  truncado: false,
  erro: null,
}

const CATALOGO = {
  v: 1, versao: 2.1403,
  escalas: [
    { nome: '"Classic":HUNTER1', localized: 'Hunter: Beast Mastery', provider: 'Classic', classID: 3, specID: 1, role: 'DAMAGER', temPesos: false },
    { nome: '"Classic":HUNTER2', localized: 'Hunter: Marksmanship', provider: 'Classic', classID: 3, specID: 2, role: 'DAMAGER', temPesos: false },
    { nome: '"Classic":MAGE1', localized: 'Mage: Arcane', provider: 'Classic', classID: 8, specID: 1, role: 'DAMAGER', temPesos: false },
    { nome: 'Mi escala', localized: 'Mi escala', provider: null, classID: 3, specID: null, role: null, temPesos: true, pesos: { Strength: 1 } },
  ],
}

// ---------------------------------------------------------------- 1) Estado vacío
let { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda })
await p.click('[data-tab="personaje"]')
await p.getByText('Sin captura de Pawn').waitFor()
check('pawn: estado vacío declara que no hay captura', await p.getByText('Sin captura de Pawn').count() >= 1)
check('pawn: el estado vacío explica cómo capturar (/wfbpawn)', await p.getByText('/wfbpawn').count() >= 1)
await cerrar()

// ---------------------------------------------------------------- 2) Captura + catálogo + DAVI
;({ p, cerrar } = await a.abrir('claro', {
  perfil: PERFILES.cazadorHorda,
  storage: { pawn: CAPTURA, 'pawn-catalogo': CATALOGO },
}))
await p.click('[data-tab="personaje"]')
await p.getByText('Escala Pawn').first().waitFor()
await p.locator('[data-pawn-fila]').first().waitFor()
check('pawn: tarjeta «Escala Pawn» visible', await p.getByText('Escala Pawn').count() >= 1)
check('pawn: chip «Leído del juego»', await p.getByText('Leído del juego').count() >= 1)
check('pawn: filas de pesos data-pawn-fila', await p.locator('[data-pawn-fila]').count() === 4)
check('pawn: peso Agility 1.5 visible', await p.getByText('Agility 1.5').count() >= 1)
check('pawn: nombre de escala y proveedor', await p.getByText('Hunter: Beast Mastery').count() >= 1 && await p.getByText('Classic').count() >= 1)
check('pawn: ilvl del equipo puesto', await p.getByText('ilvl 33').count() >= 1)
check('pawn: catálogo declara 4 escalas', await p.getByText('4 escalas en Pawn.lua').count() >= 1)
await p.getByRole('button', { name: 'Preguntar a DAVI', exact: true }).first().click()
await p.getByText('Incluir escala Pawn').waitFor()
check('pawn: DAVI ofrece «Incluir escala Pawn»', await p.getByText('Incluir escala Pawn').count() === 1)
await p.getByRole('button', { name: 'Cerrar', exact: true }).click()
await cerrar()

// ---------------------------------------------------------------- 3) Captura sin pesos
;({ p, cerrar } = await a.abrir('claro', {
  perfil: PERFILES.cazadorHorda,
  storage: {
    pawn: { ...CAPTURA, pesos: {}, equipo: null },
    'pawn-catalogo': CATALOGO,
  },
}))
await p.click('[data-tab="personaje"]')
await p.getByText('La escala capturada no trajo pesos.').waitFor()
check('pawn: captura sin pesos lo declara (no inventa)', await p.getByText('La escala capturada no trajo pesos.').count() === 1)
check('pawn: sin filas de pesos', await p.locator('[data-pawn-fila]').count() === 0)
await cerrar()

await a.terminar('vista-pawn')
