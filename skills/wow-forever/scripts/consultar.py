#!/usr/bin/env python3
"""Consulta de solo lectura sobre los datos del plugin wow-forever (data/*.json).

La skill del agente lo corre con la terminal para responder con los mismos datos que muestra
la página de Hermes Desktop. Solo usa la biblioteca estándar, solo lee los archivos de data/
del paquete instalado (y, para farmeo-*, el resumen farmeo-agente.json que la página escribe en
su carpeta de datos), no escribe nada, no usa red y no lanza procesos.

Cada línea dice de dónde sale el dato, como la página:
  [Classic 1.12]     generado de CMaNGOS (WoW 1.12): aproximado, Forever puede diferir
  [cliente Forever]  generado de las tablas del cliente WoW Forever 1.60
  [curado]           escrito a mano en la guía
Lo que no está en los datos se dice con «SIN DATOS» y el motivo declarado en data/.

Uso: python3 consultar.py <orden> [opciones]   (python3 consultar.py --help)
"""
import argparse
import hashlib
import json
import math
import os
import re
import sys
import unicodedata
from pathlib import Path

# Helper canónico del perfil (contrato perfil-v1). Tras la integración vive en esta
# misma carpeta; la importación es opcional para que los órdenes que no usan perfil
# (p. ej. `fuentes`, que corre con python -I) sigan funcionando sin él.
try:
    import perfil
    validar_perfil = perfil.validar_perfil
    NIVEL_MIN_PERFIL = perfil.NIVEL_MIN
except ImportError:  # pragma: no cover - se integra en otro commit
    perfil = None
    validar_perfil = None
    NIVEL_MIN_PERFIL = 1

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
    # Una única validación: el helper canónico del contrato perfil-v1. La CLI solo
    # resuelve nombres a IDs y describe el resultado; no reimplementa las reglas.
    if validar_perfil is None:
        raise ErrorConsulta("falta el helper canónico perfil.py (contrato perfil-v1) junto a consultar.py")
    # La CLI no exige --nivel; el helper sí lo pide. Se le pasa el mínimo del
    # contrato, que es exactamente con lo que él normaliza un perfil sin nivel.
    nivel = a.nivel if a.nivel is not None else NIVEL_MIN_PERFIL
    res = validar_perfil({"raza": rid, "clase": cid, "faccion": faccion, "nivel": nivel}, D.personaje)
    out(f"Raza: {nombre(r['n'], a.lang)} (id {rid}), facción {NOMBRE_FACCION[r['faccion']]} {origen(r['f'])}")
    out(f"Clase: {nombre(c['n'], a.lang)} (id {cid}) {origen(c['f'])}")
    if not res["ok"]:
        errores = res["errores"]
        if any(e in errores for e in ("combinacion", "raza", "clase", "faccion")):
            out("Combinación NO válida en el cliente de Forever (CharBaseInfo). Revisa raza y clase.")
            return 1
        if "nivel" in errores:
            raise ErrorConsulta("el nivel va de 1 a 60")
        raise ErrorConsulta("perfil incompleto: " + ", ".join(errores))
    combo = next((x for x in D.personaje["combinaciones"] if str(x[0]) == rid and str(x[1]) == cid), None)
    out("Combinación válida en Forever" + (": NUEVA (no existía en 1.12)" if combo and combo[2] else ", ya existía en 1.12")
        + " [cliente Forever]")
    if r.get("inicio"):
        out(f"Zona de inicio: {zona_nombre(D, r['inicio']['zona'], a.lang)} [Classic 1.12]")
    for h in huecos(D, "personaje", raza=int(rid)):
        out(linea_hueco(h))
    if a.nivel is not None:
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
    if getattr(a, "faccion", None):
        raise ErrorConsulta("los hechizos son por clase, no por facción: no se filtran; "
                            "usa 'misiones-clase --faccion' para las misiones de clase")
    cid = resolver_clase(D, a.clase)
    hs = D.clases["clases"][cid]["hechizos"]
    desde = a.desde if a.desde is not None else (max(1, a.nivel - 3) if a.nivel else 1)
    hasta = a.hasta if a.hasta is not None else (min(60, a.nivel + 4) if a.nivel else 60)
    sel = sorted((h for h in hs if desde <= h["nivel"] <= hasta), key=lambda h: (h["nivel"], h["spell"]))
    out(f"Hechizos de entrenador de {nombre(D.personaje['clases'][cid]['n'], a.lang)}"
        f" — hechizos (clase, aproximación [Classic 1.12]), niveles {desde}-{hasta}"
        " (rangos y costos de 1.12; Forever puede diferir)")
    out("Ámbito: clase; los mismos hechizos para Alianza y Horda, sin filtro por bando."
        " Para misiones por bando: misiones-clase --faccion.")
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
        " [Classic 1.12] (facción) (títulos en inglés: CMaNGOS no trae traducciones;"
        " los hechizos son por clase y no se filtran aquí)")
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


# Convenciones cuantitativas explícitas (auditoría H1/H4/H5/H11/H12/H13).
AH_CUT = 0.05  # comisión de subasta: el precio AH se valora NETO; el vendedor no paga
TENDENCIA_ROBUSTA = {"minPuntos": 4, "umbralPct": 5}  # heurística documentada, NO calibrada
PROB_SUBIDA_AVISO = (
    "probSubida es una interpolación lineal aproximada de Classic 1.12, NO verificada contra "
    "la fórmula del servidor (SkillGainChance). crafteos = Σ(1/p) por punto suponiendo intentos "
    "independientes: es una esperanza, no un número garantizado; no se estima varianza."
)
CONVENCION_RETORNO = "ratio retorno/coste (no (retorno−coste)/coste); la rentabilidad neta se da aparte"
AVISO_COBERTURA_H13 = (
    "Cobertura = puntos sobre recetas con adquisición conocida; no es una cota inferior del "
    "coste total ni prueba de coste mínimo/global."
)
AVISO_SATURACION = (
    "La liquidez en subasta NO está garantizada (avail es oferta, no ventas). Sin tasa de venta "
    "observada no se supone saturación: el retorno lineal asume que todos los crafts se colocan "
    "al precio unitario. Saturación sólo si el llamador aporta su supuesto explícito."
)


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
            "adquisicionesSinDato": [], "sinPrecio": [], "avisoEntrenamiento": aviso,
            "avisoProbabilidad": PROB_SUBIDA_AVISO, "recetasConAdquisicionConocida": 0}
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
    base["recetasConAdquisicionConocida"] = len(con_acq)
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
        # H5: el coste y el retorno usan crafts fraccionales; sólo la vista redondea.
        pasos.append({"desde": s, "hasta": j, "spell": spell, "crafteos": _round(crafteos),
                      "crafteosExactos": crafteos, "costo": _round(mat)})
        s = j
    base["pasos"], base["huecos"], base["sinPrecio"] = pasos, huecos, list(sin_precio.values())
    base["totalAdquisicion"] = _round(total_adq)
    base["totalMateriales"] = _round(total_mat) if pasos else None
    base["total"] = _round(total_mat + total_adq) if pasos else None
    base["cobertura"] = puntos / (fin - d0) if fin > d0 else 0.0
    return base


