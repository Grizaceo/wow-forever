// Prueba de la tarjeta «Estado del personaje (SimulationCraft)» en el arnés de
// navegador (arnes.mjs):
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node desktop/test/vista-personaje-simc.mjs
// Cubre: estado vacío, export pegado persistido, chips de procedencia/frescura,
// stats y equipo leídos, propuesta de perfil aplicada y copia del export.
import { iniciar, PERFILES } from './arnes.mjs'

const a = await iniciar()
const { check } = a

// Export anonimizado con la forma real del addon (hunter orc nv 35, reino prueba).
const EXPORT = [
  'hunter="Personaje Prueba"',
  'level=35',
  'race=orc',
  'region=latam',
  'server=prueba',
  'role=attack',
  'professions=engineering=300/first_aid=110',
  'spec=unknown',
  '',
  'talents=CdEAAAAAAAAAAAAAAAAAAAAA',
  '',
  '# SimC Addon 12.1.5-04',
  '#',
  '# Arco largo (30)',
  'main_hand=,id=23456,enchant_id=789',
  '#',
  '# Pecho de malla (28)',
  'chest=,id=34567',
  '',
  '# character_stats=strength:10/agility:150/stamina:80/intellect:20/spirit:15/health:1200',
  '# character_stats_gear=armor:2000',
  '# character_stats_bonus=attack_power:100',
  '# character_stats_base=attack_power:50',
  '# attack_power=melee:100:5:0',
  '# crit=melee:5.00',
  '# skills=first_aid:110',
  '# buffs=',
  '# Checksum: abc123',
  '',
].join('\n')

// ---------------------------------------------------------------- 1) Estado vacío
let { p, cerrar } = await a.abrir('claro', { perfil: PERFILES.cazadorHorda })
await p.click('[data-tab="personaje"]')
await p.getByText('Todavía no hay estado del personaje.').waitFor()
check('simc: estado vacío declara que no hay datos', await p.getByText('Todavía no hay estado del personaje.').count() === 1)
await p.locator('textarea[placeholder="# SimC Addon …"]').fill(EXPORT)
await p.getByRole('button', { name: 'Guardar export', exact: true }).click()
await p.getByText('Leído del juego', { exact: false }).waitFor({ timeout: 3000 }).catch(() => {})
// El guardado es «pegado»: el chip debe decir «Pegado a mano», no «Leído del juego».
await p.getByText('Pegado a mano', { exact: false }).first().waitFor()
check('simc: chip de procedencia «Pegado a mano»', await p.getByText('Pegado a mano').count() >= 1)
check('simc: nivel 35 leído del export (no el 30 del perfil)', await p.getByText('35').count() >= 1)
check('simc: stats del export visibles (FUE 10 / AGI 150)', await p.getByText('AGI 150').count() >= 1 && await p.getByText('FUE 10').count() >= 1)
check('simc: equipo por slot con nombre de ítem', await p.getByText('Mano princ.').count() >= 1)
check('simc: propuesta de perfil aparece (nivel 30→35)', await p.getByText('El export propone actualizar tu perfil').count() === 1)
await p.getByRole('button', { name: 'Aplicar al perfil', exact: true }).click()
await p.waitForFunction(() => {
  const el = document.querySelector('#wf-nivel')
  return el && el.value === '35'
})
check('simc: aplicar propone nivel 35 en el perfil', await p.evaluate(() => document.querySelector('#wf-nivel').value === '35'))
await cerrar()

// ---------------------------------------------------------------- 2) Sembrado addon + DAVI
const captura = Math.floor(Date.now() / 1000) - 3600
;({ p, cerrar } = await a.abrir('claro', {
  perfil: PERFILES.cazadorHorda,
  storage: {
    'personaje-simc': { v: 1, origem: 'addon', texto: EXPORT, capturado: captura, erro: null },
  },
}))
await p.click('[data-tab="personaje"]')
await p.getByText('Leído del juego', { exact: false }).first().waitFor()
check('simc: chip «Leído del juego» para captura del addon', await p.getByText('Leído del juego').count() >= 1)
check('simc: estado sembrado muestra nivel 35', await p.getByText('35').count() >= 1)
// DAVI: la parte simc debe existir como opción en el panel.
await p.getByRole('button', { name: 'Preguntar a DAVI', exact: true }).first().click()
await p.getByText('Incluir estado SimC').waitFor()
check('simc: DAVI ofrece «Incluir estado SimC»', await p.getByText('Incluir estado SimC').count() === 1)
await p.getByRole('button', { name: 'Cerrar', exact: true }).click()
await cerrar()
await a.terminar('vista-personaje-simc')
