import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe2, Users, Trophy, ChevronRight, Radio, ArrowRight, ShieldCheck, Tv,
  Coins, Gavel, CalendarClock, Flame, MapPin, Sparkles, CheckCircle2, Lock,
} from 'lucide-react';
import { publicApi } from '../api/client';
import { WorldExplorer } from '../components/public/WorldExplorer';
import { countryFlag } from '../components/public/countryCoords';
import { useSession } from '../stores/sessionStore';
import { TrophyModal } from '../components/competition/TrophyModal';
import { PublicNav, PublicTickerBar } from '../components/layout/PublicNav';
import { ClubBadge } from '../components/ui';
import { useTranslation } from 'react-i18next';

function fmtNum(n: number) {
  return new Intl.NumberFormat('es-ES').format(n || 0);
}

type SectionHeadProps = { eyebrow: string; title: string; desc?: string; tone?: string };
function SectionHead({ eyebrow, title, desc, tone = 'var(--green-primary)' }: SectionHeadProps) {
  return (
    <div className="text-center mb-9">
      <div
        className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[3px] px-3 py-1 rounded-full mb-3 border"
        style={{ color: tone, borderColor: `color-mix(in srgb, ${tone} 35%, transparent)`, background: `color-mix(in srgb, ${tone} 10%, transparent)` }}
      >
        <Sparkles size={12} /> {eyebrow}
      </div>
      <h2 className="text-3xl md:text-4xl font-display font-black italic uppercase tracking-wide text-[var(--text-primary)]">{title}</h2>
      {desc && <p className="text-[var(--text-muted)] mt-3 max-w-2xl mx-auto text-sm md:text-base">{desc}</p>}
    </div>
  );
}

const PILLARS = [
  { icon: CalendarClock, color: 'var(--green-primary)', title: 'Mundo por turnos', desc: 'El universo avanza solo: cada turno se juegan jornadas, evoluciona el mercado y cambia la economía. Vives la temporada, no la aceleras.' },
  { icon: Tv, color: 'var(--red-danger)', title: 'Partidos de televisión', desc: 'Un visor 2D estilo broadcast reconstruye cada jugada con cámara, sombras y narración. Revive cualquier partido por su historia.' },
  { icon: Coins, color: 'var(--gold-accent)', title: 'Economía viva', desc: 'Fichajes, cláusulas, subastas, salarios y patrocinios. El dinero importa y cada decisión deja huella en tu balance.' },
  { icon: ShieldCheck, color: 'var(--blue-info)', title: 'Sin pay-to-win', desc: 'Un club por persona y cero atajos pagando. Aquí mandan tu táctica, tu ojeo y tu gestión, no la cartera.' },
  { icon: Globe2, color: 'var(--teal-accent)', title: 'Mundo conectado', desc: '20 ligas reales, ascensos y descensos, y las tres copas europeas. Tu club crece de la nada a la élite continental.' },
  { icon: Gavel, color: 'var(--violet-accent)', title: 'Comunidad con poder', desc: 'Elecciones de federación, selecciones nacionales, premios y rivalidades. La política del fútbol también se juega.' },
];

