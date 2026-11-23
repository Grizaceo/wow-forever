"""Correcciones cuantitativas (auditoría H1,H4,H5,H11,H12,H13) e invariante doc del piloto.

Mismos valores esperados que tests/cuantitativo.test.mjs. Sin datos reales: sólo fixtures
sintéticos y las cifras ya publicadas en docs/PROFESIONES-INTELIGENTES.md.
"""
import importlib.util
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SCRIPT = RAIZ / 'skills' / 'wow-forever' / 'scripts' / 'consultar.py'
SRC = RAIZ / 'src'
DATA = RAIZ / 'data'
DOC = RAIZ / 'docs' / 'PROFESIONES-INTELIGENTES.md'

_spec = importlib.util.spec_from_file_location('consultar_cuantitativo', SCRIPT)
assert _spec is not None and _spec.loader is not None
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)


def fila(compra, vendedor):
    return ['X', 'X', 1, 0, 0, 0, 0, 0, 0, compra, vendedor]


def filaV(venta):
    return ['X', 'X', 1, 0, 0, venta, 0, 0, 0, 0, 0]


ITEMS = {'100': fila(0, 0), '300': filaV(20), '301': filaV(30), '302': filaV(2000)}


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


class TestH1Comision(unittest.TestCase):
    def test_ah_neto_y_suelo(self):
        self.assertEqual(C.AH_CUT, 0.05)
        roi = C.roi_ruta([rA], 0, 10, {'100': 10, '300': 50}, ITEMS)
        self.assertEqual(roi['retornoVendedor'], 200)
        self.assertEqual(roi['retornoEstimado'], 475)
        self.assertEqual(roi['roiEstimado'], 4.75)
        self.assertEqual(roi['netoEstimado'], 375)
        self.assertEqual(roi['comisionAH'], 0.05)
        self.assertEqual(roi['rentabilidadVendedor'], 1)
        self.assertEqual(roi['rentabilidadEstimada'], 3.75)
        self.assertIn('retorno/coste', roi['convencionRetorno'])

    def test_suelo_no_se_hunde(self):
        roi = C.roi_ruta([rA], 0, 10, {'100': 10, '300': 5}, ITEMS)
        self.assertEqual(roi['retornoVendedor'], 200)
        self.assertEqual(roi['retornoEstimado'], 200)


class TestH5CraftsFraccionales(unittest.TestCase):
    def test_retorno_usa_crafts_exactos(self):
        r_frac = R(7, 'entrenador', rango(0, 0, 4, 5), [[100, 1]], {'crea': [301, 1]})
        ruta = C.ruta_maxeo([r_frac], 2, 3, {'100': 10}, ITEMS)
        self.assertEqual(ruta['pasos'][0]['crafteos'], 2)
        self.assertAlmostEqual(ruta['pasos'][0]['crafteosExactos'], 5 / 3)
        roi = C.roi_ruta([r_frac], 2, 3, {'100': 10}, ITEMS)
        self.assertEqual(roi['coste'], 17)
        self.assertEqual(roi['retornoVendedor'], 50)
        self.assertEqual(roi['retornoEstimado'], 50)


class TestH4Probabilidad(unittest.TestCase):
    def test_lineal_y_aviso(self):
        self.assertEqual(C.prob_subida(rango(0, 0, 4, 5), 2), 0.6)
        self.assertEqual(C.prob_subida(rango(0, 10, 10, 10), 2), 1)
        self.assertEqual(C.prob_subida(rango(0, 0, 4, 5), 5), 0)
        self.assertIn('aproximad', C.PROB_SUBIDA_AVISO)
        self.assertIn('NO verificada', C.PROB_SUBIDA_AVISO)
        self.assertIn('esperanza', C.PROB_SUBIDA_AVISO)
        ruta = C.ruta_maxeo([rA], 0, 10, {'100': 10}, ITEMS)
        self.assertEqual(ruta['avisoProbabilidad'], C.PROB_SUBIDA_AVISO)


