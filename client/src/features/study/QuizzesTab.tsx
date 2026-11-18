import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, GraduationCap, Sparkles, Trash2, XCircle } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
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
import { ApiError, request } from '../../lib/apiClient';
import { CourseBadge } from '../courses/CourseBadge';
import { CourseSelect } from '../courses/CourseSelect';
import { listCourses } from '../courses/coursesApi';

interface QuizSummary {
  id: string;
  title: string;
  topic: string | null;
  courseId: string | null;
  questionCount: number;
  attempts: number;
  bestScore: number | null;
  lastScore: number | null;
}

interface QuizToTake {
  id: string;
  title: string;
  topic: string | null;
  courseId: string | null;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
}

interface AttemptResult {
  attemptId: string;
  score: number;
  total: number;
  takenAt: string;
  results: Array<{
    questionId: string;
    chosenIndex: number | null;
    correctIndex: number;
    correct: boolean;
    explanation: string;
  }>;
}

interface AttemptHistoryItem {
  id: string;
  quizId: string;
  score: number;
  total: number;
  takenAt: string;
  quiz: { title: string };
}

interface NoteOption {
  id: string;
  title: string;
  courseId?: string | null;
}

export function QuizzesTab() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [courseFilter, setCourseFilter] = useState('');
  const [sourceMode, setSourceMode] = useState<'topic' | 'note'>('topic');
  const [topic, setTopic] = useState('');
  const [noteId, setNoteId] = useState('');
  const [genCourseId, setGenCourseId] = useState('');
  const [count, setCount] = useState('5');
  const [generating, setGenerating] = useState(false);

  const [activeQuiz, setActiveQuiz] = useState<QuizToTake | null>(null);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);

  const coursesQuery = useQuery({
    queryKey: ['courses', 'active'],
    queryFn: () => listCourses({ archived: 'active' }).catch(() => []),
  });
  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const quizzesQuery = useQuery({
    queryKey: ['quizzes', courseFilter],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (courseFilter) sp.set('courseId', courseFilter);
      const qs = sp.toString();
      return request<QuizSummary[]>(qs ? `/quizzes?${qs}` : '/quizzes');
    },
  });

  const notesQuery = useQuery({
    queryKey: ['notes', 'for-quizzes'],
    queryFn: () => request<{ items: NoteOption[] }>('/notes?limit=50'),
  });

  const historyQuery = useQuery({
    queryKey: ['quiz-attempts'],
    queryFn: () => request<AttemptHistoryItem[]>('/quiz-attempts'),
  });

  const startQuiz = async (quizId: string) => {
    const q = await request<QuizToTake>(`/quizzes/${quizId}`);
    setActiveQuiz(q);
    setAnswers(new Array(q.questions.length).fill(null));
    setResult(null);
  };

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.emailVerified) {
      toast.show({
        kind: 'error',
        title: 'Verify your email first',
        description: 'Verify your email to generate quizzes with AI.',
      });
      return;
    }
    setGenerating(true);
    try {
      const created = await request<QuizToTake>('/quizzes/generate', {
        method: 'POST',
        body: {
          ...(sourceMode === 'topic' ? { topic: topic.trim() } : { noteId }),
          count: Number(count) || 5,
          courseId: genCourseId || null,
        },
      });
      setTopic('');
      setGenCourseId('');
      setActiveQuiz(created);
      setAnswers(new Array(created.questions.length).fill(null));
      setResult(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['quizzes'] }),
        qc.invalidateQueries({ queryKey: ['courses'] }),
      ]);
      toast.show({ kind: 'success', title: 'Quiz generated' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Generation failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmitAttempt = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeQuiz) return;
    setSubmitting(true);
    try {
      const res = await request<AttemptResult>(`/quizzes/${activeQuiz.id}/attempts`, {
        method: 'POST',
        body: { answers },
      });
      setResult(res);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['quizzes'] }),
        qc.invalidateQueries({ queryKey: ['quiz-attempts'] }),
        qc.invalidateQueries({ queryKey: ['users', 'me', 'stats'] }),
        qc.invalidateQueries({ queryKey: ['courses'] }),
      ]);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not grade quiz',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateQuizCourse = async (quizId: string, nextCourseId: string) => {
    try {
      await request(`/quizzes/${quizId}`, {
        method: 'PATCH',
        body: { courseId: nextCourseId || null },
      });
      setActiveQuiz((prev) =>
        prev && prev.id === quizId ? { ...prev, courseId: nextCourseId || null } : prev,
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['quizzes'] }),
        qc.invalidateQueries({ queryKey: ['courses'] }),
      ]);
      toast.show({ kind: 'success', title: 'Quiz course updated' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not update quiz',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleDeleteQuiz = async (id: string) => {
    await request<void>(`/quizzes/${id}`, { method: 'DELETE' });
    if (activeQuiz?.id === id) {
      setActiveQuiz(null);
      setResult(null);
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['quizzes'] }),
      qc.invalidateQueries({ queryKey: ['courses'] }),
    ]);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Sparkles className="h-4 w-4 text-primary-600" aria-hidden="true" />
            Generate Quiz
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSourceMode('topic')}
              className={`flex-1 rounded-md py-1 text-xs font-medium ${
                sourceMode === 'topic' ? 'bg-primary-600 text-white' : 'bg-surface2 text-muted'
              }`}
            >
              From topic
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('note')}
              className={`flex-1 rounded-md py-1 text-xs font-medium ${
                sourceMode === 'note' ? 'bg-primary-600 text-white' : 'bg-surface2 text-muted'
              }`}
            >
              From note
            </button>
          </div>
          <form onSubmit={handleGenerate} className="space-y-2.5">
            {sourceMode === 'topic' ? (
              <Input
                label="Topic"
                placeholder="e.g. Graph algorithms"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            ) : (
              <div>
                <label htmlFor="quiz-note" className="mb-1 block text-xs font-medium text-fg">
                  Select note
                </label>
                <select
                  id="quiz-note"
                  value={noteId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setNoteId(nextId);
                    const picked = (notesQuery.data?.items ?? []).find((n) => n.id === nextId);
                    if (picked?.courseId) setGenCourseId(picked.courseId);
                  }}
                  className="h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-sm text-fg"
                >
                  <option value="">Choose a note...</option>
                  {(notesQuery.data?.items ?? []).map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="quiz-gen-course" className="mb-1 block text-xs font-medium text-fg">
                Course (optional)
              </label>
              <CourseSelect
                id="quiz-gen-course"
                ariaLabel="Course for generated quiz"
                mode="assign"
                value={genCourseId}
                onChange={setGenCourseId}
                courses={courses}
                className="h-9 w-full text-xs"
              />
            </div>
            <Input
              label="Questions (5–20)"
              type="number"
              min={5}
              max={20}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              className="w-full"
              loading={generating}
              disabled={sourceMode === 'topic' ? !topic.trim() : !noteId}
            >
              Generate quiz
            </Button>
          </form>
        </Card>

        <Card className="p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Your quizzes
            </h3>
          </div>
          <CourseSelect
            ariaLabel="Filter quizzes by course"
            mode="filter"
            value={courseFilter}
            onChange={setCourseFilter}
            courses={courses}
            className="h-8 w-full text-xs"
          />
          {quizzesQuery.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : quizzesQuery.isError ? (
            <ErrorState
              title="Could not load quizzes"
              onRetry={() => void quizzesQuery.refetch()}
            />
          ) : (quizzesQuery.data?.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-xs text-muted">No quizzes yet.</p>
          ) : (
            quizzesQuery.data!.map((q) => (
              <div
                key={q.id}
                className={`flex items-center justify-between gap-2 rounded-lg p-2 text-sm ${
                  activeQuiz?.id === q.id
                    ? 'bg-primary-50 dark:bg-primary-950/40'
                    : 'hover:bg-surface2'
                }`}
              >
                <button
                  type="button"
                  onClick={() => void startQuiz(q.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate font-medium text-fg">{q.title}</p>
                  <p className="text-xs text-muted">
                    {q.questionCount} Qs
                    {q.bestScore !== null ? ` · Best ${Math.round(q.bestScore * 100)}%` : ''}
                  </p>
                  {q.courseId ? (
                    <div className="mt-1">
                      <CourseBadge course={courseById.get(q.courseId)} />
                    </div>
                  ) : null}
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${q.title}`}
                  onClick={() => void handleDeleteQuiz(q.id)}
                  className="rounded p-1 text-muted hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="space-y-6">
        {!activeQuiz ? (
          <Card className="p-10">
            <EmptyState
              icon={GraduationCap}
              title="Generate or select a quiz"
              description="Test yourself on any note or topic and track your scores over time."
            />
          </Card>
        ) : (
          <Card className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-fg">{activeQuiz.title}</h2>
                {activeQuiz.courseId ? (
                  <CourseBadge course={courseById.get(activeQuiz.courseId)} link />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CourseSelect
                  ariaLabel="Assign quiz to course"
                  mode="assign"
                  value={activeQuiz.courseId ?? ''}
                  onChange={(val) => void handleUpdateQuizCourse(activeQuiz.id, val)}
                  courses={courses}
                  className="h-8 text-xs"
                />
                {result ? (
                  <Badge tone={result.score / result.total >= 0.7 ? 'success' : 'warning'}>
                    Score: {result.score} / {result.total}
                  </Badge>
                ) : null}
              </div>
            </div>

            <form onSubmit={handleSubmitAttempt} className="space-y-5">
              {activeQuiz.questions.map((q, qIdx) => {
                const resItem = result?.results.find((r) => r.questionId === q.id);
                return (
                  <div key={q.id} className="space-y-2 rounded-xl border border-line p-4">
                    <p className="text-sm font-medium text-fg">
                      {qIdx + 1}. {q.prompt}
                    </p>
                    <div className="space-y-1.5">
                      {q.options.map((opt, optIdx) => {
                        const selected = answers[qIdx] === optIdx;
                        return (
                          <label
                            key={optIdx}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                              selected
                                ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-950/30'
                                : 'border-line hover:bg-surface2'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              disabled={Boolean(result)}
                              checked={selected}
                              onChange={() =>
                                setAnswers((prev) => {
                                  const next = [...prev];
                                  next[qIdx] = optIdx;
                                  return next;
                                })
                              }
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                    {resItem ? (
                      <div
                        className={`mt-2 flex items-start gap-2 rounded-lg p-2.5 text-xs ${
                          resItem.correct
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                        }`}
                      >
                        {resItem.correct ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0" />
                        )}
                        <div>
                          <p className="font-semibold">
                            {resItem.correct
                              ? 'Correct!'
                              : `Correct answer: ${q.options[resItem.correctIndex]}`}
                          </p>
                          <p className="mt-0.5">{resItem.explanation}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {!result ? (
                <div className="flex justify-end">
                  <Button type="submit" loading={submitting}>
                    Submit quiz
                  </Button>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void startQuiz(activeQuiz.id)}
                  >
                    Retake quiz
                  </Button>
                </div>
              )}
            </form>
          </Card>
        )}

        {(historyQuery.data?.length ?? 0) > 0 ? (
          <Card className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-fg">Recent quiz scores</h3>
            <div className="divide-y divide-line">
              {historyQuery
                .data!.slice(-8)
                .reverse()
                .map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="truncate font-medium text-fg">{h.quiz.title}</span>
                    <span className="text-xs text-muted">
                      {h.score}/{h.total} ({Math.round((h.score / Math.max(1, h.total)) * 100)}%) ·{' '}
                      {new Date(h.takenAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
