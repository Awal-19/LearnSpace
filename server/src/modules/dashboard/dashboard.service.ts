import type { ExamType, PrismaClient, TimetableEntryType } from '@prisma/client';
import { Router } from 'express';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/validate';
import { parseStringArrayJson } from '../exams/exams.service';
import { localDayRange } from '../planner/planner.service';
import { DAY_LABELS, localDateTimeParts } from '../timetable/timetable.service';
import { getUserStats } from '../users/stats';

export interface DashboardExamItem {
  id: string;
  courseId: string;
  courseName: string;
  courseCode: string | null;
  courseColor: string | null;
  title: string;
  examType: ExamType;
  startsAt: Date;
  durationMinutes: number | null;
  venue: string | null;
  weightPercent: number | null;
  topics: string[];
}

export interface DashboardClassSlot {
  id: string;
  courseId: string;
  courseName: string;
  courseCode: string | null;
  courseColor: string | null;
  lecturer: string | null;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  venue: string | null;
  type: TimetableEntryType;
}

export interface DashboardNextClass extends DashboardClassSlot {
  status: 'in_progress' | 'upcoming';
  startsInMinutes: number;
  endsInMinutes: number;
  dayOffset: number;
  dayLabel: string;
}

export interface DashboardData {
  greetingName: string;
  timezone: string;
  todayTasks: Array<{
    id: string;
    title: string;
    dueAt: Date | null;
    priority: 'low' | 'medium' | 'high';
    status: 'todo' | 'done';
    courseId: string | null;
  }>;
  overdueCount: number;
  upcoming: Array<{
    id: string;
    title: string;
    dueAt: Date | null;
    priority: 'low' | 'medium' | 'high';
    status: 'todo' | 'done';
    courseId: string | null;
  }>;
  todayClasses: DashboardClassSlot[];
  nextClass: DashboardNextClass | null;
  upcomingExams: DashboardExamItem[];
  nextExam: DashboardExamItem | null;
  dueFlashcardsCount: number;
  todayStudyHours: number;
  todayTasksDoneCount: number;
  stats: {
    streakDays: number;
    hoursLast7Days: number;
  };
  recentConversations: Array<{
    id: string;
    title: string;
    updatedAt: Date;
  }>;
  unreadNotifications: number;
}

export function computeNextClassAndToday(
  entries: DashboardClassSlot[],
  timeZone: string,
  now: Date = new Date(),
): { todayClasses: DashboardClassSlot[]; nextClass: DashboardNextClass | null } {
  const local = localDateTimeParts(now, timeZone);
  const sorted = [...entries].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
  );
  const todayClasses = sorted.filter((e) => e.dayOfWeek === local.weekday);

  let nextClass: DashboardNextClass | null = null;
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const targetDay = (local.weekday + dayOffset) % 7;
    const dayLabel =
      dayOffset === 0
        ? 'Today'
        : dayOffset === 1
          ? 'Tomorrow'
          : dayOffset === 7
            ? `Next ${DAY_LABELS[targetDay]!}`
            : DAY_LABELS[targetDay]!;
    const candidates = sorted.filter((e) => e.dayOfWeek === targetDay);

    for (const c of candidates) {
      if (dayOffset === 0 && c.endMinute <= local.minuteOfDay) {
        continue;
      }
      const inProgress = dayOffset === 0 && c.startMinute <= local.minuteOfDay;
      const startsInMinutes = inProgress ? 0 : dayOffset * 1440 - local.minuteOfDay + c.startMinute;
      const endsInMinutes = dayOffset * 1440 - local.minuteOfDay + c.endMinute;
      nextClass = {
        ...c,
        status: inProgress ? 'in_progress' : 'upcoming',
        startsInMinutes,
        endsInMinutes: Math.max(0, endsInMinutes),
        dayOffset,
        dayLabel,
      };
      break;
    }
    if (nextClass) break;
  }

  return { todayClasses, nextClass };
}

