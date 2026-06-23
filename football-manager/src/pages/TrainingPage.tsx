import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Dumbbell,
  EyeOff,
  Layers,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { Button, EmptyState, Skeleton } from '../components/ui';
import { playersApi, trainingApi } from '../api/client';
import { getPositionCategory } from '../lib/gameUtils';
import { CoachCard, COACH_CSS } from '../components/training/CoachCard';
import { PlaysProgressPanel } from '../components/training/PlaysProgressPanel';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { SportingWorkspaceHeader } from '../components/sporting/SportingWorkspaceHeader';
import { cn } from '../lib/cn';

type TrainingType = { type: string; stats: string[]; description: string };
type ResourceErrors = { players?: string; coaches?: string; control?: string; types?: string };

const MAX_COACHES = 6;
const CATEGORY_IDS = ['GK', 'DEF', 'MID', 'ATT', 'TAC'] as const;
const CAT_ACCENT: Record<string, string> = {
  GK: 'var(--gold-accent)',
  DEF: 'var(--blue-info)',
  MID: 'var(--green-primary)',
  ATT: 'var(--red-danger)',
  TAC: 'var(--violet-accent)',
};
const CAT_LABEL: Record<string, string> = {
  GK: 'Porteros',
  DEF: 'Defensa',
  MID: 'Medios',
  ATT: 'Ataque',
  TAC: 'Táctica',
};
const COACH_CAT_TO_PLAYER_CAT: Record<string, 'POR' | 'DEF' | 'MED' | 'DEL' | null> = {
  GK: 'POR',
  DEF: 'DEF',
  MID: 'MED',
  ATT: 'DEL',
  TAC: null,
};

function coachAccepts(coachCategory: string, playerPosition: string): boolean {
  const wanted = COACH_CAT_TO_PLAYER_CAT[coachCategory];
  if (wanted === null) return true;
  if (wanted === undefined) return false;
  return getPositionCategory(playerPosition) === wanted;
}

