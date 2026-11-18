import { cn } from './cn';

interface VerifiedBadgeProps {
  className?: string;
  tooltipPlacement?: 'top' | 'bottom';
}

/**
 * Blue verified checkmark icon shown immediately beside a verified user's name.
 */
export function VerifiedBadge({ className, tooltipPlacement = 'top' }: VerifiedBadgeProps) {
  return (
    <span
      role="img"
      title="Verified account"
      aria-label="Verified account"
      className={cn(
        'group/verified relative inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle text-primary-600 dark:text-primary-400',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-full w-full drop-shadow-[0_1px_2px_rgba(37,99,235,0.22)] transition-transform duration-150 group-hover/verified:scale-110"
        aria-hidden="true"
      >
        <rect x="4.5" y="4.5" width="15" height="15" rx="4" fill="currentColor" />
        <rect
          x="4.5"
          y="4.5"
          width="15"
          height="15"
          rx="4"
          fill="currentColor"
          transform="rotate(45 12 12)"
        />
        <path
          d="M8.8 12.2l2.15 2.15 4.35-4.55"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none invisible absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium leading-none text-white opacity-0 shadow-md transition-all duration-150 group-hover/verified:visible group-hover/verified:opacity-100 dark:bg-slate-800',
          tooltipPlacement === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
        )}
      >
        Verified account
      </span>
    </span>
  );
}
