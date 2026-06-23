import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radar } from '../ui/Radar';
import { PosBadge } from '../ui/PosBadge';
import { PlayerPortrait } from '../ui/PlayerPortrait';
import { Tabs } from '../ui/Tabs';

export interface DossierPlayer {
  id?: number;
  name: string; position?: string; preferredPosition?: string; age?: number; potential?: number;
  nationality?: string; marketValue?: number; wage?: number; releaseClause?: number;
  experience?: number;
  jerseyColor?: string;
  jerseySecondary?: string;
  squadNumber?: number;
  passing?: number; tackling?: number; shooting?: number; organization?: number;
  unmarking?: number; finishing?: number; dribbling?: number; fouls?: number;
  goalkeeping?: number; reflexes?: number;   // SALIDAS / REFLEJOS (porteros)
  fitness?: number; muscularFitness?: number; mentalSharpness?: number; matchRhythm?: number;
  morale?: number;
  isInjured?: boolean; isSuspended?: boolean;
  bioSummary?: string;
  tags?: string[];
}

function v(p: DossierPlayer, k: keyof DossierPlayer): number { return Number(p[k] ?? 0); }
function eur(n?: number): string {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M €`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K €`;
  return `${n} €`;
}

// Barritas tipo "|||||" del clásico. Color propio por métrica, SIN glow neón.
function StatBar({ value, label, max = 100, color }: { value: number, label: string, max?: number, color: string }) {
  const bars = Math.round((value / max) * 5);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] sm:text-xs text-[var(--text-muted)] font-display tracking-wider uppercase w-20 text-right">{label}:</span>
      <div className="flex gap-1">
        {[1,2,3,4,5].map(i => (
          <div
            key={i}
            className="w-2 h-4 sm:h-5 rounded-sm"
            style={{ backgroundColor: i <= bars ? color : `color-mix(in srgb, ${color} 16%, transparent)` }}
          />
        ))}
      </div>
    </div>
  );
}

// Fila de la ficha (col. izquierda).
function InfoRow({ label, value }: { label: string, value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-[var(--border-color)]/60 last:border-0">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold">{label}</span>
      <span className="text-xs font-bold text-[var(--text-primary)] truncate text-right">{value}</span>
    </div>
  );
}

