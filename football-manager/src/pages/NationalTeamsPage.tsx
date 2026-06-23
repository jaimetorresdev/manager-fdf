// ─── Selecciones Nacionales · identidad v2 (E17 LOTE B) ────────────────────────
// Mi banquillo de seleccionador (convocatoria 23 con PlayerLink/ClubLink y
// barra de progreso) + tablón de federaciones con identidad (bandera-emoji
// determinista por país) y postulación. Lógica de datos intacta: nationalApi
// getTeams / getMyTeam / applyForManager / uncallPlayer (alerts → toasts).
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { nationalApi } from '../api/client';
import { Globe, Trash2, Flag, Users, Megaphone } from 'lucide-react';
import { Skeleton, EmptyState, StatBar, Badge, Button, KPICard } from '../components/ui';
import { PlayerLink, ClubLink } from '../components/common/EntityLink';

interface NationalTeam {
  id: number;
  country: { id: number; name: string };
  managerSelectorId: number | null;
  selectorCalls?: {
    id: number;
    player: { id: number; name: string; overall: number; club: { id?: number; name: string } };
  }[];
}

const NT_CSS = `
.nt-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap; margin-bottom: 8px;}
.nt-hero{position:relative;overflow:hidden;display:flex;align-items:center;gap:24px;padding:32px 40px;
  border-radius:24px;background:linear-gradient(145deg,var(--brutal-bg-1),var(--brutal-bg-2));border:2px solid rgba(255,215,0,0.3);
  box-shadow:0 20px 50px var(--brutal-shadow),inset 0 0 30px rgba(255,215,0,0.05)}
.nt-hero::after{content:'';position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(circle at center, transparent 20%, var(--brutal-bg-2) 100%), repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,215,0,0.02) 4px, rgba(255,215,0,0.02) 8px)}
.nt-hero>*{position:relative;z-index:1}
.nt-flag{font-size:4rem;line-height:1;flex:none;filter:drop-shadow(0 0 20px rgba(255,215,0,0.4));animation:ntfloat 3s ease-in-out infinite}
@keyframes ntfloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
.nt-hero-t{font-family:var(--font-display);font-weight:900;font-size:2rem;color:var(--brutal-text);text-transform:uppercase;letter-spacing:2px;text-shadow:0 0 20px rgba(255,255,255,0.3)}
.nt-hero-s{font-size:.9rem;color:var(--brutal-text-muted);margin-top:8px;font-family:var(--font-sans);font-weight:600}
.nt-panel{background:var(--brutal-glass);border:1px solid var(--brutal-border);border-radius:24px;
  overflow:hidden;box-shadow:0 20px 40px var(--brutal-shadow);backdrop-filter:blur(10px)}
.nt-pt{display:flex;align-items:center;gap:12px;padding:24px 32px;background:var(--brutal-glow);
  border-bottom:1px solid rgba(255,215,0,0.2);font-family:var(--font-display);font-weight:900;
  font-size:1.1rem;text-transform:uppercase;letter-spacing:3px;color:var(--brutal-text)}
.nt-pt .right{margin-left:auto;font-family:var(--font-mono-retro);font-size:.85rem;color:var(--gold-accent);
  text-transform:none;letter-spacing:1px;background:rgba(255,215,0,0.1);padding:4px 12px;border-radius:8px;box-shadow:0 0 10px rgba(255,215,0,0.2)}
.nt-calls{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;padding:24px}
.nt-call{display:flex;align-items:center;gap:16px;padding:16px 20px;border-radius:16px;
  background:linear-gradient(180deg,var(--brutal-card-bg-1),var(--brutal-card-bg-2));border:1px solid var(--brutal-border);transition:all 300ms cubic-bezier(0.4, 0, 0.2, 1);box-shadow:0 4px 15px var(--brutal-shadow)}
.nt-call:hover{background:linear-gradient(180deg,var(--brutal-bg-elevated),var(--brutal-card-bg-1));transform:translateY(-3px);box-shadow:0 15px 30px var(--brutal-shadow),0 0 15px rgba(255,215,0,0.1);border-color:rgba(255,215,0,0.3)}
.nt-call .info{flex:1;min-width:0}
.nt-call .nm{font-size:1.05rem;font-weight:900;color:var(--brutal-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--font-display);letter-spacing:0.5px}
.nt-call .cl{font-size:.8rem;color:var(--brutal-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;margin-top:4px}
.nt-call .ovr{font-family:var(--font-mono-retro);font-weight:900;font-size:1.3rem;color:var(--gold-accent);flex:none;text-shadow:0 0 15px rgba(255,215,0,0.4);background:rgba(0,0,0,0.4);padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.05)}
.nt-uncall{display:inline-flex;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);padding:10px;border-radius:10px;cursor:pointer;
  color:var(--red-danger);flex:none;transition:all 200ms ease;box-shadow:0 0 10px rgba(239,68,68,0.1)}
.nt-uncall:hover{background:var(--red-danger);color:black;box-shadow:0 0 20px rgba(239,68,68,0.5);transform:scale(1.1)}
.nt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}
.nt-card{position:relative;overflow:hidden;display:flex;align-items:center;gap:16px;padding:20px 24px;
  background:linear-gradient(135deg,var(--brutal-card-bg-1),var(--brutal-card-bg-2));border:1px solid var(--brutal-border);border-radius:20px;
  box-shadow:0 10px 20px var(--brutal-shadow);transition:all 300ms cubic-bezier(0.4, 0, 0.2, 1)}
.nt-card:hover{border-color:rgba(34,197,94,0.4);transform:translateY(-5px) scale(1.02);box-shadow:0 20px 40px var(--brutal-shadow),0 0 20px rgba(34,197,94,0.1)}
.nt-card .fl{font-size:2.5rem;line-height:1;flex:none;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.5))}
.nt-card .info{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.nt-card .nm{font-family:var(--font-display);font-weight:900;font-size:1.15rem;color:var(--brutal-text);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:1px;text-transform:uppercase}
.nt-occ{padding:24px}
@media(max-width:760px){.nt-calls{grid-template-columns:1fr}.nt-hero{flex-direction:column;text-align:center}}
@media (prefers-reduced-motion: reduce){.nt-card,.nt-card:hover,.nt-hero .nt-flag{transform:none;animation:none}}
`;

