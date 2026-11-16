import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorState, PasswordInput, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { resetPasswordSchema, type ResetPasswordValues } from './schemas';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onBlur',
    defaultValues: { password: '', confirmPassword: '' },
  });

  if (!token) {
    return (
      <ErrorState
        title="Invalid reset link"
        message="This password reset link is missing a token. Request a new one."
        onRetry={() => navigate('/forgot-password')}
      />
    );
  }

  const onSubmit = async (values: ResetPasswordValues) => {
    setServerError(null);
    try {
      await request('/auth/reset-password', {
        method: 'POST',
        body: { token, password: values.password },
        auth: false,
      });
      toast.show({
        kind: 'success',
        title: 'Password updated',
        description: 'You can now log in with your new password.',
      });
      navigate('/login', { replace: true });
    } catch (err) {
      setServerError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted">Your old sessions will be signed out.</p>
      </div>

      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          hint="At least 8 characters with a letter and a number."
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordInput
          label="Confirm password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Update password
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        <Link
          to="/login"
          className="font-medium text-primary-600 hover:underline dark:text-primary-400"
        >
          Back to log in
        </Link>
      </p>
    </div>
  );
}