export function PlayerDossier({ player: p, actionButton }: { player: DossierPlayer, actionButton?: React.ReactNode }) {
  const { t } = useTranslation(['common', 'gameplay']);
  const [tab, setTab] = useState('perfil');
  // Portero: SALIDAS (goalkeeping) y REFLEJOS (reflexes). Manual §Media: la media
  // se calcula con las habilidades de campo o de portero SEGÚN la posición.
  const isGk = String(p.position ?? '').toUpperCase().startsWith('PO');
  const overall = isGk
    ? Math.round((v(p, 'goalkeeping') + v(p, 'reflexes')) / 2)
    : Math.round(
        [p.passing, p.tackling, p.shooting, p.organization, p.unmarking, p.finishing, p.dribbling, p.fouls]
          .map(x => Number(x ?? 0)).reduce((a, b) => a + b, 0) / 8);

  const status = p.isInjured
    ? { text: 'Lesionado', color: 'var(--red-danger)' }
    : p.isSuspended
      ? { text: 'Sancionado', color: 'var(--gold-accent)' }
      : { text: 'Disponible', color: 'var(--green-primary)' };

  const tabs = [
    { id: 'perfil', label: 'Perfil' },
    { id: 'trayectoria', label: 'Trayectoria' },
    { id: 'palmares', label: 'Palmarés' },
    { id: 'informes', label: 'Informes' },
    { id: 'compatibilidad', label: 'Compatibilidad' },
  ];

  const topAttr = [
    { l: 'PAS', v: v(p, 'passing') },
    { l: 'TIR', v: v(p, 'shooting') },
    { l: 'REG', v: v(p, 'dribbling') },
    { l: 'ENT', v: v(p, 'tackling') },
  ].sort((a, b) => b.v - a.v)[0];

  return (
    <div className="relative overflow-hidden bg-[var(--bg-elevated)] backdrop-blur-xl border border-[var(--border-color)] rounded-3xl shadow-lg font-sans text-[var(--text-primary)]">
      
      {/* Hero broadcast */}
      <div className="relative flex flex-col sm:flex-row items-stretch gap-0 border-b border-[var(--border-color)] overflow-hidden">
        <div className="relative flex items-center justify-center p-5 sm:w-[200px] bg-gradient-to-br from-[var(--bg-surface)] to-[var(--bg-base)]">
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,var(--green-primary),transparent_60%)]" />
          <PlayerPortrait
            id={p.id ?? 0}
            size={140}
            variant="broadcast"
            age={p.age}
            dorsal={p.squadNumber}
            jerseyColor={p.jerseyColor}
            jerseySecondary={p.jerseySecondary}
            className="relative z-10 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
          />
          {p.position && (
            <div className="absolute top-3 left-3 z-20">
              <PosBadge position={p.position} preferredPosition={p.preferredPosition} />
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col justify-center px-6 py-5 bg-gradient-to-r from-[var(--gold-accent)]/5 via-transparent to-[var(--green-primary)]/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-muted)] font-bold mb-1">Expediente scouting</p>
              <h2 className="font-display font-black text-3xl sm:text-4xl text-[var(--text-primary)] tracking-tight uppercase">{p.name}</h2>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {p.nationality || 'Internacional'} · {p.age ? `${p.age} años` : '—'} · OVR <strong className="text-[var(--green-primary)]">{overall}</strong>
                {p.potential != null && <> · POT <strong className="text-[var(--gold-accent)]">{p.potential}</strong></>}
              </p>
            </div>
            <div className="text-right flex flex-col items-end gap-2">
              {actionButton}
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border border-[var(--border-color)]" style={{ color: status.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.color }} />{status.text}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 border-b border-[var(--border-color)] bg-[var(--bg-surface)]">
        <Tabs tabs={tabs} activeTab={tab} onChange={setTab} />
      </div>

      {tab === 'perfil' && (
      <>
      {/* Main 3 Columns Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[200px_260px_1fr] gap-0 border-b border-[var(--border-color)]">
        
        {/* Col 1: Ficha del jugador */}
        <div className="relative flex flex-col items-center p-5 bg-gradient-to-b from-transparent to-[var(--bg-surface)] border-r border-[var(--border-color)]">
           <div className="w-full bg-[var(--bg-elevated)]/50 border border-[var(--border-color)] rounded-xl px-1">
              <InfoRow label="Edad" value={p.age ? `${p.age} años` : '—'} />
              <InfoRow label="País" value={p.nationality || 'Internacional'} />
              <InfoRow label="Potencial" value={p.potential ?? '—'} />
              <InfoRow label="Estado" value={
                <span className="inline-flex items-center gap-1.5" style={{ color: status.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.color }} />{status.text}
                </span>
              } />
           </div>
        </div>

        {/* Col 2: Radar */}
        <div className="flex flex-col items-center justify-center p-6 border-r border-[var(--border-color)] bg-[var(--bg-surface)]">
          <Radar size={240} axes={isGk ? [
            { label: 'COL', value: v(p, 'goalkeeping') },
            { label: 'REF', value: v(p, 'reflexes') },
            { label: 'ORG', value: v(p, 'organization') },
            { label: 'PAS', value: v(p, 'passing') },
            { label: 'ENT', value: v(p, 'tackling') },
            { label: 'FAL', value: v(p, 'fouls') },
          ] : [
            { label: 'PAS', value: v(p, 'passing') },
            { label: 'ORG', value: v(p, 'organization') },
            { label: 'DES', value: v(p, 'unmarking') },
            { label: 'REG', value: v(p, 'dribbling') },
            { label: 'TIR', value: v(p, 'shooting') },
            { label: 'REM', value: v(p, 'finishing') },
            { label: 'ENT', value: v(p, 'tackling') },
            { label: 'FAL', value: v(p, 'fouls') },
          ]} />
        </div>

        {/* Col 3: Data Grid Clásica */}
        <div className="p-6 bg-transparent flex flex-col justify-between">
          
          <div className="grid grid-cols-4 gap-2 mb-6">
            {/* Box Media */}
            <div className="col-span-1 row-span-2 bg-gradient-to-br from-[rgba(34,197,94,0.1)] to-[rgba(34,197,94,0.02)] border border-[rgba(34,197,94,0.2)] rounded-xl flex flex-col items-center justify-center p-4 shadow-[0_8px_24px_rgba(0,0,0,0.2)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--bg-surface)] rounded-bl-full blur-md" />
              <span className="text-[10px] text-[var(--green-primary)] uppercase tracking-[0.2em] font-black drop-shadow-md z-10">Media</span>
              <span className="text-6xl font-display font-black text-[var(--text-primary)] leading-none drop-shadow-[0_4px_12px_rgba(34,197,94,0.4)] z-10">{overall}</span>
              {p.experience != null && (
                <span className="text-[9px] text-[var(--text-muted)] uppercase mt-2 z-10 font-mono">Exp: {p.experience}%</span>
              )}
            </div>
            
            {/* Grid Atributos (Pase, Entradas, Tiro, etc.) */}
            <div className="col-span-3 grid grid-cols-4 gap-2">
              {(isGk ? [
                { l: 'colocación', v: v(p, 'goalkeeping') },
                { l: 'reflejos', v: v(p, 'reflexes') },
                { l: 'organización', v: v(p, 'organization') },
                { l: 'pase', v: v(p, 'passing') },
                { l: 'entradas', v: v(p, 'tackling') },
                { l: 'faltas', v: v(p, 'fouls') },
              ] : [
                { l: 'pase', v: v(p, 'passing') },
                { l: 'entradas', v: v(p, 'tackling') },
                { l: 'tiro', v: v(p, 'shooting') },
                { l: 'remate', v: v(p, 'finishing') },
                { l: 'desmarque', v: v(p, 'unmarking') },
                { l: 'regate', v: v(p, 'dribbling') },
                { l: 'faltas', v: v(p, 'fouls') },
                { l: 'organización', v: v(p, 'organization') },
              ]).map(attr => (
                <div key={attr.l} className="min-w-0 bg-[var(--bg-elevated)] backdrop-blur-md border border-[var(--border-color)] rounded-xl flex flex-col items-center py-3 px-1 shadow-sm transition-colors hover:bg-[var(--bg-surface)]">
                  <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wide font-bold truncate max-w-full text-center">{attr.l}</span>
                  <span className="text-xl font-black text-[var(--text-primary)] font-sans leading-tight mt-1">{attr.v || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Barras de Talento y Moral */}
          <div className="flex flex-wrap items-center justify-between gap-y-3 pt-4 border-t border-[var(--border-color)] px-2">
             <StatBar label="Talento" value={p.potential ?? overall} max={100} color="var(--gold-accent)" />
             <StatBar label="Moral" value={p.morale || 85} max={100} color="var(--green-primary)" />
          </div>

        </div>
      </div>
      </>
      )}

      {tab === 'trayectoria' && (
        <div className="p-6 space-y-4 bg-[var(--bg-surface)]">
          {p.tags && p.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {p.tags.map(tag => (
                <span key={tag} className="px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-wider font-bold border border-[var(--gold-accent)]/40 bg-[var(--gold-accent)]/10 text-[var(--gold-accent)]">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm leading-relaxed text-[var(--text-primary)] max-w-2xl">
            {p.bioSummary ?? (
              <>
                {p.name} llegó al radar del club con un perfil de <strong>{p.position || 'versátil'}</strong> y una media global de <strong>{overall}</strong>.
                {p.age != null && p.age <= 21 && ' Promesa con margen de crecimiento en el tramo final de la temporada.'}
                {p.age != null && p.age >= 30 && ' Veterano con experiencia para partidos decisivos.'}
              </>
            )}
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              ['Valor de mercado', eur(p.marketValue)],
              ['Salario', eur(p.wage)],
              ['Ritmo de partido', `${v(p, 'matchRhythm') || '—'}%`],
            ].map(([k, val]) => (
              <div key={k} className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)]">
                <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">{k}</div>
                <div className="font-display font-bold text-xl">{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'palmares' && (
        <div className="p-6 bg-[var(--bg-surface)]">
          <p className="text-sm text-[var(--text-muted)] mb-4">Registro competitivo en el universo FDF (sincronizado con temporada activa).</p>
          <div className="flex flex-wrap gap-3">
            {overall >= 80 && <span className="px-3 py-2 rounded-lg border border-[var(--gold-accent)]/40 bg-[var(--gold-accent)]/10 text-sm">⭐ Referencia en su demarcación</span>}
            {(p.potential ?? 0) >= overall + 5 && <span className="px-3 py-2 rounded-lg border border-[var(--green-primary)]/40 bg-[var(--green-primary)]/10 text-sm">📈 Proyección ascendente</span>}
            <span className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] text-sm">🏟️ Disponible para convocatoria</span>
          </div>
        </div>
      )}

      {tab === 'informes' && (
        <div className="p-6 grid sm:grid-cols-2 gap-4 bg-[var(--bg-surface)]">
          {[
            { title: 'Informe táctico', body: `Destaca en ${topAttr.l} (${topAttr.v}). Encaja en sistemas que exigen salida limpia y decisión en el último tercio.` },
            { title: t('gameplay:player.dossier.physicalReport'), body: `${t('gameplay:player.dossier.physicalStats', { fitness: v(p, 'fitness') || '—', muscular: v(p, 'muscularFitness') || '—' })} ${p.isInjured ? t('gameplay:player.dossier.physicalInjury') : t('gameplay:player.dossier.physicalFit')}` },
            { title: 'Informe mental', body: `Agudeza ${v(p, 'mentalSharpness') || '—'}%. Moral ${p.morale ?? 85}% — ${(p.morale ?? 85) >= 70 ? 'estable' : 'vigilar antes de partidos clave'}.` },
            { title: 'Ojeador jefe', body: `Valoración ${eur(p.marketValue)}. ${(p.potential ?? 0) > overall ? 'Recomendación: retener y minutizar.' : 'Perfil maduro, impacto inmediato.'}` },
          ].map((r) => (
            <div key={r.title} className="relative p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-elevated)] rotate-[-0.6deg] shadow-md">
              <div className="text-[10px] uppercase tracking-widest text-[var(--gold-accent)] font-bold mb-2">{r.title}</div>
              <p className="text-sm leading-relaxed text-[var(--text-primary)]">{r.body}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'compatibilidad' && (
        <div className="p-6 bg-[var(--bg-surface)]">
          <p className="text-sm text-[var(--text-muted)] mb-4">Señal táctica estimada (consumirá `DecisionSignal` cuando el jugador esté en mercado).</p>
          <div className="space-y-3 max-w-lg">
            {[
              ['Impacto deportivo', overall, 'var(--green-primary)'],
              ['Riesgo físico', p.isInjured ? 85 : 20, 'var(--red-danger)'],
              ['Encaje posicional', Math.min(100, overall + (p.preferredPosition === p.position ? 8 : 0)), 'var(--blue-info)'],
            ].map(([label, score, color]) => (
              <div key={String(label)}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
                  <span className="font-bold">{score}%</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color as string }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Contratos — visible en perfil */}
      {tab === 'perfil' && (
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--border-color)] bg-[var(--bg-surface)] backdrop-blur-xl">
        <div className="flex flex-col items-center justify-center py-8 transition-colors hover:bg-[var(--bg-elevated)]">
           <span className="text-[10px] text-[var(--gold-accent)] font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--gold-accent)]" />Salario</span>
           <span className="text-3xl font-display font-black text-[var(--text-primary)] drop-shadow-md">{eur(p.wage)}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-8 transition-colors hover:bg-[var(--bg-elevated)]">
           <span className="text-[10px] text-[var(--green-primary)] font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--green-primary)]" />Cláusula</span>
           <span className="text-3xl font-display font-black text-[var(--text-primary)] drop-shadow-md">{eur(p.releaseClause)}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-8 transition-colors hover:bg-[var(--bg-elevated)]">
           <span className="text-[10px] text-[var(--blue-info)] font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[var(--blue-info)]" />Valor</span>
           <span className="text-3xl font-display font-black text-[var(--text-primary)] drop-shadow-md">{eur(p.marketValue)}</span>
        </div>
      </div>
      )}

    </div>
  );
}
