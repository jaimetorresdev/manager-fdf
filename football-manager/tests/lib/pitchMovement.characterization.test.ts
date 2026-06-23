// Tests de CARACTERIZACIÓN de pitchMovement.ts (el módulo no tenía tests propios).
// No fijan coordenadas exactas (el jitter va sembrado por step.text → frágil), sino
// INVARIANTES estables: nº de jugadores, finitud (sin NaN), determinismo bit a bit,
// y las garantías de jugada (gol entra en la red, remate no, parada corta, jugada
// nueva no vuela). Sirven de red de seguridad antes de tocar el motor de síntesis.
import { describe, it, expect } from 'vitest';
import { computePitchFrame, GOAL, resolveCarrierId, ballAtStep } from '../../src/lib/pitchMovement';
import type { PitchPlayer } from '../../src/lib/pitchMovement';
import type { TimelineEntry } from '../../src/types/engine';

const W = 100;

function roster(prefix: string): PitchPlayer[] {
  const pos = ['POR', 'DEF', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'DEL'];
  return pos.map((position, i) => ({
    name: `${prefix}Player${i + 1}`,
    playerId: `${prefix}${i + 1}`,
    position,
    rating: 6 + (i % 4),
  }));
}

const home = roster('h');
const away = roster('a');

// Cadena de gol coherente (mismo minuto) + jugada nueva (remate fuera) + parada.
const tl: TimelineEntry[] = [
  { minute: 1, phase: 'saque', team: 'home', zone: 'med', lane: 'center', text: 'Saque inicial' },
  { minute: 10, phase: 'construccion', team: 'home', zone: 'def', lane: 'left', text: 'h4 recupera y construye',
    playerId: 'h4', duel: { att: { name: 'hPlayer4', playerId: 'h4', attrs: { passing: 70 } }, def: null } },
  { minute: 10, phase: 'progresion', team: 'home', zone: 'med', lane: 'left', text: 'h6 conduce y filtra',
    playerId: 'h6', duel: { att: { name: 'hPlayer6', playerId: 'h6', attrs: { dribbling: 72 } }, def: { name: 'aPlayer6', playerId: 'a6', attrs: { tackling: 60 } } } },
  { minute: 10, phase: 'gol', team: 'home', zone: 'area', lane: 'left', text: 'hPlayer9 · gol',
    playerId: 'h9',
    duel: { att: { name: 'hPlayer9', playerId: 'h9', attrs: { finishing: 80 } }, def: { name: 'aPlayer1', playerId: 'a1', attrs: { goalkeeping: 65 } } },
    chain: [
      { step: 'recuperacion', lane: 'left', att: { name: 'hPlayer4', playerId: 'h4', attrs: { passing: 70 } }, def: null },
      { step: 'regate', lane: 'left', att: { name: 'hPlayer6', playerId: 'h6', attrs: { dribbling: 72 } }, def: { name: 'aPlayer6', playerId: 'a6', attrs: { tackling: 60 } } },
      { step: 'pase_clave', lane: 'left', att: { name: 'hPlayer8', playerId: 'h8', attrs: { passing: 75 } }, def: null },
      { step: 'remate', lane: 'left', att: { name: 'hPlayer9', playerId: 'h9', attrs: { finishing: 80 } }, def: { name: 'aPlayer1', playerId: 'a1', attrs: { goalkeeping: 65 } } },
    ] },
  { minute: 14, phase: 'remate', team: 'away', zone: 'area', lane: 'right', text: 'aPlayer10 remata fuera',
    playerId: 'a10', duel: { att: { name: 'aPlayer10', playerId: 'a10', attrs: { finishing: 62 } }, def: { name: 'hPlayer1', playerId: 'h1', attrs: { goalkeeping: 70 } } } },
  { minute: 20, phase: 'parada', team: 'home', zone: 'area', lane: 'center', text: 'aPlayer1 ataja el disparo de hPlayer11',
    playerId: 'h11', duel: { att: { name: 'hPlayer11', playerId: 'h11', attrs: { finishing: 64 } }, def: { name: 'aPlayer1', playerId: 'a1', attrs: { goalkeeping: 78 } } } },
];

