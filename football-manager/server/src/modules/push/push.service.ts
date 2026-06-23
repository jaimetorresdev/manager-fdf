import webpush from 'web-push';
import { isIP } from 'node:net';
import prisma from '../../db/prisma';
import { serverT } from '../i18n/serverStrings';

export interface BrowserPushSubscription {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
}

let vapidConfigured = false;
const ALLOWED_PUSH_DOMAINS = [
  'push.services.mozilla.com',
  'googleapis.com',
  'notify.windows.com',
  'push.apple.com',
];

function configureVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@managerfdf.local';
  if (!publicKey || !privateKey) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  }
  return true;
}

function toWebPushSubscription(row: { endpoint: string; p256dh: string; auth: string }) {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };
}

function isAllowedPushHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (isIP(host) || host === 'localhost' || host.endsWith('.localhost')) return false;
  return ALLOWED_PUSH_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function assertAllowedPushEndpoint(endpoint: string) {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('Endpoint push no válido');
  }
  if (parsed.protocol !== 'https:') throw new Error('Endpoint push no permitido');
  if (!isAllowedPushHostname(parsed.hostname)) throw new Error('Host push no permitido');
}

async function sendBrowserPush(userId: number, input: { title: string; body: string; url?: string; type?: string }) {
  if (!configureVapid()) return { queued: 0, sent: 0, failed: 0, enabled: false };

  const rows = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  });
  let sent = 0;
  let failed = 0;
  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url ?? '/dashboard',
    type: input.type ?? 'push',
  });

  for (const row of rows) {
    try {
      assertAllowedPushEndpoint(row.endpoint);
      await webpush.sendNotification(toWebPushSubscription(row), payload);
      sent++;
    } catch (err: any) {
      failed++;
      const status = Number(err?.statusCode ?? err?.status);
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.deleteMany({ where: { endpoint: row.endpoint } });
      }
    }
  }

  return { queued: rows.length, sent, failed, enabled: true };
}

export const pushService = {
  publicConfig() {
    return {
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
      enabled: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    };
  },

  async subscribe(userId: number, subscription: BrowserPushSubscription, userAgent?: string | null) {
    assertAllowedPushEndpoint(subscription.endpoint);
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;
    if (!p256dh || !auth) throw new Error('Faltan claves de suscripción');
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
      select: { id: true, userId: true },
    });
    if (existing && existing.userId !== userId) {
      throw new Error('Este endpoint push ya pertenece a otro usuario');
    }
    const row = existing
      ? await prisma.pushSubscription.update({
          where: { id: existing.id },
          data: { p256dh, auth, userAgent: userAgent ?? null },
        })
      : await prisma.pushSubscription.create({
          data: { userId, endpoint: subscription.endpoint, p256dh, auth, userAgent: userAgent ?? null },
        });
    const count = await prisma.pushSubscription.count({ where: { userId } });
    return { ok: true, subscriptionId: row.id, subscriptions: count, storage: 'database' };
  },

  async unsubscribe(userId: number, endpoint: string) {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    const count = await prisma.pushSubscription.count({ where: { userId } });
    return { ok: true, subscriptions: count, storage: 'database' };
  },

  async notifyUser(userId: number, input: { type: string; title: string; message: string; url?: string }) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        message: input.url ? `${input.message}\n${input.url}` : input.message,
      },
    });
    const push = await sendBrowserPush(userId, {
      type: input.type,
      title: input.title,
      body: input.message,
      url: input.url,
    });
    return { notification, pushQueued: push.queued, sent: push.sent, failed: push.failed, enabled: push.enabled };
  },
};

export async function sendPushToUser(userId: number, input: { title: string; body: string; url?: string; type?: string }) {
  return pushService.notifyUser(userId, {
    type: input.type ?? 'push',
    title: input.title,
    message: input.body,
    url: input.url,
  });
}

export function pushTurnProcessed(userId: number) {
  return sendPushToUser(userId, {
    type: 'turn_processed',
    title: serverT('notification.turn_processed.title'),
    body: serverT('notification.turn_processed.body'),
    url: '/dashboard',
  });
}

export function pushLiveGoal(userId: number, matchId: number, body: string) {
  return sendPushToUser(userId, {
    type: 'live_goal',
    title: serverT('push.live_goal.title'),
    body,
    url: `/matches/${matchId}`,
  });
}

export function pushAuctionOutbid(userId: number, auctionId: number, body: string) {
  return sendPushToUser(userId, {
    type: 'auction_outbid',
    title: serverT('push.auction_outbid.title'),
    body,
    url: `/auctions/${auctionId}`,
  });
}
