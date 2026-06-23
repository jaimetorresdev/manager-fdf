# ─── Manager FDF — Motor de partido v3 (Python) ───────────────────────────────
# Simula a partir de las PLANTILLAS por jugador (8 atributos FDF + portería),
# no de medias de equipo. Resolución posicional inspirada en el FDF:
#   construcción (organización/pase de los medios) y desmarque/remate de los
#   delanteros baten la destrucción (entradas) de la defensa y la portería del
#   rival, jugada a jugada, en un embudo de fases.
#
# Además calcula NOTAS 0-10 por jugador y el MOTM por mérito.
# Determinista por semilla. Sin dependencias externas: testeable y calibrable
# de forma aislada (ver tests/ y calibrate.py).

from __future__ import annotations

import logging
import math
import random
from dataclasses import dataclass, field
from typing import Any, Optional

from . import fdf_playbook

_log = logging.getLogger("engine")

# Motor por defecto: "fdf" (1d40 por fases, manual §1.3) | "legacy" (embudo tanh).
DEFAULT_ENGINE = "fdf"

# ─── Constantes calibradas (ver calibrate.py) ────────────────────────────────
PLAYS_PER_TEAM = 30
# AUDIT-2026 §8 P0: tope DURO de jugadas por equipo. Con palancas legales (0-100)
# el máximo real es ~57 (posesión 70 × plays_mult 1.35); este límite solo corta
# entradas hostiles que antes podían pedir cientos de millones de jugadas (DoS).
MAX_PLAYS_PER_TEAM = PLAYS_PER_TEAM * 4
DIFF_SCALE     = 22.0
SHOT_BASE,    SHOT_K    = 0.33, 0.55
TARGET_BASE,  TARGET_K  = 0.42, 0.25
CONVERT_BASE, CONVERT_K = 0.265, 0.45
HOME_ADVANTAGE  = 3.5 # Legacy, no longer used as constant
YELLOW_PER_FOUL = 0.16
RED_PER_TEAM    = 0.045
FOULS_MIN, FOULS_MAX = 8, 16

# Lesiones y cambios (usan un rng DERIVADO aparte: no alteran el flujo de juego,
# por lo que la calibración de liga no se mueve).
INJURY_RATE_PER_TEAM   = 0.08          # ~1 lesión cada ~12 partidos por equipo
MAX_SUBS               = 3
FITNESS_SUB_THRESHOLD  = 70            # por debajo, candidato a cambio en el tramo final

# N3-2 · Sinergias ocultas por tags biográficos ───────────────────────────────
# «Cerebro» asistiendo a «Matador» dentro del área → +15% conversión.
# Reproducible por seed: la comprobación es ESTÁTICA (atributos del XI, sin rng)
# y solo afecta a p_goal cuando ambos tags coexisten en el mismo XI.
TAG_SINERGY_MULTIPLIER = 1.15   # multiplicador de éxito del disparo

# N3-3 · Desgaste crónico para jugadores de alta demanda ──────────────────────
# Parámetros en dict para calibración externa; no hardcodear en el bucle.
CHRONIC_FATIGUE_PARAMS: dict[str, float] = {
    "threshold_starts": 3,         # titularidades consecutivas para activar
    "demand_min": 4,                # demandLevel mínimo (0-5)
    "decay_per_extra_start": 0.06, # caída de rendimiento por titularidad extra
    "max_decay": 0.25,             # decay máximo (= rendimiento mínimo 75%)
    "injury_rate_mult": 1.5,       # multiplicador de riesgo lesión por CF activa
}

FORMATION_MODIFIERS: dict[str, tuple[float, float]] = {
    "4-4-2": (0, 0), "4-3-3": (8, -5), "4-2-3-1": (4, 2), "3-5-2": (2, 0),
    "5-3-2": (-3, 8), "5-4-1": (-6, 12), "3-2-3-2": (6, -4), "4-5-1": (-4, 6),
}

# Los 9 atributos FDF que maneja el jugador.
ATTRS = ("passing", "tackling", "shooting", "organization", "unmarking",
         "finishing", "dribbling", "fouls", "goalkeeping")

# ─── MOTOR FDF 1d40 (manual §1.1–1.3) ─────────────────────────────────────────
# Resolución FIEL al manual: cada jugada pasa por FASES (5 campo / 3 balón parado
# / 2 penalti) y cada fase es un duelo atacante-defensor resuelto con 1d40 contra
# el «valor de fase» (vf). El motor por defecto (engine="fdf"); el embudo tanh
# legacy queda disponible con engine="legacy" para A/B y fallback.
#
# Calibración (calibrate.py): con plantillas parejas nivel 75 el objetivo es
# ~2.7 goles/partido. Las palancas LIBRES (no fijadas por el manual) están aquí
# como constantes para poder ajustarlas sin tocar la lógica:
FDF_PLAYS_PER_TEAM = 42           # ~20 por parte (manual §1.1). Escalado por posesión.
FDF_CRE_DES_BIAS = 8.0            # desplaza (cre−des) → tabla de inicio (calibración)
FDF_OFE_BASELINE = 11.0           # bonif.ofe base (modificador de táctica, en uds. d40)
FDF_OFE_SCALE = 0.30              # bonif.ofe extra por punto de ataque sobre el neutro
FDF_OFE_NEUTRAL_ATT = 84.0        # ataque de referencia de un equipo neutro (75, local)
FDF_BASE_CONST = 6                # el «6» de base = 6 − difGoles·k − golesTot·k + conf
# Coeficientes de la suavización del marcador. El manual usa 2 y 2, pero eso
# revierte tanto a la media que comprime los marcadores a empates y anula las
# ventajas de plantilla. Se rebajan (calibración) para que el mejor equipo se
# imponga conservando algo de dinámica de remontada.
FDF_BASE_DIFF_K = 1.1             # peso de la diferencia de goles en el valor base
FDF_BASE_TOTAL_K = 1.2            # peso de los goles totales en el valor base
FDF_REINFORCE_D40 = 2.0           # uds. d40 de bonif.def por punto de refuerzo de zona
FDF_KIND_PENALTY = 0.018          # prob. de que una jugada iniciada sea penalti
FDF_KIND_SETPIECE = 0.16          # prob. de que sea balón parado (falta/córner)
FDF_GK_EDGE = 8.0                 # ventaja del portero en su fase (uds. d40): el
                                  # marco se «refuerza» → conversión realista
FDF_HOME_GATE = 11.0              # empuje extra de localía a (cre−des) del local
FDF_WEATHER_D40 = 25.0            # uds. d40 que la lluvia/nieve resta a la precisión
FDF_ON_TARGET_BASE = 0.42         # prob. base de que un remate vaya a puerta
FDF_ON_TARGET_SCALE = 150.0       # divisor de (tiro−50) sobre la prob. a puerta


# Tabla del manual §1.2 INTERPOLADA (continua): pasa por los mismos puntos que la
# tabla de escalones, pero es suave entre ellos para que las palancas tácticas
# pequeñas (pressing, marcaje, estilos…) muevan de verdad la probabilidad —con
# escalones, un cambio de ±4 dentro del mismo tramo no se notaba.
_CRE_DES_PTS = ((-10.0, 0.20), (2.0, 0.30), (6.0, 0.40), (11.0, 0.50),
                (17.0, 0.60), (24.0, 0.70), (32.0, 0.80), (42.0, 0.90))


def _cre_des_prob(diff: float) -> float:
    """Probabilidad inicial de que la jugada se lleve a cabo (manual §1.2)."""
    if diff <= _CRE_DES_PTS[0][0]:
        return _CRE_DES_PTS[0][1]
    if diff >= _CRE_DES_PTS[-1][0]:
        return _CRE_DES_PTS[-1][1]
    for (x0, y0), (x1, y1) in zip(_CRE_DES_PTS, _CRE_DES_PTS[1:]):
        if diff <= x1:
            return y0 + (y1 - y0) * (diff - x0) / (x1 - x0)
    return _CRE_DES_PTS[-1][1]


def _confianza_creacion(diff: float) -> float:
    """Modificador de creación por diferencia de confianza de entrenadores
    (manual §1.2). +30%..−30% en función del bucket; penaliza al de menor confianza."""
    a = abs(diff)
    sign = 1.0 if diff >= 0 else -1.0
    if a >= 7: return sign * 0.30
    if a >= 5: return sign * 0.20
    if a >= 3: return sign * 0.10
    return 0.0


def _confianza_base(diff: float) -> int:
    """Modificador de confianza para el valor base (manual §1.3): +3..−3."""
    a = abs(diff)
    sign = 1 if diff >= 0 else -1
    if a >= 7: return sign * 3
    if a >= 5: return sign * 2
    if a >= 3: return sign * 1
    return 0


# Tabla «valor de fase» (manual §1.3): (límite superior de hab.atq−hab.def,
# offset fase 1-2, offset fase 3-5). Se recorre en orden ascendente.
_VF_ROWS: tuple[tuple[float, int, int], ...] = (
    (-12, 12, 6), (-6, 12, 8), (-4, 14, 10), (-2, 16, 11), (2, 18, 12),
    (4, 20, 13), (6, 22, 14), (8, 24, 15), (10, 26, 16), (12, 28, 17),
    (14, 30, 18), (16, 32, 19), (18, 34, 20), (20, 36, 21), (22, 38, 22),
    (24, 40, 23), (26, 42, 24), (28, 44, 25), (30, 46, 26), (32, 48, 27),
    (float("inf"), 50, 28),
)


def _vf_offset(diff: float, late_phase: bool) -> int:
    """Offset de la tabla de valor de fase. `late_phase`=True ⇒ fase 3/4/5."""
    # Primera fila: diff < −12 (estricto). Resto: diff <= límite del bucket.
    if diff < -12:
        return _VF_ROWS[0][2] if late_phase else _VF_ROWS[0][1]
    for ub, off12, off345 in _VF_ROWS[1:]:
        if diff <= ub:
            return off345 if late_phase else off12
    return _VF_ROWS[-1][2] if late_phase else _VF_ROWS[-1][1]


@dataclass
class Player:
    name: str = "Jugador"
    id: Optional[str] = None       # id del jugador (para mapear a la BD del backend)
    position: str = "MED"          # POR | DEF | MED | DEL
    detailedPosition: Optional[str] = None  # 15 códigos (LD/CT/PIV/MCO/EXTD/DC…)
    passing: float = 50
    tackling: float = 50
    shooting: float = 50
    organization: float = 50
    unmarking: float = 50
    finishing: float = 50
    dribbling: float = 50
    fouls: float = 50
    goalkeeping: float = 50      # SALIDAS: intercepción de centros/balón parado
    reflexes: Optional[float] = None  # REFLEJOS: paradas de disparo. None ⇒ = goalkeeping
    fitness: float = 100
    morale: float = 75
    experience: float = 60
    isStarter: bool = False


@dataclass
class Tactic:
    formation: str = "4-4-2"
    construction: float = 50
    destruction: float = 50
    # Palancas avanzadas (50 = neutro ⇒ partido idéntico al actual).
    pressing: float = 50           # 0-100: alto recupera más pero fatiga más
    tempo: float = 50              # 0-100: alto = más jugadas, menos precisión
    width: float = 50              # 0-100 (efecto leve sobre creación)
    mentality: float = 50          # 0 defensiva .. 100 ofensiva
    homeAdvantage: Optional[float] = None
    marking: str = "zonal"         # zonal | individual
    penaltyTaker: Optional[str] = None
    freeKickTaker: Optional[str] = None
    cornerTaker: Optional[str] = None
    # Estilos de juego FDF (manual §2.9) y zonas (manual §2.6). None = neutro.
    offensiveStyle: Optional[str] = None
    defensiveStyle: Optional[str] = None
    attackZones: Optional[dict] = None          # {"left":%, "center":%, "right":%}
    defenseReinforcement: Optional[dict] = None  # {"left":0-3, "center":0-3, "right":0-3}
    # WT3 · Counter de formaciones (backend). None = neutro absoluto.
    profileBonus: Optional[dict] = None         # {"attack":±, "defense":±, "midfield":±}


# ─── Estilos de juego FDF (manual §2.9) ───────────────────────────────────────
# Matriz piedra-papel-tijera: (estilo ofensivo atacante, estilo defensivo rival) →
# (bonus CONSTRUCCIÓN para el atacante, bonus DESTRUCCIÓN para el defensor).
# Se aplica ×STYLE_SCALE como puntos de perfil. Ambos None = (0,0) ⇒ neutro.
# C3 (5 jun 2026): STYLE_SCALE 0.5→1.2 — el matchup ganador (+6) vale ahora +7.2
# puntos de perfil (≈ ventaja de campo) y además arrastra posesión (ver
# STYLE_MIDFIELD_FACTOR). La calibración global no cambia: sin estilos todo es 0.
STYLE_SCALE = 1.2
# Fracción del bonus de construcción que también empuja el dominio del medio
# (posesión): ganar el duelo táctico se NOTA en el reparto de jugadas.
STYLE_MIDFIELD_FACTOR = 0.5
_STYLE_MATRIX: dict[tuple[str, str], tuple[float, float]] = {
    ("abrir_campo", "presion_bandas"): (0, 6),
    ("abrir_campo", "presion_centro"): (6, 0),
    ("abrir_campo", "fuera_de_juego"): (2, 0),
    ("abrir_campo", "defensa_adelantada"): (2, 0),
    ("abrir_campo", "presion_mediocentro"): (2, 0),
    ("pases_cortos", "presion_bandas"): (6, 0),
    ("pases_cortos", "presion_centro"): (0, 6),
    ("pases_cortos", "fuera_de_juego"): (2, 0),
    ("pases_cortos", "defensa_adelantada"): (2, 0),
    ("pases_cortos", "presion_mediocentro"): (2, 0),
    ("buscar_espalda", "presion_bandas"): (2, 0),
    ("buscar_espalda", "presion_centro"): (2, 0),
    ("buscar_espalda", "fuera_de_juego"): (0, 4),
    ("buscar_espalda", "defensa_adelantada"): (6, 0),
    ("buscar_espalda", "presion_mediocentro"): (0, 4),
    ("moverse_entre_lineas", "presion_bandas"): (2, 0),
    ("moverse_entre_lineas", "presion_centro"): (2, 0),
    ("moverse_entre_lineas", "fuera_de_juego"): (6, 0),
    ("moverse_entre_lineas", "defensa_adelantada"): (0, 4),
    ("moverse_entre_lineas", "presion_mediocentro"): (0, 4),
    ("pases_largos", "presion_bandas"): (2, 0),
    ("pases_largos", "presion_centro"): (2, 0),
    ("pases_largos", "fuera_de_juego"): (0, 4),
    ("pases_largos", "defensa_adelantada"): (0, 4),
    ("pases_largos", "presion_mediocentro"): (6, 0),
}


