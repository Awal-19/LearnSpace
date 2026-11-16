import { LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../design';
import { useAuth } from '../app/AuthContext';
import { useAppPath } from '../app/basePath';
import { ACCOUNT_NAV, MAIN_NAV } from '../app/layouts/nav';

/** Mobile "More" destination: everything not in the bottom bar. */
export function MorePage() {
  const path = useAppPath();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const items = [
    ...MAIN_NAV.filter((item) => ['/focus', '/study'].includes(item.to)),
    ...ACCOUNT_NAV,
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <Card className="p-2 sm:p-2">
      <ul className="divide-y divide-line">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={path(to)}
              className="flex min-h-12 items-center gap-3 rounded-md px-3 py-3 text-sm font-medium hover:bg-surface2"
            >
              <Icon className="h-5 w-5 text-muted" aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-danger hover:bg-surface2"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Log out
          </button>
        </li>
      </ul>
    </Card>
  );
}

