import { useQuery } from '@tanstack/react-query';
import { Download, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, DataTable, EmptyState, Skeleton, useToast } from '../../design';
import { exportAuditLogsCsv, fetchAdminAuditLogs } from './adminApi';

export function AdminAuditLogPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['admin', 'audit-logs', q, page],
    queryFn: () => fetchAdminAuditLogs({ q: q.trim() || undefined, page }),
  });

  const handleExport = async () => {
    try {
      await exportAuditLogsCsv();
      toast.show({ kind: 'success', title: 'Audit log exported to CSV' });
    } catch {
      toast.show({ kind: 'error', title: 'Export failed' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">Audit Log</h1>
            <p className="mt-0.5 text-sm text-muted">Immutable record of all admin actions.</p>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void handleExport()}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search action, actor, or reason…"
          className="w-full rounded-xl border border-line bg-surface2/50 py-2 pl-9 pr-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
        />
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No audit events yet"
          description="Admin actions will be logged here automatically."
        />
      ) : (
        <DataTable>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface2/70 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {query.data?.items.map((log) => (
                <tr key={log.id} className="transition-colors hover:bg-surface2/40">
                  <td className="px-4 py-3 text-xs text-muted tabular-nums">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-fg">{log.actor.email}</td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{log.action}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {log.targetType}
                    {log.targetId ? `:${log.targetId.slice(0, 8)}` : ''}
                  </td>
                  <td className="px-4 py-3 text-xs">{log.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted tabular-nums">{log.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}
    </div>
  );
}
