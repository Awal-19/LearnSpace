import type { Course, DocumentType, Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from '../../lib/errors';
import type { StorageService } from '../../lib/storage';
import type { CreateCourseInput, ListCoursesQuery, UpdateCourseInput } from './courses.schemas';
import type { RecommendationJobQueue } from './recommendations.jobs';

export interface PublicCourse {
  id: string;
  name: string;
  code: string | null;
  lecturer: string | null;
  creditHours: number | null;
  semester: string | null;
  level: string | null;
  color: string | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  noteCount: number;
  documentCount: number;
  taskCount: number;
  deckCount: number;
  quizCount: number;
  studySeconds: number;
  recommendationCount: number;
  recommendationJobStatus: string | null;
}

export interface CourseDetailResponse {
  course: PublicCourse;
  notes: Array<{
    id: string;
    title: string;
    aiSummary: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  documents: Array<{
    id: string;
    title: string;
    type: DocumentType;
    originalName: string;
    status: string;
    pageCount: number;
    createdAt: Date;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    dueAt: Date | null;
    priority: 'low' | 'medium' | 'high';
    status: 'todo' | 'done';
    completedAt: Date | null;
  }>;
  decks: Array<{
    id: string;
    title: string;
    topic: string | null;
    cardCount: number;
    updatedAt: Date;
  }>;
  quizzes: Array<{
    id: string;
    title: string;
    topic: string | null;
    questionCount: number;
    attempts: number;
    bestScore: number | null;
    lastScore: number | null;
    createdAt: Date;
  }>;
  upcomingExams: Array<{
    id: string;
    title: string;
    startsAt: Date;
    durationMinutes: number | null;
    venue: string | null;
    examType: string;
    weightPercent: number | null;
    topics: string[];
  }>;
  stats: {
    studySeconds: number;
    averageQuizScore: number | null;
    quizzesTaken: number;
    openTasksCount: number;
    completedTasksCount: number;
  };
}

type CourseWithOptionalCounts = Course & {
  _count?: {
    notes?: number;
    documents?: number;
    tasks?: number;
    decks?: number;
    quizzes?: number;
  };
};

function toPublicCourse(
  c: CourseWithOptionalCounts,
  studySeconds = 0,
  recommendationCount = 0,
  recommendationJobStatus: string | null = null,
): PublicCourse {
  return {
    id: c.id,
    name: c.name,
    code: c.code ?? null,
    lecturer: c.lecturer ?? null,
    creditHours: c.creditHours ?? null,
    semester: c.semester ?? null,
    level: c.level ?? null,
    color: c.color ?? null,
    notes: c.courseNotes ?? null,
    archivedAt: c.archivedAt ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt ?? c.createdAt,
    noteCount: c._count?.notes ?? 0,
    documentCount: c._count?.documents ?? 0,
    taskCount: c._count?.tasks ?? 0,
    deckCount: c._count?.decks ?? 0,
    quizCount: c._count?.quizzes ?? 0,
    studySeconds,
    recommendationCount,
    recommendationJobStatus,
  };
}

export interface CoursesServiceDeps {
  prisma: PrismaClient;
  storage?: StorageService;
  recommendationQueue?: RecommendationJobQueue;
  logger: Logger;
}

export interface CoursesService {
  listCourses(userId: string, query?: Partial<ListCoursesQuery>): Promise<PublicCourse[]>;
  getCourseDetail(userId: string, courseId: string): Promise<CourseDetailResponse>;
  createCourse(userId: string, input: CreateCourseInput): Promise<PublicCourse>;
  updateCourse(userId: string, courseId: string, input: UpdateCourseInput): Promise<PublicCourse>;
  deleteCourse(userId: string, courseId: string, mode?: 'unassign' | 'delete'): Promise<void>;
}

export function createCoursesService({
  prisma,
  storage,
  recommendationQueue,
  logger,
}: CoursesServiceDeps): CoursesService {
  async function assertCourseOwned(userId: string, courseId: string) {
    const course = await prisma.course.findFirst({ where: { id: courseId, userId } });
    if (!course) throw new AppError('NOT_FOUND', 'Course not found');
    return course;
  }

  async function studySecondsByCourseMap(userId: string): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!prisma.studySession?.groupBy) return map;
    const grouped = await prisma.studySession.groupBy({
      by: ['courseId'],
      where: { userId, courseId: { not: null } },
      _sum: { durationSeconds: true },
    });
    for (const row of grouped) {
      if (row.courseId) {
        map.set(row.courseId, row._sum.durationSeconds ?? 0);
      }
    }
    return map;
  }

  return {
    async listCourses(userId, query = {}) {
      const archived = query.archived ?? 'active';
      const where: Prisma.CourseWhereInput = {
        userId,
        ...(archived === 'active'
          ? { archivedAt: null }
          : archived === 'archived'
            ? { archivedAt: { not: null } }
            : {}),
        ...(query.semester ? { semester: query.semester } : {}),
      };

      const [courses, secondsMap, recCounts, latestJobs] = await Promise.all([
        prisma.course.findMany({
          where,
          orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
          include: {
            _count: {
              select: {
                notes: true,
                documents: true,
                tasks: true,
                decks: true,
                quizzes: true,
              },
            },
          },
        }),
        studySecondsByCourseMap(userId),
        prisma.courseRecommendation?.groupBy
          ? prisma.courseRecommendation
              .groupBy({
                by: ['courseId'],
                where: { userId, hidden: false, status: { in: ['active', 'saved'] } },
                _count: { _all: true },
              })
              .catch(() => [])
          : Promise.resolve([]),
        prisma.recommendationJob?.findMany
          ? prisma.recommendationJob
              .findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 100,
                select: { courseId: true, status: true },
              })
              .catch(() => [])
          : Promise.resolve([]),
      ]);

      const recCountMap = new Map<string, number>();
      for (const row of recCounts) {
        recCountMap.set(row.courseId, row._count._all);
      }
      const jobStatusMap = new Map<string, string>();
      for (const job of latestJobs) {
        if (!jobStatusMap.has(job.courseId)) {
          jobStatusMap.set(job.courseId, job.status);
        }
      }

      return courses.map((c) =>
        toPublicCourse(
          c,
          secondsMap.get(c.id) ?? 0,
          recCountMap.get(c.id) ?? 0,
          jobStatusMap.get(c.id) ?? null,
        ),
      );
    },

    async getCourseDetail(userId, courseId) {
      const courseRow = await assertCourseOwned(userId, courseId);

      const [notes, documents, tasks, decks, quizzes, studyAgg, upcomingExams] = await Promise.all([
        prisma.note.findMany({
          where: { userId, courseId },
          orderBy: { updatedAt: 'desc' },
          take: 50,
          select: { id: true, title: true, aiSummary: true, createdAt: true, updatedAt: true },
        }),
        prisma.document.findMany({
          where: { userId, courseId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            title: true,
            type: true,
            originalName: true,
            status: true,
            pageCount: true,
            createdAt: true,
          },
        }),
        prisma.task.findMany({
          where: { userId, courseId },
          orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
          take: 50,
          select: {
            id: true,
            title: true,
            dueAt: true,
            priority: true,
            status: true,
            completedAt: true,
          },
        }),
        prisma.deck.findMany({
          where: { userId, courseId },
          orderBy: { updatedAt: 'desc' },
          take: 50,
          select: {
            id: true,
            title: true,
            topic: true,
            updatedAt: true,
            _count: { select: { cards: true } },
          },
        }),
        prisma.quiz.findMany({
          where: { userId, courseId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            title: true,
            topic: true,
            createdAt: true,
            _count: { select: { questions: true } },
            attempts: {
              orderBy: { takenAt: 'desc' },
              select: { score: true, total: true },
            },
          },
        }),
        prisma.studySession.aggregate({
          where: { userId, courseId },
          _sum: { durationSeconds: true },
        }),
        prisma.exam
          ? prisma.exam.findMany({
              where: { userId, courseId, startsAt: { gte: new Date() } },
              orderBy: { startsAt: 'asc' },
              take: 25,
              select: {
                id: true,
                title: true,
                startsAt: true,
                durationMinutes: true,
                venue: true,
                examType: true,
                weightPercent: true,
                topicsJson: true,
              },
            })
          : Promise.resolve([]),
      ]);

      const quizItems = quizzes.map((q) => {
        const ratios = q.attempts.map((a) => (a.total > 0 ? a.score / a.total : 0));
        return {
          id: q.id,
          title: q.title,
          topic: q.topic,
          questionCount: q._count.questions,
          attempts: q.attempts.length,
          bestScore: ratios.length > 0 ? Math.round(Math.max(...ratios) * 100) / 100 : null,
          lastScore: ratios.length > 0 ? Math.round((ratios[0] ?? 0) * 100) / 100 : null,
          createdAt: q.createdAt,
        };
      });

      const allAttemptRatios = quizzes.flatMap((q) =>
        q.attempts.map((a) => (a.total > 0 ? a.score / a.total : 0)),
      );
      const averageQuizScore =
        allAttemptRatios.length > 0
          ? Math.round(
              (allAttemptRatios.reduce((acc, r) => acc + r, 0) / allAttemptRatios.length) * 1000,
            ) / 1000
          : null;

      const openTasksCount = tasks.filter((t) => t.status === 'todo').length;
      const completedTasksCount = tasks.filter((t) => t.status === 'done').length;
      const studySeconds = studyAgg._sum.durationSeconds ?? 0;

      const publicCourse = toPublicCourse(
        {
          ...courseRow,
          _count: {
            notes: notes.length,
            documents: documents.length,
            tasks: tasks.length,
            decks: decks.length,
            quizzes: quizzes.length,
          },
        },
        studySeconds,
      );

      return {
        course: publicCourse,
        notes,
        documents,
        tasks,
        decks: decks.map((d) => ({
          id: d.id,
          title: d.title,
          topic: d.topic,
          cardCount: d._count.cards,
          updatedAt: d.updatedAt,
        })),
        quizzes: quizItems,
        upcomingExams: upcomingExams.map((ex) => ({
          id: ex.id,
          title: ex.title,
          startsAt: ex.startsAt,
          durationMinutes: ex.durationMinutes,
          venue: ex.venue,
          examType: ex.examType,
          weightPercent: ex.weightPercent,
          topics: Array.isArray(ex.topicsJson)
            ? ex.topicsJson.filter((t): t is string => typeof t === 'string')
            : [],
        })),
        stats: {
          studySeconds,
          averageQuizScore,
          quizzesTaken: allAttemptRatios.length,
          openTasksCount,
          completedTasksCount,
        },
      };
    },

    async createCourse(userId, input) {
      if (typeof prisma.course.count === 'function') {
        const total = await prisma.course.count({ where: { userId } });
        if (total >= 50) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Course limit (50) reached. Delete or archive an unused course first.',
          );
        }
      }
      const existing = await prisma.course.findFirst({
        where: { userId, name: { equals: input.name, mode: 'insensitive' } },
      });
      if (existing) {
        throw new AppError('CONFLICT', 'A course with this name already exists');
      }

      const created = await prisma.course.create({
        data: {
          userId,
          name: input.name,
          code: input.code ?? null,
          lecturer: input.lecturer ?? null,
          creditHours: input.creditHours ?? null,
          semester: input.semester ?? null,
          level: input.level ?? null,
          color: input.color ?? '#2563EB',
          courseNotes: input.notes ?? null,
        },
      });
      let jobStatus: string | null = null;
      if (recommendationQueue) {
        try {
          const job = await recommendationQueue.enqueue({
            courseId: created.id,
            userId,
            trigger: 'auto_create',
          });
          jobStatus = job.status;
        } catch (err) {
          logger.warn({ err, courseId: created.id }, 'Failed to enqueue course recommendation job');
        }
      }
      return toPublicCourse(created, 0, 0, jobStatus);
    },

    async updateCourse(userId, courseId, input) {
      await assertCourseOwned(userId, courseId);
      if (input.name) {
        const dup = await prisma.course.findFirst({
          where: {
            userId,
            name: { equals: input.name, mode: 'insensitive' },
            id: { not: courseId },
          },
        });
        if (dup) throw new AppError('CONFLICT', 'A course with this name already exists');
      }

      const data: Prisma.CourseUpdateInput = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.lecturer !== undefined ? { lecturer: input.lecturer } : {}),
        ...(input.creditHours !== undefined ? { creditHours: input.creditHours } : {}),
        ...(input.semester !== undefined ? { semester: input.semester } : {}),
        ...(input.level !== undefined ? { level: input.level } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.notes !== undefined ? { courseNotes: input.notes } : {}),
        ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
      };

      const [updated, studyAgg] = await Promise.all([
        prisma.course.update({
          where: { id: courseId },
          data,
          include: {
            _count: {
              select: {
                notes: true,
                documents: true,
                tasks: true,
                decks: true,
                quizzes: true,
              },
            },
          },
        }),
        prisma.studySession?.aggregate
          ? prisma.studySession.aggregate({
              where: { userId, courseId },
              _sum: { durationSeconds: true },
            })
          : Promise.resolve({ _sum: { durationSeconds: 0 } }),
      ]);

      return toPublicCourse(updated, studyAgg._sum.durationSeconds ?? 0);
    },

    async deleteCourse(userId, courseId, mode = 'unassign') {
      await assertCourseOwned(userId, courseId);

      if (mode === 'unassign') {
        await prisma.course.delete({ where: { id: courseId } });
        return;
      }

      const [docsToClean, attachmentsToClean] = await Promise.all([
        prisma.document?.findMany
          ? prisma.document.findMany({
              where: { userId, courseId },
              select: { storageKey: true, kind: true },
            })
          : Promise.resolve([]),
        prisma.messageAttachment?.findMany
          ? prisma.messageAttachment.findMany({
              where: { userId, conversation: { courseId } },
              select: { storageKey: true, kind: true },
            })
          : Promise.resolve([]),
      ]);

      const deleteAll = async (tx: Prisma.TransactionClient) => {
        if (tx.studySession?.deleteMany) {
          await tx.studySession.deleteMany({ where: { userId, courseId } });
        }
        if (tx.quiz?.deleteMany) {
          await tx.quiz.deleteMany({ where: { userId, courseId } });
        }
        if (tx.deck?.deleteMany) {
          await tx.deck.deleteMany({ where: { userId, courseId } });
        }
        if (tx.task?.deleteMany) {
          await tx.task.deleteMany({ where: { userId, courseId } });
        }
        if (tx.note?.deleteMany) {
          await tx.note.deleteMany({ where: { userId, courseId } });
        }
        if (tx.document?.deleteMany) {
          await tx.document.deleteMany({ where: { userId, courseId } });
        }
        if (tx.studyDocument?.deleteMany) {
          await tx.studyDocument.deleteMany({ where: { userId, courseId } });
        }
        if (tx.conversation?.deleteMany) {
          await tx.conversation.deleteMany({ where: { userId, courseId } });
        }
        await tx.course.delete({ where: { id: courseId } });
      };

      if (prisma.$transaction) {
        await prisma.$transaction((tx) => deleteAll(tx));
      } else {
        await deleteAll(prisma as unknown as Prisma.TransactionClient);
      }

      if (storage) {
        const blobs = [...docsToClean, ...attachmentsToClean];
        await Promise.allSettled(
          blobs.map((b) =>
            storage.deleteAttachment(b.storageKey, b.kind).catch((err) => {
              logger.warn({ err, storageKey: b.storageKey }, 'Failed to clean course file blob');
            }),
          ),
        );
      }
    },
  };
}
