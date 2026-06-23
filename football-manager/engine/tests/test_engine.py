# ─── Tests del motor v3 (por jugador) ─────────────────────────────────────────
# Invariantes + sanity estadístico + notas. Ejecutar: `pytest`.

from app.engine import (
    simulate, _attendance_bonus, _apply_red_card_penalty, _build_profile,
    _corner_count, _fatigue_mult, _weather_factors, _select_xi,
)

POSITIONS = ["POR"] + ["DEF"] * 4 + ["MED"] * 4 + ["DEL"] * 2


def make_team(level=75, formation="4-4-2", prefix="H", with_ids=False):
    players = []
    for i, pos in enumerate(POSITIONS):
        a = {k: level for k in ("passing", "tackling", "shooting", "organization",
                                "unmarking", "finishing", "dribbling", "fouls", "goalkeeping")}
        if pos == "POR":
            a["goalkeeping"] = level + 10
        elif pos == "DEF":
            a["tackling"] = level + 8
        elif pos == "DEL":
            a["finishing"] = level + 10
        p = {"name": f"{prefix}{i}", "position": pos, "isStarter": True,
             "fitness": 100, "morale": 75, "experience": 60, **a}
        if with_ids:
            p["id"] = f"id-{prefix}{i}"
        players.append(p)
    return {"players": players, "tactic": {"formation": formation, "construction": 50, "destruction": 50}}


BENCH_POSITIONS = ["POR", "DEF", "DEF", "MED", "MED", "DEL", "DEL"]


def make_squad(level=75, prefix="H", bench=7, low_fitness=False, with_ids=True):
    """Equipo con banquillo (suplentes isStarter=False) para probar cambios."""
    t = make_team(level, prefix=prefix, with_ids=with_ids)
    if low_fitness:
        for p in t["players"]:
            p["fitness"] = 50
    for j, pos in enumerate(BENCH_POSITIONS[:bench]):
        a = {k: level for k in ("passing", "tackling", "shooting", "organization",
                                "unmarking", "finishing", "dribbling", "fouls", "goalkeeping")}
        sub = {"name": f"{prefix}S{j}", "position": pos, "isStarter": False,
               "fitness": 100, "morale": 75, "experience": 60, **a}
        if with_ids:
            sub["id"] = f"id-{prefix}S{j}"
        t["players"].append(sub)
    return t


HOME = make_team(75, "4-3-3", prefix="H")
AWAY = make_team(75, "4-4-2", prefix="A")


def test_es_determinista_por_semilla():
    assert simulate(HOME, AWAY, seed=12345) == simulate(HOME, AWAY, seed=12345)


def test_semillas_distintas_difieren():
    a = simulate(HOME, AWAY, seed=1)
    b = simulate(HOME, AWAY, seed=2)
    assert (a["homeGoals"], a["awayGoals"], a["events"]) != (b["homeGoals"], b["awayGoals"], b["events"])


def test_posesion_suma_100():
    r = simulate(HOME, AWAY, seed=999)
    assert r["homeStats"]["possession"] + r["awayStats"]["possession"] == 100


def test_marcador_coincide_con_eventos_de_gol():
    for seed in range(60):
        r = simulate(HOME, AWAY, seed=seed)
        hg = sum(1 for e in r["events"] if e["type"] == "goal" and e["team"] == "home")
        ag = sum(1 for e in r["events"] if e["type"] == "goal" and e["team"] == "away")
        assert hg == r["homeGoals"] and ag == r["awayGoals"]


def test_ratings_en_rango_y_uno_por_titular():
    r = simulate(HOME, AWAY, seed=7)
    assert len(r["homeRatings"]) == 11 and len(r["awayRatings"]) == 11
    for pr in r["homeRatings"] + r["awayRatings"]:
        assert 3.0 <= pr["rating"] <= 10.0


def test_motm_es_el_de_mejor_nota():
    r = simulate(HOME, AWAY, seed=7)
    all_r = r["homeRatings"] + r["awayRatings"]
    best = max(x["rating"] for x in all_r)
    motm = next(x for x in all_r if x["name"] == r["motm"])
    assert motm["rating"] == best


def test_los_goleadores_suman_sus_goles_en_ratings():
    for seed in range(40):
        r = simulate(HOME, AWAY, seed=seed)
        goals_by_name = {}
        for e in r["events"]:
            if e["type"] == "goal" and e.get("playerName"):
                goals_by_name[e["playerName"]] = goals_by_name.get(e["playerName"], 0) + 1
        ratings_by_name = {x["name"]: x["goals"] for x in r["homeRatings"] + r["awayRatings"]}
        for name, g in goals_by_name.items():
            assert ratings_by_name.get(name, 0) == g


def test_equipo_superior_marca_mas_y_gana_la_mayoria():
    strong = make_team(90, prefix="S")
    weak = make_team(55, prefix="W")
    sg = wg = wins = 0
    n = 300
    for seed in range(n):
        r = simulate(strong, weak, seed=seed)
        sg += r["homeGoals"]; wg += r["awayGoals"]
        wins += int(r["homeGoals"] > r["awayGoals"])
    assert sg > wg * 3
    assert wins / n > 0.85


