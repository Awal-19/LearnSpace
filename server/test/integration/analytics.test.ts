import { randomUUID } from 'node:crypto';
import type { PrismaClient, ReviewRating } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
import { testEnv } from '../helpers';

interface FakeStudySession {
  userId: string;
  courseId: string | null;
  startedAt: Date;
  durationSeconds: number;
  course: { name: string; code: string | null; color: string | null } | null;
}

interface FakeQuizAttempt {
  userId: string;
  score: number;
  total: number;
  takenAt: Date;
  quiz: { title: string; topic: string | null; courseId: string | null };
}

interface FakePracticeAttempt {
  userId: string;
  score: number;
  total: number;
  weakTopicsJson: string[];
  takenAt: Date;
  set: { title: string; document: { courseId: string | null; title: string } };
}

interface FakeReviewLog {
  userId: string;
  courseId: string | null;
  topic: string | null;
  rating: ReviewRating;
  reviewedAt: Date;
}

interface FakeTask {
  id: string;
  userId: string;
  courseId: string | null;
  title: string;
  dueAt: Date | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'done';
  completedAt: Date | null;
}

function makeFakeAnalyticsPrisma(userId: string) {
  const studySessions: FakeStudySession[] = [];
  const quizAttempts: FakeQuizAttempt[] = [];
  const practiceAttempts: FakePracticeAttempt[] = [];
  const reviewLogs: FakeReviewLog[] = [];
  const tasks: FakeTask[] = [];
  const courses = [{ id: 'c1', name: 'Operating Systems', code: 'CSCD 302', color: '#2563EB' }];

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === userId
          ? { id: userId, name: 'Kwame Mensah', email: 'k@ls.edu', emailVerified: true }
          : null,
    },
    userSettings: {
      findUnique: async () => ({ timezone: 'UTC' }),
    },
    studySession: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; startedAt?: { gte?: Date; lte?: Date } };
      }) =>
        studySessions.filter((s) => {
          if (s.userId !== where.userId) return false;
          if (where.startedAt?.gte && s.startedAt < where.startedAt.gte) return false;
          if (where.startedAt?.lte && s.startedAt > where.startedAt.lte) return false;
          return true;
        }),
    },
    note: {
      count: async () => 2,
    },
    quizAttempt: {
      findMany: async ({ where }: { where: { userId: string; takenAt?: { gte?: Date } } }) =>
        quizAttempts.filter(
          (q) =>
            q.userId === where.userId && (!where.takenAt?.gte || q.takenAt >= where.takenAt.gte),
        ),
    },
    documentPracticeAttempt: {
      findMany: async ({ where }: { where: { userId: string; takenAt?: { gte?: Date } } }) =>
        practiceAttempts.filter(
          (p) =>
            p.userId === where.userId && (!where.takenAt?.gte || p.takenAt >= where.takenAt.gte),
        ),
    },
    reviewLog: {
      findMany: async ({ where }: { where: { userId: string; reviewedAt?: { gte?: Date } } }) =>
        reviewLogs.filter(
          (r) =>
            r.userId === where.userId &&
            (!where.reviewedAt?.gte || r.reviewedAt >= where.reviewedAt.gte),
        ),
    },
    task: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; status?: 'todo' | 'done'; completedAt?: { gte?: Date } };
      }) =>
        tasks.filter((t) => {
          if (t.userId !== where.userId) return false;
          if (where.status && t.status !== where.status) return false;
          if (where.completedAt?.gte && (!t.completedAt || t.completedAt < where.completedAt.gte)) {
            return false;
          }
          return true;
        }),
      count: async ({
        where,
      }: {
        where: {
          userId: string;
          status?: 'todo' | 'done';
          completedAt?: { gte?: Date; lte?: Date };
        };
      }) =>
        tasks.filter((t) => {
          if (t.userId !== where.userId) return false;
          if (where.status && t.status !== where.status) return false;
          if (where.completedAt?.gte && (!t.completedAt || t.completedAt < where.completedAt.gte)) {
            return false;
          }
          if (where.completedAt?.lte && (!t.completedAt || t.completedAt > where.completedAt.lte)) {
            return false;
          }
          return true;
        }).length,
    },
    conversation: {
      findMany: async () => [],
    },
    notification: {
      count: async () => 0,
    },
    timetableEntry: {
      findMany: async () => [],
    },
    exam: {
      findMany: async () => [],
    },
    card: {
      count: async () => 4,
    },
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    studySessions,
    quizAttempts,
    practiceAttempts,
    reviewLogs,
    tasks,
    courses,
  };
}

