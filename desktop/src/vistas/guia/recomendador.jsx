// Recomendador (viewRec de index.html): ficha del personaje, avisos del
// recomendador por facción (recExtra), dónde levelear, próximas armas,
// dungeons en rango y hitos cercanos.
import { C, S } from '../../estilos.js'
import { t, agregarTextos } from '../../i18n.js'
import { Origen, Tarjeta, TextoRico } from '../../ui.jsx'
import { fmtDps } from '../../guia-logica.js'
import { Detalle, Ficha, Icono, locPlaca, NombreCalidad, Placa, P, Wline } from './piezas.jsx'

agregarTextos({
  'guia.rec.donde': 'Dónde levelear ahora',
  'guia.rec.rango': 'rango {min}-{max} · {realm}',
  'guia.rec.despues': '▶ Después ({min}+):',
  'guia.rec.dungeonsLbl': 'Dungeons:',
  'guia.rec.recomendaciones': 'Recomendaciones de la guía',
  'guia.rec.proximas': 'Tus próximas armas',
  'guia.rec.subTodos': 'todos los tipos',
  'guia.rec.subSolo': 'solo {tipo}',
  'guia.rec.conIng': '+ingeniería',
  'guia.rec.nadaPre': 'Estás en territorio pre-raid — apuntá a raids o al farm solo de DM East.',
  'guia.rec.nadaSub': 'Subí unos niveles y revisá de nuevo.',
  'guia.rec.disponibles': 'Disponibles ya:',
  'guia.rec.proxLista': 'Próximas:',
  'guia.rec.mas': 'Y {n} más',
  'guia.rec.mejoras': 'Mejoras a futuro',
  'guia.rec.dgnRango': 'Dungeons en tu rango',
  'guia.rec.abrirLoot': 'abre para ver el loot',
  'guia.rec.items': '{n} ítems',
  'guia.rec.clave': 'CLAVE',
  'guia.rec.disponible': 'disponible',
  'guia.rec.yaPasada': 'ya pasada',
  'guia.rec.hitos': 'Hitos cercanos',
  'guia.rec.hitosSub': '{n} hitos · {min} a {max}',
  'guia.rec.footer': 'Armas y pasos se tildan en sus pestañas — el recomendador descuenta lo que ya tenés.',
  'guia.rec.warnMejor': 'Tenés un arma mejor sin equipar',
  'guia.rec.mejorResto': 'está en tu inventario y supera a tu arma actual ({actual}).',
}, {
  'guia.rec.donde': 'Where to level now',
  'guia.rec.rango': 'range {min}-{max} · {realm}',
  'guia.rec.despues': '▶ Next ({min}+):',
  'guia.rec.dungeonsLbl': 'Dungeons:',
  'guia.rec.recomendaciones': 'Guide recommendations',
  'guia.rec.proximas': 'Your next weapons',
  'guia.rec.subTodos': 'all types',
  'guia.rec.subSolo': '{tipo} only',
  'guia.rec.conIng': '+engineering',
  'guia.rec.nadaPre': 'You are in pre-raid territory — aim for raids or DM East solo farm.',
  'guia.rec.nadaSub': 'Level up a bit and check again.',
  'guia.rec.disponibles': 'Available now:',
  'guia.rec.proxLista': 'Upcoming:',
  'guia.rec.mas': 'And {n} more',
  'guia.rec.mejoras': 'Future upgrades',
  'guia.rec.dgnRango': 'Dungeons in your range',
  'guia.rec.abrirLoot': 'open for loot',
  'guia.rec.items': '{n} items',
  'guia.rec.clave': 'KEY',
  'guia.rec.disponible': 'available',
  'guia.rec.yaPasada': 'past',
  'guia.rec.hitos': 'Nearby milestones',
  'guia.rec.hitosSub': '{n} milestones · {min} to {max}',
  'guia.rec.footer': 'Weapons and steps are checked in their tabs — the advisor discounts what you already have.',
  'guia.rec.warnMejor': 'You own a better weapon you are not using',
  'guia.rec.mejorResto': 'is in your inventory and beats your current weapon ({actual}).',
})

const LOC_HTML = { K: 'Kalimdor', E: 'EK' }

