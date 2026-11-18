import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  CheckCircle2,
  Circle,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useAppPath } from '../../app/basePath';
import { Badge, Button, Card, EmptyState, Input, Modal, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { CourseBadge } from '../courses/CourseBadge';
import type { CourseSummary } from '../courses/coursesApi';
import {
  deleteRevisionPlan,
  generateRevisionPlan,
  listRevisionPlans,
  rescheduleMissedSessions,
  saveRevisionPlan,
  updateRevisionSession,
  type ExamItem,
  type PreferredTimeWindow,
  type RevisionPlanDraftResponse,
  type RevisionPlanItem,
  type RevisionSessionDraft,
  type RevisionSessionItem,
} from './examsApi';

const DAY_PILLS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
] as const;

const TIME_WINDOWS: Array<{ value: PreferredTimeWindow; label: string }> = [
  { value: 'morning', label: 'Morning (09:00)' },
  { value: 'afternoon', label: 'Afternoon (14:00)' },
  { value: 'evening', label: 'Evening (18:30)' },
  { value: 'night', label: 'Night (21:00)' },
];

export interface RevisionPlannerPanelProps {
  exams: ExamItem[];
  courses: CourseSummary[];
}

export function RevisionPlannerPanel({ exams, courses }: RevisionPlannerPanelProps) {
  const { user } = useAuth();
  const path = useAppPath();
  const toast = useToast();
  const qc = useQueryClient();

  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [hoursPerDay, setHoursPerDay] = useState('2');
  const [daysOff, setDaysOff] = useState<number[]>([0]); // Default Sunday off
  const [preferredTimes, setPreferredTimes] = useState<PreferredTimeWindow[]>(['evening']);
  const [instructions, setInstructions] = useState('');
  const [generating, setGenerating] = useState(false);

  // Unsaved draft review & editing state
  const [draftState, setDraftState] = useState<RevisionPlanDraftResponse | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSessions, setDraftSessions] = useState<RevisionSessionDraft[]>([]);
  const [savingPlan, setSavingPlan] = useState(false);

  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<RevisionPlanItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const plansQuery = useQuery({
    queryKey: ['revision-plans'],
    queryFn: listRevisionPlans,
  });

  const upcomingExams = useMemo(() => {
    const now = Date.now();
    return exams.filter((e) => new Date(e.startsAt).getTime() >= now);
  }, [exams]);

  useEffect(() => {
    if (selectedExamIds.length === 0 && upcomingExams.length > 0) {
      setSelectedExamIds(upcomingExams.map((e) => e.id));
    }
  }, [upcomingExams, selectedExamIds.length]);

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const toggleExam = (id: string) => {
    setSelectedExamIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleDayOff = (day: number) => {
    setDaysOff((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const togglePreferredTime = (win: PreferredTimeWindow) => {
    setPreferredTimes((prev) => {
      if (prev.includes(win)) {
        return prev.length > 1 ? prev.filter((w) => w !== win) : prev;
      }
      return [...prev, win];
    });
  };

  const handleGenerate = async (customInstructions?: string) => {
    if (!user?.emailVerified) {
      toast.show({
        kind: 'error',
        title: 'Verify your email first',
        description: 'Verify your email address before generating an AI revision plan.',
      });
      return;
    }
    const hrs = Number(hoursPerDay);
    if (Number.isNaN(hrs) || hrs < 0.5 || hrs > 12) {
      toast.show({ kind: 'error', title: 'Available hours per day must be between 0.5 and 12.' });
      return;
    }

    setGenerating(true);
    try {
      const res = await generateRevisionPlan({
        examIds: selectedExamIds.length > 0 ? selectedExamIds : undefined,
        hoursPerDay: hrs,
        daysOff,
        preferredTimes,
        ...(customInstructions?.trim() ? { instructions: customInstructions.trim() } : {}),
      });
      setDraftState(res);
      setDraftTitle(res.draft.title);
      setDraftSessions(res.draft.sessions);
      toast.show({
        kind: 'success',
        title: 'Draft revision plan ready',
        description: 'Review or edit sessions below before saving to your Planner.',
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not generate revision plan',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const updateDraftRow = (idx: number, patch: Partial<RevisionSessionDraft>) => {
    setDraftSessions((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const addDraftRow = () => {
    const fallbackDate =
      draftSessions[draftSessions.length - 1]?.scheduledDate ??
      draftState?.draft.startDate ??
      new Date().toISOString().slice(0, 10);
    const fallbackCourseId = draftSessions[0]?.courseId ?? courses[0]?.id ?? null;
    const fallbackExamId = draftSessions[0]?.examId ?? upcomingExams[0]?.id ?? null;

    setDraftSessions((prev) => [
      ...prev,
      {
        scheduledDate: fallbackDate,
        startTime: '18:30',
        durationMinutes: 60,
        courseId: fallbackCourseId,
        examId: fallbackExamId,
        topic: 'Targeted revision & practice questions',
        notes: null,
      },
    ]);
  };

  const removeDraftRow = (idx: number) => {
    setDraftSessions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSavePlan = async () => {
    if (!draftState) return;
    if (!draftTitle.trim()) {
      toast.show({ kind: 'error', title: 'Give your revision plan a title.' });
      return;
    }
    if (draftSessions.length === 0) {
      toast.show({ kind: 'error', title: 'Keep at least one session before saving.' });
      return;
    }

    setSavingPlan(true);
    try {
      await saveRevisionPlan({
        title: draftTitle.trim(),
        startDate: draftState.draft.startDate,
        endDate: draftState.draft.endDate,
        hoursPerDay: draftState.draft.hoursPerDay,
        daysOff: draftState.draft.daysOff,
        preferredTimes: draftState.draft.preferredTimes,
        sessions: draftSessions,
      });
      setDraftState(null);
      setDraftSessions([]);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['revision-plans'] }),
        qc.invalidateQueries({ queryKey: ['tasks'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      toast.show({
        kind: 'success',
        title: 'Revision plan saved',
        description: 'All study sessions were added to your Study Planner.',
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not save plan',
        description: err instanceof ApiError ? err.message : 'Please check your session inputs.',
      });
    } finally {
      setSavingPlan(false);
    }
  };

  const handleSessionStatus = async (
    planId: string,
    session: RevisionSessionItem,
    nextStatus: 'completed' | 'missed' | 'planned',
  ) => {
    try {
      await updateRevisionSession(planId, session.id, { status: nextStatus });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['revision-plans'] }),
        qc.invalidateQueries({ queryKey: ['tasks'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Update failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleRescheduleMissed = async (planId: string) => {
    setReschedulingId(planId);
    try {
      const res = await rescheduleMissedSessions(planId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['revision-plans'] }),
        qc.invalidateQueries({ queryKey: ['tasks'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      toast.show({
        kind: 'success',
        title:
          res.rescheduledCount > 0
            ? `Rescheduled ${res.rescheduledCount} missed ${res.rescheduledCount === 1 ? 'session' : 'sessions'}`
            : 'No missed sessions to reschedule',
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Reschedule failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setReschedulingId(null);
    }
  };

  const handleConfirmDeletePlan = async () => {
    if (!deletingPlan) return;
    setDeleting(true);
    try {
      await deleteRevisionPlan(deletingPlan.id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['revision-plans'] }),
        qc.invalidateQueries({ queryKey: ['tasks'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      toast.show({ kind: 'success', title: 'Revision plan removed' });
      setDeletingPlan(null);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not delete plan',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Generator Settings Card */}
      <Card className="p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-fg">
                Generate AI revision plan
              </h2>
              <p className="text-xs text-muted">
                Builds a personalized day-by-day schedule from your exam dates, course notes,
                documents, and weak quiz topics.
              </p>
            </div>
          </div>
          {!user?.emailVerified ? <Badge tone="warning">Verify email to generate</Badge> : null}
        </div>

        {upcomingExams.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface2/40 p-4 text-xs text-muted">
            Add at least one upcoming exam first to build an AI revision schedule tailored to your
            exam dates and weak topics.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Exams to include
              </p>
              <div className="flex flex-wrap gap-2">
                {upcomingExams.map((ex) => {
                  const checked = selectedExamIds.includes(ex.id);
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleExam(ex.id)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                        checked
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
                          : 'border-line bg-surface text-muted hover:border-primary-300 hover:text-fg'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: ex.course.color ?? '#2563EB' }}
                      />
                      <span>
                        {ex.course.code ? `${ex.course.code}: ` : ''}
                        {ex.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Input
                label="Available study hours / day"
                type="number"
                min={0.5}
                max={12}
                step={0.5}
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(e.target.value)}
              />

              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-fg">Days off</p>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_PILLS.map((d) => {
                    const active = daysOff.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleDayOff(d.value)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? 'border-primary-500 bg-primary-600 text-white'
                            : 'border-line bg-surface2/50 text-fg hover:border-primary-300'
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-fg">Preferred study times</p>
                <div className="flex flex-wrap gap-1.5">
                  {TIME_WINDOWS.map((w) => {
                    const active = preferredTimes.includes(w.value);
                    return (
                      <button
                        key={w.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => togglePreferredTime(w.value)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
                            : 'border-line bg-surface2/50 text-muted hover:text-fg'
                        }`}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input
                  label="Focus instruction (optional)"
                  placeholder="e.g. Spend extra sessions on weak quiz topics, 45m blocks..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>
              <Button
                type="button"
                loading={generating}
                disabled={selectedExamIds.length === 0}
                onClick={() => void handleGenerate(instructions)}
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Generate revision plan
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Draft Review & Edit Section */}
      {draftState ? (
        <Card className="border-primary-300 bg-primary-50/25 p-5 sm:p-6 space-y-4 dark:bg-surface">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">Draft preview — review &amp; edit before saving</Badge>
                <span className="text-xs text-muted">
                  Based on {draftState.contextSummary.examCount} exam(s),{' '}
                  {draftState.contextSummary.noteCount} note(s),{' '}
                  {draftState.contextSummary.documentCount} document(s)
                </span>
              </div>
              {draftState.contextSummary.weakTopics.length > 0 ? (
                <p className="mt-1.5 text-xs text-muted">
                  Prioritized weak topics:{' '}
                  <strong className="text-fg">
                    {draftState.contextSummary.weakTopics.join(', ')}
                  </strong>
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={generating}
                onClick={() => void handleGenerate(instructions)}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Regenerate
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraftState(null);
                  setDraftSessions([]);
                }}
              >
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                loading={savingPlan}
                onClick={() => void handleSavePlan()}
              >
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                Save plan &amp; add to Planner
              </Button>
            </div>
          </div>

          <Input
            label="Plan title"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
          />

          <div className="space-y-2.5">
            {draftSessions.map((session, idx) => (
              <div
                key={idx}
                className="grid gap-2.5 rounded-xl border border-line bg-surface p-3 sm:grid-cols-[140px_105px_85px_1fr_auto] sm:items-end"
              >
                <div>
                  <label
                    htmlFor={`draft-date-${idx}`}
                    className="mb-1 block text-[11px] font-medium text-muted"
                  >
                    Date
                  </label>
                  <input
                    id={`draft-date-${idx}`}
                    type="date"
                    value={session.scheduledDate}
                    onChange={(e) => updateDraftRow(idx, { scheduledDate: e.target.value })}
                    className="h-9 w-full rounded-lg border border-line bg-surface2/50 px-2 text-xs text-fg"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`draft-time-${idx}`}
                    className="mb-1 block text-[11px] font-medium text-muted"
                  >
                    Start
                  </label>
                  <input
                    id={`draft-time-${idx}`}
                    type="time"
                    value={session.startTime}
                    onChange={(e) => updateDraftRow(idx, { startTime: e.target.value })}
                    className="h-9 w-full rounded-lg border border-line bg-surface2/50 px-2 text-xs text-fg"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`draft-dur-${idx}`}
                    className="mb-1 block text-[11px] font-medium text-muted"
                  >
                    Minutes
                  </label>
                  <input
                    id={`draft-dur-${idx}`}
                    type="number"
                    min={15}
                    max={360}
                    value={session.durationMinutes}
                    onChange={(e) =>
                      updateDraftRow(idx, { durationMinutes: Number(e.target.value) || 60 })
                    }
                    className="h-9 w-full rounded-lg border border-line bg-surface2/50 px-2 text-xs text-fg"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`draft-course-${idx}`}
                      className="mb-1 block text-[11px] font-medium text-muted"
                    >
                      Course
                    </label>
                    <select
                      id={`draft-course-${idx}`}
                      value={session.courseId ?? ''}
                      onChange={(e) => updateDraftRow(idx, { courseId: e.target.value || null })}
                      className="h-9 w-full rounded-lg border border-line bg-surface2/50 px-2 text-xs text-fg"
                    >
                      <option value="">General</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code ? `${c.code} — ${c.name}` : c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={`draft-topic-${idx}`}
                      className="mb-1 block text-[11px] font-medium text-muted"
                    >
                      Topic
                    </label>
                    <input
                      id={`draft-topic-${idx}`}
                      type="text"
                      value={session.topic}
                      onChange={(e) => updateDraftRow(idx, { topic: e.target.value })}
                      className="h-9 w-full rounded-lg border border-line bg-surface2/50 px-2.5 text-xs text-fg"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove session ${idx + 1}`}
                  onClick={() => removeDraftRow(idx)}
                  className="mb-1 rounded-lg p-2 text-muted hover:bg-surface2 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}

            <Button type="button" size="sm" variant="secondary" onClick={addDraftRow}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add study session
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Saved Revision Plans */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Saved revision plans
        </h3>
        {plansQuery.isLoading ? (
          <Skeleton className="h-44 w-full rounded-2xl" />
        ) : (plansQuery.data?.length ?? 0) === 0 ? (
          <Card className="p-6">
            <EmptyState
              icon={CalendarCheck}
              title="No saved revision plans yet"
              description="Generate a personalized schedule above, review the sessions, and save them into your Planner."
            />
          </Card>
        ) : (
          plansQuery.data!.map((plan) => {
            const total = plan.sessions.length;
            const completed = plan.sessions.filter((s) => s.status === 'completed').length;
            const missedCount = plan.sessions.filter((s) => s.status === 'missed').length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <Card key={plan.id} className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-display text-lg font-semibold text-fg">{plan.title}</h4>
                      <Badge tone={pct === 100 ? 'success' : 'primary'}>
                        {completed}/{total} completed ({pct}%)
                      </Badge>
                      {missedCount > 0 ? <Badge tone="warning">{missedCount} missed</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {plan.startDate} to {plan.endDate} · {plan.hoursPerDay}h/day target ·{' '}
                      <Link
                        to={path('/planner')}
                        className="font-semibold text-primary-600 hover:underline dark:text-primary-400"
                      >
                        Synced in Planner
                      </Link>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={reschedulingId === plan.id}
                      onClick={() => void handleRescheduleMissed(plan.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Reschedule missed
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete plan ${plan.title}`}
                      onClick={() => setDeletingPlan(plan)}
                      className="text-muted hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                  <div
                    className="h-full rounded-full bg-primary-600 transition-all duration-slow"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="divide-y divide-line/80 rounded-xl border border-line/80 bg-surface2/25">
                  {plan.sessions.map((s) => {
                    const c =
                      s.course ?? (s.courseId ? (courseById.get(s.courseId) ?? null) : null);
                    return (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <button
                            type="button"
                            aria-label={
                              s.status === 'completed'
                                ? `Mark ${s.topic} as planned`
                                : `Mark ${s.topic} completed`
                            }
                            onClick={() =>
                              void handleSessionStatus(
                                plan.id,
                                s,
                                s.status === 'completed' ? 'planned' : 'completed',
                              )
                            }
                            className="shrink-0 text-primary-600 hover:text-primary-700"
                          >
                            {s.status === 'completed' ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : s.status === 'missed' ? (
                              <XCircle className="h-4 w-4 text-warning" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <p
                              className={`truncate text-sm font-medium ${
                                s.status === 'completed' ? 'line-through text-muted' : 'text-fg'
                              }`}
                            >
                              {s.topic}
                            </p>
                            <p className="text-xs text-muted tabular-nums">
                              {s.scheduledDate} · {s.startTime} ({s.durationMinutes}m)
                              {s.notes ? ` · ${s.notes}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {c ? <CourseBadge course={c} link /> : null}
                          {s.status !== 'completed' && s.status !== 'missed' ? (
                            <button
                              type="button"
                              onClick={() => void handleSessionStatus(plan.id, s, 'missed')}
                              className="rounded-lg border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:border-warning hover:text-warning"
                            >
                              Mark missed
                            </button>
                          ) : (
                            <Badge
                              tone={
                                s.status === 'completed'
                                  ? 'success'
                                  : s.status === 'missed'
                                    ? 'warning'
                                    : 'neutral'
                              }
                            >
                              {s.status}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })
        )}
      </div>

      <Modal
        open={Boolean(deletingPlan)}
        onClose={() => setDeletingPlan(null)}
        title="Delete revision plan"
        className="max-w-md"
      >
        {deletingPlan ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Delete <strong className="text-fg">{deletingPlan.title}</strong> and its generated
              Planner tasks?
            </p>
            <div className="flex justify-end gap-2.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeletingPlan(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={deleting}
                onClick={() => void handleConfirmDeletePlan()}
              >
                Delete plan
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
