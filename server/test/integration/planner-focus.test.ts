import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { EmailService } from '../../src/lib/email';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
import { createFocusService } from '../../src/modules/focus/focus.service';
import { createPlannerService } from '../../src/modules/planner/planner.service';
import { testEnv } from '../helpers';

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

interface NotificationRow {
  id: string;
  userId: string;
  type: 'task_reminder' | 'system';
  title: string;
  body: string;
  taskId: string | null;
  dueAtSnapshot: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

interface StudySessionRow {
  id: string;
  userId: string;
  taskId: string | null;
  kind: 'focus';
  startedAt: Date;
  durationSeconds: number;
  source: 'pomodoro' | 'manual';
  createdAt: Date;
}

function makeFakePrisma() {
  const tasks = new Map<string, TaskRow>();
  const notifications = new Map<string, NotificationRow>();
  const studySessions: StudySessionRow[] = [];

  const prisma = {
    userSettings: {
      findUnique: async () => ({ timezone: 'UTC' }),
    },
    task: {
      findMany: async ({
        where,
      }: {
        where: {
          userId?: string;
          status?: 'todo' | 'done';
          remindAt?: { lte: Date };
          reminderSentAt?: null;
        };
      }) =>
        Array.from(tasks.values())
          .filter((t) => !where.userId || t.userId === where.userId)
          .filter((t) => !where.status || t.status === where.status)
          .filter((t) => !where.remindAt?.lte || (t.remindAt && t.remindAt <= where.remindAt.lte))
          .filter((t) => (where.reminderSentAt === null ? t.reminderSentAt === null : true))
          .map((t) => ({
            ...t,
            user: {
              email: 'ama@uni.edu',
              name: 'Ama',
              emailVerified: true,
              settings: { notifyInApp: true, notifyEmailReminders: false },
            },
          })),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const t = tasks.get(where.id);
        return t && t.userId === where.userId ? t : null;
      },
      create: async ({ data }: { data: Partial<TaskRow> & { userId: string; title: string } }) => {
        const row: TaskRow = {
          id: randomUUID(),
          userId: data.userId,
          courseId: data.courseId ?? null,
          title: data.title,
          description: data.description ?? null,
          dueAt: data.dueAt ?? null,
          priority: data.priority ?? 'medium',
          status: 'todo',
          completedAt: null,
          reminderOffsetMinutes: data.reminderOffsetMinutes ?? null,
          remindAt: data.remindAt ?? null,
          reminderSentAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        tasks.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<TaskRow> }) => {
        const t = tasks.get(where.id)!;
        Object.assign(t, data, { updatedAt: new Date() });
        return t;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const t = tasks.get(where.id)!;
        tasks.delete(where.id);
        return t;
      },
    },
    notification: {
      findMany: async ({ where }: { where: { userId: string; readAt?: null } }) =>
        Array.from(notifications.values()).filter(
          (n) => n.userId === where.userId && (where.readAt === null ? n.readAt === null : true),
        ),
      count: async ({ where }: { where: { userId: string; readAt: null } }) =>
        Array.from(notifications.values()).filter(
          (n) => n.userId === where.userId && n.readAt === null,
        ).length,
      upsert: async ({
        where,
        create,
      }: {
        where: { taskId_type_dueAtSnapshot: { taskId: string; type: string; dueAtSnapshot: Date } };
        create: Partial<NotificationRow> & { userId: string; title: string; body: string };
      }) => {
        const key = `${where.taskId_type_dueAtSnapshot.taskId}:${where.taskId_type_dueAtSnapshot.dueAtSnapshot.toISOString()}`;
        if (notifications.has(key)) return notifications.get(key)!;
        const row: NotificationRow = {
          id: randomUUID(),
          userId: create.userId,
          type: 'task_reminder',
          title: create.title,
          body: create.body,
          taskId: create.taskId ?? null,
          dueAtSnapshot: create.dueAtSnapshot ?? null,
          readAt: null,
          createdAt: new Date(),
        };
        notifications.set(key, row);
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; id?: string; readAt: null };
        data: { readAt: Date };
      }) => {
        let count = 0;
        for (const n of notifications.values()) {
          if (n.userId === where.userId && (!where.id || n.id === where.id) && n.readAt === null) {
            n.readAt = data.readAt;
            count += 1;
          }
        }
        return { count };
      },
      findFirst: async () => null,
    },
    studySession: {
      upsert: async ({
        where,
        create,
      }: {
        where: { userId_startedAt: { userId: string; startedAt: Date } };
        create: Partial<StudySessionRow> & {
          userId: string;
          startedAt: Date;
          durationSeconds: number;
        };
      }) => {
        const existing = studySessions.find(
          (s) =>
            s.userId === where.userId_startedAt.userId &&
            s.startedAt.getTime() === where.userId_startedAt.startedAt.getTime(),
        );
        if (existing) return existing;
        const row: StudySessionRow = {
          id: randomUUID(),
          userId: create.userId,
          taskId: create.taskId ?? null,
          kind: 'focus',
          startedAt: create.startedAt,
          durationSeconds: create.durationSeconds,
          source: create.source ?? 'pomodoro',
          createdAt: new Date(),
        };
        studySessions.push(row);
        return row;
      },
      findMany: async ({ where }: { where: { userId: string } }) =>
        studySessions.filter((s) => s.userId === where.userId),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        studySessions.find((s) => s.id === where.id && s.userId === where.userId) ?? null,
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = studySessions.findIndex((s) => s.id === where.id);
        return studySessions.splice(idx, 1)[0];
      },
    },
  };

  return { prisma: prisma as unknown as PrismaClient, tasks, notifications, studySessions };
}

