# DISEÑO · Posiciones, roles modernos y las 15 formaciones — Manager FDF

_Añadido 11 jun 2026 por orden de Jaime. Biblia de diseño del Bloque WT del ROADMAP (WT1-WT4). Complementa `docs/manual-managerfdf-referencia.md`. Los textos en español de este doc son la fuente para el catálogo server-side (WT2) y la UI de la pizarra (WT4)._

---

## 1. LAS 15 POSICIONES DETALLADAS (WT1)

La macro `POR|DEF|MED|DEL` NO desaparece: cada posición detallada mapea a una macro y todo lo existente sigue funcionando. Código → nombre · dorsal clásico · macro · atributos FDF clave (para derivación/backfill y para la penalización por fuera de posición).

| # | Código | Posición | Dorsal | Macro | Rol y atributos clave |
|---|--------|----------|--------|-------|------------------------|
| 1 | `POR` | Portero | 1 | POR | Evitar goles; el moderno además es el primer atacante: juego de pies, salida desde atrás, líbero ante balones largos. **goalkeeping**, organization, passing (moderno) |
| 2 | `LD` | Lateral derecho | 2 | DEF | Defiende la banda y dobla al extremo; el invertido pisa el centro para construir. **tackling, dribbling, passing**, consistency |
| 3 | `LI` | Lateral izquierdo | 3 | DEF | Espejo del LD. **tackling, dribbling, passing**, consistency |
| 4 | `CT` | Central | 4/5 | DEF | Bloquea, marca, gana duelos aéreos; el moderno rompe líneas con pase largo o conducción (clave en líneas de 3). **tackling, organization**, passing (moderno) |
| 5 | `PIV` | Medio pivote defensivo | 6 | MED | Equilibra, recupera y conecta defensa-ataque (el Makelele). **tackling, organization**, passing |
| 6 | `ORG` | Mediocentro organizador | 8 | MED | Controla el ritmo, distribuye, marca el tempo. **passing, organization**, consistency |
| 7 | `MCO` | Mediocentro ofensivo | 8/10 | MED | Llegador: pisa el área rival, asiste y remata desde segunda línea. **passing, finishing**, unmarking |
| 8 | `BOX` | Medio box-to-box | 8 | MED | Hace de todo: área a área, recupera y llega. El que más se vacía. **organization, tackling, passing**, consistency (resistencia) |
| 9 | `INTD` | Interior derecho | 8 | MED | Mediocampista de carril derecho (en 4-4-2/diamante/4-1-3-2): doble función banda-centro. **passing, dribbling**, tackling |
| 10 | `INTI` | Interior izquierdo | 8 | MED | Espejo del INTD. **passing, dribbling**, tackling |
| 11 | `MP` | Media punta | 10 | MED | El cerebro creativo: opera entre líneas, asiste, encuentra el espacio que no existe. **passing, unmarking**, dribbling, finishing |
| 12 | `EXTD` | Extremo derecho | 7 | DEL | Velocidad y uno contra uno; a pierna cambiada (zurdo) engancha hacia dentro y dispara. **dribbling, unmarking**, finishing |
| 13 | `EXTI` | Extremo izquierdo | 11 | DEL | Espejo del EXTD. **dribbling, unmarking**, finishing |
| 14 | `DC` | Delantero centro | 9 | DEL | El referente: 9 de área, rematador. **finishing, shooting**, unmarking |
| 15 | `F9` | Falso 9 / segundo delantero | 9/10 | DEL | Baja a recibir, arrastra centrales y genera espacios para los extremos; o acompaña al DC como segundo punta (4-4-1-1). **passing, unmarking, finishing**, dribbling |

**Mapeo a macro:** `LI/CT/LD→DEF` · `PIV/ORG/MCO/BOX/INTD/INTI/MP→MED` · `EXTI/EXTD/DC/F9→DEL`.

**Derivación/backfill (WT1, determinista y documentada):** dentro de cada macro se asigna la detallada por perfil de atributos — DEF: tackling+organization altos→CT; dribbling/passing altos→lateral (lado estable por squadNumber/hash) · MED: tackling dominante→PIV; passing+organization→ORG; finishing alto→MCO; perfil plano con consistency→BOX; dribbling alto→interior (lado estable) · DEL: dribbling+unmarking→extremo (lado estable); finishing puro→DC; passing+unmarking→F9. Los juveniles y jugadores generados nuevos nacen ya con posición detallada.

