import { useState } from 'react';
import { Mic, ChevronRight, Loader2 } from 'lucide-react';
import { pressApi } from '../../api/client';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

export interface PressQuestion {
  questionId: number;
  matchId: number;
  context: string;
  question: string;
  score?: { home: number; away: number };
  createdAt: string;
  choices: {
    id: string;
    label: string;
    text: string;
    effects?: { morale?: number; fans?: number; reputation?: number };
  }[];
}

interface Props {
  item: PressQuestion;
  onAnswered: (questionId: number) => void;
}

export function PressCard({ item, onAnswered }: Props) {
  const { t } = useTranslation('common');
  const [answering, setAnswering] = useState<string | null>(null);

  const handleAnswer = async (choiceId: string) => {
    if (answering) return;
    setAnswering(choiceId);
    try {
      await pressApi.answer(item.questionId, choiceId);
      toast.success(t('Rueda de prensa completada'));
      onAnswered(item.questionId);
    } catch (e: any) {
      toast.error(e.message ?? t('Error al responder'));
      setAnswering(null);
    }
  };

  const getToneColor = (id: string) => {
    if (id === 'aggressive') return 'var(--red-danger)';
    if (id === 'humble') return 'var(--green-primary)';
    if (id === 'arrogant') return 'var(--violet-accent)';
    if (id === 'protective') return 'var(--blue-info)';
    return 'var(--gold-accent)';
  };

  return (
    <div className="pc-frame">
      <style>{`
        .pc-frame{background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-retro);overflow:hidden;box-shadow:var(--crt-glow);position:relative}
        .pc-scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 2px,var(--scanline-color) 2px 4px);opacity:0.6}
        .pc-head{background:var(--bg-elevated);padding:14px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:10px}
        .pc-title{font-family:var(--font-display);font-weight:700;font-size:1.1rem;color:var(--text-primary);letter-spacing:0.5px}
        .pc-badge{background:var(--red-danger);color: var(--text-primary);font-family:var(--font-mono-retro);font-size:.65rem;padding:2px 8px;border-radius:10px;text-transform:uppercase}
        .pc-body{padding:16px;display:flex;flex-direction:column;gap:14px;position:relative;z-index:1}
        .pc-q{font-size:1.1rem;line-height:1.4;font-style:italic;color:var(--text-primary);border-left:3px solid var(--green-primary);padding-left:12px}
        .pc-choices{display:flex;flex-direction:column;gap:8px}
        .pc-choice{display:flex;flex-direction:column;gap:4px;background:var(--bg-elevated);border:1px solid var(--border-color);padding:12px;border-radius:8px;cursor:pointer;transition:all .15s;text-align:left}
        .pc-choice:hover:not(:disabled){border-color:var(--green-primary);background:color-mix(in srgb,var(--green-primary) 8%,var(--bg-elevated))}
        .pc-choice:disabled{opacity:0.5;cursor:not-allowed}
        .pc-choice-l{font-family:var(--font-display);font-size:.7rem;text-transform:uppercase;letter-spacing:1px;font-weight:700}
        .pc-choice-t{font-size:.9rem;color:var(--text-primary)}
      `}</style>
      <div className="pc-scan" />
      <div className="pc-head">
        <Mic className="text-[var(--red-danger)]" />
        <span className="pc-title">{t('Sala de Prensa')}</span>
        <span className="pc-badge">{t('LIVE')}</span>
      </div>
      <div className="pc-body">
        <div className="pc-q">"{item.question}"</div>
        <div className="pc-choices">
          {item.choices.map(c => (
            <button key={c.id} className="pc-choice" onClick={() => handleAnswer(c.id)} disabled={answering !== null}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="pc-choice-l" style={{ color: getToneColor(c.id) }}>{c.label}</span>
                {answering === c.id ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
              </div>
              <span className="pc-choice-t">"{c.text}"</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
