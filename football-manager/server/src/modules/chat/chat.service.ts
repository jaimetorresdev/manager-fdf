import prisma from '../../db/prisma';
import { realtimeHub } from '../realtime/realtime.hub';
import { rumorsService } from '../market/rumors.service';
import { npcCoachService } from '../manager/npcCoach.service';

// Fase 4 canonical channels: general, liga, federacion, social
const DEFAULT_CHANNELS = [
  { name: 'General', type: 'general' },
  { name: 'Liga', type: 'league' },
  { name: 'Federación', type: 'federation' },
  { name: 'Club Social', type: 'social' },
  { name: 'Taberna FDF', type: 'tavern' },
  { name: 'Rumores', type: 'rumors' },
  { name: 'Ayuda', type: 'help' },
  // Legacy kept for backwards compat
  { name: 'Global', type: 'global' },
  { name: 'Mercado', type: 'market' },
];

const ALLOWED_CHANNEL_TYPES = new Set(DEFAULT_CHANNELS.map((channel) => channel.type));
const ALLOWED_REACTIONS = new Set(['👍', '👏', '🔥', '😂', '😮', '💚', '⚽']);
const REST_RATE_LIMIT_WINDOW_MS = 10_000;
const REST_RATE_LIMIT_MAX = 5;
const restSentAtByUser = new Map<number, number[]>();

export function isAllowedChatChannelType(type: string): boolean {
  return ALLOWED_CHANNEL_TYPES.has(type);
}

function assertAllowedChatChannelType(type: string) {
  if (!isAllowedChatChannelType(type)) throw new Error('Canal de chat no permitido');
}

/* eslint-disable no-control-regex -- sanitización INTENCIONADA de caracteres de
   control de la entrada del usuario; el regex de control-chars ES el objetivo. */
export function sanitizeText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[<>&"]/g, (char) => ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
    }[char] ?? char))
    .trim();
}
/* eslint-enable no-control-regex */

export function assertSocialRateLimit(userId: number) {
  const now = Date.now();
  const sentAt = restSentAtByUser.get(userId) ?? [];
  while (sentAt.length > 0 && now - sentAt[0] > REST_RATE_LIMIT_WINDOW_MS) sentAt.shift();
  if (sentAt.length === 0) restSentAtByUser.delete(userId);
  if (sentAt.length >= REST_RATE_LIMIT_MAX) throw new Error('Demasiados mensajes. Espera unos segundos.');
  sentAt.push(now);
  restSentAtByUser.set(userId, sentAt);
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, sentAt] of restSentAtByUser.entries()) {
    while (sentAt.length > 0 && now - sentAt[0] > REST_RATE_LIMIT_WINDOW_MS) sentAt.shift();
    if (sentAt.length === 0) restSentAtByUser.delete(userId);
  }
}, 60_000).unref();

function extractMentionHandles(text: string): string[] {
  const matches = text.matchAll(/@([A-Za-z0-9_.-]{2,32})/g);
  return [...new Set([...matches].map((match) => match[1]))];
}

function parseMentions(raw: string | null): ChatMention[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function assertReactionEmoji(emoji: string): string {
  const normalized = emoji.trim();
  if (!ALLOWED_REACTIONS.has(normalized)) {
    throw new Error('Reacción no permitida.');
  }
  return normalized;
}

type ChatMention = {
  userId: number;
  managerId: number | null;
  username: string;
  name: string;
  clubShortName: string | null;
};

type ChatRow = {
  id: number;
  channelId: number;
  authorId: number;
  text: string;
  timestamp: Date;
  mentionsJson?: string | null;
};

async function ensureDefaultChannels() {
  const existing = await prisma.chatChannel.findMany();
  const existingTypes = new Set(existing.map((channel) => channel.type));
  const missing = DEFAULT_CHANNELS.filter((channel) => !existingTypes.has(channel.type));
  if (missing.length > 0) {
    await prisma.chatChannel.createMany({ data: missing, skipDuplicates: true });
  }
  return prisma.chatChannel.findMany({ orderBy: { id: 'asc' } });
}

async function buildMessageList(
  channel: { id: number; type: string },
  messages: ChatRow[],
  viewerUserId?: number,
) {
  const authorIds = [...new Set(messages.map((m) => m.authorId))];
  const messageIds = messages.map((m) => m.id);
  const users = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: {
          id: true,
          username: true,
          manager: {
            select: {
              id: true,
              name: true,
              club: { select: { id: true, name: true, shortName: true, badge: true } },
            },
          },
        },
      })
    : [];
  const reactions = messageIds.length
    ? await prisma.chatReaction.findMany({
        where: { messageId: { in: messageIds } },
        orderBy: { createdAt: 'asc' },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const reactionsByMessage = new Map<number, typeof reactions>();
  for (const reaction of reactions) {
    const list = reactionsByMessage.get(reaction.messageId) ?? [];
    list.push(reaction);
    reactionsByMessage.set(reaction.messageId, list);
  }
  return messages.map((m) => {
    const u = userById.get(m.authorId);
    const groupedReactions = new Map<string, { emoji: string; userIds: number[]; count: number; reactedByMe: boolean }>();
    for (const reaction of reactionsByMessage.get(m.id) ?? []) {
      const current = groupedReactions.get(reaction.emoji) ?? { emoji: reaction.emoji, userIds: [], count: 0, reactedByMe: false };
      current.userIds.push(reaction.userId);
      current.count += 1;
      current.reactedByMe = current.reactedByMe || reaction.userId === viewerUserId;
      groupedReactions.set(reaction.emoji, current);
    }
    return {
      id: m.id,
      text: m.text,
      timestamp: m.timestamp,
      mentions: parseMentions(m.mentionsJson ?? null),
      reactions: [...groupedReactions.values()],
      author: {
        id: m.authorId,
        username: u?.username ?? 'unknown',
        name: u?.manager?.name ?? u?.username ?? 'Unknown',
        managerId: u?.manager?.id ?? null,
        avatarUrl: u?.manager?.id ? `/api/public/avatar/${u.manager.id}` : null,
        clubShortName: u?.manager?.club?.shortName ?? null,
        club: u?.manager?.club ?? null,
        online: realtimeHub.isUserOnline(`chat:${channel.type}`, m.authorId),
      },
    };
  });
}

async function resolveMentions(text: string): Promise<ChatMention[]> {
  const handles = extractMentionHandles(text);
  if (handles.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { username: { in: handles } },
    select: {
      id: true,
      username: true,
      manager: {
        select: {
          id: true,
          name: true,
          club: { select: { shortName: true } },
        },
      },
    },
  });
  return users.map((user) => ({
    userId: user.id,
    managerId: user.manager?.id ?? null,
    username: user.username,
    name: user.manager?.name ?? user.username,
    clubShortName: user.manager?.club?.shortName ?? null,
  }));
}

