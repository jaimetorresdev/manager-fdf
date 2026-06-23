// ─── Y11 · Titulares vivos de la taberna ──────────────────────────────────────
// Consume GET /chat/tavern/events y pinta una tira horizontal de titulares del
// universo FDF (traspasos, crónicas, prensa, rumores) clicables. Hace que la
// taberna parezca parte del mundo y no un chat aislado. Defensivo: si falla la
// llamada no rompe la página, simplemente no muestra la tira.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Newspaper, Radio, Megaphone, Sparkles } from 'lucide-react';
import { chatApi } from '../../api/client';
import { asArray } from '../../lib/normalize';
import { useTranslation } from 'react-i18next';

interface TavernEvent {
  id: string;
  type: string;
  headline: string;
  detail?: string;
  route?: string | null;
  createdAt?: string;
}

const TYPE_META: Record<string, { icon: typeof Radio; tone: string; label: string }> = {
  transfer: { icon: ArrowLeftRight, tone: 'var(--gold-accent)', label: 'Fichaje' },
  match_center: { icon: Radio, tone: 'var(--green-primary)', label: 'Crónica' },
  press: { icon: Newspaper, tone: 'var(--blue-info)', label: 'Prensa' },
  rumor: { icon: Megaphone, tone: 'var(--violet-accent)', label: 'Rumor' },
};

const TE_CSS = `
.te-wrap{border:1px solid color-mix(in srgb,var(--gold-accent) 22%,var(--border-color));border-radius:var(--radius-retro);
  background:color-mix(in srgb,var(--bg-surface) 95%,transparent);overflow:hidden;box-shadow:var(--shadow-soft)}
.te-head{display:flex;align-items:center;gap:7px;padding:7px 12px;border-bottom:1px solid color-mix(in srgb,var(--border-color) 60%,transparent);
  font-family:var(--font-display);font-weight:700;font-size:.68rem;text-transform:uppercase;letter-spacing:1px;color:var(--gold-accent)}
.te-rail{display:flex;gap:8px;overflow-x:auto;padding:10px 12px;scrollbar-width:thin}
.te-card{flex:0 0 auto;max-width:260px;text-align:left;cursor:pointer;background:var(--bg-elevated);
  border:1px solid var(--border-color);border-radius:8px;padding:8px 11px;transition:all 140ms ease;color:var(--text-primary)}
.te-card:hover{border-color:color-mix(in srgb,var(--gold-accent) 45%,var(--border-color));transform:translateY(-1px)}
.te-card.flat{cursor:default}
.te-card.flat:hover{transform:none;border-color:var(--border-color)}
.te-type{display:flex;align-items:center;gap:5px;font-family:var(--font-mono-retro);font-size:.6rem;
  text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px}
.te-headline{font-size:.8rem;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.te-detail{font-size:.66rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
`;

export function TavernEventsStrip() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [events, setEvents] = useState<TavernEvent[]>([]);

  useEffect(() => {
    let alive = true;
    chatApi.tavernEvents(12)
      .then(res => { if (alive) setEvents(asArray<TavernEvent>(res?.events ?? res)); })
      .catch(() => { if (alive) setEvents([]); });
    return () => { alive = false; };
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="te-wrap">
      <style>{TE_CSS}</style>
      <div className="te-head"><Sparkles size={12} /> {t('Se comenta en la taberna')}</div>
      <div className="te-rail">
        {events.map(ev => {
          const meta = TYPE_META[ev.type] ?? { icon: Radio, tone: 'var(--text-muted)', label: ev.type };
          const Icon = meta.icon;
          const clickable = !!ev.route;
          return (
            <button
              key={ev.id}
              className={`te-card${clickable ? '' : ' flat'}`}
              onClick={() => { if (ev.route) navigate(ev.route); }}
              title={ev.headline}
            >
              <span className="te-type" style={{ color: meta.tone }}>
                <Icon size={11} /> {t(meta.label)}
              </span>
              <div className="te-headline">{ev.headline}</div>
              {ev.detail && <div className="te-detail">{ev.detail}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
