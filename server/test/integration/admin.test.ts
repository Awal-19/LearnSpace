import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { EmailService } from '../../src/lib/email';
import { createLogger } from '../../src/lib/logger';
import type { StorageService } from '../../src/lib/storage';
import { signAccessToken } from '../../src/lib/tokens';
import { createAdminService } from '../../src/modules/admin/admin.service';
import { createAuthService } from '../../src/modules/auth/auth.service';
import { hashPassword } from '../../src/lib/password';
import { testEnv } from '../helpers';

interface UserRow {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  emailVerified: boolean;
  role: 'student' | 'admin' | 'super_admin';
  status: 'active' | 'suspended';
  suspendedAt: Date | null;
  suspendedReason: string | null;
  twoFactorEnabled: boolean;
  adminPermissionsJson?: Record<string, boolean>;
  lastActiveAt: Date | null;
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

interface AuditRow {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  metadataJson: unknown;
  ip: string | null;
  createdAt: Date;
}

interface ConversationRow {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: Date;
}

function createAdminMockPrisma() {
  const users: UserRow[] = [];
  const refreshTokens: RefreshRow[] = [];
  const auditLogs: AuditRow[] = [];
  const conversations: ConversationRow[] = [];
  const messages: MessageRow[] = [];
  const notes: Array<{ id: string; userId: string; course: string | null; createdAt: Date }> = [];
  const quizAttempts: Array<{ id: string; userId: string; createdAt: Date }> = [];
  const documents: Array<{ id: string; userId: string; status: string; createdAt: Date }> = [];
  const messageAttachments: Array<{ id: string; createdAt: Date }> = [];
  const errorLogs: Array<{
    id: string;
    route: string;
    method: string;
    statusCode: number;
    code: string;
    message: string;
    createdAt: Date;
  }> = [];
  const activityEvents: Array<{ id: string; userId: string; type: string; createdAt: Date }> = [];
  const loginHistory: Array<{
    id: string;
    userId: string | null;
    email: string;
    method: string;
    success: boolean;
    ip: string | null;
    userAgent: string | null;
    suspicious: boolean;
    reason: string | null;
    createdAt: Date;
  }> = [];

  const filterDate = <T extends { createdAt: Date }>(
    rows: T[],
    where?: { createdAt?: { gte?: Date; lte?: Date } },
  ) => {
    if (!where?.createdAt) return rows;
    return rows.filter((r) => {
      if (where.createdAt?.gte && r.createdAt < where.createdAt.gte) return false;
      if (where.createdAt?.lte && r.createdAt > where.createdAt.lte) return false;
      return true;
    });
  };

  const db = {
    $queryRaw: async () => [{ '?column?': 1 }],
    user: {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id) return users.find((u) => u.id === where.id) ?? null;
        if (where.email) {
          const target = where.email.toLowerCase();
          return users.find((u) => u.email.toLowerCase() === target) ?? null;
        }
        return null;
      },
      findMany: async ({
        where,
        take,
      }: {
        where?: { id?: { in?: string[] }; createdAt?: { gte?: Date; lte?: Date } };
        take?: number;
      } = {}) => {
        let rows = [...users];
        if (where?.id?.in) rows = rows.filter((u) => where.id!.in!.includes(u.id));
        if (where?.createdAt) rows = filterDate(rows, where);
        if (typeof take === 'number') rows = rows.slice(0, take);
        return rows;
      },
      count: async ({
        where,
      }: {
        where?: {
          createdAt?: { gte?: Date };
          emailVerified?: boolean;
          lastActiveAt?: { gte?: Date };
          role?: 'student' | 'admin' | 'super_admin';
        };
      } = {}) => {
        let rows = [...users];
        if (where?.createdAt?.gte) rows = rows.filter((u) => u.createdAt >= where.createdAt!.gte!);
        if (typeof where?.emailVerified === 'boolean') {
          rows = rows.filter((u) => u.emailVerified === where.emailVerified);
        }
        if (where?.lastActiveAt?.gte) {
          rows = rows.filter((u) => u.lastActiveAt && u.lastActiveAt >= where.lastActiveAt!.gte!);
        }
        if (where?.role) {
          rows = rows.filter((u) => u.role === where.role);
        }
        return rows.length;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const user = users.find((u) => u.id === where.id);
        if (!user) throw new Error('User not found');
        Object.assign(user, data, { updatedAt: new Date() });
        return user;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: { in?: string[] } };
        data: Partial<UserRow>;
      }) => {
        const ids = where.id?.in ?? [];
        let count = 0;
        for (const u of users) {
          if (ids.includes(u.id)) {
            Object.assign(u, data, { updatedAt: new Date() });
            count += 1;
          }
        }
        return { count };
      },
      groupBy: async ({ by }: { by: Array<'programme' | 'level'> }) => {
        const key = by[0] ?? 'programme';
        const counts = new Map<string | null, number>();
        for (const u of users) {
          const val = u[key] ?? null;
          counts.set(val, (counts.get(val) ?? 0) + 1);
        }
        return Array.from(counts.entries()).map(([val, count]) => ({
          [key]: val,
          _count: { _all: count },
        }));
      },
    },
    refreshToken: {
      create: async ({
        data,
      }: {
        data: Omit<RefreshRow, 'id' | 'revokedAt' | 'replacedById' | 'createdAt'>;
      }) => {
        const row: RefreshRow = {
          id: randomUUID(),
          ...data,
          revokedAt: null,
          replacedById: null,
          createdAt: new Date(),
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
        where: { userId?: string; revokedAt?: null };
        data: { revokedAt: Date };
      }) => {
        let count = 0;
        for (const t of refreshTokens) {
          if (where.userId && t.userId !== where.userId) continue;
          if (where.revokedAt === null && t.revokedAt !== null) continue;
          t.revokedAt = data.revokedAt;
          count += 1;
        }
        return { count };
      },
    },
    auditLog: {
      create: async ({ data }: { data: Omit<AuditRow, 'id' | 'createdAt'> }) => {
        const row: AuditRow = { id: randomUUID(), ...data, createdAt: new Date() };
        auditLogs.push(row);
        return row;
      },
      findMany: async ({ take, skip }: { take?: number; skip?: number } = {}) => {
        const ordered = [...auditLogs]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((row) => {
            const actor = users.find((u) => u.id === row.actorId);
            return { ...row, actor: { email: actor?.email ?? 'unknown@ug.edu.gh' } };
          });
        const start = skip ?? 0;
        return typeof take === 'number' ? ordered.slice(start, start + take) : ordered.slice(start);
      },
      count: async () => auditLogs.length,
    },
    conversation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const conv = conversations.find((c) => c.id === where.id);
        if (!conv) return null;
        const owner = users.find((u) => u.id === conv.userId);
        return {
          ...conv,
          user: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
          messages: messages
            .filter((m) => m.conversationId === conv.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
      },
    },
    message: {
      count: async () => messages.length,
      findMany: async ({ where }: { where?: { createdAt?: { gte?: Date; lte?: Date } } } = {}) =>
        filterDate(messages, where),
    },
    messageAttachment: {
      count: async () => messageAttachments.length,
      findMany: async ({ where }: { where?: { createdAt?: { gte?: Date; lte?: Date } } } = {}) =>
        filterDate(messageAttachments, where),
    },
    document: {
      count: async ({ where }: { where?: { status?: string } } = {}) =>
        where?.status
          ? documents.filter((d) => d.status === where.status).length
          : documents.length,
      findMany: async ({ where }: { where?: { createdAt?: { gte?: Date; lte?: Date } } } = {}) =>
        filterDate(documents, where),
    },
    note: {
      count: async () => notes.length,
      groupBy: async () => [],
    },
    course: {
      findMany: async () => [],
      count: async () => 3,
    },
    quiz: { count: async () => 4 },
    deck: { count: async () => 5 },
    card: { count: async () => 40 },
    task: { count: async () => 10 },
    studySession: { aggregate: async () => ({ _sum: { durationSeconds: 7200 } }) },
    timetableEntry: { count: async () => 6 },
    exam: { count: async () => 2 },
    revisionPlan: { count: async () => 1 },
    reviewLog: { count: async () => 25 },
    documentPracticeAttempt: { count: async () => 7 },
    gradingScale: { count: async () => 2 },
    gradeRecord: { count: async () => 12 },
    quizAttempt: {
      count: async () => quizAttempts.length,
      findMany: async () => [],
    },
    errorLog: {
      findMany: async () => errorLogs,
    },
    activityEvent: {
      create: async ({ data }: { data: { userId: string; type: string } }) => {
        const row = { id: randomUUID(), ...data, createdAt: new Date() };
        activityEvents.push(row);
        return row;
      },
      findMany: async ({ where }: { where?: { createdAt?: { gte?: Date; lte?: Date } } } = {}) =>
        filterDate(activityEvents, where),
    },
    usageEvent: {
      groupBy: async () => [],
    },
    loginHistory: {
      create: async ({
        data,
      }: {
        data: {
          userId?: string | null;
          email: string;
          method: string;
          success: boolean;
          ip?: string | null;
          userAgent?: string | null;
          suspicious?: boolean;
          reason?: string | null;
        };
      }) => {
        const row = {
          id: randomUUID(),
          userId: data.userId ?? null,
          email: data.email,
          method: data.method,
          success: data.success,
          ip: data.ip ?? null,
          userAgent: data.userAgent ?? null,
          suspicious: data.suspicious ?? false,
          reason: data.reason ?? null,
          createdAt: new Date(),
        };
        loginHistory.push(row);
        return row;
      },
      count: async () => 0,
    },
    appSettings: {
      findUnique: async () => ({
        id: 'global',
        appName: 'LearnSpace',
        supportEmail: 'support@learnspace.local',
        maintenanceMode: false,
        maintenanceMessage: 'Maintenance',
        maintenanceAllowlistJson: [],
        featureChat: true,
        featureUploads: true,
        featureDocuments: true,
        featureSignups: true,
        featureGoogleLogin: true,
        dailyMessageLimit: 100,
        maxUploadBytes: 20_971_520,
        dailyUploadQuota: 50,
        dailyCostAlertUsd: 5,
        monthlyCostCapUsd: 100,
        sessionLifetimeMinutes: 10_080,
        minPasswordLength: 8,
        requireEmailVerification: true,
        requireAdminOtp: false,
        maxLoginAttempts: 5,
        lockoutMinutes: 15,
        aiModel: 'z-ai/glm-5.3-flash',
        aiSystemPromptVersion: 'v1',
        aiMaxTokens: 2048,
        currentVersion: 1,
        allowedFileTypesJson: ['pdf'],
        updatedById: null,
        updatedAt: new Date(),
      }),
      create: async ({ data }: { data: Record<string, unknown> }) => data,
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'global',
        appName: 'LearnSpace',
        currentVersion: 2,
        ...data,
      }),
    },
    appSettingsVersion: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: randomUUID(),
        createdAt: new Date(),
        ...data,
      }),
      findMany: async () => [],
      findFirst: async () => null,
    },
    _seed: {
      users,
      auditLogs,
      conversations,
      messages,
      notes,
      quizAttempts,
      documents,
    },
  };

  return db as unknown as PrismaClient & { _seed: typeof db._seed };
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date();
  return {
    id: randomUUID(),
    email: `user-${randomUUID().slice(0, 8)}@ug.edu.gh`,
    name: 'Test User',
    passwordHash: null,
    emailVerified: true,
    role: 'student',
    status: 'active',
    suspendedAt: null,
    suspendedReason: null,
    twoFactorEnabled: false,
    lastActiveAt: now,
    studentId: null,
    programme: 'BSc Computer Science',
    level: '200',
    university: 'University of Ghana',
    bio: null,
    avatarUrl: null,
    avatarPublicId: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Admin Dashboard integration', () => {
  let prisma: ReturnType<typeof createAdminMockPrisma>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    prisma = createAdminMockPrisma();
    const env = testEnv();
    const logger = createLogger(env);
    const email: EmailService = {
      sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
      sendOtpEmail: vi.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
      sendTaskReminderEmail: vi.fn().mockResolvedValue(undefined),
      sendClassReminderEmail: vi.fn().mockResolvedValue(undefined),
      sendExamReminderEmail: vi.fn().mockResolvedValue(undefined),
    };
    const storage = {
      isConfigured: () => false,
      deleteAttachment: vi.fn().mockResolvedValue(undefined),
    } as unknown as StorageService;
    const auth = createAuthService({ prisma, env, email, logger });
    const adminService = createAdminService({ prisma, env, email, storage, logger });
    app = createApp(
      env,
      { checkDb: async () => undefined, auth, admin: { service: adminService, prisma } },
      logger,
    );
  });

  function authHeader(user: UserRow) {
    const { token } = signAccessToken(user.id, testEnv().JWT_SECRET, 300);
    return `Bearer ${token}`;
  }

  it('blocks students from reaching any /api/admin endpoint (403)', async () => {
    const student = makeUser({ role: 'student' });
    prisma._seed.users.push(student);

    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', authHeader(student));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows super_admin to promote a user to admin, but blocks a regular admin (403)', async () => {
    const admin = makeUser({ role: 'admin', email: 'admin@ug.edu.gh' });
    const superAdmin = makeUser({ role: 'super_admin', email: 'super@ug.edu.gh' });
    const target = makeUser({ role: 'student', email: 'target@ug.edu.gh' });
    prisma._seed.users.push(admin, superAdmin, target);

    const forbiddenRes = await request(app)
      .patch(`/api/admin/users/${target.id}/role`)
      .set('Authorization', authHeader(admin))
      .send({ role: 'admin', reason: 'Attempted promotion' });

    expect(forbiddenRes.status).toBe(403);
    expect(target.role).toBe('student');

    const okRes = await request(app)
      .patch(`/api/admin/users/${target.id}/role`)
      .set('Authorization', authHeader(superAdmin))
      .send({ role: 'admin', reason: 'Trusted moderator' });

    expect(okRes.status).toBe(200);
    expect(target.role).toBe('admin');
    expect(prisma._seed.auditLogs).toHaveLength(1);
    expect(prisma._seed.auditLogs[0]).toMatchObject({
      actorId: superAdmin.id,
      action: 'user.change_role',
      targetId: target.id,
      reason: 'Trusted moderator',
    });
  });

  it('suspends a user, writes an audit log, and blocks the suspended user on login', async () => {
    const admin = makeUser({ role: 'admin', email: 'admin@ug.edu.gh' });
    const passwordHash = await hashPassword('Password123!');
    const student = makeUser({ role: 'student', email: 'bad@ug.edu.gh', passwordHash });
    prisma._seed.users.push(admin, student);

    const suspendRes = await request(app)
      .patch(`/api/admin/users/${student.id}/status`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'suspended', reason: 'Abuse policy violation' });

    expect(suspendRes.status).toBe(200);
    expect(student.status).toBe('suspended');
    expect(prisma._seed.auditLogs).toHaveLength(1);
    expect(prisma._seed.auditLogs[0]?.action).toBe('user.suspend');

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bad@ug.edu.gh', password: 'Password123!' });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('returns overview stats matching the database counts', async () => {
    const admin = makeUser({ role: 'admin', email: 'admin@ug.edu.gh' });
    const student = makeUser({ role: 'student', emailVerified: false });
    prisma._seed.users.push(admin, student);
    prisma._seed.notes.push(
      { id: randomUUID(), userId: student.id, course: 'CSCD 201', createdAt: new Date() },
      { id: randomUUID(), userId: student.id, course: 'CSCD 201', createdAt: new Date() },
    );
    prisma._seed.quizAttempts.push({ id: randomUUID(), userId: student.id, createdAt: new Date() });
    prisma._seed.documents.push({
      id: randomUUID(),
      userId: student.id,
      status: 'ready',
      createdAt: new Date(),
    });

    const res = await request(app)
      .get('/api/admin/overview?range=30d')
      .set('Authorization', authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.stats.totalUsers).toBe(2);
    expect(res.body.stats.verifiedUsers).toBe(1);
    expect(res.body.stats.unverifiedUsers).toBe(1);
    expect(res.body.stats.totalNotes).toBe(2);
    expect(res.body.stats.totalQuizzesTaken).toBe(1);
    expect(res.body.stats.totalDocumentsProcessed).toBe(1);
  });

  it('exports CSV for audit logs and selected users', async () => {
    const admin = makeUser({ role: 'admin', email: 'admin@ug.edu.gh' });
    const student = makeUser({ role: 'student', email: 'csv@ug.edu.gh', name: 'Csv Student' });
    prisma._seed.users.push(admin, student);

    await request(app)
      .post(`/api/admin/users/${student.id}/force-logout`)
      .set('Authorization', authHeader(admin));

    const auditCsvRes = await request(app)
      .get('/api/admin/audit-logs?format=csv')
      .set('Authorization', authHeader(admin));

    expect(auditCsvRes.status).toBe(200);
    expect(auditCsvRes.headers['content-type']).toContain('text/csv');
    expect(auditCsvRes.text).toContain(
      'id,actorEmail,action,targetType,targetId,reason,ip,createdAt',
    );
    expect(auditCsvRes.text).toContain('user.force_logout');

    const bulkCsvRes = await request(app)
      .post('/api/admin/users/bulk')
      .set('Authorization', authHeader(admin))
      .send({ action: 'export_csv', userIds: [student.id] });

    expect(bulkCsvRes.status).toBe(200);
    expect(bulkCsvRes.headers['content-type']).toContain('text/csv');
    expect(bulkCsvRes.text).toContain('csv@ug.edu.gh');
  });

  it('requires a moderation reason to inspect conversation content and logs access', async () => {
    const admin = makeUser({ role: 'admin', email: 'admin@ug.edu.gh' });
    const student = makeUser({ role: 'student', email: 'conv@ug.edu.gh' });
    const convId = randomUUID();
    prisma._seed.users.push(admin, student);
    prisma._seed.conversations.push({
      id: convId,
      userId: student.id,
      title: 'Algorithms Help',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prisma._seed.messages.push({
      id: randomUUID(),
      conversationId: convId,
      role: 'user',
      content: 'Explain merge sort complexity.',
      createdAt: new Date(),
    });

    const missingReasonRes = await request(app)
      .post(`/api/admin/conversations/${convId}/inspect`)
      .set('Authorization', authHeader(admin))
      .send({ reason: '' });

    expect(missingReasonRes.status).toBe(400);

    const okRes = await request(app)
      .post(`/api/admin/conversations/${convId}/inspect`)
      .set('Authorization', authHeader(admin))
      .send({ reason: 'Investigating abuse report #12' });

    expect(okRes.status).toBe(200);
    expect(okRes.body.conversation.messages).toHaveLength(1);
    expect(okRes.body.conversation.messages[0].content).toBe('Explain merge sort complexity.');
    expect(prisma._seed.auditLogs.some((l) => l.action === 'moderation.inspect_conversation')).toBe(
      true,
    );
  });

  it('blocks regular admins from /api/admin/super/* and from suspending another admin', async () => {
    const admin1 = makeUser({ role: 'admin', email: 'a1@ug.edu.gh' });
    const admin2 = makeUser({ role: 'admin', email: 'a2@ug.edu.gh' });
    prisma._seed.users.push(admin1, admin2);

    const teamRes = await request(app)
      .get('/api/admin/super/team')
      .set('Authorization', authHeader(admin1));
    expect(teamRes.status).toBe(403);

    const suspendPeerRes = await request(app)
      .patch(`/api/admin/users/${admin2.id}/status`)
      .set('Authorization', authHeader(admin1))
      .send({ status: 'suspended', reason: 'Attempted peer suspension' });
    expect(suspendPeerRes.status).toBe(403);
    expect(admin2.status).toBe('active');
  });

  it('prevents demoting the last remaining super_admin and enforces step-up on platform settings', async () => {
    const passwordHash = await hashPassword('SuperPass123!');
    const superAdmin = makeUser({
      role: 'super_admin',
      email: 'onlysuper@ug.edu.gh',
      passwordHash,
    });
    prisma._seed.users.push(superAdmin);

    // Self-demotion blocked
    const selfRes = await request(app)
      .patch(`/api/admin/users/${superAdmin.id}/role`)
      .set('Authorization', authHeader(superAdmin))
      .send({ role: 'admin' });
    expect(selfRes.status).toBe(400);

    // Step-up required on PATCH /api/admin/super/settings
    const noStepUpRes = await request(app)
      .patch('/api/admin/super/settings')
      .set('Authorization', authHeader(superAdmin))
      .send({ minPasswordLength: 10 });
    expect(noStepUpRes.status).toBe(403);

    const okStepUpRes = await request(app)
      .patch('/api/admin/super/settings')
      .set('Authorization', authHeader(superAdmin))
      .set('x-step-up-password', 'SuperPass123!')
      .send({ minPasswordLength: 10, reason: 'Enforce 10-char passwords' });
    expect(okStepUpRes.status).toBe(200);
    expect(prisma._seed.auditLogs.some((l) => l.action === 'super.settings_updated')).toBe(true);
  });

  it('returns anonymized aggregate learning metrics across all academic features without exposing PII', async () => {
    const admin = makeUser({ role: 'admin', email: 'stats-admin@ug.edu.gh' });
    const student = makeUser({
      role: 'student',
      email: 'student-secret@ug.edu.gh',
      programme: 'BSc CS',
      level: 'Year 3',
    });
    prisma._seed.users.push(admin, student);

    const res = await request(app)
      .get('/api/admin/learning')
      .set('Authorization', authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({
      totalQuizzes: 4,
      totalDecks: 5,
      totalCards: 40,
      totalCourses: 3,
      totalTimetableEntries: 6,
      totalExams: 2,
      totalRevisionPlans: 1,
      totalFlashcardReviews: 25,
      totalPracticeAttempts: 7,
      totalGradingScales: 2,
      totalGradeRecords: 12,
      totalStudyHours: 2,
    });
    expect(JSON.stringify(res.body)).not.toContain('student-secret@ug.edu.gh');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});
