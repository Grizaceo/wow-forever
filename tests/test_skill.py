"""La skill del agente: skills/wow-forever/scripts/consultar.py responde con los datos de data/.

- Solo biblioteca estándar, sin red, sin procesos y sin escribir archivos.
- Respuestas con hechos conocidos de las dos facciones (Paladín no-muerto, Chamán enano,
  Herrería a 120), con su origen y con «SIN DATOS» donde los datos declaran un hueco.
- dificultad_receta() coincide con dificultadReceta() de src/crafteo.js en todas las recetas
  (si hay node).
"""
import ast
import io
import json
import os
import shutil
import subprocess
import sys
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL = os.path.join(RAIZ, 'skills', 'wow-forever')
SCRIPT = os.path.join(SKILL, 'scripts', 'consultar.py')
sys.path.insert(0, os.path.dirname(SCRIPT))
sys.dont_write_bytecode = True  # nada de __pycache__ dentro de la skill
import consultar  # noqa: E402

PERMITIDOS = {'argparse', 'json', 'math', 'os', 'sys', 'unicodedata', 'pathlib'}


def correr(*args):
    lineas = []
    codigo = consultar.main(list(args), out=lineas.append)
    return codigo, '\n'.join(lineas)


class TestScript(unittest.TestCase):
    def test_solo_stdlib_y_solo_lectura(self):
        with open(SCRIPT, encoding='utf-8') as f:
            arbol = ast.parse(f.read())
        importados = set()
        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.Import):
                importados |= {a.name.split('.')[0] for a in nodo.names}
            elif isinstance(nodo, ast.ImportFrom):
                importados.add(nodo.module.split('.')[0])
            elif isinstance(nodo, ast.Call) and getattr(nodo.func, 'id', None) == 'open':
                modos = [a.value for a in nodo.args[1:2] if isinstance(a, ast.Constant)]
                modos += [k.value.value for k in nodo.keywords if k.arg == 'mode']
                self.assertTrue(all('r' in m and not set(m) & set('wax+') for m in modos), modos)
            elif isinstance(nodo, ast.Attribute):
                self.assertNotIn(nodo.attr, {'write_text', 'write_bytes', 'unlink', 'rmdir', 'mkdir',
                                             'system', 'popen', 'urlopen'})
        self.assertLessEqual(importados, PERMITIDOS)

    def test_ayuda_y_ruta_por_defecto(self):
        self.assertEqual(consultar.RAIZ, __import__('pathlib').Path(RAIZ))
        r = subprocess.run([sys.executable, '-I', SCRIPT, 'fuentes'], capture_output=True, text=True, cwd='/')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('cmangos-classic-db', r.stdout)

    def test_paladin_no_muerto(self):
        c, s = correr('perfil', '--raza', 'no-muerto', '--clase', 'paladin', '--nivel', '24')
        self.assertEqual(c, 0)
        self.assertIn('Horda', s)
        self.assertIn('NUEVA (no existía en 1.12)', s)
        self.assertIn('Claros de Tirisfal', s)
        c, s = correr('entrenadores', '--clase', 'Paladín', '--faccion', 'horda')
        self.assertIn('SIN DATOS (entrenadores)', s)
        self.assertNotIn('- ', s)
        c, s = correr('zonas', '--faccion', 'horda', '--nivel', '24')
        self.assertIn('Los Baldíos', s)
        self.assertIn('Vallefresno', s)
        self.assertNotIn('Páramos de Poniente', s)  # Westfall es de la Alianza
        self.assertIn('[curado]', s)

    def test_chaman_enano(self):
        c, s = correr('perfil', '--raza', 'dwarf', '--clase', 'shaman')
        self.assertIn('Alianza', s)
        self.assertIn('NUEVA', s)
        self.assertIn('Dun Morogh', s)
        c, s = correr('entrenadores', '--clase', 'chaman', '--faccion', 'alianza')
        self.assertIn('SIN DATOS (entrenadores)', s)
        c, s = correr('entrenadores', '--clase', 'mago', '--faccion', 'alianza')
        self.assertIn('Ventormenta', s)
        self.assertIn('[Classic 1.12]', s)

    def test_herreria_120(self):
        c, s = correr('profesion', 'herrería', '--skill', '120', '--faccion', 'horda', '--max', '30')
        self.assertEqual(c, 0)
        recetas, plan = s.split('Plan de subida')
        self.assertIn('Brazales de bronce estampados', recetas)
        # Blessed Plate: nueva de Forever con requisito 240, aún no se ofrece a skill 120.
        self.assertNotIn('Blessed Plate', recetas)
        # Fase 1: las recetas de Forever con plan del cliente YA traen aprende y objeto
        # receta; el hueco «no traen el skill para aprenderlas» se cerró a skill 120.
        self.assertNotIn('no traen el skill para aprenderlas', recetas)
        self.assertIn('Leotardos de plata esterlina', recetas)
        self.assertIn('objeto receta', recetas)
        self.assertIn('aprende 105', recetas)
        primer_paso = plan.splitlines()[1]
        self.assertTrue(primer_paso.startswith('- 120→125: Brazales de bronce estampados'), primer_paso)
        self.assertIn('120→150', plan)
        self.assertIn('hasta 150', recetas)  # entrenadores del siguiente tramo

    def test_ambiguedad_y_errores(self):
        c, s = correr('perfil', '--raza', 'cielonato', '--clase', 'druida')
        self.assertEqual(c, 2)
        self.assertIn('ambiguo', s)
        c, s = correr('perfil', '--raza', 'cielonato', '--clase', 'druida', '--faccion', 'alianza')
        self.assertEqual(c, 0)
        self.assertIn('Suma Orden', s)
        self.assertIn('SIN DATOS (inicio)', s)
        c, s = correr('perfil', '--raza', 'tauren', '--clase', 'mago')
        self.assertEqual(c, 1)
        self.assertIn('NO válida', s)
        c, s = correr('zonas', '--faccion', 'neutral', '--nivel', '10')
        self.assertEqual(c, 2)

    def test_dungeon_e_item(self):
        c, s = correr('dungeon', 'wailing caverns', '--clase', 'cazador')
        self.assertIn('Venomstrike', s)
        c, s = correr('item', 'Venomstrike')
        self.assertIn('Lord Serpentis', s)
        self.assertIn('Cuevas de los Lamentos', s)
        c, s = correr('dungeons')
        self.assertIn('nuevo de Forever, botín SIN DATOS', s)
        c, s = correr('mision', '1528')
        self.assertIn('Call of Water', s)

    def test_item_dps_recompensa_y_origen(self):
        # Venomstrike: DPS de 1.12 y ficha de CMaNGOS; Bow of Plunder: la misión que lo da.
        c, s = correr('item', 'Venomstrike')
        self.assertIn('9.6 DPS [Classic 1.12]', s)
        self.assertIn('25%', s)
        c, s = correr('item', 'Bow of Plunder')
        self.assertIn('recompensa de: [567] Dangerous!', s)
        self.assertIn('[cliente Forever]', s)
        c, s = correr('item', 'Fine Longbow')
        self.assertIn('stock limitado', s)
        c, s = correr('mision', '567')
        self.assertIn('Bow of Plunder', s)


