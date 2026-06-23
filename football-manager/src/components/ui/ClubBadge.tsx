// ─── E5 · Escudo procedural de club ────────────────────────────────────────────
// SVG determinista a partir de id+nombre (hash): forma del escudo, partición
// heráldica, carga central e iniciales. Usa colores reales del club si llegan
// (primaryColor/secondaryColor del seed de Antigravity) y si no, paleta por hash.
// Si el club tiene un badge de imagen (no emoji), se respeta.
import { useId } from 'react';

interface Props {
  id?: number | null;
  name?: string;
  badge?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  size?: number;
  className?: string;
}

// Paleta de fallback (combinaciones clásicas de fútbol)
const PALETTES: [string, string][] = [
  ['#A3242B', '#FFFFFF'], ['#10316B', '#FFFFFF'], ['#1B5E20', '#FFFFFF'],
  ['#21242B', '#E7C65A'], ['#5B2A86', '#FFFFFF'], ['#B33951', '#0E1B2C'],
  ['#0E5A8A', '#E7C65A'], ['#C75000', '#0E1B2C'], ['#0B7285', '#FFFFFF'],
  ['#7C2D12', '#F5E6C8'], ['#14532D', '#E7C65A'], ['#1E3A8A', '#DC2626'],
];

function hashOf(id?: number | null, name?: string): number {
  let h = (id ?? 0) * 2654435761 % 2 ** 31;
  for (const c of name ?? '') h = (h * 31 + c.charCodeAt(0)) % 2 ** 31;
  return Math.abs(h);
}

function initials(name?: string): string {
  if (!name) return 'FC';
  const words = name.split(/\s+/).filter(w => w.length > 2 || /^[A-Z]/.test(w));
  return (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

// Formas de escudo (viewBox 0 0 100 110)
const SHIELDS = [
  'M50,4 L96,16 L96,58 Q96,92 50,106 Q4,92 4,58 L4,16 Z',                 // clásico
  'M50,4 L92,12 Q96,60 78,84 Q64,100 50,106 Q36,100 22,84 Q4,60 8,12 Z',  // gota
  'M10,8 L90,8 L90,62 Q90,90 50,106 Q10,90 10,62 Z',                      // ibérico
];

export function ClubBadge({ id, name, badge, primaryColor, secondaryColor, size = 28, className }: Props) {
  // useId SIEMPRE antes de cualquier return condicional (regla de hooks · A6).
  const rawId = useId();
  if (badge && badge.startsWith('http')) {
    return (
      <div style={{ width: size, height: size, flexShrink: 0 }} className={className}>
        <img src={badge} width={size} height={size} style={{ objectFit: 'contain' }} alt={name} />
      </div>
    );
  }
  const h = hashOf(id, name);
  const [pp, ss] = PALETTES[h % PALETTES.length];
  const p = primaryColor || pp;
  const s = secondaryColor || ss;
  const shield = SHIELDS[h % SHIELDS.length];
  const partition = h % 5;       // 0 liso · 1 palos · 2 fajas · 3 banda · 4 partido
  const charge = (h >> 3) % 4;   // 0 balón · 1 estrella · 2 corona · 3 ninguna
  const uid = `cb-${rawId.replace(/:/g, '')}-${h % 99991}`;

  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 100 110" className={className}
      role="img" aria-label={`Escudo de ${name ?? 'club'}`} style={{ flexShrink: 0 }}>
      <defs><clipPath id={uid}><path d={shield} /></clipPath></defs>
      <path d={shield} fill={p} />
      <g clipPath={`url(#${uid})`}>
        {partition === 1 && [0, 1, 2].map(i => <rect key={i} x={12 + i * 30} y={0} width={15} height={110} fill={s} />)}
        {partition === 2 && [0, 1, 2].map(i => <rect key={i} x={0} y={14 + i * 30} width={100} height={14} fill={s} />)}
        {partition === 3 && <polygon points="0,18 28,0 100,72 100,100 72,100" fill={s} opacity={0.95} />}
        {partition === 4 && <rect x={50} y={0} width={50} height={110} fill={s} />}
        {/* jefe (franja superior) para asentar las iniciales */}
        <rect x={0} y={0} width={100} height={26} fill={partition === 0 ? s : p} opacity={0.92} />
      </g>
      <path d={shield} fill="none" stroke="color-mix(in srgb, #000 35%, transparent)" strokeWidth={3} />
      <text x="50" y="20" textAnchor="middle" fontSize="17" fontWeight="800"
        fontFamily="var(--font-display, sans-serif)" fill={partition === 0 ? p : s}
        style={{ letterSpacing: 1 }}>{initials(name)}</text>
      {charge === 0 && (
        <g>
          <circle cx="50" cy="64" r="15" fill={s} />
          <circle cx="50" cy="64" r="15" fill="none" stroke={p} strokeWidth="2" />
          <polygon points="50,56 57,61 54,69 46,69 43,61" fill={p} />
        </g>
      )}
      {charge === 1 && (
        <polygon fill={s} points="50,48 54.7,60.3 67.8,60.6 57.4,68.6 61.2,81.2 50,73.8 38.8,81.2 42.6,68.6 32.2,60.6 45.3,60.3" />
      )}
      {charge === 2 && (
        <path d="M34,72 L34,60 L42,67 L50,54 L58,67 L66,60 L66,72 Z" fill={s} />
      )}
    </svg>
  );
}
