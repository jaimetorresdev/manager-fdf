// ─── E17 LOTE B + Y10 · Listas de plantilla para la pizarra táctica ────────────
// Componente de PRESENTACIÓN: recibe los arrays y el callback de click.
// Y10: lista ORDENABLE (posición/media/forma/edad) y FILTRABLE (línea + búsqueda),
// mostrando nacionalidad, posición detallada, media, forma, moral, fitness y
// estado de lesión/sanción para no alinear inválidos.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Cross } from 'lucide-react';
import { cn } from '../../lib/cn';
import { PosBadge } from '../ui/PosBadge';
import { getPositionOrder, getPositionCategory } from '../../lib/gameUtils';

const SQ_CSS = `
.t2sq{--sq-tone:var(--blue-info);container-type:inline-size;background:var(--bg-surface);border:1px solid color-mix(in srgb,var(--sq-tone) 24%,var(--border-color));border-radius:13px;
  overflow:hidden;box-shadow:0 18px 38px -32px rgba(0,0,0,.9),inset 0 1px color-mix(in srgb,white 4%,transparent);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.t2sq.starters{--sq-tone:var(--green-primary)}.t2sq.bench{--sq-tone:var(--blue-info)}
.t2sq-head{position:relative;display:flex;align-items:center;justify-content:space-between;padding:11px 14px 11px 17px;
  background:linear-gradient(100deg,color-mix(in srgb,var(--sq-tone) 13%,var(--bg-elevated)),var(--bg-elevated));border-bottom:1px solid var(--border-color);
  font-family:var(--font-display);font-weight:850;font-size:.72rem;text-transform:uppercase;
  letter-spacing:1px;color:var(--text-primary)}
.t2sq-head::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:var(--sq-tone);box-shadow:0 0 10px var(--sq-tone)}
.t2sq-count{font-family:var(--font-sans);font-weight:600;font-size:.75rem;color:var(--text-muted)}
.t2sq-controls{display:grid;grid-template-columns:minmax(80px,1fr) auto auto;gap:6px;padding:8px 9px;border-bottom:1px solid color-mix(in srgb,var(--border-color) 55%,transparent)}
.t2sq-search{flex:1;min-width:90px;font-family:var(--font-sans);font-size:.74rem;padding:4px 8px;border-radius:6px;
  border:1px solid var(--border-color);background:var(--bg-elevated);color:var(--text-primary)}
.t2sq-sel{font-family:var(--font-sans);font-size:.72rem;padding:4px 6px;border-radius:6px;
  border:1px solid var(--border-color);background:var(--bg-elevated);color:var(--text-muted);cursor:pointer}
.t2sq-list{overflow:visible}
.t2sq-row{min-height:36px;display:flex;align-items:center;gap:7px;padding:6px 9px;cursor:pointer;
  border-top:1px solid color-mix(in srgb,var(--border-color) 55%,transparent);
  transition:background-color 160ms ease,transform 160ms ease}
.t2sq-row:first-of-type{border-top:none}
.t2sq-row:hover{background:color-mix(in srgb,var(--sq-tone) 7%,var(--row-hover));transform:translateX(2px)}
.t2sq-row[draggable=true]{cursor:grab}.t2sq-row[draggable=true]:active{cursor:grabbing}
.t2sq-num{font-family:var(--font-sans);font-weight:600;font-size:.75rem;color:var(--text-muted);width:20px;text-align:center;flex:none}
.t2sq-name{flex:1;min-width:0;font-size:.84rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary)}
.t2sq-name.dim{color:var(--text-muted)}
.t2sq-form{font-family:var(--font-mono-retro);font-size:.72rem;font-weight:700;flex:none;width:26px;text-align:right}
.t2sq-ovr{font-family:var(--font-sans);font-size:.8rem;font-weight:700;color:var(--green-primary);width:22px;text-align:right;flex:none}
.t2sq-ovr.dim{color:var(--text-muted);font-weight:500}
.t2sq-dot{width:8px;height:8px;border-radius:50%;flex:none}
.t2sq-warn{display:inline-flex;align-items:center;gap:4px;font-family:var(--font-sans);
  font-size:.65rem;font-weight:700;padding:2px 6px;border-radius:4px;flex:none;text-transform:uppercase}
.t2sq-warn.inj{color:var(--red-danger);background:color-mix(in srgb,var(--red-danger) 14%,transparent)}
.t2sq-warn.sus{color:var(--gold-accent);background:color-mix(in srgb,var(--gold-accent) 14%,transparent)}
.t2sq-swap{display:grid;place-items:center;width:26px;height:26px;flex:none;border-radius:6px;cursor:pointer;
  border:1px solid var(--border-color);background:var(--bg-elevated);color:var(--text-muted);
  font-size:.78rem;line-height:1;transition:all 140ms ease}
.t2sq-swap:hover{color:var(--sq-tone);border-color:color-mix(in srgb,var(--sq-tone) 45%,var(--border-color));transform:scale(1.06)}
.t2sq-swap.sel{color:var(--avatar-text);background:var(--gold-accent);border-color:transparent}
.t2sq-row.sel{background:color-mix(in srgb,var(--gold-accent) 10%,transparent)}
@container(max-width:340px){.t2sq-controls{grid-template-columns:1fr 1fr}.t2sq-search{grid-column:1/-1}.t2sq-form{display:none}.t2sq-row{gap:5px}.t2sq-name{font-size:.78rem}}
@container(max-width:300px){.t2sq-dot{display:none}.t2sq-warn{font-size:0;padding:3px}.t2sq-warn svg{width:10px;height:10px}}
`;

