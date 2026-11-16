import { NavLink } from 'react-router-dom';
import { cn } from '../../design';
import { useAppPath } from '../basePath';
import { BOTTOM_NAV } from './nav';

export function BottomNav() {
  const path = useAppPath();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex h-16 max-w-xl items-stretch justify-around">
        {BOTTOM_NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={path(to)}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  'transition duration-fast ease-soft',
                  isActive ? 'text-primary-600 dark:text-primary-400' : 'text-muted hover:text-fg',
                )
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