def _style_bonus(off: Optional[str], deff: Optional[str]) -> tuple[float, float]:
    """(bonus construcción atacante, bonus destrucción defensor). Neutro = (0,0)."""
    if off is None and deff is None:
        return 0.0, 0.0
    if off is None:           # el atacante no eligió: el defensor le come +10
        return 0.0, 10.0
    if deff is None:          # el defensor no eligió: el atacante gana +10
        return 10.0, 0.0
    return _STYLE_MATRIX.get((str(off), str(deff)), (0.0, 0.0))


# ─── Bonus por asistencia al estadio (manual §2.10, solo equipo LOCAL) ────────
# Puntos por posición natural según % de lleno (>90 / >70 / <71) y extra si el
# entrenador dio el discurso ("estimulados"). attendancePct=None ⇒ sin efecto.
_ATTENDANCE_TIERS: dict[str, tuple[float, float, float]] = {
    "POR": (0, 0, 0), "DEF": (2, 1, 0), "MED": (3, 2, 1), "DEL": (5, 3, 2),
}
_STIMULATED_EXTRA: dict[str, float] = {"POR": 0, "DEF": 1, "MED": 2, "DEL": 4}


def _attendance_bonus(pct: Optional[float], stimulated: bool) -> Optional[dict]:
    """Dict posición→puntos, o None si no hay datos (neutro)."""
    if pct is None and not stimulated:
        return None
    tier = 2
    if pct is not None:
        tier = 0 if pct > 90 else (1 if pct > 70 else 2)
    bonus = {pos: vals[tier] if pct is not None else 0.0
             for pos, vals in _ATTENDANCE_TIERS.items()}
    if stimulated:
        for pos, extra in _STIMULATED_EXTRA.items():
            bonus[pos] = bonus.get(pos, 0.0) + extra
    return bonus


# ─── Zonas de ataque y refuerzo defensivo (manual §2.6, bonif.def del 1d40) ───
ZONE_KEYS = ("left", "center", "right")
ZONE_REINFORCE_PCT = 0.05     # cada punto de refuerzo resta 5% de éxito en su carril

# C7 · Carril por defecto cuando el mánager NO configura attackZones: deriva de
# la FORMACIÓN (sesgo izquierda/centro/derecha) y de la palanca width (amplitud).
# Solo afecta a QUÉ carril se narra/expone (frng); sin refuerzo rival el éxito
# de la jugada no cambia ⇒ el marcador es idéntico (test_lanes_chain.py).
FORMATION_LANE_BIAS: dict[str, tuple[float, float, float]] = {
    "4-4-2": (1.0, 1.0, 1.0), "4-3-3": (1.15, 0.9, 1.15), "4-2-3-1": (0.95, 1.15, 0.95),
    "3-5-2": (0.9, 1.3, 0.9), "5-3-2": (0.95, 1.2, 0.95), "5-4-1": (1.0, 1.0, 1.0),
    "3-2-3-2": (1.0, 1.15, 1.0), "4-5-1": (1.0, 1.1, 1.0),
}


def _zone_weights(att_zones: Optional[dict]) -> tuple[float, float, float]:
    if not att_zones:
        return (1.0, 1.0, 1.0)
    w = tuple(max(0.0, float(att_zones.get(k, 0) or 0)) for k in ZONE_KEYS)
    return w if sum(w) > 0 else (1.0, 1.0, 1.0)


def _lane_weights(tactic: Any) -> tuple[float, float, float]:
    """C7: pesos de carril de un equipo. attackZones manda; si no hay, formación
    + amplitud (width>50 carga las bandas, width<50 el centro)."""
    zones = _opt(tactic, "attackZones")
    if zones:
        return _zone_weights(zones)
    form = _opt(tactic, "formation") or "4-4-2"
    base = FORMATION_LANE_BIAS.get(str(form), (1.0, 1.0, 1.0))
    width_d = (_attr(tactic, "width", 50) - 50) / 50.0
    wing = max(0.1, 1.0 + 0.35 * width_d)
    cent = max(0.1, 1.0 - 0.35 * width_d)
    return (base[0] * wing, base[1] * cent, base[2] * wing)


def _pick_zone(weights: tuple[float, float, float], frng: random.Random) -> str:
    total = sum(weights)
    pick = frng.random() * total
    acc = 0.0
    for key, w in zip(ZONE_KEYS, weights):
        acc += w
        if pick <= acc:
            return key
    return ZONE_KEYS[-1]


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _minute(rng: random.Random) -> int:
    """Minuto de un evento con ligero sesgo a la 2ª parte (fatiga → más goles tarde)."""
    if rng.random() < 0.54:
        return rng.randint(46, 90)
    return rng.randint(1, 45)


def _attr(p: Any, key: str, default: float = 50.0) -> float:
    v = p.get(key, None) if isinstance(p, dict) else getattr(p, key, None)
    if v is None:
        # REFLEJOS por defecto = SALIDAS (goalkeeping) en datos antiguos sin split.
        if key == "reflexes":
            return _attr(p, "goalkeeping", default)
        return default
    return float(v)


def _grano(p: Any, key: str) -> float:
    """Atributo físico desglosado (muscularFitness/mentalSharpness/matchRhythm);
    si no viene, cae al `fitness` global del jugador (default 100)."""
    raw = p.get(key, None) if isinstance(p, dict) else getattr(p, key, None)
    return float(raw) if raw is not None else _attr(p, "fitness", 100)


def _gk_salidas(p: Any) -> float:
    """SALIDAS del portero (centros/balón parado): el atributo `goalkeeping`."""
    return _attr(p, "goalkeeping", 50)


def _gk_reflejos(p: Any) -> float:
    """REFLEJOS del portero (paradas de disparo): el atributo `reflexes`; si no
    viene (datos antiguos), cae a `goalkeeping` ⇒ retrocompatible y neutro."""
    raw = p.get("reflexes", None) if isinstance(p, dict) else getattr(p, "reflexes", None)
    return float(raw) if raw is not None else _attr(p, "goalkeeping", 50)


def _gk_rating(p: Optional[Any]) -> float:
    """Nota global de portería: media de salidas y reflejos (sin POR ⇒ 20)."""
    if p is None:
        return 20.0
    return (_gk_salidas(p) + _gk_reflejos(p)) / 2.0


# ─── Clima ────────────────────────────────────────────────────────────────────
# Multiplicador de PRECISIÓN (remate/definición) por condición. Soleado/nublado = 1.0
# (neutro: no mueve la calibración). Lluvia/nieve restan; calor/frío casi neutro en
# precisión pero penalizan la resistencia (ver _weather_factors).
WEATHER_ACCURACY: dict[str, float] = {
    "soleado": 1.00, "nublado": 1.00, "lluvia": 0.92,
    "nieve": 0.85, "calor": 0.98, "frio": 0.99,
}


def _chain_break(p: Any) -> bool:
    """N3-1 · Fuera de posición estricta: anula aporte en cadena ofensiva."""
    raw = p.get("outOfPositionChainBreak", None) if isinstance(p, dict) else getattr(p, "outOfPositionChainBreak", None)
    return bool(raw)


def _attack_eligible(pool: list[Any]) -> list[Any]:
    """Pool ofensivo sin jugadores con cadena rota; si todos lo están, devuelve vacío."""
    return [p for p in pool if not _chain_break(p)]


def _weather_factors(condition: str, temperature: float) -> tuple[float, float]:
    """Devuelve (mult_precision, penalización_resistencia). Neutro = (1.0, 0.0)."""
    acc = WEATHER_ACCURACY.get(str(condition or "soleado").lower(), 1.0)
    temp_pen = max(0.0, abs(float(temperature) - 18.0) - 10.0) / 40.0
    cond = str(condition or "soleado").lower()
    if cond == "calor":
        temp_pen += 0.15
    elif cond in ("frio", "nieve"):
        temp_pen += 0.10
    return acc, temp_pen


def _fatigue_mult(stamina: float, rhythm: float, minute: int, temp_pen: float) -> float:
    """Multiplicador de rendimiento por fatiga al minuto dado (0.6–1.0).
    Con stamina=rhythm=100 y temp_pen=0 devuelve 1.0 SIEMPRE → calibración intacta."""
    if minute <= 60:
        base = 0.0
    else:
        base = (minute - 60) / 30.0                       # 0 a 60', crece después
    lack = (100 - stamina) / 100.0 * 0.6 + (100 - rhythm) / 100.0 * 0.4
    decay = base * (lack + temp_pen)
    return max(0.6, 1.0 - decay * 0.25)


def _mean(values: list[float], default: float = 50.0) -> float:
    return sum(values) / len(values) if values else default


def _overall(p: Any) -> float:
    return _mean([_attr(p, k) for k in ATTRS])


def _select_xi(players: list[Any]) -> list[Any]:
    eligible = [p for p in players if _is_eligible(p)]
    starters = [p for p in eligible if _truthy_starter(p)]
    # AUDIT-2026 §8 P3: comparación por IDENTIDAD (id()), no por valor — dos
    # jugadores sintéticos idénticos ya no se excluyen mutuamente del XI.
    starter_ids = {id(p) for p in starters}
    rest = sorted([p for p in eligible if id(p) not in starter_ids], key=_overall, reverse=True)
    ordered = starters + rest
    if not ordered:
        return []

    # Un portero real disponible nunca puede caerse por el corte de los once.
    # Si hay varios, juega el de mayor atributo de portería; el resto no ocupa
    # plazas de campo salvo que la plantilla no tenga diez jugadores de campo.
    gks = sorted([p for p in ordered if _pos(p) == "POR"],
                 key=lambda p: (_attr(p, "goalkeeping"), _overall(p)),
                 reverse=True)
    outfield = [p for p in ordered if _pos(p) != "POR"]
    if gks and len(outfield) >= 10:
        return [gks[0], *outfield[:10]]
    return ordered[:11]


def _truthy_starter(p: Any) -> bool:
    if isinstance(p, dict):
        return bool(p.get("isStarter", False))
    return bool(getattr(p, "isStarter", False))


def _is_eligible(p: Any) -> bool:
    if isinstance(p, dict):
        return int(p.get("suspendedMatches", 0) or 0) <= 0 and not bool(p.get("injured", False))
    return int(getattr(p, "suspendedMatches", 0) or 0) <= 0 and not bool(getattr(p, "injured", False))


def _name(p: Any) -> str:
    if isinstance(p, dict):
        return str(p.get("name", "Jugador"))
    return str(getattr(p, "name", "Jugador"))


def _pos(p: Any) -> str:
    if isinstance(p, dict):
        return str(p.get("position", "MED"))
    return str(getattr(p, "position", "MED"))


def _dpos(p: Any) -> Optional[str]:
    """Posición DETALLADA (15 códigos) si el jugador la trae; None si no."""
    raw = p.get("detailedPosition", None) if isinstance(p, dict) else getattr(p, "detailedPosition", None)
    return str(raw) if raw else None


def _pid(p: Any) -> Optional[str]:
    """Id del jugador si lo trae el backend; None si no (solo había nombre)."""
    raw = p.get("id", None) if isinstance(p, dict) else getattr(p, "id", None)
    return str(raw) if raw is not None else None


def _tags(p: Any) -> list:
    """Etiquetas biográficas del jugador (N3-2). Lista vacía si no vienen."""
    raw = p.get("tags", None) if isinstance(p, dict) else getattr(p, "tags", None)
    return list(raw) if raw else []


def _demand_level(p: Any) -> int:
    """Nivel de demanda física del jugador (N3-3). 0 si no viene."""
    raw = p.get("demandLevel", None) if isinstance(p, dict) else getattr(p, "demandLevel", None)
    try:
        return int(raw) if raw is not None else 0
    except (TypeError, ValueError):
        return 0


def _consecutive_starts(p: Any) -> int:
    """Titularidades consecutivas sin descanso (N3-3). 0 si no viene."""
    raw = p.get("consecutiveStarts", None) if isinstance(p, dict) else getattr(p, "consecutiveStarts", None)
    try:
        return int(raw) if raw is not None else 0
    except (TypeError, ValueError):
        return 0


def _chronic_fatigue_decay(p: Any) -> float:
    """N3-3: decay de rendimiento por desgaste crónico (0.0 = sin efecto).
    Solo activo para demanda alta (≥4/5) con ≥3 titularidades consecutivas."""
    demand = _demand_level(p)
    starts = _consecutive_starts(p)
    th = CHRONIC_FATIGUE_PARAMS["threshold_starts"]
    dm = CHRONIC_FATIGUE_PARAMS["demand_min"]
    if demand < dm or starts < th:
        return 0.0
    extra = starts - th
    decay = extra * CHRONIC_FATIGUE_PARAMS["decay_per_extra_start"]
    return min(decay, CHRONIC_FATIGUE_PARAMS["max_decay"])


