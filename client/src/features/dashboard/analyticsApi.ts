import { request } from '../../lib/apiClient';

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

export function emptyAnalyticsFallback(range: AnalyticsRange): ProgressAnalyticsResponse {
  return {
    range,
    timezone: 'UTC',
    windowStart: '',
    windowEnd: '',
    summary: {
      totalStudyHours: 0,
      studySessionCount: 0,
      averageQuizAccuracy: null,
      flashcardReviews: 0,
      flashcardAccuracy: null,
      tasksCompleted: 0,
      streakDays: 0,
      longestStreakDays: 0,
      bestStudyHour: null,
    },
    studyTimeByCourse: [],
    quizScoreTrend: [],
    flashcardActivityTrend: [],
    tasksCompletedTrend: [],
    bestStudyHours: [],
    weakTopics: [],
  };
}

export async function getProgressAnalytics(
  range: AnalyticsRange,
): Promise<ProgressAnalyticsResponse> {
  const data = await request<Partial<ProgressAnalyticsResponse>>(`/analytics?range=${range}`);
  if (!data || !data.summary) {
    return emptyAnalyticsFallback(range);
  }
  return {
    ...emptyAnalyticsFallback(range),
    ...data,
  };
}

export function generateTopicQuiz(payload: {
  topic: string;
  courseId?: string | null;
  count?: number;
}): Promise<{ id: string; title: string }> {
  return request<{ id: string; title: string }>('/quizzes/generate', {
    method: 'POST',
    body: {
      topic: payload.topic,
      courseId: payload.courseId ?? null,
      count: payload.count ?? 5,
    },
  });
}
