import { zodResolver } from '@hookform/resolvers/zod';
import { LogOut, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '../../app/AuthContext';
import { Button, Card, Input, Modal, PasswordInput, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be 72 characters or fewer')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export function SecurityTab() {
  const { user, updateUser, clearSession } = useAuth();
  const toast = useToast();
  const [pwError, setPwError] = useState<string | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
  });

  if (!user) return null;
  const hasPassword = user.hasPassword !== false;

  const onChangePassword = async (values: ChangePasswordValues) => {
    setPwError(null);
    if (hasPassword && !values.currentPassword?.trim()) {
      setPwError('Enter your current password');
      return;
    }

    try {
      await request<void>('/users/me/change-password', {
        method: 'POST',
        cookie: true,
        body: {
          ...(hasPassword ? { currentPassword: values.currentPassword } : {}),
          newPassword: values.newPassword,
        },
      });
      if (!hasPassword) {
        updateUser({ ...user, hasPassword: true });
      }
      reset();
      toast.show({
        kind: 'success',
        title: hasPassword ? 'Password changed' : 'Password set',
        description: 'Other active sessions have been signed out.',
      });
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Could not change password.');
    }
  };

  const handleLogoutAll = async () => {
    setLoggingOutAll(true);
    try {
      await request<void>('/auth/logout-all', { method: 'POST' });
      clearSession();
      toast.show({ kind: 'info', title: 'Signed out of all devices' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Error',
        description: err instanceof ApiError ? err.message : 'Could not sign out all sessions.',
      });
    } finally {
      setLoggingOutAll(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    if (hasPassword && !deleteInput) {
      setDeleteError('Enter your password to confirm.');
      return;
    }
    if (!hasPassword && deleteInput !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.');
      return;
    }

    setDeleting(true);
    try {
      await request<void>('/users/me', {
        method: 'DELETE',
        body: hasPassword ? { password: deleteInput } : { confirm: 'DELETE' },
      });
      setDeleteOpen(false);
      clearSession();
      toast.show({ kind: 'info', title: 'Your account has been deleted' });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          {hasPassword ? 'Change password' : 'Set a password'}
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {hasPassword
            ? 'Changing your password signs out all other devices.'
            : 'You signed up with Google. Add a password if you also want to log in with email.'}
        </p>

        <form onSubmit={handleSubmit(onChangePassword)} className="mt-5 max-w-md space-y-4" noValidate>
          {pwError ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            >
              {pwError}
            </div>
          ) : null}

          {hasPassword ? (
            <PasswordInput
              label="Current password"
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              {...register('currentPassword')}
            />
          ) : null}

          <PasswordInput
            label="New password"
            autoComplete="new-password"
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />

          <PasswordInput
            label="Confirm new password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <Button type="submit" loading={isSubmitting}>
            {hasPassword ? 'Update password' : 'Set password'}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              Active sessions
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Sign out from every browser and device where your account is logged in.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            loading={loggingOutAll}
            onClick={handleLogoutAll}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out everywhere
          </Button>
        </div>
      </Card>

      <Card className="border-red-200 p-6 dark:border-red-900/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-red-700 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              Danger zone
            </h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Permanently delete your account, notes, chats, flashcards, and study history. This cannot be undone.
            </p>
          </div>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              setDeleteInput('');
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            Delete account
          </Button>
        </div>
      </Card>

      <Modal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Delete your account?"
      >
        <div className="p-5 pt-3 sm:p-6 sm:pt-3 space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            This permanently deletes your profile and all your study data.
          </p>

          {deleteError ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            >
              {deleteError}
            </div>
          ) : null}

          {hasPassword ? (
            <PasswordInput
              label="Enter your password to confirm"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
            />
          ) : (
            <Input
              label='Type "DELETE" to confirm'
              placeholder="DELETE"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="danger" loading={deleting} onClick={handleDeleteAccount}>
              Permanently delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