class TestH11Robusto(unittest.TestCase):
    def test_mediana_y_mitades(self):
        serie = [S(2504, 1000, 1), S(2505, 100, 1), S(2506, 100, 1), S(2507, 100, 1)]
        self.assertEqual(C.mediana([1000, 100, 100, 100]), 100)
        self.assertEqual(C.mediana_movil(serie), {'media': 100, 'n': 4, 'desde': 2504, 'hasta': 2507})
        self.assertEqual(C.tendencia_robusta(serie),
                         {'direccion': 'baja', 'deltaPct': -81.8, 'medianaPrimera': 550,
                          'medianaSegunda': 100, 'n': 4})
        self.assertIsNone(C.tendencia_robusta([S(2504, 100, 1), S(2505, 103, 1)]))
        self.assertEqual(C.tendencia_robusta([S(2504, 100, 1), S(2505, 100, 1),
                                              S(2506, 100, 1), S(2507, 103, 1)])['direccion'], 'plana')
        self.assertEqual(C.TENDENCIA_ROBUSTA['minPuntos'], 4)
        self.assertEqual(C.TENDENCIA_ROBUSTA['umbralPct'], 5)

    def test_precios_historicos_robusto(self):
        precios, meta = C.precios_historicos(
            {'100': [[2504, 1000, 1], [2505, 100, 1], [2506, 100, 1], [2507, 100, 1]]},
            opts={'robusto': True})
        self.assertEqual(precios['100'], 100)
        self.assertEqual(meta['100']['direccion'], 'baja')
        self.assertEqual(meta['100']['medianaPrimera'], 550)


class TestH12Saturacion(unittest.TestCase):
    def test_solo_si_llamador_la_da(self):
        r_sat = R(8, 'entrenador', rango(0, 150, 150, 150), [[100, 1]], {'crea': [302, 1]})
        sin = C.roi_ruta([r_sat], 0, 150, {'100': 1}, ITEMS)
        self.assertEqual(sin['retornoEstimado'], 300000)
        self.assertIsNone(sin['retornoEstimadoAjustado'])
        self.assertIsNone(sin['saturacion'])
        con = C.roi_ruta([r_sat], 0, 150, {'100': 1}, ITEMS, saturacion=0.74)
        self.assertEqual(con['retornoEstimado'], 300000)
        self.assertEqual(con['retornoEstimadoAjustado'], 222000)
        self.assertEqual(con['roiEstimadoAjustado'], 1480)
        self.assertIn('NO está garantizada', con['avisoSaturacion'])


class TestH13Resumen(unittest.TestCase):
    def test_cobertura_no_cota_inferior(self):
        sin_acq = R(10, 'receta', rango(0, 10, 10, 10), [[100, 1]],
                    {'receta_item': 999, 'vendedores': {}, 'crea': [300, 1]})
        roi = C.roi_ruta([rA, sin_acq], 0, 10, {'100': 10}, ITEMS)
        self.assertEqual(roi['recetasConsideradas'], 1)
        self.assertEqual(roi['adquisicionesSinDato'], 1)
        self.assertIn('no es una cota inferior', roi['avisoCobertura'])


def copper(texto):
    """'6.689.613' / '−4.463.154' / '0,33' -> int (cobre o centésimas)."""
    return int(texto.strip().replace('.', '').replace(',', '').replace('\u2212', '-').replace(' ', ''))


