// ─── X8 · Gol de la semana (votación entre mánagers) ──────────────────────────
// Consume GET /api/social/goal-of-week (socialApi.goalOfWeek, API_UI §X8):
//   { weekKey, votingOpen, myVote, candidates:[{ goalKey, matchId, minute, team,
//     text, scorer:{playerId,name}, lane, chain[], duel, replay[],
//     match:{homeClub,awayClub,homeGoals,awayGoals,competition}, votes, votedByMe }] }
// Votación con POST /social/goal-of-week/vote (upsert por semana/manager) + emite
// `goal_of_week:vote` por /ws/chat/social. El REPLAY visual (chain[]→duelos) lo
// aporta Antigravity con GoalReplay/matchAnimation: aquí se muestra el resumen
// textual de la jugada y se deja el hueco para enchufar ese componente.
// Defensivo; tokens CSS; sin neón animado.
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Trophy, Crown, Check, PlayCircle } from 'lucide-react';
import { socialApi } from '../../api/client';
import { asArray } from '../../lib/normalize';
import { ClubBadge } from '../ui';
import { GoalReplay } from '../match/GoalReplay';
import { useTranslation } from 'react-i18next';

interface GoalMatch {
  homeClub?: { id?: number; shortName?: string; badge?: string };
  awayClub?: { id?: number; shortName?: string; badge?: string };
  homeGoals?: number; awayGoals?: number; resultHidden?: boolean;
  competition?: { id?: number; name?: string; shortName?: string };
}
interface ChainStep { step?: string; lane?: string; text?: string }
interface GoalCandidate {
  goalKey?: string; matchId?: number; minute?: number; team?: string; text?: string;
  scorer?: { playerId?: number; name?: string };
  lane?: string; chain?: any[];
  match?: GoalMatch; votes?: number; votedByMe?: boolean;
}
interface GoalWeekData { weekKey?: string; votingOpen?: boolean; myVote?: string | null; candidates?: GoalCandidate[] }

const GW_CSS = `
.gw{position:relative;border-radius:14px;padding:18px 20px;border:1px solid color-mix(in srgb,var(--gold-accent) 38%,var(--border-color));
  background:linear-gradient(135deg,var(--bg-surface) 0%,color-mix(in srgb,var(--gold-accent) 10%,var(--bg-surface)) 100%);
  box-shadow:var(--shadow-soft);display:flex;flex-direction:column;gap:14px;overflow:hidden}
.gw-scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 2px,var(--scanline-color) 2px 4px);opacity:.35}
.gw-top{display:flex;align-items:center;gap:10px;position:relative;z-index:1}
.gw-live{font-family:var(--font-mono-retro);font-size:.6rem;padding:2px 8px;border-radius:10px;
  background:var(--red-danger);color:var(--text-primary);letter-spacing:.08em;font-weight:800;animation:gwPulse 2s ease infinite}
@keyframes gwPulse{0%,100%{opacity:1}50%{opacity:.65}}
.gw-title{font-family:var(--font-display);font-weight:800;font-size:.92rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-primary)}
.gw-sub{margin-left:auto;font-size:.68rem;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted)}
.gw-list{display:flex;flex-direction:column;gap:10px;position:relative;z-index:1}
.gw-card{display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:10px;
  background:var(--bg-elevated);border:1px solid var(--border-color)}
.gw-card.win{border-color:color-mix(in srgb,var(--gold-accent) 55%,transparent);
  background:linear-gradient(135deg,color-mix(in srgb,var(--gold-accent) 14%,var(--bg-elevated)),var(--bg-elevated));
  box-shadow:0 0 24px color-mix(in srgb,var(--gold-accent) 18%,transparent)}
.gw-crown{position:absolute;top:-8px;right:12px;display:flex;align-items:center;gap:4px;
  font-size:.58rem;text-transform:uppercase;letter-spacing:.1em;font-weight:800;color:var(--gold-accent);
  background:var(--bg-base);border:1px solid color-mix(in srgb,var(--gold-accent) 50%,transparent);border-radius:999px;padding:2px 8px}
.gw-rank{flex:none;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;
  font-family:var(--font-display);font-weight:800;font-size:.8rem;color:var(--text-muted);
  background:var(--bg-base);border:1px solid var(--border-color)}
.gw-card.win .gw-rank{border-color:var(--gold-accent);background:color-mix(in srgb,var(--gold-accent) 20%,var(--bg-base))}
.gw-body{flex:1;min-width:0}
.gw-scorer{font-weight:800;font-size:.92rem;color:var(--text-primary)}
.gw-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.72rem;color:var(--text-muted);margin-top:3px}
.gw-text{font-size:.78rem;color:var(--text-primary);margin-top:6px;line-height:1.4}
.gw-chain{font-size:.68rem;color:var(--text-muted);margin-top:4px;line-height:1.4}
.gw-right{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.gw-votes{font-family:var(--font-mono-retro);font-weight:800;font-size:1.1rem;color:var(--gold-accent)}
.gw-votes small{display:block;font-size:.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;text-align:right}
.gw-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:7px;cursor:pointer;
  font-family:var(--font-sans);font-weight:700;font-size:.72rem;border:1px solid var(--border-color);
  background:var(--bg-base);color:var(--text-muted);transition:all 150ms ease}
.gw-btn:hover:not(:disabled){color:var(--text-primary);border-color:var(--gold-accent)}
.gw-btn.voted{background:color-mix(in srgb,var(--green-primary) 16%,transparent);color:var(--green-primary);
  border-color:color-mix(in srgb,var(--green-primary) 45%,transparent)}
.gw-btn:disabled{opacity:.6;cursor:default}
.gw-share{font-size:.68rem;color:var(--blue-info);display:inline-flex;align-items:center;gap:4px;background:none;border:none;padding:0;cursor:pointer}
`;

