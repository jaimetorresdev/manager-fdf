// ─── PublicShell — layout mínimo para rutas públicas (I-35) ───────────────────
import type { ReactNode } from 'react';
import { PublicNav } from './PublicNav';

export function PublicShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex flex-col">
      <PublicNav />
      {title && (
        <div className="border-b border-[var(--border-color)]/50 px-4 py-3 bg-[var(--bg-surface)]/30">
          <h1 className="max-w-7xl mx-auto text-sm font-bold text-[var(--text-muted)] uppercase tracking-widest">{title}</h1>
        </div>
      )}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