const BLENDS = [0, 0.25, 0.5, 0.75, 1];

function frameAt(i: number, blend: number) {
  return computePitchFrame(tl[i], tl[i - 1], tl[i - 2], tl[i + 1], i, blend, home, away, '4-3-3', '4-3-3');
}

describe('computePitchFrame · invariantes y determinismo', () => {
  it('siempre 11+11 jugadores y todo finito (sin NaN) en todo el timeline', () => {
    for (let i = 0; i < tl.length; i++) {
      for (const b of BLENDS) {
        const f = frameAt(i, b);
        expect(f.home).toHaveLength(11);
        expect(f.away).toHaveLength(11);
        expect(Number.isFinite(f.ball.x)).toBe(true);
        expect(Number.isFinite(f.ball.y)).toBe(true);
        for (const p of [...f.home, ...f.away]) {
          expect(Number.isFinite(p.x), `${p.name} x@${i}/${b}`).toBe(true);
          expect(Number.isFinite(p.y), `${p.name} y@${i}/${b}`).toBe(true);
        }
      }
    }
  });

  it('es determinista: misma entrada → misma salida bit a bit', () => {
    for (let i = 0; i < tl.length; i++) {
      for (const b of BLENDS) {
        expect(JSON.stringify(frameAt(i, b))).toEqual(JSON.stringify(frameAt(i, b)));
      }
    }
  });

  it('el GOL entra y reposa dentro de la red (home ataca a la derecha)', () => {
    const golIdx = tl.findIndex(s => s.phase === 'gol');
    const f = frameAt(golIdx, 1);
    expect(f.ball.on).toBe(true);
    // home anota en x=100; el balón reposa NET_INSET dentro de la red → x > W.
    expect(f.ball.x).toBeGreaterThan(W);
  });

  it('el REMATE (fuera) NO reposa dentro de la red rival', () => {
    const remIdx = tl.findIndex(s => s.phase === 'remate');
    const f = frameAt(remIdx, 1);
    // away ataca a la izquierda; un gol reposaría DENTRO de la red en x≈-NET_INSET.
    // El remate se va por encima/al lado (acaba en la línea, x≈0) → NO reposa en red.
    expect(f.ball.x).toBeGreaterThan(-1);
  });

  it('la PARADA se queda corta: el balón no cruza la línea de gol rival', () => {
    const parIdx = tl.findIndex(s => s.phase === 'parada');
    const f = frameAt(parIdx, 1);
    // home dispara hacia x=100 y el portero ataja → el balón no entra en la red.
    expect(f.ball.x).toBeLessThan(W + GOAL.NET_INSET);
  });

  it('separación: 22 discos nunca se montan (distancia mínima razonable)', () => {
    let globalMin = Infinity; let where = '';
    for (let i = 0; i < tl.length; i++) {
      for (const b of [0, 0.5, 1]) {
        const f = frameAt(i, b);
        const all = [...f.home, ...f.away];
        for (let p = 0; p < all.length; p++) {
          for (let q = p + 1; q < all.length; q++) {
            const d = Math.hypot(all[p].x - all[q].x, all[p].y - all[q].y);
            if (d < globalMin) { globalMin = d; where = `evento ${i} blend ${b}: ${all[p].name}~${all[q].name}`; }
          }
        }
      }
    }
    expect(globalMin, `separación mínima ${globalMin.toFixed(2)} @ ${where}`).toBeGreaterThan(1.9);
  });

  it('pre-movimiento del receptor: el próximo portador se acerca a su punto de recepción (jugada continua)', () => {
    // idx 2 (progresión) → idx 3 (gol), mismo minuto/equipo = jugada CONTINUA.
    const i = 2;
    const rid = resolveCarrierId(tl[i + 1], home);           // receptor del próximo evento (h9)
    expect(rid).not.toBeNull();
    const dest = ballAtStep(tl[i + 1], i + 1);               // punto de recepción del próximo balón
    const distAt = (b: number) => {
      const f = frameAt(i, b);
      const p = [...f.home, ...f.away].find(pp => String(pp.playerId) === String(rid));
      return p ? Math.hypot(p.x - dest.x, p.y - dest.y) : Infinity;
    };
    // al final del evento el receptor está MÁS CERCA del punto de recepción que al inicio.
    expect(distAt(1)).toBeLessThan(distAt(0));
  });

  it('la JUGADA NUEVA no vuela: el balón arranca local, no cruza el campo en un evento', () => {
    // idx 4 (remate away, minuto 14) es jugada nueva respecto al gol home (min 10).
    const newIdx = 4;
    const x0 = frameAt(newIdx, 0).ball.x;
    const x1 = frameAt(newIdx, 1).ball.x;
    expect(Math.abs(x1 - x0)).toBeLessThan(60); // no recorre el campo entero de golpe
  });
});

