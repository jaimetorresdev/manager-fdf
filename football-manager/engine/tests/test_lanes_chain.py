# ─── C7 · Jugadas por carril + cadena completa con duelos ─────────────────────
# Cada jugada del timeline lleva su CARRIL (attackZones manda; sin zonas deriva
# de formación+width) y cada gol adjunta la CADENA completa con el duelo de
# atributos (atacante vs defensor) que decidió cada eslabón.

from app.engine import simulate

POSITIONS = ["POR", "DEF", "DEF", "DEF", "DEF", "MED", "MED", "MED", "MED", "DEL", "DEL"]


def _team(q=65):
    players = [{
        "id": str(i + 1), "name": f"J{i+1}", "position": POSITIONS[i],
        "passing": q, "tackling": q, "shooting": q, "organization": q,
        "unmarking": q, "finishing": q, "dribbling": q, "fouls": q,
        "goalkeeping": q if POSITIONS[i] == "POR" else 20,
        "fitness": 100, "morale": 75, "experience": 60, "isStarter": True,
    } for i in range(11)]
    return {"players": players,
            "tactic": {"formation": "4-4-2", "construction": 50, "destruction": 50}}


def _with(team, **tactic_extra):
    import copy
    t = copy.deepcopy(team)
    t["tactic"].update(tactic_extra)
    return t


def _lanes(result, team):
    return [e["lane"] for e in result["timeline"]
            if e.get("lane") and e["team"] == team and e["phase"] != "saque"]


def test_toda_jugada_narrada_lleva_carril():
    r = simulate(_team(), _team(), seed=7)
    for e in r["timeline"]:
        if e["phase"] in ("remate", "gol", "parada"):
            assert e.get("lane") in ("left", "center", "right"), e


def test_carriles_respetan_attackzones():
    """A/B con mismas semillas: cargar la izquierda debe producir MUCHOS más
    eventos por la izquierda que el espejo cargado a la derecha."""
    n = 60
    left_h = _with(_team(), attackZones={"left": 80, "center": 10, "right": 10})
    right_h = _with(_team(), attackZones={"left": 10, "center": 10, "right": 80})
    lcount = rcount = 0
    for s in range(n):
        lcount += _lanes(simulate(left_h, _team(), seed=s), "home").count("left")
        rcount += _lanes(simulate(right_h, _team(), seed=s), "home").count("left")
    assert lcount > rcount * 2, (lcount, rcount)


def test_carril_por_defecto_deriva_de_formacion_y_width():
    """Sin attackZones: 4-3-3 con width alto debe tirar más de bandas que
    3-5-2 con width bajo (mismas plantillas y semillas)."""
    n = 60
    wide = _with(_team(), formation="4-3-3", width=90)
    narrow = _with(_team(), formation="3-5-2", width=10)
    wide_wings = narrow_wings = 0
    for s in range(n):
        lw = _lanes(simulate(wide, _team(), seed=s), "home")
        ln = _lanes(simulate(narrow, _team(), seed=s), "home")
        wide_wings += sum(1 for x in lw if x != "center")
        narrow_wings += sum(1 for x in ln if x != "center")
    assert wide_wings > narrow_wings, (wide_wings, narrow_wings)


def test_gol_lleva_cadena_completa_con_duelos():
    """Cada gol del timeline expone `chain` con eslabones válidos, y cada
    eslabón el duelo de atributos exacto (att siempre; def con sus valores)."""
    found = 0
    for s in range(40):
        r = simulate(_team(), _team(), seed=s)
        for e in r["timeline"]:
            if e["phase"] != "gol":
                continue
            found += 1
            chain = e.get("chain")
            assert isinstance(chain, list) and chain, e
            steps = [link["step"] for link in chain]
            assert steps[-1] == "remate"
            assert set(steps) <= {"recuperacion", "regate", "pase_clave", "remate"}
            for link in chain:
                assert link["lane"] in ("left", "center", "right")
                assert link["att"]["attrs"], link            # atributos del atacante
                if link["def"] is not None:
                    assert link["def"]["attrs"], link        # y del defensor del eslabón
            # El remate es contra el portero (si el rival lo tiene).
            shot = chain[-1]
            assert shot["def"] is None or shot["def"]["position"] == "POR"
            # El duelo final usa SALIDAS (goalkeeping) o REFLEJOS (reflexes) del
            # portero según la jugada (split FDF de portería).
            _gk_attrs = (shot["def"] or {}).get("attrs", {"goalkeeping": 1})
            assert "goalkeeping" in _gk_attrs or "reflexes" in _gk_attrs
    assert found > 0


def test_paradas_y_remates_llevan_duelo_vs_portero():
    r = simulate(_team(), _team(), seed=3)
    duels = [e for e in r["timeline"] if e["phase"] in ("remate", "parada", "gol")]
    assert duels
    for e in duels:
        d = e.get("duel")
        assert d and d["att"]["attrs"], e
        if d["def"] is not None:
            assert d["def"]["position"] == "POR"


def test_attackzones_son_palanca_real_pero_determinista():
    """Con el catálogo REAL del Excel cada carril (izq/centro/der) usa jugadas
    DISTINTAS (posiciones y habilidades propias), así que elegir por dónde atacar
    SÍ puede mover el marcador (manual §2.6: ataca tu lado fuerte). Lo que se
    exige es que siga siendo determinista por semilla y produzca partidos válidos."""
    for s in range(30):
        zoned = _with(_team(), attackZones={"left": 70, "center": 20, "right": 10})
        a = simulate(zoned, _team(), seed=s)
        b = simulate(zoned, _team(), seed=s)
        assert a == b                                   # determinista
        assert a["homeStats"]["possession"] + a["awayStats"]["possession"] == 100
        assert a["homeGoals"] >= 0 and a["awayGoals"] >= 0


def test_determinismo_con_carriles():
    a = simulate(_team(), _team(), seed=99)
    b = simulate(_team(), _team(), seed=99)
    assert a == b
