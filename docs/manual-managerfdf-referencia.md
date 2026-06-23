# Manager FDF — Referencia completa de mecánicas (manual oficial)

> Documento de diseño extraído del manual de managerfdf.com. Sirve como referencia para construir nuestro juego de manager de fútbol web.

## 0. Visión general

- Juego online tipo manager (estilo PC Fútbol / Championship Manager) con **equipos y ligas reales** de Europa y Sudamérica (algunas con 2ª/3ª división).
- **Multijugador persistente por turnos**: 2 turnos diarios (11:00 y 23:00 GMT+1). Cada turno avanza ~3 días de juego → un partido cada día o día y medio real.
- Todo se configura **antes** del partido (táctica, cambios programados); durante el partido solo se visualiza (estilo Championship Manager). No hace falta estar presente: el resultado se oculta hasta que el manager lo visualiza.
- El manager empieza con 0 prestigio y elige entre equipos modestos; los grandes clubes exigen prestigio. Anti-trampas: 7 días logueado antes de poder fichar; ventas entre IPs compartidas = expulsión.
- Competiciones: ligas nacionales, copas, Champions, Libertadores, UEFA/Sudamericana, Intercontinental, Eurocopa, Mundial cada 4 años, amistosos pactados entre managers, mercado de acciones y ranking "Manager del Año".

---

## 1. SIMULADOR DE PARTIDOS (motor)

### 1.1 Estructura del partido
- 90 min = **80 jugadas posibles** en total (40 por equipo; 20 por equipo en cada parte de 45 min). Con un imposible 100% de acierto el resultado sería 40-40.
- Para cada jugada, según **construcción** (atacante) y **destrucción** (defensor) hay un % de que la jugada se lleve a cabo.

### 1.2 Probabilidad de que se inicie la jugada
`cre − des` (construcción atacante − destrucción defensor) → probabilidad de éxito inicial:

| cre − des | prob. éxito |
|---|---|
| <= 2 | 30% |
| > 2 | 40% |
| > 6 | 50% |
| > 11 | 60% |
| > 17 | 70% |
| > 24 | 80% |
| > 32 | 90% |

Modificador por marcador (sobre la creación):
- **Ganando: −10% por cada gol de diferencia**
- Empatando: n/a
- **Perdiendo: +10% por cada gol de diferencia**

Modificador por **diferencia de confianza de los entrenadores** (penaliza al equipo con menor confianza):

| dif. confianza | modificador creación |
|---|---|
| 8 ó 7 | +30% |
| 6 ó 5 | +20% |
| 4 ó 3 | +10% |
| 2, 1, 0, −1 ó −2 | n/a |
| −3 ó −4 | −10% |
| −5 ó −6 | −20% |
| −7 ó −8 | −30% |

### 1.3 Resolución de la jugada por fases
- Una jugada iniciada puede ser: **falta, penalti, córner o jugada de campo**.
- Jugada de campo: **5 fases** para acabar en gol. Balón parado: **3 fases** (faltas y córners) o **2** (penaltis). En balón parado se empieza en la fase 3.
- En cada fase, el/los atacantes empleados deben superar a un **defensor escogido aleatoriamente** según el lado de ataque: fases 1-2 → mediocampo rival; fases 3-4 → defensa; fase 5 → portero.
- Habilidad defensiva usada: **entradas**; portero: **salidas o reflejos** según la jugada. Si la fase usa 2 atacantes (p.ej. pase + desmarque) se hace la **media** de sus habilidades.

**Valor de fase (vf)** según `hab. atq − hab. def`:

