import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// AUDIT H-28/H-29/H-30/H-26 — anti-regresión de integridad referencial a nivel de
// fuente (sin BD, para no fragilizar el gate `vitest run`). La verificación FUNCIONAL
// (constraints que rechazan filas inválidas) se hizo con `prisma migrate deploy` +
// inserts negativos sobre una BD PostgreSQL desechable; ver
// docs/cierres/AUDITORIA-FINAL-AGENTE-A.md.

const prismaDir = join(__dirname, '..', '..', 'prisma');
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationsDir = join(prismaDir, 'migrations');
const allMigrations = readdirSync(migrationsDir)
  .filter((d) => !d.endsWith('.toml'))
  .map((d) => readFileSync(join(migrationsDir, d, 'migration.sql'), 'utf8'))
  .join('\n');

describe('H-28 — FKs lógicas convertidas en relaciones reales (schema)', () => {
  it('Auction.winningClubId tiene relación real (AuctionWinner)', () => {
    expect(schema).toMatch(/winningClub\s+Club\?\s+@relation\("AuctionWinner"/);
  });
  it('TransferAgreement: offeredPlayer / proposerManager / counterpartyManager / parent', () => {
    expect(schema).toMatch(/offeredPlayer\s+Player\?\s+@relation\("AgreementOfferedPlayer"/);
    expect(schema).toMatch(/proposerManager\s+Manager\?\s+@relation\("AgreementProposer"/);
    expect(schema).toMatch(/counterpartyManager\s+Manager\?\s+@relation\("AgreementCounterparty"/);
    expect(schema).toMatch(/parent\s+TransferAgreement\?\s+@relation\("AgreementParent"/);
  });
  it('Club/Player/Manager tienen las back-relations correspondientes', () => {
    expect(schema).toMatch(/auctionsWon\s+Auction\[\]\s+@relation\("AuctionWinner"\)/);
    expect(schema).toMatch(/offeredInAgreements\s+TransferAgreement\[\]\s+@relation\("AgreementOfferedPlayer"\)/);
    expect(schema).toMatch(/proposedAgreements\s+TransferAgreement\[\]\s+@relation\("AgreementProposer"\)/);
  });
});

describe('H-29 — onDelete explícito en Competition/Matchday/Match/Standing', () => {
  it('Matchday.competition y Standing.competition/club son Cascade', () => {
    expect(schema).toMatch(/competition\s+Competition\s+@relation\(fields: \[competitionId\][^)]*onDelete: Cascade/);
    expect(schema).toMatch(/club\s+Club\s+@relation\(fields: \[clubId\][^)]*onDelete: Cascade/);
  });
  it('Competition.season es Cascade y Match.matchday es SetNull', () => {
    expect(schema).toMatch(/season\s+Season\s+@relation\(fields: \[seasonId\][^)]*onDelete: Cascade/);
    expect(schema).toMatch(/matchday\s+Matchday\?\s+@relation\(fields: \[matchdayId\][^)]*onDelete: SetNull/);
  });
});

describe('H-26 — integridad e idempotencia de DraftPick', () => {
  it('DraftPick tiene uniques [draftId,pickNumber] y [draftId,playerId]', () => {
    expect(schema).toMatch(/@@unique\(\[draftId, pickNumber\]\)/);
    expect(schema).toMatch(/@@unique\(\[draftId, playerId\]\)/);
  });
});

describe('Rivalry — par único canónico sin par invertido', () => {
  it('schema declara @@unique([clubAId, clubBId])', () => {
    expect(schema).toMatch(/@@unique\(\[clubAId, clubBId\]\)/);
  });
  it('la migración añade el CHECK de orden canónico (veta el par invertido)', () => {
    expect(allMigrations).toMatch(/Rivalry_canonical_order"\s+CHECK\s*\(\s*"clubAId"\s*<\s*"clubBId"\s*\)/);
  });
});

describe('GameState — garantía de un único estado activo', () => {
  it('la migración crea el índice único parcial WHERE isActive', () => {
    expect(allMigrations).toMatch(/GameState_single_active_key[\s\S]*WHERE\s+"isActive"/);
  });
});

describe('H-30 — índices de FK calientes presentes', () => {
  it('Matchday(competitionId), Auction(winningClubId)', () => {
    expect(schema).toMatch(/@@index\(\[competitionId\]\)/);
    expect(schema).toMatch(/@@index\(\[winningClubId\]\)/);
  });
});

describe('cadena de migraciones — idempotencia declarada (P0)', () => {
  it('la 210000 reducida usa guardas IF NOT EXISTS (no re-añade columnas de 200000)', () => {
    const m = readFileSync(
      join(migrationsDir, '20260619210000_audit_carril1_schema_contracts', 'migration.sql'),
      'utf8',
    );
    expect(m).toMatch(/ADD COLUMN IF NOT EXISTS/);
    expect(m).not.toMatch(/ADD COLUMN\s+"lastProgressTurn"/);
  });
});
