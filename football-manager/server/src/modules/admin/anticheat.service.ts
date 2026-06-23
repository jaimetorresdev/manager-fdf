import prisma from '../../db/prisma';

// ─── Anticheat — señales robustas + bloqueo real ─────────────────────────────
//
// AUDIT 5.9-4 / 5.9-5:
//  - Antes el sistema SOLO registraba (nunca bloqueaba) y el umbral 5× era laxo;
//    además no cubría INFRAvaloraciones (vender baratísimo a una cuenta amiga es el
//    vector colusivo más común).
//  - `checkMultiAccount` dependía SOLO de `lastIp`, lo que genera falsos positivos
//    masivos bajo NAT/CGNAT (muchos usuarios comparten IP pública) y se evade trivial-
//    mente cambiando de red.
//
// Ahora:
//  - `logSuspiciousTransfer` marca tanto sobre- como infravaloración y BLOQUEA
//    (lanza) los casos extremos.
//  - `checkMultiAccount` combina varias señales independientes; la IP compartida por
//    sí sola se REGISTRA pero no bloquea (evita CGNAT). Solo bloquea cuando coinciden
//    ≥2 señales (IP + proximidad de alta + huella de avatar).

// Sobrepago: marca a partir de 3×, bloquea a partir de 10× del valor de mercado.
const OVERPAY_FLAG = 3;
const OVERPAY_BLOCK = 10;
// Infrapago: para jugadores con valor relevante, marca por debajo del 30% y bloquea
// por debajo del 10% del valor de mercado (regalo encubierto entre cuentas).
const UNDERPAY_FLAG = 0.3;
const UNDERPAY_BLOCK = 0.1;
const UNDERPAY_MIN_VALUE = 100_000; // por debajo de esto, ventas baratas son normales

// Ventana de proximidad de creación de cuentas (señal de granja de cuentas).
const ACCOUNT_PROXIMITY_MS = 60 * 60 * 1000; // 1 h

export interface TransferClassification {
  severity: 'block' | 'flag' | null;
  kind: 'OVERPAY' | 'UNDERPAY' | '';
  ratio: number;
}

/** Lógica pura de clasificación de un traspaso por su ratio precio/valor. */
export function classifyTransfer(amount: number, marketValue: number): TransferClassification {
  const mv = Number(marketValue) || 0;
  if (mv <= 0) return { severity: null, kind: '', ratio: 0 };
  const ratio = amount / mv;
  if (ratio >= OVERPAY_BLOCK) return { severity: 'block', kind: 'OVERPAY', ratio };
  if (ratio >= OVERPAY_FLAG) return { severity: 'flag', kind: 'OVERPAY', ratio };
  if (mv >= UNDERPAY_MIN_VALUE && ratio <= UNDERPAY_BLOCK) return { severity: 'block', kind: 'UNDERPAY', ratio };
  if (mv >= UNDERPAY_MIN_VALUE && ratio <= UNDERPAY_FLAG) return { severity: 'flag', kind: 'UNDERPAY', ratio };
  return { severity: null, kind: '', ratio };
}

export const anticheatService = {
  async logSuspiciousTransfer(
    userId: number,
    clubId: number,
    amount: number,
    marketValue: number,
    playerId: number,
    reason: string,
  ) {
    const mv = Number(marketValue) || 0;
    const { severity, kind, ratio } = classifyTransfer(amount, marketValue);
    if (!severity) return;

    await prisma.anticheatAlert.create({
      data: {
        userId,
        clubId,
        type: 'SUSPICIOUS_TRANSFER',
        details: JSON.stringify({ amount, marketValue: mv, ratio: Number(ratio.toFixed(3)), playerId, reason, kind, severity }),
      },
    });

    if (severity === 'block') {
      throw new Error(
        kind === 'UNDERPAY'
          ? 'Operación bloqueada por el Sistema Antitrampa: precio muy por debajo del valor de mercado.'
          : 'Operación bloqueada por el Sistema Antitrampa: precio muy por encima del valor de mercado.',
      );
    }
  },

  async checkMultiAccount(userId1: number, userId2: number) {
    if (userId1 === userId2) return;

    const [user1, user2] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId1 }, select: { lastIp: true, createdAt: true, avatarSeed: true } }),
      prisma.user.findUnique({ where: { id: userId2 }, select: { lastIp: true, createdAt: true, avatarSeed: true } }),
    ]);
    if (!user1 || !user2) return;

    const signals: string[] = [];
    const sharedIp = !!user1.lastIp && user1.lastIp === user2.lastIp;
    if (sharedIp) signals.push('shared_ip');
    if (Math.abs(user1.createdAt.getTime() - user2.createdAt.getTime()) <= ACCOUNT_PROXIMITY_MS) {
      signals.push('account_proximity');
    }
    if (!!user1.avatarSeed && user1.avatarSeed === user2.avatarSeed) {
      signals.push('shared_device_seed');
    }

    if (signals.length === 0) return;

    // Una sola señal débil (típicamente solo IP) → registrar para revisión, NO bloquear
    // (evita falsos positivos por NAT/CGNAT). ≥2 señales → bloqueo real.
    const block = signals.length >= 2;
    await prisma.anticheatAlert.create({
      data: {
        userId: userId1,
        type: 'MULTIACCOUNT',
        ip: user1.lastIp ?? null,
        details: JSON.stringify({ otherUserId: userId2, signals, blocked: block }),
        status: block ? 'pending' : 'investigating',
      },
    });

    if (block) {
      throw new Error('Operación bloqueada: detectadas múltiples señales de cuentas vinculadas.');
    }
  },
};
