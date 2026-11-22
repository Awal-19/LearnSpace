import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Eye,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, GlassCard, Input, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  addAdminShsTopic,
  bulkGenerateAdminShsLessons,
  createAdminShsSubject,
  fetchAdminShsLessons,
  fetchAdminShsOverview,
  regenerateAdminShsLesson,
  resolveAdminShsFlag,
  resolveAdminShsLessonReport,
  toggleAdminShsSubject,
  updateAdminShsLesson,
  updateAdminShsSettings,
} from './adminApi';

export function AdminShsPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'shs-overview'],
    queryFn: fetchAdminShsOverview,
  });

  const lessonsQuery = useQuery({
    queryKey: ['admin', 'shs-lessons'],
    queryFn: () => fetchAdminShsLessons(),
  });

  const [bulkBusy, setBulkBusy] = useState(false);

  const [bannedWordsText, setBannedWordsText] = useState('');
  const [syllabusSource, setSyllabusSource] = useState('');
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjCode, setNewSubjCode] = useState('');
  const [newSubjCore, setNewSubjCore] = useState(false);
  const [topicSubjectId, setTopicSubjectId] = useState('');
  const [newTopicTitle, setNewTopicTitle] = useState('');

  useEffect(() => {
    if (query.data) {
      setBannedWordsText((query.data.settings?.shsBannedWords ?? []).join(', '));
      setSyllabusSource(query.data.settings?.shsSyllabusSource ?? '');
      if (!topicSubjectId && query.data.subjects?.[0]?.id) {
        setTopicSubjectId(query.data.subjects[0].id);
      }
    }
  }, [query.data, topicSubjectId]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'shs-overview'] });

  const updateSettings = async (patch: Parameters<typeof updateAdminShsSettings>[0]) => {
    try {
      await updateAdminShsSettings(patch);
      await refresh();
      toast.show({ kind: 'success', title: 'SHS settings updated' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Failed to update SHS settings',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    }
  };

  if (query.isLoading) {
    return (
      <div className="space-y-6" aria-label="Loading SHS & Safety">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    const status = query.error instanceof ApiError ? query.error.status : null;
    const isForbidden = status === 403 || status === 401;
    return (
      <GlassCard className="mx-auto max-w-lg space-y-4 p-6 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-danger/15 text-danger">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold text-fg">
            {isForbidden
              ? 'This page needs admin or super admin access'
              : 'Could not load SHS & Safety dashboard'}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {isForbidden
              ? 'Unlock the admin console or sign in with an authorized admin account.'
              : 'The server returned an error while loading SHS & Safety data.'}
            {status ? ` (HTTP ${status})` : ''}
          </p>
        </div>
        <div className="flex justify-center">
          <Button type="button" size="sm" onClick={() => void query.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      </GlassCard>
    );
  }

  const { counts, settings, flags = [], subjects = [] } = query.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">SHS &amp; Child Safety</h1>
          <p className="text-sm text-muted">
            Manage Ghanaian SHS sign-ups, guardian consent status, safety filters, and the NaCCA/GES
            subject catalogue.
          </p>
        </div>
        <Link to="/?preview=shs">
          <Button type="button" size="sm" variant="secondary">
            <Eye className="h-4 w-4" aria-hidden="true" />
            View as SHS Student (Demo)
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['SHS Students', counts.shsUsers],
          ['University', counts.universityUsers],
          ['Consent Pending', counts.consentPending],
          ['Consent Given', counts.consentGiven],
          ['Withdrawn', counts.consentWithdrawn],
          ['Open SHS Flags', counts.openFlagsCount],
        ].map(([label, val]) => (
          <GlassCard key={String(label)} className="p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold text-fg">{val}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="space-y-4 p-5">
        <h2 className="font-display text-base font-semibold text-fg">
          SHS Feature Controls &amp; Safety Word List
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            size="sm"
            variant={settings.featureShsSignups ? 'primary' : 'secondary'}
            onClick={() => void updateSettings({ featureShsSignups: !settings.featureShsSignups })}
          >
            SHS Sign-ups: {settings.featureShsSignups ? 'Open' : 'Closed'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={settings.featureShsCommunity ? 'primary' : 'secondary'}
            onClick={() =>
              void updateSettings({ featureShsCommunity: !settings.featureShsCommunity })
            }
          >
            SHS Community: {settings.featureShsCommunity ? 'Enabled' : 'Paused'}
          </Button>
        </div>

        <Input
          label="Official Syllabus Source Citation"
          value={syllabusSource}
          onChange={(e) => setSyllabusSource(e.target.value)}
        />
        <Input
          label="SHS Banned Words (comma-separated)"
          placeholder="e.g. spamword, bullyword"
          value={bannedWordsText}
          onChange={(e) => setBannedWordsText(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          onClick={() =>
            void updateSettings({
              shsSyllabusSource: syllabusSource.trim(),
              shsBannedWords: bannedWordsText
                .split(',')
                .map((w) => w.trim())
                .filter(Boolean),
            })
          }
        >
          Save Safety &amp; Syllabus Settings
        </Button>
      </GlassCard>

      <GlassCard className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-fg">
            Priority SHS Moderation Flags ({flags.length})
          </h2>
        </div>
        {flags.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface2/30 px-4 py-6 text-center text-xs text-muted">
            No pending SHS moderation flags. Flagged AI chats or community posts will appear here.
          </p>
        ) : (
          <div className="space-y-2">
            {flags.map((f) => (
              <div
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface2/50 p-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge tone="warning">{f.source}</Badge>
                    <Badge tone="danger">{f.reason}</Badge>
                    <span className="font-medium text-fg">
                      {f.user?.name ?? 'Student'} ({f.user?.schoolYear ?? 'SHS'})
                    </span>
                  </div>
                  <p className="text-muted">{f.excerpt}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await resolveAdminShsFlag(f.id);
                    await refresh();
                    toast.show({ kind: 'success', title: 'Flag marked reviewed' });
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Mark Reviewed
                </Button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary-600" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-fg">
            Subject Catalogue &amp; Syllabus Topics ({subjects.length})
          </h2>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <Input
            label="New subject name"
            value={newSubjName}
            onChange={(e) => setNewSubjName(e.target.value)}
            placeholder="e.g. Ceramics"
          />
          <Input
            label="Code (optional)"
            value={newSubjCode}
            onChange={(e) => setNewSubjCode(e.target.value)}
            placeholder="e.g. CER"
          />
          <label className="flex items-end gap-2 pb-2 text-xs text-fg">
            <input
              type="checkbox"
              checked={newSubjCore}
              onChange={(e) => setNewSubjCore(e.target.checked)}
            />
            Core subject
          </label>
          <div className="flex items-end">
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                if (!newSubjName.trim()) return;
                await createAdminShsSubject({
                  name: newSubjName.trim(),
                  code: newSubjCode.trim() || null,
                  isCore: newSubjCore,
                });
                setNewSubjName('');
                setNewSubjCode('');
                await refresh();
                toast.show({ kind: 'success', title: 'Subject added to catalogue' });
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Subject
            </Button>
          </div>
        </div>

        {subjects.length > 0 ? (
          <div className="grid gap-2 border-t border-line pt-3 sm:grid-cols-3">
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-fg">Add topic to subject</span>
              <select
                value={topicSubjectId}
                onChange={(e) => setTopicSubjectId(e.target.value)}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Topic title"
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              placeholder="e.g. Electrolysis"
            />
            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={async () => {
                  if (!topicSubjectId || !newTopicTitle.trim()) return;
                  await addAdminShsTopic(topicSubjectId, { title: newTopicTitle.trim() });
                  setNewTopicTitle('');
                  await refresh();
                  toast.show({ kind: 'success', title: 'Topic added' });
                }}
              >
                Add Topic
              </Button>
            </div>
          </div>
        ) : null}

        {subjects.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface2/30 px-4 py-6 text-center text-xs text-muted">
            No SHS subjects in the catalogue yet. Add a subject above to get started.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-line bg-surface2/40 px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-medium text-fg">
                    {s.name} {s.code ? `(${s.code})` : ''}
                  </p>
                  <p className="text-muted">
                    {s.isCore ? 'Core' : 'Elective'} · {s.topics?.length ?? 0} topics ·{' '}
                    {s.syllabusVersion}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await toggleAdminShsSubject(s.id, !s.active);
                    await refresh();
                  }}
                >
                  {s.active ? 'Retire' : 'Activate'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-fg">
              Topic Lessons &amp; Review Workflow
            </h2>
            <p className="text-xs text-muted">
              Review, approve, regenerate, or bulk-generate AI-prepared SHS lessons and handle
              reported mistakes.
            </p>
          </div>
          {topicSubjectId ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={bulkBusy}
              onClick={async () => {
                setBulkBusy(true);
                try {
                  const res = await bulkGenerateAdminShsLessons(topicSubjectId);
                  await lessonsQuery.refetch();
                  toast.show({
                    kind: 'success',
                    title: `Generated ${res.generated} lesson(s)`,
                  });
                } catch (err) {
                  toast.show({
                    kind: 'error',
                    title: 'Bulk generation failed',
                    description: err instanceof ApiError ? err.message : 'Try again.',
                  });
                } finally {
                  setBulkBusy(false);
                }
              }}
            >
              Bulk Generate Missing Lessons
            </Button>
          ) : null}
        </div>

        {lessonsQuery.data?.aiStatus || lessonsQuery.data?.counts ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {lessonsQuery.data?.aiStatus ? (
              <Badge tone={lessonsQuery.data.aiStatus.configured ? 'success' : 'danger'}>
                AI:{' '}
                {lessonsQuery.data.aiStatus.configured
                  ? `Ready (${lessonsQuery.data.aiStatus.model})`
                  : 'Not configured'}
              </Badge>
            ) : null}
            {lessonsQuery.data?.counts ? (
              <>
                <Badge tone="neutral">Ready: {lessonsQuery.data.counts.ready}</Badge>
                <Badge tone="neutral">Needs Review: {lessonsQuery.data.counts.needsReview}</Badge>
                <Badge tone="neutral">Generating: {lessonsQuery.data.counts.generating}</Badge>
                <Badge tone={lessonsQuery.data.counts.failed > 0 ? 'danger' : 'neutral'}>
                  Failed: {lessonsQuery.data.counts.failed}
                </Badge>
                <Badge tone="neutral">Missing: {lessonsQuery.data.counts.missing}</Badge>
              </>
            ) : null}
          </div>
        ) : null}

        {(lessonsQuery.data?.recentErrors ?? []).length > 0 ? (
          <div className="space-y-1.5 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs">
            <p className="font-semibold text-danger">
              Recent Lesson Generation Errors ({lessonsQuery.data!.recentErrors!.length})
            </p>
            {lessonsQuery.data!.recentErrors!.map((errItem) => (
              <div
                key={errItem.topicId}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="font-medium text-fg">
                  {errItem.subjectName}: {errItem.topicTitle}
                </span>
                <span className="text-muted">{errItem.reason}</span>
              </div>
            ))}
          </div>
        ) : null}

        {(lessonsQuery.data?.reports ?? []).length > 0 ? (
          <div className="space-y-2 rounded-xl border border-amber-300/60 bg-amber-50/40 p-3 dark:border-amber-500/25 dark:bg-amber-500/10">
            <p className="text-xs font-semibold text-fg">
              Reported Lesson Mistakes ({lessonsQuery.data!.reports.length})
            </p>
            {lessonsQuery.data!.reports.map((rep) => (
              <div
                key={rep.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-medium text-fg">
                    {rep.topic.title} — <span className="text-muted">{rep.user.name}</span>
                  </p>
                  <p className="text-muted">{rep.reason}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await resolveAdminShsLessonReport(rep.id, 'dismissed');
                    await lessonsQuery.refetch();
                    toast.show({ kind: 'success', title: 'Report resolved' });
                  }}
                >
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          {(lessonsQuery.data?.topics ?? []).slice(0, 15).map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface2/40 px-3 py-2.5 text-xs"
            >
              <div>
                <p className="font-medium text-fg">
                  {t.subjectName}: {t.title}
                </p>
                <p className="text-muted">
                  Status:{' '}
                  {t.lesson
                    ? t.lesson.jobStatus && t.lesson.jobStatus !== 'ready'
                      ? t.lesson.jobStatus.toUpperCase()
                      : t.lesson.status.replace('_', ' ').toUpperCase()
                    : 'MISSING'}{' '}
                  · Opens: {t.lesson?.opensCount ?? 0} · Completed: {t.completedCount}
                </p>
                {t.lesson?.jobStatus === 'failed' && t.lesson.generationError ? (
                  <p className="text-danger">{t.lesson.generationError}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {t.lesson && t.lesson.status !== 'approved' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await updateAdminShsLesson(t.id, { status: 'approved' });
                      await lessonsQuery.refetch();
                      toast.show({ kind: 'success', title: 'Lesson approved' });
                    }}
                  >
                    Approve
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await regenerateAdminShsLesson(t.id);
                    await lessonsQuery.refetch();
                    toast.show({ kind: 'success', title: 'Lesson regenerated' });
                  }}
                >
                  {t.lesson ? 'Regenerate' : 'Generate'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