class TestInvariantePiloto(unittest.TestCase):
    def fila_herreria(self):
        txt = DOC.read_text(encoding='utf-8')
        self.assertIn('### Control numérico del piloto', txt)
        bloque = txt.split('### Control numérico del piloto', 1)[1]
        filas = [ln for ln in bloque.splitlines() if ln.startswith('| Herrería |')]
        self.assertTrue(filas)
        celdas = [c.strip() for c in filas[0].strip('|').split('|')]
        self.assertEqual(len(celdas), 10)  # skill + 9 cifras
        return [copper(c) for c in celdas[1:]]

    def test_invariantes_contables(self):
        mat, adq, coste, rv, nv, re, ne, roi_v, roi_e = self.fila_herreria()
        self.assertEqual(coste, mat + adq)
        self.assertEqual(nv, rv - coste)
        self.assertEqual(ne, re - coste)
        # Las celdas ROI guardan el ratio en centésimas (0,33 -> 33).
        self.assertEqual(roi_v, round(rv / coste * 100))
        self.assertEqual(roi_e, round(re / coste * 100))

    def test_cifra_declarada_incoherente_queda_fuera(self):
        # Counterexample de la auditoría: números de otra corrida, NO los de la tabla.
        _, _, coste, rv, nv_tabla, _, ne_tabla, _, _ = self.fila_herreria()
        nv_declarado, ne_declarado = -4476846, -2395965  # cifras previamente publicadas
        nv = rv - coste
        ne = 4305578 - coste
        self.assertEqual(coste, 6689613)
        self.assertEqual(rv, 2226459)
        self.assertEqual(nv_tabla, nv)  # la tabla publicada SÍ cumple la identidad
        self.assertEqual(ne_tabla, ne)
        self.assertEqual(abs(nv_declarado - nv), 13692)
        self.assertEqual(abs(ne_declarado - ne), 11930)
        # El fixture declarado falla la identidad con tolerancia de 1 cobre.
        self.assertGreater(abs(nv_declarado - (rv - coste)), 1)
        self.assertGreater(abs(ne_declarado - (4305578 - coste)), 1)


@unittest.skipUnless(shutil.which('node'), 'node no disponible')
class TestParidadJS(unittest.TestCase):
    def test_salidas_cuantitativas_iguales_en_datos_reales(self):
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
        history = {str(i): [[2504 + k, ((i * 7 + k * 13) % 500) + 1, (k % 5) + 1]
                            for k in range((i % 8) + 1)] for i in sorted(ids)}
        precios, meta = C.precios_historicos(history, opts={'robusto': True})
        py = C.roi_ruta(recetas, 1, 300, precios, items, 'horda', meta, saturacion=0.74)
        py_ruta = C.ruta_maxeo(recetas, 1, 300, precios, items, 'horda')
        fixture = {'recetas': recetas, 'items': items, 'historyItems': history,
                   'desde': 1, 'cap': 300, 'faccion': 'horda'}
        with tempfile.TemporaryDirectory() as td:
            fj = os.path.join(td, 'f.json')
            with open(fj, 'w', encoding='utf-8') as f:
                json.dump(fixture, f)
            mj = os.path.join(td, 'p.mjs')
            uri = (SRC / 'crafteo.js').as_uri()
            with open(mj, 'w', encoding='utf-8') as f:
                f.write("import { preciosHistoricos, roiRuta, rutaMaxeo } from %s\n" % json.dumps(uri))
                f.write("import { readFileSync } from 'node:fs'\n")
                f.write("const f = JSON.parse(readFileSync(process.argv[2], 'utf8'))\n")
                f.write("const { precios, meta } = preciosHistoricos(f.historyItems, null, { robusto: true })\n")
                f.write("const roi = roiRuta(f.recetas, f.desde, f.cap, precios, f.items, { faccion: f.faccion, meta, saturacion: 0.74 })\n")
                f.write("const ruta = rutaMaxeo(f.recetas, f.desde, f.cap, precios, f.items, { faccion: f.faccion })\n")
                f.write("process.stdout.write(JSON.stringify({ roi, ruta, precios: Object.fromEntries(precios), meta }))\n")
            proc = subprocess.run(['node', mj, fj], capture_output=True, text=True, encoding='utf-8', timeout=180)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            js = json.loads(proc.stdout)
        self.assertEqual(js['roi'], py)
        self.assertEqual(js['ruta'], py_ruta)
        self.assertEqual(js['precios'], precios)
        self.assertEqual(js['meta'], meta)


if __name__ == '__main__':
    unittest.main()
