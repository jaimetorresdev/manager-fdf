import { cn } from '../../lib/cn';

export interface Column<T> {
  /** Unique key for the column. */
  key: string;
  /** Header label. */
  header: React.ReactNode;
  /** Cell renderer. */
  render: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  /** Optional fixed width utility class (e.g. "w-16"). */
  width?: string;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  /** Predicate to dim/fade a row (e.g. non-starters). */
  rowMuted?: (row: T) => boolean;
  empty?: React.ReactNode;
  className?: string;
}

const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

/**
 * Dense, scroll-aware data table styled like a retro manager grid (monospace
 * data, sticky header, hover rows). Horizontal scroll is handled by the caller
 * via the `.table-scroll` wrapper provided here.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowMuted,
  empty,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn('table-scroll overflow-x-auto', className)}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(alignClass[c.align ?? 'left'], c.width, c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="py-8 text-center text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                {empty ?? 'Sin datos.'}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'interactive-row',
                  onRowClick && 'cursor-pointer',
                  rowMuted?.(row) && 'opacity-60'
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(alignClass[c.align ?? 'left'], c.width, c.className)}
                  >
                    {c.render(row, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
