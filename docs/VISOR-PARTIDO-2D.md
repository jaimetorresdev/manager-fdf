# Visor de partido 2D — arquitectura, coherencia y diseño

Documento de referencia del **visor de partido** (retransmisión cenital 2D): cómo
se desarrollan las jugadas, cómo se mueven balón y jugadores, cómo entra el balón
en la portería y cómo se consigue un resultado coherente y espectacular.

El visor es **presentación pura**: NO calcula el resultado. Lee el `timeline` que
produce el motor (Python) y lo convierte en una animación coherente.

---

## 1. Flujo de datos

```
engine/app/engine.py            →  timeline[] (JSON, fases/zonas/carriles/cadenas)
        │ (persistido por el backend como strings)
        ▼
src/lib/matchParse.ts           →  parseMatchDetail() normaliza al contrato types/engine.ts
        ▼
src/pages/MatchPage.tsx         →  carga el partido y monta el visor
        ▼
src/components/match/MatchCenter.tsx   →  orquesta reproducción (cursor + blend), HUD, crónica
        ▼
src/components/match/Pitch2D.tsx       →  dibuja el campo SVG (jugadores, balón, porterías…)
        ▲
src/lib/pitchMovement.ts        →  MOTOR DE MOVIMIENTO (posiciones, balón, portero, identidad)
src/lib/matchAnimation.ts       →  zoneLaneToPoint() (zona/carril → punto). NO TOCAR (tests).
```

- `MatchCenter` mantiene `cursor` (índice del evento actual) y `blend` (0→1 dentro
  del evento, avanzado por `requestAnimationFrame` durante `stepDur` ms).
- En cada frame, `Pitch2D` llama a `computePitchFrame(...)` que interpola balón y
  los 22 jugadores entre el evento anterior y el actual.
- `matchAnimation.ts` está **fijado por `tests/lib/matchAnimation.test.ts`**
  (determinismo de `zoneLaneToPoint`, conteo de frames/goles, marcador acumulado).
  No se modifica.

---

## 2. Contrato del `timeline` (techo de coherencia)

Cada entrada: `{ minute, phase, team, zone, lane?, playerId?, duel?, chain?, text }`.

| phase | zone típica | lane | duel | chain | significado |
|---|---|---|---|---|---|
| `saque` | med | — | — | — | saque inicial / reanudación (centro) |
| `construccion` | def | sí | a veces | — | inicio de jugada de gol (recuperación) |
| `progresion` | med | sí | a veces | — | conducción / regate / pase clave |
| `remate` | area | sí | sí | — | disparo que se va fuera |
| `parada` | area | sí | sí | — | disparo atajado por el portero |
| `gol` | area | sí | sí | **sí** | gol — única fase que lleva `chain[]` completa |
| `falta` | med | — | — | — | amarilla/roja |
| `cambio`/`ajuste_tactico` | med | — | — | — | sustitución / ajuste (toleradas) |
| `final` | med | — | — | — | final del partido |

**Patrón de un gol** (eventos consecutivos del mismo minuto):
`construccion(def) → [progresion(med) regate] → progresion(med) pase_clave → gol(area)`.
La `chain[]` del evento `gol` reproduce la anatomía (recuperacion → regate →
pase_clave → remate) con los **duelos de atributos** que ponderó el motor.

> El balón ya recorre una construcción real (def → med → área) entre eventos; el
> visor solo debe moverlo con fluidez y meterlo en la red.

---

## 3. Modelo de coordenadas (`pitchMovement.ts` ↔ `Pitch2D.tsx`)

- Campo lógico `W=100 × H=64`, centro `CY=32`. **viewBox extendido `-4 0 108 64`**
  para que quepan las redes tras las líneas de gol.
- Líneas de gol: **x=0 (izda, la defiende `home`) y x=100 (dcha, la defiende `away`)**.
  `home` ataca a la derecha; `away` a la izquierda.
- Portería (`GOAL`): boca `y ∈ [26.5, 37.5]`, red de profundidad `NET_DEPTH=3.4`
  por detrás de la línea; el balón reposa `NET_INSET=1.8` dentro de la red
  (gol home → `x≈101.8`, gol away → `x≈-1.8`).
- Áreas: grande `16.5×40`, pequeña `5.5×18`; puntos de penalti en `x=11 / x=89`;
  arcos y banderines de córner dibujados.
