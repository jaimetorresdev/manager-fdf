export interface ManualSection {
  /** Anchor para enlaces profundos: /manual#capitulo--seccion (B15). */
  id: string;
  title: string;
  body: string;
}

export interface ManualChapter {
  id: string;
  title: string;
  icon: string;
  content: {
    heading: string;
    sections: ManualSection[];
    tip: string;
  };
}

/**
 * Manual del juego — B15: auditado capítulo a capítulo contra el CÓDIGO real
 * (9 jun 2026). Cada cifra de este fichero existe en el servidor o en el motor;
 * si cambias una mecánica, actualiza aquí su sección. Anchors: cada sección
 * tiene id estable para enlaces profundos desde tooltips (#capitulo--seccion).
 */
export const manualChapters: ManualChapter[] = [
  {
    id: 'intro',
    title: 'Introducción',
    icon: '🏟️',
    content: {
      heading: 'Bienvenido a Manager FDF',
      sections: [
        {
          id: 'que-es',
          title: 'Qué es Manager FDF',
          body: 'Es un juego web persistente y multimanager: un club por cuenta, ligas de decenas de países, dos turnos diarios y un mundo compartido. Tu objetivo es cumplir el objetivo de temporada de la junta, subir prestigio y aspirar a clubes y selecciones mayores. Todo es auditable: cada partido se simula con una semilla determinista (id del partido × 1337) y puede re-simularse con idéntico resultado.',
        },
        {
          id: 'un-club',
          title: 'Un club por mánager',
          body: 'Cada cuenta dirige un solo equipo. El prestigio limita a qué clubes puedes aspirar como mánager. También puedes ser seleccionador nacional y compaginar ambos roles. No hay pago por ventajas: cero pay-to-win.',
        },
        {
          id: 'tiempo-real',
          title: 'Tiempo real + resolución por turnos',
          body: 'Lo interactivo (subastas, negociaciones, chat, mensajes) funciona en tiempo real 24/7. Solo la RESOLUCIÓN (partidos, fichajes a CPU, entrenamientos, economía) espera al turno de las 11:00 / 23:00.',
        },
      ],
      tip: 'Revisa el dashboard antes de cada turno: objetivo de temporada, próximo partido, tareas pendientes (ofertas, prensa, juveniles) y contador del siguiente tick.',
    },
  },
  {
    id: 'turn',
    title: 'Turnos',
    icon: '⏰',
    content: {
      heading: 'Sistema de turnos',
      sections: [
        {
          id: 'dos-turnos',
          title: 'Dos turnos al día',
          body: 'El mundo avanza a las 11:00 y 23:00. Cada turno equivale a ~3 días in-game saltando Miércoles → Viernes → Domingo (los días de partido). No hace falta estar conectado en el instante exacto: lo que dejes configurado antes del turno es lo que se aplica.',
        },
        {
          id: 'calendario',
          title: 'Calendario in-game',
          body: 'Enero: cumpleaños (+1 año todos los jugadores, el turno de Año Nuevo nunca se salta) y mercado abierto. Julio: cruce al 1 de julio = NUEVA TEMPORADA (ligas re-sembradas, ascensos/descensos, copas y Europa con nuevos participantes). Julio–agosto: pretemporada y mercado. El 30 de junio vuelven las cesiones y se ejecutan (o no) las opciones de compra.',
        },
        {
          id: 'antes-del-turno',
          title: 'Antes de cada turno',
          body: 'Confirma táctica (la default se propaga automáticamente a tus partidos programados con TODAS las palancas), precio de entradas si juegas en casa, entrenamientos, ofertas pendientes y lesionados/sancionados.',
        },
      ],
      tip: 'Si no guardas táctica nueva, se usa tu táctica por defecto con todas sus palancas: estilos, zonas, presión, ritmo, amplitud, mentalidad, marcaje y sustituciones programadas.',
    },
  },
  {
    id: 'prestige',
    title: 'Prestigio y banquillos',
    icon: '⭐',
    content: {
      heading: 'Prestigio 2.0 y mercado de banquillos',
      sections: [
        {
          id: 'prestigio-2-0',
          title: 'Prestigio 2.0: cómo se calcula (0–100%)',
          body: 'Tu prestigio es un porcentaje con 4 componentes y topes: LOGROS (máx. 75 pts): ganar Champions +25, título europeo +22, liga top +20, liga +18, copa +10, supercopa +7, ascenso +8, clasificación europea +5, racha de 5 sin perder +3, derbi +2, debut de canterano +2; en negativo: descenso −12, despido −10, batacazo copero −6. EXPERIENCIA (máx. 15), PATRIMONIO (máx. 5) y OBJETIVOS de junta (máx. 5). El desglose exacto está en tu perfil de mánager.',
        },
        {
          id: 'banquillos',
          title: 'Banquillos por prestigio',
          body: 'Los clubes sin mánager publican su vacante con urgencia según los días que llevan vacantes. Puedes solicitar cualquier banquillo: si dos mánagers piden el MISMO club, en el tick gana el de MÁS PRESTIGIO. Dejar un club abre su vacante al instante.',
        },
        {
          id: 'objetivo-temporada',
          title: 'Objetivo de temporada y confianza',
          body: 'La junta fija un objetivo según el nivel del club (ganar liga, top, salvación, ascenso). Cumplirlo renueva contrato y suma prestigio; incumplirlo erosiona la confianza de la junta y puede costarte el puesto. Abusar del cierre de entrenos o del discurso (3.ª vez y siguientes en la temporada) también resta confianza.',
        },
      ],
      tip: 'Evita terminar meses con caja en negativo y no encadenes despidos: son los dos golpes de prestigio más duros de remontar.',
    },
  },
  {
    id: 'squad',
    title: 'Plantilla y staff',
    icon: '👥',
    content: {
      heading: 'Jugadores, atributos y cuerpo técnico',
      sections: [
        {
          id: 'habilidades',
          title: 'Habilidades de campo y portero',
          body: 'Pase, entrada, tiro, organización, desmarque, definición, regate y faltas; porteros: portería. El talento (1–99) es el techo de cada habilidad; la experiencia sube con minutos REALES jugados (las sustituciones cuentan los minutos exactos de cada uno).',
        },
        {
          id: 'edad-retirada',
          title: 'Edad y retirada',
          body: 'El 1 de enero todos cumplen años. A partir de 31 pierden 2 puntos de techo al año. La retirada llega a los 38: si el jugador se retira en tu club con ≥450 partidos allí, queda disponible como EMBLEMÁTICO para tu ideología (criterio estricto, automático en el tick).',
        },
        {
          id: 'forma-moral',
          title: 'Forma y moral',
          body: 'La forma baja por turno y sube con entreno (óptimo 86–90%). Por debajo de 45% hay riesgo de pérdida de habilidades. La moral baja cada turno salvo mayo/junio; ganar la sube, y tus respuestas de prensa la mueven (potenciadas por los nodos mot_* de tu carrera). Moral <11 bloquea fichajes.',
        },
        {
          id: 'limites-plantilla',
          title: 'Límites de plantilla (manual FDF §4.1)',
          body: 'Para FICHAR: primer equipo + entrantes confirmados ≤ 30, y ≤ 26 contando cedidos fuera. Para VENDER o CEDER: no puedes bajar de 16 jugadores de primer equipo, ni de 19 contando juveniles. El indicador de límites aparece en Plantilla y Mercado.',
        },
        {
          id: 'staff',
          title: 'Cuerpo técnico con efectos reales',
          body: 'Cada rol aporta un efecto medible por nivel (0–5): MÉDICO −7%/nivel de lesiones nuevas y −5%/nivel de duración (nivel 4+ acelera altas). PREPARADOR FÍSICO recupera fitness extra por turno. NUTRICIONISTA mejora condición muscular/mental. ANALISTA acelera informes de ojeo y mejora la previa del rival. SECRETARÍA/SEGUNDO sostiene ritmo y moral baja. Los ENTRENADORES de categoría (POR/DEF/MED/DEL/TÁCTICA, máx. 6 por club) entrenan jugadores y jugadas.',
        },
      ],
      tip: 'Entrena a jóvenes con talento alto y dales minutos: la experiencia solo sube jugando, y el once con poca experiencia paga penalización en el motor.',
    },
  },
  {
    id: 'tactics',
    title: 'Táctica y motor',
    icon: '🗺️',
    content: {
      heading: 'Estrategias, estilos y simulación',
      sections: [
        {
          id: 'estrategias',
          title: 'Hasta 5 estrategias completas',
          body: 'Cada una define 11 titulares, suplentes, dibujo, lanzadores, hasta 8 jugadas entrenadas activas (ampliable a 9/10/11 con los nodos tac_1/2/3 de tu carrera), zonas de ataque, refuerzo defensivo y palancas avanzadas. TODAS las palancas viajan al motor en los partidos del turno.',
        },
        {
          id: 'estilos-counters',
          title: 'Estilos 5×5: cada uno tiene su counter',
          body: 'Ofensivos: ABRIR CAMPO (amplitud; lo frena presión en bandas, gana a presión central) · PASES CORTOS (toque interior; lo frena presión central, gana a presión en bandas) · BUSCAR LA ESPALDA (castiga defensas adelantadas; lo frena el fuera de juego) · ENTRE LÍNEAS (rompe el fuera de juego; lo frena la defensa adelantada) · PASES LARGOS (anula la presión al pivote). Defensivos espejo: presión bandas / presión central / fuera de juego / defensa adelantada / presión al mediocentro. Ganar el duelo táctico vale como una ventaja de campo y arrastra posesión. Regla clave: NO elegir estilo contra un rival que sí elige le regala +10.',
        },
        {
          id: 'palancas',
          title: 'Palancas numéricas',
          body: 'PRESIÓN alta recupera más balones pero fatiga. RITMO alto crea más jugadas con menos precisión. AMPLITUD aporta creación y sesga el carril de tus jugadas. MENTALIDAD (0–100) ofensiva sube pegada y expone atrás. MARCAJE individual o zonal. Las zonas de ataque deciden el CARRIL de cada jugada (visible en el Match Center).',
        },
        {
          id: 'construccion-destruccion',
          title: 'Construcción, destrucción y experiencia',
          body: 'Construcción (ataque) y destrucción (defensa) salen de organización/entradas y jugadas activas. El motor resta una penalización por EXPERIENCIA media del once: 0 puntos con media ≥91, y 1/3/4/5/7/8/9 hasta 12 puntos por debajo de 21. Lo que ves en Tácticas es exactamente lo que recibe el motor.',
        },
        {
          id: 'sustituciones',
          title: 'Sustituciones programadas (las ejecuta el motor)',
          body: 'Hasta 3 reglas por táctica: ventana de minutos (p. ej. 60–67), condición de marcador (ganando/empatando/perdiendo) y quién sale/entra. Se ejecutan en el primer minuto de la ventana donde se cumpla la condición, con PRIORIDAD sobre los cambios automáticos, y los minutos de cada jugador se reflejan en sus valoraciones.',
        },
        {
          id: 'jugadas-partido',
          title: '80 jugadas por partido',
          body: '20 por equipo y mitad. Cada jugada resuelve ataque vs defensa por fases con duelos de atributos REALES: recuperación (entrada+organización vs pase+organización), regate (regate+desmarque vs entrada), pase clave (pase+organización vs entrada+organización) y remate (definición+tiro+desmarque vs portería). En cada gol puedes ver la cadena completa en la REPETICIÓN del Match Center.',
        },
      ],
      tip: 'Mira la repetición de los goles que encajas: te dice exactamente qué duelo de atributos perdiste y por qué carril te están haciendo daño.',
    },
  },
  {
    id: 'training',
    title: 'Entrenamiento',
    icon: '🎓',
    content: {
      heading: 'Entrenos, jugadas, cierre y discurso',
      sections: [
        {
          id: 'tipos-entreno',
          title: 'Categorías de entreno',
          body: 'Entrenadores de PORTERO, DEFENSA, MEDIO, DELANTERO y TÁCTICA (este último entrena a cualquiera). Máximo 6 entrenadores por club. Mejorar depende del talento restante: un rand de mejora debe superar la habilidad actual.',
        },
        {
          id: 'jugadas-entrenadas',
          title: 'Jugadas entrenadas',
          body: 'El entrenador del primer equipo desarrolla jugadas. Solo puedes tener 8 ACTIVAS a la vez (9/10/11 con los nodos tac_* de carrera): elegir bien cuáles activar es parte de la táctica.',
        },
        {
          id: 'cierre-entrenos',
          title: 'Cierre de entrenos (manual §5.5)',
          body: 'Puedes CERRAR los entrenamientos durante 3 turnos (concentración: protege forma antes de partidos clave). Los 2 primeros usos de la temporada son gratis; desde el tercero la junta te resta 1 punto de confianza.',
        },
        {
          id: 'discurso',
          title: 'Discurso del míster (manual §5.6)',
          body: 'El estímulo local dura 2 turnos y el motor lo aplica en tus partidos EN CASA (homeStimulated). Igual que el cierre: 2 usos gratis por temporada, después −1 confianza de junta por uso. Combínalo con tus respuestas de prensa (los nodos mot_1/2/3 suman +2/+4/+6 de moral extra).',
        },
        {
          id: 'pretemporada',
          title: 'Pretemporada',
          body: 'Amistosos del 5 de julio al 20 de agosto (máx. 7 por temporada, se contratan buscando rival y fecha). Afectan a toda la plantilla: forma 70–90%, moral +2 a +15, prestigio +1 a +10 y habilidades +1 a +10 sin superar el talento.',
        },
      ],
      tip: 'Cierra entrenos solo antes de partidos decisivos: los dos usos gratis se agotan rápido y la confianza de la junta no se recupera fácil.',
    },
  },
  {
    id: 'market',
    title: 'Mercado',
    icon: '🔄',
    content: {
      heading: 'Fichajes, cláusulas y reglas FDF',
      sections: [
        {
          id: 'ventanas',
          title: 'Ventanas de mercado',
          body: 'Traspasos: ENERO, JULIO y AGOSTO (fecha in-game). Cesiones: de JULIO a DICIEMBRE; las cesiones vuelven el 30 de junio y, si pactaste opción de compra, el cesionario la ejerce automáticamente si puede pagarla. Cuentas nuevas: sin operaciones los primeros 7 días.',
        },
        {
          id: 'ofertas-cpu',
          title: 'Ofertas a clubes CPU: resolución a 3 turnos',
          body: 'Las ofertas a un club CPU no se resuelven al instante: quedan PENDIENTES y el mercado las adjudica al cabo de 3 turnos evaluando todas las ofertas recibidas (importe, salario, años, cláusula). El JUGADOR también valora tu oferta en 4 bloques (entorno, sentimental, expectativas, económico) con llaves 🔑 eliminatorias: salario mínimo según años pendientes, cláusula legal, máximo 5 años, edad <33 y moral ≥11.',
        },
        {
          id: 'clausulas',
          title: 'Cláusulas de rescisión',
          body: 'Pagar la cláusula se ejecuta al instante (sin negociación), dentro de la ventana y respetando límites de plantilla. El mánager comprador paga además una comisión del 3% de la cláusula de su bolsillo, reducible un 10/20/30% con los nodos fin_1/2/3 de carrera. La cláusula legal depende del salario y años restantes (multiplicadores ×600 a ×200).',
        },
        {
          id: 'anti-reventa',
          title: 'Anti-reventa (manual §4.4)',
          body: 'Durante el año natural de llegada de un jugador Y el siguiente, su club solo acepta ofertas que SUPEREN su último importe de traspaso. Todos los traspasos registran fecha e importe, así que no hay forma de revender barato-caro en corto.',
        },
        {
          id: 'tope-salarial',
          title: 'Tope salarial',
          body: 'El tope mensual de tu club ≈ 15% de la caja / 12. Toda firma (fichaje, renovación, promoción de canterano) lo valida; en los intercambios con dinero se valida el tope de AMBOS clubes. Las renovaciones suman años (fin de contrato siempre un 30 de junio).',
        },
        {
          id: 'busqueda',
          title: 'Búsqueda profesional',
          body: 'El buscador del mercado pagina de 20 en 20 con total real y filtros profundos: posición, edad, valor, salario, país, club, personalidad y mínimos por atributo (p. ej. tiro ≥80), ordenable por columna.',
        },
      ],
      tip: 'Antes de ofertar revisa las llaves 🔑 del panel: si una está en rojo (p. ej. moral <11), el jugador NO firmará por mucho que subas el traspaso.',
    },
  },
  {
    id: 'economy',
    title: 'Economía',
    icon: '💰',
    content: {
      heading: 'Caja, derechos de imagen y subcontratas (manual §7)',
      sections: [
        {
          id: 'ingresos',
          title: 'Ingresos',
          body: 'Taquilla (asistencia real × precio de entrada: nivel BAJO/MEDIO/ALTO = 5/10/15 € × nivel del país; subir precio recorta público −25%/−50%), derechos de imagen y PREMIOS por competición: liga, rondas de copa y bolsas europeas se ingresan al cerrar cada jornada/ronda y se ven en Economía → Análisis.',
        },
        {
          id: 'derechos-imagen',
          title: 'Derechos de imagen (manual §7.3)',
          body: 'Cantidad base = valoración × nivel de vida del país. Televisión paga 82/72/62% de la base según firmes 3/2/1 años; vallas 66/56/46%; merchandising 48/38/28%. Romper un contrato cuesta el 8% por año restante.',
        },
        {
          id: 'subcontratas',
          title: 'Subcontratas (manual §7.5)',
          body: 'Sin SEGURIDAD el aforo se topa en 5.000 y sin MANTENIMIENTO en 10.000. LIMPIEZA +5% taquilla, RESTAURACIÓN +10% taquilla, DIFUSIÓN +10% derechos de imagen, AGENCIA DE VIAJES evita 4.000 € por partido fuera, ASEGURADORA paga 10.000 €/turno por lesionado.',
        },
        {
          id: 'salud-financiera',
          title: 'Salud financiera',
          body: 'La pestaña ANÁLISIS de Economía mide tu ratio masa salarial / ingresos con tres zonas: SANO ≤55%, VIGILANCIA ≤75%, RIESGO >75%. También compara tu valoración, presupuesto y masa salarial contra la media de tu liga. Terminar el primer turno del mes con caja negativa castiga el prestigio.',
        },
        {
          id: 'acciones',
          title: 'Mercado de acciones',
          body: 'Cada club emite 1.500 acciones y puedes invertir en CUALQUIER club (también rivales), con límite anti-manipulación del 5% por mánager y club (75 acciones). Los precios se mueven con resultados e inflación global; tu cartera muestra P&L e histórico.',
        },
        {
          id: 'cuenta-manager',
          title: 'Cuenta del mánager',
          body: 'Tu patrimonio personal es independiente de la caja del club: cobra tu salario, paga las comisiones de cláusula (3% base) y opera en acciones. Suma hasta 5 puntos de prestigio.',
        },
      ],
      tip: 'Vigila el ratio salarial cada mes: pasar de la zona SANO a VIGILANCIA suele ser una renovación estrella; volver, cuesta una temporada.',
    },
  },
  {
    id: 'stadium',
    title: 'Estadio y cantera',
    icon: '🏗️',
    content: {
      heading: 'Instalaciones y juveniles',
      sections: [
        {
          id: 'estadio',
          title: 'Estadio',
          body: 'Capacidad ampliable con anfiteatros, niveles de asientos, palcos y aparcamiento (+4% asistencia por ampliación); ciudad deportiva de 9 niveles que mejora el talento medio de cantera. Una obra a la vez; las obras en curso son visibles en la página del estadio.',
        },
        {
          id: 'cantera',
          title: 'Cantera y promoción (F4)',
          body: 'Las residencias generan aproximadamente un juvenil cada 3 meses in-game. Para PROMOCIONAR a un canterano negocias su primer contrato: pide como mínimo 1.000 + talento × 50 €/mes — un canterano de talento 80 exige 5.000 €/mes. La promoción valida tope salarial y límite de plantilla (≤30).',
        },
        {
          id: 'aficion',
          title: 'Afición',
          body: 'Pirámide de 6 segmentos: jóvenes/adultos × renta baja/media/alta. La renta alta rinde más por entrada; la baja llena el estadio pero arriesga DISTURBIOS si los jóvenes de renta baja superan el 35% y las rentas bajas el 65% (multa de 150K a 1,5M). Las campañas de captación mueven segmentos concretos. La página de Afición muestra conversión €/aficionado y comparativa con tu liga.',
        },
        {
          id: 'ideologia',
          title: 'Ideología y emblemáticos',
          body: 'Define los valores del club y nombra EMBLEMÁTICOS: solo jugadores retirados EN tu club con ≥450 partidos allí (el juego los detecta automáticamente al retirarse). Aportan bonus permanentes a la cantera y desbloquean mejoras ideológicas.',
        },
      ],
      tip: 'El precio de entrada = base × nivel del país − 5€ por división por debajo de la máxima: en divisiones bajas, el nivel ALTO casi nunca compensa.',
    },
  },
  {
    id: 'competitions',
    title: 'Competiciones',
    icon: '🏆',
    content: {
      heading: 'Ligas, copas, Europa y selecciones',
      sections: [
        {
          id: 'ligas',
          title: 'Ligas y temporadas',
          body: 'Ligas por país con ASCENSOS y DESCENSOS (3+3 entre divisiones). Al cruzar el 1 de julio se siembra la temporada nueva completa: calendarios de liga, cuadro de copa, competiciones europeas y supercopas con los campeones correctos. Los partidos caen en Mié/Vie/Dom in-game.',
        },
        {
          id: 'europa',
          title: 'Champions, UEL y Conference',
          body: 'Las plazas europeas por país salen del COEFICIENTE acumulado (estilo UEFA): cada temporada tus resultados europeos suman al coeficiente de tu país y al del club. La clasificación de la liga tier-1 reparte las plazas; los premios por ronda se ingresan en tu economía al cerrarse cada eliminatoria.',
        },
        {
          id: 'copas',
          title: 'Copas y supercopas',
          body: 'Copa nacional por eliminatorias con cuadro completo visible y premios por ronda (incluida taquilla doble en rondas señaladas). La supercopa enfrenta al campeón de liga y de copa al inicio de temporada.',
        },
        {
          id: 'selecciones',
          title: 'Selecciones',
          body: 'Elecciones de seleccionador entre mánagers de la nacionalidad con prestigio mínimo. Puedes compaginar club y selección; junio es el mes de las competiciones internacionales.',
        },
      ],
      tip: 'El coeficiente importa a largo plazo: una buena campaña europea de hoy son más plazas (y más premios) para tu país en dos temporadas.',
    },
  },
  {
    id: 'match',
    title: 'El partido-evento',
    icon: '🎬',
    content: {
      heading: 'Resultado oculto, Match Center y repetición',
      sections: [
        {
          id: 'resultado-oculto',
          title: 'Resultado oculto (E15)',
          body: 'Cuando el turno procesa tu partido, el resultado queda OCULTO para ti hasta que decidas: VER EL PARTIDO (presentación de alineaciones y reproducción jugada a jugada) o saltar directamente al resultado. Cada cuenta marca su propio "visto": puedes comentar sin spoilers.',
        },
        {
          id: 'match-center',
          title: 'Match Center broadcast',
          body: 'Retransmisión completa: marcador TV con posesión en vivo, lower-thirds en cada gol, momentum, métricas hasta el minuto actual, capas de calor y tiros, narración teletipo, cortinillas de descanso y final, y sonido opcional (apagado por defecto). Velocidad ×1/×2/×4 y scrubbing libre con marcas de gol.',
        },
        {
          id: 'repeticion',
          title: 'Repetición: anatomía del gol',
          body: 'Cada gol guarda su CADENA completa: quién recuperó, quién condujo, quién asistió y quién remató — y contra quién. La REPETICIÓN re-traza la jugada por su carril real (banda izquierda/centro/derecha, derivado de tus zonas de ataque) y muestra el duelo de atributos exacto de cada eslabón: los valores que usó el motor, atacante vs defensor. Disponible desde el lower-third del gol y desde el timeline.',
        },
        {
          id: 'directo',
          title: 'Jornada en vivo',
          body: 'Durante el tick, /live muestra el multimarcador de tu jornada por WebSocket: los goles de toda la liga van cayendo en directo, con notificación push opcional.',
        },
      ],
      tip: 'En la repetición, fíjate en el eslabón perdido: si te baten siempre en la "recuperación", tu mediocampo necesita más entrada y organización, no un delantero.',
    },
  },
  {
    id: 'multiplayer',
    title: 'Subastas y negociación',
    icon: '🔨',
    content: {
      heading: 'Mercado entre humanos en tiempo real',
      sections: [
        {
          id: 'subastas',
          title: 'Subastas en vivo',
          body: 'Crea una subasta desde un jugador en venta. Las pujas llegan en directo (🟢) o por refresco (🟡). Anti-snipe: una puja en los últimos 30 segundos amplía el cierre +30s. El ganador paga y se lleva al jugador al cerrar (cierre idempotente: sin dobles cobros).',
        },
        {
          id: 'negociacion',
          title: 'Negociación formal',
          body: 'En "Negociaciones" propones compras, ventas, CESIONES con opción de compra o INTERCAMBIOS con dinero. El destinatario puede aceptar (ejecución atómica validando ventana, tope salarial de ambos y límites de plantilla), rechazar o contraofertar — la contraoferta anula la propuesta y abre una inversa.',
        },
        {
          id: 'dms-chat',
          title: 'Mensajes y comunidad',
          body: 'Mensajes directos en vivo entre mánagers, chat por salas, foro y club social. Los agentes FIFA moderan: cuentas duplicadas, ventas amañadas y manipulación de mercado tienen sanción.',
        },
      ],
      tip: 'En una subasta caliente, puja con 35+ segundos de margen: si pujas en los últimos 30s solo estás regalando tiempo extra a tu rival.',
    },
  },
  {
    id: 'career',
    title: 'Tu carrera',
    icon: '🎖️',
    content: {
      heading: 'Nivel, XP y árbol de habilidades',
      sections: [
        {
          id: 'xp',
          title: 'Curva de experiencia',
          body: 'Ganas XP con los resultados. Subir al nivel N cuesta 900 × N × 1,16^(N−1): la curva es exponencial — llegar arriba cuesta TEMPORADAS, no semanas. Los niveles ya ganados nunca se pierden.',
        },
        {
          id: 'arbol',
          title: 'Árbol 3×3 con efectos reales',
          body: 'Tres ramas con desbloqueo secuencial y costes 1/2/3 puntos por tier. GENIO TÁCTICO (tac_1/2/3): +1/+2/+3 jugadas entrenadas activas. MOTIVADOR (mot_1/2/3): +2/+4/+6 de moral en tus respuestas de prensa y ruedas de prensa. REY DE LAS FINANZAS (fin_1/2/3): −10/−20/−30% sobre la comisión del 3% que pagas de tu bolsillo al comprar por cláusula.',
        },
        {
          id: 'prensa',
          title: 'Ruedas de prensa',
          body: 'Tras los partidos hay preguntas de prensa con 3 tonos (humilde/neutral/agresivo) y consecuencias reales en moral y afición. Tu histórico de declaraciones queda publicado como noticias.',
        },
        {
          id: 'accesibilidad',
          title: 'Accesibilidad y atajos',
          body: 'En la barra superior: modo daltónico (paleta Okabe-Ito) y tamaño de texto A−/A/A+. Atajos: pulsa g y luego una letra (g p plantilla, g m mercado, g t tácticas…); la tecla ? muestra la lista completa. Las animaciones respetan prefers-reduced-motion.',
        },
      ],
      tip: 'El primer punto en fin_1 se amortiza solo: una compra por cláusula de 10M te ahorra 30.000 € de comisión personal.',
    },
  },
];
