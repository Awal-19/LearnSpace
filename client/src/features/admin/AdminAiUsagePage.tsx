import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Cpu, DollarSign, Save, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button, Card, EmptyState, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { fetchAdminAiUsage, updateAdminAiLimits, type AdminRange } from './adminApi';

export function AdminAiUsagePage() {
  const toast = useToast();
  const [range, setRange] = useState<AdminRange>('30d');
  const [dailyMessageLimit, setDailyMessageLimit] = useState(100);
  const [maxUploadMb, setMaxUploadMb] = useState(20);
  const [dailyUploadQuota, setDailyUploadQuota] = useState(50);
  const [dailyCostAlertUsd, setDailyCostAlertUsd] = useState(5);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ['admin', 'ai-usage', range],
    queryFn: () => fetchAdminAiUsage(range),
  });

  useEffect(() => {
    if (query.data?.limits) {
      setDailyMessageLimit(query.data.limits.dailyMessageLimit);
      setMaxUploadMb(Math.round(query.data.limits.maxUploadBytes / (1024 * 1024)));
      setDailyUploadQuota(query.data.limits.dailyUploadQuota);
      setDailyCostAlertUsd(query.data.limits.dailyCostAlertUsd);
    }
  }, [query.data]);

  const saveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateAdminAiLimits({
        dailyMessageLimit,
        maxUploadBytes: maxUploadMb * 1024 * 1024,
        dailyUploadQuota,
        dailyCostAlertUsd,
      });
      toast.show({ kind: 'success', title: 'Limits updated immediately' });
      await query.refetch();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not update limits',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading) return <Skeleton className="h-72" />;
  if (query.isError || !query.data) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-danger">Failed to load AI usage metrics.</p>
      </Card>
    );
  }

  const { summary, byFeature, daily, topUsers } = query.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <Cpu className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
              AI Usage &amp; Costs
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Token consumption, latency, error rate, and quotas.
            </p>
          </div>
        </div>
        <div
          role="group"
          aria-label="Date range"
          className="inline-flex gap-1 rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
        >
          {(['7d', '30d', '90d'] as AdminRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-base ease-soft ${
                range === r
                  ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {summary.alertTriggered ? (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>
            Daily AI cost alert: today&apos;s estimated spend (${summary.costTodayUsd}) has reached
            your threshold (${dailyCostAlertUsd}).
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-medium text-muted">Total requests</span>
              <p className="mt-1.5 font-display text-2xl font-bold text-fg tabular-nums">
                {summary.totalRequests}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:text-primary-400">
              <Zap className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">Error rate: {summary.errorRatePct}%</p>
        </Card>
        <Card className="p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-medium text-muted">Tokens In / Out</span>
              <p className="mt-1.5 font-display text-2xl font-bold text-fg tabular-nums">
                {summary.tokensIn.toLocaleString()} / {summary.tokensOut.toLocaleString()}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <Cpu className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">Avg response: {summary.avgDurationMs} ms</p>
        </Card>
        <Card className="p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-medium text-muted">Est. Cost Today</span>
              <p className="mt-1.5 font-display text-2xl font-bold text-fg tabular-nums">
                ${summary.costTodayUsd}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">Alert threshold: ${dailyCostAlertUsd}</p>
        </Card>
        <Card className="p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xs font-medium text-muted">Est. Cost This Month</span>
              <p className="mt-1.5 font-display text-2xl font-bold text-fg tabular-nums">
                ${summary.costMonthUsd}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <DollarSign className="h-5 w-5" />
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">Range cost: ${summary.costRangeUsd}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold">Usage by Feature</h2>
          {byFeature.length === 0 ? (
            <EmptyState title="No feature usage yet" description="AI events will appear here." />
          ) : (
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byFeature}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="feature" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="requests" name="Requests" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold">Daily Requests</h2>
          {daily.length === 0 ? (
            <EmptyState title="No daily data yet" description="Requests over time will appear here." />
          ) : (
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="requests" name="Requests" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold">Top Users by Usage</h2>
          {topUsers.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No usage recorded yet.</p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase text-muted">
                <tr>
                  <th className="py-2">User</th>
                  <th className="py-2">Requests</th>
                  <th className="py-2">Tokens</th>
                  <th className="py-2 text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/80">
                {topUsers.map((u) => (
                  <tr key={u.userId} className="transition-colors hover:bg-surface2/40">
                    <td className="py-2.5">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="py-2.5 tabular-nums">{u.requests}</td>
                    <td className="py-2.5 tabular-nums">{u.tokens.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-medium tabular-nums">${u.costUsd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold">Global Limits &amp; Alert Threshold</h2>
          <form onSubmit={saveLimits} className="mt-4 space-y-3.5 text-sm">
            <label className="block space-y-1.5">
              <span className="font-medium">Daily AI message limit per user</span>
              <input
                type="number"
                min={1}
                value={dailyMessageLimit}
                onChange={(e) => setDailyMessageLimit(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-medium">Max upload size (MB)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={maxUploadMb}
                onChange={(e) => setMaxUploadMb(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-medium">Daily upload quota per user</span>
              <input
                type="number"
                min={1}
                value={dailyUploadQuota}
                onChange={(e) => setDailyUploadQuota(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-medium">Daily cost alert threshold (USD)</span>
              <input
                type="number"
                step="0.1"
                min={0.1}
                value={dailyCostAlertUsd}
                onChange={(e) => setDailyCostAlertUsd(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              />
            </label>
            <Button type="submit" size="sm" loading={saving}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save limits
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