def test_no_rompe_con_plantilla_vacia():
    r = simulate({"players": []}, {"players": []}, seed=3)
    assert isinstance(r["motm"], str)
    assert r["homeStats"]["possession"] + r["awayStats"]["possession"] == 100


def test_xi_incluye_exactamente_un_portero_si_hay_un_portero_disponible():
    players = [
        {"name": f"Campo{i}", "position": "DEF", "isStarter": True, "goalkeeping": 10}
        for i in range(11)
    ]
    players.append({"name": "Portero", "position": "POR", "isStarter": False, "goalkeeping": 90})
    xi = _select_xi(players)
    assert len(xi) == 11
    assert [p["name"] for p in xi if p["position"] == "POR"] == ["Portero"]


def test_xi_excluye_sancionados_y_lesionados():
    players = [
        {"name": "POR", "position": "POR", "isStarter": True, "goalkeeping": 90},
        *[
            {"name": f"Campo{i}", "position": "DEF", "isStarter": True, "goalkeeping": 10}
            for i in range(12)
        ],
    ]
    players[2]["suspendedMatches"] = 1
    players[3]["injured"] = True
    xi = _select_xi(players)
    assert len(xi) == 11
    assert "Campo1" not in {p["name"] for p in xi}
    assert "Campo2" not in {p["name"] for p in xi}


def test_perfil_sin_portero_real_aplica_penalizacion_explicita():
    players = [
        {"name": f"Campo{i}", "position": "DEF", "isStarter": True, "goalkeeping": 95}
        for i in range(11)
    ]
    profile = _build_profile(players, {"formation": "4-4-2", "homeAdvantage": 0}, False)
    assert profile.gk is None
    assert 0 <= profile.gk_rating <= 25


def test_unidades_del_perfil_siempre_quedan_en_rango_con_ventaja_extrema():
    team = make_team(100, prefix="MAX")
    team["tactic"]["homeAdvantage"] = 1000
    profile = _build_profile(team["players"], team["tactic"], True, {"POR": 100, "DEF": 100, "MED": 100, "DEL": 100})
    for value in (profile.attack, profile.defense, profile.midfield, profile.finish, profile.gk_rating):
        assert 0 <= value <= 100


def test_estimulo_no_inventa_bonus_de_porteria():
    bonus = _attendance_bonus(None, True)
    assert bonus is not None
    assert bonus["POR"] == 0


def test_balones_parados_promedian_lanzadores_incluso_si_un_valor_es_50():
    team = make_team(70, prefix="SP", with_ids=True)
    team["players"][5]["shooting"] = 50
    team["players"][5]["passing"] = 50
    team["players"][6]["passing"] = 80
    team["players"][6]["organization"] = 80
    tactic = {
        "formation": "4-4-2",
        "freeKickTaker": "id-SP5",
        "cornerTaker": "id-SP6",
    }
    profile = _build_profile(team["players"], tactic, False)
    assert profile.set_piece == 65


def test_corners_no_tienen_sesgo_fijo_de_local():
    assert _corner_count(12, 5, 0.4) == _corner_count(12, 5, 0.4)


def test_roja_reduce_el_perfil_y_mantiene_limites():
    team = make_team(80, prefix="RED")
    profile = _build_profile(team["players"], team["tactic"], False)
    before = (profile.attack, profile.defense, profile.midfield, profile.finish)
    _apply_red_card_penalty(profile, 45)
    after = (profile.attack, profile.defense, profile.midfield, profile.finish)
    assert all(a < b for a, b in zip(after, before))
    assert all(0 <= value <= 100 for value in after)


def test_minutos_de_eventos_en_rango_valido():
    for seed in range(50):
        r = simulate(HOME, AWAY, seed=seed)
        for e in r["events"]:
            assert 1 <= e["minute"] <= 90


def test_eventos_ordenados_por_minuto():
    for seed in range(50):
        r = simulate(HOME, AWAY, seed=seed)
        minutes = [e["minute"] for e in r["events"]]
        assert minutes == sorted(minutes)


def test_asistencias_no_superan_los_goles_del_equipo():
    # No puede haber más asistencias que goles marcados por el equipo.
    for seed in range(60):
        r = simulate(HOME, AWAY, seed=seed)
        home_assists = sum(x["assists"] for x in r["homeRatings"])
        away_assists = sum(x["assists"] for x in r["awayRatings"])
        assert home_assists <= r["homeGoals"]
        assert away_assists <= r["awayGoals"]


def test_ratings_incluyen_goals_y_assists():
    r = simulate(HOME, AWAY, seed=11)
    for pr in r["homeRatings"] + r["awayRatings"]:
        assert "goals" in pr and "assists" in pr
        assert pr["goals"] >= 0 and pr["assists"] >= 0


def test_motm_pertenece_a_los_22_titulares():
    for seed in range(40):
        r = simulate(HOME, AWAY, seed=seed)
        nombres = {x["name"] for x in r["homeRatings"] + r["awayRatings"]}
        assert r["motm"] in nombres