@dataclass
class _Profile:
    xi: list[Any]
    bench: list[Any]       # suplentes (no-titulares) disponibles para cambios
    gk: Optional[Any]
    attack: float          # potencia ofensiva (construcción + remate)
    defense: float         # potencia defensiva (entradas)
    midfield: float        # dominio del medio (posesión)
    finish: float          # capacidad de definir (remate/desmarque)
    gk_rating: float       # portería
    stamina: float = 100   # muscularFitness medio del XI (fatiga)
    rhythm: float = 100    # matchRhythm medio del XI
    sharp: float = 100     # mentalSharpness medio del XI (errores/decisiones)
    plays_mult: float = 1.0    # jugadas extra por tempo/mentalidad (1.0 = neutro)
    fatigue_extra: float = 0.0  # fatiga añadida por pressing/tempo altos (0 = neutro)
    discipline: float = 50      # atributo fouls medio interpretado como control disciplinario
    set_piece: float = 50       # calidad de corners/faltas si hay lanzadores declarados
    penalty_skill: float = 50   # calidad del penaltyTaker en tandas
    # N3-2: conjunto de ids/nombres de tiradores con sinergia Cerebro-Matador activa.
    sinergy_shooters: frozenset = field(default_factory=frozenset)
    # N3-3: número de jugadores con desgaste crónico activo en el XI.
    chronic_fatigued_count: int = 0
    # FDF 1d40 (manual §1.2-1.3): construcción/destrucción del equipo (potencias
    # macro reutilizadas) y confianza del entrenador (0-100; 50 = neutro).
    construccion: float = 50.0
    destruccion: float = 50.0
    coach_confidence: float = 50.0
    formation: str = "4-4-2"


def _apply_red_card_penalty(profile: _Profile, minute: int) -> None:
    """Aproxima la inferioridad numérica ponderando los minutos restantes."""
    remaining = _clamp((90 - minute) / 70.0, 0.0, 1.0)
    base = 10.0 * remaining
    profile.attack = _clamp(profile.attack - base * 0.75)
    profile.defense = _clamp(profile.defense - base * 0.85)
    profile.midfield = _clamp(profile.midfield - base)
    profile.finish = _clamp(profile.finish - base * 0.60)
    profile.construccion = _clamp(profile.construccion - base * 0.75)
    profile.destruccion = _clamp(profile.destruccion - base * 0.85)


def _corner_count(shots: int, shots_on_target: int, roll: float) -> int:
    """Córners derivados de ataques no finalizados, sin sesgo fijo local/visitante."""
    blocked_or_wide = max(0, shots - shots_on_target)
    return int(_clamp(round(blocked_or_wide * 0.45 + _clamp01(roll) * 3), 0, 12))


def _find_player_by_ref(pool: list[Any], raw: Any) -> Optional[Any]:
    """Busca jugador por id o nombre. None si la táctica no declaró lanzador."""
    ref = str(raw or "").strip()
    if not ref:
        return None
    for p in pool:
        if _pid(p) == ref or _name(p) == ref:
            return p
    return None


def _skill_avg(p: Optional[Any], keys: tuple[str, ...], default: float = 50.0) -> float:
    return _mean([_attr(p, k) for k in keys], default) if p is not None else default


def _build_profile(players: list[Any], tactic: Any, is_home: bool,
                   pos_bonus: Optional[dict] = None) -> _Profile:
    xi = _select_xi(players)
    xi_ids = {id(p) for p in xi}  # AUDIT-2026 §8 P3: banquillo por identidad
    bench = [p for p in players if id(p) not in xi_ids]
    if not xi:
        xi = [Player(name="N.N.", position=p) for p in ("POR", "DEF", "DEF", "DEF", "DEF",
                                                         "MED", "MED", "MED", "MED", "DEL", "DEL")]
    gks  = [p for p in xi if _pos(p) == "POR"]
    defs = [p for p in xi if _pos(p) == "DEF"]
    mids = [p for p in xi if _pos(p) == "MED"]
    fwds = [p for p in xi if _pos(p) == "DEL"]

    form = tactic.get("formation") if isinstance(tactic, dict) else getattr(tactic, "formation", "4-4-2")
    form_att, form_def = FORMATION_MODIFIERS.get(form, (0.0, 0.0))
    construction = _attr(tactic, "construction", 50)
    destruction  = _attr(tactic, "destruction", 50)

    # Palancas avanzadas como desviación respecto a 50 (neutro = 0 ⇒ sin efecto).
    press_d = (_attr(tactic, "pressing", 50) - 50) / 50.0     # -1..1
    tempo_d = (_attr(tactic, "tempo", 50) - 50) / 50.0
    ment_d  = (_attr(tactic, "mentality", 50) - 50) / 50.0
    width_d = (_attr(tactic, "width", 50) - 50) / 50.0
    marking = str(_opt(tactic, "marking") or "zonal").lower()
    individual_marking = marking in ("individual", "man", "man_to_man", "hombre")

    fitness = _mean([_attr(p, "fitness", 100) for p in xi], 100)
    morale  = _mean([_attr(p, "morale", 75) for p in xi], 75)
    fit_mult = 1.0 if fitness >= 70 else 0.7 + (fitness / 70) * 0.3
    morale_f = (morale - 50) / 100.0
    # Calculate dynamic home advantage if homeAdvantage is provided, else legacy
    home_adv_param = tactic.get("homeAdvantage") if isinstance(tactic, dict) else getattr(tactic, "homeAdvantage", None)
    if home_adv_param is not None:
        home_adv = float(home_adv_param) if is_home else 0.0
    else:
        home_adv = HOME_ADVANTAGE if is_home else 0.0

    # Unidades a partir de los atributos FDF posicionales.
    build  = _mean([(_attr(p, "organization") + _attr(p, "passing")) / 2 for p in mids],
                   _mean([_attr(p, "organization") for p in xi]))
    finish = _mean([(_attr(p, "finishing") + _attr(p, "shooting") + _attr(p, "unmarking")) / 3 for p in fwds],
                   _mean([_attr(p, "finishing") for p in xi]))
    tackle = _mean([_attr(p, "tackling") for p in defs],
                   _mean([_attr(p, "tackling") for p in xi]))
    # los medios también defienden un poco
    tackle = 0.8 * tackle + 0.2 * _mean([_attr(p, "tackling") for p in mids], tackle)
    # Sin POR real no se inventa un guardameta promediando atributos de campo.
    # gk_rating = media de SALIDAS y REFLEJOS (retrocompatible: reflexes None ⇒ salidas).
    gk_rating = _mean([_gk_rating(p) for p in gks], 20.0)
    discipline = _mean([_attr(p, "fouls") for p in xi], 50)

    outfield = [p for p in xi if _pos(p) != "POR"] or xi
    penalty_taker = _find_player_by_ref(outfield, _opt(tactic, "penaltyTaker"))
    free_kick_taker = _find_player_by_ref(outfield, _opt(tactic, "freeKickTaker"))
    corner_taker = _find_player_by_ref(outfield, _opt(tactic, "cornerTaker"))
    penalty_skill = _skill_avg(penalty_taker, ("finishing", "shooting"))
    set_piece_skills: list[float] = []
    if free_kick_taker is not None:
        set_piece_skills.append(_skill_avg(free_kick_taker, ("shooting", "passing")))
    if corner_taker is not None:
        set_piece_skills.append(_skill_avg(corner_taker, ("passing", "organization")))
    set_piece = _mean(set_piece_skills, 50)

    # Bonus por asistencia/estimulados (manual §2.10): puntos por posición natural
    # sobre las unidades. None ⇒ 0 en todo ⇒ perfil idéntico (neutro).
    if pos_bonus:
        build += float(pos_bonus.get("MED", 0))
        finish += float(pos_bonus.get("DEL", 0))
        tackle += float(pos_bonus.get("DEF", 0))
        gk_rating += float(pos_bonus.get("POR", 0))

    # Mentalidad ofensiva sube pegada y expone atrás; pressing recupera (sube defensa);
    # tempo/amplitud aportan algo de creación. Todo ×0 cuando las palancas están a 50.
    set_piece_d = (set_piece - 50) / 50.0
    marking_def = 3.0 if individual_marking else 0.0
    marking_mid = -0.5 if individual_marking else 0.0
    marking_fatigue = 0.04 if individual_marking else 0.0

    tac_att = ment_d * 6.0 + tempo_d * 2.0 + width_d * 1.5 + set_piece_d * 1.2
    tac_def = press_d * 5.0 - ment_d * 5.0 + marking_def

    attack = _clamp(
        _clamp(0.55 * build + 0.45 * finish + form_att + construction / 10
               + morale_f * 5 + tac_att) * fit_mult + home_adv
    )
    defense = _clamp(
        _clamp(tackle + form_def + destruction / 10 + morale_f * 3 + tac_def)
        * fit_mult + home_adv / 2
    )
    midfield = _clamp(
        _clamp(build + morale_f * 4 + tempo_d * 2.0 + marking_mid) * fit_mult
    )

    # N3-3 · Desgaste crónico: penaliza stamina/rhythm de jugadores de alta demanda
    # con ≥3 titularidades consecutivas. Sin datos (decay=0) ⇒ mismo resultado.
    chronic_count = 0
    effective_mf: list[float] = []
    effective_mr: list[float] = []
    for p in xi:
        decay = _chronic_fatigue_decay(p)
        mf = _grano(p, "muscularFitness")
        mr = _grano(p, "matchRhythm")
        if decay > 0:
            chronic_count += 1
            mf = mf * (1.0 - decay)
            mr = mr * (1.0 - decay)
        effective_mf.append(mf)
        effective_mr.append(mr)

    stamina = _mean(effective_mf, 100)
    rhythm  = _mean(effective_mr, 100)
    sharp   = _mean([_grano(p, "mentalSharpness") for p in xi], 100)
    # Más jugadas con tempo/mentalidad altos; pressing y tempo altos fatigan más.
    plays_mult = 1.0 + max(0.0, tempo_d) * 0.25 + max(0.0, ment_d) * 0.10
    fatigue_extra = max(0.0, press_d) * 0.20 + max(0.0, tempo_d) * 0.10 + marking_fatigue

    # N3-2 · Sinergias Cerebro-Matador: tiradores que se benefician cuando hay un
    # Cerebro en el mismo XI. La comprobación es ESTÁTICA (sin rng) → determinista.
    has_cerebro = any("Cerebro" in _tags(p) for p in xi)
    sinergy_shooters: frozenset
    if has_cerebro:
        sinergy_shooters = frozenset(
            _pid(p) or _name(p)
            for p in xi
            if "Matador" in _tags(p)
        )
    else:
        sinergy_shooters = frozenset()

    # FDF 1d40: confianza del entrenador (0-100; 50 neutro ⇒ diferencia 0 ⇒ sin
    # modificador). construcción/destrucción = potencias macro (ya incluyen
    # palancas, estilos, asistencia, formación) → alimentan la tabla de inicio.
    coach_conf = _attr(tactic, "coachConfidence", 50)
    attack_f = _clamp(_clamp(finish) * fit_mult + home_adv)

    return _Profile(xi=xi, bench=bench, gk=(gks[0] if gks else None),
                    attack=attack, defense=defense, midfield=midfield,
                    finish=attack_f,
                    gk_rating=_clamp(gk_rating),
                    stamina=stamina, rhythm=rhythm, sharp=sharp,
                    plays_mult=plays_mult, fatigue_extra=fatigue_extra,
                    discipline=discipline, set_piece=set_piece,
                    penalty_skill=penalty_skill,
                    sinergy_shooters=sinergy_shooters,
                    chronic_fatigued_count=chronic_count,
                    construccion=attack, destruccion=defense,
                    coach_confidence=coach_conf, formation=str(form))


_GOAL_TEMPLATES = [
    "⚽ Gol de {p}", "⚽ {p} la manda al fondo", "⚽ {p} de cabeza",
    "⚽ Gran remate de {p}", "⚽ {p} define cruzado",
]


def _shooter_weights(xi: list[Any]) -> tuple[list[float], float]:
    """C8: pesos de rematador precomputados UNA vez por equipo y partido (los
    atributos no cambian durante la simulación). Mismos valores que calculaba
    _weighted_shooter por remate ⇒ misma elección, bit a bit."""
    weights = []
    for p in xi:
        base = _attr(p, "finishing") + _attr(p, "unmarking") * 0.5
        pos = _pos(p)
        mult = 2.2 if pos == "DEL" else 1.0 if pos == "MED" else 0.35 if pos == "DEF" else 0.05
        if _chain_break(p):
            mult = 0.0
        weights.append(max(0.0, base * mult))
    return weights, sum(weights) or 1.0


def _weighted_shooter(xi: list[Any], frng: random.Random,
                      pre: Optional[tuple[list[float], float]] = None) -> Any:
    """Elige rematador ponderando por capacidad de gol (los DEL rematan más).
    rng DERIVADO: decide QUIÉN remata, no CUÁNTOS goles → cosmético, no calibra.
    `pre` (C8): pesos precomputados con _shooter_weights — un solo draw igual."""
    weights, total = pre if pre is not None else _shooter_weights(xi)
    pick = frng.random() * total
    acc = 0.0
    for p, w in zip(xi, weights):
        acc += w
        if pick <= acc:
            return p
    return xi[-1]


_STAT_KEYS = ("shots", "shotsOnTarget", "passes", "passesCompleted",
              "tackles", "interceptions", "keyPasses", "saves", "conceded")


def _rkey(p: Any) -> str:
    """AUDIT-2026 §8 P2: clave estable de stats — id de BD con fallback a nombre."""
    return _pid(p) or _name(p)


