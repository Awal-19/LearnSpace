import { useQuery } from '@tanstack/react-query';
import { Eye, FileSearch, Flag, HardDrive, MessageSquare, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { formatBytes } from '../chat/imagePrep';
import {
  deleteAdminUpload,
  fetchAdminConversations,
  fetchAdminFlagged,
  fetchAdminUploads,
  inspectAdminConversation,
  inspectAdminUpload,
  resolveAdminFlag,
} from './adminApi';

export function AdminContentPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'conversations' | 'flagged' | 'uploads'>('conversations');
  const [q, setQ] = useState('');
  const [inspectedConv, setInspectedConv] = useState<{
    title: string;
    messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
  } | null>(null);
  const [inspectedUpload, setInspectedUpload] = useState<{
    name: string;
    extractedText: string | null;
    signedUrl: string | null;
  } | null>(null);

  const convQuery = useQuery({
    queryKey: ['admin', 'conversations', q],
    queryFn: () => fetchAdminConversations({ q: q.trim() || undefined }),
    enabled: tab === 'conversations',
  });

  const flagQuery = useQuery({
    queryKey: ['admin', 'flagged'],
    queryFn: () => fetchAdminFlagged(),
    enabled: tab === 'flagged',
  });

  const uploadsQuery = useQuery({
    queryKey: ['admin', 'uploads'],
    queryFn: () => fetchAdminUploads(),
    enabled: tab === 'uploads',
  });

  const handleInspectConversation = async (id: string) => {
    const reason = window.prompt(
      'Privacy check: enter the moderation reason (logged in the audit log):',
    );
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) {
        toast.show({ kind: 'error', title: 'Reason must be at least 5 characters' });
      }
      return;
    }
    try {
      const res = await inspectAdminConversation(id, reason.trim());
      setInspectedConv(res.conversation);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Inspection failed',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    }
  };

  const handleInspectUpload = async (source: 'attachment' | 'document', id: string) => {
    const reason = window.prompt(
      'Privacy check: enter the moderation reason (logged in the audit log):',
    );
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) {
        toast.show({ kind: 'error', title: 'Reason must be at least 5 characters' });
      }
      return;
    }
    try {
      const res = await inspectAdminUpload(source, id, reason.trim());
      setInspectedUpload(res.item);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Inspection failed',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    }
  };

  const handleDeleteUpload = async (source: 'attachment' | 'document', id: string, name: string) => {
    if (!window.confirm(`Delete "${name}" permanently?`)) return;
    try {
      await deleteAdminUpload(source, id);
      toast.show({ kind: 'success', title: 'File deleted' });
      await uploadsQuery.refetch();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Delete failed',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    }
  };

  const handleResolveFlag = async (id: string, status: 'dismissed' | 'warned' | 'suspended') => {
    const note = window.prompt(`Moderation note for "${status}" (optional):`) ?? undefined;
    try {
      await resolveAdminFlag(id, status, note);
      toast.show({ kind: 'success', title: `Flag marked ${status}` });
      await flagQuery.refetch();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Failed to resolve flag',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <FileSearch className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
              Content &amp; Moderation
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Conversations show metadata only by default. Viewing content requires a logged reason.
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Content moderation sections"
          className="inline-flex flex-wrap gap-1 rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
        >
          {(
            [
              { id: 'conversations', label: 'Conversations', icon: MessageSquare },
              { id: 'flagged', label: 'Flagged Queue', icon: Flag },
              { id: 'uploads', label: 'Uploads & Storage', icon: HardDrive },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-base ease-soft ${
                  active
                    ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                    : 'text-muted hover:text-fg'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'conversations' ? (
        <div className="space-y-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by title or user email…"
            className="w-full max-w-sm rounded-xl border border-line bg-surface2/50 px-3.5 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
          />

          {convQuery.isLoading ? (
            <Skeleton className="h-48 rounded-2xl" />
          ) : (convQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="No conversations" description="No chat sessions match." />
          ) : (
            <Card className="overflow-hidden !p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-surface2/70 text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Title (Metadata)</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Messages</th>
                      <th className="px-4 py-3">Updated</th>
                      <th className="px-4 py-3 text-right">Moderation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/80">
                    {convQuery.data?.items.map((c) => (
                      <tr key={c.id} className="transition-colors hover:bg-surface2/40">
                        <td className="px-4 py-3 font-medium text-fg">{c.title}</td>
                        <td className="px-4 py-3 text-xs text-muted">{c.user.email}</td>
                        <td className="px-4 py-3 tabular-nums">{c._count.messages}</td>
                        <td className="px-4 py-3 text-xs text-muted tabular-nums">
                          {new Date(c.updatedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void handleInspectConversation(c.id)}
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {inspectedConv ? (
            <Card className="p-5">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h2 className="font-display text-base font-semibold">
                  Audited Inspection: {inspectedConv.title}
                </h2>
                <Button size="sm" variant="ghost" onClick={() => setInspectedConv(null)}>
                  Close
                </Button>
              </div>
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
                {inspectedConv.messages.map((m) => (
                  <div key={m.id} className="rounded border border-line p-2.5">
                    <span className="text-xs font-semibold uppercase text-muted">{m.role}</span>
                    <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'flagged' ? (
        flagQuery.isLoading ? (
          <Skeleton className="h-48" />
        ) : (flagQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="No flagged items" description="The moderation queue is clear." />
        ) : (
          <div className="space-y-3">
            {flagQuery.data?.items.map((f) => (
              <Card key={f.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone={f.status === 'open' ? 'warning' : 'neutral'}>{f.status}</Badge>
                      <span className="font-medium">{f.targetUser.email}</span>
                    </div>
                    <p className="mt-1 text-sm">{f.reason}</p>
                    {f.reviewNote ? (
                      <p className="mt-1 text-xs text-muted">Note: {f.reviewNote}</p>
                    ) : null}
                  </div>
                  {f.status === 'open' ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleResolveFlag(f.id, 'dismissed')}
                      >
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleResolveFlag(f.id, 'warned')}
                      >
                        Warn user
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void handleResolveFlag(f.id, 'suspended')}
                      >
                        Suspend user
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}

      {tab === 'uploads' ? (
        uploadsQuery.isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="space-y-4">
            <Card className="p-4">
              <p className="text-xs text-muted">Total tracked storage</p>
              <p className="mt-1 font-display text-xl font-semibold">
                {formatBytes(uploadsQuery.data?.totalStorageBytes ?? 0)} ({uploadsQuery.data?.total ?? 0}{' '}
                files)
              </p>
            </Card>

            {(uploadsQuery.data?.items.length ?? 0) === 0 ? (
              <EmptyState title="No uploads yet" description="Uploaded files will appear here." />
            ) : (
              <Card className="overflow-hidden !p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-line bg-surface2/70 text-xs uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-4 py-3">File</th>
                        <th className="px-4 py-3">Source</th>
                        <th className="px-4 py-3">Owner</th>
                        <th className="px-4 py-3">Size</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/80">
                      {uploadsQuery.data?.items.map((u) => (
                        <tr key={`${u.source}-${u.id}`} className="transition-colors hover:bg-surface2/40">
                          <td className="px-4 py-3 font-medium text-fg">{u.name}</td>
                          <td className="px-4 py-3 capitalize text-muted">{u.source}</td>
                          <td className="px-4 py-3 text-xs text-muted">{u.owner.email}</td>
                          <td className="px-4 py-3 text-xs tabular-nums">{formatBytes(u.sizeBytes)}</td>
                          <td className="px-4 py-3">
                            <Badge tone="neutral">{u.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void handleInspectUpload(u.source, u.id)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => void handleDeleteUpload(u.source, u.id, u.name)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {inspectedUpload ? (
              <Card className="p-5">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <h2 className="font-display text-base font-semibold">{inspectedUpload.name}</h2>
                  <Button size="sm" variant="ghost" onClick={() => setInspectedUpload(null)}>
                    Close
                  </Button>
                </div>
                {inspectedUpload.signedUrl ? (
                  <a
                    href={inspectedUpload.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm text-primary-600 hover:underline"
                  >
                    Open signed asset URL
                  </a>
                ) : null}
                <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-surface2 p-3 text-xs">
                  {inspectedUpload.extractedText || '(No extracted text)'}
                </pre>
              </Card>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}

