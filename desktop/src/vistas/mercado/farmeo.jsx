// Recomendador de farmeo: zonas A/B del motor market-farm.js pintadas en React
// (no se usa Farm.render). Todos los números son estimaciones aproximadas del
// dataset Classic 1.12 — nunca ventas ni ingresos garantizados.
import { useMemo } from 'react'
import { Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hermes/plugin-sdk'
import { C, S } from '../../estilos.js'
import { D, guiaCurada } from '../../datos.js'
import { t } from '../../i18n.js'
import { Tarjeta } from '../../ui.jsx'
import {
  Farm, HunterHistory, perfilMotor, hubZonesDe,
} from '../../mercado-logica.js'
import { Sparkline } from './grafico.jsx'

const COMP_LABEL = { auto: 'Auto', low: 'Baja', med: 'Media', high: 'Alta' }
const RIESGO = { baja: 'mercado.farm.riesgo.baja', media: 'mercado.farm.riesgo.media', alta: 'mercado.farm.riesgo.alta' }
const PROF_NOMBRE = { skin: 'mercado.farm.prof.skin', herb: 'mercado.farm.prof.herb', mine: 'mercado.farm.prof.mine' }

function Chip({ children, color }) {
  return <span style={{ ...S.chip, borderColor: color || C.borde, color: color || C.texto2 }}>{children}</span>
}

function BadgeZona({ e, lang, fmt }) {
  const bits = []
  bits.push(<Chip key="r" color={e.risk?.level === 'alta' ? C.rojo : e.risk?.level === 'media' ? C.amarillo : C.verde}>
    {t(lang, 'mercado.farm.riesgo')}: {t(lang, RIESGO[e.risk?.level] || RIESGO.baja)}
  </Chip>)
  bits.push(<Chip key="c">{t(lang, 'mercado.farm.comp')}: {COMP_LABEL[e.comp?.comp] || e.comp?.comp}</Chip>)
  if (e.travel?.min) bits.push(<Chip key="v">{t(lang, 'mercado.farm.viaje', { min: e.travel.min })}{e.travel.fp ? '' : ` · ${t(lang, 'mercado.farm.sinVuelo')}`}{e.travel.hub ? ` · ${t(lang, 'mercado.farm.tuRuta')}` : ''}</Chip>)
  if (e.vendorGph) bits.push(<Chip key="g">≈{fmt.gph(e.vendorGph)}/h {t(lang, 'mercado.farm.vendedor')}</Chip>)
  return <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{bits}</div>
}

function PrecioItem({ hist, price, lang }) {
  const st = useMemo(() => (hist?.length ? FarmHistPriceStats(hist) : null), [hist])
  if (!st) return null
  const tend = { sube: 'mercado.tend.sube', baja: 'mercado.tend.baja', estable: 'mercado.tend.estable', 'sin-datos': 'mercado.tend.pocos' }[st.tendencia] || 'mercado.tend.pocos'
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 6 }}>
      <Sparkline history={hist} />
      {st.diasMuestra >= 2 && <Chip color={st.tendencia === 'sube' ? C.verde : st.tendencia === 'baja' ? C.rojo : undefined}>{t(lang, tend)} · {st.diasMuestra}d</Chip>}
      {st.medianaLow != null && <span style={S.etiqueta}>{t(lang, 'mercado.farm.mediana')} {fmtMoney(st.medianaLow)}{price != null ? ` · ${t(lang, 'mercado.farm.hoy')} ${fmtMoney(price)}` : ''}</span>}
    </span>
  )
}

function FarmHistPriceStats(hist) { return HunterHistory.priceStats(hist) }
function fmtMoney(c) { return Farm.fmt?.money ? Farm.fmt.money(c) : String(c) }

