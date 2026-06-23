import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { publicApi } from '../api/client';
import { NpcCoachIdentity } from '../components/public/NpcCoachIdentity';
import { LiveEmptyState } from '../components/live';
import { NarrativePageHeader } from '../components/ui/NarrativePageHeader';

type NpcCoachProfile = {
  id: string;
  name: string;
  nationality?: string;
  clubId?: number;
  clubName?: string;
  pressLine?: string;
  tacticalStyle?: { favoriteFormation?: string; objective?: string };
  career?: {
    stage?: string;
    monthsInCharge?: number;
    previousClubs?: number;
    promotions?: number;
    history?: { clubName: string; event: string; note?: string | null; season?: string | null }[];
  };
};

export function NpcCoachPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<NpcCoachProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    publicApi.npcCoach(id).then(setData).catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <LiveEmptyState title={t('gameplay:npcCoach.notFound')} message={error} />;
  if (!data) return <p className="text-[var(--text-muted)] p-6">{t('gameplay:npcCoach.loading')}</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <NarrativePageHeader
        kicker={t('gameplay:npcCoach.kicker')}
        title={data.name}
        lede={data.clubName ? t('gameplay:npcCoach.lede', { club: data.clubName }) : t('gameplay:npcCoach.noClub')}
      />
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-6 space-y-4">
        <NpcCoachIdentity npcCoach={data} size={48} showFormation />
        {data.pressLine && <p className="text-sm italic text-[var(--text-muted)]">&ldquo;{data.pressLine}&rdquo;</p>}
        {data.career && (
          <div className="text-sm text-[var(--text-muted)] space-y-1">
            <p>{t('gameplay:npcCoach.stage')} <strong>{data.career.stage}</strong></p>
            {data.career.monthsInCharge != null && <p>{t('gameplay:npcCoach.monthsInCharge')} {data.career.monthsInCharge}</p>}
            {data.career.previousClubs != null && <p>{t('gameplay:npcCoach.previousClubs')} {data.career.previousClubs}</p>}
          </div>
        )}
        {data.clubId && (
          <Link to={`/club/${data.clubId}`} className="text-[var(--club-primary,var(--green-primary))] text-sm font-semibold">
            {t('gameplay:npcCoach.viewClub')}
          </Link>
        )}
      </div>
      {data.career?.history && data.career.history.length > 0 && (
        <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-6">
          <h2 className="font-display text-lg mb-4 uppercase tracking-wide">{t('gameplay:npcCoach.careerTitle')}</h2>
          <ul className="space-y-3">
            {data.career.history.map((entry, i) => (
              <li key={i} className="text-sm border-l-2 border-[var(--club-primary,var(--green-primary))] pl-3">
                <strong>{entry.clubName}</strong> · {entry.event}
                {entry.season && <span className="text-[var(--text-muted)]"> ({entry.season})</span>}
                {entry.note && <p className="text-[var(--text-muted)]">{entry.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
