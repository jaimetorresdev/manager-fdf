import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { publicApi } from '../../api/client';
import { Globe2, ChevronRight, Trophy, Loader2, MapPin, Award, Medal, Swords } from 'lucide-react';
import { ClubBadge } from '../ui';
import { countryFlag } from './countryCoords';
import { cn } from '../../lib/cn';
import { useNavigate } from 'react-router-dom';
import { WorldMapPolitical } from './WorldMapPolitical';

interface Competition {
  id: number;
  name: string;
  shortName: string;
  country: string;
  tier: number;
  type?: string; // 'league' | 'cup' | 'supercup'
}

const isCup = (c: Competition) => c.type === 'cup' || c.type === 'supercup';

function compMeta(type?: string) {
  switch (type) {
    case 'cup': return { icon: Award, label: 'Copa nacional', color: 'var(--teal-accent)' };
    case 'supercup': return { icon: Medal, label: 'Supercopa', color: 'var(--violet-accent)' };
    default: return { icon: Trophy, label: 'Liga', color: 'var(--gold-accent)' };
  }
}

export function WorldExplorer() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);

  const [leagueData, setLeagueData] = useState<any>(null);
  const [leagueLoading, setLeagueLoading] = useState(false);

  useEffect(() => {
    publicApi.standings().then(res => {
      setLeagues(res?.leagues || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedLeagueId) {
      setLeagueLoading(true);
      publicApi.standings(selectedLeagueId).then(res => {
        setLeagueData(res);
        setLeagueLoading(false);
      }).catch(() => setLeagueLoading(false));
    }
  }, [selectedLeagueId]);

  const compCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of leagues) m.set(c.country, (m.get(c.country) ?? 0) + 1);
    return m;
  }, [leagues]);
  const countryComps = useMemo(() => leagues.filter(l => l.country === selectedCountry), [leagues, selectedCountry]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-[var(--text-muted)]">
        <Loader2 className="animate-spin mb-4 text-[var(--green-primary)]" size={32} />
        <p className="font-mono-retro">{t('worldExplorer.loading')}</p>
      </div>
    );
  }

  const countries = Array.from(new Set(leagues.map(l => l.country))).sort();
  const ligas = countryComps.filter(c => !isCup(c)).sort((a, b) => a.tier - b.tier);
  const copas = countryComps.filter(isCup).sort((a, b) => (a.type === 'cup' ? 0 : 1) - (b.type === 'cup' ? 0 : 1));
  const selectedComp = leagues.find(c => c.id === selectedLeagueId) ?? (leagueData?.league as Competition | undefined);
  const selectedIsCup = !!selectedComp && isCup(selectedComp);

  const CompRow = ({ c }: { c: Competition }) => {
    const meta = compMeta(c.type);
    const Icon = meta.icon;
    const active = selectedLeagueId === c.id;
    return (
      <button
        onClick={() => setSelectedLeagueId(c.id)}
        className={cn(
          'w-full text-left px-4 py-3.5 rounded-xl transition-all duration-200 flex items-center justify-between border group',
          active
            ? 'bg-gradient-to-r from-[var(--green-primary)]/20 to-transparent border-[var(--green-primary)] text-white shadow-[0_0_20px_rgba(34,197,94,0.18)]'
            : 'hover:bg-white/5 border-white/5 text-[var(--text-muted)] hover:text-white bg-black/30 hover:border-white/20',
        )}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="grid place-items-center w-9 h-9 rounded-lg border shrink-0" style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${meta.color} 30%, transparent)` }}>
            <Icon size={17} style={{ color: meta.color }} />
          </span>
          <div className="min-w-0">
            <div className="font-bold text-[14px] tracking-wide truncate">{c.name}</div>
            <div className="text-[10px] uppercase tracking-widest font-mono" style={{ color: meta.color }}>{compMeta(c.type).label}</div>
          </div>
        </div>
        <ChevronRight size={17} className={active ? 'text-[var(--green-primary)]' : 'opacity-40 group-hover:opacity-90 group-hover:translate-x-0.5 transition-all'} />
      </button>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[var(--green-primary)]/30 bg-[#051024] shadow-[0_0_50px_rgba(34,197,94,0.1)] min-h-[600px] flex max-h-[750px] group">
      <div className="absolute inset-0 z-0 opacity-80 mix-blend-screen pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, transparent 30%, #000 100%), repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,197,94,0.03) 2px, rgba(34,197,94,0.03) 4px)' }} />
      <div className="absolute inset-0 z-0">
        <WorldMapPolitical
          activeCountries={countries}
          selectedCountry={selectedCountry}
          onCountrySelect={(c) => setSelectedCountry(c)}
        />
      </div>

      <div className="w-[380px] border-r border-[var(--green-primary)]/20 bg-black/70 backdrop-blur-xl flex flex-col z-10 shadow-[20px_0_50px_rgba(0,0,0,0.5)]">
        <div className="p-6 border-b border-[var(--green-primary)]/20 flex items-center gap-4 bg-gradient-to-r from-[var(--green-primary)]/10 to-transparent relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[var(--green-primary)] shadow-[0_0_15px_var(--green-primary)]" />
          <Globe2 className="text-[var(--green-primary)] w-8 h-8 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
          <h3 className="font-display font-black text-2xl tracking-widest uppercase text-white drop-shadow-lg">{t('worldExplorer.title')}</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {!selectedCountry ? (
            <>
              <div className="px-2 mb-4 flex items-center gap-2 text-xs font-mono font-bold text-[var(--gold-accent)] uppercase tracking-widest bg-[var(--gold-accent)]/10 py-2 rounded border border-[var(--gold-accent)]/20">
                <span className="w-2 h-2 rounded-full bg-[var(--gold-accent)] animate-pulse" />
                {t('worldExplorer.activeCountries')}
              </div>
              {countries.map(country => (
                <button
                  key={country}
                  onClick={() => setSelectedCountry(country)}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-[var(--green-primary)]/15 transition-all duration-200 flex items-center justify-between group border border-transparent hover:border-[var(--green-primary)]/50 hover:shadow-[0_0_20px_rgba(34,197,94,0.15)] bg-black/30"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="text-2xl leading-none w-8 text-center drop-shadow">{countryFlag(country)}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-[15px] text-white/85 group-hover:text-white tracking-wide truncate transition-colors">{country}</div>
                      <div className="text-[10px] uppercase tracking-widest font-mono text-[var(--text-muted)]">{compCount.get(country) ?? 0} {t('worldExplorer.competitions', 'competiciones')}</div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-[var(--text-muted)] group-hover:text-[var(--green-primary)] group-hover:translate-x-1 transition-all shrink-0" />
                </button>
              ))}
            </>
          ) : (
            <>
              <button
                onClick={() => { setSelectedCountry(null); setSelectedLeagueId(null); }}
                className="w-full text-left px-4 py-3 mb-4 text-xs font-mono font-bold text-[var(--text-muted)] hover:text-white hover:bg-white/5 rounded-lg uppercase flex items-center gap-3 group transition-all"
              >
                <div className="p-1.5 bg-black/50 rounded border border-white/10 group-hover:border-[var(--green-primary)]/50 transition-colors">
                  <ChevronRight size={14} className="rotate-180 group-hover:text-[var(--green-primary)] transition-colors" />
                </div>
                {t('worldExplorer.backToCountries')}
              </button>
              <div className="px-2 py-3 mb-5 flex items-center gap-3 border-b border-[var(--green-primary)]/30 pb-4">
                <span className="text-4xl leading-none drop-shadow">{countryFlag(selectedCountry)}</span>
                <div>
                  <div className="text-3xl font-black italic text-white leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.25)]">{selectedCountry}</div>
                  <div className="text-[10px] uppercase tracking-widest font-mono text-[var(--text-muted)] mt-1">{countryComps.length} {t('worldExplorer.competitions', 'competiciones')}</div>
                </div>
              </div>

              {ligas.length > 0 && (
                <div className="mb-5">
                  <div className="px-1 mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--gold-accent)] flex items-center gap-2">
                    <Trophy size={12} /> {t('worldExplorer.leagues', 'Ligas')}
                  </div>
                  <div className="space-y-2">{ligas.map(c => <CompRow key={c.id} c={c} />)}</div>
                </div>
              )}

              {copas.length > 0 && (
                <div className="mb-2">
                  <div className="px-1 mb-2 text-[10px] font-black uppercase tracking-widest text-[var(--teal-accent)] flex items-center gap-2">
                    <Award size={12} /> {t('worldExplorer.cups', 'Copas')}
                  </div>
                  <div className="space-y-2">{copas.map(c => <CompRow key={c.id} c={c} />)}</div>
                </div>
              )}

              {countryComps.length === 0 && (
                <p className="text-sm text-[var(--text-muted)] text-center py-8 font-mono">{t('worldExplorer.noCompetitions', 'Sin competiciones públicas.')}</p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex-1 p-8 relative overflow-y-auto z-10 flex flex-col justify-end pointer-events-none">
        {selectedLeagueId && (
          <div className="animate-in fade-in slide-in-from-right-8 duration-500 pointer-events-auto bg-[#0b1120]/90 backdrop-blur-2xl border border-[var(--green-primary)]/30 p-8 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_0_30px_rgba(34,197,94,0.05)] max-h-[90%] overflow-y-auto">
            {leagueLoading ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
                <Loader2 className="animate-spin text-[var(--green-primary)] mb-6 drop-shadow-[0_0_15px_var(--green-primary)]" size={48} />
                <span className="font-mono text-sm text-[var(--green-primary)] tracking-widest uppercase animate-pulse">{t('worldExplorer.loadingData')}</span>
              </div>
            ) : leagueData ? (
              <div>
                <div className="flex flex-col gap-4 md:flex-row md:items-end justify-between mb-8 pb-6 border-b border-white/10">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-black/50 border border-[var(--gold-accent)]/30 rounded text-xs font-mono font-black text-[var(--gold-accent)] mb-4 tracking-widest shadow-[0_0_10px_rgba(255,215,0,0.1)]">
                      <MapPin size={14} /> {selectedCountry}
                    </div>
                    <h2 className="text-4xl md:text-5xl font-display font-black italic tracking-wider uppercase drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)] text-white">
                      {leagueData.league?.name}
                    </h2>
                  </div>
                  <div className="bg-black/60 p-4 rounded-xl border border-white/10 shadow-inner">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">{t('worldExplorer.competition', 'Competición')}</div>
                    <div className="text-xl font-black flex items-center gap-3" style={{ color: compMeta(selectedComp?.type).color }}>
                      <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: compMeta(selectedComp?.type).color }} />
                      {compMeta(selectedComp?.type).label}
                    </div>
                  </div>
                </div>

                {selectedIsCup ? (
                  <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-10 shadow-2xl flex flex-col items-center text-center gap-4">
                    {(() => { const M = compMeta(selectedComp?.type); const I = M.icon; return (
                      <span className="grid place-items-center w-20 h-20 rounded-2xl border-2" style={{ background: `color-mix(in srgb, ${M.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${M.color} 40%, transparent)` }}>
                        <I size={40} style={{ color: M.color }} />
                      </span>
                    ); })()}
                    <div className="text-xs font-black uppercase tracking-[3px]" style={{ color: compMeta(selectedComp?.type).color }}>{compMeta(selectedComp?.type).label}</div>
                    <p className="text-sm text-[var(--text-muted)] max-w-md leading-relaxed">
                      {selectedComp?.type === 'supercup'
                        ? t('worldExplorer.supercupDesc', 'Título a un solo partido entre el campeón de Liga y el de Copa al arrancar la temporada.')
                        : t('worldExplorer.cupDesc', 'Torneo nacional por eliminatorias: cualquier club puede ganarla. No tiene clasificación, se decide a partido directo.')}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-[var(--text-muted)] mt-1">
                      <Swords size={14} className="text-[var(--green-primary)]" /> {t('worldExplorer.knockout', 'Eliminatoria directa')}
                    </div>
                  </div>
                ) : (
                <div className="bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                  <div className="px-6 py-5 border-b border-white/10 bg-black/50 flex items-center justify-between">
                    <h3 className="font-display font-black text-lg uppercase tracking-widest text-white/90">{t('worldExplorer.publicStandings')}</h3>
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#000] bg-[var(--gold-accent)] px-3 py-1.5 rounded-md shadow-[0_0_15px_rgba(255,215,0,0.4)]">
                      {t('worldExplorer.currentMatchday')}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-black/80 text-[var(--text-muted)] font-mono text-[11px] uppercase border-b border-white/10 tracking-widest">
                          <th className="px-6 py-4 text-left">{t('worldExplorer.columns.pos')}</th>
                          <th className="px-6 py-4 text-left">{t('worldExplorer.columns.club')}</th>
                          <th className="px-4 py-4 text-center">{t('worldExplorer.columns.played')}</th>
                          <th className="px-4 py-4 text-center">{t('worldExplorer.columns.won')}</th>
                          <th className="px-4 py-4 text-center">{t('worldExplorer.columns.drawn')}</th>
                          <th className="px-4 py-4 text-center">{t('worldExplorer.columns.lost')}</th>
                          <th className="px-6 py-4 text-center font-black text-[var(--gold-accent)]">{t('worldExplorer.columns.points')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leagueData.table?.map((row: any) => (
                          <tr key={row.club.id} className="border-b border-white/5 hover:bg-white/5 transition-all duration-200 group">
                            <td className="px-6 py-5 text-left font-mono font-bold text-[var(--text-muted)] group-hover:text-white">{row.pos}</td>
                            <td className="px-6 py-5 text-left">
                              <div className="flex items-center gap-4">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-black/50 rounded-lg border border-white/10 shadow-inner group-hover:border-white/30 transition-colors">
                                  <ClubBadge id={row.club.id} name={row.club.name} badge={(row.club as any).badge} primaryColor={(row.club as any).primaryColor} secondaryColor={(row.club as any).secondaryColor} size={24} />
                                </span>
                                <div>
                                  <div className="font-bold text-[15px] whitespace-nowrap text-white/90 group-hover:text-[var(--green-primary)] transition-colors">{row.club.shortName || row.club.name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-5 text-center font-mono text-sm text-[var(--text-muted)]">{row.played}</td>
                            <td className="px-4 py-5 text-center font-mono text-sm text-[var(--green-primary)]">{row.won}</td>
                            <td className="px-4 py-5 text-center font-mono text-sm text-[var(--text-muted)]">{row.drawn}</td>
                            <td className="px-4 py-5 text-center font-mono text-sm text-[var(--red-danger)]">{row.lost}</td>
                            <td className="px-6 py-5 text-center font-mono font-black text-xl text-[var(--gold-accent)] drop-shadow-[0_0_10px_rgba(255,215,0,0.2)]">{row.points}</td>
                          </tr>
                        ))}
                        {(!leagueData.table || leagueData.table.length === 0) && (
                          <tr>
                            <td colSpan={7} className="px-6 py-12 text-center text-[var(--text-muted)] font-mono text-sm">{t('worldExplorer.noStandings')}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => navigate('/register')}
                    className="relative overflow-hidden group flex items-center gap-4 bg-[var(--green-primary)] text-black px-10 py-5 font-display font-black italic uppercase tracking-[4px] text-lg shadow-[0_0_30px_rgba(34,197,94,0.4)] transition-all hover:scale-105 hover:shadow-[0_0_50px_rgba(34,197,94,0.6)]"
                    style={{ clipPath: 'polygon(20px 0, 100% 0, calc(100% - 20px) 100%, 0 100%)' }}
                  >
                    <span className="relative z-10">{t('worldExplorer.compete')}</span>
                    <ChevronRight size={24} className="relative z-10 animate-pulse" />
                    <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:animate-[shimmer_1s_infinite]" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-[var(--red-danger)] font-mono font-bold mt-12 border border-[var(--red-danger)]/30 bg-[var(--red-danger)]/10 p-8 rounded-xl shadow-[0_0_20px_rgba(239,68,68,0.2)]">{t('worldExplorer.loadError')}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
