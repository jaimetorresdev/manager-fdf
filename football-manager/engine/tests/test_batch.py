# ─── C8 · Endpoint de lote /simulate-batch ────────────────────────────────────
# Una llamada HTTP por JORNADA: cada item debe ser EXACTAMENTE el mismo
# resultado que /simulate individual con el mismo payload y semilla.

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

POSITIONS = ["POR", "DEF", "DEF", "DEF", "DEF", "MED", "MED", "MED", "MED", "DEL", "DEL"]


def _team(q=64):
    players = [{
        "id": str(i + 1), "name": f"J{i+1}", "position": POSITIONS[i],
        "passing": q, "tackling": q, "shooting": q, "organization": q,
        "unmarking": q, "finishing": q, "dribbling": q, "fouls": q,
        "goalkeeping": q if POSITIONS[i] == "POR" else 20,
        "fitness": 100, "morale": 75, "experience": 60, "isStarter": True,
    } for i in range(11)]
    return {"players": players, "tactic": {"formation": "4-4-2"}}


def _req(seed, match_id=None):
    return {"matchId": match_id, "homeTeam": _team(), "awayTeam": _team(58),
            "seed": seed, "knockout": False}


def test_batch_equivale_a_simulaciones_individuales():
    matches = [_req(s, match_id=f"m{s}") for s in range(6)]
    rb = client.post("/simulate-batch", json={"matches": matches})
    assert rb.status_code == 200
    results = rb.json()["results"]
    assert len(results) == 6
    for i, item in enumerate(results):
        assert item["matchId"] == f"m{i}"
        ri = client.post("/simulate", json=_req(i))
        assert ri.status_code == 200
        assert item["result"] == ri.json()


def test_batch_vacio_y_determinista():
    assert client.post("/simulate-batch", json={"matches": []}).json() == {"results": []}
    a = client.post("/simulate-batch", json={"matches": [_req(7)]}).json()
    b = client.post("/simulate-batch", json={"matches": [_req(7)]}).json()
    assert a == b


def test_batch_knockout_y_timeline_c7():
    matches = [{**_req(3, "ko"), "knockout": True}]
    r = client.post("/simulate-batch", json={"matches": matches}).json()["results"][0]["result"]
    assert r["decidedBy"] in ("regular", "extra_time", "penalties")
    assert r["winner"] in ("home", "away")
    goles = [e for e in r["timeline"] if e["phase"] == "gol"]
    for g in goles:                      # contrato C7 sobrevive a la serialización
        assert g["lane"] in ("left", "center", "right")
        assert g["chain"] and g["chain"][-1]["step"] == "remate"
