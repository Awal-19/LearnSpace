import { randomUUID } from 'node:crypto';
import type {
  ExamType,
  PrismaClient,
  RevisionPlanStatus,
  RevisionSessionStatus,
  UsageFeature,
} from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { EmailService } from '../../src/lib/email';
import type { LLMProvider } from '../../src/lib/llm/provider';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
import { createCoursesService } from '../../src/modules/courses/courses.service';
import { createExamsService, localDateTimeToUtc } from '../../src/modules/exams/exams.service';
import { createPlannerService } from '../../src/modules/planner/planner.service';
import { testEnv } from '../helpers';

interface ExamRow {
  id: string;
  userId: string;
  courseId: string;
  title: string;
  examType: ExamType;
  startsAt: Date;
  durationMinutes: number | null;
  venue: string | null;
  weightPercent: number | null;
  topicsJson: unknown;
  notes: string | null;
  reminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PlanRow {
  id: string;
  userId: string;
  title: string;
  startDate: Date;
  endDate: Date;
  hoursPerDay: number;
  daysOffJson: unknown;
  preferredTimesJson: unknown;
  status: RevisionPlanStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionRow {
  id: string;
  planId: string;
  userId: string;
  examId: string | null;
  courseId: string | null;
  taskId: string | null;
  scheduledDate: Date;
  startTime: string;
  durationMinutes: number;
  topic: string;
  notes: string | null;
  status: RevisionSessionStatus;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TaskRow {
  id: string;
  userId: string;
  courseId: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'done';
  completedAt: Date | null;
  reminderOffsetMinutes: number | null;
  remindAt: Date | null;
  reminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function makeFakeExamsPrisma() {
  const users = new Map<
    string,
    { id: string; email: string; name: string; emailVerified: boolean }
  >();
  const settings = new Map<
    string,
    {
      userId: string;
      timezone: string;
      notifyInApp: boolean;
      notifyEmailReminders: boolean;
      examReminderMinutes: number;
    }
  >();
  const courses = new Map<
    string,
    {
      id: string;
      userId: string;
      name: string;
      code: string | null;
      color: string | null;
      lecturer: string | null;
      creditHours: number | null;
      semester: string | null;
      level: string | null;
      courseNotes: string | null;
      archivedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }
  >();
  const exams = new Map<string, ExamRow>();
  const plans = new Map<string, PlanRow>();
  const sessions = new Map<string, SessionRow>();
  const tasks = new Map<string, TaskRow>();
  const notifications = new Map<
    string,
    {
      id: string;
      userId: string;
      type: string;
      title: string;
      body: string;
      examId: string | null;
      readAt: Date | null;
      createdAt: Date;
    }
  >();
  const notes: Array<{
    userId: string;
    courseId: string;
    title: string;
    aiSummary: string | null;
    updatedAt: Date;
    createdAt: Date;
    id: string;
  }> = [];
  const documents: Array<{
    userId: string;
    courseId: string;
    title: string;
    type: 'past_question' | 'slides' | 'notes';
    originalName: string;
    status: string;
    pageCount: number;
    createdAt: Date;
    id: string;
  }> = [];
  const docAttempts: Array<{
    userId: string;
    courseId: string;
    weakTopicsJson: unknown;
    takenAt: Date;
  }> = [];
  const quizAttempts: Array<{
    userId: string;
    courseId: string;
    score: number;
    total: number;
    topic: string | null;
    title: string;
    takenAt: Date;
  }> = [];
  const aiUsage = new Map<
    string,
    { userId: string; day: Date; inputTokens: number; outputTokens: number; requests: number }
  >();
  const usageEvents: Array<{
    userId: string | null;
    feature: UsageFeature;
    tokensIn: number;
    tokensOut: number;
    status: string;
  }> = [];

  const hydrateSession = (s: SessionRow) => {
    const c = s.courseId ? (courses.get(s.courseId) ?? null) : null;
    const e = s.examId ? (exams.get(s.examId) ?? null) : null;
    const t = s.taskId ? (tasks.get(s.taskId) ?? null) : null;
    return {
      ...s,
      course: c ? { id: c.id, name: c.name, code: c.code, color: c.color } : null,
      exam: e ? { id: e.id, title: e.title, startsAt: e.startsAt } : null,
      task: t ? { status: t.status } : null,
    };
  };

  const hydratePlan = (p: PlanRow) => ({
    ...p,
    sessions: Array.from(sessions.values())
      .filter((s) => s.planId === p.id)
      .sort(
        (a, b) =>
          a.scheduledDate.getTime() - b.scheduledDate.getTime() ||
          a.startTime.localeCompare(b.startTime) ||
          a.position - b.position,
      )
      .map(hydrateSession),
  });

  const prisma = {
    $transaction: async <T>(fn: (tx: PrismaClient) => Promise<T>) => fn(prisma),
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
    },
    userSettings: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        settings.get(where.userId) ?? null,
    },
    course: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const c = courses.get(where.id);
        return c && c.userId === where.userId ? c : null;
      },
      findMany: async ({ where }: { where: { userId: string; id?: { in: string[] } } }) =>
        Array.from(courses.values()).filter(
          (c) => c.userId === where.userId && (!where.id?.in || where.id.in.includes(c.id)),
        ),
    },
    exam: {
      findMany: async ({
        where,
        take,
      }: {
        where: {
          userId?: string;
          courseId?: string;
          id?: { in: string[] };
          startsAt?: { gte?: Date; gt?: Date };
          reminderSentAt?: null;
          course?: { archivedAt: null };
        };
        take?: number;
      }) => {
        let rows = Array.from(exams.values())
          .filter((e) => !where.userId || e.userId === where.userId)
          .filter((e) => !where.courseId || e.courseId === where.courseId)
          .filter((e) => !where.id?.in || where.id.in.includes(e.id))
          .filter((e) => !where.startsAt?.gte || e.startsAt >= where.startsAt.gte)
          .filter((e) => !where.startsAt?.gt || e.startsAt > where.startsAt.gt)
          .filter((e) => (where.reminderSentAt === null ? e.reminderSentAt === null : true))
          .filter((e) => {
            if (!where.course) return true;
            const c = courses.get(e.courseId);
            return c ? c.archivedAt === null : false;
          })
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

        if (take) rows = rows.slice(0, take);
        return rows.map((e) => {
          const course = courses.get(e.courseId)!;
          const user = users.get(e.userId)!;
          return {
            ...e,
            course,
            user: {
              ...user,
              settings: settings.get(e.userId) ?? null,
            },
          };
        });
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const e = exams.get(where.id);
        return e && e.userId === where.userId ? e : null;
      },
      create: async ({
        data,
      }: {
        data: Omit<ExamRow, 'id' | 'reminderSentAt' | 'createdAt' | 'updatedAt'>;
      }) => {
        const now = new Date();
        const row: ExamRow = {
          ...data,
          id: randomUUID(),
          reminderSentAt: null,
          createdAt: now,
          updatedAt: now,
        };
        exams.set(row.id, row);
        return { ...row, course: courses.get(row.courseId)! };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<ExamRow> }) => {
        const existing = exams.get(where.id)!;
        Object.assign(existing, data, { updatedAt: new Date() });
        return { ...existing, course: courses.get(existing.courseId)! };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const e = exams.get(where.id);
        exams.delete(where.id);
        return e;
      },
    },
    revisionPlan: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        Array.from(plans.values())
          .filter((p) => p.userId === where.userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map(hydratePlan),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const p = plans.get(where.id);
        return p && p.userId === where.userId ? hydratePlan(p) : null;
      },
      create: async ({
        data,
      }: {
        data: Omit<PlanRow, 'id' | 'status' | 'createdAt' | 'updatedAt'>;
      }) => {
        const now = new Date();
        const row: PlanRow = {
          ...data,
          id: randomUUID(),
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };
        plans.set(row.id, row);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const p = plans.get(where.id);
        plans.delete(where.id);
        for (const [k, s] of sessions.entries()) {
          if (s.planId === where.id) sessions.delete(k);
        }
        return p;
      },
    },
    revisionSession: {
      findFirst: async ({ where }: { where: { id: string; planId: string; userId: string } }) => {
        const s = sessions.get(where.id);
        if (!s || s.planId !== where.planId || s.userId !== where.userId) return null;
        return {
          ...s,
          plan: { title: plans.get(s.planId)?.title ?? 'Plan' },
          course: s.courseId ? (courses.get(s.courseId) ?? null) : null,
        };
      },
      create: async ({ data }: { data: Omit<SessionRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const now = new Date();
        const row: SessionRow = {
          ...data,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        sessions.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
        const row = sessions.get(where.id)!;
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { taskId: string; userId: string };
        data: Partial<SessionRow>;
      }) => {
        let count = 0;
        for (const s of sessions.values()) {
          if (s.taskId === where.taskId && s.userId === where.userId) {
            Object.assign(s, data, { updatedAt: new Date() });
            count += 1;
          }
        }
        return { count };
      },
    },
    task: {
      findMany: async ({ where }: { where: { userId: string; courseId?: string } }) =>
        Array.from(tasks.values()).filter(
          (t) =>
            t.userId === where.userId &&
            (where.courseId === undefined || t.courseId === where.courseId),
        ),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const t = tasks.get(where.id);
        return t && t.userId === where.userId ? t : null;
      },
      count: async () => 0,
      create: async ({ data }: { data: Partial<TaskRow> & { userId: string; title: string } }) => {
        const now = new Date();
        const row: TaskRow = {
          id: randomUUID(),
          userId: data.userId,
          courseId: data.courseId ?? null,
          title: data.title,
          description: data.description ?? null,
          dueAt: data.dueAt ?? null,
          priority: data.priority ?? 'medium',
          status: data.status ?? 'todo',
          completedAt: data.completedAt ?? null,
          reminderOffsetMinutes: data.reminderOffsetMinutes ?? null,
          remindAt: data.remindAt ?? null,
          reminderSentAt: null,
          createdAt: now,
          updatedAt: now,
        };
        tasks.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<TaskRow> }) => {
        const existing = tasks.get(where.id)!;
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) {
            (existing as unknown as Record<string, unknown>)[k] = v;
          }
        }
        existing.updatedAt = new Date();
        return existing;
      },
      deleteMany: async ({ where }: { where: { userId: string; id?: { in: string[] } } }) => {
        let count = 0;
        for (const [id, t] of tasks.entries()) {
          if (t.userId === where.userId && (!where.id?.in || where.id.in.includes(id))) {
            tasks.delete(id);
            count += 1;
          }
        }
        return { count };
      },
    },
    note: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; courseId?: string | { in: string[] } };
      }) =>
        notes.filter((n) => {
          if (n.userId !== where.userId) return false;
          if (typeof where.courseId === 'string') return n.courseId === where.courseId;
          if (where.courseId && 'in' in where.courseId)
            return where.courseId.in.includes(n.courseId);
          return true;
        }),
      count: async () => 0,
    },
    document: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; courseId?: string | { in: string[] } };
      }) =>
        documents.filter((d) => {
          if (d.userId !== where.userId) return false;
          if (typeof where.courseId === 'string') return d.courseId === where.courseId;
          if (where.courseId && 'in' in where.courseId)
            return where.courseId.in.includes(d.courseId);
          return true;
        }),
    },
    deck: { findMany: async () => [] },
    quiz: { findMany: async () => [] },
    documentPracticeAttempt: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        docAttempts
          .filter((a) => a.userId === where.userId)
          .map((a) => ({
            weakTopicsJson: a.weakTopicsJson,
            set: { document: { courseId: a.courseId } },
          })),
    },
    quizAttempt: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        quizAttempts
          .filter((q) => q.userId === where.userId)
          .map((q) => ({
            score: q.score,
            total: q.total,
            quiz: { courseId: q.courseId, topic: q.topic, title: q.title },
          })),
    },
    studySession: {
      aggregate: async () => ({ _sum: { durationSeconds: 0 } }),
      findMany: async () => [],
    },
    conversation: { findMany: async () => [] },
    timetableEntry: { findMany: async () => [] },
    notification: {
      count: async () => 0,
      findMany: async ({ where }: { where: { userId: string } }) =>
        Array.from(notifications.values()).filter((n) => n.userId === where.userId),
      upsert: async ({
        where,
        create,
      }: {
        where: {
          userId_type_occurrenceKey?: { userId: string; type: string; occurrenceKey: string };
        };
        create: {
          userId: string;
          type: string;
          title: string;
          body: string;
          examId?: string | null;
        };
      }) => {
        const occ = where.userId_type_occurrenceKey;
        const key = occ ? `${occ.userId}:${occ.type}:${occ.occurrenceKey}` : randomUUID();
        if (notifications.has(key)) return notifications.get(key)!;
        const row = {
          id: randomUUID(),
          userId: create.userId,
          type: create.type,
          title: create.title,
          body: create.body,
          examId: create.examId ?? null,
          readAt: null,
          createdAt: new Date(),
        };
        notifications.set(key, row);
        return row;
      },
    },
    aiUsageDaily: {
      findUnique: async ({ where }: { where: { userId_day: { userId: string; day: Date } } }) => {
        const key = `${where.userId_day.userId}:${where.userId_day.day.toISOString().slice(0, 10)}`;
        return aiUsage.get(key) ?? null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_day: { userId: string; day: Date } };
        create: {
          userId: string;
          day: Date;
          inputTokens: number;
          outputTokens: number;
          requests: number;
        };
        update: {
          inputTokens: { increment: number };
          outputTokens: { increment: number };
          requests: { increment: number };
        };
      }) => {
        const key = `${where.userId_day.userId}:${where.userId_day.day.toISOString().slice(0, 10)}`;
        const existing = aiUsage.get(key);
        if (!existing) {
          aiUsage.set(key, { ...create });
          return create;
        }
        existing.inputTokens += update.inputTokens.increment;
        existing.outputTokens += update.outputTokens.increment;
        existing.requests += update.requests.increment;
        return existing;
      },
    },
    usageEvent: {
      create: async ({
        data,
      }: {
        data: {
          userId?: string | null;
          feature: UsageFeature;
          tokensIn: number;
          tokensOut: number;
          status: string;
        };
      }) => {
        usageEvents.push({
          userId: data.userId ?? null,
          feature: data.feature,
          tokensIn: data.tokensIn,
          tokensOut: data.tokensOut,
          status: data.status,
        });
        return data;
      },
    },
  } as unknown as PrismaClient;

  return {
    prisma,
    users,
    settings,
    courses,
    exams,
    plans,
    sessions,
    tasks,
    notifications,
    notes,
    documents,
    docAttempts,
    quizAttempts,
    usageEvents,
    aiUsage,
  };
}

