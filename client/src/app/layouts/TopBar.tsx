import { ChevronDown, GraduationCap } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Avatar, VerifiedBadge } from '../../design';
import { NotificationBell } from '../../features/planner/NotificationBell';
import { useAuth } from '../AuthContext';
import { useAppPath } from '../basePath';
import { useExperience } from '../experience';
import { ThemeToggle } from '../ThemeToggle';
import { titleForPath } from './nav';

export function TopBar({ base = '' }: { base?: string }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const path = useAppPath();
  const experience = useExperience();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line/60 bg-white/75 px-4 backdrop-blur-xl dark:border-line/70 dark:bg-surface/80 sm:px-6">
      <div className="flex items-center gap-2.5 lg:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_6px_14px_rgba(37,99,235,0.26)]">
          <GraduationCap className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <h1 className="truncate font-display text-lg font-bold tracking-tight text-fg lg:text-xl">
        {titleForPath(pathname, base, experience)}
      </h1>
      <div className="flex items-center gap-2">
        {user ? <NotificationBell /> : null}
        <ThemeToggle />
        {user && (
          <Link
            to={path('/profile')}
            aria-label="Your profile"
            className="ml-0.5 inline-flex items-center gap-2 rounded-full border border-white/85 bg-white/80 py-1 pl-1 pr-3 text-xs font-medium text-fg shadow-sm backdrop-blur-md transition hover:border-primary-300 hover:bg-white dark:border-line dark:bg-surface dark:hover:border-primary-500/40"
          >
            <Avatar name={user.name} src={user.avatarUrl} size="sm" className="h-7 w-7" />
            <span className="hidden max-w-[130px] truncate sm:inline">{user.name}</span>
            {user.emailVerified ? (
              <VerifiedBadge
                tooltipPlacement="bottom"
                className="hidden h-3.5 w-3.5 sm:inline-flex"
              />
            ) : null}
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted sm:inline" aria-hidden="true" />
          </Link>
        )}
      </div>
    </header>
  );
}