type SortKey = 'pos' | 'ovr' | 'form' | 'age';
const SORTS: { id: SortKey; labelKey: string }[] = [
  { id: 'pos', labelKey: 'pos' },
  { id: 'ovr', labelKey: 'ovr' },
  { id: 'form', labelKey: 'form' },
  { id: 'age', labelKey: 'age' },
];
const LINES = ['Todos', 'POR', 'DEF', 'MED', 'DEL'] as const;

interface Props {
  title: string;
  players: any[];
  tone?: 'starters' | 'bench';
  dim?: boolean;
  onPlayerClick: (p: any) => void;
  swapSelectedId?: number | null;
  onSwapSelect?: (p: any) => void;
}

function fitnessColor(f?: number) {
  const v = Number(f ?? 0);
  return v >= 85 ? 'var(--green-primary)' : v >= 70 ? 'var(--gold-accent)' : 'var(--red-danger)';
}
function moraleColor(m?: number) {
  const v = Number(m ?? 0);
  return v >= 70 ? 'var(--green-primary)' : v >= 45 ? 'var(--gold-accent)' : 'var(--red-danger)';
}
function formOf(p: any): number {
  if (Array.isArray(p.formArray) && p.formArray.length) {
    const nums = p.formArray.map(Number).filter((n: number) => Number.isFinite(n));
    if (nums.length) return nums.reduce((s: number, n: number) => s + n, 0) / nums.length;
  }
  return Number(p.averageRating ?? p.form ?? 0);
}
function formColor(r: number) {
  return r >= 7 ? 'var(--green-primary)' : r >= 5.5 ? 'var(--gold-accent)' : r > 0 ? 'var(--red-danger)' : 'var(--text-muted)';
}

