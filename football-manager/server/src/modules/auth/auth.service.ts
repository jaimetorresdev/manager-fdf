// ─── Auth Service ─────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import prisma from '../../db/prisma';

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  managerName?: string;
  ip?: string;
}

export interface LoginInput {
  username: string;
  password: string;
  ip?: string;
}

export interface UpdateMeInput {
  email?: string;
  currentPassword?: string;
  avatarSeed?: string | null;
  managerAvatarSeed?: string | null;
}

export interface AuthResult {
  userId:       number;
  managerId:    number;
  clubId:       number | null;
  username:     string;
  role:         string;
  tokenVersion: number;
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: input.username },
          { email: input.email },
        ],
      },
    });
    if (existing) throw new Error('Username or email already taken');

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await prisma.user.create({
      data: {
        username:     input.username,
        email:        input.email,
        passwordHash,
        lastIp:       input.ip,
        manager: {
          create: {
            name: input.managerName ?? input.username,
          },
        },
      },
      include: { manager: true },
    });

    return {
      userId:       user.id,
      managerId:    user.manager!.id,
      clubId:       user.manager!.clubId,
      username:     user.username,
      role:         user.role,
      tokenVersion: user.tokenVersion,
    };
  },

  async login(input: LoginInput): Promise<AuthResult & { previousLoginAt: Date | null }> {
    const user = await prisma.user.findUnique({
      where:   { username: input.username },
      include: { manager: true },
    });

    if (!user) throw new Error('Invalid credentials');

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    // Q25: lastLoginAt alimenta "mánagers activos" públicos y el digest QW-29.
    const previousLoginAt = user.lastLoginAt;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(input.ip && user.lastIp !== input.ip ? { lastIp: input.ip } : {}),
      },
    });

    return {
      userId:       user.id,
      managerId:    user.manager?.id ?? 0,
      clubId:       user.manager?.clubId ?? null,
      username:     user.username,
      role:         user.role,
      tokenVersion: user.tokenVersion,
      // QW-29: el front lo pasa como ?since= a /api/dashboard/while-away
      // (lastLoginAt ya queda pisado por ESTE login).
      previousLoginAt,
    };
  },

  async me(userId: number) {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: {
        id:         true,
        username:   true,
        email:      true,
        role:       true,
        avatarSeed: true,
        manager:    { select: { id: true, clubId: true, name: true, prestige: true, avatarSeed: true } },
      },
    });
    if (!user) throw new Error('User not found');
    return user;
  },

  async updateMe(userId: number, input: UpdateMeInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { manager: true },
    });
    if (!user) throw new Error('User not found');

    const nextEmail = input.email?.trim().toLowerCase();
    if (nextEmail && nextEmail !== user.email) {
      if (!input.currentPassword) throw new Error('Current password required to change email');
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) throw new Error('Invalid current password');
      const existing = await prisma.user.findUnique({ where: { email: nextEmail }, select: { id: true } });
      if (existing && existing.id !== userId) throw new Error('Email already taken');
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          ...(nextEmail && nextEmail !== user.email ? { email: nextEmail } : {}),
          ...(input.avatarSeed !== undefined ? { avatarSeed: input.avatarSeed } : {}),
        },
      }),
      ...(user.manager && input.managerAvatarSeed !== undefined
        ? [prisma.manager.update({ where: { id: user.manager.id }, data: { avatarSeed: input.managerAvatarSeed } })]
        : []),
    ]);

    return this.me(userId);
  },

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new Error('Invalid current password');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    return { ok: true, changedAt: new Date() };
  },
};