// ── Coreografía de la CADENA v2 (coherente con el balón real) ─────────────────
// Invariantes clave: el portador va PEGADO al balón (sin desfase), la construcción se
// planta sin entrar en la portería, el relevo no teletransporta y la espina no tiembla.
describe('computePitchFrame · coreografía de la cadena', () => {
  const carrierOf = (f: ReturnType<typeof frameAt>) =>
    [...f.home, ...f.away].find(p => p.isCarrier) ?? null;
  const find = (f: ReturnType<typeof frameAt>, id: string) =>
    [...f.home, ...f.away].find(p => String(p.playerId) === id);

  it('REMATE con cadena: espina hacia el ÁREA (no a la red) y el tirador remata', () => {
    const golIdx = tl.findIndex(s => s.phase === 'gol');     // chain: h4 → h6 → h8 → h9 (remate)
    const f = frameAt(golIdx, 0.5);
    const h4 = find(f, 'h4')!, h6 = find(f, 'h6')!, h8 = find(f, 'h8')!;
    // home ataca a la derecha → la construcción avanza en x, PERO sin colarse en la portería.
    expect(h4.x).toBeLessThan(h6.x);
    expect(h6.x).toBeLessThan(h8.x);
    expect(h8.x).toBeLessThan(86);                            // el origen del disparo es x≈84
    for (const id of ['h4', 'h6', 'h8']) expect(find(f, id)!.x).toBeLessThan(W); // nadie en la red
    // el portador es SIEMPRE el rematador (h9), no la construcción (timing de disparo intacto).
    expect(carrierOf(f)?.playerId).toBe('h9');
    expect(carrierOf(frameAt(golIdx, 1))?.playerId).toBe('h9');
  });

  // Jugada CORAL en juego abierto (no remate): el balón hila la cadena; último eslabón con par.
  const coral: TimelineEntry[] = [
    { minute: 30, phase: 'progresion', team: 'home', zone: 'ataque', lane: 'center', text: 'jugada coral por el centro',
      playerId: 'h7',
      chain: [
        { step: 'recuperacion', lane: 'center', att: { name: 'hPlayer4', playerId: 'h4', attrs: { passing: 70 } }, def: null },
        { step: 'pase_clave', lane: 'center', att: { name: 'hPlayer6', playerId: 'h6', attrs: { passing: 74 } }, def: { name: 'aPlayer5', playerId: 'a5', attrs: { tackling: 55 } } },
        { step: 'pase_clave', lane: 'center', att: { name: 'hPlayer8', playerId: 'h8', attrs: { passing: 72 } }, def: null },
        { step: 'regate', lane: 'center', att: { name: 'hPlayer7', playerId: 'h7', attrs: { dribbling: 75 } }, def: { name: 'aPlayer6', playerId: 'a6', attrs: { tackling: 60 } } },
      ] },
  ];
  const coralAt = (b: number) =>
    computePitchFrame(coral[0], undefined, undefined, undefined, 0, b, home, away, '4-3-3', '4-3-3');

  it('JUEGO ABIERTO: el portador se RELEVA por los ejecutores y acaba en el último', () => {
    const ids = [0, 0.25, 0.5, 0.75, 1].map(b => carrierOf(coralAt(b))?.playerId ?? null);
    expect(ids[0]).not.toBeNull();
    expect(['h4', 'h6', 'h8', 'h7']).toContain(ids[0]);
    expect(ids[4]).toBe('h7');                               // acaba en el último ejecutor
    expect(new Set(ids.filter(Boolean)).size).toBeGreaterThanOrEqual(3); // pasa por ≥3 nombres
  });

  it('CLAVE — el portador va PEGADO al balón (sin el desfase que se veía como bug)', () => {
    // En todo el barrido el disco del portador está casi sobre el balón (no a 2-4u como antes).
    for (const b of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const f = coralAt(b);
      const c = carrierOf(f)!;
      expect(Math.hypot(c.x - f.ball.x, c.y - f.ball.y), `blend ${b}`).toBeLessThan(3.2);
    }
  });

  it('la espina NO tiembla: un ejecutor en reposo queda CLAVADO en su nodo (pinned)', () => {
    // h8 (nodo lejano) no es portador al inicio → su posición es idéntica bit a bit entre frames.
    const a = coralAt(0.05), b = coralAt(0.12);
    const h8a = find(a, 'h8')!, h8b = find(b, 'h8')!;
    expect(h8a.isCarrier).toBe(false);
    expect(h8a.x).toBe(h8b.x);
    expect(h8a.y).toBe(h8b.y);
  });

  it('solo se planta el defensor DECISIVO (último eslabón), no los intermedios', () => {
    const f = coralAt(1);
    const a6 = find(f, 'a6')!;   // par del ÚLTIMO eslabón (regate h7) → plantado junto al balón
    const a5 = find(f, 'a5')!;   // par de un eslabón INTERMEDIO → NO se toca (sin teletransporte)
    // el decisivo queda cerca del final de la jugada (el balón); el intermedio NO.
    expect(Math.hypot(a6.x - f.ball.x, a6.y - f.ball.y)).toBeLessThan(Math.hypot(a5.x - f.ball.x, a5.y - f.ball.y));
    expect(a6.duelRole).toBeDefined();
  });

  it('cadena del VISITANTE: la espina va espejada (ataca a la izquierda)', () => {
    const coralAway: TimelineEntry = {
      minute: 30, phase: 'progresion', team: 'away', zone: 'ataque', lane: 'center', text: 'coral visitante', playerId: 'a7',
      chain: [
        { step: 'recuperacion', lane: 'center', att: { name: 'aPlayer4', playerId: 'a4', attrs: { passing: 70 } }, def: null },
        { step: 'pase_clave', lane: 'center', att: { name: 'aPlayer6', playerId: 'a6', attrs: { passing: 74 } }, def: null },
        { step: 'pase_clave', lane: 'center', att: { name: 'aPlayer8', playerId: 'a8', attrs: { passing: 72 } }, def: null },
        { step: 'regate', lane: 'center', att: { name: 'aPlayer7', playerId: 'a7', attrs: { dribbling: 75 } }, def: null },
      ],
    };
    const f = computePitchFrame(coralAway, undefined, undefined, undefined, 0, 0.5, home, away, '4-3-3', '4-3-3');
    const g = (id: string) => f.away.find(q => String(q.playerId) === id)!;
    expect(g('a4').x).toBeGreaterThan(g('a6').x);            // away ataca a la izquierda → x decrece
    expect(g('a6').x).toBeGreaterThan(g('a8').x);
  });

  it('determinista y finito con cadena coral en todo el barrido', () => {
    for (const b of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const a = JSON.stringify(coralAt(b));
      expect(a).toEqual(JSON.stringify(coralAt(b)));
      const f = coralAt(b);
      for (const p of [...f.home, ...f.away]) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  });

  // ── Casos límite REALES del motor (investigación de engine.py) ──────────────
  // El motor emite: cadenas de 1 a 5 eslabones, penalti=2, setpiece=3 (puede acabar en
  // dos `remate`), `playerId` nullable, y ejecutores consecutivos REPETIDOS (4-2-3-1).
  // Ninguno debe romper el frame ni el determinismo.
  const robust = (step: TimelineEntry, label: string) => {
    for (const b of [0, 0.33, 0.66, 1]) {
      const f = computePitchFrame(step, undefined, undefined, undefined, 0, b, home, away, '4-3-3', '4-3-3');
      expect(JSON.stringify(f), `${label} determinista @${b}`).toEqual(JSON.stringify(
        computePitchFrame(step, undefined, undefined, undefined, 0, b, home, away, '4-3-3', '4-3-3')));
      expect(f.home).toHaveLength(11);
      expect(f.away).toHaveLength(11);
      for (const p of [...f.home, ...f.away]) {
        expect(Number.isFinite(p.x), `${label} x @${b}`).toBe(true);
        expect(Number.isFinite(p.y), `${label} y @${b}`).toBe(true);
      }
    }
  };

  it('cadena de 1 eslabón → sin plan (clásico), no rompe', () => {
    robust({ minute: 5, phase: 'progresion', team: 'home', zone: 'med', lane: 'center', text: 'cortada', playerId: 'a4',
      chain: [{ step: 'recuperacion', lane: 'center', att: { name: 'hP4', playerId: 'h4', attrs: { passing: 60 } }, def: { name: 'aP4', playerId: 'a4', attrs: { tackling: 62 } } }] }, '1-link');
  });

  it('penalti (2 eslabones, remate final) → no rompe', () => {
    robust({ minute: 50, phase: 'gol', team: 'away', zone: 'area', lane: 'center', text: 'penalti', playerId: 'a9',
      chain: [
        { step: 'recuperacion', lane: 'center', att: { name: 'aP9', playerId: 'a9', attrs: { passing: 60 } }, def: null },
        { step: 'remate', lane: 'center', att: { name: 'aP9', playerId: 'a9', attrs: { finishing: 78 } }, def: { name: 'hP1', playerId: 'h1', attrs: { goalkeeping: 70 } } },
      ] }, 'penalty');
  });

  it('setpiece 3 eslabones con doble remate + playerId nulo → no rompe', () => {
    robust({ minute: 60, phase: 'remate', team: 'home', zone: 'area', lane: 'left', text: 'corner', playerId: 'h5',
      chain: [
        { step: 'recuperacion', lane: 'left', att: { name: 'hP5', playerId: 'h5', attrs: { passing: 64 } }, def: null },
        { step: 'remate', lane: 'left', att: { name: 'Sin id', playerId: null, attrs: { finishing: 60 } }, def: null },
        { step: 'remate', lane: 'left', att: { name: 'hP4', playerId: 'h4', attrs: { finishing: 66 } }, def: { name: 'aP1', playerId: 'a1', attrs: { goalkeeping: 68 } } },
      ] }, 'setpiece' );
  });

  it('ejecutores CONSECUTIVOS repetidos (4-2-3-1) → no rompe', () => {
    robust({ minute: 70, phase: 'progresion', team: 'home', zone: 'ataque', lane: 'right', text: 'doble toque', playerId: 'h7',
      chain: [
        { step: 'recuperacion', lane: 'right', att: { name: 'hP6', playerId: 'h6', attrs: { passing: 70 } }, def: null },
        { step: 'pase_clave', lane: 'right', att: { name: 'hP7', playerId: 'h7', attrs: { passing: 74 } }, def: null },
        { step: 'pase_clave', lane: 'right', att: { name: 'hP7', playerId: 'h7', attrs: { passing: 74 } }, def: null },
        { step: 'regate', lane: 'right', att: { name: 'hP9', playerId: 'h9', attrs: { dribbling: 72 } }, def: null },
      ] }, 'repeat');
  });
});
