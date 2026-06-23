import prisma from '../../db/prisma';
import { calcSponsorYearlyIncome, clubValuation } from '../game/tick.logic';

type KitKind = 'home' | 'away' | 'third';

interface KitDesignInput {
  kind: KitKind;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  pattern?: string;
  sponsorName?: string;
}

interface SponsorRenegotiateInput {
  tier: 'A' | 'B' | 'C';
  years: number;
  sponsorName?: string;
}

const DEFAULT_KITS: Record<KitKind, Omit<KitDesignInput, 'kind'>> = {
  home:  { primaryColor: '#1B5FBF', secondaryColor: '#FFFFFF', accentColor: '#E7C65A', pattern: 'classic' },
  away:  { primaryColor: '#FFFFFF', secondaryColor: '#10161D', accentColor: '#39D982', pattern: 'clean' },
  third: { primaryColor: '#10161D', secondaryColor: '#39D982', accentColor: '#E7C65A', pattern: 'retro' },
};

function parseKitDesign(clubKit: any): KitDesignInput | null {
  if (!clubKit || !clubKit.colors) return null;
  try {
    const colors = JSON.parse(clubKit.colors);
    return {
      kind: clubKit.kind as KitKind,
      primaryColor: colors.primaryColor,
      secondaryColor: colors.secondaryColor,
      accentColor: colors.accentColor,
      pattern: clubKit.pattern,
      sponsorName: clubKit.sponsorName,
    };
  } catch {
    return null;
  }
}

function valuationFor(club: { socialMass: number; highClass: number; countryLevel: number; reputation: number; fdfValuation: number }) {
  return Math.max(
    club.fdfValuation,
    clubValuation(club.socialMass, club.highClass, club.countryLevel, club.reputation),
  );
}

export const clubKitsService = {
  async getKits(clubId: number) {
    const [club, kitSponsor, clubKits] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        select: {
          id: true,
          name: true,
          shortName: true,
          badge: true,
          reputation: true,
          fdfValuation: true,
          socialMass: true,
          highClass: true,
          countryLevel: true,
          sponsors: {
            where: { type: 'kit' },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.sponsorContract.findFirst({
        where: { clubId, type: 'kit' },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.clubKit.findMany({
        where: { clubId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!club) throw new Error('Club not found');

    const latestByKind = new Map<KitKind, KitDesignInput>();
    for (const kit of clubKits) {
      const design = parseKitDesign(kit);
      if (design && !latestByKind.has(design.kind)) latestByKind.set(design.kind, design);
    }

    const sponsor = kitSponsor ?? club.sponsors[0] ?? null;
    const sponsorName = sponsor ? `FDF ${sponsor.type.toUpperCase()}` : 'Sin sponsor';
    const kits = (Object.keys(DEFAULT_KITS) as KitKind[]).map((kind) => {
      const design = latestByKind.get(kind) ?? { kind, ...DEFAULT_KITS[kind] };
      return {
        ...design,
        sponsorName: design.sponsorName ?? sponsorName,
        persisted: latestByKind.has(kind),
      };
    });

    return {
      club: { id: club.id, name: club.name, shortName: club.shortName, badge: club.badge },
      sponsor: sponsor
        ? {
            id: sponsor.id,
            type: sponsor.type,
            years: sponsor.years,
            percentage: sponsor.percentage,
            yearlyIncome: sponsor.yearlyIncome,
            createdAt: sponsor.createdAt,
          }
        : null,
      kits,
      storage: 'db-clubkit',
    };
  },

  async renegotiateSponsor(clubId: number, input: SponsorRenegotiateInput) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        reputation: true,
        fdfValuation: true,
        socialMass: true,
        highClass: true,
        countryLevel: true,
      },
    });
    if (!club) throw new Error('Club not found');

    const years = Math.max(1, Math.min(3, Math.floor(input.years)));
    const valuation = valuationFor(club);
    const yearlyIncome = calcSponsorYearlyIncome(valuation, 'kit', input.tier);
    const percentage = yearlyIncome / Math.max(1, valuation);

    const existing = await prisma.sponsorContract.findFirst({
      where: { clubId, type: 'kit' },
      orderBy: { createdAt: 'desc' },
    });

    const sponsor = existing
      ? await prisma.sponsorContract.update({
          where: { id: existing.id },
          data: { years, percentage, yearlyIncome },
        })
      : await prisma.sponsorContract.create({
          data: { clubId, type: 'kit', years, percentage, yearlyIncome },
        });

    return {
      ok: true,
      sponsor,
      sponsorName: input.sponsorName ?? `FDF Kit ${input.tier}`,
      message: `Patrocinio de equipación renegociado por ${Math.round(yearlyIncome).toLocaleString('es-ES')} €/año.`,
    };
  },

  async saveDesign(clubId: number, userId: number, input: KitDesignInput) {
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true, name: true } });
    if (!club) throw new Error('Club not found');

    const colors = JSON.stringify({
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      accentColor: input.accentColor,
    });

    await prisma.clubKit.create({
      data: {
        clubId,
        kind: input.kind,
        colors,
        pattern: input.pattern ?? 'classic',
        sponsorName: input.sponsorName,
      },
    });

    return { ok: true, clubId, design: input, persisted: true, storage: 'db-clubkit' };
  },
};
