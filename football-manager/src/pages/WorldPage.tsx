import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Globe2, Loader2, Search, Swords, ChevronRight, MapPin,
} from 'lucide-react';
import { worldApi } from '../api/client';
import { ClubLink } from '../components/common/EntityLink';
import { NpcCoachIdentity } from '../components/public/NpcCoachIdentity';
import { ClubBadge } from '../components/ui';
import { CompetitionsHubPanel } from '../components/competition/CompetitionsHubPanel';
import { TrophyModal } from '../components/competition/TrophyModal';
import { WorldMapPolitical } from '../components/public/WorldMapPolitical';

interface CompetitionRow {
  id: number;
  name: string;
  shortName: string;
  country: string;
  type: string;
  clubCount: number;
  matchdayCount: number;
}

interface TableRow {
  position: number;
  club: { id: number; name: string; shortName: string; badge?: string | null; manager?: { id: number; name: string }; npcCoach?: { name: string; avatarSeed?: string; tacticalStyle?: { favoriteFormation?: string } } };
  played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
}

interface ClubRow {
  id: number; name: string; shortName: string; badge?: string | null;
  city: string; country: string; budget: number; reputation: number;
  manager?: { id: number; name: string };
  npcCoach?: { name: string; avatarSeed?: string; tacticalStyle?: { favoriteFormation?: string } };
}

function countrySignal(country: string) {
  const lower = country.toLowerCase();
  if (lower.includes('spain') || lower.includes('espa')) return 'ES';
  if (lower.includes('germany') || lower.includes('alem')) return 'DE';
  if (lower.includes('france') || lower.includes('fran')) return 'FR';
  if (lower.includes('italy') || lower.includes('ital')) return 'IT';
  if (lower.includes('england') || lower.includes('ingl')) return 'EN';
  if (lower.includes('portugal') || lower.includes('portu')) return 'PT';
  if (lower.includes('netherlands') || lower.includes('holanda')) return 'NL';
  if (lower.includes('brazil') || lower.includes('brasil')) return 'BR';
  if (lower.includes('argentina')) return 'AR';
  return country.slice(0, 2).toUpperCase();
}

