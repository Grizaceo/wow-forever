"""ROI con histórico: media móvil, tendencia, retorno y paridad Python ↔ JS.

- Fixtures sintéticos deterministas con los MISMOS valores esperados que tests/roi.test.mjs.
- cargar_historico acepta v1 (store.realms) y v2 (history.scopes).
- Paridad real: roi_ruta() == roiRuta() de src/crafteo.js sobre las recetas reales de Herrería
  con un histórico sintético determinista (si hay node), comparando también precios y meta.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SCRIPT = RAIZ / 'skills' / 'wow-forever' / 'scripts' / 'consultar.py'
SRC = RAIZ / 'src'
DATA = RAIZ / 'data'

_spec = importlib.util.spec_from_file_location('consultar_roi', SCRIPT)
assert _spec is not None and _spec.loader is not None
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)


def fila(compra, vendedor):
    return ['X', 'X', 1, 0, 0, 0, 0, 0, 0, compra, vendedor]


def filaV(venta):
    return ['X', 'X', 1, 0, 0, venta, 0, 0, 0, 0, 0]


ITEMS = {'100': fila(0, 0), '300': filaV(20), '400': filaV(0)}
PRECIOS = {'100': 10, '300': 50}


def rango(a, am, v, g):
    return {'aprende': a, 'amarillo': am, 'verde': v, 'gris': g}


def R(spell, como, rg, react, extra=None):
    r = {'spell': spell, 'como': como, 'rango': rg, 'reactivos': react, 'n': {'es': 'r%d' % spell}}
    if extra:
        r.update(extra)
    return r


def S(day, low, avail):
    return {'day': day, 'low': low, 'avail': avail}


rA = R(1, 'entrenador', rango(0, 10, 10, 10), [[100, 1]], {'crea': [300, 1]})


class TestSerieHistorico(unittest.TestCase):
    def test_ordena_y_normaliza(self):
        self.assertEqual(C.serie_historico([[2506, 30, 5], [2504, 10, 2], [2505, 20, 3]]),
                         [S(2504, 10, 2), S(2505, 20, 3), S(2506, 30, 5)])
        self.assertEqual(C.serie_historico([{'day': 2505, 'low': 20, 'available': 3}, {'day': 2504, 'low': 10, 'available': 2}]),
                         [S(2504, 10, 2), S(2505, 20, 3)])
        self.assertEqual(C.serie_historico([[2504, 10]]), [S(2504, 10, None)])

    def test_descarta_invalidos(self):
        self.assertEqual(C.serie_historico([[2504, 0, 2], [2504.5, 10, 1], ['x', 10, 1], [2505, -5, 1], None, 42, [2506, 30, 5]]),
                         [S(2506, 30, 5)])
        self.assertEqual(C.serie_historico('x'), [])
        self.assertEqual(C.serie_historico(None), [])


class TestMediaMovil(unittest.TestCase):
    def test_ventana_redondeo_vacio(self):
        s = [S(2504, 10, 1), S(2505, 20, 1), S(2506, 30, 1)]
        self.assertEqual(C.media_movil(s), {'media': 20, 'n': 3, 'desde': 2504, 'hasta': 2506})
        self.assertEqual(C.media_movil(s, 2), {'media': 25, 'n': 2, 'desde': 2505, 'hasta': 2506})
        self.assertEqual(C.media_movil(s, 0), {'media': 20, 'n': 3, 'desde': 2504, 'hasta': 2506})
        self.assertEqual(C.media_movil(s, None), {'media': 20, 'n': 3, 'desde': 2504, 'hasta': 2506})
        self.assertEqual(C.media_movil([S(2504, 10, 1), S(2505, 11, 1)])['media'], 11)
        self.assertIsNone(C.media_movil([]))
        self.assertIsNone(C.media_movil(None))


class TestTendencia(unittest.TestCase):
    def test_direcciones_umbral_redondeo(self):
        self.assertEqual(C.tendencia([S(2504, 10, 1), S(2505, 20, 1)]), {'direccion': 'sube', 'deltaPct': 100})
        self.assertEqual(C.tendencia([S(2504, 20, 1), S(2505, 10, 1)]), {'direccion': 'baja', 'deltaPct': -50})
        self.assertEqual(C.tendencia([S(2504, 100, 1), S(2505, 101, 1)]), {'direccion': 'plana', 'deltaPct': 1})
        self.assertEqual(C.tendencia([S(2504, 100, 1), S(2505, 102, 1)]), {'direccion': 'plana', 'deltaPct': 2})
        self.assertEqual(C.tendencia([S(2504, 100, 1), S(2505, 103, 1)]), {'direccion': 'sube', 'deltaPct': 3})
        self.assertEqual(C.tendencia([S(2504, 3, 1), S(2505, 4, 1)]), {'direccion': 'sube', 'deltaPct': 33.3})
        self.assertIsNone(C.tendencia([S(2504, 10, 1)]))
        self.assertIsNone(C.tendencia([]))
        self.assertIsNone(C.tendencia([S(2504, 0, 1), S(2505, 10, 1)]))


class TestPreciosHistoricos(unittest.TestCase):
    def test_media_meta_descartes(self):
        precios, meta = C.precios_historicos({'100': [[2504, 10, 2], [2505, 20, 3]], '200': [[2504, 50, 1]], 'bad': 'x', '0': [[2504, 5, 1]]})
        self.assertEqual(precios, {'100': 15, '200': 50})
        self.assertEqual(meta['100'], {'media': 15, 'n': 2, 'desde': 2504, 'hasta': 2505, 'direccion': 'sube', 'deltaPct': 100})
        self.assertEqual(meta['200'], {'media': 50, 'n': 1, 'desde': 2504, 'hasta': 2504, 'direccion': None, 'deltaPct': None})
        p1, _ = C.precios_historicos({'100': [[2504, 10, 2], [2505, 20, 3]]}, 1)
        self.assertEqual(p1['100'], 20)


class TestRoiRuta(unittest.TestCase):
    def test_retorno_vendedor_y_estimado(self):
        roi = C.roi_ruta([rA], 0, 10, PRECIOS, ITEMS)
        self.assertEqual(roi['coste'], 100)
        self.assertEqual(roi['retornoVendedor'], 200)
        self.assertEqual(roi['retornoEstimado'], 500)
        self.assertEqual(roi['roiVendedor'], 2)
        self.assertEqual(roi['roiEstimado'], 5)
        self.assertEqual(roi['netoVendedor'], 100)
        self.assertEqual(roi['netoEstimado'], 400)
        self.assertEqual(roi['pasosConValor'], 1)
        self.assertEqual(roi['pasosSinValor'], 0)
        self.assertEqual(roi['cobertura'], 1)
        self.assertEqual(roi['huecos'], 0)

    def test_ah_bajo_vendedor_usa_el_mayor(self):
        roi = C.roi_ruta([rA], 0, 10, {'100': 10, '300': 5}, ITEMS)
        self.assertEqual(roi['retornoVendedor'], 200)
        self.assertEqual(roi['retornoEstimado'], 200)
        self.assertEqual(roi['roiEstimado'], 2)

    def test_yield(self):
        rY = R(1, 'entrenador', rango(0, 10, 10, 10), [[100, 1]], {'crea': [300, 2]})
        roi = C.roi_ruta([rY], 0, 10, PRECIOS, ITEMS)
        self.assertEqual(roi['retornoVendedor'], 400)
        self.assertEqual(roi['retornoEstimado'], 1000)

    def test_crea_null_y_sin_valor(self):
        rEnc = R(2, 'entrenador', rango(0, 10, 10, 10), [[100, 1]], {'crea': None})
        enc = C.roi_ruta([rEnc], 0, 10, {'100': 10}, ITEMS)
        self.assertEqual(enc['pasosSinValor'], 1)
        self.assertEqual(enc['pasosConValor'], 0)
        self.assertEqual(enc['retornoVendedor'], 0)
        self.assertEqual(enc['retornoEstimado'], 0)
        self.assertEqual(enc['roiVendedor'], 0)
        self.assertEqual(enc['netoVendedor'], -100)
        rSin = R(3, 'entrenador', rango(0, 10, 10, 10), [[100, 1]], {'crea': [777, 1]})
        sin = C.roi_ruta([rSin], 0, 10, {'100': 10}, ITEMS)
        self.assertEqual(sin['pasosSinValor'], 1)
        self.assertEqual(sin['retornoEstimado'], 0)

    def test_sin_ruta_coste_null(self):
        rD = R(4, 'entrenador', rango(0, 10, 10, 10), [[888, 1]])
        roi = C.roi_ruta([rD], 0, 10, {'100': 10}, ITEMS)
        self.assertIsNone(roi['coste'])
        self.assertIsNone(roi['roiVendedor'])
        self.assertIsNone(roi['roiEstimado'])
        self.assertIsNone(roi['netoVendedor'])
        self.assertIsNone(roi['netoEstimado'])
        self.assertEqual(roi['cobertura'], 0)
        self.assertEqual(roi['huecos'], 1)

    def test_tendencia_resumen(self):
        con = C.roi_ruta([rA], 0, 10, PRECIOS, ITEMS, meta={'100': {'direccion': 'sube'}})
        self.assertEqual(con['tendenciaResumen'], {'suben': 1, 'bajan': 0, 'planas': 0, 'sinHist': 0})
        sin = C.roi_ruta([rA], 0, 10, PRECIOS, ITEMS)
        self.assertIsNone(sin['tendenciaResumen'])
        ajena = C.roi_ruta([rA], 0, 10, PRECIOS, ITEMS, meta={'200': {'direccion': 'baja'}})
        self.assertEqual(ajena['tendenciaResumen'], {'suben': 0, 'bajan': 0, 'planas': 0, 'sinHist': 1})

    def test_determinista(self):
        self.assertEqual(C.roi_ruta([rA], 0, 10, PRECIOS, ITEMS), C.roi_ruta([rA], 0, 10, PRECIOS, ITEMS))


class TestCargarHistorico(unittest.TestCase):
    def _cargar(self, obj, reino=None):
        with tempfile.TemporaryDirectory() as td:
            f = os.path.join(td, 'h.json')
            with open(f, 'w', encoding='utf-8') as fh:
                json.dump(obj, fh)
            return C.cargar_historico(f, reino)

    def test_v1(self):
        items, meta = self._cargar({'revision': 4, 'store': {'v': 1, 'realms': {'PvP': {'items': {'100': [[2504, 10, 2]]}}}}})
        self.assertEqual(items, {'100': [[2504, 10, 2]]})
        self.assertEqual(meta, {'reino': 'PvP', 'v': 1})

    def test_v1_reino_case_insensitive_y_fallback(self):
        obj = {'store': {'v': 1, 'realms': {'PvP': {'items': {'100': [[2504, 10, 2]]}}}}}
        _, meta = self._cargar(obj, 'pvp')
        self.assertEqual(meta['reino'], 'PvP')
        _, meta2 = self._cargar(obj, 'NoExiste')  # fallback al primero, como cargar_precios
        self.assertEqual(meta2['reino'], 'PvP')

    def test_v2_scopes(self):
        obj = {'history': {'v': 2, 'scopes': {
            'id1': {'realms': {'PvP': {'items': {'100': [[2504, 10, 2]]}}}},
            'id2': {'realms': {'PvP': {'items': {'200': [[2504, 20, 1]]}}}}}}}
        items, meta = self._cargar(obj, 'PvP')
        self.assertEqual(items, {'100': [[2504, 10, 2]], '200': [[2504, 20, 1]]})
        self.assertEqual(meta['v'], 2)

    def test_formato_no_reconocido(self):
        with self.assertRaises(C.ErrorConsulta):
            self._cargar({})
        with self.assertRaises(C.ErrorConsulta):
            self._cargar({'store': {'realms': {}}})


@unittest.skipUnless(shutil.which('node'), 'node no disponible')
class TestParidadJS(unittest.TestCase):
    def test_roi_igual_que_js_en_datos_reales(self):
        with open(DATA / 'profesiones.json', encoding='utf-8') as f:
            recetas = json.load(f)['profesiones']['164']['recetas']
        with open(DATA / 'items.json', encoding='utf-8') as f:
            items = json.load(f)['items']
        ids = set()
        for r in recetas:
            for par in r.get('reactivos') or []:
                ids.add(par[0] if isinstance(par, list) else par)
            if r.get('crea') is not None:
                ids.add(r['crea'][0] if isinstance(r['crea'], list) else r['crea'])
            if r.get('receta_item'):
                ids.add(r['receta_item'])
        # Histórico sintético determinista: 1-8 días por ítem, mínimos variables.
        history = {}
        for i in sorted(ids):
            n = (i % 8) + 1
            history[str(i)] = [[2504 + k, ((i * 7 + k * 13) % 500) + 1, (k % 5) + 1] for k in range(n)]
        precios, meta = C.precios_historicos(history)
        py_roi = C.roi_ruta(recetas, 1, 300, precios, items, 'horda', meta)
        fixture = {'recetas': recetas, 'items': items, 'historyItems': history, 'desde': 1, 'cap': 300, 'faccion': 'horda'}
        with tempfile.TemporaryDirectory() as td:
            fj = os.path.join(td, 'f.json')
            with open(fj, 'w', encoding='utf-8') as f:
                json.dump(fixture, f)
            mj = os.path.join(td, 'p.mjs')
            uri = (SRC / 'crafteo.js').as_uri()
            with open(mj, 'w', encoding='utf-8') as f:
                f.write("import { preciosHistoricos, roiRuta } from %s\n" % json.dumps(uri))
                f.write("import { readFileSync } from 'node:fs'\n")
                f.write("const f = JSON.parse(readFileSync(process.argv[2], 'utf8'))\n")
                f.write("const { precios, meta } = preciosHistoricos(f.historyItems)\n")
                f.write("const roi = roiRuta(f.recetas, f.desde, f.cap, precios, f.items, { faccion: f.faccion, meta })\n")
                f.write("process.stdout.write(JSON.stringify({ roi, precios: Object.fromEntries(precios), meta }))\n")
            proc = subprocess.run(['node', mj, fj], capture_output=True, text=True, timeout=180)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            js = json.loads(proc.stdout)
        self.assertEqual(js['roi'], py_roi)
        self.assertEqual(js['precios'], precios)
        self.assertEqual(js['meta'], meta)


if __name__ == '__main__':
    unittest.main()