## 1.1 PONDERACIÓN DE HABILIDADES POR POSICIÓN (WT1: Media, derivación y generación)

_Añadido 11 jun (análisis del motor encargado por Jaime). El juego ya tiene las 8 habilidades de campo + 2 de portero (manual §3.1: pase, entradas, tiro, organización, desmarque, remate, regate, faltas; portero: salidas y reflejos — en schema hoy una sola columna `goalkeeping`; la separación salidas/reflejos queda anotada). **NO se inventan habilidades nuevas: se pondera según cómo las usa el motor.**_

Cómo las usa el motor hoy: **entradas** es la ÚNICA habilidad defensiva en duelos y alimenta la destrucción · **organización** alimenta la creación del mediocampo (solo cuenta para jugadores del centro, creación /12) · **pase/desmarque/regate** dominan las fases 1-4 del ataque (desmarque/regate son las habilidades del RECEPTOR en fases combinadas, promediadas con el pase del compañero) · **tiro/remate** la fase 5 · **faltas** solo balón parado.

Pesos por posición (3 = clave, 2 = importante, 1 = secundaria, — = irrelevante). **Las de peso 3+2 son las que entran en la Media de cada posición:**

| Posición | Entradas | Organización | Pase | Desmarque | Regate | Tiro | Remate | Faltas |
|----------|----------|--------------|------|-----------|--------|------|--------|--------|
| `POR` | Salidas 3 · Reflejos 3 (resto —) | | | | | | | |
| `CT` | 3 | 1 | 2 | — | — | — | 1* | 1 |
| `LD` / `LI` | 3 | 1 | 2 | 1 | 2 | — | 1* | 1 |
| `PIV` | 3 | 3 | 2 | — | 1 | 1 | — | 1 |
| `ORG` / `BOX` | 2 | 3 | 3 | 1 | 1 | 2 | — | 2 |
| `INTD` / `INTI` | 2 | 2 | 3 | 2 | 2 | 1 | 1 | 1 |
| `MCO` / `MP` | 1 | 3 | 3 | 2 | 2 | 3 | 1 | 2 |
| `EXTI` / `EXTD` | 1 | 1 | 2 | 3 | 3 | 2 | 2 | 1 |
| `DC` | — | — | 1 | 3 | 2 | 2 | 3 | 1 |
| `F9` _(derivada)_ | — | 1 | 2 | 3 | 2 | 2 | 2 | 1 |

\* remate en defensas solo para córners ofensivos si se incorporan al ataque. La fila `F9` es derivada de la misma lógica (mezcla DC/MCO: receptor entre líneas) — validar en WT1. `BOX` comparte fila con `ORG`; si se quiere diferenciar: BOX sube entradas a 3 a costa de tiro (1).

**Razones clave del motor (no tocar a la ligera):**
- **Entradas es desproporcionadamente valiosa:** defiende TODAS las fases y suma destrucción en el centro. Nunca baja en defensas ni en PIV.
- **Organización solo cuenta en el centro del campo:** en CT/DC vale poco — no desperdiciar puntos ahí.
- **Desmarque/regate pesan tanto en EXT y DC** porque son las habilidades del receptor en jugadas combinadas.
- **Faltas no necesita repartirse:** bastan 1-2 especialistas (lanzadores designados en la táctica) → peso bajo generalizado, pero la generación debe crear OUTLIERS.

**Para la generación de jugadores (seed, cantera, regens):** distribuir más puntos en las habilidades de peso 3, menos en 2, residual en 1/—, con VARIANZA suficiente para que existan perfiles híbridos (CT con salida de balón, MC destructor, DC asociativo…). La derivación/backfill de WT1 usa esta misma tabla a la inversa: el perfil de pesos que mejor explica los atributos del jugador es su posición detallada.

## 2. ROLES MODERNOS (instrucciones por hueco, WT2/WT4)

El fútbol moderno no es solo DÓNDE juegas sino CÓMO interpretas el puesto. Instrucciones aditivas por hueco de la pizarra (JSON `roleInstructions` en Tactic):

- **Portero-líbero** (POR): sale lejos del área a cortar balones largos y participa en la salida. Riesgo: gol por encima.
- **Lateral invertido** (LI/LD, tendencia Guardiola): en posesión pisa el centro como pivote extra para construir; deja la banda al extremo.
- **Carrilero** (LI/LD en líneas de 3/5): recorre TODA la banda, lateral y extremo a la vez. Exigencia física máxima.
- **Central salidor** (CT en línea de 3): rompe líneas con pase largo o conduce hacia adelante (el Stones-líbero del 3-2-4-1).
- **Extremo a pierna cambiada** (EXTI/EXTD): zurdo por la derecha (o viceversa) que engancha hacia dentro y dispara; deja la amplitud a su lateral.
- **Falso 9** (F9 en el puesto de DC): baja a recibir entre líneas, arrastra centrales, libera el espacio a los extremos.

