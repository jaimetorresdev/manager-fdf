import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Star, Building2, Heart, Gauge, Medal, BarChart3 } from 'lucide-react';
import { clubApi, awardsApi, publicApi } from '../api/client';
import { useSession } from '../stores/sessionStore';
import { KPICard, Skeleton, StatBar, Tabs, SortableTable, Sparkline, TrophyCard, ClubBadge, PosBadge, type SortCol } from '../components/ui';
import { PlayerLink } from '../components/common/EntityLink';
import { NpcCoachIdentity } from '../components/public/NpcCoachIdentity';
import { cn } from '../lib/cn';
import { eur } from '../lib/format';
import { adaptClubProfile } from '../lib/entityViewModels';
import { RivalWeekPanel } from '../components/competition/RivalWeekPanel';
import { ClubTacticalRadar } from '../components/club/ClubTacticalRadar';

interface ClubData {
  id: number; name: string; shortName?: string; badge?: string; city?: string; country?: string;
  fdfValuation?: number; fans?: number; reputation?: number;
  form?: string[]; morale?: number;
  stadium?: { name?: string; capacity?: number };
  fanBase?: { loyalty?: number; mood?: number };
  budget?: number; cash?: number;
  history?: { seasons?: { season: string; rank?: number; points?: number; goalsFor?: number; goalsAgainst?: number }[] };
  publicFinances?: { valuationCategory?: string; wageBillCategory?: string; financialStatus?: string };
  manager?: { id: number; name: string } | null;
  npcCoach?: {
    id: string; name: string; nationality?: string; avatarSeed?: string; pressLine?: string;
    tacticalStyle?: { favoriteFormation?: string };
    career?: {
      stage?: string;
      monthsInCharge?: number;
      previousClubs?: number;
      estimatedPromotions?: number;
      dismissalRisk?: string;
      nextReviewAt?: string;
    };
  } | null;
}
interface SquadRow {
  id: number; firstName?: string; lastName?: string; name?: string; position?: string; preferredPosition?: string; age?: number;
  overall?: number; averageRating?: number; formArray?: number[]; marketValue?: number;
  injuries?: any[]; suspensions?: any[];
}
interface HonourRow { id: number; name: string; season?: string }

const FORM_TONE: Record<string, string> = { W: 'var(--green-primary)', V: 'var(--green-primary)', D: 'var(--gold-accent)', E: 'var(--gold-accent)', L: 'var(--red-danger)', P: 'var(--red-danger)' };
const fullName = (r: SquadRow) => (r.name ?? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()) || 'Jugador';
function compKey(name: string) {
  return name.replace(/\s*\d{4}[-/]\d{2,4}\s*/g, ' ').replace(/\s+/g, ' ').trim() || name;
}

