import { PrismaClient } from '@prisma/client';
import { gameService } from './modules/game/game.service';
import fs from 'fs';

const prisma = new PrismaClient();

async function runSimulation() {
  console.log('--- Starting 10-season QA simulation ---');
  let state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (!state) {
    console.error('No active game state found');
    process.exit(1);
  }

  const startYear = state.inGameDate.getUTCFullYear();
  const targetYear = 2029;
  
  console.log(`Current Date: ${state.inGameDate.toISOString()}`);
  console.log(`Target Year: ${targetYear}`);
  
  let currentYear = startYear;
  let ticks = 0;
  const reports = [];
  
  // Track previous year to catch season transitions
  let lastProcessedYear = startYear;
  
  while (currentYear < targetYear) {
    await gameService.processTick();
    state = await prisma.gameState.findFirst({ where: { isActive: true } });
    if (!state) {
        console.error('No state found after tick!');
        break;
    }
    
    currentYear = state.inGameDate.getUTCFullYear();
    ticks++;
    
    // Log progress
    if (ticks % 30 === 0) {
       console.log(`Simulated ${ticks} ticks. Current date: ${state.inGameDate.toISOString()}`);
    }
    
    // Catch year change = season ended
    if (currentYear > lastProcessedYear) {
      console.log(`\n--- SEASON FINISHED: ${lastProcessedYear} ---`);
      
      // Gather some stats:
      // Champions (team with most points in a tier-1 league).
      const table = await prisma.standing.findMany({
         where: { competition: { type: 'league', tier: 1 } },
         orderBy: { points: 'desc' },
         take: 1,
         include: { club: true }
      });
      const champion = table[0]?.club?.name || 'N/A';
      
      // Get some top clubs to check finances
      const clubs = await prisma.club.findMany({
         take: 5,
         orderBy: { reputation: 'desc' }
      });
      const finances = clubs.map(c => `${c.shortName}: ${(c.budget / 1_000_000).toFixed(1)}M (Rep: ${c.reputation})`);
      
      // Check average age
      const players = await prisma.player.findMany({
         select: { age: true }
      });
      const avgAge = players.length ? (players.reduce((a,b) => a + b.age, 0) / players.length).toFixed(1) : 'N/A';
      
      const report = `### End of Season ${lastProcessedYear}
- **Ticks so far:** ${ticks}
- **Champion (Top League):** ${champion}
- **Economy & Reputation (Top 5):** ${finances.join(', ')}
- **Average Player Age:** ${avgAge} years`;
      
      reports.push(report);
      console.log(report);
      
      lastProcessedYear = currentYear;
    }
  }
  
  console.log(`\nSimulation complete! Total ticks: ${ticks}. Final date: ${state?.inGameDate.toISOString()}`);
  
  const finalReport = `## QA Simulation Report: 10 Seasons\n\n` + reports.join('\n\n');
  fs.writeFileSync('./qa_report.md', finalReport);
  console.log('Saved preliminary QA report to qa_report.md');
  process.exit(0);
}

runSimulation().catch(e => {
  console.error(e);
  process.exit(1);
});
