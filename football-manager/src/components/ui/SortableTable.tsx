// ─── SortableTable — tabla genérica con orden por columna ─────────────────────
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface SortCol<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => number | string;   // si se omite, la columna no ordena
}

interface Props<T> {
  columns: SortCol<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  rowClassName?: (row: T) => string | undefined;
  onSortChange?: (sort: { key: string; dir: 'asc' | 'desc' } | null) => void;
}

export function SortableTable<T>({ columns, data, rowKey, onRowClick, initialSort, rowClassName, onSortChange }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (onSortChange) return data; // If controlled externally, don't sort locally
    if (!sort) return data;
    const col = columns.find(c => c.key === sort.key);
    if (!col?.sortValue) return data;
    const sv = col.sortValue;
    return [...data].sort((a, b) => {
      const va = sv(a), vb = sv(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, sort, columns, onSortChange]);

  const toggle = (key: string, sortable: boolean) => {
    if (!sortable) return;
    const newSort: { key: string; dir: 'asc' | 'desc' } = sort?.key === key
      ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'desc' as const };
    setSort(newSort);
    if (onSortChange) onSortChange(newSort);
  };

  return (
    <div className="st-wrap">
      <style>{`
        .st-wrap{overflow-x:auto;border:1px solid var(--border-color);border-radius:var(--radius-retro);background:var(--bg-surface)}
        .st{width:100%;border-collapse:collapse;font-size:.83rem}
        .st th{position:sticky;top:0;background:var(--bg-elevated);font-size:.64rem;text-transform:uppercase;
          letter-spacing:1px;color:var(--text-muted);padding:9px 12px;text-align:left;white-space:nowrap;font-weight:600;z-index:1}
        .st th.sortable{cursor:pointer;user-select:none}
        .st th.sortable:hover{color:var(--text-primary)}
        .st th .st-h{display:inline-flex;align-items:center;gap:3px}
        .st td{padding:9px 12px;border-top:1px solid color-mix(in srgb,var(--border-color) 55%,transparent);white-space:nowrap}
        .st tr.click{cursor:pointer}
        .st tbody tr.click:hover{background:var(--row-hover)}
        .st .a-center{text-align:center}.st .a-right{text-align:right}
      `}</style>
      <table className="st">
        <thead>
          <tr>
            {columns.map(c => {
              const sortable = !!c.sortValue;
              const active = sort?.key === c.key;
              return (
                <th key={c.key} className={cn(sortable && 'sortable', c.align === 'center' && 'a-center', c.align === 'right' && 'a-right')}
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : (sortable ? 'none' : undefined)}
                    tabIndex={sortable ? 0 : undefined}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(c.key, sortable); } }}
                    onClick={() => toggle(c.key, sortable)}>
                  <span className="st-h">{c.header}{active && (sort!.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr key={rowKey(row)} className={cn(onRowClick && 'click', rowClassName?.(row))}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map(c => (
                <td key={c.key} className={cn(c.align === 'center' && 'a-center', c.align === 'right' && 'a-right')}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