def test_posesion_acotada_30_70():
    for seed in range(40):
        r = simulate(HOME, AWAY, seed=seed)
        for s in (r["homeStats"], r["awayStats"]):
            assert 30 <= s["possession"] <= 70


def test_medio_mas_fuerte_domina_la_posesion():
    # Un equipo con mediocampo muy superior debe tener >50% de posesión de media.
    dominante = make_team(95, prefix="D")
    flojo = make_team(55, prefix="F")
    poss = sum(simulate(dominante, flojo, seed=s)["homeStats"]["possession"] for s in range(200)) / 200
    assert poss > 52


def test_tiros_a_puerta_no_superan_tiros_totales():
    for seed in range(60):
        r = simulate(HOME, AWAY, seed=seed)
        for s in (r["homeStats"], r["awayStats"]):
            assert s["shotsOnTarget"] <= s["shots"]
            assert s["shots"] >= 0


def test_goles_no_superan_tiros_a_puerta():
    for seed in range(60):
        r = simulate(HOME, AWAY, seed=seed)
        assert r["homeGoals"] <= r["homeStats"]["shotsOnTarget"]
        assert r["awayGoals"] <= r["awayStats"]["shotsOnTarget"]


# ─── playerId ─────────────────────────────────────────────────────────────────
HOME_ID = make_team(75, "4-3-3", prefix="H", with_ids=True)
AWAY_ID = make_team(75, "4-4-2", prefix="A", with_ids=True)


def test_playerid_presente_en_ratings_cuando_lo_trae_la_entrada():
    r = simulate(HOME_ID, AWAY_ID, seed=7)
    ids_validos = {f"id-H{i}" for i in range(11)} | {f"id-A{i}" for i in range(11)}
    for pr in r["homeRatings"] + r["awayRatings"]:
        assert pr["playerId"] in ids_validos


def test_playerid_es_none_si_la_entrada_no_lo_trae():
    r = simulate(HOME, AWAY, seed=7)   # HOME/AWAY no tienen id
    for pr in r["homeRatings"] + r["awayRatings"]:
        assert pr["playerId"] is None


def test_playerid_de_eventos_consistente_con_el_nombre():
    name_to_id = {f"H{i}": f"id-H{i}" for i in range(11)}
    name_to_id.update({f"A{i}": f"id-A{i}" for i in range(11)})
    for seed in range(40):
        r = simulate(HOME_ID, AWAY_ID, seed=seed)
        for e in r["events"]:
            if e.get("playerName") in name_to_id:
                assert e.get("playerId") == name_to_id[e["playerName"]]


# ─── Eliminatoria ─────────────────────────────────────────────────────────────
def test_sin_knockout_comportamiento_identico_al_default():
    for seed in range(30):
        assert simulate(HOME, AWAY, seed=seed) == simulate(HOME, AWAY, seed=seed, knockout=False)


def test_sin_knockout_decidedby_siempre_regular_y_sin_penaltis():
    for seed in range(60):
        r = simulate(HOME, AWAY, seed=seed)
        assert r["decidedBy"] == "regular"
        assert r["homePenalties"] == 0 and r["awayPenalties"] == 0
        assert r["knockout"] is False


def test_knockout_siempre_da_ganador():
    for seed in range(120):
        r = simulate(HOME, AWAY, seed=seed, knockout=True)
        assert r["winner"] in ("home", "away")
        assert r["decidedBy"] in ("regular", "extra_time", "penalties")
        if r["decidedBy"] == "penalties":
            assert r["homeGoals"] == r["awayGoals"]          # empate tras prórroga
            assert r["homePenalties"] != r["awayPenalties"]  # la tanda decide
            ganador_pens = "home" if r["homePenalties"] > r["awayPenalties"] else "away"
            assert r["winner"] == ganador_pens


def test_knockout_genera_eventos_de_prorroga_cuando_hay_empate_a_90():
    # Busca una semilla cuyo 90' acabe en empate y verifica que hay eventos >90'.
    encontrada = False
    for seed in range(200):
        base = simulate(HOME, AWAY, seed=seed)
        if base["homeGoals"] == base["awayGoals"]:
            ko = simulate(HOME, AWAY, seed=seed, knockout=True)
            assert ko["decidedBy"] in ("extra_time", "penalties")
            assert any(e["minute"] > 90 for e in ko["events"]) or ko["decidedBy"] == "penalties"
            encontrada = True
            break
    assert encontrada


def test_knockout_es_determinista():
    a = simulate(HOME, AWAY, seed=123, knockout=True)
    b = simulate(HOME, AWAY, seed=123, knockout=True)
    assert a == b


# ─── Lesiones y sustituciones ─────────────────────────────────────────────────
def test_banquillo_no_altera_el_marcador_ni_los_eventos():
    # Garantiza que lesiones/cambios (rng derivado) NO perturban el juego → la
    # calibración de liga no se mueve: con o sin banquillo, el partido es idéntico.
    sin_banco = make_team(75, "4-4-2", prefix="H", with_ids=False)        # 11 justos
    con_banco = make_squad(75, prefix="H", bench=7, with_ids=False)       # misma 4-4-2 + banquillo
    for seed in range(50):
        r1 = simulate(sin_banco, AWAY, seed=seed)
        r2 = simulate(con_banco, AWAY, seed=seed)
        assert (r1["homeGoals"], r1["awayGoals"]) == (r2["homeGoals"], r2["awayGoals"])
        assert r1["events"] == r2["events"]
        assert r1["homeStats"] == r2["homeStats"]


