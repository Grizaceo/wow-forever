// Piezas compartidas de la guía curada: estilos locales (solo C.*/S.*), iconos SVG
// de línea, <details> plegable, placas/badges, la ficha de personaje con retrato
// procedural y la tarjeta del personaje real importado de /simc.
import { useState } from 'react'
import { C, CALIDAD } from '../../estilos.js'
import { t, agregarTextos } from '../../i18n.js'
import { TextoRico } from '../../ui.jsx'
import { nombreClaseGuia } from '../../datos.js'
import { fmtDps, simcHelpers, simcVitals, petHappyText } from '../../guia-logica.js'

agregarTextos({
  'guia.ficha.retrato': 'Retrato de {clase}', 'guia.ficha.nivel': 'nivel', 'guia.ficha.personaje': 'Tu personaje',
  'guia.ficha.dps': 'DPS equipado', 'guia.ficha.armas': 'Armas', 'guia.ficha.loot': 'Loot', 'guia.ficha.ruta': 'Ruta',
  'guia.ficha.real': 'Personaje real · SimC', 'guia.ficha.vida': 'Vida',
  'guia.ficha.talento': 'Talento', 'guia.ficha.prefArma': 'Arma preferida', 'guia.ficha.continente': 'Continente',
  'guia.ficha.tipoArma': 'Tipo de arma', 'guia.ficha.ingenieria': 'Ingeniería', 'guia.ficha.ingenieria2': 'ingeniería',
  'guia.ficha.equipada': 'Equipada', 'guia.ficha.mejorAhora': 'Mejor ahora', 'guia.ficha.siguiente': 'Siguiente',
  'guia.ficha.sinMejoras': 'sin mejoras a la vista', 'guia.ficha.sinDefinir': 'sin definir',
  'guia.ficha.otraManual': 'Otra (dps manual)', 'guia.ficha.manual': 'manual',
  'guia.ficha.captura': 'captura', 'guia.ficha.quitar': 'quitar',
  'guia.rec.yaPodes': '¡ya podés!', 'guia.rec.enNivel': 'en {n} nivel', 'guia.rec.enNiveles': 'en {n} niveles',
  'guia.rec.req': 'req {lvl}',
  'guia.si': 'Sí', 'guia.no': 'No',
  'guia.simc.tuPersonaje': 'Tu personaje — datos reales', 'guia.simc.atributos': 'Atributos primarios:',
  'guia.simc.danoSwing': 'Daño por swing:', 'guia.simc.vel': 'vel', 'guia.simc.armaEquipada': 'Arma equipada',
  'guia.simc.tablaArma': 'tabla (arma sola)', 'guia.simc.manoPrinc': 'Mano princ.', 'guia.simc.manoIzq': 'Mano izq.',
  'guia.simc.aDistancia': 'A distancia',
  'guia.simc.deltaReal': 'El DPS real ({real}) incluye tus stats (AP/gear); la tabla es solo del arma — la diferencia es esperada, no un error de la guía.',
  'guia.simc.noEnTabla': '"{arma}" no está en la tabla de armas — la app usa su DPS real igual.',
  'guia.simc.pet': 'Pet', 'guia.simc.nivel': 'nivel', 'guia.simc.habilidades': 'habilidades',
  'guia.simc.fecha': 'Importado el {fecha}.',
}, {
  'guia.ficha.retrato': 'Portrait of {clase}', 'guia.ficha.nivel': 'level', 'guia.ficha.personaje': 'Your character',
  'guia.ficha.dps': 'Equipped dps', 'guia.ficha.armas': 'Weapons', 'guia.ficha.loot': 'Loot', 'guia.ficha.ruta': 'Route',
  'guia.ficha.real': 'Real character · SimC', 'guia.ficha.vida': 'Health',
  'guia.ficha.talento': 'Talent', 'guia.ficha.prefArma': 'Preferred weapon', 'guia.ficha.continente': 'Continent',
  'guia.ficha.tipoArma': 'Weapon type', 'guia.ficha.ingenieria': 'Engineering', 'guia.ficha.ingenieria2': 'engineering',
  'guia.ficha.equipada': 'Equipped', 'guia.ficha.mejorAhora': 'Best now', 'guia.ficha.siguiente': 'Next',
  'guia.ficha.sinMejoras': 'no upgrades in sight', 'guia.ficha.sinDefinir': 'not set',
  'guia.ficha.otraManual': 'Other (manual dps)', 'guia.ficha.manual': 'manual',
  'guia.ficha.captura': 'screenshot', 'guia.ficha.quitar': 'remove',
  'guia.rec.yaPodes': 'ready!', 'guia.rec.enNivel': 'at level {n}', 'guia.rec.enNiveles': 'at level {n}',
  'guia.rec.req': 'req {lvl}',
  'guia.si': 'Yes', 'guia.no': 'No',
  'guia.simc.tuPersonaje': 'Your character — real data', 'guia.simc.atributos': 'Primary attributes:',
  'guia.simc.danoSwing': 'Damage per swing:', 'guia.simc.vel': 'speed', 'guia.simc.armaEquipada': 'Equipped weapon',
  'guia.simc.tablaArma': 'table (weapon alone)', 'guia.simc.manoPrinc': 'Main hand', 'guia.simc.manoIzq': 'Off hand',
  'guia.simc.aDistancia': 'Ranged',
  'guia.simc.deltaReal': 'The real dps ({real}) includes your stats (AP/gear); the table is weapon-only — the difference is expected, not a guide error.',
  'guia.simc.noEnTabla': '"{arma}" is not in the weapon table — the app uses its real dps anyway.',
  'guia.simc.pet': 'Pet', 'guia.simc.nivel': 'level', 'guia.simc.habilidades': 'abilities',
  'guia.simc.fecha': 'Imported on {fecha}.',
})

