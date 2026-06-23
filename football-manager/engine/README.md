# Manager FDF — Motor de partido (Python)

Microservicio FastAPI que ejecuta la **simulación de partidos v3** (H3 del roadmap).
El backend Node lo llama en cada partido; si no responde, Node cae a su motor TS
de respaldo, así que el juego nunca se queda sin simulador.

## Por qué Python

El motor y, sobre todo, su **calibración Monte Carlo** (miles de partidos para
afinar las fórmulas) son mucho más cómodos en Python (NumPy). El resto del backend
sigue en Node: este servicio solo hace una cosa y la hace bien.

## Modelo (resumen)

**Motor por defecto: FDF 1d40 por fases** (`engine="fdf"`, réplica fiel del manual
§1.1–1.3 — ver `docs/MOTOR-FDF-1D40.md`). Por equipo se intentan ~20 jugadas/parte;
cada jugada arranca con la tabla `cre−des` y se resuelve **fase a fase con una tirada
1d40** contra el «valor de fase» (defensor por nº de fase: medio → defensa → portero).
Cada **formación** tiene un catálogo de **20 jugadas** (`app/fdf_playbook.py`). La
portería se desdobla en **salidas** (`goalkeeping`) y **reflejos** (`reflexes`).

El embudo `tanh` simplificado anterior (**disparo → a puerta → gol** con
`tanh((ataque − defensa_rival)/escala)`) sigue disponible como `engine="legacy"`
para A/B y como fallback. Ambos son **deterministas por `seed`**. Constantes en
`app/engine.py` (`FDF_*`), calibradas con `calibrate.py` (~2.7 goles/partido).

Distribución resultante (equipos parejos, con ventaja de campo):

| Métrica | Valor | Referencia liga real |
|---|---|---|
| Goles/partido | ~2.7 | ~2.7 |
| Victoria local / empate / visitante | ~47% / 25% / 28% | ~45% / 26% / 29% |
| Tiros / a puerta (local) | ~11 / 5 | ~12 / 4-5 |
| Amarillas por equipo | ~1.9 | ~1.8 |

## Contrato HTTP

- `GET /health` → `{ "status": "ok", "engine": "v3", "version": "3.0.0" }`
- `POST /simulate` con `SimulateRequest` → `SimulationResult`

`SimulationResult` tiene la forma que el backend Node persiste:
`homeGoals, awayGoals, homeStats, awayStats, events[], motm, homeRatings[], awayRatings[]`.

**Campos aditivos** (defaults compatibles; quien no los lea no se rompe):

- `*Ratings[].position` (aditivo): `POR|DEF|MED|DEL` del jugador, para que el
  visor 2D del frontend coloque a los 22 en el campo por líneas.
- `events[].playerId` y `*Ratings[].playerId`: id del jugador en la BD. Solo se
  rellena si la entrada (`PlayerInput.id`) lo trae; si no, es `null`. Sirve para
  mapear goles/tarjetas → jugador real (ledger de sanciones del backend).
- `*Ratings[].assists`: asistencias por jugador.
- **Eliminatoria**: `SimulateRequest.knockout` (bool, def. `false`). Si es `true` y
  hay empate a los 90', se juega prórroga (2×15') y, si persiste, tanda de penaltis.
  La respuesta añade `knockout`, `decidedBy` (`regular`|`extra_time`|`penalties`),
  `winner` (`home`|`away`|`null`), `homePenalties`, `awayPenalties`. En liga
  (`knockout=false`) estos campos toman valores neutros y nada cambia.
- **Lesiones y cambios**: `injuries[]` (`{playerId, playerName, team, minute,
  severity` `leve`|`media`|`grave`, `matchesOut` 1 / 2-4 / 5-10`}`) y
  `substitutions[]` (`{team, minute, out, in, reason` `tactic`|`injury`|`fitness``}`; el
  banquillo son los jugadores `isStarter=false` de `players[]`, máx. 3 cambios por
  equipo). Lesión/fitness se calculan con un **rng derivado aparte**, así que NO alteran
  el flujo de juego: la calibración de liga es idéntica con o sin ellos. Arrays vacíos si no pasa nada.
