import crypto from 'crypto';
import type { JwtPayload } from '../../middleware/auth';

const TICKET_TTL_MS = 30_000;
const MAX_TICKETS = 5_000;

type TicketRow = {
  user: JwtPayload;
  expiresAt: number;
};

const tickets = new Map<string, TicketRow>();

function cleanupExpired(now = Date.now()) {
  for (const [ticket, row] of tickets) {
    if (row.expiresAt <= now || tickets.size > MAX_TICKETS) tickets.delete(ticket);
  }
}

export function issueWsTicket(user: JwtPayload) {
  const now = Date.now();
  cleanupExpired(now);
  const ticket = crypto.randomBytes(32).toString('base64url');
  const expiresAt = now + TICKET_TTL_MS;
  tickets.set(ticket, {
    user: { ...user },
    expiresAt,
  });
  return {
    ticket,
    expiresAt,
    expiresInMs: TICKET_TTL_MS,
  };
}

export function consumeWsTicket(ticket: string): JwtPayload | null {
  const row = tickets.get(ticket);
  if (!row) return null;
  tickets.delete(ticket);
  if (row.expiresAt <= Date.now()) return null;
  return { ...row.user };
}
