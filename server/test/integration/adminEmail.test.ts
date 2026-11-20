import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { EmailService } from '../../src/lib/email';
import { createLogger } from '../../src/lib/logger';
import { hashPassword } from '../../src/lib/password';
import type { StorageService } from '../../src/lib/storage';
import { signAccessToken } from '../../src/lib/tokens';
import { createAdminService } from '../../src/modules/admin/admin.service';
import { testEnv } from '../helpers';

async function makeAdminEmailHarness(opts?: {
  emailShouldFail?: boolean;
  recentOtpCount?: number;
  latestOtpAgeSec?: number;
}) {
  const env = testEnv({
    JWT_SECRET: '9f8e7d6c5b4a32109876543210fedcba9876543210abcdef',
    ADMIN_CONSOLE_PASSWORD: '',
  });
  const logger = createLogger(env);

  const adminId = randomUUID();
  const targetId = randomUUID();
  const adminPasswordHash = await hashPassword('AdminPassword123!');

  const users = new Map<string, Record<string, unknown>>([
    [
      adminId,
      {
        id: adminId,
        email: 'admin@learnspace.app',
        name: 'Admin',
        role: 'super_admin',
        status: 'active',
        emailVerified: true,
        passwordHash: adminPasswordHash,
        tokensValidAfter: null,
        adminPermissionsJson: { can_manage_users: true },
      },
    ],
    [
      targetId,
      {
        id: targetId,
        email: 'ama@gmail.com',
        name: 'Ama',
        role: 'student',
        status: 'active',
        emailVerified: false,
        passwordHash: null,
        tokensValidAfter: null,
        adminPermissionsJson: {},
      },
    ],
  ]);

  const otps: Array<Record<string, unknown>> = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const sentCodes: string[] = [];

  const prisma = {
    $transaction: async <T>(ops: Array<Promise<T>>) => Promise.all(ops),
    user: {
      findUnique: async ({ where }: { where: { id?: string } }) =>
        where.id ? (users.get(where.id) ?? null) : null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = users.get(where.id)!;
        Object.assign(u, data);
        return u;
      },
    },
    otpCode: {
      findFirst: async () =>
        typeof opts?.latestOtpAgeSec === 'number'
          ? { createdAt: new Date(Date.now() - opts.latestOtpAgeSec * 1000) }
          : null,
      count: async () => opts?.recentOtpCount ?? 0,
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        otps.push(data);
        return data;
      },
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditLogs.push(data);
        return data;
      },
    },
  } as unknown as PrismaClient;

  const emailStub: EmailService = {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendOtpEmail: vi.fn().mockImplementation(async ({ code }: { code: string }) => {
      if (opts?.emailShouldFail) {
        throw new Error(
          'EmailJS failed (403): API calls are disabled for non-browser applications',
        );
      }
      sentCodes.push(code);
    }),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    sendTaskReminderEmail: vi.fn().mockResolvedValue(undefined),
    sendClassReminderEmail: vi.fn().mockResolvedValue(undefined),
    sendExamReminderEmail: vi.fn().mockResolvedValue(undefined),
  };

  const storageStub = {
    isConfigured: () => false,
  } as unknown as StorageService;

  const app = createApp(
    env,
    {
      checkDb: async () => undefined,
      dashboardPrisma: prisma,
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

  const token = signAccessToken(adminId, env.JWT_SECRET).token;
  return { app, token, targetId, otps, auditLogs, sentCodes, users };
}

describe('Admin resend verification & mark verified', () => {
  it('creates a new hashed 6-digit OTP, writes audit log, masks email, and never returns the code', async () => {
    const { app, token, targetId, otps, auditLogs, sentCodes } = await makeAdminEmailHarness();

    const res = await request(app)
      .post(`/api/admin/users/${targetId}/resend-verification`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Requested-With', 'learnspace');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, maskedEmail: 'a***@gmail.com' });
    expect(sentCodes).toHaveLength(1);
    expect(sentCodes[0]).toMatch(/^\d{6}$/);
    expect(JSON.stringify(res.body)).not.toContain(sentCodes[0]);
    expect(otps).toHaveLength(1);
    expect(otps[0]?.codeHash).not.toBe(sentCodes[0]);
    expect(auditLogs[0]?.action).toBe('user.resend_verification');
  });

  it('respects 60-second cooldown and hourly limit', async () => {
    const cooldown = await makeAdminEmailHarness({ latestOtpAgeSec: 20 });
    const res1 = await request(cooldown.app)
      .post(`/api/admin/users/${cooldown.targetId}/resend-verification`)
      .set('Authorization', `Bearer ${cooldown.token}`)
      .set('X-Requested-With', 'learnspace');
    expect(res1.status).toBe(429);

    const hourly = await makeAdminEmailHarness({ recentOtpCount: 5 });
    const res2 = await request(hourly.app)
      .post(`/api/admin/users/${hourly.targetId}/resend-verification`)
      .set('Authorization', `Bearer ${hourly.token}`)
      .set('X-Requested-With', 'learnspace');
    expect(res2.status).toBe(429);
  });

  it('returns 503 with specific friendly error when provider rejects the send', async () => {
    const { app, token, targetId } = await makeAdminEmailHarness({ emailShouldFail: true });
    const res = await request(app)
      .post(`/api/admin/users/${targetId}/resend-verification`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Requested-With', 'learnspace');

    expect(res.status).toBe(503);
    expect(res.body.error?.message).toContain('Failed to send verification code');
    expect(res.body.error?.message).toContain('EmailJS failed (403)');
  });

  it('allows admin to mark email verified with step-up and reason, and writes audit log', async () => {
    const { app, token, targetId, auditLogs, users } = await makeAdminEmailHarness();

    // Verify step-up first
    const stepUpRes = await request(app)
      .post('/api/admin/super/step-up/verify')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Requested-With', 'learnspace')
      .send({ password: 'AdminPassword123!' });
    expect(stepUpRes.status).toBe(200);
    const rawCookies = stepUpRes.headers['set-cookie'];
    const cookies = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];

    const res = await request(app)
      .post(`/api/admin/users/${targetId}/mark-verified`)
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookies)
      .set('X-Requested-With', 'learnspace')
      .send({ reason: 'Student could not receive email due to campus filter' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ emailVerified: true });
    expect(users.get(targetId)?.emailVerified).toBe(true);
    expect(auditLogs[0]).toMatchObject({
      action: 'user.mark_email_verified',
      targetId,
      reason: 'Student could not receive email due to campus filter',
    });
  });
});
