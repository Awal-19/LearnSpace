import type { Notification, PrismaClient, Task } from '@prisma/client';
import type { Logger } from 'pino';
import type { EmailService } from '../../lib/email';
import { AppError } from '../../lib/errors';
import { localDateString } from '../users/stats';
import type {
  CreateTaskInput,
  ListNotificationsQuery,
  ListTasksQuery,
  UpdateTaskInput,
} from './planner.schemas';

export interface PublicTask {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  dueAt: Date | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'done';
  completedAt: Date | null;
  reminderOffsetMinutes: number | null;
  createdAt: Date;
}

export interface PublicNotification {
  id: string;
  type: 'task_reminder' | 'system';
  title: string;
  body: string;
  taskId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

function toPublicTask(t: Task): PublicTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    courseId: t.courseId,
    dueAt: t.dueAt,
    priority: t.priority,
    status: t.status,
    completedAt: t.completedAt,
    reminderOffsetMinutes: t.reminderOffsetMinutes,
    createdAt: t.createdAt,
  };
}

function toPublicNotification(n: Notification): PublicNotification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    taskId: n.taskId,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

export function computeRemindAt(dueAt: Date | null, offsetMinutes: number | null): Date | null {
  if (!dueAt || offsetMinutes === null) return null;
  return new Date(dueAt.getTime() - offsetMinutes * 60_000);
}

/**
 * Returns [startOfTodayUtc, endOfTodayUtc] for a given IANA timezone by finding the
 * UTC instants matching localDateString(now, tz).
 */
export function localDayRange(now: Date, timeZone: string): { start: Date; end: Date; todayStr: string } {
  const todayStr = localDateString(now, timeZone);
  // Step in 30-min increments across +/-24h around now to find exact local day boundaries without extra deps.
  const windowStart = new Date(now.getTime() - 26 * 3600_000);
  let start = new Date(now.getTime() - 12 * 3600_000);
  let end = new Date(now.getTime() + 12 * 3600_000);
  let foundStart = false;

  for (let ms = windowStart.getTime(); ms <= now.getTime() + 26 * 3600_000; ms += 15 * 60_000) {
    const dt = new Date(ms);
    const local = localDateString(dt, timeZone);
    if (local === todayStr && !foundStart) {
      start = dt;
      foundStart = true;
    } else if (foundStart && local !== todayStr) {
      end = new Date(ms - 1);
      break;
    }
  }

  return { start, end, todayStr };
}

export interface PlannerServiceDeps {
  prisma: PrismaClient;
  email: EmailService;
  logger: Logger;
  clientUrl: string;
}

export interface PlannerService {
  listTasks(
    userId: string,
    query: ListTasksQuery,
    now?: Date,
  ): Promise<{ items: PublicTask[]; nextCursor: string | null }>;
  createTask(userId: string, input: CreateTaskInput): Promise<PublicTask>;
  updateTask(userId: string, taskId: string, input: UpdateTaskInput): Promise<PublicTask>;
  deleteTask(userId: string, taskId: string): Promise<void>;

