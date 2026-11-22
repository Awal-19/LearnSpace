import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Skeleton } from '../design';
import { setPendingVerifyEmail } from '../features/auth/pendingVerify';
import { useAuth } from './AuthContext';

function FullPageLoading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      role="status"
      aria-label="Loading"
    >
      <div className="w-full max-w-sm space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  );
}

/** Single client-side AuthGate wrapper. The server independently enforces auth & verification on every endpoint. */
export function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoading />;
  if (status === 'unauthenticated') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!user || !user.emailVerified) {
    if (user?.email) setPendingVerifyEmail(user.email);
    return <Navigate to="/verify-email" replace />;
  }
  if (user.ageGroup === 'under_18' && user.guardianConsentStatus !== 'given') {
    return <Navigate to="/guardian-consent-required" replace />;
  }
  return <Outlet />;
}

export const AuthGate = RequireAuth;