- Líneas de jugadores (`LINE_X`, perspectiva home): `POR 5.5 · DEF 17 · MED 38 · DEL 58`
  (espejado para away). Carriles (`LANE_Y`): `left 20 · center 32 · right 44`.

---

## 4. Movimiento del balón — fluido y coherente

**Segmentación por jugada (clave de coherencia).** El timeline es una lista de
MOMENTOS, no una simulación continua: dos eventos seguidos suelen ser jugadas
distintas en zonas opuestas. Por eso `computePitchFrame` decide con
`isContinuousPlay(prev, step)` (mismo equipo, mismo minuto, fases que encadenan):
- **Jugada que continúa** (p. ej. la cadena de gol `construccion→progresion→gol`,
  todo al mismo minuto): el balón y los jugadores **fluyen** desde el evento anterior.
- **Jugada NUEVA** (cambio de posesión, otro minuto, saque/falta): arranca **local**
  con `ballOriginFor(step)` (una zona por detrás, mismo carril) — **el balón NO vuela**
  de un extremo a otro entre jugadas sin relación, y los jugadores tampoco se deslizan
  de campo a campo (en jugada nueva el `from` es el propio evento). Es el corte de
  retransmisión entre jugadas.

`computePitchFrame` construye 4 waypoints `P0,P1,P2,P3` (evento −2, −1, actual,
siguiente, solo los CONTINUOS) y delega en `ballAlongStep`.

### Juego abierto (saque/construccion/progresion/falta)
- **Catmull-Rom centrípeto (α=0.5)** a través de `P0→P1→P2→P3`: la velocidad es
  **continua entre eventos**, el balón *rueda a través* de los waypoints en vez de
  pararse en cada uno (`easeInOutSine` antiguo paraba el balón en cada pase).
- *Time-warp* según los bordes del tramo:
  - `startEases` (cambio de posesión / saque) → `smoothStart(t)=t²`.
  - `endEases` (cambio de posesión / remate / final) → `smoothEnd(t)=t·(2−t)`.
  - ambos → `smootherstep`; interior↔interior → `u=t` (velocidad paramétrica
    constante = no se detiene en el waypoint).
- Garantía matemática: CR devuelve **exactamente `P1` en u=0 y `P2` en u=1** → sin
  saltos al avanzar de evento.
- Pelota elevada (`z`) solo en pases largos (`dist>18`).

### Remate / gol / parada (lógica de dos tramos, conservada)
1. Aproximación al área (`shotOrigin ≈ x 86/14`).
2. Disparo:
   - **`gol`** → el balón cruza la línea y reposa **dentro de la red** (`goalNetRest`),
     con arco `z` de golpeo.
   - **`remate`** → se marcha **por encima/fuera del poste** (no entra).
   - **`parada`** → se queda **en las manos del portero** (no cruza la línea).

### Reanudaciones
- `saque`/`final`: balón en el círculo central; los jugadores no portadores se
  quedan en su campo.

---

## 5. Alineación real (formación + posición detallada + dorsal)

El once se coloca con la **forma real de cada equipo** (no un 4-4-2 genérico):

- **Formación real**: el backend envía `homeFormation`/`awayFormation` ("4-3-3", "3-5-2"…);
  `matchParse` las captura y se propagan hasta `layout()`. Se reparte la cadena en
  líneas POR→DEF→MED→DEL según los conteos (1er número = DEF, último = DEL, intermedios = MED).
- **Posición detallada (15 roles)**: el backend enriquece cada rating con `detailedPosition`
  (POR/LD/CT/LI/PIV/ORG/MCO/BOX/INTD/INTI/MP/EXTD/EXTI/DC/F9). La tabla `DPOS` mapea cada
  código a (línea, profundidad `dx`, lado `side`): laterales abren a banda, pivotes bajan,
  extremos se estiran amplios y arriba, el DC se adelanta, el F9 cae.
- **Dorsal real**: `number` = `squadNumber` (BD, vía backend) → si falta, el dorsal clásico
  del rol (`CLASSIC_DORSAL`) → último recurso, el índice. Se usa en camiseta, disco del
  portador y lower-third.
- **Visitante espejado**: la formación del visitante se refleja por el centro (x→W−x,
  y→2·CY−y) para que ambos equipos se enfrenten correctamente.
