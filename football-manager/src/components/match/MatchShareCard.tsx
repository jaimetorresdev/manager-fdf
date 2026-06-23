import type { ParsedMatch } from '../../lib/matchParse';
import { ClubBadge } from '../ui/ClubBadge';

interface Props {
  match: ParsedMatch;
  competitionName?: string;
  matchday?: string;
}

export function MatchShareCard({ match, competitionName = 'FDF', matchday }: Props) {
  const { result, homeName, awayName, homeClub, awayClub } = match;

  // Encontrar MVPs / top valorados
  const homeTop = [...(result.homeRatings || [])].sort((a, b) => b.rating - a.rating).slice(0, 2);
  const awayTop = [...(result.awayRatings || [])].sort((a, b) => b.rating - a.rating).slice(0, 2);

  // Epic moments (goles, expulsiones)
  const epicMoments = (result.timeline || [])
    .filter(t => t.phase === 'gol')
    .slice(0, 5);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: 1200,
        height: 630,
        background: 'linear-gradient(135deg, var(--bg-base), var(--bg-elevated))',
        color: 'var(--text-primary)',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '60px 80px',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background accents */}
      <div style={{ position: 'absolute', top: -200, left: -200, width: 600, height: 600, background: 'radial-gradient(circle, color-mix(in srgb, var(--green-primary) 18%, transparent) 0%, transparent 70%)', borderRadius: '50%' }} />
      <div style={{ position: 'absolute', bottom: -200, right: -200, width: 600, height: 600, background: 'radial-gradient(circle, color-mix(in srgb, var(--gold-accent) 18%, transparent) 0%, transparent 70%)', borderRadius: '50%' }} />
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40, borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)', paddingBottom: 20 }}>
        <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '2px', margin: 0, color: 'var(--gold-accent)', textTransform: 'uppercase' }}>
          {competitionName}
        </h2>
        {matchday && (
          <span style={{ fontSize: 24, fontWeight: 600, color: 'color-mix(in srgb, var(--text-primary) 70%, transparent)' }}>{matchday}</span>
        )}
      </div>

      {/* Main Score Area */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1 }}>
        {/* Home */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <ClubBadge id={homeClub?.id ?? 0} name={homeName} badge={homeClub?.badge} size={160} />
          <h1 style={{ fontSize: 48, fontWeight: 900, marginTop: 24, textAlign: 'center', margin: '24px 0 0' }}>{homeName}</h1>
        </div>

        {/* Score */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 100, fontWeight: 900, fontFamily: 'monospace' }}>
            <span>{result.homeGoals}</span>
            <span style={{ color: 'color-mix(in srgb, var(--text-primary) 30%, transparent)' }}>-</span>
            <span>{result.awayGoals}</span>
          </div>
          {result.decidedBy === 'penalties' && (
            <div style={{ fontSize: 24, color: 'var(--gold-accent)', marginTop: 16, fontWeight: 700 }}>
              {result.homePenalties} - {result.awayPenalties} (pen.)
            </div>
          )}
        </div>

        {/* Away */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <ClubBadge id={awayClub?.id ?? 0} name={awayName} badge={awayClub?.badge} size={160} />
          <h1 style={{ fontSize: 48, fontWeight: 900, marginTop: 24, textAlign: 'center', margin: '24px 0 0' }}>{awayName}</h1>
        </div>
      </div>

      {/* Footer / MVPs & Highlights */}
      <div style={{ display: 'flex', gap: 40, marginTop: 40, padding: '30px', background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)', borderRadius: 24, border: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)' }}>
        {/* Moments */}
        {epicMoments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h3 style={{ fontSize: 18, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px', fontWeight: 700 }}>Momentos Clave</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {epicMoments.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 20 }}>
                  <span style={{ color: 'var(--gold-accent)', fontWeight: 900, width: 40 }}>{m.minute}'</span>
                  <span>
                    ⚽ {m.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MVPs Home */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderLeft: epicMoments.length > 0 ? '1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)' : 'none', paddingLeft: epicMoments.length > 0 ? 40 : 0 }}>
          <h3 style={{ fontSize: 18, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px', fontWeight: 700 }}>Top Local</h3>
          {homeTop.map(p => (
            <div key={p.playerId || p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingRight: 20 }}>
              <span style={{ fontSize: 22, fontWeight: 600 }}>{p.name}</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--green-primary)' }}>{p.rating.toFixed(1)}</span>
            </div>
          ))}
        </div>
        
        {/* MVPs Away */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderLeft: '1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)', paddingLeft: 40 }}>
          <h3 style={{ fontSize: 18, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px', fontWeight: 700 }}>Top Visitante</h3>
          {awayTop.map(p => (
            <div key={p.playerId || p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 22, fontWeight: 600 }}>{p.name}</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--green-primary)' }}>{p.rating.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