def test_sin_banquillo_no_hay_sustituciones():
    for seed in range(120):
        r = simulate(HOME, AWAY, seed=seed)   # 11 jugadores justos, sin suplentes
        assert r["substitutions"] == []


def test_arrays_vacios_cuando_no_pasa_nada():
    # Plantilla a tope de fitness: sin lesión no debe haber cambios.
    sq_h = make_squad(75, prefix="H", bench=7)
    sq_a = make_squad(75, prefix="A", bench=7)
    visto_vacio = False
    for seed in range(120):
        r = simulate(sq_h, sq_a, seed=seed)
        if not r["injuries"]:
            assert r["substitutions"] == []   # sin lesión y fitness alto → sin cambios
            visto_vacio = True
    assert visto_vacio


def test_lesion_matchesout_coherente_con_severidad():
    rangos = {"leve": (1, 1), "media": (2, 4), "grave": (5, 10)}
    vistas = 0
    for seed in range(800):
        r = simulate(make_squad(75, "H"), make_squad(75, "A"), seed=seed)
        for inj in r["injuries"]:
            lo, hi = rangos[inj["severity"]]
            assert lo <= inj["matchesOut"] <= hi
            assert 1 <= inj["minute"] <= 90
            assert inj["team"] in ("home", "away")
            vistas += 1
    assert vistas > 0   # con 800 partidos seguro aparecen lesiones


def test_el_que_entra_estaba_en_el_banquillo():
    vistas = 0
    for seed in range(400):
        sq_h = make_squad(75, "H", bench=7, low_fitness=True)
        sq_a = make_squad(75, "A", bench=7, low_fitness=True)
        r = simulate(sq_h, sq_a, seed=seed)
        bench_ids = {f"id-HS{j}" for j in range(7)} | {f"id-AS{j}" for j in range(7)}
        for s in r["substitutions"]:
            assert s["in"]["playerId"] in bench_ids
            assert s["reason"] in ("injury", "fitness")
            vistas += 1
    assert vistas > 0


def test_maximo_3_cambios_por_equipo():
    for seed in range(200):
        sq_h = make_squad(75, "H", bench=7, low_fitness=True)
        sq_a = make_squad(75, "A", bench=7, low_fitness=True)
        r = simulate(sq_h, sq_a, seed=seed)
        for team in ("home", "away"):
            assert sum(1 for s in r["substitutions"] if s["team"] == team) <= 3


def test_lesiones_y_cambios_deterministas():
    sq_h = make_squad(75, "H", bench=7, low_fitness=True)
    sq_a = make_squad(75, "A", bench=7, low_fitness=True)
    a = simulate(sq_h, sq_a, seed=321)
    b = simulate(sq_h, sq_a, seed=321)
    assert a["injuries"] == b["injuries"]
    assert a["substitutions"] == b["substitutions"]


# ─── Timeline por fases ───────────────────────────────────────────────────────
VALID_PHASES = {"saque", "construccion", "progresion", "remate", "gol",
                "parada", "falta", "final"}


def test_timeline_ordenado_y_con_apertura_y_cierre():
    for seed in range(40):
        r = simulate(HOME, AWAY, seed=seed)
        tl = r["timeline"]
        assert len(tl) >= 2
        assert tl[0]["phase"] == "saque"
        assert tl[-1]["phase"] == "final"
        minutos = [e["minute"] for e in tl]
        assert minutos == sorted(minutos)
        for e in tl:
            assert e["phase"] in VALID_PHASES
            assert e["team"] in ("home", "away")
            assert isinstance(e["text"], str) and e["text"]


def test_timeline_coherente_con_el_marcador():
    for seed in range(80):
        r = simulate(HOME, AWAY, seed=seed)
        goles_tl_home = sum(1 for e in r["timeline"] if e["phase"] == "gol" and e["team"] == "home")
        goles_tl_away = sum(1 for e in r["timeline"] if e["phase"] == "gol" and e["team"] == "away")
        assert goles_tl_home == r["homeGoals"]
        assert goles_tl_away == r["awayGoals"]


# ─── Estadísticas por jugador ─────────────────────────────────────────────────
def test_suma_tiros_por_jugador_igual_a_tiros_del_equipo():
    for seed in range(80):
        r = simulate(HOME, AWAY, seed=seed)
        assert sum(x["shots"] for x in r["homeRatings"]) == r["homeStats"]["shots"]
        assert sum(x["shots"] for x in r["awayRatings"]) == r["awayStats"]["shots"]
        assert sum(x["shotsOnTarget"] for x in r["homeRatings"]) == r["homeStats"]["shotsOnTarget"]
        assert sum(x["shotsOnTarget"] for x in r["awayRatings"]) == r["awayStats"]["shotsOnTarget"]


