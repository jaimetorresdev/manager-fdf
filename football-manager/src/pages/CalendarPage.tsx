// ─── Calendario · Mes in-game real + vista lista por jornadas (E17 · LOTE C) ───
// Página estrella del lote: calendario MENSUAL de 7 columnas construido a partir
// de las fechas IN-GAME derivadas de los fixtures (jornada → fecha vía el reloj
// del juego), con chips por competición, HOY con anillo, V/E/D en pasados y
// toggle a la vista lista clásica por jornadas. La lógica de datos/táctica/
// simulación es la misma que ya existía.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button, ClubBadge, Skeleton, EmptyState, ConfirmModal } from '../components/ui';
import { ClubLink } from '../components/common/EntityLink';
import { RivalWeekPanel } from '../components/competition/RivalWeekPanel';
import { cn } from '../lib/cn';
import { asArray } from '../lib/normalize';
import { matchesApi, gameApi, worldApi } from '../api/client';
import { useSession } from '../stores/sessionStore';
import {
  ChevronLeft, ChevronRight, Play, Settings, RefreshCw, Loader2,
  Calendar, CalendarDays, List, Eye, Crosshair,
} from 'lucide-react';
import { MonthCalendar, type CalendarMatch } from '../components/calendar/MonthCalendar';
import {
  competitionKind, matchdayDateKey, isoDatePart, keyToUTC, monthLabel,
  KIND_COLOR, KIND_LABEL,
} from '../components/calendar/inGameDates';
import { deriveMaxMatchweek } from '../lib/calendarWeeks';

type Match = {
  id: number;
  status: 'scheduled' | 'played' | 'postponed';
  homeClubId: number;
  awayClubId: number;
  homeClub?: { name: string; shortName?: string; city?: string };
  awayClub?: { name: string; shortName?: string; city?: string };
  homeGoals: number | null;
  awayGoals: number | null;
  resultHidden?: boolean;
  homeFormation: string;
  awayFormation: string;
  homeConstruction: number;
  awayConstruction: number;
  homeDestruction: number;
  awayDestruction: number;
  competition?: { name: string; shortName?: string };
  matchdayNum?: number;
  week?: number;
  playedAt?: string | null;
};

const formations = ['4-4-2', '4-3-3', '3-5-2', '5-3-2', '4-5-1', '4-2-3-1', '3-4-3', '4-1-4-1'];

function matchWeek(match: Match) {
  return match.matchdayNum ?? match.week ?? 1;
}

function clubName(match: Match, side: 'home' | 'away') {
  return side === 'home'
    ? match.homeClub?.name ?? 'Local'
    : match.awayClub?.name ?? 'Visitante';
}

