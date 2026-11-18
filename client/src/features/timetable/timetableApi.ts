import { request } from '../../lib/apiClient';

export type TimetableType = 'lecture' | 'lab' | 'tutorial' | 'seminar';

export interface TimetableCourse {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  lecturer: string | null;
  archivedAt: string | null;
}

export interface TimetableEntry {
  id: string;
  courseId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  venue: string | null;
  type: TimetableType;
  reminderEnabled: boolean;
  reminderMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  course: TimetableCourse;
}

export interface TimetableListResponse {
  entries: TimetableEntry[];
  timezone: string;
  defaultReminderMinutes: number;
}

export interface TimetableMutationPayload {
  courseId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  venue?: string | null;
  type: TimetableType;
  reminderEnabled?: boolean;
  reminderMinutes?: number | null;
}

export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const WEEKDAYS_WORK = [1, 2, 3, 4, 5] as const;
export const WEEKDAYS_ALL = [1, 2, 3, 4, 5, 6, 0] as const;

export const TIMETABLE_TYPE_OPTIONS: Array<{ value: TimetableType; label: string }> = [
  { value: 'lecture', label: 'Lecture' },
  { value: 'lab', label: 'Lab' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'seminar', label: 'Seminar' },
];

export function formatMinutes(minute: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(minute)));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function minutesToTimeInput(minute: number): string {
  const safe = Math.max(0, Math.min(1439, Math.round(minute)));
  return formatMinutes(safe);
}

export function timeInputToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function formatCountdownMinutes(minutes: number): string {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `in ${hrs}h` : `in ${hrs}h ${mins}m`;
}

export function findLocalClashes(
  entries: TimetableEntry[],
  candidate: { dayOfWeek: number; startMinute: number; endMinute: number },
  excludeId?: string,
): TimetableEntry[] {
  if (candidate.endMinute <= candidate.startMinute) return [];
  return entries.filter(
    (item) =>
      item.id !== excludeId &&
      item.dayOfWeek === candidate.dayOfWeek &&
      candidate.startMinute < item.endMinute &&
      item.startMinute < candidate.endMinute,
  );
}

export function listTimetable(): Promise<TimetableListResponse> {
  return request<TimetableListResponse>('/timetable');
}

export function createTimetableEntry(payload: TimetableMutationPayload): Promise<TimetableEntry> {
  return request<TimetableEntry>('/timetable', { method: 'POST', body: payload });
}

export function updateTimetableEntry(
  id: string,
  payload: Partial<TimetableMutationPayload>,
): Promise<TimetableEntry> {
  return request<TimetableEntry>(`/timetable/${id}`, { method: 'PATCH', body: payload });
}

export function deleteTimetableEntry(id: string): Promise<void> {
  return request<void>(`/timetable/${id}`, { method: 'DELETE' });
}
