# ─── AUDIT-2026 §8 — Tests de límites de entrada y determinismo ───────────────
# Cubren: P0 (tempo/mentality acotados + tope duro de jugadas), P1 (max_length,
# determinismo sin hash()), P2 (clamp de atributos de jugador, _Ratings por id).

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.engine import MAX_PLAYS_PER_TEAM, PLAYS_PER_TEAM, _Ratings, simulate
from app.development import calc_development
from app.manager_ai import pick_lineup
from app.models import DevelopContext, DevelopRequest, PlayerInput, TacticInput, TeamInput

client = TestClient(app)


def _player(name="Jugador", **kw):
    base = dict(name=name, position="MED", isStarter=True)
    base.update(kw)
    return base


def _team(n=11, tactic=None):
    positions = ["POR"] + ["DEF"] * 4 + ["MED"] * 4 + ["DEL"] * 2
    return {
        "players": [_player(f"J{i}", position=positions[i % len(positions)], id=str(i + 1)) for i in range(n)],
        "tactic": tactic or {},
    }


# ─── P0: palancas tácticas acotadas ───────────────────────────────────────────

def test_tactic_tempo_fuera_de_rango_rechazado():
    with pytest.raises(ValidationError):
        TacticInput(tempo=1e9)
    with pytest.raises(ValidationError):
        TacticInput(mentality=-5)
    with pytest.raises(ValidationError):
        TacticInput(pressing=101)
    with pytest.raises(ValidationError):
        TacticInput(width=1e308)
    with pytest.raises(ValidationError):
        TacticInput(homeAdvantage=21)


def test_home_advantage_forma_parte_del_contrato_del_motor():
    assert TacticInput(homeAdvantage=4).homeAdvantage == 4


def test_simulate_endpoint_rechaza_tempo_hostil():
    body = {"homeTeam": _team(tactic={"tempo": 1e9}), "awayTeam": _team(), "seed": 1}
    r = client.post("/simulate", json=body)
    assert r.status_code == 422


def test_tope_duro_de_jugadas_definido():
    assert MAX_PLAYS_PER_TEAM == PLAYS_PER_TEAM * 4
    # Con palancas extremas LEGALES el partido termina y es válido.
    res = simulate(_team(tactic={"tempo": 100, "mentality": 100, "pressing": 100}),
                   _team(tactic={"tempo": 100, "mentality": 100}), seed=42)
    assert isinstance(res["homeGoals"], int) and isinstance(res["awayGoals"], int)


# ─── P1: max_length contra DoS por payload ────────────────────────────────────

def test_team_players_max_length():
    with pytest.raises(ValidationError):
        TeamInput(players=[PlayerInput(name=f"P{i}") for i in range(65)])


def test_develop_players_max_length():
    with pytest.raises(ValidationError):
        DevelopRequest(players=[{"name": f"P{i}"} for i in range(20001)])


def test_lineup_endpoint_rechaza_plantilla_gigante():
    body = {"players": [_player(f"P{i}") for i in range(65)], "seed": 1}
    r = client.post("/lineup", json=body)
    assert r.status_code == 422


# ─── P2: atributos de jugador clampados (legacy fuera de rango NO rompe) ──────

def test_player_attrs_clampados_no_422():
    p = PlayerInput(name="Legacy", morale=-20, fitness=140, passing=1e6)
    assert p.morale == 0
    assert p.fitness == 100
    assert p.passing == 100


def test_out_of_position_chain_break_forma_parte_del_contrato():
    p = PlayerInput(name="Fuera", outOfPositionChainBreak=True)
    assert p.outOfPositionChainBreak is True


def test_develop_context_rechaza_valores_hostiles():
    with pytest.raises(ValidationError):
        DevelopContext(minutesPlayed=-1)
    with pytest.raises(ValidationError):
        DevelopContext(matchRating=1e9)
    with pytest.raises(ValidationError):
        DevelopContext(restDays=-5)
    with pytest.raises(ValidationError):
        DevelopContext(academyLevel=101)


# ─── P1: determinismo sin hash() ──────────────────────────────────────────────

def test_develop_determinista_misma_semilla():
    player = {"name": "Joven", "id": "7", "age": 19, "potential": 90, "passing": 60}
    ctx = {"trainingFocus": "medio", "minutesPlayed": 180, "matchRating": 7.0, "restDays": 3, "academyLevel": 50}
    a = calc_development(player, ctx, seed=123)
    b = calc_development(player, ctx, seed=123)
    assert a["deltas"] == b["deltas"]


def test_lineup_determinista_misma_semilla():
    players = [_player(f"P{i}", id=str(i + 1), isStarter=False) for i in range(18)]
    a = pick_lineup(players, "equilibrado", seed=99)
    b = pick_lineup(players, "equilibrado", seed=99)
    assert [s["name"] for s in a["xi"]] == [s["name"] for s in b["xi"]]


# ─── P2: _Ratings por id — homónimos no colapsan ──────────────────────────────

def test_ratings_homonimos_no_colapsan():
    xi = [
        {"name": "García", "id": "1", "position": "DEL"},
        {"name": "García", "id": "2", "position": "DEF"},
    ]
    rt = _Ratings(xi)
    rt.goal("García")  # con homónimos, se acredita al primero…
    rows = rt.to_list()
    assert len(rows) == 2  # …pero la salida mantiene UNA fila por jugador
    ids = {r["playerId"] for r in rows}
    assert ids == {"1", "2"}
    assert sum(r["goals"] for r in rows) == 1