- **Fallback**: sin `detailedPosition`/formación (partidos antiguos) → reparto por macro.
- **Equipación de portero**: `pickGkColor` elige de una paleta el color que maximiza la
  distancia a AMBOS kits (y entre porteros), así el meta nunca se confunde con el campo.

## 5b. Movimiento y coherencia de los jugadores (`placeTeam` + `interpolatePlaced`)

**Bloque coherente (clave de "fútbol real").** El equipo NO se mueve jugador a
jugador, sino como una **UNIDAD**: en `placeTeam` se calcula el centroide de la
formación y todo el bloque se **desplaza** hacia el balón (`LONG_PULL`/`LAT_PULL`,
con más arrastre en delanteros que en defensas vía `LINE_KX`) y se **comprime** al
defender (`LEN_SCALE_DEF`/`WID_SCALE_DEF`), con el lado débil metiéndose más
(`farSide`). Verificado: el centroide del equipo sube al acercarse al área y el
bloque rival encoge su anchura al defender.

**Transición (el momento "vivo").** Si el evento cambia de posesión en el mismo
minuto (`flipped` en `computePitchFrame`), el equipo que **recupera** abre carriles
y ataca (delanteros) y el que **pierde** comprime hacia el balón (urgencia del
contragolpe/repliegue).

**Altura `z`.** Porteros (estirada/atajada) y rematadores de cabeza ganan elevación
(`z`), que arquea en el evento (`sin`); el cuerpo se eleva y la sombra se separa y
encoge — primer "3D" real del visor.

Sobre todo lo anterior, el posicionamiento por evento ajusta roles concretos; la
interpolación da vida al frame:

- **Forma de equipo**: amplitud ofensiva con balón; bloque defensivo basculando
  con el balón sin él; **línea de cuatro plana** al defender; presión adicional en
  jugadas de área; separación tipo *boids* (anti-amontonamiento).
- **Portador**: pegado al balón en juego; en remate/gol/parada **dispara desde el
  área y NO persigue el balón a la red**.
- **Apoyos / desmarques**: carreras curvas (anticipación) hacia el segundo palo o
  abriéndose a banda en progresión/remate.
- **Portero** (`gkAction`): `catch`/`dive` en la **parada** (se estira hacia el
  balón, escalado por su `goalkeeping` real), `beaten` en el **gol** (queda a
  contrapié), `set` en el remate. La pose se inclina hacia/lejos del balón.
- **Velocidad y rumbo**: `interpolatePlaced` calcula `speed (0..1)` y `heading` por
  jugador → alimentan la **animación de carrera** (zancada de piernas + balanceo
  del torso + inclinación según velocidad) y la **orientación**.
- **Continuidad en el cambio de posesión** (`handoff`): el portador entrante
  arranca a medio camino del balón (ráfaga visible, ≤40% del hueco) en vez de
  teletransportarse.

---

## 6. Identidad del jugador con balón (siempre visible)

`resolveCarrier(step, homeRatings, awayRatings)` → `CarrierInfo`. Resuelve SIEMPRE a un
**nombre real** o no muestra nada (nunca un fragmento de frase tipo "corta el"):

1. `playerId` (tolerante a string/number) buscado en **AMBAS plantillas** — clave: un
   robo (`progresion` de balón perdido) o una parada referencia a un jugador del equipo
   RIVAL, así que se busca en las dos y el `team`/color sale de donde aparece.
2. Nombre estructurado del `duel.att` / último eslabón de `chain` (el motor SIEMPRE lo da
   en remate/parada/gol).
3. Último recurso: **solo un nombre propio** del texto (`nameFromText` estricto, con lista
   negra de verbos/etiquetas de equipo y *folding* de acentos) — jamás fragmentos.
4. Si no hay nombre identificable (o es saque/final) → **no se muestra** el rótulo.

Esto corrige los rótulos rotos ("desde lejos remata", "corta el", "la posesión") que salían
al buscar el id en la plantilla equivocada y caer a parsear la narración.

Render:
- **Lower-third broadcast** (DOM, en `MatchCenter`, dentro de `mc-pitch-inner`):
  dorsal + nombre completo + posición (`PosBadge`) + verbo de fase
  (CONSTRUYE/CONDUCE/REMATA/¡GOL!). Abajo-izquierda (home) / -derecha (away), con el
  color de la equipación; en gol vira a verde. Independiente del zoom/temblor SVG y
  con escalado por `@container`.