def leer_documento_mercado(path):
    """Lee JSON normal o un slot v2 en partes. El llamador elige el slot publicado."""
    path = Path(path)
    with path.open(encoding="utf-8") as f:
        d = json.load(f)
    slot = re.fullmatch(r"market-v2-([ab])\.json", path.name)
    if not slot or not isinstance(d, dict) or d.get("version") != 2:
        return d
    # Mismo contrato que desktop/src/almacen.js. El manifiesto nunca elige rutas.
    file_max, part_max, bundle_max = (4 << 20, 3 << 20, 32 << 20)
    count, size, rev, digest = (d.get(k) for k in ("parts", "bytes", "revision", "sha256"))
    if (set(d) != {"version", "revision", "parts", "bytes", "sha256"}
            or type(rev) is not int or not 1 <= rev < 2**53
            or type(count) is not int or not 2 <= count <= (bundle_max + part_max - 1) // part_max
            or type(size) is not int or not file_max < size <= bundle_max
            or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest)):
        raise ErrorConsulta("manifiesto del mercado v2 inválido")
    body = bytearray()
    for i in range(count):
        part = path.with_name(f"{path.stem}.part-{i:03}.json")
        try:
            with part.open("rb") as f:
                chunk = f.read(part_max + 1)
        except OSError as e:
            raise ErrorConsulta("conjunto del mercado v2 incompleto") from e
        if not 0 < len(chunk) <= part_max or len(body) + len(chunk) > size:
            raise ErrorConsulta("tamaño de parte del mercado v2 inválido")
        body.extend(chunk)
    if len(body) != size or hashlib.sha256(body).hexdigest() != digest:
        raise ErrorConsulta("la integridad del conjunto del mercado v2 no coincide")
    try:
        b = json.loads(body.decode("utf-8"))
    except (UnicodeError, ValueError) as e:
        raise ErrorConsulta("conjunto del mercado v2 ilegible") from e
    if (not isinstance(b, dict) or b.get("version") != 1 or b.get("revision") != rev
            or not isinstance(b.get("market"), dict) or not isinstance(b.get("history"), dict)):
        raise ErrorConsulta("conjunto del mercado v2 inválido")
    return b


def cargar_precios(path, reino=None):
    """Mapa itemId(str)->cobre(int) desde un fichero de precios. Formatos: canónico
    {valores:{id:cobre},reino,fecha}; plano {id:cobre}; bundle legacy del mercado
    {values:{snapshot:{realms:[{name,items:[{itemId,unitPriceCopper}]}]}}} o v2 con market;
    extracción
    {precios_por_reino:{name:{id:cobre}}}. Devuelve (dict, meta)."""
    d = leer_documento_mercado(path)
    if not isinstance(d, dict):
        raise ErrorConsulta("formato de precios no reconocido (se esperaba un objeto JSON)")
    meta, vals = {}, None
    market = d.get("market", d.get("values"))
    if isinstance(d.get("valores"), dict):
        vals = d["valores"]
        meta = {k: d[k] for k in ("reino", "fecha", "schemaVersion") if k in d}
    elif isinstance(d.get("precios_por_reino"), dict):
        por = d["precios_por_reino"]
        nr = reino or (d.get("meta") or {}).get("reino") or next(iter(por), None)
        if nr not in por:
            raise ErrorConsulta(f"reino «{nr}» no está en el fichero; hay: {', '.join(por)}")
        vals, meta = por[nr], {"reino": nr, **(d.get("meta") or {})}
    elif isinstance(market, dict) and isinstance(market.get("snapshot"), dict):
        snap = market["snapshot"]
        realms = snap.get("realms") or []
        r = None
        nr = reino or market.get("realm")
        if nr:
            r = next((x for x in realms if str(x.get("name", "")).lower() == str(nr).lower()), None)
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


def pct(x):
    """Ratio -> porcentaje entero, o '—' si None."""
    return f"{x * 100:.0f}%" if x is not None else "—"


def valor_creado(r, precios, items):
    """Valor de lo que crea la receta: subasta del ítem creado (× cantidad) o, sin subasta,
    venta al vendedor (col.5 × cantidad). None en encantamientos (crea null) o sin referencia.
    Paridad con valorCreado de src/crafteo.js."""
    if not isinstance(r, dict) or r.get("crea") is None:
        return None
    par = r["crea"]
    iid = par[0] if isinstance(par, list) else par
    cant = par[1] if isinstance(par, list) and len(par) > 1 and isinstance(par[1], (int, float)) and par[1] > 0 else 1
    pr = precios.get(str(iid)) if precios else None
    if isinstance(pr, (int, float)) and math.isfinite(pr) and pr > 0:
        return pr * cant
    tabla = items.get("items", items) if isinstance(items, dict) else {}
    f = tabla.get(str(iid))
    if isinstance(f, list) and len(f) > 5 and isinstance(f[5], (int, float)) and math.isfinite(f[5]):
        return f[5] * cant
    return None


def serie_historico(raw):
    """Normaliza la serie de un ítem a [{'day','low','avail'}] ordenada por día ascendente.
    Acepta triples v1 [day,low,avail] y objetos del snapshot {day,low,available}. Descarta
    observaciones sin día entero o sin mínimo positivo. Paridad con serieHistorico."""
    if not isinstance(raw, list):
        return []
    out = []
    for e in raw:
        if isinstance(e, list):
            day = e[0] if len(e) > 0 else None
            low = e[1] if len(e) > 1 else None
            avail = e[2] if len(e) > 2 else None
        elif isinstance(e, dict):
            day, low = e.get("day"), e.get("low")
            avail = e.get("available", e.get("avail"))
        else:
            continue
        if not isinstance(day, int) or isinstance(day, bool) or not isinstance(low, (int, float)) \
                or not math.isfinite(low) or low <= 0:
            continue
        out.append({"day": day, "low": low,
                    "avail": avail if isinstance(avail, (int, float)) and math.isfinite(avail) else None})
    out.sort(key=lambda x: x["day"])
    return out


def media_movil(series, ventana=None):
    """Media de los mínimos diarios de los últimos `ventana` días (None/0 = todos).
    {'media':cobre redondeado,'n','desde','hasta'} o None si vacío. Paridad con mediaMovil."""
    s = series if isinstance(series, list) else []
    if not s:
        return None
    w = ventana if isinstance(ventana, int) and not isinstance(ventana, bool) and ventana > 0 else len(s)
    ult = s[-w:]
    suma = sum(e["low"] for e in ult)
    return {"media": _round(suma / len(ult)), "n": len(ult), "desde": ult[0]["day"], "hasta": ult[-1]["day"]}


def tendencia(series):
    """Cambio % del último mínimo diario respecto al primero. {'direccion','deltaPct'} o None
    con <2 puntos. 'plana' si |Δ|<2%. Paridad con tendencia."""
    s = series if isinstance(series, list) else []
    if len(s) < 2:
        return None
    first, last = s[0]["low"], s[-1]["low"]
    if not first > 0:
        return None
    delta = ((last - first) / first) * 100
    direccion = "sube" if delta > 2 else ("baja" if delta < -2 else "plana")
    return {"direccion": direccion, "deltaPct": _round(delta * 10) / 10}


def mediana(valores):
    """Mediana de valores finitos; None si vacío. Paridad con mediana (JS)."""
    xs = sorted(v for v in (valores if isinstance(valores, list) else [])
                if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v))
    if not xs:
        return None
    m = len(xs) // 2
    return xs[m] if len(xs) % 2 else (xs[m - 1] + xs[m]) / 2


def mediana_movil(series, ventana=None):
    """Mediana de los mínimos de los últimos `ventana` días. Paridad con medianaMovil."""
    s = series if isinstance(series, list) else []
    if not s:
        return None
    w = ventana if isinstance(ventana, int) and not isinstance(ventana, bool) and ventana > 0 else len(s)
    ult = s[-w:]
    med = mediana([e["low"] for e in ult])
    if med is None:
        return None
    return {"media": _round(med), "n": len(ult), "desde": ult[0]["day"], "hasta": ult[-1]["day"]}


