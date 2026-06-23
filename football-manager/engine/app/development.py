# ─── Manager FDF — Motor de DESARROLLO de jugadores (Python) ──────────────────
# Módulo PURO y separado del motor de partido: dada una plantilla y el contexto de
# un periodo de entrenamiento (foco, minutos jugados, nota media, descanso…),
# calcula la evolución de los 9 atributos FDF y la recuperación de forma física.
#
# Curva por EDAD y POTENCIAL: los jóvenes con techo alto crecen rápido, meseta en la
# madurez, declive de veteranos. Nadie supera su `potential`. Determinista por semilla.
# No depende del motor de partido ni altera su calibración (ver calibrate_dev.py).

from __future__ import annotations

import random
import zlib
from typing import Any, Optional

from .engine import ATTRS, _attr, _clamp, _grano, _name, _overall, _pid

# ─── Constantes calibradas (ver calibrate_dev.py) ─────────────────────────────
GROWTH_K        = 0.135     # ganancia base por periodo (escala global)
DECLINE_K       = 0.075     # declive base de veteranos por periodo
FOCUS_BOOST     = 2.0       # peso de los atributos enfocados
OFF_FOCUS       = 0.40      # peso del resto
VARIANCE_MAX    = 0.6       # varianza máxima por periodo (consistency=0)

# Atributos que se desarrollan: los 9 FDF + REFLEJOS (salidas = goalkeeping).
_DEV_ATTRS = ATTRS + ("reflexes",)

# Atributos que decaen con la edad (físicos) y los que aguantan (mentales).
DECLINE_ATTRS = ("tackling", "unmarking", "dribbling", "finishing", "shooting")
MENTAL_ATTRS  = ("organization", "passing")

# Grupos de entrenamiento → atributos que potencian.
FOCUS_GROUPS: dict[str, tuple[str, ...]] = {
    "ataque":   ("shooting", "finishing", "unmarking", "dribbling"),
    "defensa":  ("tackling", "organization", "fouls"),
    "medio":    ("passing", "organization", "dribbling"),
    "fisico":   _DEV_ATTRS,            # acondicionamiento: leve en todo + forma
    "porteria": ("goalkeeping", "reflexes"),   # SALIDAS y REFLEJOS
    "general":  _DEV_ATTRS,
}

PERSONALITY_MULT: dict[str, float] = {
    "profesional": 1.15, "ambicioso": 1.12, "lider": 1.05,
    "temperamental": 0.92, "inconstante": 0.88,
}


def _focus_attrs(focus: str) -> tuple[str, ...]:
    f = str(focus or "general").lower()
    if f in FOCUS_GROUPS:
        return FOCUS_GROUPS[f]
    if f in ATTRS:
        return (f,)
    return FOCUS_GROUPS["general"]


def _age_growth(age: float) -> float:
    """Multiplicador de CRECIMIENTO según la edad (0 en la madurez tardía)."""
    if age <= 17:  return 1.10
    if age <= 19:  return 1.00
    if age <= 21:  return 0.80
    if age <= 23:  return 0.55
    if age <= 26:  return 0.30
    if age <= 28:  return 0.12
    if age <= 29:  return 0.05
    return 0.0


def _age_decline(age: float) -> float:
    """Multiplicador de DECLIVE físico según la edad (0 hasta ~29)."""
    if age <= 29:  return 0.0
    if age <= 31:  return 0.4
    if age <= 33:  return 0.8
    if age <= 35:  return 1.3
    return 1.9