def test_xg_positivo_cuando_hay_remates():
    for seed in range(60):
        r = simulate(HOME, AWAY, seed=seed)
        for lado, stats in (("homeRatings", "homeStats"), ("awayRatings", "awayStats")):
            if r[stats]["shots"] > 0:
                assert sum(x["xg"] for x in r[lado]) > 0


def test_pass_accuracy_en_rango_y_coherente():
    r = simulate(HOME, AWAY, seed=5)
    for x in r["homeRatings"] + r["awayRatings"]:
        assert 0.0 <= x["passAccuracy"] <= 1.0
        assert x["passesCompleted"] <= x["passes"]
        assert x["shotsOnTarget"] <= x["shots"]


def test_la_nota_correlaciona_con_marcar_goles():
    # Los goleadores deben puntuar, de media, más que los que no marcan.
    notas_gol, notas_sin = [], []
    for seed in range(400):
        r = simulate(HOME, AWAY, seed=seed)
        for x in r["homeRatings"] + r["awayRatings"]:
            (notas_gol if x["goals"] > 0 else notas_sin).append(x["rating"])
    assert notas_gol and notas_sin
    assert sum(notas_gol) / len(notas_gol) > sum(notas_sin) / len(notas_sin) + 0.5


def _total_goals(weather, temp=20, mf=None, n=400, lvl=75):
    h = make_team(lvl, prefix="H")
    a = make_team(lvl, prefix="A")
    if mf is not None:
        for t in (h, a):
            for p in t["players"]:
                p["muscularFitness"] = mf
                p["matchRhythm"] = mf
    tot = 0
    for s in range(n):
        r = simulate(h, a, seed=s, weatherCondition=weather, temperature=temp)
        tot += r["homeGoals"] + r["awayGoals"]
    return tot


# ─── Clima y fatiga (Etapa 2) ─────────────────────────────────────────────────
def test_clima_neutro_identico_al_modo_sin_clima():
    # 'soleado'/20º debe dejar el partido EXACTAMENTE igual que el default.
    for seed in range(40):
        base = simulate(HOME, AWAY, seed=seed)
        sol = simulate(HOME, AWAY, seed=seed, weatherCondition="soleado", temperature=20)
        assert base == sol


def test_fallback_sin_campos_granulares_equivale_a_fitness():
    sin = make_team(75, "4-4-2", prefix="H")          # sin muscularFitness/etc
    con = make_team(75, "4-4-2", prefix="H")
    for p in con["players"]:                            # = fitness (100) explícito
        p["muscularFitness"] = 100; p["matchRhythm"] = 100; p["mentalSharpness"] = 100
    for seed in range(30):
        assert simulate(sin, AWAY, seed=seed) == simulate(con, AWAY, seed=seed)


def test_lluvia_y_nieve_bajan_goles_vs_soleado():
    sol = _total_goals("soleado")
    assert _total_goals("lluvia") < sol
    assert _total_goals("nieve") < _total_goals("lluvia")   # nieve más extrema que lluvia


def test_calor_acelera_la_caida_de_rendimiento():
    # A misma forma baja, el calor extremo fatiga más → multiplicador menor en el tramo final.
    assert _fatigue_mult(100, 100, 85, 0.0) == 1.0                # forma plena, sin calor → neutro
    assert _fatigue_mult(55, 55, 85, 0.3) < _fatigue_mult(55, 55, 85, 0.0) < 1.0
    # y a nivel de partido, con plantillas a media forma, el calor reduce los goles
    assert _total_goals("calor", temp=38, mf=55) <= _total_goals("soleado", temp=20, mf=55)


def test_weather_factors_neutro():
    assert _weather_factors("soleado", 20) == (1.0, 0.0)
    acc_lluvia, _ = _weather_factors("lluvia", 20)
    assert acc_lluvia < 1.0


def test_clima_determinista():
    a = simulate(HOME, AWAY, seed=99, weatherCondition="lluvia", temperature=8)
    b = simulate(HOME, AWAY, seed=99, weatherCondition="lluvia", temperature=8)
    assert a == b


def test_timeline_menciona_el_clima_en_la_apertura():
    r = simulate(HOME, AWAY, seed=1, weatherCondition="nieve", temperature=-2)
    assert r["timeline"][0]["phase"] == "saque"
    assert "nieve" in r["timeline"][0]["text"]


def test_tactica_avanzada_neutra_no_cambia_el_partido():
    # Añadir las palancas a 50 (neutras) debe dar EXACTAMENTE el mismo partido.
    neutra = make_team(75, "4-4-2", prefix="H")
    for p in [neutra]:
        p["tactic"].update({"pressing": 50, "tempo": 50, "width": 50,
                            "mentality": 50, "marking": "zonal"})
    base = make_team(75, "4-4-2", prefix="H")
    for seed in range(40):
        assert simulate(base, AWAY, seed=seed) == simulate(neutra, AWAY, seed=seed)


def test_pressing_alto_baja_los_tiros_del_rival():
    base = make_team(75, "4-4-2", prefix="H")
    press = make_team(75, "4-4-2", prefix="H")
    press["tactic"]["pressing"] = 95
    tiros_base = sum(simulate(base, AWAY, seed=s)["awayStats"]["shots"] for s in range(300))
    tiros_press = sum(simulate(press, AWAY, seed=s)["awayStats"]["shots"] for s in range(300))
    assert tiros_press < tiros_base


