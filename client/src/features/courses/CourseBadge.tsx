import { Link, useInRouterContext } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { cn } from '../../design';

export interface CourseBadgeCourse {
  id: string;
  name: string;
  code?: string | null;
  color?: string | null;
}

export interface CourseBadgeProps {
  course: CourseBadgeCourse | undefined | null;
  link?: boolean;
  className?: string;
}

export function CourseBadge({ course, link = false, className }: CourseBadgeProps) {
  const appPath = useAppPath();
  const inRouter = useInRouterContext();
  if (!course) return null;

  const dotColor = course.color ?? '#2563EB';
  const label = course.code ? `${course.code}` : course.name;
  const fullLabel = course.code ? `${course.code} · ${course.name}` : course.name;

  const pillClass = cn(
    'inline-flex max-w-[180px] items-center gap-1.5 rounded-full border border-line/90 bg-surface2/75 px-2.5 py-0.5 text-[11px] font-medium text-fg transition-colors',
    link && 'hover:border-primary-400 hover:bg-primary-50/70 dark:hover:bg-primary-500/15',
    className,
  );

  const inner = (
    <>
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <span className="truncate">{label}</span>
    </>
  );

  if (link && inRouter) {
    return (
      <Link to={appPath(`/courses/${course.id}`)} title={fullLabel} className={pillClass}>
        {inner}
      </Link>
    );
  }

  return (
    <span title={fullLabel} className={pillClass}>
      {inner}
    </span>
  );
}
