// ─── N4-1 · Tarjeta OpenGraph dinámica del partido ───────────────────────────
// `GET /api/matches/:id/og-image` (público, sin auth — los crawlers de
// Discord/Twitter no llevan token). Genera una tarjeta SVG determinista
// (1200×630, tamaño OG estándar) con marcador, MVP y "minuto épico", a partir
// del partido persistido. Re-simulable por semilla (matchId × 1337, misma
// fórmula que `/audit`). E15-safe: si algún humano implicado aún NO ha visto su
// resultado, se oculta el marcador (tarjeta "previa/por desvelar"), igual que
// `/api/public/matches/featured`. Sin dependencias de imagen (mismo patrón que
// el avatar procedural Q22, `proceduralAvatarSvg`).
import { createHash } from 'crypto';
import prisma from '../../db/prisma';
import { isResultSeen } from './matchEventVisibility';
import { competitionKind } from './matches.routes';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Acepta solo colores hex válidos; en otro caso, fallback seguro. */
function safeColor(raw: string | null | undefined, fallback: string): string {
  if (typeof raw === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(raw.trim())) {
    return raw.trim();
  }
  return fallback;
}

/**
 * Resuelve el glifo del escudo. Si `badge` es un emoji/texto corto (no una URL
 * de imagen subida) se usa tal cual; en otro caso, iniciales del club. El campo
 * `Club.badge` puede contener un emoji ("⚽") O la URL de un escudo subido.
 */
function resolveBadgeGlyph(badge: string | null | undefined, name: string): string {
  const raw = (badge ?? '').trim();
  const looksLikeUrl = /^https?:|\/|\.[a-z]{2,4}$/i.test(raw);
  if (raw && !looksLikeUrl && [...raw].length <= 3) {
    return escapeXml(raw);
  }
  const words = name.split(/\s+/).filter(Boolean);
  const initials = words.length >= 2
    ? words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join('')
    : (words[0] ?? '').slice(0, 3).toUpperCase() || '⚽';
  return escapeXml(initials);
}

function shortLabel(raw: string | null | undefined, fallback: string, max = 16): string {
  const value = (raw ?? '').trim() || fallback;
  return escapeXml(value.length > max ? `${value.slice(0, max - 1)}…` : value);
}

function ogSeed(matchId: number, seedFromStats: unknown): number {
  const seed = Number(seedFromStats);
  return Number.isFinite(seed) ? seed : matchId * 1337;
}

function shortSeedHash(matchId: number, seed: number): string {
  return createHash('sha256')
    .update(`manager-fdf:v1:match:${matchId}:seed:${seed}`)
    .digest('hex')
    .slice(0, 12);
}

export interface MatchOgCard {
  svg: string;
  meta: {
    matchId: number;
    title: string;
    description: string;
    status: string;
    resultHidden: boolean;
    score: { home: number | null; away: number | null };
    mvp: string | null;
    epicMinute: { minute: number; scorer: string | null; team: 'home' | 'away' } | null;
    competition: string | null;
    seed: number;
    seedHash: string;
  };
}

/**
 * Construye la tarjeta OG de un partido. Devuelve `null` si el partido no existe.
 * Determinista: misma entrada (BD) → mismo SVG.
 */
