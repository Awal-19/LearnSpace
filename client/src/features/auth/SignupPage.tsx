import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, Circle, Lock, Mail, User } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { Button, cn, Input, PasswordInput, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { LegalDocumentModal } from '../legal/LegalDocumentModal';
import type { LegalDocumentKind } from '../legal/legalContent';
import { GoogleButton } from './GoogleButton';
import { setPendingVerifyEmail } from './pendingVerify';
import { signupSchema, type SignupValues } from './schemas';

interface ValidationIssue {
  path?: string;
  message?: string;
}

interface SignupResponse {
  requiresVerification?: boolean;
  email?: string;
  verificationToken?: string;
}

export function SignupPage() {
  const { status, user, setPendingVerification } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const termsCheckboxId = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocumentKind | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    mode: 'onBlur',
    defaultValues: { name: '', email: '', password: '', acceptTerms: false },
  });

  if (status === 'authenticated') {
    return <Navigate to={user?.emailVerified ? '/' : '/verify-email'} replace />;
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
      const targetEmail = data.email || values.email;
      setPendingVerifyEmail(targetEmail);
      setPendingVerification?.(targetEmail, data.verificationToken);
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
          return;
        }
        if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
          const issues = err.details as ValidationIssue[];
          const termsIssue = issues.find((issue) => issue.path === 'acceptTerms');
          if (termsIssue?.message) {
            setError('acceptTerms', { message: termsIssue.message });
          }
          const firstOther = issues.find((issue) => issue.path !== 'acceptTerms');
          if (firstOther?.message) {
            setServerError(firstOther.message);
          } else if (!termsIssue) {
            setServerError(err.message);
          }
          return;
        }
        setServerError(err.message);
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-muted">Start learning smarter with LearnSpace.</p>
      </div>

      <GoogleButton label="Sign up with Google" />

      {serverError && (
        <div
          role="alert"
          className="rounded-xl border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Input
          label="Full name"
          autoComplete="name"
          placeholder="Awal Sarpong"
          leftIcon={<User className="h-4 w-4" />}
          className="rounded-full border-white/95 bg-white/80 pr-4 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-surface2/60"
          error={errors.name?.message}
          {...register('name')}
        />

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

        <div className="space-y-2">
          <PasswordInput
            label="Password"
            autoComplete="new-password"
            placeholder="Create a strong password"
            leftIcon={<Lock className="h-4 w-4" />}
            className="rounded-full border-white/95 bg-white/80 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-surface2/60"
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

        <div className="space-y-1.5 pt-0.5">
          <div
            className={cn(
              'flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 transition-colors',
              errors.acceptTerms
                ? 'border-danger/60 bg-danger/5'
                : 'border-white/80 bg-white/65 dark:border-white/10 dark:bg-surface2/50',
            )}
          >
            <input
              id={termsCheckboxId}
              type="checkbox"
              aria-invalid={Boolean(errors.acceptTerms)}
              aria-describedby={errors.acceptTerms ? `${termsCheckboxId}-error` : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line bg-surface accent-primary-600 text-primary-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              {...register('acceptTerms')}
            />
            <label
              htmlFor={termsCheckboxId}
              className="cursor-pointer select-none text-[13px] leading-relaxed text-fg/90"
            >
              I agree to the{' '}
              <a
                href="/terms-and-conditions"
                onClick={(event) => {
                  if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    setActiveLegalDoc('terms');
                  }
                }}
                className="font-medium text-primary-600 underline decoration-primary-300 underline-offset-2 transition-colors hover:text-primary-700 hover:decoration-primary-600 dark:text-primary-400 dark:decoration-primary-500/50 dark:hover:text-primary-300"
              >
                Terms and Conditions
              </a>{' '}
              and{' '}
              <a
                href="/privacy-policy"
                onClick={(event) => {
                  if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    setActiveLegalDoc('privacy');
                  }
                }}
                className="font-medium text-primary-600 underline decoration-primary-300 underline-offset-2 transition-colors hover:text-primary-700 hover:decoration-primary-600 dark:text-primary-400 dark:decoration-primary-500/50 dark:hover:text-primary-300"
              >
                Privacy Policy
              </a>
              .
            </label>
          </div>
          {errors.acceptTerms?.message ? (
            <p
              id={`${termsCheckboxId}-error`}
              role="alert"
              className="text-xs font-medium text-danger"
            >
              {errors.acceptTerms.message}
            </p>
          ) : null}
        </div>

        <div className="pt-1">
          <Button
            type="submit"
            size="lg"
            loading={isSubmitting}
            className="h-11 w-full rounded-full bg-gradient-to-r from-primary-600 via-primary-600 to-primary-500 text-sm font-medium shadow-[0_10px_24px_rgba(37,99,235,0.32)] hover:brightness-105"
          >
            Create account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </form>

      <p className="text-center text-[13px] text-muted">
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-medium text-primary-600 transition-colors hover:text-primary-700 hover:underline dark:text-primary-400 dark:hover:text-primary-300"
        >
          Log in
        </Link>
      </p>

      <LegalDocumentModal
        kind={activeLegalDoc}
        onClose={() => setActiveLegalDoc(null)}
        onSwitchDocument={setActiveLegalDoc}
      />
    </div>
  );
}