def tendencia_robusta(series, opts=None):
    """Compara la mediana de la primera mitad con la de la segunda (H11). Requiere >=4
    puntos y |Δ| > 5% (banda de ruido documentada, no calibrada). None = SIN DATOS.
    Paridad con tendenciaRobusta."""
    s = series if isinstance(series, list) else []
    opts = opts if isinstance(opts, dict) else {}
    min_puntos = opts.get("minPuntos", TENDENCIA_ROBUSTA["minPuntos"])
    umbral = opts.get("umbralPct", TENDENCIA_ROBUSTA["umbralPct"])
    if not isinstance(min_puntos, int) or isinstance(min_puntos, bool) or min_puntos <= 0:
        min_puntos = TENDENCIA_ROBUSTA["minPuntos"]
    if not isinstance(umbral, (int, float)) or isinstance(umbral, bool) or not math.isfinite(umbral):
        umbral = TENDENCIA_ROBUSTA["umbralPct"]
    if len(s) < min_puntos:
        return None
    mitad = len(s) // 2
    m1 = mediana([e["low"] for e in s[:mitad]])
    m2 = mediana([e["low"] for e in s[mitad:]])
    if m1 is None or m1 <= 0 or m2 is None:
        return None
    delta = ((m2 - m1) / m1) * 100
    delta_pct = _round(delta * 10) / 10
    direccion = "sube" if delta_pct > umbral else ("baja" if delta_pct < -umbral else "plana")
    return {"direccion": direccion, "deltaPct": delta_pct,
            "medianaPrimera": m1, "medianaSegunda": m2, "n": len(s)}


def precios_historicos(history_items, ventana=None, opts=None):
    """Mapa {id(str):media(cobre int)} + meta por ítem desde series históricas crudas.
    Paridad con preciosHistoricos (JS devuelve Map; aquí dict str->int). opts.robusto=True
    usa mediana de mínimos y tendencia por mitades (H11); por defecto se conserva la media
    aritmética y la tendencia extremo-a-extremo. Devuelve (precios, meta)."""
    precios, meta = {}, {}
    if not isinstance(history_items, dict):
        return precios, meta
    robusto = bool(isinstance(opts, dict) and opts.get("robusto"))
    for key, raw in history_items.items():
        try:
            iid = int(key)
        except (TypeError, ValueError):
            continue
        if iid <= 0:
            continue
        s = serie_historico(raw)
        mm = mediana_movil(s, ventana) if robusto else media_movil(s, ventana)
        if not mm:
            continue
        precios[str(iid)] = mm["media"]
        t = tendencia_robusta(s) if robusto else tendencia(s)
        meta[str(iid)] = {"media": mm["media"], "n": mm["n"], "desde": mm["desde"], "hasta": mm["hasta"],
                          "direccion": t["direccion"] if t else None, "deltaPct": t["deltaPct"] if t else None}
        if robusto:
            meta[str(iid)]["medianaPrimera"] = t["medianaPrimera"] if t else None
            meta[str(iid)]["medianaSegunda"] = t["medianaSegunda"] if t else None
    return precios, meta


def roi_ruta(recetas, desde, cap, precios, items, faccion=None, meta=None, saturacion=None):
    """ROI de la ruta de maxeo: coste (ruta_maxeo) vs valor recuperable de los crafts al subir.
    retornoVendedor = suelo garantizado (col.5 × crafteos exactos × yield). retornoEstimado =
    subasta NETO de comisión AH si hay precio medio, si no vendedor (el mayor); la liquidez AH
    NO está garantizada (avail es oferta, no ventas). crafts sin valor (crea null) se declaran
    SIN DATOS. `roi*` = retorno/coste (H1); la rentabilidad neta se publica aparte. Sin
    `saturacion` explícita no se asume tasa de venta (H12). Paridad con roiRuta."""
    ruta = ruta_maxeo(recetas, desde, cap, precios, items, faccion)
    por_spell = {}
    for r in (recetas if isinstance(recetas, list) else []):
        if isinstance(r, dict) and isinstance(r.get("spell"), int):
            por_spell[r["spell"]] = r
    tabla = items.get("items", items) if isinstance(items, dict) else {}
    sat = saturacion if (isinstance(saturacion, (int, float)) and not isinstance(saturacion, bool)
                         and math.isfinite(saturacion) and 0 < saturacion <= 1) else None
    ret_vend, ret_est, con_valor, sin_valor = 0.0, 0.0, 0, 0
    reactivos = set()
    for paso in ruta["pasos"]:
        r = por_spell.get(paso["spell"])
        for par in ((r.get("reactivos") or []) if isinstance(r, dict) else []):
            reactivos.add(par[0] if isinstance(par, list) else par)
        if not isinstance(r, dict) or r.get("crea") is None:
            sin_valor += 1
            continue
        par = r["crea"]
        cid = par[0] if isinstance(par, list) else par
        cant = par[1] if isinstance(par, list) and len(par) > 1 and isinstance(par[1], (int, float)) and par[1] > 0 else 1
        f = tabla.get(str(cid))
        vend = f[5] * cant if isinstance(f, list) and len(f) > 5 and isinstance(f[5], (int, float)) and math.isfinite(f[5]) else None
        pr = precios.get(str(cid)) if precios else None
        ah = pr * cant if isinstance(pr, (int, float)) and math.isfinite(pr) and pr > 0 else None
        if vend is None and ah is None:
            sin_valor += 1
            continue
        con_valor += 1
        # H5: usar crafts exactos también en el retorno; el entero es sólo de presentación.
        crafteos = paso.get("crafteosExactos") if (isinstance(paso.get("crafteosExactos"), (int, float))
                                                  and paso["crafteosExactos"] > 0) else paso["crafteos"]
        if vend is not None:
            ret_vend += crafteos * vend
        # H1: la subasta se valora NETO de comisión; el vendedor no paga comisión.
        ah_neto = ah * (1 - AH_CUT) if ah is not None else None
        unit_est = (max(ah_neto, vend) if (ah_neto is not None and vend is not None)
                    else (ah_neto if ah_neto is not None else vend))
        ret_est += crafteos * unit_est
    coste = ruta["total"]

    def roi(ret):
        return ret / coste if (coste is not None and coste > 0) else None

    def rentabilidad(ret):
        return (ret - coste) / coste if (coste is not None and coste > 0) else None

    tend_res = None
    if meta:
        suben = bajan = planas = sin_hist = 0
        for iid in reactivos:
            m = meta.get(str(iid))
            if m is None:
                m = meta.get(iid)
            if not m or not m.get("direccion"):
                sin_hist += 1
                continue
            d = m["direccion"]
            if d == "sube":
                suben += 1
            elif d == "baja":
                bajan += 1
            else:
                planas += 1
        tend_res = {"suben": suben, "bajan": bajan, "planas": planas, "sinHist": sin_hist}
    aviso = ("Retorno vendedor = suelo garantizado. Retorno estimado = subasta NETO de comisión si hay precio medio, "
             "si no vendedor (el mayor); la liquidez en subasta NO está garantizada (la cantidad "
             "disponible es oferta, no ventas). Media de mínimos diarios observados. Entrenamiento de tramos: SIN DATOS. "
             "Ratio retorno/coste, no rentabilidad sobre capital.")
    return {"desde": ruta["desde"], "cap": ruta["cap"], "cobertura": ruta["cobertura"],
            "coste": coste, "totalMateriales": ruta["totalMateriales"], "totalAdquisicion": ruta["totalAdquisicion"],
            "retornoVendedor": _round(ret_vend), "retornoEstimado": _round(ret_est),
            # H1: `roi*` = retorno/coste; la rentabilidad neta se publica separada.
            "roiVendedor": roi(ret_vend), "roiEstimado": roi(ret_est),
            "rentabilidadVendedor": rentabilidad(ret_vend), "rentabilidadEstimada": rentabilidad(ret_est),
            "convencionRetorno": CONVENCION_RETORNO, "comisionAH": AH_CUT,
            "netoVendedor": _round(ret_vend - coste) if coste is not None else None,
            "netoEstimado": _round(ret_est - coste) if coste is not None else None,
            # H12: sin supuesto explícito no se inventa una tasa de venta.
            "saturacion": sat, "retornoEstimadoAjustado": _round(ret_est * sat) if sat is not None else None,
            "roiEstimadoAjustado": roi(ret_est * sat) if sat is not None else None,
            "avisoSaturacion": AVISO_SATURACION,
            # H13: cobertura de skill sobre el subconjunto con adquisición conocida.
            "recetasConsideradas": ruta["recetasConAdquisicionConocida"],
            "adquisicionesSinDato": len(ruta["adquisicionesSinDato"]),
            "avisoCobertura": AVISO_COBERTURA_H13,
            "pasosConValor": con_valor, "pasosSinValor": sin_valor,
            "tendenciaResumen": tend_res, "huecos": len(ruta["huecos"]), "aviso": aviso}


