"""La mitad Desktop (desktop/plugin.js) cumple las reglas del catálogo de Hermes.

- El mismo lint que usa `hermes plugins validate` (hermes_cli/plugin_validate_desktop.py) sobre
  los .js versionados de desktop/: sin rechazos y sin avisos de revisión.
- scripts/check_desktop_bundle.py: solo imports que el cargador admite, sin eval ni import().
- desktop/BUNDLE.json coincide con el plugin.js versionado.
- Reconstruir desde desktop/src da los mismos bytes (si hay node y esbuild instalados).
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESKTOP = os.path.join(RAIZ, 'desktop')
PLUGIN = os.path.join(DESKTOP, 'plugin.js')
HERMES = os.environ.get('HERMES_AGENT_DIR', os.path.expanduser('~/.hermes/hermes-agent'))


def sha(ruta):
    with open(ruta, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def js_versionados():
    out = subprocess.run(['git', '-C', RAIZ, 'ls-files', 'desktop'], capture_output=True, text=True, check=True).stdout
    return [os.path.join(RAIZ, p) for p in out.split() if p.endswith('.js')]


class TestDesktop(unittest.TestCase):
    def test_lint_de_hermes(self):
        if not os.path.isfile(os.path.join(HERMES, 'hermes_cli', 'plugin_validate_desktop.py')):
            self.skipTest('hermes-agent no está en %s (HERMES_AGENT_DIR)' % HERMES)
        sys.path.insert(0, HERMES)
        try:
            from hermes_cli.plugin_validate_desktop import desktop_review_findings, desktop_surface_findings
        finally:
            sys.path.pop(0)
        archivos = js_versionados() or [PLUGIN]
        for ruta in archivos:
            with open(ruta, encoding='utf-8') as f:
                fuente = f.read()
            self.assertEqual(desktop_surface_findings(fuente), [], ruta)
            self.assertEqual(desktop_review_findings(fuente), [], ruta)

    def test_imports_admitidos(self):
        r = subprocess.run([sys.executable, os.path.join(RAIZ, 'scripts', 'check_desktop_bundle.py'), PLUGIN],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_bundle_json(self):
        with open(os.path.join(DESKTOP, 'BUNDLE.json'), encoding='utf-8') as f:
            b = json.load(f)
        self.assertEqual(b['sha256'], sha(PLUGIN))
        self.assertEqual(b['bytes'], os.path.getsize(PLUGIN))
        self.assertEqual(sorted(b['external']), ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])

    def test_legible(self):
        # Sin minificar: el código va en líneas cortas. Solo los datos generados (drop-data y las
        # colecciones de data/*.json) ocupan líneas largas, y se regeneran con tools/.
        import re
        with open(PLUGIN, encoding='utf-8') as f:
            lineas = f.read().split('\n')
        self.assertGreater(len(lineas), 2000)
        cadenas = re.compile(r'"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|`(?:[^`\\]|\\.)*`')
        codigo = re.compile(r'\bfunction\b|=>|\breturn\b|\bif \(|\bfor \(|\bwhile \(')
        largas = [(i + 1, l[:60]) for i, l in enumerate(lineas)
                  if len(l) > 400 and codigo.search(cadenas.sub('""', l))]
        self.assertEqual(largas, [], 'líneas de código demasiado largas (¿minificado?)')

    def test_build_reproducible(self):
        if not shutil.which('node') or not os.path.isdir(os.path.join(DESKTOP, 'node_modules', 'esbuild')):
            self.skipTest('sin node o sin desktop/node_modules (npm ci en desktop/)')
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, 'plugin.js')
            subprocess.run(['node', 'build.mjs', '--out', out], cwd=DESKTOP, check=True, capture_output=True)
            self.assertEqual(sha(out), sha(PLUGIN), 'desktop/plugin.js no coincide con un build desde desktop/src')


if __name__ == '__main__':
    unittest.main()
