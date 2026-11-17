import { BadgeCheck } from 'lucide-react';
import { cn } from './cn';

/**
 * Blue verified checkmark icon shown beside a verified student's name.
 */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      title="Verified account"
      aria-label="Verified account"
      className={cn('inline-flex items-center align-middle text-primary-600 dark:text-primary-400', className)}
    >
      <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
    </span>
  );
}