def calc_development(player: Any, context: Optional[dict] = None,
                     seed: Optional[int] = None) -> dict:
    """Evolución de UN jugador en un periodo de entrenamiento.

    context: trainingFocus, minutesPlayed, matchRating (0-10), restDays, academyLevel?.
    Devuelve deltas por atributo, los atributos resultantes (acotados a `potential`),
    y la nueva forma física (muscularFitness/matchRhythm). Determinista por semilla.
    """
    ctx = context or {}
    focus_attrs = _focus_attrs(ctx.get("trainingFocus", "general"))
    minutes   = float(ctx.get("minutesPlayed", 0) or 0)
    rating    = float(ctx.get("matchRating", 6.0) or 6.0)
    rest_days = float(ctx.get("restDays", 3) or 0)
    academy   = float(ctx.get("academyLevel", 0) or 0)

    age       = _attr(player, "age", 24)
    potential = _attr(player, "potential", _overall(player))
    inj_prone = _attr(player, "injuryProneness", 30)
    consistency = _attr(player, "consistency", 60)
    personality = (player.get("personality") if isinstance(player, dict)
                   else getattr(player, "personality", None)) or "profesional"
    pers_mult = PERSONALITY_MULT.get(str(personality).lower(), 1.0)

    overall = _overall(player)
    gap = max(0.0, potential - overall) / 100.0              # margen de mejora 0..~1

    # Factores del periodo (todos ~1.0 en condiciones medias).
    load_f   = 0.6 + min(1.0, minutes / 270.0) * 0.8          # más minutos → más estímulo
    rating_f = 0.7 + _clamp(rating - 6.0, -2.0, 4.0) / 4.0 * 0.5
    rest_f   = 0.7 + min(1.0, rest_days / 5.0) * 0.4          # poco descanso → menos progreso
    inj_f    = 1.0 - inj_prone / 250.0
    acad_f   = 1.0 + academy / 100.0 * 0.3                    # mejores instalaciones aceleran

    age_g = _age_growth(age)
    age_d = _age_decline(age)

    base_gain = (GROWTH_K * gap * age_g * load_f * rating_f * rest_f
                 * inj_f * acad_f * pers_mult)
    base_decl = DECLINE_K * age_d

    # AUDIT-2026 §8 P1: semilla derivada ESTABLE entre procesos/reinicios.
    # hash() de strings está aleatorizado por PYTHONHASHSEED → desarrollos
    # distintos por despliegue con la misma semilla. crc32 es determinista.
    if seed is None:
        rng = random.Random(None)
    else:
        token = f"{_pid(player) or _name(player)}|{int(potential)}".encode("utf-8")
        rng = random.Random((int(seed) ^ zlib.crc32(token)) & 0xFFFFFFFFFFFF)
    var_amp = VARIANCE_MAX * (1.0 - consistency / 100.0)

    deltas: dict[str, float] = {}
    new_attrs: dict[str, float] = {}
    for a in _DEV_ATTRS:
        cur = _attr(player, a)
        w = FOCUS_BOOST if a in focus_attrs else OFF_FOCUS
        gain = base_gain * w
        decl = base_decl if a in DECLINE_ATTRS else (base_decl * 0.3 if a not in MENTAL_ATTRS else 0.0)
        # El ruido se escala con la ACTIVIDAD real (gain/decl): un jugador estable
        # apenas varía — evita la deriva a la baja por el recorte en el potencial;
        # uno en desarrollo tiene varianza modulada por consistency/personality.
        noise = rng.uniform(-var_amp, var_amp) * (abs(gain) + abs(decl) + 0.04)
        d = gain - decl + noise
        # No superar el potencial al subir; no bajar de 1 al declinar.
        capped = _clamp(cur + d, 1.0, min(99.0, max(cur, potential)))
        deltas[a] = round(capped - cur, 3)
        new_attrs[a] = round(capped, 2)

    # ── Recuperación de forma física ─────────────────────────────────────────
    musc = _grano(player, "muscularFitness")
    rhy  = _grano(player, "matchRhythm")
    musc_new = _clamp(musc + rest_days * 2.6 - (minutes / 90.0) * 4.0, 0.0, 100.0)
    rhy_new  = _clamp(rhy + (3.5 if minutes >= 60 else -2.5 if minutes < 20 else 0.5), 0.0, 100.0)

    return {
        "playerId": _pid(player), "name": _name(player),
        "deltas": deltas, "newAttributes": new_attrs,
        "muscularFitness": round(musc_new, 1), "matchRhythm": round(rhy_new, 1),
        "overallDelta": round(sum(deltas.values()) / len(_DEV_ATTRS), 3),
    }


def develop_squad(players: list[Any], context: Optional[dict] = None,
                  seed: Optional[int] = None) -> list[dict]:
    """Procesa una plantilla entera (una llamada del tick)."""
    out = []
    for i, p in enumerate(players or []):
        s = None if seed is None else seed + i * 7919
        out.append(calc_development(p, context, s))
    return out
