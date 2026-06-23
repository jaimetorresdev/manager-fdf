# ─── Manager FDF — Libro de jugadas GENERATIVO por formación ──────────────────
# El Excel `Tacticas_FDF.xlsx` (→ `fdf_jugadas.json`) sirvió de GUÍA: de él salen
# los patrones de jugada (cómo encadenan las posiciones y quién finaliza). Aquí se
# GENERA, para CADA formación, un catálogo propio a partir de:
#   1) el DIBUJO real de la formación (sus posiciones por línea y carril), y
#   2) una biblioteca de PATRONES (construcción, banda, contra, balón largo…)
#      ponderados según el CARÁCTER de la formación.
# Resultado: máxima variabilidad de una formación a otra y TODAS las posiciones
# implicadas, para cualquier dibujo (esté o no en el Excel). Determinista: la
# misma formación produce SIEMPRE el mismo catálogo.

from __future__ import annotations

from typing import Optional

# ─── Habilidades (motor ↔ etiqueta) ───────────────────────────────────────────
ABILITY2KEY = {"Pase": "passing", "Desmarque": "unmarking", "Regate": "dribbling",
               "Tiro": "shooting", "Remate": "finishing", "Falta": "fouls",
               "Entradas": "tackling"}
ABILITY_LABEL = {"passing": "Pase", "unmarking": "Desmarque", "dribbling": "Regate",
                 "shooting": "Tiro", "finishing": "Remate", "fouls": "Faltas",
                 "tackling": "Entradas", "reflexes": "Reflejos", "goalkeeping": "Colocación"}

# ─── Posiciones → (macro, carril, detailedPosition, etiqueta) ─────────────────
POS: dict[str, tuple[str, str, str, str]] = {
    "DC":   ("DEL", "center", "DC",  "Delantero centro"),
    "SD":   ("DEL", "center", "F9",  "Segundo delantero"),
    "SDD":  ("DEL", "right",  "EXTD", "Delantero/extremo derecho"),
    "SDI":  ("DEL", "left",   "EXTI", "Delantero/extremo izquierdo"),
    "MCO":  ("MED", "center", "MCO", "Mediapunta"),
    "MC":   ("MED", "center", "MCO", "Mediocentro"),
    "MCD":  ("MED", "center", "PIV", "Pivote"),
    "MCDD": ("MED", "right",  "PIV", "Pivote derecho"),
    "MCDI": ("MED", "left",   "PIV", "Pivote izquierdo"),
    "MD":   ("MED", "right",  "EXTD", "Medio derecho"),
    "MI":   ("MED", "left",   "EXTI", "Medio izquierdo"),
    "MVD":  ("MED", "right",  "LD",  "Carrilero derecho"),
    "MVI":  ("MED", "left",   "LI",  "Carrilero izquierdo"),
    "LD":   ("DEF", "right",  "LD",  "Lateral derecho"),
    "LI":   ("DEF", "left",   "LI",  "Lateral izquierdo"),
    "DFC":  ("DEF", "center", "CT",  "Central"),
    "DFD":  ("DEF", "right",  "CT",  "Central derecho"),
    "DFI":  ("DEF", "left",   "CT",  "Central izquierdo"),
    "DFi":  ("DEF", "left",   "CT",  "Central izquierdo"),
}


def pos_macro(c): return POS.get(c, ("MED", "center", "MCO", c))[0]
def pos_lane(c): return POS.get(c, ("MED", "center", "MCO", c))[1]
def pos_dpos(c): return POS.get(c, ("MED", "center", "MCO", c))[2]
def pos_label(c): return POS.get(c, ("MED", "center", "MCO", c))[3]


# ─── Dibujo de la formación → posiciones por línea/carril ─────────────────────
# Un "slot" = (código, línea DEF/MID/FWD, carril L/C/R, profundidad 0=más atrás).

def _parse(formation: str) -> list[int]:
    raw = str(formation or "4-4-2").lower().replace("wm-", "").replace("metodo-", "")
    segs = [int(x) for x in raw.split("-") if x.isdigit()]
    # Una formación válida son ≥2 segmentos (defensa…ataque); con portero implícito
    # la suma de campo es 10. Si no cuadra, caemos a 4-4-2.
    if len(segs) < 2 or not (8 <= sum(segs) <= 10):
        segs = [4, 4, 2]
    return segs