export function TrainingPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resourceErrors, setResourceErrors] = useState<ResourceErrors>({});
  const [playersList, setPlayersList] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [control, setControl] = useState<any>(null);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [confirmStimulateOpen, setConfirmStimulateOpen] = useState(false);
  const [sessionCoachId, setSessionCoachId] = useState<number | null>(null);
  const [sessionType, setSessionType] = useState('');
  const [sessionPlayerIds, setSessionPlayerIds] = useState<number[]>([]);
  const [sessionResult, setSessionResult] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    const [squadResult, coachesResult, controlResult, typesResult] = await Promise.allSettled([
      playersApi.getSquad(),
      trainingApi.getCoaches(),
      trainingApi.control(),
      trainingApi.getTypes(),
    ]);

    const errors: ResourceErrors = {};
    if (squadResult.status === 'fulfilled') {
      setPlayersList(Array.isArray(squadResult.value) ? squadResult.value : []);
    } else {
      errors.players = squadResult.reason instanceof Error ? squadResult.reason.message : t('gameplay:training.loadError');
    }
    if (coachesResult.status === 'fulfilled') {
      const normalized = (Array.isArray(coachesResult.value) ? coachesResult.value : [])
        .map((coach: any) => ({ ...coach, players: Array.isArray(coach.players) ? coach.players : [] }))
        .sort((a: any, b: any) => {
          const idxA = CATEGORY_IDS.indexOf(a.category);
          const idxB = CATEGORY_IDS.indexOf(b.category);
          if (idxA !== idxB) return idxA - idxB;
          return a.id - b.id;
        });
      setCoaches(normalized);
      const nextId = sessionCoachId && normalized.some((coach: any) => coach.id === sessionCoachId)
        ? sessionCoachId
        : normalized[0]?.id ?? null;
      setSessionCoachId(nextId);
      if (sessionCoachId == null && nextId != null) {
        const nextCoach = normalized.find((coach: any) => coach.id === nextId);
        setSessionPlayerIds((nextCoach?.players ?? []).map((player: any) => player.id).slice(0, 6));
      }
    } else {
      errors.coaches = coachesResult.reason instanceof Error ? coachesResult.reason.message : t('gameplay:training.loadError');
    }
    if (controlResult.status === 'fulfilled') setControl(controlResult.value);
    else errors.control = controlResult.reason instanceof Error ? controlResult.reason.message : t('gameplay:training.loadError');

    if (typesResult.status === 'fulfilled') {
      const types = Array.isArray(typesResult.value) ? typesResult.value : [];
      setTrainingTypes(types);
      setSessionType((current) => current || types[0]?.type || '');
    } else {
      errors.types = typesResult.reason instanceof Error ? typesResult.reason.message : t('gameplay:training.loadError');
    }

    setResourceErrors(errors);
    const coreFailed = Boolean(errors.players && errors.coaches);
    setLoadError(coreFailed ? errors.coaches ?? errors.players ?? t('gameplay:training.loadError') : null);
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hireCoach = async (category: string, level: number) => {
    setIsSubmitting(true);
    try {
      await trainingApi.hireCoach(category, level);
      toast.success(t('gameplay:training.toasts.coachHired'));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gameplay:training.command.hireError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const fireCoach = async (id: number) => {
    setIsSubmitting(true);
    try {
      await trainingApi.fireCoach(id);
      toast.success(t('gameplay:training.toasts.coachFired'));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gameplay:training.command.fireError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = async () => {
    setIsSubmitting(true);
    try {
      await trainingApi.close();
      toast.success(t('gameplay:training.toasts.closed'));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gameplay:training.command.actionError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStimulate = async () => {
    setIsSubmitting(true);
    try {
      await trainingApi.stimulate();
      toast.success(t('gameplay:training.toasts.speechApplied'));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gameplay:training.command.actionError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePlayerAssign = async (coachId: number, playerId: number, isAssigned: boolean) => {
    const coach = coaches.find((item) => item.id === coachId);
    if (!coach) return;
    let playerIds = (coach.players ?? []).map((player: any) => player.id);
    if (isAssigned) playerIds = playerIds.filter((id: number) => id !== playerId);
    else {
      if (playerIds.length >= 6) {
        toast.error(t('gameplay:training.toasts.maxPlayers'));
        return;
      }
      playerIds.push(playerId);
    }

    setIsSubmitting(true);
    try {
      await trainingApi.assignPlayers(coachId, playerIds);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gameplay:training.command.assignError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCoach = coaches.find((coach) => coach.id === sessionCoachId) ?? null;
  const selectedType = trainingTypes.find((type) => type.type === sessionType) ?? null;
  const eligibleSessionPlayers = useMemo(() => {
    if (!selectedCoach) return [];
    const assignedIds = new Set((selectedCoach.players ?? []).map((player: any) => player.id));
    return [...playersList]
      .filter((player) => coachAccepts(selectedCoach.category, player.position))
      .sort((a, b) => {
        const assignedDelta = Number(assignedIds.has(b.id)) - Number(assignedIds.has(a.id));
        if (assignedDelta !== 0) return assignedDelta;
        return Number(b.overall ?? 0) - Number(a.overall ?? 0);
      });
  }, [playersList, selectedCoach]);

  const toggleSessionPlayer = (playerId: number) => {
    setSessionPlayerIds((current) => {
      if (current.includes(playerId)) return current.filter((id) => id !== playerId);
      if (current.length >= 6) {
        toast.error(t('gameplay:training.toasts.maxPlayers'));
        return current;
      }
      return [...current, playerId];
    });
  };

  const runManualSession = async () => {
    if (!sessionCoachId || !sessionType || sessionPlayerIds.length === 0) return;
    setIsSubmitting(true);
    try {
      const result = await trainingApi.runSession(sessionCoachId, sessionType, sessionPlayerIds);
      await loadData();
      setSessionResult(result);
      toast.success(t('gameplay:training.command.sessionComplete'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gameplay:training.command.sessionError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const assignedIds = new Set<number>();
  coaches.forEach((coach) => (coach.players ?? []).forEach((player: any) => assignedIds.add(player.id)));
  const assignedTotal = assignedIds.size;
  const unassignedPlayers = playersList.filter((player) => !assignedIds.has(player.id));
  const unassignedStarters = unassignedPlayers.filter((player) => player.isStarter);
  const categoriesCovered = new Set(coaches.map((coach) => coach.category)).size;
  const missingCategories = CATEGORY_IDS.filter((category) => !coaches.some((coach) => coach.category === category));
  const averageCoachLevel = coaches.length > 0
    ? (coaches.reduce((sum, coach) => sum + Number(coach.level ?? 0), 0) / coaches.length).toFixed(1)
    : '—';
  const programmeReady = missingCategories.length === 0 && unassignedStarters.length === 0 && coaches.length > 0;
  const partialErrorCount = Object.keys(resourceErrors).length;

  if (loading) {
    return (
      <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Skeleton height={154} />
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr', gap: 14 }}>
          <Skeleton height={300} /><Skeleton height={300} />
        </div>
        <Skeleton height={320} />
      </div>
    );
  }

  return (
    <div className="page-surface training-command-page">
      <style>{TRAINING_COMMAND_CSS}</style>
      <style>{COACH_CSS}</style>

      <SportingWorkspaceHeader
        eyebrow={t('gameplay:training.command.eyebrow')}
        title={t('gameplay:training.command.title')}
        description={t('gameplay:training.command.description')}
        alert={{
          tone: programmeReady ? 'good' : loadError ? 'risk' : 'watch',
          title: loadError
            ? t('gameplay:training.loadError')
            : programmeReady ? t('gameplay:training.command.ready') : t('gameplay:training.command.needsWork'),
          detail: loadError
            ? loadError
            : programmeReady
              ? t('gameplay:training.command.readyHint')
              : t('gameplay:training.command.needsWorkHint', { missing: missingCategories.length, unassigned: unassignedStarters.length }),
        }}
        metrics={[
          { label: t('gameplay:training.command.metrics.coaches'), value: `${coaches.length}/${MAX_COACHES}`, tone: resourceErrors.coaches ? 'risk' : coaches.length > 0 ? 'good' : 'risk' },
          { label: t('gameplay:training.command.metrics.coverage'), value: `${categoriesCovered}/5`, tone: resourceErrors.coaches ? 'risk' : categoriesCovered === 5 ? 'good' : 'watch' },
          { label: t('gameplay:training.command.metrics.assigned'), value: `${assignedTotal}/${playersList.length}`, tone: resourceErrors.players ? 'risk' : unassignedStarters.length > 0 ? 'risk' : 'good' },
          { label: t('gameplay:training.command.metrics.level'), value: averageCoachLevel, tone: 'neutral' },
        ]}
      />

      {partialErrorCount > 0 && (
        <div className={cn('training-command-error', loadError && 'is-critical')}>
          <AlertTriangle size={17} />
          <div>
            <strong>{loadError ? t('gameplay:training.loadError') : t('gameplay:training.command.partialLoad')}</strong>
            <span>{Object.values(resourceErrors).filter(Boolean)[0]}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void loadData()}>{t('gameplay:training.retry')}</Button>
        </div>
      )}

      <>
          <div className="training-command-topgrid">
            <section className="training-session">
              <header>
                <div>
                  <span>{t('gameplay:training.command.sessionEyebrow')}</span>
                  <h2><Play size={16} />{t('gameplay:training.command.sessionTitle')}</h2>
                </div>
                <strong>{t('gameplay:training.command.sessionLimit')}</strong>
              </header>
              {coaches.length === 0 ? (
                <EmptyState
                  icon={<Dumbbell size={26} />}
                  title={resourceErrors.coaches ? t('gameplay:training.loadError') : t('gameplay:training.emptyCoaches')}
                  hint={resourceErrors.coaches ?? t('gameplay:training.emptyCoachesHint')}
                />
              ) : (
                <>
                  <div className="training-session__selectors">
                    <label>
                      <span>{t('gameplay:training.command.coach')}</span>
                      <select
                        value={sessionCoachId ?? ''}
                        onChange={(event) => {
                          const nextId = Number(event.target.value);
                          const nextCoach = coaches.find((coach) => coach.id === nextId);
                          setSessionCoachId(nextId);
                          setSessionPlayerIds((nextCoach?.players ?? []).map((player: any) => player.id).slice(0, 6));
                          setSessionResult(null);
                        }}
                      >
                        {coaches.map((coach) => (
                          <option key={coach.id} value={coach.id}>
                            {CAT_LABEL[coach.category] ?? coach.category} · {t('gameplay:tactics.panels.common.level', { level: coach.level })}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{t('gameplay:training.command.sessionType')}</span>
                      <select value={sessionType} onChange={(event) => { setSessionType(event.target.value); setSessionResult(null); }}>
                        {trainingTypes.map((type) => <option key={type.type} value={type.type}>{type.type}</option>)}
                      </select>
                    </label>
                  </div>
                  {selectedType && (
                    <div className="training-session__type">
                      <Sparkles size={15} />
                      <div><strong>{selectedType.description}</strong><span>{selectedType.stats.join(' · ') || t('gameplay:training.command.recovery')}</span></div>
                    </div>
                  )}
                  <div className="training-session__players">
                    <div className="training-session__playershead">
                      <span>{t('gameplay:training.command.choosePlayers')}</span>
                      <strong>{sessionPlayerIds.length}/6</strong>
                    </div>
                    <div>
                      {eligibleSessionPlayers.map((player) => (
                        <button
                          key={player.id}
                          type="button"
                          className={cn(sessionPlayerIds.includes(player.id) && 'is-selected')}
                          onClick={() => toggleSessionPlayer(player.id)}
                        >
                          <span>{player.position}</span>
                          <strong>{player.name}</strong>
                          <em>{player.overall ?? '—'} · {player.fitness ?? 100}%</em>
                          {sessionPlayerIds.includes(player.id) && <CheckCircle2 size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="training-session__run"
                    disabled={isSubmitting || !sessionCoachId || !sessionType || sessionPlayerIds.length === 0}
                    onClick={() => void runManualSession()}
                  >
                    <Zap size={16} /> {isSubmitting ? t('gameplay:training.command.running') : t('gameplay:training.command.run')}
                  </button>
                  {sessionResult?.results && (
                    <div className="training-session__result">
                      <strong><ClipboardCheck size={15} />{t('gameplay:training.command.resultTitle')}</strong>
                      <div>
                        {sessionResult.results.map((result: any) => (
                          <span key={result.playerId} className={cn(result.improved && 'is-improved')}>
                            {result.playerName} · {result.improved ? `+1 ${result.statImproved}` : t('gameplay:training.command.noImprovement')} · {result.newFitness}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="training-day">
              <header>
                <span>{t('gameplay:training.command.dayEyebrow')}</span>
                <h2><ShieldCheck size={16} />{t('gameplay:training.controlTitle')}</h2>
              </header>
              <p>{control ? t('gameplay:training.controlHint', { turn: control.turn }) : t('gameplay:training.command.controlUnavailable')}</p>
              <div className="training-day__actions">
                <article className={cn(control?.trainingClosedActive && 'is-active')}>
                  <span><EyeOff size={18} /></span>
                  <div>
                    <strong>{t('gameplay:training.command.closedTitle')}</strong>
                    <small>{control?.trainingClosedActive ? t('gameplay:training.closedBadge', { turn: control.trainingClosedUntilTurn }) : t('gameplay:training.closeHint')}</small>
                  </div>
                  {!control?.trainingClosedActive && <button type="button" disabled={!control || isSubmitting} onClick={() => setConfirmCloseOpen(true)}>{t('gameplay:training.command.activate')}</button>}
                </article>
                <article className={cn(control?.homeStimulatedActive && 'is-active')}>
                  <span><Sparkles size={18} /></span>
                  <div>
                    <strong>{t('gameplay:training.command.speechTitle')}</strong>
                    <small>{control?.homeStimulatedActive ? t('gameplay:training.speechActive', { turn: control.homeStimulatedUntilTurn }) : t('gameplay:training.stimulateHint')}</small>
                  </div>
                  {!control?.homeStimulatedActive && <button type="button" disabled={!control || isSubmitting} onClick={() => setConfirmStimulateOpen(true)}>{t('gameplay:training.command.activate')}</button>}
                </article>
              </div>
            </section>
          </div>

          <section className="training-coverage">
            <header>
              <div><span>{t('gameplay:training.command.coverageEyebrow')}</span><h2><Layers size={16} />{t('gameplay:training.command.coverageTitle')}</h2></div>
              <small>{t('gameplay:training.command.coverageHint')}</small>
            </header>
            {resourceErrors.coaches ? (
              <EmptyState
                icon={<Layers size={26} />}
                title={t('gameplay:training.command.partialLoad')}
                hint={resourceErrors.coaches}
              />
            ) : (
              <div>
                {CATEGORY_IDS.map((category) => {
                const categoryCoaches = coaches.filter((coach) => coach.category === category);
                const assigned = categoryCoaches.reduce((sum, coach) => sum + (coach.players?.length ?? 0), 0);
                const missing = categoryCoaches.length === 0;
                return (
                  <article key={category} className={cn(missing && 'is-missing')} style={{ ['--coverage-tone' as string]: CAT_ACCENT[category] }}>
                    <span>{missing ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}</span>
                    <div><strong>{CAT_LABEL[category]}</strong><small>{missing ? t('gameplay:training.command.noCoach') : t('gameplay:training.command.coverageDetail', { coaches: categoryCoaches.length, players: assigned })}</small></div>
                    <b>{categoryCoaches.length}</b>
                  </article>
                );
                })}
              </div>
            )}
          </section>

          <div className="training-command-layout">
            <section className="training-coaches">
              <header>
                <div><span>{t('gameplay:training.command.staffEyebrow')}</span><h2><Users size={16} />{t('gameplay:training.command.staffTitle')}</h2></div>
                <small>
                  {resourceErrors.players
                    ? t('gameplay:training.command.partialLoad')
                    : unassignedStarters.length > 0
                      ? t('gameplay:training.command.unassignedStarters', { count: unassignedStarters.length })
                      : t('gameplay:training.command.allStartersAssigned')}
                </small>
              </header>
              {coaches.length === 0 ? (
                <EmptyState
                  icon={<Dumbbell size={28} />}
                  title={resourceErrors.coaches ? t('gameplay:training.loadError') : t('gameplay:training.emptyCoaches')}
                  hint={resourceErrors.coaches ?? t('gameplay:training.emptyCoachesHint')}
                />
              ) : (
                <div className="training-coaches__grid">
                  {coaches.map((coach) => {
                    const category = coach?.category ?? '—';
                    const players: any[] = Array.isArray(coach?.players) ? coach.players : [];
                    const candidates = playersList
                      .filter((player) => coachAccepts(category, player.position))
                      .filter((player) => !players.find((assignedPlayer: any) => assignedPlayer.id === player.id));
                    return (
                      <CoachCard
                        key={coach.id}
                        coach={coach}
                        accent={CAT_ACCENT[category] ?? 'var(--green-primary)'}
                        label={CAT_LABEL[category] ?? `Entrenador ${category}`}
                        candidates={candidates}
                        isSubmitting={isSubmitting}
                        onFire={fireCoach}
                        onAssign={(coachId, playerId) => togglePlayerAssign(coachId, playerId, false)}
                        onUnassign={(coachId, playerId) => togglePlayerAssign(coachId, playerId, true)}
                      />
                    );
                  })}
                </div>
              )}

              <div className="training-hire">
                <div><UserPlus size={20} /><span><strong>{t('gameplay:training.hireCoachTitle')}</strong><small>{t('gameplay:training.command.hireHint')}</small></span></div>
                {coaches.length >= MAX_COACHES ? (
                  <p>{t('gameplay:training.staffFull', { current: MAX_COACHES, max: MAX_COACHES })}</p>
                ) : (
                  <div>
                    {CATEGORY_IDS.map((category) => (
                      <button key={category} type="button" disabled={isSubmitting || Boolean(resourceErrors.coaches)} onClick={() => void hireCoach(category, 1)}>
                        <Plus size={13} />{CAT_LABEL[category]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <aside className="training-playbook">
              <PlaysProgressPanel />
              <div className="training-playbook__hint"><ClipboardList size={14} /><span>{t('gameplay:training.playsHint')}</span></div>
            </aside>
          </div>
      </>

      <ConfirmModal
        open={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        onConfirm={() => { setConfirmCloseOpen(false); void handleClose(); }}
        title={t('gameplay:training.closeTitle')}
        confirmText={t('gameplay:training.closeAction')}
        isSubmitting={isSubmitting}
      >
        <p>{t('gameplay:training.closeBody')}</p>
        <p className="text-sm mt-2 opacity-80">{t('gameplay:training.closeHint')}</p>
      </ConfirmModal>

      <ConfirmModal
        open={confirmStimulateOpen}
        onClose={() => setConfirmStimulateOpen(false)}
        onConfirm={() => { setConfirmStimulateOpen(false); void handleStimulate(); }}
        title={t('gameplay:training.stimulateTitle')}
        confirmText={t('gameplay:training.stimulateAction')}
        isSubmitting={isSubmitting}
      >
        <p>{t('gameplay:training.stimulateBody')}</p>
        <p className="text-sm mt-2 opacity-80">{t('gameplay:training.stimulateHint')}</p>
      </ConfirmModal>
    </div>
  );
}

const TRAINING_COMMAND_CSS = `
.training-command-page{display:flex;flex-direction:column;gap:14px}
.training-command-error{padding:10px 12px;display:flex;align-items:center;gap:9px;border:1px solid color-mix(in srgb,var(--gold-accent) 35%,var(--border-color));border-radius:10px;color:var(--gold-accent);background:color-mix(in srgb,var(--gold-accent) 7%,var(--bg-surface))}
.training-command-error.is-critical{color:var(--red-danger);border-color:color-mix(in srgb,var(--red-danger) 35%,var(--border-color));background:color-mix(in srgb,var(--red-danger) 7%,var(--bg-surface))}
.training-command-error>div{min-width:0;display:flex;flex:1;flex-direction:column}.training-command-error strong{font-size:.72rem}.training-command-error span{overflow:hidden;color:var(--text-muted);font-size:.62rem;text-overflow:ellipsis;white-space:nowrap}
.training-command-topgrid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.75fr);gap:14px;align-items:start}
.training-session,.training-day,.training-coverage,.training-coaches{border:1px solid var(--border-color);border-radius:14px;background:var(--bg-surface);box-shadow:var(--shadow-soft)}
.training-session,.training-day,.training-coaches{padding:16px}
.training-session>header,.training-day>header,.training-coverage>header,.training-coaches>header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}
.training-session>header span,.training-day>header span,.training-coverage>header span,.training-coaches>header span{display:block;color:var(--text-muted);font-size:.57rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
.training-session h2,.training-day h2,.training-coverage h2,.training-coaches h2{margin:3px 0 0;display:flex;align-items:center;gap:7px;color:var(--text-primary);font-family:var(--font-display);font-size:.9rem;font-weight:850}.training-session h2 svg,.training-day h2 svg,.training-coverage h2 svg,.training-coaches h2 svg{color:var(--club-primary)}
.training-session>header>strong{padding:4px 7px;border:1px solid var(--border-color);border-radius:6px;color:var(--text-muted);background:var(--bg-elevated);font-size:.57rem}
.training-session__selectors{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.training-session__selectors label{display:flex;flex-direction:column;gap:4px}.training-session__selectors label span{color:var(--text-muted);font-size:.57rem;font-weight:750;text-transform:uppercase}.training-session__selectors select{padding:8px;border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);background:var(--bg-elevated);font-size:.68rem}
.training-session__type{margin-top:9px;padding:9px;display:flex;align-items:center;gap:8px;border:1px solid color-mix(in srgb,var(--club-primary) 24%,var(--border-color));border-radius:9px;background:color-mix(in srgb,var(--club-primary) 6%,var(--bg-elevated));color:var(--club-primary)}
.training-session__type div{display:flex;flex-direction:column;gap:2px}.training-session__type strong{color:var(--text-primary);font-size:.66rem}.training-session__type span{font-size:.57rem}
.training-session__players{margin-top:10px}.training-session__playershead{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;color:var(--text-muted);font-size:.6rem;font-weight:750;text-transform:uppercase}.training-session__playershead strong{color:var(--club-primary);font-family:var(--font-scoreboard)}
.training-session__players>div:last-child{max-height:180px;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
.training-session__players button{padding:7px;display:grid;grid-template-columns:28px minmax(0,1fr) auto 16px;align-items:center;gap:6px;border:1px solid var(--border-color);border-radius:7px;color:var(--text-primary);background:var(--bg-elevated);cursor:pointer;text-align:left}.training-session__players button.is-selected{border-color:color-mix(in srgb,var(--club-primary) 45%,var(--border-color));background:color-mix(in srgb,var(--club-primary) 8%,var(--bg-elevated))}
.training-session__players button>span{padding:3px;border-radius:4px;color:var(--club-primary);background:color-mix(in srgb,var(--club-primary) 9%,transparent);font-size:.53rem;font-weight:850;text-align:center}.training-session__players button strong{overflow:hidden;font-size:.64rem;text-overflow:ellipsis;white-space:nowrap}.training-session__players button em{color:var(--text-muted);font-size:.55rem;font-style:normal}.training-session__players button svg{color:var(--club-primary)}
.training-session__run{width:100%;margin-top:10px;padding:10px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid color-mix(in srgb,var(--club-primary) 65%,transparent);border-radius:8px;color:var(--avatar-text);background:linear-gradient(135deg,var(--club-primary),color-mix(in srgb,var(--club-primary) 65%,black));cursor:pointer;font-size:.69rem;font-weight:850}.training-session__run:disabled{opacity:.4;cursor:not-allowed}
.training-session__result{margin-top:10px;padding:10px;border:1px solid color-mix(in srgb,var(--green-primary) 30%,var(--border-color));border-radius:9px;background:color-mix(in srgb,var(--green-primary) 5%,var(--bg-elevated))}.training-session__result>strong{display:flex;align-items:center;gap:6px;color:var(--green-primary);font-size:.67rem}.training-session__result>div{margin-top:6px;display:flex;flex-direction:column;gap:3px}.training-session__result span{color:var(--text-muted);font-size:.58rem}.training-session__result span.is-improved{color:var(--text-primary)}
.training-day>p{margin:-5px 0 13px;color:var(--text-muted);font-size:.62rem;line-height:1.45}.training-day__actions{display:flex;flex-direction:column;gap:8px}.training-day__actions article{padding:10px;display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:8px;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-elevated)}.training-day__actions article>span{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;color:var(--gold-accent);background:color-mix(in srgb,var(--gold-accent) 9%,var(--bg-base))}.training-day__actions article.is-active{border-color:color-mix(in srgb,var(--green-primary) 32%,var(--border-color))}.training-day__actions article.is-active>span{color:var(--green-primary);background:color-mix(in srgb,var(--green-primary) 9%,var(--bg-base))}
.training-day__actions article div{min-width:0;display:flex;flex-direction:column;gap:2px}.training-day__actions strong{font-size:.66rem}.training-day__actions small{display:-webkit-box;overflow:hidden;color:var(--text-muted);font-size:.55rem;line-height:1.35;-webkit-box-orient:vertical;-webkit-line-clamp:2}.training-day__actions button{padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);background:var(--bg-surface);cursor:pointer;font-size:.57rem;font-weight:750}
.training-coverage{padding:14px}.training-coverage>header{margin-bottom:10px}.training-coverage>header>small,.training-coaches>header>small{color:var(--text-muted);font-size:.59rem}.training-coverage>div{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.training-coverage article{min-width:0;padding:9px;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:7px;border:1px solid color-mix(in srgb,var(--coverage-tone) 24%,var(--border-color));border-radius:9px;background:color-mix(in srgb,var(--coverage-tone) 5%,var(--bg-elevated))}.training-coverage article.is-missing{--coverage-tone:var(--red-danger)!important}.training-coverage article>span{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;color:var(--coverage-tone);background:color-mix(in srgb,var(--coverage-tone) 9%,var(--bg-base))}.training-coverage article div{min-width:0;display:flex;flex-direction:column}.training-coverage article strong{font-size:.64rem}.training-coverage article small{overflow:hidden;color:var(--text-muted);font-size:.54rem;text-overflow:ellipsis;white-space:nowrap}.training-coverage article>b{color:var(--coverage-tone);font-family:var(--font-scoreboard);font-size:.76rem}
.training-command-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,.7fr);gap:14px;align-items:start}.training-coaches__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.training-playbook{display:flex;flex-direction:column;gap:8px}.training-playbook__hint{padding:0 4px;display:flex;align-items:flex-start;gap:6px;color:var(--text-muted);font-size:.59rem;line-height:1.4}
.training-hire{margin-top:10px;padding:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px dashed var(--border-color);border-radius:10px;background:var(--bg-elevated)}.training-hire>div:first-child{display:flex;align-items:center;gap:8px;color:var(--club-primary)}.training-hire>div:first-child span{display:flex;flex-direction:column}.training-hire>div:first-child strong{color:var(--text-primary);font-size:.66rem}.training-hire>div:first-child small{color:var(--text-muted);font-size:.55rem}.training-hire>div:last-child{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.training-hire button{padding:6px 8px;display:flex;align-items:center;gap:4px;border:1px solid var(--border-color);border-radius:6px;color:var(--text-muted);background:var(--bg-surface);cursor:pointer;font-size:.57rem;font-weight:750}.training-hire button:hover{color:var(--club-primary);border-color:color-mix(in srgb,var(--club-primary) 36%,var(--border-color))}.training-hire p{margin:0;color:var(--gold-accent);font-size:.61rem}
@media(max-width:1080px){.training-command-topgrid,.training-command-layout{grid-template-columns:1fr}.training-coverage>div{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:720px){.training-session__selectors,.training-session__players>div:last-child,.training-coaches__grid{grid-template-columns:1fr}.training-coverage>div{grid-template-columns:1fr 1fr}.training-hire{align-items:flex-start;flex-direction:column}.training-hire>div:last-child{justify-content:flex-start}}
`;
