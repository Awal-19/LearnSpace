import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, LogOut, Mail, Shield, Trash2, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { Avatar, Badge, Button, GlassCard, Skeleton, useToast, VerifiedBadge } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { StepUpModal } from './StepUpModal';
import {
  deleteAdminUser,
  fetchAdminUserDetail,
  forceLogoutAdminUser,
  markAdminUserVerified,
  resendAdminUserVerification,
  triggerAdminUserReset,
  updateAdminUserRole,
  updateAdminUserStatus,
} from './adminApi';

export function AdminUserDetailPage() {
  const { userId = '' } = useParams<{ userId: string }>();
  const { user: actor } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => fetchAdminUserDetail(userId),
    enabled: Boolean(userId),
  });

  if (query.isLoading) return <Skeleton className="h-64" />;
  if (query.isError || !query.data) {
    return (
      <GlassCard className="p-6 text-center">
        <p className="text-sm text-danger">User not found.</p>
        <Link
          to="/admin/users"
          className="mt-3 inline-block text-sm text-primary-600 hover:underline"
        >
          Back to users
        </Link>
      </GlassCard>
    );
  }

  const { user, stats, lastEmailDelivery, recentActivity, recentLogins } = query.data;
  const isSuperAdmin = actor?.role === 'super_admin';

  const runAction = async (fn: () => Promise<unknown>, successMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.show({ kind: 'success', title: successMsg });
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
      ]);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 403 &&
        err.message.toLowerCase().includes('step-up')
      ) {
        setPendingAction(() => async () => {
          await runAction(fn, successMsg);
        });
        setStepUpOpen(true);
        return;
      }
      toast.show({
        kind: 'error',
        title: 'Action failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSuspendToggle = async () => {
    const nextStatus = user.status === 'active' ? 'suspended' : 'active';
    const reason =
      nextStatus === 'suspended'
        ? (window.prompt('Reason for suspension (optional):') ?? undefined)
        : undefined;
    if (nextStatus === 'suspended' && !window.confirm(`Suspend ${user.email}?`)) return;
    await runAction(
      () => updateAdminUserStatus(user.id, nextStatus, reason),
      nextStatus === 'suspended' ? 'User suspended' : 'User reactivated',
    );
  };

  const handleRoleChange = async (nextRole: 'student' | 'admin' | 'super_admin') => {
    if (!window.confirm(`Change ${user.email} role to ${nextRole}?`)) return;
    await runAction(() => updateAdminUserRole(user.id, nextRole), `Role updated to ${nextRole}`);
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Permanently delete ${user.email} and ALL of their data? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteAdminUser(user.id);
      toast.show({ kind: 'success', title: 'User account deleted' });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
        queryClient.removeQueries({ queryKey: ['admin', 'user', user.id] }),
      ]);
      navigate('/admin/users', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast.show({ kind: 'info', title: 'User was already deleted' });
        await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
        navigate('/admin/users', { replace: true });
        return;
      }
      toast.show({
        kind: 'error',
        title: 'Delete failed',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1.5 rounded-xl border border-line/80 bg-surface px-3 py-1.5 text-sm font-medium text-muted shadow-sm transition-colors hover:bg-surface2 hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to users
      </Link>

      <GlassCard className="border-primary-200/80 bg-gradient-to-br from-primary-50/90 via-[rgb(var(--glass-bg))] to-sky-50/70 p-5 dark:border-primary-500/20 dark:from-primary-600/15 dark:via-[rgb(var(--glass-bg))] dark:to-sky-500/10 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar name={user.name} src={user.avatarUrl} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="inline-flex items-center gap-1.5 font-display text-xl font-bold text-fg">
                  <span>{user.name}</span>
                  {user.emailVerified ? <VerifiedBadge /> : null}
                </h1>
                <Badge tone="neutral">{user.role}</Badge>
                <Badge tone={user.status === 'active' ? 'success' : 'danger'}>{user.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{user.email}</p>
              <p className="mt-1 text-xs text-muted">
                {user.programme ?? 'No programme'} · {user.level ?? 'No level'} · Sign-in:{' '}
                {user.authMethod} · Joined {new Date(user.createdAt).toLocaleDateString()}
              </p>
              {user.suspendedReason ? (
                <p className="mt-2 text-xs text-danger">
                  Suspension reason: {user.suspendedReason}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void handleSuspendToggle()}
            >
              {user.status === 'active' ? (
                <>
                  <UserX className="mr-1.5 h-3.5 w-3.5" />
                  Suspend
                </>
              ) : (
                <>
                  <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                  Reactivate
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runAction(() => forceLogoutAdminUser(user.id), 'Sessions revoked')
              }
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Force logout
            </Button>
            {!user.emailVerified ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`Send a new 6-digit verification code to ${user.email}?`)) {
                      return;
                    }
                    void (async () => {
                      setBusy(true);
                      try {
                        const res = await resendAdminUserVerification(user.id);
                        toast.show({
                          kind: 'success',
                          title: `Code sent to ${res.maskedEmail}`,
                        });
                        await query.refetch();
                      } catch (err) {
                        toast.show({
                          kind: 'error',
                          title: 'Could not send verification code',
                          description: err instanceof ApiError ? err.message : 'Try again.',
                        });
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  Resend verify
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt(
                      `Enter a reason to mark ${user.email} as verified (min 5 characters):`,
                    );
                    if (!reason || reason.trim().length < 5) {
                      if (reason !== null) {
                        toast.show({
                          kind: 'error',
                          title: 'Reason required',
                          description: 'Provide at least 5 characters.',
                        });
                      }
                      return;
                    }
                    void runAction(
                      () => markAdminUserVerified(user.id, reason.trim()),
                      'User email marked as verified',
                    );
                  }}
                >
                  <Shield className="mr-1.5 h-3.5 w-3.5" />
                  Mark verified
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void runAction(() => triggerAdminUserReset(user.id), 'Password reset email sent')
              }
            >
              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              Trigger reset
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void handleDelete()}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>

        {isSuperAdmin && user.id !== actor?.id ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
            <Shield className="h-4 w-4 text-primary-600" />
            <span className="font-medium">Change role (Super Admin):</span>
            {(['student', 'admin', 'super_admin'] as const).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={user.role === r ? 'primary' : 'secondary'}
                disabled={busy || user.role === r}
                onClick={() => void handleRoleChange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        ) : null}
      </GlassCard>

      {lastEmailDelivery ? (
        <GlassCard className="p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary-600" aria-hidden="true" />
              <span className="font-medium">Last Email Delivery:</span>
              <Badge tone={lastEmailDelivery.status === 'sent' ? 'success' : 'danger'}>
                {lastEmailDelivery.status}
              </Badge>
              <span className="text-xs text-muted">
                {lastEmailDelivery.provider} · {lastEmailDelivery.kind}
              </span>
            </div>
            <span className="text-xs text-muted">
              {new Date(lastEmailDelivery.createdAt).toLocaleString()}
            </span>
          </div>
          {lastEmailDelivery.errorMessage ? (
            <p className="mt-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
              {lastEmailDelivery.errorMessage}
            </p>
          ) : null}
        </GlassCard>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'AI messages', value: stats.aiMessages },
          { label: 'Uploads', value: stats.uploads },
          { label: 'Notes', value: stats.notes },
          { label: 'Quizzes', value: stats.quizzesTaken },
          { label: 'Study hours', value: stats.studyHours },
          { label: 'Streak (days)', value: stats.streak },
        ].map((s) => (
          <GlassCard
            key={s.label}
            className="p-4 transition-all duration-base ease-soft hover:-translate-y-0.5 hover:shadow-lg"
          >
            <p className="text-xs font-medium text-muted">{s.label}</p>
            <p className="mt-1.5 font-display text-2xl font-bold text-fg tabular-nums">{s.value}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="font-display text-base font-semibold">Recent Activity Timeline</h2>
          {recentActivity.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No activity events recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {recentActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <span className="capitalize font-medium">{a.action}</span>
                  <span className="text-xs text-muted">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="font-display text-base font-semibold">Login History</h2>
          {recentLogins.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No login events recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {recentLogins.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="capitalize font-medium">{l.method}</span> ·{' '}
                    <Badge tone={l.success ? 'success' : 'danger'}>
                      {l.success ? 'Success' : 'Failed'}
                    </Badge>
                    {l.suspicious ? <Badge tone="warning">Suspicious</Badge> : null}
                    <p className="text-xs text-muted">{l.ip ?? 'unknown IP'}</p>
                  </div>
                  <span className="text-xs text-muted">
                    {new Date(l.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      <StepUpModal
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setPendingAction(null);
        }}
        onVerified={async () => {
          const fn = pendingAction;
          setPendingAction(null);
          if (fn) await fn();
        }}
      />
    </div>
  );
}
