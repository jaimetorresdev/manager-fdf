import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  HeartPulse,
  Search,
  ShieldAlert,
  Shirt,
  Sparkles,
  Star,
  Users,
} from 'lucide-react';
import { clubApi, playersApi, marketApi, academyApi } from '../api/client';
import { useSession } from '../stores/sessionStore';
import { cn } from '../lib/cn';
import { asArray } from '../lib/normalize';
import { Modal, Skeleton, SortableTable, PosBadge, PlayerPortrait, EmptyState, Button, type SortCol } from '../components/ui';
import { getPositionCategory, getPositionOrder } from '../lib/gameUtils';
import { eur } from '../lib/format';
import { PlayerDossier, type DossierPlayer } from '../components/player/PlayerDossier';
import { OfferPanel } from '../components/market/OfferPanel';
import { SportingWorkspaceHeader } from '../components/sporting/SportingWorkspaceHeader';
import { kitFromPlayer } from '../components/match/kitColors';

interface SquadRow {
  id: number;
  firstName?: string; lastName?: string; name?: string;
  position?: string; preferredPosition?: string; age?: number; overall?: number; potential?: number;
  averageRating?: number; formArray?: number[]; marketValue?: number; wage?: number;
  injuries?: unknown[]; suspensions?: unknown[];
  nationality?: string;
  passing?: number; tackling?: number; shooting?: number; organization?: number;
  unmarking?: number; finishing?: number; dribbling?: number; fouls?: number; goalkeeping?: number;
  muscularFitness?: number; mentalSharpness?: number; matchRhythm?: number; fitness?: number;
  squadNumber?: number; reflexes?: number; pressure?: number; morale?: number;
  loanOwnerClubId?: number | null;
  detailedPosition?: string;
  isStarter?: boolean;
  injuredUntil?: string | null;
  suspendedMatches?: number;
  contractYears?: number;
  contractEndAt?: string | null;
  experience?: number;
  isForSale?: boolean;
  matchesPlayed?: number; goals?: number; minutes?: number; passesCompleted?: number; assists?: number; dribbles?: number; shots?: number; shotsOnTarget?: number; interceptions?: number; cleanSheets?: number; yellowCards?: number; redCards?: number; releaseClause?: number; contractUntil?: string | number;
}

const fullName = (r: SquadRow) => (r.name ?? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim()) || 'Jugador';
const isInjured = (r: SquadRow) => Boolean(r.injuredUntil) || (r.injuries?.length ?? 0) > 0;
const isSuspended = (r: SquadRow) => (r.suspendedMatches ?? 0) > 0 || (r.suspensions?.length ?? 0) > 0;
const isUnavailable = (r: SquadRow) => isInjured(r) || isSuspended(r);
const numberValue = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const average = (values: number[]) => values.length > 0 ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

function toDossier(r: SquadRow, club?: { primaryColor?: string; secondaryColor?: string; badge?: string; id?: number; name?: string } | null): DossierPlayer {
  const kit = club?.primaryColor
    ? { primary: club.primaryColor, secondary: club.secondaryColor ?? club.primaryColor }
    : kitFromPlayer({ club });
  return {
    id: r.id,
    name: fullName(r), position: r.position, preferredPosition: r.preferredPosition, age: r.age, potential: r.potential ?? r.overall,
    nationality: r.nationality, marketValue: r.marketValue, wage: r.wage,
    jerseyColor: kit.primary, jerseySecondary: kit.secondary, squadNumber: r.squadNumber,
    passing: r.passing, tackling: r.tackling, shooting: r.shooting, organization: r.organization,
    unmarking: r.unmarking, finishing: r.finishing, dribbling: r.dribbling, fouls: r.fouls, goalkeeping: r.goalkeeping,
    fitness: r.fitness, muscularFitness: r.muscularFitness, mentalSharpness: r.mentalSharpness, matchRhythm: r.matchRhythm,
    isInjured: isInjured(r), isSuspended: isSuspended(r),
  };
}

const renderDorsal = (r: SquadRow) => r.squadNumber ?? '—';
const renderPais = (r: SquadRow) => r.nationality?.slice(0, 3).toUpperCase() ?? '—';
const renderJugador = (r: SquadRow) => <span className="font-semibold text-white truncate max-w-[150px] inline-block align-bottom">{fullName(r)}</span>;
const renderPos = (r: SquadRow) => r.position ? <PosBadge position={r.position} preferredPosition={r.preferredPosition} short /> : '—';
const renderMed = (r: SquadRow) => <b className="font-display text-white">{r.overall ?? '—'}</b>;
const renderTal = (r: SquadRow) => <span className="text-yellow-500 tracking-[-2px]">{Array.from({ length: Math.min(5, Math.max(1, Math.ceil((r.potential ?? r.overall ?? 50) / 20))) }).map(() => '|').join('')}</span>;
const renderNum = (val?: number | string) => val ?? '—';
const dash = () => <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>—</span>;

