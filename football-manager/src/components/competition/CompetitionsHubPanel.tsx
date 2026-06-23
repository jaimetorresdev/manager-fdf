// ─── CompetitionsHubPanel — árbol unificado I-38 ───────────────────────────────
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Trophy, Radio, Calendar, Swords, ChevronRight, Globe2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface HubCompetition {
  id: number;
  name: string;
  country: string;
  type: string;
}

const QUICK_LINK_DEFS = [
  { to: '/league', key: 'league', icon: Trophy },
  { to: '/live', key: 'live', icon: Radio },
  { to: '/calendar', key: 'calendar', icon: Calendar },
  { to: '/matches', key: 'matches', icon: Swords },
] as const;

const EURO_TROPHIES = [
  { id: 'champions', key: 'champions', match: /champions|ucl/i },
  { id: 'europa', key: 'europa', match: /europa(?!.*conference)|uel/i },
  { id: 'conference', key: 'conference', match: /conference|uecl/i },
] as const;

interface Props {
  competitions: HubCompetition[];
  selectedCountry: string | null;
  selectedCompetitionId: number | null;
  onSelectCountry: (country: string | null) => void;
  onSelectCompetition: (id: number | null) => void;
  onOpenTrophy: (id: string) => void;
  countrySignal: (country: string) => string;
}

export function CompetitionsHubPanel({
  competitions,
  selectedCountry,
  selectedCompetitionId,
  onSelectCountry,
  onSelectCompetition,
  onOpenTrophy,
  countrySignal,
}: Props) {
  const { t } = useTranslation();
  const countries = Array.from(new Set(competitions.map(c => c.country))).sort();

  const compTypeLabel = (type: string) => {
    const tt = type.toLowerCase();
    if (tt.includes('euro') || tt.includes('continental')) return t('gameplay:competitionsHub.types.european');
    if (tt.includes('cup') || tt.includes('copa')) return t('gameplay:competitionsHub.types.cup');
    if (tt.includes('league') || tt.includes('liga')) return t('gameplay:competitionsHub.types.league');
    return t('gameplay:competitionsHub.types.other');
  };

  const groupByType = (comps: HubCompetition[]) => {
    const groups = new Map<string, HubCompetition[]>();
    for (const c of comps) {
      const key = compTypeLabel(c.type);
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    return [...groups.entries()];
  };

  const europeanComps = competitions.filter(c =>
    EURO_TROPHIES.some(tr => tr.match.test(c.name)) || c.type.toLowerCase().includes('euro')
  );

  const countryComps = selectedCountry
    ? competitions.filter(c => c.country === selectedCountry)
    : [];

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b-2 border-[var(--border-color)] flex items-center gap-2 bg-black/30">
        <Globe2 className="text-[var(--green-primary)]" />
        <h3 className="font-display font-black text-lg italic tracking-wider uppercase">{t('gameplay:competitionsHub.title')}</h3>
      </div>

      <div className="p-3 border-b border-[var(--border-color)]/50 space-y-2">
        <p className="text-[9px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest px-1">{t('gameplay:competitionsHub.quickAccess')}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK_LINK_DEFS.map(({ to, key, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-[var(--bg-elevated)] border border-[var(--border-color)] hover:border-[var(--green-primary)]/50 hover:text-[var(--green-primary)] transition-colors"
            >
              <Icon size={12} />
              {t(`gameplay:competitionsHub.links.${key}`)}
            </Link>
          ))}
        </div>
      </div>

      <div className="p-3 border-b border-[var(--border-color)]/50">
        <p className="text-[9px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest px-1 mb-2">{t('gameplay:competitionsHub.european')}</p>
        <div className="flex flex-wrap gap-1.5">
          {EURO_TROPHIES.map(tr => {
            const comp = europeanComps.find(c => tr.match.test(c.name));
            return (
              <button
                key={tr.id}
                type="button"
                onClick={() => {
                  if (comp) {
                    onSelectCountry(comp.country);
                    onSelectCompetition(comp.id);
                  } else {
                    onOpenTrophy(tr.id);
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-[var(--bg-elevated)] border border-[var(--border-color)] hover:border-[var(--gold-accent)] transition-colors"
              >
                <Trophy size={11} className="text-[var(--gold-accent)]" />
                {t(`gameplay:competitionsHub.trophies.${tr.key}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {!selectedCountry ? (
          <>
            <p className="px-2 py-1 mb-1 text-[9px] font-mono font-bold text-[var(--text-muted)] uppercase tracking-widest">{t('gameplay:competitionsHub.byCountry')}</p>
            {countries.map(country => (
              <button
                key={country}
                type="button"
                onClick={() => onSelectCountry(country)}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--green-primary)]/10 transition-colors flex items-center justify-between group border border-transparent hover:border-[var(--green-primary)]/30"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-color)]">
                    {countrySignal(country)}
                  </span>
                  <span className="font-bold text-sm group-hover:text-[var(--green-primary)]">{country}</span>
                </div>
                <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-[var(--green-primary)]" />
              </button>
            ))}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { onSelectCountry(null); onSelectCompetition(null); }}
              className="w-full text-left px-3 py-2 mb-2 text-[10px] font-mono font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] uppercase flex items-center gap-1"
            >
              <ChevronRight size={12} className="rotate-180" /> {t('gameplay:competitionsHub.countries')}
            </button>
            <p className="px-3 py-1 mb-2 text-lg font-black italic border-b border-[var(--border-color)] pb-2">{selectedCountry}</p>
            {groupByType(countryComps).map(([group, comps]) => (
              <div key={group} className="mb-3">
                <p className="px-3 py-1 text-[9px] font-mono text-[var(--text-muted)] uppercase tracking-widest">{group}</p>
                {comps.sort((a, b) => a.name.localeCompare(b.name)).map(comp => (
                  <button
                    key={comp.id}
                    type="button"
                    onClick={() => onSelectCompetition(comp.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center justify-between border mb-1',
                      selectedCompetitionId === comp.id
                        ? 'bg-[var(--accent-soft)] border-[var(--green-primary)] text-[var(--green-primary)]'
                        : 'hover:bg-[var(--green-primary)]/10 border-[var(--border-color)] bg-[var(--bg-elevated)]'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Trophy size={14} className={selectedCompetitionId === comp.id ? 'text-[var(--green-primary)]' : 'text-[var(--gold-accent)]'} />
                      <span className="font-bold text-xs truncate">{comp.name}</span>
                    </div>
                    {selectedCompetitionId === comp.id && <ChevronRight size={14} />}
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