// Bandera-emoji por nombre de país (conocidos) o globo determinista de respaldo.
const FLAGS: Record<string, string> = {
  'España': '🇪🇸', 'Francia': '🇫🇷', 'Italia': '🇮🇹', 'Alemania': '🇩🇪', 'Portugal': '🇵🇹',
  'Inglaterra': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Brasil': '🇧🇷', 'Argentina': '🇦🇷', 'Países Bajos': '🇳🇱', 'Holanda': '🇳🇱',
  'Bélgica': '🇧🇪', 'Croacia': '🇭🇷', 'Uruguay': '🇺🇾', 'México': '🇲🇽', 'Estados Unidos': '🇺🇸',
  'Japón': '🇯🇵', 'Marruecos': '🇲🇦', 'Senegal': '🇸🇳', 'Suiza': '🇨🇭', 'Dinamarca': '🇩🇰',
  'Polonia': '🇵🇱', 'Suecia': '🇸🇪', 'Noruega': '🇳🇴', 'Austria': '🇦🇹', 'Escocia': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Gales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Irlanda': '🇮🇪', 'Grecia': '🇬🇷', 'Turquía': '🇹🇷', 'Colombia': '🇨🇴',
  'Chile': '🇨🇱', 'Perú': '🇵🇪', 'Ecuador': '🇪🇨', 'Nigeria': '🇳🇬', 'Ghana': '🇬🇭',
  'Camerún': '🇨🇲', 'Costa de Marfil': '🇨🇮', 'Egipto': '🇪🇬', 'Corea del Sur': '🇰🇷',
  'Australia': '🇦🇺', 'Canadá': '🇨🇦', 'Serbia': '🇷🇸', 'Chequia': '🇨🇿', 'República Checa': '🇨🇿',
  'Ucrania': '🇺🇦', 'Rumanía': '🇷🇴', 'Hungría': '🇭🇺', 'Rusia': '🇷🇺', 'Finlandia': '🇫🇮',
};
const flagOf = (name?: string) => (name && FLAGS[name]) || '🌐';

