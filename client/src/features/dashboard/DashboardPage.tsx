import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Flame,
  GraduationCap,
  Layers,
  MapPin,
  MessageSquare,
  Sparkles,
  Timer,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useAppPath } from '../../app/basePath';
import {
  Avatar,
  Badge,
  Button,
  Card,
  ErrorState,
  GlassCard,
  Skeleton,
  VerifiedBadge,
} from '../../design';
import { request } from '../../lib/apiClient';
import { buildDashboardGreeting } from './greeting';
import {
  formatCountdownMinutes,
  formatMinutes,
  type TimetableType,
} from '../timetable/timetableApi';
import { EXAM_TYPE_LABELS, formatExamCountdown, type ExamType } from '../exams/examsApi';
import { ProgressAnalyticsSection } from './ProgressAnalyticsSection';

interface DashboardTask {
  id: string;
  title: string;
  dueAt: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'done';
}

interface DashboardClassSlot {
  id: string;
  courseId: string;
  courseName: string;
  courseCode: string | null;
  courseColor: string | null;
  lecturer: string | null;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  venue: string | null;
  type: TimetableType;
}

interface DashboardNextClass extends DashboardClassSlot {
  status: 'in_progress' | 'upcoming';
  startsInMinutes: number;
  endsInMinutes: number;
  dayOffset: number;
  dayLabel: string;
}

interface DashboardExamItem {
  id: string;
  courseId: string;
  courseName: string;
  courseCode: string | null;
  courseColor: string | null;
  title: string;
  examType: ExamType;
  startsAt: string;
  durationMinutes: number | null;
  venue: string | null;
  weightPercent: number | null;
  topics: string[];
}

interface DashboardResponse {
  greetingName: string;
  isFirstVisit?: boolean;
  lastLoginAt?: string | null;
  onboardingCompleted?: boolean;
  onboardingSteps?: {
    hasCourse: boolean;
    hasNote: boolean;
    hasDocument: boolean;
    hasChat: boolean;
    hasTask: boolean;
  };
  timezone?: string;
  todayTasks: DashboardTask[];
  overdueCount: number;
  upcoming: DashboardTask[];
  todayClasses?: DashboardClassSlot[];
  nextClass?: DashboardNextClass | null;
  upcomingExams?: DashboardExamItem[];
  nextExam?: DashboardExamItem | null;
  dueFlashcardsCount?: number;
  todayStudyHours?: number;
  todayTasksDoneCount?: number;
  stats: { streakDays: number; hoursLast7Days: number };
  recentConversations: Array<{ id: string; title: string; updatedAt: string }>;
  unreadNotifications: number;
}

