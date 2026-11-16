import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { createLogger } from '../../src/lib/logger';
import { hashPassword } from '../../src/lib/password';
import type { StorageService } from '../../src/lib/storage';
import { signAccessToken } from '../../src/lib/tokens';
import { createUsersService } from '../../src/modules/users/users.service';
import { testEnv } from '../helpers';

interface UserRow {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  emailVerified: boolean;
  studentId: string | null;
  programme: string | null;
  level: string | null;
  university: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarPublicId: string | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SettingsRow {
  userId: string;
  theme: 'system' | 'light' | 'dark';
  timezone: string;
  notifyInApp: boolean;
  notifyEmailReminders: boolean;
  notifyProductEmail: boolean;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  updatedAt: Date;
}

interface RefreshRow {
  id: string;
  userId: string;
  tokenHash: string;
  revokedAt: Date | null;
}

function makeFakePrisma() {
  const users = new Map<string, UserRow>();
  const settings = new Map<string, SettingsRow>();
  const refreshTokens: RefreshRow[] = [];
  const studySessions: Array<{ userId: string; startedAt: Date; durationSeconds: number }> = [];
  const notes: Array<{ userId: string }> = [];
  const quizAttempts: Array<{ userId: string; score: number; total: number }> = [];

  const prisma = {
    $transaction: async <T>(ops: Array<Promise<T>>) => Promise.all(ops),
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const u = users.get(where.id);
        if (!u) throw new Error('User not found');
        Object.assign(u, data, { updatedAt: new Date() });
        return u;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const u = users.get(where.id);
        if (!u) throw new Error('User not found');
        users.delete(where.id);
        settings.delete(where.id);
        return u;
      },
    },
    userSettings: {
      findUnique: async ({ where }: { where: { userId: string } }) => settings.get(where.userId) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: Partial<SettingsRow> & { userId: string };
        update: Partial<SettingsRow>;
      }) => {
        const existing = settings.get(where.userId);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }
        const row: SettingsRow = {
          userId: create.userId,
          theme: create.theme ?? 'system',
          timezone: create.timezone ?? 'UTC',
          notifyInApp: create.notifyInApp ?? true,
          notifyEmailReminders: create.notifyEmailReminders ?? false,
          notifyProductEmail: create.notifyProductEmail ?? false,
          focusMinutes: create.focusMinutes ?? 25,
          shortBreakMinutes: create.shortBreakMinutes ?? 5,
          longBreakMinutes: create.longBreakMinutes ?? 15,
          updatedAt: new Date(),
        };
        settings.set(where.userId, row);
        return row;
      },
    },
    refreshToken: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; revokedAt: null; tokenHash?: { not: string } };
        data: { revokedAt: Date };
      }) => {
        let count = 0;
        for (const t of refreshTokens) {
          if (
            t.userId === where.userId &&
            t.revokedAt === null &&
            (!where.tokenHash || t.tokenHash !== where.tokenHash.not)
          ) {
            t.revokedAt = data.revokedAt;
            count += 1;
          }
        }
        return { count };
      },
    },
    studySession: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        studySessions.filter((s) => s.userId === where.userId),
    },
    note: {
      count: async ({ where }: { where: { userId: string } }) =>
        notes.filter((n) => n.userId === where.userId).length,
    },
    quizAttempt: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        quizAttempts.filter((q) => q.userId === where.userId),
    },
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    users,
    settings,
    refreshTokens,
    studySessions,
    notes,
    quizAttempts,
  };
}