| hab.atq − hab.def | fase 1 ó 2 | fase 3, 4 ó 5 |
|---|---|---|
| < −12 | base + 12 | base + 6 |
| < −6 | base + 12 | base + 8 |
| < −4 | base + 14 | base + 10 |
| < −2 | base + 16 | base + 11 |
| <= 2 | base + 18 | base + 12 |
| > 2 | base + 20 | base + 13 |
| > 4 | base + 22 | base + 14 |
| > 6 | base + 24 | base + 15 |
| > 8 | base + 26 | base + 16 |
| > 10 | base + 28 | base + 17 |
| > 12 | base + 30 | base + 18 |
| > 14 | base + 32 | base + 19 |
| > 16 | base + 34 | base + 20 |
| > 18 | base + 36 | base + 21 |
| > 20 | base + 38 | base + 22 |
| > 22 | base + 40 | base + 23 |
| > 24 | base + 42 | base + 24 |
| > 26 | base + 44 | base + 25 |
| > 28 | base + 46 | base + 26 |
| > 30 | base + 48 | base + 27 |
| > 32 | base + 50 | base + 28 |

**Valor base:**
```
base = 6 − (dif. goles × 2) − (goles totales × 2) + confianza
```
Modificador de confianza (misma escala de diferencia que arriba): +3 / +2 / +1 / 0 / −1 / −2 / −3.

**Tirada de éxito (avance de fase):**
```
1d40:  > bonif.def  Y  < vf + bonif.ofe  →  avanza fase
```
- Máximo de `(vf + bonif.ofe)` limitado a **39**.
- En **penaltis** no se suma la bonif. ofensiva y el **mínimo de vf es 28**.
- `bonif.def` = refuerzo defensivo en la zona por donde ataca el rival; `bonif.ofe` = modificador de la táctica.

---

## 2. TÁCTICAS

### 2.1 Estrategias
- Hasta **5 estrategias** guardadas. Se puede crear una táctica a partir de otra (copia todo excepto las sustituciones).
- Por estrategia: 11 inicial, banquillo, formación, lanzadores de faltas, hasta **8 jugadas entrenadas**, zonas de ataque y refuerzos defensivos.

### 2.2 Formaciones y terreno
- 14 formaciones: 4-4-2, 4-1-2-1-2, 4-2-3-1, 4-4-1-1, 4-3-3, 5-3-2, 1-4-3-2, 5-4-1, 1-4-4-1, 5-1-3-1, 1-4-1-3-1, 3-4-3, 3-1-2-1-3, 3-2-3-2.
- Cada formación da bonificaciones de **DES / CON / ATQ según el estado del terreno** (3 columnas por formación). Las de construcción/destrucción son puntos que se suman; las de ATQ son % de éxito en ataque: **+1 = +5%, +2 = +10%**.

### 2.3 Posiciones y adaptabilidad
- Jugador fuera de su demarcación: penalización en **todas** sus habilidades durante el partido según tabla de adaptabilidad (valores 0 / −10 / −20 según cercanía de posiciones; se muestra en naranja). El portero solo puede jugar de portero.

### 2.4 Creación y destrucción (control del mediocampo)
- **Creación** = (suma de la **organización** de los jugadores del centro del campo) / 12 + valor de cada jugada de ataque de campo válida. **−5 puntos por cada defensa (lateral o central) que no se incorpore al ataque** (casilla desmarcada).
- **Destrucción** = (suma de las **entradas** de los jugadores del centro del campo) / 12 + valor de cada jugada de defensa de campo válida.
- El número de jugadores en el centro no influye: se usa la media de los que ocupan esa posición.

### 2.5 Forma, cansancio y ventana de sustituciones
- Según forma/cansancio cada jugador aporta +1 a +5 puntos (icono reloj). Sumando los del 11 inicial, el equipo aguanta sin cambios hasta:
  - \> 54 → minuto 82 | > 51 → 75 | > 48 → 67 | > 45 → 60 | ≤ 45 → 52
- Agotado ese tiempo sin hacer ningún cambio: **−1 punto de construcción y destrucción por minuto**. No afecta a los que entran desde el banquillo.

### 2.6 Zonas de ataque y refuerzo defensivo
- Se reparte el **% de ataque por zona** del campo (izquierda/centro/derecha).
- Casillas para que **laterales y centrales se incorporen al ataque** (desmarcar cada una = −5 creación, ver 2.4).
- **Refuerzo defensivo**: según el nº de defensas de la formación se obtienen **1, 2 ó 3 puntos** de bonificación defensiva a repartir por zona (también defensa de faltas). Ej.: 4-4-2 con 2 puntos en banda derecha y centro → el rival tiene −10% de éxito atacando por ahí; conviene configurar los casos de 3, 4 y 5 defensas porque las sustituciones pueden cambiar la formación.

