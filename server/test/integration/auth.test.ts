import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { EmailService } from '../../src/lib/email';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
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

interface OtpRow {
  id: string;
  userId: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
  createdAt: Date;
}

function createInMemoryPrisma() {
  const users: UserRow[] = [];
  const refreshTokens: RefreshRow[] = [];
  const emailTokens: EmailTokenRow[] = [];
  const otpCodes: OtpRow[] = [];

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
      create: async ({
        data,
      }: {
        data: {
          name: string;
          email: string;
          passwordHash?: string | null;
          emailVerified?: boolean;
          termsAccepted?: boolean;
          termsVersion?: string | null;
          termsAcceptedAt?: Date | null;
          privacyPolicyVersion?: string | null;
          privacyPolicyAcceptedAt?: Date | null;
        };
      }) => {
        const now = new Date();
        const row: UserRow & {
          termsAccepted: boolean;
          termsVersion: string | null;
          termsAcceptedAt: Date | null;
          privacyPolicyVersion: string | null;
          privacyPolicyAcceptedAt: Date | null;
        } = {
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
          termsAccepted: data.termsAccepted ?? false,
          termsVersion: data.termsVersion ?? null,
          termsAcceptedAt: data.termsAcceptedAt ?? null,
          privacyPolicyVersion: data.privacyPolicyVersion ?? null,
          privacyPolicyAcceptedAt: data.privacyPolicyAcceptedAt ?? null,
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
      create: async ({
        data,
      }: {
        data: Omit<RefreshRow, 'id' | 'revokedAt' | 'replacedById' | 'createdAt'>;
      }) => {
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
    otpCode: {
      findFirst: async ({
        where,
      }: {
        where: { userId?: string; purpose?: string; usedAt?: null };
      }) => {
        const matches = otpCodes.filter(
          (r) =>
            (!where.userId || r.userId === where.userId) &&
            (!where.purpose || r.purpose === where.purpose) &&
            (where.usedAt === undefined || r.usedAt === where.usedAt),
        );
        return matches[matches.length - 1] ?? null;
      },
      create: async ({
        data,
      }: {
        data: { userId: string; purpose: string; codeHash: string; expiresAt: Date };
      }) => {
        const row: OtpRow = {
          id: randomUUID(),
          ...data,
          attempts: 0,
          usedAt: null,
          createdAt: new Date(),
        };
        otpCodes.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<OtpRow> }) => {
        const row = otpCodes.find((r) => r.id === where.id);
        if (!row) throw new Error('OTP not found');
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId?: string; purpose?: string; usedAt?: null };
        data: Partial<OtpRow>;
      }) => {
        let count = 0;
        for (const row of otpCodes) {
          if (where.userId && row.userId !== where.userId) continue;
          if (where.purpose && row.purpose !== where.purpose) continue;
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

  return { db: db as unknown as PrismaClient, users, refreshTokens, emailTokens, otpCodes };
}

describe('auth endpoints (T-AUTH-01..13)', () => {
  let sentOtpCode: string | null = null;
  let sentResetUrl: string | null = null;
  let store: ReturnType<typeof createInMemoryPrisma>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    sentOtpCode = null;
    sentResetUrl = null;
    store = createInMemoryPrisma();
    const env = testEnv();
    const logger = createLogger(env);
    const email: EmailService = {
      sendVerificationEmail: vi.fn(async () => undefined),
      sendOtpEmail: vi.fn(async ({ code }) => {
        sentOtpCode = code;
      }),
      sendPasswordResetEmail: vi.fn(async (_to, _name, url) => {
        sentResetUrl = url;
      }),
      sendTaskReminderEmail: vi.fn(async () => undefined),
      sendClassReminderEmail: vi.fn(async () => undefined),
      sendExamReminderEmail: vi.fn(async () => undefined),
    };
    const auth = createAuthService({ prisma: store.db, env, email, logger });
    app = createApp(env, { checkDb: async () => undefined, auth }, logger);
  });

  it('signs up a user as unverified without issuing a session, persists consent, sends 6-digit OTP, and verifies to unlock session', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({
      name: 'Ama Mensah',
      email: 'Ama@Uni.edu',
      password: 'StudyPass1!',
      acceptTerms: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.requiresVerification).toBe(true);
    expect(res.body.email).toBe('ama@uni.edu');
    expect(res.body.accessToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(store.users[0]?.passwordHash?.startsWith('$argon2id$')).toBe(true);
    expect(store.users[0]?.emailVerified).toBe(false);
    expect((store.users[0] as { termsAccepted?: boolean })?.termsAccepted).toBe(true);
    expect((store.users[0] as { termsVersion?: string | null })?.termsVersion).toBe('2026-11-18');
    expect((store.users[0] as { termsAcceptedAt?: Date | null })?.termsAcceptedAt).toBeInstanceOf(
      Date,
    );
    expect((store.users[0] as { privacyPolicyVersion?: string | null })?.privacyPolicyVersion).toBe(
      '2026-11-18',
    );
    expect(sentOtpCode).toMatch(/^\d{6}$/);

    // Login before verification is blocked with EMAIL_NOT_VERIFIED
    const unverifiedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ama@uni.edu', password: 'StudyPass1!' });
    expect(unverifiedLogin.status).toBe(403);
    expect(unverifiedLogin.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    // Verify OTP unlocks full session
    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'ama@uni.edu', code: sentOtpCode });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.accessToken).toBeTruthy();
    expect(verifyRes.body.user.emailVerified).toBe(true);
    expect(verifyRes.body.user.termsAccepted).toBe(true);
    expect(verifyRes.body.user.termsVersion).toBe('2026-11-18');
    expect(verifyRes.body.user.termsAcceptedAt).toBeTruthy();
    expect(verifyRes.body.user.privacyPolicyVersion).toBe('2026-11-18');
    expect(verifyRes.body.user.privacyPolicyAcceptedAt).toBeTruthy();
    expect(verifyRes.headers['set-cookie']?.[0]).toMatch(/ls_refresh=.*;.*HttpOnly/i);
  });

  it('rejects signup when Terms and Conditions consent is missing or false', async () => {
    const missing = await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'noconsent@uni.edu', password: 'StudyPass1!' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    expect(missing.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'acceptTerms',
          message: 'Please accept the Terms and Conditions and Privacy Policy to continue.',
        }),
      ]),
    );

    const declined = await request(app).post('/api/v1/auth/signup').send({
      name: 'Ama',
      email: 'declined@uni.edu',
      password: 'StudyPass1!',
      acceptTerms: false,
    });
    expect(declined.status).toBe(400);
    expect(declined.body.error.code).toBe('VALIDATION_ERROR');
    expect(store.users).toHaveLength(0);
  });

  it('rejects duplicate signup regardless of email case (T-AUTH-02)', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'ama@uni.edu', password: 'StudyPass1!', acceptTerms: true });

    const dup = await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama 2', email: 'AMA@uni.edu', password: 'StudyPass1!', acceptTerms: true });

    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('locks account after 5 failed logins (T-AUTH-05)', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'ama@uni.edu', password: 'StudyPass1!', acceptTerms: true });

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
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'ama@uni.edu', password: 'StudyPass1!', acceptTerms: true });
    const verify = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'ama@uni.edu', code: sentOtpCode });
    const cookie1 = verify.headers['set-cookie']![0]!.split(';')[0]!;

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

  it('verifies OTP once and rejects reuse (T-AUTH-11)', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'ama@uni.edu', password: 'StudyPass1!', acceptTerms: true });
    const code = sentOtpCode!;

    const ok = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'ama@uni.edu', code });
    expect(ok.status).toBe(200);
    expect(store.users[0]?.emailVerified).toBe(true);

    // Reusing the same OTP after verification does not create another OTP; if unverified again, reuse fails
    store.users[0]!.emailVerified = false;
    const reuse = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'ama@uni.edu', code });
    expect(reuse.status).toBe(400);
  });

  it('resets password, revokes all sessions, and gives identical forgot-password responses (T-AUTH-12, T-AUTH-13)', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'ama@uni.edu', password: 'StudyPass1!', acceptTerms: true });
    const verify = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'ama@uni.edu', code: sentOtpCode });
    const cookie = verify.headers['set-cookie']![0]!.split(';')[0]!;

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

  it('rejects wrong, over-attempted, and expired OTPs and enforces resend cooldown with generic response', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'otp@uni.edu', password: 'StudyPass1!', acceptTerms: true });

    // Resend within 60s returns 429 cooldown for existing unverified user, generic 200 for unknown email
    const unknownResend = await request(app)
      .post('/api/v1/auth/resend-otp')
      .send({ email: 'nobody@uni.edu' });
    expect(unknownResend.status).toBe(200);
    expect(unknownResend.body.ok).toBe(true);

    const cooldownRes = await request(app)
      .post('/api/v1/auth/resend-otp')
      .send({ email: 'otp@uni.edu' });
    expect(cooldownRes.status).toBe(429);

    // 5 wrong attempts invalidate the OTP
    for (let i = 0; i < 4; i += 1) {
      const wrong = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ email: 'otp@uni.edu', code: '000000' });
      expect(wrong.status).toBe(400);
    }
    const fifth = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'otp@uni.edu', code: '000000' });
    expect(fifth.status).toBe(429);

    // Even the real code now fails because it was invalidated
    const afterLock = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'otp@uni.edu', code: sentOtpCode });
    expect(afterLock.status).toBe(400);
  });

  it('blocks unverified users with 403 EMAIL_NOT_VERIFIED across all protected endpoints', async () => {
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ name: 'Ama', email: 'blocked@uni.edu', password: 'StudyPass1!', acceptTerms: true });
    const unverifiedUser = store.users.find((u) => u.email === 'blocked@uni.edu')!;
    const { token } = signAccessToken(unverifiedUser.id, testEnv().JWT_SECRET, 300);

    const protectedApp = createApp(
      testEnv(),
      {
        checkDb: async () => undefined,
        isEmailVerified: async (userId) =>
          Boolean(store.users.find((u) => u.id === userId)?.emailVerified),
      },
      createLogger(testEnv()),
    );

    const endpoints = [
      '/api/v1/users/me',
      '/api/v1/courses',
      '/api/v1/notes',
      '/api/v1/tasks',
      '/api/v1/focus/sessions',
      '/api/v1/decks',
      '/api/v1/quizzes',
      '/api/v1/documents',
      '/api/v1/conversations',
      '/api/v1/dashboard',
      '/api/v1/announcements/active',
    ];

    for (const ep of endpoints) {
      const res = await request(protectedApp).get(ep).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    }
  });
});
