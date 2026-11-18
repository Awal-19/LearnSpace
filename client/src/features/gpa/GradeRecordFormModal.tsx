import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Button, Checkbox, Input, Modal, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import type { CourseSummary } from '../courses/coursesApi';
import {
  createGradeRecord,
  updateGradeRecord,
  type AnnotatedGradeRecord,
  type GradingScaleConfig,
} from './gpaApi';

interface GradeRecordFormModalProps {
  open: boolean;
  scale: GradingScaleConfig;
  courses: CourseSummary[];
  initialRecord?: AnnotatedGradeRecord | null;
  retakeSource?: AnnotatedGradeRecord | null;
  defaultSemester?: string;
  defaultSemesterOrder?: number;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function previewBoundaryByScore(scale: GradingScaleConfig, rawScore: string) {
  const num = Number(rawScore);
  if (rawScore.trim() === '' || !Number.isFinite(num) || num < 0 || num > 100) return null;
  const sorted = [...scale.boundaries].sort((a, b) => b.minScore - a.minScore);
  return (
    sorted.find((b) => num >= b.minScore && num <= b.maxScore) ??
    sorted.find((b) => num >= b.minScore) ??
    sorted.at(-1) ??
    null
  );
}

export function GradeRecordFormModal({
  open,
  scale,
  courses,
  initialRecord = null,
  retakeSource = null,
  defaultSemester = 'Year 1 Semester 1',
  defaultSemesterOrder = 1,
  onClose,
  onSaved,
}: GradeRecordFormModalProps) {
  const toast = useToast();
  const courseSelectId = useId();
  const gradeSelectId = useId();

  const [courseId, setCourseId] = useState('');
  const [semester, setSemester] = useState(defaultSemester);
  const [semesterOrder, setSemesterOrder] = useState(String(defaultSemesterOrder));
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [creditHours, setCreditHours] = useState('3');
  const [entryMode, setEntryMode] = useState<'score' | 'grade'>('score');
  const [score, setScore] = useState('');
  const [gradeLabel, setGradeLabel] = useState(scale.boundaries[0]?.label ?? 'A');
  const [isRetake, setIsRetake] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialRecord) {
      setCourseId(initialRecord.courseId ?? '');
      setSemester(initialRecord.semester);
      setSemesterOrder(String(initialRecord.semesterOrder));
      setCourseCode(initialRecord.courseCode);
      setCourseTitle(initialRecord.courseTitle);
      setCreditHours(String(initialRecord.creditHours));
      setEntryMode(initialRecord.score !== null ? 'score' : 'grade');
      setScore(initialRecord.score !== null ? String(initialRecord.score) : '');
      setGradeLabel(initialRecord.gradeLabel);
      setIsRetake(initialRecord.isRetake);
    } else if (retakeSource) {
      setCourseId(retakeSource.courseId ?? '');
      setSemester(`Retake · ${defaultSemester}`);
      setSemesterOrder(String(Math.max(defaultSemesterOrder, retakeSource.semesterOrder + 1)));
      setCourseCode(retakeSource.courseCode);
      setCourseTitle(retakeSource.courseTitle);
      setCreditHours(String(retakeSource.creditHours));
      setEntryMode('score');
      setScore('');
      setGradeLabel(scale.boundaries[0]?.label ?? 'A');
      setIsRetake(true);
    } else {
      setCourseId('');
      setSemester(defaultSemester);
      setSemesterOrder(String(defaultSemesterOrder));
      setCourseCode('');
      setCourseTitle('');
      setCreditHours('3');
      setEntryMode('score');
      setScore('');
      setGradeLabel(scale.boundaries[0]?.label ?? 'A');
      setIsRetake(false);
    }
  }, [open, initialRecord, retakeSource, defaultSemester, defaultSemesterOrder, scale]);

  const resolvedFromScore = useMemo(() => previewBoundaryByScore(scale, score), [scale, score]);

  const handleCoursePick = (nextId: string) => {
    setCourseId(nextId);
    const matched = courses.find((c) => c.id === nextId);
    if (!matched) return;
    if (!courseCode.trim() && matched.code) setCourseCode(matched.code);
    if (!courseTitle.trim()) setCourseTitle(matched.name);
    if (matched.creditHours !== null) setCreditHours(String(matched.creditHours));
    if (matched.semester) setSemester(matched.semester);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsedCredits = Number(creditHours);
    if (!Number.isFinite(parsedCredits) || parsedCredits < 0 || parsedCredits > 30) {
      toast.show({ kind: 'error', title: 'Credit hours must be between 0 and 30' });
      return;
    }

    if (entryMode === 'score') {
      const parsedScore = Number(score);
      if (
        score.trim() === '' ||
        !Number.isFinite(parsedScore) ||
        parsedScore < 0 ||
        parsedScore > 100
      ) {
        toast.show({ kind: 'error', title: 'Enter a valid score from 0 to 100' });
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        courseId: courseId || null,
        scaleId: scale.id,
        semester: semester.trim(),
        semesterOrder: Math.max(1, Math.round(Number(semesterOrder) || 1)),
        courseCode: courseCode.trim().toUpperCase(),
        courseTitle: courseTitle.trim(),
        creditHours: parsedCredits,
        ...(entryMode === 'score'
          ? { score: Number(score) }
          : { score: null, gradeLabel: gradeLabel.trim() }),
        isRetake,
      };

      if (initialRecord) {
        await updateGradeRecord(initialRecord.id, payload);
        toast.show({ kind: 'success', title: 'Grade record updated' });
      } else {
        await createGradeRecord(payload);
        toast.show({ kind: 'success', title: 'Grade record added' });
      }
      await onSaved();
      onClose();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not save grade',
        description: err instanceof ApiError ? err.message : 'Check the inputs and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        initialRecord
          ? 'Edit grade record'
          : retakeSource
            ? 'Record course retake'
            : 'Add course grade'
      }
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {courses.length > 0 ? (
          <div>
            <label htmlFor={courseSelectId} className="mb-1.5 block text-xs font-medium text-fg">
              Link to existing course (optional)
            </label>
            <select
              id={courseSelectId}
              value={courseId}
              onChange={(e) => handleCoursePick(e.target.value)}
              className="h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-fg focus:border-primary-500 focus:outline-none"
            >
              <option value="">Custom / Manual course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} · ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input
              label="Semester"
              placeholder="e.g. Level 200 Sem 1"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              required
            />
          </div>
          <Input
            label="Order"
            type="number"
            min={1}
            max={50}
            value={semesterOrder}
            onChange={(e) => setSemesterOrder(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Course code"
            placeholder="e.g. CSCD 204"
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            required
          />
          <div className="sm:col-span-2">
            <Input
              label="Course title"
              placeholder="e.g. Data Structures"
              value={courseTitle}
              onChange={(e) => setCourseTitle(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Credit hours (0 allowed)"
            type="number"
            min={0}
            max={30}
            step={0.5}
            value={creditHours}
            onChange={(e) => setCreditHours(e.target.value)}
            required
          />

          <div>
            <span className="mb-1.5 block text-sm font-medium text-fg">Grade input mode</span>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-surface2 p-1">
              <button
                type="button"
                onClick={() => setEntryMode('score')}
                className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  entryMode === 'score' ? 'bg-surface text-primary-600 shadow-sm' : 'text-muted'
                }`}
              >
                Score (0–100)
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('grade')}
                className={`rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  entryMode === 'grade' ? 'bg-surface text-primary-600 shadow-sm' : 'text-muted'
                }`}
              >
                Letter grade
              </button>
            </div>
          </div>
        </div>

        {entryMode === 'score' ? (
          <div className="space-y-1.5">
            <Input
              label="Percentage score (0–100)"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="e.g. 78"
              required
            />
            {resolvedFromScore ? (
              <p className="text-xs text-primary-600 dark:text-primary-400">
                Resolves to{' '}
                <strong>
                  {resolvedFromScore.label} ({resolvedFromScore.gradePoint.toFixed(2)} pts)
                </strong>{' '}
                on {scale.name}
              </p>
            ) : null}
          </div>
        ) : (
          <div>
            <label htmlFor={gradeSelectId} className="mb-1.5 block text-sm font-medium text-fg">
              Letter grade
            </label>
            <select
              id={gradeSelectId}
              value={gradeLabel}
              onChange={(e) => setGradeLabel(e.target.value)}
              className="h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm text-fg focus:border-primary-500 focus:outline-none"
            >
              {scale.boundaries.map((b) => (
                <option key={b.label} value={b.label}>
                  {b.label} ({b.gradePoint.toFixed(2)} pts
                  {b.excludeFromGpa ? ' · Excluded from GPA' : ''})
                </option>
              ))}
            </select>
          </div>
        )}

        <Checkbox
          label="Mark as retake of a previous attempt with the same course code"
          checked={isRetake}
          onChange={(e) => setIsRetake(e.target.checked)}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={submitting}>
            {initialRecord ? 'Save changes' : 'Add grade'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
