import { AlertTriangle } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { Button, Input, Modal } from '../../design';
import { ApiError } from '../../lib/apiClient';
import type { CourseSummary } from '../courses/coursesApi';
import {
  DAY_NAMES,
  TIMETABLE_TYPE_OPTIONS,
  WEEKDAYS_ALL,
  findLocalClashes,
  formatMinutes,
  minutesToTimeInput,
  timeInputToMinutes,
  type TimetableEntry,
  type TimetableMutationPayload,
  type TimetableType,
} from './timetableApi';

export interface TimetableEntryModalProps {
  open: boolean;
  onClose: () => void;
  entry?: TimetableEntry | null;
  defaultDayOfWeek?: number;
  courses: CourseSummary[];
  existingEntries: TimetableEntry[];
  defaultReminderMinutes: number;
  onSubmit: (payload: TimetableMutationPayload) => Promise<void>;
}

type ReminderMode = 'default' | 'custom' | 'off';

export function TimetableEntryModal({
  open,
  onClose,
  entry,
  defaultDayOfWeek = 1,
  courses,
  existingEntries,
  defaultReminderMinutes,
  onSubmit,
}: TimetableEntryModalProps) {
  const path = useAppPath();

  const [courseId, setCourseId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<number>(defaultDayOfWeek);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [venue, setVenue] = useState('');
  const [type, setType] = useState<TimetableType>('lecture');
  const [reminderMode, setReminderMode] = useState<ReminderMode>('default');
  const [customMinutes, setCustomMinutes] = useState('15');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const courseOptions = useMemo(() => {
    const active = courses.filter((c) => !c.archivedAt);
    if (entry && !active.some((c) => c.id === entry.courseId)) {
      return [
        ...active,
        {
          id: entry.courseId,
          name: entry.course.name,
          code: entry.course.code,
          lecturer: entry.course.lecturer,
          creditHours: null,
          semester: null,
          level: null,
          color: entry.course.color,
          notes: null,
          archivedAt: entry.course.archivedAt,
          createdAt: '',
          updatedAt: '',
          noteCount: 0,
          documentCount: 0,
          taskCount: 0,
          deckCount: 0,
          quizCount: 0,
          studySeconds: 0,
        },
      ];
    }
    return active;
  }, [courses, entry]);

  useEffect(() => {
    if (!open) return;
    setCourseId(entry?.courseId ?? courseOptions[0]?.id ?? '');
    setDayOfWeek(entry?.dayOfWeek ?? defaultDayOfWeek);
    setStartTime(entry ? minutesToTimeInput(entry.startMinute) : '09:00');
    setEndTime(entry ? minutesToTimeInput(entry.endMinute) : '10:00');
    setVenue(entry?.venue ?? '');
    setType(entry?.type ?? 'lecture');
    if (entry && !entry.reminderEnabled) {
      setReminderMode('off');
      setCustomMinutes(String(defaultReminderMinutes));
    } else if (entry && entry.reminderMinutes !== null) {
      setReminderMode('custom');
      setCustomMinutes(String(entry.reminderMinutes));
    } else {
      setReminderMode('default');
      setCustomMinutes(String(defaultReminderMinutes));
    }
    setError(null);
  }, [open, entry, defaultDayOfWeek, defaultReminderMinutes, courseOptions]);

  const parsedStart = timeInputToMinutes(startTime);
  const parsedEnd = timeInputToMinutes(endTime);

  const localClashes = useMemo(() => {
    if (parsedStart === null || parsedEnd === null || parsedEnd <= parsedStart) return [];
    return findLocalClashes(
      existingEntries,
      { dayOfWeek, startMinute: parsedStart, endMinute: parsedEnd },
      entry?.id,
    );
  }, [existingEntries, dayOfWeek, parsedStart, parsedEnd, entry?.id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!courseId) {
      setError('Please select a course first.');
      return;
    }
    if (parsedStart === null || parsedEnd === null) {
      setError('Enter valid start and end times.');
      return;
    }
    if (parsedEnd <= parsedStart) {
      setError('End time must be after start time.');
      return;
    }
    if (localClashes.length > 0) {
      const first = localClashes[0]!;
      const label = first.course.code
        ? `${first.course.code} — ${first.course.name}`
        : first.course.name;
      setError(
        `Schedule clash with ${label} (${formatMinutes(first.startMinute)}–${formatMinutes(first.endMinute)}). Adjust the day or time.`,
      );
      return;
    }

    let reminderEnabled = true;
    let reminderMinutes: number | null = null;
    if (reminderMode === 'off') {
      reminderEnabled = false;
      reminderMinutes = null;
    } else if (reminderMode === 'custom') {
      const mins = Number(customMinutes);
      if (!Number.isInteger(mins) || mins < 0 || mins > 1440) {
        setError('Custom reminder lead time must be a whole number from 0 to 1440 minutes.');
        return;
      }
      reminderMinutes = mins;
    }

    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        courseId,
        dayOfWeek,
        startMinute: parsedStart,
        endMinute: parsedEnd,
        venue: venue.trim() || null,
        type,
        reminderEnabled,
        reminderMinutes,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not save class slot.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={entry ? 'Edit class' : 'Add class to timetable'}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-xs font-medium text-danger"
          >
            {error}
          </div>
        ) : null}

        {courseOptions.length === 0 ? (
          <div className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-3.5 text-xs text-fg dark:border-amber-500/30 dark:bg-amber-950/30">
            <p className="font-medium">No active courses found.</p>
            <p className="mt-1 text-muted">
              Create a course first so your class inherits its code and color badge.{' '}
              <Link to={path('/courses')} className="font-semibold text-primary-600 underline">
                Go to Courses
              </Link>
            </p>
          </div>
        ) : null}

        <div>
          <label htmlFor="tt-course" className="mb-1.5 block text-sm font-medium text-fg">
            Course
          </label>
          <select
            id="tt-course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            disabled={courseOptions.length === 0}
            className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none disabled:opacity-60"
          >
            <option value="">Select course...</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="tt-day" className="mb-1.5 block text-sm font-medium text-fg">
              Day
            </label>
            <select
              id="tt-day"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            >
              {WEEKDAYS_ALL.map((d) => (
                <option key={d} value={d}>
                  {DAY_NAMES[d]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="tt-type" className="mb-1.5 block text-sm font-medium text-fg">
              Class type
            </label>
            <select
              id="tt-type"
              value={type}
              onChange={(e) => setType(e.target.value as TimetableType)}
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            >
              {TIMETABLE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="tt-start" className="mb-1.5 block text-sm font-medium text-fg">
              Start time
            </label>
            <input
              id="tt-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              required
            />
          </div>
          <div>
            <label htmlFor="tt-end" className="mb-1.5 block text-sm font-medium text-fg">
              End time
            </label>
            <input
              id="tt-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              required
            />
          </div>
        </div>

        {localClashes.length > 0 ? (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs text-fg"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="font-semibold">Time clash detected on {DAY_NAMES[dayOfWeek]}</p>
              <p className="mt-0.5 text-muted">
                Overlaps with{' '}
                {localClashes
                  .map(
                    (c) =>
                      `${c.course.code ?? c.course.name} (${formatMinutes(c.startMinute)}–${formatMinutes(c.endMinute)})`,
                  )
                  .join(', ')}
                .
              </p>
            </div>
          </div>
        ) : null}

        <Input
          label="Venue (optional)"
          placeholder="e.g. NNB 1, Engineering Lab 2"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tt-reminder-mode" className="mb-1.5 block text-sm font-medium text-fg">
              Class reminder
            </label>
            <select
              id="tt-reminder-mode"
              value={reminderMode}
              onChange={(e) => setReminderMode(e.target.value as ReminderMode)}
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            >
              <option value="default">Default ({defaultReminderMinutes} min before)</option>
              <option value="custom">Custom lead time</option>
              <option value="off">No reminder</option>
            </select>
          </div>
          {reminderMode === 'custom' ? (
            <Input
              label="Minutes before class"
              type="number"
              min={0}
              max={1440}
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
            />
          ) : null}
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={courseOptions.length === 0}>
            {entry ? 'Save changes' : 'Add class'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