export const P = {
  dung: { background: C.tarjeta, border: `1px solid ${C.borde}`, borderRadius: 8, marginBottom: 9, overflow: 'hidden' },
  resumen: { cursor: 'pointer', listStyle: 'none', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10,
    userSelect: 'none', color: C.texto, fontSize: 13 },
  flecha: { color: C.naranja, fontSize: 10, flexShrink: 0, display: 'inline-block', transition: 'transform .2s' },
  dname: { fontWeight: 600, color: C.texto, fontSize: 13.5 },
  dmeta: { color: C.texto3, fontSize: 11.5, marginLeft: 4 },
  dprog: { marginLeft: 'auto', fontSize: 11, color: C.texto3, flexShrink: 0 },
  dprogFull: { color: C.verde },
  dloot: { padding: '4px 14px 12px', borderTop: `1px solid ${C.borde}` },
  inrange: { borderLeft: `3px solid ${C.verde}` },
  mst: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', borderBottom: `1px dashed ${C.borde2}`, fontSize: 13 },
  mstUlt: { borderBottom: 'none' },
  mstLvl: { minWidth: 32, color: C.amarillo, fontWeight: 700, textAlign: 'right', flexShrink: 0 },
  mstTxt: { paddingTop: 1, color: C.texto2, fontSize: 12.5 },
  tdot: { width: 8, height: 8, background: C.amarillo, transform: 'rotate(45deg)', margin: '7px 2px 0 0', flexShrink: 0, borderRadius: 1, opacity: .85 },
  loot: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '5px 0',
    borderBottom: `1px dashed ${C.borde2}` },
  lootSinBorde: { borderBottom: 'none' },
  lootOwn: { opacity: .4 },
  weapline: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0',
    borderBottom: `1px dashed ${C.borde2}` },
  weaplineUlt: { borderBottom: 'none' },
  weapname: { fontWeight: 600 },
  weapsrc: { color: C.texto3, fontSize: 11.5, marginTop: 2 },
  delta: { color: C.verde, fontSize: 11 },
  deltaNeg: { color: C.texto3 },
  prog: { height: 7, background: C.fondo3, border: `1px solid ${C.borde2}`, borderRadius: 4, overflow: 'hidden', margin: '8px 0 4px' },
  progBar: { display: 'block', height: '100%', background: `linear-gradient(90deg, ${C.naranja}, ${C.amarillo})`, transition: 'width .3s' },
  bandhead: { fontFamily: 'Georgia,serif', color: C.amarillo, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
    margin: '14px 0 6px', borderBottom: `1px solid ${C.borde2}`, paddingBottom: 4, display: 'flex', justifyContent: 'space-between' },
  bandheadZn: { color: C.texto3, fontFamily: 'inherit', textTransform: 'none', letterSpacing: 0, fontSize: 11.5 },
  zonaBig: { fontSize: 16.5, color: C.texto, fontWeight: 600 },
  muted: { color: C.texto3, fontSize: 12.5 },
  tip: { color: C.texto2, fontSize: 12 },
  tablaScroll: { maxWidth: '100%', overflowX: 'auto' },
  trPar: { background: 'transparent' },
  trOwned: { opacity: .42 },
  trEq: { background: C.acento + '14' },
  // teclado / macros
  kbwrap: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 230px', gap: 14, marginTop: 10 },
  kb: { display: 'flex', flexDirection: 'column', gap: 6 },
  kbrow: { display: 'flex', gap: 6 },
  kcoff: { flex: '0 0 auto' },
  kcBase: { flex: '0 0 calc((100% - 36px)/7)', minWidth: 0, height: 80, display: 'flex', flexDirection: 'column',
    alignItems: 'flex-start', gap: 2, padding: '6px 7px', borderRadius: 7, border: `1px solid ${C.borde2}`,
    borderBottomWidth: 3, background: C.fondo3, color: C.texto, textAlign: 'left', font: 'inherit',
    position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: 'transform .12s, border-color .12s' },
  kcReady: { borderColor: C.verde, background: C.fondo3 },
  kcSpell: { borderColor: C.amarillo },
  kcSoon: { borderStyle: 'dashed', opacity: .62 },
  kcFree: { opacity: .3 },
  kcMove: { opacity: .3, background: C.fondo2, borderStyle: 'dotted' },
  kk: { font: `700 13px Georgia,serif`, color: C.amarillo, lineHeight: 1 },
  km: { position: 'absolute', top: 6, right: 7, fontSize: 9, color: C.amarillo, letterSpacing: '.3px' },
  kn: { fontSize: 11, lineHeight: 1.2, marginTop: 'auto', display: '-webkit-box', WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  ks: { fontSize: 9, color: C.texto3, textTransform: 'uppercase', letterSpacing: '.5px' },
  ksReady: { color: C.verde },
  ksSpell: { color: C.amarillo },
  ksSoon: { color: C.amarillo },
  mouse: { background: C.fondo2, border: `1px solid ${C.borde2}`, borderRadius: 8, padding: 8, display: 'flex',
    flexDirection: 'column', gap: 6 },
  mt: { fontFamily: 'Georgia,serif', fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', color: C.amarillo, padding: '0 2px' },
  mrow: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', borderRadius: 6,
    border: `1px solid ${C.borde2}`, background: C.fondo3, color: C.texto, font: 'inherit', fontSize: 12,
    textAlign: 'left', cursor: 'pointer' },
  mrowMk: { fontSize: 10, color: C.amarillo, background: C.fondo2, border: `1px solid ${C.amarillo}`,
    borderRadius: 9, padding: '1px 7px', whiteSpace: 'nowrap' },
  mrowKs: { marginLeft: 'auto', fontSize: 9, color: C.texto3, textTransform: 'uppercase', letterSpacing: '.5px' },
  legend: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: C.texto3, marginTop: 10 },
  legendI: { display: 'inline-block', width: 10, height: 10, borderRadius: 3, marginRight: 5, verticalAlign: -1, border: `1px solid ${C.borde2}` },
  chipln: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 11.5, color: C.texto3 },
  chipBtn: { background: C.fondo2, border: `1px solid ${C.borde2}`, color: C.texto, borderRadius: 12, padding: '3px 10px',
    font: 'inherit', fontSize: 11.5, cursor: 'pointer' },
  btnMini: { background: 'transparent', border: `1px solid ${C.borde2}`, color: C.texto3, borderRadius: 6,
    padding: '2px 8px', font: 'inherit', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' },
  mcode: { background: C.fondo3, border: `1px solid ${C.borde2}`, borderRadius: 6, padding: '9px 11px', marginTop: 7,
    fontFamily: 'Consolas,"Cascadia Mono",monospace', fontSize: 12, color: C.verde, whiteSpace: 'pre',
    overflowX: 'auto', lineHeight: 1.5 },
  mlen: { marginLeft: 'auto', font: `10.5px Consolas,"Cascadia Mono",monospace`, color: C.texto3 },
  mlenOver: { color: C.rojo, fontWeight: 700 },
  statgrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '4px 16px', marginTop: 10 },
  st: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '3px 0',
    borderBottom: `1px dashed ${C.borde2}` },
  stB: { color: C.texto, fontWeight: 600, textAlign: 'right' },
  // ficha de personaje (versión con variables de tema, no pergamino fijo)
  ficha: { display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 14, alignItems: 'start' },
  fichaEmb: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  fichaPortrait: { position: 'relative', width: '100%', aspectRatio: '4/5', borderRadius: 8, overflow: 'hidden',
    border: `1px solid ${C.borde2}`, background: C.fondo3 },
  fichaCls: { fontFamily: 'Georgia,serif', fontSize: 14.5, color: C.amarillo, letterSpacing: '.4px' },
  fichaLvl: { display: 'flex', alignItems: 'baseline', gap: 5 },
  fichaLvlB: { fontSize: 24, color: C.amarillo, lineHeight: 1, fontFamily: 'Georgia,serif' },
  fichaLvlS: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1.2, color: C.texto3 },
  fichaAvbtns: { display: 'flex', gap: 4, justifyContent: 'center' },
  fichaName: { fontFamily: 'Georgia,serif', fontSize: 18, color: C.texto, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  fichaNameNon: { fontStyle: 'italic', color: C.texto3 },
  fichaSub: { fontSize: 12, color: C.texto3, marginTop: 1 },
  fichaVitals: { display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', marginTop: 9,
    borderTop: `1px solid ${C.borde}`, borderBottom: `1px solid ${C.borde}` },
  fv: { padding: '6px 10px 7px', borderRight: `1px solid ${C.borde2}`, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
  fvUlt: { borderRight: 'none' },
  fl: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.8px', color: C.texto3 },
  fvV: { fontSize: 15.5, color: C.texto, fontWeight: 700, lineHeight: 1.15 },
  fbar: { height: 4, background: C.fondo3, borderRadius: 2, overflow: 'hidden', display: 'block' },
  fbarU: { display: 'block', height: '100%', background: `linear-gradient(90deg, ${C.naranja}, ${C.amarillo})` },
  fichaAttrs: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(118px,1fr))', gap: '6px 14px', marginTop: 9 },
  fa: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
  faB: { fontSize: 12.5, color: C.texto, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  fichaWeap: { display: 'flex', gap: '8px 20px', flexWrap: 'wrap', marginTop: 9, paddingTop: 8, borderTop: `1px dashed ${C.borde}` },
  fw: { display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 12.5, minWidth: 0, flex: '1 1 220px' },
  fwI: { fontStyle: 'normal', color: C.texto3, fontSize: 11.5, whiteSpace: 'nowrap' },
  fichaReal: { display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'baseline', marginTop: 8,
    paddingTop: 7, borderTop: `1px dashed ${C.borde}`, fontSize: 11, color: C.texto3 },
  fichaRealB: { color: C.texto, fontWeight: 600 },
  frItems: { display: 'flex', flexWrap: 'wrap', gap: '4px 16px' },
  // badges / placas
  placaBase: { display: 'inline-flex', alignItems: 'center', fontSize: 10, padding: '2px 8px', borderRadius: 9,
    border: `1px solid ${C.borde2}`, color: C.texto3, marginLeft: 6, whiteSpace: 'nowrap', verticalAlign: 'middle' },
  placaNow: { background: C.verde + '1c', color: C.verde, borderColor: C.verde, fontWeight: 600 },
  placaSoon: { color: C.amarillo, borderColor: C.amarillo },
  placaCat: { color: C.amarillo, borderColor: C.naranja },
  placaEq: { color: C.fondo2, background: C.verde, borderColor: C.verde, fontWeight: 700, marginLeft: 0 },
  placaKey: { color: C.amarillo, borderColor: C.amarillo, fontFamily: 'Consolas,monospace' },
  placaTal: { color: C.morado, borderColor: C.morado },
  placaTalOff: { opacity: .55 },
  placaLocK: { color: C.amarillo, borderColor: C.amarillo },
  placaLocE: { color: C.azul, borderColor: C.azul },
  placaEng: { color: C.naranja, borderColor: C.naranja },
  fold: { borderTop: `1px dashed ${C.borde2}`, marginTop: 9 },
  foldSum: { cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
    color: C.texto3, fontSize: 12, userSelect: 'none' },
  foldBody: { padding: '3px 0 7px' },
}

// Iconos SVG de línea (trazo) — los mismos paths que ICONS de index.html.
const ICONOS = {
  bow: <><path d="M7 3v18" /><path d="M7 3c9 3 13 6 13 9s-4 6-13 9" /><path d="M3.5 12H19M15.5 8.5L19 12l-3.5 3.5" /></>,
  pin: <><path d="M12 21s-6.5-5.2-6.5-10.4a6.5 6.5 0 1 1 13 0C18.5 15.8 12 21 12 21z" /><circle cx="12" cy="10.4" r="2.3" /></>,
  gate: <><path d="M4 21V9l8-6 8 6v12M4 21h16M9 21v-7h6v7" /></>,
  star: <path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />,
  scroll: <><path d="M7 3h11v18l-3-1.8L12 21l-3-1.8L6 21z" /><path d="M9.5 8h6M9.5 12h6" /></>,
  coin: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M9 9.5h6" /></>,
  alert: <><path d="M12 3.5L22 20H2z" /><path d="M12 10v4.5M12 17.5v.01" /></>,
  check: <path d="M4.5 12.5l4.5 4.5L19.5 7" />,
  route: <><path d="M5 5.5h3.5l2 4H19M5 5.5v13m0 0h4M19 9.5v4l-3.5 2-4-2M15.5 15.5l-2-4" /></>,
  skull: <><path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.3 4.3 3 5.4V19a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3.6c1.7-1.1 3-2.9 3-5.4a7 7 0 0 0-7-7z" /><path d="M9 10.5h.01M15 10.5h.01M10.5 18v-2M13.5 18v-2" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  kbd: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></>,
  sword: <><path d="M14.5 17.5L4 7V4h3l10.5 10.5" /><path d="M13 19l6-6" /><path d="M16 16l3 3" /><path d="M19 13l2 2" /></>,
  staff: <><path d="M12 3v18" /><path d="M12 3l-2.5 3M12 3l2.5 3" /><circle cx="12" cy="8" r="1.6" /></>,
}

export function Icono({ n, size = 16, color }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
      strokeLinejoin="round" style={{ width: size, height: size, color, flexShrink: 0 }} aria-hidden="true">
      {ICONOS[n] || ICONOS.star}
    </svg>
  )
}

