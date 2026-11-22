import { NavLink } from 'react-router-dom';
import { cn } from '../../design';
import { useAppPath } from '../basePath';
import { useExperience } from '../experience';

export function BottomNav() {
  const path = useAppPath();
  const experience = useExperience();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line/80 bg-surface/90 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex h-16 max-w-xl items-stretch justify-around px-2">
        {experience.nav.bottomNav.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={path(to)}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex h-full min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium',
                  'transition duration-fast ease-soft',
                  isActive
                    ? 'text-primary-600 dark:text-primary-400 font-semibold'
                    : 'text-muted hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-fast',
                      isActive
                        ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/20 dark:text-primary-300'
                        : '',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
