import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { Button, Input, Modal, Textarea } from '../../design';
import { ApiError } from '../../lib/apiClient';
import type { CourseSummary } from '../courses/coursesApi';
import {
  EXAM_TYPE_LABELS,
  type ExamItem,
  type ExamMutationPayload,
  type ExamType,
} from './examsApi';

export interface ExamFormModalProps {
  open: boolean;
  onClose: () => void;
  exam?: ExamItem | null;
  courses: CourseSummary[];
  onSubmit: (payload: ExamMutationPayload) => Promise<void>;
}

function toDatetimeLocalValue(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function ExamFormModal({ open, onClose, exam, courses, onSubmit }: ExamFormModalProps) {
  const path = useAppPath();

  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [examType, setExamType] = useState<ExamType>('final');
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [weightPercent, setWeightPercent] = useState('');
  const [venue, setVenue] = useState('');
  const [topicsText, setTopicsText] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const courseOptions = useMemo(() => {
    const active = courses.filter((c) => !c.archivedAt);
    if (exam && !active.some((c) => c.id === exam.courseId)) {
      return [
        ...active,
        {
          id: exam.courseId,
          name: exam.course.name,
          code: exam.course.code,
          lecturer: null,
          creditHours: null,
          semester: null,
          level: null,
          color: exam.course.color,
          notes: null,
          archivedAt: exam.course.archivedAt,
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
  }, [courses, exam]);

  useEffect(() => {
    if (!open) return;
    setCourseId(exam?.courseId ?? courseOptions[0]?.id ?? '');
    setTitle(exam?.title ?? '');
    setExamType(exam?.examType ?? 'final');
    setStartsAtLocal(exam ? toDatetimeLocalValue(exam.startsAt) : '');
    setDurationMinutes(
      exam?.durationMinutes !== null && exam?.durationMinutes !== undefined
        ? String(exam.durationMinutes)
        : '',
    );
    setWeightPercent(
      exam?.weightPercent !== null && exam?.weightPercent !== undefined
        ? String(exam.weightPercent)
        : '',
    );
    setVenue(exam?.venue ?? '');
    setTopicsText(exam?.topics.join(', ') ?? '');
    setNotes(exam?.notes ?? '');
    setError(null);
  }, [open, exam, courseOptions]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!courseId) {
      setError('Select a course first.');
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Exam title is required.');
      return;
    }
    if (!startsAtLocal) {
      setError('Exam date and time are required.');
      return;
    }
    const startsAtDate = new Date(startsAtLocal);
    if (Number.isNaN(startsAtDate.getTime())) {
      setError('Enter a valid exam date and time.');
      return;
    }

    const parsedDuration = durationMinutes.trim() ? Number(durationMinutes) : null;
    if (
      parsedDuration !== null &&
      (!Number.isInteger(parsedDuration) || parsedDuration < 5 || parsedDuration > 720)
    ) {
      setError('Duration must be between 5 and 720 minutes.');
      return;
    }

    const parsedWeight = weightPercent.trim() ? Number(weightPercent) : null;
    if (
      parsedWeight !== null &&
      (Number.isNaN(parsedWeight) || parsedWeight < 0 || parsedWeight > 100)
    ) {
      setError('Weight must be between 0 and 100%.');
      return;
    }

    const topics = topicsText
      .split(/[\n,]/)
      .map((t) => t.trim())
      .filter(Boolean);

    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        courseId,
        title: trimmedTitle,
        examType,
        startsAt: startsAtDate.toISOString(),
        durationMinutes: parsedDuration,
        weightPercent: parsedWeight,
        venue: venue.trim() || null,
        topics,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not save exam.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={exam ? 'Edit exam' : 'Add exam'}
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
            <p className="font-medium">Add a course before scheduling an exam.</p>
            <Link
              to={path('/courses')}
              className="mt-1 inline-block font-semibold text-primary-600 underline"
            >
              Go to Courses
            </Link>
          </div>
        ) : null}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="exam-course" className="mb-1.5 block text-sm font-medium text-fg">
              Course
            </label>
            <select
              id="exam-course"
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

          <div>
            <label htmlFor="exam-type" className="mb-1.5 block text-sm font-medium text-fg">
              Exam type
            </label>
            <select
              id="exam-type"
              value={examType}
              onChange={(e) => setExamType(e.target.value as ExamType)}
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            >
              {(Object.entries(EXAM_TYPE_LABELS) as Array<[ExamType, string]>).map(([val, lbl]) => (
                <option key={val} value={val}>
                  {lbl}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Input
          label="Exam title"
          placeholder="e.g. Midterm Examination"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="exam-starts" className="mb-1.5 block text-sm font-medium text-fg">
              Date &amp; time
            </label>
            <input
              id="exam-starts"
              type="datetime-local"
              value={startsAtLocal}
              onChange={(e) => setStartsAtLocal(e.target.value)}
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              required
            />
          </div>
          <Input
            label="Venue (optional)"
            placeholder="e.g. NNB 3, Great Hall"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
          />
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input
            label="Duration (minutes, optional)"
            type="number"
            min={5}
            max={720}
            placeholder="e.g. 120"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
          />
          <Input
            label="Weight (% of grade, optional)"
            type="number"
            min={0}
            max={100}
            step={0.5}
            placeholder="e.g. 40"
            value={weightPercent}
            onChange={(e) => setWeightPercent(e.target.value)}
          />
        </div>

        <Textarea
          label="Topics to cover (comma or line separated)"
          rows={2}
          placeholder="e.g. Normalization, Indexing & B+ Trees, ACID Transactions"
          value={topicsText}
          onChange={(e) => setTopicsText(e.target.value)}
        />

        <Textarea
          label="Notes (optional)"
          rows={2}
          placeholder="Open book, calculator permitted, focus areas..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={courseOptions.length === 0}>
            {exam ? 'Save changes' : 'Add exam'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
