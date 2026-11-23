#!/usr/bin/env python3
"""Validación canónica del perfil del jugador (contrato contracts/perfil-v1.json).

Espejo exacto de src/perfil.js (`validarPerfil`): misma entrada produce el mismo
``{ok, errores, perfil}``. Las constantes salen del contrato JSON compartido, no de
copias locales. Solo biblioteca estándar, sin red, sin procesos y sin escribir nada.

Uso como módulo::

    import perfil
    r = perfil.validar_perfil(entrada_dict, personaje_dict)  # -> {'ok', 'errores', 'perfil'}

``personaje`` es el contenido de ``data/personaje.json`` (mismo objeto que recibe la
versión JS). ``entrada`` es el perfil sin validar (lo que llega de la UI o del chat).
"""
import json
import math
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]  # skills/wow-forever/scripts/perfil.py -> raíz del plugin
with open(RAIZ / 'contracts' / 'perfil-v1.json', encoding='utf-8') as _f:
    CONTRATO = json.load(_f)['perfil']

VERSION = CONTRATO['version']
NIVEL_MIN = CONTRATO['nivel_min']
NIVEL_MAX = CONTRATO['nivel_max']
FACCIONES = tuple(CONTRATO['facciones'])
PROFESIONES_PRINCIPALES = list(CONTRATO['profesiones_principales'])
PROFESIONES_SECUNDARIAS = list(CONTRATO['profesiones_secundarias'])
MAX_PRINCIPALES = CONTRATO['max_principales']
MAX_REINO = CONTRATO['max_reino']
CAMPOS = tuple(CONTRATO['campos'])

# JS: /^\d+$/ solo ASCII; en Python \d también casa dígitos unicode.
_RE_ENTERO = re.compile(r'[0-9]+')
# String.prototype.trim() de JS = WhiteSpace + LineTerminator. NO incluye U+0085
# ni U+001C..U+001F, que sí incluye \s de Python; SÍ incluye U+FEFF (ZWNBSP).
_BORDES_JS = ('\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005'
              '\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff')


def _js_truthy(v):
    """Truthiness de JS: {}, [], strings no vacíos y números no cero son truthy."""
    if v is None or v is False:
        return False
    if isinstance(v, (int, float)):
        return v != 0 and not (isinstance(v, float) and math.isnan(v))
    if isinstance(v, str):
        return len(v) > 0
    return True


def _clave_js(v):
    """String(Infinity) de JS es 'Infinity', no 'inf' como str() de Python."""
    return 'Infinity' if v == math.inf else str(v)


def _corte_utf16(s, n):
    """s.slice(0, n) de JS: cuenta unidades UTF-16; puede dejar un surrogado suelto."""
    unidades = []
    for ch in s:
        cp = ord(ch)
        if cp > 0xFFFF:
            cp -= 0x10000
            unidades.extend((0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)))
        else:
            unidades.append(cp)
    unidades = unidades[:n]
    salida = []
    i = 0
    while i < len(unidades):
        u = unidades[i]
        # Recomponer pares completos; si el corte parte el par, conservar el suelto.
        if 0xD800 <= u <= 0xDBFF and i + 1 < len(unidades) and 0xDC00 <= unidades[i + 1] <= 0xDFFF:
            salida.append(chr(0x10000 + ((u - 0xD800) << 10) + (unidades[i + 1] - 0xDC00)))
            i += 2
        else:
            salida.append(chr(u))
            i += 1
    return ''.join(salida)


def _entero(v):
    """Como `entero` de perfil.js: entero JS (número entero o cadena de dígitos).

    Emula la conversión a double de JS: bool nunca es entero, flotantes no enteros
    tampoco, y cadenas/enteros grandes se redondean como Number() (precisión doble).
    """
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        try:
            f = float(v)
        except OverflowError:
            return None
        return int(f) if math.isfinite(f) and f.is_integer() else None
    if isinstance(v, float):
        return int(v) if math.isfinite(v) and v.is_integer() else None
    if isinstance(v, str) and _RE_ENTERO.fullmatch(v):
        # La rama cadena de JS `entero` devuelve Number(v) SIN exigir isInteger:
        # una cadena de dígitos enorme da Infinity (y el nivel se fija en 60).
        f = float(v)
        return math.inf if math.isinf(f) else int(f)
    return None


def _dict(obj):
    return obj if isinstance(obj, dict) else {}


def _lista(obj):
    return obj if isinstance(obj, list) else []


def _faccion_de_raza(personaje, raza):
    razas = _dict(_dict(personaje).get('razas'))
    r = razas.get(str(raza))
    return r.get('faccion') if isinstance(r, dict) else None


