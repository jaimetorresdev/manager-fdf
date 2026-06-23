# Motor de partido FDF — resolución 1d40 por fases

> Réplica fiel del simulador del manual (manual-managerfdf-referencia.md §1.1–1.3):
> cada jugada se resuelve **fase a fase con una tirada 1d40** contra el «valor de
> fase». Sustituye al embudo `tanh` simplificado como motor por defecto. Vive en
> `football-manager/engine/app/engine.py` (Python, fuente de verdad) y se refleja
> en el visor 2D y en las fichas a través del contrato `timeline`/`duel`/`chain`.

## 1. Resumen

- **Motor por defecto**: `engine="fdf"` en `simulate(...)`. El embudo `tanh` antiguo
  sigue disponible como `engine="legacy"` (A/B y fallback interno).
- **Determinista por semilla** (Túnel del Tiempo intacto): el `rng` PRINCIPAL decide
  inicio de jugada, fases (1d40), puerta y gol; el `rng` DERIVADO (`frng`) elige la
  jugada del catálogo, los jugadores y la narración (cosmético).
- **Cronológico**: las jugadas de ambos equipos se resuelven en orden de minuto, de
  modo que los modificadores de marcador (ganando/perdiendo) ven el resultado **vivo**.
- **Split de portería**: `goalkeeping` = **COLOCACIÓN** (balón parado: penaltis,
  faltas, córners — antes «Salidas»); nuevo atributo `reflexes` = **REFLEJOS** (juego
  abierto: para el tiro y el remate). Ausente ⇒ = goalkeeping
  (retrocompatible). La fase de portería usa uno u otro según la jugada.

## 2. La fórmula (manual §1.2–1.3)

### 2.1 Inicio de la jugada (`cre − des`)
`construcción(atacante) − destrucción(defensor)` → probabilidad inicial:

| cre − des | prob. |
|---|---|
| ≤ 2 | 30% | `> 2` 40% · `> 6` 50% · `> 11` 60% · `> 17` 70% · `> 24` 80% · `> 32` 90% |

Modificadores sobre esa probabilidad:
- **Marcador**: ganando −10%/gol de diferencia; perdiendo +10%/gol.
- **Confianza de entrenadores**: diferencia 7-8 → ±30%, 5-6 → ±20%, 3-4 → ±10%, resto n/a.

`construcción`/`destrucción` reutilizan las potencias macro `attack`/`defense` del
perfil (ya incluyen palancas, estilos §2.9, asistencia §2.10, formación y bonus de
counter WT3), por lo que **todas las palancas tácticas siguen influyendo** vía la
tabla de inicio. La confianza del entrenador la pre-aplica el backend sobre la
construcción (tabla FDF), de forma que el motor no la duplica.

### 2.2 Tipo de jugada y fases
Una jugada iniciada es **campo** (las jugadas reales del Excel tienen 4-6 fases),
**balón parado** (córner/falta) o **penalti**. Defensor por fase (generaliza el manual
a largo variable): las **primeras fases → mediocampo**, las **dos previas al remate →
defensa**, la **última → portero**.

### 2.3 Valor de fase (`vf`) y tirada 1d40
`vf = base + offset(hab.atq − hab.def)` con la tabla del manual (dos columnas, fase
1-2 vs 3-5). `base = 6 − (difGoles·k_d) − (golesTot·k_t) + confianza_base`.

```
1d40:  > bonif.def  Y  < min(39, vf + bonif.ofe)  →  avanza fase
```
- `bonif.def` = refuerzo de zona del rival en el carril (2 uds. d40/punto, manual §2.6).
- `bonif.ofe` = modificador de táctica (ayuda a **crear**, no a batir al portero).
- Penaltis: sin `bonif.ofe`, `vf ≥ 28`.

Cada fase usa **una sola habilidad** de una **posición concreta**. La habilidad
defensiva es **entradas** (jugadores de campo) o, en la fase de portería, **reflejos**
(juego abierto: tiro o remate) / **colocación** (balón parado, §4).

## 3. Playbook GENERATIVO por formación (`fdf_playbook.py`)

El Excel `Tacticas_FDF.xlsx` (→ `fdf_jugadas.json`, conservado como referencia) fue la
**guía**. El catálogo se **genera** para CADA formación a partir de:
1. el **dibujo real** de la formación — sus posiciones por línea y carril, derivadas
   del nombre (`layout()`: 4-4-2 → LI·DFI·DFD·LD / MI·MCDI·MCDD·MD / SD·DC …), y
2. una **biblioteca de patrones** (`PATTERNS`: construcción central, paciente, cambio
   de orientación, desdoblamiento de banda, pase al hueco, pared, contra, balón largo,
   disparo lejano, conducción, tercer hombre, carrilero…), cada uno una secuencia de
   `(rol, carril, habilidad)`.

