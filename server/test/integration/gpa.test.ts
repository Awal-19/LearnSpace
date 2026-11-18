import { randomUUID } from 'node:crypto';
import type { PrismaClient, RetakePolicy } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
import { createGpaService } from '../../src/modules/gpa/gpa.service';
import { testEnv } from '../helpers';

interface ScaleRow {
  id: string;
  userId: string;
  name: string;
  maxGpa: number;
  retakePolicy: RetakePolicy;
  boundariesJson: unknown;
  degreeClassesJson: unknown;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface GradeRow {
  id: string;
  userId: string;
  courseId: string | null;
  scaleId: string | null;
  semester: string;
  semesterOrder: number;
  courseCode: string;
  courseTitle: string;
  creditHours: number;
  score: number | null;
  gradeLabel: string;
  gradePoint: number;
  excludeFromGpa: boolean;
  isRetake: boolean;
  retakeGroupKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function makeFakeGpaPrisma() {
  const scales = new Map<string, ScaleRow>();
  const records = new Map<string, GradeRow>();
  const courses = new Map<string, { id: string; userId: string }>();

  const prisma = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    course: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const c = courses.get(where.id);
        return c && c.userId === where.userId ? c : null;
      },
    },
    gradingScale: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        Array.from(scales.values())
          .filter((s) => s.userId === where.userId)
          .sort(
            (a, b) =>
              Number(b.isDefault) - Number(a.isDefault) ||
              a.createdAt.getTime() - b.createdAt.getTime(),
          ),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const s = scales.get(where.id);
        return s && s.userId === where.userId ? s : null;
      },
      create: async ({ data }: { data: Omit<ScaleRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const now = new Date();
        const row: ScaleRow = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
        scales.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<ScaleRow> }) => {
        const s = scales.get(where.id)!;
        Object.assign(s, data, { updatedAt: new Date() });
        return s;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; isDefault?: boolean; id?: { not: string } };
        data: Partial<ScaleRow>;
      }) => {
        let count = 0;
        for (const s of scales.values()) {
          if (s.userId !== where.userId) continue;
          if (where.isDefault !== undefined && s.isDefault !== where.isDefault) continue;
          if (where.id?.not && s.id === where.id.not) continue;
          Object.assign(s, data);
          count += 1;
        }
        return { count };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const s = scales.get(where.id)!;
        scales.delete(where.id);
        return s;
      },
    },
    gradeRecord: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; scaleId?: string; OR?: Array<{ scaleId: string | null }> };
      }) =>
        Array.from(records.values())
          .filter((r) => {
            if (r.userId !== where.userId) return false;
            if (where.scaleId !== undefined) return r.scaleId === where.scaleId;
            if (where.OR) return where.OR.some((clause) => r.scaleId === clause.scaleId);
            return true;
          })
          .sort(
            (a, b) =>
              a.semesterOrder - b.semesterOrder || a.createdAt.getTime() - b.createdAt.getTime(),
          ),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const r = records.get(where.id);
        return r && r.userId === where.userId ? r : null;
      },
      create: async ({ data }: { data: Omit<GradeRow, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const now = new Date();
        const row: GradeRow = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
        records.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<GradeRow> }) => {
        const r = records.get(where.id)!;
        Object.assign(r, data, { updatedAt: new Date() });
        return r;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const r = records.get(where.id)!;
        records.delete(where.id);
        return r;
      },
    },
  };

  return { prisma: prisma as unknown as PrismaClient, scales, records, courses };
}

