import { randomUUID } from 'node:crypto';
import type { PrismaClient, TimetableEntryType } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { EmailService } from '../../src/lib/email';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
import {
  computeNextClassAndToday,
  type DashboardClassSlot,
} from '../../src/modules/dashboard/dashboard.service';
import { createPlannerService } from '../../src/modules/planner/planner.service';
import {
  createTimetableService,
  localDateTimeParts,
  rangesOverlap,
} from '../../src/modules/timetable/timetable.service';
import { testEnv } from '../helpers';

interface CourseRow {
  id: string;
  userId: string;
  name: string;
  code: string | null;
  color: string | null;
  lecturer: string | null;
  archivedAt: Date | null;
}

interface TimetableRow {
  id: string;
  userId: string;
  courseId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  venue: string | null;
  type: TimetableEntryType;
  reminderEnabled: boolean;
  reminderMinutes: number | null;
  lastReminderKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SettingsRow {
  userId: string;
  timezone: string;
  notifyInApp: boolean;
  notifyEmailReminders: boolean;
  classReminderMinutes: number;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

interface NotificationRow {
  id: string;
  userId: string;
  type: 'task_reminder' | 'class_reminder' | 'system';
  title: string;
  body: string;
  taskId: string | null;
  timetableEntryId: string | null;
  occurrenceKey: string | null;
  dueAtSnapshot: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

function makeFakeTimetablePrisma() {
  const users = new Map<string, UserRow>();
  const settings = new Map<string, SettingsRow>();
  const courses = new Map<string, CourseRow>();
  const entries = new Map<string, TimetableRow>();
  const notifications = new Map<string, NotificationRow>();

  const attachRelations = (row: TimetableRow) => {
    const course = courses.get(row.courseId)!;
    const user = users.get(row.userId) ?? {
      id: row.userId,
      email: 'student@uni.edu',
      name: 'Student',
      emailVerified: true,
    };
    return {
      ...row,
      course,
      user: {
        ...user,
        settings: settings.get(row.userId) ?? null,
      },
    };
  };

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.get(where.id) ?? null,
    },
    userSettings: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        settings.get(where.userId) ?? null,
    },
    course: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const c = courses.get(where.id);
        return c && c.userId === where.userId ? c : null;
      },
    },
    conversation: {
      findMany: async () => [],
    },
    task: {
      findMany: async () => [],
      count: async () => 0,
    },
    studySession: {
      findMany: async () => [],
    },
    quizAttempt: {
      findMany: async () => [],
    },
    note: {
      count: async () => 0,
    },
    timetableEntry: {
      findMany: async ({
        where,
      }: {
        where?: {
          userId?: string;
          dayOfWeek?: number;
          id?: { not?: string };
          reminderEnabled?: boolean;
          course?: { archivedAt: null };
        };
      }) => {
        const rows = Array.from(entries.values())
          .filter((e) => !where?.userId || e.userId === where.userId)
          .filter((e) => where?.dayOfWeek === undefined || e.dayOfWeek === where.dayOfWeek)
          .filter((e) => !where?.id?.not || e.id !== where.id.not)
          .filter(
            (e) =>
              where?.reminderEnabled === undefined || e.reminderEnabled === where.reminderEnabled,
          )
          .filter((e) => {
            if (!where?.course) return true;
            const c = courses.get(e.courseId);
            return c ? c.archivedAt === null : false;
          })
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);

        return rows.map(attachRelations);
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const row = entries.get(where.id);
        return row && row.userId === where.userId ? attachRelations(row) : null;
      },
      create: async ({
        data,
      }: {
        data: {
          userId: string;
          courseId: string;
          dayOfWeek: number;
          startMinute: number;
          endMinute: number;
          venue?: string | null;
          type?: TimetableEntryType;
          reminderEnabled?: boolean;
          reminderMinutes?: number | null;
        };
      }) => {
        const now = new Date();
        const row: TimetableRow = {
          id: randomUUID(),
          userId: data.userId,
          courseId: data.courseId,
          dayOfWeek: data.dayOfWeek,
          startMinute: data.startMinute,
          endMinute: data.endMinute,
          venue: data.venue ?? null,
          type: data.type ?? 'lecture',
          reminderEnabled: data.reminderEnabled ?? true,
          reminderMinutes: data.reminderMinutes ?? null,
          lastReminderKey: null,
          createdAt: now,
          updatedAt: now,
        };
        entries.set(row.id, row);
        return attachRelations(row);
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<TimetableRow> }) => {
        const existing = entries.get(where.id)!;
        Object.assign(existing, data, { updatedAt: new Date() });
        return attachRelations(existing);
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const existing = entries.get(where.id);
        entries.delete(where.id);
        return existing;
      },
    },
    notification: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        Array.from(notifications.values())
          .filter((n) => n.userId === where.userId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      count: async ({ where }: { where: { userId: string; readAt: null } }) =>
        Array.from(notifications.values()).filter(
          (n) => n.userId === where.userId && n.readAt === null,
        ).length,
      upsert: async ({
        where,
        create,
      }: {
        where: {
          userId_type_occurrenceKey?: {
            userId: string;
            type: 'class_reminder';
            occurrenceKey: string;
          };
        };
        create: Partial<NotificationRow> & {
          userId: string;
          type: 'task_reminder' | 'class_reminder' | 'system';
          title: string;
          body: string;
        };
      }) => {
        const occ = where.userId_type_occurrenceKey;
        const mapKey = occ ? `${occ.userId}:${occ.type}:${occ.occurrenceKey}` : randomUUID();
        if (notifications.has(mapKey)) return notifications.get(mapKey)!;
        const row: NotificationRow = {
          id: randomUUID(),
          userId: create.userId,
          type: create.type,
          title: create.title,
          body: create.body,
          taskId: create.taskId ?? null,
          timetableEntryId: create.timetableEntryId ?? null,
          occurrenceKey: create.occurrenceKey ?? null,
          dueAtSnapshot: create.dueAtSnapshot ?? null,
          readAt: null,
          createdAt: new Date(),
        };
        notifications.set(mapKey, row);
        return row;
      },
    },
  } as unknown as PrismaClient;

  return { prisma, users, settings, courses, entries, notifications };
}

