# ─── C3 · Profundidad de estilos 5×5 (manual §2.9) ───────────────────────────
# Con STYLE_SCALE=1.2 + acople a posesión, dos tácticas opuestas deben producir
# distribuciones de partido DISTINGUIBLES con las mismas plantillas y semillas.

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


def _with_styles(team, off=None, deff=None):
    import copy
    t = copy.deepcopy(team)
    t["tactic"]["offensiveStyle"] = off
    t["tactic"]["defensiveStyle"] = deff
    return t


def test_matchup_ganador_distinguible_en_goles_y_posesion():
    """abrir_campo vs presion_centro (gana el atacante +6) debe verse en la
    DISTRIBUCIÓN: más goles Y más posesión que el espejo perdedor, mismas semillas."""
    n = 400
    base_h, base_a = _team(), _team()
    # A: el local gana el duelo (abrir_campo bate presion_centro)
    win_h = _with_styles(base_h, off="abrir_campo")
    win_a = _with_styles(base_a, deff="presion_centro")
    # B: el local pierde el duelo (presion_bandas contrarresta abrir_campo)
    lose_h = _with_styles(base_h, off="abrir_campo")
    lose_a = _with_styles(base_a, deff="presion_bandas")

    goals_win = goals_lose = poss_win = poss_lose = 0
    for s in range(n):
        rw = simulate(win_h, win_a, seed=s)
        rl = simulate(lose_h, lose_a, seed=s)
        goals_win += rw["homeGoals"]
        goals_lose += rl["homeGoals"]
        poss_win += rw["homeStats"]["possession"]
        poss_lose += rl["homeStats"]["possession"]

    assert goals_win > goals_lose, (goals_win, goals_lose)
    # La posesión media debe diferenciarse al menos 1 punto entre ambos mundos.
    assert poss_win / n >= poss_lose / n + 1.0, (poss_win / n, poss_lose / n)


def test_estilos_simetricos_se_anulan():
    """Si ambos ganan su duelo con la misma fuerza, la ventaja neta se compensa:
    el reparto global debe quedar cerca del neutro (sin estilos)."""
    n = 300
    h = _with_styles(_team(), off="abrir_campo", deff="presion_centro")
    a = _with_styles(_team(), off="pases_cortos", deff="presion_bandas")
    # Ambos atacantes baten al defensor rival (+6 con cada uno).
    neutral_h, neutral_a = _team(), _team()
    diff_styled = sum(simulate(h, a, seed=s)["homeGoals"] - simulate(h, a, seed=s)["awayGoals"] for s in range(n))
    diff_neutral = sum(simulate(neutral_h, neutral_a, seed=s)["homeGoals"] - simulate(neutral_h, neutral_a, seed=s)["awayGoals"] for s in range(n))
    # La diferencia de diferencias debe ser pequeña (los bonus se compensan).
    assert abs(diff_styled - diff_neutral) <= n * 0.35, (diff_styled, diff_neutral)
