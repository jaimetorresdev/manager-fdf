# ─── Modelos del contrato HTTP (Pydantic v2) ──────────────────────────────────
# Contrato v3: el backend envía las PLANTILLAS por jugador (atributos FDF), no
# medias. La respuesta añade notas 0-10 por jugador. Sigue siendo drop-in: el
# backend Node ya tiene los atributos en su modelo Player.

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator

# AUDIT-2026 §8: los modelos de entrada ACOTAN sus rangos (ge/le). El P0 real era
# TacticInput: tempo/mentality sin límites alimentaban plays_mult y el bucle de
# jugadas (tempo=1e9 → ~252M jugadas por equipo). Los atributos de jugador se
# CLAMPAN además con un validador previo (datos legacy fuera de rango no deben
# tirar el partido entero al fallback TS por un 422).

_CLAMPABLE_PLAYER_FIELDS = (
    "passing", "tackling", "shooting", "organization", "unmarking", "finishing",
    "dribbling", "fouls", "goalkeeping", "reflexes", "fitness", "morale", "experience",
    "muscularFitness", "mentalSharpness", "matchRhythm",
)


def _clamp_0_100(v: object) -> object:
    if v is None or isinstance(v, bool):
        return v
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return v
    if f != f:  # NaN
        return 50.0
    return max(0.0, min(100.0, f))


class PlayerInput(BaseModel):
    name: str = Field(default="Jugador", max_length=120)
    id: Optional[str] = Field(default=None, max_length=32)  # id en la BD del backend
    position: str = Field(default="MED", max_length=30)      # POR | DEF | MED | DEL
    # Posición detallada (15 códigos); el motor FDF alinea por ella si viene.
    detailedPosition: Optional[str] = Field(default=None, max_length=8)
    # Atributos FDF (0-99; contrato acotado a 0-100)
    passing: float = Field(default=50, ge=0, le=100)
    tackling: float = Field(default=50, ge=0, le=100)
    shooting: float = Field(default=50, ge=0, le=100)
    organization: float = Field(default=50, ge=0, le=100)
    unmarking: float = Field(default=50, ge=0, le=100)
    finishing: float = Field(default=50, ge=0, le=100)
    dribbling: float = Field(default=50, ge=0, le=100)
    fouls: float = Field(default=50, ge=0, le=100)
    goalkeeping: float = Field(default=50, ge=0, le=100)   # SALIDAS (centros/balón parado)
    # REFLEJOS (paradas de disparo). Opcional: si falta ⇒ = goalkeeping (retrocompat.).
    reflexes: Optional[float] = Field(default=None, ge=0, le=100)
    # Estado
    fitness: float = Field(default=100, ge=0, le=100)
    morale: float = Field(default=75, ge=0, le=100)
    experience: float = Field(default=60, ge=0, le=100)
    isStarter: bool = False
    suspendedMatches: int = Field(default=0, ge=0)
    injured: bool = False
    outOfPositionChainBreak: bool = False
    # Forma física desglosada (opcional; si falta, cae a `fitness`).
    muscularFitness: Optional[float] = Field(default=None, ge=0, le=100)
    mentalSharpness: Optional[float] = Field(default=None, ge=0, le=100)
    matchRhythm: Optional[float] = Field(default=None, ge=0, le=100)
    # N3-2: etiquetas biográficas FDF («Cerebro», «Matador», «Incombustible», …).
    # Aditivo y neutro si vacío: sin tags el partido es bit a bit idéntico.
    tags: List[str] = Field(default_factory=list)
    # N3-3: desgaste crónico. demandLevel 0-5 (≥4 = alta demanda: carrilero,
    # box-to-box). consecutiveStarts = titularidades consecutivas sin descanso.
    # Ambos opcionales y neutros si ausentes (cero efecto).
    demandLevel: Optional[int] = Field(default=None, ge=0, le=5)
    consecutiveStarts: Optional[int] = Field(default=None, ge=0)

    # Clamp previo: datos legacy (p. ej. moral negativa pre-fix) se recortan al
    # rango en vez de invalidar el payload completo del partido.
    @field_validator(*_CLAMPABLE_PLAYER_FIELDS, mode="before")
    @classmethod
    def _clamp_player_fields(cls, v: object) -> object:
        return _clamp_0_100(v)


