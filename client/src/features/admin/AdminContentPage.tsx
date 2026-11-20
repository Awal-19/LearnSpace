import { useQuery } from '@tanstack/react-query';
import { Eye, FileSearch, Flag, HardDrive, MessageSquare, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, DataTable, EmptyState, GlassCard, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { formatBytes } from '../chat/imagePrep';
import {
  deleteAdminUpload,
  fetchAdminCommunityOverview,
  fetchAdminConversations,
  fetchAdminFlagged,
  fetchAdminUploads,
  inspectAdminConversation,
  inspectAdminUpload,
  resolveAdminCommunityReport,
  resolveAdminFlag,
  updateAdminCommunitySettings,
} from './adminApi';

export function AdminContentPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'conversations' | 'flagged' | 'uploads' | 'community'>(
    'conversations',
  );
  const [commEnabled, setCommEnabled] = useState(true);
  const [bannedWordsText, setBannedWordsText] = useState('');
  const [examNoticeEnabled, setExamNoticeEnabled] = useState(false);
  const [examNoticeMsg, setExamNoticeMsg] = useState('');
  const [pausedSlugsText, setPausedSlugsText] = useState('');
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

  const communityQuery = useQuery({
    queryKey: ['admin', 'community'],
    queryFn: () => fetchAdminCommunityOverview(),
    enabled: tab === 'community',
  });

  useEffect(() => {
    if (communityQuery.data?.settings) {
      setCommEnabled(communityQuery.data.settings.featureCommunity);
      setBannedWordsText(communityQuery.data.settings.bannedWords.join(', '));
      setExamNoticeEnabled(communityQuery.data.settings.examNoticeEnabled);
      setExamNoticeMsg(communityQuery.data.settings.examNoticeMessage);
      setPausedSlugsText(communityQuery.data.settings.pausedCourseSlugs.join(', '));
    }
  }, [communityQuery.data]);

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

  const handleDeleteUpload = async (
    source: 'attachment' | 'document',
    id: string,
    name: string,
  ) => {
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
              { id: 'community', label: 'Community Moderation', icon: Users },
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
            <DataTable>
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
            </DataTable>
          )}

          {inspectedConv ? (
            <GlassCard className="p-5">
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
            </GlassCard>
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
              <GlassCard key={f.id} className="p-4">
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
              </GlassCard>
            ))}
          </div>
        )
      ) : null}

      {tab === 'uploads' ? (
        uploadsQuery.isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="space-y-4">
            <GlassCard className="p-4">
              <p className="text-xs text-muted">Total tracked storage</p>
              <p className="mt-1 font-display text-xl font-semibold">
                {formatBytes(uploadsQuery.data?.totalStorageBytes ?? 0)} (
                {uploadsQuery.data?.total ?? 0} files)
              </p>
            </GlassCard>

            {(uploadsQuery.data?.items.length ?? 0) === 0 ? (
              <EmptyState title="No uploads yet" description="Uploaded files will appear here." />
            ) : (
              <DataTable>
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
                      <tr
                        key={`${u.source}-${u.id}`}
                        className="transition-colors hover:bg-surface2/40"
                      >
                        <td className="px-4 py-3 font-medium text-fg">{u.name}</td>
                        <td className="px-4 py-3 capitalize text-muted">{u.source}</td>
                        <td className="px-4 py-3 text-xs text-muted">{u.owner.email}</td>
                        <td className="px-4 py-3 text-xs tabular-nums">
                          {formatBytes(u.sizeBytes)}
                        </td>
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
              </DataTable>
            )}

            {inspectedUpload ? (
              <GlassCard className="p-5">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <h2 className="font-display text-base font-semibold">{inspectedUpload.name}</h2>
                  <Button size="sm" variant="ghost" onClick={() => setInspectedUpload(null)}>
                    Close
                  </Button>
                </div>
                {(() => {
                  const raw = inspectedUpload.signedUrl;
                  if (!raw) return null;
                  let safeHref: string | null = null;
                  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) {
                    safeHref = raw;
                  } else {
                    try {
                      const parsed = new URL(raw);
                      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                        safeHref = parsed.toString();
                      }
                    } catch {
                      safeHref = null;
                    }
                  }
                  if (!safeHref) return null;
                  return (
                    <a
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm text-primary-600 hover:underline"
                    >
                      Open signed asset URL
                    </a>
                  );
                })()}
                <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-surface2 p-3 text-xs">
                  {inspectedUpload.extractedText || '(No extracted text)'}
                </pre>
              </GlassCard>
            ) : null}
          </div>
        )
      ) : null}

      {tab === 'community' ? (
        communityQuery.isLoading ? (
          <Skeleton className="h-56" />
        ) : communityQuery.data ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <GlassCard className="p-4">
                <p className="text-xs text-muted">Total Posts</p>
                <p className="font-display text-xl font-bold text-fg">
                  {communityQuery.data.stats.totalPosts}
                </p>
              </GlassCard>
              <GlassCard className="p-4">
                <p className="text-xs text-muted">Total Replies</p>
                <p className="font-display text-xl font-bold text-fg">
                  {communityQuery.data.stats.totalReplies}
                </p>
              </GlassCard>
              <GlassCard className="p-4">
                <p className="text-xs text-muted">Active Groups</p>
                <p className="font-display text-xl font-bold text-fg">
                  {communityQuery.data.stats.activeGroups}
                </p>
              </GlassCard>
              <GlassCard className="p-4">
                <p className="text-xs text-muted">Open Reports</p>
                <p className="font-display text-xl font-bold text-fg">
                  {communityQuery.data.stats.openReports}
                </p>
              </GlassCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <GlassCard className="space-y-3 p-5">
                <h2 className="font-display text-base font-semibold">Community Reports Queue</h2>
                {communityQuery.data.reports.length === 0 ? (
                  <p className="text-xs text-muted">No community reports yet.</p>
                ) : (
                  <div className="max-h-96 space-y-2.5 overflow-y-auto pr-1 text-xs">
                    {communityQuery.data.reports.map((rep) => (
                      <div key={rep.id} className="space-y-1.5 rounded-xl border border-line p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge tone={rep.status === 'open' ? 'warning' : 'neutral'}>
                            {rep.targetType} · {rep.status}
                          </Badge>
                          <span className="text-muted">
                            {new Date(rep.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-fg">Reason: {rep.reason}</p>
                        {rep.targetUser ? (
                          <p className="text-muted">
                            Target user: {rep.targetUser.name} ({rep.targetUser.email})
                          </p>
                        ) : null}
                        {rep.status === 'open' ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {(['dismiss', 'hide', 'mute', 'suspend'] as const).map((act) => (
                              <Button
                                key={act}
                                size="sm"
                                variant={act === 'suspend' ? 'danger' : 'secondary'}
                                onClick={async () => {
                                  await resolveAdminCommunityReport(rep.id, { action: act });
                                  await communityQuery.refetch();
                                  toast.show({ kind: 'success', title: `Action applied: ${act}` });
                                }}
                              >
                                {act}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              <GlassCard className="space-y-3 p-5">
                <h2 className="font-display text-base font-semibold">
                  Community Safety &amp; Exam Controls
                </h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const splitList = (raw: string) =>
                      raw
                        .split(/[,\n]/)
                        .map((s) => s.trim())
                        .filter(Boolean);
                    try {
                      await updateAdminCommunitySettings({
                        featureCommunity: commEnabled,
                        bannedWords: splitList(bannedWordsText),
                        examNoticeEnabled,
                        examNoticeMessage: examNoticeMsg,
                        pausedCourseSlugs: splitList(pausedSlugsText),
                      });
                      toast.show({ kind: 'success', title: 'Community settings updated' });
                      await communityQuery.refetch();
                    } catch (err) {
                      toast.show({
                        kind: 'error',
                        title: 'Could not save settings',
                        description:
                          err instanceof ApiError ? err.message : 'Step-up may be required.',
                      });
                    }
                  }}
                  className="space-y-3 text-xs"
                >
                  <label className="flex items-center gap-2 font-medium text-fg">
                    <input
                      type="checkbox"
                      checked={commEnabled}
                      onChange={(e) => setCommEnabled(e.target.checked)}
                    />
                    Enable Community feature
                  </label>
                  <label className="block space-y-1">
                    <span className="font-medium text-muted">Banned words (comma-separated)</span>
                    <input
                      type="text"
                      value={bannedWordsText}
                      onChange={(e) => setBannedWordsText(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-fg"
                    />
                  </label>
                  <label className="flex items-center gap-2 font-medium text-fg">
                    <input
                      type="checkbox"
                      checked={examNoticeEnabled}
                      onChange={(e) => setExamNoticeEnabled(e.target.checked)}
                    />
                    Show Exam-Period Integrity Notice
                  </label>
                  <label className="block space-y-1">
                    <span className="font-medium text-muted">Exam notice message</span>
                    <input
                      type="text"
                      value={examNoticeMsg}
                      onChange={(e) => setExamNoticeMsg(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-fg"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="font-medium text-muted">
                      Paused course slugs (comma-separated)
                    </span>
                    <input
                      type="text"
                      value={pausedSlugsText}
                      onChange={(e) => setPausedSlugsText(e.target.value)}
                      className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-fg"
                    />
                  </label>
                  <Button type="submit" size="sm">
                    Save community controls
                  </Button>
                </form>
              </GlassCard>
            </div>
          </div>
        ) : null
      ) : null}
    </div>
  );
}
