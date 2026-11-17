import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  GraduationCap,
  MessageSquare,
  Sparkles,
  Timer,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useAppPath } from '../../app/basePath';
import { Badge, Button, Card, ErrorState, Skeleton, VerifiedBadge } from '../../design';
import { request } from '../../lib/apiClient';

interface DashboardTask {
  id: string;
  title: string;
  dueAt: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'done';
}

interface DashboardResponse {
  greetingName: string;
  todayTasks: DashboardTask[];
  overdueCount: number;
  upcoming: DashboardTask[];
  stats: { streakDays: number; hoursLast7Days: number };
  recentConversations: Array<{ id: string; title: string; updatedAt: string }>;
  unreadNotifications: number;
}

function timeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage() {
  const { user } = useAuth();
  const path = useAppPath();
  const qc = useQueryClient();

  const dashQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => request<DashboardResponse>('/dashboard'),
  });

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
  const greeting = `${timeGreeting(new Date().getHours())}, ${data.greetingName}`;
  const streakPct = Math.min(100, Math.round((data.stats.streakDays / 7) * 100));
  const hoursGoalPct = Math.min(100, Math.round((data.stats.hoursLast7Days / 14) * 100));
  const doneToday = data.todayTasks.filter((t) => t.status === 'done').length;
  const totalToday = data.todayTasks.length;

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
      accent: 'bg-primary-600/10 text-primary-600 dark:text-primary-400',
    },
    {
      to: '/documents',
      label: 'Study from Docs',
      desc: 'Past questions, slides & practice sets',
      icon: FileText,
      accent: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    },
    {
      to: '/notes',
      label: 'Course Notes',
      desc: 'Organize & search your lecture notes',
      icon: BookOpen,
      accent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    {
      to: '/study',
      label: 'Flashcards & Quiz',
      desc: 'Active recall & spaced practice',
      icon: GraduationCap,
      accent: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    {
      to: '/planner',
      label: 'Study Planner',
      desc: 'Track deadlines & study tasks',
      icon: CalendarClock,
      accent: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    },
    {
      to: '/focus',
      label: 'Focus Timer',
      desc: 'Deep work Pomodoro sessions',
      icon: Timer,
      accent: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero Welcome Banner */}
      <Card className="relative overflow-hidden border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-6 dark:border-primary-500/20 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary-500/25 bg-primary-500/10 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Your Learning Hub</span>
            </div>
            <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              <span>{greeting}</span>
              {user?.emailVerified ? <VerifiedBadge className="h-5 w-5" /> : null}
            </h1>
            <p className="max-w-xl text-sm text-muted">
              {totalToday > 0
                ? `You have ${totalToday} task${totalToday === 1 ? '' : 's'} scheduled today${data.overdueCount > 0 ? ` and ${data.overdueCount} overdue` : ''}.`
                : 'You are all caught up for today. Pick a study tool below to keep your momentum going.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link to={path('/chat')}>
              <Button size="md">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Ask AI Tutor
              </Button>
            </Link>
            <Link to={path('/focus')}>
              <Button size="md" variant="secondary">
                <Timer className="h-4 w-4" aria-hidden="true" />
                Start Focus
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* KPI Stat Cards with Progress Bars */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="space-y-3 p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                <Flame className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium text-muted">Study Streak</p>
                <p className="text-xl font-bold text-fg tabular-nums">
                  {data.stats.streakDays} {data.stats.streakDays === 1 ? 'day' : 'days'}
                </p>
              </div>
            </div>
            <Badge tone="warning">7d goal</Badge>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-slow"
              style={{ width: `${streakPct}%` }}
            />
          </div>
        </Card>

        <Card className="space-y-3 p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
                <Clock className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium text-muted">Study Time (7d)</p>
                <p className="text-xl font-bold text-fg tabular-nums">{data.stats.hoursLast7Days}h</p>
              </div>
            </div>
            <Badge tone="primary">14h target</Badge>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full bg-primary-600 transition-all duration-slow"
              style={{ width: `${hoursGoalPct}%` }}
            />
          </div>
        </Card>

        <Card className="space-y-3 p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium text-muted">Today&apos;s Tasks</p>
                <p className="text-xl font-bold text-fg tabular-nums">
                  {doneToday}/{totalToday}
                </p>
              </div>
            </div>
            {data.overdueCount > 0 ? (
              <Badge tone="danger">{data.overdueCount} overdue</Badge>
            ) : (
              <Badge tone="success">On track</Badge>
            )}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-slow"
              style={{ width: `${totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 100}%` }}
            />
          </div>
        </Card>
      </div>

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
              <div className="rounded-xl border border-dashed border-line bg-surface2/40 p-6 text-center">
                <p className="text-sm text-muted">No tasks due today.</p>
                <Link
                  to={path('/planner')}
                  className="mt-2 inline-block text-xs font-semibold text-primary-600 hover:underline"
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
                    <Badge tone={t.priority === 'high' ? 'danger' : 'neutral'}>
                      {t.priority}
                    </Badge>
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
            <div className="rounded-xl border border-dashed border-line bg-surface2/40 p-6 text-center">
              <p className="text-sm text-muted">
                No conversations yet. Ask AWAL anything about your courses!
              </p>
              <Link
                to={path('/chat')}
                className="mt-2 inline-block text-xs font-semibold text-primary-600 hover:underline"
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
                  className="group -mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 text-sm transition-colors hover:bg-surface2/50 hover:text-primary-600"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600/10 text-primary-600 dark:text-primary-400">
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
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Quick Actions &amp; Learning Tools
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickTools.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={path(item.to)}
                className="group flex items-start gap-3.5 rounded-2xl border border-line/90 bg-surface p-4 shadow-sm transition-all duration-fast ease-soft hover:-translate-y-0.5 hover:border-primary-400/70 hover:shadow-md"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-fast group-hover:scale-105 ${item.accent}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-fg group-hover:text-primary-600 dark:group-hover:text-primary-400">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{item.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
