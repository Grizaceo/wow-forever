#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-datos-juego.py — genera data/ del modelo docs/MODELO-DATOS.md.

Entradas fijadas (tools/fuentes.json, verificadas por tools/descargar-fuentes.py):
    dump CMaNGOS classic-db (GPL-3.0) + tablas del cliente WoW Classic Era
    (raiz del source-dir) + tablas del cliente WoW Forever en/ esMX (wowf/).

Solo stdlib. Determinista: misma entrada -> mismos bytes.
"""

import argparse
import collections
import json
import os
import re
import sys

from comun import (BuildError, Loot, ZONE_LEVELS, ZoneLocator, build_zones, lados,
                   read_csv, read_sql, sha256)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, os.pardir))
DEFAULT_SRC = os.path.expanduser('~/.cache/wow-forever-drops')
DEFAULT_OUT = os.path.join(ROOT, 'data')

CMANGOS_FILE = 'ClassicDB.sql.gz'
WOWF_DIR = 'wowf'
WOWF_ES_DIR = 'wowf/esMX'

TABLES = {'creature', 'creature_template', 'creature_questrelation', 'quest_template',
          'npc_trainer', 'npc_trainer_template', 'npc_vendor', 'npc_vendor_template',
          'instance_template', 'item_template', 'spell_template',
          'creature_loot_template', 'reference_loot_template', 'gameobject_loot_template',
          'skinning_loot_template', 'pickpocketing_loot_template',
          'playercreateinfo', 'world_safe_locs', 'game_graveyard_zone', 'instance_encounters'}

# 12 SkillLine de profesion: id -> (tipo, recoleccion)
PROFESSIONS = {
    171: ('principal', False),   # Alchemy
    164: ('principal', False),   # Blacksmithing
    333: ('principal', False),   # Enchanting
    202: ('principal', False),   # Engineering
    182: ('principal', True),    # Herbalism
    165: ('principal', False),   # Leatherworking
    186: ('principal', True),    # Mining
    393: ('principal', True),    # Skinning
    197: ('principal', False),   # Tailoring
    185: ('secundaria', False),  # Cooking
    129: ('secundaria', False),  # First Aid
    356: ('secundaria', True),   # Fishing
}
PROF_IDS = set(PROFESSIONS)

CLASSES = {1, 2, 3, 4, 5, 7, 8, 9, 11}
RACE_ALLY_BITS = 1 | 4 | 8 | 64
RACE_HORDE_BITS = 2 | 16 | 32 | 128
ITEM_EXCL_LO, ITEM_EXCL_HI = 200000, 239999
ITEM_FOREVER_MIN = 240000

FACTION_NAMES = {
    'alianza': {'es': 'Alianza', 'en': 'Alliance'},
    'horda': {'es': 'Horda', 'en': 'Horde'},
}

# SubName -> SkillLine de profesion para entrenadores sin reqskill de oficio
SUBNAME_PROF = [
    ('alchem', 171), ('blacksmith', 164), ('enchant', 333), ('engineer', 202),
    ('herbal', 182), ('leather', 165), ('mining', 186), ('skinning', 393), ('skinn', 393),
    ('tailor', 197), ('cook', 185), ('chef', 185), ('first aid', 129), ('fish', 356),
]


def jload(src, *parts):
    return read_csv(os.path.join(src, *parts))


def idx(rows, key):
    return {int(r[key]): r for r in rows}


def inum(r, k, default=0):
    v = r.get(k)
    if v in (None, ''):
        return default
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def fval(*srcs):
    s = sorted(set(srcs))
    return s[0] if len(s) == 1 else s


def emit(path, data):
    keys = sorted(data)
    lines = ['{']
    for i, k in enumerate(keys):
        v = json.dumps(data[k], ensure_ascii=False, sort_keys=True,
                       separators=(',', ':'))
        lines.append(' %s: %s%s' % (json.dumps(k, ensure_ascii=False), v,
                                    ',' if i + 1 < len(keys) else ''))
    lines.append('}')
    body = '\n'.join(lines) + '\n'
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(body)
    os.replace(tmp, path)
    return len(body.encode('utf-8'))


# ------------------------------------------------------------------ carga
def load_all(src):
    w, we = os.path.join(src, WOWF_DIR), os.path.join(src, WOWF_ES_DIR)
    d = {'src': src, 'db': read_sql(os.path.join(src, CMANGOS_FILE), TABLES)}
    d['chraces'] = idx(jload(w, 'ChrRaces.csv'), 'ID')
    d['chraces_es'] = idx(jload(we, 'ChrRaces.csv'), 'ID')
    d['chrclasses'] = idx(jload(w, 'ChrClasses.csv'), 'ID')
    d['chrclasses_es'] = idx(jload(we, 'ChrClasses.csv'), 'ID')
    d['charbase'] = jload(w, 'CharBaseInfo.csv')
    d['skillline'] = idx(jload(w, 'SkillLine.csv'), 'ID')
    d['skillline_es'] = idx(jload(we, 'SkillLine.csv'), 'ID')
    d['spellname'] = idx(jload(w, 'SpellName.csv'), 'ID')
    d['spellname_es'] = idx(jload(we, 'SpellName.csv'), 'ID')
    d['uimap'] = idx(jload(w, 'UiMap.csv'), 'ID')
    d['area'] = idx(jload(w, 'AreaTable.csv'), 'ID')
    d['area_es'] = idx(jload(we, 'AreaTable.csv'), 'ID')
    d['mapname'] = idx(jload(w, 'Map.csv'), 'ID')
    d['mapname_es'] = idx(jload(we, 'Map.csv'), 'ID')
    d['item_sparse'] = idx(jload(w, 'ItemSparse.csv'), 'ID')
    d['item_sparse_es'] = idx(jload(we, 'ItemSparse.csv'), 'ID')
    d['item'] = idx(jload(w, 'Item.csv'), 'ID')
    d['sla'] = jload(w, 'SkillLineAbility.csv')
    d['spe'] = jload(w, 'SpellEffect.csv')
    d['sre'] = jload(w, 'SpellReagents.csv')
    d['srci'] = jload(w, 'SkillRaceClassInfo.csv')
    d['enc'] = jload(w, 'DungeonEncounter.csv')
    d['enc_es'] = idx(jload(we, 'DungeonEncounter.csv'), 'ID')
    d['lfg'] = jload(w, 'LFGDungeons.csv')
    d['wowf_ft'] = idx(jload(w, 'FactionTemplate.csv'), 'ID')
    d['wowf_uimap_assign'] = jload(w, 'UiMapAssignment.csv')
    d['era_ft'] = idx(jload(src, 'FactionTemplate.csv'), 'ID')
    d['era_area'] = idx(jload(src, 'AreaTable.csv'), 'ID')
    d['era_uimap_assign'] = jload(src, 'UiMapAssignment.csv')
    d['era_uimap'] = idx(jload(src, 'UiMap.csv'), 'ID')
    return d


# ------------------------------------------------------------- nombres
def build_names(d):
    cm_spell = {t['Id']: t for t in d['db']['spell_template']}
    cm_item = {t['entry']: t for t in d['db']['item_template']}
    ct = {t['Entry']: t for t in d['db']['creature_template']}

    def spell(sid):
        en = d['spellname'].get(sid, {}).get('Name_lang')
        es = d['spellname_es'].get(sid, {}).get('Name_lang')
        if not en:
            t = cm_spell.get(sid)
            en = es = (t or {}).get('SpellName') or ''
        return {'es': es or en, 'en': en or es}

    def npc(entry):
        nm = (ct.get(entry) or {}).get('Name') or ''
        return {'es': nm, 'en': nm}

    return {'spell': spell, 'npc': npc}


# ------------------------------------------------------- zonas (ui maps)
def build_zone_tables(d):
    cnt = collections.defaultdict(collections.Counter)
    for r in d['wowf_uimap_assign']:
        try:
            cnt[int(r['UiMapID'])][int(r['AreaID'])] += 1
        except (KeyError, ValueError):
            continue
    main_area = {ui: sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
                 for ui, c in cnt.items()}
    zids = sorted(ui for ui, u in d['uimap'].items() if u.get('Type') == '3')
    era_zids = {int(r['UiMapID']) for r in d['era_uimap_assign']
                if d['era_uimap'].get(int(r['UiMapID']), {}).get('Type') == '3'}
    a2u = collections.defaultdict(set)
    for r in d['era_uimap_assign']:
        if r['MapID'] in ('0', '1') and d['era_uimap'].get(int(r['UiMapID']), {}).get('Type') == '3':
            try:
                a2u[int(r['AreaID'])].add(int(r['UiMapID']))
            except ValueError:
                pass
    parent = {int(a['ID']): int(a.get('ParentAreaID') or 0) for a in d['era_area'].values()}

    def quest_zone(area_id):
        a, seen = area_id, set()
        while a and a not in seen:
            seen.add(a)
            if a in a2u:
                return min(a2u[a])
            a = parent.get(a, 0)
        return None

    return {'zids': zids, 'era_zids': era_zids, 'main_area': main_area,
            'quest_zone': quest_zone, 'cnt_area': cnt}


# ------------------------------------------------------- indices cmangos
def build_cm(d):
    db = d['db']
    ct = {t['Entry']: t for t in db['creature_template']}
    spawns = collections.defaultdict(list)
    for c in db['creature']:
        spawns[c['id']].append((c['map'], c['position_x'], c['position_y'], c['guid']))
    for v in spawns.values():
        v.sort(key=lambda t: t[3])
    nt = collections.defaultdict(list)
    for r in db['npc_trainer']:
        nt[r['entry']].append(r)
    ntt = collections.defaultdict(list)
    for r in db['npc_trainer_template']:
        ntt[r['entry']].append(r)
    vend = collections.defaultdict(set)
    vend_ilimitado = collections.defaultdict(set)   # sin tope de stock: reactivos de vendedor
    for r in db['npc_vendor']:
        vend[r['item']].add(r['entry'])
        if not r['maxcount']:
            vend_ilimitado[r['item']].add(r['entry'])
    vt = collections.defaultdict(list)
    for r in db['npc_vendor_template']:
        vt[r['entry']].append(r)
    for t in db['creature_template']:
        if t['VendorTemplateId']:
            for r in vt.get(t['VendorTemplateId'], []):
                vend[r['item']].add(t['Entry'])
                if not r['maxcount']:
                    vend_ilimitado[r['item']].add(t['Entry'])
    npc_f = {e: ct[e]['Faction'] for e in ct}
    # En 1.12 el entrenador lista el hechizo que ENSEÑA (efecto 36, aprender hechizo);
    # la receta es el hechizo que ese dispara. Se indexa por ambos.
    learn2craft = {}
    for t in db['spell_template']:
        for i in (1, 2, 3):
            if t['Effect%d' % i] == 36 and t['EffectTriggerSpell%d' % i]:
                learn2craft[t['Id']] = t['EffectTriggerSpell%d' % i]
    spell_req = collections.defaultdict(list)
    for r in db['npc_trainer'] + db['npc_trainer_template']:
        for sid in {r['spell'], learn2craft.get(r['spell'], r['spell'])}:
            spell_req[sid].append((r['reqskill'], r['reqskillvalue']))
    recipe_item = {}
    for t in db['item_template']:
        if t['class'] != 9:
            continue
        for sid in (t['spellid_1'], t['spellid_2']):
            if not sid:
                continue
            craft = learn2craft.get(sid, sid)
            if craft and craft not in recipe_item:
                recipe_item[craft] = (t['entry'], t['RequiredSkillRank'])
    trainer_spells = set()
    for r in db['npc_trainer'] + db['npc_trainer_template']:
        trainer_spells.add(r['spell'])
        trainer_spells.add(learn2craft.get(r['spell'], r['spell']))
    return {'ct': ct, 'spawns': spawns, 'nt': nt, 'ntt': ntt, 'vend': vend, 'vend_ilimitado': vend_ilimitado,
            'npc_f': npc_f, 'spell_req': spell_req, 'recipe_item': recipe_item,
            'trainer_spells': trainer_spells, 'items': {t['entry']: t for t in db['item_template']}}


# --------------------------------------------------------------- personaje
def race_faction(d, rid):
    fid = inum(d['chraces'].get(rid, {}), 'FactionID')
    fg = inum(d['wowf_ft'].get(fid, {}), 'FactionGroup')
    return 'alianza' if fg == 3 else 'horda' if fg == 5 else None


def map_pct(loc, m, x, y):
    """Coordenadas del mapa de zona en porcentaje (como las muestra el juego), o (None, None).
    El eje horizontal del mapa es el Y del mundo decreciente; el vertical, el X decreciente."""
    if m not in (0, 1):
        return None, None
    z = loc.locate(m, x, y)
    if not z:
        return None, None
    return (round((z['y1'] - y) / (z['y1'] - z['y0']) * 100, 1),
            round((z['x1'] - x) / (z['x1'] - z['x0']) * 100, 1))


def loc_key(loc, maps, m, x, y):
    if m in (0, 1):
        z = loc.locate(m, x, y)
        return z['ui'] if z else None
    mp = maps.get(m)
    if mp and mp['InstanceType'] in ('1', '2'):
        return 'i%d' % m
    return None


def build_personaje(d, loc, maps, huecos):
    pci = collections.defaultdict(list)
    for r in d['db']['playercreateinfo']:
        pci[r['race']].append(r)
    races = {}
    for rid in sorted(d['chraces']):
        if rid not in (1, 2, 3, 4, 5, 6, 7, 8, 95, 96):
            continue
        rc, rce = d['chraces'][rid], d['chraces_es'].get(rid, {})
        en, es = rc.get('Name_lang') or '', rce.get('Name_lang') or ''
        inicio, fuentes = None, ['cliente-forever']
        if pci.get(rid):
            r0 = sorted(pci[rid], key=lambda r: (r['class'], r['map']))[0]
            z = loc.locate(r0['map'], r0['position_x'], r0['position_y'])
            if z:
                inicio = {'zona': z['ui'], 'mapa': r0['map']}
            fuentes.append('cmangos-1.12')
        else:
            huecos.append({'tema': 'inicio', 'raza': rid,
                           'motivo': 'sin datos de inicio en CMaNGOS playercreateinfo'})
        races[str(rid)] = {'n': {'es': es or en, 'en': en or es},
                           'faccion': race_faction(d, rid) or 'disputada',
                           'inicio': inicio, 'f': fval(*fuentes)}
    clases = {}
    for cid in sorted(d['chrclasses']):
        if cid not in CLASSES:
            continue
        cc, cce = d['chrclasses'][cid], d['chrclasses_es'].get(cid, {})
        en, es = cc.get('Name_lang') or '', cce.get('Name_lang') or ''
        clases[str(cid)] = {'n': {'es': es or en, 'en': en or es},
                            'token': cc.get('Filename') or '', 'f': 'cliente-forever'}
    pci_pairs = {(r['race'], r['class']) for r in d['db']['playercreateinfo']}
    combos = []
    for c in sorted(d['charbase'],
                    key=lambda r: (inum(r, 'RaceID'), inum(r, 'ClassID'))):
        rid, cid = inum(c, 'RaceID'), inum(c, 'ClassID')
        if str(rid) not in races or str(cid) not in clases:
            continue
        combos.append([rid, cid, (rid, cid) not in pci_pairs])
    facciones = {k: {'n': dict(FACTION_NAMES[k]), 'f': 'curado'} for k in ('alianza', 'horda')}
    return {'facciones': facciones, 'razas': races, 'clases': clases,
            'combinaciones': combos}


# ---------------------------------------------------------------- misiones
def quest_faction(d, cm, mask, qid):
    ally = mask & RACE_ALLY_BITS
    horde = mask & RACE_HORDE_BITS
    if ally and not horde:
        return 'a'
    if horde and not ally:
        return 'h'
    if ally and horde:
        return 'ah'
    if mask:
        return 'ah'
    sides = set()
    for r in d['db']['creature_questrelation']:
        if r['quest'] != qid:
            continue
        f = cm['npc_f'].get(r['id'])
        if f is not None:
            sides.update(lados(f, d['era_ft']))
    if sides == {'a'}:
        return 'a'
    if sides == {'h'}:
        return 'h'
    return 'ah'


def build_quests(d, cm, zt, loc, maps):
    area_map = {int(a['ID']): int(a.get('ContinentID') or -1) for a in d['era_area'].values()}
    inst = {t['map'] for t in d['db']['instance_template']}
    giver = collections.defaultdict(list)
    for r in d['db']['creature_questrelation']:
        giver[r['quest']].append(r['id'])

    def donde(q):
        z = q['ZoneOrSort']
        if z > 0:
            ui = zt['quest_zone'](z)
            if ui is not None:
                return ui, None
            if area_map.get(z) in inst:
                return None, area_map[z]
        for npc in sorted(giver.get(q['entry'], [])):
            sp = cm['spawns'].get(npc)
            if sp:
                m, x, y, _ = sp[0]
                k = loc_key(loc, maps, m, x, y)
                if isinstance(k, int):
                    return k, None
                if isinstance(k, str):
                    return None, int(k[1:])
        return None, None

    out = {}
    for q in d['db']['quest_template']:
        qid = q['entry']
        fac = quest_faction(d, cm, q['RequiredRaces'], qid)
        rec = {'t': {'es': q['Title'], 'en': q['Title']},
               'nivel': q['QuestLevel'] or q['MinLevel'],
               'min': q['MinLevel'],
               'faccion': fac, 'f': 'cmangos-1.12'}
        rec['zona'], dungeon = donde(q)
        if dungeon is not None:
            rec['dungeon'] = dungeon
        if q['ZoneOrSort'] < 0:
            rec['categoria'] = -q['ZoneOrSort']
        cls = [c for c in sorted(CLASSES) if q['RequiredClasses'] & (1 << (c - 1))]
        if cls:
            rec['clases'] = cls
        if q['RequiredSkill'] in PROF_IDS:
            rec['prof'] = q['RequiredSkill']
        if q['PrevQuestId'] > 0:
            rec['prev'] = q['PrevQuestId']
        out[qid] = rec
    return out


# ----------------------------------------------------------------- recetas
def build_recipes(d, cm, names):
    cm_spells = {t['Id'] for t in d['db']['spell_template']}
    crea = collections.defaultdict(list)
    for r in d['spe']:
        if r['Effect'] == '24' and r['EffectItemType'] not in ('', '0'):
            crea[r['SpellID']].append((int(r['EffectItemType']),
                                       max(1, inum(r, 'EffectBasePointsF'))))
    reag = collections.defaultdict(dict)
    for r in d['sre']:
        for i in range(8):
            it = inum(r, 'Reagent_%d' % i)
            if it:
                reag[r['SpellID']][it] = max(reag[r['SpellID']].get(it, 0),
                                            max(1, inum(r, 'ReagentCount_%d' % i)))
    seen, rows = set(), []
    for r in sorted(d['sla'], key=lambda r: int(r['ID'])):
        k = (r['SkillLine'], r['Spell'])
        if k not in seen:
            seen.add(k)
            rows.append(r)
    excluded_range = 0
    por_skill = collections.defaultdict(list)
    for r in rows:
        sl, sid = int(r['SkillLine']), int(r['Spell'])
        if sl not in PROF_IDS:
            continue
        items = [i for i, _ in crea.get(str(sid), [])] + list(reag.get(str(sid), {}))
        if any(ITEM_EXCL_LO <= i <= ITEM_EXCL_HI for i in items):
            excluded_range += 1
            continue
        if sid not in cm_spells and not any(i >= ITEM_FOREVER_MIN for i in items):
            continue
        c_items = crea.get(str(sid), [])
        if not c_items and not reag.get(str(sid)):
            continue   # rangos de profesión y habilidades sin crafteo
        # Encantamientos: tienen reactivos pero no crean ítem (encantan uno).
        crea_pair = sorted(c_items, key=lambda t: t[0])[0] if c_items else None
        lo, hi = inum(r, 'TrivialSkillLineRankLow'), inum(r, 'TrivialSkillLineRankHigh')
        rango = ({'aprende': None, 'amarillo': lo, 'verde': (lo + hi) // 2, 'gris': hi}
                 if hi > 0 else
                 {'aprende': None, 'amarillo': None, 'verde': None, 'gris': None})
        if sid in cm['trainer_spells']:
            como = 'entrenador'
        elif sid in cm['recipe_item']:
            como = 'receta'
        elif r.get('AcquireMethod') == '1':
            como = 'automatica'   # se aprende al tomar la profesión o subir de rango
        else:
            como = 'desconocido'
        rit = cm['recipe_item'].get(sid, (None, 0))[0]
        aprende = None
        if como == 'entrenador':
            cands = [v for sk, v in cm['spell_req'].get(sid, [])
                     if v > 0 and (sk == sl or sk == 0)]
            if not cands:
                cands = [v for sk, v in cm['spell_req'].get(sid, []) if v > 0]
            aprende = min(cands) if cands else None
        elif rit is not None:
            req = inum(cm['items'].get(rit, {}), 'RequiredSkillRank')
            aprende = req if req > 0 else None
        rango['aprende'] = aprende
        por_skill[sl].append({
            'spell': sid, 'skillline': sl, 'n': names['spell'](sid),
            'crea': [crea_pair[0], crea_pair[1]] if crea_pair else None,
            'reactivos': [[i, q] for i, q in sorted(reag.get(str(sid), {}).items())],
            'rango': rango, 'como': como, 'receta_item': rit,
            'vendedores': {'alianza': [], 'horda': []},
            'f': 'cmangos-1.12' if sid in cm_spells else 'cliente-forever'})
    return por_skill, excluded_range


# ------------------------------------------------------------------ items
def item_refs(d, cm):
    refs = set()
    for v in d['recipes_by_sl'].values():
        for r in v:
            if r['crea']:
                refs.add(r['crea'][0])
            for it, _ in r['reactivos']:
                refs.add(it)
            if r['receta_item'] is not None:
                refs.add(r['receta_item'])
    for lst in cm['boss_loot'].values():
        for b in lst:
            for it, _ in b['botin']:
                refs.add(it)
    return refs


def build_items(d, cm, refs):
    it, sp, spe = d['item'], d['item_sparse'], d['item_sparse_es']
    cm_items = cm['items']
    EXC = lambda i: ITEM_EXCL_LO <= i <= ITEM_EXCL_HI
    items, n_cm, n_sin_nom = {}, 0, 0
    vendido = {iid for iid, npcs in cm['vend_ilimitado'].items() if npcs}
    for iid in sorted(sp):
        if EXC(iid):
            continue
        s, se, c = sp[iid], spe.get(iid, {}), it.get(iid, {})
        items[iid] = [se.get('Display_lang') or s.get('Display_lang') or '',
                      s.get('Display_lang') or '',
                      inum(s, 'OverallQualityID'), inum(s, 'RequiredLevel'),
                      inum(s, 'ItemLevel'), inum(s, 'SellPrice'),
                      inum(c, 'ClassID'), inum(c, 'SubclassID'), inum(s, 'Bonding'),
                      inum(s, 'BuyPrice'), 1 if iid in vendido else 0]
    for iid in sorted(refs):
        if iid in items or EXC(iid):
            continue
        if iid in cm_items:
            t = cm_items[iid]
            nm = t['name'] or ''
            items[iid] = [nm, nm, t['Quality'], t['RequiredLevel'], t['ItemLevel'],
                          t['SellPrice'], t['class'], t['subclass'], t['bonding'],
                          t['BuyPrice'], 1 if iid in vendido else 0]
            n_cm += 1
        elif iid in it:
            # Item del cliente sin ItemSparse: sin nombre ni stats publicadas.
            c = it[iid]
            items[iid] = ['', '', 0, 0, 0, 0, inum(c, 'ClassID'),
                          inum(c, 'SubclassID'), 0, 0, 0]
            n_sin_nom += 1
    return items, n_cm, n_sin_nom


# ------------------------------------------------------------------ clases
def build_competencias(d):
    sl, sl_es = d['skillline'], d['skillline_es']
    usable = {c: set() for c in CLASSES}
    for r in d['srci']:
        sid = inum(r, 'SkillID')
        if inum(sl.get(sid, {}), 'CategoryID') not in (6, 8):
            continue
        mask = inum(r, 'ClassMask', -1)
        for c in CLASSES:
            if mask == -1 or (mask >> (c - 1)) & 1:
                usable[c].add(sid)
    out = {}
    for c in sorted(CLASSES):
        lst = []
        for sid in sorted(usable[c]):
            en = sl.get(sid, {}).get('DisplayName_lang') or ''
            es = sl_es.get(sid, {}).get('DisplayName_lang') or ''
            lst.append({'id': sid, 'n': {'es': es or en, 'en': en or es}})
        out[c] = lst
    return out


def build_clases(d, cm, loc, maps, names, quests, huecos):
    trainers = collections.defaultdict(lambda: {'a': [], 'h': []})
    class_spells = collections.defaultdict(lambda: collections.defaultdict(list))
    ct = cm['ct']
    for e, t in sorted(ct.items()):
        if t['TrainerType'] != 0 or not t['TrainerClass'] or t['TrainerClass'] not in CLASSES:
            continue
        cid = t['TrainerClass']
        sp = cm['spawns'].get(e)
        if not sp:
            continue
        m, x, y, _ = sp[0]
        px, py = map_pct(loc, m, x, y)
        rec = {'npc': e, 'n': names['npc'](e), 'zona': loc_key(loc, maps, m, x, y),
               'x': px, 'y': py}
        for side in lados(t['Faction'], d['era_ft']):
            trainers[cid][side].append(rec)
        for r in cm['nt'].get(e, []) + cm['ntt'].get(t['TrainerTemplateId'], []):
            class_spells[cid][r['spell']].append((r['reqlevel'], r['spellcost']))
    comps = build_competencias(d)
    race_fac = {rid: race_faction(d, rid) for rid in d['chraces']}
    valid = set()
    for c in d['charbase']:
        rid, cid = inum(c, 'RaceID'), inum(c, 'ClassID')
        f = race_fac.get(rid)
        if cid in CLASSES and f in ('alianza', 'horda'):
            valid.add((cid, 'a' if f == 'alianza' else 'h'))
    out = {}
    for cid in sorted(CLASSES):
        key = str(cid)
        cc, cce = d['chrclasses'].get(cid, {}), d['chrclasses_es'].get(cid, {})
        en, es = cc.get('Name_lang') or '', cce.get('Name_lang') or ''
        spells = [{'spell': sid, 'n': names['spell'](sid),
                   'nivel': min(v[0] for v in vals), 'costo': min(v[1] for v in vals)}
                  for sid, vals in sorted(class_spells.get(cid, {}).items())]
        mis = {'alianza': [], 'horda': []}
        for qid, q in quests.items():
            if cid in q.get('clases', []):
                if q['faccion'] in ('a', 'ah'):
                    mis['alianza'].append(qid)
                if q['faccion'] in ('h', 'ah'):
                    mis['horda'].append(qid)
        for k in mis:
            mis[k].sort()
        tr = trainers.get(cid, {'a': [], 'h': []})
        out[key] = {'n': {'es': es or en, 'en': en or es},
                    'token': cc.get('Filename') or '',
                    'entrenadores': {'alianza': tr['a'], 'horda': tr['h']},
                    'hechizos': spells, 'misiones': mis,
                    'competencias': comps.get(cid, []),
                    'f': fval('cmangos-1.12', 'cliente-forever')}
        for side, fkey in (('a', 'alianza'), ('h', 'horda')):
            if (cid, side) in valid and not tr[side]:
                huecos.append({'tema': 'entrenadores', 'clase': cid, 'faccion': fkey,
                               'motivo': 'combinacion valida del cliente sin entrenadores '
                                         'de clase en CMaNGOS 1.12'})
            if (cid, side) in valid and not mis[fkey]:
                huecos.append({'tema': 'misiones', 'clase': cid, 'faccion': fkey,
                               'motivo': 'sin misiones de clase para esta faccion'})
    return out


# -------------------------------------------------------------- profesiones
def profession_of_subname(sub):
    s = (sub or '').lower()
    for key, pid in SUBNAME_PROF:
        if key in s:
            return pid
    return None


def npc_name(cm, e):
    nm = (cm['ct'].get(e) or {}).get('Name') or ''
    return {'es': nm, 'en': nm}


def build_prof_trainers(d, cm, loc, maps):
    out = {p: {'a': [], 'h': []} for p in PROF_IDS}
    for e, t in sorted(cm['ct'].items()):
        if t['TrainerType'] != 2:
            continue
        sp = cm['spawns'].get(e)
        if not sp:
            continue
        rows = cm['nt'].get(e, []) + cm['ntt'].get(t['TrainerTemplateId'], [])
        skills = {r['reqskill'] for r in rows if r['reqskill'] in PROF_IDS}
        if skills:
            prof = max(sorted(skills),
                       key=lambda s: sum(1 for r in rows if r['reqskill'] == s))
        else:
            prof = profession_of_subname(t['SubName'])
            if prof is None:
                continue
        m, x, y, _ = sp[0]
        vals = [r['reqskillvalue'] for r in rows if r['reqskill'] == prof] or \
               [r['reqskillvalue'] for r in rows]
        px, py = map_pct(loc, m, x, y)
        rec = {'npc': e, 'n': npc_name(cm, e), 'zona': loc_key(loc, maps, m, x, y),
               'x': px, 'y': py, 'max': max(vals) if vals else 0}
        for side in lados(t['Faction'], d['era_ft']):
            out[prof][side].append(rec)
    return out


def build_profesiones(d, cm, loc, maps, recipes_by_sl, items_keys, huecos):
    trainers = build_prof_trainers(d, cm, loc, maps)
    out, dropped = {}, 0
    for pid in sorted(PROFESSIONS):
        tipo, reco = PROFESSIONS[pid]
        sl, sl_e = d['skillline'].get(pid, {}), d['skillline_es'].get(pid, {})
        en, es = sl.get('DisplayName_lang') or '', sl_e.get('DisplayName_lang') or ''
        recs = []
        for r in sorted(recipes_by_sl.get(pid, []), key=lambda r: r['spell']):
            refs = ([r['crea'][0]] if r['crea'] else []) + [i for i, _ in r['reactivos']]
            if r['receta_item'] is not None:
                refs.append(r['receta_item'])
            if any(i not in items_keys for i in refs):
                dropped += 1
                continue
            vend = {'alianza': [], 'horda': []}
            rit = r['receta_item']
            if rit is not None:
                seen = {'a': set(), 'h': set()}
                for npc in sorted(cm['vend'].get(rit, set())):
                    f = cm['npc_f'].get(npc)
                    if f is None:
                        continue
                    for side in lados(f, d['era_ft']):
                        if npc not in seen[side]:
                            seen[side].add(npc)
                            vend['alianza' if side == 'a' else 'horda'].append(
                                {'npc': npc, 'n': npc_name(cm, npc)})
            recs.append({'spell': r['spell'], 'n': r['n'], 'crea': r['crea'],
                         'reactivos': r['reactivos'], 'rango': r['rango'],
                         'como': r['como'], 'receta_item': rit,
                         'vendedores': vend, 'f': r['f']})
        tr = trainers.get(pid, {'a': [], 'h': []})
        for side, key in (('a', 'alianza'), ('h', 'horda')):
            if not tr[side]:
                huecos.append({'tema': 'entrenadores', 'profesion': pid,
                               'faccion': key,
                               'motivo': 'sin entrenador de profesion en CMaNGOS'})
        out[str(pid)] = {'n': {'es': es or en, 'en': en or es}, 'tipo': tipo,
                         'recoleccion': reco,
                         'entrenadores': {'alianza': tr['a'], 'horda': tr['h']},
                         'recetas': recs,
                         'f': fval('cmangos-1.12', 'cliente-forever')}
    return out, dropped


# ---------------------------------------------------------------- dungeons
def build_dungeons(d, cm, names, huecos):
    inst_maps = {t['map'] for t in d['db']['instance_template']}
    clasicos, forever = {}, {}
    for t in sorted(d['db']['instance_template'], key=lambda r: r['map']):
        m, mp = t['map'], t['maxPlayers']
        if mp <= 0 or not (mp <= 10 or mp >= 20):
            continue
        en = d['mapname'].get(m, {}).get('MapName_lang') or ''
        es = d['mapname_es'].get(m, {}).get('MapName_lang') or ''
        jefes = cm['boss_loot'].get(m, [])
        if not jefes:
            huecos.append({'tema': 'jefes', 'mapa': m,
                           'motivo': 'sin encuentros en el cliente ni jefes Rank 3 en CMaNGOS'})
        sin_botin = [j['n']['en'] for j in jefes if not j['npc']]
        if sin_botin:
            huecos.append({'tema': 'botin', 'mapa': m, 'jefes': sin_botin,
                           'motivo': 'encuentro sin criatura en CMaNGOS (grupo, invocado o '
                                     'nombre distinto): botín sin vincular'})
        lo, hi = t['levelMin'], t['levelMax']
        rec = {'n': {'es': es or en, 'en': en or es},
               'niveles': {'min': lo, 'max': hi if hi > lo else lo},
               'jugadores': mp, 'jefes': jefes,
               'f': fval('cmangos-1.12', 'cliente-forever')}
        if mp >= 20:
            rec['raid'] = True
        clasicos[str(m)] = rec
    # Dungeons nuevos de Forever: mapas de instancia del cliente que no están en CMaNGOS
    # y que el buscador de grupos del cliente (LFGDungeons) nombra. Así quedan fuera
    # los restos de otras versiones que trae el cliente (Season of Discovery, pruebas).
    norm = lambda x: re.sub(r'^the ', '', (x or '').strip().lower())
    lfg = {norm(r['Name_lang']) for r in d['lfg']}
    encs = encuentros_por_mapa(d)
    for r in sorted(d['mapname'].values(), key=lambda r: int(r['ID'])):
        m = int(r['ID'])
        if r.get('InstanceType') != '1' or m in inst_maps or norm(r.get('MapName_lang')) not in lfg:
            continue
        en = r.get('MapName_lang') or ''
        es = d['mapname_es'].get(m, {}).get('MapName_lang') or ''
        jefes = [{'encuentro': e['encuentro'], 'orden': e['orden'], 'npc': None, 'n': e['n'], 'botin': None}
                 for e in encs.get(m, [])]
        forever[str(m)] = {'n': {'es': es or en, 'en': en or es},
                           'jugadores': inum(r, 'MaxPlayers'), 'niveles': None, 'jefes': jefes,
                           'f': 'cliente-forever'}
        huecos.append({'tema': 'botin', 'mapa': m,
                       'motivo': 'dungeon nuevo de Forever: jefes del cliente, botín solo en el '
                                 'servidor y sin fuente publicable'})
        if not jefes:
            huecos.append({'tema': 'jefes', 'mapa': m, 'motivo': 'el cliente no lista sus encuentros'})
    return clasicos, forever


# ------------------------------------------------------------------- zonas
def build_zonas(d, zt, quests, huecos):
    out = {}
    for ui in zt['zids']:
        u = d['uimap'].get(ui, {})
        en = u.get('Name_lang') or ''
        area = zt['main_area'].get(ui)
        es, fac, city, cont = '', 'disputada', False, None
        if area is not None:
            es = d['area_es'].get(area, {}).get('AreaName_lang') or ''
            aw = d['area'].get(area, {})
            fgm = inum(aw, 'FactionGroupMask')
            fac = 'alianza' if fgm == 2 else 'horda' if fgm == 4 else 'disputada'
            city = bool(inum(aw, 'Flags_0') & 0x100)
            if city:
                fac = 'ciudad'
        maps_c = collections.Counter()
        for r in d['wowf_uimap_assign']:
            if int(r['UiMapID']) == ui:
                maps_c[int(r['MapID'])] += 1
        if maps_c:
            mm = maps_c.most_common(1)[0][0]
            cont = 'ek' if mm == 0 else 'kalimdor' if mm == 1 else None
        niveles = None
        if ui in ZONE_LEVELS:
            lo, hi = ZONE_LEVELS[ui]
            niveles = {'min': lo, 'max': hi, 'f': 'curado'}
        elif not city:
            huecos.append({'tema': 'niveles', 'zona': ui,
                           'motivo': 'sin rango de niveles curado ni en el cliente'})
        fuentes = ['cliente-forever'] + (['curado'] if niveles else [])
        out[str(ui)] = {'n': {'es': es or en, 'en': en or es}, 'continente': cont,
                        'niveles': niveles, 'faccion': fac, 'f': fval(*fuentes)}
    ciudades = {'alianza': [], 'horda': []}
    for ui_s, rec in out.items():
        if rec['faccion'] != 'ciudad':
            continue
        area = zt['main_area'].get(int(ui_s))
        fgm = inum(d['area'].get(area, {}), 'FactionGroupMask') if area else 0
        side = 'alianza' if fgm == 2 else 'horda' if fgm == 4 else None
        if side:
            ciudades[side].append(int(ui_s))
    ciudades = {k: sorted(v) for k, v in ciudades.items()}
    mz = {}
    for qid, q in quests.items():
        if q['zona'] is None:
            continue
        z = mz.setdefault(str(q['zona']), {'alianza': [], 'horda': []})
        if q['faccion'] in ('a', 'ah'):
            z['alianza'].append(q['nivel'])
        if q['faccion'] in ('h', 'ah'):
            z['horda'].append(q['nivel'])
    mpz = {}
    for zk in sorted(mz, key=int):
        sides = mz[zk]
        mpz[zk] = {side: {'n': len(sides[key]),
                         'min': min(sides[key]) if sides[key] else None,
                         'max': max(sides[key]) if sides[key] else None}
                   for side, key in (('alianza', 'alianza'), ('horda', 'horda'))}
    return out, ciudades, mpz


# --------------------------------------------------------------- botin jefes
def encuentros_por_mapa(d):
    """Encuentros del cliente Forever (DungeonEncounter): nombre en/es y orden, por mapa.
    Un mismo jefe puede repetirse por dificultad: se deja una fila por (mapa, nombre)."""
    out = collections.defaultdict(dict)
    for r in sorted(d['enc'], key=lambda r: (int(r['MapID']), int(r['OrderIndex']), int(r['ID']))):
        m, en = int(r['MapID']), r['Name_lang']
        if en in out[m]:
            continue
        es = d['enc_es'].get(r['ID'], {}).get('Name_lang') or en
        out[m][en] = {'encuentro': int(r['ID']), 'orden': int(r['OrderIndex']), 'n': {'es': es, 'en': en}}
    return {m: list(v.values()) for m, v in out.items()}


def build_boss_loot(d, cm, loot, names):
    """Jefes por mapa de instancia clásica. Lista y orden: DungeonEncounter del cliente;
    criatura de cada encuentro: instance_encounters de CMaNGOS (creditType 0), y de ella
    el botín. Si el mapa no tiene encuentros en el cliente, respaldo: criaturas Rank 3
    con spawn en el mapa. Filtro de botín: no-mundo, chance >= 1 %, ítem en
    item_template, no ítem de misión."""
    items_t = cm['items']
    enc_npc = {r['entry']: r['creditEntry'] for r in d['db']['instance_encounters'] if r['creditType'] == 0}
    encs = encuentros_por_mapa(d)
    spmap = collections.defaultdict(set)
    for c in d['db']['creature']:
        spmap[c['map']].add(c['id'])

    def botin_de(e):
        ctt = cm['ct'].get(e)
        if not ctt or not ctt['LootId']:
            return []
        out = []
        for it, (ch, mn, mx, w) in sorted(loot.expand('creature_loot_template', ctt['LootId']).items()):
            if w or ch < 1.0 or it not in items_t:
                continue
            itm = items_t[it]
            if itm['bonding'] == 4 or itm['class'] == 12:
                continue
            out.append([it, round(ch, 1)])
        return out

    out = {}
    for t in d['db']['instance_template']:
        m = t['map']
        if t['maxPlayers'] <= 0:
            continue
        lst = []
        # Respaldo cuando instance_encounters no cubre el encuentro: la criatura con
        # spawn en el mapa y botín cuyo nombre coincide con el del encuentro.
        por_nombre = {}
        for e in sorted(spmap.get(m, ())):
            ctt = cm['ct'].get(e)
            if ctt and ctt['LootId']:
                por_nombre.setdefault(ctt['Name'].strip().lower(), e)
        for e in encs.get(m, []):
            npc = enc_npc.get(e['encuentro']) or por_nombre.get(e['n']['en'].strip().lower())
            lst.append({'encuentro': e['encuentro'], 'orden': e['orden'], 'npc': npc, 'n': e['n'],
                        'botin': botin_de(npc) if npc else []})
        if not lst:
            for e in sorted(spmap.get(m, ())):
                ctt = cm['ct'].get(e)
                if ctt and ctt['Rank'] == 3 and ctt['LootId']:
                    lst.append({'encuentro': None, 'orden': None, 'npc': e, 'n': names['npc'](e),
                                'botin': botin_de(e)})
        if lst:
            out[m] = lst
    return out


# -------------------------------------------------------------- manifiesto
def load_fuentes():
    try:
        with open(os.path.join(ROOT, 'tools', 'fuentes.json'), encoding='utf-8') as f:
            return json.load(f).get('fuentes', [])
    except (OSError, json.JSONDecodeError):
        return []


def builds_map(fuentes):
    out = {}
    for f in fuentes:
        p = f.get('parametros', {})
        out[f['id']] = p.get('build') or p.get('commit')
    return out


def meta(fuentes_used, builds):
    used = set(fuentes_used)
    return {'esquema': 1, 'origen': 'generado', 'fuentes': sorted(used),
            'generador': 'tools/build-datos-juego.py',
            'builds': {k: builds[v] for k, v in
                       {'cliente-forever': 'wago-forever',
                        'cmangos-1.12': 'cmangos-classic-db'}.items()
                       if k in used and builds.get(v)}}


def build_manifest(outdir, nombres, fuentes, builds):
    man = {'esquema': 1, 'generador': 'tools/build-datos-juego.py',
           'fuentes': fuentes, 'builds': builds, 'archivos': {}}
    for name in sorted(nombres):
        path = os.path.join(outdir, name)
        man['archivos'][name] = {'sha256': sha256(path),
                                 'bytes': os.path.getsize(path)}
    return man


# -------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description='Genera data/ del modelo MODELO-DATOS.md')
    ap.add_argument('--source-dir', default=DEFAULT_SRC)
    ap.add_argument('--out', default=DEFAULT_OUT)
    args = ap.parse_args()
    src = os.path.expanduser(args.source_dir)
    outdir = os.path.abspath(os.path.expanduser(args.out))
    if not os.path.isfile(os.path.join(src, CMANGOS_FILE)):
        raise BuildError('missing input %s' % os.path.join(src, CMANGOS_FILE))

    fuentes = load_fuentes()
    builds = builds_map(fuentes)
    d = load_all(src)
    names = build_names(d)
    zt = build_zone_tables(d)
    era_zones, era_maps = build_zones(src)
    loc = ZoneLocator(era_zones, d['db'])
    cm = build_cm(d)
    loot = Loot(d['db'])

    # ---- recolectar datos ----
    huecos_per = collections.defaultdict(list)
    quests = build_quests(d, cm, zt, loc, era_maps)
    recipes_by_sl, excl_range = build_recipes(d, cm, names)
    d['recipes_by_sl'] = recipes_by_sl
    cm['boss_loot'] = build_boss_loot(d, cm, loot, names)
    inst_maps = {t['map'] for t in d['db']['instance_template']}

    items, n_items_cm, n_items_sin_nom = build_items(d, cm, item_refs(d, cm))
    items_keys = set(items)

    pers = build_personaje(d, loc, era_maps, huecos_per['personaje'])
    clases = build_clases(d, cm, loc, era_maps, names, quests, huecos_per['clases'])
    profs, n_rec_sin_item = build_profesiones(d, cm, loc, era_maps,
                                            recipes_by_sl, items_keys,
                                            huecos_per['profesiones'])
    # filtrar botin a items.json
    for lst in cm['boss_loot'].values():
        for j in lst:
            j['botin'] = [b for b in j['botin'] if b[0] in items_keys]
    zonas_z, ciudades, mpz = build_zonas(d, zt, quests, huecos_per['zonas'])
    clasicos, forever = build_dungeons(d, cm, names, huecos_per['dungeons'])

    # ---- escritura ----
    os.makedirs(outdir, exist_ok=True)
    archivos = {}

    def put(name, obj):
        archivos[name] = emit(os.path.join(outdir, name), obj)

    put('personaje.json',
        {'meta': meta(['cliente-forever', 'cmangos-1.12', 'curado'], builds),
         **pers, 'huecos': huecos_per['personaje']})
    put('clases.json',
        {'meta': meta(['cmangos-1.12', 'cliente-forever'], builds),
         'clases': clases, 'huecos': huecos_per['clases']})
    put('profesiones.json',
        {'meta': dict(meta(['cmangos-1.12', 'cliente-forever'], builds),
                      recetas_excluidas=excl_range,
                      recetas_sin_item=n_rec_sin_item),
         'profesiones': profs, 'huecos': huecos_per['profesiones']})
    items_huecos = []
    if n_items_sin_nom:
        items_huecos.append({'tema': 'nombre',
                             'motivo': '%d items Forever citados por recetas no '
                                       'tienen nombre en las tablas del cliente '
                                       '(solo Item.csv: clase/subclase)' % n_items_sin_nom})
    put('items.json',
        {'meta': dict(meta(['cliente-forever'] + (['cmangos-1.12'] if n_items_cm else []),
                           builds),
                      items_cmangos=n_items_cm, items_sin_nombre=n_items_sin_nom),
         'items': {str(i): items[i] for i in sorted(items)}, 'huecos': items_huecos})
    put('zonas.json',
        {'meta': meta(['cliente-forever', 'curado'], builds),
         'zonas': zonas_z, 'ciudades': ciudades, 'misiones_por_zona': mpz,
         'huecos': huecos_per['zonas']})
    put('misiones.json',
        {'meta': meta(['cmangos-1.12'], builds),
         'misiones': {str(q): quests[q] for q in sorted(quests)}, 'huecos': []})
    put('dungeons.json',
        {'meta': meta(['cmangos-1.12', 'cliente-forever'], builds),
         'clasicos': clasicos, 'forever': forever, 'huecos': huecos_per['dungeons']})
    man = build_manifest(outdir, [n for n in archivos if n != 'MANIFEST.json'],
                         fuentes, builds)
    put('MANIFEST.json', man)

    resumen = {'archivos': {k: {'bytes': v} for k, v in sorted(archivos.items())},
               'recetas_excluidas_rango_sod': excl_range,
               'recetas_sin_item': n_rec_sin_item,
               'items_cmangos_fallback': n_items_cm,
               'items_sin_nombre': n_items_sin_nom,
               'huecos': {k: len(v) for k, v in sorted(huecos_per.items())}}
    print(json.dumps(resumen, ensure_ascii=False, indent=1, sort_keys=True))
    return 0


if __name__ == '__main__':
    sys.exit(main())
