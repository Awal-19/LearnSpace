import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit3,
  FileText,
  GraduationCap,
  Layers,
  MapPin,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { useExperience } from '../../app/experience';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  useToast,
} from '../../design';
import { request } from '../../lib/apiClient';
import { ApiError } from '../../lib/apiClient';
import { EXAM_TYPE_LABELS, formatExamCountdown, type ExamType } from '../exams/examsApi';
import { CourseFormModal } from './CourseFormModal';
import { CourseRecommendedPanel } from './CourseRecommendedPanel';
import { DeleteCourseModal } from './DeleteCourseModal';
import {
  deleteCourse,
  formatStudyDuration,
  getCourseDetail,
  updateCourse,
  type CourseMutationPayload,
} from './coursesApi';

type DetailTab =
  'topics' | 'notes' | 'documents' | 'tasks' | 'flashcards' | 'quizzes' | 'exams' | 'recommended';

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const path = useAppPath();
  const exp = useExperience();
  const toast = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<DetailTab>(exp.isShs ? 'topics' : 'notes');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [topicSearch, setTopicSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const detailQuery = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => getCourseDetail(courseId!),
    enabled: Boolean(courseId),
    staleTime: 20_000,
  });

  const shsTopicsQuery = useQuery({
    queryKey: ['shs', 'subject-topics', courseId],
    queryFn: () =>
      request<{
        subjectId: string | null;
        topics: Array<{
          id: string;
          title: string;
          strand: string;
          subStrand: string | null;
          schoolYear: string | null;
          lessonReady: boolean;
          lessonStatus: string | null;
          estimatedMinutes: number;
          progressStatus: 'not_started' | 'in_progress' | 'completed';
          positionPct: number;
        }>;
      }>(`/shs/subjects/${courseId}/topics`),
    enabled: exp.isShs && Boolean(courseId),
    staleTime: 30_000,
  });

  const syllabusTopics = useMemo(() => shsTopicsQuery.data?.topics ?? [], [shsTopicsQuery.data]);
  const filteredTopics = useMemo(() => {
    const q = topicSearch.trim().toLowerCase();
    return syllabusTopics.filter((t) => {
      if (yearFilter && t.schoolYear !== yearFilter) return false;
      if (statusFilter && t.progressStatus !== statusFilter) return false;
      if (q && !t.title.toLowerCase().includes(q) && !t.strand.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [syllabusTopics, topicSearch, yearFilter, statusFilter]);

  const groupedTopics = useMemo(() => {
    const map = new Map<string, typeof filteredTopics>();
    for (const t of filteredTopics) {
      const key = t.strand || 'General Syllabus';
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [filteredTopics]);

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <Skeleton className="h-36 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(path('/courses'))}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to {exp.labels.coursePlural}
        </Button>
        <ErrorState
          title={`Could not load ${exp.labels.courseLower}`}
          message={
            detailQuery.error instanceof ApiError
              ? detailQuery.error.message
              : `This ${exp.labels.courseLower} could not be found.`
          }
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    );
  }

  const { course, notes, documents, tasks, decks, quizzes, upcomingExams, stats } =
    detailQuery.data;

  const invalidateAll = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['courses'] }),
      qc.invalidateQueries({ queryKey: ['course', course.id] }),
      qc.invalidateQueries({ queryKey: ['notes'] }),
      qc.invalidateQueries({ queryKey: ['documents'] }),
      qc.invalidateQueries({ queryKey: ['tasks'] }),
      qc.invalidateQueries({ queryKey: ['decks'] }),
      qc.invalidateQueries({ queryKey: ['quizzes'] }),
      qc.invalidateQueries({ queryKey: ['study-sessions'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);

  const handleSave = async (payload: CourseMutationPayload) => {
    await updateCourse(course.id, payload);
    await invalidateAll();
    toast.show({ kind: 'success', title: 'Course updated' });
  };

  const handleToggleArchive = async () => {
    await updateCourse(course.id, { archived: !course.archivedAt });
    await invalidateAll();
    toast.show({
      kind: 'success',
      title: course.archivedAt ? 'Course restored' : 'Course archived',
    });
  };

  const handleDelete = async (id: string, mode: 'unassign' | 'delete') => {
    await deleteCourse(id, mode);
    await invalidateAll();
    toast.show({ kind: 'success', title: `${exp.labels.courseSingular} deleted` });
    navigate(path('/courses'), { replace: true });
  };

  const tabs: Array<{ id: DetailTab; label: string; count?: number }> = [
    ...(exp.isShs
      ? [{ id: 'topics' as const, label: 'Syllabus Topics', count: syllabusTopics.length }]
      : []),
    { id: 'recommended', label: 'Recommended' },
    { id: 'notes', label: 'Notes', count: notes.length },
    { id: 'documents', label: exp.isShs ? 'Handouts' : 'Documents', count: documents.length },
    { id: 'tasks', label: 'Tasks', count: tasks.length },
    { id: 'flashcards', label: 'Flashcards', count: decks.length },
    { id: 'quizzes', label: 'Quizzes', count: quizzes.length },
    { id: 'exams', label: exp.labels.examPrep, count: upcomingExams.length },
  ];

  const accent = course.color ?? '#2563EB';
  const totalMaterials = notes.length + documents.length + decks.length + quizzes.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(path('/courses'))}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to {exp.labels.coursePlural}
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
            <Edit3 className="h-4 w-4" aria-hidden="true" />
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleToggleArchive()}
          >
            {course.archivedAt ? (
              <>
                <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                Restore
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" aria-hidden="true" />
                Archive
              </>
            )}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>

      {/* Course Header */}
      <Card className="relative overflow-hidden p-5 sm:p-6">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1.5"
          style={{ backgroundColor: accent }}
        />
        <div className="flex flex-wrap items-start justify-between gap-4 pt-1">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {exp.features.showCourseCode && course.code ? (
                <Badge tone="primary">{course.code}</Badge>
              ) : null}
              {exp.features.showCreditHours && course.creditHours !== null ? (
                <Badge tone="neutral">{course.creditHours} credit hours</Badge>
              ) : null}
              {course.semester ? <Badge tone="neutral">{course.semester}</Badge> : null}
              {course.level ? <Badge tone="neutral">{course.level}</Badge> : null}
              {course.archivedAt ? <Badge tone="warning">Archived</Badge> : null}
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              {course.name}
            </h1>
            {course.lecturer ? (
              <p className="text-sm text-muted">
                {exp.labels.teacher}: {course.lecturer}
              </p>
            ) : null}
            {course.notes ? (
              <p className="max-w-3xl text-sm leading-relaxed text-fg/85">{course.notes}</p>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Course KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex items-center gap-3.5 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-muted">Study time</p>
            <p className="text-lg font-bold text-fg tabular-nums">
              {formatStudyDuration(stats.studySeconds)}
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-3.5 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <GraduationCap className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-muted">Average quiz score</p>
            <p className="text-lg font-bold text-fg tabular-nums">
              {stats.averageQuizScore !== null
                ? `${Math.round(stats.averageQuizScore * 100)}%`
                : '—'}
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-3.5 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-muted">{exp.labels.courseSingular} tasks</p>
            <p className="text-lg font-bold text-fg tabular-nums">
              {stats.completedTasksCount}/{stats.openTasksCount + stats.completedTasksCount} done
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-3.5 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <Layers className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-muted">Linked materials</p>
            <p className="text-lg font-bold text-fg tabular-nums">{totalMaterials}</p>
          </div>
        </Card>
      </div>

      {/* Overview Tabs */}
      <div
        role="tablist"
        aria-label="Course overview sections"
        className="flex max-w-full flex-wrap gap-1 rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
              tab === item.id
                ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                : 'text-muted hover:text-fg'
            }`}
          >
            {item.label}
            {item.count !== undefined ? ` (${item.count})` : ''}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <Card className="p-5 sm:p-6">
        {tab === 'topics' && exp.isShs ? (
          shsTopicsQuery.isLoading ? (
            <Skeleton className="h-44 rounded-xl" />
          ) : syllabusTopics.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No syllabus topics linked yet"
              description="Custom subjects can still use Notes, Handouts, Flashcards, and WASSCE Exam Prep."
            />
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted">Tap a topic to read the lesson.</p>

              <div className="grid gap-2.5 sm:grid-cols-3">
                <Input
                  label="Search topics"
                  placeholder="Search by topic or strand..."
                  value={topicSearch}
                  onChange={(e) => setTopicSearch(e.target.value)}
                />
                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-fg">SHS Year</span>
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
                  >
                    <option value="">All years</option>
                    <option value="SHS 1">SHS 1</option>
                    <option value="SHS 2">SHS 2</option>
                    <option value="SHS 3">SHS 3</option>
                  </select>
                </label>
                <label className="block space-y-1 text-xs">
                  <span className="font-medium text-fg">Status</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
                  >
                    <option value="">All statuses</option>
                    <option value="not_started">Not started</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>
              </div>

              {groupedTopics.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted">
                  No topics match your current filter.
                </p>
              ) : (
                <div className="space-y-4">
                  {groupedTopics.map(([strand, items]) => (
                    <div key={strand} className="space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {strand}
                      </h3>
                      <div className="space-y-2">
                        {items.map((topic) => (
                          <Link
                            key={topic.id}
                            to={path(`/subjects/${course.id}/topics/${topic.id}`)}
                            className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-line bg-surface2/40 px-4 py-3 text-left transition hover:border-primary-300 hover:bg-primary-50/40 dark:hover:bg-primary-500/10"
                          >
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <p className="break-words text-sm font-medium leading-snug text-fg">
                                {topic.title}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                {topic.schoolYear ? (
                                  <Badge tone="neutral">{topic.schoolYear}</Badge>
                                ) : null}
                                <Badge
                                  tone={
                                    topic.progressStatus === 'completed'
                                      ? 'success'
                                      : topic.progressStatus === 'in_progress'
                                        ? 'primary'
                                        : 'neutral'
                                  }
                                >
                                  {topic.progressStatus === 'completed'
                                    ? 'Completed'
                                    : topic.progressStatus === 'in_progress'
                                      ? 'In progress'
                                      : 'Not started'}
                                </Badge>
                                <span className="text-muted">{topic.estimatedMinutes} min</span>
                                {topic.lessonReady ? (
                                  <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                                    <Sparkles className="h-3 w-3" aria-hidden="true" /> Ready
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <ChevronRight
                              className="h-4 w-4 shrink-0 text-muted"
                              aria-hidden="true"
                            />
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : null}

        {tab === 'recommended' ? <CourseRecommendedPanel courseId={course.id} /> : null}

        {tab === 'notes' ? (
          notes.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No notes for this course yet"
              description="Assign notes to this course from the Notes page to organize lecture summaries."
              action={
                <Link to={path('/notes')}>
                  <Button size="sm">Open Notes</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-line/70">
              {notes.map((n) => (
                <Link
                  key={n.id}
                  to={path(`/notes/${n.id}`)}
                  className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-primary-600"
                >
                  <span className="truncate font-medium">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {new Date(n.updatedAt).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          )
        ) : null}

        {tab === 'documents' ? (
          documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents linked yet"
              description="Upload past questions, slides, or notes and link them to this course."
              action={
                <Link to={path('/documents')}>
                  <Button size="sm">Open Documents</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-line/70">
              {documents.map((d) => (
                <Link
                  key={d.id}
                  to={path(`/documents/${d.id}`)}
                  className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-primary-600"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.title}</p>
                    <p className="text-xs text-muted">
                      {d.originalName} · {d.pageCount || 1} page(s)
                    </p>
                  </div>
                  <Badge tone="neutral">{d.status}</Badge>
                </Link>
              ))}
            </div>
          )
        ) : null}

        {tab === 'tasks' ? (
          tasks.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No tasks assigned"
              description="Create coursework deadlines or study tasks for this course in Planner."
              action={
                <Link to={path('/planner')}>
                  <Button size="sm">Open Planner</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-line/70">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p
                      className={
                        t.status === 'done' ? 'line-through text-muted' : 'font-medium text-fg'
                      }
                    >
                      {t.title}
                    </p>
                    {t.dueAt ? (
                      <p className="text-xs text-muted">Due {new Date(t.dueAt).toLocaleString()}</p>
                    ) : null}
                  </div>
                  <Badge tone={t.status === 'done' ? 'success' : 'neutral'}>
                    {t.status === 'done' ? 'Completed' : t.priority}
                  </Badge>
                </div>
              ))}
            </div>
          )
        ) : null}

        {tab === 'flashcards' ? (
          decks.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No flashcard decks linked"
              description="Create or generate flashcard decks for this course inside Study."
              action={
                <Link to={path('/study')}>
                  <Button size="sm">Open Study</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-line/70">
              {decks.map((deck) => (
                <Link
                  key={deck.id}
                  to={path('/study')}
                  className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-primary-600"
                >
                  <span className="truncate font-medium">{deck.title}</span>
                  <Badge tone="primary">{deck.cardCount} cards</Badge>
                </Link>
              ))}
            </div>
          )
        ) : null}

        {tab === 'quizzes' ? (
          quizzes.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="No quizzes linked yet"
              description="Generate course quizzes inside Study to track scores over time."
              action={
                <Link to={path('/study')}>
                  <Button size="sm">Open Study</Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-line/70">
              {quizzes.map((q) => (
                <Link
                  key={q.id}
                  to={path('/study')}
                  className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-primary-600"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{q.title}</p>
                    <p className="text-xs text-muted">
                      {q.questionCount} questions · {q.attempts} attempt(s)
                    </p>
                  </div>
                  {q.bestScore !== null ? (
                    <Badge tone="success">Best {Math.round(q.bestScore * 100)}%</Badge>
                  ) : (
                    <Badge tone="neutral">Not attempted</Badge>
                  )}
                </Link>
              ))}
            </div>
          )
        ) : null}

        {tab === 'exams' ? (
          upcomingExams.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No upcoming exams for this course"
              description="Exam countdowns and AI revision sessions linked to this course will appear here."
              action={
                <Link to={path('/exams')}>
                  <Button size="sm">Open Exams &amp; Revision</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {upcomingExams.map((exam) => {
                const cd = formatExamCountdown(exam.startsAt);
                const typeLabel = EXAM_TYPE_LABELS[exam.examType as ExamType] ?? exam.examType;
                return (
                  <div
                    key={exam.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line/80 bg-surface2/30 p-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={cd.tone}>{cd.label}</Badge>
                        <Badge tone="neutral">{typeLabel}</Badge>
                        {exam.weightPercent !== null && exam.weightPercent !== undefined ? (
                          <Badge tone="neutral">{exam.weightPercent}%</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold text-fg">{exam.title}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {new Date(exam.startsAt).toLocaleString()}
                        </span>
                        {exam.venue ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                            {exam.venue}
                          </span>
                        ) : null}
                      </div>
                      {exam.topics && exam.topics.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {exam.topics.map((topic) => (
                            <span
                              key={topic}
                              className="rounded-md bg-surface px-2 py-0.5 text-[11px] text-fg/85 ring-1 ring-line/60"
                            >
                              {topic}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Link
                      to={path('/exams')}
                      className="text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
                    >
                      Revision plan
                    </Link>
                  </div>
                );
              })}
            </div>
          )
        ) : null}
      </Card>

      <CourseFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        course={course}
        onSubmit={handleSave}
      />

      <DeleteCourseModal
        course={deleteOpen ? course : null}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