def combinacion_valida(personaje, raza, clase):
    for fila in _lista(_dict(personaje).get('combinaciones')):
        if isinstance(fila, list) and len(fila) >= 2 and fila[0] == raza and fila[1] == clase:
            return True
    return False


def razas_para(personaje, faccion, clase):
    return sorted(r for r, c in (f[:2] for f in _lista(_dict(personaje).get('combinaciones'))
                                 if isinstance(f, list) and len(f) >= 2)
                  if c == clase and _faccion_de_raza(personaje, r) == faccion)


def perfil_vacio():
    return {'v': VERSION, 'faccion': None, 'raza': None, 'clase': None,
            'nivel': NIVEL_MIN, 'profesiones': [], 'secundarias': [], 'reino': ''}


def validar_perfil(entrada, personaje):
    """Valida y normaliza ``entrada`` contra ``personaje`` (data/personaje.json).

    Devuelve ``{'ok': bool, 'errores': [...], 'perfil': {...}}`` con la forma
    persistida v1: {v, faccion, raza, clase, nivel, profesiones, secundarias, reino}.
    El perfil va normalizado aunque haya errores; nunca inventa valores.
    """
    errores = []
    p = perfil_vacio()
    e = _dict(entrada)

    p['raza'] = _entero(e.get('raza'))
    p['clase'] = _entero(e.get('clase'))
    razas = _dict(_dict(personaje).get('razas'))
    clases = _dict(_dict(personaje).get('clases'))
    # JS comprueba truthiness (`!personaje?.razas?.[String(raza)]`), no tipo:
    # un objeto vacío o una cadena no vacía cuentan como raza/clase existente.
    if p['raza'] is None or not _js_truthy(razas.get(_clave_js(p['raza']))):
        errores.append('raza')
    if p['clase'] is None or not _js_truthy(clases.get(_clave_js(p['clase']))):
        errores.append('clase')
    if not errores and not combinacion_valida(personaje, p['raza'], p['clase']):
        errores.append('combinacion')

    faccion_raza = None if p['raza'] is None else _faccion_de_raza(personaje, p['raza'])
    ef = e.get('faccion')
    p['faccion'] = faccion_raza if faccion_raza is not None else (ef if ef in FACCIONES else None)
    if faccion_raza and ef and ef != faccion_raza:
        errores.append('faccion')

    nivel = _entero(e.get('nivel'))
    if nivel is None or nivel < NIVEL_MIN or nivel > NIVEL_MAX:
        errores.append('nivel')
    p['nivel'] = NIVEL_MIN if nivel is None else min(NIVEL_MAX, max(NIVEL_MIN, nivel))

    vistas = set()
    for x in _lista(e.get('profesiones')):
        pid = _entero(x)
        if pid is None or pid not in PROFESIONES_PRINCIPALES:
            errores.append('profesiones')
            continue
        if pid not in vistas:
            vistas.add(pid)
            p['profesiones'].append(pid)
    if len(p['profesiones']) > MAX_PRINCIPALES:
        errores.append('profesiones')
        p['profesiones'] = p['profesiones'][:MAX_PRINCIPALES]

    for x in _lista(e.get('secundarias')):
        sid = _entero(x)
        if sid is None or sid not in PROFESIONES_SECUNDARIAS:
            errores.append('secundarias')
            continue
        if sid not in p['secundarias']:
            p['secundarias'].append(sid)
    p['secundarias'].sort()

    reino = e.get('reino')
    if isinstance(reino, str):
        p['reino'] = _corte_utf16(reino.strip(_BORDES_JS), MAX_REINO)
    elif reino is not None:
        errores.append('reino')

    return {'ok': not errores, 'errores': list(dict.fromkeys(errores)), 'perfil': p}


def _seguro_json(obj):
    """Imita JSON.stringify de JS: Infinity/NaN se serializan como null."""
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    if isinstance(obj, dict):
        return {k: _seguro_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_seguro_json(v) for v in obj]
    return obj


def _principal():
    """Modo lote para el arnés de paridad: JSON en stdin -> JSON en stdout.

    No usa Node ni subprocess: el proceso Python calcula sus propios resultados.
    Entrada: {"personaje": {...}, "casos": [{...entrada}, ...]}.
    Salida:  [{"ok", "errores", "perfil"}, ...] en el mismo orden.
    """
    # Bytes, no texto: JSON es UTF-8 (RFC 8259) y en Windows sys.stdin decodifica con
    # la página de códigos local (cp1252), lo que corrompía reinos no ASCII.
    datos = json.load(sys.stdin.buffer)
    personaje = datos['personaje']
    resultados = [validar_perfil(caso, personaje) for caso in datos['casos']]
    json.dump(_seguro_json(resultados), sys.stdout, ensure_ascii=True, separators=(',', ':'))


if __name__ == '__main__':
    _principal()
