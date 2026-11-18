import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Modal, cn } from '../../design';
import type { CourseSummary } from './coursesApi';

export interface DeleteCourseModalProps {
  course: CourseSummary | null;
  onClose: () => void;
  onConfirm: (courseId: string, mode: 'unassign' | 'delete') => Promise<void>;
}

export function DeleteCourseModal({ course, onClose, onConfirm }: DeleteCourseModalProps) {
  const [mode, setMode] = useState<'unassign' | 'delete'>('unassign');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (course) {
      setMode('unassign');
      setError(null);
    }
  }, [course]);

  const linkedTotal = course
    ? course.noteCount +
      course.documentCount +
      course.taskCount +
      course.deckCount +
      course.quizCount
    : 0;

  const handleConfirm = async () => {
    if (!course) return;
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(course.id, mode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete course.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal open={Boolean(course)} onClose={onClose} title="Delete course" className="max-w-md">
      {course ? (
        <div className="space-y-4 p-5 pt-3 sm:p-6 sm:pt-3">
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-xs text-fg">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="leading-relaxed">
              You are about to delete <strong>{course.name}</strong>
              {linkedTotal > 0
                ? `. Choose what happens to its ${linkedTotal} linked item(s) across Notes, Documents, Planner, and Study.`
                : '.'}
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          ) : null}

          <div
            className="space-y-2.5"
            role="radiogroup"
            aria-label="Course items deletion behavior"
          >
            <div
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3.5 transition-colors',
                mode === 'unassign'
                  ? 'border-primary-500 bg-primary-50/70 dark:bg-primary-950/30'
                  : 'border-line bg-surface2/40 hover:border-primary-300',
              )}
            >
              <input
                id="course-delete-unassign"
                type="radio"
                name="course-delete-mode"
                value="unassign"
                checked={mode === 'unassign'}
                onChange={() => setMode('unassign')}
                className="mt-0.5 accent-primary-600"
              />
              <div>
                <label
                  htmlFor="course-delete-unassign"
                  className="block cursor-pointer text-sm font-medium text-fg"
                >
                  Keep items unassigned
                </label>
                <p className="mt-0.5 text-xs text-muted">
                  Remove only the course. Notes, documents, tasks, flashcards, quizzes, focus logs,
                  and AI chats stay in your workspace.
                </p>
              </div>
            </div>

            <div
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3.5 transition-colors',
                mode === 'delete'
                  ? 'border-danger bg-danger/10'
                  : 'border-line bg-surface2/40 hover:border-danger/50',
              )}
            >
              <input
                id="course-delete-purge"
                type="radio"
                name="course-delete-mode"
                value="delete"
                checked={mode === 'delete'}
                onChange={() => setMode('delete')}
                className="mt-0.5 accent-danger"
              />
              <div>
                <label
                  htmlFor="course-delete-purge"
                  className="block cursor-pointer text-sm font-medium text-danger"
                >
                  Delete course and all linked items
                </label>
                <p className="mt-0.5 text-xs text-muted">
                  Permanently delete this course along with every note, document, task, deck, quiz,
                  focus session, and AI chat assigned to it.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={deleting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleting}
              onClick={() => void handleConfirm()}
            >
              Delete course
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