describe('planner & focus integration', () => {
  const env = testEnv();
  const logger = createLogger(env);
  let db: ReturnType<typeof makeFakePrisma>;
  let planner: ReturnType<typeof createPlannerService>;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let token: string;

  beforeEach(() => {
    db = makeFakePrisma();
    const email: EmailService = {
      sendVerificationEmail: vi.fn(async () => undefined),
      sendOtpEmail: vi.fn(async () => undefined),
      sendPasswordResetEmail: vi.fn(async () => undefined),
      sendTaskReminderEmail: vi.fn(async () => undefined),
      sendClassReminderEmail: vi.fn(async () => undefined),
      sendExamReminderEmail: vi.fn(async () => undefined),
    };
    planner = createPlannerService({ prisma: db.prisma, email, logger, clientUrl: env.CLIENT_URL });
    const focus = createFocusService(db.prisma);
    app = createApp(env, { checkDb: async () => undefined, planner, focus }, logger);

    userId = randomUUID();
    token = signAccessToken(userId, env.JWT_SECRET).token;
  });

  it('T-PLAN-01 & T-PLAN-02: creates task with reminder, fires notification once, and sets completedAt on done', async () => {
    const dueAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const created = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Submit lab report', dueAt, reminderOffsetMinutes: 60 });

    expect(created.status).toBe(201);
    const taskId = created.body.id as string;

    const processed = await planner.processDueReminders();
    expect(processed).toBe(1);
    const processedAgain = await planner.processDueReminders();
    expect(processedAgain).toBe(0);

    const notifs = await request(app)
      .get('/api/v1/notifications?unread=true')
      .set('Authorization', `Bearer ${token}`);
    expect(notifs.status).toBe(200);
    expect(notifs.body.unreadCount).toBe(1);

    const done = await request(app)
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.completedAt).toBeTruthy();
  });

  it('T-FOCUS-01 & T-FOCUS-02: logs study session idempotently and rejects future/invalid durations', async () => {
    const startedAt = new Date(Date.now() - 25 * 60_000).toISOString();
    const r1 = await request(app)
      .post('/api/v1/study-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ startedAt, durationSeconds: 1500, source: 'pomodoro' });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/v1/study-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ startedAt, durationSeconds: 1500, source: 'pomodoro' });
    expect(r2.status).toBe(201);
    expect(db.studySessions).toHaveLength(1);

    const tooShort = await request(app)
      .post('/api/v1/study-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ startedAt, durationSeconds: 30, source: 'pomodoro' });
    expect(tooShort.status).toBe(400);
  });
});
