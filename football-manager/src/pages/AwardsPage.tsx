// ─── B14 · MEMORIA DEL MUNDO — Palmarés 2.0 + Hemeroteca + Récords + Leyendas ──
// Sustituye al Palmarés plano. Backend: módulo memory (API_UI §MemoriaMundo):
// /memory/palmares · /memory/archive · /memory/records · /memory/clubs/:id/legends.
// Todo clicable con EntityLinks (aceptación F26).
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { awardsApi, leaderboardsApi, memoryApi, worldApi } from '../api/client';
import { useSession } from '../stores/sessionStore';
import { dedupeBy } from '../lib/normalize';
import { Skeleton, TrophyCard, SortableTable, Modal, EmptyState, type AwardItem, type SortCol } from '../components/ui';
import { SectionDropdown, type SectionItem } from '../components/ui/SectionDropdown';
import { PlayerLink, ClubLink } from '../components/common/EntityLink';
import { Trophy, BookOpen, Crown, Medal } from 'lucide-react';

interface LbRow { id?: number; rank?: number; name?: string; player?: { id?: number; name?: string }; club?: { shortName?: string; name?: string } | string; value?: number; goals?: number; assists?: number; rating?: number }

function lbName(r: LbRow) { return r.name ?? r.player?.name ?? '—'; }
function lbClub(r: LbRow) { return typeof r.club === 'string' ? r.club : r.club?.shortName ?? r.club?.name ?? ''; }

type Tab = 'palmares' | 'hemeroteca' | 'records' | 'leyendas';

const TABS: SectionItem[] = [
  { id: 'palmares', label: 'Palmarés', icon: <Trophy size={18} /> },
  { id: 'hemeroteca', label: 'Hemeroteca', icon: <BookOpen size={18} /> },
  { id: 'records', label: 'Récords del universo', icon: <Crown size={18} /> },
  { id: 'leyendas', label: 'Leyendas', icon: <Medal size={18} /> },
];

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('es-ES') : '—');

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-color)',
  color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
  borderRadius: 6, padding: '5px 9px', fontSize: 12,
};

