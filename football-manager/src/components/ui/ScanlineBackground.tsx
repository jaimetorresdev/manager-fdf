import { cn } from '../../lib/cn';

interface ScanlineBackgroundProps {
  children: React.ReactNode;
  /** Add the subtle pitch grid behind the scanlines. */
  pitch?: boolean;
  className?: string;
}

/**
 * A hero/section wrapper that paints subtle CRT scanlines (and optionally the
 * pitch grid) behind its content. Decorative only — content stays on z-index 1.
 */
export function ScanlineBackground({ children, pitch, className }: ScanlineBackgroundProps) {
  return (
    <div className={cn('scanline-bg', pitch && 'pitch-bg', className)}>
      {children}
    </div>
  );
}