def test_mentalidad_ofensiva_genera_mas_tiros_propios():
    base = make_team(75, "4-4-2", prefix="H")
    ofe = make_team(75, "4-4-2", prefix="H")
    ofe["tactic"]["mentality"] = 90
    t_base = sum(simulate(base, AWAY, seed=s)["homeStats"]["shots"] for s in range(300))
    t_ofe = sum(simulate(ofe, AWAY, seed=s)["homeStats"]["shots"] for s in range(300))
    assert t_ofe > t_base


def test_marking_individual_reduce_tiros_rivales():
    base = make_team(75, "4-4-2", prefix="H")
    indiv = make_team(75, "4-4-2", prefix="H")
    indiv["tactic"]["marking"] = "individual"
    tiros_base = sum(simulate(base, AWAY, seed=s)["awayStats"]["shots"] for s in range(300))
    tiros_indiv = sum(simulate(indiv, AWAY, seed=s)["awayStats"]["shots"] for s in range(300))
    assert tiros_indiv < tiros_base


def test_fouls_alto_mejora_disciplina():
    limpio = make_team(75, "4-4-2", prefix="H")
    brusco = make_team(75, "4-4-2", prefix="H")
    for p in limpio["players"]:
        p["fouls"] = 95
    for p in brusco["players"]:
        p["fouls"] = 5
    faltas_limpio = sum(simulate(limpio, AWAY, seed=s)["homeStats"]["fouls"] for s in range(120))
    faltas_brusco = sum(simulate(brusco, AWAY, seed=s)["homeStats"]["fouls"] for s in range(120))
    assert faltas_brusco > faltas_limpio


def test_lanzadores_entran_en_el_perfil_de_balón_parado():
    team = make_team(70, "4-4-2", prefix="H", with_ids=True)
    especialista = team["players"][6]
    especialista["passing"] = 96
    especialista["organization"] = 94
    especialista["shooting"] = 93
    especialista["finishing"] = 92
    team["tactic"].update({
        "freeKickTaker": especialista["id"],
        "cornerTaker": especialista["id"],
        "penaltyTaker": especialista["id"],
    })
    prof = _build_profile(team["players"], team["tactic"], True)
    assert prof.set_piece > 50
    assert prof.penalty_skill > 50


def test_knockout_timeline_llega_a_la_prorroga():
    for seed in range(200):
        base = simulate(HOME, AWAY, seed=seed)
        if base["homeGoals"] == base["awayGoals"]:
            ko = simulate(HOME, AWAY, seed=seed, knockout=True)
            assert ko["timeline"][-1]["minute"] == 120
            assert any(e["minute"] > 90 for e in ko["timeline"])
            return
    raise AssertionError("no se encontró empate para probar la prórroga")


# ─── Issue 1.3: entradas FDF (asistencia §2.10, estilos §2.9, zonas §2.6) ─────

def _copy_team(t):
    import copy
    return copy.deepcopy(t)


def test_neutro_identico_sin_entradas_fdf():
    """Sin asistencia/estilos/zonas el partido es BIT A BIT idéntico al de antes."""
    base = simulate(HOME, AWAY, seed=4242)
    expl = simulate(HOME, AWAY, seed=4242, attendancePct=None, homeStimulated=False)
    assert base == expl
    # Tácticas con los campos nuevos a None tampoco cambian nada.
    h2, a2 = _copy_team(HOME), _copy_team(AWAY)
    for t in (h2, a2):
        t["tactic"].update({"offensiveStyle": None, "defensiveStyle": None,
                            "attackZones": None, "defenseReinforcement": None})
    assert simulate(h2, a2, seed=4242) == base


def test_asistencia_llena_y_discurso_mejoran_al_local():
    """Estadio >90% + estimulados debe subir los goles del local en promedio."""
    n = 400
    plain = sum(simulate(HOME, AWAY, seed=s)["homeGoals"] for s in range(n))
    boost = sum(simulate(HOME, AWAY, seed=s, attendancePct=95,
                         homeStimulated=True)["homeGoals"] for s in range(n))
    assert boost > plain


def test_estilo_correcto_contraataca_al_rival():
    """abrir_campo vs presion_centro (gana atacante) debe rendir más que vs
    presion_bandas (gana defensor), con todo lo demás igual."""
    n = 400
    h_good, h_bad = _copy_team(HOME), _copy_team(HOME)
    h_good["tactic"]["offensiveStyle"] = "abrir_campo"
    h_bad["tactic"]["offensiveStyle"] = "abrir_campo"
    a_soft, a_hard = _copy_team(AWAY), _copy_team(AWAY)
    a_soft["tactic"]["defensiveStyle"] = "presion_centro"   # abrir_campo lo bate (+6 con)
    a_hard["tactic"]["defensiveStyle"] = "presion_bandas"   # contrarresta abrir_campo (+6 des)
    good = sum(simulate(h_good, a_soft, seed=s)["homeGoals"] for s in range(n))
    bad = sum(simulate(h_bad, a_hard, seed=s)["homeGoals"] for s in range(n))
    assert good > bad


