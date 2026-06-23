import type { FastifyBaseLogger } from 'fastify';
import type { WebSocket } from 'ws';

export type RealtimeChannel = `chat:${string}` | `league:${number}` | `auction:${number}` | `club:${number}` | `user:${number}` | `match:${number}` | `system:${string}`;

export interface RealtimeEvent<T = unknown> {
  type: string;
  channel: RealtimeChannel;
  payload: T;
  ts: string;
}

type Client = {
  socket: WebSocket;
  userId: number;
  managerId: number;
  clubId: number | null;
};

const subscriptions = new Map<RealtimeChannel, Set<Client>>();

function presenceForClients(clients: Set<Client> | undefined) {
  const byUser = new Map<number, Client>();
  for (const client of clients ?? []) {
    if (client.socket.readyState === 1 && !byUser.has(client.userId)) byUser.set(client.userId, client);
  }
  return [...byUser.values()].map((client) => ({
    userId: client.userId,
    managerId: client.managerId,
    clubId: client.clubId,
  }));
}

function broadcastPresence(channel: RealtimeChannel) {
  if (!channel.startsWith('chat:')) return;
  realtimeHub.broadcast(channel, 'chat:presence', {
    channel,
    online: presenceForClients(subscriptions.get(channel)),
  });
}

function safeSend(client: Client, data: unknown) {
  if (client.socket.readyState !== 1) return;
  client.socket.send(JSON.stringify(data));
}

export const realtimeHub = {
  subscribe(channel: RealtimeChannel, client: Client) {
    const clients = subscriptions.get(channel) ?? new Set<Client>();
    clients.add(client);
    subscriptions.set(channel, clients);

    safeSend(client, {
      type: 'subscription:ready',
      channel,
      payload: { channel },
      ts: new Date().toISOString(),
    });
    broadcastPresence(channel);

    client.socket.once('close', () => {
      const currentClients = subscriptions.get(channel);
      if (currentClients) {
        currentClients.delete(client);
        if (currentClients.size === 0) subscriptions.delete(channel);
      }
      broadcastPresence(channel);
    });
  },

  broadcast<T>(channel: RealtimeChannel, type: string, payload: T, log?: FastifyBaseLogger) {
    const event: RealtimeEvent<T> = {
      type,
      channel,
      payload,
      ts: new Date().toISOString(),
    };
    const encoded = JSON.stringify(event);
    const clients = subscriptions.get(channel);
    if (!clients || clients.size === 0) return event;

    for (const client of clients) {
      if (client.socket.readyState === 1) {
        client.socket.send(encoded);
      } else {
        clients.delete(client);
      }
    }

    log?.debug({ channel, type, clients: clients.size }, 'Realtime event broadcast');
    return event;
  },

  stats() {
    return Array.from(subscriptions.entries()).map(([channel, clients]) => ({
      channel,
      clients: clients.size,
    }));
  },

  presence(channel: RealtimeChannel) {
    return {
      channel,
      online: presenceForClients(subscriptions.get(channel)),
    };
  },

  isUserOnline(channel: RealtimeChannel, userId: number) {
    return presenceForClients(subscriptions.get(channel)).some((client) => client.userId === userId);
  },
};
