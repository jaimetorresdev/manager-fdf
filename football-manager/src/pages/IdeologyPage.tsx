// ─── IdeologyPage — Ideología y jugadores emblemáticos (manual §8, issue 4.5) ─
// Valores del club (máx 6), emblemáticos retirados (bonus de talento en cantera)
// y mejoras desbloqueadas. Contrato: GET/PUT /api/ideology, POST/DELETE emblematic.


import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ideologyApi } from '../api/client';
import { Button, KPICard, Skeleton } from '../components/ui';

interface Emblematic { id: number; retireYear: number; talentBonus: number; player?: { id?: number; firstName?: string; lastName?: string; name?: string; position?: string } }
interface IdeologyState {
  values: string[];
  emblematic: Emblematic[];
  bonuses: { academyTalentBonus: number; unlockedUpgrades: string[] };
  limits: { maxValues: number; maxEmblematic: number };
}

const pname = (p?: Emblematic['player']) => (p?.name ?? `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim()) || 'Jugador';

const UPGRADE_META: Record<string, { label: string; desc: string }> = {
  'academy:talentBonus': {
    label: 'Cantera con sello propio',
    desc: 'Los emblemáticos elevan el talento medio de los juveniles que llegan al club.',
  },
  'market:premiumScouting': {
    label: 'Ojeo premium',
    desc: 'El club desbloquea informes más finos en perfiles de mercado y scouting.',
  },
  'training:offensiveFocus': {
    label: 'Escuela ofensiva',
    desc: 'La identidad del club favorece entrenamientos orientados a ataque y creatividad.',
  },
};

function upgradeMeta(key: string) {
  return UPGRADE_META[key] ?? {
    label: key
      .split(':')
      .map((part) => part.replace(/([A-Z])/g, ' $1').trim())
      .join(' · ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase()),
    desc: 'Mejora desbloqueada por la ideología actual del club.',
  };
}

export function IdeologyPage() {
  const { t } = useTranslation('common');
  const [state, setState] = useState<IdeologyState | null>(null);
  const [eligible, setEligible] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');
  const [pickId, setPickId] = useState('');
  const [retireYear, setRetireYear] = useState(new Date().getFullYear());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [i, e] = await Promise.allSettled([ideologyApi.get(), ideologyApi.eligibleEmblematics()]);
    if (i.status === 'fulfilled') setState(i.value);
    else setError(t('No se pudo cargar la ideología'));
    if (e.status === 'fulfilled' && Array.isArray(e.value)) setEligible(e.value);
    setLoading(false);
  }, [t]);
  
  useEffect(() => { load(); }, [load]);

  const saveValues = async (values: string[]) => {
    try { const r = await ideologyApi.updateValues(values); setState(r); }
    catch (e) { toast.error(e instanceof Error ? e.message : t('Error al guardar')); }
  };

  if (loading) return <div className="page-surface" style={{ display: 'grid', gap: 12 }}><Skeleton height={80} /><Skeleton height={200} /></div>;
  if (error || !state) return <div className="page-surface section-panel p-6 text-center" style={{ color: 'var(--text-muted)' }}>⚠️ {error ?? t('Sin datos')}</div>;

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p className="muted-label">{t('Identidad del club')}</p>
        <h1 className="section-title text-3xl">{t('Ideología')}</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <KPICard label={t('Emblemáticos')} value={`${state.emblematic.length}/${state.limits.maxEmblematic}`} tone="gold" />
        <KPICard label={t('Bonus talento cantera')} value={`+${state.bonuses.academyTalentBonus}`} tone="green" hint={t('por emblemáticos retirados')} />
        <KPICard label={t('Mejoras activas')} value={String(state.bonuses.unlockedUpgrades?.length ?? 0)} tone="blue" />
      </div>

      {/* Valores del club */}
      <div className="section-panel" style={{ padding: 14 }}>
        <p style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8 }}>
          {t('Valores del club')} ({state.values.length}/{state.limits.maxValues})
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {state.values.map(v => (
            <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '4px 10px', fontSize: '.78rem', color: 'var(--text-primary)' }}>
              {v}
              {state.values.length > 1 && (
                <button onClick={() => saveValues(state.values.filter(x => x !== v))}
                  style={{ color: 'var(--red-danger)', fontWeight: 800, fontSize: '.7rem' }}>✕</button>
              )}
            </span>
          ))}
        </div>
        {state.values.length < state.limits.maxValues && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder={t('Nuevo valor (ej. cantera, juego ofensivo...)')}
              style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: '.82rem' }} />
            <Button size="sm" onClick={() => { const v = newValue.trim(); if (v) { saveValues([...state.values, v]); setNewValue(''); } }}>{t('Añadir')}</Button>
          </div>
        )}
      </div>

      {/* Emblemáticos */}
      <div className="section-panel" style={{ padding: 14 }}>
        <p style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 4 }}>
          {t('Jugadores emblemáticos')}
        </p>
        <p style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginBottom: 10 }}>
          {t('Solo jugadores')} <b>{t('en activo')}</b> {t('en tu plantilla, o retirados con')} <b>{t('≥450 partidos')}</b> {t('en el club. Al retirarse aportan +')}{state.emblematic[0]?.talentBonus ?? 1} {t('de talento a la cantera.')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {state.emblematic.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '8px 12px' }}>
              <span style={{ fontSize: '1rem' }}>🏛️</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{pname(e.player)}</p>
                <p style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>{e.player?.position ?? ''} · {t('retirada')} {e.retireYear} · +{e.talentBonus} {t('talento cantera')}</p>
              </div>
              <button onClick={async () => { try { setState(await ideologyApi.removeEmblematic(e.id)); } catch { /* noop */ } }}
                style={{ color: 'var(--red-danger)', fontSize: '.72rem', fontWeight: 700 }}>{t('Retirar')}</button>
            </div>
          ))}
          {state.emblematic.length === 0 && <p style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{t('Aún no hay emblemáticos. Cuida a tus veteranos hasta la retirada.')}</p>}
        </div>
        {state.emblematic.length < state.limits.maxEmblematic && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={pickId} onChange={e => setPickId(e.target.value)}
              style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 8px', color: 'var(--text-primary)', fontSize: '.8rem' }}>
              <option value="">{t('Elegir jugador…')}</option>
              {eligible.map((p: any) => <option key={p.playerId} value={p.playerId}>{p.name} ({p.matchesForClub} {t('PJ')})</option>)}
            </select>
            <input type="number" value={retireYear} onChange={e => setRetireYear(Number(e.target.value))}
              style={{ width: 90, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 8px', color: 'var(--text-primary)', fontSize: '.8rem' }} />
            <Button size="sm" onClick={async () => {
              if (!pickId) return;
              try { setState(await ideologyApi.addEmblematic(Number(pickId), retireYear)); setPickId(''); }
              catch (e: any) { 
                const msg = e.response?.data?.error || e.message || t('Error');
                toast.error(msg);
              }
            }}>{t('Declarar emblemático')}</Button>
          </div>
        )}
      </div>

      {/* Mejoras desbloqueadas */}
      {(state.bonuses.unlockedUpgrades?.length ?? 0) > 0 && (
        <div className="section-panel" style={{ padding: 14 }}>
          <p style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8 }}>{t('Mejoras de ideología desbloqueadas')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {state.bonuses.unlockedUpgrades.map(u => {
              const meta = upgradeMeta(u);
              return (
                <span key={u} title={t(meta.desc)} style={{
                  background: 'color-mix(in srgb, var(--green-primary) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--green-primary) 35%, transparent)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: '.74rem',
                  color: 'var(--green-primary)',
                  fontWeight: 700,
                  display: 'inline-flex',
                  flexDirection: 'column',
                  gap: 2,
                }}>
                  <span>✓ {t(meta.label)}</span>
                  <small style={{ color: 'var(--text-muted)', fontWeight: 500, maxWidth: 220 }}>{t(meta.desc)}</small>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
