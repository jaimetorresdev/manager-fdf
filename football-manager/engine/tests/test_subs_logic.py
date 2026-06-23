# ─── R4 · Sustituciones programadas (Tactic.subsLogic) ───────────────────────
# Reglas {fromMin,toMin,condition,outId,inId}: se ejecutan en su ventana si el
# marcador cumple la condición, con prioridad sobre los cambios automáticos.
# Sin reglas (o lista vacía) el partido debe ser BIT A BIT idéntico (calibración).

from app.engine import simulate

POSITIONS = ["POR", "DEF", "DEF", "DEF", "DEF", "MED", "MED", "MED", "MED", "DEL", "DEL"]


def _player(i, pos, q=60, starter=True):
    return {"id": str(i), "name": f"J{i}", "position": pos, "passing": q, "tackling": q,
            "shooting": q, "organization": q, "unmarking": q, "finishing": q,
            "dribbling": q, "fouls": q, "goalkeeping": q if pos == "POR" else 20,
            "fitness": 100, "morale": 75, "experience": 60, "isStarter": starter}


def _team(base_id=0, q=60, subs_logic=None, bench=True):
    players = [_player(base_id + i + 1, POSITIONS[i], q=q) for i in range(11)]
    if bench:
        players += [_player(base_id + 20 + i, p, q=q, starter=False)
                    for i, p in enumerate(["DEF", "MED", "DEL"])]
    tactic = {"formation": "4-4-2", "construction": 50, "destruction": 50}
    if subs_logic is not None:
        tactic["subsLogic"] = subs_logic
    return {"players": players, "tactic": tactic}


def _score_at(result, minute):
    h = a = 0
    for e in result["events"]:
        if e["type"] == "goal" and e["minute"] <= minute:
            if e["team"] == "home":
                h += 1
            else:
                a += 1
    return h, a


def test_subs_logic_vacio_es_neutro():
    home_a = _team(q=60)
    home_b = _team(q=60, subs_logic=[])
    away = _team(base_id=100, q=70)
    assert simulate(home_a, away, seed=7) == simulate(home_b, away, seed=7)


def test_regla_losing_se_ejecuta_solo_si_pierde():
    rule = [{"fromMin": 60, "toMin": 67, "condition": "losing", "outId": 6, "inId": 21}]
    # Diferencia moderada (motor FDF: una brecha grande sería goleada segura y la
    # rama "no pierde" no se cubriría). Con q 64 vs 72 aparecen ambos resultados.
    home = _team(q=64, subs_logic=rule)
    away = _team(base_id=100, q=72, bench=False)
    ejecutadas = omitidas = 0
    for seed in range(1, 120):
        r = simulate(home, away, seed=seed)
        prog = [s for s in r["substitutions"] if s.get("reason") == "tactic"]
        losing = any(_score_at(r, m)[0] < _score_at(r, m)[1] for m in range(60, 68))
        if losing:
            assert prog and 60 <= prog[0]["minute"] <= 67
            assert prog[0]["out"]["playerId"] == "6" and prog[0]["in"]["playerId"] == "21"
            ejecutadas += 1
        else:
            assert not prog
            omitidas += 1
        if ejecutadas and omitidas:
            break
    assert ejecutadas and omitidas  # ambas ramas cubiertas


def test_minutos_y_timeline_reflejan_el_cambio():
    rule = [{"fromMin": 60, "toMin": 67, "condition": "any", "outId": 6, "inId": 21}]
    home = _team(q=60, subs_logic=rule)
    away = _team(base_id=100, q=60, bench=False)
    r = simulate(home, away, seed=3)
    prog = [s for s in r["substitutions"] if s.get("reason") == "tactic"]
    assert prog, "regla 'any' debe ejecutarse siempre"
    minute = prog[0]["minute"]
    ratings = {x["name"]: x for x in r["homeRatings"]}
    assert ratings["J6"]["minutes"] == minute
    assert ratings["J21"]["minutes"] == 90 - minute
    assert any(t["phase"] == "cambio" and "J21" in t["text"] for t in r["timeline"])


def test_prioridad_sobre_automaticos_max_3_cambios():
    rules = [
        {"fromMin": 45, "toMin": 52, "condition": "any", "outId": 6, "inId": 21},
        {"fromMin": 60, "toMin": 67, "condition": "any", "outId": 7, "inId": 20},
        {"fromMin": 75, "toMin": 82, "condition": "any", "outId": 10, "inId": 22},
    ]
    home = _team(q=60, subs_logic=rules)
    away = _team(base_id=100, q=60, bench=False)
    for seed in range(1, 40):
        r = simulate(home, away, seed=seed)
        home_subs = [s for s in r["substitutions"] if s["team"] == "home"]
        assert len(home_subs) <= 3
        assert sum(1 for s in home_subs if s.get("reason") == "tactic") == 3


def test_determinista_con_reglas():
    rule = [{"fromMin": 60, "toMin": 67, "condition": "any", "outId": 6, "inId": 21}]
    home = _team(q=60, subs_logic=rule)
    away = _team(base_id=100, q=70)
    assert simulate(home, away, seed=42) == simulate(home, away, seed=42)


def test_plan_condicional_reporta_ajuste_tactico():
    rule = [{
        "fromMin": 60,
        "toMin": 65,
        "condition": "any",
        "changes": {
            "mentality": 80,
            "tempo": 85,
            "pressing": 72,
            "marking": "individual",
            "attackZones": {"left": 20, "center": 60, "right": 20},
        },
    }]
    home = _team(q=60, subs_logic=rule)
    away = _team(base_id=100, q=60)
    r = simulate(home, away, seed=31)
    assert r["tacticalChanges"] == [{
        "team": "home",
        "minute": 60,
        "condition": "any",
        "changes": {
            "pressing": 72.0,
            "tempo": 85.0,
            "mentality": 80.0,
            "marking": "individual",
            "attackZones": {"left": 20, "center": 60, "right": 20},
        },
        "previous": {
            "pressing": None,
            "tempo": None,
            "mentality": None,
            "marking": None,
            "attackZones": None,
        },
    }]
    assert any(t["phase"] == "ajuste_tactico" and t["minute"] == 60 for t in r["timeline"])
    assert simulate(home, away, seed=31) == r


def test_plan_condicional_altera_simulacion_posterior():
    away = _team(base_id=100, q=64)
    base = simulate(_team(q=64), away, seed=19)
    plan = simulate(_team(q=64, subs_logic=[{
        "fromMin": 1,
        "condition": "any",
        "tactic": {"mentality": 100, "tempo": 100, "pressing": 100, "width": 100},
    }]), away, seed=19)
    assert plan["tacticalChanges"]
    base_signature = (base["homeStats"]["shots"], base["homeStats"]["shotsOnTarget"],
                      base["homeGoals"], len(base["timeline"]))
    plan_signature = (plan["homeStats"]["shots"], plan["homeStats"]["shotsOnTarget"],
                      plan["homeGoals"], len(plan["timeline"]))
    assert plan_signature != base_signature
