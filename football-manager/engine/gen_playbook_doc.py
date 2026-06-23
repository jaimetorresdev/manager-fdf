#!/usr/bin/env python3
"""Genera `docs/FORMACIONES-JUGADAS-Y-HABILIDADES.md` desde el playbook GENERATIVO
(`app/fdf_playbook.py`). Reejecutar tras tocar patrones/dibujos/caracteres:

    cd football-manager/engine && ./venv/bin/python gen_playbook_doc.py
"""
from __future__ import annotations

import os
from collections import Counter

from app import fdf_playbook as PB

LINE_ES = {"DEF": "Defensa", "MID": "Mediocampo", "FWD": "Ataque"}
LANE_ES = {"L": "izquierda", "C": "centro", "R": "derecha"}
ZONE_ES = {"left": "izquierda", "center": "centro", "right": "derecha"}

# Formaciones a documentar: las del manual + las variantes del motor.
FORMS = list(PB._CHAR.keys())


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    L = [
        "# Formaciones · Jugadas · Habilidades por fase",
        "",
        "> Catálogo **generado** por `engine/app/fdf_playbook.py` a partir del DIBUJO de "
        "cada formación (sus posiciones por línea y carril) y una biblioteca de patrones "
        "inspirada en el Excel `Tacticas_FDF.xlsx`. Cada formación tiene su **propio** "
        "catálogo (máxima variabilidad). Regenerar con `engine/gen_playbook_doc.py`. "
        "Mecánica de resolución (1d40, valor de fase): `docs/MOTOR-FDF-1D40.md`.",
        "",
        "Cada jugada es una secuencia de fases `Habilidad Posición`. Según por dónde "
        "ataques (zonas de ataque, §2.6) se usan unas jugadas u otras. El defensor de "
        "cada fase: primeras → **mediocampo**, las previas al remate → **defensa**, la "
        "última → **portero**. Finalización: **Tiro** (raso) o **Remate** (cabeza), que "
        "el portero para con **Reflejos** (juego abierto) o **Colocación** (balón parado).",
        "",
    ]

    for form in FORMS:
        slots = PB.layout(form)
        pb = PB.build_playbook(form)
        field = [j for j in pb if j["kind"] == "field"]
        by_zone = {"left": [], "center": [], "right": []}
        for j in field:
            by_zone[j["lane"]].append(j)

        L.append(f"## {form}")
        L.append(f"*{len(field)} jugadas de campo · izquierda {len(by_zone['left'])} · "
                 f"centro {len(by_zone['center'])} · derecha {len(by_zone['right'])}*")
        L.append("")

        # Dibujo (las 10 posiciones de campo)
        lines_txt = []
        for ln in ("DEF", "MID", "FWD"):
            codes = [s["code"] for s in slots if s["line"] == ln]
            if codes:
                lines_txt.append(f"{LINE_ES[ln]}: {' · '.join(codes)}")
        L.append("**Dibujo (posiciones de campo):** " + "  |  ".join(lines_txt))
        L.append("")

        # Resumen para fichar/alinear
        per_pos: dict[str, Counter] = {}
        fin: Counter = Counter()
        for j in field:
            for i, ph in enumerate(j["phases"]):
                per_pos.setdefault(ph["position"], Counter())[ph["ability"]] += 1
                if i == len(j["phases"]) - 1:
                    fin[ph["position"]] += 1
        L.append("**Posiciones y habilidades a priorizar** (nº de fases por habilidad; "
                 "⚽ = jugadas que finaliza):")
        L.append("")
        order = [s["code"] for s in slots if s["code"] in per_pos]
        order += [c for c in per_pos if c not in order]
        for code in sorted(order, key=lambda c: (-sum(per_pos[c].values()), c)):
            ab = ", ".join(f"{a} ×{n}" for a, n in per_pos[code].most_common())
            f = f" · ⚽×{fin[code]}" if fin[code] else ""
            L.append(f"- **{code}** ({PB.pos_label(code)}): {ab}{f}")
        L.append("")

        # Jugadas por zona
        for zone in ("left", "center", "right"):
            jugs = by_zone[zone]
            if not jugs:
                continue
            L.append(f"### {form} · ataque por {ZONE_ES[zone]} ({len(jugs)} jugadas)")
            L.append("")
            for n, j in enumerate(jugs, 1):
                chain = " → ".join(f"{ph['ability']} {ph['position']}" for ph in j["phases"])
                tag = j.get("archetype", "")
                L.append(f"{n:2}. *{tag}* — {chain}")
            L.append("")

    out_path = os.path.normpath(os.path.join(here, "..", "..", "docs",
                                             "FORMACIONES-JUGADAS-Y-HABILIDADES.md"))
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L).rstrip() + "\n")
    print(f"Escrito {out_path} ({len(L)} líneas, {len(FORMS)} formaciones).")


if __name__ == "__main__":
    main()