- **Disco de identidad** sobre el jugador en el campo (dorsal + cursor) como ancla
  espacial, además del aro/halo del portador.

---

## 7. Capas visuales e inmersión

Todo con **SVG + CSS** (sin canvas/WebGL), animado por `transform`/`opacity`:

- **Césped**: degradado base + rayas de corte + franjas + desgaste en puntos de
  penalti y centro + brillo + degradado de profundidad (pseudo-3D).
- **Estadio**: gradas con patrón de público tras ambas porterías (con *fade*),
  banderines de córner que ondean, barrido de focos, viñeta dinámica.
- **Jugadores**: equipación sombreada, dorsal estable, **brazalete de capitán**
  (mejor valorado de campo), portero diferenciado (cuello *teal* + guantes),
  sombra a ras de suelo.
- **Balón**: premium con giro en disparos y **estela de movimiento** según
  velocidad.
- **Follow-spot**: charco de luz que sigue al balón (se intensifica en jugadas de
  área).
- **Celebración de gol** (al entrar en la red): **temblor de la red por carril**,
  malla frontal (el balón se lee dentro), tinte del color del equipo, flash de
  pantalla, **temblor de cámara**, anillos de onda, **confeti determinista**, foco
  del goleador y rótulo **¡GOOOL!**.
- **Cámara** (`broadcastCamera.ts`): *punch-in* hacia la portería en gol (1.22) /
  remate, con *clamp* al lienzo extendido para que la red entre en cuadro.
- **Clima**: partículas de lluvia/nieve según el parte meteorológico.
- **Grada reactiva** (`CrowdStrip`): la intensidad/velocidad sube con el momentum y
  en remates/paradas; estallido en el gol.

---

## 8. Rendimiento y accesibilidad

- El único trabajo por frame es `computePitchFrame` dentro de un `useMemo` (puro,
  O(22) jugadores + O(1) balón, sin lecturas/escrituras de layout).
- Animaciones de carrera/banderín/confeti/foco son **independientes** y NO se
  desactivan con `.p2d--live` (que solo anula *transiciones* de posición porque las
  conduce el `requestAnimationFrame`).
- `prefers-reduced-motion`: regla global que anula animaciones/transiciones; el
  balón queda en su destino correcto (`P2`) por geometría y el portador sigue
  nombrado. `stride=0` deja a los jugadores quietos y limpios.
- El rótulo del portador se recalcula por **evento** (memo sobre `step`), nunca por
  frame.

> Nota: en pestañas ocultas/headless el navegador **pausa `requestAnimationFrame`**,
> por lo que la animación parece congelada en una captura automática; en un
> navegador visible corre a 60fps.

---

## 9. Archivos y responsabilidades

| Archivo | Responsabilidad |
|---|---|
| `src/lib/pitchMovement.ts` | Motor de movimiento: geometría `GOAL`, `placeTeam`, `computePitchFrame`, `ballAlongStep` (Catmull-Rom + disparos), portero, `resolveCarrier`/`resolveCarrierId`, `interpolatePlaced`, `stepDurationMs`. |
| `src/components/match/Pitch2D.tsx` | Render SVG: césped, porterías+red, jugadores (run-cycle/capitán/portero), balón+estela, follow-spot, celebración, clima, banderines, gradas, `P2D_CSS`. |
| `src/components/match/MatchCenter.tsx` | Orquestación: `cursor`+`blend` (rAF), HUD/marcador, lower-third del portador, crónica, controles, descanso/final, sonido, grada. |
| `src/components/match/broadcastCamera.ts` | Presets de cámara y *punch-in* hacia la portería. |
| `src/components/match/CrowdStrip.tsx` | Grada animada reactiva al momentum. |
| `src/components/match/GoalReplay.tsx` | Moviola del gol re-trazando `chain[]` + duelos. |
| `src/lib/matchAnimation.ts` | `zoneLaneToPoint` y guion (FIJADO por tests). |
| `src/lib/matchParse.ts` | Normalización defensiva del payload: captura `squadNumber`, `detailedPosition` y `homeFormation`/`awayFormation`. |
| `server/.../matches.routes.ts` | `enrichPlayerStats` adjunta `squadNumber` + `detailedPosition` a los ratings (detalle + público) desde BD; el payload ya envía las formaciones. |

