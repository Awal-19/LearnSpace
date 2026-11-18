import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { computeStreaks, localDateString } from '../users/stats';

export const analyticsRangeQuerySchema = z.object({
  range: z.enum(['7d', '30d', 'semester']).default('7d'),
});

export type AnalyticsRange = '7d' | '30d' | 'semester';

export interface StudyTimeCoursePoint {
  courseId: string | null;
  label: string;
  color: string;
  minutes: number;
  hours: number;
}

export interface QuizScoreTrendPoint {
  date: string;
  title: string;
  accuracyPct: number;
  score: number;
  total: number;
}

export interface FlashcardActivityPoint {
  date: string;
  reviews: number;
  accuracyPct: number | null;
}

export interface TasksCompletedPoint {
  date: string;
  completed: number;
}

export interface StudyHourBucket {
  hour: number;
  label: string;
  minutes: number;
}

export interface WeakTopicItem {
  topic: string;
  source: 'quiz' | 'flashcards' | 'document';
  accuracyPct: number;
  sampleCount: number;
  courseId: string | null;
}

export interface ProgressAnalyticsResponse {
  range: AnalyticsRange;
  timezone: string;
  windowStart: string;
  windowEnd: string;
  summary: {
    totalStudyHours: number;
    studySessionCount: number;
    averageQuizAccuracy: number | null;
    flashcardReviews: number;
    flashcardAccuracy: number | null;
    tasksCompleted: number;
    streakDays: number;
    longestStreakDays: number;
    bestStudyHour: StudyHourBucket | null;
  };
  studyTimeByCourse: StudyTimeCoursePoint[];
  quizScoreTrend: QuizScoreTrendPoint[];
  flashcardActivityTrend: FlashcardActivityPoint[];
  tasksCompletedTrend: TasksCompletedPoint[];
  bestStudyHours: StudyHourBucket[];
  weakTopics: WeakTopicItem[];
}

function addDays(yyyyMmDd: string, delta: number): string {
  const [y = 1970, m = 1, d = 1] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function localHourOfDay(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);
    const val = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    return Number.isFinite(val) ? ((val % 24) + 24) % 24 : 0;
  } catch {
    return date.getUTCHours();
  }
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function rangeDaysCount(range: AnalyticsRange): number {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  return 120;
}