function TarjetaZona({ e, rank, profile, settings, lang, onComp, onCopada }) {
  const fmt = Farm.fmt || {}
  const cur = settings.zoneComp?.[e.zoneKey] || 'auto'
  return (
    <div style={{ ...S.tarjeta, borderLeft: rank === 'A' ? `3px solid ${C.acento}` : undefined }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <b>{rank} · {e.name}</b>
        <BadgeZona e={e} lang={lang} fmt={fmt} />
      </div>
      <p style={S.sub}>
        {t(lang, 'mercado.farm.niveles', { min: e.levels?.[0] ?? '?', max: e.levels?.[1] ?? '?' })} · {t(lang, 'mercado.farm.nivelVos', { nivel: profile.level || 12 })}
      </p>
      <p style={S.sub}>
        ~{fmt.gph ? fmt.gph(e.gph) : e.gph}/h {t(lang, 'mercado.farm.antesMultiplicadores')} · {e.rareCount} {t(lang, 'mercado.farm.rarezas')} ({e.rareScan} {t(lang, 'mercado.farm.conScan')}) · {e.chestCount} {t(lang, 'mercado.farm.cofres')} · {e.usefulCount} {t(lang, 'mercado.farm.utiles')}
      </p>
      {e.topItems?.length > 0 && (
        <div>
          <div style={S.etiqueta}>{t(lang, 'mercado.farm.itemsScan')}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {e.topItems.map((it, i) => (
              <li key={i}>
                {it.name} · {fmt.srcLabel ? fmt.srcLabel(it.source) : it.source?.name} · {t(lang, 'mercado.farm.zona')} {fmt.zoneName ? fmt.zoneName(it.source?.zoneKey) : it.source?.zoneKey} · {fmt.pct ? fmt.pct(it.chance) : it.chance}
                {it.doubtful ? <> <Chip color={C.amarillo}>{t(lang, 'mercado.farm.dudoso')}</Chip></> : null}
                <PrecioItem hist={it.hist} price={it.price} lang={lang} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {e.useful?.length > 0 && (
        <div>
          <div style={S.etiqueta}>{t(lang, 'mercado.farm.utilesVos')}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {e.useful.map((u, i) => (
              <li key={i}>
                {u.name} <span style={S.etiqueta}>· {u.srcName || ''}</span>
                {u.preferred ? <> <Chip color={C.azul}>{t(lang, 'mercado.farm.preferida')}</Chip></> : null}
                {u.isRare ? <> <Chip color={C.amarillo}>{t(lang, 'mercado.farm.rareza')}</Chip></> : null}
                <PrecioItem hist={u.hist} price={u.price} lang={lang} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {e.camps?.length > 0 && (
        <div>
          <div style={S.etiqueta}>{t(lang, 'mercado.farm.camps')}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {e.camps.map((c, i) => (
              <li key={i}>{c.name} · {c.kind === 'object' ? t(lang, 'mercado.farm.recoleccion') : 'mob'} · ~{fmt.gph ? fmt.gph(c.gph) : c.gph}/h {t(lang, 'mercado.farm.approx')}</li>
            ))}
          </ul>
        </div>
      )}
      {e.risk?.note && <div style={S.aviso}>{e.risk.note}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ ...S.campo, minWidth: 140 }}>
          <span style={S.etiqueta}>{t(lang, 'mercado.farm.compZona')}</span>
          <Select value={cur} onValueChange={(v) => onComp(e.zoneKey, v)}>
            <SelectTrigger aria-label={t(lang, 'mercado.farm.compZona')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t(lang, 'mercado.farm.compAuto')}</SelectItem>
              <SelectItem value="low">{t(lang, 'mercado.farm.compLow')}</SelectItem>
              <SelectItem value="med">{t(lang, 'mercado.farm.compMed')}</SelectItem>
              <SelectItem value="high">{t(lang, 'mercado.farm.compHigh')}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <Button variant="outline" size="xs" onClick={() => onCopada(e.zoneKey)}>{t(lang, 'mercado.farm.copada')}</Button>
      </div>
      {e.reasons?.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: C.texto2 }}>
          {e.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  )
}

// Componente controlado: `settings` y `onSettings` los maneja la vista (los
// mismos ajustes alimentan las métricas de la tabla y las tarjetas de aquí).
export function Farmeo({ items, perfil, settings, onSettings, lang }) {
  const guia = useMemo(() => guiaCurada(perfil), [perfil])
  const profile = useMemo(() => {
    const hub = hubZonesDe(perfil?.nivel || 12, guia?.datos?.routes, D.zonas, perfil?.faccion)
    return perfilMotor(perfil, hub)
  }, [perfil, guia])

  const cambiar = (parcial) => onSettings({ ...settings, ...parcial })
  const cambiarCompZona = (zk, v) => {
    const zoneComp = { ...(settings.zoneComp || {}) }
    if (v === 'auto') delete zoneComp[zk]; else zoneComp[zk] = v
    cambiar({ zoneComp })
  }
  const cambiarProf = (k, v) => cambiar({ prof: { ...settings.prof, [k]: v } })

  const fmt = Farm.fmt || {}
  const calculo = useMemo(() => {
    if (!items?.length) return null
    try {
      return {
        rank: Farm.rank(items, profile, settings),
        prog: Farm.progression(items, profile, settings),
        profs: Farm.profRecommendations(items, profile, settings),
        stats: Farm.matchStats(items),
      }
    } catch { return null }
  }, [items, profile, settings])

  const sinAjusteClase = ![1, 3, 7].includes(perfil?.clase)

  return (
    <Tarjeta titulo={t(lang, 'mercado.farm.titulo')} extra={<span style={S.etiqueta}>{t(lang, 'mercado.farm.subtitulo')}</span>}>
      {!items?.length ? (
        <p style={S.sub}>{t(lang, 'mercado.farm.sinScan')}</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={S.campo}>
              <span style={S.etiqueta}>{t(lang, 'mercado.farm.compGlobal')}</span>
              <Select value={settings.comp} onValueChange={(v) => cambiar({ comp: v })}>
                <SelectTrigger aria-label={t(lang, 'mercado.farm.compGlobal')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t(lang, 'mercado.farm.compAuto')}</SelectItem>
                  <SelectItem value="low">{t(lang, 'mercado.farm.compLow')}</SelectItem>
                  <SelectItem value="med">{t(lang, 'mercado.farm.compMed')}</SelectItem>
                  <SelectItem value="high">{t(lang, 'mercado.farm.compHigh')}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label style={S.campo}>
              <span style={S.etiqueta}>{t(lang, 'mercado.farm.gphRef')}</span>
              <Input type="number" min="1" max="1000" step="1" value={settings.gph}
                onChange={(e) => { const n = +e.target.value; cambiar({ gph: Number.isFinite(n) && n > 0 ? Math.min(1000, n) : 5 }) }} />
            </label>
            <label style={S.campo}>
              <span style={S.etiqueta}>{t(lang, 'mercado.farm.ciclo')}</span>
              <Select value={String(settings.session)} onValueChange={(v) => cambiar({ session: [1, 2, 4].includes(+v) ? +v : 2 })}>
                <SelectTrigger aria-label={t(lang, 'mercado.farm.ciclo')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 h</SelectItem>
                  <SelectItem value="2">2 h</SelectItem>
                  <SelectItem value="4">4 h</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label style={S.campo}>
              <span style={S.etiqueta}>{t(lang, 'mercado.farm.zonasExtra')}</span>
              <Select value={String(settings.n)} onValueChange={(v) => { const n = +v; cambiar({ n: n >= 3 && n <= 8 ? n : 5 }) }}>
                <SelectTrigger aria-label={t(lang, 'mercado.farm.zonasExtra')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[3, 4, 5, 6, 7, 8].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Checkbox checked={!!settings.prof.skin} onCheckedChange={(v) => cambiarProf('skin', !!v)} />
            <span style={{ fontSize: 12 }}>{t(lang, PROF_NOMBRE.skin)}</span>
            <Checkbox checked={!!settings.prof.herb} onCheckedChange={(v) => cambiarProf('herb', !!v)} />
            <span style={{ fontSize: 12 }}>{t(lang, PROF_NOMBRE.herb)}</span>
            <Checkbox checked={!!settings.prof.mine} onCheckedChange={(v) => cambiarProf('mine', !!v)} />
            <span style={{ fontSize: 12 }}>{t(lang, PROF_NOMBRE.mine)}</span>
            <Checkbox checked={!!settings.group} onCheckedChange={(v) => cambiar({ group: !!v })} />
            <span style={{ fontSize: 12 }}>{t(lang, 'mercado.farm.grupo')}</span>
            <Checkbox checked={settings.pvp !== false} onCheckedChange={(v) => cambiar({ pvp: !!v })} />
            <span style={{ fontSize: 12 }}>{t(lang, 'mercado.farm.pvp')}</span>
          </div>
          {sinAjusteClase && <p style={S.sub}>{t(lang, 'mercado.farm.sinEquipoClase')}</p>}

          {!calculo ? <p style={S.sub}>{t(lang, 'mercado.farm.sinZonas')}</p> : (
            <>
              {calculo.rank.A ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <TarjetaZona e={calculo.rank.A} rank="A" profile={profile} settings={settings} lang={lang}
                    onComp={cambiarCompZona} onCopada={(zk) => cambiarCompZona(zk, 'high')} />
                  {calculo.rank.B.map((b, i) => (
                    <TarjetaZona key={b.zoneKey} e={b} rank={`B${i + 1}`} profile={profile} settings={settings} lang={lang}
                      onComp={cambiarCompZona} onCopada={(zk) => cambiarCompZona(zk, 'high')} />
                  ))}
                </div>
              ) : <p style={S.sub}>{t(lang, 'mercado.farm.sinZonas')}</p>}

              {calculo.profs?.length > 0 && (
                <div>
                  <div style={S.etiqueta}>{t(lang, 'mercado.farm.porProfesion')}</div>
                  {calculo.profs.map((p) => (
                    <div key={p.kind} style={{ marginTop: 6 }}>
                      <b style={{ fontSize: 12 }}>{p.name}</b>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                        {p.zones.map((z) => (
                          <li key={z.zoneKey}>{z.name} · ~{fmt.gph ? fmt.gph(z.gph) : z.gph}/h {t(lang, 'mercado.farm.enMateriales')}{z.items?.length ? ` · ${z.items.join(' · ')}` : ''}</li>
                        ))}
                      </ul>
                      {p.along?.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          <div style={S.etiqueta}>{t(lang, 'mercado.farm.skinAlong')}</div>
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                            {p.along.map((z) => (
                              <li key={z.zoneKey}>{z.name} · ~{fmt.gph ? fmt.gph(z.gph) : z.gph}/h {t(lang, 'mercado.farm.enMateriales')}{z.bands ? ` · ${t(lang, 'mercado.farm.bandas', { bands: z.bands })}` : ''}</li>
                            ))}
                          </ul>
                          <p style={S.sub}>{t(lang, 'mercado.farm.skinAlongNota')}</p>
                        </div>
                      )}
                    </div>
                  ))}
                  <p style={S.sub}>{t(lang, 'mercado.farm.porProfesionNota')}</p>
                </div>
              )}

              {calculo.prog?.length > 0 && (
                <div>
                  <div style={S.etiqueta}>{t(lang, 'mercado.farm.progresion')}</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                    {calculo.prog.map((p, i, arr) => {
                      const prev = i > 0 ? arr[i - 1] : null
                      const same = prev && p.zoneKey === prev.zoneKey
                      return (
                        <li key={p.level}>
                          {t(lang, 'mercado.farm.progLinea', { nivel: p.level })}{' '}
                          {same ? t(lang, 'mercado.farm.progSeguimos', { zona: p.name })
                            : t(lang, 'mercado.farm.progMover', { zona: p.name })}
                          {!same && p.gph ? ` (~${fmt.gph ? fmt.gph(p.gph) : p.gph}/h ${t(lang, 'mercado.farm.approx')}${p.camp ? `, ${t(lang, 'mercado.farm.camp')} ${p.camp}` : ''})` : ''}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              <div>
                <div style={S.etiqueta}>{t(lang, 'mercado.farm.cobertura')}</div>
                <p style={S.sub}>
                  {calculo.stats ? t(lang, 'mercado.farm.coberturaLinea', { matched: calculo.stats.matched, total: calculo.stats.total, pct: calculo.stats.pct }) : ''}
                  {' '}{t(lang, 'mercado.farm.estimaciones')}
                </p>
              </div>
            </>
          )}
        </>
      )}
    </Tarjeta>
  )
}
