import { request } from '../../lib/apiClient';

export const COURSE_COLORS = [
  { hex: '#2563EB', label: 'Royal Blue' },
  { hex: '#0EA5E9', label: 'Sky Blue' },
  { hex: '#10B981', label: 'Emerald' },
  { hex: '#F59E0B', label: 'Amber' },
  { hex: '#EF4444', label: 'Coral' },
  { hex: '#6366F1', label: 'Indigo' },
  { hex: '#EC4899', label: 'Rose' },
  { hex: '#14B8A6', label: 'Teal' },
] as const;

export interface CourseSummary {
  id: string;
  name: string;
  code: string | null;
  lecturer: string | null;
  creditHours: number | null;
  semester: string | null;
  level: string | null;
  color: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
  documentCount: number;
  taskCount: number;
  deckCount: number;
  quizCount: number;
  studySeconds: number;
}

export interface CourseDetailResponse {
  course: CourseSummary;
  notes: Array<{
    id: string;
    title: string;
    aiSummary: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  documents: Array<{
    id: string;
    title: string;
    type: 'past_question' | 'slides' | 'notes';
    originalName: string;
    status: string;
    pageCount: number;
    createdAt: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    dueAt: string | null;
    priority: 'low' | 'medium' | 'high';
    status: 'todo' | 'done';
    completedAt: string | null;
  }>;
  decks: Array<{
    id: string;
    title: string;
    topic: string | null;
    cardCount: number;
    updatedAt: string;
  }>;
  quizzes: Array<{
    id: string;
    title: string;
    topic: string | null;
    questionCount: number;
    attempts: number;
    bestScore: number | null;
    lastScore: number | null;
    createdAt: string;
  }>;
  upcomingExams: Array<{
    id: string;
    title: string;
    startsAt: string;
    durationMinutes?: number | null;
    venue: string | null;
    examType: string;
    weightPercent?: number | null;
    topics?: string[];
  }>;
  stats: {
    studySeconds: number;
    averageQuizScore: number | null;
    quizzesTaken: number;
    openTasksCount: number;
    completedTasksCount: number;
  };
}

export interface CourseMutationPayload {
  name: string;
  code?: string | null;
  lecturer?: string | null;
  creditHours?: number | null;
  semester?: string | null;
  level?: string | null;
  color?: string | null;
  notes?: string | null;
}

export function listCourses(params?: {
  archived?: 'active' | 'archived' | 'all';
  semester?: string;
}): Promise<CourseSummary[]> {
  const sp = new URLSearchParams();
  if (params?.archived) sp.set('archived', params.archived);
  if (params?.semester) sp.set('semester', params.semester);
  const qs = sp.toString();
  return request<CourseSummary[]>(`/courses${qs ? `?${qs}` : ''}`);
}

export function getCourseDetail(courseId: string): Promise<CourseDetailResponse> {
  return request<CourseDetailResponse>(`/courses/${courseId}`);
}

export function createCourse(payload: CourseMutationPayload): Promise<CourseSummary> {
  return request<CourseSummary>('/courses', { method: 'POST', body: payload });
}

export function updateCourse(
  courseId: string,
  payload: Partial<CourseMutationPayload> & { archived?: boolean },
): Promise<CourseSummary> {
  return request<CourseSummary>(`/courses/${courseId}`, { method: 'PATCH', body: payload });
}

export function deleteCourse(
  courseId: string,
  mode: 'unassign' | 'delete' = 'unassign',
): Promise<void> {
  return request<void>(`/courses/${courseId}?mode=${mode}`, { method: 'DELETE' });
}

export function formatStudyDuration(totalSeconds: number): string {
  const mins = Math.round(Math.max(0, totalSeconds) / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
}
