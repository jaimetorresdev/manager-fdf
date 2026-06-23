// ─── QW-8 · Rumorómetro ──────────────────────────────────────────────────────
// GET /api/market/rumors — señales 🔥👀💰🧊 derivadas de datos reales
// (transferibles, ofertas vivas, clubes ricos vs posiciones débiles, contratos
// por vencer) mezcladas con ruido plausible por plantillas. Mezcla DETERMINISTA
// por semana in-game (misma semana = mismos rumores para todos). El campo
// `confidence` es interno: el front NO debe mostrarlo en crudo.
import prisma from '../../db/prisma';

type Rumor = {
  id: string;
  icon: '🔥' | '👀' | '💰' | '🧊';
  headline: string;
  player: { id: number; name: string; position: string } | null;
  club: { id: number; shortName: string } | null;
  kind: 'transferible' | 'oferta' | 'interes' | 'contrato' | 'ruido';
  confidence: number; // interno (0-1): real alto, ruido bajo
};

const MAX_RUMORS = 20;
const IDEAL_DEPTH: Record<string, number> = { POR: 2, DEF: 6, MED: 6, DEL: 4 };

function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** PRNG determinista (mulberry32) sembrado por semana: el rumorómetro es estable entre ticks. */
function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const NOISE_TEMPLATES: Array<(p: string, c: string) => string> = [
  (p: string, c: string) => `Un intermediario habría ofrecido a ${p} por media Europa. En ${c} lo niegan.`,
  (p: string) => `${p} habría sido visto cenando con directivos. ¿Cambio de aires?`,
  (p: string, c: string) => `El entorno de ${p} deja caer que "escucharía ofertas". En ${c}, silencio.`,
  (p: string, c: string) => `Una emisora local asegura que ${c} prepara una venta sonada. ${p} suena en las quinielas.`,
  (p: string, c: string) => `${p} no celebró su último gol. La grada de ${c} saca conclusiones.`,
];

export const rumorsService = {
  async getRumors() {
    const state = await prisma.gameState.findFirst({
      where: { isActive: true },
      select: { seasonId: true, seasonWeek: true },
    });
    const weekKey = `s${state?.seasonId ?? 0}-w${state?.seasonWeek ?? 0}`;
    const rand = seededRandom(hashString(weekKey));
    const rumors: Rumor[] = [];

    const humanClubIds = (await prisma.manager.findMany({
      where: { clubId: { not: null } },
      select: { clubId: true },
    })).map((m) => m.clubId as number);

    const playerSelect = {
      id: true, name: true, position: true, marketValue: true,
      club: { select: { id: true, shortName: true } },
    } as const;

    const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const [forSale, activeOffers, richClubs, expiring] = await Promise.all([
      // 🔥 transferibles (prioridad a clubes humanos)
      prisma.player.findMany({
        where: { isForSale: true, clubId: { not: null } },
        select: playerSelect,
        orderBy: { marketValue: 'desc' },
        take: 30,
      }),
      // 💰 ofertas vivas
      prisma.transferOffer.findMany({
        where: { status: 'pending' },
        select: {
          id: true,
          amount: true,
          player: { select: { id: true, name: true, position: true } },
          fromClub: { select: { id: true, shortName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      // 👀 clubes ricos (para cruzar con posiciones débiles)
      prisma.club.findMany({
        orderBy: { budget: 'desc' },
        take: 8,
        select: {
          id: true, shortName: true, budget: true,
          players: { select: { position: true } },
        },
      }),
      // 🧊 contratos por vencer
      prisma.player.findMany({
        where: { clubId: { not: null }, contractEndAt: { lte: oneYear, gte: new Date(0) } },
        select: playerSelect,
        orderBy: { marketValue: 'desc' },
        take: 20,
      }),
    ]);

    const humanSet = new Set(humanClubIds);

    // 🔥 Transferibles
    for (const p of forSale) {
      if (!p.club) continue;
      const human = humanSet.has(p.club.id);
      rumors.push({
        id: `r-sale-${p.id}`,
        icon: '🔥',
        headline: human
          ? `BOMBAZO: el ${p.club.shortName} pone a ${p.name} en el escaparate.`
          : `${p.name} está en el mercado. El ${p.club.shortName} escucha ofertas.`,
        player: { id: p.id, name: p.name, position: p.position },
        club: p.club,
        kind: 'transferible',
        confidence: human ? 0.95 : 0.85,
      });
    }

    // 💰 Ofertas vivas (sin revelar el importe exacto: rango)
    for (const o of activeOffers) {
      const rounded = o.amount >= 1_000_000
        ? `${Math.round(o.amount / 1_000_000)}M`
        : `${Math.round(o.amount / 1000)}K`;
      rumors.push({
        id: `r-offer-${o.id}`,
        icon: '💰',
        headline: `El ${o.fromClub.shortName} habría puesto ~${rounded} sobre la mesa por ${o.player.name}.`,
        player: o.player,
        club: o.fromClub,
        kind: 'oferta',
        confidence: 0.9,
      });
    }

    // 👀 Clubes ricos con posiciones débiles
    for (const club of richClubs) {
      const counts = new Map<string, number>();
      for (const p of club.players) counts.set(p.position, (counts.get(p.position) ?? 0) + 1);
      for (const [position, ideal] of Object.entries(IDEAL_DEPTH)) {
        if ((counts.get(position) ?? 0) < ideal) {
          rumors.push({
            id: `r-need-${club.id}-${position}`,
            icon: '👀',
            headline: `El ${club.shortName} rastrea el mercado de ${position}: tiene caja y le falta gente atrás del puesto.`,
            player: null,
            club: { id: club.id, shortName: club.shortName },
            kind: 'interes',
            confidence: 0.7,
          });
          break; // un rumor por club rico
        }
      }
    }

    // 🧊 Contratos por vencer
    for (const p of expiring.slice(0, 8)) {
      if (!p.club) continue;
      rumors.push({
        id: `r-contract-${p.id}`,
        icon: '🧊',
        headline: `${p.name} acaba contrato y el ${p.club.shortName} no mueve ficha. Los agentes toman nota.`,
        player: { id: p.id, name: p.name, position: p.position },
        club: p.club,
        kind: 'contrato',
        confidence: 0.8,
      });
    }

    // 🌫️ Ruido plausible (marcado internamente con confidence baja)
    const noiseCandidates = [...forSale, ...expiring].filter((p) => p.club);
    const noiseCount = Math.min(4, noiseCandidates.length);
    for (let i = 0; i < noiseCount; i++) {
      const p = noiseCandidates[Math.floor(rand() * noiseCandidates.length)];
      if (!p?.club) continue;
      const template = NOISE_TEMPLATES[Math.floor(rand() * NOISE_TEMPLATES.length)];
      const icons: Array<Rumor['icon']> = ['👀', '🔥', '🧊'];
      rumors.push({
        id: `r-noise-${weekKey}-${i}-${p.id}`,
        icon: icons[Math.floor(rand() * icons.length)],
        headline: template(p.name, p.club.shortName),
        player: { id: p.id, name: p.name, position: p.position },
        club: p.club,
        kind: 'ruido',
        confidence: 0.15,
      });
    }

    // Mezcla determinista por semana y recorte
    const shuffled = rumors
      .map((r) => ({ r, sort: rand() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ r }) => r)
      .slice(0, MAX_RUMORS);

    return { weekKey, rumors: shuffled };
  },
};
