// ─── Pista de comentario play-by-play (I2) ───────────────────────────────────
// Genera una línea de RELATO de retransmisión por evento, en un campo APARTE.
// NUNCA reescribe `step.text` (la narración del motor): hacerlo movería las
// coordenadas, porque `zoneLaneToPoint` siembra su jitter con `step.text`. Esta
// capa solo LEE el timeline y produce prosa de comentarista, determinista
// (hash FNV-1a, sin Math.random) → mismo timeline ⇒ mismo comentario.

import type { TimelineEntry, Team } from '../types/engine';

export type CommentaryTone = 'goal' | 'shot' | 'save' | 'build' | 'foul' | 'final' | 'neutral';

export interface CommentaryLine {
  /** índice del evento en el timeline (sincroniza con el cursor del visor). */
  cursor: number;
  minute: number;
  team?: Team;
  tone: CommentaryTone;
  /** prosa de comentarista — DISTINTA de step.text. */
  text: string;
}

export interface CommentaryContext {
  homeName: string;
  awayName: string;
  /** nombre del portador resuelto (atacante del evento), si lo hay. */
  carrierName?: string | null;
  /** nombre del defensor/portero del duelo, si el motor lo dio. */
  defenderName?: string | null;
  homeGoals: number;
  awayGoals: number;
}

// FNV-1a de 32 bits — idéntico criterio determinista que el resto de la síntesis.
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick(arr: string[], seed: number): string {
  return arr[seed % arr.length];
}

function laneWord(lane?: string | null): string {
  if (lane === 'left') return 'la banda izquierda';
  if (lane === 'right') return 'la banda derecha';
  if (lane === 'center') return 'el centro';
  return '';
}

const TONE_BY_PHASE: Record<string, CommentaryTone> = {
  gol: 'goal', remate: 'shot', parada: 'save', falta: 'foul', final: 'final',
  construccion: 'build', progresion: 'build', saque: 'neutral',
};

/**
 * Línea de comentario para un evento. Pura y determinista.
 * @param step    evento actual
 * @param prevStep evento anterior (para matices de continuidad)
 * @param cursor  índice del evento
 * @param ctx     nombres, portador, defensor y marcador acumulado
 */
export function commentaryFor(
  step: TimelineEntry | undefined,
  prevStep: TimelineEntry | undefined,
  cursor: number,
  ctx: CommentaryContext,
): CommentaryLine | null {
  if (!step) return null;

  const teamName = step.team === 'home' ? ctx.homeName : ctx.awayName;
  const rivalName = step.team === 'home' ? ctx.awayName : ctx.homeName;
  const who = ctx.carrierName && ctx.carrierName.trim() ? ctx.carrierName.trim() : teamName;
  const gk = ctx.defenderName && ctx.defenderName.trim() ? ctx.defenderName.trim() : `el portero de ${rivalName}`;
  const lane = laneWord(step.lane);
  const laneBy = lane ? ` por ${lane}` : '';
  const laneFrom = lane ? ` desde ${lane}` : '';
  const scoreline = `${ctx.homeName} ${ctx.homeGoals}-${ctx.awayGoals} ${ctx.awayName}`;
  const seed = hashStr(`${cursor}:${step.minute}:${step.phase}:${step.text ?? ''}`);
  const tone = TONE_BY_PHASE[step.phase] ?? 'neutral';

  let text: string;
  switch (step.phase) {
    case 'saque':
      text = !prevStep
        ? pick(['Rueda el balón, arranca el partido.', 'Saque de centro: comienza el encuentro.'], seed)
        : pick([`Se reanuda el juego desde el centro.`, `Saque de centro para ${teamName}.`], seed);
      break;
    case 'construccion':
      text = pick([
        `${teamName} construye desde atrás con paciencia.`,
        `${who} inicia la jugada${laneFrom}.`,
        `Sale jugado ${teamName}, tocan en su campo.`,
      ], seed);
      break;
    case 'progresion':
      text = pick([
        `${who} progresa${laneBy} y busca un hueco.`,
        `Avanza ${who}: ${teamName} pisa campo rival.`,
        `${who} conduce y levanta la cabeza buscando el pase.`,
      ], seed);
      break;
    case 'remate':
      text = pick([
        `¡Remata ${who}! Y se marcha rozando el poste.`,
        `Disparo de ${who}${laneFrom}... fuera por poco.`,
        `Lo intenta ${who}, pero el balón se va desviado.`,
      ], seed);
      break;
    case 'parada':
      text = pick([
        `¡Gran parada! ${gk} le saca el disparo a ${who}.`,
        `${who} dispara y responde ${gk} con una intervención de mérito.`,
        `¡Atajó ${gk}! Salva a ${rivalName}.`,
      ], seed);
      break;
    case 'gol':
      text = pick([
        `¡GOOOL de ${teamName}! ${who} no perdona. ${scoreline}.`,
        `¡Lo celebra ${teamName}! ${who} la manda al fondo de la red. ${scoreline}.`,
        `¡GOL! ${who} define y golpea ${teamName}. ${scoreline}.`,
      ], seed);
      break;
    case 'falta': {
      const t = (step.text ?? '').toLowerCase();
      if (/roja|expuls/.test(t)) text = `¡Roja! ${teamName} se queda con uno menos.`;
      else if (/amarilla|tarjeta/.test(t)) text = pick([`Amarilla para ${teamName}.`, `Falta y tarjeta: el árbitro amonesta a ${teamName}.`], seed);
      else text = pick(['Falta señalada, se corta el juego.', `Falta de ${teamName}, árbitro atento.`], seed);
      break;
    }
    case 'final':
      text = pick([`Final del partido. ${scoreline}.`, `Se acabó. ${scoreline}.`], seed);
      break;
    default:
      text = `${teamName} mantiene la posesión.`;
  }

  return { cursor, minute: step.minute, team: step.team, tone, text };
}

/** Comentario de todo el timeline (útil para pruebas y para una pista completa). */
export function buildCommentary(
  tl: TimelineEntry[],
  ctxFor: (i: number) => CommentaryContext,
): CommentaryLine[] {
  return tl.map((s, i) => commentaryFor(s, i > 0 ? tl[i - 1] : undefined, i, ctxFor(i)))
    .filter((l): l is CommentaryLine => l != null);
}