## 3. LAS 15 FORMACIONES DEL CATÁLOGO (WT2)

Cada formación: forma · estilo · huecos (slots por posición detallada) · fortalezas · debilidades · counters · demanda física (1-5). El sistema de counters es piedra-papel-tijera SUAVE (bonus/malus de perfil, nunca determinista — WT3).

### 1 · 4-4-2 — la clásica
- **Slots:** POR · LD CT CT LI · INTD ORG/BOX ORG/BOX INTI · DC F9/DC. **Estilo:** equilibrada. **Física:** 3.
- **Fortalezas:** funciona atacando y defendiendo; difícil de penetrar; laterales que doblan generan centros; simple de entender.
- **Debilidades:** físicamente exigente para los 2 MC (ataque y defensa); superado en número contra mediocampos de 3-5.
- **Counters:** fuerte vs estrechas (castiga por banda al 4-3-2-1/diamante) · débil vs 3-5-2 y 4-5-1 (inferioridad en el centro).
- **Variante 4-4-1-1:** DC + F9 por detrás haciendo de segundo punta y número 10.

### 2 · 4-5-1 — el cerrojo de contraataque (Mourinho 2004/05: 15 goles encajados)
- **Slots:** POR · LD CT CT LI · EXTD/INTD ORG PIV ORG/BOX EXTI/INTI · DC. **Estilo:** contraataque. **Física:** 3.
- **Fortalezas:** pivote destructor que roba y lanza rápido; muy difícil de penetrar; mata partidos.
- **Debilidades:** poca pegada; puede ser aburrida; el DC se aísla si el equipo se hunde.
- **Counters:** fuerte vs posesión (frustra al 4-3-3/tiki-taka) · débil vs equipos que también se cierran (partido bloqueado) y vs pegada directa del 4-2-4.

### 3 · 4-3-3 — posesión y presión (Ajax 71, Fútbol Total, Holanda 74)
- **Slots:** POR · LD CT CT LI · PIV ORG/BOX MCO · EXTD DC EXTI. **Estilo:** posesión. **Física:** 4.
- **Fortalezas:** triángulos de pase, marcaje zonal, presión alta tras pérdida, fuera de juego adelantado; extremos en uno contra uno.
- **Debilidades:** espacio a la espalda entre lateral y extremo; si los MC suben y se pierde el balón, el centro queda vendido; sin llegadas, el DC se aísla.
- **Counters:** fuerte vs salidas lentas (presión) y vs 4-4-2 (un MC más) · débil vs 4-5-1/5-4-1 cerrojo y vs contras a la espalda de los laterales.

### 4 · 4-3-2-1 — el árbol de Navidad
- **Slots:** POR · LD CT CT LI · PIV ORG BOX · MCO/MP MP · DC. **Estilo:** posesión estrecha. **Física:** 3.
- **Fortalezas:** superioridad numérica total por dentro; uno-dos rápidos y triangulaciones; niega la posesión al rival.
- **Debilidades:** CERO amplitud propia; vulnerable a contraataques por banda; exige laterales que suban sin red.
- **Counters:** fuerte vs mediocampos cortos · débil vs 4-4-2/4-2-4 con bandas rápidas.

### 5 · 4-1-3-2 — el 4-4-2 ofensivo (Bilic, Mancini 2011/12, Jorge Jesus)
- **Slots:** POR · LD CT CT LI · PIV · INTD MCO/ORG INTI · DC F9. **Estilo:** ofensiva. **Física:** 4.
- **Fortalezas:** ataca por dentro y por fuera; dos puntas que ocupan a los centrales y presionan la salida; el pivote compacta detrás.
- **Debilidades:** estrecho por el medio si los interiores no abren; exige laterales rápidos y habilidosos; contras por banda dolorosas.
- **Counters:** fuerte vs defensas de 4 que sufren con 2 puntas · débil vs 3-5-2 (los 3 centrales absorben a las 2 puntas y su mediocampo de 5 manda).