export const chatService = {
  async getChannels() {
    const channels = await ensureDefaultChannels();
    const counts = await prisma.chatMessage.groupBy({
      by: ['channelId'],
      _count: { id: true },
    });
    const countByChannel = new Map(counts.map((row) => [row.channelId, row._count.id]));
    
    // Defensive deduplication by type
    const uniqueChannels = Array.from(
      new Map(channels.map(c => [c.type, c])).values()
    );

    return uniqueChannels.map((channel) => ({
      ...channel,
      messageCount: countByChannel.get(channel.id) ?? 0,
      presence: realtimeHub.presence(`chat:${channel.type}`),
      tavern: channel.type === 'tavern'
        ? { ambiance: 'football_tavern', eventsEndpoint: '/api/chat/tavern/events' }
        : undefined,
    }));
  },

  async getTavernEvents(take = 12) {
    const limit = Math.max(1, Math.min(30, take));
    const [transfers, matches, pressItems, rumorsPayload, npcCareer] = await Promise.all([
      prisma.transferOffer.findMany({
        where: { status: { in: ['accepted', 'accepted_pending_window'] } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          amount: true,
          updatedAt: true,
          player: { select: { id: true, name: true } },
          fromClub: { select: { id: true, shortName: true, badge: true } },
          toClub: { select: { id: true, shortName: true, badge: true } },
        },
      }),
      prisma.match.findMany({
        where: { status: 'played' },
        orderBy: { playedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          playedAt: true,
          homeClub: { select: { id: true, shortName: true, badge: true } },
          awayClub: { select: { id: true, shortName: true, badge: true } },
          matchday: { select: { competition: { select: { id: true, name: true, shortName: true } } } },
        },
      }),
      prisma.pressItem.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, headline: true, createdAt: true, matchdayId: true },
      }),
      rumorsService.getRumors().catch(() => ({ weekKey: '', rumors: [] })),
      npcCoachService.recentCareerEvents(5),
    ]);

    const events = [
      ...transfers.map((transfer) => ({
        id: `transfer-${transfer.id}`,
        type: 'transfer',
        createdAt: transfer.updatedAt,
        headline: `${transfer.fromClub.shortName} cierra a ${transfer.player.name}`,
        detail: transfer.toClub ? `Procede de ${transfer.toClub.shortName}` : 'Operacion cerrada',
        route: `/player/${transfer.player.id}`,
        payload: transfer,
      })),
      ...matches.map((match) => ({
        id: `match-${match.id}`,
        type: 'match_center',
        createdAt: match.playedAt ?? new Date(0),
        headline: `${match.homeClub.shortName} vs ${match.awayClub.shortName} ya tiene cronica`,
        detail: match.matchday?.competition?.shortName ?? match.matchday?.competition?.name ?? 'Partido FDF',
        route: `/matches/${match.id}`,
        payload: { matchId: match.id, resultHidden: true },
      })),
      ...pressItems.map((item) => ({
        id: `press-${item.id}`,
        type: 'press',
        createdAt: item.createdAt,
        headline: item.headline,
        detail: item.matchdayId ? 'Rueda de prensa / previa' : 'Actualidad FDF',
        route: item.matchdayId ? '/press' : '/news',
        payload: item,
      })),
      ...npcCareer,
      ...rumorsPayload.rumors.slice(0, 4).map((rumor) => ({
        id: `rumor-${rumor.id}`,
        type: 'rumor',
        createdAt: new Date(),
        headline: rumor.headline,
        detail: 'Se comenta en la taberna',
        route: '/market',
        payload: { id: rumor.id },
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);

    return {
      theme: 'tavern',
      channels: ['tavern', 'rumors', 'market', 'help'],
      events,
      uiNeed: '// NECESITO: Antigravity debe renderizar taberna con eventos, avatares y canales vivos.',
    };
  },

  // GET by channel type (e.g. 'general', 'league')
  async getChannelByType(type: string) {
    assertAllowedChatChannelType(type);
    await ensureDefaultChannels();
    const channel = await prisma.chatChannel.findFirst({ where: { type } });
    if (!channel) throw new Error('Canal no encontrado');
    return channel;
  },

  // Paginated: cursor-based via `before` (message id) for polling REST
  async getPresence(channelType: string) {
    assertAllowedChatChannelType(channelType);
    await ensureDefaultChannels();
    const channel = await prisma.chatChannel.findFirst({ where: { type: channelType } });
    if (!channel) throw new Error('Canal no encontrado');
    const presence = realtimeHub.presence(`chat:${channel.type}`);
    const userIds = presence.online.map((client) => client.userId);
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            username: true,
            manager: {
              select: {
                id: true,
                name: true,
                club: { select: { id: true, name: true, shortName: true, badge: true } },
              },
            },
          },
        })
      : [];
    const byUser = new Map(users.map((user) => [user.id, user]));
    return {
      channel,
      online: presence.online.map((client) => {
        const user = byUser.get(client.userId);
        return {
          userId: client.userId,
          managerId: client.managerId,
          clubId: client.clubId,
          username: user?.username ?? 'unknown',
          name: user?.manager?.name ?? user?.username ?? 'Unknown',
          avatarUrl: user?.manager?.id ? `/api/public/avatar/${user.manager.id}` : null,
          club: user?.manager?.club ?? null,
        };
      }),
    };
  },

  async getMessages(channelId: number, take = 50, before?: number, viewerUserId?: number) {
    const channel = await prisma.chatChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new Error('Canal no encontrado');

    const limit = Math.max(1, Math.min(100, take));
    const messages = await prisma.chatMessage.findMany({
      where: {
        channelId,
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    const ordered = messages.reverse();
    const enriched = await buildMessageList(channel, ordered, viewerUserId);
    const oldest = ordered[0];

    return {
      channel,
      messages: enriched,
      presence: realtimeHub.presence(`chat:${channel.type}`),
      pagination: {
        take: limit,
        before: before ?? null,
        nextBefore: oldest?.id ?? null,
        hasMore: messages.length === limit,
      },
    };
  },

  async postMessage(channelId: number, authorId: number, text: string) {
    const cleanText = sanitizeText(text);
    if (cleanText.length < 1) throw new Error('Mensaje vacío');
    if (cleanText.length > 500) throw new Error('Mensaje demasiado largo');
    assertSocialRateLimit(authorId);

    const channel = await prisma.chatChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new Error('Canal no encontrado');
    assertAllowedChatChannelType(channel.type);
    const mentions = await resolveMentions(cleanText);

    const created = await prisma.chatMessage.create({
      data: {
        channelId,
        authorId,
        text: cleanText,
        mentionsJson: mentions.length ? JSON.stringify(mentions) : undefined,
      },
    });

    const result = await this.getMessages(channelId, 50, undefined, authorId);
    const latest = result.messages[result.messages.length - 1] ?? null;
    if (latest) {
      realtimeHub.broadcast(`chat:${channel.type}`, 'chat:message', {
        channel: result.channel,
        message: latest,
      });
      for (const mention of mentions) {
        if (mention.userId === authorId) continue;
        realtimeHub.broadcast(`user:${mention.userId}`, 'chat:mention', {
          channel: result.channel,
          message: latest,
          mention,
          route: `/messages?channel=${channel.type}&message=${created.id}`,
        });
      }
    }

    return result;
  },

  async toggleReaction(channelId: number, messageId: number, userId: number, emoji: string) {
    const normalized = assertReactionEmoji(emoji);
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, channelId },
      include: { channel: true },
    });
    if (!message) throw new Error('Mensaje no encontrado.');
    assertAllowedChatChannelType(message.channel.type);

    const existing = await prisma.chatReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji: normalized } },
    });
    const action = existing ? 'removed' : 'added';
    if (existing) {
      await prisma.chatReaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.chatReaction.create({ data: { messageId, userId, emoji: normalized } });
    }

    const [enriched] = await buildMessageList(message.channel, [message], userId);
    realtimeHub.broadcast(`chat:${message.channel.type}`, 'chat:reaction', {
      action,
      message: enriched,
      reaction: { emoji: normalized, userId },
    });
    return { ok: true, action, message: enriched };
  },

  // Convenience: post by channel type (used by other services internally)
  async postToChannelType(type: string, authorId: number, text: string) {
    const channel = await this.getChannelByType(type);
    return this.postMessage(channel.id, authorId, text);
  },
};