Para cada formación se instancian los patrones con SUS posiciones, ponderados por su
**carácter** (`_CHAR`): un 4-3-3 carga banda/regate, un 5-4-1 contra/balón largo, un
3-5-2 posesión central. Garantías: **todas las posiciones** del dibujo participan
(pase de cobertura si hace falta), el rematador es **siempre delantero o mediapunta**
(nunca un central), y cada formación tiene un catálogo **propio** (máxima variabilidad:
dos formaciones comparten ≈0 jugadas). Una sola habilidad por fase (Tiro≠Remate).

- **Por dónde atacas importa**: las zonas de ataque (attackZones, §2.6) eligen el lado
  y cada lado usa jugadas distintas con jugadores distintos.
- **Posiciones detalladas**: el motor alinea al jugador de la posición de cada fase
  (vía `detailedPosition`); si no la trae, cae a macro + carril.
- **Balón parado** (córner, falta, penalti): ejecución con **Faltas**, portería con **Colocación**.

> **Catálogo completo**: el listado por formación, sus jugadas por zona y el resumen de
> **qué posición usa qué habilidad** (para fichar/alinear) está en
> `docs/FORMACIONES-JUGADAS-Y-HABILIDADES.md` (generado por `engine/gen_playbook_doc.py`).

## 4. Cómo se refleja en el visor y las fichas

El motor emite el **mismo contrato** que ya consume el visor 2D (`TimelineEntry` con
`phase`, `lane`, `playerId`, `duel{att,def,attrs}`, y `chain` en los goles), por lo
que **no hubo que tocar el visor**. Cada jugada produce su evento coherente:

| Fase del timeline | Qué se ve | Duelo |
|---|---|---|
| `gol` | rematador define; cadena completa de fases en GoalReplay | rematador vs portero (reflejos) |
| `parada` | el portero ataja; ficha del portero en `gkAction` | rematador vs portero (reflejos) |
| `remate` | disparo fuera/desviado | rematador vs portero |
| `progresion` | corte en medio/defensa; `duelRole` del defensor | atacante vs defensor (entradas) |

Así, según la jugada, la ficha implicada **remata, dispara, hace la entrada si es
defensor o ataja si es portero**. `GoalReplay` muestra la anatomía completa (las 5
fases con sus atributos exactos). Las fichas del jugador (PlayerDossier) muestran
**Salidas** y **Reflejos** para porteros y la media por posición (manual §Media).

## 5. Calibración

Constantes libres (no fijadas por el manual) en la cabecera de `engine.py`
(`FDF_*`). Objetivo de referencia (ligas top): ~2.7 goles/partido, V/E/D local
~45/26/29, ~12 tiros/equipo. Medición con `calibrate.py` (plantillas parejas nivel
75, 4000 partidos):

```
Goles local/visit/total : 1.49 / 1.14 / 2.63
V/E/D (local)           : 45.2% / 32.3% / 22.5%
Tiros / a puerta        : 12.9 / 7.9
Nota MOTM (media)       : 7.67
Fuerte vs débil         : ~6.5 - 0.3   (gana el 100%)
```

> Nota: la suavización de marcador del manual (`base −2·difGoles −2·golesTot`) se
> rebaja a `1.1`/`1.2` porque a `2/2` revierte tanto a la media que comprime los
> resultados a empates y anula las ventajas de plantilla. Es el único punto donde
> nos apartamos del literal del manual, y está documentado como palanca de calibración.

## 6. Verificación

- `engine/`: `pytest` (137 tests verdes — determinismo, marcador↔eventos↔timeline,
  posesión 30-70, neutralidad de cada palanca, respuestas de pressing/mentalidad/
  estilos/zonas/asistencia, knockout, cadena de gol vs portero).
- Frontend: `tsc -p tsconfig.app.json` (0), `vitest -c vitest.lib.config.ts`
  (matchAnimation bloqueado verde), `npm run build` OK, eslint 0.
- Backend: `tsc` (0), `vitest src/modules/simulation` (35 verdes).
- Coherencia del visor verificada a nivel de contrato con un trazado de partido real
  (cada `gol/parada/remate/progresion` lleva su duelo correcto; los duelos de remate
  usan reflejos del portero). Recomendado: revisar un partido en el visor en vivo.

## 7. Archivos

- `engine/app/engine.py` — `_resolve_match_fdf`, `_run_jugada_fdf`, tablas FDF, split GK.
- `engine/app/fdf_jugadas.json` — **catálogo REAL** (14 formaciones × 48 jugadas) extraído del Excel.
- `engine/app/fdf_playbook.py` — carga el catálogo + mapa de posiciones/habilidades.
- `engine/gen_playbook_doc.py` — regenera `docs/FORMACIONES-JUGADAS-Y-HABILIDADES.md` (usa `openpyxl`).
- `engine/app/models.py` — `reflexes` + `detailedPosition` (PlayerInput), `coachConfidence` (Tactic).
- `engine/app/development.py` — desarrollo de colocación (salidas) y reflejos.
- `server/.../engineClient.ts` — `reflexes` en `EnginePlayer`/`buildRoster`.
- `server/.../simulation.phases.engine.ts` — fallback TS: portería con reflejos.
- `src/components/player/PlayerDossier.tsx`, `src/components/match/GoalReplay.tsx` —
  fichas y replay con Salidas/Reflejos.
