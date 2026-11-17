import { ChevronRight, LogOut, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../design';
import { useAuth } from '../app/AuthContext';
import { useAppPath } from '../app/basePath';
import { ACCOUNT_NAV, MAIN_NAV } from '../app/layouts/nav';

/** Mobile "More" destination: everything not in the bottom bar. */
export function MorePage() {
  const path = useAppPath();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const items = [
    ...MAIN_NAV.filter((item) => ['/focus', '/study'].includes(item.to)),
    ...ACCOUNT_NAV,
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card className="divide-y divide-line p-2 sm:p-2">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={path(to)}
            className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-fg transition hover:bg-surface2"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/10 text-primary-600 dark:text-primary-400">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              {label}
            </span>
            <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
          </Link>
        ))}
        {isAdmin ? (
          <Link
            to="/admin"
            className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-fg transition hover:bg-surface2"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              Admin Console
            </span>
            <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
          </Link>
        ) : null}
      </Card>

      <Card className="p-2 sm:p-2">
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-danger transition hover:bg-danger/10"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </span>
          Log out
        </button>
      </Card>
    </div>
  );
}
