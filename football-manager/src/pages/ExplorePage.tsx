// ─── ExplorePage — vista pública del mapamundi (I-35) ─────────────────────────
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PublicShell } from '../components/layout/PublicShell';
import { WorldExplorer } from '../components/public/WorldExplorer';

export function ExplorePage() {
  const { t } = useTranslation('common');
  return (
    <PublicShell title={t('Explorar el universo FDF')}>
      <p className="text-sm text-[var(--text-muted)] mb-6 max-w-2xl">
        {t('Navega ligas, países y clasificaciones sin cuenta. Para gestionar un club,')}{' '}
        <Link to="/register" className="text-[var(--green-primary)] font-bold hover:underline">{t('regístrate gratis')}</Link>.
      </p>
      <WorldExplorer />
    </PublicShell>
  );
}
