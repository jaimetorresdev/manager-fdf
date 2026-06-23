import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function run() {
  console.log('--- Setting up QA Human Account ---');
  const existing = await prisma.user.findUnique({ where: { username: 'qa_human' } });
  if (existing) {
    console.log('QA human already exists.');
    return;
  }

  const hash = await bcrypt.hash('123456', 10);
  const user = await prisma.user.create({
    data: {
      username: 'qa_human',
      email: 'qa@fdf.com',
      passwordHash: hash,
      role: 'manager',
    }
  });

  console.log('User created:', user.username);

  // Pick a free club (e.g. any club without a manager)
  const club = await prisma.club.findFirst({
    where: { manager: null },
    orderBy: { reputation: 'asc' } // pick a small club
  });

  if (!club) {
    console.log('No free club found!');
    process.exit(1);
  }

  const manager = await prisma.manager.create({
    data: {
      userId: user.id,
      name: 'QA Manager',
      clubId: club.id,
      reputation: 200,
      personality: 'Equilibrado',
      nationality: 'España',
    }
  });

  console.log('Manager created and assigned to club:', club.name);
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
