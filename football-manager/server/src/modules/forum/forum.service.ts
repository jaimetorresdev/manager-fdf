// ─── Forum Service ─────────────────────────────────────────────────────────────
// Simple threaded forum with categories: dudas, bugs, general, sugerencias

import prisma from '../../db/prisma';
import { assertSocialRateLimit, sanitizeText } from '../chat/chat.service';

const ALLOWED_CATEGORIES = ['general', 'dudas', 'bugs', 'sugerencias'];

async function enrichPosts(posts: Array<{ id: number; authorId: number; text: string; threadId: number }>) {
  const authorIds = [...new Set(posts.map((p) => p.authorId))];
  const users = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: {
          id: true,
          username: true,
          manager: { select: { name: true, club: { select: { shortName: true } } } },
        },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  return posts.map((p) => {
    const u = userMap.get(p.authorId);
    return {
      id: p.id,
      threadId: p.threadId,
      text: p.text,
      author: {
        id: p.authorId,
        username: u?.username ?? 'unknown',
        name: u?.manager?.name ?? u?.username ?? 'Unknown',
        clubShortName: u?.manager?.club?.shortName ?? null,
      },
    };
  });
}

export const forumService = {
  // ─── List threads (optionally by category) ───────────────────────────────
  async listThreads(category?: string) {
    const threads = await prisma.forumThread.findMany({
      where: category ? { category } : undefined,
      include: { _count: { select: { posts: true } } },
      orderBy: { id: 'desc' },
      take: 100,
    });
    return threads.map((t) => ({
      id: t.id,
      category: t.category,
      title: t.title,
      postCount: t._count.posts,
    }));
  },

  // ─── Get thread with posts ───────────────────────────────────────────────
  async getThread(threadId: number) {
    const thread = await prisma.forumThread.findUnique({
      where: { id: threadId },
      include: { posts: { orderBy: { id: 'asc' } } },
    });
    if (!thread) throw new Error('Thread not found');
    const posts = await enrichPosts(thread.posts);
    return { id: thread.id, category: thread.category, title: thread.title, posts };
  },

  // ─── Create thread ───────────────────────────────────────────────────────
  async createThread(userId: number, category: string, title: string, text: string) {
    if (!ALLOWED_CATEGORIES.includes(category)) {
      throw new Error(`Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(', ')}`);
    }
    const cleanTitle = sanitizeText(title);
    const cleanText = sanitizeText(text);
    if (cleanTitle.length < 3) throw new Error('Title too short');
    if (cleanText.length < 5) throw new Error('Text too short');

    assertSocialRateLimit(userId);

    const thread = await prisma.forumThread.create({
      data: {
        category,
        title: cleanTitle,
        posts: {
          create: { authorId: userId, text: cleanText },
        },
      },
      include: { posts: true },
    });

    const posts = await enrichPosts(thread.posts);
    return { id: thread.id, category: thread.category, title: thread.title, posts };
  },

  // ─── Reply to thread ─────────────────────────────────────────────────────
  async reply(userId: number, threadId: number, text: string) {
    const cleanText = sanitizeText(text);
    if (cleanText.length < 1) throw new Error('Empty reply');
    if (cleanText.length > 5000) throw new Error('Reply too long');

    assertSocialRateLimit(userId);

    const thread = await prisma.forumThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new Error('Thread not found');

    await prisma.forumPost.create({
      data: { threadId, authorId: userId, text: cleanText },
    });

    return this.getThread(threadId);
  },
};
