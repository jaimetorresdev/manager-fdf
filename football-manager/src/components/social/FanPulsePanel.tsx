import { MessageSquare, Flame, Users } from 'lucide-react';
import { Card } from '../ui';
import { useTranslation } from 'react-i18next';

interface Props {
  reputation: number;
  lowPct: number;
  moodData?: { mood: string; score: number; reasons: string[] } | null;
}

export function FanPulsePanel({ reputation, lowPct, moodData }: Props) {
  const { t } = useTranslation('common');
  // Determinar el estado de ánimo general
  const isHappy = moodData?.mood === 'green' || (!moodData && reputation >= 60);
  const isAngry = moodData?.mood === 'red' || (!moodData && (lowPct >= 45 || reputation < 40));

  const chants = isHappy
    ? [t('"¡Este año sí, campeones!"'), t('"¡Directiva, directiva, os queremos!"')]
    : isAngry
    ? [t('"¡Jugadores mercenarios!"'), t('"¡La camiseta no se mancha!"')]
    : [t('"¡Echale huevos!"'), t('"Mucho toque, poco gol..."')];

  const banners = isHappy
    ? [t('Confiamos en el proyecto'), t('Europa nos espera')]
    : isAngry
    ? [t('Dimisión ya'), t('Respetad el escudo')]
    : [t('Más intensidad'), t('Queremos resultados')];

  const trending = isHappy
    ? [t('#RenovaciónYa'), t('#OrgulloLocal')]
    : isAngry
    ? [t('#FueraMister'), t('#DirectivaDimision')]
    : [t('#Paciencia'), t('#FaltaGol')];

  return (
    <Card className="p-4" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] pb-3">
        <MessageSquare size={16} className="text-[var(--blue-info)]" />
        <h3 className="font-display font-bold text-sm uppercase tracking-wide">{t('El Pulso de la Grada')}</h3>
        {moodData && (
          <span className={`ml-auto font-bold text-xs px-2 py-1 rounded ${
            isHappy ? 'bg-[var(--green-primary)] text-[var(--bg-base)]' :
            isAngry ? 'bg-[var(--red-danger)] text-[var(--bg-base)]' :
            'bg-[var(--gold-accent)] text-[var(--bg-base)]'
          }`}>
            {isHappy ? t('Euforia') : isAngry ? t('Tensión') : t('Tranquilidad')} ({moodData.score})
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Cánticos o Razones */}
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">
            {moodData?.reasons && moodData.reasons.length > 0 ? t('Lo que se comenta') : t('Cánticos en la grada')}
          </p>
          <div className="space-y-1">
            {moodData?.reasons && moodData.reasons.length > 0 ? moodData.reasons.map((r, i) => (
              <div key={i} className="text-sm italic text-[var(--text-primary)] bg-[var(--bg-elevated)] p-2 rounded-md border border-[var(--border-color)]">
                "{r}"
              </div>
            )) : chants.map((c, i) => (
              <div key={i} className="text-sm italic text-[var(--text-primary)] bg-[var(--bg-elevated)] p-2 rounded-md border border-[var(--border-color)]">
                {c}
              </div>
            ))}
          </div>
        </div>

        {/* Pancartas */}
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">{t('Pancartas en el estadio')}</p>
          <div className="space-y-1">
            {banners.map((b, i) => (
              <div key={i} className="text-sm font-bold text-center text-[var(--bg-surface)] bg-[var(--text-primary)] p-2 rounded-md uppercase tracking-wide border-2 border-dashed border-[var(--bg-surface)]">
                {b}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-4 border-t border-[var(--border-color)] pt-4">
        {/* Termómetro de presión */}
        <div>
          <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
            <Flame size={12} /> {t('Presión al Entrenador')}
          </p>
          <div className="h-2 w-full bg-[var(--bg-elevated)] rounded-full overflow-hidden">
            <div 
              className="h-full" 
              style={{ 
                width: `${Math.max(10, 100 - (moodData?.score ?? reputation))}%`, 
                backgroundColor: isAngry ? 'var(--red-danger)' : 'var(--gold-accent)' 
              }} 
            />
          </div>
          <p className="text-xs mt-1 text-right text-[var(--text-muted)]">{Math.max(10, 100 - (moodData?.score ?? reputation))}%</p>
        </div>

        {/* Trending Topics */}
        <div>
          <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
            <Users size={12} /> {t('Redes Sociales')}
          </p>
          <div className="flex gap-2 flex-wrap">
            {trending.map((t, i) => (
              <span key={i} className="text-xs text-[var(--blue-info)] font-mono">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
