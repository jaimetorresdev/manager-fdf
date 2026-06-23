// ─── ElectionsPage — federación: candidaturas y votación (E17 · lote A) ───────
// Tarjetas de candidato con avatar/iniciales y barra de apoyo animada, cuenta
// atrás al cierre del periodo (fecha in-game) y ganador destacado.
// MISMA lógica de negocio que antes (apply / vote / list).
import { useState, useEffect } from 'react';
import { Trophy, Vote, Loader2, AlertTriangle, RefreshCw, Crown, UserPlus, Hourglass } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/cn';
import { electionsApi, gameApi } from '../api/client';
import { Skeleton, EmptyState, Button, Badge } from '../components/ui';
import { CandidateCard, type CandidateData } from '../components/social/CandidateCard';
import { useTranslation } from 'react-i18next';

/** Fin del periodo electoral "Y-Y2": 31 de diciembre del segundo año (in-game). */
function periodEnd(period?: string): Date | null {
  if (!period) return null;
  const m = /^(\d{1,6})-(\d{1,6})$/.exec(period);
  if (!m) return null;
  const endYear = Number(m[2]);
  if (!Number.isFinite(endYear)) return null;
  return new Date(Date.UTC(endYear, 11, 31, 23, 59, 59));
}

/** Cuenta atrás legible entre la fecha in-game y el cierre. */
function countdown(now: Date, end: Date): string | null {
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days >= 60) return `${Math.floor(days / 30)} meses`;
  if (days >= 1) return `${days} día${days === 1 ? '' : 's'}`;
  return '< 1 día';
}

