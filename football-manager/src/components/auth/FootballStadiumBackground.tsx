import { cn } from '../../lib/cn';

interface FootballStadiumBackgroundProps {
  children:  React.ReactNode;
  className?: string;
}

/**
 * Fondo auth alineado con el hero broadcast de la landing:
 * césped táctico en perspectiva, glow verde FDF y pizarra de campo esquemática.
 */
export function FootballStadiumBackground({ children, className }: FootballStadiumBackgroundProps) {
  return (
    <div className={cn('fdb-auth relative flex flex-col overflow-hidden bg-[var(--bg-base)]', className)}>
      {/* Césped broadcast — mismo truco que LandingPage hero */}
      <div
        className="fdb-layer fdb-pitch-floor"
        aria-hidden
        style={{
          background: 'repeating-linear-gradient(90deg, color-mix(in srgb, var(--green-primary) 5%, transparent), color-mix(in srgb, var(--green-primary) 5%, transparent) 10vw, color-mix(in srgb, var(--green-primary) 10%, transparent) 10vw, color-mix(in srgb, var(--green-primary) 10%, transparent) 20vw)',
          transform: 'perspective(1000px) rotateX(42deg) scale(2.2) translateY(-18%)',
          transformOrigin: 'top center',
        }}
      />

      {/* Resplandor central */}
      <div
        className="fdb-layer"
        aria-hidden
        style={{
          background: 'radial-gradient(ellipse 70% 55% at 50% 38%, color-mix(in srgb, var(--green-primary) 22%, transparent), transparent 65%)',
          opacity: 0.45,
        }}
      />

      {/* Pizarra táctica — watermark del campo (estilo Pitch2D) */}
      <div className="fdb-layer fdb-tactical-board" aria-hidden>
        <div className="fdb-board-inner">
          <div className="fdb-board-grass" />
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="fdb-grass-stripe"
              style={{
                top: `${i * 10}%`,
                background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)',
              }}
            />
          ))}
          <div className="fdb-board-sweep" />
          <svg className="fdb-board-lines" viewBox="0 0 100 143" preserveAspectRatio="none">
            <rect x="3" y="3" width="94" height="137" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
            <line x1="3" y1="71.5" x2="97" y2="71.5" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
            <circle cx="50" cy="71.5" r="12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
            <circle cx="50" cy="71.5" r="0.8" fill="rgba(255,255,255,0.7)" />
            <rect x="22" y="3" width="56" height="20" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="0.45" />
            <rect x="35" y="3" width="30" height="8" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
            <rect x="22" y="120" width="56" height="20" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="0.45" />
            <rect x="35" y="132" width="30" height="8" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
            {/* Posiciones esquemáticas 4-4-2 */}
            {FORMATION_DOTS.map((d, i) => (
              <circle key={i} cx={d.x} cy={d.y} r="1.8" fill="rgba(16,185,129,0.55)" />
            ))}
          </svg>
        </div>
      </div>

      {/* HUD terminal deportiva */}
      <div className="fdb-layer fdb-hud" aria-hidden>
        <span className="fdb-hud-rec">● REC</span>
        <span className="fdb-hud-tag">FDF BROADCAST</span>
        <span className="fdb-hud-week">TÁCTICA · 4-4-2</span>
      </div>

      {/* Scanlines suaves + viñeta */}
      <div className="fdb-layer fdb-scanlines" aria-hidden />
      <div className="fdb-layer fdb-fade-bottom" aria-hidden />

      <style>{`
        .fdb-auth{isolation:isolate;border-bottom:4px solid var(--green-primary);
          box-shadow:0 4px 24px color-mix(in srgb,var(--green-primary) 20%,transparent)}
        .fdb-layer{position:absolute;inset:0;pointer-events:none}
        .fdb-auth > :not(.fdb-layer):not(style){position:relative;z-index:10}
        .fdb-pitch-floor{opacity:.38}

        .fdb-tactical-board{
          display:flex;align-items:center;justify-content:center;
          padding:0 1rem}
        .fdb-board-inner{
          position:relative;width:min(92vw,520px);aspect-ratio:7/10;
          opacity:.14;border-radius:var(--radius-retro);
          border:1px solid color-mix(in srgb,var(--green-primary) 30%,transparent);
          overflow:hidden;
          box-shadow:0 0 60px color-mix(in srgb,var(--green-primary) 12%,transparent);
          transform:translateY(4%)}
        .fdb-board-grass{
          position:absolute;inset:0;
          background:linear-gradient(180deg,var(--pitch-grass-a) 0%,var(--pitch-grass-b) 50%,var(--pitch-grass-c) 100%)}
        .fdb-grass-stripe{position:absolute;left:0;right:0;height:10%;pointer-events:none}
        .fdb-board-sweep{
          position:absolute;inset:0;width:150%;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent);
          mix-blend-mode:overlay;opacity:0;
          animation:fdb-sweep 10s ease-in-out infinite}
        @keyframes fdb-sweep{
          0%{transform:translateX(-80%) skewX(-12deg);opacity:0}
          15%{opacity:.12}85%{opacity:.08}
          100%{transform:translateX(120%) skewX(-12deg);opacity:0}}
        .fdb-board-lines{position:absolute;inset:0;width:100%;height:100%;
          filter:drop-shadow(0 0 3px rgba(255,255,255,0.25))}

        .fdb-hud{
          font-family:var(--font-mono-retro);font-size:.62rem;
          letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted)}
        .fdb-hud-rec{
          position:absolute;top:1rem;left:1.25rem;
          color:var(--red-danger);font-weight:700;
          animation:fdb-rec 2.4s ease-in-out infinite}
        @keyframes fdb-rec{0%,100%{opacity:1}50%{opacity:.45}}
        .fdb-hud-tag{position:absolute;top:1rem;right:1.25rem;opacity:.5}
        .fdb-hud-week{position:absolute;bottom:1.25rem;left:50%;transform:translateX(-50%);opacity:.35}

        .fdb-scanlines{
          background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.025) 2px,rgba(255,255,255,0.025) 4px);
          opacity:.55;mix-blend-mode:overlay}
        .fdb-fade-bottom{
          background:linear-gradient(180deg,transparent 50%,var(--bg-base) 100%)}

        @media (prefers-reduced-motion:reduce){
          .fdb-board-sweep,.fdb-hud-rec{animation:none}
          .fdb-hud-rec{opacity:1}
        }
        @media (max-width:640px){
          .fdb-board-inner{opacity:.1;width:min(96vw,400px)}
          .fdb-hud-week{display:none}
        }
      `}</style>

      {children}
    </div>
  );
}

/** 4-4-2 esquemático (coordenadas pizarra 100×143) */
const FORMATION_DOTS = [
  { x: 50, y: 128 },
  { x: 28, y: 108 }, { x: 42, y: 105 }, { x: 58, y: 105 }, { x: 72, y: 108 },
  { x: 22, y: 78 }, { x: 38, y: 74 }, { x: 62, y: 74 }, { x: 78, y: 78 },
  { x: 35, y: 48 }, { x: 65, y: 48 },
];
