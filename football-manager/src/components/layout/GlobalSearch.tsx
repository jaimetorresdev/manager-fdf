// ─── E10 · Buscador global de navbar ───────────────────────────────────────────
// Input con debounce → GET /api/search → resultados agrupados (jugadores/clubes/
// mánagers). Enter/clic navega; los mánagers abren conversación de DM.
// Atajo: "/" enfoca el buscador desde cualquier pantalla.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Shield, MessagesSquare } from 'lucide-react';
import { searchApi, type SearchResults } from '../../api/client';
import { useTranslation } from 'react-i18next';

const EMPTY: SearchResults = { players: [], clubs: [], managers: [] };

export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResults>(EMPTY);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  // Debounce de la consulta
  useEffect(() => {
    if (q.trim().length < 2) { setRes(EMPTY); setBusy(false); return; }
    setBusy(true);
    const t = setTimeout(() => {
      searchApi.query(q.trim())
        .then(r => setRes({ players: r?.players ?? [], clubs: r?.clubs ?? [], managers: r?.managers ?? [] }))
        .catch(() => setRes(EMPTY))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Cerrar al hacer clic fuera + atajo "/"
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable;
      if (e.key === '/' && !typing) { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  const go = (path: string) => { setOpen(false); setQ(''); navigate(path); };
  const total = res.players.length + res.clubs.length + res.managers.length;

  return (
    <div ref={boxRef} className="gs" style={{ position: 'relative' }} onMouseDown={(e) => e.stopPropagation()}>
      <style>{`
        .gs-input{display:flex;align-items:center;gap:5px;background:var(--bg-elevated);border:1px solid var(--border-color);
          border-radius:8px;padding:4px 8px;min-width:0;width:100%}
        .gs-input input{background:none;border:none;outline:none;color:var(--text-primary);font-size:.8rem;width:100%}
        .gs-input kbd{font-family:var(--font-mono-retro);font-size:.6rem;color:var(--text-muted);border:1px solid var(--border-color);border-radius:4px;padding:0 4px}
        .gs-pop{position:absolute;top:calc(100% + 6px);right:0;width:330px;max-height:60vh;overflow:auto;z-index:200;
          background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-retro);box-shadow:var(--shadow-soft),var(--crt-glow)}
        .gs-h{font-family:var(--font-display);font-weight:700;font-size:.66rem;text-transform:uppercase;letter-spacing:1px;
          color:var(--text-muted);padding:8px 12px 4px;display:flex;align-items:center;gap:6px}
        .gs-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:7px 12px;cursor:pointer;
          background:none;border:none;color:var(--text-primary);font-size:.82rem}
        .gs-item:hover{background:var(--bg-elevated)}
        .gs-item small{color:var(--text-muted);font-size:.7rem;margin-left:auto;white-space:nowrap}
        .gs-ovr{font-family:var(--font-scoreboard);font-weight:400;color:var(--green-primary);width:28px;text-align:right;font-size:1.05rem}
        .gs-empty{padding:14px;text-align:center;color:var(--text-muted);font-size:.78rem}
      `}</style>

      <div className="gs-input">
        <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          ref={inputRef} value={q} placeholder={t('search.placeholder', 'Buscar…')} aria-label={t('search.label', 'Buscador global')}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
        />
        <kbd>/</kbd>
      </div>

      {open && q.trim().length >= 2 && (
        <div className="gs-pop">
          {busy && total === 0 && <div className="gs-empty">{t('search.loading', 'Buscando…')}</div>}
          {!busy && total === 0 && <div className="gs-empty">{t('search.noResultsFor', 'Sin resultados para')} “{q.trim()}”.</div>}

          {res.players.length > 0 && (
            <>
              <div className="gs-h"><User size={11} /> {t('search.players', 'Jugadores')}</div>
              {res.players.map(p => (
                <button key={`p${p.id}`} className="gs-item" onClick={() => go(`/player/${p.id}`)}>
                  <span className="gs-ovr">{p.overall ?? ''}</span>
                  <span>{p.name}</span>
                  <small>{[p.position, p.clubName].filter(Boolean).join(' · ')}</small>
                </button>
              ))}
            </>
          )}

          {res.clubs.length > 0 && (
            <>
              <div className="gs-h"><Shield size={11} /> {t('search.clubs', 'Clubes')}</div>
              {res.clubs.map(c => (
                <button key={`c${c.id}`} className="gs-item" onClick={() => go(`/club/${c.id}`)}>
                  <span style={{ width: 24, textAlign: 'center' }}>{c.badge ?? '🛡️'}</span>
                  <span>{c.name}</span>
                  <small>{c.country ?? c.shortName ?? ''}</small>
                </button>
              ))}
            </>
          )}

          {res.managers.length > 0 && (
            <>
              <div className="gs-h"><MessagesSquare size={11} /> {t('search.managers', 'Mánagers')}</div>
              {res.managers.map(m => (
                <button key={`m${m.id}`} className="gs-item" onClick={() => go(`/messages?to=${m.id}`)}>
                  <span style={{ width: 24, textAlign: 'center' }}>👔</span>
                  <span>{m.username}</span>
                  <small>{m.clubName ?? ''} · {t('search.dm', 'DM')} →</small>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
