import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import type { JwtPayload } from '../../middleware/auth';
import { chatService, isAllowedChatChannelType } from '../chat/chat.service';
import { realtimeHub, type RealtimeChannel } from './realtime.hub';
import { consumeWsTicket, issueWsTicket } from './wsTickets';

const incomingSchema = z.object({
  type: z.string(),
  text: z.string().min(1).max(500).optional(),
});

function bearerTokenFromRequest(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return null;
}

function verifyWsUser(app: FastifyInstance, request: FastifyRequest): JwtPayload | null {
  const token = bearerTokenFromRequest(request);
  if (token) {
    try {
      return app.jwt.verify<JwtPayload>(token);
    } catch {
      return null;
    }
  }

  const query = request.query as { ticket?: string; token?: string } | undefined;
  if (query?.ticket) return consumeWsTicket(query.ticket);
  if (!query?.token || !env.allowLegacyWsTokenQuery) return null;

  try {
    return app.jwt.verify<JwtPayload>(query.token);
  } catch {
    return null;
  }
}

function subscribeOrClose(
  app: FastifyInstance,
  request: FastifyRequest,
  socket: { close: (code?: number, reason?: Buffer) => void },
  channel: RealtimeChannel,
) {
  const user = verifyWsUser(app, request);
  if (!user) {
    socket.close(1008, Buffer.from('No autorizado'));
    return null;
  }

  subscribeVerifiedUser(socket, channel, user);
  return user;
}

function subscribeVerifiedUser(
  socket: { close: (code?: number, reason?: Buffer) => void },
  channel: RealtimeChannel,
  user: JwtPayload,
) {
  realtimeHub.subscribe(channel, {
    socket: socket as never,
    userId: user.userId,
    managerId: user.managerId,
    clubId: user.clubId,
  });
}

export async function realtimeRoutes(app: FastifyInstance) {
  app.post('/ticket', {
    preHandler: [authenticate],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const issued = issueWsTicket(request.user);
    return reply
      .header('Cache-Control', 'no-store')
      .send({
        ticket: issued.ticket,
        expiresAt: new Date(issued.expiresAt).toISOString(),
        expiresInMs: issued.expiresInMs,
      });
  });

  app.get<{ Params: { channel: string } }>('/chat/:channel', { websocket: true }, (connection, request) => {
    const channelType = request.params.channel;
    if (!isAllowedChatChannelType(channelType)) {
      connection.socket.close(1008, Buffer.from('Canal no permitido'));
      return;
    }
    const channel = `chat:${channelType}` as RealtimeChannel;
    const user = subscribeOrClose(app, request, connection.socket, channel);
    if (!user) return;
    const sentAt: number[] = [];

    connection.socket.on('message', async (raw) => {
      try {
        let parsedRaw;
        try {
          parsedRaw = JSON.parse(raw.toString());
        } catch {
          connection.socket.send(JSON.stringify({ type: 'error', payload: { error: 'JSON no válido' } }));
          return;
        }
        const parsed = incomingSchema.safeParse(parsedRaw);
        if (!parsed.success) {
          connection.socket.send(JSON.stringify({ type: 'error', payload: { error: 'Mensaje no válido' } }));
          return;
        }
        if (parsed.data.type === 'ping') {
          connection.socket.send(JSON.stringify({ type: 'pong', ts: new Date().toISOString() }));
          return;
        }
        if (parsed.data.type === 'chat:send' && parsed.data.text) {
          const now = Date.now();
          while (sentAt.length > 0 && now - sentAt[0] > 10_000) sentAt.shift();
          if (sentAt.length >= 5) {
            connection.socket.send(JSON.stringify({ type: 'error', payload: { error: 'Demasiados mensajes. Espera unos segundos.' } }));
            return;
          }
          sentAt.push(now);
          const result = await chatService.postToChannelType(channelType, user.userId, parsed.data.text);
          connection.socket.send(JSON.stringify({ type: 'chat:ack', payload: result, ts: new Date().toISOString() }));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error en tiempo real';
        connection.socket.send(JSON.stringify({ type: 'error', payload: { error: msg } }));
      }
    });
  });

  app.get<{ Params: { auctionId: string } }>('/auction/:auctionId', { websocket: true }, (connection, request) => {
    const auctionId = Number.parseInt(request.params.auctionId, 10);
    if (!Number.isInteger(auctionId) || auctionId < 1) {
      connection.socket.close(1008, Buffer.from('ID de subasta no válido'));
      return;
    }
    subscribeOrClose(app, request, connection.socket, `auction:${auctionId}`);
  });

  app.get<{ Params: { leagueId: string } }>('/league/:leagueId', { websocket: true }, (connection, request) => {
    const leagueId = Number.parseInt(request.params.leagueId, 10);
    if (!Number.isInteger(leagueId) || leagueId < 1) {
      connection.socket.close(1008, Buffer.from('ID de liga no válido'));
      return;
    }
    subscribeOrClose(app, request, connection.socket, `league:${leagueId}`);
  });

  app.get<{ Params: { clubId: string } }>('/club/:clubId', { websocket: true }, (connection, request) => {
    const clubId = Number.parseInt(request.params.clubId, 10);
    const user = verifyWsUser(app, request);
    if (!user || user.clubId !== clubId) {
      connection.socket.close(1008, Buffer.from('No autorizado'));
      return;
    }
    subscribeVerifiedUser(connection.socket, `club:${clubId}`, user);
  });

  app.get<{ Params: { userId: string } }>('/user/:userId', { websocket: true }, (connection, request) => {
    const userId = Number.parseInt(request.params.userId, 10);
    const user = verifyWsUser(app, request);
    if (!user || user.userId !== userId) {
      connection.socket.close(1008, Buffer.from('No autorizado'));
      return;
    }
    subscribeVerifiedUser(connection.socket, `user:${userId}`, user);
  });

  app.get('/system', { websocket: true }, (connection, request) => {
    subscribeOrClose(app, request, connection.socket, 'system:world');
  });

  app.get<{ Params: { matchId: string } }>('/match/:matchId', { websocket: true }, (connection, request) => {
    const matchId = Number.parseInt(request.params.matchId, 10);
    const user = verifyWsUser(app, request);
    if (!user || !Number.isInteger(matchId) || matchId < 1) {
      connection.socket.close(1008, Buffer.from('No autorizado'));
      return;
    }
    // Anyone authenticated can subscribe to match events
    subscribeVerifiedUser(connection.socket, `match:${matchId}`, user);
  });
}
