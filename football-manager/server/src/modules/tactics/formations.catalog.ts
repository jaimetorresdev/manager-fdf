// ─── WT2 · Catálogo de las 15 formaciones ─────────────────────────────────────
// Fuente de diseño: docs/diseno-posiciones-y-formaciones.md §3 (textos en
// español, listos para UI). TODO ADITIVO: los strings de formación legacy
// (`\d+(-\d+){1,3}`) siguen siendo válidos en Tactic.formation — las del
// catálogo simplemente se ENRIQUECEN (slots, counters, demanda física, flavor).
//
// El sistema de counters es piedra-papel-tijera SUAVE: WT3 lo convierte en
// bonus/malus de perfil acotados, nunca determinista. 4-2-3-1 es la navaja
// suiza: listas vacías a propósito (la más neutra del catálogo).

import type { DetailedPosition, MacroPosition } from '../players/detailedPositions';
import { macroOf } from '../players/detailedPositions';

export type ModernRole =
  | 'portero_libero'      // POR: sale lejos del área y participa en la salida
  | 'lateral_invertido'   // LI/LD: pisa el centro como pivote extra (Guardiola)
  | 'carrilero'           // LI/LD en líneas de 3/5: TODA la banda
  | 'central_salidor'     // CT en línea de 3: rompe líneas (Stones-líbero)
  | 'pierna_cambiada'     // EXTI/EXTD: engancha hacia dentro y dispara
  | 'falso_9';            // F9 en el puesto del DC: baja a recibir

export const MODERN_ROLE_LABELS: Record<ModernRole, string> = {
  portero_libero: 'Portero-líbero',
  lateral_invertido: 'Lateral invertido',
  carrilero: 'Carrilero',
  central_salidor: 'Central salidor',
  pierna_cambiada: 'Extremo a pierna cambiada',
  falso_9: 'Falso 9',
};

export type FormationStyle =
  | 'posesion' | 'contraataque' | 'equilibrada' | 'defensiva' | 'ofensiva' | 'historica';

export interface FormationSlot {
  index: number;                    // 1-11 (1 = portero)
  positions: DetailedPosition[];    // posiciones válidas, en orden de preferencia
  label: string;                    // etiqueta corta en español para la pizarra
  roles?: ModernRole[];             // roles modernos sugeridos para el hueco
}

export interface FormationDef {
  key: string;                      // identificador estable (querystring/Tactic.formation)
  name: string;
  shape: string;                    // forma numérica (suma 10 jugadores de campo)
  slots: FormationSlot[];           // 11 huecos, índice 1 = POR
  strengths: string[];
  weaknesses: string[];
  counters: { strongVs: string[]; weakVs: string[] };   // keys del catálogo
  physicalDemand: 1 | 2 | 3 | 4 | 5;
  style: FormationStyle;
  description: string;
  history: string;
}

/** Constructor compacto de slots: [posiciones, label, roles?]. */
type SlotSpec = [DetailedPosition[], string, ModernRole[]?];
function slots(specs: SlotSpec[]): FormationSlot[] {
  return specs.map(([positions, label, roles], i) => ({
    index: i + 1,
    positions,
    label,
    ...(roles && roles.length ? { roles } : {}),
  }));
}

const GK: SlotSpec = [['POR'], 'Portero', ['portero_libero']];

