import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  EyeOff,
  FileQuestion,
  Flag,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  getCourseRecommendations,
  hideCourseRecommendation,
  refreshCourseRecommendations,
  removeCourseResource,
  reportCourseRecommendation,
  saveCourseRecommendation,
  toggleCourseResourcesInAssistant,
  type CourseRecommendationItem,
  type RecommendationAccessType,
} from './coursesApi';

type SubTab = 'books' | 'past_questions' | 'extras' | 'saved';

const ACCESS_LABELS: Record<
  RecommendationAccessType,
  { label: string; tone: 'success' | 'primary' | 'warning' | 'neutral' }
> = {
  free: { label: 'Free', tone: 'success' },
  preview: { label: 'Preview', tone: 'primary' },
  borrow: { label: 'Borrow', tone: 'warning' },
  paid: { label: 'Paid', tone: 'neutral' },
};

export function CourseRecommendedPanel({ courseId }: { courseId: string }) {
  const path = useAppPath();
  const toast = useToast();
  const qc = useQueryClient();

  const [subTab, setSubTab] = useState<SubTab>('books');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');

  const query = useQuery({
    queryKey: ['course-recommendations', courseId],
    queryFn: () => getCourseRecommendations(courseId),
    staleTime: 15_000,
    refetchInterval: (q) => {
      const status = q.state.data?.latestJob?.status;
      return status === 'queued' || status === 'running' ? 3_000 : false;
    },
  });

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['course-recommendations', courseId] }),
      qc.invalidateQueries({ queryKey: ['courses'] }),
    ]);

  const handleTrigger = async (mode: 'refresh' | 'find_more') => {
    setRefreshing(true);
    try {
      await refreshCourseRecommendations(courseId, mode);
      await invalidate();
      toast.show({
        kind: 'success',
        title: mode === 'find_more' ? 'Searching for more resources...' : 'Refreshing resources...',
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not start search',
        description: err instanceof ApiError ? err.message : 'Please try again later.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async (item: CourseRecommendationItem) => {
    setBusyId(item.id);
    try {
      await saveCourseRecommendation(courseId, item.id);
      await invalidate();
      toast.show({ kind: 'success', title: 'Saved to course resources' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Save failed',
        description: err instanceof ApiError ? err.message : 'Could not save resource.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleHide = async (item: CourseRecommendationItem) => {
    setBusyId(item.id);
    try {
      await hideCourseRecommendation(courseId, item.id);
      await invalidate();
      toast.show({ kind: 'success', title: 'Hidden from recommendations' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not hide item',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleReportSubmit = async (recId: string) => {
    if (reportReason.trim().length < 3) {
      toast.show({ kind: 'error', title: 'Please enter a short reason' });
      return;
    }
    setBusyId(recId);
    try {
      await reportCourseRecommendation(courseId, recId, reportReason.trim());
      setReportingId(null);
      setReportReason('');
      toast.show({ kind: 'success', title: 'Link reported. Thank you!' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Report failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveResource = async (resourceId: string) => {
    setBusyId(resourceId);
    try {
      await removeCourseResource(courseId, resourceId);
      await invalidate();
      toast.show({ kind: 'success', title: 'Removed from saved resources' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Remove failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleAssistant = async (next: boolean) => {
    try {
      await toggleCourseResourcesInAssistant(courseId, next);
      await invalidate();
      toast.show({
        kind: 'success',
        title: next
          ? 'Saved resources enabled for AI Assistant'
          : 'Saved resources disabled for AI Assistant',
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Update failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ErrorState
        title="Could not load recommended resources"
        message={
          query.error instanceof ApiError
            ? query.error.message
            : 'Please check your connection and try again.'
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  const {
    recommendations,
    resources,
    useResourcesInAssistant,
    latestJob,
    dailySearchesUsed,
    dailySearchLimit,
    featureEnabled,
    pastQuestionsGuidance,
  } = query.data;

  const isRunning = latestJob?.status === 'queued' || latestJob?.status === 'running';
  const books = recommendations.filter((r) => r.category === 'book');
  const pastQuestions = recommendations.filter((r) => r.category === 'past_question');
  const extras = recommendations.filter((r) => r.category === 'video' || r.category === 'notes');
  const savedUrls = new Set(resources.map((r) => r.url));

  const subTabs: Array<{ id: SubTab; label: string; count: number }> = [
    { id: 'books', label: 'Books', count: books.length },
    { id: 'past_questions', label: 'Past Questions', count: pastQuestions.length },
    { id: 'extras', label: 'Videos & Notes', count: extras.length },
    { id: 'saved', label: 'Saved to Course', count: resources.length },
  ];

  const activeItems =
    subTab === 'books' ? books : subTab === 'past_questions' ? pastQuestions : extras;

  return (
    <div className="space-y-5">
      {/* Header Controls & Disclaimer */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line/80 bg-surface2/40 p-4 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Sparkles className="h-4 w-4 text-primary-500" aria-hidden="true" />
              Recommended Web Resources
            </span>
            {isRunning ? (
              <Badge tone="primary" className="animate-pulse">
                Finding resources...
              </Badge>
            ) : null}
            <Badge tone="neutral">
              {Math.max(0, dailySearchLimit - dailySearchesUsed)}/{dailySearchLimit} searches left
              today
            </Badge>
          </div>
          <p className="text-xs text-muted">
            Suggestions come from public web sources. Check the access terms of each source.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={
              !featureEnabled || isRunning || refreshing || dailySearchesUsed >= dailySearchLimit
            }
            onClick={() => void handleTrigger('find_more')}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Find more
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={
              !featureEnabled || isRunning || refreshing || dailySearchesUsed >= dailySearchLimit
            }
            onClick={() => void handleTrigger('refresh')}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRunning || refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Friendly error / disabled banner */}
      {!featureEnabled ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Course web resource search is currently paused by an administrator.</span>
        </div>
      ) : latestJob?.status === 'failed' ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/40 bg-danger/10 p-3.5 text-xs text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {latestJob.errorMessage ||
              'The search service is temporarily unavailable. Please try refreshing in a moment.'}
          </span>
        </div>
      ) : null}

      {/* Category Sub-tabs */}
      <div
        role="tablist"
        aria-label="Recommended resource categories"
        className="inline-flex flex-wrap gap-1 rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
      >
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={subTab === t.id}
            onClick={() => setSubTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all sm:text-sm ${
              subTab === t.id
                ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                : 'text-muted hover:text-fg'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Tab Body */}
      {subTab === 'saved' ? (
        <div className="space-y-4">
          <Card className="flex flex-col gap-3 border-line/80 bg-surface2/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-fg">Use these resources in the Assistant</p>
              <p className="text-xs text-muted">
                When enabled, the AI Assistant can reference your saved books and links during chats
                for this course.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-fg">
              <input
                type="checkbox"
                checked={useResourcesInAssistant}
                onChange={(e) => void handleToggleAssistant(e.target.checked)}
                className="h-4 w-4 rounded border-line text-primary-600 focus:ring-primary-500"
              />
              <span>{useResourcesInAssistant ? 'Enabled' : 'Off'}</span>
            </label>
          </Card>

          {resources.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No saved course resources yet"
              description="Save recommended books, past questions, or lecture notes from the other tabs to build your personal course list."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {resources.map((res) => {
                const access = ACCESS_LABELS[res.accessType] ?? ACCESS_LABELS.free;
                return (
                  <Card key={res.id} className="flex flex-col justify-between gap-3 p-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(res.sourceDomain)}&sz=32`}
                            alt=""
                            className="h-4 w-4 rounded-sm"
                            loading="lazy"
                          />
                          {res.sourceDomain}
                        </span>
                        <Badge tone={access.tone}>{access.label}</Badge>
                      </div>
                      <h4 className="font-display text-sm font-semibold text-fg">{res.title}</h4>
                      {res.authors || res.year ? (
                        <p className="text-xs text-muted">
                          {[res.authors, res.year].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                      {res.reason ? <p className="text-xs text-fg/80">{res.reason}</p> : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-2.5">
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700"
                      >
                        Open
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busyId === res.id}
                        onClick={() => void handleRemoveResource(res.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                        Remove
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : isRunning && activeItems.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      ) : activeItems.length === 0 ? (
        subTab === 'past_questions' ? (
          <Card className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <FileQuestion className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <h4 className="font-display text-sm font-semibold text-fg">
                  No public past questions found for this course yet
                </h4>
                <p className="text-xs text-muted">{pastQuestionsGuidance.message}</p>
              </div>
            </div>
            <ul className="space-y-2 text-xs text-fg/90">
              {pastQuestionsGuidance.suggestions.map((s) => (
                <li key={s} className="flex items-start gap-2 rounded-lg bg-surface2/60 px-3 py-2">
                  <span className="mt-0.5 text-primary-500">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Link to={path('/documents')}>
                <Button size="sm">
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Upload your own past questions
                </Button>
              </Link>
              <Link to={path('/documents')}>
                <Button size="sm" variant="secondary">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Generate practice questions from slides
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <EmptyState
            icon={subTab === 'extras' ? Video : BookOpen}
            title={
              subTab === 'extras'
                ? 'No open lecture videos or notes found yet'
                : 'No book recommendations found yet'
            }
            description="Try clicking Refresh or Find more, or add a course code and level to narrow the search."
            action={
              <Button
                type="button"
                size="sm"
                disabled={!featureEnabled || isRunning || refreshing}
                onClick={() => void handleTrigger('refresh')}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Search now
              </Button>
            }
          />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {activeItems.map((item) => {
            const access = ACCESS_LABELS[item.accessType] ?? ACCESS_LABELS.free;
            const isSaved = item.status === 'saved' || savedUrls.has(item.url);

            return (
              <Card
                key={item.id}
                className="flex flex-col justify-between gap-3 border-line/85 p-4 transition-all hover:border-primary-300/80"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.sourceDomain)}&sz=32`}
                        alt=""
                        className="h-4 w-4 shrink-0 rounded-sm"
                        loading="lazy"
                      />
                      <span className="truncate">{item.sourceDomain}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {item.paperType ? (
                        <Badge tone="neutral">{item.paperType.replace('_', ' ')}</Badge>
                      ) : null}
                      <Badge tone={access.tone}>{access.label}</Badge>
                    </div>
                  </div>

                  <h4 className="font-display text-sm font-semibold leading-snug text-fg">
                    {item.title}
                  </h4>

                  {item.authors || item.edition || item.year || item.institutionOrBody ? (
                    <p className="text-xs text-muted">
                      {[item.authors, item.institutionOrBody, item.edition, item.year]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}

                  <p className="text-xs leading-relaxed text-fg/85">{item.reason}</p>

                  {item.topics.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {item.topics.slice(0, 4).map((topic) => (
                        <span
                          key={topic}
                          className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] text-muted"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2 border-t border-line/60 pt-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700"
                    >
                      Open
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>

                    {isSaved ? (
                      <Badge tone="success" className="inline-flex items-center gap-1 px-2.5 py-1">
                        <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Saved
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busyId === item.id}
                        onClick={() => void handleSave(item)}
                      >
                        <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                        Save to course
                      </Button>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === item.id}
                      onClick={() => void handleHide(item)}
                      title="Hide this recommendation"
                    >
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      Not relevant
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === item.id}
                      onClick={() => setReportingId(reportingId === item.id ? null : item.id)}
                      title="Report broken or bad link"
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      Report bad link
                    </Button>
                  </div>

                  {reportingId === item.id ? (
                    <div className="flex flex-col gap-2 rounded-xl bg-surface2/70 p-2.5 sm:flex-row">
                      <input
                        type="text"
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        placeholder="e.g. Dead link, wrong course, paywall..."
                        className="h-8 flex-1 rounded-lg border border-line bg-surface px-2.5 text-xs text-fg focus:border-primary-500 focus:outline-none"
                      />
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyId === item.id}
                          onClick={() => void handleReportSubmit(item.id)}
                        >
                          Submit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setReportingId(null);
                            setReportReason('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