export function SquadListPanel({ title, players, tone = 'bench', dim, onPlayerClick, swapSelectedId, onSwapSelect, onDropPlayer }: Props & { onDropPlayer?: (draggedId: number, targetId: number) => void }) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<SortKey>('pos');
  const [line, setLine] = useState<(typeof LINES)[number]>('Todos');
  const [q, setQ] = useState('');

  const view = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = players.filter(p => {
      if (line !== 'Todos' && getPositionCategory(p.position ?? '') !== line) return false;
      if (query && !String(p.name ?? '').toLowerCase().includes(query)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'ovr': return Number(b.overall ?? 0) - Number(a.overall ?? 0);
        case 'form': return formOf(b) - formOf(a);
        case 'age': return Number(a.age ?? 99) - Number(b.age ?? 99);
        default: return getPositionOrder(a.position ?? '') - getPositionOrder(b.position ?? '');
      }
    });
    return list;
  }, [players, sort, line, q]);

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    const draggedIdStr = e.dataTransfer.getData('text/plain');
    if (!draggedIdStr) return;
    const draggedId = parseInt(draggedIdStr, 10);
    if (draggedId && draggedId !== targetId && onDropPlayer) {
      onDropPlayer(draggedId, targetId);
    }
  };

  return (
    <section className={cn('t2sq', tone)} aria-label={title}>
      <style>{SQ_CSS}</style>
      <div className="t2sq-head">
        <span>{title}</span>
        <span className="t2sq-count">{view.length}/{players.length}</span>
      </div>
      <div className="t2sq-controls">
        <input id={`t2sq-${tone}-search`} className="t2sq-search" placeholder={t('gameplay:tactics.panels.squadList.search')} value={q} onChange={e => setQ(e.target.value)} aria-label={`${title}: ${t('gameplay:tactics.panels.squadList.search')}`} />
        <select id={`t2sq-${tone}-line`} className="t2sq-sel" value={line} onChange={e => setLine(e.target.value as (typeof LINES)[number])} aria-label={`${title}: ${t('gameplay:tactics.panels.squadList.filterLine')}`}>
          {LINES.map(l => <option key={l} value={l}>{l === 'Todos' ? t('gameplay:tactics.panels.squadList.all') : l}</option>)}
        </select>
        <select id={`t2sq-${tone}-sort`} className="t2sq-sel" value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label={`${title}: ${t('gameplay:tactics.panels.squadList.sortBy')}`}>
          {SORTS.map(s => <option key={s.id} value={s.id}>{t(`gameplay:tactics.panels.squadList.sorts.${s.labelKey}`)}</option>)}
        </select>
      </div>
      <div className="t2sq-list">
        {view.map(p => {
          const injured = !!p.injuredUntil || (p.injuries?.length ?? 0) > 0;
          const suspended = (p.suspendedMatches ?? 0) > 0;
          const selected = swapSelectedId != null && swapSelectedId === p.id;
          const form = formOf(p);
          return (
            <div 
              key={p.id} 
              className={cn('t2sq-row', selected && 'sel')} 
              onClick={() => swapSelectedId != null && onSwapSelect ? onSwapSelect(p) : onPlayerClick(p)}
              draggable
              onDragStart={e => e.dataTransfer.setData('text/plain', p.id.toString())}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, p.id)}
            >
              <span className="t2sq-num">{p.squadNumber ?? '·'}</span>
              <span style={{ flex: 'none' }}>{p.flag}</span>
              {p.position && <PosBadge position={p.position} preferredPosition={p.preferredPosition} short />}
              <span className={cn('t2sq-name', dim && 'dim')}>{p.name}</span>
              {injured && <span className="t2sq-warn inj" title={t('gameplay:tactics.panels.squadList.injured')}><Cross size={9} /> {t('gameplay:tactics.panels.squadList.injuredShort')}</span>}
              {suspended && <span className="t2sq-warn sus" title={t('gameplay:tactics.panels.squadList.suspended')}><ShieldAlert size={9} /> {t('gameplay:tactics.panels.squadList.suspendedShort')}</span>}
              <span className="t2sq-form" style={{ color: formColor(form) }} title={t('gameplay:tactics.panels.squadList.formTitle', { value: form > 0 ? form.toFixed(1) : t('gameplay:tactics.panels.common.dash') })}>
                {form > 0 ? form.toFixed(1) : t('gameplay:tactics.panels.common.dash')}
              </span>
              <span className={cn('t2sq-ovr', dim && 'dim')}>{p.overall}</span>
              <span className="t2sq-dot" style={{ background: moraleColor(p.morale) }} title={t('gameplay:tactics.panels.squadList.moraleTitle', { value: p.morale ?? t('gameplay:tactics.panels.common.dash') })} />
              <span className="t2sq-dot" style={{ background: fitnessColor(p.fitness) }} title={t('gameplay:tactics.panels.squadList.fitnessTitle', { value: p.fitness ?? t('gameplay:tactics.panels.common.dash') })} />
              {onSwapSelect && (
                <button className={cn('t2sq-swap', selected && 'sel')}
                        title={selected ? t('gameplay:tactics.panels.squadList.swapCancel') : t('gameplay:tactics.panels.squadList.swapStart')}
                        onClick={e => { e.stopPropagation(); onSwapSelect(p); }}>⇄</button>
              )}
            </div>
          );
        })}
        {view.length === 0 && (
          <div style={{ padding: '14px 12px', fontSize: '.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {players.length === 0 ? t('gameplay:tactics.panels.squadList.noPlayers') : t('gameplay:tactics.panels.squadList.noFilterMatch')}
          </div>
        )}
      </div>
    </section>
  );
}
