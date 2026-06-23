import { useMemo } from 'react';
import { ArrowRight, Building2, DoorOpen, Megaphone, TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSession } from '../../stores/sessionStore';
import { useTranslation } from 'react-i18next';

interface PostMatchLockerProps {
  homeClubId?: number | null;
  awayClubId?: number | null;
  homeGoals: number;
  awayGoals: number;
  homeName: string;
  awayName: string;
  rivalryName?: string | null;
  meanMorale?: number | null;
}

export function PostMatchLocker({
  homeClubId, homeGoals, awayGoals, homeName, awayName, rivalryName, meanMorale,
}: PostMatchLockerProps) {
  const { t } = useTranslation('common');
  const { club } = useSession();

  const outcome = useMemo(() => {
    if (!club?.id) return null;
    const home = homeClubId === club.id;
    const gf = home ? homeGoals : awayGoals;
    const gc = home ? awayGoals : homeGoals;
    if (gf > gc) return 'win' as const;
    if (gf < gc) return 'loss' as const;
    return 'draw' as const;
  }, [club?.id, homeClubId, homeGoals, awayGoals]);

  if (!outcome) return null;

  const isBig = Boolean(rivalryName);
  const tone = outcome === 'win' ? 'var(--green-primary)' : outcome === 'loss' ? 'var(--red-danger)' : 'var(--gold-accent)';
  const Icon = outcome === 'win' ? TrendingUp : outcome === 'loss' ? TrendingDown : Minus;

  const copy = outcome === 'win'
    ? isBig
      ? t('El vestuario estalla en euforia. Habéis ganado el {{rivalry}} y el eco llega hasta la grada.', { rivalry: rivalryName ?? t('clásico') })
      : t('Victoria trabajada. El vestuario respira alivio y confianza para la siguiente cita.')
    : outcome === 'loss'
      ? isBig
        ? t('Silencio tenso tras caer en el {{rivalry}}. La prensa no perdonará, pero el grupo debe levantarse.', { rivalry: rivalryName ?? t('derbi') })
        : t('Derrota amarga. El cuerpo técnico pide calma y autocrítica antes del próximo entrenamiento.')
      : t('Empate que deja sabor agridulce. Nadie sale del vestuario del todo satisfecho.');

  const moraleHint = meanMorale != null
    ? meanMorale >= 75
      ? t('La moral del grupo aguanta el golpe y sigue alta.')
      : meanMorale >= 55
        ? t('La moral es frágil: conviene hablar con los líderes del vestuario.')
        : t('La moral está por los suelos. Riesgo de crisis interna si no reaccionáis.')
    : t('Revisad el estado anímico de la plantilla en el vestuario.');

  const signals = outcome === 'win'
    ? [
        { icon: Users, label: t('ux.postMatch.morale'), value: t('ux.postMatch.rising'), tone: 'var(--green-primary)' },
        { icon: Building2, label: t('ux.postMatch.board'), value: t('ux.postMatch.strengthened'), tone: 'var(--green-primary)' },
        { icon: Megaphone, label: t('ux.postMatch.fans'), value: t('ux.postMatch.excited'), tone: 'var(--gold-accent)' },
      ]
    : outcome === 'loss'
      ? [
          { icon: Users, label: t('ux.postMatch.morale'), value: t('ux.postMatch.fragile'), tone: 'var(--red-danger)' },
          { icon: Building2, label: t('ux.postMatch.board'), value: t('ux.postMatch.watching'), tone: 'var(--gold-accent)' },
          { icon: Megaphone, label: t('ux.postMatch.fans'), value: t('ux.postMatch.demanding'), tone: 'var(--red-danger)' },
        ]
      : [
          { icon: Users, label: t('ux.postMatch.morale'), value: t('ux.postMatch.stable'), tone: 'var(--gold-accent)' },
          { icon: Building2, label: t('ux.postMatch.board'), value: t('ux.postMatch.unchanged'), tone: 'var(--text-muted)' },
          { icon: Megaphone, label: t('ux.postMatch.fans'), value: t('ux.postMatch.divided'), tone: 'var(--gold-accent)' },
        ];

  return (
    <div className="relative overflow-hidden rounded-2xl border p-6"
      style={{ borderColor: `color-mix(in srgb, ${tone} 40%, var(--border-color))`, background: `linear-gradient(135deg, var(--bg-surface) 0%, color-mix(in srgb, ${tone} 12%, var(--bg-surface)) 100%)` }}>
      <div className="absolute inset-0 opacity-15 pointer-events-none"
        style={{ background: 'repeating-linear-gradient(90deg, transparent 0 40px, color-mix(in srgb, var(--border-color) 50%, transparent) 40px 41px)' }} />
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: tone }}>
          <DoorOpen size={14} /> {t('Camerino post-partido')}
        </div>
        <h3 className="font-display font-black text-xl text-[var(--text-primary)]">
          {outcome === 'win' ? t('Victoria') : outcome === 'loss' ? t('Derrota') : t('Empate')} · {homeName} {homeGoals}–{awayGoals} {awayName}
        </h3>
        <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-2xl">{copy}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {signals.map(({ icon: SignalIcon, label, value, tone: signalTone }) => (
            <div key={label} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-base)]/35 px-3 py-2.5 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg grid place-items-center bg-[var(--bg-elevated)]" style={{ color: signalTone }}>
                <SignalIcon size={15} />
              </span>
              <span className="min-w-0">
                <small className="block text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">{label}</small>
                <strong className="block mt-0.5 text-xs" style={{ color: signalTone }}>{value}</strong>
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3">
          <Icon size={16} style={{ color: tone, flexShrink: 0, marginTop: 2 }} />
          <span className="text-[var(--text-primary)]">{moraleHint}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest font-black text-[var(--gold-accent)]">{t('ux.postMatch.nowDecide')}</span>
          <Link to="/squad" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--green-primary)]">
            {t('ux.postMatch.reviewSquad')} <ArrowRight size={12} />
          </Link>
          <Link to="/training" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--green-primary)]">
            {t('ux.postMatch.adjustTraining')} <ArrowRight size={12} />
          </Link>
          <Link to="/news" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] text-xs font-bold text-[var(--text-primary)] hover:border-[var(--green-primary)]">
            {t('ux.postMatch.facePress')} <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}