def _def_line(n: int) -> list[tuple[str, str]]:
    if n <= 3:
        return [("DFI", "L"), ("DFC", "C"), ("DFD", "R")][:max(1, n)]
    if n == 4:
        return [("LI", "L"), ("DFI", "C"), ("DFD", "C"), ("LD", "R")]
    return [("LI", "L"), ("DFI", "C"), ("DFC", "C"), ("DFD", "C"), ("LD", "R")]


def _fwd_line(n: int) -> list[tuple[str, str]]:
    if n <= 1:
        return [("DC", "C")]
    if n == 2:
        return [("SD", "C"), ("DC", "C")]
    return [("SDI", "L"), ("DC", "C"), ("SDD", "R")]


def _mid_line(n: int, role: str, wingbacks: bool) -> list[tuple[str, str]]:
    wL, wR = ("MVI", "MVD") if wingbacks else ("MI", "MD")
    if role == "deep":
        return {1: [("MCD", "C")], 2: [("MCDI", "C"), ("MCDD", "C")],
                3: [("MCDI", "L"), ("MCD", "C"), ("MCDD", "R")]}.get(n, [("MCD", "C")] * max(1, n))
    if role == "adv":
        return {1: [("MCO", "C")], 2: [("MCO", "C"), ("SD", "C")],
                3: [(wL, "L"), ("MCO", "C"), (wR, "R")]}.get(n, [("MCO", "C")] * max(1, n))
    return {1: [("MC", "C")], 2: [(wL, "L"), (wR, "R")],
            3: [(wL, "L"), ("MC", "C"), (wR, "R")],
            4: [(wL, "L"), ("MCDI", "C"), ("MCDD", "C"), (wR, "R")],
            5: [(wL, "L"), ("MCDI", "C"), ("MCO", "C"), ("MCDD", "C"), (wR, "R")]}.get(
                n, [(wL, "L"), ("MC", "C"), (wR, "R")])


_LAYOUT_CACHE: dict[str, list[dict]] = {}


def layout(formation: Optional[str]) -> list[dict]:
    form = str(formation or "4-4-2")
    cached = _LAYOUT_CACHE.get(form)
    if cached is not None:
        return cached
    segs = _parse(form)
    wingbacks = segs[0] >= 5 or (segs[0] == 3 and len(segs) >= 3 and segs[1] >= 4)
    slots: list[dict] = []
    used: set[str] = set()

    def add(code: str, line: str, lane: str, depth: int) -> None:
        c = code
        i = 2
        while c in used:                      # evita códigos repetidos (LI, LI…)
            c = f"{code}{i}"; i += 1
        used.add(c)
        base = code if code in POS else "MC"
        POS.setdefault(c, POS[base])
        slots.append({"code": c, "line": line, "lane": lane, "depth": depth})

    for code, lane in _def_line(segs[0]):
        add(code, "DEF", lane, 0)
    mids = segs[1:-1]
    for idx, n in enumerate(mids):
        role = "deep" if idx == 0 and len(mids) > 1 else "adv" if idx == len(mids) - 1 and len(mids) > 1 else "mid"
        if len(mids) == 1:
            role = "mid"
        for code, lane in _mid_line(n, role, wingbacks):
            add(code, "MID", lane, idx + 1)
    for code, lane in _fwd_line(segs[-1]):
        add(code, "FWD", lane, 9)
    _LAYOUT_CACHE[form] = slots
    return slots


# ─── Selección de jugador por ROL dentro del dibujo ───────────────────────────
# Cada paso de un patrón pide un rol; el rol se resuelve a un slot concreto del
# dibujo según el carril de la jugada (zone). 'same' = carril de la jugada;
# 'opp' = el contrario; 'center' = el centro.

def _lanes_for(lane_pref: str, zone: str) -> set[str]:
    if lane_pref == "same":
        return {{"left": "L", "center": "C", "right": "R"}[zone]}
    if lane_pref == "opp":
        return {{"left": "R", "center": "C", "right": "L"}[zone]}
    if lane_pref == "center":
        return {"C"}
    if lane_pref == "wide":
        return {"L", "R"}
    return {"L", "C", "R"}


def _pick_slot(slots: list[dict], line_pref, lane_pref: str, zone: str,
               avoid: set[str], rot: list[int]) -> Optional[dict]:
    """Elige un slot que cumpla LÍNEA (restricción dura: nunca se sale de ella si
    hay candidatos) y, a poder ser, carril; rota entre iguales (`rot`) para que
    TODAS las posiciones de la formación se usen a lo largo del catálogo."""
    lines = line_pref if isinstance(line_pref, (set, frozenset, tuple, list)) else {line_pref}
    want = _lanes_for(lane_pref, zone)
    tiers = [
        [s for s in slots if s["line"] in lines and s["lane"] in want and s["code"] not in avoid],
        [s for s in slots if s["line"] in lines and s["code"] not in avoid],
        [s for s in slots if s["line"] in lines and s["lane"] in want],
        [s for s in slots if s["line"] in lines],
        [s for s in slots if s["code"] not in avoid],
        slots,
    ]
    for t in tiers:
        if t:
            return t[rot[0] % len(t)]
    return None