def cargar_historico(path, reino=None):
    """Series por ítem {id(str):serie} desde price-history-*.json v1 ({revision,store:{v:1,
    realms:{<realm>:{items:{...}}}}}) o histórico v2 embebido ({history:{v:2,scopes:{<identidad>:
    {realms:{<realm>:{items:{...}}}}}}}). Reino: el pedido (case-insensitive) o el primero.
    Devuelve (items, meta{reino,v})."""
    d = leer_documento_mercado(path)
    if not isinstance(d, dict):
        raise ErrorConsulta("formato de histórico no reconocido (se esperaba un objeto JSON)")

    def pick_realm(realms):
        if not isinstance(realms, dict) or not realms:
            return None
        if reino:
            k = next((x for x in realms if str(x).lower() == str(reino).lower()), None)
            if k is not None:
                return k
        return next(iter(realms))

    store = d.get("store")
    if isinstance(store, dict) and isinstance(store.get("realms"), dict):
        nr = pick_realm(store["realms"])
        if nr is None or nr not in store["realms"]:
            raise ErrorConsulta(f"reino «{reino}» no está en el histórico; hay: {', '.join(store['realms'])}")
        items = store["realms"][nr].get("items") or {}
        return {str(k): v for k, v in items.items()}, {"reino": nr, "v": store.get("v", 1)}
    hist = d.get("history")
    if isinstance(hist, dict) and isinstance(hist.get("scopes"), dict):
        merged, nr_used = {}, None
        for sc in hist["scopes"].values():
            realms = (sc or {}).get("realms")
            nr = pick_realm(realms) if isinstance(realms, dict) else None
            if nr is None:
                continue
            nr_used = nr_used or nr
            for k, v in (realms[nr].get("items") or {}).items():
                merged.setdefault(str(k), v)
        if merged:
            return merged, {"reino": nr_used, "v": 2}
    raise ErrorConsulta("histórico sin store.realms (v1) ni history.scopes (v2) con ítems")


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


# Los siete archivos que pueden declarar huecos (items.json se añade en este paso).
ARCHIVOS_HUECOS = ("personaje", "clases", "profesiones", "zonas", "dungeons", "misiones", "items")


def hueco_coincide_tema(h, tema):
    """Sin tema, todos. `--tema recetas` selecciona los huecos que declaran una
    lista `recetas`, usando solo campos existentes: ni se editan los datos
    generados ni se inventan motivos."""
    if not tema:
        return True
    if h.get("tema") == tema:
        return True
    return tema == "recetas" and bool(h.get("recetas"))


def cmd_huecos(D, a, out):
    n = 0
    for archivo in ARCHIVOS_HUECOS:
        for h in huecos(D, archivo):
            if not hueco_coincide_tema(h, a.tema):
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


def cmd_roi(D, a, out):
    if not a.historico:
        raise ErrorConsulta("roi necesita --historico FILE (price-history-*.json o bundle con history)")
    hist_items, hmeta = cargar_historico(a.historico, a.reino)
    ventana = a.ventana if a.ventana and a.ventana > 0 else None
    robusto = bool(getattr(a, 'robusto', False))
    precios, meta = precios_historicos(hist_items, ventana, {'robusto': robusto})
    sat = getattr(a, 'saturacion', None)
    n_spot = 0
    if a.precios:
        spot, _ = cargar_precios(a.precios, a.reino)
        for k, v in spot.items():
            if k not in precios:
                precios[k] = v
                n_spot += 1
    if not precios:
        raise ErrorConsulta("el histórico no produjo ningún precio (¿reino correcto?)")
    dias = [m["desde"] for m in meta.values()] + [m["hasta"] for m in meta.values()]
    rango = f"{min(dias)}→{max(dias)}" if dias else "?"
    extra = f", {n_spot} con precio spot de respaldo" if n_spot else ""
    modo = "mediana de mínimos + tendencia por mitades (robusto)" if robusto else "media móvil de mínimos diarios"
    out(f"ROI de maxear a 300 con {modo} ({hmeta.get('reino', '?')}, días {rango}, "
        f"{len(meta)} ítems con histórico{extra}).")
    out("Retorno vendedor = suelo garantizado; retorno estimado = AH NETO de comisión del 5% o vendedor, "
        "el mayor. Liquidez AH NO garantizada (oferta≠ventas). Entrenamiento de tramos: SIN DATOS. "
        "Ratio ROI = retorno/coste; rentabilidad neta se muestra aparte.")
    if sat is not None:
        out(f"Saturación supuesta por el llamador: {sat:.0%} (heurística explícita, no estimada de 'avail').")
    profs = D.profesiones["profesiones"]
    faccion = faccion_de(a.faccion) if a.faccion else None
    skill = a.skill if a.skill is not None else 1
    pid_filtro = resolver_profesion(D, a.profesion) if a.profesion else None
    filas = []
    for pid, p in profs.items():
        if pid_filtro and pid != pid_filtro:
            continue
        roi = roi_ruta(p["recetas"], skill, 300, precios, D.items, faccion, meta, saturacion=sat)
        filas.append((nombre(p["n"], a.lang), roi))
        if a.detalle:
            out("")
            out(f"=== {nombre(p['n'], a.lang)} ===")
            out(f"Coste (media móvil): materiales {dinero(roi['totalMateriales'])} + adquisición {dinero(roi['totalAdquisicion'])} = {dinero(roi['coste'])}")
            out(f"Retorno vendedor (suelo): {dinero(roi['retornoVendedor'])} | ROI {pct(roi['roiVendedor'])} | rentabilidad {pct(roi['rentabilidadVendedor'])} | neto {dinero(roi['netoVendedor'])}")
            out(f"Retorno estimado (AH neto 5%/vendedor): {dinero(roi['retornoEstimado'])} | ROI {pct(roi['roiEstimado'])} | rentabilidad {pct(roi['rentabilidadEstimada'])} | neto {dinero(roi['netoEstimado'])}")
            if roi['retornoEstimadoAjustado'] is not None:
                out(f"Retorno ajustado con saturación {roi['saturacion']:.0%}: {dinero(roi['retornoEstimadoAjustado'])} | ROI {pct(roi['roiEstimadoAjustado'])} (supuesto del llamador, no medido)")
            tr = roi["tendenciaResumen"]
            if tr:
                out(f"Tendencia de reactivos: {tr['suben']} suben, {tr['bajan']} bajan, {tr['planas']} planas, {tr['sinHist']} sin histórico")
            out(f"Cobertura {roi['cobertura'] * 100:.0f}% | recetas consideradas (adquisición conocida) {roi['recetasConsideradas']}, adquisiciones SIN DATO {roi['adquisicionesSinDato']} | pasos con valor {roi['pasosConValor']}, sin valor (SIN DATOS) {roi['pasosSinValor']} | huecos {roi['huecos']}")
            out(roi['avisoCobertura'])
    out("")
    out(f"{'Profesión':<30}{'Coste':>13}{'Ret.vend':>13}{'ROI vend':>9}{'Ret.est':>13}{'ROI est':>9}{'Cob':>7}"
        + (f"{'ROI aj':>9}" if sat is not None else ""))
    for nm, roi in filas:
        out(f"{nm:<30}{dinero(roi['coste']):>13}{dinero(roi['retornoVendedor']):>13}{pct(roi['roiVendedor']):>9}"
            f"{dinero(roi['retornoEstimado']):>13}{pct(roi['roiEstimado']):>9}{roi['cobertura'] * 100:>6.0f}%"
            + (f"{pct(roi['roiEstimadoAjustado']):>9}" if sat is not None else ""))
    return 0


