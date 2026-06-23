import prisma from '../../db/prisma';
import { rumorsService } from './rumors.service';

type DeadlineTickerKind = 'transfer' | 'offer' | 'rumor' | 'auction' | 'system';

function nextWindowClose(now: Date): Date {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (month === 0) return new Date(Date.UTC(year, 0, 31, 23, 59, 59));
  if (month >= 6 && month <= 7) return new Date(Date.UTC(year, 7, 31, 23, 59, 59));
  return month < 6
    ? new Date(Date.UTC(year, 7, 31, 23, 59, 59))
    : new Date(Date.UTC(year + 1, 0, 31, 23, 59, 59));
}

function isWindowOpen(now: Date): boolean {
  const month = now.getUTCMonth();
  return month === 0 || month === 6 || month === 7;
}

function hoursUntil(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 3_600_000);
}

function money(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${Math.round(n)}€`;
}

function tickerItem(input: {
  id: string;
  kind: DeadlineTickerKind;
  urgency: 'low' | 'medium' | 'high' | 'panic';
  text: string;
  route?: string;
  ts?: Date;
  meta?: Record<string, unknown>;
}) {
  return {
    id: input.id,
    kind: input.kind,
    urgency: input.urgency,
    text: input.text,
    route: input.route ?? null,
    ts: (input.ts ?? new Date(0)).toISOString(),
    meta: input.meta ?? {},
  };
}

export const deadlineService = {
  async getDeadlineDay(clubId: number | null) {
    const state = await prisma.gameState.findFirst({
      where: { isActive: true },
      select: { inGameDate: true, seasonWeek: true, seasonId: true },
    });
    const now = state?.inGameDate ?? new Date();
    const closesAt = nextWindowClose(now);
    const hoursRemaining = hoursUntil(now, closesAt);
    const open = isWindowOpen(now);
    const active = open && hoursRemaining <= 24;
    const phase = !open ? 'closed' : active ? 'deadline_day' : 'window_open';
    const urgency = !active ? 'low' : hoursRemaining <= 2 ? 'panic' : hoursRemaining <= 6 ? 'high' : 'medium';

    const auctionStore = (prisma as typeof prisma & { auction?: any }).auction;
    const [offers, recentTransfers, expiringAuctions, rumorsPayload] = await Promise.all([
      prisma.transferOffer.findMany({
        where: {
          status: { in: ['pending', 'agent_proposed', 'accepted_pending_window'] },
          ...(clubId ? { OR: [{ fromClubId: clubId }, { toClubId: clubId }, { player: { clubId } }] } : {}),
        },
        orderBy: { updatedAt: 'desc' },
        take: 12,
        select: {
          id: true,
          amount: true,
          status: true,
          updatedAt: true,
          player: { select: { id: true, name: true, position: true } },
          fromClub: { select: { id: true, shortName: true } },
          toClub: { select: { id: true, shortName: true } },
        },
      }),
      prisma.transferOffer.findMany({
        where: {
          status: { in: ['accepted', 'accepted_pending_window'] },
          updatedAt: { gte: new Date(now.getTime() - 48 * 3_600_000) },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          amount: true,
          updatedAt: true,
          player: { select: { id: true, name: true, position: true } },
          fromClub: { select: { id: true, shortName: true } },
          toClub: { select: { id: true, shortName: true } },
        },
      }),
      auctionStore
        ? auctionStore.findMany({
            where: { status: 'active', endsAt: { lte: new Date(Date.now() + 24 * 3_600_000) } },
            orderBy: { endsAt: 'asc' },
            take: 12,
            include: {
              player: { select: { id: true, name: true, position: true, marketValue: true } },
              sellerClub: { select: { id: true, shortName: true, badge: true } },
              bids: { orderBy: [{ amount: 'desc' }, { createdAt: 'asc' }], take: 1, include: { manager: { select: { clubId: true } } } },
            },
          })
        : Promise.resolve([]),
      rumorsService.getRumors().catch(() => ({ weekKey: '', rumors: [] })),
    ]);

    const ticker = [
      tickerItem({
        id: `dd-system-${state?.seasonId ?? 0}-${state?.seasonWeek ?? 0}`,
        kind: 'system',
        urgency,
        text: active
          ? `Deadline Day activo: quedan ${Math.ceil(hoursRemaining)} h para el cierre.`
          : open
            ? `Mercado abierto: faltan ${Math.ceil(hoursRemaining)} h para el cierre.`
            : 'Mercado cerrado: el próximo cierre se mostrará al abrir la ventana.',
        route: '/market',
        ts: now,
      }),
      ...recentTransfers.map((offer) => tickerItem({
        id: `dd-transfer-${offer.id}`,
        kind: 'transfer',
        urgency: 'medium',
        text: `${offer.player.name} cambia de club por ~${money(offer.amount)}.`,
        route: `/player/${offer.player.id}`,
        ts: offer.updatedAt,
        meta: { playerId: offer.player.id, fromClub: offer.fromClub.shortName, toClub: offer.toClub?.shortName ?? null },
      })),
      ...offers.map((offer) => tickerItem({
        id: `dd-offer-${offer.id}`,
        kind: 'offer',
        urgency: offer.status === 'accepted_pending_window' ? 'high' : 'medium',
        text: `${offer.fromClub.shortName} aprieta por ${offer.player.name} (~${money(offer.amount)}).`,
        route: `/player/${offer.player.id}`,
        ts: offer.updatedAt,
        meta: { offerId: offer.id, status: offer.status },
      })),
      ...expiringAuctions.map((auction: any) => tickerItem({
        id: `dd-auction-${auction.id}`,
        kind: 'auction',
        urgency: new Date(auction.endsAt).getTime() - Date.now() <= 2 * 3_600_000 ? 'panic' : 'high',
        text: `Subasta caliente: ${auction.player.name} termina pronto (${money(auction.bids?.[0]?.amount ?? auction.startPrice)}).`,
        route: `/auction/${auction.id}`,
        ts: auction.updatedAt,
        meta: { auctionId: auction.id, playerId: auction.player.id, endsAt: auction.endsAt },
      })),
      ...rumorsPayload.rumors.slice(0, 5).map((rumor) => tickerItem({
        id: `dd-rumor-${rumor.id}`,
        kind: 'rumor',
        urgency: rumor.confidence >= 0.9 ? 'high' : 'medium',
        text: rumor.headline,
        route: rumor.player ? `/player/${rumor.player.id}` : '/market',
        ts: now,
        meta: { rumorId: rumor.id, kind: rumor.kind },
      })),
    ].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 30);

    const panicIndex = active
      ? Math.min(100, Math.round((24 - hoursRemaining) * 3 + offers.length * 3 + expiringAuctions.length * 5))
      : 0;

    return {
      status: { active, phase, closesAt, hoursRemaining: Math.round(hoursRemaining * 10) / 10, panicIndex },
      ticker,
      expiringAuctions: expiringAuctions.map((auction: any) => ({
        id: auction.id,
        endsAt: auction.endsAt,
        currentBid: auction.bids?.[0]?.amount ?? auction.startPrice,
        winningClubId: auction.bids?.[0]?.manager?.clubId ?? null,
        sellerClub: auction.sellerClub,
        player: auction.player,
        ws: `/ws/auction/${auction.id}`,
      })),
      ws: {
        market: '/ws/chat/market',
        club: clubId ? `/ws/club/${clubId}` : null,
      },
    };
  },
};
