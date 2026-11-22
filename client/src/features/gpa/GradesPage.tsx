import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  BookOpen,
  Edit3,
  GraduationCap,
  Plus,
  RotateCcw,
  Settings2,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useExperience } from '../../app/experience';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { listCourses, type CourseSummary } from '../courses/coursesApi';
import { GradeRecordFormModal } from './GradeRecordFormModal';
import { ScaleSettingsModal } from './ScaleSettingsModal';
import { WhatIfPlannerPanel } from './WhatIfPlannerPanel';
import { deleteGradeRecord, getGpaOverview, type AnnotatedGradeRecord } from './gpaApi';

export function GradesPage() {
  const exp = useExperience();
  const toast = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<'transcript' | 'whatif'>('transcript');
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AnnotatedGradeRecord | null>(null);
  const [retakeSource, setRetakeSource] = useState<AnnotatedGradeRecord | null>(null);

  const gpaQuery = useQuery({
    queryKey: ['gpa', 'overview'],
    queryFn: getGpaOverview,
    enabled: exp.features.showGpa,
  });

  const coursesQuery = useQuery({
    queryKey: ['courses'],
    queryFn: () => listCourses().catch(() => [] as CourseSummary[]),
    staleTime: 60_000,
    enabled: exp.features.showGpa,
  });
  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);

  if (!exp.features.showGpa) {
    return <Navigate to="/" replace />;
  }

  const refreshGpa = async () => {
    await qc.invalidateQueries({ queryKey: ['gpa', 'overview'] });
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      await deleteGradeRecord(id);
      await refreshGpa();
      toast.show({ kind: 'info', title: 'Grade record removed' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not delete record',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  if (gpaQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (gpaQuery.isError || !gpaQuery.data) {
    return (
      <ErrorState
        title="Could not load grades"
        message="Check your connection and try again."
        onRetry={() => void gpaQuery.refetch()}
      />
    );
  }

  const { activeScale, scales, presets, overview } = gpaQuery.data;
  const lastSemester = overview.semesters[overview.semesters.length - 1];
  const nextSemesterOrder = lastSemester ? lastSemester.semesterOrder + 1 : 1;
  const nextSemesterLabel = lastSemester ? lastSemester.semester : 'Year 1 Semester 1';

  const chartTooltipStyle = {
    borderRadius: '12px',
    border: '1px solid rgb(var(--color-border))',
    backgroundColor: 'rgb(var(--color-surface))',
    fontSize: '12px',
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <Award className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
              GPA &amp; Grades
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Active scale: <strong className="text-fg">{activeScale.name}</strong> (
              {activeScale.maxGpa.toFixed(1)} max · Retakes:{' '}
              {activeScale.retakePolicy.replace('_', ' ')})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setScaleModalOpen(true)}
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Configure scale
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditingRecord(null);
              setRetakeSource(null);
              setGradeModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add grade
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Cumulative GPA (CGPA)</span>
            {overview.currentClassLabel ? (
              <Badge tone="primary">{overview.currentClassLabel}</Badge>
            ) : null}
          </div>
          <p className="font-display text-2xl font-bold text-fg tabular-nums">
            {overview.cgpa !== null ? overview.cgpa.toFixed(2) : '—'}{' '}
            <span className="text-sm font-normal text-muted">
              / {activeScale.maxGpa.toFixed(1)}
            </span>
          </p>
        </Card>

        <Card className="p-4 space-y-1.5">
          <span className="text-xs font-medium text-muted">GPA Credits Completed</span>
          <p className="font-display text-2xl font-bold text-fg tabular-nums">
            {overview.completedGpaCredits}
            {overview.totalAttemptedCredits !== overview.completedGpaCredits ? (
              <span className="ml-1.5 text-xs font-normal text-muted">
                ({overview.totalAttemptedCredits} attempted)
              </span>
            ) : null}
          </p>
        </Card>

        <Card className="p-4 space-y-1.5">
          <span className="text-xs font-medium text-muted">Latest Semester GPA</span>
          <p className="font-display text-2xl font-bold text-fg tabular-nums">
            {lastSemester
              ? lastSemester.semesterGpa !== null
                ? lastSemester.semesterGpa.toFixed(2)
                : 'N/A (0 cr)'
              : '—'}
          </p>
        </Card>

        <Card className="p-4 space-y-1.5">
          <span className="text-xs font-medium text-muted">Courses Recorded</span>
          <p className="font-display text-2xl font-bold text-fg tabular-nums">
            {overview.totalCourses}{' '}
            <span className="text-xs font-normal text-muted">
              across {overview.semesters.length} term{overview.semesters.length === 1 ? '' : 's'}
            </span>
          </p>
        </Card>
      </div>

      {/* GPA Trend Chart */}
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/10 text-primary-600 dark:text-primary-400">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-fg">GPA &amp; CGPA Trend</h2>
              <p className="text-xs text-muted">Semester performance and cumulative trajectory</p>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Grades workspace views"
            className="inline-flex rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'transcript'}
              onClick={() => setTab('transcript')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                tab === 'transcript'
                  ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                  : 'text-muted hover:text-fg'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Semesters &amp; Transcript
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'whatif'}
              onClick={() => setTab('whatif')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                tab === 'whatif'
                  ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                  : 'text-muted hover:text-fg'
              }`}
            >
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              What do I need?
            </button>
          </div>
        </div>

        {overview.trend.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No grades recorded yet"
            description="Add your course grades per semester to calculate exact GPA/CGPA and visualize your trend."
            action={
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEditingRecord(null);
                  setRetakeSource(null);
                  setGradeModalOpen(true);
                }}
              >
                Add first course grade
              </Button>
            }
          />
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={overview.trend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="semester" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, activeScale.maxGpa]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="semesterGpa"
                  name="Semester GPA"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="cumulativeGpa"
                  name="Cumulative CGPA"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {tab === 'whatif' ? (
        <WhatIfPlannerPanel scale={activeScale} />
      ) : overview.semesters.length === 0 ? null : (
        <div className="space-y-4">
          {overview.semesters.map((sem) => (
            <Card key={`${sem.semesterOrder}-${sem.semester}`} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface2/45 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-fg">{sem.semester}</h3>
                  <Badge tone="neutral">{sem.totalCredits} cr</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-muted">
                    Semester GPA:{' '}
                    <strong className="text-fg tabular-nums">
                      {sem.semesterGpa !== null ? sem.semesterGpa.toFixed(2) : 'N/A (0 cr)'}
                    </strong>
                  </span>
                  <span className="text-muted">
                    Cumulative:{' '}
                    <strong className="text-primary-600 dark:text-primary-400 tabular-nums">
                      {sem.cumulativeGpa !== null ? sem.cumulativeGpa.toFixed(2) : '—'}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="divide-y divide-line">
                {sem.records.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-fg">{rec.courseCode}</span>
                        <span className="truncate text-fg/85">{rec.courseTitle}</span>
                        {rec.creditHours === 0 ? <Badge tone="neutral">0 credits</Badge> : null}
                        {rec.excludeFromGpa ? <Badge tone="neutral">Excluded</Badge> : null}
                        {rec.isRetake ? <Badge tone="primary">Retake</Badge> : null}
                        {rec.supersededByRetake ? (
                          <Badge tone="warning">Superseded in CGPA</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted tabular-nums">
                        {rec.creditHours} credit{rec.creditHours === 1 ? '' : 's'} ·{' '}
                        {rec.score !== null ? `Score ${rec.score}% · ` : ''}
                        Grade {rec.gradeLabel} ({rec.gradePoint.toFixed(2)} pts)
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Record retake for ${rec.courseCode}`}
                        onClick={() => {
                          setEditingRecord(null);
                          setRetakeSource(rec);
                          setGradeModalOpen(true);
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Retake
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${rec.courseCode}`}
                        onClick={() => {
                          setRetakeSource(null);
                          setEditingRecord(rec);
                          setGradeModalOpen(true);
                        }}
                      >
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${rec.courseCode}`}
                        onClick={() => void handleDeleteRecord(rec.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <GradeRecordFormModal
        open={gradeModalOpen}
        scale={activeScale}
        courses={courses}
        initialRecord={editingRecord}
        retakeSource={retakeSource}
        defaultSemester={retakeSource ? `Retake Sem ${nextSemesterOrder}` : nextSemesterLabel}
        defaultSemesterOrder={retakeSource ? nextSemesterOrder : (lastSemester?.semesterOrder ?? 1)}
        onClose={() => {
          setGradeModalOpen(false);
          setEditingRecord(null);
          setRetakeSource(null);
        }}
        onSaved={refreshGpa}
      />

      <ScaleSettingsModal
        open={scaleModalOpen}
        activeScale={activeScale}
        scales={scales}
        presets={presets}
        onClose={() => setScaleModalOpen(false)}
        onUpdated={refreshGpa}
      />
    </div>
  );
}
