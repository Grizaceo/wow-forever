#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-drop-data.py — generate the OFFLINE farm/drop dataset for the guide.

Public layer (redistributable, GPL-3.0-or-later):
    drop-data.js  -> window.HunterDropData
    Derived from CMaNGOS classic-db (GPL-3.0, WoW 1.12 content database) plus
    zone rectangles / names / faction masks / lock types from the WoW Classic
    Era client tables (UiMapAssignment, UiMap, AreaTable, Map, Lock,
    FactionTemplate) as exported
    by wago.tools. Classic 1.12 reference data: Forever may differ ("approx").

Private layer (NEVER publish; only with --with-private, output is gitignored):
    drop-data-private.js -> window.HunterDropDataPrivate
    Read from the locally installed RareScanner addon (All Rights Reserved):
    Forever-observed rares/containers with observed loot percentages.

Inputs are plain files; nothing is fetched at runtime and no Lua is executed.
Download the public inputs once (see MARKET.md "Dataset de drops"):

    SRC=~/.cache/wow-forever-drops
    curl -L -o $SRC/ClassicDB.sql.gz https://raw.githubusercontent.com/cmangos/classic-db/master/Full_DB/ClassicDB_1_12_1_z2815.sql.gz
    for t in UiMapAssignment UiMap AreaTable Map Lock FactionTemplate; do
      curl -A Mozilla/5.0 -o $SRC/$t.csv "https://wago.tools/db2/$t/csv?product=wow_classic_era"; done

Item selection never depends on a private auction scan (so the public file
leaks nothing about it): every item that is not a quest item and has at least
one farmable source (mob, object, skinning, pickpocket) is included; BoP items
only when a rare/rare-elite/world-boss or an object drops them (gear affinity).

