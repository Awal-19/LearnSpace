import type { PrismaClient, TimetableEntry, TimetableEntryType } from '@prisma/client';
import type { Logger } from 'pino';
import type { EmailService } from '../../lib/email';
import { AppError } from '../../lib/errors';
import type { CreateTimetableInput, UpdateTimetableInput } from './timetable.schemas';

export const DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface PublicTimetableCourse {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  lecturer: string | null;
  archivedAt: Date | null;
}

export interface PublicTimetableEntry {
  id: string;
  courseId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  venue: string | null;
  type: TimetableEntryType;
  reminderEnabled: boolean;
  reminderMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
  course: PublicTimetableCourse;
}

export interface TimetableListResponse {
  entries: PublicTimetableEntry[];
  timezone: string;
  defaultReminderMinutes: number;
}

export function formatMinuteOfDay(minute: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(minute)));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function localDateTimeParts(
  date: Date,
  timeZone: string,
): { weekday: number; minuteOfDay: number; dateStr: string } {
  const formatWithTz = (tz: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatWithTz(timeZone);
  } catch {
    parts = formatWithTz('UTC');
  }

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const weekdayStr = get('weekday');
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(get('minute'));

  return {
    weekday: WEEKDAY_MAP[weekdayStr] ?? date.getUTCDay(),
    minuteOfDay: hour * 60 + minute,
    dateStr: `${year}-${month}-${day}`,
  };
}

