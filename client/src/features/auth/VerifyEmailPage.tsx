import { CheckCircle2, MailCheck, RotateCcw } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, type AuthUser } from '../../app/AuthContext';
import { Button, Card, ErrorState, Spinner, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import {
  clearPendingVerifyEmail,
  getPendingVerifyEmail,
  maskEmail,
  setPendingVerifyEmail,
} from './pendingVerify';

interface VerifyOtpResponse {
  accessToken: string;
  user: AuthUser;
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const legacyToken = params.get('token');
  const queryEmail = params.get('email');
  const navigate = useNavigate();
  const toast = useToast();
  const { status: authStatus, user, setSession, markEmailVerified, logout } = useAuth();

  const [pendingEmail] = useState<string>(() => {
    if (queryEmail) {
      setPendingVerifyEmail(queryEmail);
      return queryEmail.trim().toLowerCase();
    }
    if (user && !user.emailVerified) {
      setPendingVerifyEmail(user.email);
      return user.email;
    }
    return getPendingVerifyEmail();
  });

  // Legacy link-token support if a user opens an old ?token= link
  const [legacyState, setLegacyState] = useState<'loading' | 'success' | 'error'>(
    legacyToken ? 'loading' : 'error',
  );
  const [legacyError, setLegacyError] = useState('');

  useEffect(() => {
    if (!legacyToken) return;
    let cancelled = false;
    request('/auth/verify-email', {
      method: 'POST',
      body: { token: legacyToken },
      auth: false,
    })
      .then(() => {
        if (cancelled) return;
        markEmailVerified();
        clearPendingVerifyEmail();
        setLegacyState('success');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLegacyError(err instanceof ApiError ? err.message : 'Could not verify this link.');
        setLegacyState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [legacyToken, markEmailVerified]);

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [verifying, setVerifying] = useState(false);
  const [verifiedDone, setVerifiedDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const submitCode = useCallback(
    async (code: string) => {
      if (!pendingEmail || code.length !== 6 || verifying) return;
      setVerifying(true);
      setErrorMsg(null);
      try {
        const res = await request<VerifyOtpResponse>('/auth/verify-otp', {
          method: 'POST',
          body: { email: pendingEmail, code },
          auth: false,
          cookie: true,
        });
        clearPendingVerifyEmail();
        setVerifiedDone(true);
        setSession(res.accessToken, res.user);
        toast.show({ kind: 'success', title: 'Email verified! Welcome to LearnSpace.' });
        navigate('/', { replace: true });
      } catch (err) {
        setDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        setErrorMsg(
          err instanceof ApiError ? err.message : 'Could not verify that code. Please try again.',
        );
      } finally {
        setVerifying(false);
      }
    },
    [navigate, pendingEmail, setSession, toast, verifying],
  );

  if (authStatus === 'authenticated' && user?.emailVerified) {
    return <Navigate to="/" replace />;
  }

  if (legacyToken) {
    if (legacyState === 'loading') {
      return (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Spinner label="Verifying your email" className="h-6 w-6 text-primary-600" />
          <p className="text-sm text-muted">Verifying your email address…</p>
        </Card>
      );
    }
    if (legacyState === 'error') {
      return <ErrorState title="Verification failed" message={legacyError} />;
    }
    return (
      <Card className="space-y-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl">Email verified</h1>
        <p className="text-sm text-muted">Your email is confirmed.</p>
        <Link
          to={authStatus === 'authenticated' ? '/' : '/login'}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700"
        >
          {authStatus === 'authenticated' ? 'Go to dashboard' : 'Log in'}
        </Link>
      </Card>
    );
  }

  if (!pendingEmail) {
    return (
      <div className="space-y-6 text-center">
        <h1 className="text-2xl sm:text-3xl">Verify your email</h1>
        <p className="text-sm text-muted">
          Sign up or log in first so we know where to send your 6-digit verification code.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/signup">
            <Button>Sign up</Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary">Log in</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleDigitChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, '');
    if (!cleaned) {
      setDigits((prev) => prev.map((d, i) => (i === index ? '' : d)));
      return;
    }
    if (cleaned.length > 1) {
      const next = cleaned.slice(0, 6).split('');
      const filled = Array.from({ length: 6 }, (_, i) => next[i] ?? '');
      setDigits(filled);
      const joined = filled.join('');
      if (joined.length === 6) void submitCode(joined);
      return;
    }
    setDigits((prev) => {
      const next = prev.map((d, i) => (i === index ? cleaned : d));
      if (index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
      const joined = next.join('');
      if (joined.length === 6) {
        void submitCode(joined);
      }
      return next;
    });
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const filled = Array.from({ length: 6 }, (_, i) => pasted[i] ?? '');
    setDigits(filled);
    if (pasted.length === 6) {
      void submitCode(pasted);
    } else {
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setErrorMsg(null);
    try {
      await request('/auth/resend-otp', {
        method: 'POST',
        body: { email: pendingEmail },
        auth: false,
      });
      setCooldown(60);
      toast.show({ kind: 'success', title: 'New verification code sent' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const secs = err.retryAfterSeconds ?? 60;
        setCooldown(secs);
        setErrorMsg(err.message);
      } else {
        setErrorMsg(err instanceof ApiError ? err.message : 'Could not resend code.');
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/10 text-primary-600">
          <MailCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl sm:text-3xl">Verify your email</h1>
        <p className="text-sm text-muted">
          We sent a 6-digit code to <strong className="text-fg">{maskEmail(pendingEmail)}</strong>.
          It expires in 10 minutes.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {errorMsg}
        </div>
      )}

      {verifiedDone ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
          <p className="text-sm font-medium">Verified! Redirecting to your dashboard…</p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode(digits.join(''));
          }}
          className="space-y-5"
        >
          <div
            className="flex justify-center gap-2 sm:gap-3"
            role="group"
            aria-label="6-digit verification code"
          >
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                aria-label={`Digit ${index + 1}`}
                value={digit}
                disabled={verifying}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                className="h-12 w-10 rounded-lg border border-line bg-surface text-center font-mono text-lg font-semibold text-fg transition focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20 sm:h-14 sm:w-12 sm:text-xl"
              />
            ))}
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={verifying}
            disabled={digits.join('').length !== 6}
          >
            Verify &amp; Continue
          </Button>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={cooldown > 0 || resending}
          onClick={() => void handleResend()}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </Button>

        <div className="flex items-center gap-3">
          {user && !user.emailVerified ? (
            <button
              type="button"
              onClick={() => {
                clearPendingVerifyEmail();
                void logout();
              }}
              className="hover:text-fg underline"
            >
              Log out
            </button>
          ) : null}
          <Link
            to="/signup"
            onClick={() => clearPendingVerifyEmail()}
            className="hover:text-fg underline"
          >
            Change email
          </Link>
        </div>
      </div>
    </div>
  );
}
