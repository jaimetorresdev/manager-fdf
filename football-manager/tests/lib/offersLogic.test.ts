import { describe, expect, it } from 'vitest';
import {
  assignScoutToTrackedPlayer,
  groupOfferInbox,
  transitionOfferStatus,
  validateOfferTerms,
} from '../../src/lib/offersLogic';

describe('offersLogic', () => {
  it('normaliza bandejas de recibidas, enviadas e historial', () => {
    const inbox = groupOfferInbox([
      { id: 1, status: 'pending', toClubId: 10, fromClubId: 20, amount: 1000 },
      { id: 2, status: 'pending', toClubId: 30, fromClubId: 10, amount: 2000, canEdit: true },
      { id: 3, status: 'accepted', toClubId: 10, fromClubId: 40, amount: 3000 },
    ], 10);
    expect(inbox.received).toHaveLength(1);
    expect(inbox.received[0]?.actions.canAccept).toBe(true);
    expect(inbox.sent[0]?.actions.canEdit).toBe(true);
    expect(inbox.history[0]?.status).toBe('accepted');
    expect(inbox.actionRequiredCount).toBe(1);
  });

  it('aplica maquina de estados cerrada para ofertas', () => {
    expect(transitionOfferStatus('pending', 'accept')).toEqual({ ok: true, status: 'accepted' });
    expect(transitionOfferStatus('accepted', 'reject').ok).toBe(false);
    expect(transitionOfferStatus('agent_proposed', 'counter')).toEqual({ ok: true, status: 'countered' });
  });

  it('valida importes y clausula legal', () => {
    const validation = validateOfferTerms(
      { amount: 900, salary: 1000, years: 5, clause: 400000 },
      { minAmount: 1000, buyerBudget: 5000 },
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain('El importe esta por debajo del minimo exigido.');
    expect(validation.errors).toContain('La clausula supera el limite legal para esos anos de contrato.');
  });

  it('incluye salario mensual al comprobar presupuesto del comprador', () => {
    const okAmount = validateOfferTerms({ amount: 4000, salary: 500, years: 3, clause: 0 }, { buyerBudget: 5000 });
    expect(okAmount.ok).toBe(true);

    const overBudget = validateOfferTerms({ amount: 4000, salary: 1500, years: 3, clause: 0 }, { buyerBudget: 5000 });
    expect(overBudget.ok).toBe(false);
    expect(overBudget.errors).toContain('El club comprador no tiene efectivo suficiente (traspaso + salario mensual).');
  });

  it('elige ojeador por menor carga y mayor efectividad', () => {
    const plan = assignScoutToTrackedPlayer(
      [{ id: 1, name: 'A', effectiveness: 60 }, { id: 2, name: 'B', effectiveness: 80 }],
      [{ id: 5, scoutStaffId: 2, playerId: 7, analysisPoints: 10 }],
      { playerId: 99 },
    );
    expect(plan.ok).toBe(true);
    expect(plan.scoutId).toBe('1');
    expect(plan.reportTurn).toBe('next_turn');
  });

  it('reutiliza ojeador si el jugador ya tiene informe en curso', () => {
    const plan = assignScoutToTrackedPlayer(
      [{ id: 1, name: 'A', effectiveness: 60 }],
      [{ id: 10, scoutStaffId: 1, playerId: 99, analysisPoints: 40 }],
      { playerId: 99 },
    );
    expect(plan.ok).toBe(true);
    expect(plan.alreadyAssigned).toBe(true);
    expect(plan.scoutId).toBe('1');
    expect(plan.initialProgress).toBe(40);
  });
});
