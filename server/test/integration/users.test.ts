import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { createLogger } from '../../src/lib/logger';
import { hashPassword } from '../../src/lib/password';
import { createStorageService, type StorageService } from '../../src/lib/storage';
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
  avatarConfig: unknown;
  failedLoginCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UserAvatarRow {
  userId: string;
  mimeType: string;
  data: Uint8Array;
  etag: string;
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
  classReminderMinutes: number;
  examReminderMinutes: number;
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
  const userAvatars = new Map<string, UserAvatarRow>();
  const settings = new Map<string, SettingsRow>();
  const refreshTokens: RefreshRow[] = [];
  const studySessions: Array<{ userId: string; startedAt: Date; durationSeconds: number }> = [];
  const notes: Array<{ userId: string }> = [];
  const quizAttempts: Array<{ userId: string; score: number; total: number }> = [];
  const messageAttachments: Array<{
    userId: string;
    storageKey: string;
    kind: 'image' | 'document';
  }> = [];
  const documents: Array<Record<string, unknown>> = [];
  const decks: Array<Record<string, unknown>> = [];
  const cards: Array<{
    deckId: string;
    imageUrl?: string | null;
    imageStorageKey?: string | null;
  }> = [];
  const loginHistory: Array<{
    id: string;
    userId: string | null;
    email: string;
    ip: string | null;
    userAgent: string | null;
  }> = [];

  const prisma = {
    $transaction: async <T>(ops: Array<Promise<T>>) => Promise.all(ops),
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const u = users.get(where.id);
        return u ? { ...u } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const u = users.get(where.id);
        if (!u) throw new Error('User not found');
        const cleaned: Partial<UserRow> = { ...data };
        if (cleaned.avatarConfig === Prisma.DbNull) {
          cleaned.avatarConfig = null;
        }
        Object.assign(u, cleaned, { updatedAt: new Date() });
        return u;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const u = users.get(where.id);
        if (!u) throw new Error('User not found');
        users.delete(where.id);
        userAvatars.delete(where.id);
        settings.delete(where.id);
        return u;
      },
    },
    userAvatar: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        userAvatars.get(where.userId) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: Omit<UserAvatarRow, 'updatedAt'>;
        update: Partial<Omit<UserAvatarRow, 'userId' | 'updatedAt'>>;
      }) => {
        const existing = userAvatars.get(where.userId);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }
        const row: UserAvatarRow = {
          userId: create.userId,
          mimeType: create.mimeType,
          data: create.data,
          etag: create.etag,
          updatedAt: new Date(),
        };
        userAvatars.set(where.userId, row);
        return row;
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const existed = userAvatars.delete(where.userId);
        return { count: existed ? 1 : 0 };
      },
    },
    userSettings: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        settings.get(where.userId) ?? null,
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
          classReminderMinutes: create.classReminderMinutes ?? 15,
          examReminderMinutes: create.examReminderMinutes ?? 1440,
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
    messageAttachment: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        messageAttachments.filter((a) => a.userId === where.userId),
    },
    document: {
      findMany: async ({
        where,
        select,
      }: {
        where: { userId: string };
        select?: Record<string, boolean>;
      }) =>
        documents
          .filter((d) => d.userId === where.userId)
          .map((d) =>
            select
              ? Object.fromEntries(Object.entries(d).filter(([k]) => Boolean(select[k])))
              : { ...d },
          ),
    },
    deck: {
      findMany: async ({
        where,
        include,
      }: {
        where: { userId: string };
        include?: { cards?: { select?: Record<string, boolean> } };
      }) =>
        decks
          .filter((d) => d.userId === where.userId)
          .map((d) => {
            const cardSelect = include?.cards?.select;
            const deckCards = cards
              .filter((c) => c.deckId === d.id)
              .map((c) =>
                cardSelect
                  ? Object.fromEntries(Object.entries(c).filter(([k]) => Boolean(cardSelect[k])))
                  : { ...c },
              );
            return include?.cards ? { ...d, cards: deckCards } : { ...d };
          }),
    },
    card: {
      findMany: async ({ where }: { where: { deck: { userId: string } } }) => {
        const userDeckIds = new Set(
          decks.filter((d) => d.userId === where.deck.userId).map((d) => d.id),
        );
        return cards.filter((c) => userDeckIds.has(c.deckId) && c.imageStorageKey !== null);
      },
    },
    loginHistory: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { OR?: Array<{ userId?: string; email?: string }> };
        data: { userId: null; email: string; ip: null; userAgent: null };
      }) => {
        let count = 0;
        for (const entry of loginHistory) {
          const matches = where.OR?.some(
            (cond) =>
              (cond.userId && entry.userId === cond.userId) ||
              (cond.email && entry.email === cond.email),
          );
          if (matches) {
            entry.userId = data.userId;
            entry.email = data.email;
            entry.ip = data.ip;
            entry.userAgent = data.userAgent;
            count += 1;
          }
        }
        return { count };
      },
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
    messageAttachments,
    documents,
    decks,
    cards,
    loginHistory,
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
      uploadAttachment: vi.fn(async () => ({
        storageKey: 'k',
        storageUrl: 'https://cdn.example.com/k',
      })),
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
      avatarConfig: null,
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

  it('stores, serves (with ETag/304), updates config, and deletes avatars via database storage when CLOUDINARY_URL is unset', async () => {
    const dbStorage = createStorageService(env, logger, db.prisma);
    const dbUsersService = createUsersService({ prisma: db.prisma, storage: dbStorage, logger });
    const dbApp = createApp(env, { checkDb: async () => undefined, users: dbUsersService }, logger);

    const pngBuf = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 37, g: 99, b: 235, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const validConfig = {
      faceShape: 'oval',
      skinTone: '#ECC0A2',
      hairStyle: 'short',
      hairColor: '#1E2028',
      eyes: 'calm',
      eyebrows: 'natural',
      nose: 'classic',
      mouth: 'smile',
      clothing: 'hoodie',
      clothingColor: '#2563EB',
      backgroundColor: '#EFF6FF',
    };

    const invalidCfg = await request(dbApp)
      .post('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .field('config', JSON.stringify({ ...validConfig, hairColor: 'not-hex' }))
      .attach('avatar', pngBuf, 'avatar.png');
    expect(invalidCfg.status).toBe(400);
    expect(invalidCfg.body.error.code).toBe('VALIDATION_ERROR');

    const saved = await request(dbApp)
      .post('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .field('config', JSON.stringify(validConfig))
      .attach('avatar', pngBuf, 'avatar.png');
    expect(saved.status).toBe(200);
    expect(saved.body.avatarUrl).toMatch(new RegExp(`^/api/v1/users/${userId}/avatar\\?v=\\d+$`));
    expect(saved.body.avatarConfig).toEqual(validConfig);

    const me = await request(dbApp).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.avatarUrl).toBe(saved.body.avatarUrl);
    expect(me.body.avatarConfig).toEqual(validConfig);

    const fetched = await request(dbApp).get(saved.body.avatarUrl as string);
    expect(fetched.status).toBe(200);
    expect(fetched.headers['content-type']).toContain('image/webp');
    expect(fetched.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(fetched.headers.etag).toBeTruthy();

    const cached = await request(dbApp)
      .get(saved.body.avatarUrl as string)
      .set('If-None-Match', fetched.headers.etag!);
    expect(cached.status).toBe(304);

    const removed = await request(dbApp)
      .delete('/api/v1/users/me/avatar')
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(204);

    const gone = await request(dbApp).get(`/api/v1/users/${userId}/avatar`);
    expect(gone.status).toBe(404);
  });

  it('GET /users/me/export downloads personal JSON bundle and omits secrets and internal storage keys', async () => {
    db.studySessions.push({ userId, startedAt: new Date(), durationSeconds: 1800 });
    db.documents.push({
      id: 'doc-exp-1',
      userId,
      title: 'Past Paper',
      storageKey: 'secret-doc-storage-key',
      storageUrl: 'https://secret.example.com/doc',
      kind: 'document',
    });
    db.decks.push({ id: 'deck-exp-1', userId, title: 'OS Cards' });
    db.cards.push({
      deckId: 'deck-exp-1',
      imageUrl: '/api/v1/cards/c1/image',
      imageStorageKey: 'secret-card-storage-key',
    });

    const res = await request(app)
      .get('/api/v1/users/me/export')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="learnspace-export-\d{4}-\d{2}-\d{2}\.json"$/,
    );

    const parsed = JSON.parse(res.text) as Record<string, unknown>;
    expect(parsed.version).toBe(1);
    expect(typeof parsed.exportedAt).toBe('string');
    expect(parsed.user).toMatchObject({ id: userId, email: 'ama@uni.edu', name: 'Ama Mensah' });
    expect((parsed.user as Record<string, unknown>).passwordHash).toBeUndefined();
    expect(res.text).not.toContain('passwordHash');
    expect(res.text).not.toContain('secret-doc-storage-key');
    expect(res.text).not.toContain('secret-card-storage-key');
    expect(res.text).not.toContain('storageKey');
    expect(res.text).not.toContain('imageStorageKey');
    expect(Array.isArray(parsed.courses)).toBe(true);
    expect(Array.isArray(parsed.studySessions)).toBe(true);
    expect(parsed.studySessions as Array<Record<string, unknown>>).toHaveLength(1);
    expect(parsed.documents as Array<Record<string, unknown>>).toHaveLength(1);
    expect(parsed.decks as Array<Record<string, unknown>>).toHaveLength(1);
  });

  it('DELETE /users/me cleans up avatar, chat attachments, documents, flashcard images, and scrubs login history', async () => {
    const u = db.users.get(userId)!;
    u.avatarPublicId = 'learnspace/avatars/ama-1';
    db.messageAttachments.push({
      userId,
      storageKey: 'learnspace/attachments/chat-1.pdf',
      kind: 'document',
    });
    db.documents.push({
      id: 'doc-1',
      userId,
      storageKey: 'learnspace/attachments/past-paper.pdf',
      storageUrl: 'https://cdn.example.com/past-paper.pdf',
      kind: 'document',
      title: 'OS Exam',
    });
    db.decks.push({ id: 'deck-1', userId, title: 'OS Deck' });
    db.cards.push({
      deckId: 'deck-1',
      imageUrl: '/api/v1/cards/c1/image',
      imageStorageKey: 'learnspace/attachments/card-diagram.webp',
    });
    db.loginHistory.push({
      id: 'lh-1',
      userId,
      email: 'ama@uni.edu',
      ip: '192.0.2.55',
      userAgent: 'VitestBrowser',
    });

    const delRes = await request(app)
      .delete('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'OldPassword1!' });

    expect(delRes.status).toBe(204);
    expect(db.users.has(userId)).toBe(false);
    expect(storage.deleteAvatar).toHaveBeenCalledWith('learnspace/avatars/ama-1');
    expect(storage.deleteAttachment).toHaveBeenCalledWith(
      'learnspace/attachments/chat-1.pdf',
      'document',
    );
    expect(storage.deleteAttachment).toHaveBeenCalledWith(
      'learnspace/attachments/past-paper.pdf',
      'document',
    );
    expect(storage.deleteAttachment).toHaveBeenCalledWith(
      'learnspace/attachments/card-diagram.webp',
      'image',
    );
    expect(db.loginHistory[0]).toMatchObject({
      id: 'lh-1',
      userId: null,
      email: '[deleted]',
      ip: null,
      userAgent: null,
    });
  });
});