class TacticInput(BaseModel):
    formation: str = Field(default="4-4-2", max_length=16)
    # AUDIT-2026 §8 P0: palancas ESTRICTAMENTE acotadas 0-100 — tempo/mentality
    # sin límite permitían un DoS de cómputo en el bucle de jugadas.
    construction: float = Field(default=50, ge=0, le=100)
    destruction: float = Field(default=50, ge=0, le=100)
    # Palancas avanzadas (50 = neutro; partido idéntico al modo sin táctica avanzada).
    pressing: float = Field(default=50, ge=0, le=100)
    tempo: float = Field(default=50, ge=0, le=100)
    width: float = Field(default=50, ge=0, le=100)
    mentality: float = Field(default=50, ge=0, le=100)  # 0 defensiva .. 100 ofensiva
    homeAdvantage: Optional[float] = Field(default=None, ge=0, le=20)
    # Confianza del entrenador (manual §1.2-1.3): 0-100; 50 = neutro. La DIFERENCIA
    # con el rival modifica creación (±30%) y el valor base (±3). Default ⇒ neutro.
    coachConfidence: float = Field(default=50, ge=0, le=100)
    marking: str = Field(default="zonal", max_length=16)  # zonal | individual
    penaltyTaker: Optional[str] = None
    freeKickTaker: Optional[str] = None
    cornerTaker: Optional[str] = None
    # ── Estilos de juego FDF (manual §2.9) — opcionales y neutros si faltan ──
    # ofensivo: abrir_campo | pases_cortos | buscar_espalda | moverse_entre_lineas | pases_largos
    # defensivo: presion_bandas | presion_centro | fuera_de_juego | defensa_adelantada | presion_mediocentro
    # Matriz piedra-papel-tijera: el estilo correcto contra el del rival bonifica tu
    # construcción o su destrucción. No elegir nada contra un rival que sí elige = +10 para él.
    offensiveStyle: Optional[str] = None
    defensiveStyle: Optional[str] = None
    # ── Zonas FDF (manual §2.6) — opcionales y neutras si faltan ──────────────
    # attackZones: % de ataque por carril {"left": 40, "center": 20, "right": 40}.
    # defenseReinforcement: puntos de refuerzo (0-3) por carril {"left":0,"center":2,"right":0};
    # cada punto resta ~5% de éxito al rival cuando ataca por ese carril (bonif.def del 1d40).
    attackZones: Optional[Dict[str, float]] = None
    defenseReinforcement: Optional[Dict[str, float]] = None
    # ── Sustituciones programadas (R4) — opcionales y neutras si faltan ───────
    # Hasta 3 reglas de cambio {fromMin, toMin, condition: any|winning|drawing|losing,
    # outId, inId}. X5 amplía el mismo array con reglas tácticas opcionales:
    # {fromMin, condition, changes|tactic|set: {construction, destruction,
    # pressing, tempo, width, mentality, marking, formation, offensiveStyle,
    # defensiveStyle, attackZones, defenseReinforcement, takers...}}.
    # Sin `changes` se comporta como R4; sin `outId/inId` puede ser solo ajuste.
    subsLogic: Optional[List[Dict[str, object]]] = None
    # ── WT3 (11 jun 2026) · Counter de formaciones — opcional y NEUTRO si falta ─
    # {"attack": ±x, "defense": ±x, "midfield": ±x}: bonus/malus de perfil que el
    # backend calcula del matchup de formaciones del catálogo (piedra-papel-tijera
    # suave). Acotado ±6 por lado; None/0 ⇒ partido bit a bit idéntico.
    profileBonus: Optional[Dict[str, float]] = None


