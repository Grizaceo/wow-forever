"""consultar.py farmeo-*: lectura del contexto que escribe Mercado → Farmeo.

El fixture tests/fixtures/farmeo-agente.json es sintético (4 sesiones de
Whirlwind Shredder), generado con desktop/src/farm-sesiones.js exportAgente.
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


if __name__ == '__main__':
    unittest.main()
