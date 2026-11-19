#!/usr/bin/env python3
"""Consulta de solo lectura sobre los datos del plugin wow-forever (data/*.json).

La skill del agente lo corre con la terminal para responder con los mismos datos que muestra
la página de Hermes Desktop. Solo usa la biblioteca estándar, solo lee los archivos de data/
del paquete instalado, no escribe nada, no usa red y no lanza procesos.

Cada línea dice de dónde sale el dato, como la página:
  [Classic 1.12]     generado de CMaNGOS (WoW 1.12): aproximado, Forever puede diferir
  [cliente Forever]  generado de las tablas del cliente WoW Forever 1.60
  [curado]           escrito a mano en la guía
Lo que no está en los datos se dice con «SIN DATOS» y el motivo declarado en data/.

Uso: python3 consultar.py <orden> [opciones]   (python3 consultar.py --help)
"""
import argparse
import json
import math
import os
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]  # skills/wow-forever/scripts/consultar.py -> raíz del plugin
ORIGEN = {"cmangos-1.12": "Classic 1.12", "cliente-forever": "cliente Forever", "curado": "curado"}
FACCIONES = {"alianza": "alianza", "alliance": "alianza", "a": "alianza",
             "horda": "horda", "horde": "horda", "h": "horda"}
NOMBRE_FACCION = {"alianza": "Alianza", "horda": "Horda"}
CALIDAD = {0: "pobre", 1: "común", 2: "poco común", 3: "raro", 4: "épico", 5: "legendario"}
# Armas (clase de objeto 2) y armaduras (4): subclase -> SkillLine, igual que desktop/src/ruta-logica.js.
ARMA_A_SKILLLINE = {0: 44, 1: 172, 2: 45, 3: 46, 4: 54, 5: 160, 6: 229, 7: 43, 8: 55,
                    10: 136, 13: 473, 15: 173, 16: 176, 18: 226, 19: 228}
ARMADURA_A_SKILLLINE = {1: 415, 2: 414, 3: 413, 4: 293, 6: 433}
TRAMOS_PROFESION = (75, 150, 225, 300)  # Aprendiz, Oficial, Experto, Artesano (Classic)


class ErrorConsulta(Exception):
    pass


# ---------------------------------------------------------------- carga y ayudas

class Datos:
    def __init__(self, carpeta):
        self.carpeta = Path(carpeta)
        if not (self.carpeta / "personaje.json").is_file():
            raise ErrorConsulta(f"no encuentro data/ del plugin en {self.carpeta}")
        self._cache = {}

    def __getattr__(self, nombre):
        if nombre.startswith("_") or nombre == "carpeta":
            raise AttributeError(nombre)
        if nombre not in self._cache:
            ruta = self.carpeta / f"{nombre}.json"
            if not ruta.is_file():
                raise AttributeError(nombre)
            with open(ruta, encoding="utf-8") as f:
                self._cache[nombre] = json.load(f)
        return self._cache[nombre]