export async function buildMatchOgCard(matchId: number): Promise<MatchOgCard | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      status: true,
      homeClubId: true,
      awayClubId: true,
      homeGoals: true,
      awayGoals: true,
      motm: true,
      homeStatsJson: true,
      playedAt: true,
      decidedBy: true,
      penaltiesHome: true,
      penaltiesAway: true,
      round: true,
      homeClub: { select: { id: true, name: true, shortName: true, badge: true, primaryColor: true, secondaryColor: true } },
      awayClub: { select: { id: true, name: true, shortName: true, badge: true, primaryColor: true, secondaryColor: true } },
      matchday: { include: { competition: { select: { id: true, name: true, shortName: true, type: true, tier: true } } } },
      events: {
        where: { type: 'goal' },
        orderBy: { minute: 'asc' },
        select: { minute: true, team: true, player: { select: { name: true } } },
      },
    },
  });
  if (!match) return null;

  const seed = ogSeed(match.id, parseStatsSeed(match.homeStatsJson));
  const seedHash = shortSeedHash(match.id, seed);

  // E15-safe: ocultar marcador si algún humano implicado aún no lo ha visto.
  const resultHidden = await isMatchResultHiddenPublic(match);

  const homeName = match.homeClub.shortName || match.homeClub.name;
  const awayName = match.awayClub.shortName || match.awayClub.name;
  const competitionName = match.matchday?.competition?.name ?? null;
  const kind = competitionKind(match.matchday?.competition ?? null);

  const played = match.status === 'played';
  const showScore = played && !resultHidden;

  // Minuto épico: el último gol (mayor minuto). Decide el partido o lo sella.
  let epicMinute: MatchOgCard['meta']['epicMinute'] = null;
  if (showScore && match.events.length > 0) {
    const last = match.events[match.events.length - 1];
    epicMinute = {
      minute: last.minute,
      scorer: last.player?.name ?? null,
      team: last.team === 'away' ? 'away' : 'home',
    };
  }

  const mvp = showScore ? (match.motm ?? null) : null;

  const score = { home: showScore ? match.homeGoals ?? null : null, away: showScore ? match.awayGoals ?? null : null };

  const statusLabel = !played
    ? 'PRÓXIMO PARTIDO'
    : resultHidden
      ? 'RESULTADO POR DESVELAR'
      : 'FINAL';

  const title = showScore
    ? `${homeName} ${score.home ?? 0}–${score.away ?? 0} ${awayName}`
    : `${homeName} vs ${awayName}`;
  const description = showScore
    ? [
        competitionName,
        mvp ? `MVP ${mvp}` : null,
        epicMinute ? `Minuto épico: ${epicMinute.minute}'` : null,
        'Manager FDF',
      ].filter(Boolean).join(' · ')
    : [competitionName, !played ? 'Previa' : 'Resultado por desvelar', 'Manager FDF'].filter(Boolean).join(' · ');

  const svg = renderCardSvg({
    homeName: shortLabel(homeName, 'LOCAL'),
    awayName: shortLabel(awayName, 'VISITANTE'),
    homeBadge: resolveBadgeGlyph(match.homeClub.badge, homeName),
    awayBadge: resolveBadgeGlyph(match.awayClub.badge, awayName),
    homeColor: safeColor(match.homeClub.primaryColor, '#1f6f43'),
    awayColor: safeColor(match.awayClub.primaryColor, '#2a3f8f'),
    homeAccent: safeColor(match.homeClub.secondaryColor, '#ffffff'),
    awayAccent: safeColor(match.awayClub.secondaryColor, '#ffffff'),
    competition: competitionName ? shortLabel(competitionName, '', 42) : '',
    kind,
    statusLabel,
    showScore,
    homeGoals: score.home,
    awayGoals: score.away,
    penalties: visiblePenalties(
      showScore,
      match.decidedBy,
      match.penaltiesHome ?? null,
      match.penaltiesAway ?? null,
    ),
    mvp: mvp ? shortLabel(mvp, '', 30) : null,
    epic: epicMinute ? { minute: epicMinute.minute, scorer: epicMinute.scorer ? shortLabel(epicMinute.scorer, '', 26) : null } : null,
    seedHash,
  });

  return {
    svg,
    meta: {
      matchId: match.id,
      title,
      description,
      status: match.status,
      resultHidden,
      score,
      mvp,
      epicMinute,
      competition: competitionName,
      seed,
      seedHash,
    },
  };
}

function parseStatsSeed(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.seed;
  } catch {
    return undefined;
  }
}

/**
 * Versión pública (sin viewer) de la política E15: el resultado se oculta si el
 * partido está jugado y algún humano implicado aún no lo ha marcado como visto.
 * Misma regla que `serializePublicMatches`/featured.
 */