### 6 · 5-4-1 — el catenaccio (Rappan, Herrera, el líbero Beckenbauer)
- **Slots:** POR · LD CT CT(líbero) CT LI · INTD ORG PIV INTI · DC. **Estilo:** defensiva. **Física:** 2.
- **Fortalezas:** solidez máxima; el líbero barre detrás de la línea y puede conducir; perfecta para defender ventajas mínimas.
- **Debilidades:** cede toda la iniciativa; pegada casi nula; si encaja primero, le cuesta el mundo remontar.
- **Counters:** fuerte vs posesión estéril y vs 4-3-3 sin ideas · débil vs equipos pacientes con pegada de media distancia (MCO/MP).

### 7 · 4-1-2-1-2 — el diamante (exige De Bruynes y Brunos)
- **Slots:** POR · LD CT CT LI · PIV · INTD INTI · MP · DC F9/DC. **Estilo:** equilibrada-ofensiva. **Física:** 4.
- **Fortalezas:** muy equilibrada; 2 puntas constantes que ocupan centrales; el pivote protege e inicia; la MP enchufa entre líneas.
- **Debilidades:** exige plantilla profunda y MUY técnica en el mediocampo; poca amplitud (los laterales cargan con toda la banda).
- **Counters:** fuerte vs 4-4-2 plano (rombo gana el centro) · débil vs bandas rápidas (4-3-3/4-2-4) que atacan el espacio de sus laterales.

### 8 · 3-5-2 — el dominio del centro (Bilardo 86, el Mundial de Maradona)
- **Slots:** POR · CT CT CT · LD(carrilero) INTD/ORG PIV INTI/ORG LI(carrilero) · DC F9/DC. **Estilo:** equilibrada. **Física:** 5 (carrileros).
- **Fortalezas:** manda en el centro (5 vs 4); alimenta a 2 puntas; ideal contra equipos de dos delanteros.
- **Debilidades:** la espalda de los carrileros es una autopista; los carrileros no tienen relevo; si los superan, los 3 centrales quedan abiertos.
- **Counters:** fuerte vs 4-4-2 y 4-1-3-2 (superioridad central + 3 centrales para 2 puntas) · débil vs 4-3-3 con extremos puros (ataca la espalda de los carrileros).

### 9 · 5-3-2 — el 3-5-2 con candado (Brasil 2002: Cafú, Roberto Carlos, Ronaldo, Ronaldinho)
- **Slots:** POR · LD CT CT CT LI · ORG PIV BOX · DC F9/DC. **Estilo:** defensiva-contraataque. **Física:** 4.
- **Fortalezas:** cierra las bandas que el 3-5-2 deja abiertas; con calidad arriba, controla y contraataca siendo durísimo atrás.
- **Debilidades:** puede volverse demasiado defensivo; desgaste mental y físico continuo; el centro se congestiona cuando los MC retroceden sobre los centrales.
- **Counters:** fuerte vs ataques por banda y vs 2 puntas · débil vs posesión paciente que lo encierra 90 minutos (4-3-3/4-2-3-1 con MP fina).

### 10 · 4-2-3-1 — la moderna por defecto (Haaland/Kane como referencia)
- **Slots:** POR · LD CT CT LI · PIV BOX/PIV · EXTD/INTD MP EXTI/INTI · DC. **Estilo:** equilibrada-moderna. **Física:** 3.
- **Fortalezas:** doble pivote = solidez central; 3 creadores a pierna natural o cambiada; MUTABLE en caliente a 4-3-3, 4-4-2 o 4-5-1; encaja con casi cualquier plantilla.
- **Debilidades:** exige un DC matador (si no convierte, no hay plan B); los 3 de arriba deben bajar a defender o el doble pivote se parte; delantero aislado en días malos.
- **Counters:** la más neutra del catálogo: pocas debilidades estructurales, sin dominancia clara contra nadie. La navaja suiza.

### 11 · 3-4-3 — la apisonadora de Conte (Chelsea 2016/17: 13 victorias seguidas, 93 puntos)
- **Slots:** POR · CT CT(salidor) CT · LD(carrilero) PIV/ORG BOX LI(carrilero) · EXTD(invertido) DC EXTI(invertido). **Estilo:** ofensiva total. **Física:** 5.
- **Fortalezas:** ataque de 5 (extremos por dentro + carrileros dando amplitud); repliegue automático a 5-4-1 compacto; devastadora cuando funciona.
- **Debilidades:** si superan al doble pivote, los 3 centrales quedan vendidos; carrileros con resistencia EXCEPCIONAL o no existe; la más exigente tácticamente.
- **Counters:** fuerte vs 4-4-2/4-5-1 pasivos (los ahoga) · débil vs diamante/4-3-2-1 que sobrecargan a su doble pivote por dentro.

