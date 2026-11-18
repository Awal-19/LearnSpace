import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Flame,
  GraduationCap,
  Layers,
  Sparkles,
  Timer,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../app/AuthContext';
import { useAppPath } from '../../app/basePath';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { generateDeck } from '../study/studyApi';
import {
  generateTopicQuiz,
  getProgressAnalytics,
  type AnalyticsRange,
  type WeakTopicItem,
} from './analyticsApi';

const RANGE_OPTIONS: Array<{ id: AnalyticsRange; label: string }> = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'semester', label: 'Semester' },
];

const SOURCE_LABELS: Record<WeakTopicItem['source'], string> = {
  flashcards: 'Flashcards',
  quiz: 'Quizzes',
  document: 'Document practice',
};

export function ProgressAnalyticsSection() {
  const { user } = useAuth();
  const path = useAppPath();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [range, setRange] = useState<AnalyticsRange>('7d');
  const [taskHourTab, setTaskHourTab] = useState<'tasks' | 'hours'>('tasks');
  const [revisingKey, setRevisingKey] = useState<string | null>(null);

  const analyticsQuery = useQuery({
    queryKey: ['analytics', range],
    queryFn: () => getProgressAnalytics(range),
  });

  const handleReviseTopic = async (item: WeakTopicItem, target: 'flashcards' | 'quiz') => {
    if (!user?.emailVerified) {
      toast.show({
        kind: 'error',
        title: 'Verify your email first',
        description: 'Verify your email before generating AI revision materials.',
      });
      return;
    }
    const key = `${item.topic}:${target}`;
    setRevisingKey(key);
    try {
      if (target === 'flashcards') {
        const deck = await generateDeck({
          topic: item.topic,
          courseId: item.courseId,
          count: 10,
        });
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['decks'] }),
          qc.invalidateQueries({ queryKey: ['decks', 'due-summary'] }),
          qc.invalidateQueries({ queryKey: ['courses'] }),
        ]);
        toast.show({ kind: 'success', title: `Created flashcards for "${item.topic}"` });
        navigate(path(`/study?tab=decks&deckId=${deck.id}`));
      } else {
        await generateTopicQuiz({
          topic: item.topic,
          courseId: item.courseId,
          count: 5,
        });
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['quizzes'] }),
          qc.invalidateQueries({ queryKey: ['courses'] }),
        ]);
        toast.show({ kind: 'success', title: `Created practice quiz for "${item.topic}"` });
        navigate(path('/study?tab=quizzes'));
      }
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not generate revision material',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setRevisingKey(null);
    }
  };

  const chartTooltipStyle = {
    borderRadius: '12px',
    border: '1px solid rgb(var(--color-border))',
    backgroundColor: 'rgb(var(--color-surface))',
    fontSize: '12px',
  };

  if (analyticsQuery.isLoading) {
    return (
      <Card className="p-5 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </Card>
    );
  }

  if (analyticsQuery.isError || !analyticsQuery.data) {
    return (
      <ErrorState
        title="Could not load progress analytics"
        onRetry={() => void analyticsQuery.refetch()}
      />
    );
  }

  const analytics = analyticsQuery.data;
  const hasFlashcardData = analytics.flashcardActivityTrend.some((d) => d.reviews > 0);
  const hasTaskData = analytics.tasksCompletedTrend.some((d) => d.completed > 0);
  const activeHourBuckets = analytics.bestStudyHours.filter((h) => h.minutes > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-fg">Progress analytics</h2>
            <p className="text-xs text-muted">
              Real metrics from your focus timer, quizzes, flashcards, and planner tasks
            </p>
          </div>
        </div>

        <div
          role="group"
          aria-label="Analytics date range"
          className="inline-flex rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
        >
          {RANGE_OPTIONS.map((opt) => {
            const active = range === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => setRange(opt.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                    : 'text-muted hover:text-fg'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Analytics KPI Summary Row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <Clock className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-muted">Study time</p>
            <p className="text-lg font-bold text-fg tabular-nums">
              {analytics.summary.totalStudyHours}h{' '}
              <span className="text-xs font-normal text-muted">
                ({analytics.summary.studySessionCount} sessions)
              </span>
            </p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
            <Flame className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-muted">Study streak</p>
            <p className="text-lg font-bold text-fg tabular-nums">
              {analytics.summary.streakDays}d{' '}
              <span className="text-xs font-normal text-muted">
                (best {analytics.summary.longestStreakDays}d)
              </span>
            </p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
            <Layers className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-muted">Flashcard reviews</p>
            <p className="text-lg font-bold text-fg tabular-nums">
              {analytics.summary.flashcardReviews}{' '}
              <span className="text-xs font-normal text-muted">
                {analytics.summary.flashcardAccuracy !== null
                  ? `· ${analytics.summary.flashcardAccuracy}% acc`
                  : ''}
              </span>
            </p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <Timer className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-muted">Best study hour</p>
            <p className="text-lg font-bold text-fg tabular-nums">
              {analytics.summary.bestStudyHour
                ? `${analytics.summary.bestStudyHour.label} (${analytics.summary.bestStudyHour.minutes}m)`
                : '—'}
            </p>
          </div>
        </Card>
      </div>

      {/* Charts 2x2 Grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold text-fg">Study time per course (minutes)</h3>
          {analytics.studyTimeByCourse.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No focus sessions logged"
              description="Complete Pomodoro sessions in Focus to see study time by course."
            />
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={analytics.studyTimeByCourse}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar dataKey="minutes" name="Minutes studied" radius={[6, 6, 0, 0]}>
                    {analytics.studyTimeByCourse.map((entry, idx) => (
                      <Cell key={`${entry.courseId ?? 'none'}-${idx}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold text-fg">Quiz scores over time (%)</h3>
          {analytics.quizScoreTrend.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="No quizzes taken"
              description="Take a practice quiz in Study to track your score trajectory."
            />
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height={224}>
                <LineChart data={analytics.quizScoreTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="accuracyPct"
                    name="Score %"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold text-fg">Flashcard reviews &amp; accuracy</h3>
          {!hasFlashcardData ? (
            <EmptyState
              icon={Layers}
              title="No flashcard reviews yet"
              description="Review due flashcards to monitor daily recall volume and accuracy."
            />
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height={224}>
                <ComposedChart data={analytics.flashcardActivityTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar
                    yAxisId="left"
                    dataKey="reviews"
                    name="Cards reviewed"
                    fill="#38bdf8"
                    radius={[6, 6, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="accuracyPct"
                    name="Accuracy %"
                    stroke="#2563eb"
                    strokeWidth={2}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg">
              {taskHourTab === 'tasks' ? 'Tasks completed' : 'Best study hours'}
            </h3>
            <div className="inline-flex rounded-lg bg-surface2 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTaskHourTab('tasks')}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  taskHourTab === 'tasks' ? 'bg-surface text-primary-600 shadow-sm' : 'text-muted'
                }`}
              >
                Tasks ({analytics.summary.tasksCompleted})
              </button>
              <button
                type="button"
                onClick={() => setTaskHourTab('hours')}
                className={`rounded-md px-2.5 py-1 font-medium ${
                  taskHourTab === 'hours' ? 'bg-surface text-primary-600 shadow-sm' : 'text-muted'
                }`}
              >
                Best hours
              </button>
            </div>
          </div>

          {taskHourTab === 'tasks' ? (
            !hasTaskData ? (
              <EmptyState
                icon={CheckCircle2}
                title="No completed tasks in range"
                description="Mark study tasks complete in Planner to track consistency."
              />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height={224}>
                  <BarChart data={analytics.tasksCompletedTrend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar
                      dataKey="completed"
                      name="Tasks completed"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          ) : activeHourBuckets.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No hourly focus data yet"
              description="Log focus sessions to discover your most productive hours."
            />
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height={224}>
                <BarChart data={activeHourBuckets}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar
                    dataKey="minutes"
                    name="Minutes studied"
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Weak Topics Card */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-fg">Weak topics to revise</h3>
              <p className="text-xs text-muted">
                Topics with accuracy under 75% across quizzes, flashcards, or document practice
              </p>
            </div>
          </div>
        </div>

        {analytics.weakTopics.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface2/30 p-4 text-center text-xs text-muted">
            No weak topics detected in this window. As you review flashcards and take quizzes,
            tricky topics will surface here with one-click revision sets.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {analytics.weakTopics.map((item) => (
              <div
                key={`${item.source}-${item.topic}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-fg">{item.topic}</span>
                    <Badge tone="neutral">{SOURCE_LABELS[item.source]}</Badge>
                    <Badge tone={item.accuracyPct < 50 ? 'danger' : 'warning'}>
                      {item.accuracyPct}% accuracy
                    </Badge>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    loading={revisingKey === `${item.topic}:flashcards`}
                    onClick={() => void handleReviseTopic(item, 'flashcards')}
                  >
                    Revise this · Flashcards
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    loading={revisingKey === `${item.topic}:quiz`}
                    onClick={() => void handleReviseTopic(item, 'quiz')}
                  >
                    Revise this · Quiz
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