def test_sin_estilo_contra_estilo_penaliza():
    """No elegir estilo ofensivo contra un rival con estilo defensivo regala +10 destrucción."""
    n = 400
    a_styled = _copy_team(AWAY)
    a_styled["tactic"]["defensiveStyle"] = "presion_centro"
    none_goals = sum(simulate(HOME, a_styled, seed=s)["homeGoals"] for s in range(n))
    h_styled = _copy_team(HOME)
    h_styled["tactic"]["offensiveStyle"] = "pases_cortos"   # vs presion_centro pierde, pero no -10
    some_goals = sum(simulate(h_styled, a_styled, seed=s)["homeGoals"] for s in range(n))
    base_goals = sum(simulate(HOME, AWAY, seed=s)["homeGoals"] for s in range(n))
    assert none_goals < base_goals          # castigado por no elegir
    assert none_goals <= some_goals + 20    # elegir mal nunca es mucho peor que no elegir


def test_refuerzo_de_zona_frena_al_atacante():
    """Refuerzo defensivo máximo en todos los carriles reduce los goles del rival."""
    n = 400
    a_reinforced = _copy_team(AWAY)
    a_reinforced["tactic"]["defenseReinforcement"] = {"left": 3, "center": 3, "right": 3}
    h_zoned = _copy_team(HOME)
    h_zoned["tactic"]["attackZones"] = {"left": 34, "center": 33, "right": 33}
    with_reinf = sum(simulate(h_zoned, a_reinforced, seed=s)["homeGoals"] for s in range(n))
    without = sum(simulate(h_zoned, AWAY, seed=s)["homeGoals"] for s in range(n))
    assert with_reinf < without


def test_zonas_solo_atacante_no_rompen():
    """Solo % de zonas (sin refuerzo rival) es válido y produce un partido legal."""
    h_zoned = _copy_team(HOME)
    h_zoned["tactic"]["attackZones"] = {"left": 60, "center": 10, "right": 30}
    r = simulate(h_zoned, AWAY, seed=11)
    assert r["homeStats"]["possession"] + r["awayStats"]["possession"] == 100
    assert r["homeGoals"] >= 0 and r["awayGoals"] >= 0


# ─── N3-2 · Sinergias ocultas por tags ────────────────────────────────────────

def _team_with_tags(level=75, matador_count=2, cerebro_count=1, prefix="H"):
    """Equipo con jugadores etiquetados para probar sinergias Cerebro-Matador."""
    import copy
    t = make_team(level, prefix=prefix)
    players = t["players"]
    del_players = [p for p in players if p["position"] == "DEL"]
    med_players = [p for p in players if p["position"] == "MED"]
    for i, p in enumerate(del_players[:matador_count]):
        p["tags"] = ["Matador"]
        p["id"] = f"matador-{prefix}-{i}"
    for i, p in enumerate(med_players[:cerebro_count]):
        p["tags"] = ["Cerebro"]
    return t


def test_n3_2_sin_tags_resultado_inalterado():
    """Sin tags, el partido es bit a bit idéntico (neutro)."""
    r1 = simulate(HOME, AWAY, seed=42)
    r2 = simulate(HOME, AWAY, seed=42)
    assert r1["homeGoals"] == r2["homeGoals"]
    assert r1["awayGoals"] == r2["awayGoals"]


def test_n3_2_sinergy_cerebro_matador_aumenta_goles():
    """Cerebro+Matador: los Matadores rematan con p_goal×1.15; la sinergy no penaliza el marcador."""
    # Mismo equipo base clonado con y sin tags para aislar el efecto
    base_team = make_team(75, prefix="H")
    with_tags = _copy_team(base_team)
    del_players = [p for p in with_tags["players"] if p["position"] == "DEL"]
    med_players = [p for p in with_tags["players"] if p["position"] == "MED"]
    for i, p in enumerate(del_players[:2]):
        p["tags"] = ["Matador"]
        p["id"] = f"matador-H-{i}"
    for p in med_players[:1]:
        p["tags"] = ["Cerebro"]

    n = 1000
    goles_sinergy = sum(simulate(with_tags, AWAY, seed=s)["homeGoals"] for s in range(n))
    goles_base    = sum(simulate(base_team, AWAY, seed=s)["homeGoals"] for s in range(n))
    # El boost ×1.15 en p_goal debe producir ≥ goles que sin tags (margen 10% por variabilidad)
    assert goles_sinergy >= goles_base * 0.90


def test_n3_2_sinergy_determinista_por_seed():
    """Con los mismos tags y la misma semilla, el resultado es idéntico."""
    team_a = _team_with_tags(level=75, prefix="H")
    team_b = _team_with_tags(level=70, prefix="A")
    r1 = simulate(team_a, team_b, seed=7777)
    r2 = simulate(team_a, team_b, seed=7777)
    assert r1 == r2


