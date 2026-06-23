import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Briefcase, Send } from 'lucide-react';
import { managerApi } from '../api/client';
import { Button, Skeleton } from '../components/ui';
import { eur } from '../lib/format';
import toast from 'react-hot-toast';

interface Offer { id: number; club?: { name?: string; shortName?: string }; clubName?: string; league?: string; salary?: number; years?: number; status?: string }
interface Vacancy { id: number; club?: { name?: string; shortName?: string }; clubName?: string; league?: string; position?: number; reputation?: number }

const clubName = (x: { club?: { name?: string; shortName?: string }; clubName?: string }) => x.club?.name ?? x.club?.shortName ?? x.clubName ?? 'Club';

export function VacanciesPage() {
  const { t } = useTranslation('common');
  const [offers, setOffers] = useState<Offer[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [o, v] = await Promise.all([managerApi.getOffers(), managerApi.getVacancies()]);
      setOffers(o);
      setVacancies(v);
    } catch {
      setError(t('No se pudo cargar el mercado de banquillos'));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: Promise<any>, successMsg?: string) => {
    try {
      await fn;
      if (successMsg) toast.success(successMsg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('Operación fallida'));
    }
  };

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .vc-card{display:flex;align-items:center;gap:12px;padding:14px;background:var(--panel-gradient);border:1px solid var(--border-color);border-radius:var(--radius-retro)}
        .vc-ic{width:38px;height:38px;border-radius:8px;display:grid;place-items:center;background:var(--bg-elevated);color:var(--green-primary);flex:none}
        .vc-name{font-family:var(--font-display);font-weight:700}
        .vc-sub{font-size:.74rem;color:var(--text-muted)}
        .vc-pt{font-family:var(--font-display);font-weight:700;font-size:.9rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin:4px 0}
        .vc-grid{display:grid;gap:10px}
      `}</style>
      <div><p className="muted-label">{t('Carrera del mánager')}</p><h1 className="section-title text-3xl">{t('Banquillos')}</h1></div>

      {/* E13: los banquillos libres se adjudican por ORDEN DE PRESTIGIO en el turno */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'color-mix(in srgb,var(--gold-accent) 8%,var(--bg-surface))', border: '1px dashed color-mix(in srgb,var(--gold-accent) 45%,transparent)', borderRadius: 'var(--radius-retro)', fontSize: '.8rem' }}>
        {t('⭐ Tu prestigio decide: si varios mánagers piden el mismo banquillo, se lo lleva el de MAYOR prestigio al procesarse el turno.')}
        <Link to="/career" style={{ marginLeft: 'auto', color: 'var(--gold-accent)', fontWeight: 700, fontSize: '.74rem', whiteSpace: 'nowrap' }}>{t('Mi prestigio →')}</Link>
      </div>

      {loading && <Skeleton height={220} />}
      {!loading && error && <div className="section-panel p-6 text-center" style={{ color: 'var(--text-muted)' }}>⚠️ {error}</div>}
      {!loading && !error && (
        <>
          <div className="vc-pt">{t('Ofertas recibidas')} {offers.length > 0 && `(${offers.length})`}</div>
          <div className="vc-grid">
            {offers.length === 0 && <p className="vc-sub">{t('No tienes ofertas por ahora.')}</p>}
            {offers.map(o => (
              <div key={o.id} className="vc-card">
                <div className="vc-ic"><Briefcase size={18} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="vc-name">{clubName(o)}</div>
                  <div className="vc-sub">{[o.league, o.salary != null ? `${eur(o.salary)}/año` : null, o.years ? `${o.years} años` : null].filter(Boolean).join(' · ')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" onClick={() => act(managerApi.acceptOffer(o.id), t('Oferta aceptada — bienvenido al nuevo club'))}>{t('Aceptar')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(managerApi.rejectOffer(o.id), t('Oferta rechazada'))}>{t('Rechazar')}</Button>
                </div>
              </div>
            ))}
          </div>

          <div className="vc-pt">{t('Vacantes disponibles')} {vacancies.length > 0 && `(${vacancies.length})`}</div>
          <div className="vc-grid">
            {vacancies.length === 0 && <p className="vc-sub">{t('No hay vacantes ahora mismo.')}</p>}
            {vacancies.map(v => (
              <div key={v.id} className="vc-card">
                <div className="vc-ic"><Briefcase size={18} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="vc-name">{clubName(v)}</div>
                  <div className="vc-sub">{[v.league, v.position ? `${v.position}º` : null, v.reputation ? `rep. ${v.reputation}` : null].filter(Boolean).join(' · ')}</div>
                </div>
                <Button size="sm" onClick={() => act(managerApi.applyVacancy(v.id), t('Solicitud enviada — resultado según tu prestigio'))}><Send size={13} /> {t('Postularme')}</Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
