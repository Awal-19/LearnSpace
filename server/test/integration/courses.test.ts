import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { EmailService } from '../../src/lib/email';
import type { LLMProvider } from '../../src/lib/llm/provider';
import { createLogger } from '../../src/lib/logger';
import type { StorageService } from '../../src/lib/storage';
import { signAccessToken } from '../../src/lib/tokens';
import { createAiService } from '../../src/modules/ai/ai.service';
import { createCoursesService } from '../../src/modules/courses/courses.service';
import { createFocusService } from '../../src/modules/focus/focus.service';
import { createNotesService } from '../../src/modules/notes/notes.service';
import { createPlannerService } from '../../src/modules/planner/planner.service';
import { createStudyService } from '../../src/modules/study/study.service';
import { testEnv } from '../helpers';

interface CourseRow {
  id: string;
  userId: string;
  name: string;
  code: string | null;
  lecturer: string | null;
  creditHours: number | null;
  semester: string | null;
  level: string | null;
  color: string | null;
  courseNotes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface GenericLinkedRow {
  id: string;
  userId: string;
  courseId: string | null;
  createdAt: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

function makeFakeCoursesPrisma() {
  const courses = new Map<string, CourseRow>();
  const notes = new Map<string, GenericLinkedRow>();
  const documents = new Map<
    string,
    GenericLinkedRow & { storageKey: string; kind: 'image' | 'document' }
  >();
  const tasks = new Map<string, GenericLinkedRow>();
  const decks = new Map<string, GenericLinkedRow>();
  const quizzes = new Map<string, GenericLinkedRow>();
  const conversations = new Map<string, GenericLinkedRow>();
  const studySessions = new Map<
    string,
    GenericLinkedRow & { startedAt: Date; durationSeconds: number }
  >();

  const matchesCourseFilter = (row: GenericLinkedRow, courseId?: unknown) => {
    if (courseId === undefined) return true;
    return row.courseId === courseId;
  };

  const countByCourse = (map: Map<string, GenericLinkedRow>, courseId: string) =>
    Array.from(map.values()).filter((r) => r.courseId === courseId).length;

  const prismaObj = {
    course: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; archivedAt?: null | { not: null }; semester?: string };
      }) =>
        Array.from(courses.values())
          .filter((c) => c.userId === where.userId)
          .filter((c) => {
            if (where.archivedAt === null) return c.archivedAt === null;
            if (where.archivedAt && 'not' in where.archivedAt) return c.archivedAt !== null;
            return true;
          })
          .filter((c) => (!where.semester ? true : c.semester === where.semester))
          .map((c) => ({
            ...c,
            _count: {
              notes: countByCourse(notes, c.id),
              documents: countByCourse(documents, c.id),
              tasks: countByCourse(tasks, c.id),
              decks: countByCourse(decks, c.id),
              quizzes: countByCourse(quizzes, c.id),
            },
          })),
      findFirst: async ({
        where,
      }: {
        where: { id?: string | { not: string }; userId: string; name?: { equals: string } };
      }) => {
        for (const c of courses.values()) {
          if (c.userId !== where.userId) continue;
          if (typeof where.id === 'string' && c.id !== where.id) continue;
          if (typeof where.id === 'object' && c.id === where.id.not) continue;
          if (where.name && c.name.toLowerCase() !== where.name.equals.toLowerCase()) continue;
          return c;
        }
        return null;
      },
      count: async ({ where }: { where: { userId: string } }) => {
        let total = 0;
        for (const c of courses.values()) {
          if (c.userId === where.userId) total += 1;
        }
        return total;
      },
      create: async ({ data }: { data: Partial<CourseRow> & { userId: string; name: string } }) => {
        const now = new Date();
        const row: CourseRow = {
          id: randomUUID(),
          userId: data.userId,
          name: data.name,
          code: data.code ?? null,
          lecturer: data.lecturer ?? null,
          creditHours: data.creditHours ?? null,
          semester: data.semester ?? null,
          level: data.level ?? null,
          color: data.color ?? '#2563EB',
          courseNotes: data.courseNotes ?? null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        courses.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<CourseRow> }) => {
        const c = courses.get(where.id)!;
        Object.assign(c, data, { updatedAt: new Date() });
        return {
          ...c,
          _count: {
            notes: countByCourse(notes, c.id),
            documents: countByCourse(documents, c.id),
            tasks: countByCourse(tasks, c.id),
            decks: countByCourse(decks, c.id),
            quizzes: countByCourse(quizzes, c.id),
          },
        };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const c = courses.get(where.id)!;
        courses.delete(where.id);
        for (const m of [notes, documents, tasks, decks, quizzes, conversations, studySessions]) {
          for (const item of m.values()) {
            if (item.courseId === where.id) item.courseId = null;
          }
        }
        return c;
      },
    },
    note: {
      findMany: async ({ where }: { where: { userId: string; courseId?: unknown } }) =>
        Array.from(notes.values()).filter(
          (r) => r.userId === where.userId && matchesCourseFilter(r, where.courseId),
        ),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const r = notes.get(where.id);
        return r && r.userId === where.userId ? r : null;
      },
      create: async ({
        data,
      }: {
        data: { userId: string; title: string; body: string; courseId?: string | null };
      }) => {
        const now = new Date();
        const row: GenericLinkedRow = {
          id: randomUUID(),
          userId: data.userId,
          courseId: data.courseId ?? null,
          title: data.title,
          body: data.body,
          aiSummary: null,
          createdAt: now,
          updatedAt: now,
        };
        notes.set(row.id, row);
        return row;
      },
      deleteMany: async ({ where }: { where: { userId: string; courseId: string } }) => {
        let count = 0;
        for (const [k, v] of notes.entries()) {
          if (v.userId === where.userId && v.courseId === where.courseId) {
            notes.delete(k);
            count += 1;
          }
        }
        return { count };
      },
    },
    document: {
      findMany: async ({ where }: { where: { userId: string; courseId?: unknown } }) =>
        Array.from(documents.values()).filter(
          (r) => r.userId === where.userId && matchesCourseFilter(r, where.courseId),
        ),
      deleteMany: async ({ where }: { where: { userId: string; courseId: string } }) => {
        let count = 0;
        for (const [k, v] of documents.entries()) {
          if (v.userId === where.userId && v.courseId === where.courseId) {
            documents.delete(k);
            count += 1;
          }
        }
        return { count };
      },
    },
    task: {
      findMany: async ({ where }: { where: { userId: string; courseId?: unknown } }) =>
        Array.from(tasks.values()).filter(
          (r) => r.userId === where.userId && matchesCourseFilter(r, where.courseId),
        ),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const r = tasks.get(where.id);
        return r && r.userId === where.userId ? r : null;
      },
      create: async ({
        data,
      }: {
        data: {
          userId: string;
          courseId?: string | null;
          title: string;
          description?: string | null;
          dueAt?: Date | null;
          priority?: string;
          reminderOffsetMinutes?: number | null;
          remindAt?: Date | null;
        };
      }) => {
        const now = new Date();
        const row: GenericLinkedRow = {
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
          createdAt: now,
          updatedAt: now,
        };
        tasks.set(row.id, row);
        return row;
      },
      deleteMany: async ({ where }: { where: { userId: string; courseId: string } }) => {
        let count = 0;
        for (const [k, v] of tasks.entries()) {
          if (v.userId === where.userId && v.courseId === where.courseId) {
            tasks.delete(k);
            count += 1;
          }
        }
        return { count };
      },
    },
    deck: {
      findMany: async ({ where }: { where: { userId: string; courseId?: unknown } }) =>
        Array.from(decks.values())
          .filter((r) => r.userId === where.userId && matchesCourseFilter(r, where.courseId))
          .map((d) => ({ ...d, _count: { cards: 0 } })),
      create: async ({
        data,
      }: {
        data: { userId: string; title: string; topic?: string | null; courseId?: string | null };
      }) => {
        const now = new Date();
        const row: GenericLinkedRow = {
          id: randomUUID(),
          userId: data.userId,
          courseId: data.courseId ?? null,
          noteId: null,
          title: data.title,
          topic: data.topic ?? null,
          createdAt: now,
          updatedAt: now,
          cards: [],
        };
        decks.set(row.id, row);
        return row;
      },
      deleteMany: async ({ where }: { where: { userId: string; courseId: string } }) => {
        let count = 0;
        for (const [k, v] of decks.entries()) {
          if (v.userId === where.userId && v.courseId === where.courseId) {
            decks.delete(k);
            count += 1;
          }
        }
        return { count };
      },
    },
    quiz: {
      findMany: async ({ where }: { where: { userId: string; courseId?: unknown } }) =>
        Array.from(quizzes.values())
          .filter((r) => r.userId === where.userId && matchesCourseFilter(r, where.courseId))
          .map((q) => ({ ...q, _count: { questions: 0 }, attempts: [] })),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const q = quizzes.get(where.id);
        return q && q.userId === where.userId ? q : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<GenericLinkedRow>;
      }) => {
        const q = quizzes.get(where.id)!;
        Object.assign(q, data);
        return { ...q, _count: { questions: 0 }, attempts: [] };
      },
      deleteMany: async ({ where }: { where: { userId: string; courseId: string } }) => {
        let count = 0;
        for (const [k, v] of quizzes.entries()) {
          if (v.userId === where.userId && v.courseId === where.courseId) {
            quizzes.delete(k);
            count += 1;
          }
        }
        return { count };
      },
    },
    conversation: {
      findMany: async ({ where }: { where: { userId: string; courseId?: unknown } }) =>
        Array.from(conversations.values()).filter(
          (r) => r.userId === where.userId && matchesCourseFilter(r, where.courseId),
        ),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const c = conversations.get(where.id);
        return c && c.userId === where.userId ? c : null;
      },
      create: async ({
        data,
      }: {
        data: { userId: string; title: string; courseId?: string | null };
      }) => {
        const now = new Date();
        const row: GenericLinkedRow = {
          id: randomUUID(),
          userId: data.userId,
          courseId: data.courseId ?? null,
          title: data.title,
          createdAt: now,
          updatedAt: now,
        };
        conversations.set(row.id, row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<GenericLinkedRow>;
      }) => {
        const c = conversations.get(where.id)!;
        Object.assign(c, data, { updatedAt: new Date() });
        return c;
      },
      deleteMany: async ({ where }: { where: { userId: string; courseId: string } }) => {
        let count = 0;
        for (const [k, v] of conversations.entries()) {
          if (v.userId === where.userId && v.courseId === where.courseId) {
            conversations.delete(k);
            count += 1;
          }
        }
        return { count };
      },
    },
    studySession: {
      groupBy: async ({ where }: { where: { userId: string } }) => {
        const totals = new Map<string, number>();
        for (const s of studySessions.values()) {
          if (s.userId === where.userId && s.courseId) {
            totals.set(s.courseId, (totals.get(s.courseId) ?? 0) + s.durationSeconds);
          }
        }
        return Array.from(totals.entries()).map(([courseId, durationSeconds]) => ({
          courseId,
          _sum: { durationSeconds },
        }));
      },
      aggregate: async ({ where }: { where: { userId: string; courseId?: string } }) => {
        let total = 0;
        for (const s of studySessions.values()) {
          if (s.userId === where.userId && (!where.courseId || s.courseId === where.courseId)) {
            total += s.durationSeconds;
          }
        }
        return { _sum: { durationSeconds: total } };
      },
      upsert: async ({
        create,
      }: {
        create: {
          userId: string;
          taskId: string | null;
          courseId: string | null;
          kind: 'focus';
          startedAt: Date;
          durationSeconds: number;
          source: 'pomodoro' | 'manual';
        };
      }) => {
        const existing = Array.from(studySessions.values()).find(
          (s) => s.userId === create.userId && s.startedAt.getTime() === create.startedAt.getTime(),
        );
        if (existing) return existing;
        const row = { id: randomUUID(), ...create, createdAt: new Date() };
        studySessions.set(row.id, row);
        return row;
      },
      findMany: async ({ where }: { where: { userId: string; courseId?: unknown } }) =>
        Array.from(studySessions.values()).filter(
          (r) => r.userId === where.userId && matchesCourseFilter(r, where.courseId),
        ),
      deleteMany: async ({ where }: { where: { userId: string; courseId: string } }) => {
        let count = 0;
        for (const [k, v] of studySessions.entries()) {
          if (v.userId === where.userId && v.courseId === where.courseId) {
            studySessions.delete(k);
            count += 1;
          }
        }
        return { count };
      },
    },
    studyDocument: {
      deleteMany: async () => ({ count: 0 }),
    },
    messageAttachment: {
      findMany: async () => [],
    },
    userSettings: {
      findUnique: async () => ({ timezone: 'UTC' }),
    },
  };

  (prismaObj as Record<string, unknown>).$transaction = async (
    fn: (tx: typeof prismaObj) => Promise<unknown>,
  ) => fn(prismaObj);

  return {
    prisma: prismaObj as unknown as PrismaClient,
    courses,
    notes,
    documents,
    tasks,
    decks,
    quizzes,
    conversations,
    studySessions,
  };
}

