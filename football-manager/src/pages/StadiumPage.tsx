import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { stadiumApi } from '../api/client';
import toast from 'react-hot-toast';

function formatMoney(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M €`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K €`;
  return `${amount} €`;
}
import { AlertTriangle, Building2, Car, GraduationCap, Armchair, Crown, Users, Info, Loader2, PlaySquare } from 'lucide-react';

const assistanceTable = [
  { range: '> 90%',  bonus: '+3 constr, +3 destr', condition: '>90%' },
  { range: '75–90%', bonus: '+2 constr, +2 destr', condition: '75-90%' },
  { range: '50–75%', bonus: '+1 constr, +1 destr', condition: '50-75%' },
  { range: '25–50%', bonus: 'Sin bonificación',               condition: '25-50%' },
  { range: '< 25%',  bonus: '−1 constr, −1 destr', condition: '<25%' },
];

const typeIcons: Record<string, any> = {
  capacity: Building2,
  seats: Armchair,
  boxes: Crown,
  parking: Car,
  sportsCity: GraduationCap,
};

const typeColors: Record<string, string> = {
  capacity: 'blue',
  seats: 'green',
  boxes: 'gold',
  parking: 'purple',
  sportsCity: 'teal',
  north: 'blue',
  south: 'blue',
  east: 'green',
  west: 'green',
};

const SECTOR_LABELS: Record<string, string> = {
  north: 'Grada norte',
  south: 'Grada sur',
  east: 'Grada este',
  west: 'Grada oeste',
};

const FACILITY_LABELS: Record<string, string> = {
  seats: 'Asientos',
  boxes: 'Palcos VIP',
  parking: 'Aparcamiento',
  sportsCity: 'Ciudad deportiva',
  capacity: 'Capacidad',
};

function upgradeWorkKey(type: string, slot?: number | null): string {
  if (slot != null) return `${type}:${slot}`;
  if (['north', 'south', 'east', 'west'].includes(type)) return `sector:${type}`;
  return type;
}

function workLabel(work: { type?: string; workKey?: string; label?: string }): string {
  if (work.label) return work.label;
  const key = work.workKey ?? work.type ?? '';
  if (key.startsWith('sector:')) {
    const sector = key.slice(7);
    return SECTOR_LABELS[sector] ?? `Sector ${sector}`;
  }
  const colon = key.indexOf(':');
  if (colon > 0) {
    const fac = key.slice(0, colon);
    const slot = Number(key.slice(colon + 1));
    const facLabel = FACILITY_LABELS[fac] ?? fac;
    const standNames = ['Fondo norte', 'Fondo sur', 'Preferencia', 'Lateral'];
    if (fac === 'seats' && standNames[slot]) return `${facLabel} · ${standNames[slot]}`;
    return `${facLabel} (nivel ${slot + 1})`;
  }
  if (SECTOR_LABELS[key]) return SECTOR_LABELS[key];
  return FACILITY_LABELS[key] ?? key;
}

function workMatchesUpgrade(work: { type?: string; workKey?: string }, upgradeKey: string): boolean {
  const wKey = work.workKey ?? work.type ?? '';
  return wKey === upgradeKey;
}

const colorMap: Record<string, { bg: string; text: string; bar: string; btnBg: string; btnText: string; broadcastBorder: string }> = {
  blue:   { bg: 'bg-[#1e3a8a]', text: 'text-[#60a5fa]', bar: 'bg-[#3b82f6]', btnBg: 'bg-[#2563eb] border border-[#3b82f6]', btnText: 'text-white', broadcastBorder: 'border-l-[#3b82f6]' },
  green:  { bg: 'bg-[#14532d]', text: 'text-[#4ade80]', bar: 'bg-[#22c55e]', btnBg: 'bg-[#16a34a] border border-[#22c55e]', btnText: 'text-white', broadcastBorder: 'border-l-[#22c55e]' },
  gold:   { bg: 'bg-[#78350f]', text: 'text-[#fbbf24]', bar: 'bg-[#f59e0b]', btnBg: 'bg-[#d97706] border border-[#f59e0b]', btnText: 'text-white', broadcastBorder: 'border-l-[#f59e0b]' },
  purple: { bg: 'bg-[#4c1d95]', text: 'text-[#c084fc]', bar: 'bg-[#a855f7]', btnBg: 'bg-[#9333ea] border border-[#a855f7]', btnText: 'text-white', broadcastBorder: 'border-l-[#a855f7]' },
  teal:   { bg: 'bg-[#134e4a]', text: 'text-[#2dd4bf]', bar: 'bg-[#14b8a6]', btnBg: 'bg-[#0d9488] border border-[#14b8a6]', btnText: 'text-white', broadcastBorder: 'border-l-[#14b8a6]' },
};