describe('Timetable & Class Reminders integration', () => {
  const env = testEnv();
  const logger = createLogger(env);

  let db: ReturnType<typeof makeFakeTimetablePrisma>;
  let emailMock: EmailService & { sendClassReminderEmail: ReturnType<typeof vi.fn> };
  let timetable: ReturnType<typeof createTimetableService>;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let otherUserId: string;
  let courseId: string;
  let secondCourseId: string;
  let token: string;
  let otherToken: string;

  beforeEach(() => {
    db = makeFakeTimetablePrisma();
    emailMock = {
      sendVerificationEmail: vi.fn(async () => undefined),
      sendOtpEmail: vi.fn(async () => undefined),
      sendPasswordResetEmail: vi.fn(async () => undefined),
      sendTaskReminderEmail: vi.fn(async () => undefined),
      sendClassReminderEmail: vi.fn(async () => undefined),
      sendExamReminderEmail: vi.fn(async () => undefined),
    };
    timetable = createTimetableService({
      prisma: db.prisma,
      email: emailMock,
      logger,
      clientUrl: env.CLIENT_URL,
    });
    const planner = createPlannerService({
      prisma: db.prisma,
      email: emailMock,
      logger,
      clientUrl: env.CLIENT_URL,
    });
    app = createApp(
      env,
      {
        checkDb: async () => undefined,
        timetable,
        planner,
        dashboardPrisma: db.prisma,
      },
      logger,
    );

    userId = randomUUID();
    otherUserId = randomUUID();
    courseId = randomUUID();
    secondCourseId = randomUUID();

    db.users.set(userId, {
      id: userId,
      email: 'kwame@uni.edu',
      name: 'Kwame Boateng',
      emailVerified: true,
    });
    db.users.set(otherUserId, {
      id: otherUserId,
      email: 'other@uni.edu',
      name: 'Ama Osei',
      emailVerified: true,
    });
    db.settings.set(userId, {
      userId,
      timezone: 'Africa/Accra',
      notifyInApp: true,
      notifyEmailReminders: true,
      classReminderMinutes: 15,
    });
    db.courses.set(courseId, {
      id: courseId,
      userId,
      name: 'Data Structures & Algorithms',
      code: 'CSCD 204',
      color: '#2563EB',
      lecturer: 'Dr. Mensah',
      archivedAt: null,
    });
    db.courses.set(secondCourseId, {
      id: secondCourseId,
      userId,
      name: 'Calculus II',
      code: 'MATH 223',
      color: '#10B981',
      lecturer: 'Prof. Owusu',
      archivedAt: null,
    });

    token = signAccessToken(userId, env.JWT_SECRET).token;
    otherToken = signAccessToken(otherUserId, env.JWT_SECRET).token;
  });

  it('creates, updates, deletes timetable entries and enforces clash detection & ownership', async () => {
    // Invalid end <= start -> 400
    const badRange = await request(app)
      .post('/api/v1/timetable')
      .set('Authorization', `Bearer ${token}`)
      .send({
        courseId,
        dayOfWeek: 1,
        startMinute: 600,
        endMinute: 600,
        type: 'lecture',
      });
    expect(badRange.status).toBe(400);

    // Other user's course -> 404
    const foreignCourse = await request(app)
      .post('/api/v1/timetable')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        courseId,
        dayOfWeek: 1,
        startMinute: 480,
        endMinute: 540,
        type: 'lecture',
      });
    expect(foreignCourse.status).toBe(404);

    // Create Monday 08:00–10:00 (480..600)
    const first = await request(app)
      .post('/api/v1/timetable')
      .set('Authorization', `Bearer ${token}`)
      .send({
        courseId,
        dayOfWeek: 1,
        startMinute: 480,
        endMinute: 600,
        venue: 'NNB 1',
        type: 'lecture',
      });
    expect(first.status).toBe(201);
    expect(first.body.course.code).toBe('CSCD 204');

    // Overlapping Monday 09:30–11:00 -> 409 CONFLICT
    const clash = await request(app)
      .post('/api/v1/timetable')
      .set('Authorization', `Bearer ${token}`)
      .send({
        courseId: secondCourseId,
        dayOfWeek: 1,
        startMinute: 570,
        endMinute: 660,
        venue: 'JQB 2',
        type: 'tutorial',
      });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('CONFLICT');
    expect(clash.body.error.message).toContain('CSCD 204');
    expect(clash.body.error.details.clashes).toHaveLength(1);

    // Touching back-to-back 10:00–11:00 Monday -> 201 OK
    const backToBack = await request(app)
      .post('/api/v1/timetable')
      .set('Authorization', `Bearer ${token}`)
      .send({
        courseId: secondCourseId,
        dayOfWeek: 1,
        startMinute: 600,
        endMinute: 660,
        venue: 'JQB 2',
        type: 'tutorial',
      });
    expect(backToBack.status).toBe(201);

    // Edit first slot to 08:15–09:45 -> does NOT clash with itself or 10:00–11:00
    const updated = await request(app)
      .patch(`/api/v1/timetable/${first.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startMinute: 495, endMinute: 585, venue: 'NNB 2' });
    expect(updated.status).toBe(200);
    expect(updated.body.venue).toBe('NNB 2');

    // Edit first slot to overlap second slot -> 409
    const moveClash = await request(app)
      .patch(`/api/v1/timetable/${first.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startMinute: 570, endMinute: 630 });
    expect(moveClash.status).toBe(409);

    // List returns both ordered + settings
    const list = await request(app)
      .get('/api/v1/timetable')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.entries).toHaveLength(2);
    expect(list.body.timezone).toBe('Africa/Accra');
    expect(list.body.defaultReminderMinutes).toBe(15);

    // Other user delete -> 404
    const foreignDel = await request(app)
      .delete(`/api/v1/timetable/${first.body.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(foreignDel.status).toBe(404);

    // Owner delete -> 204
    const del = await request(app)
      .delete(`/api/v1/timetable/${first.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);
  });

  it('sends deduplicated in-app and email class reminders in user local timezone', async () => {
    // 2026-11-18 is a Wednesday (dayOfWeek = 3)
    // Add class at 09:00–10:30 (540..630) on Wednesday in Africa/Accra
    const createRes = await request(app)
      .post('/api/v1/timetable')
      .set('Authorization', `Bearer ${token}`)
      .send({
        courseId,
        dayOfWeek: 3,
        startMinute: 540,
        endMinute: 630,
        venue: 'NNB 1',
        type: 'lecture',
      });
    expect(createRes.status).toBe(201);

    // 30 minutes before (08:30): outside 15m default window -> 0 notifications
    const tooEarly = new Date('2026-11-18T08:30:00Z');
    expect(await timetable.processDueClassReminders(tooEarly)).toBe(0);
    expect(db.notifications.size).toBe(0);
    expect(emailMock.sendClassReminderEmail).not.toHaveBeenCalled();

    // 10 minutes before (08:50): inside window -> sends once!
    const tenMinBefore = new Date('2026-11-18T08:50:00Z');
    expect(await timetable.processDueClassReminders(tenMinBefore)).toBe(1);
    expect(db.notifications.size).toBe(1);
    expect(emailMock.sendClassReminderEmail).toHaveBeenCalledTimes(1);

    const notifs = await request(app)
      .get('/api/v1/notifications?unread=true')
      .set('Authorization', `Bearer ${token}`);
    expect(notifs.status).toBe(200);
    expect(notifs.body.items[0].type).toBe('class_reminder');
    expect(notifs.body.items[0].title).toContain('CSCD 204');
    expect(notifs.body.items[0].body).toContain('NNB 1');

    // Subsequent tick at 08:55 -> deduplicated!
    const fiveMinBefore = new Date('2026-11-18T08:55:00Z');
    expect(await timetable.processDueClassReminders(fiveMinBefore)).toBe(0);
    expect(db.notifications.size).toBe(1);
    expect(emailMock.sendClassReminderEmail).toHaveBeenCalledTimes(1);

    // Next week's occurrence (2026-11-25 08:50) -> notifies again cleanly
    const nextWeek = new Date('2026-11-25T08:50:00Z');
    expect(await timetable.processDueClassReminders(nextWeek)).toBe(1);
    expect(db.notifications.size).toBe(2);
    expect(emailMock.sendClassReminderEmail).toHaveBeenCalledTimes(2);
  });

  it('respects negative UTC offset timezones (e.g. America/New_York across UTC midnight)', async () => {
    const nyUser = randomUUID();
    const nyCourse = randomUUID();
    db.users.set(nyUser, {
      id: nyUser,
      email: 'ny@uni.edu',
      name: 'Maya',
      emailVerified: true,
    });
    db.settings.set(nyUser, {
      userId: nyUser,
      timezone: 'America/New_York',
      notifyInApp: true,
      notifyEmailReminders: false,
      classReminderMinutes: 20,
    });
    db.courses.set(nyCourse, {
      id: nyCourse,
      userId: nyUser,
      name: 'Organic Chemistry',
      code: 'CHEM 201',
      color: '#0EA5E9',
      lecturer: null,
      archivedAt: null,
    });

    const nyToken = signAccessToken(nyUser, env.JWT_SECRET).token;
    // Tuesday (dayOfWeek=2) at 19:30–20:30 local NY time (1170..1230)
    await request(app).post('/api/v1/timetable').set('Authorization', `Bearer ${nyToken}`).send({
      courseId: nyCourse,
      dayOfWeek: 2,
      startMinute: 1170,
      endMinute: 1230,
      type: 'seminar',
    });

    // UTC is ALREADY Wednesday 2026-11-18 00:15Z, which is Tuesday 2026-11-17 19:15 in America/New_York!
    const utcMidnightCross = new Date('2026-11-18T00:15:00Z');
    const local = localDateTimeParts(utcMidnightCross, 'America/New_York');
    expect(local.weekday).toBe(2);
    expect(local.dateStr).toBe('2026-11-17');
    expect(local.minuteOfDay).toBe(19 * 60 + 15);

    expect(await timetable.processDueClassReminders(utcMidnightCross)).toBe(1);
    const items = Array.from(db.notifications.values()).filter((n) => n.userId === nyUser);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toContain('CHEM 201');
  });

  it('computes todayClasses and nextClass (in-progress, upcoming, and next-day wrap)', async () => {
    expect(rangesOverlap(480, 540, 540, 600)).toBe(false);
    expect(rangesOverlap(480, 541, 540, 600)).toBe(true);

    const slots: DashboardClassSlot[] = [
      {
        id: 's1',
        courseId,
        courseName: 'Algorithms',
        courseCode: 'CSCD 204',
        courseColor: '#2563EB',
        lecturer: 'Dr. Mensah',
        dayOfWeek: 3, // Wed
        startMinute: 540, // 09:00
        endMinute: 660, // 11:00
        venue: 'NNB 1',
        type: 'lecture',
      },
      {
        id: 's2',
        courseId: secondCourseId,
        courseName: 'Calculus II',
        courseCode: 'MATH 223',
        courseColor: '#10B981',
        lecturer: 'Prof. Owusu',
        dayOfWeek: 4, // Thu
        startMinute: 600, // 10:00
        endMinute: 690,
        venue: 'JQB 4',
        type: 'lab',
      },
    ];

    // Wed 08:30 -> upcoming Today in 30m
    const beforeWed = computeNextClassAndToday(slots, 'UTC', new Date('2026-11-18T08:30:00Z'));
    expect(beforeWed.todayClasses).toHaveLength(1);
    expect(beforeWed.nextClass?.id).toBe('s1');
    expect(beforeWed.nextClass?.status).toBe('upcoming');
    expect(beforeWed.nextClass?.startsInMinutes).toBe(30);
    expect(beforeWed.nextClass?.dayLabel).toBe('Today');

    // Wed 09:45 -> in_progress Today
    const duringWed = computeNextClassAndToday(slots, 'UTC', new Date('2026-11-18T09:45:00Z'));
    expect(duringWed.nextClass?.id).toBe('s1');
    expect(duringWed.nextClass?.status).toBe('in_progress');
    expect(duringWed.nextClass?.endsInMinutes).toBe(75);

    // Wed 12:00 -> wraps to Tomorrow (Thu 10:00)
    const afterWed = computeNextClassAndToday(slots, 'UTC', new Date('2026-11-18T12:00:00Z'));
    expect(afterWed.nextClass?.id).toBe('s2');
    expect(afterWed.nextClass?.dayLabel).toBe('Tomorrow');

    // Only Wed slot after Wed 12:00 -> wraps to Next Wednesday (dayOffset = 7)
    const wrapNextWeek = computeNextClassAndToday(
      [slots[0]!],
      'UTC',
      new Date('2026-11-18T12:00:00Z'),
    );
    expect(wrapNextWeek.nextClass?.id).toBe('s1');
    expect(wrapNextWeek.nextClass?.dayOffset).toBe(7);
    expect(wrapNextWeek.nextClass?.dayLabel).toBe('Next Wednesday');

    // Also test GET /api/v1/dashboard returns todayClasses & nextClass field shape
    await request(app).post('/api/v1/timetable').set('Authorization', `Bearer ${token}`).send({
      courseId,
      dayOfWeek: 3,
      startMinute: 540,
      endMinute: 660,
      venue: 'NNB 1',
      type: 'lecture',
    });
    const dash = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(dash.status).toBe(200);
    expect(dash.body.timezone).toBe('Africa/Accra');
    expect(Array.isArray(dash.body.todayClasses)).toBe(true);
    expect(dash.body.nextClass?.courseCode).toBe('CSCD 204');
  });
});