export function NationalTeamsPage() {
  const { t } = useTranslation('common');
  const [teams, setTeams] = useState<NationalTeam[]>([]);
  const [myTeam, setMyTeam] = useState<NationalTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const allTeams = await nationalApi.getTeams();
      setTeams(Array.isArray(allTeams) ? allTeams : []);

      const me = await nationalApi.getMyTeam();
      if (!me.notManager) {
        setMyTeam(me);
      } else {
        setMyTeam(null);
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? t('No se pudieron cargar las selecciones'));
      toast.error(e?.message ?? t('No se pudieron cargar las selecciones'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = async (countryId: number) => {
    try {
      await nationalApi.applyForManager(countryId);
      toast.success(t('¡Has sido asignado como seleccionador!'));
      fetchData();
    } catch (e: any) {
      toast.error(e.message || t('Error al postularse'));
    }
  };

  const handleUncall = async (callId: number) => {
    try {
      await nationalApi.uncallPlayer(callId);
      toast.success(t('Jugador desconvocado'));
      fetchData();
    } catch (e: any) {
      toast.error(e.message || t('Error al desconvocar'));
    }
  };

  if (loading) {
    return (
      <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Skeleton height={64} />
        <Skeleton height={120} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[0, 1, 2].map(i => <Skeleton key={i} height={84} />)}
        </div>
      </div>
    );
  }

  const calls = myTeam?.selectorCalls ?? [];
  const vacancies = teams.filter(t => !t.managerSelectorId).length;

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{NT_CSS}</style>

      {/* Header */}
      <div className="nt-head">
        <div>
          <p className="muted-label">{t('Fútbol internacional')}</p>
          <h1 className="section-title text-3xl">{t('Selecciones Nacionales')}</h1>
          <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {t('Cargos de seleccionador y convocatorias internacionales.')}
          </p>
        </div>
      </div>

      {error && teams.length === 0 ? (
        <EmptyState
          icon={<Globe size={28} />}
          title={t('Selecciones no disponibles')}
          hint={error}
          action={<Button variant="secondary" size="sm" onClick={fetchData}>{t('Reintentar')}</Button>}
        />
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            <KPICard label={t('Federaciones')} value={teams.length} tone="blue" icon={<Globe size={16} />} />
            <KPICard label={t('Banquillos vacantes')} value={vacancies} tone={vacancies > 0 ? 'green' : 'neutral'} icon={<Megaphone size={16} />} />
            <KPICard label={t('Mi convocatoria')} value={myTeam ? `${calls.length}/23` : '—'}
              hint={myTeam ? myTeam.country?.name : t('Sin cargo')} tone={myTeam ? 'gold' : 'neutral'} icon={<Users size={16} />} />
          </div>

          {/* Mi banquillo de seleccionador */}
          {myTeam ? (
            <>
              <div className="nt-hero">
                <span className="nt-flag">{flagOf(myTeam.country?.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="nt-hero-t">
                    {t('Seleccionador de')} <span style={{ color: 'var(--green-primary)' }}>{myTeam.country?.name}</span>
                  </div>
                  <div className="nt-hero-s">
                    {t('Para convocar jugadores, busca jugadores de tu nacionalidad en el Mercado o en los Equipos y usa la opción «Convocar».')}
                  </div>
                  <div style={{ marginTop: 8, maxWidth: 360 }}>
                    <StatBar value={calls.length} max={23} showValue color={calls.length >= 23 ? 'amber' : 'green'} size="md" />
                  </div>
                </div>
                <Badge variant="success" block>{t('EN EL CARGO')}</Badge>
              </div>

              <div className="nt-panel">
                <div className="nt-pt">
                  <Users size={13} /> {t('Convocatoria')}
                  <span className="right">{calls.length}/23 {t('convocados')}</span>
                </div>
                {calls.length === 0 ? (
                  <div style={{ padding: 14 }}>
                    <EmptyState icon={<Users size={24} />} title={t('Convocatoria vacía')}
                      hint={t('Aún no has convocado a ningún jugador. Busca jugadores de tu nacionalidad y convócalos.')} />
                  </div>
                ) : (
                  <div className="nt-calls">
                    {calls.map(c => (
                      <div key={c.id} className="nt-call">
                        <div className="info">
                          <div className="nm">
                            <PlayerLink id={c.player?.id} name={c.player?.name ?? t('Jugador')} />
                          </div>
                          <div className="cl">
                            <ClubLink id={c.player?.club?.id} name={c.player?.club?.name ?? '—'} />
                          </div>
                        </div>
                        <span className="ovr" title={t('Valoración')}>{c.player?.overall ?? '—'}</span>
                        <button className="nt-uncall" title={t('Desconvocar')} onClick={() => handleUncall(c.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="nt-hero">
              <span className="nt-flag">🌐</span>
              <div>
                <div className="nt-hero-t">{t('Sin banquillo internacional')}</div>
                <div className="nt-hero-s">
                  {t('No eres seleccionador de ninguna nación actualmente. Postúlate a una federación vacante (requiere Prestigio > 0).')}
                </div>
              </div>
            </div>
          )}

          {/* Tablón de federaciones */}
          <div className="nt-panel">
            <div className="nt-pt">
              <Flag size={13} /> {t('Federaciones')}
              <span className="right">{vacancies} {vacancies === 1 ? t('vacante') : t('vacantes')}</span>
            </div>
            <div className="nt-occ">
              {teams.length === 0 ? (
                <EmptyState icon={<Globe size={24} />} title={t('Sin federaciones')}
                  hint={t('No hay selecciones nacionales registradas todavía.')} />
              ) : (
                <div className="nt-grid">
                  {teams.map(tData => (
                    <div key={tData.id} className="nt-card">
                      <span className="fl">{flagOf(tData.country?.name)}</span>
                      <div className="info">
                        <div className="nm">{tData.country?.name ?? '—'}</div>
                        {tData.managerSelectorId
                          ? <Badge variant="neutral" size="sm">{t('OCUPADO')}</Badge>
                          : <Badge variant="success" size="sm">{t('VACANTE')}</Badge>}
                      </div>
                      {!tData.managerSelectorId && !myTeam && (
                        <Button size="sm" onClick={() => handleApply(tData.country.id)}>{t('Postularse')}</Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