// Realistic Broadcast View representing the stadium with stands and houses in the background
function StadiumBroadcastView({ occupancyPct = 0, name = "Estadio", capacity = 0 }: { occupancyPct?: number, name?: string, capacity?: number }) {
  const { t } = useTranslation();
  return (
    <div className="relative w-full h-[450px] bg-[#0b1120] border-2 border-[#1e293b] rounded-md overflow-hidden flex items-end shadow-[inset_0_0_60px_rgba(0,0,0,0.8)]">
      {/* Background Image: A realistic stadium with houses/city in background */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 hover:scale-105"
        style={{ 
          backgroundImage: 'url("https://images.unsplash.com/photo-1522778119026-d647f0596c20?q=80&w=2070&auto=format&fit=crop")',
          filter: occupancyPct > 90 ? 'brightness(1.1) contrast(1.15)' : 'brightness(0.85) contrast(1.1)'
        }} 
      />
      
      {/* Floodlights effect */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(255,255,255,0.1),_transparent_40%)]" />
      
      {/* Broadcast overlay bottom bar */}
      <div className="relative z-10 w-full bg-gradient-to-t from-black via-black/80 to-transparent pt-12 pb-4 px-6 flex items-end justify-between">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-[#dc2626] text-white text-[10px] font-black px-2 py-0.5 rounded-sm uppercase tracking-widest flex items-center gap-1 shadow-md">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <span className="text-[#94a3b8] text-xs font-bold uppercase tracking-wider bg-black/60 px-2 py-0.5 rounded-sm backdrop-blur-sm">
              {t('gameplay:stadium.architecture')}
            </span>
          </div>
          <h2 className="text-4xl font-black text-white font-rajdhani uppercase tracking-tight drop-shadow-lg" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.8)' }}>
            {name}
          </h2>
        </div>
        
        <div className="bg-[#0f172a]/90 backdrop-blur-md border border-[#334155] p-3 rounded flex items-center gap-6 shadow-xl">
          <div className="text-center">
            <p className="text-[10px] text-[#94a3b8] font-bold uppercase tracking-widest">{t('gameplay:stadium.capacity')}</p>
            <p className="text-xl font-mono-retro font-bold text-white">{capacity.toLocaleString()}</p>
          </div>
          <div className="w-px h-8 bg-[#334155]" />
          <div className="text-center">
            <p className="text-[10px] text-[#94a3b8] font-bold uppercase tracking-widest">{t('gameplay:stadium.occupancy')}</p>
            <p className="text-xl font-mono-retro font-bold text-[#4ade80]">{occupancyPct}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StadiumPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setError(null);
    try {
      const res = await stadiumApi.get();
      setData(res);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'No se pudo cargar el estadio.');
    } finally {
      setLoading(false);
    }
  };

  const handleWork = async (type: string, slot?: number) => {
    const key = upgradeWorkKey(type, slot);
    setIsSubmitting(key);
    try {
      const res = await stadiumApi.startWork({ type, slot });
      setData(res);
    } catch (err: any) {
      toast.error(err.message || t('gameplay:stadium.workError'));
    } finally {
      setIsSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#0b1120] min-h-[500px] flex items-center justify-center border border-[#1e293b] rounded-lg">
        <div className="text-center">
          <Loader2 size={40} className="mx-auto mb-4 animate-spin text-[#3b82f6]" />
          <p className="text-sm font-bold uppercase tracking-widest text-[#64748b]">{t('gameplay:stadium.loading')}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-[#0b1120] min-h-[500px] flex items-center justify-center border border-[#1e293b] rounded-lg">
        <div className="max-w-md text-center p-8 bg-[#0f172a] border border-[#1e293b] rounded-md shadow-2xl">
          <AlertTriangle className="mx-auto mb-4 text-[#f59e0b]" size={42} />
          <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-2">{t('gameplay:stadium.unavailable')}</h1>
          <p className="text-sm text-[#94a3b8] mb-6">
            {error ?? 'El módulo de estadio todavía no ha devuelto datos.'}
          </p>
          <button
            onClick={loadData}
            className="px-6 py-3 bg-[#3b82f6] text-white font-bold uppercase tracking-widest text-sm rounded hover:bg-[#2563eb] transition-colors shadow-lg"
          >
            {t('gameplay:stadium.retry')}
          </button>
        </div>
      </div>
    );
  }

  const seats: number[] = data.facilities?.seats ?? [];
  const boxes: number[] = data.facilities?.boxes ?? [];
  const parking: number[] = data.facilities?.parking ?? [];
  const sportsCity: number = data.facilities?.sportsCity ?? 0;

  const activeWork = data.works?.active ?? null;
  const queueWorks: any[] = data.works?.queue ?? [];
  const allWorks: any[] = activeWork ? [activeWork, ...queueWorks] : queueWorks;

  const metrics = data.metrics ?? {};
  const homeBonus = metrics.homeBonus ?? { construction: 0, destruction: 0, label: '25-50%' };
  const occupancyPct: number = metrics.occupancyPct ?? 0;
  const attendance: number = metrics.attendance ?? 0;
  const matchdayRevenue: number = metrics.matchdayRevenue ?? 0;

  const availableUpgrades: any[] = data.availableUpgrades ?? [];

  const sections = {
    norte: { name: 'Fondo Norte', capacity: Math.round((data.capacity ?? 0) * 0.23), level: seats[0] ?? 0 },
    sur: { name: 'Fondo Sur', capacity: Math.round((data.capacity ?? 0) * 0.23), level: seats[1] ?? 0 },
    preferencia: { name: 'Preferencia', capacity: Math.round((data.capacity ?? 0) * 0.31), level: seats[2] ?? 0 },
    lateral: { name: 'Lateral', capacity: Math.round((data.capacity ?? 0) * 0.23), level: seats[3] ?? 0 },
  };

  const getAverageLevel = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);

  return (
    <div className="bg-[#0b1120] text-slate-200 min-h-screen p-4 md:p-6 font-sans">
      {/* Broadcast Header */}
      <header className="mb-6 pb-4 border-b-2 border-[#1e293b] flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <PlaySquare size={16} className="text-[#3b82f6]" />
            <span className="text-xs font-bold text-[#3b82f6] uppercase tracking-widest">Estadio Principal</span>
          </div>
          <h1 className="text-3xl font-black font-rajdhani text-white tracking-tight uppercase leading-none">{data.name}</h1>
          <p className="text-sm text-[#94a3b8] mt-2 font-medium">{data.city} · {t('gameplay:stadium.budget')} <strong className="text-[#4ade80] font-mono-retro">{formatMoney(data.budget ?? 0)}</strong></p>
        </div>
      </header>

      {/* Main Broadcast Visual - Realistic Image */}
      <div className="mb-6 shadow-2xl">
        <StadiumBroadcastView occupancyPct={occupancyPct} name={data.name} capacity={data.capacity} />
      </div>

      {/* Realistic Broadcast KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: t('gameplay:stadium.capacity'), value: (data.capacity ?? 0).toLocaleString(), sub: t('gameplay:stadium.overview.spectators'), color: '#3b82f6' },
          { label: t('gameplay:stadium.attendance'), value: attendance.toLocaleString(), sub: t('gameplay:stadium.overview.avgMatch'), color: '#22c55e' },
          { label: t('gameplay:stadium.revenue'),  value: formatMoney(matchdayRevenue), sub: t('gameplay:stadium.overview.homeMatch'), color: '#f59e0b' },
          { label: t('gameplay:stadium.bonus'),     value: (homeBonus.construction ?? 0) >= 0 ? `+${homeBonus.construction ?? 0}/+${homeBonus.destruction ?? 0}` : `${homeBonus.construction ?? 0}/${homeBonus.destruction ?? 0}`, sub: homeBonus.label ?? '', color: '#a855f7' },
        ].map(card => (
          <div key={card.label} className="bg-[#0f172a] border border-[#1e293b] rounded-md p-4 relative overflow-hidden shadow-md">
            <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: card.color }} />
            <h3 className="text-[10px] font-black text-[#64748b] uppercase tracking-widest mb-1 pl-1">{card.label}</h3>
            <p className="text-2xl font-black font-mono-retro text-white pl-1">{card.value}</p>
            <p className="text-xs text-[#475569] mt-1 pl-1 truncate font-medium uppercase tracking-wide">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Stats & Facilities (Solid panels) */}
        <div className="space-y-6">
          
          {/* Gradas */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-md overflow-hidden shadow-lg">
            <div className="bg-[#1e293b] px-4 py-2 border-b border-[#334155]">
              <h3 className="text-xs font-black text-white uppercase tracking-widest">Distribución de Gradas</h3>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {Object.entries(sections).map(([key, sec]) => (
                <div key={key} className="bg-[#0b1120] rounded border border-[#1e293b] p-3 text-center">
                  <p className="text-[9px] text-[#64748b] font-black uppercase tracking-widest mb-1">{sec.name}</p>
                  <p className="text-lg font-black text-white font-mono-retro leading-none">{sec.capacity.toLocaleString()}</p>
                  <div className="flex items-center gap-1 mt-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className={cn('h-1 flex-1 rounded-sm', i < sec.level ? 'bg-[#3b82f6]' : 'bg-[#1e293b]')} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Facilities */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-md overflow-hidden shadow-lg">
            <div className="bg-[#1e293b] px-4 py-2 border-b border-[#334155]">
              <h3 className="text-xs font-black text-white uppercase tracking-widest">{t('gameplay:stadium.facilities')}</h3>
            </div>
            <div className="p-4 space-y-4">
              {[
                { label: t('gameplay:stadium.facilitiesLabels.seats'),        value: getAverageLevel(seats),    max: 4, color: '#22c55e' },
                { label: t('gameplay:stadium.facilitiesLabels.boxes'),      value: getAverageLevel(boxes),     max: 4, color: '#f59e0b' },
                { label: t('gameplay:stadium.facilitiesLabels.parking'),    value: getAverageLevel(parking), max: 5, color: '#a855f7' },
                { label: t('gameplay:stadium.facilitiesLabels.sportsCity'),value: sportsCity, max: 8, color: '#3b82f6' },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-xs font-bold text-[#94a3b8] uppercase tracking-wide">{item.label}</span>
                    <span className="text-xs font-black text-white font-mono-retro">NIVEL {item.value}/{item.max}</span>
                  </div>
                  <div className="h-1.5 bg-[#0b1120] rounded-sm overflow-hidden border border-[#1e293b]">
                    <div className="h-full transition-all duration-500 ease-out" style={{ width: `${(item.value / item.max) * 100}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Attendance Bonus */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-md overflow-hidden shadow-lg">
            <div className="bg-[#1e293b] px-4 py-2 border-b border-[#334155] flex items-center gap-2">
              <Users size={14} className="text-[#94a3b8]" />
              <h3 className="text-xs font-black text-white uppercase tracking-widest">{t('gameplay:stadium.attendanceBonuses')}</h3>
            </div>
            <div className="p-2 space-y-1">
              {assistanceTable.map(row => {
                const isActive = homeBonus.label === row.condition;
                return (
                  <div key={row.range} className={cn(
                    'flex items-center justify-between text-[11px] px-3 py-2 rounded-sm transition-all',
                    isActive ? 'bg-[#14532d] border border-[#16a34a]' : 'bg-transparent hover:bg-[#1e293b]'
                  )}>
                    <span className={cn('font-mono-retro font-bold', isActive ? 'text-[#4ade80]' : 'text-[#64748b]')}>{row.range}</span>
                    <span className={isActive ? 'text-[#4ade80] font-bold' : 'text-[#94a3b8] font-medium'}>{row.bonus}</span>
                    {isActive && <span className="text-[9px] bg-[#22c55e] text-black px-1.5 py-0.5 rounded-sm font-black uppercase">Activo</span>}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Column: Upgrades (Construction Panel) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Works */}
          {allWorks.length > 0 && (
            <div className="bg-[#78350f] border border-[#b45309] rounded-md overflow-hidden shadow-lg relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-[repeating-linear-gradient(45deg,#f59e0b,#f59e0b_10px,#b45309_10px,#b45309_20px)]" />
              <div className="p-4 pt-5">
                <h3 className="text-xs font-black text-[#fbbf24] uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span>🚧</span> {t('gameplay:stadium.worksInProgress')}
                </h3>
                <div className="space-y-2">
                  {allWorks.map((work: any) => (
                    <div key={work.id} className="flex items-center justify-between bg-black/40 border border-[#b45309] p-3 rounded-sm">
                      <div className="flex items-center gap-3">
                        <Building2 size={16} className="text-[#fbbf24]" />
                        <span className="text-sm font-bold text-white uppercase tracking-wide">{workLabel(work)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-[#f59e0b] bg-[#451a03] px-2 py-1 rounded-sm border border-[#78350f]">
                          {work.monthsRemaining} {t('gameplay:stadium.monthsRemaining')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Upgrades List */}
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight mb-4 flex items-center gap-2">
              <span className="w-2 h-6 bg-[#3b82f6] block" />
              Proyectos de Mejora
            </h2>
            
            <div className="grid grid-cols-1 gap-3">
              {availableUpgrades.map((upgrade: any) => {
                const Icon = typeIcons[upgrade.type] || Building2;
                const c = colorMap[typeColors[upgrade.type] || 'blue'];
                const key = upgradeWorkKey(upgrade.type, upgrade.slot);
                const isWorking = isSubmitting === key;
                const hasActiveWork = allWorks.some((w: any) => workMatchesUpgrade(w, key));

                return (
                  <div key={key} className={cn(
                    "bg-[#0f172a] rounded-sm p-4 border border-[#1e293b] flex items-center shadow-md transition-colors hover:bg-[#1e293b]",
                    c.broadcastBorder,
                    "border-l-4"
                  )}>
                    <div className={cn('p-3 rounded bg-black/40 mr-4', c.text)}>
                      <Icon size={24} strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-black text-white uppercase tracking-wide">{upgrade.label}</h3>
                      <p className="text-[10px] text-[#64748b] font-bold uppercase mt-0.5 tracking-wider">Duración: {upgrade.months} {t('gameplay:stadium.months')}</p>
                    </div>
                    <div className="flex items-center gap-4 pl-4 border-l border-[#334155]">
                      <div className="text-right w-24">
                        <p className="text-[10px] text-[#64748b] font-bold uppercase tracking-widest mb-0.5">Presupuesto</p>
                        <p className="text-sm font-mono-retro font-black text-white">{formatMoney(upgrade.cost)}</p>
                      </div>
                      <button
                        onClick={() => handleWork(upgrade.type, upgrade.slot)}
                        disabled={isSubmitting !== null || (data.budget ?? 0) < (upgrade.cost ?? 0) || hasActiveWork}
                        className={cn(
                          'w-32 py-2.5 rounded-sm text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md',
                          isWorking || hasActiveWork
                            ? 'bg-[#451a03] text-[#f59e0b] border border-[#78350f]'
                            : `${c.btnBg} ${c.btnText} hover:brightness-110 active:scale-95`
                        )}
                      >
                        {isWorking ? <Loader2 size={14} className="animate-spin mx-auto" /> : hasActiveWork ? t('gameplay:stadium.inProgress') : t('gameplay:stadium.build')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 bg-[#0f172a] border-l-4 border-[#3b82f6] p-4 rounded-r-md shadow-md">
        <Info size={18} className="text-[#3b82f6] flex-shrink-0" />
        <p className="text-xs text-[#94a3b8] font-medium leading-relaxed" dangerouslySetInnerHTML={{ __html: t('gameplay:stadium.infoNote') }} />
      </div>
    </div>
  );
}

