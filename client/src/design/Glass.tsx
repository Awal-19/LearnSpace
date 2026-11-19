import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Modal } from './Modal';

/** Translucent liquid-glass card matching the student workspace aesthetic. */
export function GlassCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-2xl border border-line/70 bg-[rgb(var(--glass-bg))] p-5 shadow-md backdrop-blur-xl transition-all duration-base ease-soft dark:border-white/[0.08] sm:p-6',
        className,
      )}
      {...rest}
    />
  );
}

/** Nested translucent glass panel for toolbars, filters, and grouped controls. */
export function GlassPanel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-xl border border-line/70 bg-surface2/55 p-3.5 backdrop-blur-md dark:border-white/[0.07] dark:bg-white/[0.04]',
        className,
      )}
      {...rest}
    />
  );
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  accent?: string;
  className?: string;
}

/** KPI metric card with liquid-glass depth and icon badge. */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400',
  className,
}: StatCardProps) {
  return (
    <GlassCard className={cn('hover:-translate-y-0.5 hover:shadow-lg', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-medium text-muted">{label}</span>
          <p className="mt-1.5 font-display text-2xl font-bold tracking-tight text-fg tabular-nums">
            {value}
          </p>
        </div>
        <span
          className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', accent)}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      {sub ? <p className="mt-2 text-xs text-muted">{sub}</p> : null}
    </GlassCard>
  );
}

export interface ChartCardProps {
  title: string;
  icon?: LucideIcon;
  iconClassName?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Chart container with liquid-glass surface and min-w-0 mobile safety. */
export function ChartCard({
  title,
  icon: Icon,
  iconClassName = 'bg-primary-600/10 text-primary-600 dark:text-primary-400',
  action,
  children,
  className,
}: ChartCardProps) {
  return (
    <GlassCard className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {Icon ? (
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                iconClassName,
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : null}
          <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </GlassCard>
  );
}

/** Responsive horizontally-scrollable table wrapper inside a liquid-glass card. */
export function DataTable({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <GlassCard className={cn('overflow-hidden !p-0', className)}>
      <div className="overflow-x-auto">{children}</div>
    </GlassCard>
  );
}

export interface TabOption<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
}

/** Liquid-glass segmented pill tab bar. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel = 'Tabs',
  className,
}: {
  items: ReadonlyArray<TabOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex flex-wrap gap-1 rounded-xl border border-line/60 bg-surface2/75 p-1 backdrop-blur-md dark:border-white/[0.08] dark:bg-white/[0.04]',
        className,
      )}
    >
      {items.map((item) => {
        const active = value === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-base ease-soft',
              active
                ? 'bg-surface text-primary-600 shadow-sm dark:bg-surface2 dark:text-primary-400'
                : 'text-muted hover:text-fg',
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

/** Shared select matching student Input height, border, focus ring, and 16px mobile font. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, className, id, children, ...rest },
  ref,
) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={id} className="block text-sm font-medium text-fg">
          {label}
        </label>
      ) : null}
      <select
        ref={ref}
        id={id}
        className={cn(
          'h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-base text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none sm:text-sm',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
});

/** Accessible icon button with 44x44px touch target on mobile. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function IconButton({ className, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex h-10 w-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-muted transition-colors hover:bg-primary-50/70 hover:text-primary-600 dark:hover:bg-white/[0.08] dark:hover:text-primary-400',
          className,
        )}
        {...rest}
      />
    );
  },
);

/** Responsive modal that presents cleanly on mobile and desktop. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-lg">
      {children}
    </Modal>
  );
}
