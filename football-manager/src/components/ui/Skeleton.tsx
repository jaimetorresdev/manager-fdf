// ─── Skeleton — placeholder de carga con shimmer ──────────────────────────────
import { cn } from '../../lib/cn';

interface Props { width?: string | number; height?: string | number; radius?: number; className?: string }

export function Skeleton({ width = '100%', height = 16, radius = 6, className }: Props) {
  return (
    <span className={cn('fdf-skel', className)} style={{ width, height, borderRadius: radius }} aria-hidden="true">
      <style>{`
        .fdf-skel{display:block;position:relative;overflow:hidden;
          background:var(--bg-elevated);border:1px solid var(--border-color)}
        .fdf-skel::after{content:'';position:absolute;inset:0;transform:translateX(-100%);
          background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--green-primary) 10%,transparent),transparent);
          animation:fdfshimmer 1.4s infinite}
        @keyframes fdfshimmer{100%{transform:translateX(100%)}}
        @media(prefers-reduced-motion:reduce){.fdf-skel::after{animation:none!important;transform:none}}
      `}</style>
    </span>
  );
}

export function SkeletonMatch() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton height={80} radius={6} />
      <Skeleton height={220} radius={6} />
      <Skeleton height={34} radius={6} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 12 }}>
        <Skeleton height={240} radius={6} /><Skeleton height={240} radius={6} />
      </div>
    </div>
  );
}