async function isMatchResultHiddenPublic(match: {
  status: string;
  homeClubId: number;
  awayClubId: number;
  homeStatsJson: string | null;
  id: number;
}): Promise<boolean> {
  if (match.status !== 'played') return false;
  const managers = await prisma.manager.findMany({
    where: { clubId: { in: [match.homeClubId, match.awayClubId] } },
    select: { userId: true },
  });
  const implicatedUserIds = managers.map((m) => m.userId);
  if (implicatedUserIds.length === 0) return false;
  const seenRows = await prisma.matchSeen.findMany({
    where: { matchId: match.id, userId: { in: implicatedUserIds } },
    select: { userId: true },
  });
  const seenUsers = new Set(seenRows.map((r) => r.userId));
  return implicatedUserIds.some((userId) => !seenUsers.has(userId) && !isResultSeen(match.homeStatsJson, userId));
}

interface CardInput {
  homeName: string;
  awayName: string;
  homeBadge: string;
  awayBadge: string;
  homeColor: string;
  awayColor: string;
  homeAccent: string;
  awayAccent: string;
  competition: string;
  kind: string;
  statusLabel: string;
  showScore: boolean;
  homeGoals: number | null;
  awayGoals: number | null;
  penalties: { home: number | null; away: number | null } | null;
  mvp: string | null;
  epic: { minute: number; scorer: string | null } | null;
  seedHash: string;
}

function renderCardSvg(c: CardInput): string {
  const W = OG_WIDTH;
  const H = OG_HEIGHT;
  const mid = W / 2;
  const scoreText = c.showScore ? `${c.homeGoals ?? 0}` : '';
  const awayScoreText = c.showScore ? `${c.awayGoals ?? 0}` : '';
  const pens = c.penalties && (c.penalties.home != null || c.penalties.away != null)
    ? `(${c.penalties.home ?? 0}–${c.penalties.away ?? 0} pen.)`
    : '';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(c.statusLabel)}">`,
    '<defs>',
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0%" stop-color="#0b1120"/><stop offset="100%" stop-color="#10182c"/>`,
    '</linearGradient>',
    `<linearGradient id="homeBand" x1="0" y1="0" x2="1" y2="0">`,
    `<stop offset="0%" stop-color="${c.homeColor}" stop-opacity="0.85"/>`,
    `<stop offset="100%" stop-color="${c.homeColor}" stop-opacity="0.05"/>`,
    '</linearGradient>',
    `<linearGradient id="awayBand" x1="1" y1="0" x2="0" y2="0">`,
    `<stop offset="0%" stop-color="${c.awayColor}" stop-opacity="0.85"/>`,
    `<stop offset="100%" stop-color="${c.awayColor}" stop-opacity="0.05"/>`,
    '</linearGradient>',
    '</defs>',
    // Fondo
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>`,
    // Bandas de color de cada club (diagonal sutil)
    `<polygon points="0,0 ${mid + 60},0 ${mid - 60},${H} 0,${H}" fill="url(#homeBand)"/>`,
    `<polygon points="${mid + 60},0 ${W},0 ${W},${H} ${mid - 60},${H}" fill="url(#awayBand)"/>`,
    // Línea central
    `<line x1="${mid}" y1="96" x2="${mid}" y2="${H - 150}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>`,
    // Cabecera: competición + marca
    `<text x="60" y="74" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#ffffff" fill-opacity="0.92">${c.competition || 'MANAGER FDF'}</text>`,
    `<text x="${W - 60}" y="74" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" letter-spacing="2" fill="#34d399">MANAGER&#160;FDF</text>`,
    // Escudos (círculo con color del club + glifo/iniciales centrado)
    `<circle cx="${mid / 2}" cy="218" r="84" fill="${c.homeColor}" fill-opacity="0.28" stroke="${c.homeAccent}" stroke-opacity="0.7" stroke-width="4"/>`,
    `<text x="${mid / 2}" y="248" text-anchor="middle" font-family="Arial, sans-serif" font-size="82" font-weight="800" fill="#ffffff">${c.homeBadge}</text>`,
    `<circle cx="${mid + mid / 2}" cy="218" r="84" fill="${c.awayColor}" fill-opacity="0.28" stroke="${c.awayAccent}" stroke-opacity="0.7" stroke-width="4"/>`,
    `<text x="${mid + mid / 2}" y="248" text-anchor="middle" font-family="Arial, sans-serif" font-size="82" font-weight="800" fill="#ffffff">${c.awayBadge}</text>`,
    // Nombres
    `<text x="${mid / 2}" y="370" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="800" fill="#ffffff">${c.homeName}</text>`,
    `<text x="${mid + mid / 2}" y="370" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="800" fill="#ffffff">${c.awayName}</text>`,
    // Marcador o "VS"
    c.showScore
      ? `<text x="${mid}" y="300" text-anchor="middle" font-family="Arial, sans-serif" font-size="160" font-weight="900" fill="#ffffff">${scoreText}<tspan fill="#34d399"> · </tspan>${awayScoreText}</text>`
      : `<text x="${mid}" y="285" text-anchor="middle" font-family="Arial, sans-serif" font-size="96" font-weight="900" fill="#ffffff" fill-opacity="0.85">VS</text>`,
    pens
      ? `<text x="${mid}" y="345" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#fbbf24">${pens}</text>`
      : '',
    // Etiqueta de estado
    `<rect x="${mid - 170}" y="398" width="340" height="44" rx="22" fill="#000000" fill-opacity="0.35"/>`,
    `<text x="${mid}" y="428" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="2" fill="#fbbf24">${escapeXml(c.statusLabel)}</text>`,
    // Banda inferior: MVP + minuto épico
    `<rect x="0" y="${H - 120}" width="${W}" height="120" fill="#000000" fill-opacity="0.45"/>`,
    c.mvp
      ? `<text x="60" y="${H - 70}" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">⭐ MVP: <tspan fill="#34d399" font-weight="800">${c.mvp}</tspan></text>`
      : `<text x="60" y="${H - 70}" font-family="Arial, sans-serif" font-size="28" font-weight="600" fill="#ffffff" fill-opacity="0.7">Túnel del Tiempo · revive el partido</text>`,
    c.epic
      ? `<text x="60" y="${H - 30}" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#fbbf24">⚡ Minuto ${c.epic.minute}'${c.epic.scorer ? ` — ${c.epic.scorer}` : ''}</text>`
      : '',
    // Pie: semilla auditable
    `<text x="${W - 60}" y="${H - 30}" text-anchor="end" font-family="monospace" font-size="20" fill="#ffffff" fill-opacity="0.45">seed#${escapeXml(c.seedHash)}</text>`,
    '</svg>',
  ].join('');
}

