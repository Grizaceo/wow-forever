#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""descargar-fuentes.py — baja los datos de entrada fijados en tools/fuentes.json
y verifica el sha256 de cada archivo. Sin dependencias (solo stdlib).

    python3 tools/descargar-fuentes.py                 # a ~/.cache/wow-forever-drops
    python3 tools/descargar-fuentes.py --dir DIR       # a otra carpeta
    python3 tools/descargar-fuentes.py --verificar     # solo comprueba lo ya bajado

Cada archivo queda en <dir>/<destino>. Si un sha256 no coincide, el script falla
y borra la descarga incompleta: los generadores nunca corren sobre datos que no
son los citados. Es el único paso del build que usa red.
"""

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFIESTO = os.path.join(HERE, 'fuentes.json')
DIR_DEFECTO = os.path.expanduser('~/.cache/wow-forever-drops')
# wago.tools rechaza clientes sin User-Agent; uno genérico, sin datos del usuario.
UA = 'wow-forever-data-build/1.0'


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, 'rb') as f:
        for bloque in iter(lambda: f.read(1 << 20), b''):
            h.update(bloque)
    return h.hexdigest()


def urls(manifiesto):
    for grupo in manifiesto['fuentes']:
        for a in grupo['archivos']:
            url = grupo['url'].format(**a, **grupo.get('parametros', {}))
            yield grupo['id'], url, os.path.join(grupo['carpeta'], a['destino']), a['sha256']


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dir', default=DIR_DEFECTO)
    ap.add_argument('--verificar', action='store_true', help='no descarga: solo comprueba sha256')
    args = ap.parse_args()
    with open(MANIFIESTO, encoding='utf-8') as f:
        manifiesto = json.load(f)
    fallos = 0
    for fuente, url, rel, esperado in urls(manifiesto):
        destino = os.path.join(args.dir, rel)
        if os.path.exists(destino) and sha256(destino) == esperado:
            print('ok      ', rel)
            continue
        if args.verificar:
            print('FALTA   ' if not os.path.exists(destino) else 'DISTINTO', rel)
            fallos += 1
            continue
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        tmp = destino + '.parcial'
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=120) as r, open(tmp, 'wb') as out:
            while True:
                bloque = r.read(1 << 20)
                if not bloque:
                    break
                out.write(bloque)
        obtenido = sha256(tmp)
        if obtenido != esperado:
            os.remove(tmp)
            print('SHA MAL ', rel, obtenido, '!=', esperado, file=sys.stderr)
            fallos += 1
            continue
        os.replace(tmp, destino)
        print('bajado  ', rel)
        time.sleep(0.3)   # sin ráfagas contra wago.tools
    if fallos:
        sys.exit('%d archivo(s) faltan o no coinciden con tools/fuentes.json' % fallos)


if __name__ == '__main__':
    main()
