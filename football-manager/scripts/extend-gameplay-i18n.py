#!/usr/bin/env python3
"""Extend gameplay.es.json and regenerate gameplay.en.json with English translations."""
import json
from pathlib import Path

LOC = Path(__file__).resolve().parent.parent / "src" / "locales"

PATCH = {
  "player": {
    "toasts": {
      "followError": "No se pudo seguir al jugador."
    },
    "follow": "Seguir",
    "following": "Siguiendo...",
    "freeAgent": "Libre",
    "career": {
      "title": "Trayectoria",
      "empty": "Sin temporadas registradas todavía.",
      "total": "TOTAL CARRERA",
      "avgRating": "nota media"
    },
    "matches": {
      "title": "Últimos partidos",
      "empty": "Aún no ha jugado."
    },
    "avatar": {
      "title": "Avatar",
      "showPortrait": "VER RETRATO",
      "show3d": "VER EN 3D",
      "unavailable": "3D no disponible en este navegador — mostrando el retrato.",
      "hint": "Arrastra para rotar · rueda para zoom"
    },
    "availability": {
      "title": "Estado: No Disponible",
      "injured": "🏥 Lesionado",
      "suspended": "🟥 Sancionado",
      "until": "Disponible el: {{date}}"
    },
    "contract": {
      "title": "Contrato",
      "club": "Club",
      "wage": "Salario Anual",
      "clause": "Cláusula de rescisión",
      "yearsLeft": "Años restantes",
      "endsAt": "Fin de contrato",
      "marketValue": "Valor de mercado",
      "squadNumber": "Dorsal",
      "foot": "Pie",
      "footLeft": "Zurdo",
      "footRight": "Diestro",
      "personality": "Personalidad"
    },
    "transfers": {
      "title": "Traspasos",
      "free": "Libre"
    },
    "progression": {
      "title": "Progresión",
      "empty": "Aún sin historial de desarrollo — la curva crece con entrenamientos y minutos.",
      "totalChange": "Cambio total registrado",
      "points": "pts de atributo"
    },
    "honours": {
      "title": "Palmarés",
      "empty": "Sin títulos individuales todavía."
    },
    "table": {
      "season": "Temporada",
      "played": "PJ",
      "minutes": "Min",
      "goals": "Goles",
      "assists": "Asis",
      "rating": "Nota",
      "match": "Partido",
      "date": "Fecha"
    }
  },
  "career": {
    "unlockError": "No se pudo desbloquear",
    "skills": {
      "motivator": {
        "branch": "Motivador",
        "desc": "Gestión del vestuario y la moral",
        "mot_1": {"label": "Charla técnica", "effect": "+1 uso de discurso por temporada"},
        "mot_2": {"label": "Líder del vestuario", "effect": "La moral cae más despacio tras derrotas"},
        "mot_3": {"label": "Psicólogo de élite", "effect": "Motiva jugadores afines también en agosto"}
      },
      "tactician": {
        "branch": "Genio Táctico",
        "desc": "Pizarra, jugadas y partido",
        "tac_1": {"label": "Ojeador propio", "effect": "+1 informe de rival por jornada"},
        "tac_2": {"label": "Pizarra avanzada", "effect": "+1 sustitución programada (4 reglas)"},
        "tac_3": {"label": "Maestro de jugadas", "effect": "+2 jugadas activas por partido (10)"}
      },
      "financier": {
        "branch": "Rey de las Finanzas",
        "desc": "Economía y negociación",
        "fin_1": {"label": "Negociador", "effect": "Los agentes aceptan un 5% menos de salario"},
        "fin_2": {"label": "Comercial nato", "effect": "+5% en derechos de imagen"},
        "fin_3": {"label": "Tiburón del mercado", "effect": "Ve la valoración exacta de las pujas rivales"}
      }
    }
  },
  "residences": {
    "kicker": "Complejo Deportivo FDF",
    "title": "Academia & Cantera",
    "loadErrorToast": "No se pudo cargar la cantera",
    "kpis": {
      "capacity": "Capacidad Instalada",
      "slots": "plazas",
      "residents": "Residentes Actuales",
      "archLevel": "Nivel Arquitectónico",
      "modules_one": "{{count}} Módulo Operativo",
      "modules_other": "{{count}} Módulos Operativos"
    },
    "campus": {
      "title": "Instalaciones del Campus",
      "currentLevel": "Nivel actual",
      "max": "/ 5 MAX",
      "desc": "La planta iluminada marca el progreso tecnológico de tu academia. Cada nivel aumenta la media base de los canteranos generados.",
      "optimal": "Operación Óptima",
      "floorPlan": "Plano de Habitaciones",
      "occupied": "{{occupied}} / {{capacity}} Ocupadas",
      "roomOccupied": "Residente asignado",
      "roomEmpty": "Habitación disponible"
    },
    "youth": {
      "title": "Promesas en Desarrollo",
      "prospect": "Prospecto",
      "role": "Rol",
      "age": "Edad",
      "projection": "Proyección",
      "talent": "Talento Base",
      "action": "Decisión",
      "promote": "Ascender",
      "empty": "Las instalaciones están vacías. Los ojeadores están buscando talentos.",
      "playerFallback": "Jugador #{{id}}",
      "potential": "Potencial {{talent}}/99"
    },
    "upgrades": {
      "title": "Árbol de Desarrollo",
      "lede": "Invierte fondos del club para expandir las instalaciones y mejorar la calidad de los entrenamientos juveniles.",
      "capacityTitle": "Ampliar Dormitorios",
      "capacityHint": "+10 plazas para nuevos prospectos",
      "capacityCost": "150.000 €",
      "levelTitle": "Mejorar Tecnología",
      "levelHint": "+ Nivel Academia (Mejores Stats Base)",
      "levelCost": "250.000 €",
      "invest": "Invertir",
      "maxLevel": "MAX LEVEL",
      "evolve": "Evolucionar"
    },
    "formula": {
      "title": "Archivos FDF: Generación de Talentos",
      "l1": "· Cada ~3 meses de juego sale un jugador por residencia (puedes elegir su demarcación).",
      "l2": "· Media base = nivel de residencia × 3 + azar(−5..25) − azar(0..residencias) + 13 + valor de ubicación (1-20). Acotada entre 20 y 75.",
      "l3": "· Cada atributo = media − 50 + azar(0..30) − penalización por posición.",
      "l4": "· Talento (techo) = atributo + 50 + azar(0..15). La ciudad deportiva sube el rango (sin ella 15-60; nivel 8: 43-84).",
      "l5": "· Límite mundial anual: 3 jugadores de 7 barras y 21 de 6 barras. Emblemáticos retirados suman bonus."
    },
    "promo": {
      "title": "Firma Profesional: {{name}}",
      "prospect": "Prospecto #{{id}}",
      "years": "{{count}} años",
      "demands": "Demandas del Representante",
      "salaryRequired": "Salario Inicial Requerido",
      "perMonth": "/mes",
      "salaryOffer": "Oferta Salarial",
      "duration": "Duración (Años)",
      "offerRejected": "La oferta será rechazada por el jugador.",
      "break": "Romper Negociaciones",
      "sign": "Firma de Contrato",
      "attrs": {
        "passing": "Pase", "tackling": "Entrada", "shooting": "Tiro",
        "organization": "Organización", "unmarking": "Desmarque",
        "finishing": "Definición", "dribbling": "Regate", "goalkeeping": "Portería"
      }
    },
    "confirm": {
      "capacityTitle": "Aprobación de Plan de Expansión",
      "levelTitle": "Aprobación de Mejora Tecnológica",
      "confirm": "Autorizar Fondos",
      "body": "¿Confirmas la autorización de la junta directiva para invertir {{amount}} en el proyecto de {{project}}?",
      "capacityProject": "ampliación de los dormitorios (+10 plazas)",
      "levelProject": "actualización de las instalaciones (Nivel +1)"
    },
    "toasts": {
      "promoteError": "Error al promover",
      "upgradeError": "Error al mejorar (¿Falta de fondos?)"
    }
  },
  "plays": {
    "title": "Jugadas entrenadas",
    "inMatch": "{{active}}/{{max}} en partido",
    "emptyTitle": "Sin jugadas entrenadas",
    "emptyHint": "Inicia el entrenamiento de una jugada para que tu equipo la domine en los partidos.",
    "level": "NIVEL {{level}}",
    "statusDeveloping": "ENTRENANDO…",
    "statusMaxed": "MÁXIMO",
    "statusAvailable": "DISPONIBLE",
    "deactivate": "Desactivar",
    "activate": "Activar en partido",
    "newPlay": "Nueva jugada",
    "train": "Entrenar",
    "loadError": "No se pudieron cargar las jugadas",
    "startError": "Error al iniciar jugada",
    "toggleError": "Error al activar/desactivar",
    "types": {
      "corner": "Saque de esquina",
      "freekick": "Falta directa",
      "offside": "Fuera de juego",
      "counter": "Contragolpe"
    }
  },
  "competition": {
    "roundClosed": "· cerrada",
    "matchday": "Jornada {{n}}",
    "matchdayPlayed": "· jugada"
  },
  "dashboard": {
    "standingsTitle": "Clasificación de Liga",
    "inForm": "Jugadores en forma",
    "noSquad": "No hay jugadores en plantilla.",
    "newsTitle": "Últimas Noticias",
    "noNews": "No hay noticias.",
    "newsCategory": "Noticia",
    "marketTitle": "Info Mercado",
    "squadCount": "{{count}} jg.",
    "squadLabel": "Plantilla",
    "standingsRow": "Posición {{pos}}, {{club}}",
    "rivalWeek": "RIVAL DE LA SEMANA"
  },
  "scout": {
    "toasts": {
      "hireSuccess": "Ojeador contratado",
      "missionCreated": "Misión de ojeo creada",
      "reportAdvanced": "Informe avanzado",
      "failed": "Operación fallida"
    }
  },
  "npcCoach": {
    "kicker": "Banquillo NPC",
    "noClub": "Sin club",
    "lede": "Técnico de {{club}}"
  }
}

