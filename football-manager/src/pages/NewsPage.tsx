import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Newspaper, Inbox } from 'lucide-react';
import { newsApi, pressApi, clubApi } from '../api/client';
import { NewsCard, Skeleton, PressCard, type PressQuestion, type NewsItem } from '../components/ui';
import { GoalOfWeekPanel } from '../components/social/GoalOfWeekPanel';
import { DerbyPressPanel } from '../components/social/DerbyPressPanel';
import { cn } from '../lib/cn';
import type { RivalWeekData } from '../components/competition/RivalWeekPanel';

type Tab = 'prensa' | 'bandeja';

function isDerbyWeek(next?: RivalWeekData['nextMeeting']): boolean {
  if (!next?.playedAt) return false;
  const ms = +new Date(next.playedAt) - Date.now();
  return ms > 0 && ms <= 7 * 24 * 3600 * 1000;
}

export function NewsPage() {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState<Tab>('prensa');
  const [press, setPress] = useState<NewsItem[]>([]);
  const [inbox, setInbox] = useState<NewsItem[]>([]);
  const [pendingPress, setPendingPress] = useState<PressQuestion[]>([]);
  const [rivalWeek, setRivalWeek] = useState<RivalWeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await newsApi.get(1);
      setPress(res?.press?.data ?? (Array.isArray(res?.press) ? res.press : []));
      setInbox(res?.inbox?.data ?? (Array.isArray(res?.inbox) ? res.inbox : []));
      try {
        const pressRes = await pressApi.pending();
        setPendingPress(Array.isArray(pressRes) ? pressRes : []);
      } catch { /* ignore press failure */ }
      clubApi.rivalWeek().then(r => setRivalWeek(r as RivalWeekData)).catch(() => setRivalWeek(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la actualidad');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: number) => {
    setInbox(list => list.map(m => m.id === id ? { ...m, isRead: true } : m));
    try { await newsApi.markRead(id); } catch { /* optimista */ }
  };

  const unread = inbox.filter(m => m.isRead === false).length;
  const items = tab === 'prensa' ? press : inbox;
  const derbyWeek = isDerbyWeek(rivalWeek?.nextMeeting) && !!rivalWeek?.rival;

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto pb-10">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border-color)] p-8 shadow-[var(--shadow-soft)]">
        <div className="absolute inset-0 pointer-events-none opacity-30"
          style={{ background: 'repeating-linear-gradient(0deg,transparent 0 2px,var(--scanline-color) 2px 4px)' }} />
        <div className="absolute -top-20 -right-10 w-56 h-56 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle,var(--gold-accent),transparent 70%)' }} />
        <p className="relative text-[10px] uppercase tracking-[0.28em] text-[var(--gold-accent)] font-bold mb-2">{t('Universo FDF')}</p>
        <h1 className="relative font-display text-3xl sm:text-4xl text-[var(--text-primary)] font-black uppercase tracking-tight">
          {t('Hemeroteca FDF')}
        </h1>
        <p className="relative mt-2 text-sm text-[var(--text-muted)] max-w-xl leading-relaxed">
          {t('Crónicas, titulares y la bandeja del mánager. La prensa escribe la historia del universo mientras tú la protagonizas.')}
        </p>
      </header>

      <div className="flex gap-2">
        <button 
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-sans font-medium cursor-pointer transition-all border shadow-sm",
            tab === 'prensa' 
              ? "bg-[var(--green-primary)] text-white border-transparent" 
              : "bg-[var(--bg-elevated)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]"
          )}
          onClick={() => setTab('prensa')}
        >
          <Newspaper size={16} /> {t('Prensa')}
        </button>
        <button 
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-sans font-medium cursor-pointer transition-all border shadow-sm",
            tab === 'bandeja' 
              ? "bg-[var(--green-primary)] text-white border-transparent" 
              : "bg-[var(--bg-elevated)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]"
          )}
          onClick={() => setTab('bandeja')}
        >
          <Inbox size={16} /> {t('Bandeja')} 
          {unread > 0 && (
            <span className="bg-red-500 text-white rounded-full px-2 py-0.5 text-xs font-bold ml-1 shadow-sm">
              {unread}
            </span>
          )}
        </button>
      </div>

      {loading && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={i === 0 ? 96 : 64} className="rounded-xl shadow-sm" />
          ))}
        </div>
      )}
      
      {!loading && error && (
        <div className="bg-[var(--bg-elevated)] rounded-xl p-6 text-center text-[var(--text-muted)] border border-[var(--border-color)] shadow-sm font-sans">
          ⚠️ {error}
        </div>
      )}
      
      {!loading && !error && (
        <div className="flex flex-col gap-4">
          {/* X8 · Gol de la semana: ritual semanal con votación (se oculta solo si no hay candidatos) */}
          {tab === 'prensa' && <GoalOfWeekPanel />}

          {tab === 'prensa' && derbyWeek && (
            <DerbyPressPanel rivalName={rivalWeek?.rival?.name} tagline={rivalWeek?.tagline} />
          )}

          {tab === 'prensa' && pendingPress.map(pq => (
            <PressCard key={pq.questionId} item={pq} onAnswered={(id: number) => {
              setPendingPress(prev => prev.filter(p => p.questionId !== id));
              load(); // Recargar noticias para mostrar el item de prensa generado
            }} />
          ))}
          
          {items.length === 0 && pendingPress.length === 0 && (
            <p className="text-[var(--text-muted)] font-sans text-center py-8 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-color)] shadow-sm">
              {t('Sin novedades por ahora.')}
            </p>
          )}
          
          {items.map((it, i) => (
            <NewsCard 
              key={it.id} 
              item={it} 
              featured={tab === 'prensa' && i === 0}
              onClick={tab === 'bandeja' && it.isRead === false ? () => markRead(it.id) : undefined} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
