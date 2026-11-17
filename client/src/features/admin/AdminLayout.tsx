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
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { ThemeToggle } from '../../app/ThemeToggle';
import { Avatar, Badge, cn } from '../../design';

const ADMIN_NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true, superOnly: false },
  { to: '/admin/users', label: 'Users', icon: Users, superOnly: false },
  { to: '/admin/ai-usage', label: 'AI Usage', icon: Cpu, superOnly: false },
  { to: '/admin/content', label: 'Content', icon: FileSearch, superOnly: false },
  { to: '/admin/learning', label: 'Learning', icon: GraduationCap, superOnly: false },
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
    <div className="min-h-screen bg-app text-fg">
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
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-surface/95 backdrop-blur-md transition-transform duration-base ease-soft lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-line/70 px-5">
          <NavLink to="/admin" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-sky-500 text-white shadow-sm">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-display text-base font-bold tracking-tight text-fg">
                LearnSpace
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

        <nav aria-label="Admin navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
            Console
          </p>
          {ADMIN_NAV.filter((item) => !item.superOnly || user?.role === 'super_admin').map((item) => {
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
          })}
        </nav>

        <div className="space-y-1.5 border-t border-line/70 px-3 py-3">
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
                  <p className="truncate text-xs font-semibold text-fg">{user.name}</p>
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

      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line/80 bg-surface/85 px-4 backdrop-blur-md sm:px-6">
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
              <Badge tone={user?.role === 'super_admin' ? 'primary' : 'neutral'}>
                {user?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
              </Badge>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

