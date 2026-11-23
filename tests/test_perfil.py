"""Paridad del perfil: skills/wow-forever/scripts/perfil.py == src/perfil.js.

- validar_perfil() produce el mismo {ok, errores, perfil} que validarPerfil() de
  src/perfil.js para las mismas entradas (fixture compartido tests/fixtures/
  perfil-paridad.json, generado con la implementación JS).
- Las 56 combinaciones de data/personaje.json valen en los niveles 1/10/20/40/60
  en ambas facciones; paladín Horda, chamán Alianza y razas 95/96 incluidos.
- Las constantes salen de contracts/perfil-v1.json, no de copias locales.
"""
import ast
import json
import os
import sys
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(RAIZ, 'skills', 'wow-forever', 'scripts')
sys.path.insert(0, SCRIPTS)
sys.dont_write_bytecode = True
import perfil  # noqa: E402

PERFIL_PY = os.path.join(SCRIPTS, 'perfil.py')
PERMITIDOS = {'json', 'math', 're', 'sys', 'unicodedata', 'pathlib', 'argparse'}

with open(os.path.join(RAIZ, 'data', 'personaje.json'), encoding='utf-8') as f:
    PERSONAJE = json.load(f)
with open(os.path.join(RAIZ, 'tests', 'fixtures', 'perfil-paridad.json'), encoding='utf-8') as f:
    FIXTURE = json.load(f)

NOMUERTO, ENANO, ORCO = 5, 3, 2
PALADIN, GUERRERO, CHAMAN, DRUIDA = 2, 1, 7, 11


