import { Sparkles } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Avatar, VerifiedBadge } from '../../design';
import { NotificationBell } from '../../features/planner/NotificationBell';
import { useAuth } from '../AuthContext';
import { useAppPath } from '../basePath';
import { ThemeToggle } from '../ThemeToggle';
import { titleForPath } from './nav';

export function TopBar({ base = '' }: { base?: string }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const path = useAppPath();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line/80 bg-app/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-2.5 lg:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-600 to-sky-500 text-white shadow-sm">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <h1 className="truncate font-display text-lg font-semibold tracking-tight lg:text-xl">
        {titleForPath(pathname, base)}
      </h1>
      <div className="flex items-center gap-1.5">
        {user ? <NotificationBell /> : null}
        <ThemeToggle />
        {user && (
          <Link
            to={path('/profile')}
            aria-label="Your profile"
            className="ml-1 inline-flex items-center gap-2 rounded-full border border-line/80 bg-surface py-1 pl-1 pr-2.5 text-xs font-medium text-fg shadow-sm transition hover:border-primary-400"
          >
            <Avatar name={user.name} src={user.avatarUrl} size="sm" className="h-7 w-7" />
            <span className="hidden max-w-[120px] truncate sm:inline">{user.name}</span>
            {user.emailVerified ? <VerifiedBadge className="hidden h-3.5 w-3.5 sm:inline-flex" /> : null}
          </Link>
        )}
      </div>
    </header>
  );
}