### 12 · 3-2-4-1 — la transición moderna (el City del Stones-líbero)
- **Slots:** POR · CT CT(salidor) CT · PIV PIV/CT(líbero) · INTD MCO MCO INTI · DC. **Estilo:** posesión-presión moderna. **Física:** 4.
- **Fortalezas:** velocidad de transición defensa↔ataque; caja de 4 interiores que machaca entre líneas; un central/pivote que sube como líbero moderno.
- **Debilidades:** carísima en términos de perfiles (necesitas un Stones); muy exigente en sincronización; bandas cedidas si los interiores no basculan.
- **Counters:** fuerte vs bloques medios desordenados · débil vs extremos puros que aíslan a sus 3 centrales en campo abierto.

### 13 · WM (3-2-5) — histórica/retro (Chapman, Arsenal 1925-34)
- **Slots:** POR · CT CT CT · PIV PIV · EXTD INTD/MCO DC INTI/MCO EXTI. **Estilo:** histórica-ofensiva. **Física:** 3.
- **Fortalezas:** CINCO atacantes — pegada de otra época; flavor retro único (la primera gran revolución táctica).
- **Debilidades:** defensa de los años 30: cualquier mediocampo moderno la supera; agujeros entre líneas por todas partes.
- **Counters:** débil vs prácticamente todo lo moderno; fuerte solo en pegada bruta. Desbloqueable/flavor para valientes y románticos.

### 14 · Metodo 2-3-2-3 — histórica/retro (Pozzo, Italia campeona del mundo 1934 y 1938)
- **Slots:** POR · CT CT · PIV ORG PIV · MCO/MP MCO/MP · EXTD DC EXTI. **Estilo:** histórica-equilibrada. **Física:** 3.
- **Fortalezas:** el primer "doble enganche" de la historia; mediocampo W que ya era contraataque organizado; 63V-17E-15D con Italia.
- **Debilidades:** SOLO 2 defensas: cualquier doble punta moderna la destroza; exige repliegues heroicos de sus medios.
- **Counters:** débil vs todo lo que tenga 2+ puntas; flavor retro, mismo tratamiento que la WM.

### 15 · 4-2-4 — el ataque total brasileño (Brasil 1958 con Pelé de 17 años, y 1970)
- **Slots:** POR · LD CT CT LI · ORG BOX · EXTD DC DC/F9 EXTI. **Estilo:** ofensiva extrema. **Física:** 4.
- **Fortalezas:** pegada máxima con 4 atacantes + laterales ofensivos que se suman; rompe cerrojos por acumulación.
- **Debilidades:** SOLO 2 mediocampistas — superados con facilidad; el partido se juega en las áreas; sin el balón sufre muchísimo.
- **Counters:** fuerte vs 5-4-1/4-5-1 encerrados (los abre por acumulación) · débil vs cualquier mediocampo de 3+ (3-5-2, 4-3-3, 4-2-3-1 lo pasan por encima).

### Nota histórica (flavor para la UI)
En el siglo XIX se jugaba un 1-1-8 (y un 2-1-7 de los Old Etonians): la regla de fuera de juego de 1863 impedía pasar hacia adelante, así que todo era regate y ataque. La WM de Chapman fue la primera gran divergencia del 2-3-5 clásico. Cada época tiene su sistema dominante — y el debate sobre cuál es el mejor no se resolverá jamás (por eso el catálogo entero es jugable).

## 4. PRINCIPIOS DE IMPLEMENTACIÓN (resumen para WT1-WT4)

1. **Aditivo siempre:** la macro POR/DEF/MED/DEL no se toca; `detailedPosition` es columna nueva; formaciones legacy (strings libres) siguen valiendo.
2. **Counters suaves (WT3):** bonus/malus de perfil acotados, nunca determinismo; formación fuera de catálogo = neutro; sin datos = resultados bit a bit idénticos a hoy (patrón R7).
3. **Calibración sagrada:** pytest 105/105 o recalibración consciente y documentada.
4. **Demanda física → fatiga:** carrileros del 3-4-3/3-5-2 y el BOX se vacían más; rotación importa.
5. **Cero P2W:** todo el catálogo disponible para todos desde el día 1; las históricas son flavor, no ventaja.
6. **i18n:** todos los textos de este doc acaban en plantillas del server (Z1 los traduce una sola vez).
