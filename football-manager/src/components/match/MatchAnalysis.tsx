import { Crown, FastForward, PlayCircle, Radio, Sparkles, Swords, Target } from 'lucide-react';
import { PlayerLink } from '../common/EntityLink';
import { useTranslation } from 'react-i18next';

export interface MatchAnalysisProps {
  analysis: any;
  onPlayAtMinute: (minute: number) => void;
  homeColor: string;
  awayColor: string;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
}

export function MatchAnalysis({
  analysis, onPlayAtMinute, homeColor, awayColor, homeName, awayName, homeGoals, awayGoals,
}: MatchAnalysisProps) {
  const { t } = useTranslation('common');
  if (!analysis) return null;

  const mvp = analysis.mvp;
  const momentum = analysis.momentum || [];
  const bestPlays = analysis.bestPlays || [];
  const chances = analysis.clearChances || { home: 0, away: 0 };
  const xg = analysis.xg || { home: 0, away: 0 };
  const keyDuels = analysis.keyDuels || [];
  const narrative = analysis.narrative || [];
  const xgBalance = Number(xg.home ?? 0) - Number(xg.away ?? 0);
  const resultBalance = homeGoals - awayGoals;
  const verdict = resultBalance === 0
    ? Math.abs(xgBalance) < 0.35 ? t('ux.postMatchAnalysis.even') : t('ux.postMatchAnalysis.drawAgainstFlow')
    : Math.sign(resultBalance) === Math.sign(xgBalance) || Math.abs(xgBalance) < 0.2
      ? t('ux.postMatchAnalysis.deserved')
      : t('ux.postMatchAnalysis.smashAndGrab');
  const turningPoint = bestPlays[0];

  return (
    <div className="flex flex-col gap-8 font-sans animate-fade-in pb-10">
      <section className="section-panel overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-5 p-5 sm:p-6 bg-[linear-gradient(120deg,color-mix(in_srgb,var(--green-primary)_8%,var(--bg-surface)),var(--bg-surface))]">
          <div>
            <p className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-black text-[var(--gold-accent)]">
              <Sparkles size={13} /> {t('ux.postMatchAnalysis.story')}
            </p>
            <h2 className="mt-2 font-display font-black text-xl sm:text-2xl text-[var(--text-primary)]">{verdict}</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)] max-w-2xl leading-relaxed">
              {turningPoint
                ? t('ux.postMatchAnalysis.turningPoint', { minute: turningPoint.minute, play: turningPoint.text })
                : t('ux.postMatchAnalysis.noTurningPoint')}
            </p>
            {turningPoint && (
              <button
                type="button"
                onClick={() => onPlayAtMinute(turningPoint.minute)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[var(--green-primary)]/40 bg-[var(--green-primary)]/10 px-3 py-2 text-xs font-bold text-[var(--green-primary)]"
              >
                <PlayCircle size={14} /> {t('ux.postMatchAnalysis.reliveMoment')}
              </button>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-base)]/35 px-5 py-4 min-w-[260px]">
            <div className="text-right min-w-0">
              <strong className="block truncate text-sm" style={{ color: homeColor }}>{homeName}</strong>
              <small className="text-[10px] text-[var(--text-muted)]">xG {Number(xg.home ?? 0).toFixed(2)}</small>
            </div>
            <span className="font-scoreboard text-4xl text-[var(--text-primary)]">{homeGoals}–{awayGoals}</span>
            <div className="min-w-0">
              <strong className="block truncate text-sm" style={{ color: awayColor }}>{awayName}</strong>
              <small className="text-[10px] text-[var(--text-muted)]">xG {Number(xg.away ?? 0).toFixed(2)}</small>
            </div>
          </div>
        </div>
      </section>
      
      {/* Top Row: MVP & Main Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* MVP Card */}
        {mvp ? (
          <div className="col-span-1 lg:col-span-2 section-panel p-6 relative overflow-hidden flex flex-col justify-center">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transform translate-x-4 translate-y-4">
              <Crown size={140} />
            </div>
            
            <h3 className="font-display font-bold text-sm text-[var(--text-muted)] uppercase tracking-wider mb-6 flex items-center gap-2 relative z-10">
              <Crown size={18} className="text-[var(--gold-accent)]" /> Jugador del Partido
            </h3>
            
            <div className="flex items-center gap-8 relative z-10">
              <div className="w-20 h-20 rounded-full bg-[var(--bg-elevated)] border-4 flex items-center justify-center font-display font-bold text-3xl shadow-lg" 
                   style={{ borderColor: mvp.team === 'home' ? homeColor : awayColor }}>
                {mvp.rating?.toFixed(1) || '-'}
              </div>
              <div>
                <span className="font-display font-bold text-3xl text-[var(--gold-accent)] text-shadow-gold block mb-1">
                  <PlayerLink id={mvp.playerId} name={mvp.name} />
                </span>
                <div className="flex items-center gap-4 mt-2">
                  <span className="px-3 py-1 bg-[var(--bg-elevated)] rounded font-mono text-xs uppercase tracking-wider border border-[var(--border-color)]">
                    {mvp.team === 'home' ? 'Local' : 'Visitante'}
                  </span>
                  {mvp.goals > 0 && <span className="font-bold text-sm bg-[var(--bg-surface)] px-3 py-1 rounded-full border border-[var(--border-color)] shadow-sm">⚽ {mvp.goals} goles</span>}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="col-span-1 lg:col-span-2 section-panel p-6 text-[var(--text-muted)] text-sm flex items-center justify-center">
            Sin MVP destacado
          </div>
        )}

        {/* Core Match Stats (xG & Chances) */}
        <div className="col-span-1 flex flex-col gap-4">
          <div className="section-panel p-5 flex-1 flex flex-col justify-center relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform"><Target size={80}/></div>
            <h3 className="font-display font-bold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3 text-center">Goles Esperados (xG)</h3>
            <div className="flex justify-between items-end px-4 relative z-10">
              <div className="text-center">
                <span className="block text-4xl font-mono tracking-tighter" style={{ color: homeColor, textShadow: `0 0 10px ${homeColor}40` }}>
                  {xg.home?.toFixed(2) ?? '0.00'}
                </span>
              </div>
              <span className="text-[var(--text-muted)] font-mono text-xs pb-2">vs</span>
              <div className="text-center">
                <span className="block text-4xl font-mono tracking-tighter" style={{ color: awayColor, textShadow: `0 0 10px ${awayColor}40` }}>
                  {xg.away?.toFixed(2) ?? '0.00'}
                </span>
              </div>
            </div>
          </div>

          <div className="section-panel p-5 flex-1 flex flex-col justify-center">
            <h3 className="font-display font-bold text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3 text-center">Ocasiones Claras</h3>
            <div className="flex justify-between items-end px-4">
              <span className="block text-3xl font-mono" style={{ color: homeColor }}>{chances.home}</span>
              <div className="h-6 w-px bg-[var(--border-color)] mx-4" />
              <span className="block text-3xl font-mono" style={{ color: awayColor }}>{chances.away}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Crónica Radiofónica y Momentum */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Crónica Radiofónica */}
        <div className="section-panel p-6 flex flex-col h-full">
          <h3 className="font-display font-bold text-sm text-[var(--text-muted)] uppercase tracking-wider mb-6 flex items-center gap-2">
            <Radio size={16} className="text-[var(--blue-info)] animate-pulse" /> Crónica del Partido
          </h3>
          <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1 max-h-[300px]">
            {narrative.length > 0 ? narrative.map((n: any, i: number) => (
              <div key={i} className="flex gap-4 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)] hover:border-[var(--blue-info)] transition-colors group">
                <div className="w-14 h-14 rounded-full bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col items-center justify-center font-mono text-xs shrink-0 shadow-inner">
                  <span className="font-bold text-[var(--text-primary)] leading-none mb-1">{n.from}'</span>
                  <span className="text-[9px] text-[var(--text-muted)] leading-none">{n.to}'</span>
                </div>
                <p className="text-sm text-[var(--text-primary)] leading-relaxed flex-1 group-hover:text-[var(--text-bright)] transition-colors">
                  {n.text}
                </p>
              </div>
            )) : (
              <p className="text-sm text-[var(--text-muted)] text-center py-6">Sin crónica disponible.</p>
            )}
          </div>
        </div>

        {/* Momentum Chart */}
        <div className="section-panel p-6 flex flex-col h-full">
          <h3 className="font-display font-bold text-sm text-[var(--text-muted)] uppercase tracking-wider mb-6 flex items-center gap-2">
            <FastForward size={16} /> Momentum (Presión por tramos de 15')
          </h3>
          
          {momentum.length > 0 ? (
            <div className="relative flex-1 min-h-[250px] w-full flex items-end gap-1 mt-4">
              <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--border-color)] z-0" />
              
              {momentum.map((m: any, i: number) => {
                const isHome = m.balance > 0;
                const heightPct = Math.min(100, Math.abs(m.balance));
                const h = `${(heightPct / 100) * 50}%`;
                
                return (
                  <div key={i} className="flex-1 flex flex-col justify-center relative group h-full" title={`${m.from}'-${m.to}': ${m.balance > 0 ? 'Local' : 'Visitante'} (+${Math.abs(Math.round(m.balance))})`}>
                    <div className="h-1/2 w-full flex items-end justify-center pb-0.5">
                      {isHome && <div className="w-4/5 rounded-t shadow-[0_0_10px_rgba(0,0,0,0.2)] transition-all duration-500 ease-out group-hover:brightness-125" style={{ height: h, backgroundColor: homeColor, opacity: 0.9 }} />}
                    </div>
                    <div className="h-1/2 w-full flex items-start justify-center pt-0.5">
                      {!isHome && <div className="w-4/5 rounded-b shadow-[0_0_10px_rgba(0,0,0,0.2)] transition-all duration-500 ease-out group-hover:brightness-125" style={{ height: h, backgroundColor: awayColor, opacity: 0.9 }} />}
                    </div>
                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-[var(--text-muted)] font-mono opacity-50 group-hover:opacity-100 group-hover:text-[var(--text-primary)] transition-all whitespace-nowrap bg-[var(--bg-elevated)] px-2 py-1 rounded">
                      {m.to}'
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)] text-center py-6 m-auto">Datos de momentum no disponibles</p>
          )}
        </div>
      </div>

      {/* Key Duels & Best Plays */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Duelos Clave */}
        {keyDuels.length > 0 && (
          <div className="section-panel p-6">
            <h3 className="font-display font-bold text-sm text-[var(--text-muted)] uppercase tracking-wider mb-6 flex items-center gap-2">
              <Swords size={16} className="text-[var(--red-danger)]" /> Duelos Decisivos
            </h3>
            <div className="space-y-4">
              {keyDuels.map((duel: any, i: number) => {
                const attAttr = Object.entries(duel.att.attrs || {})[0] || ['Atributo', 0];
                const defAttr = Object.entries(duel.def.attrs || {})[0] || ['Atributo', 0];
                const attScore = Number(attAttr[1]);
                const defScore = Number(defAttr[1]);
                const total = attScore + defScore || 1;
                const attPct = (attScore / total) * 100;
                
                return (
                  <div key={i} className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-xl p-4 overflow-hidden relative group">
                    <div className="flex justify-between items-center mb-4">
                      <div className="font-mono text-xs font-bold bg-[var(--bg-surface)] px-2 py-1 rounded border border-[var(--border-color)] shadow-sm">
                        ⏱ {duel.minute}'
                      </div>
                      <div className="text-xs font-bold uppercase tracking-wide text-[var(--gold-accent)] bg-[var(--gold-accent)]/10 px-2 py-1 rounded">
                        {duel.kind}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-3 relative">
                      {/* Atacante */}
                      <div className="flex-1 text-right">
                        <p className="font-bold text-sm truncate"><PlayerLink id={duel.att.playerId} name={duel.att.name} /></p>
                        <p className="text-[10px] text-[var(--text-muted)] uppercase">{duel.att.position} · {attAttr[0]}</p>
                      </div>
                      
                      <div className="w-12 h-12 shrink-0 rounded-full bg-[var(--bg-surface)] border-2 border-[var(--border-color)] flex items-center justify-center relative z-10 shadow-lg">
                        <span className="font-display font-bold text-sm">{duel.gap.toFixed(1)}</span>
                      </div>
                      
                      {/* Defensor */}
                      <div className="flex-1 text-left">
                        <p className="font-bold text-sm truncate"><PlayerLink id={duel.def.playerId} name={duel.def.name} /></p>
                        <p className="text-[10px] text-[var(--text-muted)] uppercase">{duel.def.position} · {defAttr[0]}</p>
                      </div>
                    </div>
                    
                    {/* Barra de fuerzas */}
                    <div className="h-2 w-full bg-[var(--bg-surface)] rounded-full overflow-hidden flex shadow-inner">
                      <div className="h-full bg-gradient-to-r from-[var(--blue-info)] to-[var(--blue-accent)]" style={{ width: `${attPct}%` }} />
                      <div className="h-full bg-gradient-to-l from-[var(--red-danger)] to-[#ff4d4f]" style={{ width: `${100 - attPct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 px-1">
                      <span className="text-[10px] font-mono text-[var(--blue-info)] font-bold">{attScore.toFixed(1)}</span>
                      <span className="text-[10px] font-mono text-[var(--red-danger)] font-bold">{defScore.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Best Plays */}
        {bestPlays.length > 0 && (
          <div className="section-panel p-6">
            <h3 className="font-display font-bold text-sm text-[var(--text-muted)] uppercase tracking-wider mb-6 flex items-center gap-2">
              <PlayCircle size={16} className="text-[var(--green-primary)]" /> Highlights
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {bestPlays.map((play: any, i: number) => (
                <button key={i} onClick={() => onPlayAtMinute(play.minute)}
                  className="flex items-start gap-4 p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-color)] hover:border-[var(--green-primary)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all text-left group">
                  <div className="w-12 h-12 rounded-full flex flex-col items-center justify-center font-mono text-sm font-bold shrink-0 shadow-md transform group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: play.team === 'home' ? homeColor : awayColor, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                    <span>{play.minute}'</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-sm font-bold capitalize group-hover:text-[var(--green-primary)] transition-colors">{play.kind}</p>
                      <PlayCircle size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed group-hover:text-[var(--text-primary)] transition-colors">{play.text}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