/**
 * Página HTML mínima con metadatos OpenGraph que apuntan a la imagen SVG y a la
 * URL del partido. Útil para compartir en redes que crawlean HTML (`?format=html`).
 */
export function buildOgHtml(card: MatchOgCard, origin: string): string {
  const imageUrl = `${origin}/api/matches/${card.meta.matchId}/og-image`;
  const matchUrl = `${origin}/matches/${card.meta.matchId}`;
  const title = escapeXml(card.meta.title);
  const desc = escapeXml(card.meta.description);
  return [
    '<!DOCTYPE html>',
    '<html lang="es"><head><meta charset="utf-8"/>',
    `<title>${title} · Manager FDF</title>`,
    `<meta name="description" content="${desc}"/>`,
    `<meta property="og:type" content="article"/>`,
    `<meta property="og:title" content="${title}"/>`,
    `<meta property="og:description" content="${desc}"/>`,
    `<meta property="og:image" content="${escapeXml(imageUrl)}"/>`,
    `<meta property="og:image:width" content="${OG_WIDTH}"/>`,
    `<meta property="og:image:height" content="${OG_HEIGHT}"/>`,
    `<meta property="og:url" content="${escapeXml(matchUrl)}"/>`,
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:title" content="${title}"/>`,
    `<meta name="twitter:description" content="${desc}"/>`,
    `<meta name="twitter:image" content="${escapeXml(imageUrl)}"/>`,
    `<meta http-equiv="refresh" content="0; url=${escapeXml(matchUrl)}"/>`,
    '</head><body>',
    `<img src="${escapeXml(imageUrl)}" alt="${title}" style="max-width:100%"/>`,
    `<p><a href="${escapeXml(matchUrl)}">${title}</a></p>`,
    '</body></html>',
  ].join('');
}
export function visiblePenalties(
  showScore: boolean,
  decidedBy: string | null,
  home: number | null,
  away: number | null,
): { home: number | null; away: number | null } | null {
  return showScore && decidedBy === 'penalties' ? { home, away } : null;
}
