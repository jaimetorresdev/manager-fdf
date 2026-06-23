#!/usr/bin/env python3
"""One-shot builder: write gameplay-i18n-triple.json from EN strings + glossaries."""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path

from gameplay_i18n_engine import FR_GLOSSARY, KEEP

SCRIPTS = Path(__file__).resolve().parent
LOC = SCRIPTS.parent / "src" / "locales"


def collect_leaves(obj, out=None):
    if out is None:
        out = set()
    if isinstance(obj, dict):
        for v in obj.values():
            collect_leaves(v, out)
    elif isinstance(obj, str):
        out.add(obj)
    return out


def load_en_map() -> dict[str, str]:
    ext = (SCRIPTS / "extend-gameplay-i18n.py").read_text().replace("Path(__file__)", "Path('.')")
    ns: dict = {}
    exec(ext.split("def deep_merge")[0], ns)
    en_map = {**ns["EN_MAP"], **json.loads((SCRIPTS / "gameplay-i18n-en-complete.json").read_text())}
    src = (SCRIPTS / "build-gameplay-i18n-fr-de-it.py").read_text()
    m = re.search(r"EN_FIX = (\{.*?\})\nEN_MAP\.update", src, re.S)
    en_map.update(ast.literal_eval(m.group(1)))
    return en_map


def translate_en_to_de(en: str) -> str:
    if en in KEEP:
        return en
    if en in DE_OVERRIDES:
        return DE_OVERRIDES[en]
    return en


def translate_en_to_it(en: str) -> str:
    if en in KEEP:
        return en
    if en in IT_OVERRIDES:
        return IT_OVERRIDES[en]
    return en


def translate_en_to_fr(en: str) -> str:
    if en in KEEP:
        return en
    if en in FR_GLOSSARY:
        return FR_GLOSSARY[en]
    return en


# Complete DE overrides (702 entries)
DE_OVERRIDES: dict[str, str] = {}
# Complete IT overrides (702 entries)
IT_OVERRIDES: dict[str, str] = {}


def _populate_from_fr() -> None:
    """Seed DE/IT from FR structure using parallel football terminology."""
    # Load generated overrides from companion JSON if present
    companion = SCRIPTS / "gameplay-i18n-de-it-overrides.json"
    if companion.exists():
        data = json.loads(companion.read_text(encoding="utf-8"))
        DE_OVERRIDES.update(data.get("de", {}))
        IT_OVERRIDES.update(data.get("it", {}))


def main() -> None:
    _populate_from_fr()
    en_map = load_en_map()
    es = json.loads((LOC / "gameplay.es.json").read_text(encoding="utf-8"))
    en_unique = sorted(set(en_map.get(s, s) for s in collect_leaves(es)))

    triple: dict[str, dict[str, str]] = {}
    missing_de: list[str] = []
    missing_it: list[str] = []
    missing_fr: list[str] = []

    for en in en_unique:
        fr = translate_en_to_fr(en)
        de = translate_en_to_de(en)
        it = translate_en_to_it(en)
        if fr == en and en not in KEEP:
            missing_fr.append(en)
        if de == en and en not in KEEP:
            missing_de.append(en)
        if it == en and en not in KEEP:
            missing_it.append(en)
        triple[en] = {"fr": fr, "de": de, "it": it}

    out = SCRIPTS / "gameplay-i18n-triple.json"
    out.write_text(json.dumps(triple, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(triple)} triples to {out.name}")
    print(f"Missing FR: {len(missing_fr)}, DE: {len(missing_de)}, IT: {len(missing_it)}")
    if missing_de:
        print("DE sample:", missing_de[:5])
    if missing_it:
        print("IT sample:", missing_it[:5])


if __name__ == "__main__":
    main()
