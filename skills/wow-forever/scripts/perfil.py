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
# trim de JS (WhiteSpace + LineTerminator, incluye \ufeff y espacios unicode).
_RE_BORDES_REINO = re.compile(r'^[\s\ufeff]+|[\s\ufeff]+$')


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
        try:
            f = float(v)
        except ValueError:
            return None
        return int(f) if math.isfinite(f) and f.is_integer() else None
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
    if p['raza'] is None or not isinstance(razas.get(str(p['raza'])), dict):
        errores.append('raza')
    if p['clase'] is None or not isinstance(clases.get(str(p['clase'])), dict):
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
        p['reino'] = _RE_BORDES_REINO.sub('', reino)[:MAX_REINO]
    elif reino is not None:
        errores.append('reino')

    return {'ok': not errores, 'errores': list(dict.fromkeys(errores)), 'perfil': p}
