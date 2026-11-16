import { Link, useLocation } from 'react-router-dom';
import { Avatar } from '../../design';
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
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-app/90 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2 lg:hidden">
        <img src="/favicon.svg" alt="" className="h-7 w-7" />
      </div>
      <h1 className="truncate text-lg lg:text-xl">{titleForPath(pathname, base)}</h1>
      <div className="flex items-center gap-1">
        {user ? <NotificationBell /> : null}
        <ThemeToggle />
        {user && (
          <Link
            to={path('/profile')}
            aria-label="Your profile"
            className="ml-1 rounded-full"
          >
            <Avatar name={user.name} src={user.avatarUrl} size="sm" />
          </Link>
        )}
      </div>
    </header>
  );
}