export function ElectionsPage() {
  const { t } = useTranslation('common');
  const [elections, setElections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [inGameDate, setInGameDate] = useState<Date | null>(null);

  const loadElections = async () => {
    setLoading(true); setError(null);
    try {
      const [list, state] = await Promise.allSettled([electionsApi.list(), gameApi.getState()]);
      if (list.status === 'fulfilled') {
        setElections(Array.isArray(list.value) ? list.value : []);
      } else {
        const msg = list.reason instanceof Error ? list.reason.message : 'Error cargando elecciones';
        setError(msg);
        toast.error(msg);
      }
      if (state.status === 'fulfilled' && state.value?.inGameDate) {
        const d = new Date(state.value.inGameDate);
        if (!Number.isNaN(d.getTime())) setInGameDate(d);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadElections(); }, []);

  const handleApply = async (electionId: number) => {
    setSubmitting(electionId);
    try {
      await electionsApi.apply(electionId);
      toast.success('Te has candidatado correctamente');
      await loadElections();
    } catch (e: any) {
      toast.error(e.message ?? 'No se pudo registrar la candidatura');
    } finally {
      setSubmitting(null);
    }
  };

  const handleVote = async (electionId: number, candidateManagerId: number) => {
    setSubmitting(electionId);
    try {
      await electionsApi.vote(electionId, candidateManagerId);
      toast.success('Voto registrado');
      await loadElections();
    } catch (e: any) {
      toast.error(e.message ?? 'No se pudo registrar el voto');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .el-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px; margin-bottom: 8px;}
        .el-card{background:linear-gradient(180deg,var(--brutal-card-bg-1),var(--brutal-card-bg-2));border:2px solid var(--brutal-border);border-radius:20px;
          overflow:hidden;transition:all .3s cubic-bezier(0.4, 0, 0.2, 1);cursor:pointer;box-shadow:0 15px 30px var(--brutal-shadow)}
        .el-card:hover{border-color:rgba(245,158,11,0.5);transform:translateY(-4px);box-shadow:0 25px 50px var(--brutal-shadow),0 0 20px rgba(245,158,11,0.1)}
        .el-card.is-open{border-color:rgba(245,158,11,0.8);box-shadow:0 0 30px rgba(245,158,11,0.2),inset 0 0 15px rgba(245,158,11,0.1)}
        .el-card.is-selected{border-color:var(--green-primary);box-shadow:0 0 40px rgba(34,197,94,0.3),inset 0 0 20px rgba(34,197,94,0.1);transform:scale(1.02)}
        .el-titlebar{display:flex;align-items:center;gap:12px;padding:16px 20px;background:var(--brutal-glow);
          border-bottom:2px solid rgba(245,158,11,0.3);font-family:var(--font-display);font-weight:900;font-size:.9rem;
          letter-spacing:2px;text-transform:uppercase;color:var(--brutal-text)}
        .el-card-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 28px;background:linear-gradient(90deg,rgba(245,158,11,0.05),transparent)}
        .el-ic{width:48px;height:48px;border-radius:12px;display:grid;place-items:center;flex-shrink:0;border:2px solid rgba(245,158,11,0.4);background:rgba(245,158,11,0.1);color:var(--amber-warning);box-shadow:0 0 15px rgba(245,158,11,0.2)}
        .el-title{font-family:var(--font-display);font-weight:900;font-size:1.3rem;color:var(--brutal-text);text-transform:uppercase;letter-spacing:1px;text-shadow:0 0 10px rgba(255,255,255,0.2)}
        .el-sub{font-size:.85rem;color:var(--brutal-text-muted);font-family:var(--font-mono-retro);letter-spacing:1px;margin-top:4px}
        .el-count{display:inline-flex;align-items:center;gap:8px;font-family:var(--font-mono-retro);font-size:.85rem;font-weight:900;
          padding:6px 12px;border-radius:8px;border:2px solid rgba(239,68,68,0.5);
          color:var(--red-danger);background:rgba(239,68,68,0.1);box-shadow:0 0 15px rgba(239,68,68,0.3);animation:elpulse 2s infinite}
        @keyframes elpulse { 0%,100%{box-shadow:0 0 15px rgba(239,68,68,0.3)} 50%{box-shadow:0 0 25px rgba(239,68,68,0.6)} }
        .el-winner-box{display:flex;align-items:center;gap:16px;padding:16px 20px;border-radius:16px;
          border:2px solid rgba(255,215,0,0.6);
          background:linear-gradient(135deg,rgba(255,215,0,0.15),var(--brutal-bg-elevated) 60%);
          box-shadow:0 0 30px rgba(255,215,0,0.2),inset 0 0 15px rgba(255,215,0,0.1);margin-top:16px}
        .el-winner-name{font-family:var(--font-display);font-weight:900;font-size:1.4rem;color:var(--gold-accent);
          text-shadow:0 0 20px rgba(255,215,0,0.5);letter-spacing:1px;text-transform:uppercase}
        .el-winner-mini{text-align:right}
        .el-winner-mini-l{font-size:.7rem;text-transform:uppercase;letter-spacing:2px;color:var(--brutal-text-muted);font-weight:700}
        .el-winner-mini-n{font-family:var(--font-display);font-weight:900;font-size:1.1rem;color:var(--gold-accent);text-shadow:0 0 10px rgba(255,215,0,0.3)}
        .el-detail{border-top:2px solid var(--brutal-border);padding:24px 28px;cursor:default;background:var(--brutal-bg-2)}
        .el-cands{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-top:16px}
        .el-pt{font-size:.8rem;text-transform:uppercase;letter-spacing:2px;color:var(--brutal-text);font-weight:900;font-family:var(--font-display);margin-bottom:8px;display:flex;align-items:center;gap:8px}
        .el-pt::before{content:'';width:8px;height:8px;background:var(--amber-warning);border-radius:50%;box-shadow:0 0 10px var(--amber-warning)}
        @media(max-width:760px){.el-cands{grid-template-columns:1fr}.el-card-head{flex-wrap:wrap}}
      `}</style>

      <div className="el-head">
        <div>
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-black mb-1">{t('Federación · seleccionador y presidencia')}</p>
          <h1 className="font-display font-black text-3xl uppercase tracking-tight text-[var(--text-primary)]">{t('Elecciones')}</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={loadElections} disabled={loading} aria-label="Recargar">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 'var(--radius-retro)', background: 'color-mix(in srgb,var(--red-danger) 10%,transparent)', border: '1px solid color-mix(in srgb,var(--red-danger) 35%,transparent)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--red-danger)' }} />
          <p style={{ fontSize: '.85rem', color: 'var(--red-danger)' }}>{error}</p>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
      ) : elections.length === 0 ? (
        <EmptyState
          icon={<Trophy size={42} />}
          title="Sin elecciones activas"
          hint="Las elecciones se convocan cada 2 años in-game. Vuelve más adelante para presentar tu candidatura."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {elections.map(el => {
            const candidates: any[] = Array.isArray(el?.candidates) ? el.candidates : [];
            // % de votos por candidato si el backend lo provee; si no, barra por prestigio relativo.
            const hasVotePct = candidates.some(c => typeof c?.votePct === 'number' || typeof c?.votes === 'number');
            const totalCandVotes = candidates.reduce((s, c) => s + (typeof c?.votes === 'number' ? c.votes : 0), 0);
            const maxPrestige = Math.max(1, ...candidates.map(c => Number(c?.prestige ?? 0)));
            const isSelected = selected?.id === el.id;
            const end = periodEnd(el.period);
            const remain = el.isOpen && end && inGameDate ? countdown(inGameDate, end) : null;

            return (
              <div
                key={el.id}
                className={cn('el-card', el.isOpen && 'is-open', isSelected && 'is-selected')}
                onClick={() => setSelected(isSelected ? null : el)}
              >
                <div className="el-titlebar">
                  {el.isOpen ? <Vote size={13} /> : <Trophy size={13} />}
                  {t('Elección')} {el.country?.name ?? `país #${el.countryId}`} · {el.period}
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {remain && (
                      <span className="el-count"><Hourglass size={11} /> {t('CIERRA EN')} {remain.toUpperCase()}</span>
                    )}
                    <Badge variant={el.isOpen ? 'success' : 'neutral'}>{el.isOpen ? t('Abierta') : t('Cerrada')}</Badge>
                  </span>
                </div>

                <div className="el-card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="el-ic" style={{ background: el.isOpen ? 'color-mix(in srgb,var(--green-primary) 14%,transparent)' : 'var(--brutal-bg-elevated)' }}>
                      {el.isOpen
                        ? <Vote size={17} style={{ color: 'var(--green-primary)' }} />
                        : <Trophy size={17} style={{ color: 'var(--gold-accent)' }} />}
                    </div>
                    <div>
                      <p className="el-title">{el.country?.name ?? `País #${el.countryId}`} · {t('Período')} {el.period}</p>
                      <p className="el-sub">{candidates.length} {t('CANDIDATO(S)')} · {el.votes ?? 0} {t('VOTO(S) EMITIDOS')}</p>
                    </div>
                  </div>
                  {el.winner && (
                    <div className="el-winner-mini">
                      <p className="el-winner-mini-l">{t('Ganador')}</p>
                      <p className="el-winner-mini-n"><Crown size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />{el.winner?.name ?? '—'}</p>
                    </div>
                  )}
                </div>

                {isSelected && (
                  <div className="el-detail" onClick={e => e.stopPropagation()}>
                    {el.isOpen && (
                      <Button
                        variant="gold"
                        size="sm"
                        onClick={() => handleApply(el.id)}
                        disabled={submitting === el.id}
                        style={{ marginBottom: 4 }}
                      >
                        {submitting === el.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : <><UserPlus size={14} /> {t('Candidatarse')}</>}
                      </Button>
                    )}

                    {!el.isOpen && el.winner && (
                      <div className="el-winner-box">
                        <Crown size={22} style={{ color: 'var(--gold-accent)', flexShrink: 0 }} />
                        <div>
                          <p className="el-pt">{t('Resultado · ganador del período')} {el.period}</p>
                          <p className="el-winner-name">{el.winner?.name ?? '—'}</p>
                          {el.winner?.user?.username && (
                            <p className="el-sub">@{el.winner.user.username}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {candidates.length === 0 ? (
                      <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 8 }}>{t('Sin candidatos todavía.')}</p>
                    ) : (
                      <>
                        <p className="el-pt" style={{ marginTop: 12 }}>{t('Candidatos')}</p>
                        <div className="el-cands">
                          {candidates.map((c: any) => {
                            const isWinner = el.winnerId != null && c?.id === el.winnerId;
                            const candVotes = typeof c?.votes === 'number' ? c.votes : null;
                            const pct = typeof c?.votePct === 'number'
                              ? c.votePct
                              : candVotes != null && totalCandVotes > 0
                                ? (candVotes / totalCandVotes) * 100
                                : (Number(c?.prestige ?? 0) / maxPrestige) * 100;
                            const data: CandidateData = {
                              id: c?.id,
                              name: c?.name ?? 'Candidato',
                              username: c?.user?.username,
                              prestige: c?.prestige ?? 0,
                              pct,
                              votes: candVotes,
                              barMode: hasVotePct ? 'votes' : 'prestige',
                              isWinner,
                            };
                            return (
                              <CandidateCard
                                key={c?.id ?? c?.name}
                                candidate={data}
                                canVote={Boolean(el.isOpen)}
                                voting={submitting === el.id}
                                onVote={(candidateId) => handleVote(el.id, candidateId)}
                              />
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
