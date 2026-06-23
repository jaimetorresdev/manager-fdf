#!/bin/sh
# ─── Entrypoint del backend ──────────────────────────────────────────────────
# - En producción aplica migraciones versionadas (prisma migrate deploy).
# - En desarrollo sincroniza el schema (prisma db push) para iterar rápido.
# - En producción no ejecuta seed/ensure-roles salvo flags explícitos:
#   RUN_DB_SEED=true y/o ENSURE_STAFF_ROLES=true.
set -eu

NODE_ENV=${NODE_ENV:-production}

echo "▶ Manager FDF backend (NODE_ENV=$NODE_ENV)"

if [ "$NODE_ENV" = "production" ]; then
  echo "▶ Aplicando migraciones versionadas (prisma migrate deploy)…"
  npx prisma migrate deploy
else
  echo "▶ Sincronizando schema en desarrollo (prisma db push)…"
  # --accept-data-loss: en DEV se itera con db push; sin el flag, AÑADIR una
  # constraint @unique nueva aborta (Prisma avisa de posible pérdida aunque NO
  # haya duplicados). Las migraciones versionadas (prod) sí dedup-ean primero.
  npx prisma db push --skip-generate --accept-data-loss
fi

USER_COUNT=$(node - <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.count()
  .then((n) => { console.log(n); })
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
NODE
)

SHOULD_SEED=false
if [ "$NODE_ENV" != "production" ] && [ "$USER_COUNT" = "0" ]; then
  SHOULD_SEED=true
elif [ "$NODE_ENV" = "production" ] && [ "${RUN_DB_SEED:-false}" = "true" ] && [ "$USER_COUNT" = "0" ]; then
  SHOULD_SEED=true
fi

if [ "$SHOULD_SEED" = "true" ]; then
  echo "▶ Base de datos vacía → ejecutando seed…"
  npm run db:seed
else
  echo "▶ Seed omitido (usuarios=$USER_COUNT, RUN_DB_SEED=${RUN_DB_SEED:-false})."
fi

if [ "$NODE_ENV" != "production" ] || [ "${ENSURE_STAFF_ROLES:-false}" = "true" ]; then
  echo "▶ Asegurando cuentas de staff desde env (sin reimponer existentes)…"
  npm run db:ensure-roles || echo "  (aviso) ensure-roles falló, continúo"
else
  echo "▶ ensure-roles omitido en producción (usa ENSURE_STAFF_ROLES=true para ejecutarlo)."
fi

echo "▶ Arrancando servidor en puerto ${API_PORT:-3001}…"
exec npm start
