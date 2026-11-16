import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, type AuthUser } from '../../app/AuthContext';
import { Button, Checkbox, Input, PasswordInput } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { GoogleButton } from './GoogleButton';
import { loginSchema, type LoginValues } from './schemas';

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
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
      setSession(data.accessToken, data.user);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ACCOUNT_LOCKED') {
          const secs = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Log in to continue your study session.</p>
      </div>

      <GoogleButton />

      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
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
          error={errors.email?.message}
          {...register('email')}
        />

        <PasswordInput
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex items-center justify-between gap-2">
          <Checkbox label="Remember me" {...register('rememberMe')} />
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Log in
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        New here?{' '}
        <Link
          to="/signup"
          className="font-medium text-primary-600 hover:underline dark:text-primary-400"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

