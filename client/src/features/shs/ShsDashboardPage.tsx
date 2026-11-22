import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BookMarked,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Flame,
  Layers,
  Lightbulb,
  MessageSquare,
  Plus,
  Sparkles,
  Target,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useAppPath } from '../../app/basePath';
import { Badge, Button, Card, ErrorState, Input, Skeleton, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { buildDashboardGreeting } from '../dashboard/greeting';

export interface ShsDashboardData {
  greetingName: string;
  schoolYear: string;
  programme: string | null;
  checklist: {
    hasSubject: boolean;
    hasNote: boolean;
    hasChat: boolean;
    hasQuiz: boolean;
  };
  wassceTarget: {
    id: string;
    title: string;
    targetDate: string;
    daysLeft: number;
  } | null;
  subjects: Array<{
    id: string;
    name: string;
    color: string;
    progressPct: number;
    notesCount: number;
    topicsCount: number;
  }>;
  todayTasks: Array<{
    id: string;
    title: string;
    dueAt: string | null;
    priority: string;
    courseId: string | null;
  }>;
  continueFrom: {
    lastNote: { id: string; title: string; updatedAt: string } | null;
    lastQuiz: { id: string; title: string; score: number | null; total: number } | null;
    lastChat: { id: string; title: string; updatedAt: string } | null;
  };
  dailyChallenge: {
    id: string;
    subject: string;
    topic: string;
    prompt: string;
    options: string[];
    answeredToday: boolean;
    streak: number;
  };
  weakTopics: Array<{ courseId: string; courseName: string; topic: string; count: number }>;
  focusMinutesThisWeek: number;
  streakDays: number;
  badges: Array<{ id: string; label: string; earned: boolean }>;
  tipOfTheDay: string;
}

const DEMO_SHS_DASHBOARD: ShsDashboardData = {
  greetingName: 'Abena (Demo)',
  schoolYear: 'SHS 2',
  programme: 'General Science',
  checklist: { hasSubject: true, hasNote: true, hasChat: false, hasQuiz: false },
  wassceTarget: {
    id: 'demo-wassce',
    title: 'WASSCE Target Exam',
    targetDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
    daysLeft: 120,
  },
  subjects: [
    {
      id: 'demo-1',
      name: 'Core Mathematics',
      color: '#2563EB',
      progressPct: 45,
      notesCount: 3,
      topicsCount: 8,
    },
    {
      id: 'demo-2',
      name: 'Integrated Science',
      color: '#10B981',
      progressPct: 30,
      notesCount: 2,
      topicsCount: 8,
    },
    {
      id: 'demo-3',
      name: 'English Language',
      color: '#F59E0B',
      progressPct: 60,
      notesCount: 4,
      topicsCount: 6,
    },
  ],
  todayTasks: [
    {
      id: 't1',
      title: 'Revise Quadratic Equations',
      dueAt: null,
      priority: 'high',
      courseId: null,
    },
  ],
  continueFrom: {
    lastNote: { id: 'n1', title: 'Laws of Indices Summary', updatedAt: new Date().toISOString() },
    lastQuiz: null,
    lastChat: null,
  },
  dailyChallenge: {
    id: 'dc-math-1',
    subject: 'Core Mathematics',
    topic: 'Logarithms',
    prompt: 'If log10(x) = 3, what is the value of x?',
    options: ['30', '100', '1000', '3000'],
    answeredToday: false,
    streak: 3,
  },
  weakTopics: [{ courseId: 'demo-1', courseName: 'Core Mathematics', topic: 'Surds', count: 2 }],
  focusMinutesThisWeek: 95,
  streakDays: 3,
  badges: [
    { id: 'first_subject', label: 'Subject Starter', earned: true },
    { id: 'note_taker', label: 'Note Maker', earned: true },
    { id: 'wassce_mock', label: 'WASSCE Practiser', earned: false },
    { id: 'focus_60m', label: '60m Focus Week', earned: true },
  ],
  tipOfTheDay: 'Show your formula and units before substituting numbers in WASSCE theory answers.',
};

export function ShsDashboardPage() {
  const { user } = useAuth();
  const { search } = useLocation();
  const path = useAppPath();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const isAdminPreview =
    (user?.role === 'admin' || user?.role === 'super_admin') &&
    new URLSearchParams(search).get('preview') === 'shs';

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [wassceDateInput, setWassceDateInput] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [challengeResult, setChallengeResult] = useState<{
    selectedIndex: number;
    correct: boolean;
    correctIndex: number;
    explanation: string;
  } | null>(null);

  const query = useQuery({
    queryKey: ['shs', 'dashboard'],
    queryFn: () => request<ShsDashboardData>('/shs/dashboard'),
    enabled: !isAdminPreview,
  });

  if (!isAdminPreview && query.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5" aria-label="Loading SHS Home">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl md:col-span-2" />
        </div>
        <Skeleton className="h-52 w-full rounded-2xl" />
      </div>
    );
  }

  if (!isAdminPreview && (query.isError || !query.data)) {
    return (
      <div className="mx-auto max-w-3xl">
        <ErrorState
          title="Could not load your SHS Home"
          message={
            query.error instanceof ApiError
              ? query.error.message
              : 'Please check your connection and try again.'
          }
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const d = isAdminPreview ? DEMO_SHS_DASHBOARD : query.data!;
  const greeting = buildDashboardGreeting({ name: d.greetingName });
  const checklistDoneCount = Object.values(d.checklist).filter(Boolean).length;
  const showChecklist = checklistDoneCount < 4;

  const handleQuickAddTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setAddingTask(true);
    try {
      await request('/tasks', {
        method: 'POST',
        body: { title: newTaskTitle.trim(), priority: 'medium' },
      });
      setNewTaskTitle('');
      await qc.invalidateQueries({ queryKey: ['shs', 'dashboard'] });
    } catch {
      toast.show({ kind: 'error', title: 'Could not add study task' });
    } finally {
      setAddingTask(false);
    }
  };

  const handleSaveWassceDate = async (e: FormEvent) => {
    e.preventDefault();
    if (!wassceDateInput) return;
    setSavingDate(true);
    try {
      await request('/shs/wassce-date', {
        method: 'POST',
        body: { targetDate: new Date(wassceDateInput).toISOString() },
      });
      setWassceDateInput('');
      await qc.invalidateQueries({ queryKey: ['shs', 'dashboard'] });
      toast.show({ kind: 'success', title: 'WASSCE countdown updated' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not set WASSCE date',
        description: err instanceof ApiError ? err.message : 'Add a subject first.',
      });
    } finally {
      setSavingDate(false);
    }
  };

  const handleAnswerChallenge = async (idx: number) => {
    try {
      const res = await request<{
        correct: boolean;
        correctIndex: number;
        explanation: string;
      }>('/shs/daily-challenge/answer', {
        method: 'POST',
        body: { challengeId: d.dailyChallenge.id, selectedIndex: idx },
      });
      setChallengeResult({ selectedIndex: idx, ...res });
      await qc.invalidateQueries({ queryKey: ['shs', 'dashboard'] });
    } catch {
      toast.show({ kind: 'error', title: 'Could not submit answer' });
    }
  };

  const daysLeft = d.wassceTarget?.daysLeft ?? 0;
  const ringPct = d.wassceTarget
    ? Math.min(100, Math.max(8, Math.round(100 - daysLeft / 3.65)))
    : 0;
  const ringOffset = 251.2 - (251.2 * ringPct) / 100;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {isAdminPreview ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/70 bg-amber-50/70 px-4 py-2.5 text-xs text-fg dark:border-amber-500/30 dark:bg-amber-500/10">
          <span>
            <strong>Admin Preview (Read-Only):</strong> Viewing the SHS student Home experience with
            sample data.
          </span>
          <Link to="/admin/shs" className="font-semibold text-primary-600 underline">
            Back to Admin SHS &amp; Safety
          </Link>
        </div>
      ) : null}
      {/* 1. SHS Greeting & Encouraging Hero */}
      <Card className="relative overflow-hidden border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-emerald-50/70 p-5 dark:border-primary-500/20 dark:from-primary-600/15 dark:via-surface dark:to-emerald-500/10 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{d.schoolYear}</Badge>
              {d.programme ? <Badge tone="neutral">{d.programme}</Badge> : null}
              <Badge tone="success" className="inline-flex items-center gap-1">
                <Flame className="h-3 w-3" aria-hidden="true" />
                {d.streakDays}d streak
              </Badge>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              {greeting.heading}
            </h1>
            <p className="text-sm text-muted">
              {greeting.intro} One focused step at a time builds your WASSCE confidence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={path('/chat')}>
              <Button type="button" size="sm">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Ask AWAL
              </Button>
            </Link>
            <Link to={path('/exams')}>
              <Button type="button" size="sm" variant="secondary">
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                Start Mock Exam
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* First-Time Getting Started Checklist */}
      {showChecklist ? (
        <Card className="space-y-3 border-emerald-200/80 bg-emerald-50/40 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-fg">
              Getting Started ({checklistDoneCount}/4)
            </h2>
            <span className="text-xs text-muted">Complete these 4 quick steps</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { done: d.checklist.hasSubject, label: 'Pick your subjects', to: '/courses' },
              { done: d.checklist.hasNote, label: 'Add your first note', to: '/notes' },
              { done: d.checklist.hasChat, label: 'Ask AWAL a question', to: '/chat' },
              { done: d.checklist.hasQuiz, label: 'Try a WASSCE quiz', to: '/exams' },
            ].map((step) => (
              <Link
                key={step.label}
                to={path(step.to)}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-surface/80 px-3 py-2.5 text-xs font-medium text-fg transition hover:border-primary-300"
              >
                <CheckCircle2
                  className={`h-4 w-4 shrink-0 ${step.done ? 'text-emerald-500' : 'text-muted'}`}
                />
                <span className={step.done ? 'line-through text-muted' : ''}>{step.label}</span>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {/* 2. Quick Actions Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Ask AWAL', icon: MessageSquare, to: '/chat', tone: 'text-primary-600' },
          { label: 'Scan a question', icon: Camera, to: '/chat?camera=1', tone: 'text-sky-600' },
          {
            label: 'Start mock exam',
            icon: ClipboardCheck,
            to: '/exams',
            tone: 'text-emerald-600',
          },
          { label: 'Make flashcards', icon: Layers, to: '/study', tone: 'text-amber-600' },
        ].map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.label} to={path(action.to)}>
              <Card className="flex items-center gap-3 p-3.5 transition hover:-translate-y-0.5 hover:border-primary-300">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl bg-surface2 ${action.tone}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold text-fg sm:text-sm">{action.label}</span>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* 3. WASSCE Countdown + My Subjects */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col justify-between space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-fg">WASSCE Countdown</h2>
            <Badge tone="primary">Target</Badge>
          </div>
          {d.wassceTarget ? (
            <div className="flex items-center gap-4">
              <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-surface2"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="251.2"
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 50 50)"
                  className="text-primary-600 dark:text-primary-400"
                />
                <text x="50" y="54" textAnchor="middle" className="fill-fg text-lg font-bold">
                  {daysLeft}d
                </text>
              </svg>
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-fg">{d.wassceTarget.title}</p>
                <p className="text-muted">
                  {new Date(d.wassceTarget.targetDate).toLocaleDateString()}
                </p>
                <Link to={path('/exams')} className="inline-block font-medium text-primary-600">
                  Open Exam Prep →
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveWassceDate} className="space-y-2.5 text-xs">
              <p className="text-muted">Set your target WASSCE date to track your countdown.</p>
              <Input
                label="Target WASSCE date"
                type="date"
                value={wassceDateInput}
                onChange={(e) => setWassceDateInput(e.target.value)}
                required
              />
              <Button type="submit" size="sm" loading={savingDate}>
                Set WASSCE Date
              </Button>
            </form>
          )}
        </Card>

        <Card className="space-y-3 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-fg">
              My Subjects ({d.subjects.length})
            </h2>
            <Link to={path('/courses')} className="text-xs font-medium text-primary-600">
              Manage subjects →
            </Link>
          </div>
          {d.subjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-muted">
              <p>You haven&apos;t picked your SHS subjects yet.</p>
              <Link to={path('/courses')} className="mt-2 inline-block">
                <Button size="sm">
                  <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
                  Pick SHS Subjects
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {d.subjects.slice(0, 6).map((subj) => (
                <div
                  key={subj.id}
                  className="flex flex-col justify-between gap-2 rounded-xl border border-line bg-surface2/40 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: subj.color }}
                      />
                      <span className="truncate text-sm font-semibold text-fg">{subj.name}</span>
                    </div>
                    <span className="text-xs font-medium text-muted">{subj.progressPct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${subj.progressPct}%`, backgroundColor: subj.color }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>{subj.topicsCount} syllabus topics</span>
                    <Link
                      to={path(`/courses/${subj.id}`)}
                      className="font-semibold text-primary-600 hover:underline"
                    >
                      Study now →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 4. Today's Study Plan + Daily Challenge */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="font-display text-base font-semibold text-fg">Today&apos;s Study Plan</h2>
          <form onSubmit={handleQuickAddTask} className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Quick add study task"
                placeholder="e.g. Revise Indices..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" loading={addingTask}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </Button>
          </form>
          {d.todayTasks.length === 0 ? (
            <p className="text-xs text-muted">
              No pending study tasks. Add one above to stay on track.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {d.todayTasks.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface2/40 px-3 py-2 text-fg"
                >
                  <span className="truncate font-medium">{t.title}</span>
                  <Badge tone="neutral">{t.priority}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-fg">Daily Challenge</h2>
            </div>
            <Badge tone="warning">{d.dailyChallenge.subject}</Badge>
          </div>
          <p className="text-sm font-medium text-fg">{d.dailyChallenge.prompt}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {d.dailyChallenge.options.map((opt, idx) => {
              const picked = challengeResult?.selectedIndex === idx;
              const isRight = challengeResult && challengeResult.correctIndex === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={Boolean(challengeResult) || d.dailyChallenge.answeredToday}
                  onClick={() => void handleAnswerChallenge(idx)}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                    isRight
                      ? 'border-emerald-500 bg-emerald-500/15 text-fg'
                      : picked
                        ? 'border-danger bg-danger/10 text-fg'
                        : 'border-line bg-surface2/40 text-fg hover:border-primary-300'
                  }`}
                >
                  {String.fromCharCode(65 + idx)}. {opt}
                </button>
              );
            })}
          </div>
          {challengeResult ? (
            <p className="text-xs text-muted">
              <strong>{challengeResult.correct ? 'Correct!' : 'Not quite.'}</strong>{' '}
              {challengeResult.explanation}
            </p>
          ) : d.dailyChallenge.answeredToday ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              You completed today&apos;s challenge! Streak: {d.dailyChallenge.streak}.
            </p>
          ) : null}
        </Card>
      </div>

      {/* 5. Weak Topics, Continue Where You Left Off & Focus/Badges/Tip */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary-600" aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-fg">Weak Topics</h2>
          </div>
          {d.weakTopics.length === 0 ? (
            <p className="text-xs text-muted">
              Take a WASSCE mock in Exam Prep to spot topics that need extra practice.
            </p>
          ) : (
            <div className="space-y-2">
              {d.weakTopics.map((w) => (
                <div
                  key={`${w.courseId}-${w.topic}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface2/40 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{w.topic}</p>
                    <p className="truncate text-muted">{w.courseName}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      navigate(
                        path(
                          `/chat?prefill=${encodeURIComponent(
                            `Revise "${w.topic}" in ${w.courseName} with me simply and give me a quick quiz.`,
                          )}`,
                        ),
                      )
                    }
                  >
                    Revise this
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="font-display text-base font-semibold text-fg">Continue Studying</h2>
          <div className="space-y-2 text-xs">
            <Link
              to={path(d.continueFrom.lastNote ? `/notes/${d.continueFrom.lastNote.id}` : '/notes')}
              className="block rounded-xl border border-line bg-surface2/40 px-3 py-2.5 hover:border-primary-300"
            >
              <p className="text-muted">Last note</p>
              <p className="truncate font-medium text-fg">
                {d.continueFrom.lastNote?.title ?? 'Create your first note'}
              </p>
            </Link>
            <Link
              to={path(d.continueFrom.lastChat ? `/chat/${d.continueFrom.lastChat.id}` : '/chat')}
              className="block rounded-xl border border-line bg-surface2/40 px-3 py-2.5 hover:border-primary-300"
            >
              <p className="text-muted">Last AWAL chat</p>
              <p className="truncate font-medium text-fg">
                {d.continueFrom.lastChat?.title ?? 'Start a chat with AWAL'}
              </p>
            </Link>
            <Link
              to={path('/study')}
              className="block rounded-xl border border-line bg-surface2/40 px-3 py-2.5 hover:border-primary-300"
            >
              <p className="text-muted">Last quiz</p>
              <p className="truncate font-medium text-fg">
                {d.continueFrom.lastQuiz
                  ? `${d.continueFrom.lastQuiz.title} (${d.continueFrom.lastQuiz.score ?? 0}/${d.continueFrom.lastQuiz.total})`
                  : 'Try a practice quiz'}
              </p>
            </Link>
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-fg">Focus &amp; Badges</h2>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {d.focusMinutesThisWeek}m this week
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {d.badges.map((b) => (
              <Badge key={b.id} tone={b.earned ? 'success' : 'neutral'}>
                {b.label}
              </Badge>
            ))}
          </div>
          <div className="rounded-xl border border-primary-200/70 bg-primary-50/40 p-3 text-xs dark:border-primary-500/20 dark:bg-primary-500/10">
            <p className="flex items-center gap-1.5 font-semibold text-fg">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
              Tip of the Day
            </p>
            <p className="mt-1 text-muted">{d.tipOfTheDay}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