# Spanish -> English leaf translations (walk applies recursively where value matches)
EN_MAP = {
  "No se pudo seguir al jugador.": "Could not follow player.",
  "Seguir": "Follow",
  "Siguiendo...": "Following...",
  "Libre": "Free agent",
  "Trayectoria": "Career path",
  "Sin temporadas registradas todavía.": "No seasons recorded yet.",
  "TOTAL CARRERA": "CAREER TOTAL",
  "nota media": "avg. rating",
  "Últimos partidos": "Recent matches",
  "Aún no ha jugado.": "Has not played yet.",
  "Avatar": "Avatar",
  "VER RETRATO": "VIEW PORTRAIT",
  "VER EN 3D": "VIEW IN 3D",
  "3D no disponible en este navegador — mostrando el retrato.": "3D unavailable in this browser — showing portrait.",
  "Arrastra para rotar · rueda para zoom": "Drag to rotate · scroll to zoom",
  "Estado: No Disponible": "Status: Unavailable",
  "🏥 Lesionado": "🏥 Injured",
  "🟥 Sancionado": "🟥 Suspended",
  "Disponible el: {{date}}": "Available on: {{date}}",
  "Contrato": "Contract",
  "Club": "Club",
  "Salario Anual": "Annual wage",
  "Cláusula de rescisión": "Release clause",
  "Años restantes": "Years remaining",
  "Fin de contrato": "Contract ends",
  "Valor de mercado": "Market value",
  "Dorsal": "Squad number",
  "Pie": "Foot",
  "Zurdo": "Left",
  "Diestro": "Right",
  "Personalidad": "Personality",
  "Traspasos": "Transfers",
  "Progresión": "Development",
  "Aún sin historial de desarrollo — la curva crece con entrenamientos y minutos.": "No development history yet — the curve grows with training and minutes.",
  "Cambio total registrado": "Total recorded change",
  "pts de atributo": "attribute pts",
  "Palmarés": "Honours",
  "Sin títulos individuales todavía.": "No individual titles yet.",
  "Temporada": "Season",
  "PJ": "GP",
  "Min": "Min",
  "Goles": "Goals",
  "Asis": "Ast",
  "Nota": "Rating",
  "Partido": "Match",
  "Fecha": "Date",
  "No se pudo desbloquear": "Could not unlock",
  "Motivador": "Motivator",
  "Gestión del vestuario y la moral": "Dressing room and morale management",
  "Charla técnica": "Technical talk",
  "+1 uso de discurso por temporada": "+1 team talk per season",
  "Líder del vestuario": "Dressing room leader",
  "La moral cae más despacio tras derrotas": "Morale drops more slowly after defeats",
  "Psicólogo de élite": "Elite psychologist",
  "Motiva jugadores afines también en agosto": "Also motivates similar players in August",
  "Genio Táctico": "Tactical genius",
  "Pizarra, jugadas y partido": "Tactics board, plays and match",
  "Ojeador propio": "In-house scout",
  "+1 informe de rival por jornada": "+1 opponent report per matchday",
  "Pizarra avanzada": "Advanced board",
  "+1 sustitución programada (4 reglas)": "+1 scheduled sub (4 rules)",
  "Maestro de jugadas": "Set-piece master",
  "+2 jugadas activas por partido (10)": "+2 active plays per match (10)",
  "Rey de las Finanzas": "Finance king",
  "Economía y negociación": "Economy and negotiation",
  "Negociador": "Negotiator",
  "Los agentes aceptan un 5% menos de salario": "Agents accept 5% less salary",
  "Comercial nato": "Born salesperson",
  "+5% en derechos de imagen": "+5% image rights",
  "Tiburón del mercado": "Market shark",
  "Ve la valoración exacta de las pujas rivales": "Sees exact rival bid valuations",
  "Complejo Deportivo FDF": "FDF Sports Complex",
  "Academia & Cantera": "Academy & Youth",
  "No se pudo cargar la cantera": "Could not load academy",
  "Capacidad Instalada": "Installed capacity",
  "plazas": "slots",
  "Residentes Actuales": "Current residents",
  "Nivel Arquitectónico": "Architectural level",
  "{{count}} Módulo Operativo": "{{count}} active module",
  "{{count}} Módulos Operativos": "{{count}} active modules",
  "Instalaciones del Campus": "Campus facilities",
  "Nivel actual": "Current level",
  "/ 5 MAX": "/ 5 MAX",
  "La planta iluminada marca el progreso tecnológico de tu academia. Cada nivel aumenta la media base de los canteranos generados.": "The lit floor marks your academy's tech progress. Each level raises youth players' base average.",
  "Operación Óptima": "Optimal operation",
  "Plano de Habitaciones": "Room layout",
  "{{occupied}} / {{capacity}} Ocupadas": "{{occupied}} / {{capacity}} occupied",
  "Residente asignado": "Assigned resident",
  "Habitación disponible": "Available room",
  "Promesas en Desarrollo": "Prospects in development",
  "Prospecto": "Prospect",
  "Rol": "Role",
  "Edad": "Age",
  "Proyección": "Projection",
  "Talento Base": "Base talent",
  "Decisión": "Action",
  "Ascender": "Promote",
  "Las instalaciones están vacías. Los ojeadores están buscando talentos.": "Facilities are empty. Scouts are searching for talent.",
  "Jugador #{{id}}": "Player #{{id}}",
  "Potencial {{talent}}/99": "Potential {{talent}}/99",
  "Árbol de Desarrollo": "Development tree",
  "Invierte fondos del club para expandir las instalaciones y mejorar la calidad de los entrenamientos juveniles.": "Invest club funds to expand facilities and improve youth training quality.",
  "Ampliar Dormitorios": "Expand dormitories",
  "+10 plazas para nuevos prospectos": "+10 slots for new prospects",
  "Mejorar Tecnología": "Upgrade technology",
  "+ Nivel Academia (Mejores Stats Base)": "+ Academy level (better base stats)",
  "Invertir": "Invest",
  "MAX LEVEL": "MAX LEVEL",
  "Evolucionar": "Upgrade",
  "Archivos FDF: Generación de Talentos": "FDF archives: talent generation",
  "Firma Profesional: {{name}}": "Professional contract: {{name}}",
  "Prospecto #{{id}}": "Prospect #{{id}}",
  "{{count}} años": "{{count}} years",
  "Demandas del Representante": "Agent demands",
  "Salario Inicial Requerido": "Required starting salary",
  "/mes": "/mo",
  "Oferta Salarial": "Salary offer",
  "Duración (Años)": "Duration (years)",
  "La oferta será rechazada por el jugador.": "The player will reject this offer.",
  "Romper Negociaciones": "Break off talks",
  "Firma de Contrato": "Sign contract",
  "Pase": "Passing", "Entrada": "Tackling", "Tiro": "Shooting",
  "Organización": "Organisation", "Desmarque": "Movement",
  "Definición": "Finishing", "Regate": "Dribbling", "Portería": "Goalkeeping",
  "Aprobación de Plan de Expansión": "Expansion plan approval",
  "Aprobación de Mejora Tecnológica": "Technology upgrade approval",
  "Autorizar Fondos": "Authorize funds",
  "¿Confirmas la autorización de la junta directiva para invertir {{amount}} en el proyecto de {{project}}?": "Confirm board authorization to invest {{amount}} in {{project}}?",
  "ampliación de los dormitorios (+10 plazas)": "dormitory expansion (+10 slots)",
  "actualización de las instalaciones (Nivel +1)": "facility upgrade (Level +1)",
  "Error al promover": "Promotion failed",
  "Error al mejorar (¿Falta de fondos?)": "Upgrade failed (insufficient funds?)",
  "Jugadas entrenadas": "Trained plays",
  "{{active}}/{{max}} en partido": "{{active}}/{{max}} in match",
  "Sin jugadas entrenadas": "No trained plays",
  "Inicia el entrenamiento de una jugada para que tu equipo la domine en los partidos.": "Start training a play so your team masters it in matches.",
  "NIVEL {{level}}": "LEVEL {{level}}",
  "ENTRENANDO…": "TRAINING…",
  "MÁXIMO": "MAXED",
  "DISPONIBLE": "AVAILABLE",
  "Desactivar": "Deactivate",
  "Activar en partido": "Activate for match",
  "Nueva jugada": "New play",
  "Entrenar": "Train",
  "No se pudieron cargar las jugadas": "Could not load plays",
  "Error al iniciar jugada": "Could not start play",
  "Error al activar/desactivar": "Could not toggle play",
  "Saque de esquina": "Corner kick",
  "Falta directa": "Direct free kick",
  "Fuera de juego": "Offside trap",
  "Contragolpe": "Counter-attack",
  "· cerrada": "· closed",
  "Jornada {{n}}": "Matchday {{n}}",
  "· jugada": "· played",
  "Clasificación de Liga": "League standings",
  "Jugadores en forma": "Players in form",
  "No hay jugadores en plantilla.": "No players in squad.",
  "Últimas Noticias": "Latest news",
  "No hay noticias.": "No news.",
  "Noticia": "News",
  "Info Mercado": "Market info",
  "{{count}} jg.": "{{count}} pl.",
  "Plantilla": "Squad",
  "Posición {{pos}}, {{club}}": "Position {{pos}}, {{club}}",
  "RIVAL DE LA SEMANA": "RIVAL OF THE WEEK",
  "Ojeador contratado": "Scout hired",
  "Misión de ojeo creada": "Scouting mission created",
  "Informe avanzado": "Report advanced",
  "Operación fallida": "Operation failed",
  "Banquillo NPC": "NPC bench",
  "Sin club": "No club",
  "Técnico de {{club}}": "Coach of {{club}}",
  "Ojeadores": "Scouts",
  "Sin ojeadores. Contrata el primero.": "No scouts. Hire your first one.",
  "Nivel {{level}}": "Level {{level}}",
  "{{fee}} firma": "{{fee}} signing fee",
  "Contratar": "Hire",
  "Ojeador #{{id}}": "Scout #{{id}}",
  "Zona…": "Zone…",
  "Misiones de ojeo": "Scouting missions",
  "Ojeador…": "Scout…",
  "Club objetivo…": "Target club…",
  "Enviar a ojear": "Send to scout",
  "En curso": "In progress",
  "Recomendado: {{name}}": "Recommended: {{name}}",
  "ojeador": "scout",
  "Contrata un ojeador para poder crear misiones.": "Hire a scout to create missions.",
  "Avanzar informe": "Advance report",
  "Jugadores ojeados": "Scouted players",
  "Aún no hay informes de ojeo.": "No scouting reports yet.",
  "Jugador": "Player",
  "Ficha completa →": "Full profile →",
  "Potencial {{potential}} · valor {{value}}": "Potential {{potential}} · value {{value}}",
  "Estado de la Plantilla": "Squad status",
  "Salud media": "Average fitness",
  "Misiones Semanales": "Weekly missions",
  "COMPLETADA": "COMPLETED",
}

