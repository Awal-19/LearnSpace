import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CalendarClock, CheckCircle2, Clock, Flame, MessageSquare, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { Badge, Card, ErrorState, Skeleton } from '../../design';
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
  stats: {
    streakDays: number;
    hoursLast7Days: number;
  };
  recentConversations: Array<{
    id: string;
    title: string;
    updatedAt: string;
  }>;
  unreadNotifications: number;
}

function timeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage() {
  const path = useAppPath();
  const qc = useQueryClient();

  const dashQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => request<DashboardResponse>('/dashboard'),
  });

  if (dashQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (dashQuery.isError || !dashQuery.data) {
    return (
      <ErrorState
        title="Could not load dashboard"
        message="Please try again."
        onRetry={() => void dashQuery.refetch()}
      />
    );
  }

  const data = dashQuery.data;
  const greeting = `${timeGreeting(new Date().getHours())}, ${data.greetingName}`;

  const completeTask = async (id: string) => {
    await request(`/tasks/${id}`, { method: 'PATCH', body: { status: 'done' } });
    await qc.invalidateQueries({ queryKey: ['dashboard'] });
    await qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{greeting}</h1>
          <p className="mt-1 text-sm text-muted">
            Here is your study snapshot for today.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Card className="flex items-center gap-2.5 px-4 py-2.5">
            <Flame className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted">Streak</p>
              <p className="text-sm font-semibold">{data.stats.streakDays} days</p>
            </div>
          </Card>
          <Card className="flex items-center gap-2.5 px-4 py-2.5">
            <Clock className="h-5 w-5 text-primary-600" aria-hidden="true" />
            <div>
              <p className="text-xs text-muted">Last 7 days</p>
              <p className="text-sm font-semibold">{data.stats.hoursLast7Days}h</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-fg">Today&apos;s tasks</h2>
              {data.overdueCount > 0 ? (
                <Badge tone="danger">{data.overdueCount} overdue</Badge>
              ) : null}
            </div>
            <Link
              to={path('/planner')}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
            >
              Open planner
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {data.todayTasks.length === 0 ? (
            <p className="py-4 text-sm text-muted">No tasks due today.</p>
          ) : (
            <div className="divide-y divide-line">
              {data.todayTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => void completeTask(t.id)}
                    className="flex min-w-0 items-center gap-2 text-left text-sm hover:text-primary-600"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-muted" />
                    <span className="truncate">{t.title}</span>
                  </button>
                  <Badge tone={t.priority === 'high' ? 'danger' : 'neutral'}>
                    {t.priority}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fg">Recent AI chats</h2>
            <Link
              to={path('/chat')}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
            >
              Ask AI tutor
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {data.recentConversations.length === 0 ? (
            <p className="py-4 text-sm text-muted">No conversations yet. Ask your AI tutor anything!</p>
          ) : (
            <div className="divide-y divide-line">
              {data.recentConversations.map((c) => (
                <Link
                  key={c.id}
                  to={path(`/chat/${c.id}`)}
                  className="flex items-center justify-between py-2.5 text-sm hover:text-primary-600"
                >
                  <span className="truncate font-medium">{c.title}</span>
                  <span className="text-xs text-muted">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { to: '/chat', label: 'AI Tutor', icon: MessageSquare },
          { to: '/notes', label: 'Notes', icon: BookOpen },
          { to: '/planner', label: 'Study Planner', icon: CalendarClock },
          { to: '/focus', label: 'Focus Timer', icon: Timer },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={path(item.to)}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm font-medium text-fg transition-colors hover:border-primary-400 hover:text-primary-600"
            >
              <Icon className="h-5 w-5 text-primary-600" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

