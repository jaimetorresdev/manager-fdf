import { describe, expect, it } from 'vitest';
import {
  adaptClubProfile,
  adaptManagerProfile,
  adaptPlayerProfile,
  adaptWorldMap,
} from '../../src/lib/entityViewModels';

describe('entityViewModels', () => {
  it('adapta ficha de jugador con payload premium o legacy', () => {
    const vm = adaptPlayerProfile({
      id: 10,
      name: 'Cano',
      position: 'DC',
      club: { id: 1, shortName: 'FDF' },
      form: { lastRatings: [7, '8'] },
      radar: { technical: 80 },
      marketValue: 1000,
    });
    expect(vm.headline).toBe('Cano - DC');
    expect(vm.club?.route).toBe('/club/1');
    expect(vm.form.averageLastFive).toBe(7.5);
    expect(vm.radar.technical).toBe(80);
  });

  it('adapta club y manager sin romper con campos ausentes', () => {
    expect(adaptClubProfile({ id: 2, name: 'Club FDF', stadiumName: 'La Ciudad' }).stadium.name).toBe('La Ciudad');
    expect(adaptManagerProfile({ managerId: 4, visualProfile: { headline: 'Jaime (FDF)', level: 7 } }).headline).toBe('Jaime (FDF)');
  });

  it('adapta mapa mundial con paises defensivos', () => {
    const vm = adaptWorldMap({
      season: { name: '2026/27' },
      countries: [{ country: 'Espana', coords: { lat: 40, lng: -3 }, leagues: 3, status: 'OPEN' }],
      availableClubs: [{ id: 5, shortName: 'ALC' }],
    });
    expect(vm.seasonLabel).toBe('2026/27');
    expect(vm.totals.countries).toBe(1);
    expect(vm.countries[0]?.coords.zoom).toBe(4);
    expect(vm.availableClubs[0]?.route).toBe('/club/5');
  });
});
