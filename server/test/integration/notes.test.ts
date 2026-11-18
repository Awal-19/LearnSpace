import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { LLMProvider } from '../../src/lib/llm/provider';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
import { createCoursesService } from '../../src/modules/courses/courses.service';
import { createNotesService } from '../../src/modules/notes/notes.service';
import { testEnv } from '../helpers';

interface CourseRow {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  createdAt: Date;
}

interface NoteRow {
  id: string;
  userId: string;
  courseId: string | null;
  title: string;
  body: string;
  aiSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function makeFakePrisma() {
  const courses = new Map<string, CourseRow>();
  const notes = new Map<string, NoteRow>();

  const prisma = {
    $queryRaw: async () => {
      throw new Error('Raw SQL unavailable in unit fake');
    },
    course: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        Array.from(courses.values())
          .filter((c) => c.userId === where.userId)
          .map((c) => ({
            ...c,
            _count: {
              notes: Array.from(notes.values()).filter((n) => n.courseId === c.id).length,
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
      create: async ({
        data,
      }: {
        data: { userId: string; name: string; color: string | null };
      }) => {
        const row: CourseRow = {
          id: randomUUID(),
          userId: data.userId,
          name: data.name,
          color: data.color,
          createdAt: new Date(),
        };
        courses.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<CourseRow> }) => {
        const c = courses.get(where.id)!;
        Object.assign(c, data);
        return {
          ...c,
          _count: {
            notes: Array.from(notes.values()).filter((n) => n.courseId === c.id).length,
          },
        };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const c = courses.get(where.id)!;
        courses.delete(where.id);
        for (const n of notes.values()) {
          if (n.courseId === where.id) n.courseId = null;
        }
        return c;
      },
    },
    note: {
      findMany: async ({
        where,
        take,
      }: {
        where: { userId: string; courseId?: string | null; OR?: unknown[] };
        take: number;
      }) =>
        Array.from(notes.values())
          .filter((n) => n.userId === where.userId)
          .filter((n) => (where.courseId === undefined ? true : n.courseId === where.courseId))
          .slice(0, take),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const n = notes.get(where.id);
        return n && n.userId === where.userId ? n : null;
      },
      create: async ({
        data,
      }: {
        data: { userId: string; title: string; body: string; courseId: string | null };
      }) => {
        const row: NoteRow = {
          id: randomUUID(),
          userId: data.userId,
          title: data.title,
          body: data.body,
          courseId: data.courseId,
          aiSummary: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        notes.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<NoteRow> }) => {
        const n = notes.get(where.id)!;
        Object.assign(n, data, { updatedAt: new Date() });
        return n;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const n = notes.get(where.id)!;
        notes.delete(where.id);
        return n;
      },
    },
  };

  return { prisma: prisma as unknown as PrismaClient, courses, notes };
}

describe('courses and notes integration', () => {
  const env = testEnv();
  const logger = createLogger(env);
  let db: ReturnType<typeof makeFakePrisma>;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let token: string;

  beforeEach(() => {
    db = makeFakePrisma();
    const llm: LLMProvider = {
      modelName: 'gemini-test',
      isConfigured: () => true,
      stream: async function* () {},
      generateText: async () => ({ text: '- Key point 1\n- Key point 2' }),
    };
    const courses = createCoursesService({ prisma: db.prisma, logger });
    const notes = createNotesService({ prisma: db.prisma, llm, logger });
    app = createApp(
      env,
      {
        checkDb: async () => undefined,
        courses,
        notes: { service: notes, isEmailVerified: async () => true },
      },
      logger,
    );
    userId = randomUUID();
    token = signAccessToken(userId, env.JWT_SECRET).token;
  });

  it('T-NOTE-01 & T-NOTE-04: creates course, prevents duplicate name, deletes course keeping notes', async () => {
    const c1 = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'CS 301', color: '#6366F1' });
    expect(c1.status).toBe(201);

    const dup = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'cs 301' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');

    const note = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Trees', body: 'AVL trees stay balanced.', courseId: c1.body.id });
    expect(note.status).toBe(201);

    const del = await request(app)
      .delete(`/api/v1/courses/${c1.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);
    expect(db.notes.get(note.body.id)?.courseId).toBeNull();
  });

  it('T-NOTE-02 & T-NOTE-03: summarize stores aiSummary without changing body and rejects < 50 chars', async () => {
    const shortNote = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Short', body: 'Too short' });
    const tooShortRes = await request(app)
      .post(`/api/v1/notes/${shortNote.body.id}/summarize`)
      .set('Authorization', `Bearer ${token}`);
    expect(tooShortRes.status).toBe(400);

    const longBody =
      'Dynamic programming breaks overlapping subproblems into memoized steps for optimal substructure.';
    const longNote = await request(app)
      .post('/api/v1/notes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'DP', body: longBody });

    const sumRes = await request(app)
      .post(`/api/v1/notes/${longNote.body.id}/summarize`)
      .set('Authorization', `Bearer ${token}`);
    expect(sumRes.status).toBe(200);
    expect(sumRes.body.summary).toContain('Key point 1');
    expect(db.notes.get(longNote.body.id)?.body).toBe(longBody);
    expect(db.notes.get(longNote.body.id)?.aiSummary).toContain('Key point 1');
  });
});
