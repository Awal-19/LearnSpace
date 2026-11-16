import { LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { cn } from '../../design';
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
          'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition duration-fast ease-soft',
          isActive
            ? 'bg-primary-100 text-primary-700 dark:text-primary-300'
            : 'text-muted hover:bg-surface2 hover:text-fg',
        )
      }
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      {item.label}
    </NavLink>
  );
}

export function Sidebar() {
  const path = useAppPath();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <img src="/favicon.svg" alt="" className="h-8 w-8" />
        <NavLink to={path('/')} className="font-display text-lg font-semibold">
          LearnSpace
        </NavLink>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {MAIN_NAV.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>
      <nav aria-label="Account" className="space-y-1 border-t border-line px-3 py-4">
        {ACCOUNT_NAV.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted transition duration-fast ease-soft hover:bg-surface2 hover:text-fg"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Log out
        </button>
      </nav>
    </aside>
  );
}

