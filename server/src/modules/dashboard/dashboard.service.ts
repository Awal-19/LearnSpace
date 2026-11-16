import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/validate';
import { localDayRange } from '../planner/planner.service';
import { getUserStats } from '../users/stats';

export interface DashboardData {
  greetingName: string;
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

export async function getDashboard(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<DashboardData> {
  const [user, settings, stats, recentConversations, unreadNotifications] = await Promise.all([
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
  ]);

  if (!user) throw new AppError('UNAUTHENTICATED');

  const tz = settings?.timezone ?? 'UTC';
  const { start: todayStart, end: todayEnd } = localDayRange(now, tz);

  const [todayTasks, overdueCount, upcoming] = await Promise.all([
    prisma.task.findMany({
      where: { userId, status: 'todo', dueAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { dueAt: 'asc' },
      take: 8,
      select: { id: true, title: true, dueAt: true, priority: true, status: true, courseId: true },
    }),
    prisma.task.count({
      where: { userId, status: 'todo', dueAt: { lt: now } },
    }),
    prisma.task.findMany({
      where: { userId, status: 'todo', dueAt: { gt: todayEnd } },
      orderBy: { dueAt: 'asc' },
      take: 5,
      select: { id: true, title: true, dueAt: true, priority: true, status: true, courseId: true },
    }),
  ]);

  const greetingName = user.name.trim().split(/\s+/)[0] || user.name;

  return {
    greetingName,
    todayTasks,
    overdueCount,
    upcoming,
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