export async function getProgressAnalytics(
  prisma: PrismaClient,
  userId: string,
  range: AnalyticsRange = '7d',
  now: Date = new Date(),
): Promise<ProgressAnalyticsResponse> {
  const settings = prisma.userSettings?.findUnique
    ? await prisma.userSettings.findUnique({ where: { userId }, select: { timezone: true } })
    : null;
  const timeZone = settings?.timezone || 'UTC';

  const days = rangeDaysCount(range);
  const windowEnd = localDateString(now, timeZone);
  const windowStart = addDays(windowEnd, -(days - 1));
  // Buffer 24h earlier when querying UTC timestamps to capture all local timezone offsets safely
  const querySince = new Date(now.getTime() - (days + 1) * 24 * 60 * 60 * 1000);
  // Bounding study session scans to 410 days aligns with computeStreaks lookback and uses (userId, startedAt) index
  const streakLookback = new Date(now.getTime() - 410 * 24 * 60 * 60 * 1000);

  const [allStudySessions, quizAttempts, practiceAttempts, reviewLogs, completedTasks] =
    await Promise.all([
      prisma.studySession?.findMany
        ? prisma.studySession.findMany({
            where: { userId, startedAt: { gte: streakLookback } },
            select: {
              courseId: true,
              startedAt: true,
              durationSeconds: true,
              course: { select: { name: true, code: true, color: true } },
            },
          })
        : Promise.resolve([]),
      prisma.quizAttempt?.findMany
        ? prisma.quizAttempt.findMany({
            where: { userId, takenAt: { gte: querySince } },
            orderBy: { takenAt: 'asc' },
            select: {
              score: true,
              total: true,
              takenAt: true,
              quiz: { select: { title: true, topic: true, courseId: true } },
            },
          })
        : Promise.resolve([]),
      prisma.documentPracticeAttempt?.findMany
        ? prisma.documentPracticeAttempt.findMany({
            where: { userId, takenAt: { gte: querySince } },
            orderBy: { takenAt: 'asc' },
            select: {
              score: true,
              total: true,
              weakTopicsJson: true,
              takenAt: true,
              set: {
                select: {
                  title: true,
                  document: { select: { courseId: true, title: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      prisma.reviewLog?.findMany
        ? prisma.reviewLog.findMany({
            where: { userId, reviewedAt: { gte: querySince } },
            orderBy: { reviewedAt: 'asc' },
            select: { courseId: true, topic: true, rating: true, reviewedAt: true },
          })
        : Promise.resolve([]),
      prisma.task?.findMany
        ? prisma.task.findMany({
            where: { userId, status: 'done', completedAt: { gte: querySince } },
            select: { completedAt: true },
          })
        : Promise.resolve([]),
    ]);

  // All-time study days -> matches stats.ts streakDays calculation consistently
  const allStudyDays = new Set<string>();
  const windowSessions = allStudySessions.filter((s) => {
    if (s.durationSeconds > 0) {
      allStudyDays.add(localDateString(s.startedAt, timeZone));
    }
    const localDay = localDateString(s.startedAt, timeZone);
    return localDay >= windowStart && localDay <= windowEnd;
  });

  const { streakDays, longestStreakDays } = computeStreaks(allStudyDays, windowEnd);

  // Study time per course + best study hours
  const courseMinutesMap = new Map<
    string,
    { courseId: string | null; label: string; color: string; seconds: number }
  >();
  const hourSeconds = new Array<number>(24).fill(0);
  let totalStudySeconds = 0;

  for (const s of windowSessions) {
    totalStudySeconds += s.durationSeconds;
    const hour = localHourOfDay(s.startedAt, timeZone);
    hourSeconds[hour] = (hourSeconds[hour] ?? 0) + s.durationSeconds;

    const key = s.courseId ?? '__unassigned__';
    const existing = courseMinutesMap.get(key);
    const label = s.course
      ? s.course.code
        ? `${s.course.code} · ${s.course.name}`
        : s.course.name
      : 'General Study';
    const color = s.course?.color || '#2563EB';
    if (existing) {
      existing.seconds += s.durationSeconds;
    } else {
      courseMinutesMap.set(key, {
        courseId: s.courseId,
        label,
        color,
        seconds: s.durationSeconds,
      });
    }
  }

  const studyTimeByCourse: StudyTimeCoursePoint[] = Array.from(courseMinutesMap.values())
    .filter((c) => c.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .map((c) => ({
      courseId: c.courseId,
      label: c.label,
      color: c.color,
      minutes: Math.round(c.seconds / 60),
      hours: round2(c.seconds / 3600),
    }));

  const bestStudyHours: StudyHourBucket[] = hourSeconds.map((secs, hour) => ({
    hour,
    label: formatHourLabel(hour),
    minutes: Math.round(secs / 60),
  }));

  const nonZeroHourBuckets = bestStudyHours
    .filter((h) => h.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const bestStudyHour = nonZeroHourBuckets[0] ?? null;

  // Quiz score trend
  const windowQuizzes = quizAttempts.filter((qa) => {
    const day = localDateString(qa.takenAt, timeZone);
    return day >= windowStart && day <= windowEnd;
  });

  const quizScoreTrend: QuizScoreTrendPoint[] = windowQuizzes.map((qa) => ({
    date: localDateString(qa.takenAt, timeZone),
    title: qa.quiz.title,
    accuracyPct: qa.total > 0 ? Math.round((qa.score / qa.total) * 100) : 0,
    score: qa.score,
    total: qa.total,
  }));

  const averageQuizAccuracy =
    quizScoreTrend.length > 0
      ? Math.round(
          quizScoreTrend.reduce((sum, item) => sum + item.accuracyPct, 0) / quizScoreTrend.length,
        )
      : null;

  // Flashcard reviews & accuracy by day
  const windowReviews = reviewLogs.filter((r) => {
    const day = localDateString(r.reviewedAt, timeZone);
    return day >= windowStart && day <= windowEnd;
  });
  const reviewDayMap = new Map<string, { total: number; passed: number }>();
  let totalFlashcardPassed = 0;

  for (const r of windowReviews) {
    const day = localDateString(r.reviewedAt, timeZone);
    const cur = reviewDayMap.get(day) ?? { total: 0, passed: 0 };
    cur.total += 1;
    if (r.rating !== 'again') {
      cur.passed += 1;
      totalFlashcardPassed += 1;
    }
    reviewDayMap.set(day, cur);
  }

  // Tasks completed by day
  const taskDayMap = new Map<string, number>();
  let tasksCompleted = 0;
  for (const t of completedTasks) {
    if (!t.completedAt) continue;
    const day = localDateString(t.completedAt, timeZone);
    if (day < windowStart || day > windowEnd) continue;
    tasksCompleted += 1;
    taskDayMap.set(day, (taskDayMap.get(day) ?? 0) + 1);
  }

  // Build ordered daily series for charts cleanly across all days in 7d/30d or active span for semester
  const activeDatesCount = range === 'semester' ? 30 : days;
  const chartStart =
    range === 'semester' ? addDays(windowEnd, -(activeDatesCount - 1)) : windowStart;
  const flashcardActivityTrend: FlashcardActivityPoint[] = [];
  const tasksCompletedTrend: TasksCompletedPoint[] = [];

  for (let i = 0; i < activeDatesCount; i += 1) {
    const day = addDays(chartStart, i);
    const rev = reviewDayMap.get(day);
    flashcardActivityTrend.push({
      date: day,
      reviews: rev?.total ?? 0,
      accuracyPct: rev && rev.total > 0 ? Math.round((rev.passed / rev.total) * 100) : null,
    });
    tasksCompletedTrend.push({
      date: day,
      completed: taskDayMap.get(day) ?? 0,
    });
  }

  // Weak topics across Flashcards, Quizzes, and Document Practice Attempts
  const weakTopicCandidates = new Map<
    string,
    {
      topic: string;
      source: 'quiz' | 'flashcards' | 'document';
      correct: number;
      total: number;
      courseId: string | null;
    }
  >();

  // 1) Flashcards by topic
  const fcTopicStats = new Map<
    string,
    { label: string; passed: number; total: number; courseId: string | null }
  >();
  for (const r of windowReviews) {
    const label = r.topic?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const cur = fcTopicStats.get(key) ?? { label, passed: 0, total: 0, courseId: r.courseId };
    cur.total += 1;
    if (r.rating !== 'again') cur.passed += 1;
    if (!cur.courseId && r.courseId) cur.courseId = r.courseId;
    fcTopicStats.set(key, cur);
  }
  for (const [key, stat] of fcTopicStats.entries()) {
    const pct = Math.round((stat.passed / stat.total) * 100);
    if (pct < 75) {
      weakTopicCandidates.set(key, {
        topic: stat.label,
        source: 'flashcards',
        correct: stat.passed,
        total: stat.total,
        courseId: stat.courseId,
      });
    }
  }

  // 2) Quizzes by topic / title
  const quizTopicStats = new Map<
    string,
    { label: string; score: number; total: number; courseId: string | null }
  >();
  for (const qa of windowQuizzes) {
    const label = (qa.quiz.topic?.trim() || qa.quiz.title).trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const cur = quizTopicStats.get(key) ?? {
      label,
      score: 0,
      total: 0,
      courseId: qa.quiz.courseId,
    };
    cur.score += qa.score;
    cur.total += qa.total;
    quizTopicStats.set(key, cur);
  }
  for (const [key, stat] of quizTopicStats.entries()) {
    if (stat.total <= 0) continue;
    const pct = Math.round((stat.score / stat.total) * 100);
    if (pct < 75) {
      const existing = weakTopicCandidates.get(key);
      if (!existing || pct < Math.round((existing.correct / existing.total) * 100)) {
        weakTopicCandidates.set(key, {
          topic: stat.label,
          source: 'quiz',
          correct: stat.score,
          total: stat.total,
          courseId: stat.courseId,
        });
      }
    }
  }

  // 3) Document practice attempts weakTopicsJson
  for (const pa of practiceAttempts) {
    const day = localDateString(pa.takenAt, timeZone);
    if (day < windowStart || day > windowEnd) continue;
    const topics = Array.isArray(pa.weakTopicsJson) ? (pa.weakTopicsJson as unknown[]) : [];
    const pct = pa.total > 0 ? Math.round((pa.score / pa.total) * 100) : 50;
    for (const rawTopic of topics) {
      if (typeof rawTopic !== 'string' || !rawTopic.trim()) continue;
      const label = rawTopic.trim();
      const key = label.toLowerCase();
      if (!weakTopicCandidates.has(key)) {
        weakTopicCandidates.set(key, {
          topic: label,
          source: 'document',
          correct: Math.min(pa.score, Math.max(0, pa.total - 1)),
          total: Math.max(1, pa.total),
          courseId: pa.set?.document?.courseId ?? null,
        });
      }
      if (pct >= 75 && weakTopicCandidates.get(key)?.source === 'document') {
        // Still keep explicit missed topic with conservative 50% sample marker when missed individually
        weakTopicCandidates.get(key)!.correct = 0;
        weakTopicCandidates.get(key)!.total = 2;
      }
    }
  }

  const weakTopics: WeakTopicItem[] = Array.from(weakTopicCandidates.values())
    .map((w) => ({
      topic: w.topic,
      source: w.source,
      accuracyPct: w.total > 0 ? Math.round((w.correct / w.total) * 100) : 0,
      sampleCount: w.total,
      courseId: w.courseId,
    }))
    .sort((a, b) => a.accuracyPct - b.accuracyPct || b.sampleCount - a.sampleCount)
    .slice(0, 6);

  return {
    range,
    timezone: timeZone,
    windowStart,
    windowEnd,
    summary: {
      totalStudyHours: round1(totalStudySeconds / 3600),
      studySessionCount: windowSessions.length,
      averageQuizAccuracy,
      flashcardReviews: windowReviews.length,
      flashcardAccuracy:
        windowReviews.length > 0
          ? Math.round((totalFlashcardPassed / windowReviews.length) * 100)
          : null,
      tasksCompleted,
      streakDays,
      longestStreakDays,
      bestStudyHour,
    },
    studyTimeByCourse,
    quizScoreTrend,
    flashcardActivityTrend,
    tasksCompletedTrend,
    bestStudyHours,
    weakTopics,
  };
}
