// Legacy — puntos de cuenta, perks, challenges y track de recolección.
// Port de viewLegacy de standalone/index.html. Disponible para TODO personaje:
// la clase que se resalta es la del perfil (nombre localizado), el nivel y la
// facción también salen del perfil; las profesiones se cruzan con build.farm.
import { D, LEGACY, nombre } from '../datos.js'
import { C } from '../estilos.js'
import { t, agregarTextos } from '../i18n.js'
import { Origen, Tarjeta, TextoRico } from '../ui.jsx'
import { leerBuild, normalizeFarm, validLevel } from '../guia-logica.js'
import { Detalle, Icono, P, Placa } from './guia/piezas.jsx'

agregarTextos({
  'guia.leg.titulo': 'Legacy — puntos de cuenta',
  'guia.leg.sub': 'WoW: Forever · 65 pts ganables · 16 por personaje',
  'guia.leg.desbloqueadoPre': 'A nivel {lvl} el panel ya debería estar desbloqueado si algún personaje de la cuenta pasó de 25 — ábrelo con',
  'guia.leg.desbloqueadoPost': '(Options → Keybindings).',
  'guia.leg.proximos': 'Tus próximos puntos',
  'guia.leg.aNivel': 'a nivel {lvl} · {clase}',
  'guia.leg.sinClase': 'tu clase',
  'guia.leg.hitosClase': '— hitos de clase (1 pt c/u, primera vez)',
  'guia.leg.nivel': 'nivel {m}',
  'guia.leg.yaGanado': ' · ya deberías tenerlo ganado',
  'guia.leg.teFalta': ' · te falta',
  'guia.leg.spelunker': 'Spelunker',
  'guia.leg.spelunkerD': 'sets de dungeons por tier (3 pts)',
  'guia.leg.oficios': 'Oficios de craft',
  'guia.leg.oficiosD': '150/225/300 skill = 1 pt c/u (solo los 6 crafts)',
  'guia.leg.pvp': 'PvP',
  'guia.leg.pvpD': 'rangos de honor + reputaciones BG + Field of Honor (12 pts)',
  'guia.leg.raids': 'Raids',
  'guia.leg.raidsD': 'Hyjal Summit · Barrow Deeps · Onyxia (3 pts, lvl 60)',
  'guia.leg.aventura': 'Aventura',
  'guia.leg.aventuraD': 'Valthalak (BRM) + Explore Azeroth (2 pts)',
  'guia.leg.notaBaja': 'El panel se abre al llegar a nivel 25 — los puntos se acumulan igual a nivel cuenta. Recolección <b>no</b> da puntos directos; alimenta el árbol Professions (ver abajo).',
  'guia.leg.notaAlta': 'A nivel {lvl}: revisá el panel (Y) — los hitos de clase ya cumplidos deberían figurar como ganados. Recolección <b>no</b> da puntos directos; alimenta el árbol Professions (ver abajo).',
  'guia.leg.progress': 'Progress Track',
  'guia.leg.progressSub': 'recompensas por puntos ganados (cuenta)',
  'guia.leg.challenges': 'Legacy Challenges',
  'guia.leg.loQuePaga': 'lo que paga puntos',
  'guia.leg.ranks': '{n} ranks',
  'guia.leg.req': 'req:',
  'guia.leg.recoleccion': 'Recolección y Legacy',
  'guia.leg.recoleccionSub': 'Herbalism · Mining · Skinning',
  'guia.leg.recoleccionTxt': 'Herbalism, Mining y Skinning <b>no otorgan Legacy Points</b>: no hay challenges de recolección (solo los 6 crafts pagan por skill). Lo que sí hacen es alimentar el árbol <b>Professions</b> — empezá por <b>Bountiful Harvest</b>.',
  'guia.leg.bountiful': 'Bountiful Harvest',
  'guia.leg.tuSkinning': 'tu Skinning suma',
  'guia.leg.perkArbol': 'perk del árbol',
  'guia.leg.bountifulTxt': '5 rangos · +20/40/60/80/100% escasos · libre',
  'guia.leg.tierNota': 'Según la regla que se reportó en la beta (Blizzard no la confirmó), a nivel {lvl} tu tabla de escasos sería el <b>{tier}</b>: el tier depende del nivel del personaje (≤25 → tier 1, ≥26 → tier 2).{items} El perk multiplica el drop de la tabla que te toque.',
  'guia.leg.tierItems1': ' Te tocarían Pristine Leather / Frilled Lichen / Pyrite.',
  'guia.leg.tierItems2': ' Te tocarían Pristine Hide / Rosecap / Bauxite, y Pristine Leather y Frilled Lichen ya no te caerían (quedan para un alt de nivel 25 o menos).',
  'guia.leg.tierItems3': ' Probablemente Pristine Scale / Stranglevine / Pitchblende.',
  'guia.leg.scarce': 'Materiales escasos (Scarce)',
  'guia.leg.scarceSub': 'bonus drops de nodos/menas/cadáveres normales',
  'guia.leg.scarceCols': 'GATHERED · TIER · SE CONVIERTE · RECETAS · NOTA',
  'guia.leg.ilvl': 'ilvl {n}',
  'guia.leg.dondeFarmear': '— dónde farmear',
  'guia.leg.tenesProf': 'tenés esta profesión',
  'guia.leg.porNivel': 'por nivel',
  'guia.leg.tuNivel': 'tu nivel',
  'guia.leg.nv': 'nv {a}–{b}',
  'guia.leg.tag.gather': 'recolección', 'guia.leg.tag.skill': 'skill', 'guia.leg.tag.craft': 'craft',
  'guia.leg.tag.fish': 'pesca', 'guia.leg.tag.vendor': 'vendors', 'guia.leg.tag.crate': 'crates',
  'guia.leg.tag.xp': 'descanso', 'guia.leg.tag.talent': 'talentos', 'guia.leg.tag.combat': 'combate',
  'guia.leg.tag.camp': 'camp', 'guia.leg.tag.heal': 'ventas', 'guia.leg.tag.pvp': 'pvp',
  'guia.leg.tag.travel': 'viaje', 'guia.leg.tag.party': 'party', 'guia.leg.tag.dead': 'muerte',
  'guia.leg.tag.death': 'durabilidad', 'guia.leg.tag.reagent': 'reagents', 'guia.leg.tag.rep': 'rep',
  'guia.leg.tag.food': 'comida',
}, {
  'guia.leg.titulo': 'Legacy — account points',
  'guia.leg.sub': 'WoW: Forever · 65 earnable pts · 16 per character',
  'guia.leg.desbloqueadoPre': 'At level {lvl} the panel should already be unlocked if any character on the account passed 25 — open it with',
  'guia.leg.desbloqueadoPost': '(Options → Keybindings).',
  'guia.leg.proximos': 'Your next points',
  'guia.leg.aNivel': 'at level {lvl} · {clase}',
  'guia.leg.sinClase': 'your class',
  'guia.leg.hitosClase': '— class milestones (1 pt each, first time)',
  'guia.leg.nivel': 'level {m}',
  'guia.leg.yaGanado': ' · you should already have it',
  'guia.leg.teFalta': ' · you are missing it',
  'guia.leg.spelunker': 'Spelunker',
  'guia.leg.spelunkerD': 'dungeon sets per tier (3 pts)',
  'guia.leg.oficios': 'Crafting trades',
  'guia.leg.oficiosD': '150/225/300 skill = 1 pt each (only the 6 crafts)',
  'guia.leg.pvp': 'PvP',
  'guia.leg.pvpD': 'honor ranks + BG reputations + Field of Honor (12 pts)',
  'guia.leg.raids': 'Raids',
  'guia.leg.raidsD': 'Hyjal Summit · Barrow Deeps · Onyxia (3 pts, lv 60)',
  'guia.leg.aventura': 'Adventure',
  'guia.leg.aventuraD': 'Valthalak (BRM) + Explore Azeroth (2 pts)',
  'guia.leg.notaBaja': 'The panel opens at level 25 — points still accumulate account-wide. Gathering gives <b>no</b> direct points; it feeds the Professions tree (below).',
  'guia.leg.notaAlta': 'At level {lvl}: check the panel (Y) — completed class milestones should show as earned. Gathering gives <b>no</b> direct points; it feeds the Professions tree (below).',
  'guia.leg.progress': 'Progress Track',
  'guia.leg.progressSub': 'rewards per points earned (account)',
  'guia.leg.challenges': 'Legacy Challenges',
  'guia.leg.loQuePaga': 'what pays points',
  'guia.leg.ranks': '{n} ranks',
  'guia.leg.req': 'req:',
  'guia.leg.recoleccion': 'Gathering and Legacy',
  'guia.leg.recoleccionSub': 'Herbalism · Mining · Skinning',
  'guia.leg.recoleccionTxt': 'Herbalism, Mining and Skinning <b>do not grant Legacy Points</b>: there are no gathering challenges (only the 6 crafts pay by skill). What they do is feed the <b>Professions</b> tree — start with <b>Bountiful Harvest</b>.',
  'guia.leg.bountiful': 'Bountiful Harvest',
  'guia.leg.tuSkinning': 'your Skinning counts',
  'guia.leg.perkArbol': 'tree perk',
  'guia.leg.bountifulTxt': '5 ranks · +20/40/60/80/100% scarce · free',
  'guia.leg.tierNota': 'Under the rule reported during the beta (not confirmed by Blizzard), at level {lvl} your scarce table would be <b>{tier}</b>: the tier depends on character level (≤25 → tier 1, ≥26 → tier 2).{items} The perk multiplies the drop rate of your table.',
  'guia.leg.tierItems1': ' You would get Pristine Leather / Frilled Lichen / Pyrite.',
  'guia.leg.tierItems2': ' You would get Pristine Hide / Rosecap / Bauxite, and Pristine Leather and Frilled Lichen would no longer drop (they go to an alt of level 25 or lower).',
  'guia.leg.tierItems3': ' Probably Pristine Scale / Stranglevine / Pitchblende.',
  'guia.leg.scarce': 'Scarce materials',
  'guia.leg.scarceSub': 'bonus drops from normal nodes/ores/corpses',
  'guia.leg.scarceCols': 'GATHERED · TIER · CONVERTS TO · RECIPES · NOTE',
  'guia.leg.ilvl': 'ilvl {n}',
  'guia.leg.dondeFarmear': '— where to farm',
  'guia.leg.tenesProf': 'you have this profession',
  'guia.leg.porNivel': 'by level',
  'guia.leg.tuNivel': 'your level',
  'guia.leg.nv': 'lv {a}–{b}',
  'guia.leg.tag.gather': 'gathering', 'guia.leg.tag.skill': 'skill', 'guia.leg.tag.craft': 'craft',
  'guia.leg.tag.fish': 'fishing', 'guia.leg.tag.vendor': 'vendors', 'guia.leg.tag.crate': 'crates',
  'guia.leg.tag.xp': 'rest', 'guia.leg.tag.talent': 'talents', 'guia.leg.tag.combat': 'combat',
  'guia.leg.tag.camp': 'camp', 'guia.leg.tag.heal': 'healing', 'guia.leg.tag.pvp': 'pvp',
  'guia.leg.tag.travel': 'travel', 'guia.leg.tag.party': 'party', 'guia.leg.tag.dead': 'death',
  'guia.leg.tag.death': 'durability', 'guia.leg.tag.reagent': 'reagents', 'guia.leg.tag.rep': 'rep',
  'guia.leg.tag.food': 'food',
})

