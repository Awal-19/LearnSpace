import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { restoreSession, useAuth } from '../../app/AuthContext';
import { Card, Spinner } from '../../design';

/** Completes Google OAuth after the server sets the refresh cookie and redirects here. */
export function AuthCallbackPage() {
  const { setSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((session) => {
        if (cancelled) return;
        if (session) {
          setSession(session.accessToken, session.user);
          navigate('/', { replace: true });
        } else {
          navigate('/login?error=google_failed', { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) navigate('/login?error=google_failed', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, setSession]);

  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <Spinner label="Signing you in" className="h-6 w-6 text-primary-600" />
      <p className="text-sm text-muted">Completing sign-in…</p>
    </Card>
  );
}

