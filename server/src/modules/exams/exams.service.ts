import type {
  Exam,
  ExamType,
  Prisma,
  PrismaClient,
  RevisionPlan,
  RevisionPlanStatus,
  RevisionSession,
  RevisionSessionStatus,
} from '@prisma/client';
import type { Logger } from 'pino';
import type { EmailService } from '../../lib/email';
import { AppError } from '../../lib/errors';
import type { LLMProvider } from '../../lib/llm/provider';
import { recordUsageEvent } from '../admin/admin.logging';
import { generateJsonWithRetry } from '../documents/documents.llmJson';
import { computeRemindAt } from '../planner/planner.service';
import { DAY_LABELS, localDateTimeParts } from '../timetable/timetable.service';
import {
  aiRevisionPlanOutputSchema,
  type CreateExamInput,
  type GenerateRevisionPlanInput,
  type ListExamsQuery,
  type SaveRevisionPlanInput,
  type UpdateExamInput,
  type UpdateRevisionSessionInput,
} from './exams.schemas';
import {
  REVISION_PLAN_SYSTEM_PROMPT,
  buildRevisionPlanPrompt,
  type PromptExamContext,
} from './exams.prompts';

export interface PublicExamCourse {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  archivedAt: Date | null;
}

export interface PublicExam {
  id: string;
  courseId: string;
  title: string;
  examType: ExamType;
  startsAt: Date;
  durationMinutes: number | null;
  venue: string | null;
  weightPercent: number | null;
  topics: string[];
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  course: PublicExamCourse;
}

export interface PublicRevisionSession {
  id: string;
  planId: string;
  examId: string | null;
  courseId: string | null;
  taskId: string | null;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  topic: string;
  notes: string | null;
  status: RevisionSessionStatus;
  position: number;
  course: { id: string; name: string; code: string | null; color: string | null } | null;
  exam: { id: string; title: string; startsAt: Date } | null;
  taskStatus: 'todo' | 'done' | null;
}

export interface PublicRevisionPlan {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  daysOff: number[];
  preferredTimes: string[];
  status: RevisionPlanStatus;
  createdAt: Date;
  updatedAt: Date;
  sessions: PublicRevisionSession[];
}

export interface DraftRevisionSession {
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  courseId: string | null;
  examId: string | null;
  topic: string;
  notes: string | null;
}

export interface RevisionPlanDraftResponse {
  draft: {
    title: string;
    startDate: string;
    endDate: string;
    hoursPerDay: number;
    daysOff: number[];
    preferredTimes: string[];
    sessions: DraftRevisionSession[];
  };
  contextSummary: {
    examCount: number;
    noteCount: number;
    documentCount: number;
    weakTopics: string[];
  };
}

export function parseStringArrayJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

export function parseNumberArrayJson(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is number => typeof v === 'number' && Number.isInteger(v));
}