class _Ratings:
    """Acumula acciones por jugador y deriva la nota 0-10 de ellas.

    AUDIT-2026 §8 P2: indexado por ID (fallback nombre) — dos homónimos ya no
    colapsan en una sola entrada ni duplican stats en la salida. Las llamadas
    siguen pasando el NOMBRE (contrato interno intacto): un mapa nombre→clave
    resuelve la entrada; con homónimos la acción se acredita al primero.
    """
    def __init__(self, xi: list[Any]):
        self.xi = xi
        self._key_by_name: dict[str, str] = {}
        for p in xi:
            self._key_by_name.setdefault(_name(p), _rkey(p))
        self.goals: dict[str, int] = {_rkey(p): 0 for p in xi}
        self.assists: dict[str, int] = {_rkey(p): 0 for p in xi}
        self.xg: dict[str, float] = {_rkey(p): 0.0 for p in xi}
        self.stat: dict[str, dict] = {_rkey(p): {k: 0 for k in _STAT_KEYS} for p in xi}
        self.bonus: dict[str, float] = {_rkey(p): 0.0 for p in xi}   # tarjetas / resultado

    def _k(self, name: str) -> Optional[str]:
        if name in self.stat:                  # ya es una clave (id o nombre único)
            return name
        return self._key_by_name.get(name)

    def inc(self, name: str, key: str, n: int = 1) -> None:
        k = self._k(name)
        if k is not None:
            self.stat[k][key] += n

    def add_xg(self, name: str, v: float) -> None:
        k = self._k(name)
        if k is not None:
            self.xg[k] += v

    def goal(self, name: str) -> None:
        k = self._k(name)
        if k is not None:
            self.goals[k] += 1

    def assist(self, name: str) -> None:
        k = self._k(name)
        if k is not None:
            self.assists[k] += 1

    def add(self, name: str, delta: float) -> None:
        k = self._k(name)
        if k is not None:
            self.bonus[k] += delta

    def _rating(self, p: Any) -> float:
        n, pos, s = _rkey(p), _pos(p), self.stat[_rkey(p)]
        r = 6.0
        r += 0.85 * self.goals[n] + 0.45 * self.assists[n] + 0.13 * s["keyPasses"]
        r += 0.28 * self.xg[n]
        r += 0.05 * s["tackles"] + 0.05 * s["interceptions"]
        if s["passes"] >= 8:                       # precisión de pase (en torno a 0.78)
            r += (s["passesCompleted"] / s["passes"] - 0.78) * 2.2
        if pos == "POR":
            r += 0.10 * s["saves"] - 0.28 * s["conceded"]
            if s["conceded"] == 0:
                r += 0.6
        r += self.bonus[n]
        return round(_clamp(r, 3.0, 10.0), 1)

    def to_list(self) -> list[dict]:
        out = []
        for p in self.xi:
            k, s = _rkey(p), self.stat[_rkey(p)]
            acc = round(s["passesCompleted"] / s["passes"], 3) if s["passes"] else 0.0
            out.append({"name": _name(p), "playerId": _pid(p), "rating": self._rating(p),
                        "position": _pos(p),  # aditivo: para el visor 2D
                        "goals": self.goals[k], "assists": self.assists[k],
                        "shots": s["shots"], "shotsOnTarget": s["shotsOnTarget"],
                        "passes": s["passes"], "passesCompleted": s["passesCompleted"],
                        "passAccuracy": acc, "tackles": s["tackles"],
                        "interceptions": s["interceptions"], "keyPasses": s["keyPasses"],
                        "xg": round(self.xg[k], 2)})
        return out


# Plantillas de narración por fase (cosmético, vía rng derivado).
_BUILD_TXT = [
    "{t} mueve el balón con paciencia desde atrás.",
    "{t} busca espacios por la banda.",
    "{t} combina en el centro del campo.",
]
_LOST_TXT = [
    "{d} corta el avance de {t}.",
    "La defensa de {o} achica y recupera.",
    "{t} pierde la posesión en la frontal.",
]
_MISS_TXT = ["⚽ Remata {p} pero se marcha fuera.", "⚽ Disparo desviado de {p}.",
             "⚽ {p} prueba desde lejos sin puntería."]
_SAVE_TXT = ["🧤 {g} despeja el remate de {p}.", "🧤 Gran parada de {g} ante {p}.",
             "🧤 {g} ataja el disparo de {p}."]

# E16 · Cadena de gol: la jugada que acaba en gol se narra como una cadena de
# fases protagonizada por jugadores elegidos POR HABILIDAD (frng-only).
_CHAIN_START_TXT = [
    "{p} roba el balón y arranca la jugada.",
    "{p} recupera en campo propio y abre rápido.",
    "{p} corta el pase rival y pone en marcha la transición.",
]
_CHAIN_DRIBBLE_TXT = [
    "{p} se va de su par con un regate seco.",
    "{p} encara y rompe la línea con el balón cosido.",
    "{p} gana la banda con un desmarque eléctrico.",
]
_CHAIN_KEYPASS_TXT = [
    "{p} filtra un pase quirúrgico al área.",
    "{p} ve el hueco y asiste entre líneas.",
    "{p} cuelga un centro medido al segundo palo.",
]


def _pick(pool: list[Any], frng: random.Random) -> Any:
    return pool[frng.randrange(len(pool))]


def _weighted_pick(pool: list[Any], frng: random.Random, keys: tuple[str, ...]) -> Optional[Any]:
    """Elige de pool ponderando por la suma de atributos `keys` (frng-only)."""
    if not pool:
        return None
    weights = [max(1.0, sum(_attr(p, k) for k in keys)) for p in pool]
    r = frng.random() * sum(weights)
    acc = 0.0
    for p, w in zip(pool, weights):
        acc += w
        if r <= acc:
            return p
    return pool[-1]


def _duel(att_p: Any, att_keys: tuple[str, ...],
          def_p: Optional[Any], def_keys: tuple[str, ...]) -> dict:
    """C7: duelo de atributos de un eslabón de jugada — quién ataca y quién
    defiende, con los valores EXACTOS que pondera el motor en ese paso."""
    side = lambda p, keys: {"playerId": _pid(p), "name": _name(p), "position": _pos(p),
                            "attrs": {k: round(_attr(p, k), 1) for k in keys}}
    return {"att": side(att_p, att_keys),
            "def": side(def_p, def_keys) if def_p is not None else None}


def _resolve(att_prof: _Profile, def_prof: _Profile, plays: int, team: str,
             rng: random.Random, frng: random.Random,
             events: list[dict], timeline: list[dict],
             att_rt: _Ratings, def_rt: _Ratings, minutes: list[int],
             weather_acc: float = 1.0, temp_pen: float = 0.0,
             att_zones: Optional[dict] = None,
             def_reinf: Optional[dict] = None,
             lane_weights: Optional[tuple[float, float, float]] = None) -> tuple[int, int, int]:
    """Motor por fases cronológico. El rng PRINCIPAL decide tiro/puerta/gol
    (calibración); el rng DERIVADO (frng) genera tirador, pases, narración y
    minutos — cosmético, no altera el marcador.

    weather_acc (≤1) y temp_pen (≥0) son NEUTROS (1.0 / 0.0) en condiciones normales
    y con plantillas a tope de forma, por lo que la calibración base queda intacta."""
    goals = shots = on_target = 0
    m1 = math.tanh((att_prof.attack - def_prof.defense) / DIFF_SCALE)
    m2 = math.tanh((att_prof.finish - def_prof.defense) / DIFF_SCALE)
    m3 = math.tanh((att_prof.finish - def_prof.gk_rating) / DIFF_SCALE)
    p_shot_base   = _clamp01(SHOT_BASE * (1 + SHOT_K * m1))
    p_target_base = _clamp01(TARGET_BASE * (1 + TARGET_K * m2))
    p_goal_base   = _clamp01(CONVERT_BASE * (1 + CONVERT_K * m3))
    other = "away" if team == "home" else "home"
    gk = def_prof.gk
    gk_name = _name(gk) if gk is not None else None

    outfield = _attack_eligible([p for p in att_prof.xi if _pos(p) != "POR"]) or [p for p in att_prof.xi if _pos(p) != "POR"] or att_prof.xi
    pass_pool = [p for p in att_prof.xi if _pos(p) in ("DEF", "MED")] or outfield
    stoppers = [p for p in def_prof.xi if _pos(p) in ("DEF", "MED")] or def_prof.xi
    carriers = [p for p in def_prof.xi if _pos(p) in ("MED", "DEL")] or def_prof.xi

    # C7 · Carril SIEMPRE: attackZones manda (mismos pesos y draws que antes);
    # sin zonas, deriva de formación+width (lane_weights). El refuerzo defensivo
    # solo multiplica el éxito si el rival lo configuró ⇒ sin refuerzo, zmult=1.0
    # y el marcador no depende del carril (frng no toca el rng principal).
    zone_w = _zone_weights(att_zones) if att_zones else (lane_weights or (1.0, 1.0, 1.0))

    # C8 · Precomputados del bucle caliente. Mismos VALORES y mismos draws que
    # la versión por-jugada ⇒ resultado bit a bit idéntico (verificado contra la
    # versión previa en 60 semillas); solo evita releer atributos en cada jugada.
    pass_names = [_name(p) for p in pass_pool]
    pass_skill = [_attr(p, "passing") + _attr(p, "organization") for p in pass_pool]
    pacc_def_term = (def_prof.defense - 50) / 400
    pacc_sharp_term = (100 - att_prof.sharp) / 500
    pacc_weather_term = (1.0 - weather_acc) * 0.5
    shooter_pre = _shooter_weights(outfield)
    kp_named = [(_name(p), p) for p in att_prof.xi if _pos(p) in ("MED", "DEL") and not _chain_break(p)]

    for i in range(plays):
        minute = minutes[i] if i < len(minutes) else _minute(frng)

        # Carril de la jugada y refuerzo defensivo del rival en ese carril.
        lane = _pick_zone(zone_w, frng)
        zmult = 1.0
        if def_reinf:
            pts = float(def_reinf.get(lane, 0) or 0)
            zmult = 1.0 - ZONE_REINFORCE_PCT * max(0.0, min(3.0, pts))

        # ── Fatiga (por minuto) + clima → probabilidades efectivas ───────────
        # Neutro (forma 100 + clima normal) ⇒ multiplicadores = 1.0 ⇒ sin cambios.
        fat_att = _fatigue_mult(att_prof.stamina, att_prof.rhythm, minute, temp_pen + att_prof.fatigue_extra)
        fat_def = _fatigue_mult(def_prof.stamina, def_prof.rhythm, minute, temp_pen + def_prof.fatigue_extra)
        p_shot   = _clamp01(p_shot_base * (0.5 + 0.5 * fat_att) * zmult)  # cansados crean menos
        p_target = _clamp01(p_target_base * fat_att * weather_acc)        # precisión ↓
        p_goal   = _clamp01(p_goal_base * weather_acc * (1 + (1 - fat_def) * 0.5) * zmult)  # defensa cansada concede más

        # ── Fase de construcción: pases (cosmético) ──────────────────────────
        for _ in range(frng.randint(2, 6)):
            pi = frng.randrange(len(pass_pool))     # mismo draw que _pick
            att_rt.inc(pass_names[pi], "passes")
            pacc = _clamp01(0.70 + pass_skill[pi] / 600
                            - pacc_def_term
                            - pacc_sharp_term                       # menos lucidez → más errores
                            + (fat_att - 1.0) * 0.4                 # cansancio resta precisión
                            - pacc_weather_term)                    # lluvia/nieve resta precisión
            if frng.random() < pacc:
                att_rt.inc(pass_names[pi], "passesCompleted")

        # ── ¿Llega a remate? (rng PRINCIPAL) ─────────────────────────────────
        t_label = "El equipo local" if team == "home" else "El visitante"
        o_label = "El visitante" if team == "home" else "El equipo local"
        if rng.random() >= p_shot:
            d = _pick(stoppers, frng)
            def_rt.inc(_name(d), "tackles" if frng.random() < 0.5 else "interceptions")
            if frng.random() < 0.18:
                timeline.append({"minute": minute, "phase": "progresion", "team": team,
                                 "zone": "med", "lane": lane, "playerId": _pid(d),
                                 "text": _pick(_LOST_TXT, frng).format(t=t_label, o=o_label, d=_name(d))})
            continue

        shots += 1
        shooter = _weighted_shooter(outfield, frng, shooter_pre)  # quién remata (cosmético)
        sname = _name(shooter)

        # N3-2 · Sinergia Cerebro-Matador: si el tirador tiene tag "Matador" y hay un
        # "Cerebro" en el mismo XI, la conversión sube ×1.15. Sin tags → neutro bit a bit.
        shooter_key = _pid(shooter) or sname
        sinergy_active = shooter_key in att_prof.sinergy_shooters
        p_goal_eff = _clamp01(p_goal * TAG_SINERGY_MULTIPLIER) if sinergy_active else p_goal

        att_rt.inc(sname, "shots"); att_rt.add_xg(sname, p_goal_eff)
        kp = [p for nm, p in kp_named if nm != sname]
        if kp and frng.random() < 0.5:
            att_rt.inc(_name(_pick(kp, frng)), "keyPasses")

        if rng.random() >= p_target:                 # remate fuera
            timeline.append({"minute": minute, "phase": "remate", "team": team,
                             "zone": "area", "lane": lane, "playerId": _pid(shooter),
                             "duel": _duel(shooter, ("finishing", "shooting"),
                                           gk, ("goalkeeping",)),
                             "text": _pick(_MISS_TXT, frng).format(p=sname)})
            continue

        on_target += 1
        att_rt.inc(sname, "shotsOnTarget")
        if rng.random() < p_goal_eff:                # ¡gol!
            goals += 1
            att_rt.goal(sname)
            # ── E16+C7 · CADENA DE GOL por habilidad (frng-only, calibración
            # intacta: el gol YA está decidido por el rng principal; aquí solo se
            # narra QUIÉN construyó la jugada Y QUIÉN defendió cada eslabón,
            # ponderando por atributos FDF). Cada eslabón lleva su `duel` y la
            # cadena completa se adjunta al entry del gol (`chain`). ────────────
            chain: list[dict] = []
            starter = _weighted_pick(
                [p for p in att_prof.xi if _pos(p) in ("DEF", "MED") and _name(p) != sname] or outfield,
                frng, ("tackling", "organization"))
            if starter is not None:
                loser = _weighted_pick(carriers, frng, ("passing", "organization"))
                d = _duel(starter, ("tackling", "organization"), loser, ("passing", "organization"))
                txt = _pick(_CHAIN_START_TXT, frng).format(p=_name(starter))
                chain.append({"step": "recuperacion", "lane": lane, "text": txt, **d})
                timeline.append({"minute": minute, "phase": "construccion", "team": team,
                                 "zone": "def", "lane": lane, "playerId": _pid(starter),
                                 "duel": d, "text": txt})
                att_rt.inc(_name(starter), "passes"); att_rt.inc(_name(starter), "passesCompleted")
            if frng.random() < 0.45:                 # eslabón opcional: el regate
                dribbler = _weighted_pick(
                    _attack_eligible([p for p in outfield if _name(p) != sname and (starter is None or _name(p) != _name(starter))]),
                    frng, ("dribbling", "unmarking"))
                if dribbler is not None:
                    beaten = _weighted_pick(stoppers, frng, ("tackling",))
                    d = _duel(dribbler, ("dribbling", "unmarking"), beaten, ("tackling",))
                    txt = _pick(_CHAIN_DRIBBLE_TXT, frng).format(p=_name(dribbler))
                    chain.append({"step": "regate", "lane": lane, "text": txt, **d})
                    timeline.append({"minute": minute, "phase": "progresion", "team": team,
                                     "zone": "med", "lane": lane, "playerId": _pid(dribbler),
                                     "duel": d, "text": txt})
            creator = _weighted_pick(
                _attack_eligible([p for p in att_prof.xi if _pos(p) in ("MED", "DEL") and _name(p) != sname]),
                frng, ("passing", "organization"))
            if creator is not None and frng.random() < 0.8:   # ~80% de goles asistidos
                att_rt.assist(_name(creator)); att_rt.inc(_name(creator), "keyPasses")
                marker = _weighted_pick(stoppers, frng, ("tackling", "organization"))
                d = _duel(creator, ("passing", "organization"), marker, ("tackling", "organization"))
                txt = _pick(_CHAIN_KEYPASS_TXT, frng).format(p=_name(creator))
                chain.append({"step": "pase_clave", "lane": lane, "text": txt, **d})
                timeline.append({"minute": minute, "phase": "progresion", "team": team,
                                 "zone": "med", "lane": lane, "playerId": _pid(creator),
                                 "duel": d, "text": txt})
            desc = _GOAL_TEMPLATES[frng.randrange(len(_GOAL_TEMPLATES))].format(p=sname)
            shot_duel = _duel(shooter, ("finishing", "shooting", "unmarking"), gk, ("goalkeeping",))
            chain.append({"step": "remate", "lane": lane, "text": desc, **shot_duel})
            events.append({"minute": minute, "type": "goal", "team": team,
                           "description": desc, "playerName": sname, "playerId": _pid(shooter)})
            tl_entry: dict = {"minute": minute, "phase": "gol", "team": team, "zone": "area",
                              "lane": lane, "playerId": _pid(shooter),
                              "duel": shot_duel, "chain": chain, "text": desc}
            # N3-2: exponer sinergyMultiplier en el timeline para que la UI lo muestre.
            if sinergy_active:
                tl_entry["sinergyMultiplier"] = TAG_SINERGY_MULTIPLIER
            timeline.append(tl_entry)
        else:                                        # parada del portero rival
            if gk_name:
                def_rt.inc(gk_name, "saves")
            timeline.append({"minute": minute, "phase": "parada", "team": team, "zone": "area",
                             "lane": lane, "playerId": _pid(gk) if gk is not None else None,
                             "duel": _duel(shooter, ("finishing", "shooting"), gk, ("goalkeeping",)),
                             "text": _pick(_SAVE_TXT, frng).format(g=gk_name or "El portero", p=sname)})
            if frng.random() < 0.45:
                events.append({"minute": minute, "type": "save", "team": other,
                               "description": "🧤 Paradón del portero", "playerName": gk_name,
                               "playerId": _pid(gk) if gk is not None else None})
    return goals, shots, on_target