/** Portero: POR / PO */
const isGK = (r: SquadRow) => r.position === 'POR' || r.position === 'PO';
/** Renderiza skill de campo (oculta para porteros) */
const field = (fn: (r: SquadRow) => number | undefined) => (r: SquadRow) => isGK(r) ? dash() : renderNum(fn(r));
/** Renderiza skill de portero (oculta para jugadores de campo) */
const gk = (fn: (r: SquadRow) => number | undefined) => (r: SquadRow) => isGK(r) ? renderNum(fn(r)) : dash();

// Orden FDF canónico: PAS · ENT · TIR · REM · DES · REG · FAL · ORG (campo)  |  COL · REF (portero)
const habColumns: SortCol<SquadRow>[] = [
  { key: 'dorsal', header: 'D',      align: 'center', render: renderDorsal, sortValue: r => r.squadNumber ?? 999 },
  { key: 'pais',   header: 'PAÍS',   align: 'center', render: renderPais,   sortValue: r => r.nationality ?? '' },
  { key: 'name',   header: 'JUGADOR',                 render: renderJugador, sortValue: r => fullName(r) },
  { key: 'pos',    header: 'POS',    align: 'center', render: renderPos,    sortValue: r => getPositionOrder(r.position ?? '') },
  { key: 'med',    header: 'MED',    align: 'center', render: renderMed,    sortValue: r => r.overall ?? 0 },
  { key: 'tal',    header: 'TAL',    align: 'center', render: renderTal,    sortValue: r => r.potential ?? 0 },
  // Habilidades de campo (ocultas para porteros)
  { key: 'pas', header: 'PAS', align: 'center', render: field(r => r.passing),      sortValue: r => isGK(r) ? -1 : (r.passing ?? 0) },
  { key: 'ent', header: 'ENT', align: 'center', render: field(r => r.tackling),     sortValue: r => isGK(r) ? -1 : (r.tackling ?? 0) },
  { key: 'tir', header: 'TIR', align: 'center', render: field(r => r.shooting),     sortValue: r => isGK(r) ? -1 : (r.shooting ?? 0) },
  { key: 'rem', header: 'REM', align: 'center', render: field(r => r.finishing),    sortValue: r => isGK(r) ? -1 : (r.finishing ?? 0) },
  { key: 'des', header: 'DES', align: 'center', render: field(r => r.unmarking),    sortValue: r => isGK(r) ? -1 : (r.unmarking ?? 0) },
  { key: 'reg', header: 'REG', align: 'center', render: field(r => r.dribbling),    sortValue: r => isGK(r) ? -1 : (r.dribbling ?? 0) },
  { key: 'fal', header: 'FAL', align: 'center', render: field(r => r.fouls),        sortValue: r => isGK(r) ? -1 : (r.fouls ?? 0) },
  { key: 'org', header: 'ORG', align: 'center', render: field(r => r.organization), sortValue: r => isGK(r) ? -1 : (r.organization ?? 0) },
  // Habilidades de portero (ocultas para jugadores de campo)
  { key: 'sal', header: 'COL', align: 'center', render: gk(r => r.goalkeeping), sortValue: r => isGK(r) ? (r.goalkeeping ?? 0) : -1 },
  { key: 'ref', header: 'REF', align: 'center', render: gk(r => r.reflexes),    sortValue: r => isGK(r) ? (r.reflexes ?? 0) : -1 },
];

const estColumns: SortCol<SquadRow>[] = [
  { key: 'dorsal', header: 'D', align: 'center', render: renderDorsal, sortValue: r => r.squadNumber ?? 999 },
  { key: 'pais', header: 'PAÍS', align: 'center', render: renderPais, sortValue: r => r.nationality ?? '' },
  { key: 'name', header: 'JUGADOR', render: renderJugador, sortValue: r => fullName(r) },
  { key: 'pos', header: 'POS', align: 'center', render: renderPos, sortValue: r => getPositionOrder(r.position ?? '') },
  { key: 'pj', header: 'PJ', align: 'center', render: r => renderNum(r.matchesPlayed), sortValue: r => r.matchesPlayed ?? 0 },
  { key: 'g', header: 'G', align: 'center', render: r => renderNum(r.goals), sortValue: r => r.goals ?? 0 },
  { key: 'min', header: 'MIN', align: 'center', render: r => renderNum(r.minutes), sortValue: r => r.minutes ?? 0 },
  { key: 'pas', header: 'PAS', align: 'center', render: r => renderNum(r.passesCompleted), sortValue: r => r.passesCompleted ?? 0 },
  { key: 'asi', header: 'ASI', align: 'center', render: r => renderNum(r.assists), sortValue: r => r.assists ?? 0 },
  { key: 'reg', header: 'REG', align: 'center', render: r => renderNum(r.dribbles), sortValue: r => r.dribbles ?? 0 },
  { key: 'dis', header: 'DIS', align: 'center', render: r => renderNum(r.shots), sortValue: r => r.shots ?? 0 },
  { key: 'rem', header: 'REM', align: 'center', render: r => renderNum(r.shotsOnTarget), sortValue: r => r.shotsOnTarget ?? 0 },
  { key: 'rob', header: 'ROB', align: 'center', render: r => renderNum(r.tackling), sortValue: r => r.tackling ?? 0 },
  { key: 'int', header: 'INT', align: 'center', render: r => renderNum(r.interceptions), sortValue: r => r.interceptions ?? 0 },
  { key: 'gr', header: 'GR', align: 'center', render: r => renderNum(r.cleanSheets), sortValue: r => r.cleanSheets ?? 0 },
  { key: 'ta', header: 'TA', align: 'center', render: r => renderNum(r.yellowCards), sortValue: r => r.yellowCards ?? 0 },
  { key: 'tr', header: 'TR', align: 'center', render: r => renderNum(r.redCards), sortValue: r => r.redCards ?? 0 },
  { key: 'val', header: 'VAL', align: 'center', render: r => renderNum(r.averageRating), sortValue: r => r.averageRating ?? 0 },
  { key: 'exp', header: 'EXP', align: 'center', render: () => '—', sortValue: () => 0 },
];