### 2.7 Jugadas en el partido
- Hasta **8 jugadas** por partido, previamente desarrolladas y entrenadas. Para que tengan efecto: coincidir la táctica y estar al menos 1 de los 3 jugadores presentes.
- `Puntuación = puntuación base × jugadores presentes / 3` (redondeo hacia abajo).
- Tipos: **J (campo)** — suma a construcción/destrucción, dependiente del dibujo táctico; **F (balón parado)** — independiente del dibujo: **±10% de éxito por cada 15 puntos de nivel acumulados** y añade la **mitad** de su puntuación a construcción/destrucción.
- Colores: verde = ataque, rojo = defensa, amarillo = puntuación parcial / jugador fuera del 11.

### 2.8 Sustituciones programadas (condicionales)
- Se definen por **rango de minutos + condición de resultado** (ganando / empatando / perdiendo, ganando de N o más...), pudiendo incluir **cambio de táctica**.
- Máximo 3 sustituciones; si una modificación no puede ejecutarse al completo, no se ejecuta.

### 2.9 Estilo de juego (piedra-papel-tijera)
- Un estilo **ofensivo** (abrir el campo, pases cortos, buscar espalda, moverse entre líneas, pases largos) y uno **defensivo** (presión en bandas, presión en centro, fuera de juego, defensa adelantada, presión mediocentro), común a todas las estrategias.
- Matriz de contraataques (el estilo correcto contra el del rival da +6 a tu construcción o destrucción; combinaciones parciales +2/+4; **no elegir nada regala +10 al rival**).
- **Continuidad**: hasta 4 puntos; cambiar el estilo los pone a cero; por cada punto que falte → **−1 confianza del entrenador** en el partido.
- Lanzadores de faltas/penaltis: lista ordenada nominativa; si el elegido no está en el campo, pasa al siguiente.

### 2.10 Bonificación por asistencia al estadio (al equipo local, por posición natural)

| Posición | estimulados | > 90% | > 70% | < 71% |
|---|---|---|---|---|
| Porteros | +1 | 0 | 0 | 0 |
| Defensas | +1 | 2 | 1 | 0 |
| Medios | +2 | 3 | 2 | 1 |
| Delanteros | +4 | 5 | 3 | 2 |

("Estimulados" = discurso del entrenador, ver 5.6.)

---

## 3. JUGADORES

### 3.1 Atributos
- **Habilidades de campo**: pase, entradas, tiro, organización, desmarque, remate, regate, faltas. **Portero**: salidas, reflejos. Valores 1–99.
- **Media**: media de las habilidades relevantes según posición.
- **Talento**: techo máximo de cada habilidad. Visible >22 años; parcialmente oculto 17–22 años con 5+ barras; oculto <17 años.
- **Prestigio** (1–99, mostrado en 7 barras): interés mediático; alimenta la masa social. +1 por victoria; −1 por derrota/empate en liga; +1 extra por victoria en Champions/Libertadores; +3 por entrenamiento con selección. También varía en pretemporada.
- **Moral**: según resultados y participación; influye en juego y entrenamiento.
- **Experiencia** (1–99): +1 por partido jugado. Penalización en partido: 81-90% → −1; 71-80% → −3; 61-70% → −4; 51-60% → −5; 41-50% → −7; 31-40% → −8; 21-30% → −9; <21% → −12.
- **Mentalidad**: cada jugador tiene mentalidad y grupo de afines. Desmotivado (aspa roja) = talento −5 en todo. Si en **febrero** está a las órdenes de un manager (o psicólogo) con mentalidad afín → se motiva (+5 a los máximos) y **nunca vuelve a desmotivarse**.