# ---------------------------------------------------------------- farmeo (sesiones y plan)
# La página Mercado → Farmeo escribe farmeo-agente.json en la carpeta de datos del plugin
# de Hermes Desktop: sesiones medidas con el addon WoWForeverFarm, estilo calibrado y el
# plan de sesión. Aquí solo se lee. Los valores vienen en oro (1 oro = 10000 cobre).
ARCHIVO_FARMEO = "farmeo-agente.json"


def rutas_farmeo():
    rel = Path("Hermes") / "plugin-files" / "data" / "wow-hunter-guide" / ARCHIVO_FARMEO
    out = []
    if os.environ.get("WOW_FOREVER_FARMEO"):
        out.append(Path(os.environ["WOW_FOREVER_FARMEO"]).expanduser())
    out.append(Path.home() / ".config" / rel)
    if os.environ.get("APPDATA"):
        out.append(Path(os.environ["APPDATA"]) / rel)
    out.append(Path.home() / "Library" / "Application Support" / rel)
    return out


def cargar_farmeo(archivo=None):
    candidatos = [Path(archivo).expanduser()] if archivo else rutas_farmeo()
    for c in candidatos:
        if c.is_file():
            try:
                d = json.loads(c.read_text(encoding="utf-8"))
            except (OSError, ValueError) as e:
                raise ErrorConsulta(f"no se pudo leer {c}: {e}")
            if not isinstance(d, dict) or d.get("schema") != 1 or not isinstance(d.get("sesiones"), list):
                raise ErrorConsulta(f"{c} no es un contexto de farmeo schema 1")
            d["_archivo"] = str(c)
            return d
    raise ErrorConsulta("no hay contexto de farmeo. Abre Hermes Desktop → WoW Forever → Mercado → Farmeo "
                        "(con un escaneo de Auctionator) para que el plugin escriba " + ARCHIVO_FARMEO +
                        "; las sesiones se miden con el addon WoWForeverFarm (/wff start, /wff stop, /reload). "
                        "Buscado en: " + ", ".join(str(c) for c in candidatos))


def oro_txt(g):
    return "?" if g is None else f"{g:.2f}o"


def pct_txt(x, signo=False):
    if x is None:
        return "?"
    return (f"{x:+.0f}%" if signo else f"{x:.0f}%")


def cabecera_farmeo(d, out):
    pj = d.get("personaje") or {}
    out(f"[tus sesiones] {d.get('totalSesiones', len(d['sesiones']))} sesiones medidas · contexto generado {d.get('generado', '?')}"
        + (f" · nivel {pj.get('nivel')}" if pj.get("nivel") else ""))


def cmd_farmeo_sesiones(D, a, out):
    d = cargar_farmeo(a.archivo)
    cabecera_farmeo(d, out)
    ses = d["sesiones"][-a.max:]
    if not ses:
        out("SIN DATOS: todavía no hay sesiones. En el juego: /wff start antes de farmear, /wff stop al terminar y /reload.")
        return 0
    out(f"{'Fecha':<11}{'Min':>5} {'Zona':<20}{'Muertes/h':>10}{'Pelea':>7}  {'Comb·Saq·Resto':<16}{'Oro/h':>9}{'Predicho':>10}{'Ritmo':>7}{'Botín':>7}")
    for s in ses:
        p = s.get("prediccion") or {}
        out(f"{(s.get('inicio') or '?')[:10]:<11}{s.get('minutos', 0):>5} {str(s.get('zona') or '?')[:19]:<20}"
            f"{(s.get('muertesH') or 0):>10.0f}{(str(round(s['peleaS'])) + ' s') if s.get('peleaS') is not None else '?':>7}  "
            f"{pct_txt(s.get('combatePct'))}·{pct_txt(s.get('saqueoPct'))}·{pct_txt(s.get('restoPct')):<8}"
            f"{oro_txt(s.get('oroHSubasta')):>9}{oro_txt(p.get('oroH')) if p else '—':>10}"
            f"{pct_txt(p.get('errorRitmoPct'), True) if p else '—':>7}{pct_txt(p.get('errorBotinPct'), True) if p else '—':>7}"
            + ("  *muertes solo por saqueo" if s.get("metodoMuertes") == "solo-saqueo" else "")
            + (f"  [pesca: {s.get('pescasH') or 0:.0f} capturas/h]" if s.get("tipo") == "pesca" else ""))
    horas = sum((s.get("minutos") or 0) for s in d["sesiones"]) / 60
    oro_total = sum((s.get("oroHSubasta") or 0) * (s.get("minutos") or 0) / 60 for s in d["sesiones"])
    out(f"Total: {horas:.1f} h medidas · ≈{oro_total:.1f} oro (botín a precio de subasta actual + monedas).")
    out("Zona = UiMapID del juego. «Predicho» = modelo base del plugin (drops de Classic, estilo por defecto) para los "
        "mismos mobs; «Ritmo» y «Botín» = cuánto se aparta tu sesión de ese modelo. Oro/h valora el botín al precio de "
        "subasta actual sin tope de venta; no es lo vendido.")
    return 0


def elegir_sesion(d, clave):
    ses = d["sesiones"]
    if not ses:
        raise ErrorConsulta("no hay sesiones medidas")
    if clave is None or clave == "":
        return ses[-1]
    if str(clave).isdigit() and int(clave) <= len(ses):
        return ses[-int(clave)]  # 1 = la última
    for s in ses:
        if s.get("id") == clave:
            return s
    raise ErrorConsulta(f"no existe la sesión {clave} (usa farmeo-sesiones para ver ids; 1 = la última)")


