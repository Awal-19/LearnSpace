import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  GraduationCap,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UploadCloud,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Avatar, Badge, Button, Card, EmptyState, Skeleton, VerifiedBadge } from '../../design';
import { fetchAdminOverview, type AdminRange } from './adminApi';

export function AdminOverviewPage() {
  const [range, setRange] = useState<AdminRange>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'overview', range, from, to],
    queryFn: () =>
      fetchAdminOverview({
        range,
        from: range === 'custom' && from ? from : undefined,
        to: range === 'custom' && to ? to : undefined,
      }),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-danger">Could not load admin overview.</p>
        <Button size="sm" className="mt-3" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </Card>
    );
  }

  const { stats, series, topFeatures, topCourses, recentSignups, recentErrors, systemHealth } =
    query.data;
  const hasSeriesData = series.some(
    (s) => s.signups > 0 || s.dau > 0 || s.aiMessages > 0 || s.uploads > 0,
  );

  const cards = [
    {
      label: 'Total users',
      value: stats.totalUsers,
      sub: `+${stats.newToday} today · +${stats.new7d} (7d) · +${stats.new30d} (30d)`,
      icon: Users,
      accent: 'bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400',
    },
    {
      label: 'Active users',
      value: `${stats.dau} / ${stats.wau} / ${stats.mau}`,
      sub: 'DAU / WAU / MAU',
      icon: Activity,
      accent: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Verified / Unverified',
      value: `${stats.verifiedUsers} / ${stats.unverifiedUsers}`,
      sub: 'Email verification status',
      icon: CheckCircle2,
      accent: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    },
    {
      label: 'AI messages',
      value: stats.totalAiMessages,
      sub: 'Total chat messages',
      icon: MessageSquare,
      accent: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    },
    {
      label: 'Uploads',
      value: stats.totalUploads,
      sub: 'Chat files & documents',
      icon: UploadCloud,
      accent: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Documents processed',
      value: stats.totalDocumentsProcessed,
      sub: 'Ready study documents',
      icon: FileText,
      accent: 'bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400',
    },
    {
      label: 'Notes created',
      value: stats.totalNotes,
      sub: 'Total student notes',
      icon: BookOpen,
      accent: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Quizzes taken',
      value: stats.totalQuizzesTaken,
      sub: 'Completed quiz attempts',
      icon: GraduationCap,
      accent: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    },
  ];

  const chartTooltipStyle = {
    borderRadius: '0.75rem',
    border: '1px solid rgb(var(--color-border))',
    backgroundColor: 'rgb(var(--color-surface))',
    fontSize: '12px',
  };

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 dark:border-primary-500/20 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary-500/25 bg-primary-500/10 px-2.5 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Platform Command Center</span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              Admin Overview
            </h1>
            <p className="text-sm text-muted">
              Live platform metrics from the LearnSpace database.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div
              role="group"
              aria-label="Date range"
              className="inline-flex flex-wrap gap-1 rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
            >
              {(['7d', '30d', '90d', 'custom'] as AdminRange[]).map((r) => {
                const active = range === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-base ease-soft ${
                      active
                        ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                        : 'text-muted hover:text-fg'
                    }`}
                  >
                    {r === 'custom' ? 'Custom' : r.toUpperCase()}
                  </button>
                );
              })}
            </div>
            {range === 'custom' ? (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9 rounded-xl border border-line bg-surface px-2.5 text-xs text-fg focus:border-primary-500 focus:outline-none"
                />
                <span className="text-xs text-muted">to</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 rounded-xl border border-line bg-surface px-2.5 text-xs text-fg focus:border-primary-500 focus:outline-none"
                />
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card
              key={c.label}
              className="p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-medium text-muted">{c.label}</span>
                  <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-fg tabular-nums">
                    {c.value}
                  </p>
                </div>
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${c.accent}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-2 text-xs text-muted">{c.sub}</p>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/10 text-primary-600 dark:text-primary-400">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="font-display text-base font-semibold text-fg">
              Sign-ups &amp; Daily Active Users
            </h2>
          </div>
          {!hasSeriesData ? (
            <EmptyState
              icon={Users}
              title="No activity in this range"
              description="Sign-ups and active user trends will appear here once recorded."
            />
          ) : (
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="signups"
                    name="Sign-ups"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fill="#2563eb"
                    fillOpacity={0.18}
                  />
                  <Area
                    type="monotone"
                    dataKey="dau"
                    name="DAU"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="#10b981"
                    fillOpacity={0.18}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="font-display text-base font-semibold text-fg">
              AI Messages &amp; Uploads per Day
            </h2>
          </div>
          {!hasSeriesData ? (
            <EmptyState
              icon={MessageSquare}
              title="No AI or upload activity"
              description="Daily AI messages and uploads will appear here."
            />
          ) : (
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar
                    dataKey="aiMessages"
                    name="AI messages"
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar dataKey="uploads" name="Uploads" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-fg">Recent Sign-ups</h2>
            <Link
              to="/admin/users"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          {recentSignups.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No users yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line/80 text-sm">
              {recentSignups.map((u) => (
                <li
                  key={u.id}
                  className="-mx-2 flex items-center justify-between gap-2.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface2/50"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={u.name} size="sm" />
                    <div className="min-w-0">
                      <Link
                        to={`/admin/users/${u.id}`}
                        className="inline-flex max-w-full items-center gap-1 font-medium text-fg hover:text-primary-600 hover:underline"
                      >
                        <span className="truncate">{u.name}</span>
                        {u.emailVerified ? <VerifiedBadge /> : null}
                      </Link>
                      <p className="truncate text-xs text-muted">{u.email}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold text-fg">
            Active Features &amp; Top Courses
          </h2>
          <div className="mt-4 space-y-4 text-sm">
            {topFeatures.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  AI Features
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {topFeatures.map((f) => (
                    <Badge key={f.feature} tone="primary">
                      {f.feature}: {f.count}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted">No AI feature events in this range.</p>
            )}
            {topCourses.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Top Courses
                </p>
                <ul className="mt-2 space-y-1.5">
                  {topCourses.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between rounded-xl bg-surface2/50 px-3 py-2 text-xs"
                    >
                      <span className="truncate font-medium text-fg">{c.name}</span>
                      <span className="shrink-0 font-semibold text-muted tabular-nums">
                        {c.activityCount} items
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="min-w-0 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <h2 className="font-display text-base font-semibold text-fg">
              System Health &amp; Recent Errors
            </h2>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
            {Object.entries(systemHealth).map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-xl border border-line/80 bg-surface2/40 px-3 py-2"
              >
                <span className="capitalize font-medium text-muted">{k}</span>
                <Badge tone={v === 'up' || v === 'configured' ? 'success' : 'warning'}>{v}</Badge>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Recent 5xx Errors
            </p>
            {recentErrors.length === 0 ? (
              <div className="mt-2 rounded-xl border border-dashed border-line bg-surface2/30 p-3 text-xs text-muted">
                No server errors logged.
              </div>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs">
                {recentErrors.slice(0, 4).map((err) => (
                  <li
                    key={err.id}
                    className="flex min-w-0 items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 p-2 text-danger"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 break-words">
                      {err.method} {err.route} — {err.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