- **Sustituciones programadas (R4)**: `TacticInput.subsLogic` = lista de hasta 3 reglas
  `{fromMin, toMin, condition` `any`|`winning`|`drawing`|`losing``, outId, inId}`. Cada
  regla se ejecuta (determinista, sin rng) en el PRIMER minuto de su ventana en que el
  marcador cumple la condición, con **prioridad** sobre los cambios automáticos (consumen
  slots de los 3). `reason: "tactic"` en `substitutions[]`, entrada `phase: "cambio"` en
  `timeline[]`, y `*Ratings[].minutes` refleja los minutos reales (el que sale juega hasta
  su minuto; el que entra aparece en ratings con los minutos restantes; sin cambio = 90 o
  120 si hubo prórroga). Sin `subsLogic` (o lista vacía) el partido es bit a bit idéntico.
- **Plan condicional (X5)**: las mismas reglas de `subsLogic` pueden incluir
  `changes`, `tactic` o `set` con palancas tácticas (`construction`, `destruction`,
  `pressing`, `tempo`, `width`, `mentality`, `marking`, `formation`, estilos, zonas y
  lanzadores). Ejemplo: `{fromMin:60, condition:"losing", changes:{mentality:75,
  offensiveStyle:"pases_largos"}}`. Cuando hay cambios tácticos, el motor resegmenta el
  partido desde el minuto de disparo y aplica esas palancas al tramo posterior. El resultado
  añade `tacticalChanges[]` y una entrada `phase:"ajuste_tactico"` en `timeline[]`.
- **Timeline de retransmisión**: `timeline[]` (`{minute, phase` saque|construccion|
  progresion|remate|gol|parada|falta|final`, team, zone, text, playerId?}`) — relato
  cronológico jugada a jugada para el "match viewer". Abre con `saque` y cierra con `final`.
- **Stats por jugador** (en `*Ratings[]`, aditivas): `shots, shotsOnTarget, passes,
  passesCompleted, passAccuracy, tackles, interceptions, keyPasses, xg`. La `rating`
  0-10 se DERIVA de estas acciones (goles, xG, asistencias, pase, paradas…), no de
  bonus sueltos; el MOTM sigue siendo por mérito.

### Táctica avanzada e IA de entrenador

`TacticInput` admite palancas opcionales y **neutras por defecto** (50 ⇒ partido
idéntico al actual): `pressing`, `tempo`, `width`, `mentality` (0 defensiva..100
ofensiva), `marking` (`zonal`|`individual`) y los lanzadores (`penaltyTaker`,
`freeKickTaker`, `cornerTaker`). Efectos medidos (equipo local, resto neutro):

| Palanca | Efecto |
|---|---|
| pressing 95 | el rival tira menos (~−10%) y se recuperan más balones |
| mentalidad 90 (ofensiva) | más tiros propios, pero más expuesto atrás |
| marking individual | más defensa en duelos directos, con leve coste de posesión/fatiga |
| penalty/freeKick/corner takers | bonus suave a tandas y balón parado si el id/nombre existe |
| fouls alto | menos faltas y menor probabilidad de amarilla (control disciplinario) |
| pressing/tempo altos | fatigan más a tu equipo en el tramo final |

`engine/app/manager_ai.py` (módulo PURO) + `POST /lineup`: dada una plantilla y un
objetivo (`ofensivo`|`equilibrado`|`defensivo`), elige formación + mejor ONCE
(excluye lesionados/sancionados, 1 portero, respeta los huecos) + tácticas coherentes
+ lanzadores. `suggest_subs(...)` decide cambios in-match (refresca cansados; mete
ataque si se pierde tarde, defensa si se gana). Determinista por `seed`. Sirve para
que los clubes NPC jueguen con criterio.

### Desarrollo de jugadores (módulo aparte)

`engine/app/development.py` es un módulo PURO, independiente del motor de partido
(no afecta a su calibración). `POST /develop` recibe una plantilla + el contexto del
periodo (`trainingFocus`, `minutesPlayed`, `matchRating`, `restDays`, `academyLevel`) y
devuelve, por jugador, los deltas de los 9 atributos FDF, los atributos resultantes y la
nueva forma física (`muscularFitness`/`matchRhythm`). Determinista por `seed`.

