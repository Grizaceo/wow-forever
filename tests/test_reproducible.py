#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenera data/ y drop-data en carpetas temporales y compara hashes.

Se salta con un mensaje claro si faltan las entradas fijadas en
~/.cache/wow-forever-drops (tools/descargar-fuentes.py).
"""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.expanduser('~/.cache/wow-forever-drops')
TMPBASE = os.path.join(ROOT, '.workshop', 'tmp')
PY = sys.executable

NEEDED = [
    os.path.join(SRC, 'ClassicDB.sql.gz'),
    os.path.join(SRC, 'UiMapAssignment.csv'),
    os.path.join(SRC, 'UiMap.csv'),
    os.path.join(SRC, 'AreaTable.csv'),
    os.path.join(SRC, 'Map.csv'),
    os.path.join(SRC, 'FactionTemplate.csv'),
    os.path.join(SRC, 'wowf', 'CharBaseInfo.csv'),
    os.path.join(SRC, 'wowf', 'ItemSparse.csv'),
    os.path.join(SRC, 'wowf', 'SkillLineAbility.csv'),
    os.path.join(SRC, 'wowf', 'esMX', 'SpellName.csv'),
]

DATA_FILES = ['personaje.json', 'clases.json', 'profesiones.json', 'items.json',
              'zonas.json', 'misiones.json', 'dungeons.json', 'MANIFEST.json']


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def hashes(dirpath, names):
    return {n: sha256(os.path.join(dirpath, n)) for n in names}


@unittest.skipUnless(all(os.path.isfile(p) for p in NEEDED),
                     'faltan entradas fijadas en %s (tools/descargar-fuentes.py)' % SRC)
class TestReproducible(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.makedirs(TMPBASE, exist_ok=True)
        cls.tmp = tempfile.mkdtemp(prefix='repro-', dir=TMPBASE)

    def _gen(self, outdir):
        r = subprocess.run(
            [PY, os.path.join(ROOT, 'tools', 'build-datos-juego.py'),
             '--source-dir', SRC, '--out', outdir],
            capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr[-2000:])
        return outdir

    def test_datos_juego_determinista(self):
        a = self._gen(os.path.join(self.tmp, 'a'))
        b = self._gen(os.path.join(self.tmp, 'b'))
        ha, hb = hashes(a, DATA_FILES), hashes(b, DATA_FILES)
        self.assertEqual(ha, hb, 'dos corridas difieren')

    def test_datos_juego_contra_manifest(self):
        gen = self._gen(os.path.join(self.tmp, 'c'))
        with open(os.path.join(ROOT, 'data', 'MANIFEST.json'), encoding='utf-8') as f:
            man = json.load(f)['archivos']
        for name in DATA_FILES:
            if name == 'MANIFEST.json':
                continue
            self.assertEqual(sha256(os.path.join(gen, name)),
                             man[name]['sha256'], name)
            self.assertEqual(os.path.getsize(os.path.join(gen, name)),
                             man[name]['bytes'], name)

    def test_drop_data_sin_cambios(self):
        out = os.path.join(self.tmp, 'drop.js')
        r = subprocess.run(
            [PY, os.path.join(ROOT, 'tools', 'build-drop-data.py'),
             '--source-dir', SRC, '--out', out],
            capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr[-2000:])
        ref = os.path.join(ROOT, 'standalone', 'drop-data.js')
        self.assertTrue(os.path.isfile(ref), 'falta standalone/drop-data.js')
        self.assertEqual(sha256(out), sha256(ref))


if __name__ == '__main__':
    unittest.main()