function addDaysDateStr(dateStr: string, delta: number): string {
  const [y = 1970, m = 1, d = 1] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function capitalize(word: string): string {
  return word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

type EntryWithCourse = TimetableEntry & {
  course: PublicTimetableCourse;
};

function toPublicEntry(row: EntryWithCourse): PublicTimetableEntry {
  return {
    id: row.id,
    courseId: row.courseId,
    dayOfWeek: row.dayOfWeek,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    venue: row.venue,
    type: row.type,
    reminderEnabled: row.reminderEnabled,
    reminderMinutes: row.reminderMinutes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    course: row.course,
  };
}

export interface TimetableServiceDeps {
  prisma: PrismaClient;
  email: EmailService;
  logger: Logger;
  clientUrl: string;
}

export interface TimetableService {
  listEntries(userId: string): Promise<TimetableListResponse>;
  createEntry(userId: string, input: CreateTimetableInput): Promise<PublicTimetableEntry>;
  updateEntry(
    userId: string,
    entryId: string,
    input: UpdateTimetableInput,
  ): Promise<PublicTimetableEntry>;
  deleteEntry(userId: string, entryId: string): Promise<void>;
  processDueClassReminders(now?: Date): Promise<number>;
}

const courseSelect = {
  id: true,
  name: true,
  code: true,
  color: true,
  lecturer: true,
  archivedAt: true,
} as const;

export function createTimetableService({
  prisma,
  email,
  logger,
  clientUrl,
}: TimetableServiceDeps): TimetableService {
  async function assertCourseOwned(userId: string, courseId: string) {
    const course = await prisma.course.findFirst({
      where: { id: courseId, userId },
      select: { id: true },
    });
    if (!course) throw new AppError('NOT_FOUND', 'Course not found');
  }

  async function assertNoClash(
    userId: string,
    dayOfWeek: number,
    startMinute: number,
    endMinute: number,
    excludeId?: string,
  ) {
    const sameDay = await prisma.timetableEntry.findMany({
      where: {
        userId,
        dayOfWeek,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      include: { course: { select: { id: true, name: true, code: true } } },
    });

    const clashes = sameDay.filter((item) =>
      rangesOverlap(startMinute, endMinute, item.startMinute, item.endMinute),
    );
    if (clashes.length === 0) return;

    const first = clashes[0]!;
    const label = first.course.code
      ? `${first.course.code} (${first.course.name})`
      : first.course.name;
    throw new AppError(
      'CONFLICT',
      `Class overlaps with ${label} (${formatMinuteOfDay(first.startMinute)}–${formatMinuteOfDay(first.endMinute)}) on ${DAY_LABELS[dayOfWeek] ?? 'that day'}`,
      {
        clashes: clashes.map((c) => ({
          id: c.id,
          courseId: c.courseId,
          courseName: c.course.name,
          courseCode: c.course.code,
          dayOfWeek: c.dayOfWeek,
          startMinute: c.startMinute,
          endMinute: c.endMinute,
          venue: c.venue,
          type: c.type,
        })),
      },
    );
  }

  return {
    async listEntries(userId) {
      const [rows, settings] = await Promise.all([
        prisma.timetableEntry.findMany({
          where: { userId },
          orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
          include: { course: { select: courseSelect } },
        }),
        prisma.userSettings.findUnique({
          where: { userId },
          select: { timezone: true, classReminderMinutes: true },
        }),
      ]);

      return {
        entries: rows.map(toPublicEntry),
        timezone: settings?.timezone ?? 'UTC',
        defaultReminderMinutes: settings?.classReminderMinutes ?? 15,
      };
    },

    async createEntry(userId, input) {
      await assertCourseOwned(userId, input.courseId);
      await assertNoClash(userId, input.dayOfWeek, input.startMinute, input.endMinute);

      const created = await prisma.timetableEntry.create({
        data: {
          userId,
          courseId: input.courseId,
          dayOfWeek: input.dayOfWeek,
          startMinute: input.startMinute,
          endMinute: input.endMinute,
          venue: input.venue ?? null,
          type: input.type,
          reminderEnabled: input.reminderEnabled,
          reminderMinutes: input.reminderMinutes ?? null,
        },
        include: { course: { select: courseSelect } },
      });

      return toPublicEntry(created);
    },

    async updateEntry(userId, entryId, input) {
      const existing = await prisma.timetableEntry.findFirst({
        where: { id: entryId, userId },
      });
      if (!existing) throw new AppError('NOT_FOUND', 'Timetable entry not found');

      if (input.courseId !== undefined) {
        await assertCourseOwned(userId, input.courseId);
      }

      const nextDay = input.dayOfWeek ?? existing.dayOfWeek;
      const nextStart = input.startMinute ?? existing.startMinute;
      const nextEnd = input.endMinute ?? existing.endMinute;
      if (nextEnd <= nextStart) {
        throw new AppError('VALIDATION_ERROR', 'End time must be after start time');
      }

      await assertNoClash(userId, nextDay, nextStart, nextEnd, entryId);

      const scheduleOrReminderChanged =
        input.dayOfWeek !== undefined ||
        input.startMinute !== undefined ||
        input.endMinute !== undefined ||
        input.reminderEnabled !== undefined ||
        input.reminderMinutes !== undefined;

      const updated = await prisma.timetableEntry.update({
        where: { id: entryId },
        data: {
          ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
          ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
          ...(input.startMinute !== undefined ? { startMinute: input.startMinute } : {}),
          ...(input.endMinute !== undefined ? { endMinute: input.endMinute } : {}),
          ...(input.venue !== undefined ? { venue: input.venue } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.reminderEnabled !== undefined
            ? { reminderEnabled: input.reminderEnabled }
            : {}),
          ...(input.reminderMinutes !== undefined
            ? { reminderMinutes: input.reminderMinutes }
            : {}),
          ...(scheduleOrReminderChanged ? { lastReminderKey: null } : {}),
        },
        include: { course: { select: courseSelect } },
      });

      return toPublicEntry(updated);
    },

    async deleteEntry(userId, entryId) {
      const existing = await prisma.timetableEntry.findFirst({
        where: { id: entryId, userId },
        select: { id: true },
      });
      if (!existing) throw new AppError('NOT_FOUND', 'Timetable entry not found');
      await prisma.timetableEntry.delete({ where: { id: entryId } });
    },

    async processDueClassReminders(now = new Date()) {
      const entries = await prisma.timetableEntry.findMany({
        where: {
          reminderEnabled: true,
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
                  classReminderMinutes: true,
                },
              },
            },
          },
        },
      });

      const tzCache = new Map<
        string,
        { weekday: number; minuteOfDay: number; dateStr: string; tomorrowDateStr: string }
      >();

      let processed = 0;
      for (const entry of entries) {
        const settings = entry.user.settings;
        const notifyInApp = settings?.notifyInApp !== false;
        const notifyEmail = Boolean(entry.user.emailVerified && settings?.notifyEmailReminders);
        if (!notifyInApp && !notifyEmail) continue;

        const tz = settings?.timezone ?? 'UTC';
        let local = tzCache.get(tz);
        if (!local) {
          const today = localDateTimeParts(now, tz);
          local = { ...today, tomorrowDateStr: addDaysDateStr(today.dateStr, 1) };
          tzCache.set(tz, local);
        }

        const nextWeekday = (local.weekday + 1) % 7;
        let minutesUntilStart: number;
        let occurrenceDate: string;

        if (entry.dayOfWeek === local.weekday) {
          minutesUntilStart = entry.startMinute - local.minuteOfDay;
          occurrenceDate = local.dateStr;
        } else if (entry.dayOfWeek === nextWeekday) {
          minutesUntilStart = 1440 - local.minuteOfDay + entry.startMinute;
          occurrenceDate = local.tomorrowDateStr;
        } else {
          continue;
        }

        const leadMinutes = entry.reminderMinutes ?? settings?.classReminderMinutes ?? 15;
        const isDue =
          leadMinutes > 0
            ? minutesUntilStart > 0 && minutesUntilStart <= leadMinutes
            : minutesUntilStart <= 0 && minutesUntilStart >= -2;

        if (!isDue) continue;

        const shortKey = `${occurrenceDate}:${entry.startMinute}`;
        if (entry.lastReminderKey === shortKey) continue;

        const occurrenceKey = `${entry.id}:${shortKey}`;
        const courseLabel = entry.course.code
          ? `${entry.course.code} — ${entry.course.name}`
          : entry.course.name;
        const timeRange = `${formatMinuteOfDay(entry.startMinute)}–${formatMinuteOfDay(entry.endMinute)}`;
        const startsInLabel =
          minutesUntilStart <= 0 ? 'starting now' : `in ${minutesUntilStart} min`;

        try {
          if (notifyInApp) {
            await prisma.notification.upsert({
              where: {
                userId_type_occurrenceKey: {
                  userId: entry.userId,
                  type: 'class_reminder',
                  occurrenceKey,
                },
              },
              create: {
                userId: entry.userId,
                type: 'class_reminder',
                title: `Upcoming class: ${courseLabel}`,
                body: `${capitalize(entry.type)} at ${timeRange}${entry.venue ? ` · ${entry.venue}` : ''} (${startsInLabel})`,
                timetableEntryId: entry.id,
                occurrenceKey,
              },
              update: {},
            });
          }

          if (notifyEmail) {
            await email.sendClassReminderEmail({
              to: entry.user.email,
              name: entry.user.name,
              courseLabel,
              startsAtLabel: `${timeRange} (${startsInLabel})`,
              venue: entry.venue,
              timetableUrl: `${clientUrl}/timetable`,
            });
          }

          await prisma.timetableEntry.update({
            where: { id: entry.id },
            data: { lastReminderKey: shortKey },
          });
          processed += 1;
        } catch (err) {
          logger.warn({ err, timetableEntryId: entry.id }, 'Failed to process class reminder');
        }
      }

      return processed;
    },
  };
}
