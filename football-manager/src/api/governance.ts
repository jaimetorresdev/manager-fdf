// ─── Governance API — Master & FIFA endpoints ────────────────────────────────
import { request } from './client';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface GlobalSettings {
  TICK_CRON_T1: string;
  TICK_CRON_T2: string;
  ECONOMY_INCOME_MULT: number;
  ECONOMY_SALARY_MULT: number;
  ECONOMY_TRANSFER_MULT: number;
  MAINTENANCE_MODE: boolean;
  FEATURE_CHAT: boolean;
  FEATURE_MARKET: boolean;
  FEATURE_FRIENDLIES: boolean;
}

export interface UserRow {
  id: number;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  lastIp: string | null;
  manager: {
    id: number;
    name: string;
    clubId: number | null;
    club: { id: number; name: string; shortName: string; badge: string } | null;
  } | null;
}

export interface AnticheatAlert {
  id: number;
  userId: number | null;
  clubId: number | null;
  ip: string | null;
  type: string;
  details: string;
  createdAt: string;
  resolved: boolean;
  user: { id: number; username: string; email: string; role: string } | null;
}

export interface ChatMessageRow {
  id: number;
  channelId: number;
  authorId: number;
  text: string;
  timestamp: string;
  channel: { id: number; name: string; type: string };
}

export interface ForumPostRow {
  id: number;
  threadId: number;
  authorId: number;
  text: string;
  thread: { id: number; title: string; category: string };
}

export interface ImpersonateResult {
  token: string;
  impersonating: {
    userId: number;
    managerId: number;
    clubId: number | null;
    username: string;
    role: string;
  };
}

// ─── Master API ──────────────────────────────────────────────────────────────

export const masterApi = {
  getSettings: () => request<GlobalSettings>('/master/settings'),

  saveSettings: (data: Partial<GlobalSettings>) =>
    request<GlobalSettings>('/master/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  listUsers: () => request<UserRow[]>('/master/users'),

  setRole: (userId: number, role: string) =>
    request<{ ok: boolean; userId: number; newRole: string }>(
      `/master/users/${userId}/role`,
      { method: 'POST', body: JSON.stringify({ role }) }
    ),

  impersonate: (userId: number) =>
    request<ImpersonateResult>(`/master/impersonate/${userId}`, {
      method: 'POST',
    }),
};

// ─── FIFA API ────────────────────────────────────────────────────────────────

export const fifaApi = {
  getAlerts: () => request<AnticheatAlert[]>('/fifa/alerts'),

  resolveAlert: (alertId: number) =>
    request<{ ok: boolean }>(`/fifa/alerts/${alertId}/resolve`, {
      method: 'POST',
    }),

  getChatMessages: (take = 50) =>
    request<ChatMessageRow[]>(`/fifa/moderation/chat?take=${take}`),

  deleteChatMessage: (id: number) =>
    request<{ ok: boolean }>(`/fifa/moderation/chat/${id}`, {
      method: 'DELETE',
    }),

  getForumPosts: (take = 50) =>
    request<ForumPostRow[]>(`/fifa/moderation/forum?take=${take}`),

  deleteForumPost: (id: number) =>
    request<{ ok: boolean }>(`/fifa/moderation/forum/${id}`, {
      method: 'DELETE',
    }),

  sanction: (data: {
    managerId: number;
    reason: string;
    budgetPenalty?: number;
    suspendTurns?: number;
  }) =>
    request<{ ok: boolean; managerId: number; reason: string; budgetPenalty?: number; suspendTurns?: number }>(
      '/fifa/sanction',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  getEconomy: () =>
    request<{
      gameState: { week: number; turn: number; phase: string; inGameDate: string; nextTickAt: string | null } | null;
      recentFinance: Array<{ id: number; week: number; season: string; budget: number; income: number; expenses: number; club: { id: number; name: string; shortName: string } }>;
    }>('/fifa/economy'),
};
