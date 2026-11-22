import { useEffect, useState, type FormEvent } from 'react';
import { useExperience } from '../../app/experience';
import { Button, Input, Modal, Textarea, cn } from '../../design';
import { COURSE_COLORS, type CourseMutationPayload, type CourseSummary } from './coursesApi';

export interface CourseFormModalProps {
  open: boolean;
  onClose: () => void;
  course?: CourseSummary | null;
  onSubmit: (payload: CourseMutationPayload) => Promise<void>;
}

export function CourseFormModal({ open, onClose, course, onSubmit }: CourseFormModalProps) {
  const exp = useExperience();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [lecturer, setLecturer] = useState('');
  const [creditHours, setCreditHours] = useState('');
  const [semester, setSemester] = useState('');
  const [level, setLevel] = useState('');
  const [color, setColor] = useState<string>(COURSE_COLORS[0].hex);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(course?.name ?? '');
    setCode(course?.code ?? '');
    setLecturer(course?.lecturer ?? '');
    setCreditHours(
      course?.creditHours !== null && course?.creditHours !== undefined
        ? String(course.creditHours)
        : '',
    );
    setSemester(course?.semester ?? '');
    setLevel(course?.level ?? '');
    setColor(course?.color ?? COURSE_COLORS[0].hex);
    setNotes(course?.notes ?? '');
    setError(null);
  }, [open, course]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(`${exp.labels.courseSingular} name is required.`);
      return;
    }

    const parsedCredits =
      !exp.features.showCreditHours || creditHours.trim() === '' ? null : Number(creditHours);
    if (
      parsedCredits !== null &&
      (Number.isNaN(parsedCredits) || parsedCredits < 0 || parsedCredits > 30)
    ) {
      setError('Credit hours must be between 0 and 30.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSubmit({
        name: trimmedName,
        code: exp.features.showCourseCode ? code.trim() || null : null,
        lecturer: lecturer.trim() || null,
        creditHours: parsedCredits,
        semester: semester.trim() || null,
        level: level.trim() || null,
        color,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not save ${exp.labels.courseLower}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={course ? `Edit ${exp.labels.courseLower}` : `Add ${exp.labels.courseLower}`}
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-5 pt-3 sm:p-6 sm:pt-3">
        {error ? (
          <div
            role="alert"
            className="rounded-xl border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-xs font-medium text-danger"
          >
            {error}
          </div>
        ) : null}

        <div className={exp.features.showCourseCode ? 'grid gap-3.5 sm:grid-cols-[1fr_140px]' : ''}>
          <Input
            label={`${exp.labels.courseSingular} name`}
            placeholder={exp.isShs ? 'e.g. Core Mathematics' : 'e.g. Data Structures & Algorithms'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {exp.features.showCourseCode ? (
            <Input
              label="Course code"
              placeholder="e.g. CSCD 204"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          ) : null}
        </div>

        <div className={exp.features.showCreditHours ? 'grid gap-3.5 sm:grid-cols-2' : ''}>
          <Input
            label={exp.isShs ? `${exp.labels.teacher} (optional)` : exp.labels.teacher}
            placeholder={exp.isShs ? 'e.g. Mr. Boateng' : 'e.g. Dr. Mensah'}
            value={lecturer}
            onChange={(e) => setLecturer(e.target.value)}
          />
          {exp.features.showCreditHours ? (
            <Input
              label="Credit hours"
              type="number"
              min={0}
              max={30}
              step={0.5}
              placeholder="e.g. 3"
              value={creditHours}
              onChange={(e) => setCreditHours(e.target.value)}
            />
          ) : null}
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          {exp.labels.termOptions.length > 0 ? (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-fg">{exp.labels.term} (optional)</span>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
              >
                <option value="">Select term</option>
                {exp.labels.termOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Input
              label={exp.labels.term}
              placeholder="e.g. 2026 Semester 1"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            />
          )}
          {exp.isShs ? (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-fg">{exp.labels.level} (optional)</span>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
              >
                <option value="">Select year</option>
                {exp.labels.levelOptions.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Input
              label={exp.labels.level}
              placeholder="e.g. Level 200"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            />
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-medium text-fg">Color badge</p>
          <div className="flex flex-wrap items-center gap-2">
            {COURSE_COLORS.map((swatch) => {
              const selected = color.toUpperCase() === swatch.hex;
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  aria-label={`Select ${swatch.label}`}
                  aria-pressed={selected}
                  onClick={() => setColor(swatch.hex)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-transform hover:scale-110',
                    selected
                      ? 'border-fg ring-2 ring-primary-500/40 scale-110'
                      : 'border-transparent',
                  )}
                  style={{ backgroundColor: swatch.hex }}
                />
              );
            })}
          </div>
        </div>

        <Textarea
          label={`${exp.labels.courseSingular} notes (optional)`}
          rows={3}
          placeholder={
            exp.isShs
              ? 'Topics to focus on, teacher notes, or revision goals...'
              : 'Syllabus link, assessment weights, lab group, or office hours...'
          }
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {course ? 'Save changes' : `Create ${exp.labels.courseLower}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
