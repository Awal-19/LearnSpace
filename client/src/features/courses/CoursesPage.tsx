import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  BookMarked,
  BookOpen,
  CalendarCheck,
  Clock,
  Edit3,
  FileText,
  GraduationCap,
  Layers,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { CourseFormModal } from './CourseFormModal';
import { DeleteCourseModal } from './DeleteCourseModal';
import {
  createCourse,
  deleteCourse,
  formatStudyDuration,
  listCourses,
  updateCourse,
  type CourseMutationPayload,
  type CourseSummary,
} from './coursesApi';

function invalidateCourseDependents(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['courses'] }),
    qc.invalidateQueries({ queryKey: ['notes'] }),
    qc.invalidateQueries({ queryKey: ['documents'] }),
    qc.invalidateQueries({ queryKey: ['tasks'] }),
    qc.invalidateQueries({ queryKey: ['decks'] }),
    qc.invalidateQueries({ queryKey: ['quizzes'] }),
    qc.invalidateQueries({ queryKey: ['conversations'] }),
    qc.invalidateQueries({ queryKey: ['study-sessions'] }),
    qc.invalidateQueries({ queryKey: ['dashboard'] }),
  ]);
}

export function CoursesPage() {
  const path = useAppPath();
  const toast = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [search, setSearch] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseSummary | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<CourseSummary | null>(null);

  const coursesQuery = useQuery({
    queryKey: ['courses', 'all'],
    queryFn: () => listCourses({ archived: 'all' }),
    staleTime: 30_000,
  });

  const allCourses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);

  const semesters = useMemo(() => {
    const set = new Set<string>();
    for (const c of allCourses) {
      if (c.semester?.trim()) set.add(c.semester.trim());
    }
    return Array.from(set).sort();
  }, [allCourses]);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allCourses.filter((c) => {
      const isArchived = Boolean(c.archivedAt);
      if (tab === 'active' && isArchived) return false;
      if (tab === 'archived' && !isArchived) return false;
      if (semesterFilter && c.semester !== semesterFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.code?.toLowerCase().includes(q) ?? false) ||
        (c.lecturer?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [allCourses, tab, semesterFilter, search]);

  const activeCount = allCourses.filter((c) => !c.archivedAt).length;
  const archivedCount = allCourses.filter((c) => Boolean(c.archivedAt)).length;

  const handleSaveCourse = async (payload: CourseMutationPayload) => {
    try {
      if (editingCourse) {
        await updateCourse(editingCourse.id, payload);
        toast.show({ kind: 'success', title: 'Course updated' });
      } else {
        await createCourse(payload);
        toast.show({ kind: 'success', title: 'Course created' });
      }
      await invalidateCourseDependents(qc);
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : 'Could not save course.');
    }
  };

  const handleToggleArchive = async (course: CourseSummary) => {
    const nextArchived = !course.archivedAt;
    try {
      await updateCourse(course.id, { archived: nextArchived });
      await invalidateCourseDependents(qc);
      toast.show({
        kind: 'success',
        title: nextArchived ? 'Course archived' : 'Course restored',
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Update failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleDeleteCourse = async (courseId: string, mode: 'unassign' | 'delete') => {
    try {
      await deleteCourse(courseId, mode);
      await invalidateCourseDependents(qc);
      toast.show({
        kind: 'success',
        title: mode === 'delete' ? 'Course and linked items deleted' : 'Course deleted',
      });
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <BookMarked className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">Courses</h1>
            <p className="mt-0.5 text-sm text-muted">
              Organize your semester modules, track linked study materials, and monitor course
              progress.
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => {
            setEditingCourse(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add course
        </Button>
      </div>

      {/* Filters & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Course status"
          className="inline-flex rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'active'}
            onClick={() => setTab('active')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              tab === 'active'
                ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                : 'text-muted hover:text-fg'
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'archived'}
            onClick={() => setTab('archived')}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              tab === 'archived'
                ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                : 'text-muted hover:text-fg'
            }`}
          >
            Archived ({archivedCount})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, lecturer..."
              aria-label="Search courses"
              className="h-9 rounded-xl border border-line bg-surface2/50 pl-9 pr-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            />
          </div>

          {semesters.length > 0 ? (
            <select
              aria-label="Filter by semester"
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
              className="h-9 rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            >
              <option value="">All semesters</option>
              {semesters.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {/* Course Cards Grid */}
      {coursesQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : coursesQuery.isError ? (
        <ErrorState
          title="Could not load courses"
          message="Check your connection and try again."
          onRetry={() => void coursesQuery.refetch()}
        />
      ) : filteredCourses.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={BookMarked}
            title={
              tab === 'archived'
                ? 'No archived courses'
                : search || semesterFilter
                  ? 'No matching courses'
                  : 'No courses yet'
            }
            description={
              tab === 'archived'
                ? 'Completed courses you archive will appear here for reference.'
                : 'Add your courses to organize notes, lecture documents, tasks, flashcards, and study time.'
            }
            action={
              tab === 'active' && !search && !semesterFilter ? (
                <Button
                  type="button"
                  onClick={() => {
                    setEditingCourse(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add your first course
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCourses.map((course) => {
            const accent = course.color ?? '#2563EB';
            return (
              <Card
                key={course.id}
                className="group relative flex flex-col justify-between overflow-hidden border-line/90 p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ backgroundColor: accent }}
                />

                <div>
                  <div className="flex items-start justify-between gap-2 pt-1">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {course.code ? (
                          <Badge tone="primary" className="font-semibold">
                            {course.code}
                          </Badge>
                        ) : null}
                        {course.creditHours !== null ? (
                          <Badge tone="neutral">{course.creditHours} cr</Badge>
                        ) : null}
                        {course.semester ? <Badge tone="neutral">{course.semester}</Badge> : null}
                      </div>

                      <Link
                        to={path(`/courses/${course.id}`)}
                        className="mt-2 block font-display text-base font-semibold text-fg transition-colors hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        {course.name}
                      </Link>
                    </div>

                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`Edit ${course.name}`}
                        onClick={() => {
                          setEditingCourse(course);
                          setFormOpen(true);
                        }}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-fg"
                      >
                        <Edit3 className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={
                          course.archivedAt ? `Restore ${course.name}` : `Archive ${course.name}`
                        }
                        onClick={() => void handleToggleArchive(course)}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-fg"
                      >
                        {course.archivedAt ? (
                          <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Archive className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${course.name}`}
                        onClick={() => setDeletingCourse(course)}
                        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {course.lecturer || course.level ? (
                    <p className="mt-1.5 truncate text-xs text-muted">
                      {[course.lecturer, course.level].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}

                  {course.notes ? (
                    <p className="mt-2 line-clamp-2 text-xs text-muted/90">{course.notes}</p>
                  ) : null}
                </div>

                <div className="mt-4 space-y-3 border-t border-line/70 pt-3.5">
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted">
                    <span className="inline-flex items-center gap-1" title="Notes">
                      <BookOpen className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                      {course.noteCount} notes
                    </span>
                    <span className="inline-flex items-center gap-1" title="Documents">
                      <FileText className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                      {course.documentCount} docs
                    </span>
                    <span className="inline-flex items-center gap-1" title="Tasks">
                      <CalendarCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      {course.taskCount} tasks
                    </span>
                    <span className="inline-flex items-center gap-1" title="Flashcard decks">
                      <Layers className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      {course.deckCount} decks
                    </span>
                    <span className="inline-flex items-center gap-1" title="Quizzes">
                      <GraduationCap className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      {course.quizCount} quizzes
                    </span>
                    <span className="inline-flex items-center gap-1" title="Focus time">
                      <Clock className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                      {formatStudyDuration(course.studySeconds)}
                    </span>
                  </div>

                  <Link
                    to={path(`/courses/${course.id}`)}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-line bg-surface2/50 py-2 text-xs font-medium text-fg transition-colors hover:border-primary-300 hover:bg-primary-50/70 hover:text-primary-700 dark:hover:bg-primary-500/15 dark:hover:text-primary-300"
                  >
                    Open course hub
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CourseFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        course={editingCourse}
        onSubmit={handleSaveCourse}
      />

      <DeleteCourseModal
        course={deletingCourse}
        onClose={() => setDeletingCourse(null)}
        onConfirm={handleDeleteCourse}
      />
    </div>
  );
}
