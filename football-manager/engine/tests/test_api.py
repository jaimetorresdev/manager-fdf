# ─── Tests del API HTTP (FastAPI) — contrato v3 ───────────────────────────────
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

POSITIONS = ["POR"] + ["DEF"] * 4 + ["MED"] * 4 + ["DEL"] * 2


def make_team(level=75):
    players = []
    for i, pos in enumerate(POSITIONS):
        players.append({
            "name": f"J{i}", "position": pos, "isStarter": True,
            "passing": level, "tackling": level, "shooting": level, "organization": level,
            "unmarking": level, "finishing": level, "dribbling": level, "fouls": level,
            "goalkeeping": level + (10 if pos == "POR" else 0),
        })
    return {"players": players, "tactic": {"formation": "4-4-2", "construction": 50, "destruction": 50}}


def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert r.json()["engine"] == "v3"
    assert r.json()["version"].startswith("3.")


def test_simulate_contract():
    payload = {"homeTeam": make_team(80), "awayTeam": make_team(68), "seed": 4242}
    r = client.post("/simulate", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"homeGoals", "awayGoals", "homeStats", "awayStats",
                         "events", "motm", "homeRatings", "awayRatings", "timeline",
                         "knockout", "decidedBy", "winner",
                         "homePenalties", "awayPenalties",
                         "injuries", "substitutions", "tacticalChanges"}
    # El timeline abre con el saque y cierra con el final.
    assert body["timeline"][0]["phase"] == "saque"
    assert body["timeline"][-1]["phase"] == "final"
    # Stats por jugador presentes y coherentes.
    assert sum(pr["shots"] for pr in body["homeRatings"]) == body["homeStats"]["shots"]
    # En liga (sin knockout) los campos de eliminatoria toman valores neutros.
    assert body["knockout"] is False and body["decidedBy"] == "regular"
    assert body["homePenalties"] == 0 and body["awayPenalties"] == 0
    assert body["homeStats"]["possession"] + body["awayStats"]["possession"] == 100
    assert len(body["homeRatings"]) == 11
    for pr in body["homeRatings"]:
        assert 3.0 <= pr["rating"] <= 10.0
    for ev in body["events"]:
        assert ev["type"] in {"goal", "yellow", "red", "save", "corner", "foul"}


def test_simulate_deterministic_over_http():
    payload = {"homeTeam": make_team(75), "awayTeam": make_team(75), "seed": 555}
    assert client.post("/simulate", json=payload).json() == client.post("/simulate", json=payload).json()


def test_defaults_tolerantes():
    # Jugadores con campos mínimos: el motor rellena por defecto.
    payload = {"homeTeam": {"players": [{"name": "Solo", "position": "DEL"}]},
               "awayTeam": {"players": [{"name": "Otro", "position": "POR"}]}, "seed": 1}
    r = client.post("/simulate", json=payload)
    assert r.status_code == 200
