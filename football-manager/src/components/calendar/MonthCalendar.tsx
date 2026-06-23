// ─── MonthCalendar — grid mensual real de 7 columnas (LOTE C · E17) ────────────
// Presentación pura: recibe los partidos ya fechados (dateKey in-game) y pinta
// el mes por semanas. Partido = chip con escudo del rival + color por competición.
// HOY (fecha in-game) con anillo verde; pasados con V/E/D coloreado; futuros con hora.
import { ClubBadge } from '../ui';
import { cn } from '../../lib/cn';
import { KIND_COLOR, KIND_HOUR, buildMonthCells, type CompetitionKind } from './inGameDates';

export type CalendarMatch = {
  id: number;
  status: 'scheduled' | 'played' | 'postponed';
  homeClubId: number;
  awayClubId: number;
  homeClub?: { name: string; shortName?: string };
  awayClub?: { name: string; shortName?: string };
  homeGoals: number | null;
  awayGoals: number | null;
  resultHidden?: boolean;
  competition?: { name: string; shortName?: string };
  matchdayNum?: number;
  week?: number;
  /** Derivados en la página */
  dateKey: string;          // YYYY-MM-DD in-game
  kind: CompetitionKind;
};

const WEEKDAYS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

function rivalOf(m: CalendarMatch, myClubId: number) {
  const home = m.homeClubId === myClubId;
  return {
    isHome: home,
    rivalId: home ? m.awayClubId : m.homeClubId,
    rivalName: home
      ? m.awayClub?.shortName ?? m.awayClub?.name ?? 'Rival'
      : m.homeClub?.shortName ?? m.homeClub?.name ?? 'Rival',
  };
}

function resultLetter(m: CalendarMatch, myClubId: number): { letter: string; tone: string } | null {
  if (m.resultHidden) return null;
  if (m.status !== 'played' || m.homeGoals == null || m.awayGoals == null) return null;
  const home = m.homeClubId === myClubId;
  const mine = home ? m.homeGoals : m.awayGoals;
  const theirs = home ? m.awayGoals : m.homeGoals;
  if (mine > theirs) return { letter: 'V', tone: 'var(--green-primary)' };
  if (mine < theirs) return { letter: 'D', tone: 'var(--red-danger)' };
  return { letter: 'E', tone: 'var(--gold-accent)' };
}

interface Props {
  year: number;
  monthIdx0: number;
  matchesByDay: Map<string, CalendarMatch[]>;
  todayKey: string;
  myClubId: number;
  onOpenMatch: (m: CalendarMatch) => void;
}