# ─── MOTOR FDF 1d40 — resolución por fases (manual §1.2-1.3) ──────────────────
# Cada jugada: (1) tabla de inicio cre-des con modificadores de marcador y
# confianza; (2) tipo (campo/balón parado/penalti); (3) plantilla de jugada de la
# FORMACIÓN (20 jugadas posibles); (4) fases resueltas con 1d40 contra el valor de
# fase. La tirada PRINCIPAL (rng) decide inicio, fases y puerta (calibración); el
# rng DERIVADO (frng) elige jugada/jugadores/narración (cosmético).

_FDF_STEP_BY_KEYS = {
    "dribbling": "regate", "unmarking": "regate",
    "passing": "pase_clave", "organization": "pase_clave",
    "fouls": "pase_clave",
    "finishing": "remate", "shooting": "remate",
}


def _fdf_step(phase_idx: int, n_phases: int, keys: tuple[str, ...]) -> str:
    """Mapea una fase FDF a uno de los 4 eslabones del contrato (recuperacion|
    regate|pase_clave|remate) que el visor/GoalReplay entiende."""
    if phase_idx == 0:
        return "recuperacion"
    if phase_idx >= n_phases - 1:
        return "remate"
    return _FDF_STEP_BY_KEYS.get(keys[0], "pase_clave")


def _fdf_pool(xi: list[Any], pool: str, dpos: Optional[str] = None) -> list[Any]:
    """Jugadores que ocupan la fase: si la jugada pide una posición detallada
    (dpos) y hay un jugador con ESA posición, se prioriza (así el motor alinea por
    posición real); si no, por posición macro; con degradación al resto del campo."""
    if dpos:
        exact = [p for p in xi if _dpos(p) == dpos and not _chain_break(p)]
        if exact:
            return exact
    pri = [p for p in xi if _pos(p) == pool and not _chain_break(p)]
    if pri:
        return pri
    out = _attack_eligible([p for p in xi if _pos(p) != "POR"])
    return out or [p for p in xi if _pos(p) != "POR"] or xi


def _fdf_defender_line(xi: list[Any], line: str) -> list[Any]:
    pool = [p for p in xi if _pos(p) == line]
    if pool:
        return pool
    alt = "DEF" if line == "MED" else "MED"
    pool = [p for p in xi if _pos(p) == alt]
    return pool or [p for p in xi if _pos(p) != "POR"] or xi


def _run_jugada_fdf(att: _Profile, dfn: _Profile, team: str, minute: int,
                    own_goals: int, opp_goals: int,
                    rng: random.Random, frng: random.Random,
                    events: list[dict], timeline: list[dict],
                    att_rt: _Ratings, def_rt: _Ratings,
                    weather_acc: float, temp_pen: float,
                    zone_w: tuple[float, float, float],
                    def_reinf: Optional[dict]) -> dict:
    """Resuelve UNA jugada por fases (1d40). Devuelve {goal, shot, on_target}."""
    other = "away" if team == "home" else "home"
    t_label = "El equipo local" if team == "home" else "El visitante"
    o_label = "El visitante" if team == "home" else "El equipo local"

    # ── (1) Tabla de inicio: cre − des con modificadores (manual §1.2) ─────────
    conf_diff = (att.coach_confidence - dfn.coach_confidence) / 12.5
    cre_des = att.construccion - dfn.destruccion + FDF_CRE_DES_BIAS
    if team == "home":                       # empuje de localía sobre la creación
        cre_des += FDF_HOME_GATE
    p_inicio = _cre_des_prob(cre_des)
    gd = own_goals - opp_goals
    if gd > 0:                              # ganando → se penaliza la creación
        p_inicio *= max(0.1, 1.0 - 0.10 * gd)
    elif gd < 0:                            # perdiendo → se bonifica
        p_inicio *= 1.0 + 0.10 * (-gd)
    p_inicio *= 1.0 + _confianza_creacion(conf_diff)
    # Fatiga/clima atenúan ligeramente la creación (neutro = 1.0).
    fat_att = _fatigue_mult(att.stamina, att.rhythm, minute, temp_pen + att.fatigue_extra)
    p_inicio = _clamp01(p_inicio * (0.55 + 0.45 * fat_att))

    result = {"goal": False, "shot": False, "on_target": False}
    lane = _pick_zone(zone_w, frng)          # carril de ataque (attackZones manda §2.6)

    if rng.random() >= p_inicio:            # la jugada NO se lleva a cabo
        if frng.random() < 0.16:
            d = _pick(_fdf_defender_line(dfn.xi, "MED"), frng)
            def_rt.inc(_name(d), "interceptions" if frng.random() < 0.5 else "tackles")
            timeline.append({"minute": minute, "phase": "progresion", "team": team,
                             "zone": "med", "lane": lane, "playerId": _pid(d),
                             "duel": _duel(_pick(_fdf_pool(att.xi, "MED"), frng),
                                           ("organization", "passing"), d, ("tackling",)),
                             "text": _pick(_LOST_TXT, frng).format(t=t_label, o=o_label, d=_name(d))})
        return result

    # ── (2) Tipo de jugada (manual §1.3): campo / balón parado / penalti ──────
    k = rng.random()
    if k < FDF_KIND_PENALTY:
        kind = "penalty"
    elif k < FDF_KIND_PENALTY + FDF_KIND_SETPIECE:
        kind = "setpiece"
    else:
        kind = "field"

    # ── (3) Jugada REAL de la formación (catálogo del Excel, por carril) ──────
    playbook = fdf_playbook.build_playbook(att.formation)
    if kind == "field":
        candidates = fdf_playbook.field_jugadas(playbook, lane)
    else:
        candidates = fdf_playbook.setpiece_jugadas(playbook, kind)
    # Elección ponderada por el peso de la jugada (carácter de la formación).
    weights = [max(0.05, float(j.get("weight", 1.0))) for j in candidates]
    pick = frng.random() * sum(weights)
    jugada = candidates[-1]
    acc = 0.0
    for j, w in zip(candidates, weights):
        acc += w
        if pick <= acc:
            jugada = j
            break
    phases = jugada["phases"]
    n = len(phases)

    # bonif.def (refuerzo de zona del rival en ese carril) y bonif.ofe (táctica).
    reinf_pts = float(def_reinf.get(lane, 0) or 0) if def_reinf else 0.0
    bonif_def = FDF_REINFORCE_D40 * max(0.0, min(3.0, reinf_pts))
    bonif_ofe = 0.0 if kind == "penalty" else \
        FDF_OFE_BASELINE + max(0.0, att.construccion - FDF_OFE_NEUTRAL_ATT) * FDF_OFE_SCALE
    conf_base = _confianza_base(conf_diff)
    total_goals = own_goals + opp_goals
    base = FDF_BASE_CONST - gd * FDF_BASE_DIFF_K - total_goals * FDF_BASE_TOTAL_K + conf_base
    # Atributo de portería del duelo de remate (Reflejos en juego, Colocación en parado).
    gk_disp = ("goalkeeping",) if kind in ("setpiece", "penalty") else ("reflexes",)

    def _attacker_for(ph: dict) -> Any:
        return _weighted_pick(_fdf_pool(att.xi, ph["pool"], ph.get("dpos")), frng, (ph["key"],)) \
            or _pick(att.xi, frng)

    def _resolve_phase(j: int, ph: dict, attacker: Any) -> tuple[bool, dict, Any, str]:
        """Resuelve una fase con 1d40; devuelve (won, eslabón, defensor, línea)."""
        line = fdf_playbook.defender_line(j, n, kind)
        late = line in ("DEF", "POR")        # columna del valor de fase (3-5 vs 1-2)
        key = ph["key"]
        if line == "POR":
            gk_ab = ph.get("gk") or ("salidas" if kind in ("setpiece", "penalty") else "reflejos")
            defender = dfn.gk
            if defender is not None:
                def_val = _gk_reflejos(defender) if gk_ab == "reflejos" else _gk_salidas(defender)
                def_keys = ("reflexes",) if gk_ab == "reflejos" else ("goalkeeping",)
            else:                            # sin portero real: lo cubre un defensa
                defender = _pick(_fdf_defender_line(dfn.xi, "DEF"), frng)
                def_val = _attr(defender, "tackling")
                def_keys = ("tackling",)
            phase_ofe = -FDF_GK_EDGE
        else:
            defender = _pick(_fdf_defender_line(dfn.xi, line), frng)
            def_val = _attr(defender, "tackling")
            def_keys = ("tackling",)
            phase_ofe = bonif_ofe            # bonif.ofe ayuda a CREAR, no a finalizar
        vf = base + _vf_offset(_attr(attacker, key) - def_val, late)
        if kind == "penalty":
            vf = max(28, vf)
        upper = min(39, vf + phase_ofe)
        roll = rng.randint(1, 40)
        won = (roll > bonif_def) and (roll < upper)
        link = {"step": _fdf_step(j, n, (key,)), "lane": lane, "text": ph["label"],
                **_duel(attacker, (key,), defender, def_keys)}
        return won, link, defender, line

    gk = dfn.gk
    gk_name = _name(gk) if gk is not None else "El portero"

    # ── Penalti: 2 fases ante el portero (Colocación); siempre a puerta ───────
    if kind == "penalty":
        shooter = _attacker_for(phases[-1]); sname = _name(shooter)
        result["shot"] = True; result["on_target"] = True
        att_rt.inc(sname, "shots"); att_rt.inc(sname, "shotsOnTarget")
        att_rt.add_xg(sname, 0.76)
        pchain: list[dict] = []
        scored = True
        for j, ph in enumerate(phases):
            won, link, _, _ = _resolve_phase(j, ph, shooter)
            pchain.append(link)
            if not won:
                scored = False
                break
        if scored:
            result["goal"] = True; att_rt.goal(sname)
            desc = f"⚽ {sname} marca de penalti"
            events.append({"minute": minute, "type": "goal", "team": team,
                           "description": desc, "playerName": sname, "playerId": _pid(shooter)})
            timeline.append({"minute": minute, "phase": "gol", "team": team, "zone": "area",
                             "lane": lane, "playerId": _pid(shooter),
                             "duel": {"att": pchain[-1]["att"], "def": pchain[-1].get("def")},
                             "chain": pchain, "text": desc})
        else:
            if gk is not None:
                def_rt.inc(gk_name, "saves")
            timeline.append({"minute": minute, "phase": "parada", "team": team, "zone": "area",
                             "lane": lane, "playerId": _pid(gk) if gk is not None else None,
                             "duel": {"att": pchain[-1]["att"], "def": pchain[-1].get("def")},
                             "chain": pchain, "text": f"🧤 {gk_name} detiene el penalti de {sname}"})
        return result

    # ── (4) Fases de aproximación (todas menos la definición) ─────────────────
    chain: list[dict] = []
    creator = None
    failed_at: Optional[int] = None
    fail_line: Optional[str] = None
    for j in range(n - 1):
        ph = phases[j]
        attacker = _attacker_for(ph)
        won, link, defender, line = _resolve_phase(j, ph, attacker)
        chain.append(link)
        if link["step"] == "pase_clave" and creator is None:
            creator = attacker
        if ph["key"] in ("passing", "organization"):
            att_rt.inc(_name(attacker), "passes")
            if won:
                att_rt.inc(_name(attacker), "passesCompleted")
        if not won:
            failed_at = j
            fail_line = line
            if line != "POR":
                def_rt.inc(_name(defender), "tackles" if line == "DEF" else "interceptions")
            break

    # ── Cortada en aproximación: se pierde en medio/defensa (no hay remate) ───
    if failed_at is not None:
        if frng.random() < 0.35:
            link = chain[failed_at]
            d_def = link.get("def")
            timeline.append({"minute": minute, "phase": "progresion", "team": team,
                             "zone": "med" if fail_line == "MED" else "ataque",
                             "lane": lane, "playerId": (d_def or {}).get("playerId"),
                             "duel": {"att": link["att"], "def": link.get("def")},
                             "chain": list(chain),
                             "text": _pick(_LOST_TXT, frng).format(
                                 t=t_label, o=o_label, d=(d_def or {}).get("name", o_label))})
        return result

    # ── (5) Remate: la jugada llega a la definición ante el portero ───────────
    finish_ph = phases[n - 1]
    shooter = _attacker_for(finish_ph)
    sname = _name(shooter)
    result["shot"] = True
    att_rt.inc(sname, "shots")
    att_rt.add_xg(sname, _clamp01(0.08 + (_attr(shooter, "finishing") - dfn.gk_rating) / 200.0))

    # ¿A puerta? Precisión del tirador, atenuada por el clima (lluvia/nieve).
    p_on = _clamp01((FDF_ON_TARGET_BASE + (_attr(shooter, "shooting") - 50) / FDF_ON_TARGET_SCALE) * weather_acc)
    if rng.random() >= p_on:                 # remate fuera (no a puerta)
        shot_duel = _duel(shooter, (finish_ph["key"],), gk, gk_disp)
        chain.append({"step": "remate", "lane": lane, "text": finish_ph["label"], **shot_duel})
        timeline.append({"minute": minute, "phase": "remate", "team": team, "zone": "area",
                         "lane": lane, "playerId": _pid(shooter),
                         "duel": shot_duel, "chain": list(chain),
                         "text": _pick(_MISS_TXT, frng).format(p=sname)})
        return result

    result["on_target"] = True
    att_rt.inc(sname, "shotsOnTarget")
    won_finish, finish_link, _, _ = _resolve_phase(n - 1, finish_ph, shooter)
    chain.append(finish_link)

    if won_finish:                           # ¡GOL!
        result["goal"] = True
        att_rt.goal(sname)
        if creator is not None and _name(creator) != sname:
            att_rt.assist(_name(creator)); att_rt.inc(_name(creator), "keyPasses")
        desc = _GOAL_TEMPLATES[frng.randrange(len(_GOAL_TEMPLATES))].format(p=sname)
        events.append({"minute": minute, "type": "goal", "team": team,
                       "description": desc, "playerName": sname, "playerId": _pid(shooter)})
        timeline.append({"minute": minute, "phase": "gol", "team": team, "zone": "area",
                         "lane": lane, "playerId": _pid(shooter),
                         "duel": {"att": finish_link["att"], "def": finish_link.get("def")},
                         "chain": chain, "text": desc})
    else:                                    # parada del portero
        if gk is not None:
            def_rt.inc(gk_name, "saves")
        timeline.append({"minute": minute, "phase": "parada", "team": team, "zone": "area",
                         "lane": lane, "playerId": _pid(gk) if gk is not None else None,
                         "duel": {"att": finish_link["att"], "def": finish_link.get("def")},
                         "chain": chain, "text": _pick(_SAVE_TXT, frng).format(g=gk_name, p=sname)})
        if frng.random() < 0.45:
            events.append({"minute": minute, "type": "save", "team": other,
                           "description": "🧤 Paradón del portero", "playerName": gk_name,
                           "playerId": _pid(gk) if gk is not None else None})
    return result


