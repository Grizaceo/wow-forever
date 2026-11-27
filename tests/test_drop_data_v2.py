"""Invariantes del dataset de drops schema 2 (farmeo-oro F1).

Lee standalone/drop-data.js generado (no el volcado CMaNGOS): comprueba que el
valor de una muerte ya no depende del índice item->fuentes con tope, que los
spawns de eventos no cuentan y que los campamentos espaciales son coherentes.
"""
import json
import os
import re
import unittest

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), os.pardir))
DROP = os.path.join(ROOT, 'standalone', 'drop-data.js')


def cargar():
    txt = open(DROP, encoding='utf-8').read()
    m = re.search(r'var DATA=(\{.*\});\n', txt, re.S)
    return json.loads(m.group(1))


D = cargar()


def triples(flat):
    return [flat[i:i + 3] for i in range(0, len(flat), 3)]


class TestDropDataV2(unittest.TestCase):
    def test_schema_y_campos_documentados(self):
        self.assertEqual(D['schemaVersion'], 2)
        for k in ('mobX', 'mobLoot', 'skinLoot', 'camps'):
            self.assertIn(k, D)
            self.assertIn(k, D['fields'])
        self.assertIn('eventSpawns', D['source']['params'])

    def test_spawns_de_evento_excluidos(self):
        # Lesser Anubisath Warbringer: solo existe en la guerra de AQ (game_event_creature).
        self.assertNotIn('15748', D['mobs'])
        for c in D['camps']:
            self.assertNotIn(15748, [e for e, _ in c[4]])

    def test_monedas_y_vida_por_mob(self):
        hum = [x for e, x in D['mobX'].items() if x[2] == 7 and D['mobs'][e][3] == 'normal']
        self.assertGreater(len(hum), 300)
        con_monedas = sum(1 for x in hum if x[1] > 0)
        self.assertGreater(con_monedas / len(hum), 0.8, 'los humanoides normales casi siempre sueltan monedas')
        for e, x in D['mobX'].items():
            self.assertEqual(len(x), 6, e)
            self.assertGreaterEqual(x[0], 1)
            self.assertGreaterEqual(x[1], 0)
            self.assertGreaterEqual(x[3], 0)
            self.assertIn(x[5], (0, 1))
            self.assertIn(e, D['mobs'])

    def test_mobloot_triples_validos(self):
        for e, flat in D['mobLoot'].items():
            self.assertEqual(len(flat) % 3, 0, e)
            self.assertIn(e, D['mobs'])
            for iid, bp, c10 in triples(flat):
                self.assertIn(str(iid), D['items'])
                self.assertTrue(1 <= bp <= 10000, (e, iid, bp))
                self.assertGreaterEqual(c10, 10)
        for e, flat in D['skinLoot'].items():
            self.assertEqual(len(flat) % 3, 0, e)

    def test_tela_ya_no_pierde_fuentes_por_el_tope(self):
        silk = 4306
        por_fuente = {s[1] for s in D['items'][str(silk)][10] if s[0] == 'm'}
        por_mob = {int(e) for e, flat in D['mobLoot'].items() if silk in flat[0::3]}
        self.assertLessEqual(len(por_fuente), D['source']['params']['maxSources'])
        self.assertGreater(len(por_fuente | por_mob), 500)
        self.assertFalse(por_fuente & por_mob, 'un par mob-ítem no se lista dos veces')

    def test_campamentos_coherentes(self):
        self.assertGreater(len(D['camps']), 800)
        for zk, mx, my, nn, mix in D['camps']:
            self.assertIn(zk, D['zones'])
            self.assertTrue(0 <= mx <= 1000 and 0 <= my <= 1000, (zk, mx, my))
            self.assertGreaterEqual(nn, 0)
            self.assertGreaterEqual(sum(c for _, c in mix), D['source']['params']['campMinSpawns'])
            for e, c in mix:
                self.assertEqual(D['mobs'][str(e)][3], 'normal')
                self.assertGreater(c, 0)

    def test_whirlwinds_dispersos_entre_otros_mobs(self):
        # Caso del análisis: los Whirlwind Shredder de Desolace no forman un campamento propio.
        desolace = next(k for k, z in D['zones'].items() if z[0] == 'Desolace')
        con = [c for c in D['camps'] if c[0] == desolace and any(e == 11578 for e, _ in c[4])]
        self.assertTrue(con)
        for c in con:
            total = sum(n for _, n in c[4])
            propios = sum(n for e, n in c[4] if e == 11578)
            self.assertLess(propios / total, 0.5)
        self.assertGreater(D['mobX']['11576'][4], 200, 'Whirlwind Ripper: spawns a cientos de yardas')


if __name__ == '__main__':
    unittest.main()