// <details> plegable con flecha que rota; `abierto` es el estado inicial.
export function Detalle({ titulo, meta, extra, children, abierto, estilo, resumenExtra }) {
  const [open, setOpen] = useState(!!abierto)
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}
      style={{ ...P.dung, ...(open ? { borderColor: C.borde2 } : {}), ...estilo }}>
      <summary style={P.resumen}>
        <span style={{ ...P.flecha, transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
        {titulo != null ? <span style={P.dname}>{titulo}</span> : null}
        {meta != null ? <span style={P.dmeta}>{meta}</span> : null}
        {extra}
        {resumenExtra}
      </summary>
      <div style={P.dloot}>{children}</div>
    </details>
  )
}

// Placa/badge de estado (now/soon/cat/key/tal/loc/eq/eng/plain).
export function Placa({ tono = 'plain', children, title, estilo }) {
  const base = { ...P.placaBase, ...(P['placa' + tono[0].toUpperCase() + tono.slice(1)] || {}) }
  return <span title={title} style={{ ...base, ...estilo }}>{children}</span>
}

export const locPlaca = (cont, lang) => {
  const k = cont === 'K' ? 'Kalimdor' : 'EK'
  return <Placa tono={cont === 'K' ? 'locK' : 'locE'} title={k}>{k}</Placa>
}