---

## 10. Seguridad de tests y constantes de ajuste

- **No modificar** `zoneLaneToPoint`, `scoreAtEvent`, `buildMatchAnimationScript`
  (`matchAnimation.ts`) → romperían `tests/lib/matchAnimation.test.ts`.
- Constantes ajustables sin riesgo: `GOAL.*`, `LINE_X`, `ZONE_SHIFT`, `LINE_WEIGHT`,
  `settle` de los disparos, magnitudes de zancada/inclinación en `P2D_CSS`, zoom de
  `broadcastCamera`.

### Cómo probar el visor en local
- `npm run dev` y abrir un partido jugado en `/matches/:id`, o el showcase del
  `Match Center 2D` en `/styleguide` (con la cadena de gol de ejemplo).
- Para iterar sin backend puede montarse temporalmente una página que renderice
  `MatchCenter` con un `SimulationResult` de ejemplo (timeline con `chain[]`).

---

## 11. Realismo: duelos, física e inmersión de estadio

Mejoras basadas en investigación de los mejores simuladores top-down (FM 2D,
Sensible/Sociable Soccer, New Star) adaptadas a SVG+CSS a 60fps:

- **Coherencia por duelo** (`duelInfo` + snap en `placeTeam`): cada evento con
  `duel`/`chain` coloca al **defensor nombrado** en el punto del duelo (goalside
  del balón) con su pose: entra (`tackler`) si gana el defensor, queda batido
  (`beaten`) si gana el atacante. Un **tether** une atacante y defensor, verde si
  gana el ataque, rojo si gana la defensa (`attrSum` del motor). Es la expresión
  literal de «contra qué defensor se enfrenta y quién gana el duelo».
- **Curva Magnus** (`shotBend` en `ballAlongStep`): el disparo describe un arco
  lateral que crece tarde (`sin(b²·π)`) según la definición del rematador y vuelve
  al destino — el gol sigue entrando en la red, el remate sigue yéndose fuera.
- **Rebote en la parada**: tras la atajada el balón rebota (COR ~0.8) en el último
  15% del trayecto.
- **Sombra que se separa**: la sombra del balón encoge y se distancia al elevarse
  (clave de profundidad cenital).
- **Hit-stop** (rAF de `MatchCenter`): micro-congelación en el impacto (gol 150ms,
  parada 100ms, remate 80ms) con reanudación sin salto — el mayor golpe de impacto.
- **Temblor de cámara direccional decreciente** en el gol y un micro-temblor en el
  remate.
- **Estadio**: textura de césped (`feTurbulence` estático), vallas de publicidad
  tras las bandas, charcos de foco en las esquinas. Todo estático = coste 0 por frame.

---

## 12. Salto a "gran simulador" (física, IA off-ball, cámara suave)

Segunda oleada de realismo, destilada de investigación de los mejores simuladores
top-down (FM match engine 2D, Sensible/Sociable Soccer, New Star, eFootball/FIFA
replay cam) y aterrizada a SVG+CSS a 60 fps. Todo verificado con un tracer que llama
a `computePitchFrame` (build-up que fluye, jugada nueva que NO vuela, remate fuera,
gol que entra, parada corta, triángulo defensivo) + capturas. Firmas de
`computePitchFrame`/`ballAtStep` intactas; `zoneLaneToPoint` sin tocar.

### 12.1 Física del balón — peso del pase, rozamiento, comba, vuelo
`ballAlongStep` (privada) en juego abierto ya no para el balón en cada waypoint:
- **Peso de pase + rozamiento de rodadura** (μ≈0.07 → a≈0.69 u/s²). Reparametrización
  por velocidad con un **time-warp Hermite cúbico** `warpSpeed(t, sIn, sOut)` de
  velocidades de extremo prescritas: el balón ENTRA rápido (recibido al pie,
  `sIn≈1.25+chord·0.01`) y SALE con velocidad residual cuando la jugada CONTINÚA
  (`sOut = driven`, función de la longitud y del `passing` del ejecutor) — *rueda a
  través* del waypoint. Solo frena a reposo (`sOut≈0.14`) si la jugada termina, y
  arranca suave (`sIn≈0.22`) en jugada nueva. Garantía: la velocidad interior nunca
  cae a ~0 (tracer: min/peak ≈ 0.48, end/peak ≈ 0.92).