class TestPerfilPy(unittest.TestCase):
    def test_solo_stdlib(self):
        with open(PERFIL_PY, encoding='utf-8') as f:
            arbol = ast.parse(f.read())
        importados = set()
        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.Import):
                importados |= {a.name.split('.')[0] for a in nodo.names}
            elif isinstance(nodo, ast.ImportFrom):
                importados.add(nodo.module.split('.')[0])
        self.assertLessEqual(importados, PERMITIDOS)

    def test_constantes_desde_el_contrato(self):
        with open(os.path.join(RAIZ, 'contracts', 'perfil-v1.json'), encoding='utf-8') as f:
            contrato = json.load(f)
        self.assertEqual(contrato['contrato'], 'perfil-v1')
        c = contrato['perfil']
        self.assertEqual(perfil.VERSION, c['version'])
        self.assertEqual(perfil.NIVEL_MIN, c['nivel_min'])
        self.assertEqual(perfil.NIVEL_MAX, c['nivel_max'])
        self.assertEqual(perfil.PROFESIONES_PRINCIPALES, c['profesiones_principales'])
        self.assertEqual(perfil.PROFESIONES_SECUNDARIAS, c['profesiones_secundarias'])
        self.assertEqual(perfil.MAX_PRINCIPALES, c['max_principales'])
        self.assertEqual(perfil.MAX_REINO, c['max_reino'])

    def test_56_combinaciones_en_niveles_de_prueba(self):
        for raza, clase, _nueva in PERSONAJE['combinaciones']:
            faccion = PERSONAJE['razas'][str(raza)]['faccion']
            for nivel in (1, 10, 20, 40, 60):
                r = perfil.validar_perfil({'raza': raza, 'clase': clase, 'nivel': nivel}, PERSONAJE)
                self.assertTrue(r['ok'], f'raza {raza} clase {clase} nivel {nivel}: {r["errores"]}')
                self.assertEqual(r['perfil']['faccion'], faccion)
                self.assertEqual(r['perfil']['nivel'], nivel)

    def test_casos_pedidos(self):
        casos = [
            ({'raza': NOMUERTO, 'clase': PALADIN, 'nivel': 60}, 'horda'),
            ({'raza': ENANO, 'clase': CHAMAN, 'nivel': 1}, 'alianza'),
            ({'raza': 95, 'clase': GUERRERO, 'nivel': 1}, 'alianza'),
            ({'raza': 96, 'clase': DRUIDA, 'nivel': 60}, 'horda'),
        ]
        for entrada, faccion in casos:
            r = perfil.validar_perfil(entrada, PERSONAJE)
            self.assertTrue(r['ok'], r['errores'])
            self.assertEqual(r['perfil']['faccion'], faccion)

    def test_perfil_incompleto_y_malformado(self):
        for basura in (None, 42, 'x', [], {}):
            r = perfil.validar_perfil(basura, PERSONAJE)
            self.assertFalse(r['ok'])
            self.assertIsNone(r['perfil']['raza'])
        r = perfil.validar_perfil({'raza': 'orco'}, PERSONAJE)
        self.assertEqual(r['errores'], ['raza', 'clase', 'nivel'])
        self.assertEqual(r['perfil']['nivel'], 1)

    def test_profesiones_ids_y_desconocidas(self):
        base = {'raza': ORCO, 'clase': GUERRERO, 'nivel': 5}
        r = perfil.validar_perfil(dict(base, profesiones=[164, '186', 164, 393, 202, 0, -1, 1.5],
                                       secundarias=[164, 999]), PERSONAJE)
        self.assertEqual(r['perfil']['profesiones'], [164, 186])
        self.assertEqual(r['perfil']['secundarias'], [])
        self.assertIn('profesiones', r['errores'])
        self.assertIn('secundarias', r['errores'])
        r2 = perfil.validar_perfil(dict(base, profesiones=[164, 186],
                                        secundarias=[185, 129, 356]), PERSONAJE)
        self.assertTrue(r2['ok'], r2['errores'])
        self.assertEqual(r2['perfil']['secundarias'], [129, 185, 356])

    def test_reino_trunca_y_valida_tipo(self):
        base = {'raza': ORCO, 'clase': GUERRERO, 'nivel': 5}
        self.assertEqual(perfil.validar_perfil(dict(base, reino='  Mi reino  '), PERSONAJE)['perfil']['reino'],
                         'Mi reino')
        self.assertEqual(len(perfil.validar_perfil(dict(base, reino='x' * 100), PERSONAJE)['perfil']['reino']), 64)
        r = perfil.validar_perfil(dict(base, reino=123), PERSONAJE)
        self.assertIn('reino', r['errores'])
        self.assertEqual(r['perfil']['reino'], '')

    def test_paridad_con_fixture_js(self):
        self.assertEqual(FIXTURE['contrato'], 'perfil-v1')
        self.assertGreaterEqual(len(FIXTURE['casos']), 30)
        for caso in FIXTURE['casos']:
            with self.subTest(caso=caso['nombre']):
                self.assertEqual(perfil.validar_perfil(caso['entrada'], PERSONAJE), caso['esperado'])

    def test_regresiones_utf16_trim_y_precision(self):
        base = {'raza': 1, 'clase': 3, 'nivel': 5}
        emoji = chr(0x1F600)
        # JS slice cuenta unidades UTF-16: 40 emoji + 3 ASCII -> 32 emoji.
        r = perfil.validar_perfil(dict(base, reino=emoji * 40 + 'ABC'), PERSONAJE)
        self.assertEqual(r['perfil']['reino'], emoji * 32)
        # Corte en mitad de un par deja un surrogado alto suelto, como JS.
        r = perfil.validar_perfil(dict(base, reino='x' * 63 + emoji), PERSONAJE)
        self.assertEqual(len(r['perfil']['reino']), perfil.MAX_REINO)
        self.assertEqual(ord(r['perfil']['reino'][-1]), 0xD83D)
        # \s de Python recorta de más: JS trim conserva U+0085 y U+001C.
        for cp in (0x85, 0x1C):
            ch = chr(cp)
            r = perfil.validar_perfil(dict(base, reino=ch + 'Reino' + ch), PERSONAJE)
            self.assertEqual(r['perfil']['reino'], ch + 'Reino' + ch)
        # La rama cadena de JS no exige isInteger: '9'*400 es Infinity -> nivel 60.
        r = perfil.validar_perfil({'raza': 1, 'clase': 3, 'nivel': '9' * 400}, PERSONAJE)
        self.assertEqual(r['perfil']['nivel'], 60)
        self.assertEqual(r['errores'], ['nivel'])

    def test_regresion_valores_personaje_no_dict(self):
        raro = json.loads(json.dumps(PERSONAJE))
        raro['razas']['1'] = 'notdict'
        raro['razas']['2'] = {}
        raro['clases']['3'] = 'x'
        # JS comprueba truthiness, no isinstance(dict): coincide con la validación JS.
        esperado = [True, True, True]
        for entrada, ok in zip(({'raza': 1, 'clase': 1, 'nivel': 5},
                                {'raza': 2, 'clase': 1, 'nivel': 5},
                                {'raza': 1, 'clase': 3, 'nivel': 5}), esperado):
            self.assertEqual(perfil.validar_perfil(entrada, raro)['ok'], ok, entrada)


if __name__ == '__main__':
    unittest.main()
