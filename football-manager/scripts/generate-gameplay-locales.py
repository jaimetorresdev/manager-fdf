#!/usr/bin/env python3
"""Apply gameplay locale maps to gameplay.es.json → gameplay.{en,fr,de,it}.json."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOC = ROOT / "src" / "locales"
SCRIPTS = ROOT / "scripts"


def load_en_map() -> dict[str, str]:
    ext = (SCRIPTS / "extend-gameplay-i18n.py").read_text().replace("Path(__file__)", 'Path(".")')
    ns: dict = {}
    exec(ext.split("def deep_merge")[0], ns)
    merged = dict(ns["EN_MAP"])
    complete = SCRIPTS / "gameplay-i18n-en-complete.json"
    if complete.exists():
        merged.update(json.loads(complete.read_text(encoding="utf-8")))
    return merged


def load_lang_map(lang: str, en_map: dict[str, str]) -> dict[str, str]:
    path = SCRIPTS / f"gameplay-i18n-{lang}-complete.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return en_map if lang == "en" else {}


def apply_map(obj, mapping: dict[str, str]):
    if isinstance(obj, dict):
        return {k: apply_map(v, mapping) for k, v in obj.items()}
    if isinstance(obj, list):
        return [apply_map(x, mapping) for x in obj]
    if isinstance(obj, str):
        return mapping.get(obj, obj)
    return obj


def leaves(obj):
    if isinstance(obj, dict):
        for v in obj.values():
            yield from leaves(v)
    elif isinstance(obj, str):
        yield obj


def main() -> None:
    es = json.loads((LOC / "gameplay.es.json").read_text(encoding="utf-8"))
    en_map = load_en_map()
    uniq = set(leaves(es))

    for lang in ("en", "fr", "de", "it"):
        if lang == "en":
            mapping = en_map
        else:
            mapping = load_lang_map(lang, en_map)
            # Never expose Spanish in non-ES locales: fall back to EN for gaps
            for s in uniq:
                if s not in mapping:
                    mapping[s] = en_map.get(s, s)

        out = apply_map(es, mapping)
        (LOC / f"gameplay.{lang}.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        if lang == "en":
            missing = [s for s in uniq if s not in en_map]
            print(f"en map gaps: {len(missing)}")
        untranslated = sum(1 for s in leaves(out) if s in uniq and lang != "es")
        print(f"{lang}: wrote gameplay.{lang}.json")


if __name__ == "__main__":
    main()
