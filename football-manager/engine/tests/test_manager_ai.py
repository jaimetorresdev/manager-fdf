# ─── Tests de la IA de entrenador ─────────────────────────────────────────────
from app.engine import ATTRS, _pos
from app.manager_ai import pick_lineup, suggest_subs, _parse_formation


def make_pool(n_por=3, n_def=8, n_med=8, n_del=6, lvl=70):
    players = []
    counts = {"POR": n_por, "DEF": n_def, "MED": n_med, "DEL": n_del}
    i = 0
    for pos, n in counts.items():
        for _ in range(n):
            a = {k: lvl for k in ATTRS}
            # cada uno destaca en su rol natural
            if pos == "POR": a["goalkeeping"] = lvl + 15
            if pos == "DEF": a["tackling"] = lvl + 12
            if pos == "MED": a["organization"] = lvl + 12; a["passing"] = lvl + 10
            if pos == "DEL": a["finishing"] = lvl + 14
            players.append({"name": f"{pos}{i}", "id": f"id{i}", "position": pos,
                            "fitness": 100, "muscularFitness": 100, **a})
            i += 1
    return players


def test_parse_formation():
    assert _parse_formation("4-4-2") == (4, 4, 2)
    assert _parse_formation("4-3-3") == (4, 3, 3)
    assert _parse_formation("4-2-3-1") == (4, 5, 1)
    assert _parse_formation("basura") == (4, 4, 2)


def test_once_tiene_11_y_un_portero():
    r = pick_lineup(make_pool(), "equilibrado", seed=1)
    assert len(r["xi"]) == 11
    porteros = [s for s in r["xi"] if s["position"] == "POR"]
    assert len(porteros) == 1


def test_respeta_la_estructura_de_la_formacion():
    r = pick_lineup(make_pool(), "ofensivo", seed=1)   # 4-3-3
    n_def = sum(1 for s in r["xi"] if s["position"] == "DEF")
    n_del = sum(1 for s in r["xi"] if s["position"] == "DEL")
    assert r["formation"] == "4-3-3"
    assert n_def == 4 and n_del == 3


def test_excluye_lesionados_y_sancionados():
    pool = make_pool()
    # marcar 4 titulares potenciales como no disponibles
    pool[0]["isInjured"] = True            # un portero
    pool[3]["available"] = False
    pool[11]["suspendedMatches"] = 2       # un medio
    pool[19]["isSuspended"] = True         # un delantero
    no_disp = {"id0", "id3", "id11", "id19"}
    r = pick_lineup(pool, "equilibrado", seed=2)
    elegidos = {s["playerId"] for s in r["xi"]}
    assert elegidos.isdisjoint(no_disp)


def test_objetivo_define_formacion_y_mentalidad():
    ofe = pick_lineup(make_pool(), "ofensivo", seed=1)
    defe = pick_lineup(make_pool(), "defensivo", seed=1)
    assert ofe["tactic"]["mentality"] > defe["tactic"]["mentality"]
    assert ofe["formation"] == "4-3-3" and defe["formation"] == "5-3-2"


def test_define_lanzadores():
    r = pick_lineup(make_pool(), "equilibrado", seed=1)
    ids = {s["playerId"] for s in r["xi"]}
    assert r["tactic"]["penaltyTaker"] in ids
    assert r["tactic"]["freeKickTaker"] in ids


def test_determinista():
    pool = make_pool()
    assert pick_lineup(pool, "ofensivo", seed=7) == pick_lineup(pool, "ofensivo", seed=7)


def test_elige_mejores_por_rol():
    # Un delantero claramente superior debe entrar en el once.
    pool = make_pool()
    crack = {"name": "CRACK", "id": "crack", "position": "DEL",
             "fitness": 100, "muscularFitness": 100, **{k: 99 for k in ATTRS}}
    pool.append(crack)
    r = pick_lineup(pool, "ofensivo", seed=1)
    assert "crack" in {s["playerId"] for s in r["xi"]}


def test_suggest_subs_pierde_tarde_mete_ataque():
    base = make_pool(n_por=1, n_def=4, n_med=4, n_del=2)   # 11 titulares
    xi = base
    bench = make_pool(n_por=1, n_def=2, n_med=2, n_del=2)
    subs = suggest_subs(xi, bench, minute=80, score_diff=-1, seed=1)
    assert any(s["reason"] == "tactical" for s in subs)
    # nunca propone más de 3
    assert len(suggest_subs(xi, bench, minute=85, score_diff=-1, seed=1)) <= 3


def test_suggest_subs_pronto_no_cambia():
    xi = make_pool(n_por=1, n_def=4, n_med=4, n_del=2)
    bench = make_pool(n_por=1, n_def=2, n_med=2, n_del=2)
    assert suggest_subs(xi, bench, minute=30, score_diff=0, seed=1) == []
