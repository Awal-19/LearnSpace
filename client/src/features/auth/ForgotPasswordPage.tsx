import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button, Card, Input } from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { forgotPasswordSchema, type ForgotPasswordValues } from './schemas';

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onBlur',
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    setServerError(null);
    try {
      await request('/auth/forgot-password', {
        method: 'POST',
        body: values,
        auth: false,
      });
      setSubmitted(true);
    } catch (err) {
      setServerError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    }
  };

  if (submitted) {
    return (
      <Card className="space-y-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:text-primary-300">
          <MailCheck className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl">Check your inbox</h1>
        <p className="text-sm text-muted">
          If an account exists for that email, we have sent a password reset link. It expires in 1
          hour.
        </p>
        <Link
          to="/login"
          className="inline-block text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
        >
          Back to log in
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">
          Enter your email and we&apos;ll send you a reset link.
        </p>
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
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@university.edu"
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Send reset link
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        Remembered it?{' '}
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
