import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { createLogger } from '../../src/lib/logger';
import type { StorageService } from '../../src/lib/storage';
import { signAccessToken } from '../../src/lib/tokens';
import { createUsersService } from '../../src/modules/users/users.service';
import { testEnv } from '../helpers';

function makeGreetingHarness(initialUser: Record<string, unknown>) {
  const env = testEnv({
    JWT_SECRET: '9f8e7d6c5b4a32109876543210fedcba9876543210abcdef',
  });
  const logger = createLogger(env);

  const user = {
    id: randomUUID(),
    email: 'ama@ug.edu.gh',
    name: 'Ama Mensah',
    passwordHash: null,
    emailVerified: true,
    role: 'student',
    status: 'active',
    twoFactorEnabled: false,
    studentId: null,
    programme: null,
    level: null,
    university: null,
    bio: null,
    avatarUrl: null,
    avatarPublicId: null,
    avatarConfig: null,
    tokensValidAfter: null,
    firstLoginAt: null,
    lastLoginAt: null,
    onboardingCompleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...initialUser,
  };

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id?: string } }) =>
        where.id === user.id ? user : null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (where.id !== user.id) throw new Error('Not found');
        Object.assign(user, data);
        return user;
      },
    },
    userSettings: { findUnique: async () => ({ timezone: 'UTC' }) },
    task: { findMany: async () => [], count: async () => 0 },
    conversation: { findMany: async () => [], count: async () => 0 },
    notification: { count: async () => 0 },
    course: { count: async () => 0 },
    note: { count: async () => 0 },
    document: { count: async () => 0 },
    studySession: { findMany: async () => [] },
    timetableEntry: { findMany: async () => [] },
    exam: { findMany: async () => [] },
    card: { count: async () => 0 },
    quizAttempt: { findMany: async () => [] },
  } as unknown as PrismaClient;

  const storageStub = { isConfigured: () => false } as unknown as StorageService;

  const app = createApp(
    env,
    {
      checkDb: async () => undefined,
      dashboardPrisma: prisma,
      users: createUsersService({ prisma, storage: storageStub, logger }),
    },
    logger,
  );

  const token = signAccessToken(user.id as string, env.JWT_SECRET).token;
  return { app, token, user };
}

describe('Server-side greeting & onboarding state', () => {
  it('treats a newly verified user as isFirstVisit=true until POST /users/me/first-visit, then returning across devices', async () => {
    const { app, token } = makeGreetingHarness({
      emailVerified: true,
      firstLoginAt: null,
      lastLoginAt: null,
      onboardingCompleted: false,
    });

    const meBefore = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meBefore.status).toBe(200);
    expect(meBefore.body.isFirstVisit).toBe(true);
    expect(meBefore.body.onboardingCompleted).toBe(false);

    const ack = await request(app)
      .post('/api/v1/users/me/first-visit')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Requested-With', 'learnspace');
    expect(ack.status).toBe(200);
    expect(ack.body.isFirstVisit).toBe(false);

    const meAfter = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meAfter.body.isFirstVisit).toBe(false);

    const completeRes = await request(app)
      .post('/api/v1/users/me/onboarding-complete')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Requested-With', 'learnspace');
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.onboardingCompleted).toBe(true);
  });

  it('never marks an unverified user as having entered', async () => {
    const { app, token, user } = makeGreetingHarness({
      emailVerified: false,
      firstLoginAt: null,
    });

    const res = await request(app)
      .post('/api/v1/users/me/first-visit')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Requested-With', 'learnspace');
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('EMAIL_NOT_VERIFIED');
    expect(user.firstLoginAt).toBeNull();
  });

  it('treats backfilled pre-migration users as returning and handles blank names safely', async () => {
    const { app, token } = makeGreetingHarness({
      name: '   ',
      emailVerified: true,
      firstLoginAt: new Date('2026-10-01T00:00:00Z'),
      lastLoginAt: new Date('2026-10-01T00:00:00Z'),
      onboardingCompleted: true,
    });

    const dash = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(dash.status).toBe(200);
    expect(dash.body.isFirstVisit).toBe(false);
    expect(dash.body.onboardingCompleted).toBe(true);
    expect(dash.body.greetingName).toBe('');
  });
});