### 3.2 Edad y retirada
- Cumplen años el **1 de enero**. Al pasar a **31 años: −2 puntos en el máximo de cada habilidad** (baja el techo, no el valor actual); se repite cada año.
- Con **33 años cumplidos no renuevan** (el apartado "años de contrato" siempre vale 0%). Edad máxima jugando: **38** (renovado con 32 por 5 temporadas).

### 3.3 Reposicionamiento
- Cambiar de posición requiere **≥75% de experiencia** y estar **entre agosto y febrero**. Cuesta **−15% de experiencia irrecuperable**. El portero no puede cambiar. Cada posición solo evoluciona a posiciones compatibles/adyacentes.

### 3.4 Dorsal
- Sin dorsal ("sin ficha") el jugador **no entrena ni juega**.

---

## 4. PLANTILLA, CONTRATOS Y MERCADO

### 4.1 Límites de plantilla
- <16 jugadores al cerrar el año → el club renueva automáticamente con **pérdida de prestigio y valoración** del manager.
- \>15 en primera plantilla para poder despedir; ≥19 entre primer equipo + juveniles para despedir o poner transferibles.
- Primer equipo + entrantes confirmados ≤ **30** para poder fichar. Primer equipo + cedidos fuera ≤ **26**. Sub-19: máximo **22**.

### 4.2 Contratos
- Terminan siempre el **último día de junio**. Máximo **5 temporadas** acumuladas; las renovaciones **suman** años al vigente.
- **Tope salarial** = 15% del efectivo en caja / 12 meses.
- **Salario mínimo aceptado**: reducción del 20% si acaba contrato este año, 15% con 1 año pendiente, 10% con 2, etc.
- **Límite legal de cláusula** según años de contrato: >5 años → ≤ salario×200; 4–5 → ×300; 3–4 → ×400; 2–3 → ×500; 1–2 → ×600.

### 4.3 Valoración de ofertas (renovación y fichaje)
- La valoración total es la **media de 4 apartados** (entorno, sentimental, expectativas, económico), pero hay **parámetros clave (llave) eliminatorios**: si uno falla, no acepta.
- Componentes: valoración del sueldo (debe superar su mínimo; más subida = mejor); cláusula (cuanto más lejos del límite legal, mejor); años de contrato (no >5 acumulados; 33+ no renueva); mentalidad del manager (igual 99% / grupo afín 50% / nada 0%); mentalidad de la plantilla (+15% por cada compañero del mismo grupo); misma nacionalidad (+10% por compañero); país del equipo (mismo país 99% / mismo continente 50%); ciudad (misma ciudad 99% / mismo país 50%); moral (<11% → no acepta); nivel del país (99% el 1º del ranking continental, −5% por puesto); nivel competitivo (1ª 40%, 2ª 30%, resto 20%; +45% Champions/Libertadores, +25% UEFA, +14% copa); pasado en el equipo (+1% por partido jugado antes en el club comprador).
- Con varias pujas: pasado un máximo de **3 turnos**, el jugador escoge la oferta con más valoración.
- Promoción de juvenil al primer equipo: acepta automáticamente.

### 4.4 Mercado
- Regido por **cláusulas de rescisión**: pagar cláusula o negociar con el club. Equipos CPU: solo cláusula completa.
- Mercado abierto en **julio, agosto y enero** (se negocia todo el año, la incorporación espera a la ventana). El cierre no afecta al staff.
- **Anti-reventa**: un recién fichado no acepta ofertas si el año actual = año de llegada o +1, salvo que la nueva oferta supere la valoración de su último traspaso.
- **Cesiones**: solo julio–diciembre, hasta final de temporada, el salario lo paga el club receptor; el propietario puede vender (efectiva al abrir mercado) pero no recuperar.
- **Valor de mercado** = 100 × salario. Penalizaciones/premios de prestigio y valoración:

| Operación | Prestigio | Valoración |
|---|---|---|
| Vender < 10% del valor | −200 | −150 |
| Vender < 80% | −10 | −20 |
| Vender 100–120% | +5 | +10 |
| Vender > 120% | +15 | +30 |
| Comprar < 10% | −100 | −80 |
| Comprar < 80% | +15 | +30 |
| Comprar 100–120% | +5 | +10 |
| Comprar > 120% | −10 | −20 |