// ─── Tab 1 · PALMARÉS (campeones por competición y año + vitrina + premios) ────
function PalmaresTab() {
  const { t } = useTranslation('common');
  const { club } = useSession();
  const [season, setSeason] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [data, setData] = useState<{ honours: any[]; seasonHistory: any[] } | null>(null);
  const [awards, setAwards] = useState<AwardItem[]>([]);
  const [lb, setLb] = useState<{ goals: LbRow[]; assists: LbRow[]; ratings: LbRow[] }>({ goals: [], assists: [], ratings: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      memoryApi.palmares({ season: season || undefined, clubId: onlyMine ? club?.id : undefined, take: 100 }),
      awardsApi.bySeason(),
      leaderboardsApi.goals(), leaderboardsApi.assists(), leaderboardsApi.ratings(),
    ]).then(([pal, a, g, as, r]) => {
      if (cancelled) return;
      if (pal.status === 'fulfilled' && pal.value) setData(pal.value as any);
      if (a.status === 'fulfilled' && Array.isArray(a.value)) {
        // Dedupe defensivo legacy (un Pichichi/MVP por competición con temporada
        // escrita de dos formas) — ver historial F26.
        const normSeason = (s?: string) => {
          const m = String(s ?? '').match(/^(\d{4})[-/](\d{2,4})$/);
          return m ? `${m[1]}-${m[2].slice(-2)}` : String(s ?? '');
        };
        const normName = (n?: string) => {
          const base = String(n ?? '').toLowerCase();
          if (base.startsWith('mvp')) return 'mvp';
          if (base.startsWith('pichichi')) return base.includes('·') ? base : 'pichichi';
          return base;
        };
        const seen = dedupeBy(a.value as any[], (x: any) => `${normName(x.name)}·${normSeason(x.season)}·${x.winnerPlayerId ?? x.player?.id ?? ''}`);
        setAwards(dedupeBy(seen, (x: any) => `${normName(x.name)}·${normSeason(x.season)}`) as AwardItem[]);
      }
      setLb({
        goals: g.status === 'fulfilled' && Array.isArray(g.value) ? g.value : [],
        assists: as.status === 'fulfilled' && Array.isArray(as.value) ? as.value : [],
        ratings: r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : [],
      });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [season, onlyMine, club?.id]);

  // Campeones: SeasonHistory con position 1, agrupados por temporada.
  const championsBySeason = useMemo(() => {
    const champs = (data?.seasonHistory ?? []).filter((s: any) => s.position === 1);
    const map = new Map<string, any[]>();
    for (const c of champs) {
      const list = map.get(c.season) ?? [];
      list.push(c);
      map.set(c.season, list);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [data]);

  const lbCols = (metric: 'goals' | 'assists' | 'rating', label: string): SortCol<LbRow>[] => [
    { key: 'name', header: 'Jugador', render: (r) => <b><PlayerLink id={r.id ?? r.player?.id} name={lbName(r)} /></b>, sortValue: (r) => lbName(r) },
    { key: 'club', header: 'Club', render: (r) => <span style={{ color: 'var(--text-muted)' }}>{lbClub(r)}</span> },
    { key: 'val', header: label, align: 'right', render: (r) => (
        <span style={{ fontFamily: 'var(--font-mono-retro)', fontWeight: 700, color: 'var(--green-primary)' }}>
          {metric === 'rating' ? (r.rating ?? r.value ?? 0).toFixed?.(2) ?? r.rating : (r as any)[metric] ?? r.value ?? 0}</span>),
      sortValue: (r) => (metric === 'rating' ? (r.rating ?? r.value ?? 0) : ((r as any)[metric] ?? r.value ?? 0)) },
  ];

  if (loading) return <Skeleton height={140} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          style={inputStyle} placeholder={t('Temporada (p. ej. 2025-26)')} value={season}
          onChange={(e) => setSeason(e.target.value)}
        />
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="w-4 h-4 accent-[var(--green-primary)]" />
          {t('Solo mi club')}
        </label>
      </div>

      {/* Campeones por temporada y competición */}
      <section>
        <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: 10 }}>{t('Campeones por temporada')}</h2>
        {championsBySeason.length === 0
          ? <EmptyState title={t('Sin campeones registrados')} hint={t('Las temporadas cerradas aparecerán aquí.')} />
          : championsBySeason.map(([seasonName, champs]) => (
            <div key={seasonName} className="mb-3">
              <p className="muted-label" style={{ marginBottom: 6 }}>{seasonName}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 8 }}>
                {champs.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2"
                    style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
                    <div className="min-w-0">
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{c.competition?.name ?? t('Competición')}</p>
                      <p className="text-sm font-bold truncate">
                        🏆 <ClubLink id={c.club?.id} name={c.club?.name ?? '—'} />
                      </p>
                    </div>
                    {typeof c.points === 'number' && c.points > 0 && (
                      <span className="text-xs font-mono" style={{ color: 'var(--gold-accent)' }}>{c.points} {t('pts')}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
      </section>

      {/* Honores (vitrina del mundo o del club según filtro) */}
      {data && data.honours.length > 0 && (
        <section>
          <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: 10 }}>
            {onlyMine ? t('Vitrina del club') : t('Honores recientes del universo')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
            {data.honours.slice(0, 24).map((h: any) => (
              <div key={h.id}>
                <TrophyCard award={{ id: h.id, name: h.name, season: h.season }} />
                <p className="text-[11px] mt-1 px-1" style={{ color: 'var(--text-muted)' }}>
                  {h.club ? <ClubLink id={h.club.id} name={h.club.shortName ?? h.club.name} /> : null}
                  {h.player ? <> · <PlayerLink id={h.player.id} name={h.player.name} /></> : null}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Premios individuales (Pichichi/MVP, legacy awards) */}
      {awards.length > 0 && (
        <section>
          <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: 10 }}>{t('Premios individuales')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
            {awards.map(a => <TrophyCard key={a.id} award={a} />)}
          </div>
        </section>
      )}

      {/* Tablas de mérito de la temporada en curso */}
      <section>
        <h2 className="section-title" style={{ fontSize: '1.1rem', marginBottom: 10 }}>{t('Tablas de mérito (temporada)')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
          <div><p className="muted-label" style={{ marginBottom: 6 }}>{t('Goleadores')}</p>
            <SortableTable columns={lbCols('goals', t('Goles'))} data={lb.goals} rowKey={(r) => lbName(r)} initialSort={{ key: 'val', dir: 'desc' }} /></div>
          <div><p className="muted-label" style={{ marginBottom: 6 }}>{t('Asistentes')}</p>
            {lb.assists.length > 0
              ? <SortableTable columns={lbCols('assists', t('Asist.'))} data={lb.assists} rowKey={(r) => lbName(r)} initialSort={{ key: 'val', dir: 'desc' }} />
              : <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', padding: '14px 4px' }}>{t('Sin asistencias registradas todavía.')}</p>}
          </div>
          <div><p className="muted-label" style={{ marginBottom: 6 }}>{t('Mejores notas')}</p>
            <SortableTable columns={lbCols('rating', t('Nota'))} data={lb.ratings} rowKey={(r) => lbName(r)} initialSort={{ key: 'val', dir: 'desc' }} /></div>
        </div>
      </section>
    </div>
  );
}

// ─── Tab 2 · HEMEROTECA (archivo histórico de noticias y prensa) ───────────────
const PAGE_SIZE = 20;

function HemerotecaTab() {
  const { t } = useTranslation('common');
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ news: any[]; pressItems: any[]; totalNews: number; totalPressItems: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    memoryApi.archive({ q: q || undefined, skip: page * PAGE_SIZE, take: PAGE_SIZE })
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [q, page]);

  const items = useMemo(() => {
    const news = (data?.news ?? []).map((n: any) => ({
      id: `n${n.id}`, kind: n.type ?? 'noticia', title: n.subject, body: n.body,
      date: n.createdAt, club: n.recipient?.club ?? null,
    }));
    const press = (data?.pressItems ?? []).map((p: any) => ({
      id: `p${p.id}`, kind: 'prensa', title: p.headline ?? p.subject ?? 'Prensa', body: p.content ?? p.body,
      date: p.createdAt, club: null,
    }));
    return [...news, ...press].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data]);

  const total = (data?.totalNews ?? 0) + (data?.totalPressItems ?? 0);
  const lastPage = Math.max(0, Math.ceil((data?.totalNews ?? 0) / PAGE_SIZE) - 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); setPage(0); setQ(qDraft); }}
      >
        <input
          style={{ ...inputStyle, minWidth: 260 }} placeholder={t('Buscar en la hemeroteca (titular o cuerpo)…')}
          value={qDraft} onChange={(e) => setQDraft(e.target.value)}
        />
        <button type="submit" className="px-3 py-1.5 text-xs font-semibold uppercase rounded"
          style={{ background: 'var(--green-primary)', color: 'var(--bg-base)', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
          {t('Buscar')}
        </button>
        {q && (
          <button type="button" onClick={() => { setQ(''); setQDraft(''); setPage(0); }}
            className="px-3 py-1.5 text-xs rounded"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
            {t('Limpiar')}
          </button>
        )}
        <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{total} {t('documentos')}</span>
      </form>

      {loading ? <Skeleton height={120} /> : items.length === 0 ? (
        <EmptyState title={t('Hemeroteca vacía')} hint={q ? t('Sin resultados para') + ` «${q}».` : t('Las noticias del universo se archivan aquí.')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => setOpen(it)}
              className="text-left rounded-lg border px-3 py-2 transition hover:brightness-110"
              style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)', cursor: 'pointer' }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{it.title}</p>
                <span className="text-[10px] shrink-0 font-mono" style={{ color: 'var(--text-muted)' }}>{fmtDate(it.date)}</span>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span className="uppercase">{it.kind}</span>
                {it.club ? <> · {it.club.shortName ?? it.club.name}</> : null}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
          className="px-3 py-1 text-xs rounded disabled:opacity-40"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
          {t('← Anterior')}
        </button>
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{t('página')} {page + 1}</span>
        <button disabled={page >= lastPage && items.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}
          className="px-3 py-1 text-xs rounded disabled:opacity-40"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', cursor: 'pointer' }}>
          {t('Siguiente →')}
        </button>
      </div>

      <Modal open={open !== null} onClose={() => setOpen(null)} title={open?.title} width={620}>
        {open && (
          <div>
            <p className="text-[11px] mb-3 font-mono" style={{ color: 'var(--text-muted)' }}>
              {String(open.kind).toUpperCase()} · {fmtDate(open.date)}
            </p>
            <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
              {typeof open.body === 'string' && open.body.trim().startsWith('{')
                ? t('Documento estructurado (rueda de prensa u otro registro interno).')
                : open.body || t('Sin cuerpo.')}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Tab 3 · RÉCORDS DEL UNIVERSO ───────────────────────────────────────────────
function RecordsTab() {
  const { t } = useTranslation('common');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    memoryApi.records(10)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Skeleton height={140} />;
  if (!data) return <EmptyState title={t('Sin récords todavía')} hint={t('Los récords se construyen con los partidos jugados.')} />;

  const matchRow = (m: any) => (
    <div key={m.matchId} className="flex items-center justify-between rounded-lg border px-3 py-2"
      style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
      <p className="text-sm truncate">
        <ClubLink id={m.homeClub?.id} name={m.homeClub?.shortName ?? m.homeClub?.name ?? '—'} />
        <span className="font-mono font-bold mx-2" style={{ color: 'var(--gold-accent)' }}>{m.score}</span>
        <ClubLink id={m.awayClub?.id} name={m.awayClub?.shortName ?? m.awayClub?.name ?? '—'} />
      </p>
      <span className="text-[10px] shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>
        {m.competition?.shortName ?? m.competition?.name ?? ''} · {fmtDate(m.playedAt)}
      </span>
    </div>
  );

  const playerCols = (metric: 'goals' | 'assists', label: string): SortCol<any>[] => [
    { key: 'p', header: t('Jugador'), render: (r) => <b><PlayerLink id={r.player?.id} name={r.player?.name ?? `#${r.player?.id}`} /></b>, sortValue: (r) => r.player?.name ?? '' },
    { key: 'c', header: t('Club'), render: (r) => r.player?.club ? <ClubLink id={r.player.club.id} name={r.player.club.shortName ?? r.player.club.name} /> : <span style={{ color: 'var(--text-muted)' }}>—</span> },
    { key: 'v', header: label, align: 'right', render: (r) => <span className="font-mono font-bold" style={{ color: 'var(--green-primary)' }}>{r[metric]}</span>, sortValue: (r) => r[metric] ?? 0 },
    { key: 'pj', header: t('PJ'), align: 'right', render: (r) => <span style={{ color: 'var(--text-muted)' }}>{r.matches}</span>, sortValue: (r) => r.matches ?? 0 },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
      <section>
        <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: 8 }}>{t('Mayores goleadas de la historia')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(data.biggestWins ?? []).map(matchRow)}
        </div>
      </section>

      <section>
        <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: 8 }}>{t('Partidos con más goles')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(data.highestScoringMatches ?? []).map(matchRow)}
        </div>
      </section>

      <section>
        <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: 8 }}>{t('Goleadores históricos')}</h2>
        <SortableTable columns={playerCols('goals', t('Goles'))} data={data.topScorers ?? []} rowKey={(r) => String(r.player?.id ?? JSON.stringify(r))} initialSort={{ key: 'v', dir: 'desc' }} />
      </section>

      <section>
        <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: 8 }}>{t('Asistentes históricos')}</h2>
        <SortableTable columns={playerCols('assists', t('Asist.'))} data={data.topAssisters ?? []} rowKey={(r) => String(r.player?.id ?? JSON.stringify(r))} initialSort={{ key: 'v', dir: 'desc' }} />
      </section>

      <section>
        <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: 8 }}>{t('Mejores rachas invictas')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(data.bestUnbeatenStreaks ?? []).map((s: any, i: number) => (
            <div key={s.club?.id ?? i} className="flex items-center justify-between rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--border-color)', background: 'var(--bg-base)' }}>
              <p className="text-sm font-semibold"><ClubLink id={s.club?.id} name={s.club?.name ?? '—'} /></p>
              <span className="font-mono font-bold" style={{ color: 'var(--gold-accent)' }}>{s.matches} {t('sin perder')}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: 8 }}>{t('Mejores medias (histórico)')}</h2>
        <SortableTable
          columns={[
            { key: 'p', header: t('Jugador'), render: (r: any) => <b><PlayerLink id={r.player?.id} name={r.player?.name ?? `#${r.player?.id}`} /></b>, sortValue: (r: any) => r.player?.name ?? '' },
            { key: 'v', header: t('Nota'), align: 'right', render: (r: any) => <span className="font-mono font-bold" style={{ color: 'var(--green-primary)' }}>{r.averageRating?.toFixed?.(2) ?? r.averageRating}</span>, sortValue: (r: any) => r.averageRating ?? 0 },
            { key: 'pj', header: t('PJ'), align: 'right', render: (r: any) => <span style={{ color: 'var(--text-muted)' }}>{r.matches}</span>, sortValue: (r: any) => r.matches ?? 0 },
          ] as SortCol<any>[]}
          data={data.topRatings ?? []}
          rowKey={(r) => String(r.player?.id ?? JSON.stringify(r))}
          initialSort={{ key: 'v', dir: 'desc' }}
        />
      </section>
    </div>
  );
}

// ─── Tab 4 · LEYENDAS (por club, retirados con huella) ─────────────────────────
function LegendsTab() {
  const { t } = useTranslation('common');
  const { club } = useSession();
  const [clubId, setClubId] = useState<number | null>(club?.id ?? null);
  const [clubQuery, setClubQuery] = useState('');
  const [clubOptions, setClubOptions] = useState<any[]>([]);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clubQuery.trim()) { setClubOptions([]); return; }
    const t = setTimeout(() => {
      worldApi.clubs({ q: clubQuery.trim(), take: 8 })
        .then((rows: any) => setClubOptions(Array.isArray(rows) ? rows : (rows?.data ?? [])))
        .catch(() => setClubOptions([]));
    }, 350);
    return () => clearTimeout(t);
  }, [clubQuery]);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    setLoading(true);
    memoryApi.legends(clubId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clubId]);

  const cols: SortCol<any>[] = [
    { key: 'n', header: t('Leyenda'), render: (r) => r.playerId
        ? <b><PlayerLink id={r.playerId} name={r.name} /></b>
        : <b>{r.name}</b>,
      sortValue: (r) => r.name },
    { key: 'pos', header: t('Pos'), render: (r) => <span style={{ color: 'var(--text-muted)' }}>{r.position}</span> },
    { key: 'score', header: t('Huella'), align: 'right', render: (r) => <span className="font-mono font-bold" style={{ color: 'var(--gold-accent)' }}>{r.legendScore}</span>, sortValue: (r) => r.legendScore ?? 0 },
    { key: 'pj', header: t('PJ'), align: 'right', render: (r) => <span>{r.totals?.matches ?? 0}</span>, sortValue: (r) => r.totals?.matches ?? 0 },
    { key: 'g', header: t('Goles'), align: 'right', render: (r) => <span style={{ color: 'var(--green-primary)' }}>{r.totals?.goals ?? 0}</span>, sortValue: (r) => r.totals?.goals ?? 0 },
    { key: 'a', header: t('Asist.'), align: 'right', render: (r) => <span>{r.totals?.assists ?? 0}</span>, sortValue: (r) => r.totals?.assists ?? 0 },
    { key: 'ret', header: t('Retirada'), align: 'right', render: (r) => <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.retiredAt ? fmtDate(r.retiredAt) : t('En activo')}</span> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="relative max-w-md">
        <input
          style={{ ...inputStyle, width: '100%' }} value={clubQuery}
          placeholder={data?.club ? t('Leyendas de') + ` ${data.club.name} — ` + t('buscar otro club…') : t('Buscar club…')}
          onChange={(e) => setClubQuery(e.target.value)}
        />
        {clubOptions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--border-color)', background: 'var(--bg-surface)' }}>
            {clubOptions.map((c: any) => (
              <button key={c.id} onClick={() => { setClubId(c.id); setClubQuery(''); setClubOptions([]); }}
                className="block w-full text-left px-3 py-2 text-sm hover:brightness-110"
                style={{ color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                {c.badge ?? ''} {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? <Skeleton height={120} /> : !data ? (
        <EmptyState title={t('Elige un club')} hint={t('Busca un club para ver sus leyendas.')} />
      ) : (
        <>
          <h2 className="section-title" style={{ fontSize: '1.1rem' }}>
            {t('Leyendas de')} <ClubLink id={data.club?.id} name={data.club?.name ?? '—'} />
            {data.storage === 'computed_fallback' && (
              <span className="text-[10px] ml-2 px-2 py-0.5 rounded uppercase" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{t('provisional')}</span>
            )}
          </h2>
          {(data.legends ?? []).length === 0
            ? <EmptyState title={t('Sin leyendas todavía')} hint={t('Las leyendas se consagran al retirarse con huella en el club.')} />
            : <SortableTable columns={cols} data={data.legends} rowKey={(r) => String(r.id)} initialSort={{ key: 'score', dir: 'desc' }} />}
        </>
      )}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
function GalaHeader({ awards }: { awards: AwardItem[] }) {
  const { t } = useTranslation('common');
  const spotlight = awards.slice(0, 3);
  return (
    <div className="relative overflow-hidden rounded-3xl border-2 p-10 mb-8"
      style={{
        background: 'linear-gradient(135deg, var(--brutal-bg-1) 0%, var(--brutal-bg-2) 100%)',
        borderColor: 'var(--gold-accent)',
        boxShadow: '0 25px 50px var(--brutal-shadow), inset 0 0 40px color-mix(in srgb, var(--gold-accent) 10%, transparent)'
      }}>
      <style>{`
        @keyframes gala-trophy {
          0%, 100% { transform: translateY(0) rotate(-5deg) scale(1); filter: drop-shadow(0 0 20px rgba(250,204,21,0.5)); }
          50% { transform: translateY(-10px) rotate(5deg) scale(1.05); filter: drop-shadow(0 0 40px rgba(250,204,21,0.8)); }
        }
        .gala-trophy { animation: gala-trophy 4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .gala-trophy { animation: none; } }
        .gala-title-glow { text-shadow: 0 0 30px rgba(250,204,21,0.6), 0 0 10px color-mix(in srgb, var(--text-primary) 40%, transparent); }
      `}</style>
      <div className="absolute inset-0 pointer-events-none opacity-20"
        style={{ background: 'radial-gradient(circle at center, transparent 20%, color-mix(in srgb, var(--bg-base) 90%, transparent) 100%), repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(250,204,21,0.03) 4px, rgba(250,204,21,0.03) 8px)' }} />
      <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row items-center gap-12">
        <div className="gala-trophy text-[var(--gold-accent)] relative">
          <Trophy size={100} strokeWidth={1.2} />
          <div className="absolute inset-0 bg-yellow-400 blur-3xl opacity-20 -z-10 rounded-full"></div>
        </div>
        <div className="flex-1 text-center md:text-left">
          <p className="text-xs uppercase tracking-[0.5em] font-black text-[var(--gold-accent)] mb-3">{t('Ceremonia oficial')}</p>
          <h2 className="font-display font-black text-6xl uppercase tracking-tighter text-[var(--text-primary)] mb-4 gala-title-glow">{t('Gala FDF')}</h2>
          <p className="text-base text-[var(--text-muted)] max-w-2xl font-mono leading-relaxed">
            {t('Los premios de la temporada toman el escenario. Palmarés, récords y leyendas en un solo acto.')}
          </p>
        </div>
        {spotlight.length > 0 && (
          <div className="flex gap-4 flex-wrap justify-center relative">
             <div className="absolute inset-0 bg-yellow-400 blur-3xl opacity-10 -z-10 rounded-full"></div>
            {spotlight.map((a) => (
              <div key={a.id} className="text-center min-w-[120px] transition-transform hover:scale-110 hover:-translate-y-2 duration-300">
                <TrophyCard award={a} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AwardsPage() {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState<Tab>('palmares');
  const [counts, setCounts] = useState<any | null>(null);
  const [galaAwards, setGalaAwards] = useState<AwardItem[]>([]);

  useEffect(() => {
    memoryApi.overview().then((o) => setCounts(o?.counts ?? null)).catch(() => setCounts(null));
    awardsApi.bySeason()
      .then((a) => { if (Array.isArray(a)) setGalaAwards(a.slice(0, 3) as AwardItem[]); })
      .catch(() => {});
  }, []);

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--gold-accent)] to-[var(--brutal-bg-2)] border border-[var(--gold-accent)] shadow-[0_0_30px_rgba(250,204,21,0.2)]">
            <Trophy size={32} className="text-[var(--bg-base)]" />
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-black mb-1">{t('Todo lo que ha pasado en el universo')}</p>
            <h1 className="font-display font-black text-4xl uppercase tracking-tight text-[var(--text-primary)]" style={{textShadow: '0 0 20px color-mix(in srgb, var(--text-primary) 20%, transparent)'}}>{t('Memoria del Mundo')}</h1>
          </div>
        </div>
        {counts && (
          <div className="flex flex-wrap gap-3 font-mono text-xs text-[var(--gold-accent)]">
            <span className="bg-[color-mix(in_srgb,var(--bg-base)_40%,transparent)] px-3 py-1 rounded-lg border border-yellow-500/20 shadow-[0_0_10px_rgba(250,204,21,0.1)]">{counts.playedMatches} {t('partidos')}</span>
            <span className="bg-[color-mix(in_srgb,var(--bg-base)_40%,transparent)] px-3 py-1 rounded-lg border border-yellow-500/20 shadow-[0_0_10px_rgba(250,204,21,0.1)]">{counts.honours} {t('títulos')}</span>
            <span className="bg-[color-mix(in_srgb,var(--bg-base)_40%,transparent)] px-3 py-1 rounded-lg border border-yellow-500/20 shadow-[0_0_10px_rgba(250,204,21,0.1)]">{counts.news} {t('noticias')}</span>
            <span className="bg-[color-mix(in_srgb,var(--bg-base)_40%,transparent)] px-3 py-1 rounded-lg border border-yellow-500/20 shadow-[0_0_10px_rgba(250,204,21,0.1)]">{counts.legends} {t('leyendas')}</span>
          </div>
        )}
      </div>

      <GalaHeader awards={galaAwards} />

      <div className="my-8">
        <SectionDropdown
          items={TABS}
          selectedId={tab}
          onChange={(id) => setTab(id as Tab)}
          kicker={t('EXPLORAR MEMORIA')}
        />
      </div>

      {tab === 'palmares' && <PalmaresTab />}
      {tab === 'hemeroteca' && <HemerotecaTab />}
      {tab === 'records' && <RecordsTab />}
      {tab === 'leyendas' && <LegendsTab />}
    </div>
  );
}