export function GoalOfWeekPanel() {
  const { t } = useTranslation('common');
  const [data, setData] = useState<GoalWeekData | null>(null);
  const [voting, setVoting] = useState<string | null>(null);
  const [replayGoal, setReplayGoal] = useState<GoalCandidate | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    socialApi.goalOfWeek()
      .then(d => { if (mounted.current) setData(d as GoalWeekData); })
      .catch(() => { if (mounted.current) setData({ candidates: [] }); });
    return () => { mounted.current = false; };
  }, []);

  const candidates = asArray<GoalCandidate>(data?.candidates);
  if (!data || candidates.length === 0) return null;

  const votingOpen = data.votingOpen !== false;
  const ranked = [...candidates].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  const topVotes = ranked[0]?.votes ?? 0;

  const handleVote = async (goalKey?: string) => {
    if (!goalKey || !votingOpen || voting) return;
    setVoting(goalKey);
    try {
      const updated = await socialApi.voteGoalOfWeek(goalKey, data.weekKey);
      if (mounted.current) setData(updated as GoalWeekData);
      toast.success(t('Voto registrado'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('No se pudo registrar el voto'));
    } finally {
      if (mounted.current) setVoting(null);
    }
  };

  return (
    <div className="gw">
      <style>{GW_CSS}</style>
      <div className="gw-scan" />
      <div className="gw-top">
        <Trophy size={18} style={{ color: 'var(--gold-accent)' }} />
        <span className="gw-title">{t('Gol de la semana')}</span>
        <span className="gw-live">{t('EN DIRECTO')}</span>
        <span className="gw-sub">{votingOpen ? t('Votación abierta') : t('Votación cerrada')}</span>
      </div>

      <div className="gw-list">
        {ranked.map((c, i) => {
          const m = c.match ?? {};
          const isWinner = !votingOpen && i === 0 && topVotes > 0;
          const voted = c.votedByMe || data.myVote === c.goalKey;
          const chainText = asArray<ChainStep>(c.chain).map(s => s.text).filter(Boolean).join(' → ');
          return (
            <div key={c.goalKey ?? i} className={`gw-card${isWinner ? ' win' : ''}`} style={{ position: 'relative' }}>
              {isWinner && (
                <div className="gw-crown"><Crown size={11} /> {t('Ganador')}</div>
              )}
              <div className="gw-rank">{isWinner ? <Crown size={14} style={{ color: 'var(--gold-accent)' }} /> : i + 1}</div>
              <div className="gw-body">
                <div className="gw-scorer">{c.scorer?.name ?? t('Gol')}{c.minute != null ? ` · ${c.minute}'` : ''}</div>
                <div className="gw-meta">
                  {m.homeClub && <span className="inline-flex items-center gap-1"><ClubBadge id={m.homeClub.id} name={m.homeClub.shortName} badge={m.homeClub.badge} size={14} />{m.homeClub.shortName}</span>}
                  <b style={{ fontFamily: 'var(--font-mono-retro)', color: 'var(--text-primary)' }}>
                    {m.resultHidden ? '? - ?' : `${m.homeGoals ?? 0} - ${m.awayGoals ?? 0}`}
                  </b>
                  {m.awayClub && <span className="inline-flex items-center gap-1">{m.awayClub.shortName}<ClubBadge id={m.awayClub.id} name={m.awayClub.shortName} badge={m.awayClub.badge} size={14} /></span>}
                  {m.competition && <span>· {m.competition.shortName ?? m.competition.name}</span>}
                </div>
                {c.text && <div className="gw-text">{c.text}</div>}
                {chainText && <div className="gw-chain">{chainText}</div>}
                {c.chain && (
                  <button className="gw-share" style={{ marginTop: 6 }} onClick={() => setReplayGoal(c)}>
                    <PlayCircle size={12} /> {isWinner ? t('Ver el gol ganador') : t('Ver jugada')}
                  </button>
                )}
              </div>
              <div className="gw-right">
                <div className="gw-votes">{c.votes ?? 0}<small>{t('votos')}</small></div>
                <button
                  className={`gw-btn${voted ? ' voted' : ''}`}
                  disabled={!votingOpen || voting === c.goalKey}
                  onClick={() => handleVote(c.goalKey)}
                >
                  {voted ? <><Check size={12} /> {t('Votado')}</> : voting === c.goalKey ? t('Votando…') : t('Votar')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {replayGoal && (
        <GoalReplay
          chain={replayGoal.chain || []}
          team={(replayGoal.team === 'away' ? 'away' : 'home')}
          minute={replayGoal.minute || 0}
          teamName={replayGoal.team === 'away' ? (replayGoal.match?.awayClub?.shortName || t('Visitante')) : (replayGoal.match?.homeClub?.shortName || t('Local'))}
          homeColor="var(--green-primary)"
          awayColor="var(--red-danger)"
          onClose={() => setReplayGoal(null)}
        />
      )}
    </div>
  );
}