- Despedir jugadores/empleados baja prestigio y valoración (juveniles de residencia: sin penalización).

---

## 5. ENTRENAMIENTO

### 5.1 Forma física (por turno)
- −1 al paso de turno | 0 si entrena táctica | +2 si entrena una habilidad que no sea forma | +3 si entrena forma física | +1 por jugar partido.
- **<45% de forma → pierde habilidades**. **>90% → acumula cansancio**; al llegar a su límite de cansancio → bajón al **40%**. **Zona óptima: 86–90%**.

### 5.2 Tipos de entrenamiento
- Táctica (sin físico, para bajar forma), Portero (reflejos, salidas), Defensa (entradas), Medio (pase, organización, desmarque, faltas), Delantero (tiro, remate, regate, faltas), Rehabilitación (lesionados, requiere médico).
- Programación **semanal**; entrenamiento múltiple asigna entrenadores libres automáticamente.
- **Mejora**: cada turno, tirada 1–100; si es **menor que la habilidad del entrenador en esa especialidad** → +1 punto (salvo que esté en su máximo de talento).
- Entrenadores y médicos atienden **hasta 6 jugadores por turno**.
- Juveniles: entrenan automáticamente con el entrenador juvenil.
- **Lupa** en la ficha (1 uso/turno): resalta en naranja las habilidades que no están al máximo.

### 5.3 Desarrollo de jugadas (playbook)
- Entrenador del 1er equipo y juvenil desarrollan jugadas; **solo el del 1er equipo** las entrena y usa en partido.
- Libro de **50 jugadas** máximo por entrenador. 4 estilos: campo/balón parado × ataque/defensa. Balón parado es válida con cualquier dibujo.
- Desarrollo: **20 turnos**, no interrumpible.

### 5.4 Entrenamiento de jugadas
- Requiere **3 jugadores** (deben estar en el campo para que aplique en partido). **15 turnos**, no interrumpible; cada turno con éxito (según táctica del entrenador + bonus de los 3 jugadores) suma +1 al **nivel (1–15)**. Reentrenable; el nivel no baja. Un entrenador puede desarrollar una jugada y entrenar otra a la vez.

### 5.5 Cierre de entrenamientos (anti-espionaje)
- Cierra el acceso 3 turnos (nadie puede ojear tus tácticas). 2 usos gratis/temporada; después −1 confianza del entrenador por uso.

### 5.6 Estimular a la plantilla
- Discurso que mejora el rendimiento **solo como local** durante 2 turnos ("estimulados" en la tabla de asistencia). 2 usos gratis/temporada; después −1 confianza por uso.

---

## 6. PERSONAL DEL CLUB

- Vías de contratación: **mercado** (entrenadores, médico, ojeador — todo el año) y **pantalla de personal** (resto, solo julio-agosto). El staff envejece el 1 de enero; renovable solo si acaba contrato ese año o tiene <61 años.
- **Entrenador del 1er equipo**: jugadas + mejora a los entrenadores técnicos (prob. = mejora−40 si el técnico <75; mejora−60 si ≥75). Pierde **1 confianza** en cada cambio de temporada. El primer entrenador contratado siempre va al juvenil; promoción juvenil→1er equipo inmediata, no a la inversa.
- **Entrenador juvenil**: mejora juveniles. Prob. por grupo: portería (progresión−40), defensa/medio/delantera (progresión−35), experiencia (progresión−60).
- **Entrenadores técnicos**: máx. 5. **Ojeadores**: máx. 3 (informes de tácticas rivales).
- **Secretario técnico**: −2% a −20% del salario de los entrenadores según su sueldo (50.000→−2% … 160.000→−20%).
- **Recursos humanos**: −2% a −20% del salario del personal (1.000→−2% … 3.000→−20%).
- **Director de comunicación**: +2% a +20% en derechos de imagen (10.000→+2% … 600.000→+20%).
- **Jefe de servicios médicos**: evita perder forma lesionado. **Psicólogo**: motiva en febrero a mentalidades compatibles.
- **Máximo accionista**: propietario (si es CPU, inmovilizado = 5M). El manager puede ser también propietario con licencia de presidente.
- **Efectos implementados en tick**: médico nivel 1–5 reduce nuevas lesiones un 7% por nivel y duración un 5% por nivel (nivel 4+ acelera altas +1 semana/turno); fisio suma +1 fitness por nivel tras la recuperación base; nutricionista recupera forma muscular y mental (+1 cada 2 niveles); analista suma +1 punto de informe rival por nivel; secretaría/segundo mejora ritmo y moral baja (+1 cada 2 niveles). Los entrenadores técnicos de training mantienen su sistema propio.

