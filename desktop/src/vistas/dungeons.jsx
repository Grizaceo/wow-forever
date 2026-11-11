// Dungeons: los clásicos de dungeons.json ordenados por nivel (filtro en-mi-rango
// ±5 / todos / raids), cada uno con sus jefes en orden y el botín generado
// (<NombreItem> + probabilidad), las misiones de dungeon de tu facción y, si la
// clase tiene guía curada, las notas de la guía junto al dungeon que coincide por
// nombre. El filtro "útil para mi clase" deja solo botín de calidad ≥2 que la
// clase pueda equipar según sus competencias. Los 9 dungeons nuevos de Forever
// muestran sus jefes del cliente con <Hueco> de botín. El tilde de botín
// conseguido persiste en estado.build con la clave `gear` ('d<i>|<nombre>'),
// el mismo formato que viewDungeons de standalone/index.html.
import { useMemo, useState } from 'react'
import { Checkbox, SegmentedControl } from '@hermes/plugin-sdk'
import { D, guiaCurada } from '../datos.js'
import {
  alternarEnLista, buildCambios, curadosPorDungeon, dungeonsVisibles,
  leerBuild, listaBuild, listaDungeons,
} from '../ruta-logica.js'
import { agregarTextos, t } from '../i18n.js'
import { C, S } from '../estilos.js'
import { Aviso, Origen, Tarjeta } from '../ui.jsx'
import { TarjetaDungeon } from './dungeons/tarjeta.jsx'

agregarTextos({
  'dungeon.util': 'Solo útil para mi clase',
  'dungeon.utilSub': 'Deja solo el botín de calidad poco común o mejor que tu clase puede equipar.',
  'dungeon.filtro.rango': 'En mi rango',
  'dungeon.filtro.todos': 'Todos',
  'dungeon.filtro.raids': 'Raids',
  'dungeon.vacio': 'Ningún dungeon coincide con el filtro.',
  'dungeon.intro': 'Los que están en tu rango (±5 niveles) vienen abiertos. El tilde del botín curado se guarda solo.',
}, {
  'dungeon.util': 'Only useful for my class',
  'dungeon.utilSub': 'Keeps only uncommon-or-better loot your class can equip.',
  'dungeon.filtro.rango': 'In my range',
  'dungeon.filtro.todos': 'All',
  'dungeon.filtro.raids': 'Raids',
  'dungeon.vacio': 'No dungeon matches the filter.',
  'dungeon.intro': 'Those in your range (±5 levels) come open. The curated loot tick saves itself.',
})

export function VistaDungeons({ almacen, estado, recargar, perfil, lang }) {
  const [filtro, setFiltro] = useState('rango')
  const [soloUtil, setSoloUtil] = useState(false)
  const [aviso, setAviso] = useState('')
  const build = useMemo(() => leerBuild(estado && estado.build), [estado && estado.build])
  const lista = useMemo(() => listaDungeons(D.dungeons), [])
  const visibles = useMemo(() => dungeonsVisibles(lista, filtro, perfil.nivel), [lista, filtro, perfil.nivel])
  const competencias = useMemo(() => {
    const cl = D.clases.clases[String(perfil.clase)]
    return new Set((cl && cl.competencias ? cl.competencias : []).map((c) => c.id))
  }, [perfil.clase])
  const gear = useMemo(() => new Set(listaBuild(build, 'gear')), [build])
  const { guia } = guiaCurada(perfil) || {}
  const curados = useMemo(
    () => (guia && guia.dungeons ? curadosPorDungeon(guia.dungeons, D.dungeons.clasicos, D.dungeons.forever) : new Map()),
    [guia],
  )

  const guardar = async (cambios) => {
    try {
      await buildCambios(almacen, cambios)
      setAviso('')
      recargar()
    } catch (e) {
      setAviso(e && e.message ? e.message : String(e))
    }
  }
  const alternarGear = (id, puesto) => guardar({ gear: alternarEnLista(listaBuild(build, 'gear'), id, puesto) })

  return (
    <>
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      <Tarjeta titulo={t(lang, 'tab.dungeons')} extra={<Origen f={['cliente-forever', 'cmangos-1.12']} lang={lang} />}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <SegmentedControl
            value={filtro}
            onChange={setFiltro}
            options={[
              { id: 'rango', label: t(lang, 'dungeon.filtro.rango') },
              { id: 'todos', label: t(lang, 'dungeon.filtro.todos') },
              { id: 'raids', label: t(lang, 'dungeon.filtro.raids') },
            ]}
          />
          <label title={t(lang, 'dungeon.utilSub')} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: C.texto2, cursor: 'pointer' }}>
            <Checkbox checked={soloUtil} onCheckedChange={setSoloUtil} />
            {t(lang, 'dungeon.util')}
          </label>
          <span style={{ ...S.sub, marginLeft: 'auto' }}>{visibles.length}</span>
        </div>
        <div style={S.sub}>{t(lang, 'dungeon.intro')}</div>
        {!visibles.length ? <div style={S.sub}>{t(lang, 'dungeon.vacio')}</div> : null}
      </Tarjeta>

      {visibles.map((d) => (
        <TarjetaDungeon
          key={d.mapa}
          d={d}
          lang={lang}
          perfil={perfil}
          soloUtil={soloUtil}
          items={D.items.items}
          competencias={competencias}
          gear={gear}
          curados={curados.get(d.mapa) || []}
          onGear={alternarGear}
        />
      ))}
    </>
  )
}
