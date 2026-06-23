import { ClubBadge } from '../ui/ClubBadge';
import { PosBadge } from '../ui/PosBadge';
import { PlayerLink } from '../common/EntityLink';
import { Flame, History, MapPin, Play, Shield, Swords, Thermometer, Zap } from 'lucide-react';
import { kitOf, resolveClash } from './kitColors';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { clubApi, matchesApi } from '../../api/client';
import { useSession } from '../../stores/sessionStore';

export interface MatchPreviewProps {
  preview: any;
  matchId?: number;
  onStart?: () => void;
  canStart?: boolean;
}

function FormDots({ form }: { form: any[] }) {
  if (!form || form.length === 0) return <span className="text-[var(--text-muted)] text-sm">Sin datos</span>;
  return (
    <div className="flex gap-2">
      {form.slice(0, 5).map((f: any, i: number) => {
        const bg = f.result === 'W' ? 'var(--green-primary)' : f.result === 'D' ? 'var(--text-muted)' : 'var(--red-danger)';
        const shadow = f.result === 'W' ? '0 0 10px var(--green-primary)' : f.result === 'D' ? 'none' : '0 0 10px var(--red-danger)';
        return (
          <div key={i} title={`${f.result} vs ${f.rivalShortName} (${f.score})`}
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-[var(--bg-base)] shadow-sm transform hover:scale-125 transition-transform cursor-help"
            style={{ backgroundColor: bg, boxShadow: shadow }}>
            {f.result}
          </div>
        );
      })}
    </div>
  );
}