def deep_merge(base, patch):
    for k, v in patch.items():
        if k in base and isinstance(base[k], dict) and isinstance(v, dict):
            deep_merge(base[k], v)
        else:
            base[k] = v

def translate_leaf(val):
    if isinstance(val, str):
        return EN_MAP.get(val, val)
    if isinstance(val, dict):
        return {k: translate_leaf(v) for k, v in val.items()}
    if isinstance(val, list):
        return [translate_leaf(x) for x in val]
    return val

def translate_tree(obj):
    if isinstance(obj, dict):
        return {k: translate_tree(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [translate_tree(x) for x in obj]
    if isinstance(obj, str):
        return EN_MAP.get(obj, obj)
    return obj

def apply_map(obj, mapping: dict):
    if isinstance(obj, dict):
        return {k: apply_map(v, mapping) for k, v in obj.items()}
    if isinstance(obj, list):
        return [apply_map(x, mapping) for x in obj]
    if isinstance(obj, str):
        return mapping.get(obj, obj)
    return obj

def main():
    es_path = LOC / "gameplay.es.json"
    en_path = LOC / "gameplay.en.json"
    es = json.loads(es_path.read_text(encoding="utf-8"))
    deep_merge(es, PATCH)
    es_path.write_text(json.dumps(es, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    en_existing = json.loads(en_path.read_text(encoding="utf-8")) if en_path.exists() else {}
    en = translate_tree(es)
    # preserve any pre-existing EN overrides
    deep_merge(en, {k: en_existing[k] for k in en_existing if k not in es})
    en_path.write_text(json.dumps(en, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for lang in ["fr", "de", "it"]:
        complete = LOC.parent.parent / "scripts" / f"gameplay-i18n-{lang}-complete.json"
        if complete.exists():
            (LOC / f"gameplay.{lang}.json").write_text(
                json.dumps(apply_map(es, json.loads(complete.read_text(encoding="utf-8"))), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        else:
            print(f"skip {lang}: run scripts/generate-gameplay-locales.py")
    print("ok", len(es), "top-level keys")

if __name__ == "__main__":
    main()