- **Vuelo asimétrico por arrastre**: el balón aéreo sube rápido y cae más vertical
  (`apex·sin(uᶧ·π)`, cresta pasada el medio), con un **bote de hierba** (COR≈0.55) al
  caer en balones en largo (`chord>24`).
- **Comba (Magnus)** en el disparo (rama de dos tramos): se desplaza SOLO el punto de
  control interior de una **Bézier cuadrática** hacia el palo lejano, con magnitud
  `0.12·chord·(finishing/100)·geom` (banda comba más que el centro, toque ≈ recto).
  El ORIGEN y el DESTINO no cambian → el gol sigue entrando, el remate sigue fuera y
  la parada no cruza la línea (tracer: comba banda 0.79 u, centro 0.46 u, extremo exacto).

### 12.2 Cámara broadcast SUAVE (transform-`<g>`, sin saltos de viewBox)
El viewBox queda FIJO en `-4 0 108 64`; todo el "mundo" (campo, jugadores, balón) vive
en un `<g class="p2d-cam">` con un **transform por frame**. Se calcula en `Pitch2D`
(donde está el balón en vivo) y se suaviza con **SmoothDamp** (muelle críticamente
amortiguado de Unity, `smoothDampAxis` en `broadcastCamera`):
- **Zona muerta** (no se mueve si el balón está cerca del centro) + **look-ahead**
  (adelanta en la dirección de la velocidad del balón, paso-bajo para no dar tirones).
- **Zoom objetivo** por fase/preset (`targetZoom`, ≤1.35) suavizado aparte; en `wide`
  el campo queda completo con un **punch-in cinematográfico** solo en gol/remate.
- **Clamp por zoom**: el campo SIEMPRE llena el cuadro (a zoom 1 el centro se fuerza a
  (50,32) → transform identidad = comportamiento previo intacto).
- **Corte de jugada**: si el balón SALTA (jugada nueva → origen local), la cámara CORTA
  en seco (corte de realización) en vez de barrer; los cortes naturales entre eventos
  (blend 1→0) se siguen suavizando. Sin reloj en el render (dt fijo ≈60 fps → puro).
  Reduced-motion → identidad estática. NaN-proof. HUD/rótulos/¡GOOOL! quedan FUERA del
  grupo (fijos a pantalla). Filtros pesados (glow) solo se re-rasterizan en los breves
  momentos con zoom (gol/remate) — en `wide` el coste de cámara es cero.

### 12.3 IA off-ball — coordinación defensiva y carreras con intención
- **Triángulo Presión / Cobertura / Equilibrio** (`placeTeam`, tras el snap del duelo
  y la separación, solo equipo que defiende y fases de alta señal): la PRESIÓN (el
  defensor del duelo, o el más cercano) aprieta goalside; la COBERTURA se sitúa por
  detrás y por dentro (lee el pase filtrado); el EQUILIBRIO sostiene el lado débil más
  profundo. Empuje ACOTADO desde su sitio (sin teletransporte), asignación voraz al más
  cercano, máx. 3 roles. El resto del bloque conserva su lógica (tracer: los más
  cercanos quedan goalside y separados ≥2 u, sin amontonarse).
- **Carreras al área coordinadas**: en remate/gol los dos apoyos atacan **palo cercano
  vs palo lejano** (par chocante), con split estable por jugador → no se amontonan.
- **Portero — achicar ángulo**: defendiendo (sin tiro aún), el portero SALE de su línea
  hacia el balón conforme se acerca al área (hasta ~6.5 u sobre la bisectriz, atento al
  palo cercano); en el remate se adelanta para tapar. Las poses dive/catch/beaten/set y
  la invariante de la parada (no cruza la línea) se conservan.

### 12.4 Ritmo — hit-stop escalado por potencia
El micro-congelado de impacto ahora **escala con la potencia del disparo** (definición
del rematador): un misil congela ~205 ms y un toque flojo ~55 ms (gol/parada/remate),
con reanudación sin salto. Solo en la ruta rAF (reduced-motion no lo usa).