La evolución sigue una curva por **edad** y **potencial**: jóvenes con techo alto crecen
rápido, meseta en la madurez, declive de veteranos; nadie supera su `potential`. El
`trainingFocus` dirige qué atributos suben; minutos y nota aceleran, la falta de descanso
y la `injuryProneness` frenan; `personality`/`consistency` modulan la varianza.

Calibración (`python calibrate_dev.py`, 40 periodos/temporada):

| Arquetipo | Δ overall/temporada |
|---|---|
| Crack joven (18, pot 90, ov 70) | +1.8 |
| Promesa (20, pot 82) | +0.7 |
| Joven techo bajo (19, pot 72) | +0.1 |
| Prime en su techo (26, pot 80) | ~0 |
| Veterano (33) / veterano viejo (36) | −1.5 / −3.5 |

### Clima y fatiga dinámica (Etapa 2)

Entradas opcionales y neutras por defecto (no mueven la calibración base):

- `PlayerInput.muscularFitness / mentalSharpness / matchRhythm` (0-100). Si faltan,
  caen al `fitness` del jugador. La **fatiga** hace decaer el rendimiento efectivo a
  partir del minuto 60 según `muscularFitness/matchRhythm`: los menos en forma pierden
  precisión de pase, remate y entradas en el tramo final (y un cambio fresco lo
  recupera). Con forma 100 el decaimiento es 0 → partido idéntico.
- `SimulateRequest.weatherCondition` (`soleado|nublado|lluvia|nieve|calor|frio`) y
  `temperature` (ºC). `soleado`/20º es neutro. Lluvia/nieve restan precisión (menos
  goles); calor/frío extremos aceleran la fatiga. El clima aparece en la apertura del
  `timeline`.

Impacto medido (8000 partidos parejos, nivel 75, forma plena):

| Clima | Goles/partido | vs soleado |
|---|---|---|
| soleado / nublado | 2.11 | — (neutro) |
| lluvia | 1.79 | −15% |
| nieve | 1.52 | −28% |
| calor / frío | ~2.0 | leve ↓ por fatiga |

### Entradas FDF: asistencia, estilos de juego y zonas (Issue 1.3)

Tres entradas opcionales tomadas del manual FDF (`docs/manual-managerfdf-referencia.md`),
**neutras si faltan** (partido bit a bit idéntico — verificado por test):

- **Asistencia al estadio (manual §2.10)** — `SimulateRequest.attendancePct` (0-100, %
  de lleno) y `homeStimulated` (bool, discurso del entrenador). Bonifica SOLO al local
  por posición natural: `>90%`: DEF+2 MED+3 DEL+5 · `>70%`: DEF+1 MED+2 DEL+3 · `<71%`:
  MED+1 DEL+2; estimulados añade POR+1 DEF+1 MED+2 DEL+4. El backend debe calcular el
  % de lleno (economía/taquilla) y pasar `homeStimulated` cuando el club use el discurso.