def _resolve_match_fdf(home: _Profile, away: _Profile, home_plays: int, away_plays: int,
                       rng: random.Random, frng: random.Random,
                       events: list[dict], timeline: list[dict],
                       home_rt: _Ratings, away_rt: _Ratings,
                       sched_home: list[int], sched_away: list[int],
                       weather_acc: float, temp_pen: float,
                       h_zones: Optional[dict], a_zones: Optional[dict],
                       h_reinf: Optional[dict], a_reinf: Optional[dict],
                       h_lane_w: tuple[float, float, float],
                       a_lane_w: tuple[float, float, float],
                       start_hg: int = 0, start_ag: int = 0) -> tuple[int, int, int, int, int, int]:
    """Resuelve el partido por jugadas CRONOLÓGICAS (manual §1.1): los modificadores
    de marcador/confianza ven el resultado VIVO. Devuelve goles y tiros añadidos."""
    h_zone_w = _zone_weights(h_zones) if h_zones else h_lane_w
    a_zone_w = _zone_weights(a_zones) if a_zones else a_lane_w

    slots = ([(m, "home", i) for i, m in enumerate(sched_home)]
             + [(m, "away", i) for i, m in enumerate(sched_away)])
    slots.sort(key=lambda s: (s[0], 0 if s[1] == "home" else 1, s[2]))

    hg, ag = start_hg, start_ag
    h_shots = h_sot = a_shots = a_sot = 0
    for minute, team, _ in slots:
        if team == "home":
            res = _run_jugada_fdf(home, away, "home", minute, hg, ag, rng, frng,
                                  events, timeline, home_rt, away_rt, weather_acc,
                                  temp_pen, h_zone_w, a_reinf)
            h_shots += int(res["shot"]); h_sot += int(res["on_target"]); hg += int(res["goal"])
        else:
            res = _run_jugada_fdf(away, home, "away", minute, ag, hg, rng, frng,
                                  events, timeline, away_rt, home_rt, weather_acc,
                                  temp_pen, a_zone_w, h_reinf)
            a_shots += int(res["shot"]); a_sot += int(res["on_target"]); ag += int(res["goal"])
    return hg - start_hg, ag - start_ag, h_shots, h_sot, a_shots, a_sot


def _discipline(prof: _Profile, team: str, rng: random.Random, frng: random.Random,
                events: list[dict], timeline: list[dict], rt: _Ratings) -> tuple[int, int]:
    discipline_bias = (50.0 - prof.discipline) / 50.0
    fouls = int(_clamp(round(rng.randint(FOULS_MIN, FOULS_MAX) + discipline_bias * 3),
                       FOULS_MIN - 3, FOULS_MAX + 3))
    yellow_rate = _clamp(YELLOW_PER_FOUL + discipline_bias * 0.04, 0.08, 0.28)
    yellows = 0
    xi = prof.xi
    for _ in range(fouls):
        if rng.random() < yellow_rate:               # rng PRINCIPAL (calibración)
            yellows += 1
            culprit = _pick(xi, frng)
            name = _name(culprit)
            rt.add(name, -0.3)
            minute = _minute(frng)
            events.append({"minute": minute, "type": "yellow", "team": team,
                           "description": f"🟨 Amarilla a {name}", "playerName": name,
                           "playerId": _pid(culprit)})
            timeline.append({"minute": minute, "phase": "falta", "team": team, "zone": "med",
                             "playerId": _pid(culprit), "text": f"🟨 Amarilla a {name}."})
    return fouls, yellows


def _apply_conceded(prof: _Profile, conceded: int, rt: _Ratings) -> None:
    # El portero: los goles encajados/portería a cero los pondera _Ratings._rating
    # a partir de la estadística "conceded"; aquí solo la registramos.
    if prof.gk is not None:
        rt.inc(_name(prof.gk), "conceded", conceded)
    for p in prof.xi:
        if _pos(p) == "DEF":
            rt.add(_name(p), 0.4 if conceded == 0 else -0.12 * conceded)


def _penalty_shootout(att_home: _Profile, att_away: _Profile,
                      rng: random.Random) -> tuple[int, int]:
    """Tanda de penaltis decisiva. Best-of-5 + muerte súbita. Determinista."""
    def p_score(att: _Profile, dfn: _Profile) -> float:
        adv = math.tanh((att.finish - dfn.gk_rating) / 40.0)
        taker_bonus = (att.penalty_skill - 50.0) / 50.0 * 0.025
        return _clamp01(0.75 + 0.10 * adv + taker_bonus)   # conversión ~65-85%

    ph, pa = p_score(att_home, att_away), p_score(att_away, att_home)
    h = sum(1 for _ in range(5) if rng.random() < ph)
    a = sum(1 for _ in range(5) if rng.random() < pa)
    rounds = 0
    while h == a and rounds < 50:            # muerte súbita (tope de seguridad)
        h += int(rng.random() < ph)
        a += int(rng.random() < pa)
        rounds += 1
    if h == a:                               # desempate final improbable
        h += 1 if rng.random() < 0.5 else 0
        a += 0 if h > a else 1
    return h, a


def _best_replacement(bench: list[Any], position: str, taken: list[Any]) -> Optional[Any]:
    """Mejor suplente disponible para una posición; preferimos misma posición."""
    taken_ids = {id(p) for p in taken}
    avail = [p for p in bench if id(p) not in taken_ids]
    if not avail:
        return None
    same = [p for p in avail if _pos(p) == position]
    return max(same if same else avail, key=_overall)


def _score_at(events: list[dict], minute: int) -> tuple[int, int]:
    """Marcador (home, away) contando los goles hasta el minuto dado inclusive."""
    hg = ag = 0
    for e in events:
        if e.get("type") == "goal" and e.get("minute", 0) <= minute:
            if e.get("team") == "home":
                hg += 1
            else:
                ag += 1
    return hg, ag


def _programmed_subs(prof: _Profile, team: str, rules: Any, events: list[dict],
                     final_min: int) -> tuple[list[dict], list[Any], set[str]]:
    """R4 · Ejecuta las reglas de Tactic.subsLogic ({fromMin,toMin,condition,outId,inId}).

    Determinista (sin rng): se ejecuta en el primer minuto de la ventana en que la
    condición de marcador se cumple. Devuelve (subs, suplentes usados, nombres
    sustituidos) para que los cambios automáticos respeten la PRIORIDAD de estas
    reglas. Sin reglas → ([], [], set()) y el partido es bit-a-bit idéntico.
    """
    subs: list[dict] = []
    taken: list[Any] = []
    subbed_out: set[str] = set()
    if not isinstance(rules, list):
        return subs, taken, subbed_out

    def _by_id(pool: list[Any], raw: Any) -> Optional[Any]:
        wanted = str(raw) if raw is not None else None
        if not wanted:
            return None
        for p in pool:
            if _pid(p) == wanted:
                return p
        return None

    for rule in rules[:MAX_SUBS]:
        if not isinstance(rule, dict) or len(subs) >= MAX_SUBS:
            continue
        try:
            lo = int(rule.get("fromMin", 0))
            hi = int(rule.get("toMin", 90))
        except (TypeError, ValueError):
            continue
        lo = max(1, min(final_min, lo))
        hi = max(lo, min(final_min, int(hi) if hi else lo))
        cond = str(rule.get("condition", "any") or "any")

        out_p = _by_id(prof.xi, rule.get("outId"))
        in_p = _by_id(prof.bench, rule.get("inId"))
        if out_p is None or in_p is None:
            continue
        if _name(out_p) in subbed_out or in_p in taken:
            continue

        minute = None
        for m in range(lo, hi + 1):
            hg, ag = _score_at(events, m)
            own, opp = (hg, ag) if team == "home" else (ag, hg)
            ok = (cond == "any" or
                  (cond == "winning" and own > opp) or
                  (cond == "drawing" and own == opp) or
                  (cond == "losing" and own < opp))
            if ok:
                minute = m
                break
        if minute is None:
            continue

        taken.append(in_p)
        subbed_out.add(_name(out_p))
        subs.append({"team": team, "minute": minute,
                     "out": {"playerId": _pid(out_p), "playerName": _name(out_p)},
                     "in": {"playerId": _pid(in_p), "playerName": _name(in_p)},
                     "reason": "tactic"})
    return subs, taken, subbed_out


