// ─── ensure-roles ─────────────────────────────────────────────────────────────
// Crea cuentas de staff solo si no existen y solo con passwords de entorno.
// Nunca reimpone rol ni password a cuentas existentes.
import bcrypt from 'bcryptjs';
import prisma from './prisma';
// AUDIT H-50: validación de contraseñas privilegiadas compartida con `db/seed.ts`
// (fuente única; ninguno reimplementa la regla).
import { resolveStaffPassword } from '../lib/privilegedPassword';

type StaffAccount = {
  label: string;
  envKey: 'MASTER_PASSWORD' | 'ADMIN_PASSWORD' | 'FIFA_PASSWORD';
  where: { email?: string; username?: string };
  create: { username: string; email: string; role: 'master' | 'admin' | 'agente_fifa' };
};

async function ensureStaffAccount(account: StaffAccount) {
  const existing = account.where.email
    ? await prisma.user.findUnique({ where: { email: account.where.email } })
    : await prisma.user.findUnique({ where: { username: account.where.username! } });
  if (existing) {
    console.log(`  ✅ ${account.label} ya existe; rol y contraseña preservados.`);
    return existing;
  }

  const password = resolveStaffPassword({
    label: account.label,
    envKey: account.envKey,
    role: account.create.role,
  });
  if (!password) return null;

  const created = await prisma.user.create({
    data: {
      ...account.create,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`  ✅ ${account.label} creado desde ${account.envKey}.`);
  return created;
}

async function ensureRoles() {
  await ensureStaffAccount({
    label: 'Master',
    envKey: 'MASTER_PASSWORD',
    where: { email: 'mitoh96@gmail.com' },
    create: { username: 'jaime', email: 'mitoh96@gmail.com', role: 'master' },
  });

  await ensureStaffAccount({
    label: 'Admin',
    envKey: 'ADMIN_PASSWORD',
    where: { username: 'admin' },
    create: { username: 'admin', email: 'admin@footballmanager.local', role: 'admin' },
  });

  await ensureStaffAccount({
    label: 'Agente FIFA',
    envKey: 'FIFA_PASSWORD',
    where: { username: 'agente_fifa_1' },
    create: { username: 'agente_fifa_1', email: 'fifa1@footballmanager.local', role: 'agente_fifa' },
  });
}

ensureRoles()
  .catch((e) => { console.error('ensure-roles error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
