"""consultar.py farmeo-*: lectura del contexto que escribe Mercado → Farmeo.

El fixture tests/fixtures/farmeo-agente.json es sintético (4 sesiones de
Whirlwind Shredder), generado con desktop/src/farm-sesiones.js exportAgente. Su
sección `evaluacion` sale de FarmPlan.evaluate (dataset schema 2 del repo, nivel 40
Horda, sin desuello, ranking 5 / mobs 40) con 6 precios SINTÉTICOS de 3 días:
Elemental Air 4500, Elemental Fire 3600, Burning Charm 375, Thundering Charm 700,
Cresting Charm 1400 y Elemental Earth 2200 cobre.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), os.pardir))
SCRIPT = os.path.join(ROOT, 'skills', 'wow-forever', 'scripts', 'consultar.py')
FIX = os.path.join(ROOT, 'tests', 'fixtures', 'farmeo-agente.json')
sys.path.insert(0, os.path.dirname(SCRIPT))
import consultar  # noqa: E402


def correr(*args):
    lineas = []
    code = consultar.main(list(args), out=lineas.append)
    return code, '\n'.join(lineas)


class TestFarmeoCli(unittest.TestCase):
    def test_sesiones_tabla_y_total(self):
        code, txt = correr('farmeo-sesiones', '--archivo', FIX)
        self.assertEqual(code, 0)
        self.assertIn('[tus sesiones] 4 sesiones medidas', txt)
        self.assertEqual(txt.count('\n2026-11-'), 4)
        self.assertIn('Total: 4.0 h medidas', txt)
        self.assertIn('modelo base', txt)

    def test_sesion_ultima_y_por_id(self):
        code, txt = correr('farmeo-sesion', '1', '--archivo', FIX)
        self.assertEqual(code, 0)
        self.assertIn('Sesión s1795300000', txt)
        self.assertIn('Whirlwind Shredder ×95', txt)
        self.assertIn('[estimación] Predicho', txt)
        code2, txt2 = correr('farmeo-sesion', 's1795000000', '--archivo', FIX)
        self.assertEqual(code2, 0)
        self.assertIn('×70', txt2)
        code3, txt3 = correr('farmeo-sesion', 's999', '--archivo', FIX)
        self.assertEqual(code3, 2)
        self.assertIn('no existe la sesión', txt3)

    def test_estilo_calibrado_y_tendencias(self):
        code, txt = correr('farmeo-estilo', '--archivo', FIX)
        self.assertEqual(code, 0)
        self.assertIn('Estilo calibrado con 335 muertes en 4 sesiones', txt)
        self.assertIn('Tendencia muertes/h: 75.0 → 92.5 (+23%)', txt)

    def test_plan_con_tramos_y_topes(self):
        code, txt = correr('farmeo-plan', '--archivo', FIX)
        self.assertEqual(code, 0)
        self.assertIn('[estimación] Plan de 2 h', txt)
        self.assertRegex(txt, r'\n  \d+ min · (solo|limpiar) ')
        self.assertIn('kappa-ofertas', txt)

    def test_diagnostico_reglas_fijas(self):
        code, txt = correr('farmeo-diagnostico', '--ultimas', '2', '--archivo', FIX)
        self.assertEqual(code, 0)
        self.assertIn('Diagnóstico de 2 sesión(es)', txt)
        self.assertIn('no es pelea ni saqueo', txt)

    def test_sin_archivo_explica_como_generarlo(self):
        tmp = tempfile.mkdtemp()
        try:
            old = os.environ.get('WOW_FOREVER_FARMEO')
            os.environ['WOW_FOREVER_FARMEO'] = os.path.join(tmp, 'no-existe.json')
            home = os.environ.get('HOME')
            os.environ['HOME'] = tmp
            try:
                code, txt = correr('farmeo-sesiones')
            finally:
                os.environ['HOME'] = home or ''
                if old is None:
                    os.environ.pop('WOW_FOREVER_FARMEO', None)
                else:
                    os.environ['WOW_FOREVER_FARMEO'] = old
            self.assertEqual(code, 2)
            self.assertIn('Mercado → Farmeo', txt)
            self.assertIn('/wff start', txt)
        finally:
            shutil.rmtree(tmp)

    def test_schema_invalido_rechazado(self):
        tmp = tempfile.mkdtemp()
        try:
            p = os.path.join(tmp, 'x.json')
            with open(p, 'w', encoding='utf-8') as f:
                json.dump({'schema': 9, 'sesiones': []}, f)
            code, txt = correr('farmeo-plan', '--archivo', p)
            self.assertEqual(code, 2)
            self.assertIn('schema 1', txt)
        finally:
            shutil.rmtree(tmp)

    def test_sesion_con_campos_del_addon_020(self):
        # Addon 0.2.0: viaje fuera del reloj, tiempo muerto, muertes sin mob y botín recibido.
        d = json.load(open(FIX, encoding='utf-8'))
        d['sesiones'][-1].update(viajeMin=4.0, muertoMin=1.5, muertesSinMob=3, xpH=12000, botinDe='chat')
        tmp = tempfile.mkdtemp()
        try:
            p = os.path.join(tmp, 'f.json')
            with open(p, 'w', encoding='utf-8') as f:
                json.dump(d, f)
            code, txt = correr('farmeo-sesion', '1', '--archivo', p)
            self.assertEqual(code, 0)
            self.assertIn('viaje hasta la primera pelea 4.0 min', txt)
            self.assertIn('3 muertes sin mob conocido', txt)
            self.assertIn('botín = lo que entró a tus bolsas', txt)
            code2, txt2 = correr('farmeo-sesion', '1', '--archivo', FIX)
            self.assertNotIn('Además:', txt2)
        finally:
            shutil.rmtree(tmp)

    def test_el_fixture_no_trae_nombres_ni_ruta(self):
        d = json.load(open(FIX, encoding='utf-8'))
        txt = json.dumps(d, ensure_ascii=False)
        self.assertNotIn('path', d['sesiones'][0])
        self.assertNotIn('nombre', d.get('personaje') or {})
        self.assertNotIn('1443:', txt)


    # ---- evaluación por mob, zona y ranking (Mercado → Farmeo exporta `evaluacion`)
    def test_mob_evaluado_con_aportes_y_precio_usado(self):
        code, txt = correr('farmeo-mob', 'burning exile', '--archivo', FIX)
        self.assertEqual(code, 0)
        self.assertIn('[estimación] Burning Exile (nv 38–39) · Arathi Highlands · puesto 9 de 442', txt)
        self.assertIn('Burning Charm', txt)
        self.assertIn('precio usado (mediana 3 d) 0.0375o', txt)
        self.assertIn('compara el precio usado aquí', txt)

    def test_mob_muestra_el_tope_y_el_campamento_del_ranking(self):
        code, txt = correr('farmeo-mob', 'Whirlwind Shredder', '--archivo', FIX)
        self.assertEqual(code, 0)
        self.assertIn('puesto 2 de 442', txt)
        self.assertRegex(txt, r'Elemental Air \d+% · [\d.]+ u/h, 30\.0 a subasta \[kappa-ofertas, tope 30 u\]')
        self.assertIn('En el ranking: #2 solo Whirlwind Shredder', txt)

    def test_mob_no_evaluado_explica_el_motivo_con_el_dataset(self):
        code, txt = correr('farmeo-mob', 'Leprithus', '--archivo', FIX)
        self.assertEqual(code, 0)
        self.assertIn('Leprithus (nv 19–19) · Westfall: no se evalúa porque es raro', txt)
        self.assertIn('más de 15 niveles bajo el tuyo (40)', txt)
        code, txt = correr('farmeo-mob', 'Lesser Anubisath Warbringer', '--archivo', FIX)
        self.assertEqual(code, 0)
        self.assertIn('SIN DATOS', txt)
        self.assertIn('solo aparece durante un evento', txt)

    def test_mob_elegible_fuera_del_top_exportado(self):
        with open(FIX, encoding='utf-8') as fh:
            d = json.load(fh)
        d['evaluacion']['mobs'] = [m for m in d['evaluacion']['mobs'] if m['nombre'] != 'Burning Exile']
        tmp = tempfile.mkdtemp()
        try:
            f = os.path.join(tmp, 'farmeo-agente.json')
            with open(f, 'w', encoding='utf-8') as fh:
                json.dump(d, fh)
            code, txt = correr('farmeo-mob', 'Burning Exile', '--archivo', f)
            self.assertEqual(code, 0)
            self.assertIn('es elegible, pero con tus precios queda fuera de los 39 mejores de 442', txt)
        finally:
            shutil.rmtree(tmp)

    def test_zona_ordena_por_oro_h_con_el_aporte_principal(self):
        code, txt = correr('farmeo-zona', 'arathi', '--archivo', FIX)
        self.assertEqual(code, 0)
        self.assertIn('[estimación] Arathi Highlands:', txt)
        self.assertIn('Ranking #5: solo Thundering Exile', txt)
        filas = [l for l in txt.splitlines() if 'Exile' in l and '–' in l]
        self.assertEqual([l.split()[1] for l in filas][:2], ['Thundering', 'Burning'])
        code, txt = correr('farmeo-zona', 'zona que no existe', '--archivo', FIX)
        self.assertIn('SIN DATOS', txt)

    def test_ranking_lista_campamentos_y_aportes(self):
        code, txt = correr('farmeo-ranking', '--max', '2', '--archivo', FIX)
        self.assertEqual(code, 0)
        self.assertIn(' 1. Desolace · solo Whirlwind Stormwalker', txt)
        self.assertIn(' 2. Desolace · solo Whirlwind Shredder', txt)
        self.assertNotIn(' 3. ', txt)
        self.assertIn('Aporta: Elemental Air', txt)

    def test_sin_evaluacion_explica_como_obtenerla(self):
        with open(FIX, encoding='utf-8') as fh:
            d = json.load(fh)
        d.pop('evaluacion')
        tmp = tempfile.mkdtemp()
        try:
            f = os.path.join(tmp, 'farmeo-agente.json')
            with open(f, 'w', encoding='utf-8') as fh:
                json.dump(d, fh)
            code, txt = correr('farmeo-mob', 'Burning Exile', '--archivo', f)
            self.assertEqual(code, 2)
            self.assertIn('no trae la evaluación por mob', txt)
        finally:
            shutil.rmtree(tmp)

if __name__ == '__main__':
    unittest.main()
