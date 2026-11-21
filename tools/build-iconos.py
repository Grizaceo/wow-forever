#!/usr/bin/env python3
"""Genera el sprite de miniaturas de ítems del Mercado.

Fuente (solo tiempo de build; el plugin nunca sale a la red):
- Wowhead tooltip JSON para el icono por itemID. Forever usa IDs de Classic;
  se prueban dataEnv=4 (Classic), 8 y 1 (retail) hasta encontrar el icono.
- Las imágenes se descargan del CDN de Wowhead (activos de Blizzard) una vez
  por nombre de icono y se cachean fuera del repo.

Salida:
- desktop/src/iconos-datos.js: sprite WebP en base64 troceado y mapa
  itemID -> celda. Es lo único que entra al bundle.
- data/iconos.json: procedencia, cobertura y hash del sprite (sin base64).

Uso:
  python3 tools/build-iconos.py              # usa caché y regenera el sprite
  python3 tools/build-iconos.py --refresh    # vuelve a pedir tooltips/iconos
  python3 tools/build-iconos.py --limite 200 # prueba rápida
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ITEMS = RAIZ / 'data' / 'items.json'
SALIDA_JS = RAIZ / 'desktop' / 'src' / 'iconos-datos.js'
SALIDA_JSON = RAIZ / 'data' / 'iconos.json'
CACHE = Path(os.environ.get('WOW_FOREVER_ICON_CACHE', Path.home() / '.cache' / 'wow-forever-iconos'))
CELDA = 48
COLUMNAS = 64
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'


def pedir(url: str, timeout: int = 25) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def tooltip(item_id: int, refresh: bool = False) -> dict:
    CACHE.joinpath('tooltips').mkdir(parents=True, exist_ok=True)
    f = CACHE / 'tooltips' / f'{item_id}.json'
    if f.is_file() and not refresh:
        try:
            return json.loads(f.read_text())
        except Exception:
            pass
    ultimo = None
    for env in (4, 8, 1):
        url = f'https://nether.wowhead.com/tooltip/item/{item_id}?dataEnv={env}&locale=0'
        for intento in range(3):
            try:
                d = json.loads(pedir(url))
                out = {'icon': d.get('icon') or None, 'name': d.get('name') or None, 'env': env}
                f.write_text(json.dumps(out, ensure_ascii=False))
                return out
            except urllib.error.HTTPError as e:
                ultimo = f'HTTP {e.code}'
                if e.code == 429:
                    time.sleep(2 + intento * 3)
                    continue
                if 400 <= e.code < 500:
                    break
                time.sleep(1 + intento)
            except Exception as e:
                ultimo = type(e).__name__
                time.sleep(1 + intento)
    out = {'icon': None, 'name': None, 'env': None, 'error': ultimo}
    f.write_text(json.dumps(out, ensure_ascii=False))
    return out


def icono(nombre: str, refresh: bool = False) -> Image.Image | None:
    CACHE.joinpath('jpg').mkdir(parents=True, exist_ok=True)
    seguro = re.sub(r'[^a-zA-Z0-9_-]', '_', nombre)
    f = CACHE / 'jpg' / (seguro + '.jpg')
    if not f.is_file() or refresh:
        try:
            b = pedir(f'https://wow.zamimg.com/images/wow/icons/medium/{nombre}.jpg')
            if not b or len(b) < 200:
                return None
            f.write_bytes(b)
        except Exception:
            return None
    try:
        im = Image.open(io.BytesIO(f.read_bytes())).convert('RGBA')
        return im.resize((CELDA, CELDA), Image.Resampling.LANCZOS)
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--refresh', action='store_true')
    ap.add_argument('--limite', type=int, default=0, help='solo N ítems (prueba)')
    ap.add_argument('--workers', type=int, default=12)
    args = ap.parse_args()

    datos = json.loads(ITEMS.read_text())['items']
    ids = sorted(int(k) for k in datos)
    if args.limite:
        ids = ids[:args.limite]
    print(f'items={len(ids)} cache={CACHE}')

    t0 = time.time()
    hechos = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futuros = {ex.submit(tooltip, i, args.refresh): i for i in ids}
        for fut in as_completed(futuros):
            fut.result()
            hechos += 1
            if hechos % 1000 == 0:
                print(f'  tooltips {hechos}/{len(ids)} ({time.time()-t0:.0f}s)', flush=True)
    print(f'tooltips listos en {time.time()-t0:.0f}s')

    por_icono: dict[str, list[int]] = {}
    sin_icono = []
    for i in ids:
        d = tooltip(i)
        ic = d.get('icon')
        if ic:
            por_icono.setdefault(ic, []).append(i)
        else:
            sin_icono.append(i)
    print(f'items con icono={sum(len(v) for v in por_icono.values())} sin={len(sin_icono)} iconos únicos={len(por_icono)}')

    nombres = sorted(por_icono)
    imagenes: dict[str, Image.Image] = {}
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futuros = {ex.submit(icono, n, args.refresh): n for n in nombres}
        for fut in as_completed(futuros):
            n = futuros[fut]
            im = fut.result()
            if im is not None:
                imagenes[n] = im
    nombres = [n for n in nombres if n in imagenes]
    print(f'jpg descargados={len(imagenes)}/{len(por_icono)}')

    filas = (len(nombres) + COLUMNAS - 1) // COLUMNAS
    lienzo = Image.new('RGBA', (COLUMNAS * CELDA, max(1, filas) * CELDA), (0, 0, 0, 0))
    celda_de: dict[str, int] = {}
    for idx, n in enumerate(nombres):
        x, y = (idx % COLUMNAS) * CELDA, (idx // COLUMNAS) * CELDA
        lienzo.paste(imagenes[n], (x, y))
        celda_de[n] = idx

    buf = io.BytesIO()
    lienzo.save(buf, format='WEBP', quality=86, method=6)
    webp = buf.getvalue()
    b64 = base64.b64encode(webp).decode('ascii')

    mapa: dict[str, int] = {}
    for n, ids_icono in por_icono.items():
        if n not in celda_de:
            continue
        for i in ids_icono:
            mapa[str(i)] = celda_de[n]

    lineas = []
    actual = []
    for k in sorted(mapa, key=int):
        actual.append(f'"{k}":{mapa[k]}')
        if len(', '.join(actual)) > 160:
            lineas.append(', '.join(actual) + ',')
            actual = []
    if actual:
        lineas.append(', '.join(actual) + ',')
    mapa_js = '\n  '.join(lineas).rstrip(',')

    trozos = [b64[i:i + 120] for i in range(0, len(b64), 120)]
    sprite_js = ',\n  '.join(json.dumps(t) for t in trozos)

    js = (
        '// GENERADO por tools/build-iconos.py. No editar a mano.\n'
        '// Miniaturas de ítems: activos de Blizzard Entertainment obtenidos en tiempo\n'
        '// de build desde Wowhead; el plugin no hace red. Ver LICENSE-DATA.md.\n'
        'export const ICONOS = {\n'
        f'  celda: {CELDA},\n'
        f'  columnas: {COLUMNAS},\n'
        f'  filas: {filas},\n'
        '  sprite: [\n'
        f'  {sprite_js}\n'
        "  ].join(''),\n"
        '  mapa: {\n'
        f'  {mapa_js}\n'
        '  },\n'
        '}\n'
    )
    SALIDA_JS.write_text(js)

    resumen = {
        'schema': 1,
        'generadoPor': 'tools/build-iconos.py',
        'fuente': 'Wowhead tooltip (dataEnv 4/8/1) + CDN de iconos; activos de Blizzard Entertainment',
        'items': len(ids),
        'conMiniatura': sum(len(v) for n, v in por_icono.items() if n in celda_de),
        'sinMiniatura': len(sin_icono),
        'iconosUnicos': len(nombres),
        'celda': CELDA,
        'columnas': COLUMNAS,
        'filas': filas,
        'spriteBytes': len(webp),
        'spriteSha256': hashlib.sha256(webp).hexdigest(),
        'moduloBytes': len(js.encode()),
    }
    SALIDA_JSON.write_text(json.dumps(resumen, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(resumen, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
