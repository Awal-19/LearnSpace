import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { EmailService } from '../../src/lib/email';
import { createLogger } from '../../src/lib/logger';
import { createAuthService } from '../../src/modules/auth/auth.service';
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

interface RefreshRow {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  persistent: boolean;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
}

interface EmailTokenRow {
  id: string;
  userId: string;
  type: 'verify_email' | 'reset_password';
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

function createInMemoryPrisma() {
  const users: UserRow[] = [];
  const refreshTokens: RefreshRow[] = [];
  const emailTokens: EmailTokenRow[] = [];

  const db = {
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return users.find((u) => u.id === where.id) ?? null;
        if (where.email) {
          const target = where.email.toLowerCase();
          return users.find((u) => u.email.toLowerCase() === target) ?? null;
        }
        return null;
      },
      create: async ({ data }: { data: { name: string; email: string; passwordHash?: string | null; emailVerified?: boolean } }) => {
        const now = new Date();
        const row: UserRow = {
          id: randomUUID(),
          email: data.email.toLowerCase(),
          name: data.name,
          passwordHash: data.passwordHash ?? null,
          emailVerified: data.emailVerified ?? false,
          studentId: null,
          programme: null,
          level: null,
          university: null,
          bio: null,
          avatarUrl: null,
          avatarPublicId: null,
          failedLoginCount: 0,
          lockedUntil: null,
          createdAt: now,
          updatedAt: now,
        };
        users.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const user = users.find((u) => u.id === where.id);
        if (!user) throw new Error('User not found');
        Object.assign(user, data, { updatedAt: new Date() });
        return user;
      },
    },
    refreshToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        refreshTokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
      create: async ({ data }: { data: Omit<RefreshRow, 'id' | 'revokedAt' | 'replacedById' | 'createdAt'> }) => {
        const row: RefreshRow = {
          id: randomUUID(),
          revokedAt: null,
          replacedById: null,
          createdAt: new Date(),
          ...data,
        };
        refreshTokens.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<RefreshRow> }) => {
        const row = refreshTokens.find((t) => t.id === where.id);
        if (!row) throw new Error('RefreshToken not found');
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { tokenHash?: string; familyId?: string; userId?: string; revokedAt?: null };
        data: Partial<RefreshRow>;
      }) => {
        let count = 0;
        for (const row of refreshTokens) {
          if (where.tokenHash && row.tokenHash !== where.tokenHash) continue;
          if (where.familyId && row.familyId !== where.familyId) continue;
          if (where.userId && row.userId !== where.userId) continue;
          if (where.revokedAt === null && row.revokedAt !== null) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    emailToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        emailTokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
      create: async ({ data }: { data: Omit<EmailTokenRow, 'id' | 'usedAt' | 'createdAt'> }) => {
        const row: EmailTokenRow = {
          id: randomUUID(),
          usedAt: null,
          createdAt: new Date(),
          ...data,
        };
        emailTokens.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<EmailTokenRow> }) => {
        const row = emailTokens.find((t) => t.id === where.id);
        if (!row) throw new Error('EmailToken not found');
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId?: string; type?: 'verify_email' | 'reset_password'; usedAt?: null };
        data: Partial<EmailTokenRow>;
      }) => {
        let count = 0;
        for (const row of emailTokens) {
          if (where.userId && row.userId !== where.userId) continue;
          if (where.type && row.type !== where.type) continue;
          if (where.usedAt === null && row.usedAt !== null) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    $transaction: async <T>(arg: ((tx: unknown) => Promise<T>) | Promise<unknown>[]) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg(db);
    },
  };

  return { db: db as unknown as PrismaClient, users, refreshTokens, emailTokens };
}