// Nombre de arma/ítem con el color de su calidad curada (q: common/uncommon/rare/epic).
const QMAP = { common: 1, uncommon: 2, rare: 3, epic: 4 }
export function NombreCalidad({ q, children, estilo }) {
  return <span style={{ color: CALIDAD[QMAP[q]] || C.texto, ...estilo }}>{children}</span>
}

// Fila de "próxima arma" del recomendador (weapline de index.html).
export function Wline({ w, lvl, dps, tipos, lang, ultimo }) {
  const diff = w.lvl - lvl, dlt = dps ? (w.dps - dps).toFixed(1) : null
  return (
    <div className="weapline" style={{ ...P.weapline, ...(ultimo ? P.weaplineUlt : {}) }}>
      <div>
        <NombreCalidad q={w.q} estilo={P.weapname}>{w.n}</NombreCalidad>{' '}
        <Placa tono="plain" estilo={{ marginLeft: 0 }}>{tipos && (tipos[w.t] || w.t)}</Placa>
        {diff <= 0
          ? <Placa tono="now" estilo={{ marginLeft: 4 }}>{t(lang, 'guia.rec.yaPodes')}</Placa>
          : <Placa tono="soon" estilo={{ marginLeft: 4 }}>{(diff <= 1 ? t(lang, 'guia.rec.enNivel', { n: diff }) : t(lang, 'guia.rec.enNiveles', { n: diff }))}</Placa>}
        <div style={P.weapsrc}>{w.src}{w.note ? <> · <i>{w.note}</i></> : null}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <b>{fmtDps(w)}</b>
        <div style={P.weapsrc}>dps · req {w.lvl}</div>
        {dlt != null ? <div style={dlt > 0 ? P.delta : P.deltaNeg}>+{dlt} vs actual</div> : null}
      </div>
    </div>
  )
}

