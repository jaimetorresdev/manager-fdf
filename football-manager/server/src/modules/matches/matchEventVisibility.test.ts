import { describe, expect, it } from 'vitest';
import { hideResult } from './matchEventVisibility';
import { sanitizeHiddenLeagueEvent } from './matchdayRealtime.service';
import { visiblePenalties } from './og.service';

describe('E15 — ocultación completa del resultado', () => {
  it('blanquea marcador, ganador, decisión y penaltis', () => {
    const hidden = hideResult({
      status: 'played',
      homeGoals: 1,
      awayGoals: 1,
      winner: 'home',
      winnerClubId: 7,
      decidedBy: 'penalties',
      penaltiesHome: 5,
      penaltiesAway: 4,
      penalties: { home: 5, away: 4 },
    }, true);

    expect(hidden).toMatchObject({
      homeGoals: null,
      awayGoals: null,
      winner: null,
      winnerClubId: null,
      decidedBy: null,
      penaltiesHome: null,
      penaltiesAway: null,
      penalties: null,
      resultHidden: true,
    });
  });

  it('la tarjeta OG no muestra penaltis si el marcador está oculto', () => {
    expect(visiblePenalties(false, 'penalties', 5, 4)).toBeNull();
    expect(visiblePenalties(true, 'penalties', 5, 4)).toEqual({ home: 5, away: 4 });
  });

  it('el evento realtime oculto no filtra minuto, tipo, equipo ni marcador', () => {
    expect(sanitizeHiddenLeagueEvent({
      matchId: 3,
      leagueId: 4,
      minute: 87,
      type: 'red',
      team: 'away',
      homeClubId: 1,
      awayClubId: 2,
      description: 'Roja al central',
      score: { home: 2, away: 1 },
    })).toEqual({
      matchId: 3,
      leagueId: 4,
      minute: 0,
      type: 'event',
      homeClubId: 1,
      awayClubId: 2,
      description: 'Evento de partido oculto hasta ver el resultado.',
    });
  });
});