class TestVersion(unittest.TestCase):
    def test_misma_version_en_todo_el_paquete(self):
        import re
        manifiesto = json.load(open(os.path.join(RAIZ, 'plugin.json'), encoding='utf-8'))['version']
        with open(os.path.join(SKILL, 'SKILL.md'), encoding='utf-8') as f:
            skill = re.search(r'^version: (\S+)$', f.read(), re.M).group(1)
        with open(os.path.join(RAIZ, 'desktop', 'src', 'plugin.src.jsx'), encoding='utf-8') as f:
            desktop = re.search(r"version: '([^']+)'", f.read()).group(1)
        paquete = json.load(open(os.path.join(RAIZ, 'desktop', 'package.json'), encoding='utf-8'))['version']
        self.assertEqual({manifiesto, skill, desktop, paquete}, {manifiesto}, (manifiesto, skill, desktop, paquete))


@unittest.skipUnless(shutil.which('node'), 'sin node')
class TestIgualQueLaPagina(unittest.TestCase):
    def test_dificultad_receta_igual_que_crafteo_js(self):
        skills = [1, 40, 75, 120, 150, 225, 265, 300]
        js = ("import { dificultadReceta } from %s;\n"
              "import { readFileSync } from 'node:fs';\n"
              "const P = JSON.parse(readFileSync(%s, 'utf8')).profesiones;\n"
              "const out = {};\n"
              "for (const [pid, p] of Object.entries(P)) for (const r of p.recetas)\n"
              "  out[pid + ':' + r.spell] = %s.map((s) => dificultadReceta(r, s));\n"
              "console.log(JSON.stringify(out));\n") % (
            json.dumps('file://' + os.path.join(RAIZ, 'src', 'crafteo.js')),
            json.dumps(os.path.join(RAIZ, 'data', 'profesiones.json')), json.dumps(skills))
        r = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        esperado = json.loads(r.stdout)
        D = consultar.Datos(os.path.join(RAIZ, 'data'))
        n = 0
        for pid, p in D.profesiones['profesiones'].items():
            for rec in p['recetas']:
                self.assertEqual([consultar.dificultad_receta(rec, s) for s in skills],
                                 esperado[f'{pid}:{rec["spell"]}'], rec['n'])
                n += 1
        self.assertGreater(n, 2000)


if __name__ == '__main__':
    unittest.main()