// Escudo de facción para la ficha (color del tema + inicial).
export function facEscudo(fac, letra) {
  const col = fac === 'alliance' ? C.azul : C.rojo
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 24, height: 24, display: 'block' }}>
      <path d="M12 1.8l8 3.4v6.2c0 5.2-3.4 9.2-8 11-4.6-1.8-8-5.8-8-11V5.2z" fill={col} stroke={C.amarillo} strokeWidth="1.4" />
      <text x="12" y="16.6" textAnchor="middle" fontFamily="Georgia,serif" fontSize="11" fontWeight="700" fill={C.texto}>{letra}</text>
    </svg>
  )
}

// Tonos de piel del retrato procedural: colores cálidos del tema (nunca hex fijos).
const SKINS = [C.naranja, C.amarillo]
function skinDe(simcRace) {
  const k = String(simcRace || '').toLowerCase().replace(/[^a-z]/g, '')
  let h = 0
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return SKINS[k ? h % SKINS.length : 0]
}

// Retrato procedural del personaje (port de charPortrait de index.html, con la
// paleta del tema en vez de hex fijos; el acento de clase viene del dato curado).
export function charRetrato({ G, fac, simcRace, avatar, lang }) {
  if (avatar) return <img src={avatar} alt={t(lang, 'guia.ficha.retrato', { clase: nombreClaseGuia(G, lang) })} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
  const skin = skinDe(simcRace), acc = G.accent || C.amarillo
  const cloak = fac === 'alliance' ? C.azul : C.rojo
  const trim = fac === 'alliance' ? C.azul : C.naranja
  const armor = { hunter: C.naranja, warrior: C.texto3, shaman: C.morado }[G.id] || C.naranja
  const armorD = { hunter: C.texto4, warrior: C.texto4, shaman: C.texto4 }[G.id] || C.texto4
  const gear = {
    hunter: <><path d="M32 52 C26 18 44 2 60 2 C77 2 94 19 88 52 L83 60 C76 47 44 47 37 60 Z" fill={C.texto4} /><path d="M38 50 C36 26 46 12 60 12 C74 12 84 26 82 50" fill="none" stroke={C.texto3} strokeWidth="2" opacity=".55" /></>,
    warrior: <><path d="M37 46 C37 18 46 8 60 8 C74 8 83 18 83 46 L41 46 Z" fill={armor} /><path d="M37 46 C37 18 46 8 60 8 C74 8 83 18 83 46" fill="none" stroke={armorD} strokeWidth="2" /><path d="M40 34 C30 26 24 14 27 4 C36 8 42 18 43 30 Z" fill={skin} /><path d="M80 34 C90 26 96 14 93 4 C84 8 78 18 77 30 Z" fill={skin} /></>,
    shaman: <><path d="M36 40 Q60 31 84 40 L84 47 Q60 38 36 47 Z" fill={C.amarillo} /><path d="M44 36 C38 26 36 16 40 6 M50 34 C48 22 50 12 56 4" stroke={skin} strokeWidth="3.4" fill="none" strokeLinecap="round" /><path d="M76 36 C82 26 84 16 80 6 M70 34 C72 22 70 12 64 4" stroke={skin} strokeWidth="3.4" fill="none" strokeLinecap="round" /><rect x="56" y="30" width="8" height="10" rx="2" fill={skin} opacity=".85" /></>,
  }[G.id] || <path d="M36 48 C34 24 46 12 60 12 C74 12 86 24 84 48 L78 44 C76 32 68 28 60 28 C52 28 44 32 42 44 Z" fill={C.texto4} />
  return (
    <svg viewBox="0 0 120 150" preserveAspectRatio="xMidYMid slice" role="img" aria-label={t(lang, 'guia.ficha.retrato', { clase: nombreClaseGuia(G, lang) })} style={{ width: '100%', height: '100%', display: 'block' }}>
      <defs>
        <linearGradient id={'pbg-' + G.id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={acc} stopOpacity=".18" />
          <stop offset="1" stopColor={C.fondo3} />
        </linearGradient>
      </defs>
      <rect width="120" height="150" fill={'url(#pbg-' + G.id + ')'} />
      <circle cx="60" cy="58" r="46" fill="none" stroke={trim} strokeOpacity=".4" strokeWidth="1.5" strokeDasharray="3 5" />
      <path d="M4 152 C4 104 30 90 60 90 C90 90 116 104 116 152 Z" fill={cloak} />
      <path d="M16 152 C16 112 38 100 60 100 C82 100 104 112 104 152 Z" fill={armor} />
      <path d="M16 152 C16 112 38 100 60 100 C82 100 104 112 104 152" fill="none" stroke={armorD} strokeWidth="2" opacity=".7" />
      <path d="M52 84 h16 v14 c0 5 -16 5 -16 0 z" fill={skin} />
      <ellipse cx="60" cy="54" rx="25" ry="30" fill={skin} />
      <ellipse cx="35" cy="56" rx="4" ry="7" fill={skin} /><ellipse cx="85" cy="56" rx="4" ry="7" fill={skin} />
      <circle cx="50" cy="56" r="2.8" fill={C.texto4} /><circle cx="70" cy="56" r="2.8" fill={C.texto4} />
      <path d="M45 48 q5 -2.5 9 -.5 M66 48 q5 -2 9 .5" stroke={C.texto4} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M59 60 q2 4 -1 7" stroke={C.texto3} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {gear}
      <g transform="translate(82,104) scale(1.5)" fill="none" stroke={trim} strokeOpacity=".85" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {ICONOS[G.icon] || ICONOS.star}
      </g>
    </svg>
  )
}

// Una vital de la ficha: etiqueta, valor y barra de progreso opcional.
function Vital({ label, valor, barra, ultimo }) {
  return (
    <div style={{ ...P.fv, ...(ultimo ? P.fvUlt : {}) }}>
      <span style={P.fl}>{label}</span>
      <b style={P.fvV}>{valor}</b>
      {barra != null ? <i style={P.fbar}><span style={{ ...P.fbarU, width: Math.max(0, Math.min(100, barra * 100)).toFixed(1) + '%' }} /></i> : null}
    </div>
  )
}

// Ficha de personaje (portada del recomendador): identidad, vitales, atributos
// del build y armas — todo sale de state + la guía activa.
export function Ficha({ v, lang }) {
  const { G, GF, fac, lvl, build, os, dps, cands, onAvatar, onAvatarDel } = v
  const specN = G.specs[build.spec] || build.spec
  const prefP = (G.prefs || []).find((p) => p[0] === build.pref)
  const wCur = build.cur === 'other' ? null : (GF.weapons || []).find((w) => w.id === build.cur)
  const wTot = (GF.weapons || []).length
  const wOwn = (GF.weapons || []).reduce((n, w) => n + (os.has(w.id) ? 1 : 0), 0)
  const lootTot = (G.dungeons || []).reduce((n, d) => n + ((d.loot || []).length), 0)
  const lootN = v.gs.size
  const mileTot = (GF.milestones || []).length, mileN = v.ss.size
  const avail = cands.filter((w) => w.lvl <= lvl).sort((a, b) => b.dps - a.dps)
  const next = cands.filter((w) => w.lvl > lvl).sort((a, b) => a.lvl - b.lvl || b.dps - a.dps)
  const pick = avail[0] || next[0] || null
  const wName = build.cur === 'other' ? t(lang, 'guia.ficha.otraManual') : (wCur ? wCur.n : t(lang, 'guia.ficha.sinDefinir'))
  const wType = wCur ? (G.types[wCur.t] || wCur.t) : (build.cur === 'other' ? t(lang, 'guia.ficha.manual') : '—')
  const facLabel = v.facLabel || fac
  const attrs = [
    [t(lang, 'guia.ficha.talento'), specN],
    [t(lang, 'guia.ficha.prefArma'), prefP ? prefP[1] : '—'],
    [t(lang, 'guia.ficha.continente'), v.realmLabel],
    [t(lang, 'guia.ficha.tipoArma'), wType],
  ]
  if (G.useEng) attrs.push([t(lang, 'guia.ficha.ingenieria'), build.eng ? t(lang, 'guia.si') : t(lang, 'guia.no')])
  const vit = simcVitals(build.simc && build.simc.stats ? build.simc.stats : null)
  const realChips = vit ? (() => {
    const it = []
    if (vit.hp != null) it.push([t(lang, 'guia.ficha.vida'), vit.hp])
    vit.powers.forEach((p) => it.push(p))
    vit.attrs.forEach((a) => it.push(a))
    if (vit.dpsChar != null) it.push(['DPS', vit.dpsChar.toFixed(1)])
    return it
  })() : []
  const dpsTxt = dps ? dps.toFixed(1) + (wCur && wCur.approx ? '~' : '') : '—'
  return (
    <div className="ficha" style={P.ficha}>
      <div style={P.fichaEmb}>
        <div style={P.fichaPortrait}>
          {charRetrato({ G, fac, simcRace: build.simc && build.simc.race, avatar: build.avatar, lang })}
          <span style={{ position: 'absolute', right: 5, bottom: 5, width: 26, height: 26, borderRadius: '50%',
            background: C.fondo2, border: `1px solid ${C.borde2}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: G.accent || C.amarillo }}>
            <Icono n={G.icon} size={15} />
          </span>
        </div>
        <div style={P.fichaCls}>{nombreClaseGuia(G, lang)}</div>
        <div className="ficha-lvl" style={P.fichaLvl}><b style={P.fichaLvlB}>{lvl}</b><span style={P.fichaLvlS}>{t(lang, 'guia.ficha.nivel')}</span></div>
        <div title={facLabel} style={{ lineHeight: 0 }}>{facEscudo(fac, facLabel.charAt(0).toUpperCase())}</div>
        <div style={P.fichaAvbtns}>
          <button type="button" style={P.btnMini} onClick={onAvatar} title={t(lang, 'guia.ficha.capturaAyuda')}>{t(lang, 'guia.ficha.captura')}</button>
          {build.avatar ? <button type="button" style={P.btnMini} onClick={onAvatarDel} title={t(lang, 'guia.ficha.quitarAyuda')}>{t(lang, 'guia.ficha.quitar')}</button> : null}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div><span style={{ ...P.fichaName, ...(build.name ? {} : P.fichaNameNon) }}>{build.name || t(lang, 'guia.ficha.personaje')}</span></div>
        <div style={P.fichaSub}><TextoRico html={G.title} /> · {facLabel}</div>
        <div style={P.fichaVitals}>
          <Vital label={t(lang, 'guia.ficha.dps')} valor={dpsTxt} ultimo={false} />
          <Vital label={t(lang, 'guia.ficha.armas')} valor={`${wOwn}/${wTot}`} barra={wTot ? wOwn / wTot : null} />
          <Vital label={t(lang, 'guia.ficha.loot')} valor={lootN} barra={lootTot ? lootN / lootTot : null} />
          <Vital label={t(lang, 'guia.ficha.ruta')} valor={`${mileN}/${mileTot}`} barra={mileTot ? mileN / mileTot : null} ultimo />
        </div>
        {vit && realChips.length ? (
          <div style={P.fichaReal}>
            <span style={P.fl}>{t(lang, 'guia.ficha.real')}</span>
            <span style={P.frItems}>
              {realChips.map(([l, val], i) => <span key={i}>{l} <b style={P.fichaRealB}>{val}</b></span>)}
            </span>
          </div>
        ) : null}
        <div style={P.fichaAttrs}>
          {attrs.map(([l, val]) => <div key={l} style={P.fa}><span style={P.fl}>{l}</span><b style={P.faB}>{val}</b></div>)}
        </div>
        <div style={P.fichaWeap}>
          <div style={P.fw}><span style={P.fl}>{t(lang, 'guia.ficha.equipada')}</span><b style={P.faB}>{wName}</b><i style={P.fwI}>{dps ? dps.toFixed(1) + ' dps' : '—'}</i></div>
          <div style={P.fw}><span style={P.fl}>{avail.length ? t(lang, 'guia.ficha.mejorAhora') : t(lang, 'guia.ficha.siguiente')}</span>
            <b style={P.faB}>{pick ? pick.n : '—'}</b>
            <i style={P.fwI}>{pick ? `${fmtDps(pick)} dps · ${pick.lvl <= lvl ? t(lang, 'guia.rec.yaPodes') : t(lang, 'guia.rec.req', { lvl: pick.lvl })}` : t(lang, 'guia.ficha.sinMejoras')}</i></div>
        </div>
      </div>
    </div>
  )
}

// Tarjeta del personaje real importado de /simc (port de simcCard de index.html).
export function SimcCard({ simc, G, lang }) {
  if (!simc || typeof simc !== 'object') return null
  const st = simc.stats || {}
  const helpers = simcHelpers(st)
  const row = (label, val) => (val == null || val === '' ? null : <div key={label} style={P.st}><span style={P.muted}>{label}</span><b style={P.stB}>{val}</b></div>)
  const vit = simcVitals(st)
  const SLOT_LBL = { main_hand: t(lang, 'guia.simc.manoPrinc'), off_hand: t(lang, 'guia.simc.manoIzq'), ranged: t(lang, 'guia.simc.aDistancia') }
  const slots = Object.keys(simc.slots || {}).map((sl) => [SLOT_LBL[sl] || sl, simc.slots[sl]]).filter((x) => x[1].range)
  const w = simc.weapon
  const real = w && w.dps
  const delta = real != null && w && w.match ? real - w.match.dps : null
  const rows = G.simc && G.simc.rows ? G.simc.rows(helpers) : []
  const fecha = simc.ts ? new Date(simc.ts).toLocaleDateString(lang === 'en' ? 'en' : 'es') : ''
  const p = simc.pet || {}
  const hab = p.pet_abilities ? p.pet_abilities.split('/').filter(Boolean).length : 0
  const pvp = /pvp/i.test(simc.server || '') ? 'PvP' : null
  const meta = [simc.level ? `lvl ${simc.level}` : null, simc.race, simc.server, simc.region, pvp, simc.role,
    simc.eng ? t(lang, 'guia.ficha.ingenieria2') : null].filter(Boolean)
  const sum = [simc.level ? `lvl ${simc.level}` : null,
    w ? (w.name || 'arma') + (w.dps != null ? ' · ' + w.dps.toFixed(1) + ' dps' : '') : null, simc.race].filter(Boolean).join(' · ')
  return (
    <Detalle titulo={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icono n="scroll" size={14} />{t(lang, 'guia.simc.tuPersonaje')}</span>}
      meta={<span style={P.dmeta}>{sum}</span>}>
      <div style={{ paddingTop: 4 }}>
        {vit ? (
          <>
            {(() => {
              const vrows = []
              if (vit.hp != null) vrows.push([t(lang, 'guia.ficha.vida'), vit.hp])
              vit.powers.forEach((pp) => vrows.push(pp))
              if (vit.dpsChar != null) vrows.push(['DPS', vit.dpsChar.toFixed(1)])
              return vrows.length ? <div style={P.statgrid}>{vrows.map((r) => row(r[0], r[1]))}</div> : null
            })()}
            {vit.attrs.length ? <div style={{ ...P.muted, marginTop: 8 }}><b style={{ color: C.amarillo }}>{t(lang, 'guia.simc.atributos')}</b></div> : null}
            {vit.attrs.length ? <div style={P.statgrid}>{vit.attrs.map((r) => row(r[0], r[1]))}</div> : null}
          </>
        ) : null}
        {slots.length ? (
          <>
            <div style={{ ...P.muted, marginTop: 8 }}><b style={{ color: C.amarillo }}>{t(lang, 'guia.simc.danoSwing')}</b></div>
            <div style={P.statgrid}>
              {slots.map(([l, ww]) => (
                <div key={l} style={P.st}><span style={P.muted}>{l} — {ww.name || '?'}</span>
                  <b style={P.stB}>{ww.range.min.toFixed(1)}–{ww.range.mx.toFixed(1)} · {ww.range.spd.toFixed(2)} {t(lang, 'guia.simc.vel')}</b></div>
              ))}
            </div>
          </>
        ) : null}
        {w ? (
          <div style={{ ...P.statgrid, marginTop: 8 }}>
            <div style={{ ...P.st, gridColumn: '1/-1' }}><span style={P.muted}>{t(lang, 'guia.simc.armaEquipada')}</span>
              <b style={{ ...P.stB, color: C.verde }}>{w.name || 'arma'} · {real != null ? real.toFixed(1) + ' dps' : '?'}</b></div>
            {w.match ? row(t(lang, 'guia.simc.tablaArma'), w.match.dps.toFixed(1) + ' dps' + (w.match.approx ? ' ~' : '')) : null}
            {delta != null && Math.abs(delta) >= 0.3 ? (
              <div style={{ ...P.muted, gridColumn: '1/-1', fontSize: 11.5 }}>
                {t(lang, 'guia.simc.deltaReal', { real: real.toFixed(1) })}
              </div>
            ) : null}
            {!w.match && w.name ? (
              <div style={{ ...P.muted, gridColumn: '1/-1', fontSize: 11.5 }}>{t(lang, 'guia.simc.noEnTabla', { arma: w.name })}</div>
            ) : null}
          </div>
        ) : null}
        {rows.filter((r) => r[1] != null && r[1] !== '').length ? (
          <div style={P.statgrid}>{rows.filter((r) => r[1] != null && r[1] !== '').map((r) => row(r[0], r[1]))}</div>
        ) : null}
        {G.simc && G.simc.pet && (p.pet_family || p.pet_happiness) ? (
          <div style={{ ...P.muted, marginTop: 8 }}>
            <b style={{ color: C.verde }}>{t(lang, 'guia.simc.pet')}:</b> {p.pet_family || '?'} · {t(lang, 'guia.simc.nivel')} {p.pet_level || '?'} · {petHappyText(p.pet_happiness)}
            {hab ? ` · ${hab} ${t(lang, 'guia.simc.habilidades')}` : ''}
          </div>
        ) : null}
        {meta.length ? <div style={{ ...P.chipln, marginTop: 8 }}>{meta.map((x) => <Placa key={x} tono="plain" estilo={{ marginLeft: 0 }}>{x}</Placa>)}</div> : null}
        {simc.professions && simc.professions.length ? (
          <div style={{ ...P.chipln, marginTop: 4 }}>
            {simc.professions.map((pp, i) => <Placa key={i} tono="plain" estilo={{ marginLeft: 0 }}>{pp[0]}{pp[1] != null ? ' ' + pp[1] : ''}</Placa>)}
          </div>
        ) : null}
        <div style={{ ...P.muted, marginTop: 8 }}>{t(lang, 'guia.simc.fecha', { fecha })}</div>
      </div>
    </Detalle>
  )
}