# ─── Biblioteca de PATRONES (rol, carril, habilidad) ──────────────────────────
# La última fase es la finalización: Tiro (raso) o Remate (cabeza/centro).
D, M, F = "DEF", "MID", "FWD"
DM = {"DEF", "MID"}
MF = {"MID", "FWD"}

PATTERNS: dict[str, dict] = {
    "build_central": {"tags": ("posesion", "centro"), "steps": [
        (M, "center", "Pase"), (M, "center", "Pase"), (MF, "center", "Desmarque"),
        (F, "center", "Pase"), (F, "center", "Tiro")]},
    "build_paciente": {"tags": ("posesion",), "steps": [
        (DM, "center", "Pase"), (M, "same", "Pase"), (M, "center", "Pase"),
        (F, "same", "Desmarque"), (F, "center", "Tiro")]},
    "switch_play": {"tags": ("posesion", "banda"), "steps": [
        (M, "center", "Pase"), (M, "opp", "Pase"), (MF, "same", "Regate"),
        (M, "same", "Pase"), (F, "center", "Remate")]},
    "wing_overlap": {"tags": ("banda", "centro_lateral"), "steps": [
        (M, "center", "Pase"), (MF, "same", "Regate"), (D, "same", "Pase"),
        (MF, "same", "Pase"), (F, "center", "Remate")]},
    "wing_cutback": {"tags": ("banda",), "steps": [
        (M, "same", "Pase"), (MF, "same", "Regate"), (MF, "same", "Desmarque"),
        (MF, "same", "Pase"), (F, "center", "Tiro")]},
    "through_ball": {"tags": ("vertical", "centro"), "steps": [
        (DM, "center", "Pase"), (M, "center", "Pase"), (M, "center", "Desmarque"),
        (F, "center", "Desmarque"), (F, "center", "Tiro")]},
    "give_and_go": {"tags": ("posesion", "vertical"), "steps": [
        (M, "center", "Pase"), (F, "center", "Pase"), (M, "center", "Desmarque"),
        (F, "center", "Pase"), (F, "center", "Tiro")]},
    "counter": {"tags": ("contra", "vertical"), "steps": [
        (DM, "center", "Pase"), (MF, "same", "Regate"), (M, "center", "Pase"),
        (F, "center", "Desmarque"), (F, "center", "Tiro")]},
    "long_ball": {"tags": ("directo", "aereo"), "steps": [
        (D, "center", "Pase"), (F, "center", "Desmarque"), (F, "center", "Pase"),
        (F, "center", "Desmarque"), (F, "center", "Remate")]},
    "long_shot": {"tags": ("disparo", "centro"), "steps": [
        (M, "center", "Pase"), (M, "center", "Regate"), (M, "center", "Tiro")]},
    "solo_run": {"tags": ("regate", "individual"), "steps": [
        (M, "same", "Regate"), (MF, "same", "Regate"), (F, "same", "Regate"),
        (F, "center", "Tiro")]},
    "overload": {"tags": ("banda", "centro_lateral"), "steps": [
        (M, "same", "Pase"), (D, "same", "Desmarque"), (M, "center", "Pase"),
        (F, "same", "Desmarque"), (F, "center", "Remate")]},
    "third_man": {"tags": ("posesion", "vertical"), "steps": [
        (DM, "center", "Pase"), (M, "center", "Pase"), (M, "same", "Pase"),
        (F, "center", "Desmarque"), (F, "center", "Tiro")]},
    "carrilero_run": {"tags": ("banda", "contra"), "steps": [
        (DM, "center", "Pase"), (M, "same", "Desmarque"), (M, "same", "Pase"),
        (F, "center", "Remate")]},
}