def _injuries_and_subs(prof: _Profile, team: str, irng: random.Random,
                       pre_taken: Optional[list[Any]] = None,
                       pre_subbed_out: Optional[set[str]] = None) -> tuple[list[dict], list[dict]]:
    """Genera lesiones (tasa baja) y sustituciones (≤3). rng DERIVADO: no toca el juego.

    pre_taken/pre_subbed_out: estado dejado por las sustituciones PROGRAMADAS (R4);
    los cambios automáticos solo disponen de los slots restantes.
    """
    injuries: list[dict] = []
    subs: list[dict] = []
    taken: list[Any] = list(pre_taken) if pre_taken else []          # suplentes ya usados
    subbed_out: set[str] = set(pre_subbed_out) if pre_subbed_out else set()   # titulares ya sustituidos (por nombre)
    used = len(taken)

    # N3-3 · Desgaste crónico: la tasa de lesión escala con el número de jugadores
    # crónicamente fatigados en el XI. Sin desgaste → mismo resultado bit a bit.
    cf_count = prof.chronic_fatigued_count
    if cf_count > 0:
        cf_boost = (CHRONIC_FATIGUE_PARAMS["injury_rate_mult"] - 1.0) * min(1.0, cf_count / 3.0)
        effective_injury_rate = min(0.40, INJURY_RATE_PER_TEAM * (1.0 + cf_boost))
    else:
        effective_injury_rate = INJURY_RATE_PER_TEAM

    # 1) Lesión en partido
    if irng.random() < effective_injury_rate:
        victim = irng.choice(prof.xi)
        r = irng.random()
        if r < 0.60:
            severity, matches_out = "leve", 1
        elif r < 0.90:
            severity, matches_out = "media", irng.randint(2, 4)
        else:
            severity, matches_out = "grave", irng.randint(5, 10)
        minute = _minute(irng)
        injuries.append({"playerId": _pid(victim), "playerName": _name(victim),
                         "team": team, "minute": minute,
                         "severity": severity, "matchesOut": matches_out})
        rep = _best_replacement(prof.bench, _pos(victim), taken)
        if rep is not None and used < MAX_SUBS and _name(victim) not in subbed_out:
            taken.append(rep); used += 1
            subbed_out.add(_name(victim))
            subs.append({"team": team, "minute": minute,
                         "out": {"playerId": _pid(victim), "playerName": _name(victim)},
                         "in": {"playerId": _pid(rep), "playerName": _name(rep)},
                         "reason": "injury"})

    # 2) Cambios por fitness en el tramo final
    tired = sorted([p for p in prof.xi if _grano(p, "muscularFitness") < FITNESS_SUB_THRESHOLD],
                   key=lambda p: _grano(p, "muscularFitness"))
    for p in tired:
        if used >= MAX_SUBS:
            break
        if _name(p) in subbed_out:
            continue
        rep = _best_replacement(prof.bench, _pos(p), taken)
        if rep is None:
            break
        if irng.random() < 0.5:
            taken.append(rep); used += 1
            subbed_out.add(_name(p))
            subs.append({"team": team, "minute": irng.randint(60, 85),
                         "out": {"playerId": _pid(p), "playerName": _name(p)},
                         "in": {"playerId": _pid(rep), "playerName": _name(rep)},
                         "reason": "fitness"})

    subs.sort(key=lambda s: s["minute"])
    return injuries, subs


def _opt(t: Any, key: str) -> Any:
    """Campo opcional de una táctica (dict u objeto); None si no existe."""
    return t.get(key, None) if isinstance(t, dict) else getattr(t, key, None)


TACTIC_PLAN_LIMIT = 8
TACTIC_NUMERIC_FIELDS = ("construction", "destruction", "pressing", "tempo", "width", "mentality")
TACTIC_TEXT_FIELDS = ("formation", "marking", "offensiveStyle", "defensiveStyle",
                      "penaltyTaker", "freeKickTaker", "cornerTaker")
TACTIC_OBJECT_FIELDS = ("attackZones", "defenseReinforcement", "profileBonus")
TACTIC_CHANGE_FIELDS = TACTIC_NUMERIC_FIELDS + TACTIC_TEXT_FIELDS + TACTIC_OBJECT_FIELDS


def _tactic_state(tactic: Any) -> dict[str, Any]:
    """Copia mutable y mínima de una táctica para aplicar reglas condicionales."""
    state: dict[str, Any] = {}
    for key in ("formation", *TACTIC_CHANGE_FIELDS, "subsLogic"):
        value = _opt(tactic, key)
        if value is not None:
            state[key] = value
    state.setdefault("formation", "4-4-2")
    state.setdefault("construction", 50)
    state.setdefault("destruction", 50)
    return state


def _clamp_tactic_value(value: Any) -> float:
    try:
        raw = float(value)
    except (TypeError, ValueError):
        raw = 50.0
    if raw != raw:  # NaN
        raw = 50.0
    return max(0.0, min(100.0, raw))


def _rule_changes(rule: dict[str, Any]) -> dict[str, Any]:
    """Extrae cambios tácticos de una regla de subsLogic.

    Contrato X5: cada regla puede mantener el formato R4 de sustitución y añadir
    `changes`, `tactic` o `set` con palancas; también se aceptan las palancas en
    la raíz por compatibilidad con UIs simples.
    """
    raw: dict[str, Any] = {}
    for container in ("changes", "tactic", "set"):
        value = rule.get(container)
        if isinstance(value, dict):
            raw.update(value)
    for key in TACTIC_CHANGE_FIELDS:
        if key in rule:
            raw[key] = rule[key]

    changes: dict[str, Any] = {}
    for key in TACTIC_NUMERIC_FIELDS:
        if key in raw:
            changes[key] = _clamp_tactic_value(raw[key])
    for key in TACTIC_TEXT_FIELDS:
        if key in raw and raw[key] is not None:
            value = str(raw[key])[:64]
            if key == "marking" and value == "man":
                value = "individual"
            changes[key] = value
    for key in TACTIC_OBJECT_FIELDS:
        if isinstance(raw.get(key), dict):
            changes[key] = raw[key]
    return changes


def _tactic_rules(rules: Any, team: str) -> list[dict[str, Any]]:
    if not isinstance(rules, list):
        return []
    out: list[dict[str, Any]] = []
    for idx, rule in enumerate(rules[:TACTIC_PLAN_LIMIT]):
        if not isinstance(rule, dict):
            continue
        changes = _rule_changes(rule)
        if not changes:
            continue
        try:
            minute = int(rule.get("fromMin", 0))
            to_min = int(rule.get("toMin", minute))
        except (TypeError, ValueError):
            continue
        out.append({
            "team": team,
            "index": idx,
            "minute": max(1, minute),
            "toMin": max(1, to_min),
            "condition": str(rule.get("condition", "any") or "any"),
            "changes": changes,
        })
    return out


def _score_condition_ok(condition: str, team: str, events: list[dict], minute: int) -> bool:
    hg, ag = _score_at(events, minute)
    own, opp = (hg, ag) if team == "home" else (ag, hg)
    cond = condition.lower()
    return (cond in ("any", "always", "siempre") or
            (cond == "winning" and own > opp) or
            (cond == "drawing" and own == opp) or
            (cond == "losing" and own < opp))


