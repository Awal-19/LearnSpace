import { useQuery } from '@tanstack/react-query';
import { GraduationCap, LogOut, ShieldCheck } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Avatar, cn, VerifiedBadge } from '../../design';
import { getDueSummary } from '../../features/study/studyApi';
import { useAuth } from '../AuthContext';
import { useAppPath } from '../basePath';
import { ACCOUNT_NAV, MAIN_NAV, type NavItem } from './nav';

function SidebarLink({ item, badge }: { item: NavItem; badge?: string }) {
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
            ? 'bg-gradient-to-r from-primary-50 via-primary-50/90 to-primary-100/50 font-semibold text-primary-600 shadow-sm dark:from-primary-500/20 dark:to-primary-500/10 dark:text-primary-300'
            : 'text-muted hover:bg-primary-50/50 hover:text-fg dark:hover:bg-surface2',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span
              aria-hidden="true"
              className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary-600 dark:bg-primary-400"
            />
          ) : null}
          <Icon
            className={cn(
              'h-4 w-4 shrink-0 transition-transform duration-fast group-hover:scale-105',
              isActive ? 'text-primary-600 dark:text-primary-400' : '',
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {badge ? (
            <span
              aria-label={`${badge} due`}
              className="shrink-0 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
            >
              {badge}
            </span>
          ) : null}
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

  const dueSummaryQuery = useQuery({
    queryKey: ['decks', 'due-summary'],
    queryFn: () =>
      getDueSummary().catch(() => ({
        dueTodayCount: 0,
        reviewedTodayCount: 0,
        streakDays: 0,
        decks: [],
      })),
    enabled: Boolean(user),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const dueCount = dueSummaryQuery.data?.dueTodayCount ?? 0;
  const dueBadge = dueCount > 0 ? (dueCount > 99 ? '99+' : String(dueCount)) : undefined;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col overflow-hidden border-r border-line/80 bg-surface/95 backdrop-blur-md lg:flex">
      {/* Subtle bottom-left light-blue glass ribbon accent */}
      <svg
        aria-hidden="true"
        viewBox="0 0 260 220"
        className="pointer-events-none absolute bottom-0 left-0 z-0 h-56 w-full opacity-55 dark:opacity-15"
      >
        <defs>
          <linearGradient id="sidebarBottomWave" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#DBEAFE" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#EFF6FF" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <path
          d="M0,45 C75,85 110,145 190,185 C225,202 248,212 260,220 L0,220 Z"
          fill="url(#sidebarBottomWave)"
        />
        <path d="M0,105 C60,135 95,180 155,220 L0,220 Z" fill="url(#sidebarBottomWave)" />
      </svg>

      <div className="relative z-10 flex h-16 items-center gap-3 border-b border-line/50 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_8px_18px_rgba(37,99,235,0.28)]">
          <GraduationCap className="h-[18px] w-[18px]" aria-hidden="true" />
        </div>
        <NavLink to={path('/')} className="flex flex-col leading-tight">
          <span className="font-display text-base font-bold tracking-tight text-fg">
            Learn<span className="text-primary-600 dark:text-primary-400">Space</span>
          </span>
          <span className="text-[11px] font-medium text-muted">AI Study Workspace</span>
        </NavLink>
      </div>

      <nav aria-label="Main" className="relative z-10 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/80">
          Workspace
        </p>
        {MAIN_NAV.map((item) => (
          <SidebarLink
            key={item.to}
            item={item}
            badge={item.to === '/study' ? dueBadge : undefined}
          />
        ))}
      </nav>

      <div className="relative z-10 space-y-1 border-t border-line/60 px-3 py-3">
        <nav aria-label="Account" className="space-y-1">
          {isAdmin ? (
            <SidebarLink item={{ to: '/admin', label: 'Admin Console', icon: ShieldCheck }} />
          ) : null}
          {ACCOUNT_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>

        {user ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-line/70 bg-white/85 px-2.5 py-2 shadow-sm backdrop-blur-sm dark:border-line/70 dark:bg-surface2/60">
            <NavLink to={path('/profile')} className="flex min-w-0 items-center gap-2.5">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-1 text-xs font-semibold text-fg">
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