# Carácter de cada formación: multiplicadores de peso por ETIQUETA de patrón.
# Lo que no esté listado vale 1.0. Esto crea la variabilidad entre dibujos.
_CHAR: dict[str, dict[str, float]] = {
    "4-4-2": {"banda": 1.4, "directo": 1.2, "posesion": 0.9},
    "4-3-3": {"banda": 1.8, "centro_lateral": 1.6, "regate": 1.4, "directo": 0.5},
    "3-4-3": {"banda": 1.8, "centro_lateral": 1.5, "contra": 1.2, "aereo": 1.2},
    "4-2-3-1": {"posesion": 1.5, "vertical": 1.4, "disparo": 1.4, "centro": 1.3, "banda": 0.9},
    "4-4-1-1": {"posesion": 1.3, "vertical": 1.3, "banda": 1.1},
    "4-3-2-1": {"posesion": 1.5, "centro": 1.5, "disparo": 1.3, "banda": 0.7},
    "4-1-2-1-2": {"posesion": 1.6, "centro": 1.5, "vertical": 1.3, "banda": 0.6},
    "4-1-3-2": {"posesion": 1.2, "banda": 1.2, "vertical": 1.2},
    "3-5-2": {"posesion": 1.7, "centro": 1.4, "banda": 1.1, "contra": 1.0, "directo": 0.7},
    "metodo-2-3-2-3": {"posesion": 1.8, "centro": 1.5, "disparo": 1.2},
    "3-2-4-1": {"posesion": 1.4, "banda": 1.4, "centro_lateral": 1.3},
    "3-2-3-2": {"posesion": 1.5, "centro": 1.4, "banda": 1.1},
    "5-3-2": {"contra": 1.9, "directo": 1.7, "aereo": 1.4, "posesion": 0.5, "banda": 0.7},
    "5-4-1": {"contra": 2.0, "directo": 1.8, "aereo": 1.5, "banda": 0.9, "posesion": 0.4},
    "5-1-3-1": {"contra": 1.7, "directo": 1.5, "disparo": 1.2, "posesion": 0.6},
    "4-5-1": {"posesion": 1.4, "contra": 1.3, "disparo": 1.2, "banda": 1.1},
    "1-4-3-2": {"contra": 1.6, "directo": 1.4, "posesion": 0.7},
    "1-4-4-1": {"banda": 1.3, "contra": 1.3, "directo": 1.2},
    "1-4-1-3-1": {"contra": 1.5, "disparo": 1.3, "posesion": 0.7},
    "3-1-2-1-3": {"banda": 1.7, "centro_lateral": 1.4, "regate": 1.3},
    "wm-3-2-5": {"banda": 1.8, "centro_lateral": 1.6, "aereo": 1.3},
    "4-2-4": {"banda": 1.8, "centro_lateral": 1.5, "directo": 1.3, "regate": 1.2},
}


def _pattern_weight(pat: dict, char: dict[str, float]) -> float:
    w = 1.0
    for tag in pat["tags"]:
        w *= char.get(tag, 1.0)
    return w


# Variantes de finalización por carril: el rematador es SIEMPRE delantero o
# mediapunta (nunca un central). Da variabilidad de desenlace y mete a los medios.
_FINISH_VARIANTS = {
    "left":   [({"FWD"}, "center"), ({"FWD"}, "same"), ({"MID"}, "same")],
    "center": [({"FWD"}, "center"), ({"MID"}, "center"), ({"FWD"}, "wide")],
    "right":  [({"FWD"}, "center"), ({"FWD"}, "same"), ({"MID"}, "same")],
}


def _gk_for(ability: str, kind: str) -> Optional[str]:
    if ability not in ("Tiro", "Remate", "Falta"):
        return None
    return "salidas" if kind in ("setpiece", "penalty") else "reflejos"


def _mk_phase(ability: str, slot: dict, is_finish: bool, kind: str) -> dict:
    code = slot["code"]
    return {"ability": ability, "position": code, "key": ABILITY2KEY.get(ability, "passing"),
            "pool": pos_macro(code), "lane": pos_lane(code), "dpos": pos_dpos(code),
            "label": f"{ability} {code}", "gk": _gk_for(ability, kind) if is_finish else None}


def _instantiate(pat: dict, slots: list[dict], zone: str,
                 finish_line, finish_lane: str, rot: list[int]) -> Optional[dict]:
    steps = list(pat["steps"])
    phases: list[dict] = []
    last_code = None
    for i, (line, lane, ability) in enumerate(steps):
        is_last = i == len(steps) - 1
        if is_last:
            line, lane = finish_line, finish_lane
        # un mismo jugador no hace dos fases seguidas (salvo regate encadenado)
        avoid = {last_code} if (last_code and ability != "Regate") else set()
        slot = _pick_slot(slots, line, lane, zone, avoid, rot)
        rot[0] += 1
        if slot is None:
            return None
        phases.append(_mk_phase(ability, slot, is_last, "field"))
        last_code = slot["code"]
    return {"kind": "field", "lane": zone, "phases": phases, "weight": 1.0}