class TeamInput(BaseModel):
    # AUDIT-2026 §8 P1: max_length contra DoS por payload (plantilla FDF ≤ 30).
    players: List[PlayerInput] = Field(default_factory=list, max_length=64)
    tactic: TacticInput = Field(default_factory=TacticInput)


class SimulateRequest(BaseModel):
    homeTeam: TeamInput
    awayTeam: TeamInput
    # (C8) id opcional de correlación para lotes: se devuelve tal cual.
    matchId: Optional[str] = None
    seed: Optional[int] = None
    knockout: bool = False         # eliminatoria: prórroga + penaltis si hay empate
    # Clima (opcional; neutro = soleado/20º → partido idéntico al modo sin clima).
    weatherCondition: str = "soleado"   # soleado|nublado|lluvia|nieve|calor|frio
    temperature: float = 20.0
    # ── Asistencia al estadio (manual §2.10) — opcional y neutra si falta ─────
    # % de lleno del estadio (0-100). Bonifica al LOCAL por posición natural:
    # >90%: DEF+2 MED+3 DEL+5 · >70%: DEF+1 MED+2 DEL+3 · <71%: MED+1 DEL+2.
    # homeStimulated = discurso del entrenador ("estimulados"): POR+1 DEF+1 MED+2 DEL+4 extra.
    attendancePct: Optional[float] = Field(default=None, ge=0, le=100)
    homeStimulated: bool = False


EventType = Literal["goal", "yellow", "red", "save", "corner", "foul"]


class MatchStats(BaseModel):
    possession: int
    shots: int
    shotsOnTarget: int
    corners: int
    fouls: int
    yellowCards: int
    redCards: int


class MatchEventResult(BaseModel):
    minute: int
    type: EventType
    team: Literal["home", "away"]
    description: str
    playerName: Optional[str] = None
    playerId: Optional[str] = None   # aditivo: mapea el evento al jugador de la BD


class PlayerRating(BaseModel):
    name: str
    playerId: Optional[str] = None   # aditivo: id del jugador en la BD
    position: str = "MED"            # aditivo: POR|DEF|MED|DEL (visor 2D)
    rating: float           # 0-10 (acotada 3-10), DERIVADA de las acciones
    goals: int = 0
    assists: int = 0        # aditivo y opcional: no rompe a los consumidores existentes
    # Estadísticas por jugador (aditivas).
    shots: int = 0
    shotsOnTarget: int = 0
    passes: int = 0
    passesCompleted: int = 0
    passAccuracy: float = 0.0
    tackles: int = 0
    interceptions: int = 0
    keyPasses: int = 0
    xg: float = 0.0
    # R4: minutos jugados reales (90/120 si completa; ajustados por sustitución).
    minutes: int = 90


class DuelSide(BaseModel):
    """C7: un lado del duelo de atributos de un eslabón de jugada."""
    playerId: Optional[str] = None
    name: str
    position: str = "MED"
    attrs: Dict[str, float] = Field(default_factory=dict)   # atributo → valor exacto usado


class Duel(BaseModel):
    """C7: duelo atacante vs defensor que decide un eslabón (def = None si no aplica)."""
    att: DuelSide
    field_def: Optional[DuelSide] = Field(default=None, alias="def")

    model_config = {"populate_by_name": True}


class ChainLink(BaseModel):
    """C7: eslabón de la cadena de gol (recuperacion|regate|pase_clave|remate)."""
    step: Literal["recuperacion", "regate", "pase_clave", "remate"]
    lane: Literal["left", "center", "right"]
    text: str
    att: DuelSide
    field_def: Optional[DuelSide] = Field(default=None, alias="def")

    model_config = {"populate_by_name": True}


class TimelineEntry(BaseModel):
    minute: int
    phase: str              # saque|construccion|progresion|remate|gol|parada|falta|cambio|final
    team: Literal["home", "away"]
    zone: str               # def|med|ataque|area
    text: str
    playerId: Optional[str] = None
    # C7 (aditivo, None en entradas sin jugada): carril de la jugada, duelo de
    # atributos del eslabón y, SOLO en phase="gol", la cadena completa.
    lane: Optional[Literal["left", "center", "right"]] = None
    duel: Optional[Duel] = None
    chain: Optional[List[ChainLink]] = None


