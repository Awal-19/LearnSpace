import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { createLogger } from '../../src/lib/logger';
import { hashPassword } from '../../src/lib/password';
import { hashToken } from '../../src/lib/tokens';
import { createAdminService } from '../../src/modules/admin/admin.service';
import type { AiService } from '../../src/modules/ai/ai.service';
import { createAuthService } from '../../src/modules/auth/auth.service';
import { createCoursesService } from '../../src/modules/courses/courses.service';
import { createDocumentsService } from '../../src/modules/documents/documents.service';
import { createExamsService } from '../../src/modules/exams/exams.service';
import { createFocusService } from '../../src/modules/focus/focus.service';
import { createGpaService } from '../../src/modules/gpa/gpa.service';
import { createNotesService } from '../../src/modules/notes/notes.service';
import { createPlannerService } from '../../src/modules/planner/planner.service';
import { createStudyService } from '../../src/modules/study/study.service';
import { createTimetableService } from '../../src/modules/timetable/timetable.service';
import { createUsersService } from '../../src/modules/users/users.service';
import { testEnv } from '../helpers';

function makeVerificationGateApp() {
  const env = testEnv({
    JWT_SECRET: '9f8e7d6c5b4a32109876543210fedcba9876543210abcdef',
  });
  const logger = createLogger(env);

  const users: Array<Record<string, unknown>> = [];
  const otps: Array<{
    id: string;
    userId: string;
    purpose: string;
    codeHash: string;
    attempts: number;
    expiresAt: Date;
    usedAt: Date | null;
    createdAt: Date;
  }> = [];
  const refreshTokens: Array<{
    id: string;
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    replacedById: string | null;
    persistent: boolean;
  }> = [];
  const sentOtps: Array<{ email: string; code: string }> = [];

  const prisma = {
    $transaction: async <T>(arg: ((tx: PrismaClient) => Promise<T>) | Array<Promise<unknown>>) => {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(prisma as unknown as PrismaClient);
    },
    $queryRaw: async () => [],
    appSettings: { findUnique: async () => null },
    user: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: randomUUID(),
          role: 'student',
          status: 'active',
          twoFactorEnabled: false,
          failedLoginCount: 0,
          lockedUntil: null,
          tokensValidAfter: null,
          studentId: null,
          programme: null,
          level: null,
          university: null,
          bio: null,
          avatarUrl: null,
          avatarPublicId: null,
          avatarConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        users.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return users.find((u) => u.id === where.id) ?? null;
        if (where.email) return users.find((u) => u.email === where.email) ?? null;
        return null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = users.find((u) => u.id === where.id);
        if (!row) throw new Error('User not found');
        Object.assign(row, data);
        return row;
      },
    },
    otpCode: {
      create: async ({
        data,
      }: {
        data: { userId: string; purpose: string; codeHash: string; expiresAt: Date };
      }) => {
        const row = {
          id: randomUUID(),
          attempts: 0,
          usedAt: null,
          createdAt: new Date(),
          ...data,
        };
        otps.push(row);
        return row;
      },
      findFirst: async ({
        where,
      }: {
        where: { userId: string; purpose?: string; usedAt?: null };
      }) => {
        const matches = otps
          .filter(
            (o) =>
              o.userId === where.userId &&
              (!where.purpose || o.purpose === where.purpose) &&
              (where.usedAt === undefined || o.usedAt === where.usedAt),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches[0] ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = otps.find((o) => o.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId?: string; usedAt?: null };
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const o of otps) {
          if (
            (!where.userId || o.userId === where.userId) &&
            (where.usedAt === undefined || o.usedAt === null)
          ) {
            Object.assign(o, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    refreshToken: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: randomUUID(),
          revokedAt: null,
          replacedById: null,
          ...(data as Omit<(typeof refreshTokens)[number], 'id' | 'revokedAt' | 'replacedById'>),
        };
        refreshTokens.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        refreshTokens.find((t) => t.tokenHash === where.tokenHash) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId?: string; familyId?: string; revokedAt?: null };
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const t of refreshTokens) {
          if (
            (!where.userId || t.userId === where.userId) &&
            (!where.familyId || t.familyId === where.familyId) &&
            (where.revokedAt === undefined || t.revokedAt === null)
          ) {
            Object.assign(t, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    loginHistory: { create: async () => ({}) },
    activityEvent: { create: async () => ({}) },
    course: { findMany: async () => [], findFirst: async () => null },
    note: { findMany: async () => [], findFirst: async () => null },
    task: { findMany: async () => [], findFirst: async () => null },
    timetableEntry: { findMany: async () => [] },
    exam: { findMany: async () => [] },
    revisionPlan: { findMany: async () => [] },
    studySession: { findMany: async () => [] },
    gradingScale: { findMany: async () => [] },
    gradeRecord: { findMany: async () => [] },
    deck: { findMany: async () => [] },
    quiz: { findMany: async () => [] },
    document: { findMany: async () => [] },
    conversation: { findMany: async () => [] },
    notification: { findMany: async () => [], count: async () => 0 },
    announcement: { findMany: async () => [] },
  } as unknown as PrismaClient;

  const emailStub = {
    sendVerificationEmail: async () => undefined,
    sendOtpEmail: async (args: { email: string; code: string }) => {
      sentOtps.push({ email: args.email, code: args.code });
    },
    sendPasswordResetEmail: async () => undefined,
    sendTaskReminderEmail: async () => undefined,
    sendClassReminderEmail: async () => undefined,
    sendExamReminderEmail: async () => undefined,
  };

  const storageStub = {
    isConfigured: () => false,
    uploadAvatar: async () => ({ url: 'https://example.com/a.webp', publicId: 'p' }),
    deleteAvatar: async () => undefined,
    uploadAttachment: async () => ({ storageKey: 'k', storageUrl: 'https://example.com/k' }),
    getSignedAttachmentUrl: () => null,
    readAttachmentBytes: async () => Buffer.alloc(0),
    deleteAttachment: async () => undefined,
  };

  const llmStub = {
    modelName: 'test-model',
    isConfigured: () => false,
    stream: async function* () {},
    generateText: async () => ({ text: '' }),
  };

  const app = createApp(
    env,
    {
      checkDb: async () => undefined,
      dashboardPrisma: prisma,
      auth: createAuthService({ prisma, env, email: emailStub, logger }),
      users: createUsersService({ prisma, storage: storageStub, logger }),
      courses: createCoursesService({ prisma, logger }),
      timetable: createTimetableService({
        prisma,
        email: emailStub,
        logger,
        clientUrl: env.CLIENT_URL,
      }),
      exams: {
        service: createExamsService({
          prisma,
          llm: llmStub,
          email: emailStub,
          logger,
          clientUrl: env.CLIENT_URL,
        }),
        isEmailVerified: async () => false,
      },
      ai: {
        service: { listConversations: async () => ({ items: [] }) } as unknown as AiService,
        isEmailVerified: async () => false,
      },
      notes: {
        service: createNotesService({ prisma, llm: llmStub, logger }),
        isEmailVerified: async () => false,
      },
      planner: createPlannerService({
        prisma,
        email: emailStub,
        logger,
        clientUrl: env.CLIENT_URL,
      }),
      focus: createFocusService(prisma),
      gpa: createGpaService({ prisma, logger }),
      study: {
        service: createStudyService({ prisma, llm: llmStub, storage: storageStub, logger }),
        isEmailVerified: async () => false,
      },
      documents: {
        service: createDocumentsService({
          prisma,
          storage: storageStub,
          jobs: { enqueue: async () => undefined } as unknown as Parameters<
            typeof createDocumentsService
          >[0]['jobs'],
          llm: llmStub,
          logger,
        }),
        isEmailVerified: async () => false,
      },
      admin: {
        service: createAdminService({
          prisma,
          email: emailStub,
          storage: storageStub,
          logger,
          env,
        }),
        prisma,
      },
    },
    logger,
  );

  return { app, env, prisma, users, refreshTokens, sentOtps };
}

describe('Strict email verification gate (server)', () => {
  it('blocks unverified users on EVERY protected route with 403 EMAIL_NOT_VERIFIED while allowing /auth/me and /auth/logout', async () => {
    const { app, sentOtps } = makeVerificationGateApp();

    const signupRes = await request(app).post('/api/v1/auth/signup').send({
      name: 'Unverified Student',
      email: 'unverified@ug.edu.gh',
      password: 'Password123!',
      acceptTerms: true,
    });

    expect(signupRes.status).toBe(201);
    expect(signupRes.body.requiresVerification).toBe(true);
    expect(signupRes.body.verificationToken).toBeTypeOf('string');
    expect(signupRes.headers['set-cookie']).toBeUndefined();

    const verifyOnlyToken = signupRes.body.verificationToken as string;

    // Allowed minimal "who am I" endpoint
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${verifyOnlyToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body).toEqual({ email: 'unverified@ug.edu.gh', emailVerified: false });

    // Every protected route must return 403 EMAIL_NOT_VERIFIED
    const protectedEndpoints: Array<['get' | 'post' | 'patch', string]> = [
      ['get', '/api/v1/users/me'],
      ['patch', '/api/v1/users/me'],
      ['get', '/api/v1/auth/sessions'],
      ['post', '/api/v1/auth/logout-all'],
      ['get', '/api/v1/courses'],
      ['get', '/api/v1/notes'],
      ['get', '/api/v1/documents'],
      ['get', '/api/v1/conversations'],
      ['post', '/api/v1/ai/transcribe'],
      ['get', '/api/v1/tasks'],
      ['get', '/api/v1/timetable'],
      ['get', '/api/v1/exams'],
      ['get', '/api/v1/focus/sessions'],
      ['get', '/api/v1/gpa/overview'],
      ['get', '/api/v1/study/decks'],
      ['get', '/api/v1/dashboard'],
      ['get', '/api/v1/analytics'],
      ['get', '/api/v1/announcements/active'],
      ['get', '/api/admin/overview'],
    ];

    for (const [method, path] of protectedEndpoints) {
      const res = await request(app)
        [method](path)
        .set('Authorization', `Bearer ${verifyOnlyToken}`)
        .set('X-Requested-With', 'learnspace');
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(403);
      expect(res.body.error?.code, `${method.toUpperCase()} ${path}`).toBe('EMAIL_NOT_VERIFIED');
    }

    // Wrong OTP fails, then correct OTP unlocks full access
    const wrongOtp = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'unverified@ug.edu.gh', code: '999999' });
    expect(wrongOtp.status).toBe(400);

    const code = sentOtps[0]!.code;
    const okOtp = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'unverified@ug.edu.gh', code });
    expect(okOtp.status).toBe(200);
    expect(okOtp.body.accessToken).toBeTypeOf('string');
    expect(okOtp.body.user.emailVerified).toBe(true);

    const coursesAfter = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${okOtp.body.accessToken}`);
    expect(coursesAfter.status).toBe(200);
  });

  it('prevents refresh tokens of unverified users from minting a full session, blocks mass assignment, and re-locks on email change', async () => {
    const { app, users, refreshTokens, sentOtps } = makeVerificationGateApp();
    const userId = randomUUID();
    const passwordHash = await hashPassword('Password123!');
    users.push({
      id: userId,
      name: 'Old Unverified',
      email: 'old@ug.edu.gh',
      passwordHash,
      emailVerified: false,
      role: 'student',
      status: 'active',
      twoFactorEnabled: false,
      failedLoginCount: 0,
      lockedUntil: null,
      tokensValidAfter: null,
    });

    const rawRefresh = 'stale-refresh-token-value';
    refreshTokens.push({
      id: randomUUID(),
      userId,
      familyId: randomUUID(),
      tokenHash: hashToken(rawRefresh),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedById: null,
      persistent: true,
    });

    // Stale refresh token cannot mint a full session
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Requested-With', 'learnspace')
      .set('Cookie', [`ls_refresh=${rawRefresh}`]);
    expect(refreshRes.status).toBe(403);
    expect(refreshRes.body.error?.code).toBe('EMAIL_NOT_VERIFIED');
    expect(refreshTokens[0]!.revokedAt).not.toBeNull();

    // Unverified login triggers OTP and returns 403 EMAIL_NOT_VERIFIED
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'old@ug.edu.gh', password: 'Password123!' });
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error?.code).toBe('EMAIL_NOT_VERIFIED');
    const verifyToken = loginRes.body.error?.details?.verificationToken as string;
    expect(verifyToken).toBeTypeOf('string');

    // Change email re-locks & sends OTP to the new email
    const changeRes = await request(app)
      .post('/api/v1/auth/change-email')
      .set('Authorization', `Bearer ${verifyToken}`)
      .send({ email: 'newemail@ug.edu.gh' });
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.email).toBe('newemail@ug.edu.gh');
    expect(changeRes.body.emailVerified).toBe(false);

    // Verify new email OTP
    const latestOtp = sentOtps[sentOtps.length - 1]!;
    expect(latestOtp.email).toBe('newemail@ug.edu.gh');
    const verifiedRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'newemail@ug.edu.gh', code: latestOtp.code });
    expect(verifiedRes.status).toBe(200);

    // Mass assignment of emailVerified/role/status via PATCH /users/me is rejected
    const massAssign = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${verifiedRes.body.accessToken}`)
      .send({ emailVerified: false, role: 'super_admin', status: 'suspended' });
    expect(massAssign.status).toBe(400);
    expect(massAssign.body.error?.code).toBe('VALIDATION_ERROR');
  });
});