export function addDaysDateStr(dateStr: string, delta: number): string {
  const [y = 1970, m = 1, d = 1] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function weekdayForDateStr(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

export function computeAvailableStudyDates(
  startDate: string,
  endDate: string,
  daysOff: number[],
): Array<{ dateStr: string; weekdayLabel: string }> {
  const offSet = new Set(daysOff);
  const dates: Array<{ dateStr: string; weekdayLabel: string }> = [];
  let cursor = startDate;
  for (let i = 0; i < 62 && cursor <= endDate; i++) {
    const wd = weekdayForDateStr(cursor);
    if (!offSet.has(wd)) {
      dates.push({ dateStr: cursor, weekdayLabel: DAY_LABELS[wd] ?? 'Day' });
    }
    cursor = addDaysDateStr(cursor, 1);
  }
  return dates;
}

export function localDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y = 1970, m = 1, d = 1] = dateStr.split('-').map(Number);
  const [hh = 18, mm = 0] = timeStr.split(':').map(Number);
  const targetMs = Date.UTC(y, m - 1, d, hh, mm, 0);
  let guess = new Date(targetMs);
  for (let i = 0; i < 2; i++) {
    const parts = localDateTimeParts(guess, timeZone);
    const [py = 1970, pm = 1, pd = 1] = parts.dateStr.split('-').map(Number);
    const actualLocalMs = Date.UTC(
      py,
      pm - 1,
      pd,
      Math.floor(parts.minuteOfDay / 60),
      parts.minuteOfDay % 60,
      0,
    );
    const diff = targetMs - actualLocalMs;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

function dateOnlyString(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

function utcDayBounds(now: Date = new Date()): { dayDate: Date } {
  const dayStr = now.toISOString().slice(0, 10);
  return { dayDate: new Date(`${dayStr}T00:00:00.000Z`) };
}

type ExamWithCourse = Exam & { course: PublicExamCourse };

function toPublicExam(row: ExamWithCourse): PublicExam {
  return {
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    examType: row.examType,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    venue: row.venue,
    weightPercent: row.weightPercent,
    topics: parseStringArrayJson(row.topicsJson),
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    course: row.course,
  };
}

type SessionWithRelations = RevisionSession & {
  course: { id: string; name: string; code: string | null; color: string | null } | null;
  exam: { id: string; title: string; startsAt: Date } | null;
  task: { status: 'todo' | 'done' } | null;
};

type PlanWithSessions = RevisionPlan & { sessions: SessionWithRelations[] };

function toPublicPlan(plan: PlanWithSessions): PublicRevisionPlan {
  return {
    id: plan.id,
    title: plan.title,
    startDate: dateOnlyString(plan.startDate),
    endDate: dateOnlyString(plan.endDate),
    hoursPerDay: plan.hoursPerDay,
    daysOff: parseNumberArrayJson(plan.daysOffJson),
    preferredTimes: parseStringArrayJson(plan.preferredTimesJson),
    status: plan.status,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    sessions: plan.sessions.map((s) => ({
      id: s.id,
      planId: s.planId,
      examId: s.examId,
      courseId: s.courseId,
      taskId: s.taskId,
      scheduledDate: dateOnlyString(s.scheduledDate),
      startTime: s.startTime,
      durationMinutes: s.durationMinutes,
      topic: s.topic,
      notes: s.notes,
      status: s.task?.status === 'done' ? 'completed' : s.status,
      position: s.position,
      course: s.course,
      exam: s.exam,
      taskStatus: s.task?.status ?? null,
    })),
  };
}

function buildPlannerTaskTitle(courseLabel: string | null, topic: string): string {
  const raw = courseLabel ? `[${courseLabel}] Revise: ${topic}` : `Revise: ${topic}`;
  return raw.slice(0, 200);
}

export interface ExamsServiceDeps {
  prisma: PrismaClient;
  llm: LLMProvider;
  email: EmailService;
  logger: Logger;
  clientUrl: string;
  dailyTokenLimit?: number | null;
}

export interface ExamsService {
  listExams(
    userId: string,
    query?: ListExamsQuery,
  ): Promise<{ items: PublicExam[]; timezone: string; defaultExamReminderMinutes: number }>;
  createExam(userId: string, input: CreateExamInput): Promise<PublicExam>;
  updateExam(userId: string, examId: string, input: UpdateExamInput): Promise<PublicExam>;
  deleteExam(userId: string, examId: string): Promise<void>;
  processDueExamReminders(now?: Date): Promise<number>;

  listRevisionPlans(userId: string): Promise<PublicRevisionPlan[]>;
  generateRevisionPlan(
    userId: string,
    input: GenerateRevisionPlanInput,
    now?: Date,
  ): Promise<RevisionPlanDraftResponse>;
  saveRevisionPlan(userId: string, input: SaveRevisionPlanInput): Promise<PublicRevisionPlan>;
  updateRevisionSession(
    userId: string,
    planId: string,
    sessionId: string,
    input: UpdateRevisionSessionInput,
  ): Promise<PublicRevisionPlan>;
  rescheduleMissedSessions(
    userId: string,
    planId: string,
    now?: Date,
  ): Promise<{ plan: PublicRevisionPlan; rescheduledCount: number }>;
  deleteRevisionPlan(userId: string, planId: string): Promise<void>;
}

const courseSelect = {
  id: true,
  name: true,
  code: true,
  color: true,
  archivedAt: true,
} as const;

const planInclude = {
  sessions: {
    orderBy: [
      { scheduledDate: 'asc' as const },
      { startTime: 'asc' as const },
      { position: 'asc' as const },
    ],
    include: {
      course: { select: { id: true, name: true, code: true, color: true } },
      exam: { select: { id: true, title: true, startsAt: true } },
      task: { select: { status: true } },
    },
  },
};

export function createExamsService({
  prisma,
  llm,
  email,
  logger,
  clientUrl,
  dailyTokenLimit = 100_000,
}: ExamsServiceDeps): ExamsService {
  async function assertCourseOwned(userId: string, courseId: string) {
    const course = await prisma.course.findFirst({
      where: { id: courseId, userId },
      select: { id: true, name: true, code: true },
    });
    if (!course) throw new AppError('NOT_FOUND', 'Course not found');
    return course;
  }

  async function assertExamOwned(userId: string, examId: string) {
    const exam = await prisma.exam.findFirst({
      where: { id: examId, userId },
    });
    if (!exam) throw new AppError('NOT_FOUND', 'Exam not found');
    return exam;
  }

  async function loadHydratedPlan(userId: string, planId: string): Promise<PublicRevisionPlan> {
    const plan = await prisma.revisionPlan.findFirst({
      where: { id: planId, userId },
      include: planInclude,
    });
    if (!plan) throw new AppError('NOT_FOUND', 'Revision plan not found');
    return toPublicPlan(plan);
  }

  return {
    async listExams(userId, query = {}) {
      const now = new Date();
      const where: Prisma.ExamWhereInput = {
        userId,
        ...(query.courseId ? { courseId: query.courseId } : {}),
        ...(query.upcoming === 'true' ? { startsAt: { gte: now } } : {}),
      };

      const [rows, settings] = await Promise.all([
        prisma.exam.findMany({
          where,
          orderBy: { startsAt: 'asc' },
          include: { course: { select: courseSelect } },
        }),
        prisma.userSettings.findUnique({
          where: { userId },
          select: { timezone: true, examReminderMinutes: true },
        }),
      ]);

      return {
        items: rows.map(toPublicExam),
        timezone: settings?.timezone ?? 'UTC',
        defaultExamReminderMinutes: settings?.examReminderMinutes ?? 1440,
      };
    },

    async createExam(userId, input) {
      await assertCourseOwned(userId, input.courseId);
      const created = await prisma.exam.create({
        data: {
          userId,
          courseId: input.courseId,
          title: input.title,
          examType: input.examType,
          startsAt: new Date(input.startsAt),
          durationMinutes: input.durationMinutes ?? null,
          venue: input.venue ?? null,
          weightPercent: input.weightPercent ?? null,
          topicsJson: input.topics as Prisma.InputJsonValue,
          notes: input.notes ?? null,
        },
        include: { course: { select: courseSelect } },
      });
      return toPublicExam(created);
    },

    async updateExam(userId, examId, input) {
      const existing = await assertExamOwned(userId, examId);
      if (input.courseId !== undefined) {
        await assertCourseOwned(userId, input.courseId);
      }

      const nextStartsAt =
        input.startsAt !== undefined ? new Date(input.startsAt) : existing.startsAt;
      const dateChanged =
        input.startsAt !== undefined && nextStartsAt.getTime() !== existing.startsAt.getTime();

      const updated = await prisma.exam.update({
        where: { id: examId },
        data: {
          ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.examType !== undefined ? { examType: input.examType } : {}),
          ...(input.startsAt !== undefined ? { startsAt: nextStartsAt } : {}),
          ...(input.durationMinutes !== undefined
            ? { durationMinutes: input.durationMinutes }
            : {}),
          ...(input.venue !== undefined ? { venue: input.venue } : {}),
          ...(input.weightPercent !== undefined ? { weightPercent: input.weightPercent } : {}),
          ...(input.topics !== undefined
            ? { topicsJson: input.topics as Prisma.InputJsonValue }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(dateChanged ? { reminderSentAt: null } : {}),
        },
        include: { course: { select: courseSelect } },
      });
      return toPublicExam(updated);
    },

    async deleteExam(userId, examId) {
      await assertExamOwned(userId, examId);
      await prisma.exam.delete({ where: { id: examId } });
    },

    async processDueExamReminders(now = new Date()) {
      const exams = await prisma.exam.findMany({
        where: {
          reminderSentAt: null,
          startsAt: { gt: now },
          course: { archivedAt: null },
        },
        include: {
          course: { select: { id: true, name: true, code: true } },
          user: {
            select: {
              email: true,
              name: true,
              emailVerified: true,
              settings: {
                select: {
                  timezone: true,
                  notifyInApp: true,
                  notifyEmailReminders: true,
                  examReminderMinutes: true,
                },
              },
            },
          },
        },
        take: 100,
      });

      let processed = 0;
      for (const exam of exams) {
        const settings = exam.user.settings;
        const leadMinutes = settings?.examReminderMinutes ?? 1440;
        if (leadMinutes <= 0) continue;

        const notifyInApp = settings?.notifyInApp !== false;
        const notifyEmail = Boolean(exam.user.emailVerified && settings?.notifyEmailReminders);
        if (!notifyInApp && !notifyEmail) continue;

        const msUntil = exam.startsAt.getTime() - now.getTime();
        if (msUntil > leadMinutes * 60_000) continue;

        const tz = settings?.timezone ?? 'UTC';
        const localStart = localDateTimeParts(exam.startsAt, tz);
        const timeStr = `${String(Math.floor(localStart.minuteOfDay / 60)).padStart(2, '0')}:${String(localStart.minuteOfDay % 60).padStart(2, '0')}`;
        const courseLabel = exam.course.code
          ? `${exam.course.code} — ${exam.course.name}`
          : exam.course.name;
        const occurrenceKey = `exam:${exam.id}:${exam.startsAt.toISOString()}`;

        try {
          if (notifyInApp) {
            await prisma.notification.upsert({
              where: {
                userId_type_occurrenceKey: {
                  userId: exam.userId,
                  type: 'exam_reminder',
                  occurrenceKey,
                },
              },
              create: {
                userId: exam.userId,
                type: 'exam_reminder',
                title: `Upcoming exam: ${courseLabel}`,
                body: `${exam.title} on ${localStart.dateStr} at ${timeStr}${exam.venue ? ` · ${exam.venue}` : ''}`,
                examId: exam.id,
                occurrenceKey,
              },
              update: {},
            });
          }

          if (notifyEmail) {
            await email.sendExamReminderEmail({
              to: exam.user.email,
              name: exam.user.name,
              courseLabel,
              examTitle: exam.title,
              startsAtLabel: `${localStart.dateStr} at ${timeStr}`,
              venue: exam.venue,
              examsUrl: `${clientUrl}/exams`,
            });
          }

          await prisma.exam.update({
            where: { id: exam.id },
            data: { reminderSentAt: now },
          });
          processed += 1;
        } catch (err) {
          logger.warn({ err, examId: exam.id }, 'Failed to process exam reminder');
        }
      }

      return processed;
    },

    async listRevisionPlans(userId) {
      const plans = await prisma.revisionPlan.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: planInclude,
      });
      return plans.map(toPublicPlan);
    },

    async generateRevisionPlan(userId, input, now = new Date()) {
      if (!llm.isConfigured()) {
        throw new AppError('AI_UNAVAILABLE', 'AI revision plan generation is not configured yet.');
      }

      const { dayDate } = utcDayBounds(now);
      if (dailyTokenLimit !== null) {
        const usageToday = await prisma.aiUsageDaily.findUnique({
          where: { userId_day: { userId, day: dayDate } },
          select: { inputTokens: true, outputTokens: true },
        });
        const total = (usageToday?.inputTokens ?? 0) + (usageToday?.outputTokens ?? 0);
        if (total >= dailyTokenLimit) {
          throw new AppError(
            'AI_BUDGET_EXCEEDED',
            'You have reached your daily AI usage budget. Try again tomorrow.',
          );
        }
      }

      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { timezone: true },
      });
      const tz = settings?.timezone ?? 'UTC';
      const todayStr = localDateTimeParts(now, tz).dateStr;

      const exams = await prisma.exam.findMany({
        where: {
          userId,
          ...(input.examIds && input.examIds.length > 0
            ? { id: { in: input.examIds } }
            : { startsAt: { gte: now } }),
          course: { archivedAt: null },
        },
        orderBy: { startsAt: 'asc' },
        take: 20,
        include: { course: { select: { id: true, name: true, code: true } } },
      });

      if (exams.length === 0) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Add at least one upcoming exam (or select exams) to generate a revision plan.',
        );
      }

      const examLocalDates = exams.map((e) => localDateTimeParts(e.startsAt, tz).dateStr);
      const latestExamDate = examLocalDates.reduce((a, b) => (a > b ? a : b), todayStr);

      const startDate = input.startDate ?? todayStr;
      let endDate =
        input.endDate ??
        (latestExamDate >= startDate ? latestExamDate : addDaysDateStr(startDate, 7));
      if (endDate < startDate) {
        throw new AppError('VALIDATION_ERROR', 'End date must be on or after start date.');
      }
      const maxEndDate = addDaysDateStr(startDate, 60);
      if (endDate > maxEndDate) endDate = maxEndDate;

      const validDates = computeAvailableStudyDates(startDate, endDate, input.daysOff);
      if (validDates.length === 0) {
        throw new AppError(
          'VALIDATION_ERROR',
          'All days in this range are marked as days off. Keep at least one study day.',
        );
      }

      const courseIds = Array.from(new Set(exams.map((e) => e.courseId)));

      const [notes, documents, docAttempts, quizAttempts] = await Promise.all([
        prisma.note.findMany({
          where: { userId, courseId: { in: courseIds } },
          orderBy: { updatedAt: 'desc' },
          take: 40,
          select: { courseId: true, title: true, aiSummary: true },
        }),
        prisma.document.findMany({
          where: { userId, courseId: { in: courseIds } },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { courseId: true, title: true, type: true },
        }),
        prisma.documentPracticeAttempt.findMany({
          where: {
            userId,
            set: { document: { courseId: { in: courseIds } } },
          },
          orderBy: { takenAt: 'desc' },
          take: 30,
          select: {
            weakTopicsJson: true,
            set: { select: { document: { select: { courseId: true } } } },
          },
        }),
        prisma.quizAttempt.findMany({
          where: {
            userId,
            quiz: { courseId: { in: courseIds } },
          },
          orderBy: { takenAt: 'desc' },
          take: 30,
          select: {
            score: true,
            total: true,
            quiz: { select: { courseId: true, topic: true, title: true } },
          },
        }),
      ]);

      const promptExams: PromptExamContext[] = [];
      const allWeakTopics = new Set<string>();

      for (const exam of exams) {
        const cNotes = notes
          .filter((n) => n.courseId === exam.courseId)
          .slice(0, 6)
          .map((n) => (n.aiSummary ? `${n.title} (${n.aiSummary.slice(0, 80)})` : n.title));

        const cDocs = documents
          .filter((d) => d.courseId === exam.courseId)
          .slice(0, 6)
          .map((d) => `${d.title} [${d.type}]`);

        const weakSet = new Set<string>();
        for (const att of docAttempts) {
          if (att.set.document.courseId !== exam.courseId) continue;
          for (const wt of parseStringArrayJson(att.weakTopicsJson)) {
            weakSet.add(wt);
            allWeakTopics.add(wt);
          }
        }
        for (const qa of quizAttempts) {
          if (qa.quiz.courseId !== exam.courseId) continue;
          const ratio = qa.total > 0 ? qa.score / qa.total : 1;
          if (ratio < 0.7) {
            const label = qa.quiz.topic?.trim() || qa.quiz.title;
            weakSet.add(`${label} (${Math.round(ratio * 100)}%)`);
            allWeakTopics.add(label);
          }
        }

        const courseLabel = exam.course.code
          ? `${exam.course.code} — ${exam.course.name}`
          : exam.course.name;

        promptExams.push({
          examId: exam.id,
          courseId: exam.courseId,
          courseLabel,
          title: exam.title,
          examType: exam.examType,
          localDate: localDateTimeParts(exam.startsAt, tz).dateStr,
          weightPercent: exam.weightPercent,
          topics: parseStringArrayJson(exam.topicsJson),
          notes: cNotes,
          documents: cDocs,
          weakTopics: Array.from(weakSet).slice(0, 12),
        });
      }

      const prompt = buildRevisionPlanPrompt({
        validDates,
        hoursPerDay: input.hoursPerDay,
        preferredTimes: input.preferredTimes,
        exams: promptExams,
        instructions: input.instructions,
      });

      const startedMs = Date.now();
      try {
        const { data, usage } = await generateJsonWithRetry(
          llm,
          prompt,
          REVISION_PLAN_SYSTEM_PROMPT,
          aiRevisionPlanOutputSchema,
          4000,
        );

        await Promise.all([
          prisma.aiUsageDaily.upsert({
            where: { userId_day: { userId, day: dayDate } },
            create: {
              userId,
              day: dayDate,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              requests: 1,
            },
            update: {
              inputTokens: { increment: usage.inputTokens },
              outputTokens: { increment: usage.outputTokens },
              requests: { increment: 1 },
            },
          }),
          recordUsageEvent(prisma, {
            userId,
            feature: 'revision_plan',
            model: llm.modelName,
            tokensIn: usage.inputTokens,
            tokensOut: usage.outputTokens,
            durationMs: Date.now() - startedMs,
            status: 'success',
            route: 'POST /revision-plans/generate',
          }),
        ]);

        const validDateSet = new Set(validDates.map((d) => d.dateStr));
        const examById = new Map(exams.map((e) => [e.id, e]));
        const courseIdsSet = new Set(courseIds);
        const firstExam = exams[0]!;

        const normalizedSessions: DraftRevisionSession[] = data.sessions
          .map((s) => {
            const matchedExam =
              (s.examId ? examById.get(s.examId) : undefined) ??
              (s.courseId ? exams.find((e) => e.courseId === s.courseId) : undefined) ??
              firstExam;

            const safeExamId = matchedExam?.id ?? null;
            const safeCourseId =
              s.courseId && courseIdsSet.has(s.courseId)
                ? s.courseId
                : (matchedExam?.courseId ?? null);

            let safeDate = s.scheduledDate;
            if (!validDateSet.has(safeDate)) {
              const fallback =
                validDates.find((d) => d.dateStr >= safeDate)?.dateStr ??
                validDates[validDates.length - 1]!.dateStr;
              safeDate = fallback;
            }

            return {
              scheduledDate: safeDate,
              startTime: s.startTime,
              durationMinutes: s.durationMinutes,
              courseId: safeCourseId,
              examId: safeExamId,
              topic: s.topic,
              notes: s.notes ?? null,
            };
          })
          .sort(
            (a, b) =>
              a.scheduledDate.localeCompare(b.scheduledDate) ||
              a.startTime.localeCompare(b.startTime),
          );

        return {
          draft: {
            title: input.title ?? data.title,
            startDate,
            endDate,
            hoursPerDay: input.hoursPerDay,
            daysOff: input.daysOff,
            preferredTimes: input.preferredTimes,
            sessions: normalizedSessions,
          },
          contextSummary: {
            examCount: exams.length,
            noteCount: notes.length,
            documentCount: documents.length,
            weakTopics: Array.from(allWeakTopics).slice(0, 12),
          },
        };
      } catch (err) {
        await recordUsageEvent(prisma, {
          userId,
          feature: 'revision_plan',
          model: llm.modelName,
          tokensIn: 0,
          tokensOut: 0,
          durationMs: Date.now() - startedMs,
          status: 'error',
          errorCode: err instanceof AppError ? err.code : 'AI_PROVIDER_ERROR',
          route: 'POST /revision-plans/generate',
        });
        throw err;
      }
    },

    async saveRevisionPlan(userId, input) {
      const uniqueCourseIds = Array.from(
        new Set(input.sessions.map((s) => s.courseId).filter((id): id is string => Boolean(id))),
      );
      const uniqueExamIds = Array.from(
        new Set(input.sessions.map((s) => s.examId).filter((id): id is string => Boolean(id))),
      );

      const [settings, ownedCourses, ownedExams] = await Promise.all([
        prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } }),
        uniqueCourseIds.length > 0
          ? prisma.course.findMany({
              where: { userId, id: { in: uniqueCourseIds } },
              select: { id: true, name: true, code: true },
            })
          : Promise.resolve([]),
        uniqueExamIds.length > 0
          ? prisma.exam.findMany({
              where: { userId, id: { in: uniqueExamIds } },
              select: { id: true, courseId: true },
            })
          : Promise.resolve([]),
      ]);

      if (ownedCourses.length !== uniqueCourseIds.length) {
        throw new AppError('NOT_FOUND', 'Course not found');
      }
      if (ownedExams.length !== uniqueExamIds.length) {
        throw new AppError('NOT_FOUND', 'Exam not found');
      }

      const tz = settings?.timezone ?? 'UTC';
      const courseMap = new Map(ownedCourses.map((c) => [c.id, c]));
      const examCourseMap = new Map(ownedExams.map((e) => [e.id, e.courseId]));

      const createdPlanId = await prisma.$transaction(async (tx) => {
        const plan = await tx.revisionPlan.create({
          data: {
            userId,
            title: input.title,
            startDate: new Date(`${input.startDate}T00:00:00.000Z`),
            endDate: new Date(`${input.endDate}T00:00:00.000Z`),
            hoursPerDay: input.hoursPerDay,
            daysOffJson: input.daysOff as Prisma.InputJsonValue,
            preferredTimesJson: input.preferredTimes as Prisma.InputJsonValue,
          },
        });

        for (let idx = 0; idx < input.sessions.length; idx++) {
          const s = input.sessions[idx]!;
          const resolvedCourseId =
            s.courseId ?? (s.examId ? (examCourseMap.get(s.examId) ?? null) : null);
          const courseObj = resolvedCourseId ? courseMap.get(resolvedCourseId) : undefined;
          const coursePrefix = courseObj ? (courseObj.code ?? courseObj.name) : null;
          const dueAt = localDateTimeToUtc(s.scheduledDate, s.startTime, tz);
          const isCompleted = s.status === 'completed';

          const task = await tx.task.create({
            data: {
              userId,
              courseId: resolvedCourseId,
              title: buildPlannerTaskTitle(coursePrefix, s.topic),
              description: s.notes
                ? `Revision plan (${input.title}): ${s.notes}`
                : `Revision plan (${input.title}) · ${s.durationMinutes} min`,
              dueAt,
              priority: 'medium',
              status: isCompleted ? 'done' : 'todo',
              completedAt: isCompleted ? new Date() : null,
              reminderOffsetMinutes: 60,
              remindAt: computeRemindAt(dueAt, 60),
            },
          });

          await tx.revisionSession.create({
            data: {
              planId: plan.id,
              userId,
              examId: s.examId ?? null,
              courseId: resolvedCourseId,
              taskId: task.id,
              scheduledDate: new Date(`${s.scheduledDate}T00:00:00.000Z`),
              startTime: s.startTime,
              durationMinutes: s.durationMinutes,
              topic: s.topic,
              notes: s.notes ?? null,
              status: s.status ?? 'planned',
              position: idx,
            },
          });
        }

        return plan.id;
      });

      return loadHydratedPlan(userId, createdPlanId);
    },

    async updateRevisionSession(userId, planId, sessionId, input) {
      const existing = await prisma.revisionSession.findFirst({
        where: { id: sessionId, planId, userId },
        include: {
          plan: { select: { title: true } },
          course: { select: { name: true, code: true } },
        },
      });
      if (!existing) throw new AppError('NOT_FOUND', 'Revision session not found');

      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { timezone: true },
      });
      const tz = settings?.timezone ?? 'UTC';

      const nextDateStr = input.scheduledDate ?? dateOnlyString(existing.scheduledDate);
      const nextTimeStr = input.startTime ?? existing.startTime;
      const nextTopic = input.topic ?? existing.topic;
      const nextNotes = input.notes !== undefined ? input.notes : existing.notes;
      const nextStatus = input.status ?? existing.status;
      const nextDuration = input.durationMinutes ?? existing.durationMinutes;

      const scheduleChanged = input.scheduledDate !== undefined || input.startTime !== undefined;
      const nextDueAt = localDateTimeToUtc(nextDateStr, nextTimeStr, tz);

      await prisma.$transaction(async (tx) => {
        await tx.revisionSession.update({
          where: { id: sessionId },
          data: {
            scheduledDate: new Date(`${nextDateStr}T00:00:00.000Z`),
            startTime: nextTimeStr,
            durationMinutes: nextDuration,
            topic: nextTopic,
            notes: nextNotes,
            status: nextStatus,
          },
        });

        if (existing.taskId) {
          const courseLabel = existing.course
            ? (existing.course.code ?? existing.course.name)
            : null;
          await tx.task.update({
            where: { id: existing.taskId },
            data: {
              title: buildPlannerTaskTitle(courseLabel, nextTopic),
              description: nextNotes
                ? `Revision plan (${existing.plan.title}): ${nextNotes}`
                : `Revision plan (${existing.plan.title}) · ${nextDuration} min`,
              status: nextStatus === 'completed' ? 'done' : 'todo',
              completedAt:
                nextStatus === 'completed'
                  ? existing.status === 'completed'
                    ? undefined
                    : new Date()
                  : null,
              ...(scheduleChanged
                ? {
                    dueAt: nextDueAt,
                    remindAt: computeRemindAt(nextDueAt, 60),
                    reminderSentAt: null,
                  }
                : {}),
            },
          });
        }
      });

      return loadHydratedPlan(userId, planId);
    },

    async rescheduleMissedSessions(userId, planId, now = new Date()) {
      const plan = await prisma.revisionPlan.findFirst({
        where: { id: planId, userId },
        include: planInclude,
      });
      if (!plan) throw new AppError('NOT_FOUND', 'Revision plan not found');

      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { timezone: true },
      });
      const tz = settings?.timezone ?? 'UTC';
      const todayStr = localDateTimeParts(now, tz).dateStr;

      const missed = plan.sessions.filter((s) => {
        const effectiveStatus = s.task?.status === 'done' ? 'completed' : s.status;
        if (effectiveStatus === 'completed') return false;
        return effectiveStatus === 'missed' || dateOnlyString(s.scheduledDate) < todayStr;
      });

      if (missed.length === 0) {
        return { plan: toPublicPlan(plan), rescheduledCount: 0 };
      }

      const daysOff = parseNumberArrayJson(plan.daysOffJson);
      const planEndStr = dateOnlyString(plan.endDate);
      const windowEnd =
        planEndStr > addDaysDateStr(todayStr, 14) ? planEndStr : addDaysDateStr(todayStr, 14);
      let candidateDates = computeAvailableStudyDates(todayStr, windowEnd, daysOff);
      if (candidateDates.length === 0) {
        candidateDates = computeAvailableStudyDates(todayStr, addDaysDateStr(todayStr, 14), []);
      }

      const minutesPerDayBudget = Math.max(45, Math.round(plan.hoursPerDay * 60));
      const usedByDate = new Map<string, number>();
      for (const s of plan.sessions) {
        if (missed.some((m) => m.id === s.id)) continue;
        const dStr = dateOnlyString(s.scheduledDate);
        if (dStr >= todayStr) {
          usedByDate.set(dStr, (usedByDate.get(dStr) ?? 0) + s.durationMinutes);
        }
      }

      const assignments: Array<{ session: SessionWithRelations; newDate: string }> = [];
      for (const s of missed) {
        const examLimitDate = s.exam ? localDateTimeParts(s.exam.startsAt, tz).dateStr : null;
        const beforeExamPool = examLimitDate
          ? candidateDates.filter((d) => d.dateStr <= examLimitDate)
          : candidateDates;
        const pool = beforeExamPool.length > 0 ? beforeExamPool : candidateDates;

        const bestUnderBudget = pool.find(
          (d) => (usedByDate.get(d.dateStr) ?? 0) + s.durationMinutes <= minutesPerDayBudget,
        );
        const lightestDay = pool.reduce(
          (minD, d) =>
            (usedByDate.get(d.dateStr) ?? 0) < (usedByDate.get(minD.dateStr) ?? 0) ? d : minD,
          pool[0]!,
        );

        const chosen = (bestUnderBudget ?? lightestDay).dateStr;
        usedByDate.set(chosen, (usedByDate.get(chosen) ?? 0) + s.durationMinutes);
        assignments.push({ session: s, newDate: chosen });
      }

      await prisma.$transaction(async (tx) => {
        for (const { session, newDate } of assignments) {
          await tx.revisionSession.update({
            where: { id: session.id },
            data: {
              scheduledDate: new Date(`${newDate}T00:00:00.000Z`),
              status: 'planned',
            },
          });

          if (session.taskId) {
            const dueAt = localDateTimeToUtc(newDate, session.startTime, tz);
            await tx.task.update({
              where: { id: session.taskId },
              data: {
                dueAt,
                remindAt: computeRemindAt(dueAt, 60),
                reminderSentAt: null,
                status: 'todo',
                completedAt: null,
              },
            });
          }
        }
      });

      const refreshed = await loadHydratedPlan(userId, planId);
      return { plan: refreshed, rescheduledCount: assignments.length };
    },

    async deleteRevisionPlan(userId, planId) {
      const plan = await prisma.revisionPlan.findFirst({
        where: { id: planId, userId },
        include: { sessions: { select: { taskId: true } } },
      });
      if (!plan) throw new AppError('NOT_FOUND', 'Revision plan not found');

      const taskIds = plan.sessions.map((s) => s.taskId).filter((id): id is string => Boolean(id));

      await prisma.$transaction(async (tx) => {
        await tx.revisionPlan.delete({ where: { id: planId } });
        if (taskIds.length > 0) {
          await tx.task.deleteMany({ where: { userId, id: { in: taskIds } } });
        }
      });
    },
  };
}
