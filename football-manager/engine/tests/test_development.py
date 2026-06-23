# ─── Tests del motor de desarrollo ────────────────────────────────────────────
from app.development import _age_growth, calc_development, develop_squad
from app.engine import ATTRS


def player(age=24, potential=80, overall=70, **kw):
    p = {k: overall for k in ATTRS}
    p.update({"name": kw.get("name", "P"), "age": age, "potential": potential,
              "consistency": 70, "injuryProneness": 30,
              "muscularFitness": 80, "matchRhythm": 80})
    p.update(kw)
    return p


def overall(attrs):
    return sum(attrs[a] for a in ATTRS) / len(ATTRS)


def test_age_29_no_es_una_meseta_muerta():
    assert _age_growth(29) > 0


def season(p, periods=40, focus="general", minutes=180, rating=7.0, rest=3, seed=1):
    cur = dict(p)
    for t in range(periods):
        r = calc_development(cur, {"trainingFocus": focus, "minutesPlayed": minutes,
                                   "matchRating": rating, "restDays": rest}, seed=seed + t)
        cur.update(r["newAttributes"])
    return cur


def test_determinista_por_semilla():
    p = player(19, 88, 70)
    assert calc_development(p, {"trainingFocus": "ataque"}, seed=5) == \
           calc_development(p, {"trainingFocus": "ataque"}, seed=5)


def test_nadie_supera_su_potential():
    p = player(17, 85, 70)
    cur = dict(p)
    for t in range(80):
        r = calc_development(cur, {"trainingFocus": "general", "minutesPlayed": 270,
                                   "matchRating": 8.0, "restDays": 5}, seed=100 + t)
        cur.update(r["newAttributes"])
        for a in ATTRS:
            assert cur[a] <= max(p[a], p["potential"]) + 0.01


def test_joven_crece_y_veterano_declina():
    joven = season(player(18, 90, 70))
    viejo = season(player(35, 88, 82))
    assert overall(joven) > 70.5      # ha crecido
    assert overall(viejo) < 82.0      # ha declinado


def test_jugador_en_su_potential_no_crece():
    top = season(player(26, 78, 78))   # ya en su techo, edad estable
    assert overall(top) <= 78.3        # se mantiene (no dispara)


def test_training_focus_dirige_la_mejora():
    p = player(18, 92, 70)
    res = season(p, focus="ataque", periods=30)
    foco = ("shooting", "finishing", "unmarking", "dribbling")
    ganancia_foco = sum(res[a] - p[a] for a in foco) / len(foco)
    resto = [a for a in ATTRS if a not in foco]
    ganancia_resto = sum(res[a] - p[a] for a in resto) / len(resto)
    assert ganancia_foco > ganancia_resto


def test_forma_sube_con_descanso_y_baja_con_carga():
    p = player(24, 80, 75, muscularFitness=60, matchRhythm=60)
    descansado = calc_development(p, {"minutesPlayed": 0, "restDays": 6}, seed=1)
    cargado = calc_development(p, {"minutesPlayed": 270, "restDays": 0}, seed=1)
    assert descansado["muscularFitness"] > 60        # recupera
    assert cargado["muscularFitness"] < 60           # se fatiga
    # jugar mantiene/sube el ritmo; no jugar lo baja
    assert calc_development(p, {"minutesPlayed": 90}, seed=1)["matchRhythm"] > \
           calc_development(p, {"minutesPlayed": 0}, seed=1)["matchRhythm"]


def test_develop_squad_uno_por_jugador_y_determinista():
    squad = [player(18, 90, 70, name="A"), player(30, 80, 80, name="B")]
    a = develop_squad(squad, {"trainingFocus": "general"}, seed=42)
    b = develop_squad(squad, {"trainingFocus": "general"}, seed=42)
    assert len(a) == 2 and a == b
    assert a[0]["name"] == "A" and "deltas" in a[0] and "muscularFitness" in a[0]


def test_overall_delta_coincide_con_los_deltas():
    p = player(19, 88, 70)
    r = calc_development(p, {"trainingFocus": "general", "minutesPlayed": 180}, seed=3)
    # overallDelta = media de TODOS los deltas (9 FDF + reflejos), a 3 decimales.
    assert abs(r["overallDelta"] - sum(r["deltas"].values()) / len(r["deltas"])) < 1e-3