export function LandingPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { t } = useTranslation('common');
  const [stats, setStats] = useState({ activeManagers: 0, clubs: 0, season: '' as string });
  const [totals, setTotals] = useState({ countries: 0, leagues: 0, clubs: 0, freeClubs: 0 });
  const [freeClubs, setFreeClubs] = useState<any[]>([]);
  const [ticker, setTicker] = useState<any[]>([]);
  const [match, setMatch] = useState<any>(null);
  const [activeTrophy, setActiveTrophy] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    publicApi.stats().then((res: any) => setStats({
      activeManagers: res?.activeManagers ?? 0,
      clubs: res?.totalClubs ?? 0,
      season: res?.season?.name ? `Temporada ${res.season.name} · Semana ${res.season.seasonWeek ?? '—'}` : '',
    })).catch(() => {});
    publicApi.ticker().then((res: any) => setTicker(res?.items || [])).catch(() => {});
    publicApi.featuredMatches().then((res: any) => setMatch(res?.upcoming?.[0] ?? res?.recent?.[0] ?? null)).catch(() => {});
    publicApi.worldMap().then((res: any) => {
      if (res?.totals) setTotals(res.totals);
      setFreeClubs(res?.availableClubs || []);
    }).catch(() => {});
  }, []);

  const goAuth = (path: string, label: string) => {
    if (user) { navigate(path); return; }
    navigate('/login', { state: { from: path, hint: `Inicia sesión para acceder a ${label}.` } });
  };

  const openMatch = () => {
    if (!match?.id) return;
    goAuth(`/matches/${match.id}`, 'el centro de partido');
  };

  const STAT_CARDS = [
    { icon: Trophy, value: totals.leagues, label: 'Ligas en juego', color: 'var(--gold-accent)' },
    { icon: ShieldCheck, value: totals.clubs || stats.clubs, label: 'Clubes', color: 'var(--green-primary)' },
    { icon: Sparkles, value: totals.freeClubs, label: 'Banquillos libres', color: 'var(--teal-accent)' },
    { icon: Globe2, value: totals.countries, label: 'Países', color: 'var(--blue-info)' },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans overflow-x-hidden">
      <PublicNav ticker={<PublicTickerBar items={ticker} />} />
      <main>
        {/* ── HERO broadcast ─────────────────────────────────────────────────── */}
        <section className="relative min-h-[78vh] flex items-center pt-10 pb-20 overflow-hidden border-b-4 border-[var(--green-primary)]">
          <div className="absolute inset-0 bg-[var(--bg-base)] pointer-events-none" />
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              background: 'repeating-linear-gradient(90deg, color-mix(in srgb, var(--green-primary) 4%, transparent), color-mix(in srgb, var(--green-primary) 4%, transparent) 10vw, color-mix(in srgb, var(--green-primary) 8%, transparent) 10vw, color-mix(in srgb, var(--green-primary) 8%, transparent) 20vw)',
              transform: 'perspective(1000px) rotateX(40deg) scale(2) translateY(-20%)',
              transformOrigin: 'top center',
            }}
          />
          <div className="absolute inset-0 pointer-events-none opacity-30" style={{ background: 'radial-gradient(circle at 50% 40%, var(--green-primary) 0%, transparent 55%)' }} />

          <div className="max-w-6xl mx-auto px-6 relative z-10 grid lg:grid-cols-2 gap-12 items-center w-full">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--red-danger)]/40 bg-[color-mix(in_srgb,var(--red-danger)_12%,transparent)] text-[var(--red-danger)] text-[10px] font-black uppercase tracking-widest">
                <Radio size={12} className="animate-pulse" />
                {t('landing.broadcast', 'Broadcast · Universo en vivo')}
              </div>

              <h1 className="text-5xl sm:text-6xl md:text-7xl font-display font-black leading-[0.95] tracking-tighter italic uppercase text-[var(--text-primary)]">
                {t('landing.rule', 'Gobierna')} <br />
                <span
                  className="text-transparent bg-clip-text"
                  style={{
                    backgroundImage: 'linear-gradient(135deg, var(--green-primary) 0%, color-mix(in srgb, var(--green-primary) 70%, white) 100%)',
                    filter: 'drop-shadow(0 0 16px color-mix(in srgb, var(--green-primary) 40%, transparent))',
                  }}
                >
                  {t('landing.universe', 'el universo FDF')}
                </span>
              </h1>

              <p className="text-lg text-[var(--text-muted)] font-medium max-w-xl leading-relaxed">
                {t('landing.description', 'Manager multijugador con turnos reales, economía viva y partidos que se sienten de televisión. Coge un club, hazlo grande y conquista Europa.')}
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="bg-[var(--green-primary)] text-[var(--avatar-text)] px-8 py-4 font-display font-black text-lg uppercase italic tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_24px_color-mix(in_srgb,var(--green-primary)_45%,transparent)] flex items-center gap-2"
                  style={{ clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)' }}
                >
                  {t('landing.chooseClub', 'Elegir mi club')} <ChevronRight size={22} />
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById('mundo')?.scrollIntoView({ behavior: 'smooth' })}
                  className="bg-[var(--bg-surface)] text-[var(--text-primary)] border-2 border-[var(--green-primary)] px-6 py-4 font-display font-black uppercase italic tracking-widest text-sm hover:bg-[var(--green-primary)] hover:text-[var(--avatar-text)] transition-colors"
                  style={{ clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)' }}
                >
                  {t('landing.exploreWithoutAccount', 'Explorar sin cuenta')}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5"><CheckCircle2 size={14} className="text-[var(--green-primary)]" /> {t('landing.trustFree', 'Gratis para siempre')}</span>
                <span className="flex items-center gap-1.5"><Users size={14} className="text-[var(--green-primary)]" /> {t('landing.trustOneClub', 'Un club por persona')}</span>
                <span className="flex items-center gap-1.5"><Lock size={14} className="text-[var(--green-primary)]" /> {t('landing.trustNoP2W', 'Sin pay-to-win')}</span>
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="transform rotate-1 hover:rotate-0 transition-transform duration-700">
                <div className="absolute -inset-4 bg-gradient-to-tr from-[var(--green-primary)] to-[var(--gold-accent)] rounded-2xl opacity-15 blur-xl" />
                <div className="rounded-2xl overflow-hidden border-2 border-[var(--border-color)] shadow-2xl bg-[var(--bg-surface)] p-6">
                  <div className="text-[10px] text-[var(--text-muted)] font-mono mb-4 border-b border-[var(--border-color)] pb-2 uppercase tracking-widest flex items-center justify-between">
                    <span>{t('landing.previewBroadcast', 'Vista previa · broadcast')}</span>
                    <span className="flex items-center gap-1 text-[var(--red-danger)]"><span className="w-1.5 h-1.5 rounded-full bg-[var(--red-danger)] animate-pulse" /> {t('topbar.live', 'En directo')}</span>
                  </div>
                  {match ? (
                    <button type="button" className="w-full text-left" onClick={openMatch}>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="text-center flex-1">
                          <ClubBadge badge={match.homeClub?.badge} name={match.homeClub?.shortName ?? match.homeClub?.name} size={48} className="mx-auto mb-1" />
                          <div className="font-bold text-[var(--text-primary)]">{match.homeClub?.shortName}</div>
                        </div>
                        <div className="text-3xl font-black tabular-nums px-3 text-[var(--text-primary)]">
                          {match.homeScore ?? match.homeGoals ?? '·'} – {match.awayScore ?? match.awayGoals ?? '·'}
                        </div>
                        <div className="text-center flex-1">
                          <ClubBadge badge={match.awayClub?.badge} name={match.awayClub?.shortName ?? match.awayClub?.name} size={48} className="mx-auto mb-1" />
                          <div className="font-bold text-[var(--text-primary)]">{match.awayClub?.shortName}</div>
                        </div>
                      </div>
                      <p className="text-xs text-center text-[var(--text-muted)]">{match.competition?.name}</p>
                    </button>
                  ) : (
                    <p className="text-sm text-[var(--text-muted)] text-center py-12">{t('landing.noFeaturedMatch', 'Partido destacado en directo próximamente.')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── STATS reales ───────────────────────────────────────────────────── */}
        <section className="relative z-20 -mt-10">
          <div className="max-w-6xl mx-auto px-6">
            {stats.season && (
              <div className="text-center mb-3">
                <span className="inline-flex items-center gap-2 text-[10px] font-mono font-black uppercase tracking-widest text-[var(--gold-accent)] bg-[color-mix(in_srgb,var(--gold-accent)_10%,transparent)] border border-[var(--gold-accent)]/25 px-3 py-1 rounded-full">
                  <CalendarClock size={12} /> {stats.season}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {STAT_CARDS.map(({ icon: Icon, value, label, color }) => (
                <div
                  key={label}
                  className="flex flex-col items-center justify-center p-4 bg-[var(--bg-surface)] border border-[var(--border-color)] border-t-4 shadow-[var(--shadow-soft)] rounded-xl backdrop-blur-xl"
                  style={{ borderTopColor: color }}
                >
                  <Icon size={22} style={{ color }} className="mb-1.5" />
                  <div className="text-2xl sm:text-3xl font-display italic font-black text-[var(--text-primary)] tabular-nums">{fmtNum(value)}</div>
                  <div className="text-[9px] font-black uppercase tracking-widest mt-1 text-center" style={{ color }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CÓMO SE JUEGA · pilares ────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <SectionHead
            eyebrow="Cómo se juega"
            title="Un manager de verdad"
            desc="Todo lo que hace grande a FDF, sin entrar: turnos reales, partidos de televisión y una economía que respira."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PILLARS.map(({ icon: Icon, color, title, desc }) => (
              <div
                key={title}
                className="group relative p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[color-mix(in_srgb,var(--green-primary)_50%,var(--border-color))] transition-colors shadow-[var(--shadow-soft)] overflow-hidden"
              >
                <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-10 blur-2xl" style={{ background: color }} />
                <div className="flex items-center justify-center w-12 h-12 rounded-xl mb-4 border" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${color} 30%, transparent)` }}>
                  <Icon size={24} style={{ color }} />
                </div>
                <h3 className="font-display font-black italic uppercase tracking-wide text-lg mb-2 text-[var(--text-primary)]">{title}</h3>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── ELIGE TU BANQUILLO · clubes libres ─────────────────────────────── */}
        {freeClubs.length > 0 && (
          <section className="py-16 border-y border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-elevated)_55%,transparent)]">
            <div className="max-w-6xl mx-auto px-6">
              <SectionHead
                eyebrow="Plazas abiertas"
                title="Elige tu banquillo"
                desc="Estos clubes esperan mánager ahora mismo. Cógelo, hazlo tuyo y empieza a competir desde la primera jornada."
                tone="var(--teal-accent)"
              />
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {freeClubs.slice(0, 6).map((club: any) => (
                  <button
                    key={club.id}
                    type="button"
                    onClick={() => navigate('/register')}
                    className="group text-left p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[var(--teal-accent)]/60 hover:shadow-[0_0_24px_color-mix(in_srgb,var(--teal-accent)_18%,transparent)] transition-all flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-base)] border border-[var(--border-color)]">
                        <ClubBadge id={club.id} name={club.name} badge={club.badge} primaryColor={club.primaryColor} secondaryColor={club.secondaryColor} size={30} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-display font-black italic uppercase tracking-wide text-[var(--text-primary)] truncate group-hover:text-[var(--teal-accent)] transition-colors">{club.shortName || club.name}</div>
                        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 truncate">
                          <span>{countryFlag(club.country)}</span>
                          <span className="truncate">{club.league?.name ?? club.country}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[10px] font-bold uppercase tracking-wider">
                      <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--gold-accent)_12%,transparent)] text-[var(--gold-accent)] border border-[var(--gold-accent)]/25">{t('landing.rep', 'Rep')} {club.reputation ?? '—'}</span>
                      {club.stadiumCapacity ? <span className="px-2 py-0.5 rounded-md bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-color)]">{fmtNum(club.stadiumCapacity)} {t('landing.capacity', 'aforo')}</span> : null}
                      {club.npcCoach?.tacticalStyle?.favoriteFormation ? <span className="px-2 py-0.5 rounded-md bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-color)]">{club.npcCoach.tacticalStyle.favoriteFormation}</span> : null}
                    </div>
                    <div className="mt-auto flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-[var(--teal-accent)] pt-1">
                      <span>{t('landing.claimClub', 'Reclamar club')}</span>
                      <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                ))}
              </div>
              <div className="text-center mt-8">
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="inline-flex items-center gap-2 bg-[var(--teal-accent)] text-[var(--avatar-text)] px-7 py-3.5 font-display font-black italic uppercase tracking-widest text-sm hover:scale-[1.02] transition-transform shadow-[0_0_24px_color-mix(in_srgb,var(--teal-accent)_40%,transparent)]"
                  style={{ clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)' }}
                >
                  {t('landing.seeAllFreeClubs', 'Ver todos los clubes libres')} <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ── EL MUNDO EN VIVO · explorador 3D ───────────────────────────────── */}
        <section id="mundo" className="max-w-6xl mx-auto px-6 py-16 scroll-mt-16">
          <SectionHead
            eyebrow="Explorador mundial"
            title="El mundo en vivo"
            desc="Cada liga, en su país exacto. Gira el globo, entra en cualquier país y consulta clasificaciones públicas sin registrarte."
            tone="var(--blue-info)"
          />
          <WorldExplorer />
        </section>

        {/* ── MODO ESPECTADOR · partido + última hora ────────────────────────── */}
        <section className="py-16 border-y border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-elevated)_55%,transparent)]">
          <div className="max-w-6xl mx-auto px-6">
            <SectionHead
              eyebrow="Modo espectador"
              title="La jornada en pantalla"
              desc="Marcador estrella y última hora del universo FDF, en abierto. Para gestionar tu club, crea tu cuenta."
              tone="var(--red-danger)"
            />
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-6 shadow-lg">
                <div className="text-[10px] text-[var(--text-muted)] font-mono mb-4 border-b border-[var(--border-color)] pb-2 uppercase tracking-widest">{t('landing.mainBroadcast', 'Broadcast principal')}</div>
                {match ? (
                  <button type="button" className="w-full text-left hover:bg-[var(--bg-elevated)] transition-colors p-3 -m-3 rounded-lg" onClick={openMatch}>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="text-center flex-1">
                        <ClubBadge badge={match.homeClub?.badge} name={match.homeClub?.shortName ?? match.homeClub?.name} size={40} className="mx-auto mb-1" />
                        <div className="font-bold text-sm">{match.homeClub?.shortName}</div>
                      </div>
                      <div className="text-center px-2">
                        <div className="text-2xl font-black bg-[var(--bg-base)] px-4 py-1 rounded-md border border-[var(--border-color)] tabular-nums">
                          {match.homeScore ?? match.homeGoals ?? '·'} – {match.awayScore ?? match.awayGoals ?? '·'}
                        </div>
                        {match.status === 'live' && (
                          <span className="text-[9px] text-[var(--red-danger)] font-bold uppercase mt-1 block">{t('landing.live', 'En vivo')}</span>
                        )}
                      </div>
                      <div className="text-center flex-1">
                        <ClubBadge badge={match.awayClub?.badge} name={match.awayClub?.shortName ?? match.awayClub?.name} size={40} className="mx-auto mb-1" />
                        <div className="font-bold text-sm">{match.awayClub?.shortName}</div>
                      </div>
                    </div>
                    <div className="text-center text-xs text-[var(--text-muted)]">{match.competition?.name}</div>
                    {!user && (
                      <p className="text-[10px] text-center text-[var(--gold-accent)] mt-3 uppercase tracking-wider">{t('landing.loginToWatch', 'Inicia sesión para ver el partido completo')}</p>
                    )}
                  </button>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] text-center py-8">{t('landing.noFeaturedMatch', 'No hay partido destacado en este momento.')}</p>
                )}
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl p-6 shadow-lg">
                <div className="text-[10px] text-[var(--text-muted)] font-mono mb-4 border-b border-[var(--border-color)] pb-2 uppercase tracking-widest flex items-center gap-2">
                  <Flame size={12} className="text-[var(--red-danger)]" /> {t('landing.latestNews', 'Última hora')}
                </div>
                {ticker.length > 0 ? (
                  <ul className="space-y-2">
                    {ticker.slice(0, 6).map((item: { id?: string | number; icon?: string; text?: string; route?: string }, i: number) => (
                      <li key={item.id ?? i}>
                        <button
                          type="button"
                          className="w-full text-left text-sm border-b border-[var(--border-color)]/40 pb-2 last:border-0 hover:text-[var(--green-primary)] transition-colors flex items-start gap-2"
                          onClick={() => item.route && (user ? navigate(item.route) : goAuth(item.route, 'este contenido'))}
                        >
                          <span>{item.icon}</span>
                          <span className="flex-1">{item.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] text-center py-8">{t('landing.noNews', 'Sin novedades de momento.')}</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── COMPETICIONES EUROPEAS ─────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <SectionHead
            eyebrow="Gloria continental"
            title="Las noches europeas"
            desc="Tres copas, una sola meta. Asciende con tu club y pelea por levantar la orejona."
            tone="var(--gold-accent)"
          />
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { id: 'champions', name: 'Champions League', color: 'var(--gold-accent)', tag: 'La élite' },
              { id: 'europa', name: 'Europa League', color: 'var(--text-muted)', tag: 'El segundo escalón' },
              { id: 'conference', name: 'Conference League', color: 'var(--green-primary)', tag: 'La puerta de entrada' },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveTrophy({ id: c.id, name: c.name })}
                className="group p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] hover:border-[color-mix(in_srgb,var(--gold-accent)_45%,var(--border-color))] transition-colors text-center shadow-[var(--shadow-soft)]"
              >
                <Trophy size={42} style={{ color: c.color }} className="mx-auto mb-3 group-hover:scale-110 transition-transform drop-shadow" />
                <div className="font-display font-black italic uppercase tracking-wide text-[var(--text-primary)]">{c.name}</div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mt-1">{c.tag}</div>
                <div className="text-[10px] font-black uppercase tracking-widest mt-3 inline-flex items-center gap-1" style={{ color: c.color }}>
                  {t('landing.seePalmares', 'Ver palmarés')} <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── CTA FINAL ──────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-t-4 border-[var(--green-primary)]">
          <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 120%, var(--green-primary) 0%, transparent 60%)' }} />
          <div className="max-w-4xl mx-auto px-6 py-20 text-center relative z-10">
            <div className="inline-flex items-center gap-2 text-[var(--green-primary)] text-[10px] font-black uppercase tracking-[3px] mb-4">
              <MapPin size={13} /> {t('landing.ctaEyebrow', 'Tu historia empieza aquí')}
            </div>
            <h2 className="text-4xl md:text-6xl font-display font-black italic uppercase tracking-tighter leading-[0.95] mb-5">
              {t('landing.ctaTitleA', 'Tu club')} <span className="text-[var(--green-primary)]">{t('landing.ctaTitleB', 'te espera')}</span>
            </h2>
            <p className="text-[var(--text-muted)] max-w-xl mx-auto mb-8 text-base">
              {t('landing.ctaDesc', 'Gratis, un club por persona y sin atajos. Sólo tú, tu plantilla y un mundo entero por conquistar.')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="bg-[var(--green-primary)] text-[var(--avatar-text)] px-10 py-4 font-display font-black text-lg uppercase italic tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_30px_color-mix(in_srgb,var(--green-primary)_50%,transparent)] flex items-center gap-2"
                style={{ clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)' }}
              >
                {t('landing.chooseClub', 'Elegir mi club')} <ChevronRight size={22} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/manual')}
                className="border-2 border-[var(--border-color)] text-[var(--text-primary)] px-7 py-4 font-display font-black uppercase italic tracking-widest text-sm hover:border-[var(--green-primary)] transition-colors"
                style={{ clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)' }}
              >
                {t('landing.readManual', 'Leer el manual')}
              </button>
            </div>
          </div>
        </section>

        {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
        <footer className="border-t border-[var(--border-color)] bg-[var(--bg-base)]">
          <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--green-primary)] to-[color-mix(in_srgb,var(--green-primary)_60%,var(--bg-base))] border border-[var(--border-color)]">
                <Trophy size={16} className="text-[var(--avatar-text)]" />
              </span>
              <div className="leading-tight">
                <div className="font-display font-black tracking-wider text-[var(--text-primary)]">{t('brand.fdf', 'FDF')} <span className="text-[var(--gold-accent)]">{t('brand.manager', 'Manager')}</span></div>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">{t('landing.footerTagline', 'Manager multijugador · Sin pay-to-win')}</div>
              </div>
            </div>
            <nav className="flex items-center gap-5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <button type="button" onClick={() => navigate('/explore')} className="hover:text-[var(--green-primary)] transition-colors">{t('nav.world', 'Mundo')}</button>
              <button type="button" onClick={() => navigate('/manual')} className="hover:text-[var(--green-primary)] transition-colors">{t('nav.manual', 'Manual')}</button>
              <button type="button" onClick={() => navigate('/login')} className="hover:text-[var(--green-primary)] transition-colors">{t('nav.login', 'Entrar')}</button>
              <button type="button" onClick={() => navigate('/register')} className="text-[var(--green-primary)] hover:opacity-80 transition-opacity">{t('nav.register', 'Registro')}</button>
            </nav>
          </div>
        </footer>
      </main>

      {activeTrophy && (
        <TrophyModal type={activeTrophy.id as 'champions' | 'europa' | 'conference'} onClose={() => setActiveTrophy(null)} />
      )}
    </div>
  );
}