  listNotifications(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<{ items: PublicNotification[]; nextCursor: string | null; unreadCount: number }>;
  markNotificationRead(userId: string, notificationId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  processDueReminders(now?: Date): Promise<number>;
}

export function createPlannerService({
  prisma,
  email,
  logger,
  clientUrl,
}: PlannerServiceDeps): PlannerService {
  async function assertTaskOwned(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new AppError('NOT_FOUND', 'Task not found');
    return task;
  }

  return {
    async listTasks(userId, query, now = new Date()) {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { timezone: true },
      });
      const tz = settings?.timezone ?? 'UTC';
      const { start: todayStart, end: todayEnd } = localDayRange(now, tz);

      const courseFilter = query.courseId ? { courseId: query.courseId } : {};

      let viewFilter: Record<string, unknown> = {};
      if (query.view === 'today') {
        viewFilter = { status: 'todo', dueAt: { gte: todayStart, lte: todayEnd } };
      } else if (query.view === 'upcoming') {
        viewFilter = { status: 'todo', dueAt: { gt: todayEnd } };
      } else if (query.view === 'overdue') {
        viewFilter = { status: 'todo', dueAt: { lt: now } };
      } else if (query.view === 'done') {
        viewFilter = { status: 'done' };
      }

      const rows = await prisma.task.findMany({
        where: { userId, ...courseFilter, ...viewFilter },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > query.limit;
      const sliced = hasMore ? rows.slice(0, query.limit) : rows;
      return {
        items: sliced.map(toPublicTask),
        nextCursor: hasMore ? (sliced.at(-1)?.id ?? null) : null,
      };
    },

    async createTask(userId, input) {
      if (input.courseId) {
        const course = await prisma.course.findFirst({ where: { id: input.courseId, userId } });
        if (!course) throw new AppError('NOT_FOUND', 'Course not found');
      }
      const dueAt = input.dueAt ? new Date(input.dueAt) : null;
      const remindAt = computeRemindAt(dueAt, input.reminderOffsetMinutes);

      const created = await prisma.task.create({
        data: {
          userId,
          courseId: input.courseId ?? null,
          title: input.title,
          description: input.description ?? null,
          dueAt,
          priority: input.priority,
          reminderOffsetMinutes: input.reminderOffsetMinutes,
          remindAt,
        },
      });
      return toPublicTask(created);
    },

    async updateTask(userId, taskId, input) {
      const existing = await assertTaskOwned(userId, taskId);
      if (input.courseId) {
        const course = await prisma.course.findFirst({ where: { id: input.courseId, userId } });
        if (!course) throw new AppError('NOT_FOUND', 'Course not found');
      }

      const nextDueAt =
        input.dueAt !== undefined ? (input.dueAt ? new Date(input.dueAt) : null) : existing.dueAt;
      const nextOffset =
        input.reminderOffsetMinutes !== undefined
          ? input.reminderOffsetMinutes
          : existing.reminderOffsetMinutes;

      if (nextOffset !== null && !nextDueAt) {
        throw new AppError('VALIDATION_ERROR', 'A due date is required to set a reminder');
      }

      const scheduleChanged =
        input.dueAt !== undefined || input.reminderOffsetMinutes !== undefined;
      const nextRemindAt = scheduleChanged
        ? computeRemindAt(nextDueAt, nextOffset)
        : existing.remindAt;

      let completedAt = existing.completedAt;
      if (input.status === 'done' && existing.status !== 'done') {
        completedAt = new Date();
      } else if (input.status === 'todo') {
        completedAt = null;
      }

      const updated = await prisma.task.update({
        where: { id: taskId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.status !== undefined ? { status: input.status, completedAt } : {}),
          dueAt: nextDueAt,
          reminderOffsetMinutes: nextOffset,
          remindAt: nextRemindAt,
          ...(scheduleChanged ? { reminderSentAt: null } : {}),
        },
      });

      return toPublicTask(updated);
    },

    async deleteTask(userId, taskId) {
      await assertTaskOwned(userId, taskId);
      await prisma.task.delete({ where: { id: taskId } });
    },

    async listNotifications(userId, query) {
      const [rows, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where: {
            userId,
            ...(query.unread ? { readAt: null } : {}),
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: query.limit + 1,
          ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        }),
        prisma.notification.count({ where: { userId, readAt: null } }),
      ]);

      const hasMore = rows.length > query.limit;
      const sliced = hasMore ? rows.slice(0, query.limit) : rows;
      return {
        items: sliced.map(toPublicNotification),
        nextCursor: hasMore ? (sliced.at(-1)?.id ?? null) : null,
        unreadCount,
      };
    },

    async markNotificationRead(userId, notificationId) {
      const res = await prisma.notification.updateMany({
        where: { id: notificationId, userId, readAt: null },
        data: { readAt: new Date() },
      });
      if (res.count === 0) {
        const exists = await prisma.notification.findFirst({
          where: { id: notificationId, userId },
          select: { id: true },
        });
        if (!exists) throw new AppError('NOT_FOUND', 'Notification not found');
      }
    },

    async markAllNotificationsRead(userId) {
      await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
    },

    async processDueReminders(now = new Date()) {
      const dueTasks = await prisma.task.findMany({
        where: {
          status: 'todo',
          remindAt: { lte: now },
          reminderSentAt: null,
        },
        include: {
          user: {
            select: {
              email: true,
              name: true,
              emailVerified: true,
              settings: { select: { notifyInApp: true, notifyEmailReminders: true } },
            },
          },
        },
        take: 100,
      });

      let processed = 0;
      for (const task of dueTasks) {
        try {
          if (task.user.settings?.notifyInApp !== false) {
            await prisma.notification.upsert({
              where: {
                taskId_type_dueAtSnapshot: {
                  taskId: task.id,
                  type: 'task_reminder',
                  dueAtSnapshot: task.dueAt ?? now,
                },
              },
              create: {
                userId: task.userId,
                type: 'task_reminder',
                title: `Reminder: ${task.title}`,
                body: task.dueAt
                  ? `Due at ${task.dueAt.toISOString()}`
                  : 'Task reminder',
                taskId: task.id,
                dueAtSnapshot: task.dueAt ?? now,
              },
              update: {},
            });
          }

          if (task.user.emailVerified && task.user.settings?.notifyEmailReminders) {
            await email.sendTaskReminderEmail(
              task.user.email,
              task.user.name,
              task.title,
              `${clientUrl}/planner`,
            );
          }

          await prisma.task.update({
            where: { id: task.id },
            data: { reminderSentAt: now },
          });
          processed += 1;
        } catch (err) {
          logger.warn({ err, taskId: task.id }, 'Failed to process task reminder');
        }
      }
      return processed;
    },
  };
}

