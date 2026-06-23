#!/usr/bin/env python3
"""Generate gameplay-i18n-{fr,de,it}-complete.json from gameplay.es.json."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOC = ROOT / "src" / "locales"
SCRIPTS = ROOT / "scripts"

_ext = (SCRIPTS / "extend-gameplay-i18n.py").read_text().replace("Path(__file__)", "Path('.')")
_ns: dict = {}
exec(_ext.split("def deep_merge")[0], _ns)
EN_MAP: dict[str, str] = _ns["EN_MAP"]
EN_MAP = {
    **EN_MAP,
    **json.loads((SCRIPTS / "gameplay-i18n-en-complete.json").read_text(encoding="utf-8")),
}

EN_FIX = {
    "Acciones": "Shares",
    "Acciones requeridas": "Shares required",
    "Ampliación": "Expansion",
    "Anterior": "Previous",
    "Asistencia": "Attendance",
    "Asistencias": "Assists",
    "Avanzar jornada": "Advance matchday",
    "Bonificaciones por Asistencia": "Attendance bonuses",
    "Buscar": "Search",
    "CAMBIAR A 2D": "SWITCH TO 2D",
    "Calendario": "Calendar",
    "Cancelar servicio": "Cancel service",
    "Cancelar subcontrata": "Cancel outsource",
    "Capacidad": "Capacity",
    "Cargando información del estadio...": "Loading stadium information...",
    "Ceder jugador": "Loan player",
    "Cerrar Entreno ({{uses}}/2)": "Close Training ({{uses}}/2)",
    "Cerrar entrenamientos": "Close training",
    "Clasificación": "Standings",
    "Clasificación: {{league}}": "Standings: {{league}}",
    "Confirmar pago": "Confirm payment",
    "Confirmar puja": "Confirm bid",
    "Construir": "Build",
    "Derechos de imagen": "Image rights",
    "Economía no disponible": "Economy unavailable",
    "Elige club y jugador.": "Choose club and player.",
    "En Obra": "Under construction",
    "Entradas": "Tickets",
    "Entrenamiento": "Training",
    "Entrenamiento cerrado": "Training closed",
    "Error al avanzar jornada: {{msg}}": "Error advancing matchday: {{msg}}",
    "Error al contratar. Revisa tu presupuesto.": "Error hiring. Check your budget.",
    "Error al despedir.": "Error dismissing.",
    "Error al iniciar la obra": "Could not start construction",
    "Error al simular: {{msg}}": "Error simulating: {{msg}}",
    "Estadio no disponible": "Stadium unavailable",
    "Estado Instalaciones": "Facility status",
    "Ingresos": "Revenue",
    "Jornada procesada — {{count}} partido(s) jugado(s)": "Matchday processed — {{count}} match(es) played",
    "Jugador no disponible": "Player unavailable",
    "Mejoras y Ampliaciones": "Upgrades and expansions",
    "Memoria económica del club": "Club financial report",
    "Mercado de fichajes": "Transfer market",
    "Multijugador": "Multiplayer",
    "Negociaciones": "Negotiations",
    "Negociaciones no disponibles": "Negotiations unavailable",
    "No hay agentes libres": "No free agents",
    "No hay objetivos": "No targets",
    "No hay partidos programados.": "No scheduled matches.",
    "No se pudo establecer como principal": "Could not set as primary",
    "No se pudo pujar": "Could not bid",
    "No se pudo renovar.": "Could not renew.",
    "Obras en Curso": "Work in progress",
    "Oficina del director": "Director's office",
    "Ojeador": "Scout",
    "Plantilla no disponible": "Squad unavailable",
    "Pretemporada": "Pre-season",
    "Reintentar": "Retry",
    "Reintentar acceso": "Retry access",
    "Resumen de economía": "Economy summary",
    "Retirar jugador": "Withdraw player",
    "Servidor no disponible": "Server unavailable",
    "Siguiente": "Next",
    "Simular partido": "Simulate match",
    "Subastas no disponibles": "Auctions unavailable",
    "Subcontratas": "Outsourcing",
    "Tus partidos": "Your matches",
    "Tácticas": "Tactics",
    "Ventana de fichajes": "Transfer window",
    "Ver partido": "View match",
    "Vista del Estadio": "Stadium view",
    "meses restantes": "months remaining",
    "ocupación": "occupancy",
    "· {{count}} punto disponible": "· {{count}} point available",
    "· {{count}} puntos disponibles": "· {{count}} points available",
    "{{count}} partidos": "{{count}} matches",
}
EN_MAP.update(EN_FIX)

SPANISH_MARKERS = re.compile(r"[ñ¿¡]")
SPANISH_ACCENT = re.compile(r"[áéíóúÁÉÍÓÚ]")
ENGLISH_PHRASE = re.compile(
    r"\b(could not|error |failed |confirm |choose |loading |unavailable|no [a-z]{3,}|the |your |you |this |will |have |has |are |with |from |for |get to |go to |be the |while you|give a |give home|stop following|simulate |advance |processed |withdraw |remove |dismiss |hire |unlock |upgrade |expand |invest |break off|break contract|close |open |pending |completed |awarded |free agent|release clause|dressing room|transfer window|transfer market|team talk|matchday |backroom staff|signing targets|skill tree|front page|goal of the week|direct rival|fan sentiment|net worth|image rights|work in progress|under construction|club financial|operations center|training center|scouting department|scouting mission|scouting zone|live auction|sealed bid|share purchase|share sale|counter-offer|renewal accepted|offer sent|offer withdrawn|bid sent|press conference|turn summary|optimal lineup|quarter-final|semi-final|round of 16|relegation zone|league phase|league standing|manager career|manager ranking|my career|my matches|my offers|my squad|next match|upcoming match|previous matchday|next matchday|season in progress|pre-season|weekly mission|monthly wage|annual wage|years remaining|contract ends|market value|market info|market shark|squad status|squad unavailable|empty squad|player unavailable|player promoted|server unavailable|economy unavailable|economy summary|negotiations unavailable|auctions unavailable|competition unavailable|invalid amount|invalid competition|insufficient balance|immediate and irrevocable|ready for full workload|fewer filter|be the first|view match|view offers|open fdf|stop paying|confirm loan|confirm payment|confirm bid|confirm dismissal|confirm board|confirm share|sign contract|negotiate signing|loan player|loan \{\{)\b",
    re.I,
)

from gameplay_i18n_translations import EN_TO_DE, EN_TO_FR, EN_TO_IT  # noqa: E402


def get_leaf_strings(obj, strings: set[str] | None = None) -> set[str]:
    if strings is None:
        strings = set()
    if isinstance(obj, dict):
        for v in obj.values():
            get_leaf_strings(v, strings)
    elif isinstance(obj, str):
        strings.add(obj)
    return strings


def build_en_reference() -> dict[str, str]:
    return dict(EN_MAP)


def translate_via_en(es: str, en_map: dict[str, str], lang_map: dict[str, str]) -> str:
    en = en_map.get(es, es)
    return lang_map.get(en, lang_map.get(es, en))


def audit(values: dict[str, str], lang: str) -> list[str]:
    bad: list[str] = []
    en_map = build_en_reference()
    for es, val in values.items():
        if SPANISH_MARKERS.search(val):
            bad.append(f"spanish: {es!r} -> {val!r}")
        elif val == es and SPANISH_ACCENT.search(es):
            bad.append(f"unchanged: {es!r}")
        else:
            en = en_map.get(es, es)
            if lang != "en" and val == en and en != es and ENGLISH_PHRASE.search(en):
                bad.append(f"english: {es!r} -> {val!r}")
    return bad


def main() -> None:
    es = json.loads((LOC / "gameplay.es.json").read_text(encoding="utf-8"))
    es_strings = sorted(get_leaf_strings(es))
    assert len(es_strings) == 706, f"Expected 706 strings, got {len(es_strings)}"

    en_map = build_en_reference()
    en_values = sorted(set(en_map.get(s, s) for s in es_strings))
    print(f"Loaded {len(es_strings)} ES keys, {len(en_values)} unique EN values")
    print(f"EN->FR: {len(EN_TO_FR)}, EN->DE: {len(EN_TO_DE)}, EN->IT: {len(EN_TO_IT)}")

    missing_fr = [v for v in en_values if v not in EN_TO_FR]
    missing_de = [v for v in en_values if v not in EN_TO_DE]
    missing_it = [v for v in en_values if v not in EN_TO_IT]
    if missing_fr or missing_de or missing_it:
        print(f"Missing translations — FR:{len(missing_fr)} DE:{len(missing_de)} IT:{len(missing_it)}")
        if missing_fr:
            print("  FR sample:", missing_fr[:3])
        if missing_de:
            print("  DE sample:", missing_de[:3])
        if missing_it:
            print("  IT sample:", missing_it[:3])

    outputs = {
        "fr": (EN_TO_FR, SCRIPTS / "gameplay-i18n-fr-complete.json"),
        "de": (EN_TO_DE, SCRIPTS / "gameplay-i18n-de-complete.json"),
        "it": (EN_TO_IT, SCRIPTS / "gameplay-i18n-it-complete.json"),
    }

    for lang, (lang_map, path) in outputs.items():
        result = {es_key: translate_via_en(es_key, en_map, lang_map) for es_key in es_strings}
        assert len(result) == 706
        path.write_text(json.dumps(dict(sorted(result.items())), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        bad = audit(result, lang)
        print(f"{lang}: {len(result)} entries, {len(bad)} validation issues")
        for item in bad[:15]:
            print(f"  {item}")


if __name__ == "__main__":
    main()