describe('Courses & Cross-Feature Linking integration', () => {
  const env = testEnv();
  const logger = createLogger(env);
  let db: ReturnType<typeof makeFakeCoursesPrisma>;
  let storageDeleteMock: ReturnType<typeof vi.fn>;
  let app: ReturnType<typeof createApp>;
  let userAToken: string;
  let userBToken: string;
  let userAId: string;

  beforeEach(() => {
    db = makeFakeCoursesPrisma();
    storageDeleteMock = vi.fn(async () => undefined);
    const storage: StorageService = {
      isConfigured: () => false,
      uploadAvatar: vi.fn(),
      deleteAvatar: vi.fn(),
      uploadAttachment: vi.fn(),
      getSignedAttachmentUrl: vi.fn(),
      readAttachmentBytes: vi.fn(),
      deleteAttachment: storageDeleteMock,
    };
    const llm: LLMProvider = {
      modelName: 'gemini-test',
      isConfigured: () => false,
      stream: async function* () {},
      generateText: async () => ({ text: '' }),
    };
    const email: EmailService = {
      sendVerificationEmail: vi.fn(),
      sendOtpEmail: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
      sendTaskReminderEmail: vi.fn(),
      sendClassReminderEmail: vi.fn(),
      sendExamReminderEmail: vi.fn(),
    };

    app = createApp(
      env,
      {
        checkDb: async () => undefined,
        courses: createCoursesService({ prisma: db.prisma, storage, logger }),
        notes: {
          service: createNotesService({ prisma: db.prisma, llm, logger }),
          isEmailVerified: async () => true,
        },
        planner: createPlannerService({
          prisma: db.prisma,
          email,
          logger,
          clientUrl: env.CLIENT_URL,
        }),
        focus: createFocusService(db.prisma),
        study: {
          service: createStudyService({ prisma: db.prisma, llm, logger }),
          isEmailVerified: async () => true,
        },
        ai: {
          service: createAiService({ prisma: db.prisma, llm, logger }),
          isEmailVerified: async () => true,
        },
      },
      logger,
    );

    userAId = randomUUID();
    userAToken = signAccessToken(userAId, env.JWT_SECRET).token;
    userBToken = signAccessToken(randomUUID(), env.JWT_SECRET).token;
  });

  it('creates, updates, archives, filters, and inspects course detail with linked items and ownership checks', async () => {
    const createRes = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({
        name: 'Data Structures & Algorithms',
        code: 'CSCD 204',
        lecturer: 'Dr. Mensah',
        creditHours: 3,
        semester: '2026 Semester 1',
        level: 'Level 200',
        color: '#2563EB',
        notes: 'Weekly lab on Thursdays.',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.code).toBe('CSCD 204');
    expect(createRes.body.creditHours).toBe(3);

    const courseId = createRes.body.id as string;

    // Cross-user access returns 404
    const foreignDetail = await request(app)
      .get(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${userBToken}`);
    expect(foreignDetail.status).toBe(404);

    // Link note, task, deck, conversation, and focus session
    const noteRes = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ title: 'Heaps', body: 'Binary heap notes', courseId });
    expect(noteRes.status).toBe(201);

    const taskRes = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ title: 'Solve heap problems', courseId });
    expect(taskRes.status).toBe(201);

    const deckRes = await request(app)
      .post('/api/v1/decks')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ title: 'Heap Flashcards', courseId });
    expect(deckRes.status).toBe(201);
    expect(deckRes.body.courseId).toBe(courseId);

    const convRes = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ title: 'Heap tutor session', courseId });
    expect(convRes.status).toBe(201);
    expect(convRes.body.courseId).toBe(courseId);

    // Focus session linked to task automatically inherits task.courseId
    const startedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    const focusRes = await request(app)
      .post('/api/v1/study-sessions')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ startedAt, durationSeconds: 1800, source: 'pomodoro', taskId: taskRes.body.id });
    expect(focusRes.status).toBe(201);
    expect(focusRes.body.courseId).toBe(courseId);

    // Detail endpoint aggregates all linked items + focus seconds
    const detail = await request(app)
      .get(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.notes).toHaveLength(1);
    expect(detail.body.tasks).toHaveLength(1);
    expect(detail.body.decks).toHaveLength(1);
    expect(detail.body.stats.studySeconds).toBe(1800);

    // Archiving hides from default active list and exposes in archived/all
    const archiveRes = await request(app)
      .patch(`/api/v1/courses/${courseId}`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ archived: true });
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.archivedAt).toBeTruthy();

    const activeList = await request(app)
      .get('/api/v1/courses')
      .set('Authorization', `Bearer ${userAToken}`);
    expect(activeList.body).toHaveLength(0);

    const archivedList = await request(app)
      .get('/api/v1/courses?archived=archived')
      .set('Authorization', `Bearer ${userAToken}`);
    expect(archivedList.body).toHaveLength(1);
  });

  it('supports delete modes: keeps items unassigned (default) or deletes linked items & cleans blobs', async () => {
    const cKeep = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: 'Keep Items Course' });
    const cKeepId = cKeep.body.id as string;

    const keptNote = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ title: 'Kept', body: 'Still here', courseId: cKeepId });
    await request(app)
      .post('/api/v1/decks')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ title: 'Kept Deck', courseId: cKeepId });

    const delUnassign = await request(app)
      .delete(`/api/v1/courses/${cKeepId}?mode=unassign`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(delUnassign.status).toBe(204);
    expect(db.notes.get(keptNote.body.id)?.courseId).toBeNull();
    expect(Array.from(db.decks.values())[0]?.courseId).toBeNull();

    // Now test mode=delete removes linked items and triggers document blob deletion
    const cPurge = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: 'Purge Course' });
    const cPurgeId = cPurge.body.id as string;

    const purgedNote = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ title: 'Purged', body: 'Gone', courseId: cPurgeId });

    const docId = randomUUID();
    db.documents.set(docId, {
      id: docId,
      userId: userAId,
      courseId: cPurgeId,
      storageKey: 'docs/test-blob.pdf',
      kind: 'document',
      createdAt: new Date(),
    });

    const delPurge = await request(app)
      .delete(`/api/v1/courses/${cPurgeId}?mode=delete`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(delPurge.status).toBe(204);
    expect(db.notes.has(purgedNote.body.id)).toBe(false);
    expect(db.documents.has(docId)).toBe(false);
    expect(storageDeleteMock).toHaveBeenCalledWith('docs/test-blob.pdf', 'document');
  });

  it('enforces 1-60 char course names, case-insensitive uniqueness, and 50-course per-user limit', async () => {
    const emptyRes = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: '   ' });
    expect(emptyRes.status).toBe(400);

    const tooLongRes = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: 'A'.repeat(61) });
    expect(tooLongRes.status).toBe(400);

    const okRes = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: '  Linear Algebra  ' });
    expect(okRes.status).toBe(201);
    expect(okRes.body.name).toBe('Linear Algebra');

    const dupRes = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: 'linear algebra' });
    expect(dupRes.status).toBe(409);

    for (let i = 1; i < 50; i += 1) {
      await db.prisma.course.create({ data: { userId: userAId, name: `Course ${i}` } });
    }
    const capRes = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: 'Course 51' });
    expect(capRes.status).toBe(400);
  });
});