- **Estilos de juego (manual §2.9)** — `TacticInput.offensiveStyle`
  (`abrir_campo|pases_cortos|buscar_espalda|moverse_entre_lineas|pases_largos`) y
  `defensiveStyle` (`presion_bandas|presion_centro|fuera_de_juego|defensa_adelantada|
  presion_mediocentro`). Matriz piedra-papel-tijera: tu ofensivo contra el defensivo
  rival da +6/+2 de construcción a ti o +6/+4 de destrucción a él; **no elegir contra
  un rival que sí elige regala +10**. Ambos `null` = neutro.

  **Profundidad C3 (5 jun 2026):** los puntos de la matriz escalan por
  `STYLE_SCALE = 1.2` (antes 0.5) — ganar el duelo táctico vale ahora ≈ la ventaja
  de campo — y el bonus de construcción **arrastra posesión** (`STYLE_MIDFIELD_FACTOR
  = 0.5` sobre el dominio del medio): dos tácticas opuestas producen distribuciones
  distinguibles de goles Y posesión con las mismas semillas (test
  `test_styles_depth.py`). Tabla de counters (qué DEFENSA frena cada ataque):

  | Estilo ofensivo | Lo frena (+6 des) | Le gana (+6 con) | Efecto en una frase |
  |---|---|---|---|
  | `abrir_campo` | `presion_bandas` | `presion_centro` | Amplitud: estira al rival hacia las bandas |
  | `pases_cortos` | `presion_centro` | `presion_bandas` | Toque interior: domina el medio si no te presionan ahí |
  | `buscar_espalda` | `fuera_de_juego` / `presion_mediocentro` (+4) | `defensa_adelantada` | Desmarques al espacio: castiga defensas adelantadas |
  | `moverse_entre_lineas` | `defensa_adelantada` / `presion_mediocentro` (+4) | `fuera_de_juego` | Recibir entre líneas: rompe el fuera de juego |
  | `pases_largos` | `fuera_de_juego` / `defensa_adelantada` (+4) | `presion_mediocentro` | Saltarse el medio: anula la presión al pivote |

  Y al revés, cada DEFENSA en una frase: `presion_bandas` cierra la amplitud
  (frena `abrir_campo`), `presion_centro` asfixia el toque interior (frena
  `pases_cortos`), `fuera_de_juego` caza desmarques (frena `buscar_espalda` y
  `pases_largos`), `defensa_adelantada` achica espacios entre líneas (frena
  `moverse_entre_lineas`) pero regala la espalda, y `presion_mediocentro` ahoga
  al pivote (frena `buscar_espalda`/`moverse_entre_lineas`) pero sufre el pase largo.
- **Zonas (manual §2.6, bonif.def del 1d40)** — `TacticInput.attackZones`
  (`{"left":40,"center":20,"right":40}`, % de ataque por carril) y
  `defenseReinforcement` (`{"left":0-3,...}`, puntos de refuerzo). Cada punto de
  refuerzo resta un **5% de éxito** al rival cuando ataca por ese carril (máx. 3 = −15%).
  Si ningún equipo aporta datos de zona, no se consume ningún draw: neutro total.

### Arquitectura del azar (clave de la calibración)

El motor separa dos fuentes de aleatoriedad deterministas por `seed`:
- **rng principal** decide lo que se calibra: ¿hay remate? ¿va a puerta? ¿es gol?
  ¿tarjeta? Sus constantes (`SHOT/TARGET/CONVERT_*`, etc.) se afinan con `calibrate.py`.
- **rng derivado** genera todo lo narrable (quién remata/asiste, pases, minutos, texto
  del timeline). Cambiarlo enriquece el relato pero NO mueve el marcador ni la
  calibración. Por eso se puede añadir detalle sin recalibrar.

### Cadena de gol por habilidad (E16)

Cada gol se narra como una CADENA de fases en el timeline, todas con `playerId`
y protagonistas elegidos por `_weighted_pick` ponderando atributos FDF (frng-only):
1. `construccion` — la recuperación/arranque (DEF/MED por `tackling+organization`).
2. `progresion` opcional (~45%) — el regate (por `dribbling+unmarking`).
3. `progresion` — el pase clave (MED/DEL por `passing+organization`); en ~80% de los
   goles ese creador firma la ASISTENCIA (antes era un medio al azar al 60%).
4. `gol` — el remate (el tirador ya salía de `_weighted_shooter`).
El gol en sí lo decide el rng principal ANTES de generar la cadena ⇒ calibración intacta.

### Carril y duelos por eslabón (C7, 9 jun 2026)

**Carril de cada jugada.** Toda entrada de jugada del timeline (`construccion`,
`progresion`, `remate`, `parada`, `gol`) lleva `lane: "left"|"center"|"right"`.
El carril deriva de `attackZones` si el mánager las configuró (mismos pesos de
siempre) y, si no, de la **formación + width**: `FORMATION_LANE_BIAS` da el sesgo
base por formación (4-3-3 carga bandas, 3-5-2/5-3-2 el centro…) y `width` lo
desplaza (±35% bandas/centro en los extremos). Sin `defenseReinforcement` rival
el carril es SOLO narrativo: el marcador no cambia (garantizado por test).