export function VistaRec({ v, lang }) {
  const { G, GF, lvl, build, os, ss, dps, cands, ownedBetter, dungs, miles, band, nextBand,
    realmLabel, tipos } = v

  // Recomendaciones extra de la facción (HTML curado → TextoRico).
  // Mismos argumentos que index.html; icon:()=>'' porque <svg> no pasa la lista blanca.
  const recHtml = GF.recExtra
    ? GF.recExtra({ state: build, G, GF, lvl, os, dps, icon: () => '', locBadge: (c) => `<b>${LOC_HTML[c] || c}</b>` })
    : ''

  // Subtítulo de "próximas armas": el filtro de tipo/preferencia activo.
  const prefP = (G.prefs || []).find((p) => p[0] === build.pref)
  const subTipos = build.pref === 'any' ? t(lang, 'guia.rec.subTodos') : t(lang, 'guia.rec.subSolo', { tipo: (prefP ? prefP[1] : build.pref).toLowerCase() })
  const subArmas = `${subTipos}${build.eng ? ' · ' + t(lang, 'guia.rec.conIng') : ''}`

  // Candidatas: disponibles ya (top 4 por dps), próximas (top 3 si no hay disponibles),
  // y el resto plegado — igual que viewRec.
  const availL = cands.filter((w) => w.lvl <= lvl).sort((a, b) => b.dps - a.dps)
  const nextL = cands.filter((w) => w.lvl > lvl)
  const availShow = availL.slice(0, 4)
  const nextShow = availL.length ? [] : nextL.slice(0, 3)
  const nextFold = availL.length ? nextL : nextL.slice(3)
  const foldLabel = availL.length ? t(lang, 'guia.rec.mejoras') : t(lang, 'guia.rec.mas', { n: nextFold.length })

  const wline = (w, ultimo) => <Wline key={w.id} w={w} lvl={lvl} dps={dps} tipos={tipos} lang={lang} ultimo={ultimo} />

  return (
    <>
      <Tarjeta titulo={t(lang, 'guia.ficha.personaje')} extra={<Origen f="curado" lang={lang} />}>
        <Ficha v={v} lang={lang} />
      </Tarjeta>

      {ownedBetter ? (
        <Tarjeta titulo={t(lang, 'guia.rec.warnMejor')} estilo={{ borderLeft: `3px solid ${C.amarillo}` }}
          extra={<Origen f="curado" lang={lang} />}>
          <div><NombreCalidad q={ownedBetter.q}>{ownedBetter.n}</NombreCalidad> ({fmtDps(ownedBetter)} dps) {t(lang, 'guia.rec.mejorResto', { actual: dps.toFixed(1) })}</div>
        </Tarjeta>
      ) : null}

      {recHtml ? (
        <Tarjeta titulo={t(lang, 'guia.rec.recomendaciones')} extra={<Origen f="curado" lang={lang} />}>
          <TextoRico html={recHtml} />
        </Tarjeta>
      ) : null}

      {band ? (
        <Tarjeta estilo={{ borderLeft: `3px solid ${C.acento}` }} titulo={t(lang, 'guia.rec.donde')} extra={<Origen f="curado" lang={lang} />}>
          <div style={S.sub}>{t(lang, 'guia.rec.rango', { min: band.min, max: band.max, realm: realmLabel })}</div>
          <div style={P.zonaBig}>{band.zones}</div>
          {band.notes ? <div style={{ ...P.tip, marginTop: 6 }}><TextoRico html={band.notes} /></div> : null}
          {band.dung ? <div style={{ ...P.tip, marginTop: 4 }}><b style={{ color: C.amarillo }}>{t(lang, 'guia.rec.dungeonsLbl')}</b> <TextoRico html={band.dung} /></div> : null}
          {nextBand ? <div style={{ ...P.tip, marginTop: 6 }}>{t(lang, 'guia.rec.despues', { min: nextBand.min })} <b>{nextBand.zones}</b></div> : null}
        </Tarjeta>
      ) : null}

      <Tarjeta estilo={{ borderLeft: `3px solid ${C.amarillo}` }} titulo={t(lang, 'guia.rec.proximas')} extra={<>
        <span style={{ ...P.muted, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>{subArmas}</span>
        <Origen f="curado" lang={lang} />
      </>}>
        {!cands.length ? (
          <div style={P.muted}>{dps >= 29 ? t(lang, 'guia.rec.nadaPre') : t(lang, 'guia.rec.nadaSub')}</div>
        ) : (<>
          {availShow.length ? <div style={{ ...P.muted, marginBottom: 2 }}>{t(lang, 'guia.rec.disponibles')}</div> : null}
          {availShow.map((w, i) => wline(w, i === availShow.length - 1 && !nextShow.length && !nextFold.length))}
          {nextShow.length ? <div style={{ ...P.muted, margin: '8px 0 2px' }}>{t(lang, 'guia.rec.proxLista')}</div> : null}
          {nextShow.map((w, i) => wline(w, i === nextShow.length - 1))}
          {nextFold.length ? (
            <Detalle titulo={foldLabel} meta={`(${nextFold.length})`} abierto={false}>
              {nextFold.map((w, i) => wline(w, i === nextFold.length - 1))}
            </Detalle>
          ) : null}
        </>)}
      </Tarjeta>

      {dungs.length ? (<>
        <div style={P.bandhead}>
          <span>{t(lang, 'guia.rec.dgnRango')}</span>
          <span style={P.bandheadZn}>{dungs.length} · {t(lang, 'guia.rec.abrirLoot')}</span>
        </div>
        {dungs.map((d) => {
          const soon = lvl < d.r[0], late = lvl > d.r[1], inR = !soon && !late
          const diff = d.r[0] - lvl
          return (
            <Detalle key={d.n} abierto={false}
              estilo={inR ? { borderLeft: `3px solid ${C.verde}` } : {}}
              titulo={d.n}
              meta={`${d.loc} · ${d.r[0]}-${d.r[1]}`}
              extra={<>
                {locPlaca(d.cont, lang)}
                {d.key ? <Placa tono="now">{t(lang, 'guia.rec.clave')}</Placa> : null}
                {soon
                  ? <Placa tono="soon">{diff <= 1 ? t(lang, 'guia.rec.enNivel', { n: diff }) : t(lang, 'guia.rec.enNiveles', { n: diff })}</Placa>
                  : late ? <Placa tono="plain">{t(lang, 'guia.rec.yaPasada')}</Placa> : <Placa tono="now">{t(lang, 'guia.rec.disponible')}</Placa>}
                <span style={{ ...P.dprog, marginLeft: 'auto' }}>{t(lang, 'guia.rec.items', { n: (d.loot || []).length })}</span>
                <Origen f="curado" lang={lang} />
              </>}>
              {d.note ? <div style={{ ...P.muted, marginBottom: 6 }}><TextoRico html={d.note} /></div> : null}
              {(d.loot || []).map((l, i) => (
                <div key={i} style={{ ...P.loot, ...(i === (d.loot || []).length - 1 ? P.lootSinBorde : {}) }}>
                  <span><NombreCalidad q="rare">{l[0]}</NombreCalidad> <span style={P.muted}>— <TextoRico html={l[1]} /></span></span>
                </div>
              ))}
            </Detalle>
          )
        })}
      </>) : null}

      {miles.length ? (
        <Detalle titulo={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icono n="route" size={14} />{t(lang, 'guia.rec.hitos')}</span>}
          meta={t(lang, 'guia.rec.hitosSub', { n: miles.length, min: lvl - 2, max: lvl + 10 })}
          extra={<Origen f="curado" lang={lang} />}>
          {miles.map(({ m, i }) => {
            const k = m.lvl + '|' + i, done = ss.has(k)
            return (
              <div key={k} style={{ ...P.mst, ...(i === miles.length - 1 ? P.mstUlt : {}), ...(done ? { opacity: .45 } : {}) }}>
                <span style={P.mstLvl}>{m.lvl}</span>
                <span style={P.mstTxt}>
                  <Placa tono="cat" estilo={{ marginLeft: 0 }}>{m.cat}</Placa>{' '}
                  {m.loc ? locPlaca(m.loc, lang) : null} <TextoRico html={m.txt} />
                </span>
              </div>
            )
          })}
        </Detalle>
      ) : null}

      <div style={P.tip}>{t(lang, 'guia.rec.footer')}</div>
    </>
  )
}