const GOLD = { borderLeft: `3px solid ${C.amarillo}` }
// t() devuelve la clave si falta: para tags desconocidos mostramos el tag crudo.
const tagTxt = (lang, tag) => {
  const k = 'guia.leg.tag.' + tag
  const v = t(lang, k)
  return v === k ? tag : v
}
const MILESTONES = [[25, 'Novice'], [45, 'Experienced'], [60, 'Master']]
const PROF_META = [
  ['skin', '393', 'skull'], ['herb', '182', 'star'], ['mine', '186', 'pin'],
]

export function VistaLegacy({ estado, perfil, lang }) {
  const L = LEGACY || {}
  const build = leerBuild(estado && estado.build, {})
  const farmProf = normalizeFarm(build.farm).prof || {}
  const ids = new Set((perfil && perfil.profesiones) || [])
  const profs = {
    skin: !!(farmProf.skin || ids.has(393)),
    herb: !!(farmProf.herb || ids.has(182)),
    mine: !!(farmProf.mine || ids.has(186)),
  }
  const lvl = validLevel(perfil && perfil.nivel)
  const claseDato = perfil && perfil.clase != null ? D.personaje.clases[String(perfil.clase)] : null
  const clsName = claseDato ? nombre(claseDato.n, lang) : t(lang, 'guia.leg.sinClase')
  const fac = perfil && perfil.faccion === 'horda' ? 'h' : perfil && perfil.faccion === 'alianza' ? 'a' : null
  const sys = L.sys || [], progress = L.progress || [], challenges = L.challenges || [], perks = L.perks || {},
    scarce = L.scarce || [], gather = L.gather || {}
  const origen = <Origen f="curado" lang={lang} />
  const nombreProf = (id, alt) => {
    const p = D.profesiones && D.profesiones.profesiones && D.profesiones.profesiones[id]
    return p ? nombre(p.n, lang) : alt
  }

  return (
    <>
      {/* ---- sistema (card gold) ---- */}
      <Tarjeta estilo={GOLD} titulo={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icono n="coin" size={14} />{t(lang, 'guia.leg.titulo')}
          <span style={P.muted}>{t(lang, 'guia.leg.sub')}</span>
        </span>
      } extra={origen}>
        {sys.map((s, i) => (
          <div key={i} style={{ ...P.mst, ...(i === sys.length - 1 ? P.mstUlt : {}) }}>
            <span style={P.tdot} /><span style={P.mstTxt}><TextoRico html={s} /></span>
          </div>
        ))}
        <div style={{ ...P.tip, marginTop: 8 }}>
          {lvl < 25 ? <TextoRico html={(L.now && L.now.locked) || ''} /> : (
            <>{t(lang, 'guia.leg.desbloqueadoPre', { lvl })} <b>Y</b> {t(lang, 'guia.leg.desbloqueadoPost')}</>
          )}
        </div>
      </Tarjeta>

      {/* ---- próximos puntos ---- */}
      <Tarjeta titulo={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icono n="star" size={14} />{t(lang, 'guia.leg.proximos')}
          <span style={P.muted}>{t(lang, 'guia.leg.aNivel', { lvl, clase: clsName })}</span>
        </span>
      } extra={origen}>
        <div style={{ ...P.loot, borderBottom: 'none', paddingBottom: 2 }}>
          <span><b>{clsName}</b> <span style={P.muted}>{t(lang, 'guia.leg.hitosClase')}</span></span>
        </div>
        {MILESTONES.map(([m, label]) => {
          const got = lvl >= m
          return (
            <div key={m} style={P.loot}>
              <span style={got ? P.lootOwn : {}}>
                <b>{label} {clsName}</b>{' '}
                <span style={P.muted}>— {t(lang, 'guia.leg.nivel', { m })}{got ? t(lang, 'guia.leg.yaGanado') : t(lang, 'guia.leg.teFalta')}</span>
              </span>
              <Placa tono={got ? 'now' : 'soon'}>{got ? 'OK' : 'lvl ' + m}</Placa>
            </div>
          )
        })}
        {[
          [t(lang, 'guia.leg.spelunker'), t(lang, 'guia.leg.spelunkerD'), 'dgn'],
          [t(lang, 'guia.leg.oficios'), t(lang, 'guia.leg.oficiosD'), 'craft'],
          [t(lang, 'guia.leg.pvp'), t(lang, 'guia.leg.pvpD'), 'pvp'],
          [t(lang, 'guia.leg.raids'), t(lang, 'guia.leg.raidsD'), 'raid'],
          [t(lang, 'guia.leg.aventura'), t(lang, 'guia.leg.aventuraD'), 'world'],
        ].map(([n, d, tag], i, arr) => (
          <div key={tag} style={{ ...P.loot, ...(i === arr.length - 1 ? P.lootSinBorde : {}) }}>
            <span><b>{n}</b> <span style={P.muted}>— {d}</span></span>
            <Placa tono="soon">{tag}</Placa>
          </div>
        ))}
        <p style={{ ...P.tip, margin: '8px 0 0' }}><TextoRico html={lvl < 25 ? t(lang, 'guia.leg.notaBaja') : t(lang, 'guia.leg.notaAlta', { lvl })} /></p>
      </Tarjeta>

      {/* ---- progress track ---- */}
      <Tarjeta titulo={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icono n="pin" size={14} />{t(lang, 'guia.leg.progress')}
          <span style={P.muted}>{t(lang, 'guia.leg.progressSub')}</span>
        </span>
      } extra={origen}>
        {progress.map((p, i) => (
          <div key={i} style={{ ...P.loot, ...(i === progress.length - 1 ? P.lootSinBorde : {}) }}>
            <span><b>{p[0]} pts</b> — {p[1]} <span style={P.muted}>{p[2]}</span></span>
          </div>
        ))}
        {L.progressNote ? <p style={{ ...P.tip, margin: '6px 0 0' }}>{L.progressNote}</p> : null}
      </Tarjeta>

      {/* ---- challenges (card solo título + details por grupo) ---- */}
      <Tarjeta titulo={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icono n="scroll" size={14} />{t(lang, 'guia.leg.challenges')}
          <span style={P.muted}>{t(lang, 'guia.leg.loQuePaga')} · {L.challengesNote || ''}</span>
        </span>
      } extra={origen} />
      {challenges.map((c) => (
        <Detalle key={c.id || c.name} titulo={c.name}
          meta={`~${c.pts} pts · ${c.desc || ''}`} extra={origen}>
          {(c.rows || []).map((r, i) => (
            <div key={i} style={{ ...P.loot, ...(i === (c.rows || []).length - 1 ? P.lootSinBorde : {}) }}>
              <span><b>{r[0]}</b> <span style={P.muted}>— <TextoRico html={r[1]} /></span></span>
            </div>
          ))}
          {c.note ? <p style={{ ...P.tip, margin: '6px 0 0' }}><TextoRico html={c.note} /></p> : null}
        </Detalle>
      ))}

      {/* ---- árboles de perks ---- */}
      {Object.entries(perks).map(([pk, Pk]) => {
        const total = (Pk.perks || []).reduce((a, x) => a + (x.r || 0), 0)
        return (
          <Detalle key={pk} abierto={pk === 'prof'} estilo={pk === 'prof' ? { borderLeft: `3px solid ${C.verde}` } : {}}
            titulo={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icono n="star" size={14} />{Pk.name}</span>}
            meta={`${Pk.sub || ''} · ${t(lang, 'guia.leg.ranks', { n: total })}`} extra={origen}>
            {(Pk.perks || []).map((p, i) => (
              <div key={i} style={{ ...P.loot, ...(i === (Pk.perks || []).length - 1 ? P.lootSinBorde : {}) }}>
                <div>
                  <b>{p.n}</b>{' '}
                  <Placa tono={p.tag === 'gather' ? 'now' : 'plain'} estilo={{ marginLeft: 0 }}>{tagTxt(lang, p.tag)} · {p.r}r</Placa>
                  {p.pre ? <Placa tono="soon">{t(lang, 'guia.leg.req')} {p.pre}</Placa> : null}
                  <div style={{ ...P.muted, marginTop: 2 }}><TextoRico html={p.fx} /></div>
                </div>
              </div>
            ))}
            {L.perksNote ? <p style={{ ...P.tip, margin: '6px 0 0' }}>{L.perksNote}</p> : null}
          </Detalle>
        )
      })}

      {/* ---- recolección y legacy (card gold) ---- */}
      <Tarjeta estilo={GOLD} titulo={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icono n="star" size={14} />{t(lang, 'guia.leg.recoleccion')}
          <span style={P.muted}>{nombreProf('182', 'Herbalism')} · {nombreProf('186', 'Mining')} · {nombreProf('393', 'Skinning')}</span>
        </span>
      } extra={origen}>
        <div style={{ ...P.mst, marginBottom: 4 }}>
          <span style={P.tdot} /><span style={P.mstTxt}><TextoRico html={t(lang, 'guia.leg.recoleccionTxt')} /></span>
        </div>
        <div style={{ ...P.loot, borderBottom: 'none' }}>
          <span><b>{t(lang, 'guia.leg.bountiful')}</b> <Placa tono="now">{profs.skin ? t(lang, 'guia.leg.tuSkinning') : t(lang, 'guia.leg.perkArbol')}</Placa></span>
          <span style={P.muted}>{t(lang, 'guia.leg.bountifulTxt')}</span>
        </div>
        <p style={{ ...P.tip, margin: '8px 0 0' }}>
          <TextoRico html={t(lang, 'guia.leg.tierNota', {
            lvl,
            tier: lvl <= 25 ? 'tier 1' : lvl < 46 ? 'tier 2' : 'tier 3 (aprox)',
            items: t(lang, lvl <= 25 ? 'guia.leg.tierItems1' : lvl < 46 ? 'guia.leg.tierItems2' : 'guia.leg.tierItems3'),
          })} />
        </p>
      </Tarjeta>

      {/* ---- materiales escasos ---- */}
      <Tarjeta titulo={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icono n="coin" size={14} />{t(lang, 'guia.leg.scarce')}
          <span style={P.muted}>{t(lang, 'guia.leg.scarceSub')}</span>
        </span>
      } extra={origen}>
        <div style={{ ...P.loot, borderBottom: 'none', paddingBottom: 2 }}>
          <span style={{ ...P.muted, fontSize: 11 }}>{t(lang, 'guia.leg.scarceCols')}</span>
        </div>
        {scarce.map((s, i) => (
          <div key={i} style={{ ...P.loot, ...(i === scarce.length - 1 ? P.lootSinBorde : {}) }}>
            <div>
              <b>{s[0]}</b> <Placa tono="plain" estilo={{ marginLeft: 0 }}>{s[1]}</Placa> <Placa tono="soon">{t(lang, 'guia.leg.ilvl', { n: s[2] })}</Placa>
              <div style={{ ...P.muted, marginTop: 2 }}>→ {s[3]} · {s[4]}</div>
              <div style={{ ...P.muted, fontSize: 11 }}>{s[5]}</div>
            </div>
          </div>
        ))}
        {L.scarceNote ? <p style={{ ...P.tip, margin: '6px 0 0' }}>{L.scarceNote}</p> : null}
      </Tarjeta>

      {/* ---- spots por oficio ---- */}
      {PROF_META.map(([pk, id, ic]) => {
        const has = !!profs[pk]
        const rows = (gather[pk] || []).filter((e) => !e.fac || e.fac === 'both' || e.fac === fac)
        return (
          <Tarjeta key={pk} titulo={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Icono n={ic} size={14} />{nombreProf(id, pk)}{t(lang, 'guia.leg.dondeFarmear')}
              <span style={P.muted}>{has ? <b style={{ color: C.verde }}>{t(lang, 'guia.leg.tenesProf')}</b> : null}{t(lang, 'guia.leg.porNivel')}</span>
            </span>
          } extra={origen}>
            {rows.map((e, i) => {
              const inR = lvl >= e.lvl[0] && lvl <= e.lvl[1]
              return (
                <div key={i} style={{ ...P.loot, ...(i === rows.length - 1 ? P.lootSinBorde : {}),
                  ...(inR ? { borderLeft: `2px solid ${C.verde}`, paddingLeft: 8 } : {}) }}>
                  <div>
                    <b>{e.what}</b> <span style={P.muted}>· {t(lang, 'guia.leg.nv', { a: e.lvl[0], b: e.lvl[1] })}</span>
                    <div style={{ ...P.muted, marginTop: 2 }}>{e.zones}</div>
                    {e.note ? <div style={{ ...P.muted, fontSize: 11, marginTop: 1 }}>{e.note}</div> : null}
                  </div>
                  {inR ? <Placa tono="now">{t(lang, 'guia.leg.tuNivel')}</Placa> : null}
                </div>
              )
            })}
            {!rows.length ? <div style={P.muted}>—</div> : null}
          </Tarjeta>
        )
      })}
      {L.gatherNote ? <p style={{ ...P.tip, margin: 0 }}>{L.gatherNote}</p> : null}
    </>
  )
}
