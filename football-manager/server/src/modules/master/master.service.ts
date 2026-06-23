// ─── Master Service — control total ───────────────────────────────────────────
import prisma from '../../db/prisma';

// ─── Settings (GlobalSettings real + migración suave desde RankingSnapshot) ──

export interface GlobalSettings {
  id?: number;
  turnHours: number[];
  economyModifier: number;
  maintenanceMode: boolean;
  featureFlags: Record<string, boolean>;
  updatedAt?: Date;
  // Aliases legacy para clientes antiguos.
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

const SETTINGS_TYPE = 'global_settings';

const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  chat: true,
  forum: true, // AUDIT 5.8: foro toggleable por master (alineado con chat)
  market: true,
  friendlies: true,
  groups: true,
  cup: true,
};

const DEFAULT_SETTINGS = {
  turnHours: [11, 23],
  economyModifier: 1.0,
  maintenanceMode: false,
  featureFlags: DEFAULT_FEATURE_FLAGS,
};

function cronFromHour(hour: number): string {
  return `0 ${Math.max(0, Math.min(23, Math.round(hour)))} * * *`;
}

function hourFromCron(expr: unknown, fallback: number): number {
  if (typeof expr !== 'string') return fallback;
  const [, hour] = expr.trim().split(/\s+/);
  const parsed = Number.parseInt(hour, 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(23, parsed)) : fallback;
}