Deterministic: same inputs -> byte identical output. Only stdlib.
"""

import argparse
import collections
import json
import math
import os
import re
import sys

from comun import (BuildError, Loot, PLAYER_TEMPLATES, WORLD_REF_USERS, ZONE_LEVELS,
                   ZoneLocator, build_zones, read_csv, read_sql, sha256)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, os.pardir))
DEFAULT_SRC = os.path.expanduser('~/.cache/wow-forever-drops')
DEFAULT_RS = os.path.expanduser(
    '~/Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_forever_/Interface/AddOns/RareScanner')

CMANGOS_FILE = 'ClassicDB.sql.gz'
CSV_FILES = ['UiMapAssignment.csv', 'UiMap.csv', 'AreaTable.csv', 'Map.csv', 'Lock.csv', 'FactionTemplate.csv']
TABLES = {'creature', 'creature_template', 'creature_loot_template', 'reference_loot_template',
          'gameobject', 'gameobject_template', 'gameobject_loot_template', 'item_template',
          'skinning_loot_template', 'pickpocketing_loot_template', 'world_safe_locs',
          'game_graveyard_zone'}

RANKS = {0: 'normal', 1: 'elite', 2: 'rareelite', 3: 'boss', 4: 'rare'}
LOCK_KIND = {1: 'chest', 2: 'herb', 3: 'ore', 19: 'fish'}
MAX_SOURCES = 15          # per item, best sources by chance x min(spawns, 30)
MIN_CHANCE = 0.05         # percent; below this a source is not a farm target


# ------------------------------------------------------------------ builder
def build_public(src):
    sql = os.path.join(src, CMANGOS_FILE)
    for p in [sql] + [os.path.join(src, c) for c in CSV_FILES]:
        if not os.path.isfile(p):
            raise BuildError('missing input %s (see docstring for download commands)' % p)
    db = read_sql(sql, TABLES)
    zones, maps = build_zones(src)
    loc = ZoneLocator(zones, db)
    locks = {}
    for r in read_csv(os.path.join(src, 'Lock.csv')):
        kind = None
        for k in range(8):
            if r['Type_%d' % k] == '2' and int(r['_Index_%d' % k]) in LOCK_KIND:
                kind = LOCK_KIND[int(r['_Index_%d' % k])]
                break
        locks[int(r['ID'])] = kind

    def zone_key(m, x, y):
        if m in (0, 1):
            z = loc.locate(m, x, y)
            return str(z['ui']) if z else None
        mp = maps.get(m)
        if mp and mp['InstanceType'] in ('1', '2'):
            return 'i%d' % m
        return None

    # spawns -> (zoneKey -> count), respawn
    def spawns_of(table):
        acc = collections.defaultdict(lambda: [collections.Counter(), []])
        for r in db[table]:
            zk = zone_key(r['map'], r['position_x'], r['position_y'])
            if zk is None:
                continue
            a = acc[r['id']]
            a[0][zk] += 1
            a[1].append(r['spawntimesecsmin'])
        return acc
    cspawn, ospawn = spawns_of('creature'), spawns_of('gameobject')

    ft = {int(r['ID']): r for r in read_csv(os.path.join(src, 'FactionTemplate.csv'))}

    def sides(fid):
        """Which player factions can farm this mob: not a faction member, not friendly."""
        t = ft.get(fid)
        if not t:
            return ''
        fg, fr, en = int(t['FactionGroup']), int(t['FriendGroup']), int(t['EnemyGroup'])
        if fg & 6:
            return ''   # guards, soldiers, citizens: members of Alliance/Horde
        out = ''
        for side, pid in sorted(PLAYER_TEMPLATES.items()):
            p = ft[pid]
            pfg, pfr = int(p['FactionGroup']), int(p['FriendGroup'])
            friendly = (fr & pfg) or (pfr & fg) or p['Faction'] in [t['Friend_%d' % k] for k in range(8)]
            if not friendly:
                out += side
        return out

    loot = Loot(db)
    items_t = {r['entry']: r for r in db['item_template']}
    sources = collections.defaultdict(list)   # item -> [type, id, chance, min, max]
    world = collections.defaultdict(list)     # item -> [(lvlmin,lvlmax,chance)]
    mobs, objects = {}, {}

    def median(v):
        v = sorted(v)
        return v[len(v) // 2] if v else 0

    for t in sorted(db['creature_template'], key=lambda r: r['Entry']):
        e = t['Entry']
        if e not in cspawn or t['NpcFlags'] or t['MaxLevel'] > 63:
            continue
        side = sides(t['Faction'])
        if not side:
            continue
        zc, resp = cspawn[e]
        rank = RANKS.get(t['Rank'], 'normal')
        zk, n = sorted(zc.items(), key=lambda kv: (-kv[1], kv[0]))[0]
        rec = None
        for typ, table, lid in (('m', 'creature_loot_template', t['LootId']),
                                ('s', 'skinning_loot_template', t['SkinningLootId']),
                                ('p', 'pickpocketing_loot_template', t['PickpocketLootId'])):
            if not lid:
                continue
            for item, (ch, mn, mx, w) in loot.expand(table, lid).items():
                if item not in items_t:
                    continue
                if w:
                    world[item].append((t['MinLevel'], t['MaxLevel'], ch))
                    continue
                if ch < MIN_CHANCE:
                    continue
                sources[item].append([typ, e, round(ch, 2), mn, mx])
                rec = True
        if rec:
            # [name, lvlMin, lvlMax, rank, zoneKey(main), spawns(main), respawnSec, otherZones]
            others = [[k, c] for k, c in sorted(zc.items()) if k != zk]
            mobs[e] = [t['Name'], t['MinLevel'], t['MaxLevel'], rank, zk, n, median(resp), side] + ([others] if others else [])

    for t in sorted(db['gameobject_template'], key=lambda r: r['entry']):
        e = t['entry']
        if t['type'] != 3 or e not in ospawn or not t['data1']:
            continue
        kind = locks.get(t['data0']) or 'chest'
        zc, resp = ospawn[e]
        got = False
        for item, (ch, mn, mx, w) in loot.expand('gameobject_loot_template', t['data1']).items():
            if item not in items_t or w or ch < MIN_CHANCE:
                continue
            sources[item].append(['o', e, round(ch, 2), mn, mx])
            got = True
        if got:
            zk, n = sorted(zc.items(), key=lambda kv: (-kv[1], kv[0]))[0]
            others = [[k, c] for k, c in sorted(zc.items()) if k != zk]
            objects[e] = [t['name'], kind, zk, n, median(resp)] + ([others] if others else [])

    items, used_m, used_o = {}, set(), set()
    for iid in sorted(set(sources) | set(world)):
        it = items_t[iid]
        if it['bonding'] == 4 or it['class'] == 12:   # quest items
            continue
        srcs = sources.get(iid, [])
        if it['bonding'] == 1:
            srcs = [s for s in srcs if s[0] == 'o' or (s[0] == 'm' and mobs[s[1]][3] in ('rare', 'rareelite', 'boss'))]
            if not srcs:
                continue

        def weight(s):
            n = mobs[s[1]][5] if s[0] in 'msp' else objects[s[1]][3]
            return (-(s[2] * min(n, 30)), s[0], s[1])
        srcs = sorted(srcs, key=weight)[:MAX_SOURCES]
        rec = [it['name'], it['Quality'], it['class'], it['subclass'], it['InventoryType'], it['RequiredLevel'],
               it['ItemLevel'], it['bonding'], it['AllowableClass'], it['SellPrice'], srcs]
        if world.get(iid):
            w = world[iid]
            rec.append([min(a for a, _, _ in w), max(b for _, b, _ in w), len(w), round(median([c for _, _, c in w]), 3)])
        elif not srcs:
            continue
        items[str(iid)] = rec
        for s in srcs:
            (used_o if s[0] == 'o' else used_m).add(s[1])

    zone_out = {}
    for z in sorted(zones, key=lambda z: z['ui']):
        lo, hi = ZONE_LEVELS.get(z['ui'], (None, None))
        zone_out[str(z['ui'])] = [z['name'], 'kalimdor' if z['map'] == 1 else 'ek',
                                  'city' if z['city'] else z['faction'], lo, hi]
    for m in sorted({int(k[1:]) for e in used_m for k in [mobs[e][4]] + [o[0] for o in (mobs[e][8] if len(mobs[e]) > 8 else [])] if k.startswith('i')}
                    | {int(k[1:]) for e in used_o for k in [objects[e][2]] if k.startswith('i')}):
        mp = maps[m]
        L = sorted(x for e in used_m if mobs[e][4] == 'i%d' % m for x in mobs[e][1:3])
        lo, hi = (L[len(L) // 10], L[(len(L) * 9) // 10]) if L else (None, None)
        zone_out['i%d' % m] = [mp['MapName_lang'], 'raid' if mp['InstanceType'] == '2' else 'dungeon', 'instance', lo, hi]

    files = [{'path': CMANGOS_FILE, 'sha256': sha256(sql)}] + \
            [{'path': c, 'sha256': sha256(os.path.join(src, c))} for c in CSV_FILES]
    return {
        'schemaVersion': 1,
        'source': {
            'name': 'CMaNGOS classic-db (WoW 1.12) + WoW Classic Era client tables',
            'license': 'GPL-3.0-or-later',
            'attribution': 'Drops, mobs, spawns and items derived from CMaNGOS classic-db '
                           '(https://github.com/cmangos/classic-db, GPL-3.0, Full_DB ClassicDB_1_12_1_z2815). '
                           'Zone rectangles, names, faction masks and lock types from WoW Classic Era '
                           'UiMapAssignment/UiMap/AreaTable/Map/Lock via wago.tools. World of Warcraft names '
                           'and content are trademarks and copyrights of Blizzard Entertainment; '
                           'non-commercial, not affiliated.',
            'approx': 'Classic 1.12 reference data, NOT observed on Forever. Drop chances are emulator '
                      'estimates (approx). Zone = bounding-rectangle heuristic (~87% agreement on a noisy '
                      'validation set). Zone level ranges: official Classic ranges; instance ranges from mob levels. '
                      'farmableBy from FactionTemplate group masks (faction members excluded). Object spawn '
                      'counts are all known spawn points; pooled chests are not simultaneous. '
                      'Spawn counts/respawn are emulator values, not live population.',
            'params': {'worldRefUsers': WORLD_REF_USERS, 'maxSources': MAX_SOURCES, 'minChancePct': MIN_CHANCE},
            'files': files,
        },
        'fields': {
            'zones': 'key -> [name, continent|dungeon|raid, alliance|horde|contested|city|instance, lvlMin, lvlMax]',
            'mobs': 'npcId -> [name, lvlMin, lvlMax, rank, mainZoneKey, mainZoneSpawns, respawnSec, farmableBy(a|h|ah), otherZones?[[zoneKey, spawns]]]',
            'objects': 'goId -> [name, chest|herb|ore|fish, mainZoneKey, mainZoneSpawns, respawnSec, otherZones?[[zoneKey, spawns]]]',
            'items': 'itemId -> [name, quality, class, subclass, invType, reqLevel, itemLevel, bonding, '
                     'allowableClass, sellPriceCopper, sources[[m|o|s|p, id, chancePct, minCount, maxCount]], '
                     'world?[mobLvlMin, mobLvlMax, mobCount, medianChancePct]]',
        },
        'zones': zone_out,
        'mobs': {str(k): mobs[k] for k in sorted(used_m)},
        'objects': {str(k): objects[k] for k in sorted(used_o)},
        'items': items,
    }


# ---------------------------------------------------------- RareScanner (private)
def read_rarescanner(rs):
    t = os.path.join(rs, 'Tables')
    names = {'npc': {}, 'cont': {}}

    def text(name):
        p = os.path.join(t, name)
        if not os.path.isfile(p):
            raise BuildError('RareScanner table missing: ' + p)
        return open(p, encoding='utf-8').read()

    def entries(src, var):
        """Top-level `\t[id] = {...}; --Name` entries; bodies may span lines."""
        start = src.index('private.%s = {' % var)
        body = src[start:]
        heads = list(re.finditer(r'^\t\[(\d+)\]\s*=\s*', body, re.M))
        for k, h in enumerate(heads):
            chunk = body[h.end():heads[k + 1].start() if k + 1 < len(heads) else len(body)]
            name = re.search(r'\};\s*--\s*([^\n]*)', chunk)
            yield int(h.group(1)), chunk, name.group(1).strip() if name else ''

    def zone_spots(body):
        flat = re.match(r'\{\s*zoneID\s*=\s*(\d+)', body)
        if flat:
            ov = re.search(r'overlay\s*=\s*\{([^}]*)\}', body)
            return {int(flat.group(1)): max(1, len(re.findall(r'"\d+-\d+"', ov.group(1))) if ov else 1)}
        out = {}
        for zm in re.finditer(r'\[(\d+)\]\s*=\s*\{([^\n]*)', body):
            out[int(zm.group(1))] = max(1, len(re.findall(r'"\d+-\d+"', zm.group(2))))
        return out

    npc_info = {}
    for nid, body, name in entries(text('NpcInfoTables.lua'), 'NPC_INFO'):
        lv = re.search(r'level\s*=\s*(\d+)', body)
        npc_info[nid] = (name, zone_spots(body), int(lv.group(1)) if lv else None)
    cont_info = {}
    for cid, body, name in entries(text('ContainerInfoTables.lua'), 'CONTAINER_INFO'):
        cont_info[cid] = (name, zone_spots(body))

    def chances(name, var):
        out = {}
        for eid, body, _ in entries(text(name), var):
            out[eid] = {int(a): float(b) for a, b in re.findall(r'\[(\d+)\]\s*=\s*([0-9.]+)', body)}
        return out
    npc_ch = chances('NpcLootChanceTables.lua', 'NPC_LOOT_CHANCE')
    cont_ch = chances('ContainerLootChanceTables.lua', 'CONTAINER_LOOT_CHANCE')
    zs = lambda d: {str(z): n for z, n in sorted(d.items())}
    rares = {str(k): [v[0], v[2], zs(v[1]), {str(i): c for i, c in sorted(npc_ch.get(k, {}).items())}]
             for k, v in sorted(npc_info.items())}
    conts = {str(k): [v[0], zs(v[1]), {str(i): c for i, c in sorted(cont_ch.get(k, {}).items())}]
             for k, v in sorted(cont_info.items())}
    toc = open(os.path.join(rs, 'RareScanner.toc'), encoding='utf-8').read()
    ver = re.search(r'^## Version:\s*(.+)$', toc, re.M)
    files = [{'path': 'Tables/' + n, 'sha256': sha256(os.path.join(t, n))} for n in
             ('NpcInfoTables.lua', 'NpcLootChanceTables.lua', 'ContainerInfoTables.lua', 'ContainerLootChanceTables.lua')]
    return {
        'schemaVersion': 1,
        'private': True,
        'source': {'addon': 'RareScanner', 'version': ver.group(1).strip() if ver else None,
                   'license': 'All Rights Reserved — private local use only, never redistributed',
                   'note': 'Forever-observed rares/containers. Chances are the addon\'s observed '
                           'percentages; zone keys are UiMapIDs (0 = unknown); spots = known overlay points.',
                   'files': files},
        'fields': {'rares': 'npcId -> [name, level|null, {uiMapId: knownSpots}, {itemId: chancePct}]',
                   'containers': 'objectId -> [name, {uiMapId: knownSpots}, {itemId: chancePct}]'},
        'rares': rares,
        'containers': conts,
    }


def emit(path, var, data, header):
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'), sort_keys=False)
    js = header + '(function(){"use strict";var DATA=' + body + ';\n' \
        'if(typeof module!=="undefined"&&module.exports)module.exports=DATA;\n' \
        'else if(typeof window!=="undefined")window.' + var + '=DATA;})();\n'
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(js)
    os.replace(tmp, path)
    return len(js.encode('utf-8'))


PUBLIC_HEADER = ('/*\n * drop-data.js — GENERATED by tools/build-drop-data.py. Do not edit by hand.\n'
                 ' * SPDX-License-Identifier: GPL-3.0-or-later\n'
                 ' * Derived from CMaNGOS classic-db (https://github.com/cmangos/classic-db), GPL-3.0.\n'
                 ' * See LICENSE-DATA.md. World of Warcraft content (c) Blizzard Entertainment.\n'
                 ' * Classic 1.12 reference data, approximate for Forever. Exposes window.HunterDropData.\n */\n')
PRIVATE_HEADER = ('// PRIVATE LOCAL DATA: derived from the installed RareScanner addon (All Rights Reserved).\n'
                  '// Do not publish or commit. Never inlined by build-desktop-plugin.py.\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--source-dir', default=DEFAULT_SRC, help='dir with ClassicDB.sql.gz + client CSVs')
    ap.add_argument('--out', default=os.path.join(ROOT, 'standalone', 'drop-data.js'))
    ap.add_argument('--rarescanner', default=DEFAULT_RS, help='installed RareScanner addon dir')
    ap.add_argument('--private-out', default=os.path.join(ROOT, 'standalone', 'drop-data-private.js'))
    ap.add_argument('--with-private', action='store_true',
                    help='also build the PRIVATE RareScanner layer (local only, gitignored, never published)')
    args = ap.parse_args()
    try:
        pub = build_public(args.source_dir)
        size = emit(args.out, 'HunterDropData', pub, PUBLIC_HEADER)
        report = {'public': args.out, 'bytes': size, 'items': len(pub['items']), 'mobs': len(pub['mobs']),
                  'objects': len(pub['objects']), 'zones': len(pub['zones'])}
        if args.with_private:
            priv = read_rarescanner(args.rarescanner)
            psize = emit(args.private_out, 'HunterDropDataPrivate', priv, PRIVATE_HEADER)
            os.chmod(args.private_out, 0o600)
            report.update({'private': args.private_out, 'privateBytes': psize,
                           'rares': len(priv['rares']), 'containers': len(priv['containers'])})
    except BuildError as e:
        print('build-drop-data: ' + str(e), file=sys.stderr)
        sys.exit(1)
    print(json.dumps(report))


if __name__ == '__main__':
    main()
