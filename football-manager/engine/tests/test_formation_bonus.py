# ─── WT3 · profileBonus: counter de formaciones (11 jun 2026) ────────────────
# El backend calcula el matchup de formaciones del catálogo y lo envía como
# tactic.profileBonus {attack, defense, midfield}. Contrato del motor:
#   - None/{}/0 ⇒ partido BIT A BIT idéntico (neutro absoluto, patrón R7);
#   - con bonus, el favorecido mejora su distribución (más goles/posesión);
#   - el bonus se CAPA a ±6 por lado (entradas hostiles no rompen calibración).

import copy

from app.engine import simulate

POSITIONS = ["POR", "DEF", "DEF", "DEF", "DEF", "MED", "MED", "MED", "MED", "DEL", "DEL"]


def _team(q=60):
    players = [{
        "id": str(i + 1), "name": f"J{i+1}", "position": POSITIONS[i],
        "passing": q, "tackling": q, "shooting": q, "organization": q,
        "unmarking": q, "finishing": q, "dribbling": q, "fouls": q,
        "goalkeeping": q if POSITIONS[i] == "POR" else 20,
        "fitness": 100, "morale": 75, "experience": 60, "isStarter": True,
    } for i in range(11)]
    return {"players": players,
            "tactic": {"formation": "4-4-2", "construction": 50, "destruction": 50}}


def _with_bonus(team, attack=0.0, defense=0.0, midfield=0.0):
    t = copy.deepcopy(team)
    t["tactic"]["profileBonus"] = {"attack": attack, "defense": defense, "midfield": midfield}
    return t


def test_profile_bonus_ausente_o_cero_es_bit_a_bit_identico():
    """Sin profileBonus, con None y con {0,0,0} el partido es EXACTAMENTE igual."""
    base_h, base_a = _team(), _team()
    zero_h = _with_bonus(base_h)          # {0,0,0}
    none_h = copy.deepcopy(base_h)
    none_h["tactic"]["profileBonus"] = None
    for s in (1, 7, 42, 99):
        ref = simulate(base_h, base_a, seed=s)
        for variant in (zero_h, none_h):
            got = simulate(variant, base_a, seed=s)
            assert got["homeGoals"] == ref["homeGoals"]
            assert got["awayGoals"] == ref["awayGoals"]
            assert got["homeStats"] == ref["homeStats"]
            assert got["awayStats"] == ref["awayStats"]


def test_profile_bonus_favorece_la_distribucion():
    """Counter típico WT3 (+2/+1/+1.5 vs −2/−1/−1.5): el favorecido suma más
    goles y más posesión agregados con las mismas semillas (suave, no determinista)."""
    n = 400
    base_h, base_a = _team(), _team()
    fav_h = _with_bonus(base_h, attack=2.0, defense=1.0, midfield=1.5)
    fav_a = _with_bonus(base_a, attack=-2.0, defense=-1.0, midfield=-1.5)

    goals_fav = goals_ref = poss_fav = 0
    for s in range(n):
        rf = simulate(fav_h, fav_a, seed=s)
        rr = simulate(base_h, base_a, seed=s)
        goals_fav += rf["homeGoals"]
        goals_ref += rr["homeGoals"]
        poss_fav += rf["homeStats"]["possession"]

    assert goals_fav > goals_ref, (goals_fav, goals_ref)
    assert poss_fav / n > 50.0  # con todo igual, el counter inclina la posesión


def test_profile_bonus_se_capa_a_seis():
    """Un bonus hostil (+1000) no puede mover el perfil más que el cap (±6):
    misma distribución que pedir exactamente 6."""
    base_h, base_a = _team(), _team()
    capped = _with_bonus(base_h, attack=6.0, defense=6.0, midfield=6.0)
    hostile = _with_bonus(base_h, attack=1000.0, defense=1000.0, midfield=1000.0)
    for s in (3, 11, 64):
        rc = simulate(capped, base_a, seed=s)
        rh = simulate(hostile, base_a, seed=s)
        assert rc["homeGoals"] == rh["homeGoals"]
        assert rc["awayGoals"] == rh["awayGoals"]
        assert rc["homeStats"] == rh["homeStats"]
