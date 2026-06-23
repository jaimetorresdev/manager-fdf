import { describe, it, expect } from 'vitest';
import { classifyTransfer } from './anticheat.service';

describe('classifyTransfer (AUDIT 5.9-4 — señales de traspaso fraudulento)', () => {
  it('precio normal no marca nada', () => {
    expect(classifyTransfer(1_000_000, 1_000_000).severity).toBeNull();
    expect(classifyTransfer(2_000_000, 1_000_000).severity).toBeNull(); // 2× aún normal
  });

  it('sobrepago: marca a 3×, bloquea a 10×', () => {
    expect(classifyTransfer(3_000_000, 1_000_000)).toMatchObject({ severity: 'flag', kind: 'OVERPAY' });
    expect(classifyTransfer(10_000_000, 1_000_000)).toMatchObject({ severity: 'block', kind: 'OVERPAY' });
  });

  it('infrapago: cubre el vector colusivo (vender baratísimo a una cuenta amiga)', () => {
    expect(classifyTransfer(200_000, 1_000_000)).toMatchObject({ severity: 'flag', kind: 'UNDERPAY' });
    expect(classifyTransfer(50_000, 1_000_000)).toMatchObject({ severity: 'block', kind: 'UNDERPAY' });
  });

  it('jugadores de poco valor no disparan infrapago (ventas baratas normales)', () => {
    expect(classifyTransfer(1, 50_000).severity).toBeNull();
  });

  it('sin valor de mercado de referencia no juzga', () => {
    expect(classifyTransfer(5_000_000, 0).severity).toBeNull();
  });
});