def _coverage_jugada(slots: list[dict], start: dict, rot: list[int]) -> dict:
    """Jugada mínima que GARANTIZA que `start` (posición sin usar) participe:
    arranca él la jugada y acaba en un delantero. Así toda posición del dibujo
    aparece en el catálogo (incluidos centrales y laterales)."""
    zone = {"L": "left", "C": "center", "R": "right"}[start["lane"]]
    mid = _pick_slot(slots, {"MID"}, "center", zone, {start["code"]}, rot); rot[0] += 1
    fwd = _pick_slot(slots, {"FWD"}, "center", zone, {start["code"]}, rot); rot[0] += 1
    ab_start = "Pase" if start["line"] != "FWD" else "Desmarque"
    phases = [_mk_phase(ab_start, start, False, "field"),
              _mk_phase("Pase", mid or start, False, "field"),
              _mk_phase("Tiro", fwd or start, True, "field")]
    return {"kind": "field", "lane": zone, "phases": phases, "weight": 0.6,
            "archetype": "incorporacion"}


# Balón parado (no en el Excel): ejecución con Faltas, portería con Colocación.
_SET: dict[str, list[tuple[str, str]]] = {
    "corner": [("Falta", "MID"), ("Remate", "DEF"), ("Remate", "FWD")],
    "free_kick": [("Falta", "MID"), ("Falta", "MID"), ("Falta", "MID")],
}
_PEN = [("Falta", "FWD"), ("Tiro", "FWD")]


def _setpiece(slots: list[dict], raw: list[tuple[str, str]], kind: str) -> dict:
    phases = []
    n = len(raw)
    rot = [0]
    for i, (ability, line) in enumerate(raw):
        slot = _pick_slot(slots, {line}, "center", "center", set(), rot) or slots[0]
        rot[0] += 1
        phases.append(_mk_phase(ability, slot, i == n - 1, kind))
    return {"kind": kind, "lane": "center", "phases": phases, "weight": 1.0}


_PLAYBOOK_CACHE: dict[str, list[dict]] = {}


def build_playbook(formation: Optional[str]) -> list[dict]:
    """Catálogo GENERADO para la formación: jugadas de campo por carril (con su
    carácter) + balón parado. Determinista. Cada formación, su propio catálogo."""
    form = str(formation or "4-4-2")
    cached = _PLAYBOOK_CACHE.get(form)
    if cached is not None:
        return cached
    slots = layout(form)
    char = _CHAR.get(form, {})
    rot = [0]
    out: list[dict] = []
    for zone in ("left", "center", "right"):
        for key, pat in PATTERNS.items():
            w = _pattern_weight(pat, char)
            if w <= 0.34:                     # patrón ajeno al carácter → se omite
                continue
            n_var = 3 if w >= 1.3 else 2 if w >= 0.7 else 1   # más variantes si pega
            for fl, flane in _FINISH_VARIANTS[zone][:n_var]:
                jug = _instantiate(pat, slots, zone, fl, flane, rot)
                if jug:
                    jug["weight"] = w
                    jug["archetype"] = key
                    out.append(jug)
    # Cobertura: toda posición del dibujo (centrales/laterales incluidos) debe
    # aparecer en al menos una jugada — si el reparto la dejó fuera, se añade.
    used = {ph["position"] for j in out for ph in j["phases"]}
    for s in slots:
        if s["code"] not in used:
            out.append(_coverage_jugada(slots, s, rot))
    # balón parado
    for kind, raw in _SET.items():
        out.append(_setpiece(slots, raw, "setpiece"))
    out.append(_setpiece(slots, _PEN, "penalty"))
    _PLAYBOOK_CACHE[form] = out
    return out


def field_jugadas(playbook: list[dict], lane: str) -> list[dict]:
    same = [j for j in playbook if j["kind"] == "field" and j["lane"] == lane]
    return same or [j for j in playbook if j["kind"] == "field"]


def setpiece_jugadas(playbook: list[dict], kind: str) -> list[dict]:
    sp = [j for j in playbook if j["kind"] == kind]
    return sp or [j for j in playbook if j["kind"] == "field"]


def defender_line(phase_idx: int, n_phases: int, kind: str) -> str:
    if kind == "penalty":
        return "POR"
    if phase_idx == n_phases - 1:
        return "POR"
    if phase_idx >= n_phases - 3:
        return "DEF"
    return "MED"