function parseTurnHours(raw: unknown): number[] {
  const source = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
  const hours = Array.isArray(source)
    ? source.map(value => Number(value)).filter(value => Number.isFinite(value))
    : [];
  const clean = [...new Set(hours.map(value => Math.max(0, Math.min(23, Math.round(value)))))].sort((a, b) => a - b);
  return clean.length > 0 ? clean : DEFAULT_SETTINGS.turnHours;
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeFeatureFlags(raw: unknown): Record<string, boolean> {
  const parsed = parseJsonObject(raw);
  const flags = { ...DEFAULT_FEATURE_FLAGS };
  for (const [key, value] of Object.entries(parsed)) {
    flags[key] = Boolean(value);
  }
  return flags;
}

function exposeSettings(input: {
  id?: number;
  turnHours: number[];
  economyModifier: number;
  maintenanceMode: boolean;
  featureFlags: Record<string, boolean>;
  updatedAt?: Date;
}): GlobalSettings {
  return {
    ...input,
    TICK_CRON_T1: cronFromHour(input.turnHours[0] ?? DEFAULT_SETTINGS.turnHours[0]),
    TICK_CRON_T2: cronFromHour(input.turnHours[1] ?? input.turnHours[0] ?? DEFAULT_SETTINGS.turnHours[1]),
    ECONOMY_INCOME_MULT: input.economyModifier,
    ECONOMY_SALARY_MULT: input.economyModifier,
    ECONOMY_TRANSFER_MULT: input.economyModifier,
    MAINTENANCE_MODE: input.maintenanceMode,
    FEATURE_CHAT: input.featureFlags.chat !== false,
    FEATURE_MARKET: input.featureFlags.market !== false,
    FEATURE_FRIENDLIES: input.featureFlags.friendlies !== false,
  };
}

function settingsFromLegacy(raw: Record<string, unknown>): Omit<GlobalSettings, 'id' | 'updatedAt'> {
  const turnHours = Array.isArray(raw.turnHours)
    ? parseTurnHours(raw.turnHours)
    : [
      hourFromCron(raw.TICK_CRON_T1, DEFAULT_SETTINGS.turnHours[0]),
      hourFromCron(raw.TICK_CRON_T2, DEFAULT_SETTINGS.turnHours[1]),
    ];

  return exposeSettings({
    turnHours,
    economyModifier: Number(raw.economyModifier ?? raw.ECONOMY_INCOME_MULT ?? DEFAULT_SETTINGS.economyModifier) || DEFAULT_SETTINGS.economyModifier,
    maintenanceMode: Boolean(raw.maintenanceMode ?? raw.MAINTENANCE_MODE ?? DEFAULT_SETTINGS.maintenanceMode),
    featureFlags: normalizeFeatureFlags({
      ...parseJsonObject(raw.featureFlags),
      chat: raw.FEATURE_CHAT ?? parseJsonObject(raw.featureFlags).chat,
      market: raw.FEATURE_MARKET ?? parseJsonObject(raw.featureFlags).market,
      friendlies: raw.FEATURE_FRIENDLIES ?? parseJsonObject(raw.featureFlags).friendlies,
    }),
  });
}

function normalizeSettingsPatch(data: Partial<GlobalSettings> & Record<string, unknown>) {
  const flags = normalizeFeatureFlags(data.featureFlags);
  if ('FEATURE_CHAT' in data) flags.chat = Boolean(data.FEATURE_CHAT);
  if ('FEATURE_MARKET' in data) flags.market = Boolean(data.FEATURE_MARKET);
  if ('FEATURE_FRIENDLIES' in data) flags.friendlies = Boolean(data.FEATURE_FRIENDLIES);

  const turnHours = 'turnHours' in data
    ? parseTurnHours(data.turnHours)
    : [
      hourFromCron(data.TICK_CRON_T1, DEFAULT_SETTINGS.turnHours[0]),
      hourFromCron(data.TICK_CRON_T2, DEFAULT_SETTINGS.turnHours[1]),
    ];

  return {
    turnHours,
    economyModifier: Number(data.economyModifier ?? data.ECONOMY_INCOME_MULT ?? DEFAULT_SETTINGS.economyModifier) || DEFAULT_SETTINGS.economyModifier,
    maintenanceMode: Boolean(data.maintenanceMode ?? data.MAINTENANCE_MODE ?? DEFAULT_SETTINGS.maintenanceMode),
    featureFlags: flags,
  };
}

function hasAnyKey(data: Record<string, unknown>, keys: string[]): boolean {
  return keys.some(key => Object.prototype.hasOwnProperty.call(data, key));
}

export const masterService = {
  // ── Settings ────────────────────────────────────────────────────────────────

  async getSettings(): Promise<GlobalSettings> {
    const row = await prisma.globalSettings.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
    if (row) {
      return exposeSettings({
        id: row.id,
        turnHours: parseTurnHours(row.turnHours),
        economyModifier: row.economyModifier,
        maintenanceMode: row.maintenanceMode,
        featureFlags: normalizeFeatureFlags(row.featureFlags),
        updatedAt: row.updatedAt,
      });
    }

    const snap = await prisma.rankingSnapshot.findFirst({
      where: { type: SETTINGS_TYPE },
      orderBy: { date: 'desc' },
    });
    if (!snap) return exposeSettings(DEFAULT_SETTINGS);

    const legacy = settingsFromLegacy(parseJsonObject(snap.payload));
    await prisma.globalSettings.create({
      data: {
        turnHours: JSON.stringify(legacy.turnHours),
        economyModifier: legacy.economyModifier,
        maintenanceMode: legacy.maintenanceMode,
        featureFlags: JSON.stringify(legacy.featureFlags),
      },
    });
    return masterService.getSettings();
  },

  async setSettings(data: Partial<GlobalSettings>): Promise<GlobalSettings> {
    const current = await masterService.getSettings();
    const patch = normalizeSettingsPatch(data as Partial<GlobalSettings> & Record<string, unknown>);
    const rawData = data as Record<string, unknown>;
    const merged = {
      turnHours: hasAnyKey(rawData, ['turnHours', 'TICK_CRON_T1', 'TICK_CRON_T2']) ? patch.turnHours : current.turnHours,
      economyModifier: hasAnyKey(rawData, ['economyModifier', 'ECONOMY_INCOME_MULT']) ? patch.economyModifier : current.economyModifier,
      maintenanceMode: hasAnyKey(rawData, ['maintenanceMode', 'MAINTENANCE_MODE']) ? patch.maintenanceMode : current.maintenanceMode,
      featureFlags: {
        ...current.featureFlags,
        ...(hasAnyKey(rawData, ['featureFlags', 'FEATURE_CHAT', 'FEATURE_MARKET', 'FEATURE_FRIENDLIES'])
          ? patch.featureFlags
          : {}),
      },
    };
    const existing = await prisma.globalSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
    const row = existing
      ? await prisma.globalSettings.update({
        where: { id: existing.id },
        data: {
          turnHours: JSON.stringify(merged.turnHours),
          economyModifier: merged.economyModifier,
          maintenanceMode: merged.maintenanceMode,
          featureFlags: JSON.stringify(merged.featureFlags),
        },
      })
      : await prisma.globalSettings.create({
        data: {
          turnHours: JSON.stringify(merged.turnHours),
          economyModifier: merged.economyModifier,
          maintenanceMode: merged.maintenanceMode,
          featureFlags: JSON.stringify(merged.featureFlags),
        },
      });

    return exposeSettings({
      id: row.id,
      turnHours: parseTurnHours(row.turnHours),
      economyModifier: row.economyModifier,
      maintenanceMode: row.maintenanceMode,
      featureFlags: normalizeFeatureFlags(row.featureFlags),
      updatedAt: row.updatedAt,
    });
  },

  async isFeatureEnabled(feature: string): Promise<boolean> {
    const settings = await masterService.getSettings();
    return settings.featureFlags[feature] !== false;
  },

  async assertWriteAllowed(role: string | undefined): Promise<void> {
    const settings = await masterService.getSettings();
    if (settings.maintenanceMode && role !== 'master') {
      throw new Error('Modo mantenimiento activo. Solo master puede realizar escrituras.');
    }
  },

  // ── Users ────────────────────────────────────────────────────────────────────

  async listUsers() {
    return prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        lastIp: true,
        manager: {
          select: {
            id: true,
            name: true,
            clubId: true,
            club: { select: { id: true, name: true, shortName: true, badge: true } },
          },
        },
      },
    });
  },

  async setRole(
    targetUserId: number,
    newRole: string,
    actorManagerId: number
  ) {
    // AUDIT 5.9-2: anti-lockout — no permitir eliminar al ÚLTIMO master del sistema
    // (dejaría la instancia sin administración suprema posible).
    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
    if (!target) throw new Error('Usuario no encontrado');
    if (target.role === 'master' && newRole !== 'master') {
      const masters = await prisma.user.count({ where: { role: 'master' } });
      if (masters <= 1) throw new Error('No puedes degradar al último master del sistema.');
    }

    // Al cambiar el rol invalidamos los JWT existentes del usuario (tokenVersion++),
    // igual que changePassword. Si no, un usuario degradado conservaría sus
    // privilegios hasta 30 días (caducidad del token). El middleware authenticate
    // rechaza cualquier token con tokenVersion desfasada.
    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole, tokenVersion: { increment: 1 } },
    });

    await prisma.adminAction.create({
      data: {
        agentFifaId: actorManagerId,
        target: `user:${targetUserId}`,
        reason: `Role changed to '${newRole}'`,
      },
    });

    return updated;
  },

  // ── Impersonation ─────────────────────────────────────────────────────────────

  async getImpersonatePayload(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { manager: { select: { id: true, clubId: true } } },
    });
    if (!user) throw new Error('Usuario no encontrado');
    return {
      userId: user.id,
      managerId: user.manager?.id ?? 0,
      clubId: user.manager?.clubId ?? null,
      username: user.username,
      role: user.role,
      // Incluimos la tokenVersion vigente del objetivo: así el token de
      // suplantación se invalida si el usuario cambia de rol/contraseña, y
      // además pasa el chequeo de authenticate (que compara contra la BD).
      tokenVersion: user.tokenVersion,
    };
  },

  // ── Audit ────────────────────────────────────────────────────────────────────

  async logAction(actorManagerId: number, target: string, reason: string) {
    return prisma.adminAction.create({
      data: { agentFifaId: actorManagerId, target, reason },
    });
  },
};
