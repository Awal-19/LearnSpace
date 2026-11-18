import { request } from '../../lib/apiClient';

export type RetakePolicy = 'latest' | 'highest' | 'include_all';

export interface GradeBoundary {
  label: string;
  minScore: number;
  maxScore: number;
  gradePoint: number;
  isPass: boolean;
  excludeFromGpa?: boolean;
}

export interface DegreeClassRule {
  label: string;
  minGpa: number;
}

export interface GradingScaleConfig {
  id: string;
  name: string;
  maxGpa: number;
  retakePolicy: RetakePolicy;
  boundaries: GradeBoundary[];
  degreeClasses: DegreeClassRule[];
  isDefault: boolean;
}

export interface GradingScalePreset {
  key: 'default_4_0' | 'us_plus_minus_4_0' | 'scale_5_0';
  name: string;
  maxGpa: number;
  retakePolicy: RetakePolicy;
  boundaries: GradeBoundary[];
  degreeClasses: DegreeClassRule[];
}

export interface AnnotatedGradeRecord {
  id: string;
  courseId: string | null;
  scaleId: string | null;
  semester: string;
  semesterOrder: number;
  courseCode: string;
  courseTitle: string;
  creditHours: number;
  score: number | null;
  gradeLabel: string;
  gradePoint: number;
  excludeFromGpa: boolean;
  isRetake: boolean;
  retakeGroupKey: string | null;
  createdAt: string;
  qualityPoints: number;
  countsInSemesterGpa: boolean;
  countsInCgpa: boolean;
  supersededByRetake: boolean;
  effectiveRetakeKey: string | null;
}

export interface SemesterSummary {
  semester: string;
  semesterOrder: number;
  courseCount: number;
  gpaCredits: number;
  totalCredits: number;
  qualityPoints: number;
  semesterGpa: number | null;
  cumulativeGpa: number | null;
  cumulativeCredits: number;
  records: AnnotatedGradeRecord[];
}

export interface GpaTrendPoint {
  semester: string;
  semesterOrder: number;
  semesterGpa: number | null;
  cumulativeGpa: number | null;
  gpaCredits: number;
  cumulativeCredits: number;
}

export interface GpaOverviewData {
  totalCourses: number;
  completedGpaCredits: number;
  totalAttemptedCredits: number;
  totalQualityPoints: number;
  cgpa: number | null;
  rawCgpa: number | null;
  currentClassLabel: string | null;
  semesters: SemesterSummary[];
  trend: GpaTrendPoint[];
}

export interface GpaOverviewBundle {
  activeScale: GradingScaleConfig;
  scales: GradingScaleConfig[];
  presets: GradingScalePreset[];
  overview: GpaOverviewData;
}

export interface WhatIfPlanResult {
  possible: boolean;
  alreadyAchieved: boolean;
  targetCgpa: number;
  targetClassLabel: string | null;
  currentCgpa: number | null;
  completedGpaCredits: number;
  remainingCredits: number;
  maxAchievableCgpa: number;
  minPossibleCgpa: number;
  requiredAvgGpa: number | null;
  suggestedMinGrade: { label: string; gradePoint: number } | null;
  courseBreakdown: Array<{
    label: string;
    creditHours: number;
    suggestedGrade: string;
    gradePoint: number;
  }>;
  message: string;
}

export function getGpaOverview(): Promise<GpaOverviewBundle> {
  return request<GpaOverviewBundle>('/gpa/overview');
}

export function createScale(payload: Omit<GradingScaleConfig, 'id'>): Promise<GradingScaleConfig> {
  return request<GradingScaleConfig>('/gpa/scales', { method: 'POST', body: payload });
}

export function updateScale(
  id: string,
  payload: Partial<Omit<GradingScaleConfig, 'id'>>,
): Promise<GradingScaleConfig> {
  return request<GradingScaleConfig>(`/gpa/scales/${id}`, { method: 'PATCH', body: payload });
}

export function deleteScale(id: string): Promise<void> {
  return request<void>(`/gpa/scales/${id}`, { method: 'DELETE' });
}

export function createGradeRecord(payload: {
  courseId?: string | null;
  scaleId?: string | null;
  semester: string;
  semesterOrder: number;
  courseCode: string;
  courseTitle: string;
  creditHours: number;
  score?: number | null;
  gradeLabel?: string;
  gradePoint?: number;
  excludeFromGpa?: boolean;
  isRetake?: boolean;
  retakeGroupKey?: string | null;
}): Promise<{ record: AnnotatedGradeRecord } & GpaOverviewBundle> {
  return request('/gpa/records', { method: 'POST', body: payload });
}

export function updateGradeRecord(
  id: string,
  payload: {
    courseId?: string | null;
    scaleId?: string | null;
    semester?: string;
    semesterOrder?: number;
    courseCode?: string;
    courseTitle?: string;
    creditHours?: number;
    score?: number | null;
    gradeLabel?: string;
    gradePoint?: number;
    excludeFromGpa?: boolean;
    isRetake?: boolean;
    retakeGroupKey?: string | null;
  },
): Promise<{ record: AnnotatedGradeRecord } & GpaOverviewBundle> {
  return request(`/gpa/records/${id}`, { method: 'PATCH', body: payload });
}

export function deleteGradeRecord(id: string): Promise<GpaOverviewBundle> {
  return request<GpaOverviewBundle>(`/gpa/records/${id}`, { method: 'DELETE' });
}

export function calculateWhatIf(payload: {
  targetCgpa?: number;
  targetClassLabel?: string;
  remainingCredits?: number;
  plannedCourses?: Array<{ label: string; creditHours: number }>;
}): Promise<WhatIfPlanResult> {
  return request<WhatIfPlanResult>('/gpa/what-if', { method: 'POST', body: payload });
}
