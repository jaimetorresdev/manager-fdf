// ─── Styleguide — sistema de diseño + showcase del Match Viewer ───────────────
// Documenta tokens y componentes, y muestra el MatchViewer con datos de ejemplo.
import { Badge, Button, Card, ProgressBar, StatBar, KPICard, Sparkline, EmptyState } from '../components/ui';
import { useTranslation } from 'react-i18next';
import { Inbox } from 'lucide-react';
import { MatchCenter } from '../components/match/MatchCenter';
import { PlayerDossier, type DossierPlayer } from '../components/player/PlayerDossier';
import type { PlayerRating, SimulationResult, TimelineEntry } from '../types/engine';

const SWATCHES: [string, string][] = [
  ['--green-primary', 'Acento'], ['--gold-accent', 'Oro'], ['--blue-info', 'Info'],
  ['--red-danger', 'Peligro'], ['--teal-accent', 'Teal'], ['--violet-accent', 'Violeta'],
  ['--bg-base', 'Fondo'], ['--bg-surface', 'Superficie'], ['--bg-elevated', 'Elevado'],
];

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>{title}</h2>
      {subtitle && <p style={{ color: 'var(--text-muted)', margin: '2px 0 0', fontSize: '.85rem' }}>{subtitle}</p>}
    </div>
  );
}

function demoRatings(prefix: string, hero: number): PlayerRating[] {
  const names = ['Ramos', 'Cobo', 'Vidal', 'Ruiz', 'Soto', 'Nieto', 'Lara', 'Gil', 'Mora', 'Cano', 'Diez'];
  const pos = ['POR', 'DEF', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'DEL'];
  return pos.map((p, i) => ({
    name: `${prefix}. ${names[i]}`, playerId: `${prefix}${i}`,
    rating: i === hero ? 8.6 : 5.8 + ((i * 7) % 28) / 10,
    goals: i === hero ? 2 : (i === 9 ? 1 : 0), assists: i === 5 ? 1 : 0,
    shots: i >= 8 ? 3 : i === 5 ? 1 : 0, shotsOnTarget: i >= 8 ? 2 : 0,
    passes: 30 + i * 3, passesCompleted: 24 + i * 2, passAccuracy: 0.8,
    tackles: p === 'DEF' ? 3 : 1, interceptions: p === 'DEF' ? 2 : 0,
    keyPasses: i === 5 ? 2 : 0, xg: i >= 8 ? 0.7 : 0,
  }));
}

// Cadena de gol de ejemplo (recuperación → regate → pase clave → remate) para
// que el visor muestre la construcción de la jugada y la moviola del gol.
const DEMO_GOAL_CHAIN: TimelineEntry['chain'] = [
  { step: 'recuperacion', lane: 'left', text: 'A. Ruiz roba en su campo', att: { playerId: 'A3', name: 'A. Ruiz', position: 'DEF', attrs: { tackling: 78, organization: 72 } }, def: { playerId: 'B8', name: 'B. Mora', position: 'DEL', attrs: { passing: 70, organization: 66 } } },
  { step: 'regate', lane: 'left', text: 'A. Lara encara y se va', att: { playerId: 'A6', name: 'A. Lara', position: 'MED', attrs: { dribbling: 84, unmarking: 79 } }, def: { playerId: 'B2', name: 'B. Vidal', position: 'DEF', attrs: { tackling: 75 } } },
  { step: 'pase_clave', lane: 'left', text: 'A. Nieto filtra al área', att: { playerId: 'A5', name: 'A. Nieto', position: 'MED', attrs: { passing: 86, organization: 80 } }, def: { playerId: 'B3', name: 'B. Ruiz', position: 'DEF', attrs: { tackling: 71, organization: 68 } } },
  { step: 'remate', lane: 'left', text: 'A. Mora define cruzado', att: { playerId: 'A8', name: 'A. Mora', position: 'DEL', attrs: { finishing: 88, shooting: 85, unmarking: 82 } }, def: { playerId: 'B0', name: 'B. Ramos', position: 'POR', attrs: { goalkeeping: 79 } } },
];

const DEMO_TIMELINE: TimelineEntry[] = [
  { minute: 0, phase: 'saque', team: 'home', zone: 'med', lane: 'center', text: '🏟️ Comienza el partido. ☀️ soleado, 21º.' },
  { minute: 9, phase: 'remate', team: 'home', zone: 'area', lane: 'right', playerId: 'A8', text: '⚽ Remata Mora pero se marcha fuera.' },
  { minute: 23, phase: 'parada', team: 'away', zone: 'area', lane: 'center', playerId: 'A0', text: '🧤 Gran parada del portero ante Cano.' },
  { minute: 32, phase: 'construccion', team: 'home', zone: 'def', lane: 'left', playerId: 'A3', text: 'A. Ruiz roba y arranca la jugada.' },
  { minute: 33, phase: 'progresion', team: 'home', zone: 'med', lane: 'left', playerId: 'A5', text: 'A. Nieto filtra al área.' },
  { minute: 34, phase: 'gol', team: 'home', zone: 'area', lane: 'left', playerId: 'A8', chain: DEMO_GOAL_CHAIN, text: '⚽ Gol de Mora, define cruzado.' },
  { minute: 41, phase: 'falta', team: 'away', zone: 'med', text: '🟨 Amarilla a Lara.' },
  { minute: 58, phase: 'gol', team: 'away', zone: 'area', lane: 'right', playerId: 'B8', text: '⚽ Empata el visitante por medio de Soler.' },
  { minute: 72, phase: 'gol', team: 'home', zone: 'area', lane: 'center', playerId: 'A8', text: '⚽ ¡Mora de nuevo! Doblete y remontada.' },
  { minute: 90, phase: 'final', team: 'home', zone: 'med', text: '🔚 Final del partido: 2-1.' },
];