def cmd_farmeo_sesion(D, a, out):
    d = cargar_farmeo(a.archivo)
    s = elegir_sesion(d, a.id)
    p = s.get("prediccion") or {}
    out(f"[tus sesiones] Sesión {s.get('id')} · {s.get('inicio')} · {s.get('minutos')} min activos (+{s.get('pausaMin', 0)} en pausa)")
    out(f"Tiempo: combate {pct_txt(s.get('combatePct'))} · saqueo {pct_txt(s.get('saqueoPct'))} · resto (caminar, comer, buscar) {pct_txt(s.get('restoPct'))}")
    if s.get("tipo") == "pesca":
        out(f"Pesca: {s.get('pescas')} capturas ({(s.get('pescasH') or 0):.0f}/h) · saqueo {s.get('saqueoS')} s por captura"
            + (f" · además {s.get('muertes')} muertes" if s.get("muertes") else "")
            + ". El plugin no predice la pesca: este oro/h es lo medido.")
    else:
        out(f"Ritmo: {s.get('muertes')} muertes ({(s.get('muertesH') or 0):.0f}/h) · pelea {s.get('peleaS')} s por muerte · "
            f"saqueo {s.get('saqueoS')} s · {s.get('segPorMuerte')} s por muerte en total · muertes propias {s.get('muertesJugador', 0)}")
    out(f"Oro: monedas {oro_txt(s.get('monedasOro'))} · botín a vendedor {oro_txt(s.get('valorVendedorOro'))} · a subasta {oro_txt(s.get('valorSubastaOro'))} "
        f"→ {oro_txt(s.get('oroHSubasta'))}/h (vendedor {oro_txt(s.get('oroHVendedor'))}/h)")
    if p:
        out(f"[estimación] Predicho para los mismos mobs: {oro_txt(p.get('oroH'))}/h · {p.get('muertesH')} muertes/h · "
            f"diferencia oro {pct_txt(p.get('errorOroPct'), True)}, ritmo {pct_txt(p.get('errorRitmoPct'), True)}, botín por muerte {pct_txt(p.get('errorBotinPct'), True)}")
    if s.get("mobs"):
        out("Mobs: " + ", ".join(f"{m.get('nombre')} ×{m.get('muertes')}" for m in s.get("mobs", [])))
    out("Botín principal: " + ", ".join(f"{i.get('nombre')} ×{i.get('unidades')} ({oro_txt(i.get('valorOro'))})" for i in s.get("items", [])))
    out(f"Muertes contadas por: {s.get('metodoMuertes')}" + (" (los mobs sin botín no cuentan)" if s.get("metodoMuertes") == "solo-saqueo" else ""))
    extra = []
    if s.get("viajeMin"):
        extra.append(f"viaje hasta la primera pelea {s.get('viajeMin')} min (fuera del reloj)")
    if s.get("muertoMin"):
        extra.append(f"{s.get('muertoMin')} min muerto o volviendo al cadáver")
    if s.get("muertesSinMob"):
        extra.append(f"{s.get('muertesSinMob')} muertes sin mob conocido (el juego ocultó el GUID)")
    if s.get("xpH"):
        extra.append(f"{s.get('xpH')} XP/h")
    if s.get("botinDe") == "chat":
        extra.append("botín = lo que entró a tus bolsas")
    if extra:
        out("Además: " + " · ".join(extra))
    return 0


def cmd_farmeo_estilo(D, a, out):
    d = cargar_farmeo(a.archivo)
    cabecera_farmeo(d, out)
    e = d.get("estilo")
    if not e:
        out("SIN DATOS: el plugin no exportó estilo.")
        return 0
    if e.get("fuente") == "sesiones":
        out(f"[tus sesiones] Estilo calibrado con {e.get('muertes')} muertes en {e.get('sesiones')} sesiones:")
    else:
        out(f"[estimación] Supuestos por defecto: faltan muertes medidas ({e.get('muertes', 0)} de 30) para calibrar.")
    out(f"  DPS efectivo: {e.get('dpsK')} × nivel (vida del mob ÷ segundos de pelea por muerte)")
    out(f"  Saqueo: {e.get('saqueoS')} s por cadáver · pausas: {pct_txt(e.get('pausasPct'))} del tiempo · velocidad supuesta {e.get('velocidad')} yd/s")
    out(f"  Incertidumbre del plan: ±{pct_txt(e.get('incertidumbrePct'))}")
    ses = [s for s in d["sesiones"] if s.get("muertesH")]
    if len(ses) >= 4:
        mitad = len(ses) // 2
        def media(xs, k):
            v = [x.get(k) for x in xs if x.get(k) is not None]
            return sum(v) / len(v) if v else None
        for k, nom in (("muertesH", "muertes/h"), ("peleaS", "s de pelea"), ("oroHSubasta", "oro/h")):
            a1, a2 = media(ses[:mitad], k), media(ses[mitad:], k)
            if a1 and a2:
                out(f"  Tendencia {nom}: {a1:.1f} → {a2:.1f} ({(a2 / a1 - 1) * 100:+.0f}%) entre la primera y la segunda mitad de tus sesiones")
    return 0


def cmd_farmeo_plan(D, a, out):
    d = cargar_farmeo(a.archivo)
    pl = d.get("plan")
    if not pl:
        out("SIN DATOS: el plugin no tiene plan (falta un escaneo de Auctionator o no hay campamentos elegibles).")
        return 0
    lo, hi = (pl.get("rango") or [None, None])[:2]
    out(f"[estimación] Plan de {pl.get('horas')} h: ≈{oro_txt(pl.get('oroH'))}/h (rango {oro_txt(lo)}–{oro_txt(hi)}) en "
        + " + ".join(pl.get("zonas", [])) + f" · viaje {pl.get('viajeMin')} min")
    for t in pl.get("tramos", []):
        mapa = f" (mapa {t['mapa'][0]:.1f}, {t['mapa'][1]:.1f})" if t.get("mapa") else ""
        out(f"  {t.get('minutos')} min · {t.get('tipo')} {', '.join(t.get('mobs', []))} · {t.get('zona')}{mapa} → {oro_txt(t.get('oro'))}")
    if pl.get("aportes"):
        out("  Aportan: " + ", ".join(f"{x.get('nombre')} {oro_txt(x.get('oro'))} [{x.get('tope')}]" for x in pl["aportes"]))
    if pl.get("alternativas"):
        out("  Alternativas dentro del rango: " + "; ".join(" + ".join(x.get("zonas", [])) + f" ≈{oro_txt(x.get('oroH'))}/h" for x in pl["alternativas"]))
    mt = pl.get("meta")
    if mt:
        if not mt.get("faltaOro"):
            out(f"  Meta {oro_txt(mt.get('metaOro'))}: ya la tiene ({oro_txt(mt.get('tengoOro'))}).")
        else:
            lo, hi = (mt.get("horasRango") or [None, None])[:2]
            fh = lambda h: "?" if h is None else f"{h:.1f} h"
            out(f"  Meta {oro_txt(mt.get('metaOro'))} (tiene {oro_txt(mt.get('tengoOro'))}): faltan {oro_txt(mt.get('faltaOro'))} "
                f"→ ≈{fh(mt.get('horas'))} con este plan (rango {fh(lo)}–{fh(hi)}), sin contar lo que gaste.")
    out("Tope de venta: «ventas-propias» = tus ventas TSM; «kappa-ofertas» = fracción declarada de lo publicado; "
        "«mercado-delgado» = solo vendedor; «sin-ofertas» = no está en tu escaneo, se valora a vendedor. "
        "Drops de Classic 1.12 salvo lo observado en tus sesiones.")
    return 0


def cmd_farmeo_diagnostico(D, a, out):
    """Cuellos de botella de las últimas sesiones, con reglas fijas y los números exportados."""
    d = cargar_farmeo(a.archivo)
    ses = d["sesiones"][-(a.ultimas or 3):]
    if not ses:
        out("SIN DATOS: no hay sesiones medidas para diagnosticar.")
        return 0
    e = d.get("estilo") or {}
    out(f"[tus sesiones] Diagnóstico de {len(ses)} sesión(es):")
    for s in ses:
        p = s.get("prediccion") or {}
        hall = []
        if (s.get("restoPct") or 0) >= 50:
            hall.append(f"el {pct_txt(s.get('restoPct'))} del tiempo no es pelea ni saqueo: caminar entre spawns, comer/beber o buscar mobs; "
                        "un campamento más denso o menos pausas sube el ritmo")
        if (s.get("saqueoS") or 0) > 3:
            hall.append(f"saqueas {s.get('saqueoS')} s por cadáver: el autosaqueo (Mayús+clic o la opción de interfaz) lo baja a ~1–2 s")
        if e.get("fuente") == "sesiones" and (e.get("dpsK") or 0) < 1.5:
            hall.append(f"tu DPS efectivo ({e.get('dpsK')}×nivel) es bajo para el nivel: equipo, mascota o mobs de nivel más alto alargan la pelea")
        if p.get("errorRitmoPct") is not None and p["errorRitmoPct"] <= -30:
            hall.append(f"mataste {pct_txt(p['errorRitmoPct'], True)} menos de lo esperado: posible competencia por los spawns o campamento disperso")
        if p.get("errorBotinPct") is not None and p["errorBotinPct"] <= -30:
            hall.append(f"cada muerte rindió {pct_txt(p['errorBotinPct'], True)} menos de lo esperado: drops de Forever menores que Classic o precios que bajaron")
        if (s.get("muertesJugador") or 0) >= 2:
            hall.append(f"moriste {s.get('muertesJugador')} veces: cada muerte cuesta caminata y reparación"
                        + (f" ({s.get('muertoMin')} min muerto)" if s.get("muertoMin") else ""))
        if s.get("metodoMuertes") == "solo-saqueo":
            hall.append("las muertes se contaron solo por saqueo (el juego no expuso el objetivo muerto): el ritmo real es algo mayor")
        out(f"- {s.get('id')} ({(s.get('inicio') or '?')[:10]}, {s.get('minutos')} min, {oro_txt(s.get('oroHSubasta'))}/h):")
        for h in hall or ["sin cuellos de botella claros con estas reglas"]:
            out(f"    · {h}")
    return 0