---

## 7. ECONOMÍA DEL CLUB

### 7.1 Caja
- Operaciones contra **efectivo**; sin efectivo no hay fichajes/obras/despidos. **Inmovilizado** que evita números rojos (5M en clubes CPU). Previsión mensual (30 días) y anual (365). Mercado de acciones con valor por acción y accionistas.
- Acciones: 1.500 títulos por club, compra/venta sobre cualquier club, cartera multipropiedad, histórico de precio por club y límite anti-manipulación del **5% por mánager y club** (75 acciones).

### 7.2 Taquilla
- Nivel del país: Europa top-7 coeficiente → 3; 8º–15º → 2; resto → 1. América: todos 2.
- Precio entrada: bajo = 5×nivel; medio = 10×nivel; alto = 15×nivel. En liga, −5 eu por cada división por debajo de 1ª. Mínimo 3 eu.
- Espectadores: `valor masa social = (masa social / 5) × 2` por equipo; asistencia base = suma local + visitante; precio alto → −50% público; medio → −25%.
- La masa social del **rival** pesa en la asistencia. La asistencia da bonus al local (tabla en 2.10).

### 7.3 Derechos de imagen
- 4 parámetros: nivel competitivo (3ª o menos +1; 2ª +2; 1ª +3; UEFA/Sudamericana +4; Champions/Libertadores +9); masa social (aficionados/5.000, 1–100); nivel adquisitivo (% adultos clase alta, máx. 50); coeficiente del país (5 estrellas a partir de 10).
- `valoración = (masa social × 6) + (competición × 15) + (país × 5) + (clase alta × 4) + 100`
- `cantidad base = valoración × nivel de vida` (variable global).
- % sobre la base: TV 82/72/62% (3/2/1 años); vallas 66/56/46%; merchandising 48/38/28%.
- Romper contrato: pagar **8% por doce meses y por año restante** de lo que se recibía. Sin contrato → ingresos 0.

### 7.4 Pretemporada (concentraciones)
- Se contratan en **julio**, ocurren en **agosto**; afectan a toda la plantilla (incl. cedidos y juveniles). Beneficios según destino: forma 70–90%; moral +2 a +15; prestigio +1 a +10; habilidades +1 a +10 (sin superar talento).

### 7.5 Subcontratación
- Agencia de viajes (sin ella: 4.000 eu por partido fuera), mantenimiento (permite >10.000 espectadores), limpieza (+5% taquilla), seguridad (permite >5.000), difusión mediática (+10% derechos de imagen), restauración (+10% taquilla), aseguradora médica (cobras 10.000 eu/turno por lesionado), trabajo temporal (permite >2.000).
- Sin estos servicios la asistencia queda topada en 2.000 / 5.000 / 10.000.

### 7.6 Multas por disturbios
- Hay altercados si el local tiene >35% de jóvenes de clase baja Y la suma de ambos clubes en esa clase >65%.
- Multa según suma de jóvenes clase media+baja de ambas aficiones: >160% → 1,5M; >140% → 750K; >120% → 450K; >100% → 150K.

---

## 8. MASA SOCIAL E IDEOLOGÍA

