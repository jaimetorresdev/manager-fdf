#!/usr/bin/env bash
# QB-ops · Despliegue de migraciones post-auditoría (staging/prod)
set -euo pipefail
cd "$(dirname "$0")/../server"

MIGRATIONS=(
  20260616180000_audit_backend_fixes
  20260616190000_scout_assignment_unique
  20260616200000_n4_3_youth_academy_legacy_attributes
  20260616210000_npc_coach_persistence
)

echo "== QB-ops: prisma migrate deploy =="
npx prisma migrate deploy

echo "== Migraciones aplicadas (esperadas): =="
for m in "${MIGRATIONS[@]}"; do
  test -d "prisma/migrations/${m}" && echo "  ✓ ${m}" || echo "  ? ${m} (no encontrada en disco)"
done

echo ""
echo "Post-deploy manual (Jaime/infra):"
echo "  fly secrets set ENGINE_API_KEY=<misma clave en Koyeb>"
echo "  Re-ejecutar barridos: npm run audit:x-determinism && npm run audit:x-security"
echo "  (ver docs/QB-OPS-RUNBOOK.md)"
