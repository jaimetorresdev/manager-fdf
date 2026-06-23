# ─── Calibración del motor de DESARROLLO (separado del partido) ───────────────
# Simula temporadas (≈40 periodos de entrenamiento) sobre arquetipos de jugador y
# reporta la evolución media del overall, para afinar las constantes de
# development.py. No toca la calibración del partido (calibrate.py).
#
#   python calibrate_dev.py            # informe (200 jugadores/arquetipo)
#   python calibrate_dev.py 500

import random
import sys

from app.development import calc_development
from app.engine import ATTRS

PERIODS_PER_SEASON = 40


def make_player(age, potential, overall, rng, personality="profesional"):
    spread = lambda b: max(1.0, min(99.0, b + rng.uniform(-4, 4)))
    p = {k: spread(overall) for k in ATTRS}
    p.update({"name": "X", "age": age, "potential": potential,
              "personality": personality, "consistency": rng.uniform(50, 85),
              "injuryProneness": rng.uniform(15, 45),
              "muscularFitness": 90, "matchRhythm": 85})
    return p


def run_season(player, rng, focus="general"):
    cur = dict(player)
    start_attr = {a: cur[a] for a in ATTRS}
    start = sum(start_attr.values()) / len(ATTRS)
    pot = player["potential"]
    for t in range(PERIODS_PER_SEASON):
        ctx = {"trainingFocus": focus, "minutesPlayed": rng.choice([0, 90, 180, 270]),
               "matchRating": rng.uniform(5.5, 7.8), "restDays": rng.choice([2, 3, 4, 5]),
               "academyLevel": 40}
        r = calc_development(cur, ctx, seed=rng.randint(0, 10 ** 9))
        cur.update(r["newAttributes"])
        # Invariante: ningún atributo supera su techo = max(valor inicial, potential).
        assert all(cur[a] <= max(start_attr[a], pot) + 0.01 for a in ATTRS), "¡superó el potential!"
    end = sum(cur[a] for a in ATTRS) / len(ATTRS)
    return start, end


def report(label, age, pot, ov, n, rng):
    deltas = []
    for _ in range(n):
        s, e = run_season(make_player(age, pot, ov, rng), rng)
        deltas.append(e - s)
    deltas.sort()
    avg = sum(deltas) / len(deltas)
    print(f"  {label:<34} Δ medio {avg:+.2f}/temporada   "
          f"(p10 {deltas[len(deltas)//10]:+.2f}, p90 {deltas[9*len(deltas)//10]:+.2f})")


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    rng = random.Random(7)
    print(f"\n=== Desarrollo por arquetipo  (n={n}, {PERIODS_PER_SEASON} periodos/temporada) ===")
    report("Crack joven (18, pot 90, ov 70)", 18, 90, 70, n, rng)
    report("Promesa (20, pot 82, ov 72)", 20, 82, 72, n, rng)
    report("Joven techo bajo (19, pot 72, ov 70)", 19, 72, 70, n, rng)
    report("Prime (26, pot 80, ov 80)", 26, 80, 80, n, rng)
    report("Veterano (33, pot 85, ov 83)", 33, 85, 83, n, rng)
    report("Veterano viejo (36, pot 85, ov 80)", 36, 85, 80, n, rng)


if __name__ == "__main__":
    main()