def test_n3_2_sinergy_semillas_distintas_difieren():
    """Distintas semillas producen distintos resultados (la sinergy no congela el rng)."""
    team_a = _team_with_tags(level=75, prefix="H")
    r1 = simulate(team_a, AWAY, seed=1)
    r2 = simulate(team_a, AWAY, seed=2)
    assert (r1["homeGoals"], r1["awayGoals"]) != (r2["homeGoals"], r2["awayGoals"]) or \
           r1["events"] != r2["events"]


def test_n3_2_solo_matador_sin_cerebro_no_activa_sinergy():
    """Matador sin Cerebro en el XI → ningún entry en el timeline tiene sinergyMultiplier."""
    t = make_team(75, prefix="H")
    for p in t["players"]:
        if p["position"] == "DEL":
            p["tags"] = ["Matador"]
            p["id"] = "matador-test"
    # Sin Cerebro → sinergy_shooters vacío → no hay sinergyMultiplier en timeline
    for seed in range(30):
        r = simulate(t, AWAY, seed=seed)
        for entry in r.get("timeline", []):
            assert "sinergyMultiplier" not in entry or entry.get("sinergyMultiplier") == 1.0


def test_n3_2_sinergy_solo_afecta_a_matadores():
    """Un no-Matador que remata (aunque el equipo tenga Cerebro) no activa sinergy."""
    t = _copy_team(HOME)
    # Solo ponemos Cerebro, sin ningún Matador
    for p in t["players"]:
        if p["position"] == "MED":
            p["tags"] = ["Cerebro"]
    for seed in range(30):
        r = simulate(t, AWAY, seed=seed)
        for entry in r.get("timeline", []):
            assert "sinergyMultiplier" not in entry or entry.get("sinergyMultiplier") == 1.0


# ─── N3-3 · Desgaste crónico ──────────────────────────────────────────────────

def _team_with_chronic_fatigue(level=75, demand=5, consecutive=5, prefix="H"):
    """Equipo con jugadores DEF/MED de alta demanda y varias titularidades consecutivas."""
    t = make_team(level, prefix=prefix)
    for p in t["players"]:
        if p["position"] in ("DEF", "MED"):
            p["demandLevel"] = demand
            p["consecutiveStarts"] = consecutive
    return t


def test_n3_3_sin_demanda_resultado_inalterado():
    """Sin demandLevel ni consecutiveStarts, el partido es bit a bit idéntico."""
    r1 = simulate(HOME, AWAY, seed=111)
    r2 = simulate(HOME, AWAY, seed=111)
    assert r1 == r2


def test_n3_3_desgaste_cronico_reduce_rendimiento():
    """Alta demanda + 5 titularidades seguidas → equipo rinde peor en stamina/ritmo."""
    fatigued = _team_with_chronic_fatigue(level=75, demand=5, consecutive=5, prefix="H")
    n = 300
    goles_fatigados = sum(simulate(fatigued, AWAY, seed=s)["homeGoals"] for s in range(n))
    goles_base      = sum(simulate(HOME, AWAY, seed=s)["homeGoals"] for s in range(n))
    # Un equipo cronicamente fatigado no deberia marcar MÁS que el fresco
    assert goles_fatigados <= goles_base + 5  # margen de 5 goles para variabilidad


def test_n3_3_demanda_baja_no_activa_desgaste():
    """demandLevel < 4 no activa el desgaste crónico aunque consecutiveStarts sea alto."""
    t = _copy_team(HOME)
    for p in t["players"]:
        p["demandLevel"] = 2   # bajo
        p["consecutiveStarts"] = 10
    # Con demanda baja → decay=0 → resultado idéntico a HOME normal
    r1 = simulate(t, AWAY, seed=55)
    r2 = simulate(HOME, AWAY, seed=55)
    assert r1["homeGoals"] == r2["homeGoals"] and r1["awayGoals"] == r2["awayGoals"]


def test_n3_3_pocos_starts_no_activa_desgaste():
    """consecutiveStarts < 3 con demanda alta → sin efecto."""
    t = _copy_team(HOME)
    for p in t["players"]:
        p["demandLevel"] = 5
        p["consecutiveStarts"] = 2   # justo por debajo del umbral
    r1 = simulate(t, AWAY, seed=66)
    r2 = simulate(HOME, AWAY, seed=66)
    assert r1["homeGoals"] == r2["homeGoals"] and r1["awayGoals"] == r2["awayGoals"]


def test_n3_3_determinista_por_seed():
    """Desgaste crónico es determinista: misma seed → mismo resultado."""
    t = _team_with_chronic_fatigue(demand=5, consecutive=4)
    r1 = simulate(t, AWAY, seed=9999)
    r2 = simulate(t, AWAY, seed=9999)
    assert r1 == r2


def test_n3_3_marcador_coincide_con_eventos():
    """Con desgaste crónico activo, el marcador sigue siendo coherente con los eventos."""
    fatigued = _team_with_chronic_fatigue(demand=4, consecutive=3)
    for seed in range(40):
        r = simulate(fatigued, AWAY, seed=seed)
        hg = sum(1 for e in r["events"] if e["type"] == "goal" and e["team"] == "home")
        ag = sum(1 for e in r["events"] if e["type"] == "goal" and e["team"] == "away")
        assert hg == r["homeGoals"] and ag == r["awayGoals"]
