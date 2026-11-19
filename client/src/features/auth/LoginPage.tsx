import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, GraduationCap, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, type AuthUser } from '../../app/AuthContext';
import { Button, Checkbox, Input, PasswordInput } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { GoogleButton } from './GoogleButton';
import { setPendingVerifyEmail } from './pendingVerify';
import { loginSchema, type LoginValues } from './schemas';

interface LoginResponse {
  accessToken?: string;
  user?: AuthUser;
  requiresTwoFactor?: boolean;
  email?: string;
}

function safeNext(raw: string | null): string {
  if (
    !raw ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.startsWith('/\\') ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f]/.test(raw)
  ) {
    return '/';
  }
  return raw;
}

function googleErrorMessage(code: string | null): string | null {
  if (code === 'google_denied') {
    return 'Google sign-in was cancelled. You can try again or log in with email.';
  }
  if (code === 'google_state') {
    return 'Your Google sign-in session expired. Please click Continue with Google again.';
  }
  if (code === 'google_failed') {
    return 'Google sign-in could not be completed. Please try again.';
  }
  return null;
}

export function LoginPage() {
  const { status, setSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(() =>
    googleErrorMessage(params.get('error')),
  );
  const [twoFactorEmail, setTwoFactorEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  if (status === 'authenticated') {
    return <Navigate to={safeNext(params.get('next'))} replace />;
  }

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    try {
      const data = await request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: values,
        auth: false,
        cookie: true,
      });
      if (data.requiresTwoFactor && data.email) {
        setTwoFactorEmail(data.email);
        return;
      }
      if (data.accessToken && data.user) {
        setSession(data.accessToken, data.user);
        navigate(safeNext(params.get('next')), { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_NOT_VERIFIED') {
          const email = (err.details as { email?: string } | undefined)?.email ?? values.email;
          setPendingVerifyEmail(email);
          navigate('/verify-email', { replace: true });
          return;
        }
        if (err.code === 'ACCOUNT_LOCKED') {
          const secs = (err.details as { retryAfterSeconds?: number } | undefined)
            ?.retryAfterSeconds;
          const mins = secs ? Math.max(1, Math.ceil(secs / 60)) : 15;
          setServerError(`Too many failed attempts. Try again in about ${mins} minute(s).`);
        } else {
          setServerError(err.message);
        }
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    }
  };

  const onVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorEmail) return;
    setServerError(null);
    setVerifyingOtp(true);
    try {
      const data = await request<{ accessToken: string; user: AuthUser }>(
        '/auth/admin-2fa/verify',
        {
          method: 'POST',
          body: { email: twoFactorEmail, code: otpCode.trim() },
          auth: false,
          cookie: true,
        },
      );
      setSession(data.accessToken, data.user);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Invalid verification code.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  if (twoFactorEmail) {
    return (
      <div className="space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-fg">Admin verification</h1>
          <p className="text-sm leading-relaxed text-muted">
            Enter the 6-digit security code sent to{' '}
            <strong className="font-medium text-fg">{twoFactorEmail}</strong>.
          </p>
        </div>

        {serverError && (
          <div
            role="alert"
            className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            {serverError}
          </div>
        )}

        <form onSubmit={onVerifyOtp} className="space-y-4">
          <Input
            label="6-digit code"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            placeholder="123456"
            maxLength={6}
            required
          />
          <div className="flex gap-2.5 pt-1">
            <Button type="submit" className="flex-1" loading={verifyingOtp}>
              Verify &amp; sign in
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setTwoFactorEmail(null);
                setOtpCode('');
                setServerError(null);
              }}
            >
              Back
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_10px_24px_rgba(37,99,235,0.32)]">
          <GraduationCap className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-[-0.025em] text-fg">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-muted">Log in to continue your study session.</p>
      </div>

      <GoogleButton />

      {serverError && (
        <div
          role="alert"
          className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@university.edu"
          leftIcon={<Mail className="h-4 w-4" />}
          className="rounded-full border-white/95 bg-white/80 pr-4 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-surface2/60"
          error={errors.email?.message}
          {...register('email')}
        />

        <PasswordInput
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          leftIcon={<Lock className="h-4 w-4" />}
          className="rounded-full border-white/95 bg-white/80 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-surface2/60"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <Checkbox label="Remember me" {...register('rememberMe')} />
          <Link
            to="/forgot-password"
            className="text-[13px] font-medium text-primary-600 transition-colors hover:text-primary-700 hover:underline dark:text-primary-400 dark:hover:text-primary-300"
          >
            Forgot password?
          </Link>
        </div>

        <div className="pt-1">
          <Button
            type="submit"
            size="lg"
            loading={isSubmitting}
            className="h-11 w-full rounded-full bg-gradient-to-r from-primary-600 via-primary-600 to-primary-500 text-sm font-medium shadow-[0_10px_24px_rgba(37,99,235,0.32)] hover:brightness-105"
          >
            Log in
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </form>

      <p className="pt-1 text-center text-[13px] text-muted">
        New here?{' '}
        <Link
          to="/signup"
          className="font-medium text-primary-600 transition-colors hover:text-primary-700 hover:underline dark:text-primary-400 dark:hover:text-primary-300"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
