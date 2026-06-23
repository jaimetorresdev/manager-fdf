// ─── Slider — control de palanca táctica (0-100) ──────────────────────────────
import { cn } from '../../lib/cn';

interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
}

export function Slider({ label, value, onChange, min = 0, max = 100, step = 1, leftLabel, rightLabel, className }: Props) {
  return (
    <div className={cn('sl', className)}>
      <style>{`
        .sl{display:flex;flex-direction:column;gap:4px}
        .sl-top{display:flex;justify-content:space-between;align-items:baseline}
        .sl-label{font-size:.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)}
        .sl-val{font-family:var(--font-mono-retro);font-weight:700;color:var(--green-primary)}
        .sl input[type=range]{width:100%;accent-color:var(--green-primary);cursor:pointer}
        .sl-ends{display:flex;justify-content:space-between;font-size:.62rem;color:var(--text-muted)}
      `}</style>
      <div className="sl-top"><span className="sl-label">{label}</span><span className="sl-val">{Math.round(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      {(leftLabel || rightLabel) && <div className="sl-ends"><span>{leftLabel}</span><span>{rightLabel}</span></div>}
    </div>
  );
}