# ---------------------------------------------------------------- farmeo (evaluación por mob y zona)
# Mercado → Farmeo exporta también la evaluación completa del motor (evaluacion: ranking de
# campamentos, cada mob elegible farmeado solo y los precios usados). Con eso el agente puede
# contestar «¿y lo que dice tal guía?» con los precios del jugador, sin recalcular nada.
MAX_SOBRE, MAX_BAJO = 2, 15  # = PARAMS.maxUp / maxDown de standalone/farm-plan.js
RANGO_MOB = {"elite": "élite", "rareelite": "raro élite", "rare": "raro", "boss": "jefe"}


def cargar_evaluacion(a):
    d = cargar_farmeo(a.archivo)
    ev = d.get("evaluacion")
    if not isinstance(ev, dict) or not isinstance(ev.get("mobs"), list):
        raise ErrorConsulta("el contexto de farmeo no trae la evaluación por mob: abre Mercado → Farmeo en "
                            "Hermes Desktop con un escaneo de Auctionator para que el plugin la escriba")
    return d, ev


def cargar_drops():
    """Dataset público de drops (standalone/drop-data.js) para explicar por qué un mob no se evalúa."""
    ruta = RAIZ / "standalone" / "drop-data.js"
    try:
        txt = ruta.read_text(encoding="utf-8")
    except OSError:
        return None
    i, j = txt.find("var DATA="), txt.rfind(";\nif(typeof module")
    if i < 0 or j < i:
        return None
    try:
        return json.loads(txt[i + len("var DATA="):j])
    except ValueError:
        return None


def precio_txt(g):
    return "?" if g is None else f"{g:.4f}o"


def linea_campo(c, out, prefijo="  "):
    out(f"{prefijo}≈{oro_txt(c.get('oroH'))}/h · {c.get('muertesH') or 0:.0f} muertes/h · {c.get('spawns')} spawns"
        + (f" · riesgo {c['riesgo']}" if c.get("riesgo") else "")
        + (f" · mapa {c['mapa'][0]:.1f}, {c['mapa'][1]:.1f}" if c.get("mapa") else ""))
    out(f"{prefijo}Reparto: subasta {pct_txt(c.get('subastaPct'))} · vendedor {pct_txt(c.get('vendedorPct'))} · "
        f"monedas {pct_txt(c.get('monedasPct'))}")


def lineas_aportes(c, precios, out, n=4):
    for x in (c.get("aportes") or [])[:n]:
        pr = precios.get(str(x.get("itemId"))) or {}
        tope = pr.get("tope") or "?"
        out(f"    {x.get('nombre')} {pct_txt(x.get('cuotaPct'))} · {x.get('unidadesH') or 0:.1f} u/h, "
            f"{x.get('subastaH') or 0:.1f} a subasta [{tope}"
            + (f", tope {pr['topeUnidades']:.0f} u" if tope in ("kappa-ofertas", "ventas-propias") and pr.get("topeUnidades") is not None else "")
            + "]")
        if pr.get("medianaOro") is not None:
            out(f"       precio usado (mediana {pr.get('dias')} d) {precio_txt(pr.get('medianaOro'))} · hoy {precio_txt(pr.get('hoyOro'))}"
                f" · p25–p75 {precio_txt(pr.get('p25Oro'))}–{precio_txt(pr.get('p75Oro'))}"
                + (f" · {pr['ofertas']:.0f} ofertas" if pr.get("ofertas") is not None else "")
                + (" · mercado delgado (solo vendedor)" if pr.get("delgado") else "")
                + f" · vendedor {precio_txt(pr.get('vendedorOro'))}"
                + (" · el vendedor paga más que la subasta neta (−5 %)"
                   if not pr.get("delgado") and pr.get("vendedorOro") is not None
                   and pr["medianaOro"] * 0.95 <= pr["vendedorOro"] else ""))
        elif pr:
            out(f"       no está en tu escaneo: se valora a vendedor {precio_txt(pr.get('vendedorOro'))}")


def por_que_no(m, zona, pj):
    """Motivos (mismas reglas que mobOk/zoneOk de farm-plan.js) por los que un mob no se evalúa."""
    motivos, nivel = [], pj.get("nivel")
    lado = "a" if pj.get("faccion") == "alianza" else "h"
    if lado not in (m[7] or "ah"):
        motivos.append("tu facción no puede atacarlo")
    if m[3] != "normal":
        motivos.append(f"es {RANGO_MOB.get(m[3], m[3])}: el plan solo cuenta mobs normales")
    if isinstance(nivel, int):
        if m[2] > nivel + MAX_SOBRE:
            motivos.append(f"nivel {m[1]}–{m[2]}: más de {MAX_SOBRE} niveles sobre el tuyo ({nivel})")
        elif m[2] < nivel - MAX_BAJO:
            motivos.append(f"nivel {m[1]}–{m[2]}: más de {MAX_BAJO} niveles bajo el tuyo ({nivel})")
    if zona and (zona[2] in ("city", "instance") or str(m[4]).startswith("i")):
        motivos.append("vive en una ciudad o instancia")
    if (m[5] or 0) < 3:
        motivos.append(f"solo {m[5] or 0} spawns en su zona principal")
    return motivos


def cmd_farmeo_mob(D, a, out):
    d, ev = cargar_evaluacion(a)
    pj, precios, q = d.get("personaje") or {}, ev.get("precios") or {}, normalizar(a.nombre)
    if not q:
        raise ErrorConsulta("falta el nombre del mob")
    hits = [m for m in ev["mobs"] if q in normalizar(m.get("nombre"))]
    if hits:
        for m in hits[:a.max]:
            nv = m.get("nivel") or [None, None]
            out(f"[estimación] {m.get('nombre')} (nv {nv[0]}–{nv[1]}) · {m.get('zona')} · puesto {m.get('pos')} de "
                f"{ev.get('totalMobs')} mobs elegibles a tu nivel, farmeado solo")
            linea_campo(m, out)
            out("  Aportes:")
            lineas_aportes(m, precios, out)
            camps = [(i + 1, c) for i, c in enumerate(ev.get("ranking") or []) if m.get("nombre") in (c.get("mobs") or [])]
            for i, c in camps[:3]:
                out(f"  En el ranking: #{i} {c.get('tipo')} {', '.join(c.get('mobs') or [])} · {c.get('zona')} ≈{oro_txt(c.get('oroH'))}/h")
        if len(hits) > a.max:
            out(f"(+{len(hits) - a.max} coincidencias más; usa --max)")
    else:
        drops = cargar_drops()
        cand = [] if drops is None else [(k, v) for k, v in (drops.get("mobs") or {}).items() if q in normalizar(v[0])]
        if drops is None:
            out(f"SIN DATOS: «{a.nombre}» no está entre los {len(ev['mobs'])} mobs evaluados y no se pudo leer el dataset de drops.")
        elif not cand:
            out(f"SIN DATOS: «{a.nombre}» no está en el dataset de drops (Classic 1.12, sin spawns de evento): "
                "no existe con ese nombre, no suelta nada farmeable o solo aparece durante un evento.")
        for k, m in cand[:a.max]:
            zona = (drops.get("zonas") or drops.get("zones") or {}).get(str(m[4]))
            motivos = por_que_no(m, zona, pj)
            out(f"{m[0]} (nv {m[1]}–{m[2]}) · {zona[0] if zona else m[4]}: "
                + ("no se evalúa porque " + "; ".join(motivos) if motivos else
                   f"es elegible, pero con tus precios queda fuera de los {len(ev['mobs'])} mejores de "
                   f"{ev.get('totalMobs')} (o no rinde nada)"))
    out("Oro/h = farmear ese sitio 1 h con tus precios (mediana de 14 días del escaneo) y el tope de venta; "
        "drops de Classic 1.12 salvo lo observado en tus sesiones. Una guía externa usa otros precios y otros "
        "supuestos: compara el precio usado aquí con el que cita la guía.")
    return 0


