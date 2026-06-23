import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Target } from 'lucide-react';
import { Radar } from '../ui/Radar';
import { tacticsApi, playersApi, clubApi } from '../../api/client';

interface SquadPlayer {
  passing?: number; tackling?: number; shooting?: number; dribbling?: number;
  organization?: number; finishing?: number; unmarking?: number;
}

interface Props {
  clubId: number;
  npcFormation?: string | null;
  isOwnClub?: boolean;
}

function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 50;
}

function formationWidth(formation?: string | null): number {
  if (!formation) return 55;
  const parts = formation.split('-').map(Number).filter(n => !Number.isNaN(n));
  if (parts.length < 2) return 55;
  const mids = parts[1] ?? 4;
  const defs = parts[0] ?? 4;
  return Math.min(95, Math.max(25, 40 + mids * 6 + (defs <= 3 ? 12 : 0)));
}

export function ClubTacticalRadar({ clubId, npcFormation, isOwnClub }: Props) {
  const { t } = useTranslation();
  const [tactic, setTactic] = useState<any>(null);
  const [squad, setSquad] = useState<SquadPlayer[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (isOwnClub) {
      Promise.all([
        tacticsApi.getAll().catch(() => []),
        playersApi.getSquad().catch(() => []),
      ]).then(([tactics, players]) => {
        if (cancelled) return;
        const list = Array.isArray(tactics) ? tactics : [];
        const def = list.find((t: any) => t.isDefault) ?? list[0] ?? null;
        setTactic(def);
        setSquad(Array.isArray(players) ? players : []);
      });
    } else {
      clubApi.getPublicSquad(clubId)
        .then((players) => {
          if (!cancelled) setSquad(Array.isArray(players) ? players : []);
        })
        .catch(() => { if (!cancelled) setSquad([]); });
    }
    return () => { cancelled = true; };
  }, [clubId, isOwnClub]);

  const axes = useMemo(() => {
    const construction = tactic?.construction ?? 50;
    const destruction = tactic?.destruction ?? 50;
    const formation = tactic?.formation ?? npcFormation ?? '4-4-2';

    const press = destruction;
    const verticality = construction;
    const width = formationWidth(formation);
    const rhythm = avg(squad.map(p => p.dribbling ?? p.passing ?? 50));
    const defensiveLine = avg(squad.map(p => p.tackling ?? p.organization ?? 50));

    return [
      { label: 'PRESIÓN', value: press },
      { label: 'VERTICAL', value: verticality },
      { label: 'ANCHURA', value: width },
      { label: 'RITMO', value: rhythm },
      { label: 'LÍNEA', value: defensiveLine },
    ];
  }, [tactic, squad, npcFormation]);

  const label = tactic?.formation ?? npcFormation ?? t('gameplay:clubRadar.derivedStyle');

  return (
    <div className="p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)]">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-4">
        <Target size={14} className="text-[var(--green-primary)]" /> {t('gameplay:clubRadar.title')} · {label}
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <Radar axes={axes} size={200} color="var(--club-primary, var(--green-primary))" />
        <div className="text-xs text-[var(--text-muted)] space-y-2 max-w-xs">
          <p>{t('gameplay:clubRadar.description')}</p>
          {!isOwnClub && <p className="italic">{t('gameplay:clubRadar.publicEstimate')}</p>}
        </div>
      </div>
    </div>
  );
}
