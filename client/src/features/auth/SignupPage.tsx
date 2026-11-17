import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Circle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { Button, cn, Input, PasswordInput, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { GoogleButton } from './GoogleButton';
import { setPendingVerifyEmail } from './pendingVerify';
import { signupSchema, type SignupValues } from './schemas';

interface SignupResponse {
  requiresVerification: true;
  email: string;
}

export function SignupPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    mode: 'onBlur',
    defaultValues: { name: '', email: '', password: '' },
  });

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const passwordValue = watch('password', '');
  const checks = [
    { label: 'At least 8 characters', ok: passwordValue.length >= 8 },
    { label: 'At least one letter', ok: /[A-Za-z]/.test(passwordValue) },
    { label: 'At least one number', ok: /[0-9]/.test(passwordValue) },
  ];

  const onSubmit = async (values: SignupValues) => {
    setServerError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    try {
      const data = await request<SignupResponse>('/auth/signup', {
        method: 'POST',
        body: { ...values, timezone },
        auth: false,
      });
      setPendingVerifyEmail(data.email || values.email);
      toast.show({
        kind: 'success',
        title: 'Verification code sent',
        description: 'Enter the 6-digit code sent to your email.',
      });
      navigate('/verify-email', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_TAKEN') {
          setError('email', { message: 'Email already in use' });
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
        <h1 className="text-2xl sm:text-3xl">Create your account</h1>
        <p className="mt-1 text-sm text-muted">Start learning smarter with LearnSpace.</p>
      </div>

      <GoogleButton label="Sign up with Google" />

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
          label="Full name"
          autoComplete="name"
          placeholder="Awal Sarpong"
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@university.edu"
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="space-y-2">
          <PasswordInput
            label="Password"
            autoComplete="new-password"
            placeholder="Create a strong password"
            error={errors.password?.message}
            {...register('password')}
          />
          <ul className="space-y-1 text-xs" aria-label="Password requirements">
            {checks.map((item) => (
              <li
                key={item.label}
                className={cn(
                  'flex items-center gap-1.5 transition duration-fast',
                  item.ok ? 'text-success' : 'text-muted',
                )}
              >
                {item.ok ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Circle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-medium text-primary-600 hover:underline dark:text-primary-400"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}

