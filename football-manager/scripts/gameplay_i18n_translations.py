"""EN -> FR/DE/IT translation dictionaries for gameplay i18n."""
from __future__ import annotations

import json
from pathlib import Path

from gameplay_i18n_engine import FR_GLOSSARY, KEEP

SCRIPTS = Path(__file__).resolve().parent

_overrides = json.loads((SCRIPTS / "gameplay-i18n-de-it-overrides.json").read_text(encoding="utf-8"))

EN_TO_FR: dict[str, str] = dict(FR_GLOSSARY)
EN_TO_DE: dict[str, str] = dict(_overrides["de"])
EN_TO_IT: dict[str, str] = dict(_overrides["it"])

for k in KEEP:
    EN_TO_FR.setdefault(k, k)
    EN_TO_DE.setdefault(k, k)
    EN_TO_IT.setdefault(k, k)

# Loanwords / abbreviations shared across locales
_SHARED = {
    "Assistants": "Assistants",
    "D": "D",
    "DERBY": "DERBY",
    "Derby": "Derby",
    "Dribbling": "Dribbling",
    "Avatar": "Avatar",
    "Bonus": "Bonus",
    "Calendario": "Calendario",
    "Champions League": "Champions League",
    "Club": "Club",
    "Europa League": "Europa League",
    "FDF Today": "FDF Today",
    "FINAL": "FINAL",
    "GF": "GF",
    "MAX LEVEL": "MAX LEVEL",
    "Min": "Min",
    "Pos": "Pos",
    "Pts": "Pts",
    "Rankings": "Rankings",
    "Scouting": "Scouting",
    "...": "...",
    "/ 5 MAX": "/ 5 MAX",
    "{{home}} {{homeGoals}} – {{awayGoals}} {{away}}": "{{home}} {{homeGoals}} – {{awayGoals}} {{away}}",
}
# Extra EN keys that share spelling with English but need locale-specific entries
_EXTRA_FR: dict[str, str] = {
    "Assistants": "Assistants",
    "Derby": "Derby",
    "Style": "Style",
    "Date": "Date",
    "Maximum": "Maximum",
    "Organisation": "Organisation",
    "Match": "Match",
    "Position {{pos}}": "Position {{pos}}",
    "Position {{pos}}, {{club}}": "Position {{pos}}, {{club}}",
    "Prestige": "Prestige",
    "Prestige 2.0": "Prestige 2.0",
    "Projection": "Projection",
    "Tension": "Tension",
    "Zone…": "Zone…",
    "D": "N",
    "DD Recommends": "DD recommande",
}
_EXTRA_DE: dict[str, str] = {
    "Derby": "Derby",
    "DERBY": "DERBY",
    "GC": "GT",
    "LIVE": "LIVE",
    "TRAINING…": "TRAINING…",
    "DD Recommends": "DD empfiehlt",
    "Live": "Live",
    "Tackling": "Zweikampf",
    "Tickets": "Tickets",
    "Training": "Training",
    "Training «{{type}}»": "Training «{{type}}»",
    "Motivator": "Motivator",
    "Maximum": "Maximal",
    "LEVEL {{level}}": "LEVEL {{level}}",
    "Level": "Level",
    "Level {{level}}": "Level {{level}}",
    "Name": "Name",
    "Scout": "Scout",
    "Scouts": "Scouts",
    "Scout…": "Scout…",
    "Outsourcing": "Outsourcing",
    "Dribbling": "Dribbling",
}
_EXTRA_IT: dict[str, str] = {
    "Derby": "Derby",
    "DERBY": "DERBY",
    "D": "P",
    "DD Recommends": "DD consiglia",
    "Dribbling": "Dribbling",
    "Outsourcing": "Esternalizzazioni",
    "Elite psychologist": "Psicologo d'elite",
}

EN_TO_FR.update(_EXTRA_FR)
EN_TO_DE.update(_EXTRA_DE)
EN_TO_IT.update(_EXTRA_IT)

for k, v in _SHARED.items():
    EN_TO_FR.setdefault(k, FR_GLOSSARY.get(k, v))
    EN_TO_DE.setdefault(k, _overrides["de"].get(k, v))
    EN_TO_IT.setdefault(k, _overrides["it"].get(k, v))