class Injury(BaseModel):
    playerId: Optional[str] = None
    playerName: str
    team: Literal["home", "away"]
    minute: int
    severity: Literal["leve", "media", "grave"]
    matchesOut: int


class SubPlayer(BaseModel):
    playerId: Optional[str] = None
    playerName: str


class Substitution(BaseModel):
    team: Literal["home", "away"]
    minute: int
    out: SubPlayer = Field(..., alias="out")
    field_in: SubPlayer = Field(..., alias="in")
    reason: Literal["injury", "fitness", "tactic"]   # tactic = regla programada (R4)

    model_config = {"populate_by_name": True}


class TacticalChange(BaseModel):
    team: Literal["home", "away"]
    minute: int
    condition: str
    changes: Dict[str, Any] = Field(default_factory=dict)
    previous: Dict[str, Any] = Field(default_factory=dict)


class SimulationResult(BaseModel):
    homeGoals: int
    awayGoals: int
    homeStats: MatchStats
    awayStats: MatchStats
    events: List[MatchEventResult]
    motm: str
    homeRatings: List[PlayerRating] = Field(default_factory=list)
    awayRatings: List[PlayerRating] = Field(default_factory=list)
    timeline: List[TimelineEntry] = Field(default_factory=list)
    # Eliminatoria (defaults compatibles con liga: contrato intacto).
    knockout: bool = False
    decidedBy: Literal["regular", "extra_time", "penalties"] = "regular"
    winner: Optional[Literal["home", "away"]] = None
    homePenalties: int = 0
    awayPenalties: int = 0
    # Lesiones y cambios (aditivo: vacíos si no ocurre nada).
    injuries: List[Injury] = Field(default_factory=list)
    substitutions: List[Substitution] = Field(default_factory=list)
    # X5 · Ajustes tácticos condicionales ejecutados desde subsLogic.
    tacticalChanges: List[TacticalChange] = Field(default_factory=list)


# ─── Desarrollo de jugadores (POST /develop) ──────────────────────────────────
class DevelopPlayer(BaseModel):
    name: str = Field(default="Jugador", max_length=120)
    id: Optional[str] = Field(default=None, max_length=32)
    # Atributos FDF (acotados 0-100; clamp previo para datos legacy).
    passing: float = Field(default=50, ge=0, le=100)
    tackling: float = Field(default=50, ge=0, le=100)
    shooting: float = Field(default=50, ge=0, le=100)
    organization: float = Field(default=50, ge=0, le=100)
    unmarking: float = Field(default=50, ge=0, le=100)
    finishing: float = Field(default=50, ge=0, le=100)
    dribbling: float = Field(default=50, ge=0, le=100)
    fouls: float = Field(default=50, ge=0, le=100)
    goalkeeping: float = Field(default=50, ge=0, le=100)   # SALIDAS
    reflexes: Optional[float] = Field(default=None, ge=0, le=100)  # REFLEJOS (None ⇒ = salidas)
    # Forma física.
    fitness: float = Field(default=100, ge=0, le=100)
    muscularFitness: Optional[float] = Field(default=None, ge=0, le=100)
    matchRhythm: Optional[float] = Field(default=None, ge=0, le=100)
    # Desarrollo.
    age: float = Field(default=24, ge=10, le=60)
    potential: Optional[float] = Field(default=None, ge=0, le=100)
    personality: Optional[str] = Field(default=None, max_length=32)
    injuryProneness: float = Field(default=30, ge=0, le=100)
    consistency: float = Field(default=60, ge=0, le=100)

    @field_validator(
        "passing", "tackling", "shooting", "organization", "unmarking", "finishing",
        "dribbling", "fouls", "goalkeeping", "reflexes", "fitness", "muscularFitness",
        "matchRhythm", "potential", "injuryProneness", "consistency", mode="before")
    @classmethod
    def _clamp_develop_fields(cls, v: object) -> object:
        return _clamp_0_100(v)


