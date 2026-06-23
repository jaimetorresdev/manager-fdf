# ─── Calibración Monte Carlo del motor v3 (por jugador) ───────────────────────
# Genera plantillas sintéticas por nivel y posición, tira miles de partidos y
# reporta distribuciones para ajustar las constantes de engine.py.
#   python calibrate.py            # informe (20k partidos)
#   python calibrate.py 50000      # nº de simulaciones
#
# Referencia (ligas top): ~2.7 goles/partido, V/E/D local ~45/26/29%,
# ~12 tiros/equipo, ~1.8 amarillas/equipo.

import random
import sys
import numpy as np

from app.engine import simulate

POSITIONS = ["POR"] + ["DEF"] * 4 + ["MED"] * 4 + ["DEL"] * 2


def _around(base: float, rng: random.Random, spread: float = 6.0) -> float:
    return max(1.0, min(99.0, base + rng.uniform(-spread, spread)))


def make_roster(level: float, rng: random.Random, prefix: str = "P") -> dict:
    players = []
    for i, pos in enumerate(POSITIONS):
        a = {k: _around(level - 6, rng) for k in
             ("passing", "tackling", "shooting", "organization", "unmarking",
              "finishing", "dribbling", "fouls", "goalkeeping")}
        if pos == "POR":
            a["goalkeeping"] = _around(level + 10, rng)
        elif pos == "DEF":
            a["tackling"] = _around(level + 8, rng)
            a["passing"] = _around(level, rng)
        elif pos == "MED":
            a["organization"] = _around(level + 8, rng)
            a["passing"] = _around(level + 6, rng)
        elif pos == "DEL":
            a["finishing"] = _around(level + 10, rng)
            a["shooting"] = _around(level + 8, rng)
            a["unmarking"] = _around(level + 8, rng)
        players.append({"name": f"{prefix}{i}", "position": pos, "isStarter": True,
                        "fitness": 100, "morale": 75, "experience": 60, **a})
    return {"players": players, "tactic": {"formation": "4-4-2", "construction": 50, "destruction": 50}}


def run(n: int, home: dict, away: dict, seed0: int = 1) -> dict:
    hg = np.zeros(n, int); ag = np.zeros(n, int)
    hs = np.zeros(n, int); hsot = np.zeros(n, int); hy = np.zeros(n, int); reds = np.zeros(n, int)
    win_r = np.zeros(n); motm_r = np.zeros(n)
    for i in range(n):
        r = simulate(home, away, seed0 + i)
        hg[i], ag[i] = r["homeGoals"], r["awayGoals"]
        hs[i], hsot[i] = r["homeStats"]["shots"], r["homeStats"]["shotsOnTarget"]
        hy[i] = r["homeStats"]["yellowCards"]
        reds[i] = r["homeStats"]["redCards"] + r["awayStats"]["redCards"]
        all_r = r["homeRatings"] + r["awayRatings"]
        motm_r[i] = max(x["rating"] for x in all_r)
    return dict(hg=hg, ag=ag, hs=hs, hsot=hsot, hy=hy, reds=reds, motm_r=motm_r)


def report(label: str, d: dict) -> None:
    hg, ag, n = d["hg"], d["ag"], len(d["hg"])
    print(f"\n=== {label}  (n={n}) ===")
    print(f"  Goles local/visit/total : {hg.mean():.2f} / {ag.mean():.2f} / {(hg+ag).mean():.2f}")
    print(f"  V/E/D (local)           : {np.mean(hg>ag)*100:4.1f}% / {np.mean(hg==ag)*100:4.1f}% / {np.mean(hg<ag)*100:4.1f}%")
    print(f"  Tiros / a puerta (local): {d['hs'].mean():.1f} / {d['hsot'].mean():.1f}")
    print(f"  Amarillas/equipo        : {d['hy'].mean():.2f}   Rojas/partido: {d['reds'].mean():.3f}")
    print(f"  Nota MOTM (media)       : {d['motm_r'].mean():.2f}")
    vals, counts = np.unique(hg, return_counts=True)
    print("  Dist. goles local       : " + "  ".join(f"{v}:{c/n*100:.0f}%" for v, c in zip(vals, counts) if v <= 5))


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
    rg = random.Random(42)
    equal_h = make_roster(75, rg, "H")
    equal_a = make_roster(75, rg, "A")
    report("Equipos parejos (nivel 75, ventaja de campo)", run(n, equal_h, equal_a))

    strong = make_roster(90, rg, "S")
    weak = make_roster(58, rg, "W")
    d = run(n, strong, weak)
    report("Fuerte (local) vs Débil", d)
    print(f"  → El fuerte gana el {np.mean(d['hg']>d['ag'])*100:.1f}% de las veces")


if __name__ == "__main__":
    main()
