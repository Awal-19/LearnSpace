import type { PrismaClient, StudySession } from '@prisma/client';
import { AppError } from '../../lib/errors';
import type { CreateStudySessionInput, ListStudySessionsQuery } from './focus.schemas';

export interface PublicStudySession {
  id: string;
  taskId: string | null;
  courseId: string | null;
  kind: 'focus';
  startedAt: Date;
  durationSeconds: number;
  source: 'pomodoro' | 'manual';
  createdAt: Date;
}

function toPublicSession(s: StudySession): PublicStudySession {
  return {
    id: s.id,
    taskId: s.taskId,
    courseId: (s as { courseId?: string | null }).courseId ?? null,
    kind: s.kind,
    startedAt: s.startedAt,
    durationSeconds: s.durationSeconds,
    source: s.source,
    createdAt: s.createdAt,
  };
}

export interface FocusService {
  createSession(
    userId: string,
    input: CreateStudySessionInput,
    now?: Date,
  ): Promise<PublicStudySession>;
  listSessions(
    userId: string,
    query: ListStudySessionsQuery,
    now?: Date,
  ): Promise<{ items: PublicStudySession[]; totalSeconds: number }>;
  deleteSession(userId: string, sessionId: string): Promise<void>;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const NINETY_DAYS_MS = 90 * ONE_DAY_MS;

export function createFocusService(prisma: PrismaClient): FocusService {
  return {
    async createSession(userId, input, now = new Date()) {
      const startedAt = new Date(input.startedAt);
      const nowMs = now.getTime();
      const startMs = startedAt.getTime();

      if (startMs > nowMs + ONE_MINUTE_MS) {
        throw new AppError('VALIDATION_ERROR', 'Session start time cannot be in the future');
      }
      if (startMs < nowMs - ONE_DAY_MS) {
        throw new AppError('VALIDATION_ERROR', 'Session start time cannot be older than 24 hours');
      }
      if (startMs + input.durationSeconds * 1000 > nowMs + ONE_MINUTE_MS) {
        throw new AppError('VALIDATION_ERROR', 'Session end time cannot be in the future');
      }

      let linkedTaskCourseId: string | null = null;
      if (input.taskId) {
        const task = await prisma.task.findFirst({ where: { id: input.taskId, userId } });
        if (!task) throw new AppError('NOT_FOUND', 'Task not found');
        linkedTaskCourseId = task.courseId ?? null;
      }

      if (input.courseId) {
        const course = await prisma.course.findFirst({ where: { id: input.courseId, userId } });
        if (!course) throw new AppError('NOT_FOUND', 'Course not found');
      }

      const resolvedCourseId = input.courseId !== undefined ? input.courseId : linkedTaskCourseId;

      // Idempotent on (userId, startedAt) so network retries never double-count.
      const session = await prisma.studySession.upsert({
        where: { userId_startedAt: { userId, startedAt } },
        create: {
          userId,
          taskId: input.taskId ?? null,
          courseId: resolvedCourseId,
          kind: 'focus',
          startedAt,
          durationSeconds: input.durationSeconds,
          source: input.source,
        },
        update: {},
      });

      return toPublicSession(session);
    },

    async listSessions(userId, query, now = new Date()) {
      const to = query.to ? new Date(query.to) : now;
      const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * ONE_DAY_MS);

      if (from > to) {
        throw new AppError('VALIDATION_ERROR', '"from" must be before "to"');
      }
      if (to.getTime() - from.getTime() > NINETY_DAYS_MS) {
        throw new AppError('VALIDATION_ERROR', 'Date range cannot exceed 90 days');
      }

      const courseFilter =
        query.courseId === 'none'
          ? { courseId: null }
          : query.courseId
            ? { courseId: query.courseId }
            : {};

      const rows = await prisma.studySession.findMany({
        where: {
          userId,
          ...courseFilter,
          startedAt: { gte: from, lte: to },
        },
        orderBy: { startedAt: 'desc' },
      });

      const totalSeconds = rows.reduce((acc, r) => acc + r.durationSeconds, 0);
      return { items: rows.map(toPublicSession), totalSeconds };
    },

    async deleteSession(userId, sessionId) {
      const session = await prisma.studySession.findFirst({ where: { id: sessionId, userId } });
      if (!session) throw new AppError('NOT_FOUND', 'Study session not found');
      await prisma.studySession.delete({ where: { id: sessionId } });
    },
  };
}
