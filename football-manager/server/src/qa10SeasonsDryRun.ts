/**
 * QA2 — Dry-run validación económica 5 temporadas.
 *
 * Sin BD: usa perfiles sintéticos de 708 clubes (basados en docs/data/leagues-2026.json)
 * y las mismas funciones de economía del tick real (tick.logic.ts).
 * Marca QA2 ✅ si ningún club top supera 500M de presupuesto tras 5 temporadas.
 */

import path from 'path';
import fs from 'fs';
import {
  gateIncome,
  commercialBreakdown,
  eliteLiquidityMaintenance,
  monthlySalaries,
  ClubFinanceInput,
} from './modules/game/tick.logic';

// ─── Parámetros de simulación ─────────────────────────────────────────────────
const SEASONS = 5;
const MONTHS_PER_SEASON = 10;  // liga activa: ago-may
const SALARY_RATIO = 0.62;     // masa salarial ≈ 62% de ingresos mensuales
const COACHING_RATIO = 0.08;   // staff técnico ≈ 8% de ingresos
const OUTSOURCING_RATIO = 0.05;
// Transferencias: un club gasta neto ~8% de su presupuesto/año en fichajes
const NET_TRANSFER_RATE = 0.08;

interface ClubProfile {
  name: string;
  reputation: number;   // 0-100
  budget: number;       // presupuesto inicial
  socialMass: number;
  stadiumCapacity: number;
  countryLevel: number; // 1=top 2=mid 3=low
  highClass: number;
}

// ─── Genera 708 perfiles representativos basados en el JSON de ligas ─────────
function generateClubProfiles(): ClubProfile[] {
  const leagues: ClubProfile[] = [];

  // Intentar cargar el JSON real; si no está accesible usar perfiles sintéticos
  const jsonPath = path.join(__dirname, '../../docs/data/leagues-2026.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const allLeagues: Array<{ leagueStrength: number; teams: Array<{ name?: string }> }> =
        data.leagues ?? [];
      for (const league of allLeagues) {
        const strength = Math.max(0, Math.min(100, league.leagueStrength ?? 50));
        const countryLevel = strength >= 75 ? 1 : strength >= 45 ? 2 : 3;
        const teams = league.teams ?? [];
        const n = teams.length;
        teams.forEach((team, i) => {
          const relPos = 1 - i / Math.max(1, n - 1);
          const rep = Math.round(strength * 0.7 + relPos * 30);
          const budget = Math.round(
            (strength / 100) * relPos * 80_000_000 + 5_000_000
          );
          leagues.push({
            name: (team as { name?: string }).name ?? `Club${leagues.length}`,
            reputation: Math.min(100, Math.max(10, rep)),
            budget,
            socialMass: Math.round(5_000 + rep * 1_800),
            stadiumCapacity: Math.round(5_000 + rep * 900),
            countryLevel,
            highClass: Math.round(100 + rep * 12),
          });
        });
      }
    } catch { /* fallback below */ }
  }

  if (leagues.length === 0) {
    // Perfiles sintéticos: 50 ligas × ~14 clubes = 700 clubes aprox.
    const ARCHETYPES = [
      { rep: 90, budget: 200_000_000, social: 100_000, cap: 80_000, lvl: 1, hc: 5_000 },
      { rep: 80, budget:  80_000_000, social:  60_000, cap: 55_000, lvl: 1, hc: 2_500 },
      { rep: 70, budget:  40_000_000, social:  35_000, cap: 35_000, lvl: 1, hc: 1_200 },
      { rep: 60, budget:  18_000_000, social:  20_000, cap: 20_000, lvl: 2, hc:   600 },
      { rep: 50, budget:   9_000_000, social:  12_000, cap: 12_000, lvl: 2, hc:   350 },
      { rep: 40, budget:   5_000_000, social:   7_000, cap:  8_000, lvl: 2, hc:   180 },
      { rep: 30, budget:   2_500_000, social:   4_000, cap:  5_000, lvl: 3, hc:    90 },
      { rep: 20, budget:   1_200_000, social:   2_000, cap:  3_000, lvl: 3, hc:    40 },
    ];
    for (let l = 0; l < 50; l++) {
      for (let c = 0; c < 14; c++) {
        const arch = ARCHETYPES[Math.min(c, ARCHETYPES.length - 1)];
        leagues.push({
          name: `Liga${l}C${c}`,
          reputation: arch.rep,
          budget: arch.budget,
          socialMass: arch.social,
          stadiumCapacity: arch.cap,
          countryLevel: arch.lvl,
          highClass: arch.hc,
        });
      }
    }
  }

  return leagues;
}

