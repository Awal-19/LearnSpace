import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Clock, Edit3, MapPin, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useAppPath } from '../../app/basePath';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  Skeleton,
  useToast,
} from '../../design';
import { ApiError } from '../../lib/apiClient';
import { CourseBadge } from '../courses/CourseBadge';
import { CourseSelect } from '../courses/CourseSelect';
import { listCourses } from '../courses/coursesApi';
import { ExamFormModal } from './ExamFormModal';
import { RevisionPlannerPanel } from './RevisionPlannerPanel';
import { WasscePrepPanel } from '../shs/WasscePrepPanel';
import {
  EXAM_TYPE_LABELS,
  createExam,
  deleteExam,
  formatExamCountdown,
  listExams,
  updateExam,
  type ExamItem,
  type ExamMutationPayload,
} from './examsApi';

export function ExamsPage() {
  const { user } = useAuth();
  const isShs = user?.learnerType === 'shs';
  const path = useAppPath();
  const toast = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<'exams' | 'revision' | 'wassce'>(isShs ? 'wassce' : 'exams');
  const [courseFilter, setCourseFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamItem | null>(null);
  const [deletingExam, setDeletingExam] = useState<ExamItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const examsQuery = useQuery({
    queryKey: ['exams', courseFilter],
    queryFn: () => listExams(courseFilter ? { courseId: courseFilter } : undefined),
  });

  const coursesQuery = useQuery({
    queryKey: ['courses', 'active'],
    queryFn: () => listCourses({ archived: 'active' }).catch(() => []),
  });

  const exams = useMemo(() => examsQuery.data?.items ?? [], [examsQuery.data?.items]);
  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const timezone = examsQuery.data?.timezone ?? 'UTC';

  const upcomingCount = useMemo(() => {
    const now = Date.now();
    return exams.filter((e) => new Date(e.startsAt).getTime() >= now).length;
  }, [exams]);

  const invalidateAll = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['exams'] }),
      qc.invalidateQueries({ queryKey: ['courses'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);

  const handleSaveExam = async (payload: ExamMutationPayload) => {
    if (editingExam) {
      await updateExam(editingExam.id, payload);
      toast.show({ kind: 'success', title: 'Exam updated' });
    } else {
      await createExam(payload);
      toast.show({ kind: 'success', title: 'Exam added' });
    }
    await invalidateAll();
  };

  const handleConfirmDelete = async () => {
    if (!deletingExam) return;
    setDeleting(true);
    try {
      await deleteExam(deletingExam.id);
      await invalidateAll();
      toast.show({ kind: 'success', title: 'Exam removed' });
      setDeletingExam(null);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not remove exam',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <CalendarClock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
              Exams &amp; Revision
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Track exam countdowns and generate AI day-by-day revision schedules synced to your
              Planner ({timezone}).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="button" variant="secondary" onClick={() => setTab('revision')}>
            <Sparkles
              className="h-4 w-4 text-primary-600 dark:text-primary-400"
              aria-hidden="true"
            />
            AI Revision Plan
          </Button>
          <Button
            type="button"
            onClick={() => {
              setEditingExam(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add exam
          </Button>
        </div>
      </div>

      {/* Tabs + Course Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Exam sections"
          className="inline-flex rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'exams'}
            onClick={() => setTab('exams')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              tab === 'exams'
                ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                : 'text-muted hover:text-fg'
            }`}
          >
            Exam countdowns ({upcomingCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'revision'}
            onClick={() => setTab('revision')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              tab === 'revision'
                ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                : 'text-muted hover:text-fg'
            }`}
          >
            AI Revision Plan
          </button>
          {isShs ? (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'wassce'}
              onClick={() => setTab('wassce')}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                tab === 'wassce'
                  ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                  : 'text-muted hover:text-fg'
              }`}
            >
              WASSCE Prep
            </button>
          ) : null}
        </div>

        {tab === 'exams' ? (
          <CourseSelect
            ariaLabel="Filter exams by course"
            mode="filter"
            emptyLabel="All courses"
            value={courseFilter}
            onChange={(val) => setCourseFilter(val === 'none' ? '' : val)}
            courses={courses}
            className="h-9 text-xs"
          />
        ) : null}
      </div>

      {/* Main Content */}
      {tab === 'wassce' && isShs ? (
        <WasscePrepPanel courses={courses} />
      ) : tab === 'revision' ? (
        <RevisionPlannerPanel exams={exams} courses={courses} />
      ) : examsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      ) : examsQuery.isError ? (
        <ErrorState title="Could not load exams" onRetry={() => void examsQuery.refetch()} />
      ) : exams.length === 0 ? (
        <Card className="p-8 sm:p-10">
          <EmptyState
            icon={CalendarClock}
            title="No exams scheduled yet"
            description="Add your midterms, finals, practicals, or quizzes to track countdowns and build an AI revision plan."
            action={
              courses.length === 0 ? (
                <Link to={path('/courses')}>
                  <Button type="button">Add a course first</Button>
                </Link>
              ) : (
                <Button
                  type="button"
                  onClick={() => {
                    setEditingExam(null);
                    setModalOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add first exam
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {exams.map((exam) => {
            const countdown = formatExamCountdown(exam.startsAt);
            const accent = exam.course.color ?? '#2563EB';
            return (
              <Card
                key={exam.id}
                className="relative flex flex-col justify-between overflow-hidden p-5"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ backgroundColor: accent }}
                />

                <div className="space-y-3 pt-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={countdown.tone}>{countdown.label}</Badge>
                      <Badge tone="neutral">{EXAM_TYPE_LABELS[exam.examType]}</Badge>
                      {exam.weightPercent !== null ? (
                        <Badge tone="neutral">{exam.weightPercent}%</Badge>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`Edit ${exam.title}`}
                        onClick={() => {
                          setEditingExam(exam);
                          setModalOpen(true);
                        }}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-fg"
                      >
                        <Edit3 className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${exam.title}`}
                        onClick={() => setDeletingExam(exam)}
                        className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <CourseBadge
                      course={{
                        id: exam.courseId,
                        name: exam.course.name,
                        code: exam.course.code,
                        color: exam.course.color,
                      }}
                      link
                    />
                    <h2 className="mt-2 font-display text-base font-bold text-fg">{exam.title}</h2>
                  </div>

                  <div className="space-y-1 text-xs text-muted">
                    <p className="flex items-center gap-1.5 text-fg">
                      <Clock className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                      {new Date(exam.startsAt).toLocaleString()}
                      {exam.durationMinutes ? ` · ${exam.durationMinutes} min` : ''}
                    </p>
                    {exam.venue ? (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        {exam.venue}
                      </p>
                    ) : null}
                  </div>

                  {exam.topics.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {exam.topics.map((t) => (
                        <span
                          key={t}
                          className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] text-fg/85"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {exam.notes ? (
                    <p className="line-clamp-2 text-xs text-muted/90">{exam.notes}</p>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ExamFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        exam={editingExam}
        courses={courses}
        onSubmit={handleSaveExam}
      />

      <Modal
        open={Boolean(deletingExam)}
        onClose={() => setDeletingExam(null)}
        title="Delete exam"
        className="max-w-md"
      >
        {deletingExam ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Remove <strong className="text-fg">{deletingExam.title}</strong>? Existing Planner
              tasks will remain unless deleted separately.
            </p>
            <div className="flex justify-end gap-2.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeletingExam(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={deleting}
                onClick={() => void handleConfirmDelete()}
              >
                Delete exam
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