class DevelopContext(BaseModel):
    trainingFocus: str = Field(default="general", max_length=32)
    minutesPlayed: float = Field(default=0, ge=0, le=6000)
    matchRating: float = Field(default=6.0, ge=0, le=10)
    restDays: float = Field(default=3, ge=0, le=365)
    academyLevel: float = Field(default=0, ge=0, le=100)


class DevelopRequest(BaseModel):
    # AUDIT-2026 §8 P1: tope contra DoS (desarrollo de TODO el mundo en lotes).
    players: List[DevelopPlayer] = Field(default_factory=list, max_length=20000)
    context: DevelopContext = Field(default_factory=DevelopContext)
    seed: Optional[int] = None


class DevelopResult(BaseModel):
    playerId: Optional[str] = None
    name: str
    deltas: Dict[str, float]
    newAttributes: Dict[str, float]
    muscularFitness: float
    matchRhythm: float
    overallDelta: float


class DevelopResponse(BaseModel):
    results: List[DevelopResult] = Field(default_factory=list)


# ─── IA de entrenador (POST /lineup) ──────────────────────────────────────────
class LineupPlayer(BaseModel):
    name: str = Field(default="Jugador", max_length=120)
    id: Optional[str] = Field(default=None, max_length=32)
    position: str = Field(default="MED", max_length=30)
    passing: float = Field(default=50, ge=0, le=100)
    tackling: float = Field(default=50, ge=0, le=100)
    shooting: float = Field(default=50, ge=0, le=100)
    organization: float = Field(default=50, ge=0, le=100)
    unmarking: float = Field(default=50, ge=0, le=100)
    finishing: float = Field(default=50, ge=0, le=100)
    dribbling: float = Field(default=50, ge=0, le=100)
    fouls: float = Field(default=50, ge=0, le=100)
    goalkeeping: float = Field(default=50, ge=0, le=100)
    reflexes: Optional[float] = Field(default=None, ge=0, le=100)
    fitness: float = Field(default=100, ge=0, le=100)
    muscularFitness: Optional[float] = Field(default=None, ge=0, le=100)

    @field_validator(
        "passing", "tackling", "shooting", "organization", "unmarking", "finishing",
        "dribbling", "fouls", "goalkeeping", "reflexes", "fitness", "muscularFitness", mode="before")
    @classmethod
    def _clamp_lineup_fields(cls, v: object) -> object:
        return _clamp_0_100(v)
    # Disponibilidad (cualquiera de estas marca al jugador como NO seleccionable).
    available: Optional[bool] = None
    isInjured: Optional[bool] = None
    isSuspended: Optional[bool] = None
    suspendedMatches: Optional[float] = None


class LineupRequest(BaseModel):
    # AUDIT-2026 §8 P1: max_length contra DoS por payload.
    players: List[LineupPlayer] = Field(default_factory=list, max_length=64)
    objective: str = Field(default="equilibrado", max_length=16)  # ofensivo | equilibrado | defensivo
    seed: Optional[int] = None


class LineupSlot(BaseModel):
    playerId: Optional[str] = None
    name: str
    position: str


class LineupResponse(BaseModel):
    formation: str
    objective: str
    xi: List[LineupSlot] = Field(default_factory=list)
    bench: List[LineupSlot] = Field(default_factory=list)
    tactic: dict = Field(default_factory=dict)


# ─── (C8) Lote de simulaciones: una llamada HTTP por JORNADA, no por partido ──
class BatchSimulateRequest(BaseModel):
    matches: List[SimulateRequest] = Field(default_factory=list, max_length=512)


class BatchSimulationItem(BaseModel):
    matchId: Optional[str] = None    # eco del SimulateRequest.matchId
    result: SimulationResult


class BatchSimulationResult(BaseModel):
    results: List[BatchSimulationItem] = Field(default_factory=list)
