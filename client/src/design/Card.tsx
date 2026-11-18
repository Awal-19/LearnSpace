import { useEffect, useState, type HTMLAttributes } from 'react';
import { API_BASE_URL } from '../lib/apiClient';
import { cn } from './cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line/90 bg-surface p-5 shadow-sm transition-shadow duration-base ease-soft sm:p-6',
        className,
      )}
      {...rest}
    />
  );
}

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface2 text-fg',
  primary: 'bg-primary-100 text-primary-700 dark:text-primary-300',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
};

export function Badge({
  tone = 'neutral',
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface2', className)}
      {...rest}
    />
  );
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const avatarSizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl' };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function resolveAvatarUrl(src?: string | null): string | null {
  if (!src) return null;
  if (src.startsWith('/api/v1/')) {
    return `${API_BASE_URL.replace(/\/$/, '')}${src.slice('/api/v1'.length)}`;
  }
  return src;
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const resolvedSrc = resolveAvatarUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailedSrc(null);
  }, [resolvedSrc]);

  const showImg = Boolean(resolvedSrc) && failedSrc !== resolvedSrc;

  return showImg ? (
    <img
      src={resolvedSrc!}
      alt={name}
      onError={() => setFailedSrc(resolvedSrc)}
      className={cn('shrink-0 rounded-full object-cover', avatarSizes[size], className)}
    />
  ) : (
    <span
      role="img"
      aria-label={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-primary-100 font-semibold text-primary-700 dark:text-primary-300',
        avatarSizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
