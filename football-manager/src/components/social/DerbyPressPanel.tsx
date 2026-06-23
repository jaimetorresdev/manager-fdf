// I-16 · Tono pre-derbi (placeholder local; sin endpoint de prensa específico)
import { useState } from 'react';
import { Mic, Swords } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Tone = 'fire' | 'ice' | 'mindgames';

const TONES: { id: Tone; label: string; quote: string; narrative: string }[] = [
  {
    id: 'fire',
    label: 'Gasolina',
    quote: '«Vamos a quemar el césped. Ellos lo saben.»',
    narrative: 'La prensa local recoge un tono combativo: tu vestuario llega con la llama encendida y el rival lo notará en el primer duelo.',
  },
  {
    id: 'ice',
    label: 'Hielo',
    quote: '«Respeto al rival, pero el derbi se gana con cabeza fría.»',
    narrative: 'El relato dominante es de control emocional: evitas provocar y proyectas madurez ante un partido que puede decantarse por un detalle.',
  },
  {
    id: 'mindgames',
    label: 'Juego mental',
    quote: '«Ellos llevan la presión encima. Nosotros, el plan.»',
    narrative: 'Los titulares insinúan presión sobre el adversario: el narrador deportivo ya habla de un duelo psicológico antes del pitido inicial.',
  },
];

interface Props {
  rivalName?: string;
  tagline?: string;
}

export function DerbyPressPanel({ rivalName, tagline }: Props) {
  const { t } = useTranslation('common');
  const [tone, setTone] = useState<Tone | null>(null);
  const selected = TONES.find(t => t.id === tone);

  return (
    <div className="dp-panel">
      <style>{`
        .dp-panel{border-radius:14px;border:1px solid color-mix(in srgb,var(--red-danger) 40%,var(--border-color));
          background:linear-gradient(135deg,var(--bg-surface),color-mix(in srgb,var(--red-danger) 10%,var(--bg-surface)));
          padding:16px 18px;display:flex;flex-direction:column;gap:12px}
        .dp-head{display:flex;align-items:center;gap:10px}
        .dp-title{font-family:var(--font-display);font-weight:800;font-size:.88rem;text-transform:uppercase;letter-spacing:.8px}
        .dp-tones{display:flex;flex-wrap:wrap;gap:8px}
        .dp-tone{padding:6px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-elevated);
          font-size:.72rem;font-weight:700;cursor:pointer;transition:all .15s;color:var(--text-muted)}
        .dp-tone.on{border-color:var(--gold-accent);color:var(--gold-accent);
          background:color-mix(in srgb,var(--gold-accent) 12%,var(--bg-elevated))}
        .dp-quote{font-style:italic;font-size:.9rem;color:var(--text-primary);border-left:3px solid var(--red-danger);padding-left:12px}
        .dp-narr{font-size:.8rem;color:var(--text-muted);line-height:1.45}
      `}</style>
      <div className="dp-head">
        <Swords size={16} style={{ color: 'var(--red-danger)' }} />
        <Mic size={14} style={{ color: 'var(--gold-accent)' }} />
        <span className="dp-title">{t('Rueda de prensa pre-derbi')}</span>
      </div>
      {rivalName && (
        <p className="dp-narr" style={{ margin: 0 }}>
          {t('Ante')} <strong style={{ color: 'var(--text-primary)' }}>{rivalName}</strong>
          {tagline ? ` · ${tagline}` : ''} {t('— elige el mensaje que quieres que circule en la hemeroteca.')}
        </p>
      )}
      <div className="dp-tones">
        {TONES.map(t_item => (
          <button key={t_item.id} type="button" className={`dp-tone${tone === t_item.id ? ' on' : ''}`} onClick={() => setTone(t_item.id)}>
            {t(t_item.label)}
          </button>
        ))}
      </div>
      {selected && (
        <>
          <p className="dp-quote">{t(selected.quote)}</p>
          <p className="dp-narr">{t(selected.narrative)}</p>
        </>
      )}
    </div>
  );
}