export const FORMATIONS: FormationDef[] = [
  {
    key: '4-4-2', name: '4-4-2 — la clásica', shape: '4-4-2',
    slots: slots([
      GK,
      [['LD'], 'Lateral derecho', ['lateral_invertido']],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['LI'], 'Lateral izquierdo', ['lateral_invertido']],
      [['INTD'], 'Interior derecho'],
      [['ORG', 'BOX'], 'Mediocentro'],
      [['ORG', 'BOX'], 'Mediocentro'],
      [['INTI'], 'Interior izquierdo'],
      [['DC'], 'Delantero centro'],
      [['F9', 'DC'], 'Segundo delantero', ['falso_9']],
    ]),
    strengths: [
      'Funciona atacando y defendiendo; difícil de penetrar.',
      'Laterales que doblan al interior generan centros constantes.',
      'Simple de entender: todo el vestuario sabe su papel.',
    ],
    weaknesses: [
      'Físicamente exigente para los 2 mediocentros (ataque y defensa).',
      'Superada en número contra mediocampos de 3-5 hombres.',
    ],
    counters: { strongVs: ['4-3-2-1', '4-1-2-1-2'], weakVs: ['3-5-2', '4-5-1'] },
    physicalDemand: 3, style: 'equilibrada',
    description: 'La formación clásica por excelencia: dos líneas de cuatro y dos puntas. Variante 4-4-1-1 con el segundo delantero por detrás haciendo de número 10.',
    history: 'El sistema dominante del fútbol inglés y europeo durante décadas; la base sobre la que se mide todo lo demás.',
  },
  {
    key: '4-5-1', name: '4-5-1 — el cerrojo de contraataque', shape: '4-5-1',
    slots: slots([
      GK,
      [['LD'], 'Lateral derecho'],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['LI'], 'Lateral izquierdo'],
      [['EXTD', 'INTD'], 'Banda derecha', ['pierna_cambiada']],
      [['ORG'], 'Mediocentro'],
      [['PIV'], 'Pivote destructor'],
      [['ORG', 'BOX'], 'Mediocentro'],
      [['EXTI', 'INTI'], 'Banda izquierda', ['pierna_cambiada']],
      [['DC'], 'Delantero centro'],
    ]),
    strengths: [
      'Pivote destructor que roba y lanza el contragolpe rápido.',
      'Muy difícil de penetrar; mata partidos con ventaja.',
    ],
    weaknesses: [
      'Poca pegada; puede ser aburrida.',
      'El delantero centro se aísla si el equipo se hunde demasiado.',
    ],
    counters: { strongVs: ['4-3-3'], weakVs: ['4-2-4'] },
    physicalDemand: 3, style: 'contraataque',
    description: 'Bloque bajo de cinco medios y un punta solitario: frustrar la posesión rival y golpear a la contra.',
    history: 'El Chelsea de Mourinho 2004/05: 15 goles encajados en toda la liga, récord histórico de la Premier.',
  },
  {
    key: '4-3-3', name: '4-3-3 — posesión y presión', shape: '4-3-3',
    slots: slots([
      GK,
      [['LD'], 'Lateral derecho', ['lateral_invertido']],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['LI'], 'Lateral izquierdo', ['lateral_invertido']],
      [['PIV'], 'Pivote'],
      [['ORG', 'BOX'], 'Mediocentro'],
      [['MCO'], 'Mediocentro ofensivo'],
      [['EXTD'], 'Extremo derecho', ['pierna_cambiada']],
      [['DC', 'F9'], 'Delantero centro', ['falso_9']],
      [['EXTI'], 'Extremo izquierdo', ['pierna_cambiada']],
    ]),
    strengths: [
      'Triángulos de pase y marcaje zonal; presión alta tras pérdida.',
      'Fuera de juego adelantado y extremos en el uno contra uno.',
    ],
    weaknesses: [
      'Espacio a la espalda entre lateral y extremo.',
      'Si los mediocentros suben y se pierde el balón, el centro queda vendido.',
      'Sin llegadas, el delantero centro se aísla.',
    ],
    counters: { strongVs: ['4-4-2', '3-5-2'], weakVs: ['4-5-1', '5-4-1'] },
    physicalDemand: 4, style: 'posesion',
    description: 'Posesión, presión alta y amplitud con extremos puros. La presión ahoga las salidas lentas del rival.',
    history: 'El Ajax del 71, el Fútbol Total y la Holanda del 74: la formación que cambió la manera de entender el juego.',
  },
  {
    key: '4-3-2-1', name: '4-3-2-1 — el árbol de Navidad', shape: '4-3-2-1',
    slots: slots([
      GK,
      [['LD'], 'Lateral derecho'],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['LI'], 'Lateral izquierdo'],
      [['PIV'], 'Pivote'],
      [['ORG'], 'Organizador'],
      [['BOX'], 'Box-to-box'],
      [['MCO', 'MP'], 'Enganche'],
      [['MP'], 'Media punta'],
      [['DC'], 'Delantero centro'],
    ]),
    strengths: [
      'Superioridad numérica total por dentro.',
      'Uno-dos rápidos y triangulaciones; niega la posesión al rival.',
    ],
    weaknesses: [
      'CERO amplitud propia; vulnerable a contraataques por banda.',
      'Exige laterales que suban toda la banda sin red.',
    ],
    counters: { strongVs: ['3-4-3'], weakVs: ['4-4-2', '4-2-4'] },
    physicalDemand: 3, style: 'posesion',
    description: 'Mediocampo en árbol: tres medios, dos enganches y un punta. Posesión estrecha que asfixia por dentro.',
    history: 'Popularizado por el Milan de Ancelotti con Pirlo, Seedorf, Kaká y compañía: el lujo de jugar sin extremos.',
  },
  {
    key: '4-1-3-2', name: '4-1-3-2 — el 4-4-2 ofensivo', shape: '4-1-3-2',
    slots: slots([
      GK,
      [['LD'], 'Lateral derecho'],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['LI'], 'Lateral izquierdo'],
      [['PIV'], 'Pivote'],
      [['INTD'], 'Interior derecho'],
      [['MCO', 'ORG'], 'Mediocentro ofensivo'],
      [['INTI'], 'Interior izquierdo'],
      [['DC'], 'Delantero centro'],
      [['F9'], 'Segundo punta', ['falso_9']],
    ]),
    strengths: [
      'Ataca por dentro y por fuera a la vez.',
      'Dos puntas que ocupan a los centrales y presionan la salida.',
      'El pivote compacta el equipo por detrás.',
    ],
    weaknesses: [
      'Estrecho por el medio si los interiores no abren.',
      'Exige laterales rápidos y habilidosos; las contras por banda duelen.',
    ],
    counters: { strongVs: ['4-4-2'], weakVs: ['3-5-2'] },
    physicalDemand: 4, style: 'ofensiva',
    description: 'La evolución agresiva del 4-4-2: un pivote libera a tres medios ofensivos por detrás de dos puntas.',
    history: 'Bilic, el City de Mancini 2011/12 o el Benfica de Jorge Jesus: dos delanteros y mediocampo volcado.',
  },
  {
    key: '5-4-1', name: '5-4-1 — el catenaccio', shape: '5-4-1',
    slots: slots([
      GK,
      [['LD'], 'Lateral derecho'],
      [['CT'], 'Central'],
      [['CT'], 'Líbero', ['central_salidor']],
      [['CT'], 'Central'],
      [['LI'], 'Lateral izquierdo'],
      [['INTD'], 'Interior derecho'],
      [['ORG'], 'Organizador'],
      [['PIV'], 'Pivote'],
      [['INTI'], 'Interior izquierdo'],
      [['DC'], 'Delantero centro'],
    ]),
    strengths: [
      'Solidez máxima: cinco atrás y cuatro por delante.',
      'El líbero barre detrás de la línea y puede salir conduciendo.',
      'Perfecta para defender ventajas mínimas.',
    ],
    weaknesses: [
      'Cede toda la iniciativa; pegada casi nula.',
      'Si encaja primero, le cuesta el mundo remontar.',
    ],
    counters: { strongVs: ['4-3-3'], weakVs: ['4-2-4', '4-3-2-1'] },
    physicalDemand: 2, style: 'defensiva',
    description: 'El cerrojo por antonomasia: línea de cinco con líbero y bloque bajo. Frustra la posesión estéril.',
    history: 'Del verrou de Rappan al catenaccio de Herrera y el líbero elegante de Beckenbauer.',
  },
  {
    key: '4-1-2-1-2', name: '4-1-2-1-2 — el diamante', shape: '4-1-2-1-2',
    slots: slots([
      GK,
      [['LD'], 'Lateral derecho'],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['LI'], 'Lateral izquierdo'],
      [['PIV'], 'Base del rombo'],
      [['INTD'], 'Interior derecho'],
      [['INTI'], 'Interior izquierdo'],
      [['MP'], 'Vértice del rombo'],
      [['DC'], 'Delantero centro'],
      [['F9', 'DC'], 'Segundo delantero', ['falso_9']],
    ]),
    strengths: [
      'Muy equilibrada; dos puntas constantes que ocupan a los centrales.',
      'El pivote protege e inicia; la media punta enchufa entre líneas.',
    ],
    weaknesses: [
      'Exige plantilla profunda y MUY técnica en el mediocampo.',
      'Poca amplitud: los laterales cargan con toda la banda.',
    ],
    counters: { strongVs: ['4-4-2'], weakVs: ['4-3-3', '4-2-4'] },
    physicalDemand: 4, style: 'equilibrada',
    description: 'El rombo en el medio: pivote, dos interiores y una media punta liberada entre líneas, con doble punta.',
    history: 'El sistema de los grandes mediocampos: exige De Bruynes y Brunos para brillar de verdad.',
  },
  {
    key: '3-5-2', name: '3-5-2 — el dominio del centro', shape: '3-5-2',
    slots: slots([
      GK,
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['LD'], 'Carrilero derecho', ['carrilero']],
      [['INTD', 'ORG'], 'Interior derecho'],
      [['PIV'], 'Pivote'],
      [['INTI', 'ORG'], 'Interior izquierdo'],
      [['LI'], 'Carrilero izquierdo', ['carrilero']],
      [['DC'], 'Delantero centro'],
      [['F9', 'DC'], 'Segundo delantero', ['falso_9']],
    ]),
    strengths: [
      'Manda en el centro (5 contra 4) y alimenta a dos puntas.',
      'Ideal contra equipos de dos delanteros: tres centrales para dos puntas.',
    ],
    weaknesses: [
      'La espalda de los carrileros es una autopista.',
      'Los carrileros no tienen relevo; si los superan, los tres centrales quedan abiertos.',
    ],
    counters: { strongVs: ['4-4-2', '4-1-3-2'], weakVs: ['4-3-3'] },
    physicalDemand: 5, style: 'equilibrada',
    description: 'Cinco en el medio con carrileros a banda completa: superioridad central y doble punta.',
    history: 'El sistema de Bilardo en el 86: el Mundial de Maradona.',
  },
  {
    key: '5-3-2', name: '5-3-2 — el 3-5-2 con candado', shape: '5-3-2',
    slots: slots([
      GK,
      [['LD'], 'Lateral derecho', ['carrilero']],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['LI'], 'Lateral izquierdo', ['carrilero']],
      [['ORG'], 'Organizador'],
      [['PIV'], 'Pivote'],
      [['BOX'], 'Box-to-box'],
      [['DC'], 'Delantero centro'],
      [['F9', 'DC'], 'Segundo delantero', ['falso_9']],
    ]),
    strengths: [
      'Cierra las bandas que el 3-5-2 deja abiertas.',
      'Con calidad arriba controla y contraataca siendo durísimo atrás.',
    ],
    weaknesses: [
      'Puede volverse demasiado defensivo; desgaste físico y mental continuo.',
      'El centro se congestiona cuando los medios retroceden sobre los centrales.',
    ],
    counters: { strongVs: ['4-2-4'], weakVs: ['4-3-3'] },
    physicalDemand: 4, style: 'contraataque',
    description: 'Tres centrales, laterales largos y tres medios de oficio para liberar a dos cracks arriba.',
    history: 'El Brasil de 2002: Cafú y Roberto Carlos a banda completa para que Ronaldo y Ronaldinho hicieran magia.',
  },
  {
    key: '4-2-3-1', name: '4-2-3-1 — la moderna por defecto', shape: '4-2-3-1',
    slots: slots([
      GK,
      [['LD'], 'Lateral derecho', ['lateral_invertido']],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['LI'], 'Lateral izquierdo', ['lateral_invertido']],
      [['PIV'], 'Pivote'],
      [['BOX', 'PIV'], 'Doble pivote'],
      [['EXTD', 'INTD'], 'Banda derecha', ['pierna_cambiada']],
      [['MP'], 'Media punta'],
      [['EXTI', 'INTI'], 'Banda izquierda', ['pierna_cambiada']],
      [['DC'], 'Delantero centro'],
    ]),
    strengths: [
      'Doble pivote = solidez central; tres creadores a pierna natural o cambiada.',
      'Mutable en caliente a 4-3-3, 4-4-2 o 4-5-1; encaja con casi cualquier plantilla.',
    ],
    weaknesses: [
      'Exige un delantero matador: si no convierte, no hay plan B.',
      'Los tres de arriba deben bajar a defender o el doble pivote se parte.',
    ],
    counters: { strongVs: [], weakVs: [] },
    physicalDemand: 3, style: 'equilibrada',
    description: 'La navaja suiza moderna: la más neutra del catálogo, con pocas debilidades estructurales y sin dominancia clara contra nadie.',
    history: 'El estándar del fútbol contemporáneo: de los Haaland y Kane como referencia de área hacia abajo.',
  },
  {
    key: '3-4-3', name: '3-4-3 — la apisonadora de Conte', shape: '3-4-3',
    slots: slots([
      GK,
      [['CT'], 'Central'],
      [['CT'], 'Central salidor', ['central_salidor']],
      [['CT'], 'Central'],
      [['LD'], 'Carrilero derecho', ['carrilero']],
      [['PIV', 'ORG'], 'Doble pivote'],
      [['BOX'], 'Box-to-box'],
      [['LI'], 'Carrilero izquierdo', ['carrilero']],
      [['EXTD'], 'Extremo derecho', ['pierna_cambiada']],
      [['DC'], 'Delantero centro'],
      [['EXTI'], 'Extremo izquierdo', ['pierna_cambiada']],
    ]),
    strengths: [
      'Ataque de cinco: extremos por dentro y carrileros dando amplitud.',
      'Repliegue automático a 5-4-1 compacto; devastadora cuando funciona.',
    ],
    weaknesses: [
      'Si superan al doble pivote, los tres centrales quedan vendidos.',
      'Carrileros con resistencia EXCEPCIONAL o no existe; la más exigente tácticamente.',
    ],
    counters: { strongVs: ['4-4-2', '4-5-1'], weakVs: ['4-1-2-1-2', '4-3-2-1'] },
    physicalDemand: 5, style: 'ofensiva',
    description: 'Ofensiva total con tres centrales: extremos a pierna cambiada por dentro y carrileros incansables por fuera.',
    history: 'El Chelsea de Conte 2016/17: 13 victorias seguidas y 93 puntos.',
  },
  {
    key: '3-2-4-1', name: '3-2-4-1 — la transición moderna', shape: '3-2-4-1',
    slots: slots([
      GK,
      [['CT'], 'Central'],
      [['CT'], 'Central salidor', ['central_salidor']],
      [['CT'], 'Central'],
      [['PIV'], 'Pivote'],
      [['PIV', 'CT'], 'Pivote-líbero', ['central_salidor']],
      [['INTD'], 'Interior derecho'],
      [['MCO'], 'Mediocentro ofensivo'],
      [['MCO'], 'Mediocentro ofensivo'],
      [['INTI'], 'Interior izquierdo'],
      [['DC'], 'Delantero centro'],
    ]),
    strengths: [
      'Velocidad de transición defensa-ataque.',
      'Caja de cuatro interiores que machaca entre líneas; un central/pivote que sube como líbero moderno.',
    ],
    weaknesses: [
      'Carísima en perfiles: necesitas un Stones.',
      'Muy exigente en sincronización; bandas cedidas si los interiores no basculan.',
    ],
    counters: { strongVs: [], weakVs: ['4-3-3'] },
    physicalDemand: 4, style: 'posesion',
    description: 'La estructura 3-2 en salida con caja de cuatro interiores: posesión-presión de última generación.',
    history: 'El City del Stones-líbero: el central que sube a pivote y rompe todos los manuales.',
  },
  {
    key: 'wm-3-2-5', name: 'WM (3-2-5) — histórica', shape: '3-2-5',
    slots: slots([
      GK,
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['PIV'], 'Medio centro'],
      [['PIV'], 'Medio centro'],
      [['EXTD'], 'Extremo derecho'],
      [['INTD', 'MCO'], 'Interior derecho'],
      [['DC'], 'Delantero centro'],
      [['INTI', 'MCO'], 'Interior izquierdo'],
      [['EXTI'], 'Extremo izquierdo'],
    ]),
    strengths: [
      'CINCO atacantes: pegada de otra época.',
      'Flavor retro único: la primera gran revolución táctica.',
    ],
    weaknesses: [
      'Defensa de los años 30: cualquier mediocampo moderno la supera.',
      'Agujeros entre líneas por todas partes.',
    ],
    counters: { strongVs: [], weakVs: ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '4-5-1'] },
    physicalDemand: 3, style: 'historica',
    description: 'Desbloqueable para valientes y románticos: pegada bruta máxima a cambio de un mediocampo y una defensa de otra época.',
    history: 'Herbert Chapman, Arsenal 1925-34: la primera gran divergencia del 2-3-5 clásico.',
  },
  {
    key: 'metodo-2-3-2-3', name: 'Metodo (2-3-2-3) — histórica', shape: '2-3-2-3',
    slots: slots([
      GK,
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['PIV'], 'Medio derecho'],
      [['ORG'], 'Centrocampista eje'],
      [['PIV'], 'Medio izquierdo'],
      [['MCO', 'MP'], 'Enganche derecho'],
      [['MCO', 'MP'], 'Enganche izquierdo'],
      [['EXTD'], 'Extremo derecho'],
      [['DC'], 'Delantero centro'],
      [['EXTI'], 'Extremo izquierdo'],
    ]),
    strengths: [
      'El primer "doble enganche" de la historia.',
      'Mediocampo en W que ya era contraataque organizado.',
    ],
    weaknesses: [
      'SOLO 2 defensas: cualquier doble punta moderna la destroza.',
      'Exige repliegues heroicos de sus medios.',
    ],
    counters: { strongVs: ['wm-3-2-5'], weakVs: ['4-4-2', '3-5-2', '4-2-4'] },
    physicalDemand: 3, style: 'historica',
    description: 'Flavor retro, mismo tratamiento que la WM: para revivir el fútbol de los años 30 con sus virtudes y sus agujeros.',
    history: 'Vittorio Pozzo e Italia, campeona del mundo en 1934 y 1938: 63V-17E-15D.',
  },
  {
    key: '4-2-4', name: '4-2-4 — el ataque total brasileño', shape: '4-2-4',
    slots: slots([
      GK,
      [['LD'], 'Lateral derecho'],
      [['CT'], 'Central'],
      [['CT'], 'Central'],
      [['LI'], 'Lateral izquierdo'],
      [['ORG'], 'Organizador'],
      [['BOX'], 'Box-to-box'],
      [['EXTD'], 'Extremo derecho'],
      [['DC'], 'Delantero centro'],
      [['DC', 'F9'], 'Segundo delantero', ['falso_9']],
      [['EXTI'], 'Extremo izquierdo'],
    ]),
    strengths: [
      'Pegada máxima con cuatro atacantes y laterales que se suman.',
      'Rompe cerrojos por pura acumulación.',
    ],
    weaknesses: [
      'SOLO 2 mediocampistas: superados con facilidad.',
      'El partido se juega en las áreas; sin balón sufre muchísimo.',
    ],
    counters: { strongVs: ['5-4-1', '4-5-1', '4-3-2-1'], weakVs: ['3-5-2', '4-3-3', '4-2-3-1'] },
    physicalDemand: 4, style: 'ofensiva',
    description: 'El ataque total: cuatro delanteros fijos y dos medios héroes. Abre cerrojos y regala espectáculo (y sustos).',
    history: 'El Brasil de 1958 con Pelé de 17 años, y el del 70: la belleza hecha sistema.',
  },
];

// ─── Lookups ──────────────────────────────────────────────────────────────────

const BY_KEY = new Map(FORMATIONS.map((f) => [f.key, f]));
const BY_SHAPE = new Map(FORMATIONS.map((f) => [f.shape, f]));

/** Busca una formación del catálogo por key o por shape ("3-2-5" → WM). null si
 *  es un string libre legacy (que sigue siendo válido, pero sin enriquecer). */
export function findFormation(value: string | null | undefined): FormationDef | null {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  return BY_KEY.get(v) ?? BY_SHAPE.get(v) ?? null;
}

/** Macro mayoritaria de un slot (para pintar líneas y para emergencias). */
export function slotMacro(slot: FormationSlot): MacroPosition {
  return macroOf(slot.positions[0]);
}

/** Demanda física 1-5 de una formación; null si no está en el catálogo (neutro). */
export function formationPhysicalDemand(value: string | null | undefined): number | null {
  return findFormation(value)?.physicalDemand ?? null;
}