**Duelo de atributos por eslabón.** Las entradas con jugada llevan
`duel: { att, def }` donde cada lado es `{ playerId, name, position, attrs }`
y `attrs` contiene los valores EXACTOS que ponderó el motor en ese paso.
La entrada `phase:"gol"` adjunta además `chain: ChainLink[]` — la anatomía
completa de la jugada para el visualizador:

| step | atacante (attrs) | defensor (attrs) |
|---|---|---|
| `recuperacion` | quien roba: `tackling+organization` | rival que pierde el balón (MED/DEL): `passing+organization` |
| `regate` (~45%) | `dribbling+unmarking` | rival DEF/MED batido: `tackling` |
| `pase_clave` (~80%, firma asistencia) | `passing+organization` | rival que marca: `tackling+organization` |
| `remate` (siempre, último) | `finishing+shooting+unmarking` | el PORTERO rival: `goalkeeping` |

Defensores elegidos por `_weighted_pick` con frng ⇒ deterministas por semilla y
sin efecto en la calibración (el gol ya estaba decidido). Campos ADITIVOS:
`lane`/`duel`/`chain` son `null`/ausentes en entradas sin jugada y en partidos
antiguos. Tests en `tests/test_lanes_chain.py`.

## Desarrollo

```bash
cd engine
pip install -r requirements-dev.txt

uvicorn app.main:app --reload --port 8000   # servir
pytest                                       # tests (motor + API)
python calibrate.py 20000                    # informe de calibración
```

## Docker

Se construye y orquesta desde el `docker-compose.yml` raíz como servicio `engine`.
El backend recibe `ENGINE_URL=http://engine:8000`.

### Rendimiento y realismo (C8, 9 jun 2026)

**Optimización (semántica intacta, verificado bit a bit).** El bucle caliente de
`_resolve` precomputa por equipo y partido lo que no cambia durante la simulación
(pesos del rematador, habilidades de pase, términos constantes de precisión,
pool de pases clave) en vez de releer atributos por jugada. Misma secuencia de
draws de ambos rng ⇒ **resultados bit a bit idénticos** a la versión anterior
(comprobado en 240 partidos × 4 variantes con estilos/zonas/subsLogic):
~0,73 → ~0,56 ms/partido (−23%).

**Lote por jornada — `POST /simulate-batch` (aditivo).** El coste real del tick
no es el cómputo (<1 ms/partido) sino el roundtrip HTTP por partido. El endpoint
acepta `{ matches: [SimulateRequest, …] }` (máx. 512; cada uno admite `matchId`
de correlación que se ecoa) y devuelve `{ results: [{ matchId, result }] }`.
Mismo resultado exacto que `/simulate` individual (test). En el backend,
`simulateGamesBatch` (engineClient.ts) lo consume con fallback automático a
partido-a-partido; ×1,6 ya sin red — con red real (docker) el ahorro es un
roundtrip por partido.

**Informe de realismo (1000 sims, equipos 45-75 de media, formaciones variadas):**
goles/partido 2,50 (real ~2,7) · local 42,5% / empate 21,7% / visitante 35,8%
(real ~45/25/30) · goles local/visitante 1,30/1,20 · 0-0 8,5% (real ~7-8%) ·
6+ goles 5,2% (~3%) · tiros 21,2 (real ~24-26) · a puerta 8,8 (~8-9).
**Decisión: NO recalibrar.** Las desviaciones son pequeñas y en parte artefacto
del banco sintético (gaps de calidad aleatorios 45-75 inflan victorias
visitantes y goleadas frente a una liga real); además la ventaja de campo en
partida REAL la aporta el backend vía `homeAdvantage` dinámico (estadio/afición),
normalmente mayor que el legacy 3.5 usado en el banco. Si tras R1/Z2 las
distribuciones reales del juego se desvían, recalibrar entonces `SHOT_BASE` y
la ventaja dinámica con datos de partida, documentándolo aquí.
