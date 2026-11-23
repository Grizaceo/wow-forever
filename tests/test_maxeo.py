"""Ruta de maxeo con coste de adquisición: paridad Python ↔ JS y adaptador de precios.

- Fixtures sintéticos deterministas con los MISMOS valores esperados que tests/ruta-maxeo.test.mjs.
- cargar_precios acepta los cuatro formatos (canónico, plano, bundle legacy, extracción).
- Paridad real: ruta_maxeo() == rutaMaxeo() de src/crafteo.js sobre las recetas reales de
  Herrería con precios sintéticos deterministas (si hay node), como hace test_skill.py con
  dificultad_receta ↔ dificultadReceta.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SCRIPT = RAIZ / 'skills' / 'wow-forever' / 'scripts' / 'consultar.py'
SRC = RAIZ / 'src'
DATA = RAIZ / 'data'

_spec = importlib.util.spec_from_file_location('consultar_maxeo', SCRIPT)
assert _spec is not None and _spec.loader is not None
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)


def fila(compra, vendedor):
    return ['X', 'X', 1, 0, 0, 0, 0, 0, 0, compra, vendedor]


ITEMS = {'100': fila(0, 0), '200': fila(50, 1), '999': fila(0, 0)}
PRECIOS = {'100': 10}


def rango(a, am, v, g):
    return {'aprende': a, 'amarillo': am, 'verde': v, 'gris': g}


def R(spell, como, rg, react, extra=None):
    r = {'spell': spell, 'como': como, 'rango': rg, 'reactivos': react, 'n': {'es': 'r%d' % spell}}
    if extra:
        r.update(extra)
    return r


r1 = R(1, 'entrenador', rango(0, 5, 8, 10), [[100, 1]])
r2 = R(2, 'entrenador', rango(0, 5, 8, 10), [[100, 2]])
PLAN = R(2, 'receta', rango(0, 5, 8, 10), [[100, 1]],
         {'receta_item': 200, 'vendedores': {'alianza': [{'npc': 1}], 'horda': [{'npc': 1}]}})
FREE = R(1, 'entrenador', rango(0, 5, 8, 10), [[100, 2]])


class TestCostoAdquisicion(unittest.TestCase):
    def test_gratis_vendedor_subasta_sindato(self):
        self.assertEqual(C.costo_adquisicion(r1, PRECIOS, ITEMS), {'cobre': 0, 'fuente': 'gratis', 'item': None})
        auto = R(9, 'automatica', rango(0, 5, 8, 10), [[100, 1]])
        self.assertEqual(C.costo_adquisicion(auto, PRECIOS, ITEMS)['cobre'], 0)
        self.assertEqual(C.costo_adquisicion(PLAN, PRECIOS, ITEMS), {'cobre': 50, 'fuente': 'vendedor', 'item': 200})
        plan_ah = R(4, 'receta', rango(0, 5, 8, 10), [[100, 1]], {'receta_item': 200, 'vendedores': {'alianza': [], 'horda': []}})
        self.assertEqual(C.costo_adquisicion(plan_ah, {'200': 30}, ITEMS), {'cobre': 30, 'fuente': 'subasta', 'item': 200})
        self.assertIsNone(C.costo_adquisicion(plan_ah, PRECIOS, ITEMS)['cobre'])
        desc = R(5, 'desconocido', rango(0, 5, 8, 10), [[100, 1]])
        self.assertIsNone(C.costo_adquisicion(desc, PRECIOS, ITEMS)['cobre'])

    def test_faccion(self):
        plan = R(3, 'receta', rango(0, 5, 8, 10), [[100, 1]],
                 {'receta_item': 200, 'vendedores': {'alianza': [{'npc': 1}], 'horda': []}})
        self.assertEqual(C.costo_adquisicion(plan, PRECIOS, ITEMS, 'alianza')['cobre'], 50)
        self.assertIsNone(C.costo_adquisicion(plan, PRECIOS, ITEMS, 'horda')['cobre'])
        self.assertEqual(C.costo_adquisicion(plan, {'200': 30}, ITEMS, 'horda')['fuente'], 'subasta')


class TestRutaMaxeo(unittest.TestCase):
    def test_sin_adquisicion_menor_coste_por_punto(self):
        ruta = C.ruta_maxeo([r1, r2], 0, 10, PRECIOS, ITEMS)
        self.assertEqual(len(ruta['pasos']), 1)
        self.assertEqual(ruta['pasos'][0]['spell'], 1)
        self.assertEqual((ruta['pasos'][0]['desde'], ruta['pasos'][0]['hasta']), (0, 10))
        self.assertEqual(ruta['pasos'][0]['crafteos'], 16)
        self.assertEqual(ruta['pasos'][0]['costo'], 164)
        self.assertEqual(ruta['totalMateriales'], 164)
        self.assertEqual(ruta['totalAdquisicion'], 0)
        self.assertEqual(ruta['total'], 164)
        self.assertEqual(ruta['cobertura'], 1)
        self.assertEqual(ruta['huecos'], [])
        self.assertEqual(ruta['adquisiciones'], [])

    def test_amortiza_adquisicion_tramo_largo(self):
        ruta = C.ruta_maxeo([FREE, PLAN], 0, 10, PRECIOS, ITEMS)
        self.assertEqual(len(ruta['pasos']), 1)
        self.assertEqual(ruta['pasos'][0]['spell'], 2)
        self.assertEqual(ruta['totalAdquisicion'], 50)
        self.assertEqual(ruta['adquisiciones'], [{'spell': 2, 'item': 200, 'cobre': 50, 'fuente': 'vendedor', 'desde': 0}])
        self.assertEqual(ruta['totalMateriales'], 164)
        self.assertEqual(ruta['total'], 214)
        self.assertEqual(ruta['cobertura'], 1)

    def test_tramo_corto_gana_la_gratis(self):
        ruta = C.ruta_maxeo([FREE, PLAN], 8, 10, PRECIOS, ITEMS)
        self.assertEqual(ruta['pasos'][0]['spell'], 1)
        self.assertEqual(ruta['totalAdquisicion'], 0)
        self.assertEqual(ruta['totalMateriales'], 150)
        self.assertEqual(ruta['total'], 150)

    def test_hueco_sin_precio_y_adquisicion_sin_dato(self):
        cubre = R(1, 'entrenador', rango(0, 2, 3, 5), [[100, 1]])
        sin_acq = R(3, 'receta', rango(5, 7, 8, 10), [[100, 1]], {'receta_item': 999, 'vendedores': {'alianza': [], 'horda': []}})
        sin_precio = R(4, 'entrenador', rango(5, 7, 8, 10), [[777, 1]])
        ruta = C.ruta_maxeo([cubre, sin_acq, sin_precio], 0, 10, PRECIOS, ITEMS)
        self.assertEqual(ruta['cobertura'], 0.5)
        self.assertEqual(len(ruta['pasos']), 1)
        self.assertEqual(ruta['pasos'][0]['hasta'], 5)
        self.assertEqual(ruta['totalMateriales'], 75)
        self.assertEqual(ruta['huecos'], [{'desde': 5, 'hasta': 10, 'motivo': 'recetas sin precio de reactivos o sin receta conocida'}])
        self.assertTrue(any(x['spell'] == 3 and x['item'] == 999 for x in ruta['adquisicionesSinDato']))
        self.assertTrue(any(x['spell'] == 4 and 777 in x['faltan'] for x in ruta['sinPrecio']))

    def test_invalidos(self):
        for args in [([], 0, 10), (None, 0, 10), ([r1], 10, 10), ([r1], 5, 0)]:
            ruta = C.ruta_maxeo(args[0], args[1], args[2], PRECIOS, ITEMS)
            self.assertEqual(ruta['pasos'], [])
            self.assertEqual(ruta['cobertura'], 0)
            self.assertIsNone(ruta['total'])

    def test_determinista(self):
        self.assertEqual(C.ruta_maxeo([r1, r2], 0, 30, PRECIOS, ITEMS),
                         C.ruta_maxeo([r1, r2], 0, 30, PRECIOS, ITEMS))


class TestCargarPrecios(unittest.TestCase):
    def _cargar(self, obj, reino=None):
        with tempfile.TemporaryDirectory() as td:
            f = os.path.join(td, 'p.json')
            with open(f, 'w', encoding='utf-8') as fh:
                json.dump(obj, fh)
            return C.cargar_precios(f, reino)

    def test_canonico(self):
        vals, meta = self._cargar({'schemaVersion': 1, 'reino': 'R', 'fecha': '2026-01-01', 'valores': {'100': 10, '200': 50}})
        self.assertEqual(vals, {'100': 10, '200': 50})
        self.assertEqual(meta['reino'], 'R')

    def test_plano(self):
        vals, _ = self._cargar({'100': 10, '200': 50, 'meta': 'x'})
        self.assertEqual(vals, {'100': 10, '200': 50})

    def test_bundle_legacy(self):
        bundle = {'values': {'snapshot': {'importedAt': '2026-01-01T00:00:00Z', 'realms': [
            {'name': 'R', 'items': [{'itemId': 100, 'unitPriceCopper': 10}, {'itemId': 200, 'unitPriceCopper': 50}, {'itemId': 0, 'unitPriceCopper': 5}]}]}}}
        vals, meta = self._cargar(bundle)
        self.assertEqual(vals, {'100': 10, '200': 50})
        self.assertEqual(meta['reino'], 'R')

    def test_extraccion_por_reino(self):
        ext = {'meta': {'reino': 'R'}, 'precios_por_reino': {'R': {'100': 10}, 'Otro': {'100': 99}}}
        vals, meta = self._cargar(ext)
        self.assertEqual(vals, {'100': 10})
        vals2, _ = self._cargar(ext, 'Otro')
        self.assertEqual(vals2, {'100': 99})

    def test_reino_inexistente_y_vacio(self):
        with self.assertRaises(C.ErrorConsulta):
            self._cargar({'precios_por_reino': {'R': {'100': 10}}}, 'NoExiste')
        with self.assertRaises(C.ErrorConsulta):
            self._cargar({'valores': {}})


@unittest.skipUnless(shutil.which('node'), 'node no disponible')
class TestParidadJS(unittest.TestCase):
    def test_ruta_maxeo_igual_que_js_en_datos_reales(self):
        with open(DATA / 'profesiones.json', encoding='utf-8') as f:
            recetas = json.load(f)['profesiones']['164']['recetas']
        with open(DATA / 'items.json', encoding='utf-8') as f:
            items = json.load(f)['items']
        ids = set()
        for r in recetas:
            for par in r.get('reactivos') or []:
                ids.add(par[0] if isinstance(par, list) else par)
            if r.get('receta_item'):
                ids.add(r['receta_item'])
        precios = {str(i): (i % 500) + 1 for i in ids}
        fixture = {'recetas': recetas, 'items': items, 'precios': precios, 'desde': 1, 'cap': 300, 'faccion': 'horda'}
        with tempfile.TemporaryDirectory() as td:
            fj = os.path.join(td, 'f.json')
            with open(fj, 'w', encoding='utf-8') as f:
                json.dump(fixture, f)
            mj = os.path.join(td, 'p.mjs')
            uri = (SRC / 'crafteo.js').as_uri()
            with open(mj, 'w', encoding='utf-8') as f:
                f.write("import { rutaMaxeo } from %s\n" % json.dumps(uri))
                f.write("import { readFileSync } from 'node:fs'\n")
                f.write("const f = JSON.parse(readFileSync(process.argv[2], 'utf8'))\n")
                f.write("process.stdout.write(JSON.stringify(rutaMaxeo(f.recetas, f.desde, f.cap, f.precios, f.items, { faccion: f.faccion })))\n")
            proc = subprocess.run(['node', mj, fj], capture_output=True, text=True, encoding='utf-8', timeout=180)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            js = json.loads(proc.stdout)
        py = C.ruta_maxeo(recetas, 1, 300, precios, items, 'horda')
        self.assertEqual(js, py)


if __name__ == '__main__':
    unittest.main()