export function WorldPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const [competitions, setCompetitions]             = useState<CompetitionRow[]>([]);
  const [selectedCountry, setSelectedCountry]       = useState<string | null>(null);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<number | null>(null);
  const [competition, setCompetition]               = useState<any>(null);
  const [clubs, setClubs]                           = useState<ClubRow[]>([]);
  const [query, setQuery]                           = useState('');
  const [loading, setLoading]                       = useState(true);
  const [sectionLoading, setSectionLoading]         = useState(false);
  const [activeTrophy, setActiveTrophy]             = useState<string | null>(null);

  // Carga lista de competiciones
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      worldApi.competitions().catch(() => ({ competitions: [] })),
    ]).then(([competitionsData]) => {
      if (cancelled) return;
      setCompetitions(competitionsData?.competitions ?? []);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Carga datos de competición seleccionada
  useEffect(() => {
    if (!selectedCompetitionId) { setCompetition(null); setClubs([]); return; }
    let cancelled = false;
    setSectionLoading(true);
    Promise.all([
      worldApi.competition(selectedCompetitionId).catch(() => null),
      worldApi.clubs({ competitionId: selectedCompetitionId, take: 50 }).catch(() => []),
    ]).then(([compData, clubRows]) => {
      if (cancelled) return;
      setCompetition(compData);
      setClubs(clubRows);
    }).finally(() => { if (!cancelled) setSectionLoading(false); });
    return () => { cancelled = true; };
  }, [selectedCompetitionId]);

  // Búsqueda de clubs con debounce
  useEffect(() => {
    if (!selectedCompetitionId) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      worldApi.clubs({ competitionId: selectedCompetitionId, q: query.trim() || undefined, take: 50 })
        .then((rows) => { if (!cancelled) setClubs(rows); })
        .catch(() => { if (!cancelled) setClubs([]); });
    }, 220);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [query, selectedCompetitionId]);

  const tableRows: TableRow[] = competition?.table ?? [];
  const selectedComp = useMemo(
    () => competitions.find(c => c.id === selectedCompetitionId),
    [competitions, selectedCompetitionId],
  );

  const countries = useMemo(() => Array.from(new Set(competitions.map(c => c.country))).filter(Boolean).sort(), [competitions]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-80px)] items-center justify-center">
        <div className="text-center animate-pulse">
          <Globe2 className="mx-auto mb-4 text-[var(--green-primary)]" size={56} />
          <p className="font-display tracking-widest text-sm text-[var(--text-muted)] uppercase">{t('Cargando base de datos mundial...')}</p>
        </div>
      </div>
    );
  }

  return (
    <>
    {activeTrophy && (
      <TrophyModal type={activeTrophy} onClose={() => setActiveTrophy(null)} />
    )}
    <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--border-color)] bg-[var(--bg-surface)]/80 backdrop-blur-md shadow-2xl min-h-[calc(100vh-120px)] flex flex-col md:flex-row max-h-[calc(100vh-88px)] mx-4 my-3">

      <div className="w-full md:w-1/3 md:min-w-[300px] border-b-2 md:border-b-0 md:border-r-2 border-[var(--border-color)] bg-[var(--bg-base)]/50 flex flex-col z-20">
        <CompetitionsHubPanel
          competitions={competitions}
          selectedCountry={selectedCountry}
          selectedCompetitionId={selectedCompetitionId}
          onSelectCountry={setSelectedCountry}
          onSelectCompetition={setSelectedCompetitionId}
          onOpenTrophy={setActiveTrophy}
          countrySignal={countrySignal}
        />
      </div>

      {/* ── PANEL DERECHO: contenido ──────────────────────────────────────────── */}
      <div className="flex-1 bg-gradient-to-br from-[var(--bg-base)] to-[var(--bg-surface)] relative overflow-hidden flex flex-col">
        {/* MAPA SIEMPRE DE FONDO */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-1000 ${selectedCompetitionId ? 'opacity-30 pointer-events-none scale-[0.85] blur-[2px]' : 'opacity-100 z-10'}`}>
          <WorldMapPolitical
            activeCountries={countries}
            selectedCountry={selectedCountry}
            onCountrySelect={setSelectedCountry}
          />
          {!selectedCompetitionId && (
            <div className="absolute top-12 pointer-events-none text-center">
              <h2 className="font-display text-4xl font-black italic tracking-widest text-white uppercase mb-2 drop-shadow-xl">{t('MODO EXPLORADOR')}</h2>
              <p className="text-sm text-gray-300 max-w-sm mx-auto drop-shadow-md">{t('Selecciona un país en el mapa o en el menú para consultar sus competiciones y clubes.')}</p>
            </div>
          )}
        </div>

        {/* CONTENIDO DE LA LIGA */}
        {selectedCompetitionId && (
          <div className="relative z-20 flex-1 overflow-y-auto p-8">
            <div className="animate-in fade-in slide-in-from-right-8 duration-500 bg-[var(--bg-base)]/80 backdrop-blur-lg rounded-2xl border border-[var(--border-color)] p-6 shadow-2xl">
              {sectionLoading ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
                  <Loader2 className="animate-spin text-[var(--green-primary)] mb-4" size={40} />
                  <span className="font-mono text-xs text-[var(--text-muted)]">{t('CARGANDO DATOS...')}</span>
                </div>
              ) : (
                <div className="space-y-8">
                {/* Header */}
                <div className="flex flex-col gap-2 md:flex-row md:items-end justify-between pb-4 border-b border-[var(--border-color)]/50">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded shadow-inner text-[10px] font-mono font-black text-[var(--gold-accent)] mb-3 tracking-widest">
                      <MapPin size={12} /> {selectedComp?.country}
                    </div>
                    <h2 className="text-4xl font-display font-black italic tracking-wider uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                      {selectedComp?.name}
                    </h2>
                  </div>
                  <button
                    onClick={() => navigate(`/competition/${selectedCompetitionId}`)}
                    className="flex items-center gap-3 bg-[var(--green-primary)] text-black px-6 py-3 font-display font-black italic uppercase tracking-widest text-sm shadow-[0_0_20px_var(--green-primary)] hover:scale-105 transition-transform"
                    style={{ clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)' }}
                  >
                    <Swords size={16} /> {t('Ver Competición')} <ChevronRight size={16} className="animate-pulse" />
                  </button>
                </div>

                {/* Clasificación */}
                <div className="bg-[var(--bg-elevated)] border-2 border-[var(--border-color)] rounded-xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                  <div className="px-5 py-4 border-b-2 border-[var(--border-color)] bg-black/60 flex items-center justify-between">
                    <h3 className="font-bold text-sm uppercase tracking-wider">{t('Clasificación')}</h3>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--gold-accent)] bg-[var(--gold-accent)]/10 px-2 py-1 rounded">
                      {t('JORNADA ACTUAL')}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-black/40 text-[var(--text-muted)] font-mono text-[10px] uppercase text-center border-b border-[var(--border-color)] tracking-widest">
                          <th className="px-4 py-3 text-left">{t('POS')}</th>
                          <th className="px-4 py-3 text-left">{t('CLUB')}</th>
                          <th className="px-3 py-3">{t('PJ')}</th>
                          <th className="px-3 py-3">{t('G')}</th>
                          <th className="px-3 py-3">{t('E')}</th>
                          <th className="px-3 py-3">{t('P')}</th>
                          <th className="px-3 py-3">{t('GD')}</th>
                          <th className="px-4 py-3 font-black text-[var(--gold-accent)]">{t('PTS')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map(row => (
                          <tr key={row.club.id} className="border-b border-[var(--border-color)]/30 hover:bg-white/5 transition-colors group">
                            <td className="px-4 py-4 text-left font-mono font-bold text-[var(--text-muted)] group-hover:text-white transition-colors">{row.position}</td>
                            <td className="px-4 py-4 text-left">
                              <div className="flex items-center gap-3">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-black/30 rounded-full border border-white/5">
                                  <ClubBadge id={row.club.id} name={row.club.name} badge={(row.club as any).badge} primaryColor={(row.club as any).primaryColor} secondaryColor={(row.club as any).secondaryColor} size={20} />
                                </span>
                                <div className="flex flex-col gap-0.5">
                                  <div className="font-bold text-sm whitespace-nowrap group-hover:text-[var(--green-primary)] transition-colors">
                                    <ClubLink id={row.club.id} name={row.club.shortName || row.club.name} />
                                  </div>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    {row.club.manager
                                      ? row.club.manager.name
                                      : row.club.npcCoach
                                        ? <NpcCoachIdentity npcCoach={row.club.npcCoach} size={16} compact showFormation={false} />
                                        : null}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-4 text-center font-mono text-xs text-[var(--text-muted)]">{row.played}</td>
                            <td className="px-3 py-4 text-center font-mono text-xs text-[var(--green-primary)]">{row.won}</td>
                            <td className="px-3 py-4 text-center font-mono text-xs text-[var(--text-muted)]">{row.drawn}</td>
                            <td className="px-3 py-4 text-center font-mono text-xs text-[var(--red-danger)]">{row.lost}</td>
                            <td className="px-3 py-4 text-center font-mono text-xs text-[var(--text-muted)]">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                            <td className="px-4 py-4 text-center font-black text-lg text-[var(--gold-accent)] drop-shadow-sm">{row.points}</td>
                          </tr>
                        ))}
                        {tableRows.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)] font-mono text-xs uppercase">{t('Aún no hay datos de clasificación')}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Clubs */}
                {clubs.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-display text-xs uppercase tracking-widest text-[var(--text-muted)]">{t('Facciones Activas')} ({selectedComp?.clubCount ?? clubs.length})</h3>
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={t('Buscar...')}
                          className="w-28 bg-[var(--bg-base)] border border-[var(--border-color)] rounded-full py-1.5 pl-7 pr-3 text-[10px] uppercase text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--green-primary)] outline-none transition-colors"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {clubs.map(club => {
                        const tableEntry = tableRows.find(tr => tr.club.id === club.id);
                        return (
                          <div key={club.id} className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] hover:border-[var(--green-primary)]/50 transition-colors shadow-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 flex items-center justify-center bg-[var(--bg-base)] rounded-full border border-[var(--border-color)]">
                                <ClubBadge id={club.id} name={club.name} badge={(club as any).badge} primaryColor={(club as any).primaryColor} secondaryColor={(club as any).secondaryColor} size={20} />
                              </div>
                              <div>
                                <p className="text-[11px] font-bold text-[var(--text-primary)] uppercase leading-tight">
                                  <ClubLink id={club.id} name={club.shortName || club.name} />
                                </p>
                                <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{club.city}</p>
                                <p className="text-[9px] text-[var(--text-muted)] mt-0.5 font-bold">
                                  {club.manager
                                    ? club.manager.name
                                    : club.npcCoach
                                      ? <NpcCoachIdentity npcCoach={club.npcCoach} size={14} compact showFormation={false} />
                                      : null}
                                </p>
                              </div>
                            </div>
                            {tableEntry && (
                              <span className="bg-[var(--bg-base)] text-[var(--green-primary)] border border-[var(--green-primary)]/20 px-2 py-0.5 rounded text-[10px] font-bold shrink-0">
                                #{tableEntry.position}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </div>
    </>
  );
}
