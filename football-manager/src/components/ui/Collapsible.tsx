import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

interface CollapsibleProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function Collapsible({ title, children, defaultOpen = false, className }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={cn('rounded-xl border overflow-hidden', className)}
      style={{ borderColor: 'var(--border-color)', background: 'var(--bg-elevated)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        style={{ color: 'var(--text-primary)' }}
        aria-expanded={open}
      >
        <span className="text-sm font-bold">{title}</span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
          style={{ color: 'var(--text-muted)' }}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t" style={{ borderColor: 'var(--border-color)' }}>
          {children}
        </div>
      )}
    </div>
  );
}