export function ClubPage() {
  const { t } = useTranslation('common');
  const { id } = useParams<{ id: string }>();
  const { club } = useSession();
  const clubId = Number(id ?? club?.id);
  const [data, setData] = useState<ClubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('resumen');
  const [squad, setSquad] = useState<SquadRow[] | null>(null);
  const [honours, setHonours] = useState<HonourRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setSquad(null); setHonours(null); setTab('resumen');
    if (!Number.isFinite(clubId)) { setError('Club no válido'); setLoading(false); return; }
    Promise.all([
      clubApi.getPublic(clubId),
      publicApi.worldClub(clubId).catch(() => null),
    ])
      .then(([d, world]) => {
        if (cancelled) return;
        setData({
          ...(d as ClubData),
          manager: world?.manager ?? (d as ClubData).manager ?? null,
          npcCoach: world?.npcCoach ?? (d as ClubData).npcCoach ?? null,
        });
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar el club'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clubId]);

  useEffect(() => {
    if (!Number.isFinite(clubId)) return;
    let cancelled = false;
    if (tab === 'plantilla' && squad === null) {
      clubApi.getPublicSquad(clubId)
        .then(rows => { if (!cancelled) setSquad(Array.isArray(rows) ? rows : []); })
        .catch(() => { if (!cancelled) setSquad([]); });
    }
    if (tab === 'palmares' && honours === null) {
      awardsApi.clubHonours(clubId)
        .then((h: any) => { if (!cancelled) setHonours(Array.isArray(h?.honours) ? h.honours : Array.isArray(h) ? h : []); })
        .catch(() => { if (!cancelled) setHonours([]); });
    }
    return () => { cancelled = true; };
  }, [tab, clubId, squad, honours]);

  const honoursByComp = useMemo(() => {
    const groups = new Map<string, HonourRow[]>();
    (honours ?? []).forEach(h => {
      const k = compKey(h.name);
      groups.set(k, [...(groups.get(k) ?? []), h]);
    });
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [honours]);

  const squadCols: SortCol<SquadRow>[] = [
    { key: 'pos', header: 'Pos', align: 'center', render: r => r.position ? <PosBadge position={r.position} preferredPosition={r.preferredPosition} short /> : '—', sortValue: r => r.position ?? '' },
    { key: 'name', header: 'Jugador', render: r => <b><PlayerLink id={r.id} name={fullName(r)} /></b>, sortValue: r => fullName(r) },
    { key: 'age', header: 'Edad', align: 'right', render: r => r.age ?? '—', sortValue: r => r.age ?? 0 },
    { key: 'ovr', header: 'Media', align: 'right', render: r => <b className="font-sans text-[var(--green-primary)] font-bold">{r.overall ?? '—'}</b>, sortValue: r => r.overall ?? 0 },
    { key: 'rating', header: 'Nota', align: 'right', render: r => { const n = Number(r.averageRating ?? 0); return n > 0 ? <b className="font-sans font-bold" style={{ color: n >= 7 ? 'var(--green-primary)' : n >= 5.5 ? 'var(--gold-accent)' : 'var(--red-danger)' }}>{n.toFixed(2)}</b> : '—'; }, sortValue: r => Number(r.averageRating ?? 0) },
    { key: 'forma', header: 'Forma', align: 'center', render: r => Array.isArray(r.formArray) && r.formArray.length > 1 ? <Sparkline data={r.formArray} width={70} height={20} /> : '—' },
    { key: 'value', header: 'Valor', align: 'right', render: r => <span className="font-sans font-medium">{eur(r.marketValue)}</span>, sortValue: r => r.marketValue ?? 0 },
    { key: 'estado', header: 'Estado', align: 'center', render: r => (r.injuries?.length ? '🏥' : r.suspensions?.length ? '🟥' : '✓'), sortValue: r => (r.injuries?.length ? 2 : r.suspensions?.length ? 1 : 0) },
  ];

  if (loading) return <div className="page-surface flex flex-col gap-4"><Skeleton height={140} /><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} height={100} />)}</div><Skeleton height={200} /></div>;
  if (error || !data) return <div className="page-surface"><div className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-xl p-8 text-center text-[var(--text-muted)]">⚠️ {error ?? 'Club no disponible'}</div></div>;

  // A2 · capa adaptadora defensiva (lib/entityViewModels): normaliza identidad y
  // finanzas públicas del club. Aditivo: solo refuerza como fallback los valores
  // que ya derivaba la página → mismo render premium, datos más robustos.
  const vm = adaptClubProfile(data);
  const mood = data.fanBase?.mood ?? data.morale;
  const clubPrimary = vm.colors?.primary ?? 'var(--green-primary)';
  const clubSecondary = vm.colors?.secondary ?? 'var(--gold-accent)';
  return (
    <div className="page-surface flex flex-col gap-6 font-sans">

      {/* Cabecera monumental I-12 */}
      <div
        className="relative flex flex-col md:flex-row items-center gap-6 p-8 rounded-3xl border border-[var(--border-color)] bg-[var(--bg-elevated)] backdrop-blur-md shadow-lg overflow-hidden"
        style={{ ['--club-primary' as string]: clubPrimary, ['--club-secondary' as string]: clubSecondary }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-[color-mix(in_srgb,var(--club-primary)_18%,transparent)] via-transparent to-[color-mix(in_srgb,var(--club-secondary)_10%,transparent)] pointer-events-none" />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/4 opacity-[0.05] pointer-events-none blur-md transform scale-[2.5]">
          <ClubBadge id={data.id} name={data.name} size={300} />
        </div>
        
        {/* Escudo destacado */}
        <div className="relative z-10 p-5 bg-[var(--bg-surface)] backdrop-blur-xl rounded-full border-2 shrink-0 group hover:scale-105 transition-transform duration-500"
             style={{ borderColor: 'color-mix(in srgb, var(--club-primary) 55%, var(--border-color))', boxShadow: '0 0 40px color-mix(in srgb, var(--club-primary) 25%, transparent)' }}>
          <ClubBadge id={data.id} name={data.name} size={112} />
        </div>
        
        {/* Información Principal */}
        <div className="relative z-10 flex-1 text-center md:text-left min-w-0">
          <p className="text-[10px] text-[var(--gold-accent)] uppercase tracking-widest font-black mb-2 flex items-center gap-2 justify-center md:justify-start">
            <span className="w-2 h-2 rounded-full bg-[var(--gold-accent)] animate-pulse" />
            {t('Perfil Oficial')}
          </p>
          <h1 className="font-display font-black text-4xl md:text-5xl text-[var(--text-primary)] tracking-tight uppercase leading-none drop-shadow-lg mb-2">
            {data.name}
          </h1>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-3 text-sm text-[var(--text-muted)] font-medium">
            <span className="inline-flex items-center gap-1.5"><Building2 size={14} /> {data.stadium?.name ?? data.city ?? 'Ciudad desconocida'}</span>
            {data.stadium?.capacity != null && (
              <>
                <span className="w-1 h-1 rounded-full bg-[var(--border-color)] mx-1" />
                <span>{data.stadium.capacity.toLocaleString('es-ES')} {t('aficionados')}</span>
              </>
            )}
            <span className="w-1 h-1 rounded-full bg-[var(--border-color)] mx-1" />
            <span>{data.country || vm.country || 'FDF'}</span>
            {data.shortName && (
              <>
                <span className="w-1 h-1 rounded-full bg-[var(--border-color)] mx-1" />
                <span className="font-sans font-bold bg-[var(--bg-elevated)] px-2 py-0.5 rounded text-xs border border-[var(--border-color)]">{data.shortName}</span>
              </>
            )}
          </div>
        </div>
        
        {/* Racha */}
        {data.form?.length ? (
          <div className="relative z-10 flex flex-col items-center md:items-end gap-3 shrink-0 mt-6 md:mt-0">
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">{t('Últimos Partidos')}</span>
            <div className="flex gap-1.5 p-1.5 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-color)] backdrop-blur-sm">
              {data.form.slice(-5).map((f, i) => (
                <span key={i} className="w-8 h-8 rounded-md flex items-center justify-center font-sans font-black text-xs text-white shadow-sm transform hover:-translate-y-1 hover:scale-110 transition-all cursor-default" 
                      style={{ background: FORM_TONE[f.toUpperCase()] ?? 'var(--bg-elevated)' }}>
                  {f.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <Tabs
        tabs={[
          { id: 'resumen', label: 'Resumen' },
          { id: 'plantilla', label: 'Plantilla', count: squad?.length },
          { id: 'palmares', label: 'Palmarés', count: honours?.length },
          { id: 'historial', label: 'Historial' },
          { id: 'finanzas', label: 'Finanzas' },
        ]}
        activeTab={tab}
        onChange={setTab}
      />

      {tab === 'resumen' && (
        <>
          {clubId === club?.id && (
            <RivalWeekPanel variant="banner" />
          )}

          <ClubTacticalRadar
            clubId={clubId}
            npcFormation={data.npcCoach?.tacticalStyle?.favoriteFormation}
            isOwnClub={clubId === club?.id}
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Valoración FDF" value={eur(data.fdfValuation ?? vm.publicFinances.valuation ?? undefined)} tone="gold" icon={<Gauge size={16} />} />
            <KPICard label="Afición" value={data.fans != null ? data.fans.toLocaleString('es-ES') : '—'} tone="green" icon={<Users size={16} />} />
            <KPICard label="Reputación" value={data.reputation ?? '—'} tone="blue" icon={<Star size={16} />} />
            <KPICard label="Aforo" value={data.stadium?.capacity != null ? data.stadium.capacity.toLocaleString('es-ES') : '—'} tone="neutral" icon={<Building2 size={16} />} />
          </div>

          {(data.manager || data.npcCoach) && (
            <div className="mt-4 p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)]">
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">{t('Dirección técnica')}</p>
              {data.manager ? (
                <p className="text-sm text-[var(--text-primary)]"><b>{data.manager.name}</b> · {t('Mánager humano')}</p>
              ) : data.npcCoach ? (
                <>
                  <NpcCoachIdentity npcCoach={data.npcCoach} size={36} showFormation />
                  {data.npcCoach.nationality && (
                    <p className="text-xs text-[var(--text-muted)] mt-2">{data.npcCoach.nationality}</p>
                  )}
                  {data.npcCoach.pressLine && (
                    <p className="text-xs text-[var(--text-muted)] mt-2 italic">&ldquo;{data.npcCoach.pressLine}&rdquo;</p>
                  )}
                  {data.npcCoach.career && (
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      {t('Carrera:')} {data.npcCoach.career.stage ?? t('en curso')}
                      {data.npcCoach.career.monthsInCharge != null ? ` · ${data.npcCoach.career.monthsInCharge} ${t('meses en el cargo')}` : ''}
                      {data.npcCoach.career.previousClubs != null ? ` · ${data.npcCoach.career.previousClubs} ${t('clubes previos')}` : ''}
                      {data.npcCoach.career.dismissalRisk ? ` · ${t('Riesgo:')} ${data.npcCoach.career.dismissalRisk}` : ''}
                    </p>
                  )}
                </>
              ) : null}
            </div>
          )}

          {clubId === club?.id && (
            <div className="mt-2">
              <RivalWeekPanel />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            {/* Panel Estadio/Economía */}
            <div className="bg-black/20 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.1)] transition-all hover:bg-black/30">
              <div className="flex items-center gap-2 px-6 py-4 bg-white/5 border-b border-white/5 font-display font-black text-xs uppercase tracking-widest text-white/90">
                <Building2 size={16} className="text-[var(--gold-accent)]" /> {t('Instalaciones y Caja')}
              </div>
              <div className="p-5 flex flex-col gap-3">
                <div className="flex justify-between items-center py-2 border-b border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]">
                  <span className="text-[var(--text-muted)] text-sm font-medium">{t('Nombre Estadio')}</span>
                  <b className="text-sm font-bold">{data.stadium?.name ?? '—'}</b>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[color-mix(in_srgb,var(--border-color)_50%,transparent)]">
                  <span className="text-[var(--text-muted)] text-sm font-medium">{t('Capacidad')}</span>
                  <b className="text-sm font-sans font-bold">{data.stadium?.capacity?.toLocaleString('es-ES') ?? '—'}</b>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/5">
                  <span className="text-white/60 text-sm font-bold uppercase tracking-wider text-[10px]">{t('Caja Disponible')}</span>
                  <b className="text-lg font-sans font-black text-[var(--gold-accent)] drop-shadow-[0_0_5px_var(--gold-accent)]">{eur(data.budget ?? data.cash)}</b>
                </div>
              </div>
            </div>

            {/* Panel Afición */}
            <div className="bg-black/20 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.1)] transition-all hover:bg-black/30">
              <div className="flex items-center gap-2 px-6 py-4 bg-white/5 border-b border-white/5 font-display font-black text-xs uppercase tracking-widest text-white/90">
                <Heart size={16} className="text-violet-400 drop-shadow-[0_0_5px_rgba(167,139,250,0.8)] animate-pulse" /> {t('Estado de la Afición')}
              </div>
              <div className="p-5 flex flex-col gap-6">
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-bold">{t('Fidelidad')}</span>
                  </div>
                  <StatBar value={data.fanBase?.loyalty ?? 0} max={100} showValue color="violet" />
                </div>
                <div>
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-bold">{t('Ánimo')}</span>
                  </div>
                  <StatBar value={mood ?? 0} max={100} showValue color={cn((mood ?? 0) >= 60 ? 'green' : (mood ?? 0) >= 40 ? 'amber' : 'red') as 'green' | 'amber' | 'red'} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'plantilla' && (
        <div className="bg-black/20 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.1)] p-2">
          {squad === null
            ? <Skeleton height={220} className="m-4" />
            : squad.length === 0
              ? <div className="p-8 text-center text-[var(--text-muted)] text-sm">{t('Plantilla no disponible.')}</div>
              : <SortableTable columns={squadCols} data={squad} initialSort={{ key: 'ovr', dir: 'desc' }} rowKey={r => r.id} />}
        </div>
      )}

      {tab === 'palmares' && (
        <div className="bg-black/20 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.1)]">
          {honours === null
            ? <Skeleton height={180} className="m-4" />
            : honoursByComp.length === 0
              ? <div className="p-8 text-center text-[var(--text-muted)] text-sm">{t('Vitrina vacía… de momento.')}</div>
              : <div className="p-5 flex flex-col gap-8">
                  {honoursByComp.map(([comp, items]) => (
                    <div key={comp}>
                      <div className="flex items-center gap-2 mb-4">
                        <Medal size={16} className="text-[var(--gold-accent)]" />
                        <h3 className="font-display font-black text-sm uppercase tracking-widest text-[var(--text-primary)]">{comp}</h3>
                        <span className="bg-[color-mix(in_srgb,var(--gold-accent)_15%,transparent)] text-[var(--gold-accent)] px-2 py-0.5 rounded text-xs font-bold">×{items.length}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {items.map(h => <TrophyCard key={h.id} award={{ id: h.id, name: h.name, season: h.season ?? '' }} />)}
                      </div>
                    </div>
                  ))}
                </div>}
        </div>
      )}

      {tab === 'historial' && (
        <div className="bg-black/20 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.1)] p-2">
          {!data.history?.seasons || data.history.seasons.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-muted)] text-sm">{t('No hay registros históricos disponibles.')}</div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-[var(--border-color)]">
                <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-3">{t('Línea temporal')}</p>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {[...data.history.seasons].sort((a, b) => String(b.season).localeCompare(String(a.season))).slice(0, 8).map((s) => (
                    <div key={s.season} className="shrink-0 min-w-[88px] p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] text-center">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase">{s.season}</div>
                      <div className="font-display font-black text-xl text-[var(--green-primary)]">#{s.rank ?? '—'}</div>
                      <div className="text-xs text-[var(--text-muted)]">{s.points ?? 0} {t('pts')}</div>
                    </div>
                  ))}
                </div>
              </div>
            <SortableTable
              columns={[
                { key: 's', header: 'Temporada', render: r => <b className="font-sans">{r.season}</b>, sortValue: r => r.season },
                { key: 'p', header: 'Posición', align: 'center', render: r => r.rank ? <span className="font-bold">#{r.rank}</span> : '—', sortValue: r => r.rank ?? 999 },
                { key: 'pts', header: 'Puntos', align: 'right', render: r => <span className="font-sans font-bold">{r.points ?? '—'}</span>, sortValue: r => r.points ?? 0 },
                { key: 'gf', header: 'GF', align: 'right', render: r => <span className="font-sans text-[var(--green-primary)]">{r.goalsFor ?? '—'}</span>, sortValue: r => r.goalsFor ?? 0 },
                { key: 'gc', header: 'GC', align: 'right', render: r => <span className="font-sans text-[var(--red-danger)]">{r.goalsAgainst ?? '—'}</span>, sortValue: r => r.goalsAgainst ?? 0 },
              ]}
              data={data.history.seasons}
              initialSort={{ key: 's', dir: 'desc' }}
              rowKey={r => r.season}
            />
            </>
          )}
        </div>
      )}

      {tab === 'finanzas' && (
        <div className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-2xl overflow-hidden shadow-lg">
          <div className="px-6 py-5 border-b border-[var(--border-color)] bg-gradient-to-r from-[color-mix(in_srgb,var(--club-primary,var(--green-primary))_12%,transparent)] to-transparent">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)] font-bold">{t('Informe anual · datos públicos')}</p>
            <h2 className="font-display font-black text-2xl text-[var(--text-primary)] mt-1">{t('Memoria económica')} {data.name}</h2>
            <p className="text-sm text-[var(--text-muted)] mt-2 max-w-2xl leading-relaxed">
              {t('El club presenta un estado')} <strong>{data.publicFinances?.financialStatus ?? t('estable')}</strong> {t('con valoración categoría')} <strong>{data.publicFinances?.valuationCategory ?? vm.publicFinances.band ?? t('media')}</strong> {t('y masa salarial')}
              <strong> {data.publicFinances?.wageBillCategory ?? t('en línea con la competición')}</strong>.
            </p>
          </div>
          <div className="p-6 grid md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)]">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">
                <BarChart3 size={14} /> {t('Valoración FDF')}
              </div>
              <div className="font-display font-black text-3xl text-[var(--gold-accent)]">{eur(data.fdfValuation ?? vm.publicFinances.valuation ?? undefined)}</div>
              <p className="text-xs text-[var(--text-muted)] mt-2">{t('Categoría:')} {data.publicFinances?.valuationCategory ?? '—'}</p>
            </div>
            <div className="p-5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)]">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--text-muted)] font-bold mb-2">
                <Users size={14} /> {t('Estructura salarial')}
              </div>
              <div className="font-display font-black text-3xl text-[var(--green-primary)]">{data.publicFinances?.wageBillCategory ?? t('Media')}</div>
              <p className="text-xs text-[var(--text-muted)] mt-2">{t('Caja pública:')} {eur(data.budget ?? data.cash)}</p>
            </div>
          </div>
          <div className="px-6 py-4 border-t border-[var(--border-color)] flex justify-between items-center text-sm">
            <span className="uppercase tracking-widest text-[var(--text-muted)] font-bold text-xs">{t('Dictamen auditoría')}</span>
            <span className="px-3 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] font-bold">
              {data.publicFinances?.financialStatus ?? t('Estable')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
