import prisma from '../../db/prisma';
import { assertSocialRateLimit, sanitizeText } from '../chat/chat.service';
import { realtimeHub } from '../realtime/realtime.hub';

async function userLabels(userIds: number[]) {
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          manager: { select: { id: true, name: true, club: { select: { id: true, name: true, shortName: true } } } },
        },
      })
    : [];
  return new Map(users.map((user) => [user.id, {
    id: user.id,
    managerId: user.manager?.id ?? null,
    username: user.username,
    name: user.manager?.name ?? user.username,
    clubId: user.manager?.club?.id ?? null,
    clubName: user.manager?.club?.name ?? null,
    clubShortName: user.manager?.club?.shortName ?? null,
  }]));
}

async function userIdForManager(managerId: number): Promise<number> {
  const user = await prisma.user.findFirst({
    where: { manager: { is: { id: managerId } } },
    select: { id: true },
  });
  if (!user) throw new Error('Manager not found');
  return user.id;
}

export const messagesService = {
  async inbox(userId: number) {
    const messages = await prisma.privateMessage.findMany({
      where: { toId: userId },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    const labels = await userLabels([...new Set(messages.map((message) => message.fromId))]);
    return messages.map((message) => ({
      ...message,
      from: labels.get(message.fromId) ?? { id: message.fromId, username: 'unknown', name: 'Unknown', clubShortName: null },
    }));
  },

  async sent(userId: number) {
    const messages = await prisma.privateMessage.findMany({
      where: { fromId: userId },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    const labels = await userLabels([...new Set(messages.map((message) => message.toId))]);
    return messages.map((message) => ({
      ...message,
      to: labels.get(message.toId) ?? { id: message.toId, username: 'unknown', name: 'Unknown', clubShortName: null },
    }));
  },

  async send(fromId: number, toId: number, subject: string, body: string) {
    assertSocialRateLimit(fromId);
    if (fromId === toId) throw new Error('Cannot send a message to yourself');
    const recipient = await prisma.user.findUnique({ where: { id: toId } });
    if (!recipient) throw new Error('Recipient not found');

    const cleanSubject = sanitizeText(subject);
    const cleanBody = sanitizeText(body);

    const message = await prisma.privateMessage.create({
      data: {
        fromId,
        toId,
        subject: cleanSubject,
        body: cleanBody,
      },
    });

    realtimeHub.broadcast(`user:${toId}`, 'dm:new', { message });

    return message;
  },

  async sendToManager(fromId: number, toManagerId: number, subject: string, body: string) {
    const toId = await userIdForManager(toManagerId);
    return this.send(fromId, toId, subject, body);
  },

  async conversations(userId: number) {
    const [inbox, sent] = await Promise.all([
      prisma.privateMessage.findMany({
        where: { toId: userId },
        orderBy: { timestamp: 'desc' },
        take: 200,
      }),
      prisma.privateMessage.findMany({
        where: { fromId: userId },
        orderBy: { timestamp: 'desc' },
        take: 200,
      }),
    ]);
    const messages = [...inbox, ...sent].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const otherUserIds = [...new Set(messages.map(message => message.fromId === userId ? message.toId : message.fromId))];
    const labels = await userLabels(otherUserIds);
    const grouped = new Map<number, {
      managerId: number;
      username: string;
      clubName: string | null;
      lastMessage: { body: string; createdAt: Date; fromMe: boolean };
      unread: number;
    }>();

    for (const message of messages) {
      const otherUserId = message.fromId === userId ? message.toId : message.fromId;
      const label = labels.get(otherUserId);
      if (!label?.managerId) continue;
      const existing = grouped.get(label.managerId);
      if (!existing) {
        grouped.set(label.managerId, {
          managerId: label.managerId,
          username: label.username,
          clubName: label.clubName,
          lastMessage: {
            body: message.body,
            createdAt: message.timestamp,
            fromMe: message.fromId === userId,
          },
          unread: message.toId === userId && !message.read ? 1 : 0,
        });
      } else if (message.toId === userId && !message.read) {
        existing.unread++;
      }
    }

    return [...grouped.values()].sort((a, b) =>
      b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime()
    );
  },

  async thread(userId: number, managerId: number, limit = 50) {
    const otherUserId = await userIdForManager(managerId);
    const messages = await prisma.privateMessage.findMany({
      where: {
        OR: [
          { fromId: userId, toId: otherUserId },
          { fromId: otherUserId, toId: userId },
        ],
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    await prisma.privateMessage.updateMany({
      where: { fromId: otherUserId, toId: userId, read: false },
      data: { read: true },
    });

    return messages.reverse().map((message) => ({
      id: message.id,
      subject: message.subject,
      body: message.body,
      createdAt: message.timestamp,
      fromMe: message.fromId === userId,
      read: message.read,
    }));
  },

  async markRead(userId: number, messageId: number) {
    const message = await prisma.privateMessage.findUnique({ where: { id: messageId } });
    if (!message || message.toId !== userId) throw new Error('Message not found');

    return prisma.privateMessage.update({
      where: { id: messageId },
      data: { read: true },
    });
  },

  // AUDIT H-41: read-receipt explícito de un hilo (sin tener que traer los mensajes).
  // El frontend (Carril 3) lo llama al abrir la conversación; así el badge de "no
  // leído" no reaparece tras el polling de `conversations`. `thread()` ya marcaba al
  // leer, pero esto da un endpoint ligero independiente.
  async markThreadRead(userId: number, managerId: number) {
    const otherUserId = await userIdForManager(managerId);
    const result = await prisma.privateMessage.updateMany({
      where: { fromId: otherUserId, toId: userId, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  },

  // DELETE — a user can delete a message from their inbox (or sent box)
  async deleteMessage(userId: number, messageId: number) {
    const message = await prisma.privateMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new Error('Message not found');
    if (message.toId !== userId && message.fromId !== userId) {
      throw new Error('Not authorized to delete this message');
    }
    await prisma.privateMessage.delete({ where: { id: messageId } });
    return { deleted: messageId };
  },

  // Mark all as read for a user
  async markAllRead(userId: number) {
    const result = await prisma.privateMessage.updateMany({
      where: { toId: userId, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  },

  // Unread count
  async unreadCount(userId: number) {
    const count = await prisma.privateMessage.count({
      where: { toId: userId, read: false },
    });
    return { unread: count };
  },
};