export function MonthCalendar({ year, monthIdx0, matchesByDay, todayKey, myClubId, onOpenMatch }: Props) {
  const cells = buildMonthCells(year, monthIdx0);

  return (
    <div className="mcal shadow-2xl">
      <style>{`
        .mcal {
          background: #0f172a; /* Dark concrete */
          border: 2px solid #1e293b;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        }
        .mcal-head {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          background: #0b1120;
          border-bottom: 2px solid #1e293b;
        }
        .mcal-dow {
          padding: 12px 6px;
          text-align: center;
          font-family: var(--font-display);
          font-size: 0.8rem;
          letter-spacing: 2px;
          color: #94a3b8;
          font-weight: 900;
          text-transform: uppercase;
        }
        .mcal-dow:nth-child(6), .mcal-dow:nth-child(7) {
          color: var(--green-primary);
        }
        .mcal-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
        }
        .mcal-cell {
          min-height: 110px;
          padding: 8px;
          border-right: 1px solid #1e293b;
          border-bottom: 1px solid #1e293b;
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: relative;
          background: #0f172a;
          transition: background 0.2s;
        }
        .mcal-cell:nth-child(7n) { border-right: none; }
        .mcal-cell:hover { background: #1e293b; }
        .mcal-cell.is-out { background: #080c14; }
        .mcal-cell.is-out .mcal-day { opacity: 0.2; }
        .mcal-cell.is-today {
          background: linear-gradient(180deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0) 100%);
          box-shadow: inset 0 4px 0 var(--green-primary);
        }
        .mcal-day {
          font-family: var(--font-mono-retro);
          font-size: 0.9rem;
          color: #64748b;
          line-height: 1;
          font-weight: bold;
        }
        .mcal-cell.is-today .mcal-day {
          color: var(--green-primary);
          font-weight: 900;
          text-shadow: 0 0 10px rgba(34, 197, 94, 0.4);
        }
        .mcal-today-tag {
          position: absolute;
          top: 8px;
          right: 8px;
          font-family: var(--font-display);
          font-weight: 900;
          font-size: 0.6rem;
          letter-spacing: 1px;
          color: #0f172a;
          background: var(--green-primary);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .mcal-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          text-align: left;
          cursor: pointer;
          padding: 6px 8px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-left: 4px solid var(--chip-tone, var(--green-primary));
          background: #1e293b;
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
          min-width: 0;
          position: relative;
          overflow: hidden;
        }
        .mcal-chip::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 10px; cursor: pointer;
          background: linear-gradient(90deg, #1e293b, #0f172a); border: 1px solid rgba(255,255,255,0.1);
          border-left: 4px solid var(--chip-tone, var(--border-color)); transition: all 0.2s;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3); text-align: left;
        }
        .mcal-chip:hover {
          transform: translateX(4px) scale(1.02); background: linear-gradient(90deg, #334155, #1e293b);
          border-color: rgba(255,255,255,0.2); box-shadow: 0 8px 20px rgba(0,0,0,0.4), 0 0 15px var(--chip-tone);
        }
        .mcal-chip.is-home {
          background: linear-gradient(90deg, #27344a, #1e293b);
        }
        .mcal-chip-name {
          font-family: var(--font-display); font-weight: 900; font-size: 0.8rem; color: white;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; letter-spacing: 1px;
          text-transform: uppercase;
        }
        .mcal-chip-ha {
          font-family: var(--font-mono-retro); font-size: 0.65rem; font-weight: 900; color: #94a3b8; flex-shrink: 0;
          background: rgba(0,0,0,0.4); padding: 4px 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);
        }
        .mcal-chip-res {
          font-family: var(--font-mono-retro); font-size: 0.75rem; font-weight: 900; flex-shrink: 0;
          display: inline-flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.6);
          padding: 4px 8px; border-radius: 6px; box-shadow: inset 0 2px 5px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1);
        }
        .mcal-chip-hour {
          font-family: var(--font-mono-retro); font-size: 0.7rem; font-weight: 900; color: var(--gold-accent); flex-shrink: 0; text-shadow: 0 0 10px rgba(234,179,8,0.3);
        }
        .mcal-other {
          font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; color: #64748b;
          padding: 8px 10px; border-radius: 8px; background: rgba(15,23,42,0.5);
          border: 1px solid rgba(255,255,255,0.05); border-left: 3px solid var(--chip-tone, var(--border-color));
          cursor: pointer; width: 100%; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          transition: all 0.2s; letter-spacing: 0.5px; text-transform: uppercase;
        }
        .mcal-other:hover {
          color: white; background: rgba(30,41,59,0.8); border-color: rgba(255,255,255,0.1); transform: translateX(2px); box-shadow: 0 4px 10px rgba(0,0,0,0.2);
        }
        @media (max-width: 900px) {
          .mcal-cell { min-height: 80px; padding: 4px; }
          .mcal-chip-name { display: none; }
          .mcal-chip { justify-content: center; padding: 6px; }
          .mcal-dow { font-size: 0.6rem; padding: 8px 4px; }
        }
      `}</style>

      <div className="mcal-head">
        {WEEKDAYS.map(d => <div key={d} className="mcal-dow">{d}</div>)}
      </div>

      <div className="mcal-grid">
        {cells.map(cell => {
          const dayMatches = matchesByDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          return (
            <div
              key={cell.key}
              className={cn('mcal-cell', !cell.inMonth && 'is-out', isToday && 'is-today')}
            >
              <span className="mcal-day">{cell.day}</span>
              {isToday && <span className="mcal-today-tag">HOY</span>}

              {dayMatches.map(m => {
                const mine = m.homeClubId === myClubId || m.awayClubId === myClubId;
                const tone = KIND_COLOR[m.kind];

                if (!mine) {
                  // Partido ajeno (p.ej. payload de /matches/calendar sin club): línea discreta.
                  return (
                    <button
                      key={m.id}
                      className="mcal-other"
                      style={{ ['--chip-tone' as string]: tone }}
                      onClick={() => onOpenMatch(m)}
                      title={`${m.homeClub?.shortName ?? m.homeClub?.name ?? 'Local'} vs ${m.awayClub?.shortName ?? m.awayClub?.name ?? 'Visitante'}`}
                    >
                      {(m.homeClub?.shortName ?? m.homeClub?.name ?? '?')}–{(m.awayClub?.shortName ?? m.awayClub?.name ?? '?')}
                    </button>
                  );
                }

                const { isHome, rivalId, rivalName } = rivalOf(m, myClubId);
                const res = resultLetter(m, myClubId);
                return (
                  <button
                    key={m.id}
                    className={cn('mcal-chip', isHome && 'is-home')}
                    style={{ ['--chip-tone' as string]: tone }}
                    onClick={() => onOpenMatch(m)}
                    title={`${m.homeClub?.name ?? 'Local'} vs ${m.awayClub?.name ?? 'Visitante'} · ${m.competition?.name ?? ''}`}
                  >
                    <ClubBadge id={rivalId} name={rivalName} size={18} />
                    <span className="mcal-chip-name">{rivalName}</span>
                    <span className="mcal-chip-ha">{isHome ? 'L' : 'V'}</span>
                    {res ? (
                      <span className="mcal-chip-res" style={{ color: res.tone }}>
                        {res.letter} {m.homeGoals}-{m.awayGoals}
                      </span>
                    ) : (
                      <span className="mcal-chip-hour">
                        {m.status === 'played' && m.resultHidden ? '? - ?' : KIND_HOUR[m.kind]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