def normalizar(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join("".join(c if c.isalnum() else " " for c in s).split())


def nombre(n, lang="es"):
    """Nombre en el idioma pedido, con el otro entre paréntesis si difiere."""
    if not n:
        return ""
    if isinstance(n, str):
        return n
    a, b = (n.get("en"), n.get("es")) if lang == "en" else (n.get("es"), n.get("en"))
    a, b = a or b, b or a
    return a if not b or a == b else f"{a} ({b})"


def origen(f):
    fs = f if isinstance(f, list) else [f]
    return "[" + " + ".join(ORIGEN.get(x, str(x)) for x in fs if x) + "]"


def dinero(cobre):
    if cobre is None:
        return "?"
    cobre = int(cobre)
    o, resto = divmod(cobre, 10000)
    p, c = divmod(resto, 100)
    partes = [f"{o}o"] * bool(o) + [f"{p}p"] * bool(p) + [f"{c}c"] * (bool(c) or not (o or p))
    return " ".join(partes)


def coincide(q, *nombres):
    """0 = exacto, 1 = empieza igual, 2 = contiene; None si no coincide."""
    nq = normalizar(q)
    mejor = None
    for n in nombres:
        for texto in ([n.get("es"), n.get("en")] if isinstance(n, dict) else [n]):
            t = normalizar(texto)
            if not t or not nq:
                continue
            nivel = 0 if t == nq else 1 if t.startswith(nq) else 2 if nq in t else None
            if nivel is not None and (mejor is None or nivel < mejor):
                mejor = nivel
    return mejor


def elegir(q, opciones, que):
    """opciones: [(clave, [nombres...])]. Devuelve la clave o lanza ErrorConsulta."""
    q = str(q).strip()
    for clave, _ in opciones:
        if q == str(clave):
            return clave
    puntuadas = [(coincide(q, *ns), clave, ns) for clave, ns in opciones]
    puntuadas = [p for p in puntuadas if p[0] is not None]
    if not puntuadas:
        raise ErrorConsulta(f"no reconozco {que} «{q}»")
    mejor = min(p[0] for p in puntuadas)
    finalistas = [p for p in puntuadas if p[0] == mejor]
    if len(finalistas) > 1:
        lista = "; ".join(f"{c} = {nombre(ns[0])}" for _, c, ns in finalistas)
        raise ErrorConsulta(f"«{q}» es ambiguo como {que}: {lista}")
    return finalistas[0][1]


def zona_nombre(D, zid, lang):
    z = D.zonas["zonas"].get(str(zid)) if zid is not None else None
    return nombre(z["n"], lang) if z else (f"zona {zid}" if zid is not None else "zona desconocida")


def item_fila(D, iid):
    return D.items["items"].get(str(iid))


FACCIONES_COD = {"a": "Alianza", "h": "Horda", "ah": "ambas facciones"}


def ids_cmangos(D):
    # Ítems cuya ficha sale de CMaNGOS 1.12 porque el cliente Forever no trae su nombre.
    if not hasattr(D, "_ids_cm"):
        D._ids_cm = set(D.items.get("meta", {}).get("ids_cmangos") or ())
    return D._ids_cm


def item_nombre(D, iid, lang):
    f = item_fila(D, iid)
    if not f:
        return f"ítem {iid} (sin nombre en el cliente)"
    return nombre({"es": f[0] or f[1], "en": f[1] or f[0]}, lang)


def huecos(D, archivo, **filtro):
    return [h for h in getattr(D, archivo).get("huecos", [])
            if all(h.get(k) == v for k, v in filtro.items() if v is not None)]


def linea_hueco(h):
    return f"SIN DATOS ({h.get('tema')}): {h.get('motivo')}"


def faccion_de(q):
    if q is None:
        return None
    f = FACCIONES.get(normalizar(q))
    if not f:
        raise ErrorConsulta(f"facción «{q}»: usa alianza u horda")
    return f


def resolver_raza(D, q, faccion=None):
    razas = D.personaje["razas"]
    opciones = [(k, [r["n"]]) for k, r in razas.items() if not faccion or r["faccion"] == faccion]
    return elegir(q, opciones, "raza")


def resolver_clase(D, q):
    clases = D.personaje["clases"]
    return elegir(q, [(k, [c["n"], c["token"]]) for k, c in clases.items()], "clase")


def resolver_profesion(D, q):
    profs = D.profesiones["profesiones"]
    return elegir(q, [(k, [p["n"]]) for k, p in profs.items()], "profesión")


# ---------------------------------------------------------------- órdenes

def cmd_perfil(D, a, out):
    faccion = faccion_de(a.faccion)
    rid = resolver_raza(D, a.raza, faccion)
    cid = resolver_clase(D, a.clase)
    r, c = D.personaje["razas"][rid], D.personaje["clases"][cid]
    combo = next((x for x in D.personaje["combinaciones"] if str(x[0]) == rid and str(x[1]) == cid), None)
    out(f"Raza: {nombre(r['n'], a.lang)} (id {rid}), facción {NOMBRE_FACCION[r['faccion']]} {origen(r['f'])}")
    out(f"Clase: {nombre(c['n'], a.lang)} (id {cid}) {origen(c['f'])}")
    if not combo:
        out("Combinación NO válida en el cliente de Forever (CharBaseInfo). Revisa raza y clase.")
        return 1
    out("Combinación válida en Forever" + (": NUEVA (no existía en 1.12)" if combo[2] else ", ya existía en 1.12")
        + " [cliente Forever]")
    if r.get("inicio"):
        out(f"Zona de inicio: {zona_nombre(D, r['inicio']['zona'], a.lang)} [Classic 1.12]")
    for h in huecos(D, "personaje", raza=int(rid)):
        out(linea_hueco(h))
    if a.nivel is not None:
        if not 1 <= a.nivel <= 60:
            raise ErrorConsulta("el nivel va de 1 a 60")
        out(f"Nivel: {a.nivel}")
    return 0


def cmd_entrenadores(D, a, out):
    cid = resolver_clase(D, a.clase)
    faccion = faccion_de(a.faccion)
    c = D.clases["clases"][cid]
    out(f"Entrenadores de {nombre(D.personaje['clases'][cid]['n'], a.lang)} — {NOMBRE_FACCION[faccion]}"
        " [Classic 1.12] (coordenadas en % del mapa de la zona)")
    lista = c["entrenadores"].get(faccion) or []
    for h in huecos(D, "clases", clase=int(cid), faccion=faccion, tema="entrenadores"):
        out(linea_hueco(h))
    if not lista and not huecos(D, "clases", clase=int(cid), faccion=faccion, tema="entrenadores"):
        out("SIN DATOS: no hay entrenadores en los datos para esta clase y facción.")
    porzona = {}
    for e in lista:
        porzona.setdefault(zona_nombre(D, e["zona"], a.lang), []).append(e)
    for zn in sorted(porzona):
        filas = ", ".join(f"{nombre(e['n'], a.lang)} ({e['x']}, {e['y']})" for e in porzona[zn])
        out(f"- {zn}: {filas}")
    return 0


def cmd_hechizos(D, a, out):
    cid = resolver_clase(D, a.clase)
    hs = D.clases["clases"][cid]["hechizos"]
    desde = a.desde if a.desde is not None else (max(1, a.nivel - 3) if a.nivel else 1)
    hasta = a.hasta if a.hasta is not None else (min(60, a.nivel + 4) if a.nivel else 60)
    sel = sorted((h for h in hs if desde <= h["nivel"] <= hasta), key=lambda h: (h["nivel"], h["spell"]))
    out(f"Hechizos de entrenador de {nombre(D.personaje['clases'][cid]['n'], a.lang)}, niveles {desde}-{hasta}"
        " [Classic 1.12] (rangos y costos de 1.12; Forever puede diferir)")
    if not sel:
        out("Ninguno en ese rango.")
    for h in sel:
        marca = "" if a.nivel is None else ("  ya disponible" if h["nivel"] <= a.nivel else "  próximo")
        out(f"- nivel {h['nivel']}: {nombre(h['n'], a.lang)} — {dinero(h['costo'])}{marca}")
    return 0


def cmd_misiones_clase(D, a, out):
    cid = resolver_clase(D, a.clase)
    faccion = faccion_de(a.faccion)
    ids = D.clases["clases"][cid]["misiones"].get(faccion) or []
    out(f"Misiones de clase de {nombre(D.personaje['clases'][cid]['n'], a.lang)} — {NOMBRE_FACCION[faccion]}"
        " [Classic 1.12] (títulos en inglés: CMaNGOS no trae traducciones)")
    for h in huecos(D, "clases", clase=int(cid), faccion=faccion, tema="misiones"):
        out(linea_hueco(h))
    ms = D.misiones["misiones"]
    filas = sorted(((ms[str(q)], q) for q in ids if str(q) in ms), key=lambda x: (x[0]["nivel"], x[1]))
    if a.nivel is not None:
        filas = [x for x in filas if x[0].get("min", 1) <= a.nivel + 5 and x[0]["nivel"] >= a.nivel - 5]
    for m, q in filas[: a.max]:
        out(f"- [{q}] {nombre(m['t'], a.lang)} — nivel {m['nivel']} (desde {m.get('min', '?')}), "
            f"{zona_nombre(D, m.get('zona'), a.lang) if m.get('zona') else 'sin zona'}")
    if len(filas) > a.max:
        out(f"... y {len(filas) - a.max} más (usa --max)")
    if not filas:
        out("Ninguna en los datos" + (" cerca de ese nivel." if a.nivel is not None else "."))
    return 0


def cmd_zonas(D, a, out):
    faccion = faccion_de(a.faccion)
    Z = D.zonas
    filas = []
    for zid, z in Z["zonas"].items():
        nv = z.get("niveles")
        if not nv or not isinstance(nv.get("min"), int) or not isinstance(nv.get("max"), int):
            continue
        if not nv["min"] <= a.nivel <= nv["max"] or z["faccion"] not in (faccion, "disputada"):
            continue
        mpz = (Z.get("misiones_por_zona", {}).get(zid) or {}).get(faccion)
        filas.append((nv["min"], nv["max"], int(zid), z, mpz))
    filas.sort()
    out(f"Zonas para nivel {a.nivel} — {NOMBRE_FACCION[faccion]} (rangos oficiales de Classic [curado]; "
        "misiones de tu facción en la zona [Classic 1.12])")
    vistas = set()
    for mn, mx, zid, z, mpz in filas:
        clave = normalizar(nombre(z["n"]))
        if clave in vistas:
            continue
        vistas.add(clave)
        tipo = "disputada" if z["faccion"] == "disputada" else "de tu facción"
        mis = f", {mpz['n']} misiones de tu facción" if mpz else ""
        out(f"- {nombre(z['n'], a.lang)}: {mn}-{mx}, {tipo}{mis}")
    if not filas:
        out("Ninguna zona con rango de niveles conocido contiene ese nivel.")
    nuevas = sorted({nombre(z["n"], a.lang) for z in Z["zonas"].values()
                     if z.get("niveles") is None and z["faccion"] != "ciudad"})
    if nuevas:
        out("SIN DATOS (niveles): zonas nuevas de Forever sin rango de niveles en ninguna fuente publicable: "
            + ", ".join(nuevas))
    return 0


def dificultad(rango, skill):
    if not rango:
        return "desconocida"
    ap = rango.get("aprende")
    if ap is not None and skill < ap:
        return "no"
    am, ve, gr = rango.get("amarillo"), rango.get("verde"), rango.get("gris")
    if am is None or ve is None or gr is None:
        return "desconocida"
    return "naranja" if skill < am else "amarillo" if skill < ve else "verde" if skill < gr else "gris"


def dificultad_receta(r, skill):
    """Igual que dificultadReceta() de src/crafteo.js: las automáticas se aprenden con la
    profesión; sin requisito conocido no se sabe si ya se aprende ('desconocida' salvo gris)."""
    rango = r.get("rango")
    if not rango or rango.get("aprende") is not None:
        return dificultad(rango, skill)
    if r.get("como") == "automatica":
        return dificultad(dict(rango, aprende=0), skill)
    d = dificultad(rango, skill)
    return "gris" if d == "gris" else "desconocida"


def obtenibles(recetas, faccion):
    """Las que el plan de la página usa: entrenador, automáticas y objeto receta que vende un
    vendedor de la facción (de cualquiera si no se indica). Drops y origen desconocido, no."""
    def ok(r):
        if r.get("como") in ("entrenador", "automatica"):
            return True
        if r.get("como") != "receta":
            return False
        v = r.get("vendedores") or {}
        return bool(v.get(faccion)) if faccion else bool(v.get("alianza") or v.get("horda"))
    return [r for r in recetas if ok(r)]


def prob_subida(rango, skill):
    d = dificultad(rango, skill)
    if d == "naranja":
        return 1.0
    if d not in ("amarillo", "verde"):
        return 0.0 if d in ("gris", "no") else None
    am, gr = rango.get("amarillo"), rango.get("gris")
    if am is None or gr is None or gr <= am:
        return None
    return min(1.0, max(0.0, (gr - skill) / (gr - am)))


def plan_de_subida(recetas, desde, hasta):
    """Mismo criterio que src/crafteo.js sin precios: naranja, menos reactivos, más probabilidad."""
    def elegir_en(s):
        mejor = None
        for r in recetas:
            d = dificultad(r.get("rango"), s)
            if d not in ("naranja", "amarillo"):
                continue
            p = prob_subida(r.get("rango"), s)
            if not p or p <= 0:
                continue
            clave = (0 if d == "naranja" else 1, len(r.get("reactivos") or []), -p, r["spell"])
            if mejor is None or clave < mejor[0]:
                mejor = (clave, r, p)
        return mejor
    pasos, s = [], desde
    fin = min(hasta, desde + 300)
    while s < fin:
        e = elegir_en(s)
        spell = e[1]["spell"] if e else None
        j, crafteos = s + 1, (1 / e[2]) if e else 0
        while j < fin:
            e2 = elegir_en(j)
            if (e2[1]["spell"] if e2 else None) != spell:
                break
            crafteos += 1 / e2[2]
            j += 1
        pasos.append((s, j, e[1] if e else None, math.ceil(crafteos) if e else 0))
        s = j
    return pasos


def _round(x):
    """Math.round de JS (mitad hacia arriba) para paridad exacta con src/crafteo.js."""
    return math.floor(x + 0.5)


def costo_unidad(iid, precios, items):
    """Coste de conseguir un reactivo: vendedor (col.10==1, col.9>0) o subasta; null si no."""
    tabla = items.get("items", items) if isinstance(items, dict) else {}
    f = tabla.get(str(iid))
    if isinstance(f, list) and len(f) > 10 and f[10] == 1 and isinstance(f[9], (int, float)) and f[9] > 0:
        return {"cobre": int(f[9]), "fuente": "vendedor"}
    pr = precios.get(str(iid)) if precios else None
    if isinstance(pr, (int, float)) and pr > 0:
        return {"cobre": int(pr), "fuente": "subasta"}
    return {"cobre": None, "fuente": None}


def costo_receta(r, precios, items):
    """Coste de los reactivos de una receta. total null si falta el precio de alguno."""
    partes = []
    for par in (r.get("reactivos") or []):
        iid = par[0] if isinstance(par, list) else par
        cant = par[1] if isinstance(par, list) and len(par) > 1 and isinstance(par[1], (int, float)) and par[1] > 0 else 1
        u = costo_unidad(iid, precios, items)
        partes.append({"item": iid, "cant": cant, "cobre": u["cobre"], "fuente": u["fuente"]})
    faltan = [x["item"] for x in partes if x["cobre"] is None]
    total = None if faltan else sum(x["cobre"] * x["cant"] for x in partes)
    return {"total": total, "partes": partes, "faltan": faltan}


def costo_adquisicion(r, precios, items, faccion=None):
    """Coste de CONSEGUIR la receta (no los reactivos): 0 gratis (entrenador/automática);
    compra del objeto receta si lo vende un vendedor de la facción; si no, subasta del
    objeto receta; null si no se sabe. El entrenamiento de tramos no está en los datos."""
    tabla = items.get("items", items) if isinstance(items, dict) else {}
    if not isinstance(r, dict):
        return {"cobre": None, "fuente": None, "item": None}
    como = r.get("como")
    if como in ("entrenador", "automatica"):
        return {"cobre": 0, "fuente": "gratis", "item": None}
    iid = r.get("receta_item")
    if como != "receta" or iid is None:
        return {"cobre": None, "fuente": None, "item": iid}
    f = tabla.get(str(iid))
    vend = r.get("vendedores") or {}
    facs = [faccion] if faccion else ["alianza", "horda"]
    lo_vende = any(isinstance(vend.get(fa), list) and len(vend[fa]) > 0 for fa in facs)
    if lo_vende and isinstance(f, list) and len(f) > 10 and f[10] == 1 and isinstance(f[9], (int, float)) and f[9] > 0:
        return {"cobre": int(f[9]), "fuente": "vendedor", "item": iid}
    pr = precios.get(str(iid)) if precios else None
    if isinstance(pr, (int, float)) and pr > 0:
        return {"cobre": int(pr), "fuente": "subasta", "item": iid}
    return {"cobre": None, "fuente": None, "item": iid}


def _cum_prob(rango, fin):
    """Puntos esperados acumulados 0..fin (suma de prob_subida). Para amortizar adquisición."""
    cum = [0.0] * (fin + 1)
    for k in range(fin):
        pr = prob_subida(rango, k)
        cum[k + 1] = cum[k] + (pr if (pr is not None and pr > 0) else 0.0)
    return cum


def ruta_maxeo(recetas, desde, cap, precios, items, faccion=None):
    """Ruta de maxeo con precios, paridad con rutaMaxeo de src/crafteo.js. Incluye el coste
    de adquirir las recetas de objeto (vendedor/subasta) amortizado sobre los puntos que se
    espera que aporten, cobrado una vez. Menor coste esperado por punto (materiales/prob +
    adquisición amortizada). Incluye verdes. Las de adquisición sin dato quedan fuera y se
    listan; las de adquisición conocida pero reactivo sin precio, también. El entrenamiento
    de tramos no tiene coste en los datos: se declara. total null si no hay ruta."""
    d0, h = math.floor(desde), math.ceil(cap)
    aviso = ("El coste de entrenar los tramos con el trainer no está en los datos (SIN DATOS): "
             "no se incluye en el total.")
    base = {"desde": d0, "cap": h, "pasos": [], "totalMateriales": None, "totalAdquisicion": 0,
            "total": None, "cobertura": 0.0, "huecos": [], "adquisiciones": [],
            "adquisicionesSinDato": [], "sinPrecio": [], "avisoEntrenamiento": aviso}
    if not isinstance(recetas, list) or h <= d0:
        return base
    fin = min(h, d0 + 1000)
    infos = []
    for r in recetas:
        if not isinstance(r, dict) or not isinstance(r.get("spell"), int):
            continue
        infos.append({"r": r, "acq": costo_adquisicion(r, precios, items, faccion),
                      "costo": costo_receta(r, precios, items),
                      "nReact": len(r.get("reactivos") or []), "cum": _cum_prob(r.get("rango"), fin)})
    con_acq = [i for i in infos if i["acq"]["cobre"] is not None]
    base["adquisicionesSinDato"] = [{"spell": i["r"]["spell"], "item": i["acq"]["item"], "como": i["r"].get("como")}
                                    for i in infos if i["acq"]["cobre"] is None]
    pagadas, sin_precio = set(), {}
    total_mat, total_adq, puntos = 0.0, 0, 0
    pasos, huecos = [], []

    def elegir(s):
        mejor = None
        for info in con_acq:
            pr = prob_subida(info["r"].get("rango"), s)
            if pr is None or pr <= 0:
                continue
            if info["costo"]["total"] is None:
                sp = info["r"]["spell"]
                if sp not in sin_precio:
                    sin_precio[sp] = {"spell": sp, "faltan": info["costo"]["faltan"]}
                continue
            pe = info["cum"][fin] - info["cum"][s]
            acq_pp = (info["acq"]["cobre"] / pe) if (info["r"]["spell"] not in pagadas
                      and info["acq"]["cobre"] > 0 and pe > 0) else 0.0
            eff = info["costo"]["total"] / pr + acq_pp
            if (mejor is None or eff < mejor["eff"] or (eff == mejor["eff"] and (
                    info["nReact"] < mejor["nReact"] or (info["nReact"] == mejor["nReact"]
                    and info["r"]["spell"] < mejor["spell"])))):
                mejor = {"info": info, "p": pr, "eff": eff, "nReact": info["nReact"], "spell": info["r"]["spell"]}
        return mejor

    s = d0
    while s < fin:
        e = elegir(s)
        if e is None:
            j = s + 1
            while j < fin and elegir(j) is None:
                j += 1
            huecos.append({"desde": s, "hasta": j,
                           "motivo": "recetas sin precio de reactivos o sin receta conocida" if sin_precio
                           else "ninguna receta conocida sube en este tramo"})
            s = j
            continue
        info, spell = e["info"], e["spell"]
        if spell not in pagadas and info["acq"]["cobre"] > 0:
            pagadas.add(spell)
            total_adq += info["acq"]["cobre"]
            base["adquisiciones"].append({"spell": spell, "item": info["acq"]["item"],
                                          "cobre": info["acq"]["cobre"], "fuente": info["acq"]["fuente"], "desde": s})
        j, crafteos = s + 1, 1 / e["p"]
        mat = info["costo"]["total"] * crafteos
        while j < fin:
            e2 = elegir(j)
            if e2 is None or e2["spell"] != spell:
                break
            crafteos += 1 / e2["p"]
            mat += info["costo"]["total"] / e2["p"]
            j += 1
        total_mat += mat
        puntos += j - s
        pasos.append({"desde": s, "hasta": j, "spell": spell, "crafteos": _round(crafteos), "costo": _round(mat)})
        s = j
    base["pasos"], base["huecos"], base["sinPrecio"] = pasos, huecos, list(sin_precio.values())
    base["totalAdquisicion"] = _round(total_adq)
    base["totalMateriales"] = _round(total_mat) if pasos else None
    base["total"] = _round(total_mat + total_adq) if pasos else None
    base["cobertura"] = puntos / (fin - d0) if fin > d0 else 0.0
    return base


def cargar_precios(path, reino=None):
    """Mapa itemId(str)->cobre(int) desde un fichero de precios. Formatos: canónico
    {valores:{id:cobre},reino,fecha}; plano {id:cobre}; bundle legacy del mercado
    {values:{snapshot:{realms:[{name,items:[{itemId,unitPriceCopper}]}]}}}; extracción
    {precios_por_reino:{name:{id:cobre}}}. Devuelve (dict, meta)."""
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    if not isinstance(d, dict):
        raise ErrorConsulta("formato de precios no reconocido (se esperaba un objeto JSON)")
    meta, vals = {}, None
    if isinstance(d.get("valores"), dict):
        vals = d["valores"]
        meta = {k: d[k] for k in ("reino", "fecha", "schemaVersion") if k in d}
    elif isinstance(d.get("precios_por_reino"), dict):
        por = d["precios_por_reino"]
        nr = reino or (d.get("meta") or {}).get("reino") or next(iter(por), None)
        if nr not in por:
            raise ErrorConsulta(f"reino «{nr}» no está en el fichero; hay: {', '.join(por)}")
        vals, meta = por[nr], {"reino": nr, **(d.get("meta") or {})}
    elif isinstance(d.get("values"), dict) and isinstance(d["values"].get("snapshot"), dict):
        snap = d["values"]["snapshot"]
        realms = snap.get("realms") or []
        r = None
        if reino:
            r = next((x for x in realms if str(x.get("name", "")).lower() == str(reino).lower()), None)
        r = r or (realms[0] if realms else None)
        if not r:
            raise ErrorConsulta("el bundle de mercado no tiene realms con ítems")
        vals = {}
        for it in r.get("items") or []:
            iid, pr = it.get("itemId"), it.get("unitPriceCopper")
            if isinstance(iid, int) and iid > 0 and isinstance(pr, (int, float)) and pr > 0:
                vals[str(iid)] = int(pr)
        meta = {"reino": r.get("name"), "importedAt": snap.get("importedAt")}
    else:
        vals = {str(k): v for k, v in d.items() if str(k).isdigit() and isinstance(v, (int, float)) and v > 0}
    out = {}
    for k, v in (vals or {}).items():
        try:
            iv = int(v)
            if iv > 0:
                out[str(k)] = iv
        except (TypeError, ValueError):
            pass
    if not out:
        raise ErrorConsulta(f"no se extrajo ningún precio positivo de {path}")
    return out, meta


def imprimir_ruta(D, ruta, por_spell, lang, out, max_filas=15):
    out("")
    out(f"Ruta de maxeo con precios {ruta['desde']}→{ruta['cap']} (materiales + adquisición de recetas):")
    for x in ruta["pasos"][:max_filas]:
        r = por_spell.get(x["spell"])
        nm = nombre(r["n"], lang) if r else f"spell {x['spell']}"
        out(f"- {x['desde']}→{x['hasta']}: {nm} ×~{x['crafteos']} — materiales {dinero(x['costo'])}")
    if len(ruta["pasos"]) > max_filas:
        out(f"  ... y {len(ruta['pasos']) - max_filas} pasos más (usa --max)")
    for h in ruta["huecos"]:
        out(f"- {h['desde']}→{h['hasta']}: SIN DATOS: {h['motivo']}")
    if ruta["adquisiciones"]:
        out("Adquisición de recetas (se paga una sola vez):")
        for ad in ruta["adquisiciones"][:max_filas]:
            r = por_spell.get(ad["spell"])
            nm = nombre(r["n"], lang) if r else f"spell {ad['spell']}"
            out(f"- {nm}: objeto {ad['item']} — {dinero(ad['cobre'])} ({ad['fuente']})")
        if len(ruta["adquisiciones"]) > max_filas:
            out(f"  ... y {len(ruta['adquisiciones']) - max_filas} adquisiciones más")
    out(f"Total materiales: {dinero(ruta['totalMateriales'])} | adquisición: {dinero(ruta['totalAdquisicion'])} | TOTAL: {dinero(ruta['total'])}")
    out(f"Cobertura: {ruta['cobertura'] * 100:.0f}% de los puntos del tramo con receta con precio.")
    if ruta["adquisicionesSinDato"]:
        out(f"  {len(ruta['adquisicionesSinDato'])} recetas sin coste de adquisición conocido (SIN DATOS): fuera de la ruta con precio.")
    if ruta["sinPrecio"]:
        out(f"  {len(ruta['sinPrecio'])} recetas con adquisición conocida pero sin precio de algún reactivo: fuera de la ruta.")
    out(ruta["avisoEntrenamiento"])


COMO = {"entrenador": "entrenador", "receta": "objeto receta", "automatica": "automática al aprender la profesión",
        "desconocido": "cómo se aprende: SIN DATOS (dato del servidor)"}


def reactivos_txt(D, r, lang):
    partes = []
    for iid, cant in r.get("reactivos") or []:
        f = item_fila(D, iid)
        vend = f" [vendedor {dinero(f[9])}]" if f and len(f) > 10 and f[10] == 1 and f[9] else ""
        partes.append(f"{cant}× {item_nombre(D, iid, lang)}{vend}")
    return ", ".join(partes) or "sin reactivos"


def receta_txt(D, r, lang, skill=None):
    rg = r.get("rango") or {}
    ap = rg.get("aprende")
    umbrales = f"aprende {ap if ap is not None else 'SIN DATOS'}, amarillo {rg.get('amarillo')}, verde {rg.get('verde')}, gris {rg.get('gris')}"
    dif = f" — {dificultad_receta(r, skill)}" if skill is not None else ""
    como = COMO.get(r.get("como"), r.get("como"))
    if r.get("como") == "receta" and r.get("receta_item"):
        como += f" «{item_nombre(D, r['receta_item'], lang)}»"
    crea = ""
    if r.get("crea"):
        crea = f" → {r['crea'][1]}× {item_nombre(D, r['crea'][0], lang)}" if r["crea"][1] != 1 else ""
    return (f"{nombre(r['n'], lang)}{crea}{dif} ({umbrales}; {como}) {origen(r.get('f'))}\n"
            f"    reactivos: {reactivos_txt(D, r, lang)}")


def cmd_profesion(D, a, out):
    pid = resolver_profesion(D, a.profesion)
    p = D.profesiones["profesiones"][pid]
    faccion = faccion_de(a.faccion) if a.faccion else None
    skill = a.skill
    out(f"{nombre(p['n'], a.lang)} (id {pid}, {p['tipo']}) [cliente Forever]")
    if skill is None:
        out(f"{len(p['recetas'])} recetas en los datos. Pasa --skill N para ver qué subir.")
    for fac in ([faccion] if faccion else ["alianza", "horda"]):
        ents = p["entrenadores"].get(fac) or []
        if skill is not None:
            ents = [e for e in ents if e.get("max", 0) > skill]
        tope = min((e["max"] for e in ents), default=None)
        if tope is not None and skill is not None:
            ents = [e for e in ents if e["max"] == tope]
        ents = sorted(ents, key=lambda e: (e.get("max", 0), zona_nombre(D, e["zona"], a.lang)))
        cab = f"Entrenadores ({NOMBRE_FACCION[fac]}) [Classic 1.12]"
        if skill is not None and tope is not None:
            cab += f": el siguiente tramo enseña hasta {tope}"
        out(cab)
        for e in ents[: a.max]:
            out(f"- {nombre(e['n'], a.lang)} — {zona_nombre(D, e['zona'], a.lang)} ({e['x']}, {e['y']}), hasta {e['max']}")
        if len(ents) > a.max:
            out(f"  ... y {len(ents) - a.max} más (usa --max)")
        if not ents:
            out("- ninguno en los datos" + (" que enseñe más allá de ese skill." if skill is not None else "."))
    for h in huecos(D, "profesiones"):
        if str(h.get("profesion")) == pid:
            out(linea_hueco(h))
    if skill is None:
        return 0
    recetas = p["recetas"]
    utiles = [r for r in recetas if dificultad_receta(r, skill) in ("naranja", "amarillo")]
    utiles.sort(key=lambda r: (0 if dificultad_receta(r, skill) == "naranja" else 1,
                               len(r.get("reactivos") or []), r["spell"]))
    sin_req = sum(1 for r in recetas if dificultad_receta(r, skill) == "desconocida")
    out(f"\nRecetas que suben con skill {skill} (naranja = sube siempre; amarillo = casi siempre):")
    for r in utiles[: a.max]:
        out("- " + receta_txt(D, r, a.lang, skill))
    if len(utiles) > a.max:
        out(f"  ... y {len(utiles) - a.max} más (usa --max)")
    if not utiles:
        out("- ninguna receta conocida en naranja o amarillo con ese skill.")
    if sin_req:
        out(f"  ({sin_req} recetas más, casi todas nuevas de Forever, no traen el skill para aprenderlas "
            "ni cómo se consiguen: SIN DATOS, no se puede decir si ya te sirven)")
    precios, meta_p = None, {}
    if getattr(a, "precios", None):
        precios, meta_p = cargar_precios(a.precios, getattr(a, "reino", None))
    if getattr(a, "maxeo", False) and precios is None:
        raise ErrorConsulta("--maxeo necesita --precios FILE (export del mercado o bundle legacy)")
    if precios is not None:
        objetivo = a.hasta or (300 if getattr(a, "maxeo", False)
                               else next((t for t in TRAMOS_PROFESION if t > skill), 300))
        ruta = ruta_maxeo(recetas, skill, objetivo, precios, D.items, faccion)
        por_spell = {r["spell"]: r for r in recetas}
        out("")
        out(f"Precios: {meta_p.get('reino', '?')} ({meta_p.get('fecha') or meta_p.get('importedAt') or 'fecha desconocida'}), {len(precios)} ítems con precio.")
        imprimir_ruta(D, ruta, por_spell, a.lang, out, a.max)
        return 0
    hasta = a.hasta or next((t for t in TRAMOS_PROFESION if t > skill), 300)
    if hasta > skill:
        out("")
        out(f"Plan de subida estimado {skill}→{hasta}, como el de la página: solo recetas de entrenador, "
            "automáticas o de objeto receta que vende un vendedor" + (f" de la {NOMBRE_FACCION[faccion]}" if faccion
            else " (de cualquier facción: pasa --faccion)") + "; sin precios prefiere naranja y menos reactivos; "
            "crafteos esperados con la regla de Classic. Pasa --precios FILE para la ruta con costes (--maxeo para llegar a 300):")
        for d, h, r, n in plan_de_subida(obtenibles(recetas, faccion), skill, hasta):
            if r is None:
                out(f"- {d}→{h}: SIN DATOS: ninguna receta conocida sube en este tramo")
            else:
                como = COMO.get(r.get("como"), r.get("como"))
                out(f"- {d}→{h}: {nombre(r['n'], a.lang)} ×~{n} ({como}) — {reactivos_txt(D, r, a.lang)}")
    return 0


def cmd_receta(D, a, out):
    hallados = []
    for pid, p in D.profesiones["profesiones"].items():
        for r in p["recetas"]:
            nv = coincide(a.texto, r["n"])
            if nv is not None:
                hallados.append((nv, nombre(p["n"], a.lang), r))
    hallados.sort(key=lambda x: (x[0], x[1], x[2]["spell"]))
    if not hallados:
        out(f"Ninguna receta con «{a.texto}» en los datos.")
    for _, pn, r in hallados[: a.max]:
        out(f"- {pn}: " + receta_txt(D, r, a.lang))
        vend = r.get("vendedores") or {}
        for fac in ("alianza", "horda"):
            if vend.get(fac):
                out(f"    vende la receta ({NOMBRE_FACCION[fac]}): "
                    + ", ".join(f"{nombre(v['n'], a.lang)} — {zona_nombre(D, v.get('zona'), a.lang)}" for v in vend[fac][:4])
                    + " [Classic 1.12]")
    if len(hallados) > a.max:
        out(f"... y {len(hallados) - a.max} más (usa --max o afina el texto)")
    return 0


def cmd_item(D, a, out):
    items = D.items["items"]
    if a.texto.isdigit():
        ids = [a.texto] if a.texto in items else []
    else:
        puntuados = []
        for iid, f in items.items():
            nv = coincide(a.texto, f[0], f[1])
            if nv is not None:
                puntuados.append((nv, len(f[1] or f[0] or ""), int(iid)))
        ids = [str(x[2]) for x in sorted(puntuados)]
    if not ids:
        out(f"Ningún ítem con «{a.texto}» en los datos.")
        return 0
    for iid in ids[: a.max]:
        f = items[iid]
        compra = f" compra {dinero(f[9])}" if len(f) > 9 and f[9] else ""
        vend = {1: " (lo vende algún vendedor sin tope)", 2: " (lo vende algún vendedor, con stock limitado)"}.get(
            f[10] if len(f) > 10 else 0, "")
        dps = f", {f[11] / 10:.1f} DPS [Classic 1.12]" if len(f) > 11 and f[11] else ""
        ori = "[Classic 1.12]" if int(iid) in ids_cmangos(D) else "[cliente Forever]"
        out(f"- [{iid}] {item_nombre(D, iid, a.lang)} — {CALIDAD.get(f[2], f[2])}, nivel req. {f[3]}, "
            f"nivel de ítem {f[4]}, venta {dinero(f[5])}{compra}{vend} {ori}{dps}")
        if a.detalle or len(ids) == 1:
            fuentes = []
            for grupo in ("clasicos",):
                for mapa, d in D.dungeons[grupo].items():
                    for j in d["jefes"]:
                        for bid, prob in j.get("botin") or []:
                            if str(bid) == iid:
                                fuentes.append(f"{nombre(j['n'], a.lang)} en {nombre(d['n'], a.lang)} ({prob}%)")
            if fuentes:
                out("    cae de: " + "; ".join(fuentes[:6]) + " [Classic 1.12]")
            crea = [(nombre(p["n"], a.lang), r) for p in D.profesiones["profesiones"].values() for r in p["recetas"]
                    if r.get("crea") and str(r["crea"][0]) == iid]
            for pn, r in crea[:3]:
                out(f"    se craftea: {pn} — {nombre(r['n'], a.lang)} (gris {r['rango'].get('gris')}) {origen(r.get('f'))}")
            mis = [(q, m) for q, m in D.misiones["misiones"].items() if int(iid) in (m.get("recompensas") or ())]
            if mis:
                out("    recompensa de: " + "; ".join(f"[{q}] {nombre(m['t'], a.lang)} (nivel {m['nivel']}, "
                                                    f"{FACCIONES_COD.get(m['faccion'], m['faccion'])})" for q, m in mis[:4])
                    + " [Classic 1.12]")
            usa = sum(1 for p in D.profesiones["profesiones"].values() for r in p["recetas"]
                      if any(str(x[0]) == iid for x in r.get("reactivos") or []))
            if usa:
                out(f"    reactivo de {usa} recetas")
            if not fuentes and not crea and not mis and not (len(f) > 10 and f[10]):
                out("    de dónde sale: SIN DATOS en las fuentes publicables (el botín de criaturas comunes, "
                    "raros y cofres no se lista por ítem)")
    if len(ids) > a.max:
        out(f"... y {len(ids) - a.max} más (usa --max o afina el texto)")
    return 0


def es_util(f, competencias):
    if not f or f[2] < 2:
        return False
    if f[6] == 2:
        sl = ARMA_A_SKILLLINE.get(f[7])
    elif f[6] == 4:
        if f[7] == 0:
            return True
        sl = ARMADURA_A_SKILLLINE.get(f[7])
    else:
        return False
    return sl is not None and sl in competencias


def lista_dungeons(D):
    for grupo in ("clasicos", "forever"):
        for mapa, d in D.dungeons[grupo].items():
            yield grupo, int(mapa), d


def cmd_dungeons(D, a, out):
    filas = []
    for grupo, mapa, d in lista_dungeons(D):
        nv = d.get("niveles")
        if a.nivel is not None:
            if not nv or not (nv["min"] - 5 <= a.nivel <= nv["max"] + 5):
                continue
        filas.append((nv["min"] if nv else 999, mapa, grupo, d))
    filas.sort(key=lambda x: (x[0], x[1]))
    out("Dungeons" + (f" para nivel {a.nivel} (±5 del rango)" if a.nivel is not None else "") + ":")
    for _, mapa, grupo, d in filas:
        nv = d.get("niveles")
        rango = f"{nv['min']}-{nv['max']}" if nv else "niveles SIN DATOS"
        tipo = "nuevo de Forever, botín SIN DATOS" if grupo == "forever" else ("raid" if d.get("raid") else "dungeon")
        out(f"- {nombre(d['n'], a.lang)} (mapa {mapa}): {rango}, {tipo}, {len(d['jefes'])} jefes {origen(d.get('f'))}")
    return 0


def cmd_dungeon(D, a, out):
    opciones = [((g, m), [d["n"]]) for g, m, d in lista_dungeons(D)]
    grupo, mapa = elegir(a.texto, opciones, "dungeon")
    d = D.dungeons[grupo][str(mapa)]
    nv = d.get("niveles")
    out(f"{nombre(d['n'], a.lang)} (mapa {mapa}) {origen(d.get('f'))}")
    out(f"Niveles: {nv['min']}-{nv['max']}" if nv else "Niveles: SIN DATOS")
    competencias = None
    if a.clase:
        cid = resolver_clase(D, a.clase)
        competencias = {c["id"] for c in D.clases["clases"][cid]["competencias"]}
        out(f"Botín filtrado a lo útil para {nombre(D.personaje['clases'][cid]['n'], a.lang)} "
            "(poco común o mejor, que la clase puede equipar)")
    out("Jefes en orden (lista y orden del cliente; botín de Classic 1.12 con % de caída):")
    for j in sorted(d["jefes"], key=lambda j: j.get("orden", 0)):
        botin = j.get("botin")
        if botin is None:
            out(f"- {nombre(j['n'], a.lang)}: botín SIN DATOS (dato del servidor de Forever)")
            continue
        if not botin:
            out(f"- {nombre(j['n'], a.lang)}: botín SIN DATOS (jefe sin criatura vinculada en CMaNGOS)")
            continue
        sel = [(i, p) for i, p in botin if competencias is None or es_util(item_fila(D, i), competencias)]
        sel.sort(key=lambda x: -x[1])
        txt = ", ".join(f"{item_nombre(D, i, a.lang)} {p}%" for i, p in sel[: a.max]) or "nada útil para tu clase"
        out(f"- {nombre(j['n'], a.lang)}: {txt}")
    for h in huecos(D, "dungeons"):
        if h.get("mapa") == mapa and h.get("tema") != "botin":
            out(linea_hueco(h))
    return 0


def cmd_mision(D, a, out):
    ms = D.misiones["misiones"]
    if a.texto.isdigit():
        ids = [a.texto] if a.texto in ms else []
    else:
        ids = [q for _, q in sorted((coincide(a.texto, m["t"]), int(q)) for q, m in ms.items()
                                    if coincide(a.texto, m["t"]) is not None)]
        ids = [str(q) for q in ids]
    faccion = faccion_de(a.faccion) if a.faccion else None
    if faccion:
        cod = "a" if faccion == "alianza" else "h"
        ids = [q for q in ids if ms[q]["faccion"] in ("ah", cod)]
    if not ids:
        out(f"Ninguna misión con «{a.texto}» en los datos de 1.12. Si es nueva de Forever, la guía no la tiene.")
        return 0
    FAC = {"a": "Alianza", "h": "Horda", "ah": "ambas facciones"}
    for q in ids[: a.max]:
        m = ms[q]
        extra = []
        if m.get("clases"):
            extra.append("clase " + "/".join(nombre(D.personaje["clases"][str(c)]["n"], a.lang)
                                              for c in m["clases"] if str(c) in D.personaje["clases"]))
        if m.get("dungeon") is not None:
            d = D.dungeons["clasicos"].get(str(m["dungeon"])) or D.dungeons["forever"].get(str(m["dungeon"]))
            extra.append("dungeon " + (nombre(d["n"], a.lang) if d else str(m["dungeon"])))
        if m.get("prev"):
            pm = ms.get(str(m["prev"]))
            extra.append(f"antes: [{m['prev']}] {nombre(pm['t'], a.lang) if pm else ''}".rstrip())
        if m.get("recompensas"):
            extra.append("recompensas: " + ", ".join(f"{item_nombre(D, i, a.lang)} [{i}]" for i in m["recompensas"]))
        out(f"- [{q}] {nombre(m['t'], a.lang)} — nivel {m['nivel']} (desde {m.get('min', '?')}), "
            f"{zona_nombre(D, m.get('zona'), a.lang) if m.get('zona') else 'sin zona'}, {FAC.get(m['faccion'])}"
            + (", " + ", ".join(extra) if extra else "") + " [Classic 1.12]")
    if len(ids) > a.max:
        out(f"... y {len(ids) - a.max} más (usa --max o afina el texto)")
    return 0


def cmd_huecos(D, a, out):
    n = 0
    for archivo in ("personaje", "clases", "profesiones", "zonas", "dungeons", "misiones"):
        for h in huecos(D, archivo):
            if a.tema and h.get("tema") != a.tema:
                continue
            if a.faccion and h.get("faccion") not in (None, faccion_de(a.faccion)):
                continue
            n += 1
            if n <= a.max:
                ctx = ", ".join(f"{k}={v}" for k, v in h.items() if k not in ("tema", "motivo"))
                out(f"- {archivo}: {h.get('tema')}" + (f" ({ctx})" if ctx else "") + f": {h.get('motivo')}")
    out(f"{n} huecos declarados" + (f" (mostrando {a.max}; usa --max)" if n > a.max else ""))
    return 0


def cmd_fuentes(D, a, out):
    m = D.MANIFEST
    out("Datos del plugin wow-forever (generados, no editados a mano):")
    for f in m["fuentes"]:
        par = ", ".join(f"{k} {v}" for k, v in f.get("parametros", {}).items())
        out(f"- {f['id']}: {f['descripcion']} ({par}); licencia: {f['licencia']}")
    out("Lo curado (guía de Cazador de la Horda y Legacy) está en references/ de la skill.")
    return 0


# ---------------------------------------------------------------- CLI

def cmd_maxeo(D, a, out):
    if not a.precios:
        raise ErrorConsulta("maxeo necesita --precios FILE (export del mercado o bundle legacy)")
    precios, meta = cargar_precios(a.precios, a.reino)
    out(f"Coste estimado de maxear a 300 con precios de {meta.get('reino', '?')} "
        f"({meta.get('fecha') or meta.get('importedAt') or 'fecha desconocida'}), {len(precios)} ítems con precio.")
    out("Materiales + adquisición de recetas (vendedor/subasta). El entrenamiento de tramos NO tiene coste en los datos: SIN DATOS, no incluido.")
    profs = D.profesiones["profesiones"]
    faccion = faccion_de(a.faccion) if a.faccion else None
    skill = a.skill if a.skill is not None else 1
    pid_filtro = resolver_profesion(D, a.profesion) if a.profesion else None
    filas = []
    for pid, p in profs.items():
        if pid_filtro and pid != pid_filtro:
            continue
        recetas = p["recetas"]
        ruta = ruta_maxeo(recetas, skill, 300, precios, D.items, faccion)
        filas.append((nombre(p["n"], a.lang), ruta))
        if a.detalle:
            out("")
            out(f"=== {nombre(p['n'], a.lang)} ===")
            imprimir_ruta(D, ruta, {r["spell"]: r for r in recetas}, a.lang, out, a.max)
    out("")
    out(f"{'Profesión':<30}{'Materiales':>13}{'Adquisición':>14}{'TOTAL':>13}{'Cobertura':>11}{'Huecos':>8}")
    for nm, ruta in filas:
        out(f"{nm:<30}{dinero(ruta['totalMateriales']):>13}{dinero(ruta['totalAdquisicion']):>14}"
            f"{dinero(ruta['total']):>13}{ruta['cobertura'] * 100:>10.0f}%{len(ruta['huecos']):>8}")
    return 0


def parser():
    p = argparse.ArgumentParser(prog="consultar.py", description=__doc__.split("\n\n")[0])
    p.add_argument("--datos", help="carpeta data/ (por defecto, la del plugin instalado)")
    p.add_argument("--en", dest="lang", action="store_const", const="en", default="es",
                   help="nombres en inglés primero")
    sub = p.add_subparsers(dest="orden", required=True)

    def orden(nombre_, fn, ayuda):
        s = sub.add_parser(nombre_, help=ayuda, description=ayuda)
        s.set_defaults(fn=fn)
        s.add_argument("--max", type=int, default=15, help="máximo de filas (15)")
        return s

    s = orden("perfil", cmd_perfil, "valida raza+clase, facción y zona de inicio")
    s.add_argument("--raza", required=True); s.add_argument("--clase", required=True)
    s.add_argument("--faccion"); s.add_argument("--nivel", type=int)
    s = orden("entrenadores", cmd_entrenadores, "entrenadores de clase de una facción")
    s.add_argument("--clase", required=True); s.add_argument("--faccion", required=True)
    s = orden("hechizos", cmd_hechizos, "hechizos de entrenador por nivel")
    s.add_argument("--clase", required=True); s.add_argument("--nivel", type=int)
    s.add_argument("--desde", type=int); s.add_argument("--hasta", type=int)
    s = orden("misiones-clase", cmd_misiones_clase, "misiones de clase de una facción")
    s.add_argument("--clase", required=True); s.add_argument("--faccion", required=True)
    s.add_argument("--nivel", type=int)
    s = orden("zonas", cmd_zonas, "zonas para subir a un nivel")
    s.add_argument("--faccion", required=True); s.add_argument("--nivel", type=int, required=True)
    s = orden("profesion", cmd_profesion, "entrenadores, recetas que suben y plan de subida")
    s.add_argument("profesion"); s.add_argument("--skill", type=int); s.add_argument("--hasta", type=int)
    s.add_argument("--faccion")
    s.add_argument("--precios", help="fichero de precios (export del mercado, bundle legacy o plano id:cobre)")
    s.add_argument("--reino", help="reino del fichero de precios (si tiene varios)")
    s.add_argument("--maxeo", action="store_true", help="ruta con costes hasta 300 (requiere --precios)")
    s = orden("receta", cmd_receta, "buscar una receta por nombre")
    s.add_argument("texto")
    s = orden("item", cmd_item, "buscar un ítem por id o nombre, y de dónde sale")
    s.add_argument("texto"); s.add_argument("--detalle", action="store_true")
    s = orden("dungeons", cmd_dungeons, "lista de dungeons, o los de tu nivel")
    s.add_argument("--nivel", type=int)
    s = orden("dungeon", cmd_dungeon, "jefes y botín de un dungeon")
    s.add_argument("texto"); s.add_argument("--clase")
    s = orden("mision", cmd_mision, "buscar una misión por id o título")
    s.add_argument("texto"); s.add_argument("--faccion")
    s = orden("huecos", cmd_huecos, "datos que faltan, declarados en data/")
    s.add_argument("--tema"); s.add_argument("--faccion")
    orden("fuentes", cmd_fuentes, "fuentes, versiones y licencias de los datos")
    s = orden("maxeo", cmd_maxeo, "coste estimado de maxear profesiones a 300 con precios de mercado")
    s.add_argument("--precios", required=True); s.add_argument("--reino")
    s.add_argument("--skill", type=int); s.add_argument("--faccion")
    s.add_argument("--profesion"); s.add_argument("--detalle", action="store_true")
    return p


def main(argv=None, out=print):
    a = parser().parse_args(argv)
    carpeta = a.datos or os.environ.get("WOW_FOREVER_DATA") or (RAIZ / "data")
    try:
        D = Datos(carpeta)
        return a.fn(D, a, out) or 0
    except ErrorConsulta as e:
        out(f"error: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