const DEMO: SimulationResult = {
  homeGoals: 2, awayGoals: 1,
  homeStats: { possession: 57, shots: 14, shotsOnTarget: 6, corners: 6, fouls: 11, yellowCards: 1, redCards: 0 },
  awayStats: { possession: 43, shots: 9, shotsOnTarget: 3, corners: 3, fouls: 14, yellowCards: 2, redCards: 0 },
  events: [], motm: 'A. Mora',
  homeRatings: demoRatings('A', 8), awayRatings: demoRatings('B', 8),
  timeline: DEMO_TIMELINE, knockout: false, decidedBy: 'regular', winner: 'home',
  homePenalties: 0, awayPenalties: 0, injuries: [], substitutions: [],
};

const TOKENS: [string, string][] = [
  ['--font-display', 'Outfit · títulos'],
  ['--font-mono-retro', 'JetBrains Mono · datos'],
  ['--radius-retro', 'esquinas 8px'],
];

export default function StyleguidePage() {
  const { t } = useTranslation('common');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 900, margin: '0 auto' }}>
      <Heading title="Sistema de diseño" subtitle="Manager FDF · retro PC fútbol moderno" />

      <Card>
        <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 12 }}>{t('Paleta')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
          {SWATCHES.map(([v, label]) => (
            <div key={v} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-retro)', overflow: 'hidden' }}>
              <div style={{ height: 44, background: `var(${v})` }} />
              <div style={{ padding: '6px 8px', fontSize: 12 }}>
                <div style={{ fontWeight: 600 }}>{label}</div>
                <code style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)' }}>{v}</code>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 12 }}>{t('Componentes')}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
          <Button>{t('Primario')}</Button>
          <Button variant="ghost">{t('Ghost')}</Button>
          <Badge>{t('neutro')}</Badge>
          <Badge variant="success">{t('en forma')}</Badge>
          <Badge variant="danger">{t('lesionado')}</Badge>
          <Badge variant="warning">{t('sancionado')}</Badge>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
          <KPICard label={t('Posición')} value="#3" hint="48 pts" tone="green" />
          <KPICard label={t('Valoración FDF')} value="1.5M€" tone="gold" />
          <KPICard label={t('Caja')} value="−120K€" tone="red" delta={-3} />
          <KPICard label={t('Confianza')} value="85" tone="blue" delta={5} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>{t('Sparkline')}</span>
          <Sparkline data={[80, 78, 82, 79, 85, 88, 84]} width={120} height={30} color="var(--gold-accent)" />
        </div>
        <StatBar label={t('Remate')} value={84} />
        <StatBar label={t('Pase')} value={71} />
        <div style={{ marginTop: 10 }}><ProgressBar value={62} /></div>
        <div style={{ marginTop: 14 }}>
          <span style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>{t('EmptyState (6.1a) — estados vacíos consistentes')}</span>
          <EmptyState icon={<Inbox size={26} />} title={t('Sin elementos')}
                      hint={t('Así se ve un estado vacío estándar: icono, título, pista y acción opcional.')}
                      action={<Button variant="ghost">{t('Acción sugerida')}</Button>} />
        </div>
        <table style={{ width: '100%', marginTop: 14, fontSize: '.82rem', borderCollapse: 'collapse' }}>
          <tbody>
            {TOKENS.map(([k, v]) => (
              <tr key={k} style={{ borderTop: '1px solid var(--border-color)' }}>
                <td style={{ padding: '6px 4px', fontFamily: 'var(--font-mono-retro)', color: 'var(--green-primary)' }}>{k}</td>
                <td style={{ padding: '6px 4px', color: 'var(--text-muted)' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Heading title="Ficha de jugador" subtitle="Radar FDF · forma desglosada · curva de desarrollo" />
        <PlayerDossier player={DEMO_PLAYER} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Heading title="Match Center 2D" subtitle="Campo cenital animado · capas de calor/tiros · radar · notas" />
        <MatchCenter result={DEMO} homeName="Hércules CF" awayName="CD Castellón" weather="☀️ 21º" />
      </div>
    </div>
  );
}

const DEMO_PLAYER: DossierPlayer = {
  name: 'Álex Mora', position: 'DEL', nationality: 'España', age: 21, potential: 89,
  marketValue: 24_000_000, wage: 1_200_000,
  passing: 72, tackling: 41, shooting: 86, organization: 64, unmarking: 88,
  finishing: 90, dribbling: 83, fouls: 55, goalkeeping: 8,
  fitness: 92, muscularFitness: 88, mentalSharpness: 79, matchRhythm: 95,
};