describe('users integration (/api/v1/users/me*)', () => {
  const env = testEnv();
  const logger = createLogger(env);
  let db: ReturnType<typeof makeFakePrisma>;
  let storage: StorageService;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let token: string;

  beforeEach(async () => {
    db = makeFakePrisma();
    storage = {
      isConfigured: () => true,
      uploadAvatar: vi.fn(async (_buf, uid) => ({
        url: `https://cdn.example.com/${uid}.webp`,
        publicId: `learnspace/avatars/${uid}-1`,
      })),
      deleteAvatar: vi.fn(async () => undefined),
      uploadAttachment: vi.fn(async () => ({ storageKey: 'k', storageUrl: 'https://cdn.example.com/k' })),
      getSignedAttachmentUrl: vi.fn(() => null),
      readAttachmentBytes: vi.fn(async () => Buffer.alloc(0)),
      deleteAttachment: vi.fn(async () => undefined),
    };
    const usersService = createUsersService({ prisma: db.prisma, storage, logger });
    app = createApp(env, { checkDb: async () => undefined, users: usersService }, logger);

    userId = randomUUID();
    db.users.set(userId, {
      id: userId,
      email: 'ama@uni.edu',
      name: 'Ama Mensah',
      passwordHash: await hashPassword('OldPassword1!'),
      emailVerified: false,
      studentId: null,
      programme: null,
      level: null,
      university: null,
      bio: null,
      avatarUrl: null,
      avatarPublicId: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    token = signAccessToken(userId, env.JWT_SECRET).token;
  });

  it('T-PROF-01: PATCH /users/me updates fields and rejects bio > 500 chars', async () => {
    const ok = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '  Ama K. Mensah  ', programme: 'Computer Science', bio: 'Loves algorithms' });

    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Ama K. Mensah');
    expect(ok.body.programme).toBe('Computer Science');

    const bad = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ bio: 'x'.repeat(501) });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('T-PROF-02 & T-PROF-03: POST /users/me/avatar accepts valid PNG and rejects non-image magic bytes', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const ok = await request(app)
      .post('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', png, 'avatar.png');

    expect(ok.status).toBe(200);
    expect(ok.body.avatarUrl).toContain('https://cdn.example.com/');

    const fake = Buffer.from('MZ\x90\x00not-an-image-bytes', 'binary');
    const bad = await request(app)
      .post('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('avatar', fake, 'fake.png');

    expect(bad.status).toBe(415);
    expect(bad.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('T-PROF-04: GET /users/me/stats computes real hours, notes, and quiz average', async () => {
    const now = new Date();
    db.studySessions.push(
      { userId, startedAt: now, durationSeconds: 3600 },
      { userId, startedAt: new Date(now.getTime() - 24 * 3600 * 1000), durationSeconds: 1800 },
    );
    db.notes.push({ userId }, { userId }, { userId });
    db.quizAttempts.push({ userId, score: 8, total: 10 }, { userId, score: 6, total: 10 });

    const res = await request(app)
      .get('/api/v1/users/me/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      streakDays: 2,
      longestStreakDays: 2,
      hoursStudied: 1.5,
      hoursLast7Days: 1.5,
      notesCreated: 3,
      quizzesTaken: 2,
      averageQuizScore: 0.7,
    });
  });

  it('T-PROF-05: POST /users/me/change-password revokes other sessions and rejects wrong password', async () => {
    db.refreshTokens.push(
      { id: '1', userId, tokenHash: 'hash-1', revokedAt: null },
      { id: '2', userId, tokenHash: 'hash-2', revokedAt: null },
    );

    const wrong = await request(app)
      .post('/api/v1/users/me/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPassword1!', newPassword: 'NewPassword1!' });
    expect(wrong.status).toBe(401);

    const ok = await request(app)
      .post('/api/v1/users/me/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'OldPassword1!', newPassword: 'NewPassword1!' });
    expect(ok.status).toBe(204);
    expect(db.refreshTokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it('T-PROF-06: DELETE /users/me requires valid password and deletes user', async () => {
    const wrong = await request(app)
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'WrongPassword1!' });
    expect(wrong.status).toBe(401);

    const ok = await request(app)
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'OldPassword1!' });
    expect(ok.status).toBe(204);
    expect(db.users.has(userId)).toBe(false);
  });

  it('PATCH /users/me/settings blocks notifyEmailReminders until email is verified', async () => {
    const blocked = await request(app)
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ notifyEmailReminders: true });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    db.users.get(userId)!.emailVerified = true;
    const ok = await request(app)
      .patch('/api/v1/users/me/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ notifyEmailReminders: true, focusMinutes: 30 });
    expect(ok.status).toBe(200);
    expect(ok.body.notifyEmailReminders).toBe(true);
    expect(ok.body.focusMinutes).toBe(30);
  });
});