def _apply_tactic_changes(state: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
    previous = {k: state.get(k) for k in changes}
    state.update(changes)
    return previous


def _build_match_profiles(home_players: list[Any], away_players: list[Any],
                          home_tac: Any, away_tac: Any,
                          home_bonus: Optional[dict] = None) -> tuple[_Profile, _Profile]:
    home = _build_profile(home_players, home_tac, True, home_bonus)
    away = _build_profile(away_players, away_tac, False)

    h_con, a_des = _style_bonus(_opt(home_tac, "offensiveStyle"), _opt(away_tac, "defensiveStyle"))
    a_con, h_des = _style_bonus(_opt(away_tac, "offensiveStyle"), _opt(home_tac, "defensiveStyle"))
    home.attack += STYLE_SCALE * h_con
    home.defense += STYLE_SCALE * h_des
    away.attack += STYLE_SCALE * a_con
    away.defense += STYLE_SCALE * a_des
    home.midfield += STYLE_SCALE * STYLE_MIDFIELD_FACTOR * (h_con - a_con)
    away.midfield += STYLE_SCALE * STYLE_MIDFIELD_FACTOR * (a_con - h_con)

    for prof, tac in ((home, home_tac), (away, away_tac)):
        pb = _opt(tac, "profileBonus") or {}
        if pb:
            cap = lambda v: max(-6.0, min(6.0, float(v or 0)))
            prof.attack += cap(pb.get("attack", 0) if isinstance(pb, dict) else getattr(pb, "attack", 0))
            prof.defense += cap(pb.get("defense", 0) if isinstance(pb, dict) else getattr(pb, "defense", 0))
            prof.midfield += cap(pb.get("midfield", 0) if isinstance(pb, dict) else getattr(pb, "midfield", 0))
    # FDF: construcción/destrucción siguen a attack/defense YA con estilos y
    # profileBonus aplicados (si no, la tabla de inicio ignoraría §2.9/WT3).
    for prof in (home, away):
        prof.construccion = prof.attack
        prof.destruccion = prof.defense
    return home, away


def _segment_play_count(prof: _Profile, possession: int, lo: int, hi: int,
                        plays_base: int = PLAYS_PER_TEAM) -> int:
    if hi < lo:
        return 0
    duration = hi - lo + 1
    raw = plays_base * (duration / 90.0) * possession / 50.0 * prof.plays_mult
    return min(MAX_PLAYS_PER_TEAM, max(0, round(raw)))


def simulate(home_team: Any, away_team: Any, seed: Optional[int] = None,
             knockout: bool = False, weatherCondition: str = "soleado",
             temperature: float = 20.0, attendancePct: Optional[float] = None,
             homeStimulated: bool = False, engine: str = DEFAULT_ENGINE) -> dict:
    """Simula un partido a partir de plantillas por jugador.

    home_team / away_team: objeto o dict con `players` (lista) y `tactic`.
    knockout: si True y hay empate a los 90', se juega prórroga (2x15') y, si
              persiste, tanda de penaltis — devolviendo SIEMPRE un ganador.
    weatherCondition/temperature: clima del encuentro. Neutro = 'soleado'/20º
              (deja el partido idéntico al modo sin clima). Lluvia/nieve restan
              precisión; calor/frío extremos aceleran la fatiga.
    engine: "fdf" (1d40 por fases, manual §1.3, por defecto) | "legacy" (embudo
            tanh probabilístico, A/B y fallback). Determinista por semilla en ambos.
    Devuelve un dict compatible con SimulationResult (incluye ratings y MOTM).
    """
    engine = "legacy" if str(engine).lower() == "legacy" else "fdf"
    # AUDIT-2026 §8 P3: el fallback sin semilla es NO determinista a propósito,
    # pero el backend debe enviar SIEMPRE seed — avisamos para detectar callers
    # que rompen la promesa de auditoría por semilla.
    if seed is None:
        _log.warning("simulate() sin seed: resultado NO reproducible (el backend debería enviar siempre semilla).")
    rng = random.Random(seed)
    weather_acc, temp_pen = _weather_factors(weatherCondition, temperature)

    def _players(t: Any) -> list[Any]:
        return (t.get("players") if isinstance(t, dict) else getattr(t, "players", [])) or []

    def _tactic(t: Any) -> Any:
        return (t.get("tactic") if isinstance(t, dict) else getattr(t, "tactic", None)) or Tactic()

    home_tac, away_tac = _tactic(home_team), _tactic(away_team)

    # Bonus por asistencia/estimulados — solo el LOCAL (manual §2.10). None ⇒ neutro.
    home_bonus = _attendance_bonus(attendancePct, homeStimulated)
    home, away = _build_match_profiles(
        _players(home_team), _players(away_team), home_tac, away_tac, home_bonus
    )

    # Zonas FDF (manual §2.6): carriles de ataque propios vs refuerzos del rival.
    h_zones, h_reinf = _opt(home_tac, "attackZones"), _opt(home_tac, "defenseReinforcement")
    a_zones, a_reinf = _opt(away_tac, "attackZones"), _opt(away_tac, "defenseReinforcement")
    # C7: pesos de carril por equipo (attackZones > formación+width).
    h_lane_w, a_lane_w = _lane_weights(home_tac), _lane_weights(away_tac)

    home_rt = _Ratings(home.xi)
    away_rt = _Ratings(away.xi)

    total_mid = (home.midfield + away.midfield) or 1.0
    home_poss = int(round(_clamp((home.midfield / total_mid) * 100, 30, 70)))
    away_poss = 100 - home_poss
    # Presupuesto de jugadas/equipo: 40 en FDF (20/parte, manual §1.1) vs 30 legacy.
    plays_base = FDF_PLAYS_PER_TEAM if engine == "fdf" else PLAYS_PER_TEAM
    # AUDIT-2026 §8 P0: min/max acotan el bucle de jugadas pase lo que pase.
    home_plays = min(MAX_PLAYS_PER_TEAM, max(1, round(plays_base * home_poss / 50 * home.plays_mult)))
    away_plays = min(MAX_PLAYS_PER_TEAM, max(1, round(plays_base * away_poss / 50 * away.plays_mult)))

    # rng DERIVADO para todo lo narrable (tirador, pases, minutos, texto): no
    # altera el marcador, así que la calibración depende solo del rng principal.
    frng = random.Random(None if seed is None else (seed ^ 0x1234ABCD) & 0xFFFFFFFFFFFF)

    def _schedule(n: int, lo: int = 1, hi: int = 90) -> list[int]:
        return sorted(min(hi, max(lo, _minute(frng))) if hi == 90 else frng.randint(lo, hi)
                      for _ in range(n))

    def _resolve_both(h: _Profile, a: _Profile, h_plays: int, a_plays: int,
                      sched_h: list[int], sched_a: list[int],
                      hz: Optional[dict], az: Optional[dict],
                      hr: Optional[dict], ar: Optional[dict],
                      hlw: tuple[float, float, float], alw: tuple[float, float, float],
                      start_hg: int = 0, start_ag: int = 0) -> tuple[int, int, int, int, int, int]:
        """Resuelve ambos equipos con el motor activo. FDF cronológico (marcador
        vivo); legacy por lotes (home y luego away). Devuelve (hg, ag, hs, hsot, as, asot)."""
        if engine == "fdf":
            return _resolve_match_fdf(h, a, h_plays, a_plays, rng, frng, events, timeline,
                                      home_rt, away_rt, sched_h, sched_a, weather_acc, temp_pen,
                                      hz, az, hr, ar, hlw, alw, start_hg, start_ag)
        rhg, rhs, rhsot = _resolve(h, a, h_plays, "home", rng, frng, events, timeline,
                                   home_rt, away_rt, sched_h, weather_acc, temp_pen,
                                   att_zones=hz, def_reinf=ar, lane_weights=hlw)
        rag, ras, rasot = _resolve(a, h, a_plays, "away", rng, frng, events, timeline,
                                   away_rt, home_rt, sched_a, weather_acc, temp_pen,
                                   att_zones=az, def_reinf=hr, lane_weights=alw)
        return rhg, rag, rhs, rhsot, ras, rasot

    events: list[dict] = []
    timeline: list[dict] = []
    _wicon = {"soleado": "☀️", "nublado": "☁️", "lluvia": "🌧️", "nieve": "❄️",
              "calor": "🔥", "frio": "🥶"}.get(str(weatherCondition or "soleado").lower(), "☀️")
    timeline.append({"minute": 0, "phase": "saque", "team": "home", "zone": "med",
                     "playerId": None,
                     "text": f"🏟️ Comienza el partido. {_wicon} {weatherCondition}, {int(temperature)}º."})

    tactical_changes: list[dict] = []
    plan_rules = sorted(
        _tactic_rules(_opt(home_tac, "subsLogic"), "home") +
        _tactic_rules(_opt(away_tac, "subsLogic"), "away"),
        key=lambda r: (r["minute"], r["team"], r["index"]),
    )

    # La roja se sortea antes de resolver el partido para que la inferioridad
    # afecte al perfil. El impacto se pondera por los minutos restantes.
    h_reds = a_reds = 0
    home_red_minute: Optional[int] = None
    away_red_minute: Optional[int] = None
    for team, prof, rt in (("home", home, home_rt), ("away", away, away_rt)):
        if rng.random() < RED_PER_TEAM:
            culprit = _pick(prof.xi, frng)
            name = _name(culprit)
            minute = frng.randint(20, 90)
            rt.add(name, -1.2)
            _apply_red_card_penalty(prof, minute)
            events.append({"minute": minute, "type": "red", "team": team,
                           "description": f"🟥 Expulsado {name}", "playerName": name,
                           "playerId": _pid(culprit)})
            timeline.append({"minute": minute, "phase": "falta", "team": team, "zone": "med",
                             "playerId": _pid(culprit), "text": f"🟥 Expulsado {name}."})
            if team == "home":
                h_reds = 1
                home_red_minute = minute
            else:
                a_reds = 1
                away_red_minute = minute

    if plan_rules:
        # X5 · Plan condicional: solo esta rama resegmenta el partido. El camino
        # sin reglas tácticas queda bit a bit igual que antes.
        home_players = _players(home_team)
        away_players = _players(away_team)
        home_state = _tactic_state(home_tac)
        away_state = _tactic_state(away_tac)
        hg = ag = h_shots = h_sot = a_shots = a_sot = 0
        possession_weight = 0
        possession_minutes = 0

        def _run_segment(lo: int, hi: int) -> None:
            nonlocal home, away, hg, ag, h_shots, h_sot, a_shots, a_sot
            nonlocal h_zones, h_reinf, a_zones, a_reinf, h_lane_w, a_lane_w
            nonlocal home_poss, away_poss, possession_weight, possession_minutes
            if hi < lo:
                return

            home, away = _build_match_profiles(home_players, away_players, home_state, away_state, home_bonus)
            if home_red_minute is not None:
                _apply_red_card_penalty(home, home_red_minute)
            if away_red_minute is not None:
                _apply_red_card_penalty(away, away_red_minute)
            h_zones, h_reinf = _opt(home_state, "attackZones"), _opt(home_state, "defenseReinforcement")
            a_zones, a_reinf = _opt(away_state, "attackZones"), _opt(away_state, "defenseReinforcement")
            h_lane_w, a_lane_w = _lane_weights(home_state), _lane_weights(away_state)

            total_mid_seg = (home.midfield + away.midfield) or 1.0
            home_poss = int(round(_clamp((home.midfield / total_mid_seg) * 100, 30, 70)))
            away_poss = 100 - home_poss
            duration = hi - lo + 1
            possession_weight += home_poss * duration
            possession_minutes += duration

            h_segment_plays = _segment_play_count(home, home_poss, lo, hi, plays_base)
            a_segment_plays = _segment_play_count(away, away_poss, lo, hi, plays_base)
            rhg, rag, rhs, rhsot, ras, rasot = _resolve_both(
                home, away, h_segment_plays, a_segment_plays,
                _schedule(h_segment_plays, lo, hi), _schedule(a_segment_plays, lo, hi),
                h_zones, a_zones, h_reinf, a_reinf, h_lane_w, a_lane_w,
                start_hg=hg, start_ag=ag,
            )
            hg += rhg; h_shots += rhs; h_sot += rhsot
            ag += rag; a_shots += ras; a_sot += rasot

        cursor = 1
        for rule in plan_rules:
            minute = max(cursor, min(90, int(rule["minute"])))
            _run_segment(cursor, minute - 1)
            if _score_condition_ok(rule["condition"], rule["team"], events, minute):
                state = home_state if rule["team"] == "home" else away_state
                previous = _apply_tactic_changes(state, rule["changes"])
                tactical_changes.append({
                    "team": rule["team"],
                    "minute": minute,
                    "condition": rule["condition"],
                    "changes": rule["changes"],
                    "previous": previous,
                })
                changed = ", ".join(f"{k}={v}" for k, v in rule["changes"].items())
                timeline.append({"minute": minute, "phase": "ajuste_tactico",
                                 "team": rule["team"], "zone": "med", "playerId": None,
                                 "text": f"📋 Ajuste táctico: {changed}."})
            cursor = minute
        _run_segment(cursor, 90)
        if possession_minutes:
            home_poss = int(round(possession_weight / possession_minutes))
            away_poss = 100 - home_poss
    else:
        hg, ag, h_shots, h_sot, a_shots, a_sot = _resolve_both(
            home, away, home_plays, away_plays, _schedule(home_plays), _schedule(away_plays),
            h_zones, a_zones, h_reinf, a_reinf, h_lane_w, a_lane_w)

    h_fouls, h_yellows = _discipline(home, "home", rng, frng, events, timeline, home_rt)
    a_fouls, a_yellows = _discipline(away, "away", rng, frng, events, timeline, away_rt)

    # ─── Eliminatoria: prórroga + penaltis si sigue el empate ─────────────────
    decided_by = "regular"
    home_pens = away_pens = 0
    if knockout and hg == ag:
        decided_by = "extra_time"
        et_home_plays = max(1, round(home_plays / 3))   # 30' ≈ 1/3 de 90'
        et_away_plays = max(1, round(away_plays / 3))
        timeline.append({"minute": 90, "phase": "saque", "team": "home", "zone": "med",
                         "playerId": None, "text": "⏱️ Empate: se va a la prórroga."})
        ehg, eag, ehs, ehsot, eas, easot = _resolve_both(
            home, away, et_home_plays, et_away_plays,
            sorted(frng.randint(91, 120) for _ in range(et_home_plays)),
            sorted(frng.randint(91, 120) for _ in range(et_away_plays)),
            h_zones, a_zones, h_reinf, a_reinf, h_lane_w, a_lane_w,
            start_hg=hg, start_ag=ag)
        hg += ehg; ag += eag
        h_shots += ehs; h_sot += ehsot
        a_shots += eas; a_sot += easot
        if hg == ag:
            decided_by = "penalties"
            home_pens, away_pens = _penalty_shootout(home, away, rng)
            timeline.append({"minute": 120, "phase": "remate", "team": "home", "zone": "area",
                             "playerId": None,
                             "text": f"🥅 Tanda de penaltis: {home_pens}-{away_pens}."})

    # Ganador (None solo si NO es eliminatoria y hay empate).
    if hg > ag or (decided_by == "penalties" and home_pens > away_pens):
        winner_side: Optional[str] = "home"
    elif ag > hg or (decided_by == "penalties" and away_pens > home_pens):
        winner_side = "away"
    else:
        winner_side = None

    # Notas por resultado (portería/defensa según goles encajados, y moral del equipo).
    _apply_conceded(home, ag, home_rt)
    _apply_conceded(away, hg, away_rt)
    if winner_side is not None:
        winner, loser = (home_rt, away_rt) if winner_side == "home" else (away_rt, home_rt)
        for p in winner.xi:
            winner.add(_name(p), 0.3)
        for p in loser.xi:
            loser.add(_name(p), -0.2)

    events.sort(key=lambda e: e["minute"])
    final_min = 120 if decided_by != "regular" else 90
    timeline.append({"minute": final_min, "phase": "final", "team": "home", "zone": "med",
                     "playerId": None, "text": f"🔚 Final del partido: {hg}-{ag}."})
    timeline.sort(key=lambda e: (e["minute"], 0 if e["phase"] == "saque" else 1))

    home_stats = {"possession": home_poss, "shots": h_shots, "shotsOnTarget": h_sot,
                  "corners": _corner_count(h_shots, h_sot, rng.random()), "fouls": h_fouls,
                  "yellowCards": h_yellows, "redCards": h_reds}
    away_stats = {"possession": away_poss, "shots": a_shots, "shotsOnTarget": a_sot,
                  "corners": _corner_count(a_shots, a_sot, rng.random()), "fouls": a_fouls,
                  "yellowCards": a_yellows, "redCards": a_reds}

    home_ratings = home_rt.to_list()
    away_ratings = away_rt.to_list()

    # MOTM = mejor nota; desempate por goles.
    pool = [(r["rating"], r["goals"], r["name"]) for r in home_ratings + away_ratings]
    motm = max(pool, key=lambda t: (t[0], t[1]))[2] if pool else "Desconocido"

    # R4 · Sustituciones PROGRAMADAS (Tactic.subsLogic) — deterministas, con
    # prioridad sobre los cambios automáticos. Sin reglas → neutro absoluto.
    h_prog, h_taken, h_out = _programmed_subs(home, "home", _opt(home_tac, "subsLogic"),
                                              events, final_min)
    a_prog, a_taken, a_out = _programmed_subs(away, "away", _opt(away_tac, "subsLogic"),
                                              events, final_min)
    for s in h_prog + a_prog:
        timeline.append({"minute": s["minute"], "phase": "cambio", "team": s["team"],
                         "zone": "med", "playerId": s["in"]["playerId"],
                         "text": f"🔄 Cambio: sale {s['out']['playerName']}, entra {s['in']['playerName']}."})

    # Lesiones y cambios — rng DERIVADO (no perturba el flujo del partido).
    inj_seed = None if seed is None else (seed ^ 0x5DEECE66D) & 0xFFFFFFFFFFFF
    irng = random.Random(inj_seed)
    h_inj, h_subs = _injuries_and_subs(home, "home", irng, h_taken, h_out)
    a_inj, a_subs = _injuries_and_subs(away, "away", irng, a_taken, a_out)
    injuries = h_inj + a_inj
    substitutions = sorted(h_prog + a_prog + h_subs + a_subs, key=lambda s: s["minute"])

    # R4 · Minutos jugados reflejados en los ratings: el que sale juega hasta su
    # minuto; el que entra aparece en ratings con los minutos restantes.
    for team_subs, ratings, prof in ((  [s for s in substitutions if s["team"] == "home"], home_ratings, home),
                                     (  [s for s in substitutions if s["team"] == "away"], away_ratings, away)):
        for r in ratings:
            r["minutes"] = final_min
        for s in team_subs:
            for r in ratings:
                same_id = s["out"]["playerId"] is not None and r.get("playerId") == s["out"]["playerId"]
                if same_id or (s["out"]["playerId"] is None and r["name"] == s["out"]["playerName"]):
                    r["minutes"] = min(r.get("minutes", final_min), int(s["minute"]))
                    break
            entering = next((p for p in prof.bench if _pid(p) == s["in"]["playerId"]
                             or (_pid(p) is None and _name(p) == s["in"]["playerName"])), None)
            if entering is not None and not any(r.get("playerId") == s["in"]["playerId"] and s["in"]["playerId"] is not None
                                                for r in ratings):
                ratings.append({"name": _name(entering), "playerId": _pid(entering),
                                "rating": 6.0, "position": _pos(entering),
                                "goals": 0, "assists": 0, "shots": 0, "shotsOnTarget": 0,
                                "passes": 0, "passesCompleted": 0, "passAccuracy": 0.0,
                                "tackles": 0, "interceptions": 0, "keyPasses": 0,
                                "xg": 0.0, "minutes": max(0, final_min - int(s["minute"]))})
    timeline.sort(key=lambda e: (e["minute"], 0 if e["phase"] == "saque" else 1))

    return {
        "homeGoals": hg, "awayGoals": ag,
        "homeStats": home_stats, "awayStats": away_stats,
        "events": events, "motm": motm,
        "homeRatings": home_ratings, "awayRatings": away_ratings,
        "timeline": timeline,
        # Eliminatoria (valores por defecto en liga: contrato intacto).
        "knockout": knockout, "decidedBy": decided_by, "winner": winner_side,
        "homePenalties": home_pens, "awayPenalties": away_pens,
        # Lesiones y cambios (arrays vacíos si no pasa nada: aditivo).
        "injuries": injuries, "substitutions": substitutions,
        "tacticalChanges": tactical_changes,
    }