export async function getDashboard(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<DashboardData> {
  const [user, settings, stats, recentConversations, unreadNotifications, timetableRows, examRows] =
    await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } }),
      getUserStats(prisma, userId, now),
      prisma.conversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        select: { id: true, title: true, updatedAt: true },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
      prisma.timetableEntry
        ? prisma.timetableEntry.findMany({
            where: { userId, course: { archivedAt: null } },
            orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
            select: {
              id: true,
              courseId: true,
              dayOfWeek: true,
              startMinute: true,
              endMinute: true,
              venue: true,
              type: true,
              course: { select: { name: true, code: true, color: true, lecturer: true } },
            },
          })
        : Promise.resolve([]),
      prisma.exam
        ? prisma.exam.findMany({
            where: { userId, startsAt: { gte: now }, course: { archivedAt: null } },
            orderBy: { startsAt: 'asc' },
            take: 4,
            select: {
              id: true,
              courseId: true,
              title: true,
              examType: true,
              startsAt: true,
              durationMinutes: true,
              venue: true,
              weightPercent: true,
              topicsJson: true,
              course: { select: { name: true, code: true, color: true } },
            },
          })
        : Promise.resolve([]),
    ]);

  if (!user) throw new AppError('UNAUTHENTICATED');

  const tz = settings?.timezone ?? 'UTC';
  const { start: todayStart, end: todayEnd } = localDayRange(now, tz);

  const [todayTasks, overdueCount, upcoming, dueFlashcardsCount, todaySessions, todayDoneCount] =
    await Promise.all([
      prisma.task.findMany({
        where: { userId, status: 'todo', dueAt: { gte: todayStart, lte: todayEnd } },
        orderBy: { dueAt: 'asc' },
        take: 8,
        select: {
          id: true,
          title: true,
          dueAt: true,
          priority: true,
          status: true,
          courseId: true,
        },
      }),
      prisma.task.count({
        where: { userId, status: 'todo', dueAt: { lt: now } },
      }),
      prisma.task.findMany({
        where: { userId, status: 'todo', dueAt: { gt: todayEnd } },
        orderBy: { dueAt: 'asc' },
        take: 5,
        select: {
          id: true,
          title: true,
          dueAt: true,
          priority: true,
          status: true,
          courseId: true,
        },
      }),
      prisma.card?.count
        ? prisma.card.count({
            where: { dueAt: { lte: now }, deck: { userId } },
          })
        : Promise.resolve(0),
      prisma.studySession?.findMany
        ? prisma.studySession.findMany({
            where: { userId, startedAt: { gte: todayStart, lte: todayEnd } },
            select: { durationSeconds: true },
          })
        : Promise.resolve([]),
      prisma.task?.count
        ? prisma.task.count({
            where: { userId, status: 'done', completedAt: { gte: todayStart, lte: todayEnd } },
          })
        : Promise.resolve(0),
    ]);

  const todayStudySeconds = todaySessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  const todayStudyHours = Math.round((todayStudySeconds / 3600) * 100) / 100;

  const classSlots: DashboardClassSlot[] = timetableRows.map((row) => ({
    id: row.id,
    courseId: row.courseId,
    courseName: row.course.name,
    courseCode: row.course.code,
    courseColor: row.course.color,
    lecturer: row.course.lecturer,
    dayOfWeek: row.dayOfWeek,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    venue: row.venue,
    type: row.type,
  }));
  const { todayClasses, nextClass } = computeNextClassAndToday(classSlots, tz, now);

  const upcomingExams: DashboardExamItem[] = examRows.map((ex) => ({
    id: ex.id,
    courseId: ex.courseId,
    courseName: ex.course.name,
    courseCode: ex.course.code,
    courseColor: ex.course.color,
    title: ex.title,
    examType: ex.examType,
    startsAt: ex.startsAt,
    durationMinutes: ex.durationMinutes,
    venue: ex.venue,
    weightPercent: ex.weightPercent,
    topics: parseStringArrayJson(ex.topicsJson),
  }));

  const greetingName = user.name.trim().split(/\s+/)[0] || user.name;

  return {
    greetingName,
    timezone: tz,
    todayTasks,
    overdueCount,
    upcoming,
    todayClasses,
    nextClass,
    upcomingExams,
    nextExam: upcomingExams[0] ?? null,
    dueFlashcardsCount,
    todayStudyHours,
    todayTasksDoneCount: todayDoneCount,
    stats: {
      streakDays: stats.streakDays,
      hoursLast7Days: stats.hoursLast7Days,
    },
    recentConversations,
    unreadNotifications,
  };
}

export function dashboardRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);

  router.get(
    '/dashboard',
    auth,
    asyncHandler(async (req, res) => {
      res.json(await getDashboard(prisma, req.user!.id));
    }),
  );

  return router;
}
