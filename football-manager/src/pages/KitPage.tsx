// ─── 2.4 · KitPage REAL (antes 100% mock "Kelme/Bankinter") ────────────────────
// Contra API_UI §KitsYCarrera: GET /api/club/kits, PUT /club/kits/design,
// PUT /club/kits/sponsor. Editor visual de camiseta (SVG) con patrones,
// 3 colores y patrocinador en el pecho.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shirt, Save, Handshake } from 'lucide-react';
import toast from 'react-hot-toast';
import { request } from '../api/client';
import { Skeleton, Button, EmptyState } from '../components/ui';
import { cn } from '../lib/cn';

interface Kit { kind: string; primaryColor?: string; secondaryColor?: string; accentColor?: string; pattern?: string; sponsorName?: string; persisted?: boolean }
const KIND_IDS = ['home', 'away', 'third'] as const;
const PATTERNS = ['classic', 'stripes', 'hoops', 'sash', 'halves'];
const eur = (n?: number) => n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M€` : `${Math.round((n ?? 0) / 1e3)}K€`;

// Camiseta SVG con patrón
function KitShirt({ kit, size = 150 }: { kit: Kit; size?: number }) {
  const p = kit.primaryColor ?? '#1B5FBF', s = kit.secondaryColor ?? '#FFFFFF', a = kit.accentColor ?? '#E7C65A';
  const body = 'M30,38 L48,22 L62,30 L78,30 L92,22 L110,38 L102,56 L94,50 L94,118 L46,118 L46,50 L38,56 Z';
  return (
    <svg width={size} height={size * 0.93} viewBox="0 0 140 130" aria-label={`Camiseta ${kit.kind}`}>
      <defs>
        <clipPath id={`kc-${kit.kind}`}><path d={body} /></clipPath>
      </defs>
      <path d={body} fill={p} stroke="var(--border-color)" strokeWidth="2" />
      <g clipPath={`url(#kc-${kit.kind})`}>
        {kit.pattern === 'stripes' && [0, 1, 2, 3].map(i => <rect key={i} x={40 + i * 18} y={20} width={9} height={110} fill={s} />)}
        {kit.pattern === 'hoops' && [0, 1, 2, 3].map(i => <rect key={i} x={20} y={42 + i * 20} width={100} height={9} fill={s} />)}
        {kit.pattern === 'sash' && <polygon points="36,22 56,22 104,118 84,118" fill={s} />}
        {kit.pattern === 'halves' && <rect x={70} y={10} width={60} height={120} fill={s} />}
      </g>
      {/* cuello y puños en color de acento */}
      <path d="M48,22 L62,30 L78,30 L92,22 L86,18 L70,26 L54,18 Z" fill={a} />
      <path d="M30,38 L38,56 L33,58 L25,42 Z" fill={a} />
      <path d="M110,38 L102,56 L107,58 L115,42 Z" fill={a} />
      {/* patrocinador */}
      {kit.sponsorName && (
        <text x="70" y="78" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono-retro)" fontWeight="700"
          fill={kit.pattern === 'halves' || kit.pattern === 'sash' ? a : s} style={{ letterSpacing: 1 }}>
          {kit.sponsorName.slice(0, 14).toUpperCase()}
        </text>
      )}
    </svg>
  );
}

