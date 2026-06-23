# ─── Manager FDF — IA de entrenador (Python) ──────────────────────────────────
# Módulo PURO: elige el mejor ONCE + formación + táctica para un club (sobre todo
# los NPC, para que jueguen con criterio) y sugiere cambios in-match. No depende
# del motor de partido; reutiliza solo sus helpers de lectura de atributos.
# Determinista por semilla.

from __future__ import annotations

import random
import zlib
from typing import Any, Optional

from .engine import _attr, _grano, _name, _overall, _pid, _pos

# Formaciones disponibles por objetivo (deben sumar 10 jugadores de campo).
OBJECTIVE_FORMATION = {
    "ofensivo": "4-3-3", "equilibrado": "4-4-2", "defensivo": "5-3-2",
}

# Palancas tácticas por objetivo (50 = neutro).
OBJECTIVE_TACTIC = {
    "ofensivo":    {"mentality": 72, "pressing": 62, "tempo": 62, "construction": 62, "destruction": 42},
    "equilibrado": {"mentality": 50, "pressing": 50, "tempo": 50, "construction": 50, "destruction": 50},
    "defensivo":   {"mentality": 30, "pressing": 42, "tempo": 42, "construction": 40, "destruction": 62},
}


def _is_available(p: Any) -> bool:
    """Excluye lesionados/sancionados/no disponibles según varias señales posibles."""
    def g(k):
        return p.get(k) if isinstance(p, dict) else getattr(p, k, None)
    if g("available") is False:
        return False
    if g("isInjured") or g("isSuspended") or g("injured") or g("suspended"):
        return False
    for k in ("suspendedMatches", "matchesSuspended"):
        v = g(k)
        if v is not None and float(v) > 0:
            return False
    return True


def _parse_formation(formation: str) -> tuple[int, int, int]:
    try:
        parts = [int(x) for x in str(formation).split("-")]
        n_def, n_fwd = parts[0], parts[-1]
        n_mid = sum(parts[1:-1]) if len(parts) > 2 else (10 - n_def - n_fwd)
        if n_def + n_mid + n_fwd == 10:
            return n_def, n_mid, n_fwd
    except (ValueError, IndexError):
        pass
    return 4, 4, 2


def _score(p: Any, role: str) -> float:
    """Idoneidad de un jugador para un rol, ponderada por su forma física."""
    if role == "POR":
        base = _attr(p, "goalkeeping")
    elif role == "DEF":
        base = 0.6 * _attr(p, "tackling") + 0.2 * _attr(p, "organization") + 0.2 * _attr(p, "passing")
    elif role == "MED":
        base = 0.4 * _attr(p, "organization") + 0.4 * _attr(p, "passing") + 0.2 * _attr(p, "dribbling")
    else:  # DEL
        base = 0.4 * _attr(p, "finishing") + 0.3 * _attr(p, "shooting") + 0.3 * _attr(p, "unmarking")
    fit = _grano(p, "muscularFitness")
    return base * (0.75 + 0.25 * fit / 100.0)


def _best_for(pool: list[Any], role: str, k: int, used: set, seed: int) -> list[Any]:
    """Mejores k jugadores para un rol: preferimos su posición natural; desempate por seed."""
    # AUDIT-2026 §8 P1: sin hash() (aleatorizado por PYTHONHASHSEED): crc32 del
    # rol XOR semilla → misma alineación NPC en cualquier proceso/despliegue.
    rng = random.Random((int(seed) ^ zlib.crc32(str(role).encode("utf-8"))) & 0xFFFFFFFF)
    cand = [p for p in pool if id(p) not in used]
    cand.sort(key=lambda p: (round(_score(p, role), 3),
                             1 if _pos(p) == role else 0,
                             rng.random()), reverse=True)
    chosen = cand[:k]
    for p in chosen:
        used.add(id(p))
    return chosen


