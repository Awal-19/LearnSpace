import { cn } from '../../design';

export interface CourseOption {
  id: string;
  name: string;
  code?: string | null;
}

export interface CourseSelectProps {
  id?: string;
  ariaLabel?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  courses: CourseOption[];
  mode?: 'assign' | 'filter';
  emptyLabel?: string;
  className?: string;
}

export function CourseSelect({
  id,
  ariaLabel,
  label,
  value,
  onChange,
  courses,
  mode = 'assign',
  emptyLabel,
  className,
}: CourseSelectProps) {
  const defaultEmpty = emptyLabel ?? (mode === 'filter' ? 'All courses' : 'No course (unassigned)');

  const control = (
    <select
      id={id}
      aria-label={ariaLabel ?? label ?? 'Course'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-10 rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none',
        className,
      )}
    >
      <option value="">{defaultEmpty}</option>
      {mode === 'filter' ? <option value="none">Unassigned only</option> : null}
      {courses.map((c) => (
        <option key={c.id} value={c.id}>
          {c.code ? `${c.code} — ${c.name}` : c.name}
        </option>
      ))}
    </select>
  );

  if (!label) return control;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {control}
    </div>
  );
}
