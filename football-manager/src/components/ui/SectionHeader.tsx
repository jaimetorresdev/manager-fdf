import { cn } from '../../lib/cn';

interface SectionHeaderProps {
  /** Title shown in the window title bar. */
  title: string;
  /** Optional icon (lucide) rendered before the title. */
  icon?: React.ReactNode;
  /** Right-aligned controls (buttons, tabs, counters). */
  actions?: React.ReactNode;
  /** Content rendered inside the window body. When omitted, only the title bar is shown. */
  children?: React.ReactNode;
  /** Disable the body padding (useful for tables that should be flush). */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
}

/**
 * A classic "window" panel: a retro title bar (with traffic-light dots) sitting
 * above a beveled body. Mirrors the look of 90s PC manager game windows.
 */
export function SectionHeader({
  title,
  icon,
  actions,
  children,
  flush,
  className,
  bodyClassName,
}: SectionHeaderProps) {
  return (
    <section className={cn('window-frame', className)}>
      <header className="window-titlebar">
        {icon && <span className="flex items-center text-green-500 mr-2">{icon}</span>}
        <span className="truncate">{title}</span>
        {actions && <span className="ml-auto flex items-center gap-2">{actions}</span>}
      </header>
      {children !== undefined && (
        <div className={cn(!flush && 'p-4 sm:p-5', bodyClassName)}>{children}</div>
      )}
    </section>
  );
}
