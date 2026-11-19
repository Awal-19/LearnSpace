import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, EmptyState, GlassCard, Select, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  createAdminExport,
  downloadAdminExport,
  fetchAdminExports,
  type AdminExportJob,
} from './adminApi';

export function AdminReportsPage() {
  const toast = useToast();
  const [kind, setKind] = useState<AdminExportJob['kind']>('users');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [running, setRunning] = useState(false);

  const query = useQuery({
    queryKey: ['admin', 'exports'],
    queryFn: fetchAdminExports,
  });

  const handleGenerate = async () => {
    setRunning(true);
    try {
      await createAdminExport({
        kind,
        from: from || undefined,
        to: to || undefined,
      });
      toast.show({ kind: 'success', title: 'Export generated' });
      await query.refetch();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Export failed',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
          <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            Reports &amp; Exports
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Export users, usage, AI costs, feedback (CSV) or an Overview report (PDF).
          </p>
        </div>
      </div>

      <GlassCard className="p-5 sm:p-6">
        <div className="grid gap-3.5 sm:grid-cols-4">
          <Select
            aria-label="Export report type"
            value={kind}
            onChange={(e) => setKind(e.target.value as AdminExportJob['kind'])}
          >
            <option value="users">Users (CSV)</option>
            <option value="usage">Usage Events (CSV)</option>
            <option value="ai_costs">AI Costs (CSV)</option>
            <option value="feedback">Feedback Reports (CSV)</option>
            <option value="overview_pdf">Overview Report (PDF)</option>
          </Select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
          />
          <Button size="sm" loading={running} onClick={() => void handleGenerate()}>
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            Generate export
          </Button>
        </div>
      </GlassCard>

      {query.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (query.data?.jobs.length ?? 0) === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No exports yet"
          description="Generated CSV and PDF reports will appear here."
        />
      ) : (
        <GlassCard className="divide-y divide-line/80 overflow-hidden !p-0">
          {query.data?.jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm transition-colors hover:bg-surface2/40"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{job.fileName ?? job.kind}</span>
                  <Badge tone={job.status === 'completed' ? 'success' : 'neutral'}>
                    {job.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted">{new Date(job.createdAt).toLocaleString()}</p>
              </div>
              {job.status === 'completed' && job.fileName ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void downloadAdminExport(job.id, job.fileName!)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </Button>
              ) : null}
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  );
}
