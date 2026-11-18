import { useQuery } from '@tanstack/react-query';
import { Mail, MessageSquareWarning } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { fetchAdminFeedback, replyAdminFeedback, updateAdminFeedback } from './adminApi';

export function AdminFeedbackPage() {
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState('');
  const query = useQuery({
    queryKey: ['admin', 'feedback', statusFilter],
    queryFn: () => fetchAdminFeedback(statusFilter || undefined),
  });

  const handleStatus = async (id: string, status: 'new' | 'in_progress' | 'resolved') => {
    const notes = window.prompt('Admin notes (optional):') ?? undefined;
    try {
      await updateAdminFeedback(id, status, notes);
      toast.show({ kind: 'success', title: `Marked ${status}` });
      await query.refetch();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Update failed',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    }
  };

  const handleReply = async (id: string, email: string) => {
    const msg = window.prompt(`Email reply to ${email}:`);
    if (!msg || msg.trim().length < 2) return;
    try {
      await replyAdminFeedback(id, msg.trim());
      toast.show({ kind: 'success', title: 'Reply sent & marked resolved' });
      await query.refetch();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Reply failed',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <MessageSquareWarning className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
              Feedback &amp; Support
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Student bug reports, suggestions, and abuse reports.
            </p>
          </div>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-line bg-surface px-3.5 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={MessageSquareWarning}
          title="No feedback reports"
          description="Student submissions will appear here."
        />
      ) : (
        <div className="space-y-3">
          {query.data?.items.map((f) => (
            <Card key={f.id} className="p-5 transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        f.status === 'resolved'
                          ? 'success'
                          : f.status === 'in_progress'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {f.status}
                    </Badge>
                    <Badge tone="neutral">{f.category}</Badge>
                    <span className="font-semibold">{f.subject}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    From {f.user.name} ({f.user.email}) · {new Date(f.createdAt).toLocaleString()}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{f.message}</p>
                  {f.adminNotes ? (
                    <p className="mt-2 rounded bg-surface2 px-2.5 py-1.5 text-xs text-muted">
                      Admin note: {f.adminNotes}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleStatus(f.id, 'in_progress')}
                  >
                    In progress
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleStatus(f.id, 'resolved')}
                  >
                    Resolve
                  </Button>
                  <Button size="sm" onClick={() => void handleReply(f.id, f.user.email)}>
                    <Mail className="mr-1 h-3.5 w-3.5" />
                    Reply
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