export function KitPage() {
  const { t } = useTranslation();
  const kinds = KIND_IDS.map(id => ({ id, label: t(`gameplay:kit.kinds.${id}`) }));
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState('home');
  const [draft, setDraft] = useState<Kit | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true); setError(null);
    request<any>('/club/kits')
      .then(d => { setData(d); })
      .catch(e => setError(e instanceof Error ? e.message : t('gameplay:kit.loadError')))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const kits: Kit[] = Array.isArray(data?.kits) ? data.kits : [];
  const current: Kit = draft ?? kits.find(k => k.kind === active) ?? { kind: active, primaryColor: '#1B5FBF', secondaryColor: '#FFFFFF', accentColor: '#E7C65A', pattern: 'classic' };

  const setField = (k: keyof Kit, v: string) => setDraft({ ...current, kind: active, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      await request('/club/kits/design', { method: 'PUT', body: JSON.stringify({ ...current, kind: active }) });
      toast.success(t('gameplay:kit.toasts.designSaved'));
      setDraft(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar'); }
    setSaving(false);
  };

  if (loading) return <div className="page-surface" style={{ display: 'grid', gap: 12 }}><Skeleton height={90} /><Skeleton height={260} /></div>;
  if (error) return (
    <div className="page-surface section-panel p-6">
      <EmptyState title={t('gameplay:kit.loadError')} hint={error} action={<Button variant="secondary" onClick={load}>{t('gameplay:kit.retry')}</Button>} />
    </div>
  );

  const sponsor = data?.sponsor;
  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .kt-grid{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:start}
        .kt-panel{background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-retro);padding:16px}
        .kt-tabs{display:flex;gap:6px;margin-bottom:12px}
        .kt-tab{padding:6px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-elevated);color:var(--text-muted);cursor:pointer;font-size:.78rem;font-weight:700}
        .kt-tab.on{color:var(--green-primary);border-color:var(--green-primary)}
        .kt-f{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
        .kt-f label{font-size:.64rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)}
        .kt-f input[type=text]{background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:6px;padding:6px 8px;color:var(--text-primary);font-size:.82rem;width:180px}
        .kt-colors{display:flex;gap:12px}
        .kt-pat{display:flex;gap:6px;flex-wrap:wrap}
        .kt-patb{padding:4px 10px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-elevated);color:var(--text-muted);cursor:pointer;font-size:.72rem}
        .kt-patb.on{color:var(--gold-accent);border-color:var(--gold-accent)}
        @media(max-width:680px){.kt-grid{grid-template-columns:1fr}}
      `}</style>

      <div>
        <p className="muted-label">{t('gameplay:kit.kicker')}</p>
        <h1 className="section-title text-3xl">{t('gameplay:kit.title')}</h1>
      </div>

      {/* Patrocinador REAL de camiseta */}
      <div className="kt-panel" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Handshake size={20} style={{ color: 'var(--gold-accent)' }} />
        {sponsor ? (
          <span style={{ fontSize: '.86rem' }}>
            {t('gameplay:kit.sponsor.label')} <b>{sponsor.sponsorName ?? current.sponsorName ?? t('gameplay:kit.sponsor.fallback')}</b>
            <span style={{ color: 'var(--text-muted)' }}> · {t('gameplay:kit.sponsor.years', { years: sponsor.years })} · {eur(sponsor.yearlyIncome)}{t('gameplay:kit.sponsor.perYear')}</span>
          </span>
        ) : (
          <span style={{ fontSize: '.86rem', color: 'var(--text-muted)' }}>{t('gameplay:kit.sponsor.none')}</span>
        )}
      </div>

      <div className="kt-grid">
        {/* Vista previa */}
        <div className="kt-panel" style={{ display: 'grid', placeItems: 'center', minWidth: 220 }}>
          <KitShirt kit={current} size={190} />
          <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 }}>
            {kinds.find(k => k.id === active)?.label}{draft ? t('gameplay:kit.unsaved') : ''}
          </span>
        </div>

        {/* Editor */}
        <div className="kt-panel">
          <div className="kt-tabs">
            {kinds.map(k => (
              <button key={k.id} className={cn('kt-tab', active === k.id && 'on')} onClick={() => { setActive(k.id); setDraft(null); }}>
                <Shirt size={12} style={{ display: 'inline', marginRight: 4 }} />{k.label}
              </button>
            ))}
          </div>

          <div className="kt-f"><label htmlFor="kit-pattern">{t('gameplay:kit.fields.pattern')}</label>
            <div className="kt-pat" id="kit-pattern">
              {PATTERNS.map(pt => <button key={pt} className={cn('kt-patb', (current.pattern ?? 'classic') === pt && 'on')} onClick={() => setField('pattern', pt)}>{pt}</button>)}
            </div>
          </div>

          <div className="kt-colors">
            <div className="kt-f"><label htmlFor="kit-primary">{t('gameplay:kit.fields.primary')}</label><input id="kit-primary" type="color" value={current.primaryColor ?? '#1B5FBF'} onChange={e => setField('primaryColor', e.target.value)} /></div>
            <div className="kt-f"><label htmlFor="kit-secondary">{t('gameplay:kit.fields.secondary')}</label><input id="kit-secondary" type="color" value={current.secondaryColor ?? '#FFFFFF'} onChange={e => setField('secondaryColor', e.target.value)} /></div>
            <div className="kt-f"><label htmlFor="kit-accent">{t('gameplay:kit.fields.accent')}</label><input id="kit-accent" type="color" value={current.accentColor ?? '#E7C65A'} onChange={e => setField('accentColor', e.target.value)} /></div>
          </div>

          <div className="kt-f"><label htmlFor="kit-sponsor-text">{t('gameplay:kit.fields.sponsorText')}</label>
            <input id="kit-sponsor-text" type="text" maxLength={14} value={current.sponsorName ?? ''} onChange={e => setField('sponsorName', e.target.value)} placeholder={sponsor?.sponsorName ?? t('gameplay:kit.sponsor.fallback')} />
          </div>

          <Button onClick={save} disabled={saving || !draft}>
            <Save size={14} /> {saving ? t('gameplay:kit.saving') : t('gameplay:kit.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