export function DashboardPage() {
  const { user, updateUser } = useAuth();
  const path = useAppPath();
  const qc = useQueryClient();
  const firstVisitAckedRef = useRef(false);
  const [onboardingHidden, setOnboardingHidden] = useState(false);

  const dashQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => request<DashboardResponse>('/dashboard'),
  });

  useEffect(() => {
    const data = dashQuery.data;
    if (!data || !data.isFirstVisit || firstVisitAckedRef.current) return;
    firstVisitAckedRef.current = true;
    void request<{ isFirstVisit: false; firstLoginAt: string; lastLoginAt: string }>(
      '/users/me/first-visit',
      {
        method: 'POST',
      },
    )
      .then(() => {
        if (user) {
          updateUser({ ...user, isFirstVisit: false });
        }
      })
      .catch(() => undefined);
  }, [dashQuery.data, updateUser, user]);

  if (dashQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (dashQuery.isError || !dashQuery.data) {
    return (
      <ErrorState
        title="Could not load dashboard"
        message="Check your connection and try again."
        onRetry={() => void dashQuery.refetch()}
      />
    );
  }

  const data = dashQuery.data;
  const greetingInfo = buildDashboardGreeting({
    name: data.greetingName || user?.name,
    isFirstVisit: data.isFirstVisit ?? user?.isFirstVisit,
    lastLoginAt: data.lastLoginAt ?? user?.lastLoginAt ?? null,
  });
  const greeting = greetingInfo.heading;
  const doneToday = data.todayTasks.filter((t) => t.status === 'done').length;
  const totalToday = data.todayTasks.length;
  const todayTasksDone = data.todayTasksDoneCount ?? doneToday;
  const todayStudyHours = data.todayStudyHours ?? 0;
  const todayClasses = data.todayClasses ?? [];
  const nextClass = data.nextClass ?? null;
  const upcomingExams = data.upcomingExams ?? [];
  const nextExam = data.nextExam ?? upcomingExams[0] ?? null;
  const dueFlashcardsCount = data.dueFlashcardsCount ?? 0;

  const completeTask = async (id: string) => {
    await request(`/tasks/${id}`, { method: 'PATCH', body: { status: 'done' } });
    await qc.invalidateQueries({ queryKey: ['dashboard'] });
    await qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  const quickTools = [
    {
      to: '/chat',
      label: 'AI Tutor',
      desc: 'Ask questions & get step-by-step help',
      icon: MessageSquare,
      accent: 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400',
    },
    {
      to: '/documents',
      label: 'Study from Docs',
      desc: 'Past questions, slides & practice sets',
      icon: FileText,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
    },
    {
      to: '/notes',
      label: 'Course Notes',
      desc: 'Organize & search your lecture notes',
      icon: BookOpen,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    },
    {
      to: '/study',
      label: 'Flashcards & Quiz',
      desc: 'Active recall & spaced practice',
      icon: GraduationCap,
      accent: 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400',
    },
    {
      to: '/planner',
      label: 'Study Planner',
      desc: 'Track deadlines & study tasks',
      icon: CalendarClock,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
    },
    {
      to: '/focus',
      label: 'Focus Timer',
      desc: 'Deep work Pomodoro sessions',
      icon: Timer,
      accent: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero Welcome Banner */}
      <Card className="app-hero-glass relative overflow-hidden rounded-[24px] p-6 sm:p-7">
        {/* Soft curved translucent wave ribbons inside right edge */}
        <svg
          aria-hidden="true"
          viewBox="0 0 420 220"
          className="pointer-events-none absolute -right-4 -top-6 z-0 h-[230px] w-[420px] opacity-80 dark:opacity-20"
        >
          <defs>
            <linearGradient id="heroBannerWave" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#EFF6FF" stopOpacity="0.1" />
              <stop offset="55%" stopColor="#DBEAFE" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          <path d="M40,220 C120,125 225,135 280,0 L420,0 L420,220 Z" fill="url(#heroBannerWave)" />
          <path
            d="M145,220 C225,130 310,150 385,15 L420,15 L420,220 Z"
            fill="url(#heroBannerWave)"
          />
        </svg>

        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            {user ? (
              <Link
                to={path('/profile')}
                aria-label="Open your profile"
                className="mt-1 hidden shrink-0 rounded-full ring-4 ring-white/90 shadow-md transition-transform hover:scale-105 dark:ring-surface sm:inline-flex"
              >
                <Avatar
                  name={user.name}
                  src={user.avatarUrl}
                  size="lg"
                  className="h-14 w-14 text-lg"
                />
              </Link>
            ) : null}
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary-200/80 bg-primary-100/70 px-3 py-1 text-xs font-medium text-primary-700 shadow-sm dark:border-primary-500/30 dark:bg-primary-500/15 dark:text-primary-300">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {data.isFirstVisit ? 'Welcome to Your Workspace' : greetingInfo.timeGreeting}
                </span>
              </div>
              <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                <span>{greeting}</span>
                {user?.emailVerified ? <VerifiedBadge className="h-5 w-5" /> : null}
              </h1>
              <p className="max-w-xl text-sm text-muted">
                {data.isFirstVisit
                  ? greetingInfo.intro
                  : totalToday > 0
                    ? `You have ${totalToday} task${totalToday === 1 ? '' : 's'} scheduled today${data.overdueCount > 0 ? ` and ${data.overdueCount} overdue` : ''}.`
                    : greetingInfo.intro}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link to={path('/chat')}>
              <Button
                size="md"
                className="rounded-full bg-gradient-to-r from-primary-600 to-primary-500 px-5 shadow-[0_8px_20px_rgba(37,99,235,0.28)] hover:from-primary-700 hover:to-primary-600"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Ask AI Tutor
              </Button>
            </Link>
            <Link to={path('/focus')}>
              <Button
                size="md"
                variant="secondary"
                className="rounded-full border-white/90 bg-white/90 px-5 shadow-sm hover:bg-white dark:border-line dark:bg-surface"
              >
                <Timer className="h-4 w-4" aria-hidden="true" />
                Start Focus
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {!data.onboardingCompleted && !onboardingHidden ? (
        <GlassCard className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-fg">Getting started</h2>
              <p className="text-xs text-muted">
                Complete these quick steps to get the most out of LearnSpace.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOnboardingHidden(true);
                void request('/users/me/onboarding-complete', { method: 'POST' })
                  .then(() => qc.invalidateQueries({ queryKey: ['dashboard'] }))
                  .catch(() => undefined);
              }}
            >
              Hide
            </Button>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ['Add a course', '/courses', Boolean(data.onboardingSteps?.hasCourse)],
                ['Create your first note', '/notes', Boolean(data.onboardingSteps?.hasNote)],
                ['Upload a document', '/documents', Boolean(data.onboardingSteps?.hasDocument)],
                ['Ask AWAL a question', '/chat', Boolean(data.onboardingSteps?.hasChat)],
                ['Plan a task', '/planner', Boolean(data.onboardingSteps?.hasTask)],
              ] as const
            ).map(([label, to, done]) => (
              <Link
                key={label}
                to={path(to)}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                  done
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-line/80 bg-surface2/50 text-fg hover:border-primary-300 hover:bg-primary-50/50 dark:hover:bg-white/[0.06]'
                }`}
              >
                <CheckCircle2
                  className={`h-4 w-4 shrink-0 ${done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted/50'}`}
                  aria-hidden="true"
                />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </GlassCard>
      ) : null}

      {/* Daily Summary Card */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-fg">Daily summary</h2>
            <p className="text-xs text-muted">
              Today&apos;s snapshot across study hours, tasks, flashcards, classes, and exams
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="warning">
              <Flame className="mr-1 h-3 w-3" aria-hidden="true" />
              {data.stats.streakDays}d streak
            </Badge>
            <Badge tone="primary">{data.stats.hoursLast7Days}h in 7d</Badge>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Link
            to={path('/focus')}
            className="rounded-xl border border-line/85 bg-surface2/40 p-3.5 transition-colors hover:border-primary-300"
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Hours studied</span>
              <Clock
                className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400"
                aria-hidden="true"
              />
            </div>
            <p className="mt-1.5 font-display text-lg font-bold text-fg tabular-nums">
              {todayStudyHours}h today
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {data.stats.hoursLast7Days}h over 7 days
            </p>
          </Link>

          <Link
            to={path('/planner')}
            className="rounded-xl border border-line/85 bg-surface2/40 p-3.5 transition-colors hover:border-primary-300"
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Tasks done</span>
              <CheckCircle2
                className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
            </div>
            <p className="mt-1.5 font-display text-lg font-bold text-fg tabular-nums">
              {todayTasksDone} done
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {totalToday} open today
              {data.overdueCount > 0 ? ` · ${data.overdueCount} overdue` : ''}
            </p>
          </Link>

          <Link
            to={path('/study?tab=decks')}
            className="rounded-xl border border-line/85 bg-surface2/40 p-3.5 transition-colors hover:border-primary-300"
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Due flashcards</span>
              <Layers className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            </div>
            <p className="mt-1.5 font-display text-lg font-bold text-fg tabular-nums">
              {dueFlashcardsCount} due
            </p>
            <p className="mt-0.5 text-[11px] text-primary-600 dark:text-primary-400">
              {dueFlashcardsCount > 0 ? 'Review queue →' : 'Caught up'}
            </p>
          </Link>

          <Link
            to={path('/timetable')}
            className="rounded-xl border border-line/85 bg-surface2/40 p-3.5 transition-colors hover:border-primary-300"
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Next class</span>
              <CalendarDays
                className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400"
                aria-hidden="true"
              />
            </div>
            <p className="mt-1.5 truncate text-sm font-bold text-fg">
              {nextClass
                ? nextClass.courseCode
                  ? `${nextClass.courseCode} · ${nextClass.courseName}`
                  : nextClass.courseName
                : 'No upcoming class'}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              {nextClass
                ? nextClass.status === 'in_progress'
                  ? `In progress · ends ${formatMinutes(nextClass.endMinute)}`
                  : `${nextClass.dayLabel} · ${formatMinutes(nextClass.startMinute)}`
                : 'Add classes in Timetable'}
            </p>
          </Link>

          <Link
            to={path('/exams')}
            className="rounded-xl border border-line/85 bg-surface2/40 p-3.5 transition-colors hover:border-primary-300"
          >
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Next exam</span>
              <CalendarClock
                className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
            </div>
            <p className="mt-1.5 truncate text-sm font-bold text-fg">
              {nextExam ? nextExam.title : 'No upcoming exam'}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              {nextExam
                ? `${formatExamCountdown(nextExam.startsAt).label}${nextExam.courseCode ? ` · ${nextExam.courseCode}` : ''}`
                : 'Schedule exams'}
            </p>
          </Link>
        </div>
      </Card>

      {/* Progress Analytics (date range filter, charts, best study hours, weak topics) */}
      <ProgressAnalyticsSection />

      {/* Next Class & Today's Schedule */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-fg">
                Next class &amp; today&apos;s schedule
              </h2>
              {data.timezone ? (
                <p className="text-[11px] text-muted">Shown in {data.timezone}</p>
              ) : null}
            </div>
          </div>
          <Link
            to={path('/timetable')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
          >
            Open timetable
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.05fr_1fr]">
          {/* Next class spotlight */}
          <div
            className="flex flex-col justify-between rounded-2xl border border-line/90 bg-primary-50/40 p-4 dark:bg-surface2/50"
            style={
              nextClass
                ? { borderLeftWidth: '4px', borderLeftColor: nextClass.courseColor ?? '#2563EB' }
                : undefined
            }
          >
            {nextClass ? (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Next class
                  </span>
                  <Badge tone={nextClass.status === 'in_progress' ? 'success' : 'primary'}>
                    {nextClass.status === 'in_progress'
                      ? `In progress · ends ${formatMinutes(nextClass.endMinute)}`
                      : nextClass.dayOffset === 0
                        ? `Starts ${formatCountdownMinutes(nextClass.startsInMinutes)}`
                        : `${nextClass.dayLabel} · ${formatMinutes(nextClass.startMinute)}`}
                  </Badge>
                </div>

                <div>
                  <Link
                    to={path(`/courses/${nextClass.courseId}`)}
                    className="inline-flex flex-wrap items-center gap-2 font-display text-lg font-bold text-fg transition-colors hover:text-primary-600 dark:hover:text-primary-400"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: nextClass.courseColor ?? '#2563EB' }}
                    />
                    {nextClass.courseCode ? <span>{nextClass.courseCode} ·</span> : null}
                    <span>{nextClass.courseName}</span>
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1 font-medium text-fg tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                      {formatMinutes(nextClass.startMinute)} – {formatMinutes(nextClass.endMinute)}
                    </span>
                    <Badge tone="neutral">
                      {nextClass.type.charAt(0).toUpperCase() + nextClass.type.slice(1)}
                    </Badge>
                    {nextClass.venue ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        {nextClass.venue}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-2 text-center sm:text-left">
                <p className="text-sm font-medium text-fg">No upcoming classes yet</p>
                <p className="mt-1 text-xs text-muted">
                  Add lectures, labs, or tutorials in Timetable to get countdowns and reminders.
                </p>
                <Link
                  to={path('/timetable')}
                  className="mt-2.5 inline-block text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
                >
                  Set up weekly timetable
                </Link>
              </div>
            )}
          </div>

          {/* Today's schedule list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Today&apos;s classes ({todayClasses.length})
            </p>
            {todayClasses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-surface2/30 p-4 text-center text-xs text-muted">
                No classes scheduled for today.
              </div>
            ) : (
              <div className="divide-y divide-line/80 rounded-xl border border-line/80 bg-surface px-3">
                {todayClasses.map((slot) => {
                  const isHighlighted =
                    nextClass !== null && nextClass.id === slot.id && nextClass.dayOffset === 0;
                  return (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: slot.courseColor ?? '#2563EB' }}
                        />
                        <Link
                          to={path(`/courses/${slot.courseId}`)}
                          className={`truncate font-medium hover:text-primary-600 ${
                            isHighlighted
                              ? 'text-primary-700 dark:text-primary-300 font-semibold'
                              : 'text-fg'
                          }`}
                        >
                          {slot.courseCode
                            ? `${slot.courseCode} · ${slot.courseName}`
                            : slot.courseName}
                        </Link>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-muted tabular-nums">
                        {slot.venue ? <span className="hidden sm:inline">{slot.venue}</span> : null}
                        <span className="font-medium text-fg">
                          {formatMinutes(slot.startMinute)}–{formatMinutes(slot.endMinute)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Exam Countdowns */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-fg">Upcoming exam countdowns</h2>
              <p className="text-[11px] text-muted">
                Track exam dates and build AI revision schedules into your Planner
              </p>
            </div>
          </div>
          <Link
            to={path('/exams')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
          >
            Open exams &amp; revision
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        {upcomingExams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface2/30 p-4 text-center text-xs text-muted">
            No upcoming exams scheduled.{' '}
            <Link
              to={path('/exams')}
              className="font-semibold text-primary-600 hover:underline dark:text-primary-400"
            >
              Add an exam date
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {upcomingExams.map((ex) => {
              const cd = formatExamCountdown(ex.startsAt);
              const accent = ex.courseColor ?? '#2563EB';
              return (
                <Link
                  key={ex.id}
                  to={path(`/courses/${ex.courseId}`)}
                  style={{ borderTopWidth: '3px', borderTopColor: accent }}
                  className="flex flex-col justify-between gap-2.5 rounded-xl border border-line/85 bg-surface p-3.5 shadow-sm transition-colors hover:border-primary-300"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <Badge tone={cd.tone}>{cd.label}</Badge>
                      <span className="text-[11px] font-medium text-muted">
                        {EXAM_TYPE_LABELS[ex.examType] ?? ex.examType}
                        {ex.weightPercent !== null ? ` · ${ex.weightPercent}%` : ''}
                      </span>
                    </div>
                    <p className="truncate text-xs font-semibold text-muted">
                      {ex.courseCode ? `${ex.courseCode} · ${ex.courseName}` : ex.courseName}
                    </p>
                    <p className="truncate text-sm font-bold text-fg">{ex.title}</p>
                  </div>
                  <p className="text-[11px] text-muted">
                    {new Date(ex.startsAt).toLocaleString()}
                    {ex.venue ? ` · ${ex.venue}` : ''}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      {/* Main Two-Column Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col justify-between p-5 sm:p-6 space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-fg">Today&apos;s tasks</h2>
                {data.overdueCount > 0 ? (
                  <Badge tone="danger">{data.overdueCount} overdue</Badge>
                ) : null}
              </div>
              <Link
                to={path('/planner')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
              >
                Open planner
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {data.todayTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-primary-200/80 bg-primary-50/35 p-6 text-center dark:border-line dark:bg-surface2/40">
                <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 shadow-sm dark:bg-primary-500/15 dark:text-primary-400">
                  <CalendarClock className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-sm text-muted">No tasks due today.</p>
                <Link
                  to={path('/planner')}
                  className="mt-1.5 inline-block text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
                >
                  Schedule a study task
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-line/80">
                {data.todayTasks.map((t) => (
                  <div
                    key={t.id}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface2/50"
                  >
                    <button
                      type="button"
                      onClick={() => void completeTask(t.id)}
                      className="group flex min-w-0 items-center gap-2.5 text-left text-sm hover:text-primary-600"
                    >
                      <CheckCircle2
                        className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-emerald-500"
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium">{t.title}</span>
                    </button>
                    <Badge tone={t.priority === 'high' ? 'danger' : 'neutral'}>{t.priority}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.upcoming.length > 0 ? (
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Upcoming
              </p>
              <div className="space-y-1.5">
                {data.upcoming.slice(0, 3).map((u) => (
                  <div key={u.id} className="flex items-center justify-between text-xs text-muted">
                    <span className="truncate font-medium text-fg">{u.title}</span>
                    <span>{u.dueAt ? new Date(u.dueAt).toLocaleDateString() : 'Soon'}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fg">Recent AI chats</h2>
            <Link
              to={path('/chat')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
            >
              Ask AI tutor
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          {data.recentConversations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-primary-200/80 bg-primary-50/35 p-6 text-center dark:border-line dark:bg-surface2/40">
              <p className="text-sm text-muted">
                No conversations yet. Ask AWAL anything about your courses!
              </p>
              <Link
                to={path('/chat')}
                className="mt-2 inline-block text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
              >
                Start a conversation
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-line/80">
              {data.recentConversations.map((c) => (
                <Link
                  key={c.id}
                  to={path(`/chat/${c.id}`)}
                  className="group -mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 text-sm transition-colors hover:bg-primary-50/45 hover:text-primary-600 dark:hover:bg-surface2/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 ring-2 ring-primary-100/70 dark:bg-primary-500/15 dark:text-primary-400 dark:ring-primary-500/10">
                      <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="truncate font-medium">{c.title}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Quick Launch Learning Hub */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Quick Actions &amp; Learning Tools
        </h2>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {quickTools.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={path(item.to)}
                className="group flex items-center gap-3.5 rounded-2xl border border-line/80 bg-surface p-4 shadow-sm transition-all duration-fast ease-soft hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md dark:hover:border-primary-500/40"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-fast group-hover:scale-105 ${item.accent}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg group-hover:text-primary-600 dark:group-hover:text-primary-400">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{item.desc}</p>
                </div>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted/60 transition-transform duration-fast group-hover:translate-x-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
