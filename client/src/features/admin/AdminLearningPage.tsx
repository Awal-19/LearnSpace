import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, EmptyState, GlassCard, Skeleton } from '../../design';
import { fetchAdminLearning } from './adminApi';

export function AdminLearningPage() {
  const query = useQuery({
    queryKey: ['admin', 'learning'],
    queryFn: fetchAdminLearning,
  });

  if (query.isLoading) return <Skeleton className="h-72" />;
  if (query.isError || !query.data) {
    return (
      <GlassCard className="p-6 text-center">
        <p className="text-sm text-danger">Failed to load learning stats.</p>
      </GlassCard>
    );
  }

  const { totals, popularCourses, programmeBreakdown, levelBreakdown } = query.data;

  return (
    <div className="space-y-6">
      <GlassCard className="flex items-start gap-4 border-primary-200/80 bg-gradient-to-br from-primary-50/90 via-[rgb(var(--glass-bg))] to-sky-50/70 p-5 dark:border-primary-500/20 dark:from-primary-600/15 dark:via-[rgb(var(--glass-bg))] dark:to-sky-500/10 sm:p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
          <GraduationCap className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            Learning Content &amp; Engagement
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Courses, timetable schedules, exams &amp; revision plans, quizzes, SM-2 flashcards,
            study documents, GPA tracking, notes, tasks, and student demographics.
          </p>
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          {
            label: 'Quizzes / Attempts',
            value: `${totals.totalQuizzes} / ${totals.totalQuizAttempts}`,
          },
          { label: 'Avg Quiz Score', value: `${totals.avgQuizScorePct}%` },
          {
            label: 'Decks / Cards / Reviews',
            value: `${totals.totalDecks} / ${totals.totalCards} / ${totals.totalFlashcardReviews}`,
          },
          { label: 'Notes Created', value: totals.totalNotes },
          {
            label: 'Study Hours',
            value: `${totals.totalStudyHours}h (Tasks ${totals.taskCompletionRatePct}%)`,
          },
        ].map((k) => (
          <GlassCard
            key={k.label}
            className="p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:shadow-lg"
          >
            <p className="text-xs font-medium text-muted">{k.label}</p>
            <p className="mt-1.5 font-display text-xl font-bold text-fg tabular-nums">{k.value}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Courses Created', value: totals.totalCourses },
          { label: 'Timetable Classes', value: totals.totalTimetableEntries },
          {
            label: 'Exams / Revision Plans',
            value: `${totals.totalExams} / ${totals.totalRevisionPlans}`,
          },
          {
            label: 'Study Docs / Practice Runs',
            value: `${totals.totalDocuments} / ${totals.totalPracticeAttempts}`,
          },
          {
            label: 'GPA Scales / Grade Records',
            value: `${totals.totalGradingScales} / ${totals.totalGradeRecords}`,
          },
        ].map((k) => (
          <GlassCard
            key={k.label}
            className="p-5 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:shadow-lg"
          >
            <p className="text-xs font-medium text-muted">{k.label}</p>
            <p className="mt-1.5 font-display text-xl font-bold text-fg tabular-nums">{k.value}</p>
          </GlassCard>
        ))}
      </div>

      <ChartCard title="Most Active Courses">
        {popularCourses.length === 0 ? (
          <EmptyState title="No courses yet" description="Course engagement will appear here." />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={popularCourses}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="notes" name="Notes" fill="#2563eb" radius={[6, 6, 0, 0]} />
                <Bar dataKey="tasks" name="Tasks" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="documents" name="Documents" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold">Students by Programme</h2>
          <ul className="mt-3 divide-y divide-line/80 text-sm">
            {programmeBreakdown.map((p) => (
              <li
                key={p.label}
                className="-mx-2 flex justify-between rounded-xl px-2 py-2.5 transition-colors hover:bg-surface2/50"
              >
                <span className="font-medium text-fg">{p.label}</span>
                <span className="font-semibold text-primary-600 tabular-nums dark:text-primary-400">
                  {p.count}
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard className="p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold">Students by Level</h2>
          <ul className="mt-3 divide-y divide-line/80 text-sm">
            {levelBreakdown.map((l) => (
              <li
                key={l.label}
                className="-mx-2 flex justify-between rounded-xl px-2 py-2.5 transition-colors hover:bg-surface2/50"
              >
                <span className="font-medium text-fg">{l.label}</span>
                <span className="font-semibold text-primary-600 tabular-nums dark:text-primary-400">
                  {l.count}
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </div>
    </div>
  );
}
