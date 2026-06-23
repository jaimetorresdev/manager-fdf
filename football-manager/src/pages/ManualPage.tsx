// ─── ManualPage — manual del juego al 100% (B15) ──────────────────────────────
// Contenido auditado contra el código real (src/content/manualChapters.ts),
// BUSCADOR interno (capítulos + secciones, con resaltado del término) y
// ANCHORS por sección: /manual#capitulo--seccion para enlaces profundos
// desde tooltips del juego. El hash se sincroniza al navegar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { manualChapters } from '../content/manualChapters';

/** Resalta el término buscado dentro de un texto (sin HTML peligroso). */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: 'color-mix(in srgb, var(--gold-accent) 35%, transparent)', color: 'inherit', borderRadius: 2 }}>
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  );
}

interface SearchHit {
  chapterId: string;
  chapterTitle: string;
  icon: string;
  sectionId: string;
  sectionTitle: string;
  snippet: string;
}

export function ManualPage() {
  const { t } = useTranslation('common');
  const [selected, setSelected] = useState(manualChapters[0].id);
  const [query, setQuery] = useState('');
  const articleRef = useRef<HTMLElement>(null);

  // ── Anchors: leer el hash al entrar (#capitulo o #capitulo--seccion) ──
  useEffect(() => {
    const applyHash = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (!hash) return;
      const [chapterId, sectionId] = hash.split('--');
      if (manualChapters.some(c => c.id === chapterId)) {
        setSelected(chapterId);
        if (sectionId) {
          // esperar al render del capítulo
          setTimeout(() => {
            document.getElementById(`${chapterId}--${sectionId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          }, 60);
        }
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const goTo = (chapterId: string, sectionId?: string) => {
    setSelected(chapterId);
    setQuery('');
    const anchor = sectionId ? `${chapterId}--${sectionId}` : chapterId;
    // history.replaceState para no ensuciar el historial con cada clic
    window.history.replaceState(null, '', `#${anchor}`);
    if (sectionId) {
      setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
    } else {
      articleRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  };

  // ── Buscador interno: título de capítulo, título de sección y cuerpo ──
  const hits: SearchHit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: SearchHit[] = [];
    for (const c of manualChapters) {
      for (const s of c.content.sections) {
        const inTitle = s.title.toLowerCase().includes(q);
        const bodyIdx = s.body.toLowerCase().indexOf(q);
        const inChapter = c.title.toLowerCase().includes(q);
        if (inTitle || bodyIdx >= 0 || inChapter) {
          const snippet = bodyIdx >= 0
            ? `…${s.body.slice(Math.max(0, bodyIdx - 40), bodyIdx + q.length + 60)}…`
            : s.body.slice(0, 100) + '…';
          out.push({
            chapterId: c.id, chapterTitle: c.title, icon: c.icon,
            sectionId: s.id, sectionTitle: s.title, snippet,
          });
        }
        if (out.length >= 30) return out;
      }
    }
    return out;
  }, [query]);

  const chapter = manualChapters.find(c => c.id === selected) ?? manualChapters[0];
  const idx = manualChapters.findIndex(c => c.id === chapter.id);
  const searching = query.trim().length >= 2;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Hero del manual */}
      <div
        className="mb-6 rounded-xl overflow-hidden border border-[var(--border-color)]"
        style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--green-primary) 12%, var(--bg-surface)) 0%, var(--bg-surface) 55%, color-mix(in srgb, var(--gold-accent) 8%, var(--bg-surface)) 100%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--green-primary)] mb-2">{t('Documentación oficial')}</p>
            <h1 className="text-2xl sm:text-3xl font-bold font-rajdhani text-app-primary">{t('Manual del juego')}</h1>
            <p className="text-sm text-app-muted mt-2 max-w-xl">
              {t('Mecánicas Manager FDF reales y auditadas — turnos, prestigio, táctica, mercado, economía y mundo online')}
            </p>
          </div>
          <div className="flex gap-3 text-center shrink-0">
            {[{ n: manualChapters.length, l: 'Capítulos' }, { n: manualChapters.reduce((s, c) => s + c.content.sections.length, 0), l: 'Secciones' }].map(({ n, l }) => (
              <div key={l} className="px-4 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-color)]">
                <div className="text-xl font-black font-display text-[var(--green-primary)]">{n}</div>
                <div className="text-[9px] uppercase tracking-widest text-app-muted font-bold">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Buscador interno (B15) ── */}
      <div className="mb-4" style={{ position: 'relative', maxWidth: 520 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar en el manual… (cláusula, moral, coeficiente, discurso…)"
          aria-label="Buscar en el manual"
          style={{
            width: '100%', padding: '9px 36px 9px 36px', fontSize: '.85rem',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-retro)', color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono-retro)',
          }}
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Limpiar búsqueda"
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Resultados de búsqueda ── */}
      {searching && (
        <div className="section-panel p-4 mb-4">
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
            {hits.length > 0 ? `${hits.length} ${hits.length === 1 ? t('resultado') : t('resultados')}` : t('Sin resultados')} {t('para')} «{query.trim()}»
          </p>
          <div className="space-y-2">
            {hits.map(h => (
              <button key={`${h.chapterId}-${h.sectionId}`} type="button"
                onClick={() => goTo(h.chapterId, h.sectionId)}
                className="w-full text-left rounded-lg p-3 transition-colors hover:bg-app-elevated"
                style={{ border: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
                <p className="text-sm font-semibold text-app-primary flex items-center gap-2">
                  <span aria-hidden>{h.icon}</span>
                  <span>{h.chapterTitle} · <Highlight text={h.sectionTitle} query={query.trim()} /></span>
                </p>
                <p className="text-xs text-app-muted mt-1 leading-relaxed">
                  <Highlight text={h.snippet} query={query.trim()} />
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        <nav className="w-full lg:w-56 flex-shrink-0" aria-label="Capítulos del manual">
          <div className="bg-app-surface rounded-lg border border-app overflow-x-auto lg:overflow-visible">
            <ul className="flex lg:flex-col min-w-max lg:min-w-0">
              {manualChapters.map((c, i) => (
                <li key={c.id} className={cn(i > 0 && 'lg:border-t border-app')}>
                  <button
                    type="button"
                    onClick={() => goTo(c.id)}
                    className={cn(
                      'w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-sm font-medium transition-colors text-left whitespace-nowrap lg:whitespace-normal',
                      selected === c.id
                        ? 'bg-app-elevated text-[var(--green-primary)]'
                        : 'text-app-muted hover:bg-app-elevated/50 hover:text-app-primary'
                    )}
                  >
                    <span className="text-base" aria-hidden>{c.icon}</span>
                    <span className="flex-1">{c.title}</span>
                    {selected === c.id && <ChevronRight size={14} className="hidden lg:block text-[var(--green-primary)]" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <article className="flex-1 min-w-0" ref={articleRef}>
          <div className="section-panel p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl sm:text-3xl" aria-hidden>{chapter.icon}</span>
              <h2 className="text-lg sm:text-xl font-bold font-rajdhani text-app-primary">{chapter.content.heading}</h2>
            </div>

            <div className="space-y-6">
              {chapter.content.sections.map((s, i) => (
                <section key={s.id} id={`${chapter.id}--${s.id}`} style={{ scrollMarginTop: 80 }}>
                  <h3 className="font-semibold text-app-primary mb-2 flex items-start gap-2 group">
                    <span
                      className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: 'var(--green-primary)', color: 'var(--avatar-text)' }}
                    >
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s.title}</span>
                    {/* enlace de anchor copiable */}
                    <a href={`#${chapter.id}--${s.id}`} aria-label={`Enlace a ${s.title}`}
                      onClick={() => window.history.replaceState(null, '', `#${chapter.id}--${s.id}`)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity pt-0.5"
                      style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>#</a>
                  </h3>
                  <p className="text-app-muted leading-relaxed text-sm pl-8">{s.body}</p>
                </section>
              ))}
            </div>

            <div
              className="mt-6 rounded-lg p-4 flex gap-3"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--gold-accent) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--gold-accent) 28%, transparent)',
              }}
            >
              <Lightbulb size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--gold-accent)' }} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--gold-accent)' }}>
                  {t('Consejo')}
                </p>
                <p className="text-sm text-app-primary">{chapter.content.tip}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-between gap-4">
              <button
                type="button"
                onClick={() => idx > 0 && goTo(manualChapters[idx - 1].id)}
                disabled={idx === 0}
                className="text-sm text-app-muted hover:text-app-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-[44px] px-2"
              >
                {t('← Anterior')}
              </button>
              <button
                type="button"
                onClick={() => idx < manualChapters.length - 1 && goTo(manualChapters[idx + 1].id)}
                disabled={idx === manualChapters.length - 1}
                className="text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-[44px] px-2"
                style={{ color: 'var(--green-primary)' }}
              >
                {t('Siguiente →')}
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
