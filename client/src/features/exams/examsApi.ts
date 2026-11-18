import { request } from '../../lib/apiClient';

export type ExamType = 'midterm' | 'final' | 'quiz' | 'practical' | 'oral' | 'other';
export type PreferredTimeWindow = 'morning' | 'afternoon' | 'evening' | 'night';
export type RevisionSessionStatus = 'planned' | 'completed' | 'missed' | 'rescheduled';

export interface ExamCourseSummary {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  archivedAt: string | null;
}

export interface ExamItem {
  id: string;
  courseId: string;
  title: string;
  examType: ExamType;
  startsAt: string;
  durationMinutes: number | null;
  venue: string | null;
  weightPercent: number | null;
  topics: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  course: ExamCourseSummary;
}

export interface ExamsListResponse {
  items: ExamItem[];
  timezone: string;
  defaultExamReminderMinutes: number;
}

export interface ExamMutationPayload {
  courseId: string;
  title: string;
  examType: ExamType;
  startsAt: string;
  durationMinutes?: number | null;
  venue?: string | null;
  weightPercent?: number | null;
  topics: string[];
  notes?: string | null;
}

export interface RevisionSessionDraft {
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
    preferredTimes: PreferredTimeWindow[];
    sessions: RevisionSessionDraft[];
  };
  contextSummary: {
    examCount: number;
    noteCount: number;
    documentCount: number;
    weakTopics: string[];
  };
}

export interface RevisionSessionItem {
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
  exam: { id: string; title: string; startsAt: string } | null;
  taskStatus: 'todo' | 'done' | null;
}

export interface RevisionPlanItem {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  daysOff: number[];
  preferredTimes: PreferredTimeWindow[];
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  sessions: RevisionSessionItem[];
}

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  midterm: 'Midterm',
  final: 'Final',
  quiz: 'Quiz',
  practical: 'Practical',
  oral: 'Oral',
  other: 'Other',
};

export function formatExamCountdown(
  startsAtIso: string,
  nowMs = Date.now(),
): { label: string; tone: 'danger' | 'warning' | 'primary' | 'neutral'; passed: boolean } {
  const diffMs = new Date(startsAtIso).getTime() - nowMs;
  if (Number.isNaN(diffMs) || diffMs <= 0) {
    return { label: 'Completed', tone: 'neutral', passed: true };
  }
  const totalHours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  if (days >= 14) {
    return { label: `${days} days left`, tone: 'primary', passed: false };
  }
  if (days >= 2) {
    return { label: `${days} days left`, tone: days <= 3 ? 'danger' : 'warning', passed: false };
  }
  if (days === 1) {
    return { label: 'Tomorrow', tone: 'danger', passed: false };
  }
  if (totalHours >= 1) {
    return {
      label: `${totalHours} ${totalHours === 1 ? 'hour' : 'hours'} left`,
      tone: 'danger',
      passed: false,
    };
  }
  const mins = Math.max(1, Math.round(diffMs / 60_000));
  return { label: `${mins} min left`, tone: 'danger', passed: false };
}

export function listExams(params?: {
  courseId?: string;
  upcoming?: boolean;
}): Promise<ExamsListResponse> {
  const sp = new URLSearchParams();
  if (params?.courseId) sp.set('courseId', params.courseId);
  if (params?.upcoming !== undefined) sp.set('upcoming', String(params.upcoming));
  const qs = sp.toString();
  return request<ExamsListResponse>(`/exams${qs ? `?${qs}` : ''}`);
}

export function createExam(payload: ExamMutationPayload): Promise<ExamItem> {
  return request<ExamItem>('/exams', { method: 'POST', body: payload });
}

export function updateExam(id: string, payload: Partial<ExamMutationPayload>): Promise<ExamItem> {
  return request<ExamItem>(`/exams/${id}`, { method: 'PATCH', body: payload });
}

export function deleteExam(id: string): Promise<void> {
  return request<void>(`/exams/${id}`, { method: 'DELETE' });
}

export function listRevisionPlans(): Promise<RevisionPlanItem[]> {
  return request<RevisionPlanItem[]>('/revision-plans');
}

export function generateRevisionPlan(payload: {
  examIds?: string[];
  title?: string;
  startDate?: string;
  endDate?: string;
  hoursPerDay: number;
  daysOff: number[];
  preferredTimes: PreferredTimeWindow[];
  instructions?: string;
}): Promise<RevisionPlanDraftResponse> {
  return request<RevisionPlanDraftResponse>('/revision-plans/generate', {
    method: 'POST',
    body: payload,
  });
}

export function saveRevisionPlan(payload: {
  title: string;
  startDate: string;
  endDate: string;
  hoursPerDay: number;
  daysOff: number[];
  preferredTimes: PreferredTimeWindow[];
  sessions: Array<{
    scheduledDate: string;
    startTime: string;
    durationMinutes: number;
    examId?: string | null;
    courseId?: string | null;
    topic: string;
    notes?: string | null;
    status?: RevisionSessionStatus;
  }>;
}): Promise<RevisionPlanItem> {
  return request<RevisionPlanItem>('/revision-plans', { method: 'POST', body: payload });
}

export function updateRevisionSession(
  planId: string,
  sessionId: string,
  payload: Partial<{
    scheduledDate: string;
    startTime: string;
    durationMinutes: number;
    topic: string;
    notes: string | null;
    status: RevisionSessionStatus;
  }>,
): Promise<RevisionPlanItem> {
  return request<RevisionPlanItem>(`/revision-plans/${planId}/sessions/${sessionId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export function rescheduleMissedSessions(
  planId: string,
): Promise<{ plan: RevisionPlanItem; rescheduledCount: number }> {
  return request<{ plan: RevisionPlanItem; rescheduledCount: number }>(
    `/revision-plans/${planId}/reschedule-missed`,
    { method: 'POST' },
  );
}

export function deleteRevisionPlan(planId: string): Promise<void> {
  return request<void>(`/revision-plans/${planId}`, { method: 'DELETE' });
}