// ─── Simula N meses de economía para un club ──────────────────────────────────
function simulateClub(profile: ClubProfile, seasons: number): number {
  let budget = profile.budget;

  const financeInput: ClubFinanceInput = {
    stadiumCapacity: profile.stadiumCapacity,
    fans: profile.socialMass,
    socialMass: profile.socialMass,
    highClass: profile.highClass,
    reputation: profile.reputation,
    countryLevel: profile.countryLevel,
    ticketPriceLevel: profile.reputation >= 70 ? 'high' : profile.reputation >= 50 ? 'medium' : 'low',
  };

  for (let s = 0; s < seasons; s++) {
    for (let m = 0; m < MONTHS_PER_SEASON; m++) {
      const gate = gateIncome(financeInput);
      const commercial = commercialBreakdown(financeInput, 0).total;
      const income = gate + commercial;

      const playerSalaries = income * SALARY_RATIO;
      const coachSalaries = income * COACHING_RATIO;
      const outsourcing = income * OUTSOURCING_RATIO;

      const netMonth = income - playerSalaries - coachSalaries - outsourcing;
      budget += netMonth;

      // Elite liquidity maintenance (mensual)
      const eliteCost = eliteLiquidityMaintenance({ budget, reputation: profile.reputation });
      budget -= eliteCost;
    }

    // Transferencias netas por temporada (gasto en fichajes - ingresos por ventas)
    const transferNet = -budget * NET_TRANSFER_RATE * (0.5 + (profile.reputation / 200));
    budget += transferNet;

    // Caja nunca negativa (rescate de emergencia)
    budget = Math.max(budget, 0);
  }

  return budget;
}

// ─── Reporte por cuartiles ────────────────────────────────────────────────────
function quartileReport(label: string, values: number[]): void {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const max = sorted[sorted.length - 1];
  const min = sorted[0];
  const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const fmt = (v: number) => `${(v / 1_000_000).toFixed(1)}M`;

  console.log(`  ${label}:`);
  console.log(`    Min: ${fmt(min)}  Q1: ${fmt(q1)}  Median: ${fmt(median)}  Q3: ${fmt(q3)}  Max: ${fmt(max)}  Avg: ${fmt(avg)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== QA2 — Validación económica ${SEASONS} temporadas (DRY-RUN) ===\n`);

  const profiles = generateClubProfiles();
  console.log(`Clubes simulados: ${profiles.length}`);

  // Budgets iniciales
  const initialBudgets = profiles.map((p) => p.budget);
  console.log('\n--- Distribución INICIAL de presupuesto ---');
  quartileReport('Todos los clubes', initialBudgets);

  // Simular
  const finalBudgets = profiles.map((p) => simulateClub(p, SEASONS));

  console.log(`\n--- Distribución FINAL (tras ${SEASONS} temporadas) ---`);
  quartileReport('Todos los clubes', finalBudgets);

  // Cuartiles por reputación
  const byRep = (lo: number, hi: number) =>
    profiles
      .map((p, i) => ({ rep: p.reputation, budget: finalBudgets[i], name: p.name }))
      .filter((x) => x.rep >= lo && x.rep < hi);

  const q4 = byRep(75, 101);
  const q3 = byRep(50, 75);
  const q2 = byRep(30, 50);
  const q1 = byRep(0, 30);

  console.log('\n--- Por cuartil de reputación ---');
  if (q4.length) quartileReport(`Q4 rep≥75 (${q4.length} clubes)`, q4.map((x) => x.budget));
  if (q3.length) quartileReport(`Q3 rep 50-75 (${q3.length} clubes)`, q3.map((x) => x.budget));
  if (q2.length) quartileReport(`Q2 rep 30-50 (${q2.length} clubes)`, q2.map((x) => x.budget));
  if (q1.length) quartileReport(`Q1 rep<30 (${q1.length} clubes)`, q1.map((x) => x.budget));

  // Top 10 clubes
  const top10 = profiles
    .map((p, i) => ({ name: p.name, rep: p.reputation, final: finalBudgets[i], initial: p.budget }))
    .sort((a, b) => b.rep - a.rep)
    .slice(0, 10);

  console.log('\n--- Top 10 clubes por reputación ---');
  for (const c of top10) {
    const change = ((c.final - c.initial) / Math.max(1, c.initial) * 100).toFixed(0);
    console.log(`  ${c.name.padEnd(30)} rep:${c.rep}  ${(c.initial/1e6).toFixed(1)}M → ${(c.final/1e6).toFixed(1)}M  (${change}%)`);
  }

  // Verificación: ningún top club supera 500M
  const topOver500M = q4.filter((x) => x.budget > 500_000_000);
  const anyOver500M = finalBudgets.filter((b) => b > 500_000_000).length;

  console.log('\n=== RESULTADO QA2 ===');
  console.log(`Clubes > 500M total: ${anyOver500M}`);
  console.log(`Clubes Q4 (rep≥75) > 500M: ${topOver500M.length}`);

  if (topOver500M.length > 0) {
    console.log('\n⚠️  QA2 FALLA: hay clubes top con economía desbocada:');
    for (const c of topOver500M.slice(0, 5)) {
      console.log(`  ${c.name}: ${(c.budget/1e6).toFixed(1)}M`);
    }
    console.log('\nAcción: revisar eliteLiquidityMaintenance y el modelo de ingresos/gastos.');
    process.exit(1);
  } else {
    console.log('\n✅  QA2 PASS: distribución económica razonable. Ningún club top supera 500M.');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('Error en QA2 dry-run:', e);
  process.exit(1);
});