export function MatchPreview({ preview, matchId, onStart, canStart }: MatchPreviewProps) {
  const { t } = useTranslation();
  const { club } = useSession();
  const [formalRivalry, setFormalRivalry] = useState<any>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!matchId) {
      toast.success(t('gameplay:common.copyPoster'));
      return;
    }
    const matchUrl = `${window.location.origin}/matches/${matchId}`;
    setSharing(true);
    try {
      const ok = await matchesApi.tryOgImage(matchId);
      if (ok) {
        toast.success(t('gameplay:match.toasts.cardGenerated'));
      } else {
        await navigator.clipboard.writeText(matchUrl);
        toast.success(t('gameplay:match.toasts.linkCopied'));
      }
    } catch {
      try {
        await navigator.clipboard.writeText(matchUrl);
        toast.success(t('gameplay:match.toasts.linkCopied'));
      } catch {
        toast.error(t('gameplay:match.toasts.shareError'));
      }
    } finally {
      setSharing(false);
    }
  };

  useEffect(() => {
    if (!preview || !club?.id || preview.homeClub?.id !== club.id) return;
    let cancelled = false;
    clubApi.rivalWeek()
      .then((rw) => {
        if (cancelled) return;
        const rivalId = preview.awayClub?.id;
        if (rw?.formalRivalry?.rival?.id === rivalId || rw?.rival?.id === rivalId) {
          setFormalRivalry(rw.formalRivalry ?? rw);
        } else if (preview.rivalry) {
          setFormalRivalry({ name: preview.rivalry.name, rival: preview.awayClub });
        }
      })
      .catch(() => {
        if (!cancelled && preview.rivalry) {
          setFormalRivalry({ name: preview.rivalry.name, rival: preview.awayClub });
        }
      });
    return () => { cancelled = true; };
  }, [club?.id, preview]);

  if (!preview) return null;

  const isHomeFortress = Boolean(club?.id && preview.homeClub?.id === club.id && (formalRivalry || preview.rivalry));
  const fortressName = formalRivalry?.name ?? preview.rivalry?.name ?? 'Derbi';

  const kit = resolveClash(
    kitOf(preview.homeClub?.badge, preview.homeClub?.id, preview.homeClub?.name),
    kitOf(preview.awayClub?.badge, preview.awayClub?.id, preview.awayClub?.name)
  );

  return (
    <div className="flex flex-col gap-8 font-sans animate-fade-in">
      {isHomeFortress && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--red-danger)] p-6 text-center shadow-[0_0_40px_rgba(239,68,68,0.15)]"
          style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--red-danger) 18%, var(--bg-surface)) 0%, var(--bg-surface) 100%)' }}>
          <div className="absolute inset-0 opacity-10 pointer-events-none"
            style={{ background: 'repeating-linear-gradient(90deg, transparent 0 24px, var(--border-color) 24px 26px)' }} />
          <div className="relative z-10 flex flex-col items-center gap-3">
            <Shield size={40} className="text-[var(--red-danger)]" />
            <p className="text-[10px] uppercase tracking-[0.3em] font-black text-[var(--red-danger)]">Estadio-fortaleza</p>
            <h3 className="font-display font-black text-2xl md:text-3xl text-white uppercase">
              {preview.venue?.stadiumName ?? preview.homeClub?.name} · {fortressName}
            </h3>
            <p className="text-sm text-[var(--text-muted)] max-w-xl">
              Juegas en casa ante tu rival formal. La grada llena, el muro defensivo y el ambiente intimidatorio están de vuestra parte.
              {preview.venue?.fans ? ` · ${preview.venue.fans.toLocaleString('es-ES')} almas empujando desde el fondo.` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-panel-gradient border border-[var(--border-color)] p-10 shadow-2xl group">
        <div className="absolute inset-0 pointer-events-none opacity-20"
             style={{ background: 'repeating-linear-gradient(0deg,transparent 0 2px,var(--scanline-color) 2px 4px)' }} />
        
        {/* Animated Glow Behind */}
        <div className="absolute top-1/2 left-1/4 w-64 h-64 bg-gradient-radial from-[var(--blue-info)] to-transparent opacity-10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 animate-pulse" />
        <div className="absolute top-1/2 right-1/4 w-64 h-64 bg-gradient-radial from-[var(--red-danger)] to-transparent opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 animate-pulse" style={{ animationDelay: '1s' }} />

        {preview.rivalry && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[var(--gold-accent)] text-[var(--bg-base)] px-6 py-1.5 rounded-b-xl font-display font-bold text-sm flex items-center gap-2 shadow-[0_4px_20px_rgba(255,215,0,0.3)] animate-bounce-slow">
            <Flame size={16} /> {preview.rivalry.name}
          </div>
        )}

        <button 
          onClick={handleShare}
          disabled={sharing}
          className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-white/20 rounded-full transition-colors text-white/50 hover:text-white z-20"
          title={t('gameplay:match.sharePoster')}
          aria-label={t('gameplay:match.sharePoster')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>

        <div className="relative z-10 flex flex-col items-center text-center">
          <p className="font-mono text-sm tracking-[0.2em] text-[var(--text-muted)] uppercase mb-8 flex items-center gap-2">
            <Zap size={14} className="text-[var(--gold-accent)]" />
            {preview.competition?.name} · Jornada {preview.matchdayNum}
            <Zap size={14} className="text-[var(--gold-accent)]" />
          </p>

          <div className="flex items-center justify-between w-full max-w-4xl mx-auto">
            {/* Home Team */}
            <div className="flex flex-col items-center gap-4 flex-1 group/team">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-radial from-white to-transparent opacity-0 group-hover/team:opacity-20 transition-opacity blur-xl rounded-full" />
                <ClubBadge id={preview.homeClub?.id ?? 0} name={preview.homeClub?.name} size={120} className="transform group-hover/team:scale-110 transition-transform duration-500 drop-shadow-2xl" />
              </div>
              <h2 className="font-display font-black text-3xl md:text-4xl text-shadow-sm">{preview.homeClub?.name}</h2>
              {preview.positions?.sameLeague && (
                <span className="font-mono text-sm px-3 py-1 bg-[var(--bg-elevated)] rounded-full border border-[var(--border-color)] shadow-inner">
                  {preview.positions.home}º en liga
                </span>
              )}
            </div>

            {/* VS */}
            <div className="font-display font-black text-6xl text-[var(--text-muted)] opacity-30 italic mx-8">
              VS
            </div>

            {/* Away Team */}
            <div className="flex flex-col items-center gap-4 flex-1 group/team">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-radial from-white to-transparent opacity-0 group-hover/team:opacity-20 transition-opacity blur-xl rounded-full" />
                <ClubBadge id={preview.awayClub?.id ?? 0} name={preview.awayClub?.name} size={120} className="transform group-hover/team:scale-110 transition-transform duration-500 drop-shadow-2xl" />
              </div>
              <h2 className="font-display font-black text-3xl md:text-4xl text-shadow-sm">{preview.awayClub?.name}</h2>
              {preview.positions?.sameLeague && (
                <span className="font-mono text-sm px-3 py-1 bg-[var(--bg-elevated)] rounded-full border border-[var(--border-color)] shadow-inner">
                  {preview.positions.away}º en liga
                </span>
              )}
            </div>
          </div>

          {preview.tagline && (
            <div className="mt-10 px-8 py-4 bg-[var(--bg-surface)] border border-[var(--gold-accent)] rounded-xl inline-block shadow-[0_0_30px_rgba(255,215,0,0.15)] transform hover:scale-105 transition-transform">
              <p className="font-display font-bold text-xl md:text-2xl text-[var(--gold-accent)] text-shadow-gold">{preview.tagline}</p>
            </div>
          )}

          {canStart && onStart && (
            <button
              type="button"
              onClick={onStart}
              className="group/play relative mt-10 inline-flex items-center gap-3 rounded-2xl px-12 h-14 font-display font-black text-lg uppercase tracking-[0.12em] transition-transform duration-300 hover:scale-[1.05] active:scale-[0.97] focus-visible:outline-none"
              style={{
                color: '#08130c',
                background: 'linear-gradient(135deg, var(--green-primary), color-mix(in srgb, var(--green-primary) 55%, var(--gold-accent)))',
                boxShadow: '0 16px 44px -10px color-mix(in srgb, var(--green-primary) 80%, transparent), inset 0 1px 0 rgba(255,255,255,0.4)',
              }}
            >
              <span
                className="absolute -inset-1 rounded-2xl opacity-0 group-hover/play:opacity-100 transition-opacity pointer-events-none"
                style={{ background: 'radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--green-primary) 40%, transparent), transparent 70%)', filter: 'blur(12px)' }}
              />
              <Play size={20} fill="currentColor" className="relative" />
              <span className="relative">{t('gameplay:match.hidden.watch')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* H2H & Form */}
        <div className="col-span-1 md:col-span-2 section-panel p-6">
          <h3 className="font-display font-bold text-sm text-[var(--text-muted)] uppercase tracking-wider mb-6 flex items-center gap-2">
            <History size={16} className="text-[var(--blue-info)]" /> Estado de forma y Cara a Cara
          </h3>
          
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div className="bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-color)] hover:border-[var(--blue-info)] transition-colors">
              <p className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: kit.home }}>Últimos 5 ({preview.homeClub?.shortName})</p>
              <FormDots form={preview.form?.home} />
            </div>
            <div className="bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-color)] hover:border-[var(--blue-info)] transition-colors">
              <p className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: kit.away }}>Últimos 5 ({preview.awayClub?.shortName})</p>
              <FormDots form={preview.form?.away} />
            </div>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded-xl p-6 flex items-center justify-between shadow-inner">
            <div className="text-center flex-1">
              <span className="block text-4xl font-display font-black text-[var(--green-primary)] mb-1 text-shadow-sm">{preview.headToHead?.homeWins || 0}</span>
              <span className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">Victorias LOCAL</span>
            </div>
            <div className="h-16 w-px bg-[var(--border-color)] mx-4" />
            <div className="text-center flex-1">
              <span className="block text-4xl font-display font-black text-[var(--text-muted)] mb-1">{preview.headToHead?.draws || 0}</span>
              <span className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">Empates</span>
            </div>
            <div className="h-16 w-px bg-[var(--border-color)] mx-4" />
            <div className="text-center flex-1">
              <span className="block text-4xl font-display font-black text-[var(--blue-info)] mb-1 text-shadow-sm">{preview.headToHead?.awayWins || 0}</span>
              <span className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider">Victorias VISIT.</span>
            </div>
          </div>
        </div>

        {/* Venue */}
        <div className="col-span-1 section-panel p-6 flex flex-col">
          <h3 className="font-display font-bold text-sm text-[var(--text-muted)] uppercase tracking-wider mb-6 flex items-center gap-2">
            <MapPin size={16} className="text-[var(--gold-accent)]" /> El Escenario
          </h3>
          {preview.venue ? (
            <div className="space-y-6 flex-1 flex flex-col justify-center">
              <div className="text-center bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-color)]">
                <p className="text-2xl font-display font-bold mb-2 text-[var(--gold-accent)] text-shadow-gold">{preview.venue.stadiumName}</p>
                <p className="text-sm font-mono text-[var(--text-primary)] bg-[var(--bg-surface)] py-1 px-3 rounded inline-block border border-[var(--border-color)]">
                  {preview.venue.fans?.toLocaleString()} espectadores
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 bg-[var(--bg-elevated)] rounded-xl p-4 border border-[var(--border-color)]">
                <div className="w-10 h-10 rounded-full bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-center shadow-inner">
                  <Thermometer size={20} className="text-[var(--blue-info)]" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-[var(--text-primary)]">{preview.venue.weatherCondition}</p>
                  <p className="text-sm text-[var(--text-muted)] font-mono">{preview.venue.temperature}°C</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm italic bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-color)]">
              Información del estadio no disponible.
            </div>
          )}
        </div>
      </div>

      {/* Key Players Duel */}
      <div className="section-panel p-0 overflow-hidden">
        <div className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-surface)]">
          <h3 className="font-display font-bold text-sm text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-2">
            <Swords size={16} className="text-[var(--red-danger)]" /> Duelo de Estrellas
          </h3>
        </div>
        
        <div className="flex justify-between items-center bg-[var(--bg-elevated)] p-8 relative">
          <div className="absolute inset-0 opacity-20 pointer-events-none bg-gradient-to-r from-[var(--blue-info)] via-transparent to-[var(--red-danger)] mix-blend-overlay" />
          
          {/* Home Player */}
          {preview.keyPlayers?.home?.playerId ? (
            <div className="flex flex-col items-start gap-3 relative z-10 w-[40%] group">
              <span className="text-[10px] font-bold text-[var(--text-base)] bg-[var(--text-primary)] px-2 py-0.5 rounded uppercase tracking-widest">Local</span>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                  <PosBadge position={preview.keyPlayers.home.position} short />
                </div>
                <span className="font-display font-black text-2xl group-hover:text-[var(--blue-info)] transition-colors"><PlayerLink id={preview.keyPlayers.home.playerId} name={preview.keyPlayers.home.name} /></span>
              </div>
              <div className="flex gap-4 text-sm mt-2 bg-[var(--bg-surface)] px-4 py-2 rounded-lg border border-[var(--border-color)] shadow-inner">
                <span title="Valoración Media" className="font-mono font-bold flex items-center gap-1">
                  <span className="text-[var(--gold-accent)] text-lg leading-none">★</span> {preview.keyPlayers.home.avgRating?.toFixed(2) || '-'}
                </span>
                <span className="w-px bg-[var(--border-color)]" />
                <span className="font-mono font-bold flex items-center gap-1 text-[var(--green-primary)]">
                  ⚽ {preview.keyPlayers.home.goals || 0}
                </span>
              </div>
            </div>
          ) : (
             <div className="w-[40%] text-[var(--text-muted)] text-sm italic text-center">Sin datos</div>
          )}

          <div className="flex flex-col items-center w-[20%] relative z-10">
            <div className="w-16 h-16 rounded-full bg-[var(--bg-surface)] border-4 border-[var(--bg-base)] flex items-center justify-center font-display text-[var(--gold-accent)] font-black text-xl shadow-xl transform hover:rotate-12 transition-transform">
              VS
            </div>
          </div>

          {/* Away Player */}
          {preview.keyPlayers?.away?.playerId ? (
            <div className="flex flex-col items-end gap-3 relative z-10 w-[40%] group text-right">
              <span className="text-[10px] font-bold text-[var(--text-base)] bg-[var(--text-primary)] px-2 py-0.5 rounded uppercase tracking-widest">Visitante</span>
              <div className="flex items-center justify-end gap-3">
                <span className="font-display font-black text-2xl group-hover:text-[var(--red-danger)] transition-colors"><PlayerLink id={preview.keyPlayers.away.playerId} name={preview.keyPlayers.away.name} /></span>
                <div className="w-12 h-12 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                  <PosBadge position={preview.keyPlayers.away.position} short />
                </div>
              </div>
              <div className="flex gap-4 text-sm mt-2 bg-[var(--bg-surface)] px-4 py-2 rounded-lg border border-[var(--border-color)] shadow-inner justify-end">
                <span className="font-mono font-bold flex items-center gap-1 text-[var(--green-primary)]">
                  ⚽ {preview.keyPlayers.away.goals || 0}
                </span>
                <span className="w-px bg-[var(--border-color)]" />
                <span title="Valoración Media" className="font-mono font-bold flex items-center gap-1">
                  <span className="text-[var(--gold-accent)] text-lg leading-none">★</span> {preview.keyPlayers.away.avgRating?.toFixed(2) || '-'}
                </span>
              </div>
            </div>
          ) : (
            <div className="w-[40%] text-center text-[var(--text-muted)] text-sm italic">Sin datos</div>
          )}
        </div>
      </div>
    </div>
  );
}
