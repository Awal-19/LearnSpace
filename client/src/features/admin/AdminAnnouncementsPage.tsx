import { useQuery } from '@tanstack/react-query';
import { Megaphone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  fetchAdminAnnouncements,
  toggleAdminAnnouncement,
} from './adminApi';

export function AdminAnnouncementsPage() {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<'all' | 'programme' | 'level'>('all');
  const [audienceValue, setAudienceValue] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const query = useQuery({
    queryKey: ['admin', 'announcements'],
    queryFn: fetchAdminAnnouncements,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createAdminAnnouncement({
        title,
        message,
        audience,
        audienceValue: audience === 'all' ? null : audienceValue.trim() || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        sendEmail,
      });
      setTitle('');
      setMessage('');
      setAudienceValue('');
      setScheduledAt('');
      setSendEmail(false);
      toast.show({ kind: 'success', title: 'Announcement created' });
      await query.refetch();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Failed to create announcement',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
          <Megaphone className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">Announcements</h1>
          <p className="mt-0.5 text-sm text-muted">
            Publish banners and notifications to all students or specific programmes/levels.
          </p>
        </div>
      </div>

      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-base font-semibold">New Announcement</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-sm">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="font-medium">Title</span>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Midterm Revision Week"
                className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              />
            </label>
            <label className="space-y-1.5">
              <span className="font-medium">Audience</span>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as 'all' | 'programme' | 'level')}
                className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              >
                <option value="all">All students</option>
                <option value="programme">Specific programme</option>
                <option value="level">Specific level</option>
              </select>
            </label>
          </div>

          {audience !== 'all' ? (
            <label className="block space-y-1.5">
              <span className="font-medium">
                {audience === 'programme' ? 'Programme name' : 'Level (e.g. Year 2)'}
              </span>
              <input
                required
                value={audienceValue}
                onChange={(e) => setAudienceValue(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              />
            </label>
          ) : null}

          <label className="block space-y-1.5">
            <span className="font-medium">Message</span>
            <textarea
              required
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface2/50 p-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <span className="text-muted">Schedule (optional):</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="rounded-xl border border-line bg-surface2/50 px-2.5 py-1.5 text-xs text-fg focus:border-primary-500 focus:bg-surface focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              <span>Also send email</span>
            </label>
          </div>

          <Button type="submit" size="sm" loading={submitting}>
            <Megaphone className="mr-1.5 h-3.5 w-3.5" />
            Publish announcement
          </Button>
        </form>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-40" />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Published announcements will appear here."
        />
      ) : (
        <div className="space-y-3">
          {query.data?.items.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{a.title}</h3>
                    <Badge tone={a.active ? 'success' : 'neutral'}>
                      {a.active ? 'Active' : 'Paused'}
                    </Badge>
                    <Badge tone="neutral">
                      {a.audience}
                      {a.audienceValue ? `: ${a.audienceValue}` : ''}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{a.message}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void toggleAdminAnnouncement(a.id, !a.active).then(() => query.refetch())
                    }
                  >
                    {a.active ? 'Pause' : 'Activate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      if (window.confirm('Delete this announcement?')) {
                        void deleteAdminAnnouncement(a.id).then(() => query.refetch());
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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

