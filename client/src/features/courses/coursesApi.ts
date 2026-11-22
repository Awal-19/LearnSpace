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
  type?: 'course' | 'subject';
  catalogueSubjectId?: string | null;
  recommendationCount?: number;
  recommendationJobStatus?: string | null;
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

export type RecommendationCategory = 'book' | 'past_question' | 'video' | 'notes';
export type RecommendationAccessType = 'free' | 'preview' | 'borrow' | 'paid';

export interface CourseRecommendationItem {
  id: string;
  courseId: string;
  category: RecommendationCategory;
  title: string;
  authors: string | null;
  edition: string | null;
  year: number | null;
  institutionOrBody: string | null;
  paperType: string | null;
  topics: string[];
  url: string;
  sourceDomain: string;
  accessType: RecommendationAccessType;
  reason: string;
  status: 'active' | 'saved' | 'hidden' | 'dead';
  score: number;
  lastCheckedAt: string | null;
  createdAt: string;
}

export interface CourseResourceItem {
  id: string;
  courseId: string;
  recommendationId: string | null;
  category: RecommendationCategory;
  title: string;
  authors: string | null;
  year: number | null;
  url: string;
  sourceDomain: string;
  accessType: RecommendationAccessType;
  reason: string | null;
  createdAt: string;
}

export interface CourseRecommendationsResponse {
  recommendations: CourseRecommendationItem[];
  resources: CourseResourceItem[];
  useResourcesInAssistant: boolean;
  latestJob: {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    trigger: string;
    errorCode: string | null;
    errorMessage: string | null;
    resultsCount: number;
    createdAt: string;
    finishedAt: string | null;
  } | null;
  dailySearchesUsed: number;
  dailySearchLimit: number;
  featureEnabled: boolean;
  pastQuestionsGuidance: {
    hasPastQuestions: boolean;
    message: string;
    suggestions: string[];
  };
}

export function getCourseRecommendations(courseId: string): Promise<CourseRecommendationsResponse> {
  return request<CourseRecommendationsResponse>(`/courses/${courseId}/recommendations`);
}

export function refreshCourseRecommendations(
  courseId: string,
  mode: 'refresh' | 'find_more' = 'refresh',
): Promise<{ id: string; status: string; trigger: string; createdAt: string }> {
  return request(`/courses/${courseId}/recommendations/refresh`, {
    method: 'POST',
    body: { mode },
  });
}

export function saveCourseRecommendation(
  courseId: string,
  recId: string,
): Promise<CourseResourceItem> {
  return request<CourseResourceItem>(`/courses/${courseId}/recommendations/${recId}/save`, {
    method: 'POST',
  });
}

export function removeCourseResource(courseId: string, resourceId: string): Promise<void> {
  return request<void>(`/courses/${courseId}/resources/${resourceId}`, { method: 'DELETE' });
}

export function toggleCourseResourcesInAssistant(
  courseId: string,
  useResourcesInAssistant: boolean,
): Promise<{ useResourcesInAssistant: boolean }> {
  return request<{ useResourcesInAssistant: boolean }>(
    `/courses/${courseId}/resources/assistant-toggle`,
    {
      method: 'PATCH',
      body: { useResourcesInAssistant },
    },
  );
}

export function hideCourseRecommendation(courseId: string, recId: string): Promise<void> {
  return request<void>(`/courses/${courseId}/recommendations/${recId}/hide`, {
    method: 'POST',
  });
}

export function reportCourseRecommendation(
  courseId: string,
  recId: string,
  reason: string,
): Promise<{ id: string; status: string }> {
  return request(`/courses/${courseId}/recommendations/${recId}/report`, {
    method: 'POST',
    body: { reason },
  });
}

export interface ShsProgrammeItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface ShsCatalogueSubject {
  id: string;
  slug: string;
  name: string;
  code: string | null;
  isCore: boolean;
  programmeSlugs: string[];
  syllabusVersion: string;
  sourceCitation: string;
  topics: Array<{ id: string; title: string; schoolYear: string | null }>;
}

export interface ShsCatalogueResponse {
  syllabusSource: string;
  programmes: ShsProgrammeItem[];
  subjects: ShsCatalogueSubject[];
}

export function fetchShsCatalogue() {
  return request<ShsCatalogueResponse>('/shs/catalogue');
}

export function saveShsOnboardingSubjects(body: {
  schoolYear?: 'SHS 1' | 'SHS 2' | 'SHS 3';
  schoolName?: string | null;
  programme?: string | null;
  subjectIds: string[];
  customNames: string[];
}) {
  return request<{
    schoolYear: string;
    subjectsCount: number;
    subjects: Array<{ id: string; name: string; code: string | null; type: string }>;
  }>('/shs/onboarding/subjects', { method: 'POST', body });
}
