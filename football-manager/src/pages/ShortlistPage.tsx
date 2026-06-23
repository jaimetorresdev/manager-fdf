import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Handshake, StarOff } from 'lucide-react';
import { marketApi } from '../api/client';
import { Button, Badge, PosBadge, Skeleton, EmptyState, ConfirmModal } from '../components/ui';
import { asArray } from '../lib/normalize';
import { eur } from '../lib/format';
import toast from 'react-hot-toast';

interface ShortlistPlayer {
  id: number;
  name: string;
  position?: string;
  age?: number;
  overall?: number;
  potential?: number;
  marketValue?: number;
  club?: { name: string } | null;
}

export function ShortlistPage() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState<ShortlistPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await marketApi.getShortlist();
      setPlayers(asArray(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('gameplay:shortlist.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  const openSignFlow = (p: ShortlistPlayer) => {
    if (!p.club) {
      navigate('/market', { state: { tab: 'libres' } });
      return;
    }
    navigate('/market', { state: { openPlayerId: p.id } });
  };

  const removeShortlist = async (id: number) => {
    setRemoving(true);
    try {
      await marketApi.removeShortlist(id);
      toast.success(t('gameplay:shortlist.removeAction'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('gameplay:shortlist.loadError'));
    } finally {
      setRemoving(false);
      setConfirmRemove(null);
    }
  };

  const rowNav = (id: number) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => navigate(`/player/${id}`),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate(`/player/${id}`);
      }
    },
  });

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between border-b border-[var(--border-color)] pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold uppercase tracking-wide flex items-center gap-3">
            <Search className="text-[var(--gold-accent)]" size={32} />
            {t('gameplay:shortlist.title')}
          </h1>
          <p className="text-[var(--text-muted)] mt-1">
            {t('gameplay:shortlist.lede')}
          </p>
        </div>
      </header>

      {error ? (
        <EmptyState
          icon={<StarOff />}
          title={t('gameplay:shortlist.loadError')}
          hint={error}
          action={<Button variant="secondary" onClick={() => void load()}>{t('gameplay:shortlist.retry')}</Button>}
        />
      ) : loading ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : players.length === 0 ? (
        <EmptyState 
          mood="transfer"
          kicker={t('gameplay:shortlist.emptyKicker', 'Ojo de ojeador')}
          icon={<Search size={28} />} 
          title={t('gameplay:shortlist.emptyTitle')} 
          hint={t('gameplay:shortlist.emptyHint')} 
          action={<Button onClick={() => navigate('/market')}>{t('gameplay:shortlist.goMarket')}</Button>}
        />
      ) : (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-[var(--bg-surface)] text-[var(--text-muted)] border-b border-[var(--border-color)]">
                <tr>
                  <th className="px-6 py-4 font-bold tracking-widest">{t('gameplay:shortlist.table.player')}</th>
                  <th className="px-6 py-4 font-bold tracking-widest text-center">{t('gameplay:shortlist.table.pos')}</th>
                  <th className="px-6 py-4 font-bold tracking-widest text-center">{t('gameplay:shortlist.table.age')}</th>
                  <th className="px-6 py-4 font-bold tracking-widest text-center">{t('gameplay:shortlist.table.overall')}</th>
                  <th className="px-6 py-4 font-bold tracking-widest text-right">{t('gameplay:shortlist.table.value')}</th>
                  <th className="px-6 py-4 font-bold tracking-widest">{t('gameplay:shortlist.table.club')}</th>
                  <th className="px-6 py-4 font-bold tracking-widest text-right">{t('gameplay:shortlist.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {players.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--bg-surface)] transition-colors group cursor-pointer" {...rowNav(p.id)}>
                    <td className="px-6 py-4 whitespace-nowrap font-bold text-[var(--text-primary)]">
                      {p.name}
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <PosBadge position={p.position || '—'} short />
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap font-mono">
                      {p.age || '—'}
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <Badge variant={p.overall && p.overall >= 80 ? 'success' : 'neutral'}>
                        {p.overall || '—'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap font-mono text-[var(--gold-accent)]">
                      {eur(p.marketValue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-[var(--text-muted)]">
                      {p.club?.name || t('gameplay:shortlist.freeAgent')}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                        <button type="button" className="px-3 py-1 bg-black/30 text-white rounded border border-white/20 hover:border-white flex items-center text-xs" onClick={() => openSignFlow(p)}>
                          <Handshake size={14} className="mr-2" /> {t(p.club ? 'gameplay:shortlist.signPlayer' : 'gameplay:shortlist.signMarket')}
                        </button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(p.id)} className="text-[var(--red-danger)] hover:bg-[var(--red-danger)] hover:bg-opacity-10" aria-label={t('gameplay:shortlist.removeAction')}>
                          <StarOff size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmRemove != null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => { if (confirmRemove != null) void removeShortlist(confirmRemove); }}
        title={t('gameplay:shortlist.removeTitle')}
        confirmText={t('gameplay:shortlist.removeAction')}
        isDestructive
        isSubmitting={removing}
      >
        <p>{t('gameplay:shortlist.removeBody')}</p>
      </ConfirmModal>
    </div>
  );
}