### 12.6 Rediseño visual espectacular (jugadores, balón, campo, luz, celebración)
Rediseño completo de la capa de render (investigación de los mejores top-down: FM 2D,
Sensible/Sociable Soccer, New Star, eFootball + referencias) manteniendo INTACTO el
motor de movimiento, las firmas y `matchAnimation.ts`. Clave de rendimiento: **ningún
filtro vive ya dentro del grupo de cámara** (se re-rasterizaban con el zoom).
- **Perf**: el `feGaussianBlur` de las líneas se sustituye por **double-stroke bloom**
  (halo ancho tenue + línea nítida `#eef6ee`, sin filtro); el `feTurbulence` del grano
  de césped se mueve a una **capa estática de pantalla** (fuera de la cámara) → se
  rasteriza una vez. Sombras sin filtro: un único `radialGradient#p2d-soft-shadow`
  compartido por los 23 contactos.
- **Campo**: césped más profundo y frío (`#2f7d34→#2a7430→#1f5824`), **rayas de corte
  goal-a-goal** limpias (sin bandas horizontales que las ensuciaran), **anillo del
  jardinero**, viñeta recentrada (charco de luz sobre el centro), red con **cavidad
  recesada** + malla más marcada. Líneas con proporciones reales intactas.
- **Balón premium 6-paneles (Telstar)**: esfera lustrosa con caída radial de 5 paradas
  (`#fff→…→#9aa0aa`), **AO de borde**, **brillo especular FIJO** arriba-izquierda + punto
  caliente, **casquete pentagonal + costuras radiales** que GIRAN (clip estático) y un
  **tinte de cielo** que crece con la altura `z` (los balones aéreos se leen elevados).
- **Jugadores** (evolución, no reescritura): silueta de **"huevo de hombros"** cenital
  (masa ancha arriba) liderando con una **cabeza pequeña**; cuello en V direccional;
  **dorsal en la espalda alta con doble-flip** (nunca se espeja); kit con gradiente
  **top-lit** (luz arriba-izquierda); sombra de contacto suave que **se estira con la
  velocidad** y se separa al elevarse; portero **ensanchado ×1.12** con guantes/cuello
  teal; **portador** con aro dorado plantado + **rim-light** dorado en la camiseta (se
  retira el disco flotante de dorsal — era un "tell" de UI).
- **Celebración de gol** (sin chocar con los transforms de posición/pose, vía un
  envoltorio dedicado por jugador): el **goleador RUGE** (lean-back), sus compañeros
  **CONVERGEN** hacia él escalonados (vars `--cvx/--cvy` fijadas una vez), el rival
  **batido se HUNDE**, y un **fogonazo blanco** de pantalla — sumado a confeti, anillos,
  red que ondea, temblor y ¡GOOOL!. Todo transform/opacity; `prefers-reduced-motion`
  colapsa a poses estáticas (regla global + clase gated por `!reducedMotion`).
- **Luz**: una única dirección global (arriba-izquierda → sombras abajo-derecha) en
  jugadores y balón. Verificado en navegador: recorrido íntegro de 15 eventos sin
  errores ni NaN, 22 jugadores por frame; capturas before/after.

### 12.5 Limpieza visual (feedback de usuario)
Se RETIRARON las capas de telestración que ensuciaban el campo con múltiples líneas
confusas entre jugadores/balón, y la franja de grada decorativa:
- **Fuera de `Pitch2D`**: la línea de la cadena (`chainLines`), la flecha del pase clave
  (`passArrow`), el tether atacante↔defensor verde/rojo (`duelTether`), los arcos de
  apoyo portador→compañeros (abanico de líneas), la línea de trayectoria del disparo
  (`p2d-shotline`) y los puntos de estela del balón. El grupo del campo queda con SOLO
  jugadores + balón + efectos de gol. Se conserva el realce del portador (aro + disco
  con dorsal) porque señala quién lleva el balón sin ser una línea entre jugadores. La
  coherencia por duelo (pose entra/batido del defensor, posicionamiento) se mantiene;
  solo desaparece su LÍNEA. El balón conserva su micro-estela de velocidad (`streak`).
- **Fuera de `MatchCenter`**: la franja `CrowdStrip` (barras azul/rojo sobre el campo,
  decorativa, se leía como un ecualizador) — eliminada junto a su componente.

> **Diferido (mejora futura):** stagger temporal de las carreras (llegada escalonada)
> y pre-movimiento del receptor del siguiente pase; speed-ramp de slow-mo en el golpeo;
> repetición multinivel del gol; acoplar el giro del balón a su velocidad.
