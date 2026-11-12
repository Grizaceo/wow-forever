#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
comun.py — lectores y utilidades compartidas por los generadores de datos.

Solo stdlib. Lo usan tools/build-drop-data.py y tools/build-datos-juego.py.
"""

import collections
import csv
import gzip
import os
import hashlib
import math
import re


class BuildError(Exception):
    pass


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


# --------------------------------------------------------------- SQL reader
def parse_tuples(s):
    """Parse `(..),(..);` of a MySQL extended INSERT. Strings/ints/floats/NULL."""
    rows, i, n = [], 0, len(s)
    while i < n:
        if s[i] != '(':
            i += 1
            continue
        i += 1
        row, val, inq, isstr = [], [], False, False
        while True:
            if i >= n:
                raise BuildError('truncated INSERT tuple')
            c = s[i]
            if inq:
                if c == '\\':
                    val.append(s[i + 1])
                    i += 2
                    continue
                if c == "'":
                    if i + 1 < n and s[i + 1] == "'":
                        val.append("'")
                        i += 2
                        continue
                    inq = False
                    i += 1
                    continue
                val.append(c)
                i += 1
                continue
            if c == "'":
                inq = isstr = True
                i += 1
                continue
            if c in ',)':
                v = ''.join(val)
                if isstr:
                    row.append(v)
                else:
                    v = v.strip()
                    if v == 'NULL':
                        row.append(None)
                    else:
                        try:
                            row.append(int(v))
                        except ValueError:
                            row.append(float(v))
                val, isstr = [], False
                i += 1
                if c == ')':
                    break
                continue
            val.append(c)
            i += 1
        rows.append(row)
    return rows


def read_sql(path, tables):
    """Lee las `tables` pedidas del dump .sql.gz -> {tabla: [dict, ...]}.

    Falla si alguna tabla pedida no existe o viene vacía en el volcado.
    """
    tables = set(tables)
    cols, data, cur = {}, {t: [] for t in tables}, None
    with gzip.open(path, 'rt', encoding='utf-8', errors='strict') as f:
        for line in f:
            m = re.match(r'CREATE TABLE `(\w+)`', line)
            if m:
                cur = m.group(1) if m.group(1) in tables else None
                if cur:
                    cols[cur] = []
                continue
            if cur:
                m = re.match(r'\s+`(\w+)`', line)
                if m:
                    cols[cur].append(m.group(1))
                    continue
                if line.startswith(')'):
                    cur = None
                continue
            m = re.match(r'INSERT INTO `(\w+)` VALUES', line)
            if m and m.group(1) in tables:
                data[m.group(1)].extend(parse_tuples(line[line.index('VALUES') + 6:]))
    missing = sorted(t for t in tables if t not in cols or not data[t])
    if missing:
        raise BuildError('missing tables in SQL dump: ' + ', '.join(missing))
    out = {}
    for t in tables:
        width = len(cols[t])
        for r in data[t]:
            if len(r) != width:
                raise BuildError('%s: row width %d != %d columns' % (t, len(r), width))
        out[t] = [dict(zip(cols[t], r)) for r in data[t]]
    return out


def read_csv(path):
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


# ---------------------------------------------------------------- facciones
PLAYER_TEMPLATES = {'a': 1, 'h': 2}   # FactionTemplate de jugador: Alianza / Horda


def lados(faction_template_id, ft):
    """Lados de jugador que pueden USAR un NPC (entrenador, vendedor, etc.).

    `ft` es {id: fila} de FactionTemplate.csv (era). Un NPC es usable por un
    lado si no le es hostil: ni `EnemyGroup & FactionGroup` del jugador en
    ningún sentido, ni el jugador está en `Enemies_0..7`.
    Devuelve un subconjunto de 'ah' ('a' = Alianza, 'h' = Horda).
    """
    t = ft.get(faction_template_id)
    if not t:
        return 'ah'   # facción desconocida: no se puede demostrar hostilidad
    out = ''
    for side, pid in sorted(PLAYER_TEMPLATES.items()):
        p = ft.get(pid)
        if not p:
            continue
        pfg, peg = int(p['FactionGroup']), int(p['EnemyGroup'])
        pf = int(p['Faction'])
        hostile = (int(t['EnemyGroup']) & pfg) or (peg & int(t['FactionGroup'])) \
            or pf in [int(t['Enemies_%d' % k]) for k in range(8)]
        if not hostile:
            out += side
    return out


# -------------------------------------------------------------------- loot
WORLD_REF_USERS = 30      # a reference table shared by more loot tables = world drop


class Loot:
    """Expande plantillas de botín de CMaNGOS (referencias incluidas)."""

    def __init__(self, db):
        self.tables = {}
        for name in ('creature_loot_template', 'reference_loot_template', 'gameobject_loot_template',
                     'skinning_loot_template', 'pickpocketing_loot_template'):
            t = collections.defaultdict(list)
            for r in db[name]:
                t[r['entry']].append(r)
            self.tables[name] = t
        users = collections.Counter()
        for name, t in self.tables.items():
            if name == 'reference_loot_template':
                continue
            for rows in t.values():
                for r in rows:
                    if r['mincountOrRef'] < 0:
                        users[-r['mincountOrRef']] += 1
        self.world_refs = {ref for ref, n in users.items() if n > WORLD_REF_USERS}

    def expand(self, table, entry, depth=0, world=False):
        """-> {item: [chancePct, minCount, maxCount, world]} (independent rolls summed, capped)."""
        out = {}
        rows = self.tables[table].get(entry, [])
        groups = collections.defaultdict(list)
        for r in rows:
            groups[r['groupid']].append(r)
        for gid, grp in sorted(groups.items()):
            if gid:
                explicit = sum(r['ChanceOrQuestChance'] for r in grp if r['ChanceOrQuestChance'] > 0)
                zero = [r for r in grp if r['ChanceOrQuestChance'] == 0]
                share = max(0.0, 100.0 - explicit) / len(zero) if zero else 0.0
            for r in grp:
                ch = r['ChanceOrQuestChance']
                if ch < 0:
                    continue  # quest-only chance
                if gid and ch == 0:
                    ch = share
                if ch <= 0:
                    continue
                if r['mincountOrRef'] < 0:
                    ref = -r['mincountOrRef']
                    if depth >= 4:
                        continue
                    times = max(1, r['maxcount'])
                    inner = self.expand('reference_loot_template', ref, depth + 1,
                                        world or ref in self.world_refs)
                    for item, (c2, mn, mx, w2) in inner.items():
                        self._add(out, item, ch / 100.0 * c2 * times, mn, mx, w2)
                else:
                    self._add(out, r['item'], ch, max(1, r['mincountOrRef']), max(1, r['maxcount']), world)
        return out

    @staticmethod
    def _add(out, item, ch, mn, mx, world):
        if item in out:
            o = out[item]
            o[0] = min(100.0, o[0] + ch)
            o[1], o[2] = min(o[1], mn), max(o[2], mx)
            o[3] = o[3] and world
        else:
            out[item] = [min(100.0, ch), mn, mx, world]


# ------------------------------------------------------- niveles de zona (curado)
# Official Classic zone level ranges (game guide / warcraft wiki); Forever may differ.
ZONE_LEVELS = {
    1411: (1, 10), 1412: (1, 10), 1413: (10, 25), 1416: (30, 40), 1417: (30, 40), 1418: (35, 45),
    1419: (45, 55), 1420: (1, 10), 1421: (10, 20), 1422: (51, 58), 1423: (53, 60), 1424: (20, 30),
    1425: (40, 50), 1426: (1, 10), 1427: (43, 50), 1428: (50, 58), 1429: (1, 10), 1430: (55, 60),
    1431: (18, 30), 1432: (10, 20), 1433: (15, 25), 1434: (30, 45), 1435: (35, 45), 1436: (10, 20),
    1437: (20, 30), 1438: (1, 10), 1439: (10, 20), 1440: (18, 30), 1441: (25, 35), 1442: (15, 27),
    1443: (30, 40), 1444: (40, 50), 1445: (35, 45), 1446: (40, 50), 1447: (45, 55), 1448: (48, 55),
    1449: (48, 55), 1451: (55, 60), 1452: (55, 60),
}


# -------------------------------------------------------------------- zonas
ZONE_GY_WEIGHT = 1.0      # validated: 87.4% vs quest-zone labels (noisy truth)


def build_zones(src):
    """ZonasUiMap (Type 3, mapas 0/1) desde los CSV del cliente Classic Era.

    -> (zones, maps): zones con rectángulo, facción y bandera de ciudad;
    maps = {id: fila} de Map.csv.
    """
    ua, um = read_csv(os.path.join(src, 'UiMapAssignment.csv')), {r['ID']: r for r in read_csv(os.path.join(src, 'UiMap.csv'))}
    at = {r['ID']: r for r in read_csv(os.path.join(src, 'AreaTable.csv'))}
    maps = {int(r['ID']): r for r in read_csv(os.path.join(src, 'Map.csv'))}
    zones = []
    for r in ua:
        u = um.get(r['UiMapID'])
        if not u or u['Type'] != '3' or r['MapID'] not in ('0', '1'):
            continue
        a = at.get(r['AreaID'], {})
        fgm = int(a.get('FactionGroupMask') or 0)
        city = int(a.get('Flags_0') or 0) & 0x100
        zones.append({
            'ui': int(r['UiMapID']), 'name': u['Name_lang'], 'map': int(r['MapID']), 'area': int(r['AreaID']),
            'x0': float(r['Region_0']), 'x1': float(r['Region_3']),
            'y0': float(r['Region_1']), 'y1': float(r['Region_4']),
            'faction': 'alliance' if fgm == 2 else 'horde' if fgm == 4 else 'contested',
            'city': bool(city),
        })
    if len(zones) < 40:
        raise BuildError('unexpected zone table: %d zones' % len(zones))
    return zones, maps


class ZoneLocator:
    """Bounding rectangles overlap: pick the candidate whose centre is nearest
    (normalised) plus its nearest graveyard. Approximate by construction."""

    def __init__(self, zones, db):
        self.zones = zones
        area = {z['area']: z for z in zones}
        wsl = {r['id']: r for r in db['world_safe_locs']}
        self.gy = collections.defaultdict(list)
        for r in db['game_graveyard_zone']:
            if r['ghost_loc'] in area and r['id'] in wsl:
                self.gy[r['ghost_loc']].append(wsl[r['id']])

    def locate(self, m, x, y):
        best, score = None, None
        for z in self.zones:
            if z['map'] != m or not (z['x0'] <= x <= z['x1'] and z['y0'] <= y <= z['y1']):
                continue
            w, h = z['x1'] - z['x0'], z['y1'] - z['y0']
            cn = max(abs(x - (z['x0'] + z['x1']) / 2) / w, abs(y - (z['y0'] + z['y1']) / 2) / h)
            g = [p for p in self.gy.get(z['area'], []) if p['map'] == m]
            gd = min(math.hypot(p['x'] - x, p['y'] - y) for p in g) / math.sqrt(w * h) if g else 1.0
            s = (cn + gd * ZONE_GY_WEIGHT, z['ui'])
            if score is None or s < score:
                best, score = z, s
        return best