const conColumns: SortCol<SquadRow>[] = [
  { key: 'dorsal', header: 'D', align: 'center', render: renderDorsal, sortValue: r => r.squadNumber ?? 999 },
  { key: 'pais', header: 'PAÍS', align: 'center', render: renderPais, sortValue: r => r.nationality ?? '' },
  { key: 'name', header: 'JUGADOR', render: renderJugador, sortValue: r => fullName(r) },
  { key: 'pos', header: 'POS', align: 'center', render: renderPos, sortValue: r => getPositionOrder(r.position ?? '') },
  { key: 'salario', header: 'SALARIO', align: 'right', render: r => eur(r.wage), sortValue: r => r.wage ?? 0 },
  { key: 'clausula', header: 'CLAUSULA', align: 'right', render: r => eur(r.releaseClause), sortValue: r => r.releaseClause ?? 0 },
  { key: 'fin', header: 'FIN CONTRATO', align: 'right', render: r => renderNum(r.contractEndAt ?? r.contractUntil), sortValue: r => r.contractEndAt ?? r.contractUntil ?? 0 },
  { key: 'edad', header: 'EDAD', align: 'right', render: r => renderNum(r.age), sortValue: r => r.age ?? 0 },
];

export function SquadPage() {
  const { t } = useTranslation();
  const { club } = useSession();
  const [rows, setRows] = useState<SquadRow[]>([]);
  const [loanedOutRows, setLoanedOutRows] = useState<SquadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<any>(null);
  const [selected, setSelected] = useState<SquadRow | null>(null);
  const [renewMsg, setRenewMsg] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [updatingStarterId, setUpdatingStarterId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const load = async () => {
      try {
        let data: SquadRow[];
        if (club?.id) {
          // La plantilla propia necesita contrato, estado, titularidad y atributos
          // privados. La ficha pública queda solo como fallback defensivo.
          try { data = await playersApi.getSquad(); } catch { data = await clubApi.getPublicSquad(club.id); }
          const l = await marketApi.squadLimits().catch(() => null);
          if (!cancelled) setLimits(l);
        } else {
          data = await playersApi.getSquad();
        }
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
        if (!cancelled && club?.id) {
          const out = await playersApi.getLoanedOut().catch(() => []);
          if (!cancelled) setLoanedOutRows(Array.isArray(out) ? out : []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('gameplay:squad.loadError'));
      } finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [club?.id, refresh]);

  const [activeTab, setActiveTab] = useState<'skills' | 'contracts' | 'stats'>('skills');
  const [viewMode, setViewMode] = useState<'locker' | 'table'>('locker');
  const [squadSubTab, setSquadSubTab] = useState<'firstTeam' | 'loanedOut' | 'youth'>('firstTeam');
  const [youthRows, setYouthRows] = useState<SquadRow[]>([]);
  const [query, setQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<'all' | 'POR' | 'DEF' | 'MED' | 'DEL'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'starters' | 'available' | 'attention'>('all');
  const [sortBy, setSortBy] = useState<'position' | 'overall' | 'fitness' | 'age'>('position');
  const tableTabs = ['skills', 'contracts', 'stats'] as const;
  const squadTabs = ['firstTeam', 'loanedOut', 'youth'] as const;

  useEffect(() => {
    if (squadSubTab !== 'youth') return;
    let cancelled = false;
    academyApi.get()
      .then((data) => {
        const youth = asArray<{ id: number; age?: number; talent?: number; attrs?: SquadRow }>(data?.youthPlayers);
        if (cancelled) return;
        setYouthRows(youth.map(y => ({
          id: y.id,
          ...(y.attrs ?? {}),
          age: y.age ?? y.attrs?.age,
          potential: y.talent ?? y.attrs?.potential,
          name: y.attrs?.name,
          position: y.attrs?.position,
        })));
      })
      .catch(() => { if (!cancelled) setYouthRows([]); });
    return () => { cancelled = true; };
  }, [squadSubTab]);

  const baseRows = useMemo(() => {
    if (squadSubTab === 'youth') return youthRows;
    if (squadSubTab === 'loanedOut') {
      return loanedOutRows;
    }
    return rows.filter(r => r.loanOwnerClubId == null);
  }, [squadSubTab, rows, youthRows, loanedOutRows]);

  const displayRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es-ES');
    return [...baseRows]
      .filter((player) => !normalizedQuery || fullName(player).toLocaleLowerCase('es-ES').includes(normalizedQuery))
      .filter((player) => positionFilter === 'all' || getPositionCategory(player.position ?? '') === positionFilter)
      .filter((player) => {
        if (statusFilter === 'starters') return Boolean(player.isStarter);
        if (statusFilter === 'available') return !isUnavailable(player);
        if (statusFilter === 'attention') return isUnavailable(player) || numberValue(player.fitness, 100) < 75 || numberValue(player.contractYears, 5) <= 1;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'overall') return numberValue(b.overall) - numberValue(a.overall);
        if (sortBy === 'fitness') return numberValue(b.fitness, 100) - numberValue(a.fitness, 100);
        if (sortBy === 'age') return numberValue(a.age, 99) - numberValue(b.age, 99);
        return getPositionOrder(a.position ?? '') - getPositionOrder(b.position ?? '');
      });
  }, [baseRows, positionFilter, query, sortBy, statusFilter]);

  const firstTeamRows = useMemo(() => rows.filter((player) => player.loanOwnerClubId == null), [rows]);
  const starters = firstTeamRows.filter((player) => player.isStarter);
  const unavailable = firstTeamRows.filter(isUnavailable);
  const unavailableStarters = starters.filter(isUnavailable);
  const expiring = firstTeamRows.filter((player) => numberValue(player.contractYears, 5) <= 1);
  const averageFitness = average(firstTeamRows.map((player) => numberValue(player.fitness, 100)));
  const averageMorale = average(firstTeamRows.map((player) => numberValue(player.morale, 75)));
  const averageOverall = average(firstTeamRows.map((player) => numberValue(player.overall)));
  const lineupReady = starters.length === 11 && unavailableStarters.length === 0;

  async function toggleStarter(player: SquadRow) {
    setUpdatingStarterId(player.id);
    try {
      const nextValue = !player.isStarter;
      await playersApi.setStarter(player.id, nextValue);
      setRows((current) => current.map((row) => row.id === player.id ? { ...row, isStarter: nextValue } : row));
      toast.success(nextValue ? t('gameplay:squad.command.addedToXI') : t('gameplay:squad.command.removedFromXI'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gameplay:squad.command.updateError'));
    } finally {
      setUpdatingStarterId(null);
    }
  }

  return (
    <div className="page-surface squad-command-page">
      <style>{SQUAD_COMMAND_CSS}</style>
      <SportingWorkspaceHeader
        eyebrow={t('gameplay:squad.command.eyebrow')}
        title={t('gameplay:squad.command.title')}
        description={t('gameplay:squad.command.description')}
        alert={{
          tone: lineupReady ? 'good' : unavailableStarters.length > 0 ? 'risk' : 'watch',
          title: lineupReady
            ? t('gameplay:squad.command.xiReady')
            : unavailableStarters.length > 0
              ? t('gameplay:squad.command.unavailableStarters', { count: unavailableStarters.length })
              : t('gameplay:squad.command.xiIncomplete', { count: starters.length }),
          detail: lineupReady
            ? t('gameplay:squad.command.xiReadyHint')
            : t('gameplay:squad.command.xiNeedsWork'),
        }}
        metrics={[
          { label: t('gameplay:squad.command.metrics.squad'), value: firstTeamRows.length, tone: firstTeamRows.length >= 19 && firstTeamRows.length <= 26 ? 'good' : 'watch' },
          { label: t('gameplay:squad.command.metrics.xi'), value: `${starters.length}/11`, tone: starters.length === 11 ? 'good' : 'risk' },
          { label: t('gameplay:squad.command.metrics.overall'), value: averageOverall ?? '—', tone: 'neutral' },
          { label: t('gameplay:squad.command.metrics.fitness'), value: averageFitness != null ? `${averageFitness}%` : '—', tone: averageFitness != null && averageFitness < 75 ? 'risk' : 'good' },
        ]}
      />

      {!loading && !error && squadSubTab === 'firstTeam' && (
        <section className="squad-command-board">
          <div className="squad-command-board__title">
            <span><Sparkles size={15} />{t('gameplay:squad.command.boardTitle')}</span>
            <small>{t('gameplay:squad.command.boardHint')}</small>
          </div>
          <div className="squad-command-board__items">
            <article className={cn(unavailableStarters.length > 0 ? 'is-risk' : 'is-good')}>
              {unavailableStarters.length > 0 ? <ShieldAlert size={18} /> : <CheckCircle2 size={18} />}
              <div>
                <strong>{unavailableStarters.length > 0 ? t('gameplay:squad.command.boardUnavailable', { count: unavailableStarters.length }) : t('gameplay:squad.command.boardAvailable')}</strong>
                <span>{unavailableStarters.length > 0 ? unavailableStarters.map(fullName).slice(0, 3).join(', ') : t('gameplay:squad.command.boardAvailableHint')}</span>
              </div>
            </article>
            <article className={cn(expiring.length > 0 ? 'is-watch' : 'is-good')}>
              <AlertTriangle size={18} />
              <div>
                <strong>{expiring.length > 0 ? t('gameplay:squad.command.boardContracts', { count: expiring.length }) : t('gameplay:squad.command.boardContractsClear')}</strong>
                <span>{expiring.length > 0 ? expiring.map(fullName).slice(0, 3).join(', ') : t('gameplay:squad.command.boardContractsHint')}</span>
              </div>
            </article>
            <article className={cn(unavailable.length > 0 ? 'is-watch' : 'is-good')}>
              <HeartPulse size={18} />
              <div>
                <strong>{t('gameplay:squad.command.boardCondition', { fitness: averageFitness ?? '—', morale: averageMorale ?? '—' })}</strong>
                <span>{unavailable.length > 0 ? t('gameplay:squad.command.boardAbsences', { count: unavailable.length }) : t('gameplay:squad.command.boardNoAbsences')}</span>
              </div>
            </article>
            <article className={cn(limits?.canSign === false ? 'is-watch' : 'is-good')}>
              <Users size={18} />
              <div>
                <strong>{limits?.canSign === false ? t('gameplay:squad.command.boardLimit') : t('gameplay:squad.command.boardRoom')}</strong>
                <span>{limits ? t('gameplay:squad.command.boardLimitDetail', { current: limits.firstTeam, max: limits.limits?.maxFirstTeamPlusIncoming ?? 30 }) : t('gameplay:squad.command.boardLimitPending')}</span>
              </div>
            </article>
          </div>
        </section>
      )}

      <section className="squad-command-controls">
        <div className="squad-command-controls__tabs">
          {squadTabs.map((tabId) => {
            const fallbackCount = tabId === 'firstTeam' ? firstTeamRows.length : tabId === 'loanedOut' ? loanedOutRows.length : youthRows.length;
            const count = limits ? limits[tabId === 'firstTeam' ? 'firstTeam' : tabId === 'loanedOut' ? 'loanedOut' : 'youth'] : fallbackCount;
            return (
              <button key={tabId} type="button" onClick={() => setSquadSubTab(tabId)} className={cn(squadSubTab === tabId && 'is-active')}>
                {t(`gameplay:squad.tabs.${tabId}`)} <span>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="squad-command-controls__views">
          <button type="button" onClick={() => setViewMode('locker')} className={cn(viewMode === 'locker' && 'is-active')}>{t('gameplay:squad.views.locker')}</button>
          <button type="button" onClick={() => setViewMode('table')} className={cn(viewMode === 'table' && 'is-active')}>{t('gameplay:squad.views.table')}</button>
        </div>
      </section>

      <section className="squad-command-filters">
        <label>
          <Search size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('gameplay:squad.command.search')} />
        </label>
        <div>
          <Filter size={13} />
          <select value={positionFilter} onChange={(event) => setPositionFilter(event.target.value as typeof positionFilter)} aria-label={t('gameplay:squad.command.positionFilter')}>
            <option value="all">{t('gameplay:squad.command.allPositions')}</option>
            {/* Position codes are official game abbreviations, not translatable copy. */}
            {/* eslint-disable-next-line no-restricted-syntax */}
            <option value="POR">POR</option>
            {/* eslint-disable-next-line no-restricted-syntax */}
            <option value="DEF">DEF</option>
            {/* eslint-disable-next-line no-restricted-syntax */}
            <option value="MED">MED</option>
            {/* eslint-disable-next-line no-restricted-syntax */}
            <option value="DEL">DEL</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label={t('gameplay:squad.command.statusFilter')}>
            <option value="all">{t('gameplay:squad.command.allStatuses')}</option>
            <option value="starters">{t('gameplay:squad.command.onlyStarters')}</option>
            <option value="available">{t('gameplay:squad.command.onlyAvailable')}</option>
            <option value="attention">{t('gameplay:squad.command.needsAttention')}</option>
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} aria-label={t('gameplay:squad.command.sort')}>
            <option value="position">{t('gameplay:squad.command.sortPosition')}</option>
            <option value="overall">{t('gameplay:squad.command.sortOverall')}</option>
            <option value="fitness">{t('gameplay:squad.command.sortFitness')}</option>
            <option value="age">{t('gameplay:squad.command.sortAge')}</option>
          </select>
        </div>
      </section>

      {loading && <Skeleton height={360} />}

      {!loading && error && (
        <EmptyState
          title={t('gameplay:squad.loadError')}
          hint={error}
          action={<Button variant="secondary" onClick={() => setRefresh((x) => x + 1)}>{t('gameplay:squad.retry')}</Button>}
        />
      )}

      {!loading && !error && baseRows.length === 0 && (
        <EmptyState
          mood="locker"
          kicker={t('gameplay:squad.emptyKicker', 'Vestuario vacío')}
          title={t('gameplay:squad.emptyTitle')}
          hint={t('gameplay:squad.emptyHint')}
        />
      )}

      {!loading && !error && displayRows.length > 0 && viewMode === 'locker' && (
        <div className="squad-command-grid">
          {displayRows.map(r => (
            <article key={r.id} className={cn('squad-command-card', r.isStarter && 'is-starter', isUnavailable(r) && 'is-unavailable')}>
              <button type="button" className="squad-command-card__main" onClick={() => setSelected(r)}>
                <PlayerPortrait id={r.id} size={62} variant="card" age={r.age} jerseyColor={club?.primaryColor ?? kitFromPlayer({ club }).primary} jerseySecondary={club?.secondaryColor ?? kitFromPlayer({ club }).secondary} dorsal={r.squadNumber} />
                <span className="squad-command-card__identity">
                  <small>{r.isStarter ? t('gameplay:squad.command.roleStarter') : t('gameplay:squad.command.roleRotation')}</small>
                  <strong>{fullName(r)}</strong>
                  <em>{r.detailedPosition ?? r.position ?? '—'} · {r.age ?? '—'} {t('gameplay:squad.command.years')}</em>
                </span>
                <span className="squad-command-card__overall">{r.overall ?? '—'}</span>
              </button>
              <div className="squad-command-card__status">
                {isInjured(r) && <span className="is-risk">{t('gameplay:squad.status.injured')}</span>}
                {isSuspended(r) && <span className="is-watch">{t('gameplay:squad.status.suspended')}</span>}
                {!isUnavailable(r) && <span className="is-good">{t('gameplay:squad.status.available')}</span>}
                {numberValue(r.contractYears, 5) <= 1 && <span className="is-watch">{t('gameplay:squad.command.contractShort')}</span>}
              </div>
              <div className="squad-command-card__metrics">
                <span><small>{t('gameplay:squad.command.cardFitness')}</small><strong>{numberValue(r.fitness, 100)}%</strong><i><b style={{ width: `${numberValue(r.fitness, 100)}%` }} /></i></span>
                <span><small>{t('gameplay:squad.command.cardMorale')}</small><strong>{numberValue(r.morale, 75)}%</strong><i><b style={{ width: `${numberValue(r.morale, 75)}%` }} /></i></span>
                <span><small>{t('gameplay:squad.command.cardValue')}</small><strong>{eur(r.marketValue)}</strong></span>
                <span><small>{t('gameplay:squad.command.cardContract')}</small><strong>{r.contractYears != null ? t('gameplay:squad.command.contractYears', { count: r.contractYears }) : '—'}</strong></span>
              </div>
              {squadSubTab === 'firstTeam' && (
                <div className="squad-command-card__footer">
                  <button type="button" onClick={() => setSelected(r)}>{t('gameplay:squad.command.openDossier')}</button>
                  <button type="button" disabled={updatingStarterId === r.id || (!r.isStarter && isUnavailable(r))} onClick={() => void toggleStarter(r)}>
                    {r.isStarter ? <><Star size={12} />{t('gameplay:squad.command.removeXI')}</> : <><Shirt size={12} />{t('gameplay:squad.command.addXI')}</>}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {!loading && !error && baseRows.length > 0 && displayRows.length === 0 && (
        <EmptyState
          icon={<Filter size={26} />}
          title={t('gameplay:squad.command.noFilterResults')}
          hint={t('gameplay:squad.command.noFilterResultsHint')}
          action={<Button variant="secondary" onClick={() => { setQuery(''); setPositionFilter('all'); setStatusFilter('all'); }}>{t('gameplay:squad.command.clearFilters')}</Button>}
        />
      )}

      {!loading && !error && displayRows.length > 0 && viewMode === 'table' && (
        <div className="squad-command-table">
          <div className="squad-command-table__tabs">
            {tableTabs.map((tabId) => (
              <button key={tabId} type="button" onClick={() => setActiveTab(tabId)} className={cn(activeTab === tabId && 'is-active')}>
                {t(`gameplay:squad.tableTabs.${tabId}`)}
              </button>
            ))}
          </div>
          <div className="dense-table">
            {activeTab === 'skills' && <SortableTable columns={habColumns} data={displayRows} rowKey={r => r.id} onRowClick={r => setSelected(r)} initialSort={{ key: 'med', dir: 'desc' }} />}
            {activeTab === 'contracts' && <SortableTable columns={conColumns} data={displayRows} rowKey={r => r.id} onRowClick={r => setSelected(r)} initialSort={{ key: 'salario', dir: 'desc' }} />}
            {activeTab === 'stats' && <SortableTable columns={estColumns} data={displayRows} rowKey={r => r.id} onRowClick={r => setSelected(r)} initialSort={{ key: 'pj', dir: 'desc' }} />}
          </div>
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? fullName(selected) : ''} width={1100}>
        {selected && (
          <div className="bg-[var(--bg-surface)] p-6 relative rounded-lg">
            <div className="flex flex-col gap-3 font-sans text-[var(--text-primary)]">
              <PlayerDossier player={toDossier(selected, club)} />
              <div className="flex justify-end">
                <Link to={`/player/${selected.id}`} className="font-display font-bold text-xs uppercase tracking-wide text-[var(--green-primary)] hover:brightness-125">
                  {t('gameplay:squad.fullProfile')}
                </Link>
              </div>
            <details>
              <summary className="cursor-pointer text-xs uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                {t('gameplay:squad.renewOffer')}
              </summary>
              <div className="mt-2">
                {renewMsg && <p className="text-xs text-[var(--gold-accent)] mb-2">{renewMsg}</p>}
                <OfferPanel
                  mode="renew"
                  player={{ id: selected.id, name: fullName(selected), age: selected.age, marketValue: selected.marketValue, currentSalary: selected.wage }}
                  onSubmit={async (offer) => {
                    try {
                      const res = await marketApi.renew(selected.id, offer.salary, offer.years, offer.clause);
                      if (res?.accepted) { setRenewMsg(null); setSelected(null); setRefresh(x => x + 1); }
                      else setRenewMsg(res?.message ?? 'El jugador rechaza la renovación.');
                    } catch (e) {
                      setRenewMsg(e instanceof Error ? e.message : 'No se pudo renovar.');
                    }
                  }}
                />
              </div>
            </details>
          </div>
        </div>
        )}
      </Modal>
    </div>
  );
}

const SQUAD_COMMAND_CSS = `
.squad-command-page{display:flex;flex-direction:column;gap:14px}
.squad-command-board{padding:14px;border:1px solid var(--border-color);border-radius:14px;background:var(--bg-surface);box-shadow:var(--shadow-soft)}
.squad-command-board__title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.squad-command-board__title span{display:flex;align-items:center;gap:7px;font-family:var(--font-display);font-size:.82rem;font-weight:850;color:var(--text-primary);text-transform:uppercase}
.squad-command-board__title span svg{color:var(--club-primary)}
.squad-command-board__title small{color:var(--text-muted);font-size:.62rem}
.squad-command-board__items{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.squad-command-board__items article{--board-tone:var(--green-primary);min-width:0;padding:10px;display:flex;align-items:center;gap:9px;border:1px solid color-mix(in srgb,var(--board-tone) 22%,var(--border-color));border-radius:10px;background:color-mix(in srgb,var(--board-tone) 5%,var(--bg-elevated))}
.squad-command-board__items article.is-watch{--board-tone:var(--gold-accent)}
.squad-command-board__items article.is-risk{--board-tone:var(--red-danger)}
.squad-command-board__items article>svg{flex:0 0 auto;color:var(--board-tone)}
.squad-command-board__items article div{min-width:0;display:flex;flex-direction:column;gap:2px}
.squad-command-board__items strong{overflow:hidden;color:var(--text-primary);font-size:.69rem;text-overflow:ellipsis;white-space:nowrap}
.squad-command-board__items span{overflow:hidden;color:var(--text-muted);font-size:.59rem;text-overflow:ellipsis;white-space:nowrap}
.squad-command-controls{padding:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-surface)}
.squad-command-controls__tabs,.squad-command-controls__views{display:flex;gap:5px;flex-wrap:wrap}
.squad-command-controls button{padding:7px 10px;border:1px solid transparent;border-radius:8px;color:var(--text-muted);background:transparent;cursor:pointer;font-size:.68rem;font-weight:750}
.squad-command-controls button:hover{color:var(--text-primary);background:var(--row-hover)}
.squad-command-controls button.is-active{color:var(--club-primary);border-color:color-mix(in srgb,var(--club-primary) 35%,var(--border-color));background:color-mix(in srgb,var(--club-primary) 9%,var(--bg-elevated))}
.squad-command-controls button span{margin-left:4px;padding:1px 5px;border-radius:99px;background:var(--bg-base);font-family:var(--font-scoreboard);font-size:.58rem}
.squad-command-filters{padding:9px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--border-color);border-radius:11px;background:var(--bg-elevated)}
.squad-command-filters label{min-width:210px;display:flex;align-items:center;gap:7px;flex:1;color:var(--text-muted)}
.squad-command-filters input{width:100%;border:none;outline:none;color:var(--text-primary);background:transparent;font-size:.72rem}
.squad-command-filters>div{display:flex;align-items:center;gap:6px;color:var(--text-muted)}
.squad-command-filters select{padding:6px 8px;border:1px solid var(--border-color);border-radius:7px;color:var(--text-muted);background:var(--bg-surface);font-size:.66rem}
.squad-command-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.squad-command-card{position:relative;overflow:hidden;border:1px solid var(--border-color);border-radius:13px;background:var(--bg-surface);box-shadow:var(--shadow-soft);transition:transform .18s ease,border-color .18s ease}
.squad-command-card:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--club-primary) 42%,var(--border-color))}
.squad-command-card.is-starter::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--club-primary)}
.squad-command-card.is-unavailable::after{content:"";position:absolute;inset:0 0 auto;height:2px;background:var(--red-danger)}
.squad-command-card__main{width:100%;padding:12px;display:grid;grid-template-columns:62px minmax(0,1fr) 36px;align-items:center;gap:10px;border:none;color:var(--text-primary);background:transparent;cursor:pointer;text-align:left}
.squad-command-card__identity{min-width:0;display:flex;flex-direction:column}
.squad-command-card__identity small{color:var(--club-primary);font-size:.52rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
.squad-command-card__identity strong{overflow:hidden;font-size:.78rem;text-overflow:ellipsis;white-space:nowrap}
.squad-command-card__identity em{overflow:hidden;color:var(--text-muted);font-size:.59rem;font-style:normal;text-overflow:ellipsis;white-space:nowrap}
.squad-command-card__overall{width:36px;height:36px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--club-primary) 30%,var(--border-color));border-radius:10px;color:var(--club-primary);background:color-mix(in srgb,var(--club-primary) 7%,var(--bg-elevated));font-family:var(--font-scoreboard);font-size:.82rem}
.squad-command-card__status{min-height:24px;padding:0 12px 7px;display:flex;gap:5px;flex-wrap:wrap}
.squad-command-card__status span{padding:2px 5px;border-radius:4px;font-size:.52rem;font-weight:800;text-transform:uppercase}
.squad-command-card__status .is-good{color:var(--green-primary);background:color-mix(in srgb,var(--green-primary) 9%,transparent)}
.squad-command-card__status .is-watch{color:var(--gold-accent);background:color-mix(in srgb,var(--gold-accent) 10%,transparent)}
.squad-command-card__status .is-risk{color:var(--red-danger);background:color-mix(in srgb,var(--red-danger) 9%,transparent)}
.squad-command-card__metrics{padding:9px 12px;display:grid;grid-template-columns:1fr 1fr;gap:7px;border-top:1px solid var(--border-color);background:var(--bg-elevated)}
.squad-command-card__metrics>span{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px}
.squad-command-card__metrics small{overflow:hidden;color:var(--text-muted);font-size:.52rem;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase}
.squad-command-card__metrics strong{color:var(--text-primary);font-family:var(--font-scoreboard);font-size:.62rem}
.squad-command-card__metrics i{grid-column:1/-1;height:3px;overflow:hidden;border-radius:99px;background:var(--bg-base)}
.squad-command-card__metrics i b{height:100%;display:block;border-radius:inherit;background:var(--club-primary)}
.squad-command-card__footer{padding:7px;display:grid;grid-template-columns:1fr 1fr;gap:5px;border-top:1px solid var(--border-color)}
.squad-command-card__footer button{padding:6px;display:flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--border-color);border-radius:7px;color:var(--text-muted);background:transparent;cursor:pointer;font-size:.59rem;font-weight:750}
.squad-command-card__footer button:hover:not(:disabled){color:var(--text-primary);border-color:color-mix(in srgb,var(--club-primary) 40%,var(--border-color));background:var(--row-hover)}
.squad-command-card__footer button:disabled{opacity:.4;cursor:not-allowed}
.squad-command-table{overflow:hidden;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-surface)}
.squad-command-table__tabs{padding:8px;display:flex;gap:5px;border-bottom:1px solid var(--border-color)}
.squad-command-table__tabs button{padding:6px 10px;border:1px solid transparent;border-radius:7px;color:var(--text-muted);background:transparent;cursor:pointer;font-size:.64rem;font-weight:750;text-transform:uppercase}
.squad-command-table__tabs button.is-active{color:var(--club-primary);border-color:color-mix(in srgb,var(--club-primary) 34%,var(--border-color));background:color-mix(in srgb,var(--club-primary) 8%,var(--bg-elevated))}
.dense-table .st-wrap{border:0!important;border-radius:0!important;background:var(--bg-surface)}
.dense-table .st th{padding:6px 8px!important;background:var(--bg-elevated)!important;color:var(--text-muted)!important;font-size:.65rem!important}
.dense-table .st td{padding:6px 8px!important;border-top:1px solid var(--border-color)!important;color:var(--text-primary)!important;font-size:.75rem!important}
@media(max-width:1120px){.squad-command-board__items,.squad-command-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.squad-command-controls,.squad-command-filters{align-items:stretch;flex-direction:column}.squad-command-filters label{min-width:0}.squad-command-filters>div{overflow-x:auto}.squad-command-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.squad-command-board__items{grid-template-columns:repeat(2,minmax(0,1fr))}.squad-command-card__main{padding:9px;grid-template-columns:minmax(0,1fr) 32px;gap:6px}.squad-command-card__main>:first-child{display:none}.squad-command-card__overall{width:32px;height:32px}.squad-command-card__status{min-height:20px;padding:0 9px 5px}.squad-command-card__metrics{padding:7px 9px;gap:5px}.squad-command-card__footer{grid-template-columns:1fr}.squad-command-card__footer button:first-child{display:none}}
@media(max-width:350px){.squad-command-grid{grid-template-columns:1fr}}
`;