def pick_lineup(players: list[Any], objective: str = "equilibrado",
                seed: Optional[int] = None) -> dict:
    """Devuelve formación + once + táctica + banquillo para una plantilla."""
    obj = objective if objective in OBJECTIVE_FORMATION else "equilibrado"
    formation = OBJECTIVE_FORMATION[obj]
    n_def, n_mid, n_fwd = _parse_formation(formation)
    s = 0 if seed is None else int(seed)

    avail = [p for p in (players or []) if _is_available(p)]
    used: set = set()

    # Portero primero; los de campo salen de un pool SIN porteros (nunca 2 GK en el XI).
    gks = [p for p in avail if _pos(p) == "POR"] or avail
    gk = _best_for(gks, "POR", 1, used, s)
    outfield_pool = [p for p in avail if _pos(p) != "POR"] or [p for p in avail if id(p) not in used]
    line = list(gk)
    line += _best_for(outfield_pool, "DEF", n_def, used, s + 1)
    line += _best_for(outfield_pool, "MED", n_mid, used, s + 2)
    line += _best_for(outfield_pool, "DEL", n_fwd, used, s + 3)

    xi = line[:11]
    bench = [p for p in avail if id(p) not in {id(x) for x in xi}]

    # Lanzadores: mejor definición / mejor pase.
    out_pool = [p for p in xi if _pos(p) != "POR"] or xi
    pen_taker = max(out_pool, key=lambda p: _attr(p, "finishing"), default=None)
    fk_taker  = max(out_pool, key=lambda p: (_attr(p, "shooting") + _attr(p, "passing")) / 2, default=None)
    corner    = max(out_pool, key=lambda p: _attr(p, "passing"), default=None)

    tac = dict(OBJECTIVE_TACTIC[obj])
    tac.update({"formation": formation, "width": 50, "marking": "zonal",
                "penaltyTaker": _pid(pen_taker) or _name(pen_taker) if pen_taker else None,
                "freeKickTaker": _pid(fk_taker) or _name(fk_taker) if fk_taker else None,
                "cornerTaker": _pid(corner) or _name(corner) if corner else None})

    def card(p):
        return {"playerId": _pid(p), "name": _name(p), "position": _pos(p)}

    return {"formation": formation, "objective": obj,
            "xi": [card(p) for p in xi], "bench": [card(p) for p in bench],
            "tactic": tac}


def suggest_subs(xi: list[Any], bench: list[Any], minute: int, score_diff: int,
                 subs_used: int = 0, max_subs: int = 3, seed: Optional[int] = None) -> list[dict]:
    """Cambios sugeridos in-match (reutilizable por el motor):
    refrescar a los muy cansados; si se pierde tarde, entra ataque; si se gana, defensa."""
    out: list[dict] = []
    taken: set = set()       # suplentes ya usados
    gone: set = set()        # titulares ya sustituidos
    used = subs_used
    if minute < 55 or not bench:
        return out

    # 1) Jugadores reventados (forma muy baja).
    tired = sorted(xi, key=lambda p: _grano(p, "muscularFitness"))
    for p in tired:
        if used >= max_subs:
            break
        if _grano(p, "muscularFitness") >= 55:
            break
        rep = _bench_for(bench, _pos(p), taken)
        if rep:
            out.append(_sub(p, rep, "fitness")); taken.add(id(rep)); gone.add(id(p)); used += 1

    # 2) Ajuste por marcador en el tramo final.
    if minute >= 70 and used < max_subs:
        want = "DEL" if score_diff < 0 else "DEF" if score_diff > 0 else None
        if want:
            weak = min((p for p in xi if _pos(p) != "POR" and id(p) not in gone),
                       key=lambda p: _score(p, _pos(p)), default=None)
            rep = _bench_for(bench, want, taken)
            if weak and rep:
                out.append(_sub(weak, rep, "tactical")); taken.add(id(rep)); gone.add(id(weak)); used += 1
    return out


def _bench_for(bench: list[Any], role: str, taken: set) -> Optional[Any]:
    cand = [p for p in bench if id(p) not in taken]
    if not cand:
        return None
    same = [p for p in cand if _pos(p) == role]
    return max(same or cand, key=lambda p: _score(p, role))


def _sub(out_p: Any, in_p: Any, reason: str) -> dict:
    return {"reason": reason,
            "out": {"playerId": _pid(out_p), "name": _name(out_p)},
            "in": {"playerId": _pid(in_p), "name": _name(in_p)}}
