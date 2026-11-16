import { BookOpen, Clock, Flame, GraduationCap } from 'lucide-react';
import { Card, ErrorState, Skeleton } from '../../design';

export interface UserStats {
  streakDays: number;
  longestStreakDays: number;
  hoursStudied: number;
  hoursLast7Days: number;
  notesCreated: number;
  quizzesTaken: number;
  averageQuizScore: number;
}

interface StatsGridProps {
  stats?: UserStats;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function StatsGrid({ stats, isLoading, isError, onRetry }: StatsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Loading study stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="mb-2 h-4 w-24" />
            <Skeleton className="mb-1 h-8 w-16" />
            <Skeleton className="h-3 w-28" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <ErrorState
        title="Could not load study stats"
        message="We couldn't fetch your activity numbers right now."
        onRetry={onRetry}
      />
    );
  }

  const avgPercent = Math.round(stats.averageQuizScore * 100);

  const items = [
    {
      label: 'Study streak',
      value: `${stats.streakDays} ${stats.streakDays === 1 ? 'day' : 'days'}`,
      subtext: `Longest: ${stats.longestStreakDays} ${stats.longestStreakDays === 1 ? 'day' : 'days'}`,
      icon: Flame,
      accent: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Hours studied',
      value: `${stats.hoursStudied}h`,
      subtext: `${stats.hoursLast7Days}h in the last 7 days`,
      icon: Clock,
      accent: 'text-primary-600 dark:text-primary-400',
    },
    {
      label: 'Notes created',
      value: String(stats.notesCreated),
      subtext: 'Saved across your courses',
      icon: BookOpen,
      accent: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Quizzes taken',
      value: String(stats.quizzesTaken),
      subtext: stats.quizzesTaken > 0 ? `Average score: ${avgPercent}%` : 'No quiz attempts yet',
      icon: GraduationCap,
      accent: 'text-indigo-600 dark:text-indigo-400',
    },
  ];

  return (
    <section aria-label="Study statistics" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {item.label}
              </span>
              <Icon className={`h-4 w-4 ${item.accent}`} aria-hidden="true" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              {item.value}
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{item.subtext}</p>
          </Card>
        );
      })}
    </section>
  );
}