describe('Progress Analytics & Dashboard Daily Summary integration', () => {
  const env = testEnv();
  const logger = createLogger(env);
  let userId: string;
  let token: string;
  let db: ReturnType<typeof makeFakeAnalyticsPrisma>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    userId = randomUUID();
    token = signAccessToken(userId, env.JWT_SECRET).token;
    db = makeFakeAnalyticsPrisma(userId);
    app = createApp(env, { checkDb: async () => undefined, dashboardPrisma: db.prisma }, logger);
  });

  it('returns clean empty states for brand-new users with zero activity', async () => {
    const res = await request(app)
      .get('/api/v1/analytics?range=7d')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({
      totalStudyHours: 0,
      studySessionCount: 0,
      averageQuizAccuracy: null,
      flashcardReviews: 0,
      flashcardAccuracy: null,
      tasksCompleted: 0,
      streakDays: 0,
      bestStudyHour: null,
    });
    expect(res.body.studyTimeByCourse).toEqual([]);
    expect(res.body.quizScoreTrend).toEqual([]);
    expect(res.body.weakTopics).toEqual([]);
    expect(res.body.tasksCompletedTrend).toHaveLength(7);
  });

  it('aggregates study time by course, quiz trend, flashcards, tasks, best hours, weak topics, and daily summary across ranges', async () => {
    const now = new Date();
    const today14 = new Date(now);
    today14.setUTCHours(14, 0, 0, 0);
    const yesterday14 = new Date(today14.getTime() - 24 * 60 * 60 * 1000);
    const twentyDaysAgo = new Date(today14.getTime() - 20 * 24 * 60 * 60 * 1000);

    db.studySessions.push(
      {
        userId,
        courseId: 'c1',
        startedAt: today14,
        durationSeconds: 3600,
        course: { name: 'Operating Systems', code: 'CSCD 302', color: '#2563EB' },
      },
      {
        userId,
        courseId: 'c1',
        startedAt: yesterday14,
        durationSeconds: 1800,
        course: { name: 'Operating Systems', code: 'CSCD 302', color: '#2563EB' },
      },
      {
        userId,
        courseId: null,
        startedAt: twentyDaysAgo,
        durationSeconds: 5400,
        course: null,
      },
    );

    db.quizAttempts.push({
      userId,
      score: 2,
      total: 5,
      takenAt: today14,
      quiz: { title: 'OS Memory Quiz', topic: 'Virtual Memory', courseId: 'c1' },
    });

    db.reviewLogs.push(
      { userId, courseId: 'c1', topic: 'Deadlocks', rating: 'again', reviewedAt: today14 },
      { userId, courseId: 'c1', topic: 'Deadlocks', rating: 'again', reviewedAt: today14 },
      { userId, courseId: 'c1', topic: 'Deadlocks', rating: 'good', reviewedAt: today14 },
      { userId, courseId: 'c1', topic: 'Semaphores', rating: 'easy', reviewedAt: today14 },
    );

    db.practiceAttempts.push({
      userId,
      score: 3,
      total: 5,
      weakTopicsJson: ['Page Replacement'],
      takenAt: yesterday14,
      set: { title: 'Slides Set', document: { courseId: 'c1', title: 'Slides' } },
    });

    db.tasks.push({
      id: 't1',
      userId,
      courseId: 'c1',
      title: 'Read Ch 4',
      dueAt: today14,
      priority: 'high',
      status: 'done',
      completedAt: today14,
    });

    const sevenDay = await request(app)
      .get('/api/v1/analytics?range=7d')
      .set('Authorization', `Bearer ${token}`);
    expect(sevenDay.status).toBe(200);
    expect(sevenDay.body.summary.totalStudyHours).toBe(1.5);
    expect(sevenDay.body.summary.averageQuizAccuracy).toBe(40);
    expect(sevenDay.body.summary.flashcardReviews).toBe(4);
    expect(sevenDay.body.summary.flashcardAccuracy).toBe(50);
    expect(sevenDay.body.summary.tasksCompleted).toBe(1);
    expect(sevenDay.body.summary.streakDays).toBe(2);
    expect(sevenDay.body.summary.bestStudyHour.hour).toBe(14);
    expect(sevenDay.body.studyTimeByCourse[0]).toMatchObject({
      courseId: 'c1',
      label: 'CSCD 302 · Operating Systems',
      minutes: 90,
    });
    expect(sevenDay.body.weakTopics.map((w: { topic: string }) => w.topic)).toEqual(
      expect.arrayContaining(['Deadlocks', 'Virtual Memory', 'Page Replacement']),
    );
    expect(sevenDay.body.weakTopics.map((w: { topic: string }) => w.topic)).not.toContain(
      'Semaphores',
    );

    const thirtyDay = await request(app)
      .get('/api/v1/analytics?range=30d')
      .set('Authorization', `Bearer ${token}`);
    expect(thirtyDay.status).toBe(200);
    expect(thirtyDay.body.summary.totalStudyHours).toBe(3);

    const dash = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(dash.status).toBe(200);
    expect(dash.body.todayStudyHours).toBe(1);
    expect(dash.body.todayTasksDoneCount).toBe(1);
    expect(dash.body.dueFlashcardsCount).toBe(4);
  });
});
