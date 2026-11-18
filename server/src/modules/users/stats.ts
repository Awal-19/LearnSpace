import type { PrismaClient } from '@prisma/client';

export interface UserStats {
  streakDays: number;
  longestStreakDays: number;
  hoursStudied: number;
  hoursLast7Days: number;
  notesCreated: number;
  quizzesTaken: number;
  averageQuizScore: number;
}

/** Formats a Date as YYYY-MM-DD in the given IANA timezone, falling back to UTC if invalid. */
export function localDateString(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

function addDays(yyyyMmDd: string, delta: number): string {
  const [y = 1970, m = 1, d = 1] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

/**
 * Computes current and longest consecutive study streaks from a set of YYYY-MM-DD dates.
 * Current streak counts backwards from `today` if studied today, or from `yesterday` so
 * a streak is preserved until the end of the current day.
 */
export function computeStreaks(
  studyDays: ReadonlySet<string>,
  today: string,
): { streakDays: number; longestStreakDays: number } {
  if (studyDays.size === 0) {
    return { streakDays: 0, longestStreakDays: 0 };
  }

  let streakDays = 0;
  let cursor = studyDays.has(today) ? today : addDays(today, -1);
  while (studyDays.has(cursor)) {
    streakDays += 1;
    cursor = addDays(cursor, -1);
  }

  const sorted = Array.from(studyDays).sort();
  let longestStreakDays = 0;
  let currentRun = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    if (prev !== null && addDays(prev, 1) === day) {
      currentRun += 1;
    } else {
      currentRun = 1;
    }
    if (currentRun > longestStreakDays) {
      longestStreakDays = currentRun;
    }
    prev = day;
  }

  return { streakDays, longestStreakDays };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Computes real profile statistics from StudySession, Note, and QuizAttempt rows. */
export async function getUserStats(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date(),
): Promise<UserStats> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [settings, sessions, notesCreated, attempts] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } }),
    prisma.studySession.findMany({
      where: { userId },
      select: { startedAt: true, durationSeconds: true },
    }),
    prisma.note.count({ where: { userId } }),
    prisma.quizAttempt.findMany({
      where: { userId },
      select: { score: true, total: true },
    }),
  ]);

  const timeZone = settings?.timezone ?? 'UTC';
  const today = localDateString(now, timeZone);

  let totalSeconds = 0;
  let last7DaysSeconds = 0;
  const studyDays = new Set<string>();

  for (const session of sessions) {
    totalSeconds += session.durationSeconds;
    if (session.startedAt >= sevenDaysAgo) {
      last7DaysSeconds += session.durationSeconds;
    }
    if (session.durationSeconds > 0) {
      studyDays.add(localDateString(session.startedAt, timeZone));
    }
  }

  const { streakDays, longestStreakDays } = computeStreaks(studyDays, today);

  const quizzesTaken = attempts.length;
  let averageQuizScore = 0;
  if (quizzesTaken > 0) {
    const ratioSum = attempts.reduce((acc, a) => acc + (a.total > 0 ? a.score / a.total : 0), 0);
    averageQuizScore = round2(ratioSum / quizzesTaken);
  }

  return {
    streakDays,
    longestStreakDays,
    hoursStudied: round2(totalSeconds / 3600),
    hoursLast7Days: round2(last7DaysSeconds / 3600),
    notesCreated,
    quizzesTaken,
    averageQuizScore,
  };
}