describe('auth endpoints (T-AUTH-01..13)', () => {
  let sentVerifyUrl: string | null = null;
  let sentResetUrl: string | null = null;
  let store: ReturnType<typeof createInMemoryPrisma>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    sentVerifyUrl = null;
    sentResetUrl = null;
    store = createInMemoryPrisma();
    const env = testEnv();
    const logger = createLogger(env);
    const email: EmailService = {
      sendVerificationEmail: vi.fn(async (_to, _name, url) => {
        sentVerifyUrl = url;
      }),
      sendPasswordResetEmail: vi.fn(async (_to, _name, url) => {
        sentResetUrl = url;
      }),
      sendTaskReminderEmail: vi.fn(async () => undefined),
    };
    const auth = createAuthService({ prisma: store.db, env, email, logger });
    app = createApp(env, { checkDb: async () => undefined, auth }, logger);
  });

  it('signs up a user, hashes password with argon2id, sets httpOnly cookie, and sends verification email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama Mensah', email: 'Ama@Uni.edu', password: 'StudyPass1!' });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe('ama@uni.edu');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie']?.[0]).toMatch(/ls_refresh=.*;.*HttpOnly/i);
    expect(store.users[0]?.passwordHash?.startsWith('$argon2id$')).toBe(true);
    expect(sentVerifyUrl).toMatch(/\/verify-email\?token=/);
  });

  it('rejects duplicate signup regardless of email case (T-AUTH-02)', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'ama@uni.edu', password: 'StudyPass1!' });

    const dup = await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama 2', email: 'AMA@uni.edu', password: 'StudyPass1!' });

    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('locks account after 5 failed logins (T-AUTH-05)', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'ama@uni.edu', password: 'StudyPass1!' });

    for (let i = 0; i < 4; i += 1) {
      const fail = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ama@uni.edu', password: 'WrongPassword1' });
      expect(fail.status).toBe(401);
    }

    const locked = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ama@uni.edu', password: 'WrongPassword1' });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');

    const evenCorrect = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ama@uni.edu', password: 'StudyPass1!' });
    expect(evenCorrect.status).toBe(423);
  });

  it('requires X-Requested-With on refresh (T-AUTH-08) and revokes family on token reuse (T-AUTH-07)', async () => {
    const signup = await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'ama@uni.edu', password: 'StudyPass1!' });
    const cookie1 = signup.headers['set-cookie']![0]!.split(';')[0]!;

    const noCsrf = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1);
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('CSRF_BLOCKED');

    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie1)
      .set('X-Requested-With', 'learnspace');
    expect(rotated.status).toBe(200);
    const cookie2 = rotated.headers['set-cookie']![0]!.split(';')[0]!;

    // Replay old token -> 401 and revokes the new token too
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie1)
      .set('X-Requested-With', 'learnspace');
    expect(replay.status).toBe(401);

    const afterRevoke = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie2)
      .set('X-Requested-With', 'learnspace');
    expect(afterRevoke.status).toBe(401);
  });

  it('verifies email once and rejects reuse (T-AUTH-11)', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'ama@uni.edu', password: 'StudyPass1!' });
    const token = new URL(sentVerifyUrl!).searchParams.get('token')!;

    const ok = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(ok.status).toBe(200);
    expect(store.users[0]?.emailVerified).toBe(true);

    const reuse = await request(app).post('/api/v1/auth/verify-email').send({ token });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');
  });

  it('resets password, revokes all sessions, and gives identical forgot-password responses (T-AUTH-12, T-AUTH-13)', async () => {
    const signup = await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'ama@uni.edu', password: 'StudyPass1!' });
    const cookie = signup.headers['set-cookie']![0]!.split(';')[0]!;

    const unknownForgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@uni.edu' });
    const knownForgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'ama@uni.edu' });

    expect(unknownForgot.status).toBe(202);
    expect(knownForgot.status).toBe(202);
    expect(unknownForgot.body).toEqual(knownForgot.body);

    const resetToken = new URL(sentResetUrl!).searchParams.get('token')!;
    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, password: 'NewPassword2' });
    expect(reset.status).toBe(200);

    // Existing refresh token was revoked
    const refreshAfter = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('X-Requested-With', 'learnspace');
    expect(refreshAfter.status).toBe(401);

    // Old password fails, new password works
    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ama@uni.edu', password: 'StudyPass1!' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ama@uni.edu', password: 'NewPassword2' });
    expect(newLogin.status).toBe(200);
  });

  it('returns providers status', async () => {
    const res = await request(app).get('/api/v1/auth/providers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ google: false });
  });
});

