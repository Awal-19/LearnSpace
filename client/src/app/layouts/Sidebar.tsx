import { LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Avatar, cn, VerifiedBadge } from '../../design';
import { useAuth } from '../AuthContext';
import { useAppPath } from '../basePath';
import { ACCOUNT_NAV, MAIN_NAV, type NavItem } from './nav';

function SidebarLink({ item }: { item: NavItem }) {
  const path = useAppPath();
  const Icon = item.icon;
  return (
    <NavLink
      to={path(item.to)}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-fast ease-soft',
          isActive
            ? 'bg-primary-600/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 font-semibold shadow-sm'
            : 'text-muted hover:bg-surface2 hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span
              aria-hidden="true"
              className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary-600 dark:bg-primary-400"
            />
          ) : null}
          <Icon
            className={cn(
              'h-4 w-4 shrink-0 transition-transform duration-fast group-hover:scale-105',
              isActive ? 'text-primary-600 dark:text-primary-400' : '',
            )}
            aria-hidden="true"
          />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const path = useAppPath();
  const { logout, user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-line bg-surface/95 backdrop-blur-md lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-line/70 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-sky-500 text-white shadow-sm">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </div>
        <NavLink to={path('/')} className="flex flex-col leading-tight">
          <span className="font-display text-base font-bold tracking-tight text-fg">
            LearnSpace
          </span>
          <span className="text-[11px] font-medium text-muted">AI Study Workspace</span>
        </NavLink>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
          Workspace
        </p>
        {MAIN_NAV.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="border-t border-line/70 px-3 py-3 space-y-1">
        <nav aria-label="Account" className="space-y-1">
          {isAdmin ? (
            <SidebarLink item={{ to: '/admin', label: 'Admin Console', icon: ShieldCheck }} />
          ) : null}
          {ACCOUNT_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>

        {user ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-line/70 bg-surface2/50 px-2.5 py-2">
            <NavLink to={path('/profile')} className="flex min-w-0 items-center gap-2.5">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate text-xs font-semibold text-fg">
                  <span className="truncate">{user.name}</span>
                  {user.emailVerified ? <VerifiedBadge className="h-3.5 w-3.5" /> : null}
                </p>
                <p className="truncate text-[11px] text-muted">{user.email}</p>
              </div>
            </NavLink>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
              className="rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-danger"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