def cmd_farmeo_zona(D, a, out):
    d, ev = cargar_evaluacion(a)
    precios, q = ev.get("precios") or {}, normalizar(a.zona)
    mobs = [m for m in ev["mobs"] if q and q in normalizar(m.get("zona"))]
    camps = [(i + 1, c) for i, c in enumerate(ev.get("ranking") or []) if q and q in normalizar(c.get("zona"))]
    if not mobs and not camps:
        out(f"SIN DATOS: no hay mobs evaluados en «{a.zona}» a tu nivel (o la zona no se llama así en el dataset, "
            "que usa los nombres en inglés: Arathi Highlands, Badlands, Desolace…).")
        return 0
    zonas = sorted({m.get("zona") for m in mobs} | {c.get("zona") for _, c in camps})
    out(f"[estimación] {', '.join(zonas)}: {len(mobs)} mobs evaluados a tu nivel")
    for i, c in camps[:3]:
        out(f"  Ranking #{i}: {c.get('tipo')} {', '.join(c.get('mobs') or [])} ≈{oro_txt(c.get('oroH'))}/h")
    out(f"  {'Puesto':>6}  {'Mob':<28}{'Nivel':>8}{'Oro/h':>9}  Aporta")
    for m in mobs[:a.max]:
        nv = m.get("nivel") or ["?", "?"]
        ap = (m.get("aportes") or [{}])[0]
        pr = precios.get(str(ap.get("itemId"))) or {}
        out(f"  {m.get('pos'):>6}  {str(m.get('nombre'))[:27]:<28}{f'{nv[0]}–{nv[1]}':>8}{oro_txt(m.get('oroH')):>9}  "
            f"{ap.get('nombre', '?')} {pct_txt(ap.get('cuotaPct'))}"
            + (f" a {precio_txt(pr.get('medianaOro'))}" if pr.get("medianaOro") is not None else ""))
    out("Detalle de un mob (aportes, precios y tope): farmeo-mob \"<nombre>\".")
    return 0


def cmd_farmeo_ranking(D, a, out):
    d, ev = cargar_evaluacion(a)
    precios = ev.get("precios") or {}
    out(f"[estimación] Mejores campamentos a tu nivel (1 h cada uno, tus precios y tope de venta):")
    for i, c in enumerate((ev.get("ranking") or [])[:a.max]):
        out(f"{i + 1:>2}. {c.get('zona')} · {c.get('tipo')} {', '.join(c.get('mobs') or [])}")
        linea_campo(c, out, prefijo="    ")
        ap = c.get("aportes") or []
        if ap:
            out("    Aporta: " + ", ".join(
                f"{x.get('nombre')} {pct_txt(x.get('cuotaPct'))}"
                + (f" a {precio_txt((precios.get(str(x.get('itemId'))) or {}).get('medianaOro'))}"
                   if (precios.get(str(x.get('itemId'))) or {}).get('medianaOro') is not None else "")
                for x in ap[:3]))
    out("«limpiar» = matar todo el campamento; «solo» = un tipo de mob. El plan de sesión (farmeo-plan) "
        "reparte el tiempo y comparte el tope de venta entre campamentos.")
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
    s = orden("hechizos", cmd_hechizos, "hechizos de entrenador por nivel (por clase, sin filtro de facción)")
    s.add_argument("--clase", required=True); s.add_argument("--nivel", type=int)
    s.add_argument("--desde", type=int); s.add_argument("--hasta", type=int)
    s.add_argument("--faccion", help="NO soportado: los hechizos son por clase; se rechaza para no filtrar mal")
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
    s = orden("roi", cmd_roi, "ROI de maxear a 300 con media móvil histórica y tendencia")
    s.add_argument("--historico", required=True, help="price-history-*.json (v1) o bundle con history (v2)")
    s.add_argument("--reino"); s.add_argument("--ventana", type=int, help="días de la media móvil (por defecto todos)")
    s.add_argument("--skill", type=int); s.add_argument("--faccion")
    s.add_argument("--profesion"); s.add_argument("--detalle", action="store_true")
    s.add_argument("--precios", help="precios spot de respaldo para ítems sin histórico")
    s.add_argument("--robusto", action="store_true",
                   help="mediana de mínimos y tendencia por mitades en vez de media/extremos (H11)")
    s.add_argument("--saturacion", type=float, default=None, metavar="F",
                   help="supuesto explícito 0<F<=1 de tasa de venta; sin él NO se asume (H12)")
    for nombre_, fn, ayuda in (
            ("farmeo-sesiones", cmd_farmeo_sesiones, "sesiones de farmeo medidas con WoWForeverFarm (predicho vs real)"),
            ("farmeo-sesion", cmd_farmeo_sesion, "detalle de una sesión de farmeo (id o 1 = la última)"),
            ("farmeo-estilo", cmd_farmeo_estilo, "tu estilo de farmeo calibrado (DPS efectivo, saqueo, pausas) y tendencias"),
            ("farmeo-plan", cmd_farmeo_plan, "plan de sesión para maximizar oro que muestra el plugin"),
            ("farmeo-diagnostico", cmd_farmeo_diagnostico, "cuellos de botella de tus últimas sesiones de farmeo"),
            ("farmeo-ranking", cmd_farmeo_ranking, "mejores campamentos a tu nivel con tus precios (1 h cada uno)"),
            ("farmeo-mob", cmd_farmeo_mob, "oro/h de un mob con tus precios: qué ítems lo explican y a qué precio"),
            ("farmeo-zona", cmd_farmeo_zona, "mobs evaluados de una zona, ordenados por oro/h")):
        s = orden(nombre_, fn, ayuda)
        s.add_argument("--archivo", help=f"{ARCHIVO_FARMEO} (por defecto, la carpeta de datos del plugin en Hermes Desktop)")
        if nombre_ == "farmeo-sesion":
            s.add_argument("id", nargs="?", help="id de sesión (s<inicio>) o posición desde la última (1)")
        if nombre_ == "farmeo-diagnostico":
            s.add_argument("--ultimas", type=int, default=3, help="cuántas sesiones recientes (3)")
        if nombre_ == "farmeo-mob":
            s.add_argument("nombre", help="nombre del mob (inglés, como en el juego), o parte")
        if nombre_ == "farmeo-zona":
            s.add_argument("zona", help="nombre de la zona (inglés, como en el dataset), o parte")
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
    # Salida siempre en UTF-8 cuando va a una tubería o archivo (así la lee el agente).
    # En Windows, sin esto, Python usa la página de códigos local (cp1252) fuera de la
    # consola y los nombres con tilde llegan corruptos; en consola ya escribe UTF-8.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