function TacticsPanel({ match, isHome, onSave, onClose }: {
  match: Match; isHome: boolean;
  onSave: (f: string, c: number, d: number) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [formation, setFormation] = useState(isHome ? match.homeFormation : match.awayFormation);
  const [construction, setConstruction] = useState(isHome ? match.homeConstruction : match.awayConstruction);
  const [destruction, setDestruction] = useState(isHome ? match.homeDestruction : match.awayDestruction);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(formation, construction, destruction);
    setSaving(false); onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--overlay-backdrop)' }}>
      <div
        className="w-full max-w-md"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '1rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}
      >
        <div className="p-5" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--panel-gradient)' }}>
          <p className="muted-label">{t('gameplay:calendar.tacticsPanel.kicker')}</p>
          <h2 className="section-title" style={{ fontSize: '1.1rem' }}>{t('gameplay:calendar.tacticsPanel.title', { week: matchWeek(match) })}</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('gameplay:calendar.tacticsPanel.vs', { home: clubName(match, 'home'), away: clubName(match, 'away') })}</p>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label id="calendar-tactics-formation-label" htmlFor="calendar-tactics-formation" className="block text-xs font-semibold text-[var(--text-muted)] mb-2">{t('gameplay:calendar.tacticsPanel.formation')}</label>
            <div id="calendar-tactics-formation" role="group" aria-labelledby="calendar-tactics-formation-label" className="grid grid-cols-4 gap-2">
              {formations.map(f => (
                <button key={f} onClick={() => setFormation(f)}
                  style={{ fontFamily: 'var(--font-sans)' }}
                  className={cn('px-2 py-2 rounded-lg text-xs font-bold border-2 transition-all',
                    formation === f
                      ? 'border-[var(--green-primary)] bg-[color-mix(in_srgb,var(--green-primary)_15%,transparent)] text-[var(--green-primary)]'
                      : 'border-[var(--border-color)] text-[var(--text-muted)] hover:border-[var(--border-color)] hover:text-[var(--text-primary)]')}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="calendar-tactics-construction" className="text-xs font-semibold text-[var(--text-muted)]">{t('gameplay:calendar.tacticsPanel.construction')}</label>
              <span className="text-xs text-[var(--blue-info)]" style={{ fontFamily: 'var(--font-sans)' }}>{construction}%</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>{t('gameplay:calendar.tacticsPanel.defensive')}</span>
              <input id="calendar-tactics-construction" type="range" min={0} max={100} value={construction}
                onChange={e => setConstruction(Number(e.target.value))}
                className="flex-1 accent-[var(--blue-info)]" />
              <span>{t('gameplay:calendar.tacticsPanel.offensive')}</span>
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="calendar-tactics-destruction" className="text-xs font-semibold text-[var(--text-muted)]">{t('gameplay:calendar.tacticsPanel.destruction')}</label>
              <span className="text-xs text-[var(--red-danger)]" style={{ fontFamily: 'var(--font-sans)' }}>{destruction}%</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>{t('gameplay:calendar.tacticsPanel.calm')}</span>
              <input id="calendar-tactics-destruction" type="range" min={0} max={100} value={destruction}
                onChange={e => setDestruction(Number(e.target.value))}
                className="flex-1 accent-[var(--red-danger)]" />
              <span>{t('gameplay:calendar.tacticsPanel.aggressive')}</span>
            </div>
          </div>
        </div>
        <div className="p-5 pt-0 flex gap-3">
          <Button variant="secondary" size="md" onClick={onClose} className="flex-1">{t('gameplay:calendar.tacticsPanel.cancel')}</Button>
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
            {t('gameplay:calendar.tacticsPanel.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function cardKeyActivate(e: React.KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); }
}

export function CalendarPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { club, user } = useSession();
  const isAdmin = user?.role === 'admin' || user?.role === 'master';
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [isApiAvailable, setIsApiAvailable] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [inGameDate, setInGameDate] = useState<string | null>(null);
  const [competitionMaxMatchdays, setCompetitionMaxMatchdays] = useState(0);
  const [viewWeek, setViewWeek] = useState(1);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [simulating, setSimulating] = useState<number | null>(null);
  const [advancingTurn, setAdvancingTurn] = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState(false);
  const [confirmSimulate, setConfirmSimulate] = useState<Match | null>(null);
  // E17: vista mes (por defecto) o lista por jornadas
  const [view, setView] = useState<'month' | 'list'>('month');
  // Mes visible en el grid: { year, month0 }; null hasta tener inGameDate
  const [viewMonth, setViewMonth] = useState<{ year: number; month0: number } | null>(null);
  const myClubId = club?.id ?? -1;

  const maxWeek = useMemo(
    () => deriveMaxMatchweek(matches, currentWeek, competitionMaxMatchdays),
    [matches, currentWeek, competitionMaxMatchdays],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [matchData, state, comps] = await Promise.all([
        matchesApi.getCalendar(),
        gameApi.getState(),
        worldApi.competitions().catch(() => ({ competitions: [] })),
      ]);
      setMatches(asArray<Match>(matchData));
      const week = state.seasonWeek ?? state.week ?? 1;
      setCurrentWeek(week); setViewWeek(week);
      setInGameDate(state.inGameDate ?? null);
      const compMax = asArray<any>(comps?.competitions).reduce(
        (max, c) => Math.max(max, c?.matchdayCount ?? 0),
        0,
      );
      setCompetitionMaxMatchdays(compMax);
      if (state.inGameDate) {
        const key = isoDatePart(state.inGameDate);
        const d = new Date(keyToUTC(key));
        setViewMonth({ year: d.getUTCFullYear(), month0: d.getUTCMonth() });
      }
      setIsApiAvailable(true);
    } catch {
      setMatches([]); setIsApiAvailable(false);
      toast.error(t('gameplay:calendar.loadError'));
    } finally { setLoading(false); }
  }, [t]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSaveTactics(formation: string, construction: number, destruction: number) {
    if (!selectedMatch || !isApiAvailable) return;
    try {
      await matchesApi.saveTactics(selectedMatch.id, formation, construction, destruction);
      const isHome = selectedMatch.homeClubId === myClubId;
      setMatches(prev => prev.map(m => m.id === selectedMatch.id
        ? isHome
          ? { ...m, homeFormation: formation, homeConstruction: construction, homeDestruction: destruction }
          : { ...m, awayFormation: formation, awayConstruction: construction, awayDestruction: destruction }
        : m));
      toast.success(t('gameplay:calendar.toasts.tacticsSaved'));
    } catch (e: any) { toast.error(t('gameplay:calendar.toasts.tacticsSaveError', { msg: e?.message ?? 'desconocido' })); }
  }

  async function handleSimulate(match: Match) {
    if (!isApiAvailable) { toast.error(t('gameplay:calendar.toasts.serverUnavailable')); return; }
    setSimulating(match.id);
    try {
      await gameApi.simulateMatch(match.id);
      await loadData();
      navigate(`/matches/${match.id}`);
    }
    catch (e: any) { toast.error(t('gameplay:calendar.toasts.simulateError', { msg: e?.message ?? 'desconocido' })); }
    finally { setSimulating(null); }
  }

  async function handleAdvanceTurn() {
    if (!isApiAvailable) { toast.error(t('gameplay:calendar.toasts.serverUnavailable')); return; }
    setAdvancingTurn(true);
    try {
      const res = await gameApi.advance();
      toast.success(t('gameplay:calendar.toasts.advanceSuccess', { count: res.matchesSimulated ?? 0 }));
      loadData();
    } catch (e: any) { toast.error(t('gameplay:calendar.toasts.advanceError', { msg: e?.message ?? 'desconocido' })); }
    finally { setAdvancingTurn(false); }
  }

  // Deduplica por ENFRENTAMIENTO (jornada+local+visitante+competicion), no por id: si la BD
  // tiene filas duplicadas del mismo partido (ids distintos), solo mostramos una.
  const dedupedMatches = useMemo(() => {
    const seen = new Set<string>();
    return matches.filter(m => {
      const compKey = m.competition?.name ?? 'friendly';
      const key = `${matchWeek(m)}-${m.homeClubId}-${m.awayClubId}-${compKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [matches]);

  const weekMatches = dedupedMatches.filter(m => matchWeek(m) === viewWeek);

  // ── E17: fechado in-game + agrupación por día (clave YYYY-MM-DD, todo en UTC
  //    a partir de la parte de fecha del ISO — sin new Date() local) ──────────
  const todayKey = inGameDate ? isoDatePart(inGameDate) : '';

  const datedMatches: CalendarMatch[] = useMemo(() => {
    if (!inGameDate) return [];
    return dedupedMatches.map(m => {
      const kind = competitionKind(m.competition?.name, m.competition?.shortName);
      return {
        ...m,
        kind,
        dateKey: matchdayDateKey(matchWeek(m), inGameDate, currentWeek, kind),
      };
    });
  }, [dedupedMatches, inGameDate, currentWeek]);

  const matchesByDay = useMemo(() => {
    const map = new Map<string, CalendarMatch[]>();
    for (const m of datedMatches) {
      const list = map.get(m.dateKey);
      if (list) list.push(m); else map.set(m.dateKey, [m]);
    }
    return map;
  }, [datedMatches]);

  // Competiciones presentes (para la leyenda)
  const kindsPresent = useMemo(() => {
    const s = new Set(datedMatches.map(m => m.kind));
    return (['league', 'cup', 'european', 'friendly'] as const).filter(k => s.has(k));
  }, [datedMatches]);

  function shiftMonth(delta: number) {
    setViewMonth(vm => {
      if (!vm) return vm;
      const d = new Date(Date.UTC(vm.year, vm.month0 + delta, 1));
      return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
    });
  }

  function goToday() {
    if (!todayKey) return;
    const d = new Date(keyToUTC(todayKey));
    setViewMonth({ year: d.getUTCFullYear(), month0: d.getUTCMonth() });
  }

  function openMatch(m: CalendarMatch) {
    const mine = m.homeClubId === myClubId || m.awayClubId === myClubId;
    if (m.status !== 'played' && mine) {
      // Mi partido pendiente → pizarra rápida (misma acción que la vista lista)
      const full = dedupedMatches.find(x => x.id === m.id);
      if (full) { setSelectedMatch(full); return; }
    }
    navigate(`/matches/${m.id}`);
  }

  const getResultBadge = (m: Match) => {
    if (m.resultHidden) return null;
    if (m.status !== 'played' || m.homeGoals === null || m.awayGoals === null) return null;
    const isHome = m.homeClubId === myClubId;
    const myGoals = isHome ? m.homeGoals : m.awayGoals;
    const theirGoals = isHome ? m.awayGoals : m.homeGoals;
    if (myGoals > theirGoals) return { label: 'V', tone: 'var(--green-primary)' };
    if (myGoals < theirGoals) return { label: 'D', tone: 'var(--red-danger)' };
    return { label: 'E', tone: 'var(--gold-accent)' };
  };

  const monthHasMatches = viewMonth
    ? datedMatches.some(m => {
        const d = new Date(keyToUTC(m.dateKey));
        return d.getUTCFullYear() === viewMonth.year && d.getUTCMonth() === viewMonth.month0;
      })
    : false;

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .cal-hero {
          position: relative; overflow: hidden; display: flex; flex-wrap: wrap; align-items: center; gap: 24px; padding: 32px 40px;
          border-radius: 20px; background: linear-gradient(145deg, var(--brutal-bg-1), var(--brutal-bg-2)); border: 2px solid rgba(34,197,94,0.3); 
          box-shadow: 0 20px 50px var(--brutal-shadow), inset 0 0 40px rgba(34,197,94,0.05);
        }
        .cal-scan {
          position: absolute; inset: 0; pointer-events: none;
          background: repeating-linear-gradient(0deg, transparent 0 2px, var(--brutal-scanline) 2px 4px);
          opacity: 0.5; z-index: 0;
        }
        .cal-hero-ic {
          z-index: 1; width: 72px; height: 72px; display: grid; place-items: center; border-radius: 18px;
          background: linear-gradient(135deg, rgba(34,197,94,0.2), var(--brutal-glow)); border: 2px solid rgba(34,197,94,0.6);
          color: var(--green-primary); box-shadow: 0 0 30px rgba(34,197,94,0.2), inset 0 0 20px rgba(34,197,94,0.2);
        }
        .cal-hero-act { margin-left: auto; display: flex; gap: 16px; z-index: 1; flex-wrap: wrap; }
        .cal-sub { font-size: 0.9rem; color: var(--brutal-text-muted); font-family: var(--font-mono-retro); letter-spacing: 2px; text-transform: uppercase; font-weight: 900; }
        .cal-toolbar {
          display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 16px 24px; background: var(--brutal-glass);
          backdrop-filter: blur(10px); border: 1px solid var(--brutal-border); border-radius: 16px; box-shadow: 0 10px 30px var(--brutal-shadow);
        }
        .cal-arrow {
          width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;
          border-radius: 12px; border: 1px solid var(--brutal-border); background: var(--brutal-glow);
          color: var(--brutal-text); transition: all .3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 10px var(--brutal-shadow);
        }
        .cal-arrow:hover:not(:disabled) { 
          border-color: var(--green-primary); color: var(--green-primary); 
          transform: translateY(-2px); background: rgba(34,197,94,0.1); box-shadow: 0 0 15px rgba(34,197,94,0.3);
        }
        .cal-arrow:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
        .cal-month-lbl {
          font-family: var(--font-display); font-weight: 900; font-size: 1.4rem; color: var(--brutal-text);
          text-transform: uppercase; letter-spacing: 3px; min-width: 220px; text-align: center;
          text-shadow: 0 0 20px rgba(255,255,255,0.2);
        }
        .cal-today-btn {
          display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 20px; cursor: pointer;
          font-family: var(--font-display); font-weight: 900; font-size: 0.85rem; letter-spacing: 2px; text-transform: uppercase;
          border-radius: 12px; border: 2px solid rgba(34,197,94,0.6);
          background: rgba(34,197,94,0.15); color: var(--green-primary); transition: all .3s;
          box-shadow: 0 0 15px rgba(34,197,94,0.1);
        }
        .cal-today-btn:hover:not(:disabled) { 
          background: rgba(34,197,94,0.3); transform: translateY(-2px); box-shadow: 0 8px 20px rgba(34,197,94,0.3), 0 0 20px rgba(34,197,94,0.4); 
          border-color: var(--green-primary);
        }
        .cal-today-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cal-vtoggle { margin-left: auto; display: flex; gap: 0; border: 1px solid var(--brutal-border); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px var(--brutal-shadow); background: var(--brutal-glow); }
        .cal-vbtn {
          display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 20px; cursor: pointer; border: none;
          font-family: var(--font-display); font-weight: 900; font-size: 0.8rem; letter-spacing: 1.5px; text-transform: uppercase;
          background: transparent; color: var(--brutal-text-muted); transition: all .2s;
        }
        .cal-vbtn:hover { color: var(--brutal-text); background: rgba(255,255,255,0.05); }
        .cal-vbtn.is-on { background: var(--green-primary); color: var(--brutal-bg-1); box-shadow: 0 0 20px rgba(34,197,94,0.4); }
        .cal-legend {
          display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 24px; padding: 16px 24px; font-size: 0.75rem; color: var(--brutal-text-muted);
          background: var(--brutal-glass); backdrop-filter: blur(10px); border: 1px solid var(--brutal-border); border-radius: 16px;
          font-family: var(--font-mono-retro); font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px; box-shadow: 0 10px 30px var(--brutal-shadow);
        }
        .cal-legend span { display: flex; align-items: center; gap: 10px; color: var(--brutal-text); }
        .cal-ldot { width: 14px; height: 14px; border-radius: 4px; display: inline-block; flex-shrink: 0; box-shadow: 0 0 15px currentColor; border: 1px solid rgba(255,255,255,0.2); }
        .cal-nav {
          display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: var(--brutal-glass);
          border: 1px solid var(--brutal-border); border-radius: 16px; box-shadow: 0 10px 30px var(--brutal-shadow); backdrop-filter: blur(10px);
        }
        .cal-weeks { flex: 1; overflow-x: auto; padding-bottom: 4px; scroll-behavior: smooth; }
        .cal-weeks::-webkit-scrollbar { height: 6px; }
        .cal-weeks::-webkit-scrollbar-thumb { background: var(--brutal-border); border-radius: 3px; }
        .cal-weeks-in { display: flex; gap: 10px; min-width: max-content; }
        .cal-wk {
          width: 44px; height: 44px; border-radius: 12px; font-size: 0.9rem; font-weight: 900; cursor: pointer;
          font-family: var(--font-display); transition: all .3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid var(--brutal-border);
          background: var(--brutal-glow); color: var(--brutal-text-muted); box-shadow: 0 4px 10px var(--brutal-shadow);
        }
        .cal-wk:hover { border-color: rgba(34,197,94,0.5); color: var(--brutal-text); transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.4); }
        .cal-wk-cur { border-color: var(--green-primary); color: var(--green-primary); text-shadow: 0 0 10px rgba(34,197,94,0.5); }
        .cal-wk-on { background: var(--green-primary); color: var(--brutal-bg-1); border-color: var(--green-primary); box-shadow: 0 0 20px rgba(34,197,94,0.5); }
        .cal-wk-off { opacity: 0.3; }
        .cal-card {
          position: relative; overflow: hidden; background: linear-gradient(180deg, var(--brutal-bg-1), var(--brutal-bg-2)); border: 1px solid var(--brutal-border);
          border-radius: 20px; padding: 24px 28px; transition: all .3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 15px 40px var(--brutal-shadow);
        }
        .cal-card:hover { border-color: rgba(34,197,94,0.4); transform: translateY(-4px); box-shadow: 0 25px 50px var(--brutal-shadow), 0 0 30px rgba(34,197,94,0.1); }
        .cal-card-mine { background: linear-gradient(135deg, var(--brutal-card-bg-1), var(--brutal-card-bg-2)); border-color: rgba(34,197,94,0.4); box-shadow: 0 15px 40px var(--brutal-shadow), inset 0 0 30px rgba(34,197,94,0.05); }
        .cal-card-mine:hover { border-color: var(--green-primary); box-shadow: 0 25px 50px var(--brutal-shadow), 0 0 40px rgba(34,197,94,0.2), inset 0 0 40px rgba(34,197,94,0.1); }
        .cal-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; position: relative; z-index: 1; }
        .cal-jor { font-size: 0.8rem; font-weight: 900; color: var(--brutal-text-muted); font-family: var(--font-display); text-transform: uppercase; letter-spacing: 3px; }
        .cal-comp { font-size: 0.75rem; font-weight: 900; letter-spacing: 1.5px; padding: 4px 12px; border-radius: 8px; font-family: var(--font-sans); text-transform: uppercase; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }
        .cal-mine-tag {
          font-size: 0.75rem; font-weight: 900; letter-spacing: 2px; padding: 4px 12px; border-radius: 8px;
          color: #0f172a; background: var(--green-primary); font-family: var(--font-display); text-transform: uppercase;
          box-shadow: 0 0 15px rgba(34,197,94,0.4);
        }
        .cal-vs { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 24px; position: relative; z-index: 1; }
        .cal-side { display: flex; align-items: center; gap: 20px; min-width: 0; }
        .cal-side-h { justify-content: flex-end; text-align: right; }
        .cal-side-a { justify-content: flex-start; text-align: left; }
        .cal-team { font-weight: 900; font-family: var(--font-display); font-size: 1.6rem; color: var(--brutal-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; letter-spacing: 1px; }
        .cal-team-me { color: var(--green-primary); text-shadow: 0 0 15px rgba(34,197,94,0.4); }
        .cal-score {
          display: flex; align-items: center; gap: 16px; padding: 12px 24px; border-radius: 16px;
          background: rgba(0,0,0,0.5); border: 1px solid var(--brutal-border); box-shadow: inset 0 4px 15px rgba(0,0,0,0.8);
        }
        .cal-goals { font-family: var(--font-mono-retro); font-weight: 900; font-size: 2.4rem; color: var(--brutal-text); line-height: 1; letter-spacing: 2px; text-shadow: 0 0 20px rgba(255,255,255,0.3); }
        .cal-vstxt { font-family: var(--font-display); font-weight: 900; font-size: 1.1rem; color: var(--brutal-text-muted); letter-spacing: 6px; }
        .cal-badge {
          width: 40px; height: 40px; display: grid; place-items: center; border-radius: 10px; font-size: 0.85rem; font-weight: 900;
          font-family: var(--font-mono-retro); flex-shrink: 0; box-shadow: 0 8px 20px var(--brutal-shadow); background: var(--brutal-glass); border: 1px solid var(--brutal-border);
        }
        .cal-foot {
          display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; margin-top: 20px;
          padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.05); position: relative; z-index: 1;
        }
        .cal-tac { font-size: 0.85rem; color: #94a3b8; font-family: var(--font-mono-retro); font-weight: bold; letter-spacing: 1px; }
        @media(max-width:640px){
          .cal-vs { grid-template-columns: 1fr; gap: 16px; }
          .cal-side-h, .cal-side-a { justify-content: flex-start; text-align: left; }
          .cal-score { justify-content: center; margin: 10px 0; }

          .cal-month-lbl { min-width: 0; flex: 1; }
          .cal-vtoggle { margin-left: 0; width: 100%; }
          .cal-vbtn { flex: 1; justify-content: center; }
        }
      `}</style>

      {selectedMatch && (
        <TacticsPanel match={selectedMatch} isHome={selectedMatch.homeClubId === myClubId}
          onSave={handleSaveTactics} onClose={() => setSelectedMatch(null)} />
      )}

      {/* Hero header */}
      <div className="cal-hero">
        <div className="cal-scan" />
        <div className="cal-hero-ic"><Calendar size={32} /></div>
        <div style={{ zIndex: 1 }}>
          <p className="muted-label" style={{ color: 'var(--green-primary)' }}>{t('gameplay:calendar.kicker')}</p>
          <h1 className="section-title text-4xl" style={{ textTransform: 'uppercase', color: 'var(--brutal-text)', letterSpacing: '1px' }}>{t('gameplay:calendar.title')}</h1>
          <p className="cal-sub">
            {t('gameplay:calendar.matchday', { week: currentWeek })}
            {todayKey && <> · <span style={{ color: 'var(--brutal-text)' }}>{t('gameplay:calendar.inGameDate', { date: todayKey.split('-').reverse().join('/') })}</span></>}
            {!isApiAvailable && <span style={{ marginLeft: 8, color: 'var(--gold-accent)' }}>{t('gameplay:calendar.demoMode')}</span>}
          </p>
        </div>
        <div className="cal-hero-act">
          <Button variant="secondary" size="md" onClick={loadData} aria-label={t('gameplay:calendar.reload')}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
          {isApiAvailable && isAdmin && (
            <Button variant="primary" size="md" onClick={() => setConfirmAdvance(true)} disabled={advancingTurn}>
              {advancingTurn ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {t('gameplay:calendar.advanceMatchday')}
            </Button>
          )}
        </div>
      </div>

      {!loading && !isApiAvailable && (
        <EmptyState
          icon={<Calendar size={36} />}
          title={t('gameplay:calendar.loadError')}
          action={<Button variant="secondary" onClick={() => void loadData()}>{t('gameplay:calendar.retry')}</Button>}
        />
      )}

      {isApiAvailable && (
      <>
      {/* X6 · Aviso de semana de derbi (solo si la próxima cita con el rival está cerca) */}
      <RivalWeekPanel variant="banner" />

      {/* Toolbar: navegación de mes/jornada + HOY + toggle de vista */}
      <div className="cal-toolbar">
        {view === 'month' ? (
          <>
            <button className="cal-arrow" onClick={() => shiftMonth(-1)} disabled={!viewMonth} aria-label={t('gameplay:calendar.toasts.prevMonth')}>
              <ChevronLeft size={16} />
            </button>
            <span className="cal-month-lbl">
              {viewMonth ? monthLabel(viewMonth.year, viewMonth.month0) : '—'}
            </span>
            <button className="cal-arrow" onClick={() => shiftMonth(1)} disabled={!viewMonth} aria-label={t('gameplay:calendar.toasts.nextMonth')}>
              <ChevronRight size={16} />
            </button>
            <button className="cal-today-btn" onClick={goToday} disabled={!todayKey}>
              <Crosshair size={12} /> {t('gameplay:calendar.today')}
            </button>
          </>
        ) : (
          <span className="cal-month-lbl" style={{ textAlign: 'left', minWidth: 0 }}>
            {t('gameplay:calendar.viewWeek', { week: viewWeek })}
          </span>
        )}

        <div className="cal-vtoggle" role="tablist" aria-label={t('gameplay:calendar.toasts.viewToggle')}>
          <button className={cn('cal-vbtn', view === 'month' && 'is-on')} onClick={() => setView('month')} role="tab" aria-selected={view === 'month'}>
            <CalendarDays size={13} /> {t('gameplay:calendar.views.month')}
          </button>
          <button className={cn('cal-vbtn', view === 'list' && 'is-on')} onClick={() => setView('list')} role="tab" aria-selected={view === 'list'}>
            <List size={13} /> {t('gameplay:calendar.views.list')}
          </button>
        </div>
      </div>

      {/* Leyenda de competiciones (vista mes) */}
      {view === 'month' && kindsPresent.length > 0 && (
        <div className="cal-legend">
          {kindsPresent.map(k => (
            <span key={k}>
              <span className="cal-ldot" style={{ background: KIND_COLOR[k] }} />
              {KIND_LABEL[k]}
            </span>
          ))}
          <span><span className="cal-ldot" style={{ background: 'var(--accent-soft)', border: '1px solid var(--green-primary)' }} />{t('gameplay:calendar.legend.home')}</span>
          <span style={{ marginLeft: 'auto' }}>{t('gameplay:calendar.legend.resultHint')}</span>
        </div>
      )}

      {/* ── VISTA MES ───────────────────────────────────────────────────────── */}
      {view === 'month' && (
        loading ? (
          <Skeleton height={460} />
        ) : !viewMonth || !todayKey ? (
          <EmptyState
            icon={<CalendarDays size={40} />}
            title={t('gameplay:calendar.noClockTitle')}
            hint={t('gameplay:calendar.noClockHint')}
          />
        ) : (
          <>
            <MonthCalendar
              year={viewMonth.year}
              monthIdx0={viewMonth.month0}
              matchesByDay={matchesByDay}
              todayKey={todayKey}
              myClubId={myClubId}
              onOpenMatch={openMatch}
            />
            {!monthHasMatches && (
              <EmptyState
                icon={<Calendar size={36} />}
                title={t('gameplay:calendar.noMonthMatches', { month: viewMonth ? monthLabel(viewMonth.year, viewMonth.month0) : '—' })}
                hint={t('gameplay:calendar.noMonthHint')}
              />
            )}
          </>
        )
      )}

      {/* ── VISTA LISTA (por jornadas, la de siempre) ──────────────────────── */}
      {view === 'list' && (
        <>
          <div className="cal-nav">
            <button className="cal-arrow" onClick={() => setViewWeek(w => Math.max(1, w - 1))} disabled={viewWeek <= 1} aria-label={t('gameplay:calendar.toasts.prevWeek')}>
              <ChevronLeft size={16} />
            </button>
            <div className="cal-weeks">
              <div className="cal-weeks-in">
                {Array.from({ length: maxWeek }).map((_, i) => {
                  const w = i + 1;
                  const matchesInWeek = matches.filter(m => matchWeek(m) === w);
                  const hasMatch = matchesInWeek.length > 0;
                  const isPlayed = hasMatch && matchesInWeek.every(m => m.status === 'played');
                  return (
                    <button key={w} onClick={() => setViewWeek(w)}
                      className={cn('cal-wk',
                        viewWeek === w ? 'cal-wk-on' : w === currentWeek ? 'cal-wk-cur' : '',
                        !hasMatch && 'cal-wk-off')}>
                      {isPlayed ? '✓' : w}
                    </button>
                  );
                })}
              </div>
            </div>
            <button className="cal-arrow" onClick={() => setViewWeek(w => Math.min(maxWeek, w + 1))} disabled={viewWeek >= maxWeek} aria-label={t('gameplay:calendar.toasts.nextWeek')}>
              <ChevronRight size={16} />
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[0, 1, 2, 3].map(i => <Skeleton key={i} height={92} />)}
            </div>
          ) : weekMatches.length === 0 ? (
            <EmptyState
              icon={<Calendar size={40} />}
              title={t('gameplay:calendar.noWeekMatches', { week: viewWeek })}
              hint={t('gameplay:calendar.noWeekHint')}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {weekMatches.map(match => {
                const isPlayed = match.status === 'played';
                const isMyMatch = match.homeClubId === myClubId || match.awayClubId === myClubId;
                const badge = getResultBadge(match);
                const isSimulating = simulating === match.id;
                const myFormation = match.homeClubId === myClubId ? match.homeFormation : match.awayFormation;
                const myConstruction = match.homeClubId === myClubId ? match.homeConstruction : match.awayConstruction;
                const kind = competitionKind(match.competition?.name, match.competition?.shortName);

                return (
                  <div
                    key={match.id}
                    className={cn('cal-card', isMyMatch && 'cal-card-mine')}
                    role={isPlayed || isMyMatch ? 'button' : undefined}
                    tabIndex={isPlayed || isMyMatch ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (isPlayed) cardKeyActivate(e, () => navigate(`/matches/${match.id}`));
                      else if (isMyMatch && !isPlayed) cardKeyActivate(e, () => setSelectedMatch(match));
                    }}
                  >
                    {isMyMatch && <div className="cal-scan" />}

                    <div className="cal-meta">
                      {isMyMatch && <span className="cal-mine-tag">{t('gameplay:calendar.myTeam')}</span>}
                      <span className="cal-jor">{t('gameplay:calendar.matchdayShort', { week: matchWeek(match) })}</span>
                      <span
                        className="cal-comp"
                        style={{
                          color: KIND_COLOR[kind],
                          background: `color-mix(in srgb, ${KIND_COLOR[kind]} 12%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${KIND_COLOR[kind]} 30%, transparent)`,
                        }}
                      >
                        {match.competition?.shortName ?? KIND_LABEL[kind]}
                      </span>
                      {match.homeClub?.city && match.homeClub.city === match.awayClub?.city && (
                        <span className="cal-mine-tag" style={{ color: 'var(--gold-accent)', background: 'color-mix(in srgb, var(--gold-accent) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--gold-accent) 30%, transparent)' }}>
                          {t('gameplay:calendar.derby')}
                        </span>
                      )}
                      {badge && (
                        <span
                          className="cal-badge"
                          style={{
                            marginLeft: 'auto',
                            color: badge.tone,
                            background: `color-mix(in srgb, ${badge.tone} 16%, transparent)`,
                            border: `1px solid color-mix(in srgb, ${badge.tone} 35%, transparent)`,
                          }}
                        >
                          {badge.label}
                        </span>
                      )}
                    </div>

                    <div className="cal-vs">
                      <div className="cal-side cal-side-h">
                        <span className={cn('cal-team', match.homeClubId === myClubId && 'cal-team-me')}>
                          <ClubLink id={match.homeClubId} name={clubName(match, 'home')} />
                        </span>
                        <ClubBadge id={match.homeClubId} name={clubName(match, 'home')} size={30} />
                      </div>

                      <div className="cal-score">
                        {isPlayed ? (
                          <span className="cal-goals">
                            {match.resultHidden ? '? - ?' : `${match.homeGoals} - ${match.awayGoals}`}
                          </span>
                        ) : (
                          <span className="cal-vstxt">{t('gameplay:calendar.vs')}</span>
                        )}
                      </div>

                      <div className="cal-side cal-side-a">
                        <ClubBadge id={match.awayClubId} name={clubName(match, 'away')} size={30} />
                        <span className={cn('cal-team', match.awayClubId === myClubId && 'cal-team-me')}>
                          <ClubLink id={match.awayClubId} name={clubName(match, 'away')} />
                        </span>
                      </div>
                    </div>

                    {((!isPlayed && isMyMatch) || isPlayed) && (
                      <div className="cal-foot">
                        {!isPlayed && isMyMatch ? (
                          <span className="cal-tac">
                            {t('gameplay:calendar.tacticsSummary', { formation: myFormation, construction: myConstruction })}
                          </span>
                        ) : <span />}

                        {isMyMatch && !isPlayed && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Button variant="secondary" size="sm" onClick={() => setSelectedMatch(match)}>
                              <Settings size={12} /> {t('gameplay:calendar.tactics')}
                            </Button>
                            {isAdmin && (
                              <Button variant="ghost" size="sm" onClick={() => setConfirmSimulate(match)} disabled={isSimulating}>
                                {isSimulating ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                {t('gameplay:calendar.simulate')}
                              </Button>
                            )}
                          </div>
                        )}
                        {isPlayed && (
                          <Button variant="secondary" size="sm" onClick={() => navigate(`/matches/${match.id}`)}>
                            <Eye size={12} />
                            {t('gameplay:calendar.viewSheet')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      </>
      )}
      <ConfirmModal
        open={confirmAdvance}
        onClose={() => setConfirmAdvance(false)}
        onConfirm={async () => { setConfirmAdvance(false); await handleAdvanceTurn(); }}
        title={t('gameplay:calendar.advanceTitle')}
        confirmText={t('gameplay:calendar.advanceAction')}
        isSubmitting={advancingTurn}
      >
        <p>{t('gameplay:calendar.advanceConfirm')}</p>
      </ConfirmModal>
      <ConfirmModal
        open={!!confirmSimulate}
        onClose={() => setConfirmSimulate(null)}
        onConfirm={async () => {
          const m = confirmSimulate;
          setConfirmSimulate(null);
          if (m) await handleSimulate(m);
        }}
        title={t('gameplay:calendar.simulateTitle')}
        confirmText={t('gameplay:calendar.simulateAction')}
        isSubmitting={simulating != null}
      >
        {confirmSimulate && (
          <p>
            {t('gameplay:calendar.simulateBody', {
              home: confirmSimulate.homeClub?.shortName ?? confirmSimulate.homeClub?.name ?? '—',
              away: confirmSimulate.awayClub?.shortName ?? confirmSimulate.awayClub?.name ?? '—',
            })}
          </p>
        )}
      </ConfirmModal>
    </div>
  );
}