### 8.1 Pirámide social
- Segmentada por edad (jóvenes/adultos) y clase (baja/media/alta). Jóvenes clase baja = fáciles de captar; adultos clase alta = difíciles (y claves para patrocinios).
- **Impacto mensual**: la variación de la media de prestigio del primer equipo entre meses sube/baja la masa social (positivo → +adultos clase media; negativo → −adultos clase media).
- Variación por turno según sumatorio de clases: +2 → +240 personas/turno; +1 → +120; 0 → nada; −1 → −120.
- **Campañas de captación** dirigidas por clase social; coste según instalaciones (asientos → jóvenes; palcos VIP → adultos clase alta).
- **Captación viral por link**: +100 aficionados por visita, +300 extra si crea cuenta.

### 8.2 Jugadores emblemáticos e ideología
- Emblemático: se retira en el club habiendo jugado suficientes partidos y su última temporada de contrato allí.
- Cada emblemático vale **1 punto de ideología**, usable 1 vez por temporada, con usos limitados: 450 PJ + moral completa → 5 usos; 450 PJ → 4; 350 PJ + moral completa → 3; 350 PJ → 2. Agotados los usos, desaparece.
- Máximo **15 puntos** de ideología por temporada. Requisitos para usar: manager con ≥65% de valoración y ≥100 de prestigio.
- **Cubierta del estadio completada** = 2 puntos de ideología por temporada, sin caducidad.
- Beneficios (ejemplos): finalizar de inmediato el entrenamiento de una jugada (2 ptos); completar todos los informes de ojeadores (4 ptos).

---

## 9. ESTADIO E INSTALACIONES

- Las obras **no pueden ser simultáneas**. La asistencia depende de la masa social, no del aforo.
- **Estructura**: máx. 108.000. Gradas N/S: 2.000 por anfiteatro; E/O: 4.000 por anfiteatro.
- **Asientos** (jóvenes): N2 500K/1 mes → jóvenes clase media; N3 1M/1 mes → −50% costes captación jóvenes; N4 2,5M/2 meses → jóvenes clase alta; N5 4,5M/2 meses → −50% adicional.
- **Palcos VIP** (adultos clase alta): N2 3M/2 meses → captar; N3 4,5M/2 meses → −20% coste; N4 8M/2 meses → −20%; N5 12,5M/3 meses → −30%.
- **Aparcamiento**: 5 tramos de 2.500 plazas, 1,5M y 2 meses cada uno; **+4% asistencia por tramo** (máx. +20%).
- **Ciudad deportiva** (calidad de canteranos U-17 → rango mín/máx de habilidades):

| Nivel | Mín | Máx | Obra | Coste |
|---|---|---|---|---|
| Sin | 15 | 60 | – | – |
| 1 | 17 | 63 | 6 meses | 2,0M |
| 2 | 22 | 66 | 3 meses | 1,0M |
| 3 | 24 | 69 | 3 meses | 1,5M |
| 4 | 29 | 72 | 3 meses | 2,0M |
| 5 | 31 | 75 | 3 meses | 2,5M |
| 6 | 32 | 78 | 3 meses | 3,0M |
| 7 | 38 | 81 | 4 meses | 4,0M |
| 8 | 43 | 84 | 5 meses | 6,0M |

---

## 10. CANTERA (residencias y juveniles)

- **Residencias**: ~cada 3 meses de juego generan un canterano (demarcación elegible o aleatoria). Ampliaciones retrasan la generación (1 cada 2,5 semanas). Mantenimiento caro. No vendibles hasta pasar >2 semanas de crearlas u obtener jugador. Si el sub-19 está lleno (22), el jugador no llega.
- **Generación**: nivel ciudad = media de talentos de la ciudad; nivel país = media del país; (ciudad+país)/2 → tabla de "valor ubicación" (1–20).
  - `valor media = nivel residencia × 3 + rand(−5..25) − rand(0..nº residencias en la ciudad) + 13 + valor ubicación` (acotado 20–75)
  - `característica inicial = valor media − 50 + rand(0..30) − penalización por posición − 5 si sale desmotivado`
  - `talento (máximo) = característica + 50 + rand(0..15)`
