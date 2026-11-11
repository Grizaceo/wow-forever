import sys
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validaciones estructurales de data/ (docs/MODELO-DATOS.md). No necesita las fuentes."""

import hashlib
import json
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

FILES = ['personaje.json', 'clases.json', 'profesiones.json', 'items.json',
         'zonas.json', 'misiones.json', 'dungeons.json', 'MANIFEST.json']

CLASES = {1, 2, 3, 4, 5, 7, 8, 9, 11}
PROFESIONES = {129, 164, 165, 171, 182, 185, 186, 197, 202, 333, 356, 393}
CRAFT = {171, 164, 333, 202, 165, 197}          # profesiones que fabrican
EXCL = range(200000, 240000)  # rango Season of Discovery
ITEM_FOREVER_MIN = 240000
RAZAS = {1, 2, 3, 4, 5, 6, 7, 8, 95, 96}


def load(name):
    with open(os.path.join(DATA, name), encoding='utf-8') as f:
        return json.load(f)


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def nombre_ok(n):
    return isinstance(n, dict) and isinstance(n.get('es'), str) \
        and isinstance(n.get('en'), str) and n['es'] and n['en']


class TestDatos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = {}
        for name in FILES:
            path = os.path.join(DATA, name)
            if not os.path.isfile(path):
                raise unittest.SkipTest('falta %s (genera con tools/build-datos-juego.py)' % path)
            cls.d[name] = load(name)
        cls.personaje = cls.d['personaje.json']
        cls.clases = cls.d['clases.json']
        cls.profesiones = cls.d['profesiones.json']
        cls.items = cls.d['items.json']
        cls.zonas = cls.d['zonas.json']
        cls.misiones = cls.d['misiones.json']
        cls.dungeons = cls.d['dungeons.json']
        cls.manifest = cls.d['MANIFEST.json']

    # ------------------------------------------------------------- archivos
    def test_archivos_existen(self):
        for name in FILES:
            self.assertTrue(os.path.isfile(os.path.join(DATA, name)), name)

    def test_formato_lineas(self):
        # un objeto JSON con una entrada de nivel superior por linea + '{' y '}'
        for name in FILES:
            path = os.path.join(DATA, name)
            with open(path, encoding='utf-8') as f:
                text = f.read()
            self.assertTrue(text.endswith('\n'), name)
            self.assertFalse(text.endswith('\n\n'), name)
            obj = json.loads(text)
            lines = text.split('\n')
            self.assertEqual(lines[0], '{', name)
            self.assertEqual(lines[-2], '}', name)
            entries = lines[1:-2]
            self.assertEqual(len(entries), len(obj),
                             '%s: %d entradas != %d claves' % (name, len(entries), len(obj)))
            for line in entries:
                self.assertRegex(line, r'^ "[^"]+": .+,?$', name)

    def test_meta(self):
        for name in FILES:
            meta = self.d[name].get('meta')
            if name == 'MANIFEST.json':
                continue
            self.assertIsInstance(meta, dict, name)
            self.assertEqual(meta.get('esquema'), 1, name)
            self.assertEqual(meta.get('origen'), 'generado', name)
            self.assertTrue(meta.get('fuentes'), name)
            self.assertEqual(meta.get('generador'), 'tools/build-datos-juego.py', name)
            self.assertIsInstance(meta.get('builds'), dict, name)

    # ----------------------------------------------------------- personaje
    def test_facciones(self):
        fac = self.personaje['facciones']
        self.assertEqual(sorted(fac), ['alianza', 'horda'])
        for f in fac.values():
            self.assertTrue(nombre_ok(f['n']))

    def test_razas(self):
        razas = self.personaje['razas']
        self.assertEqual(sorted(int(k) for k in razas), sorted(RAZAS))
        for rid, r in razas.items():
            self.assertTrue(nombre_ok(r['n']), rid)
            self.assertIn(r['faccion'], ('alianza', 'horda'), rid)
            self.assertIn('f', r, rid)
            if int(rid) in (95, 96):
                self.assertIsNone(r['inicio'], rid)
            else:
                self.assertIsInstance(r['inicio'], dict, rid)
                self.assertIn('zona', r['inicio'])
                self.assertIn('mapa', r['inicio'])
        # las dos razas sin inicio deben tener hueco declarado
        huecos = {(h.get('tema'), h.get('raza')) for h in self.personaje['huecos']}
        self.assertIn(('inicio', 95), huecos)
        self.assertIn(('inicio', 96), huecos)

    def test_clases_personaje(self):
        clases = self.personaje['clases']
        self.assertEqual(sorted(int(k) for k in clases), sorted(CLASES))
        for cid, c in clases.items():
            self.assertTrue(nombre_ok(c['n']), cid)
            self.assertTrue(c.get('token'), cid)

    def test_combinaciones(self):
        combos = self.personaje['combinaciones']
        self.assertEqual(len(combos), 56)
        nuevas = 0
        for r, c, n in combos:
            self.assertIn(r, RAZAS)
            self.assertIn(c, CLASES)
            self.assertIsInstance(n, bool)
            nuevas += n
            self.assertIn(self.personaje['razas'][str(r)]['faccion'],
                          ('alianza', 'horda'))
        self.assertEqual(nuevas, 16)

    def test_cada_faccion_tiene_las_9_clases(self):
        rf = {int(r): v['faccion'] for r, v in self.personaje['razas'].items()}
        for fac in ('alianza', 'horda'):
            races = {r for r, f in rf.items() if f == fac}
            cls = {c for r, c, _ in self.personaje['combinaciones'] if r in races}
            self.assertEqual(cls, CLASES, fac)

    # --------------------------------------------------------------- clases
    def test_clases_coleccion(self):
        self.assertEqual(sorted(int(k) for k in self.clases['clases']), sorted(CLASES))
        for cid, c in self.clases['clases'].items():
            for k in ('n', 'token', 'entrenadores', 'hechizos', 'misiones',
                      'competencias', 'f'):
                self.assertIn(k, c, (cid, k))
            self.assertTrue(nombre_ok(c['n']))
            self.assertEqual(sorted(c['entrenadores']), ['alianza', 'horda'])
            self.assertEqual(sorted(c['misiones']), ['alianza', 'horda'])
            for side in ('alianza', 'horda'):
                for t in c['entrenadores'][side]:
                    for k in ('npc', 'n', 'zona', 'x', 'y'):
                        self.assertIn(k, t, (cid, side, k))
                    self.assertTrue(nombre_ok(t['n']))
                for s in c['hechizos']:
                    for k in ('spell', 'n', 'nivel', 'costo'):
                        self.assertIn(k, s, (cid, k))

    def _huecos_entrenadores_clase(self):
        return {(h['clase'], h['faccion']) for h in self.clases['huecos']
                if h.get('tema') == 'entrenadores'}

    def test_huecos_entrenadores_exactos(self):
        # Paladin/horda y Shaman/alianza: combinaciones validas del cliente sin
        # entrenadores de clase en CMaNGOS 1.12. Ninguna otra.
        self.assertEqual(self._huecos_entrenadores_clase(), {(2, 'horda'), (7, 'alianza')})

    def test_huecos_usan_un_solo_vocabulario_de_faccion(self):
        for archivo in (self.personaje, self.clases, self.profesiones, self.zonas, self.dungeons):
            for h in archivo.get('huecos', []):
                if 'faccion' in h:
                    self.assertIn(h['faccion'], ('alianza', 'horda'), h)

    def test_toda_combinacion_valida_tiene_entrenadores_o_hueco(self):
        rf = {int(r): v['faccion'] for r, v in self.personaje['razas'].items()}
        huecos = self._huecos_entrenadores_clase()
        validadas = {(c, rf[r]) for r, c, _ in self.personaje['combinaciones']}
        self.assertTrue(validadas)
        for cid, side in validadas:
            tiene = bool(self.clases['clases'][str(cid)]['entrenadores'][side])
            self.assertTrue(tiene or (cid, side) in huecos,
                            'clase %s faccion %s sin entrenadores ni hueco' % (cid, side))

    # ---------------------------------------------------------- profesiones
    def test_profesiones_coleccion(self):
        profs = self.profesiones['profesiones']
        self.assertEqual(sorted(int(k) for k in profs), sorted(PROFESIONES))
        for pid, p in profs.items():
            for k in ('n', 'tipo', 'recoleccion', 'entrenadores', 'recetas', 'f'):
                self.assertIn(k, p, (pid, k))
            self.assertIn(p['tipo'], ('principal', 'secundaria'))
            self.assertIsInstance(p['recoleccion'], bool)
            self.assertTrue(nombre_ok(p['n']))
            self.assertEqual(sorted(p['entrenadores']), ['alianza', 'horda'])
            for side in ('alianza', 'horda'):
                for t in p['entrenadores'][side]:
                    for k in ('npc', 'n', 'zona', 'x', 'y', 'max'):
                        self.assertIn(k, t, (pid, side, k))
            for r in p['recetas']:
                for k in ('spell', 'n', 'crea', 'reactivos', 'rango', 'como',
                          'receta_item', 'vendedores', 'f'):
                    self.assertIn(k, r, (pid, r.get('spell'), k))
                self.assertTrue(nombre_ok(r['n']))
                if r['crea'] is not None:   # None: encantamientos (no crean ítem)
                    self.assertIsInstance(r['crea'], list)
                    self.assertEqual(len(r['crea']), 2)
                self.assertIsInstance(r['reactivos'], list)
                for pair in r['reactivos']:
                    self.assertEqual(len(pair), 2)
                self.assertEqual(sorted(r['rango']),
                                 ['amarillo', 'aprende', 'gris', 'verde'])
                self.assertIn(r['como'], ('entrenador', 'receta', 'automatica', 'desconocido'))
                self.assertEqual(sorted(r['vendedores']), ['alianza', 'horda'])
                self.assertIn(r['f'], ('cmangos-1.12', 'cliente-forever'))

    def test_profesiones_entrenadores_o_hueco(self):
        profs = self.profesiones['profesiones']
        huecos = {(h.get('profesion'), h.get('faccion'))
                  for h in self.profesiones['huecos'] if h.get('tema') == 'entrenadores'}
        for pid in PROFESIONES:
            p = profs[str(pid)]
            for side in ('alianza', 'horda'):
                tiene = bool(p['entrenadores'][side])
                self.assertTrue(tiene or (pid, side) in huecos,
                                'profesion %s faccion %s sin entrenadores ni hueco'
                                % (pid, side))

    def test_recetas_crafteo_tienen_crea_y_reactivos(self):
        profs = self.profesiones['profesiones']
        for pid in CRAFT:
            recs = profs[str(pid)]['recetas']
            self.assertTrue(recs, pid)
            for r in recs:
                self.assertTrue(r['reactivos'], (pid, r['spell']))
                if pid == 333 and r['crea'] is None:
                    continue   # encantamiento: aplica un efecto, no crea un ítem
                self.assertTrue(r['crea'][0] > 0, (pid, r['spell']))
                self.assertTrue(r['crea'][1] > 0, (pid, r['spell']))

    def test_recetas_de_112_tienen_origen(self):
        # Casi toda receta de 1.12 debe saber cómo se aprende; solo unas pocas quedan sin dato.
        recs = [r for p in self.profesiones['profesiones'].values() for r in p['recetas'] if r['f'] == 'cmangos-1.12']
        sin = [r['spell'] for r in recs if r['como'] == 'desconocido']
        self.assertLess(len(sin), 0.05 * len(recs), sin[:20])

    def test_misiones_ubicadas(self):
        ms = self.misiones['misiones'].values()
        sin = sum(1 for m in ms if m['zona'] is None and 'dungeon' not in m)
        self.assertLess(sin, 0.03 * len(self.misiones['misiones']))

    def test_encantamiento_completo(self):
        # Los encantamientos no crean ítem: antes se perdían. Deben estar todos los de 1.12.
        recs = self.profesiones['profesiones']['333']['recetas']
        self.assertGreater(sum(1 for r in recs if r['crea'] is None), 100)
        self.assertGreater(len(recs), 150)

    # ---------------------------------------------------------------- items
    def test_items(self):
        items = self.items['items']
        self.assertTrue(items)
        for k, v in items.items():
            self.assertTrue(k.isdigit(), k)
            self.assertNotIn(int(k), EXCL, k)
            self.assertEqual(len(v), 9, k)
            self.assertIsInstance(v[0], str)
            self.assertIsInstance(v[1], str)
            for n in v[2:]:
                self.assertIsInstance(n, int, (k, v))

    def _items_referenciados(self):
        refs = set()
        for p in self.profesiones['profesiones'].values():
            for r in p['recetas']:
                if r['crea']:
                    refs.add(r['crea'][0])
                for it, _ in r['reactivos']:
                    refs.add(it)
                if r['receta_item'] is not None:
                    refs.add(r['receta_item'])
        for rec in self.dungeons['clasicos'].values():
            for j in rec['jefes']:
                for it, _ in j['botin']:
                    refs.add(it)
        return refs

    def test_todo_item_referenciado_existe(self):
        items = self.items['items']
        for it in self._items_referenciados():
            self.assertIn(str(it), items, 'item %s referenciado sin ficha' % it)
            self.assertNotIn(it, EXCL)

    def test_rango_sod_excluido(self):
        items = self.items['items']
        for k in items:
            self.assertNotIn(int(k), EXCL, k)
        for p in self.profesiones['profesiones'].values():
            for r in p['recetas']:
                ids = ([r['crea'][0]] if r['crea'] else []) + [i for i, _ in r['reactivos']]
                if r['receta_item'] is not None:
                    ids.append(r['receta_item'])
                for i in ids:
                    self.assertNotIn(i, EXCL, (p.get('n'), r['spell'], i))
        for rec in self.dungeons['clasicos'].values():
            for j in rec['jefes']:
                for it, _ in j['botin']:
                    self.assertNotIn(it, EXCL)

    # ----------------------------------------------------------------- zonas
    def test_zonas(self):
        zonas = self.zonas['zonas']
        self.assertGreaterEqual(len(zonas), 40)
        for zid, z in zonas.items():
            for k in ('n', 'continente', 'niveles', 'faccion', 'f'):
                self.assertIn(k, z, (zid, k))
            self.assertTrue(nombre_ok(z['n']))
            self.assertIn(z['faccion'], ('alianza', 'horda', 'disputada', 'ciudad'))
            if z['niveles'] is not None:
                self.assertEqual(z['niveles'].get('f'), 'curado', zid)
                self.assertLessEqual(z['niveles']['min'], z['niveles']['max'])
        self.assertEqual(sorted(self.zonas['ciudades']), ['alianza', 'horda'])
        for side in ('alianza', 'horda'):
            self.assertTrue(self.zonas['ciudades'][side], side)
        for zk, sides in self.zonas['misiones_por_zona'].items():
            self.assertEqual(sorted(sides), ['alianza', 'horda'])
            for s in sides.values():
                self.assertIn('n', s)
                self.assertIn('min', s)
                self.assertIn('max', s)

    # -------------------------------------------------------------- misiones
    def test_misiones(self):
        mis = self.misiones['misiones']
        self.assertTrue(mis)
        for qid, q in mis.items():
            self.assertTrue(qid.isdigit())
            self.assertTrue(nombre_ok(q['t']), qid)
            self.assertIsInstance(q['nivel'], int)
            self.assertIsInstance(q['min'], int)
            self.assertIn(q['faccion'], ('a', 'h', 'ah'))
            self.assertIn('f', q)
            if 'clases' in q:
                self.assertTrue(set(q['clases']) <= CLASES)
            if 'prof' in q:
                self.assertIn(q['prof'], PROFESIONES)
            if 'prev' in q:
                self.assertIsInstance(q['prev'], int)

    # -------------------------------------------------------------- dungeons
    def test_dungeons(self):
        dun = self.dungeons
        self.assertTrue(dun['clasicos'])
        for mid, rec in dun['clasicos'].items():
            for k in ('n', 'niveles', 'jugadores', 'jefes', 'f'):
                self.assertIn(k, rec, (mid, k))
            self.assertTrue(nombre_ok(rec['n']))
            self.assertEqual(sorted(rec['niveles']), ['max', 'min'])
            self.assertGreater(rec['jugadores'], 0)
            if rec['jugadores'] >= 20:
                self.assertTrue(rec.get('raid'), mid)
            for j in rec['jefes']:
                for k in ('npc', 'n', 'botin'):
                    self.assertIn(k, j)
                self.assertTrue(nombre_ok(j['n']))
                for it, prob in j['botin']:
                    self.assertIn(str(it), self.items['items'],
                                  'botin item %s sin ficha' % it)
                    self.assertGreaterEqual(prob, 1.0)
        # Todo dungeon clásico tiene jefes; cada jefe sin criatura vinculada está declarado.
        huecos_botin = {h['mapa']: set(h.get('jefes', [])) for h in dun['huecos'] if h.get('tema') == 'botin'}
        for mid, rec in dun['clasicos'].items():
            self.assertTrue(rec['jefes'], mid)
            for j in rec['jefes']:
                if not j['npc']:
                    self.assertIn(j['n']['en'], huecos_botin.get(int(mid), set()), (mid, j['n']))
        # Dungeons nuevos de Forever: exactamente los 9 del buscador de grupos del cliente,
        # cada uno con sus jefes (del cliente) y un hueco de botín.
        nombres = sorted(rec['n']['en'] for rec in dun['forever'].values())
        self.assertEqual(nombres, sorted(["Alcaz Prison", "Blackmaw Hold", "City of Dalaran",
                                          "Excavation Site: Wetlands", "Krol'dok Stronghold",
                                          "Ruins of Lordaeron", "The Drowned City", "The Hall of Thanes",
                                          "The Shaper's Terrace"]))
        for mid, rec in dun['forever'].items():
            self.assertTrue(nombre_ok(rec['n']))
            self.assertIsNone(rec['niveles'])
            self.assertEqual(rec['f'], 'cliente-forever')
            self.assertNotIn(mid, dun['clasicos'])
            self.assertTrue(rec['jefes'], mid)
            self.assertTrue(all(j['botin'] is None for j in rec['jefes']), mid)
            self.assertIn(int(mid), huecos_botin, mid)

    # --------------------------------------------------------------- manifiesto
    def test_manifest(self):
        man = self.manifest
        self.assertEqual(man.get('esquema'), 1)
        self.assertTrue(man.get('fuentes'))
        self.assertTrue(man.get('builds'))
        esperados = {n for n in FILES if n != 'MANIFEST.json'}
        self.assertEqual(set(man['archivos']), esperados)
        for name, meta_f in man['archivos'].items():
            path = os.path.join(DATA, name)
            self.assertEqual(meta_f['sha256'], sha256(path), name)
            self.assertEqual(meta_f['bytes'], os.path.getsize(path), name)



class TestCatalogoMercado(unittest.TestCase):
    """standalone/market-catalog.js se regenera desde data/ byte a byte (sin entradas externas)."""

    def test_catalogo_reproducible(self):
        import subprocess, tempfile
        raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, 'cat.js')
            subprocess.run([sys.executable, os.path.join(raiz, 'tools', 'build-catalogo-mercado.py'), '--out', out],
                           check=True, capture_output=True)
            with open(out, 'rb') as a, open(os.path.join(raiz, 'standalone', 'market-catalog.js'), 'rb') as b:
                self.assertEqual(a.read(), b.read(), 'standalone/market-catalog.js no coincide con data/')
            with open(out, encoding='utf-8') as f:
                texto = f.read()
            self.assertNotIn('ForeverDungeonJournal', texto)

if __name__ == '__main__':
    unittest.main()
