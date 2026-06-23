// ─── PublicManualPage — manual accesible sin sesión (I-35) ────────────────────
import { PublicShell } from '../components/layout/PublicShell';
import { ManualPage } from './ManualPage';

export function PublicManualPage() {
  return (
    <PublicShell title="Manual oficial del mánager">
      <ManualPage />
    </PublicShell>
  );
}