- **Límites globales/año**: máx. 3 jugadores con 7 barras de talento y 21 con 6 barras en todo el mundo.
- Canterano: experiencia 1/99; antes de promocionar no puede ser fichado y se despide sin penalización.
- **Promoción sub-17 → sub-19**: un jugador por posición, salario mín. 1.500 eu/mes, llegan motivados, media inicial 4; talento aleatorio según ciudad deportiva (tabla de §9) e ideología.

---

## 11. MANAGER (prestigio, objetivos, carrera)

### 11.1 Valoración FDF y objetivos
- Valoración FDF = f(efectivo del club + media de jugadores + forma) para managers con >10 partidos con su equipo al inicio de agosto.
- Objetivos según ranking de valoración FDF de la liga: top 3 → ganar título (salvo que el 1º saque +10 puntos al 2º/3º); 4º–8º → parte alta (≤8º); 9º–14º → parte media (≤14º); >14º → no descender; en divisiones inferiores los 3 primeros → ascenso.

### 11.2 Contratos por objetivos
- Sin contrato y con ≥10 partidos la temporada pasada → contrato de **2 temporadas** en el 2º turno de agosto.
- Cumplido si logra el objetivo **o gana un título**; fallido si **desciende** (aunque cumpliera otra cosa).
- Cumplido → nuevo contrato actualizado; fallido → **despido** en el 2º turno de julio. El club puede despedir igualmente sin indemnización si la valoración cae.

### 11.3 Economía y prestigio del manager
- Manager con >2M acumulados: su cuenta no se borra por inactividad.
- Romper contrato para irse: paga indemnización de su efectivo personal (**excepto en julio**). Prestigio: −50% si queda en rojos, −25% si no; en ambos casos cap a 650 puntos si lo supera.
- Regreso a un equipo: jul–dic libre (pasando por otro club); ene–jun prohibido volver a un club donde jugó ≥1 partido.

### 11.4 Selección de equipo
- Pantalla de vacantes: el novato recibe equipo al instante; veteranos compiten — la CPU asigna el puesto **al mejor manager solicitante**.
- Equipos protegidos para novatos/poco prestigio; equipos bloqueados no generan ofertas. Varias solicitudes el mismo turno: orden no garantizado. Botón "borrar solicitudes" para arrepentirse.

### 11.5 Nodos de carrera implementados en Manager FDF
- Curva XP: el coste incremental de subir del nivel N al N+1 es `900 × N × 1,16^(N−1)` XP; los niveles ya alcanzados nunca bajan en partidas en curso.
- Coste de nodos por rama: tier 1 cuesta 1 punto, tier 2 cuesta 2, tier 3 cuesta 3; se debe desbloquear en secuencia.
- `tac_1/tac_2/tac_3`: +1/+2/+3 al límite de jugadas entrenadas activas.
- `mot_1/mot_2/mot_3`: +2/+4/+6 a la moral aplicada por discursos de prensa y ruedas de prensa.
- `fin_1/fin_2/fin_3`: −10%/−20%/−30% sobre una comisión base del 3% en compras directas por cláusula.

---

## 12. COMPETICIONES INTERNACIONALES

- **Mundial cada 4 años**: clasificación desde el año anterior (ene–mar). Cupos (32): AFC 12 equipos/2 grupos → 2 por grupo; CAF → 3; CONCACAF → 2; CONMEBOL grupo único de 10 → 6; UEFA 36/6 grupos → 2 por grupo.
- Fase final en junio: 8 grupos de 4 a una vuelta → 2 primeros; desempate: dif. goles → goles a favor → goles en contra → sorteo. Eliminatorias a partido único con prórroga y penaltis.
- Además: Champions, Libertadores, UEFA, Sudamericana, Intercontinental, Eurocopa, amistosos internacionales y "Manager del Año".

---

## Lagunas conocidas del manual
- Tabla exacta de transiciones posición→posición (imágenes sin texto; patrón: posiciones adyacentes, portero bloqueado).
- Tablas de puntuación internas de la valoración FDF (imagen `valoracionfdf_tablasb.jpg`).
- Diagramas exactos de variación de la pirámide social por impacto/campañas.