describe('GPA & Grades API integration', () => {
  const env = testEnv();
  const logger = createLogger(env);
  let db: ReturnType<typeof makeFakeGpaPrisma>;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let token: string;

  beforeEach(() => {
    db = makeFakeGpaPrisma();
    const gpa = createGpaService({ prisma: db.prisma, logger });
    app = createApp(env, { checkDb: async () => undefined, gpa }, logger);
    userId = randomUUID();
    token = signAccessToken(userId, env.JWT_SECRET).token;
  });

  it('auto-provisions default 4.0 scale, computes semester/CGPA with retakes and 0-credit courses, and supports custom 5.0 scale switching', async () => {
    const initial = await request(app)
      .get('/api/v1/gpa/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(initial.status).toBe(200);
    expect(initial.body.activeScale.maxGpa).toBe(4.0);
    expect(initial.body.overview.cgpa).toBeNull();

    // Add Y1S1 course by score (82 -> A = 4.0)
    const r1 = await request(app)
      .post('/api/v1/gpa/records')
      .set('Authorization', `Bearer ${token}`)
      .send({
        semester: 'Level 100 Sem 1',
        semesterOrder: 1,
        courseCode: 'CSCD 101',
        courseTitle: 'Programming I',
        creditHours: 3,
        score: 82,
      });
    expect(r1.status).toBe(201);
    expect(r1.body.record.gradeLabel).toBe('A');
    expect(r1.body.overview.cgpa).toBe(4.0);

    // Add Y1S1 failed course + zero-credit seminar
    await request(app).post('/api/v1/gpa/records').set('Authorization', `Bearer ${token}`).send({
      semester: 'Level 100 Sem 1',
      semesterOrder: 1,
      courseCode: 'MATH 121',
      courseTitle: 'Algebra',
      creditHours: 3,
      gradeLabel: 'F',
    });
    await request(app).post('/api/v1/gpa/records').set('Authorization', `Bearer ${token}`).send({
      semester: 'Level 100 Sem 1',
      semesterOrder: 1,
      courseCode: 'UGRC 110',
      courseTitle: 'Academic Orientation',
      creditHours: 0,
      gradeLabel: 'A',
    });

    // Retake MATH 121 in Sem 2 and get B (3.0)
    const rRetake = await request(app)
      .post('/api/v1/gpa/records')
      .set('Authorization', `Bearer ${token}`)
      .send({
        semester: 'Level 100 Sem 2',
        semesterOrder: 2,
        courseCode: 'MATH 121',
        courseTitle: 'Algebra',
        creditHours: 3,
        gradeLabel: 'B',
        isRetake: true,
      });
    expect(rRetake.status).toBe(201);
    expect(rRetake.body.overview.semesters[0].semesterGpa).toBe(2.0);
    expect(rRetake.body.overview.semesters[1].semesterGpa).toBe(3.0);
    expect(rRetake.body.overview.cgpa).toBe(3.5);
    expect(rRetake.body.overview.completedGpaCredits).toBe(6);

    // What-If check: target First Class (3.60) with 6 remaining credits -> (3.60*12 - 21) / 6 = 22.2 / 6 = 3.70 -> Possible
    const whatIfOk = await request(app)
      .post('/api/v1/gpa/what-if')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetClassLabel: 'First Class', remainingCredits: 6 });
    expect(whatIfOk.status).toBe(200);
    expect(whatIfOk.body.possible).toBe(true);
    expect(whatIfOk.body.requiredAvgGpa).toBe(3.7);

    // Target 3.90 with 6 remaining credits -> (3.90*12 - 21)/6 = 4.30 > 4.00 -> Impossible
    const whatIfImpossible = await request(app)
      .post('/api/v1/gpa/what-if')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetCgpa: 3.9, remainingCredits: 6 });
    expect(whatIfImpossible.status).toBe(200);
    expect(whatIfImpossible.body.possible).toBe(false);
    expect(whatIfImpossible.body.requiredAvgGpa).toBe(4.3);

    // Create custom 5.0 scale and mark default
    const createdScale = await request(app)
      .post('/api/v1/gpa/scales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Custom 5.0',
        maxGpa: 5.0,
        retakePolicy: 'latest',
        isDefault: true,
        boundaries: [
          { label: 'A', minScore: 70, maxScore: 100, gradePoint: 5.0, isPass: true },
          { label: 'B', minScore: 60, maxScore: 69.99, gradePoint: 4.0, isPass: true },
          { label: 'F', minScore: 0, maxScore: 59.99, gradePoint: 0.0, isPass: false },
        ],
        degreeClasses: [{ label: 'First Class', minGpa: 4.5 }],
      });
    expect(createdScale.status).toBe(201);
    expect(createdScale.body.maxGpa).toBe(5.0);

    // Cross-user isolation
    const otherToken = signAccessToken(randomUUID(), env.JWT_SECRET).token;
    const crossRead = await request(app)
      .patch(`/api/v1/gpa/records/${r1.body.record.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ gradeLabel: 'B' });
    expect(crossRead.status).toBe(404);
  });
});
