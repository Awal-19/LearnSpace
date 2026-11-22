import {
  Activity,
  ArrowLeft,
  BarChart3,
  Cpu,
  FileSearch,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareWarning,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { ThemeToggle } from '../../app/ThemeToggle';
import { Avatar, Badge, cn, VerifiedBadge } from '../../design';

const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true, superOnly: false },
  { to: '/admin/users', label: 'Users', icon: Users, superOnly: false },
  { to: '/admin/ai-usage', label: 'AI Usage', icon: Cpu, superOnly: false },
  { to: '/admin/content', label: 'Content', icon: FileSearch, superOnly: false },
  { to: '/admin/learning', label: 'Learning', icon: GraduationCap, superOnly: false },
  { to: '/admin/shs', label: 'SHS & Safety', icon: ShieldCheck, superOnly: false },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone, superOnly: false },
  { to: '/admin/feedback', label: 'Feedback', icon: MessageSquareWarning, superOnly: false },
  { to: '/admin/audit-log', label: 'Audit Log', icon: ShieldCheck, superOnly: false },
  { to: '/admin/system', label: 'System', icon: Activity, superOnly: false },
  { to: '/admin/settings', label: 'Settings', icon: Settings, superOnly: false },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3, superOnly: false },
  { to: '/admin/team', label: 'Team / Admins', icon: Users, superOnly: true },
  { to: '/admin/platform-settings', label: 'Platform Policy', icon: ShieldCheck, superOnly: true },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickSearch.trim()) {
      navigate(`/admin/users?q=${encodeURIComponent(quickSearch.trim())}`);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-app text-fg">
      {/* Ambient frosted blue ribbon matching student AppLayout */}
      <svg
        aria-hidden="true"
        viewBox="0 0 720 320"
        className="pointer-events-none fixed right-0 top-0 z-0 h-[280px] w-[620px] opacity-65 dark:opacity-15"
      >
        <defs>
          <linearGradient id="adminShellWave" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#EFF6FF" stopOpacity="0" />
            <stop offset="55%" stopColor="#DBEAFE" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#93C5FD" stopOpacity="0.28" />
          </linearGradient>
        </defs>
        <path
          d="M120,0 C240,120 420,90 540,210 C610,275 675,295 720,305 L720,0 Z"
          fill="url(#adminShellWave)"
        />
        <path
          d="M270,0 C395,105 520,75 640,175 C680,208 702,228 720,242 L720,0 Z"
          fill="url(#adminShellWave)"
        />
      </svg>

      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-hidden border-r border-line/80 bg-surface/90 backdrop-blur-xl transition-transform duration-base ease-soft lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 260 220"
          className="pointer-events-none absolute bottom-0 left-0 z-0 h-56 w-full opacity-55 dark:opacity-15"
        >
          <defs>
            <linearGradient id="adminSidebarWave" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#DBEAFE" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#EFF6FF" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path
            d="M0,45 C75,85 110,145 190,185 C225,202 248,212 260,220 L0,220 Z"
            fill="url(#adminSidebarWave)"
          />
          <path d="M0,105 C60,135 95,180 155,220 L0,220 Z" fill="url(#adminSidebarWave)" />
        </svg>

        <div className="relative z-10 flex h-16 items-center justify-between border-b border-line/50 px-5">
          <NavLink to="/admin" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[var(--glow-primary)]">
              <GraduationCap className="h-[18px] w-[18px]" aria-hidden="true" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-display text-base font-bold tracking-tight text-fg">
                Learn<span className="text-primary-600 dark:text-primary-400">Space</span>
              </span>
              <span className="text-[11px] font-medium text-muted">Admin Console</span>
            </div>
          </NavLink>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface2 hover:text-fg lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav
          aria-label="Admin navigation"
          className="relative z-10 flex-1 space-y-1 overflow-y-auto px-3 py-4"
        >
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted/80">
            Console
          </p>
          {ADMIN_NAV.filter((item) => !item.superOnly || user?.role === 'super_admin').map(
            (item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setSidebarOpen(false)}
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
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            },
          )}
        </nav>

        <div className="relative z-10 space-y-1.5 border-t border-line/70 px-3 py-3">
          <NavLink
            to="/"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface2 hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Student App
          </NavLink>
          {user ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-line/70 bg-surface2/50 px-2.5 py-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-1 text-xs font-semibold text-fg">
                    <span className="truncate">{user.name}</span>
                    {user.emailVerified ? <VerifiedBadge className="h-3.5 w-3.5" /> : null}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {user.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                aria-label="Log out"
                title="Log out"
                className="rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-danger"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface2 hover:text-danger"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log out
            </button>
          )}
        </div>
      </aside>

      <div className="relative z-10 flex min-h-screen min-w-0 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 min-w-0 items-center justify-between gap-2 border-b border-line/70 bg-surface/80 px-4 backdrop-blur-xl sm:gap-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl p-2 text-muted transition-colors hover:bg-surface2 hover:text-fg lg:hidden"
              aria-label="Open admin menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <form onSubmit={handleSearch} className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder="Search users by name or email…"
                className="w-72 rounded-xl border border-line bg-surface2/50 py-2 pl-9 pr-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              />
            </form>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="flex items-center gap-2 rounded-full border border-line/80 bg-surface2/60 py-1 pl-1.5 pr-3 text-sm">
              {user ? <Avatar name={user.name} src={user.avatarUrl} size="sm" /> : null}
              <span className="hidden font-medium text-fg sm:inline">{user?.name}</span>
              {user?.emailVerified ? (
                <VerifiedBadge
                  tooltipPlacement="bottom"
                  className="hidden h-3.5 w-3.5 sm:inline-flex"
                />
              ) : null}
              <Badge tone={user?.role === 'super_admin' ? 'primary' : 'neutral'}>
                {user?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
              </Badge>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-content flex-1 animate-fade-up px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
