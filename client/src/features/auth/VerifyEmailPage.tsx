import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { Card, ErrorState, Spinner } from '../../design';
import { ApiError, request } from '../../lib/apiClient';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { status: authStatus, markEmailVerified } = useAuth();
  const [state, setState] = useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error',
  );
  const [errorMsg, setErrorMsg] = useState(
    token ? '' : 'This verification link is missing a token.',
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    request('/auth/verify-email', {
      method: 'POST',
      body: { token },
      auth: false,
    })
      .then(() => {
        if (cancelled) return;
        markEmailVerified();
        setState('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMsg(err instanceof ApiError ? err.message : 'Could not verify this link.');
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token, markEmailVerified]);

  if (state === 'loading') {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <Spinner label="Verifying your email" className="h-6 w-6 text-primary-600" />
        <p className="text-sm text-muted">Verifying your email address…</p>
      </Card>
    );
  }

  if (state === 'error') {
    return <ErrorState title="Verification failed" message={errorMsg} />;
  }

  return (
    <Card className="space-y-4 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
        <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="text-2xl">Email verified</h1>
      <p className="text-sm text-muted">
        Your email is confirmed. You now have full access to the AI Study Assistant and reminders.
      </p>
      <Link
        to={authStatus === 'authenticated' ? '/' : '/login'}
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700"
      >
        {authStatus === 'authenticated' ? 'Go to dashboard' : 'Log in'}
      </Link>
    </Card>
  );
}