describe('Exams & AI Revision Plans integration', () => {
  const env = testEnv();
  const logger = createLogger(env);

  let db: ReturnType<typeof makeFakeExamsPrisma>;
  let llmMock: LLMProvider & { generateText: ReturnType<typeof vi.fn> };
  let emailMock: EmailService & { sendExamReminderEmail: ReturnType<typeof vi.fn> };
  let examsService: ReturnType<typeof createExamsService>;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let otherId: string;
  let courseId: string;
  let token: string;
  let otherToken: string;

  beforeEach(() => {
    db = makeFakeExamsPrisma();
    llmMock = {
      modelName: 'test-model',
      isConfigured: () => true,
      stream: async function* () {},
      generateText: vi.fn(),
    };
    emailMock = {
      sendVerificationEmail: vi.fn(async () => undefined),
      sendOtpEmail: vi.fn(async () => undefined),
      sendPasswordResetEmail: vi.fn(async () => undefined),
      sendTaskReminderEmail: vi.fn(async () => undefined),
      sendClassReminderEmail: vi.fn(async () => undefined),
      sendExamReminderEmail: vi.fn(async () => undefined),
    };

    examsService = createExamsService({
      prisma: db.prisma,
      llm: llmMock,
      email: emailMock,
      logger,
      clientUrl: env.CLIENT_URL,
      dailyTokenLimit: 100_000,
    });
    const planner = createPlannerService({
      prisma: db.prisma,
      email: emailMock,
      logger,
      clientUrl: env.CLIENT_URL,
    });
    const courses = createCoursesService({ prisma: db.prisma, logger });

    app = createApp(
      env,
      {
        checkDb: async () => undefined,
        courses,
        planner,
        exams: {
          service: examsService,
          isEmailVerified: async (uid) => Boolean(db.users.get(uid)?.emailVerified),
        },
        dashboardPrisma: db.prisma,
      },
      logger,
    );

    userId = randomUUID();
    otherId = randomUUID();
    courseId = randomUUID();

    db.users.set(userId, {
      id: userId,
      email: 'ama@uni.edu',
      name: 'Ama Mensah',
      emailVerified: true,
    });
    db.users.set(otherId, {
      id: otherId,
      email: 'other@uni.edu',
      name: 'Kofi',
      emailVerified: true,
    });
    db.settings.set(userId, {
      userId,
      timezone: 'Africa/Accra',
      notifyInApp: true,
      notifyEmailReminders: true,
      examReminderMinutes: 1440,
    });

    const now = new Date();
    db.courses.set(courseId, {
      id: courseId,
      userId,
      name: 'Database Systems',
      code: 'CSCD 312',
      color: '#2563EB',
      lecturer: 'Dr. Boateng',
      creditHours: 3,
      semester: '2026 Sem 1',
      level: 'Level 300',
      courseNotes: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    token = signAccessToken(userId, env.JWT_SECRET).token;
    otherToken = signAccessToken(otherId, env.JWT_SECRET).token;
  });

  it('creates, updates, deletes exams and populates Course detail & Dashboard countdowns + reminders', async () => {
    const startsAt = new Date(Date.now() + 10 * 3600_000).toISOString(); // 10 hours from now (<24h reminder lead)

    // Foreign course -> 404
    const foreignCreate = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        courseId,
        title: 'Final Exam',
        examType: 'final',
        startsAt,
        topics: ['Transactions'],
      });
    expect(foreignCreate.status).toBe(404);

    // Owner creates exam
    const created = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        courseId,
        title: 'Midterm Examination',
        examType: 'midterm',
        startsAt,
        durationMinutes: 120,
        venue: 'NNB 3',
        weightPercent: 30,
        topics: ['Normalization', 'Transactions', 'Normalization'],
      });
    expect(created.status).toBe(201);
    expect(created.body.topics).toEqual(['Normalization', 'Transactions']);
    expect(created.body.course.code).toBe('CSCD 312');

    // Course detail & Dashboard reflect upcoming exam
    const detail = await request(app)
      .get(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.upcomingExams).toHaveLength(1);
    expect(detail.body.upcomingExams[0].title).toBe('Midterm Examination');

    const dash = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(dash.status).toBe(200);
    expect(dash.body.upcomingExams).toHaveLength(1);
    expect(dash.body.upcomingExams[0].venue).toBe('NNB 3');

    // Reminder sweep fires once & deduplicates
    expect(await examsService.processDueExamReminders(new Date())).toBe(1);
    expect(db.notifications.size).toBe(1);
    expect(emailMock.sendExamReminderEmail).toHaveBeenCalledTimes(1);
    expect(await examsService.processDueExamReminders(new Date())).toBe(0);
    expect(emailMock.sendExamReminderEmail).toHaveBeenCalledTimes(1);

    // Update venue & delete
    const updated = await request(app)
      .patch(`/api/v1/exams/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ venue: 'Great Hall' });
    expect(updated.status).toBe(200);
    expect(updated.body.venue).toBe('Great Hall');

    const del = await request(app)
      .delete(`/api/v1/exams/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);
  });

  it('generates AI revision plan from weak topics & notes, saves into Planner, syncs completion, and reschedules missed sessions', async () => {
    // Seed exam 5 days ahead
    const examDate = new Date(Date.now() + 5 * 24 * 3600_000);
    const examRes = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        courseId,
        title: 'Final Database Exam',
        examType: 'final',
        startsAt: examDate.toISOString(),
        weightPercent: 60,
        topics: ['B+ Trees', 'ACID Transactions'],
      });
    const examId = examRes.body.id as string;

    // Seed real course notes, document, and weak topics
    db.notes.push({
      id: randomUUID(),
      userId,
      courseId,
      title: 'Concurrency Control',
      aiSummary: '2PL locking and serializability schedules.',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    db.documents.push({
      id: randomUUID(),
      userId,
      courseId,
      title: '2024 Past Paper',
      type: 'past_question',
      originalName: 'past.pdf',
      status: 'ready',
      pageCount: 6,
      createdAt: new Date(),
    });
    db.docAttempts.push({
      userId,
      courseId,
      weakTopicsJson: ['Serializability Conflicts'],
      takenAt: new Date(),
    });
    db.quizAttempts.push({
      userId,
      courseId,
      score: 2,
      total: 5,
      topic: 'Deadlock Detection',
      title: 'Locking Quiz',
      takenAt: new Date(),
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const dayTwoStr = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    // Pick a day-off weekday matching tomorrow to confirm snapping skips daysOff cleanly!
    const dayTwoWeekday = new Date(`${dayTwoStr}T00:00:00.000Z`).getUTCDay();

    llmMock.generateText.mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'CSCD 312 Intensive Plan',
        sessions: [
          {
            scheduledDate: todayStr,
            startTime: '18:30',
            durationMinutes: 60,
            courseId,
            examId,
            topic: 'Serializability Conflicts',
            notes: 'Review 2PL conflicts',
          },
          {
            scheduledDate: dayTwoStr, // Day off -> server snaps to valid study date!
            startTime: '19:30',
            durationMinutes: 60,
            courseId,
            examId,
            topic: 'Deadlock Detection',
            notes: 'Solve wait-for graph exercises',
          },
        ],
      }),
      usage: { inputTokens: 450, outputTokens: 210 },
    });

    // Generate draft (not saved yet!)
    const gen = await request(app)
      .post('/api/v1/revision-plans/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        examIds: [examId],
        hoursPerDay: 2,
        daysOff: [dayTwoWeekday],
        preferredTimes: ['evening'],
      });
    expect(gen.status).toBe(200);
    expect(gen.body.contextSummary.weakTopics).toEqual(
      expect.arrayContaining(['Serializability Conflicts', 'Deadlock Detection']),
    );
    expect(gen.body.draft.sessions).toHaveLength(2);
    // Ensure Prompt actually received the weak topics & notes
    const calledPrompt = String(llmMock.generateText.mock.calls[0]?.[0] ?? '');
    expect(calledPrompt).toContain('Serializability Conflicts');
    expect(calledPrompt).toContain('Deadlock Detection');
    expect(calledPrompt).toContain('Concurrency Control');
    // Snapped off the dayOff!
    expect(
      gen.body.draft.sessions.some(
        (s: { scheduledDate: string }) =>
          new Date(`${s.scheduledDate}T00:00:00.000Z`).getUTCDay() === dayTwoWeekday,
      ),
    ).toBe(false);
    // Usage telemetry logged
    expect(db.usageEvents.some((u) => u.feature === 'revision_plan' && u.tokensIn === 450)).toBe(
      true,
    );
    // Not persisted yet until saved
    expect(db.plans.size).toBe(0);
    expect(db.tasks.size).toBe(0);

    // Save edited plan -> creates RevisionPlan + RevisionSessions + linked Planner Tasks!
    const saveRes = await request(app)
      .post('/api/v1/revision-plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...gen.body.draft,
        sessions: [
          {
            ...gen.body.draft.sessions[0],
            topic: 'Serializability & Recovery',
          },
          gen.body.draft.sessions[1],
        ],
      });
    expect(saveRes.status).toBe(201);
    const planId = saveRes.body.id as string;
    expect(saveRes.body.sessions).toHaveLength(2);
    expect(db.tasks.size).toBe(2);

    const firstSession = saveRes.body.sessions[0];
    const secondSession = saveRes.body.sessions[1];
    expect(db.tasks.get(firstSession.taskId)?.title).toContain(
      '[CSCD 312] Revise: Serializability & Recovery',
    );

    // Completing task in Planner reflects on revision session!
    await request(app)
      .patch(`/api/v1/tasks/${firstSession.taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'done' });
    const plansAfterTaskDone = await request(app)
      .get('/api/v1/revision-plans')
      .set('Authorization', `Bearer ${token}`);
    expect(plansAfterTaskDone.body[0].sessions[0].status).toBe('completed');

    // Mark second session as missed, then reschedule missed
    const missedRes = await request(app)
      .patch(`/api/v1/revision-plans/${planId}/sessions/${secondSession.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'missed' });
    expect(missedRes.status).toBe(200);
    expect(missedRes.body.sessions[1].status).toBe('missed');

    const resched = await request(app)
      .post(`/api/v1/revision-plans/${planId}/reschedule-missed`)
      .set('Authorization', `Bearer ${token}`);
    expect(resched.status).toBe(200);
    expect(resched.body.rescheduledCount).toBe(1);
    expect(resched.body.plan.sessions[1].status).toBe('planned');

    // Verify local timezone -> UTC conversion helper cleanly
    const accraUtc = localDateTimeToUtc('2026-11-20', '18:30', 'Africa/Accra');
    expect(accraUtc.toISOString()).toBe('2026-11-20T18:30:00.000Z');
    const nyUtc = localDateTimeToUtc('2026-11-20', '18:30', 'America/New_York');
    expect(nyUtc.toISOString()).toBe('2026-11-20T23:30:00.000Z');

    // Delete plan cleans up generated Planner tasks too
    const delPlan = await request(app)
      .delete(`/api/v1/revision-plans/${planId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delPlan.status).toBe(204);
    expect(db.plans.size).toBe(0);
    expect(db.tasks.size).toBe(0);
  });
});
