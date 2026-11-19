import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, GlassCard, Skeleton } from '../../design';
import { fetchAdminErrorLogs, fetchAdminLoginHistory, fetchAdminSystemHealth } from './adminApi';

export function AdminSystemPage() {
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);

  const healthQuery = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: fetchAdminSystemHealth,
  });
  const loginsQuery = useQuery({
    queryKey: ['admin', 'login-history', suspiciousOnly],
    queryFn: () => fetchAdminLoginHistory(suspiciousOnly),
  });
  const errorsQuery = useQuery({
    queryKey: ['admin', 'error-logs'],
    queryFn: fetchAdminErrorLogs,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <Activity className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            System &amp; Security
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Service health, login history, and server error logs.
          </p>
        </div>
      </div>

      {healthQuery.isLoading ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : healthQuery.data ? (
        <GlassCard className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold">Service Health</h2>
            <span className="rounded-full bg-surface2 px-3 py-1 text-xs font-medium text-muted">
              v{healthQuery.data.version} · {healthQuery.data.nodeVersion} · Uptime{' '}
              {healthQuery.data.uptimeSeconds}s
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            {[
              { name: 'API', val: healthQuery.data.api },
              {
                name: `Database (${healthQuery.data.dbLatencyMs}ms)`,
                val: healthQuery.data.database,
              },
              { name: 'Email', val: healthQuery.data.email },
              { name: 'AI Provider', val: healthQuery.data.ai },
              { name: 'Storage', val: healthQuery.data.storage },
            ].map((s) => (
              <div
                key={s.name}
                className="flex flex-col gap-2 rounded-xl border border-line/80 bg-surface2/40 p-3.5 text-sm"
              >
                <p className="text-xs font-medium text-muted">{s.name}</p>
                <div>
                  <Badge tone={s.val === 'up' || s.val === 'configured' ? 'success' : 'warning'}>
                    {s.val}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Login History</h2>
            <Button
              size="sm"
              variant={suspiciousOnly ? 'primary' : 'secondary'}
              onClick={() => setSuspiciousOnly((v) => !v)}
            >
              {suspiciousOnly ? 'Showing suspicious' : 'Suspicious only'}
            </Button>
          </div>
          {loginsQuery.isLoading ? (
            <Skeleton className="mt-3 h-40" />
          ) : (
            <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto text-xs">
              {loginsQuery.data?.items.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-medium">{l.email}</span> ({l.method}){' '}
                    <Badge tone={l.success ? 'success' : 'danger'}>
                      {l.success ? 'OK' : 'Failed'}
                    </Badge>
                    {l.suspicious ? <Badge tone="warning">Suspicious</Badge> : null}
                    {l.reason ? <p className="text-muted">{l.reason}</p> : null}
                  </div>
                  <span className="text-muted">{new Date(l.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="font-display text-base font-semibold">Recent Server Errors</h2>
          {errorsQuery.isLoading ? (
            <Skeleton className="mt-3 h-40" />
          ) : (errorsQuery.data?.items.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-muted">No server errors logged.</p>
          ) : (
            <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto text-xs">
              {errorsQuery.data?.items.map((e) => (
                <li key={e.id} className="py-2">
                  <div className="flex justify-between">
                    <span className="font-semibold text-danger">
                      {e.statusCode} {e.method} {e.route}
                    </span>
                    <span className="text-muted">{new Date(e.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-0.5 text-muted">{e.message}</p>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
