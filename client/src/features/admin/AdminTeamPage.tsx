import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { Badge, Button, Card, Input, Modal, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  fetchAdminTeam,
  forceLogoutAdminUser,
  inviteAdminMember,
  revokeAdminInvite,
  triggerAdminUserReset,
  updateAdminPermissions,
  updateAdminUserRole,
  updateAdminUserStatus,
  type AdminPermissions,
  type AdminTeamMember,
} from './adminApi';
import { StepUpModal, SuperAdminGate } from './StepUpModal';

const PERMISSION_LABELS: Array<{ key: keyof AdminPermissions; label: string }> = [
  { key: 'can_manage_users', label: 'Manage users' },
  { key: 'can_moderate_content', label: 'Moderate content' },
  { key: 'can_view_ai_usage', label: 'View AI usage' },
  { key: 'can_send_announcements', label: 'Send announcements' },
  { key: 'can_export_data', label: 'Export data' },
];

export function AdminTeamPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'super_admin'>('admin');
  const [invitePerms, setInvitePerms] = useState<AdminPermissions>({
    can_manage_users: true,
    can_moderate_content: true,
    can_view_ai_usage: true,
    can_send_announcements: true,
    can_export_data: true,
  });

  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  const isSuper = user?.role === 'super_admin';

  const teamQuery = useQuery({
    queryKey: ['admin', 'super', 'team'],
    queryFn: fetchAdminTeam,
    enabled: isSuper,
    staleTime: 15_000,
  });

  if (!isSuper) {
    return (
      <Card className="p-6 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-danger" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold">Super Admin Access Required</h1>
        <p className="mt-1 text-sm text-muted">
          Only a super_admin can manage admin accounts and permissions.
        </p>
      </Card>
    );
  }

  const runWithStepUp = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 403 &&
        err.message.toLowerCase().includes('step-up')
      ) {
        setPendingAction(() => fn);
        setStepUpOpen(true);
        return;
      }
      toast.show({
        kind: 'error',
        title: 'Action failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    await runWithStepUp(async () => {
      await inviteAdminMember({
        email: inviteEmail.trim(),
        role: inviteRole,
        permissions: invitePerms,
      });
      toast.show({ kind: 'success', title: 'Admin invite sent (expires in 24h)' });
      setInviteEmail('');
      setInviteOpen(false);
      await qc.invalidateQueries({ queryKey: ['admin', 'super', 'team'] });
    });
  };

  const togglePermission = async (member: AdminTeamMember, key: keyof AdminPermissions) => {
    const next = { ...member.permissions, [key]: member.permissions[key] === false };
    await runWithStepUp(async () => {
      await updateAdminPermissions(member.id, next, `Toggled ${key}`);
      toast.show({ kind: 'success', title: 'Permissions updated' });
      await qc.invalidateQueries({ queryKey: ['admin', 'super', 'team'] });
    });
  };

  const handleRoleToggle = async (
    member: AdminTeamMember,
    nextRole: 'student' | 'admin' | 'super_admin',
  ) => {
    if (!window.confirm(`Change ${member.email}'s role to ${nextRole}?`)) return;
    await runWithStepUp(async () => {
      await updateAdminUserRole(member.id, nextRole, `Changed via Team / Admins`);
      toast.show({ kind: 'success', title: `Role updated to ${nextRole}` });
      await qc.invalidateQueries({ queryKey: ['admin', 'super', 'team'] });
    });
  };

  const members = teamQuery.data?.members ?? [];
  const invites = teamQuery.data?.invites ?? [];

  return (
    <SuperAdminGate>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
                Team &amp; Admins
              </h1>
              <p className="mt-0.5 text-sm text-muted">
                Manage administrator accounts, 24-hour invites, and granular permissions.
              </p>
            </div>
          </div>
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Invite Admin
          </Button>
        </div>

        {teamQuery.isLoading ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : (
          <Card className="overflow-hidden !p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-surface2/70 text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3">Admin</th>
                    <th className="px-4 py-3">Role &amp; Status</th>
                    <th className="px-4 py-3">Last Login / IP</th>
                    <th className="px-4 py-3">Actions Taken</th>
                    <th className="px-4 py-3">Permissions</th>
                    <th className="px-4 py-3 text-right">Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {members.map((m) => {
                    const isSelf = m.id === user?.id;
                    return (
                      <tr key={m.id} className="align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium text-fg">{m.name}</p>
                          <p className="text-xs text-muted">{m.email}</p>
                        </td>
                        <td className="px-4 py-3 space-y-1">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge tone={m.role === 'super_admin' ? 'primary' : 'neutral'}>
                              {m.role}
                            </Badge>
                            <Badge tone={m.status === 'active' ? 'success' : 'danger'}>
                              {m.status}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          <p>
                            {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : 'Never'}
                          </p>
                          <p>{m.lastLoginIp ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{m.actionsCount}</td>
                        <td className="px-4 py-3">
                          {m.role === 'super_admin' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-primary-600">
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              Full access
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {PERMISSION_LABELS.map(({ key, label }) => {
                                const enabled = m.permissions[key] !== false;
                                return (
                                  <button
                                    key={key}
                                    type="button"
                                    onClick={() => void togglePermission(m, key)}
                                    className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                                      enabled
                                        ? 'border-primary-500/40 bg-primary-500/10 text-primary-600'
                                        : 'border-line bg-surface2 text-muted line-through'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isSelf ? (
                            <span className="text-xs text-muted">Current account</span>
                          ) : (
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  void handleRoleToggle(
                                    m,
                                    m.role === 'admin' ? 'super_admin' : 'admin',
                                  )
                                }
                              >
                                {m.role === 'admin' ? 'Promote' : 'Demote'}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  void runWithStepUp(async () => {
                                    await updateAdminUserStatus(
                                      m.id,
                                      m.status === 'active' ? 'suspended' : 'active',
                                      'Updated from Team / Admins',
                                    );
                                    await qc.invalidateQueries({
                                      queryKey: ['admin', 'super', 'team'],
                                    });
                                  })
                                }
                              >
                                {m.status === 'active' ? 'Suspend' : 'Reactivate'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  void runWithStepUp(async () => {
                                    await forceLogoutAdminUser(m.id);
                                    toast.show({ kind: 'success', title: 'Sessions revoked' });
                                  })
                                }
                              >
                                Force logout
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  void runWithStepUp(async () => {
                                    await triggerAdminUserReset(m.id);
                                    toast.show({ kind: 'success', title: 'Password reset sent' });
                                  })
                                }
                              >
                                Reset PW
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => void handleRoleToggle(m, 'student')}
                              >
                                Remove access
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {invites.length > 0 && (
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Pending Admin Invites</h2>
            <div className="divide-y divide-line text-sm">
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-medium">{inv.email}</span>{' '}
                    <Badge tone="neutral">{inv.role}</Badge>
                    <p className="text-xs text-muted">
                      Expires {new Date(inv.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void runWithStepUp(async () => {
                        await revokeAdminInvite(inv.id);
                        await qc.invalidateQueries({ queryKey: ['admin', 'super', 'team'] });
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Modal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          title="Invite Admin"
          className="max-w-md"
        >
          <form onSubmit={handleInvite} className="space-y-4 p-5 pt-3">
            <Input
              label="Email address"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@ug.edu.gh"
              required
            />
            <div>
              <label htmlFor="invite-role" className="mb-1.5 block text-xs font-medium text-muted">
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'super_admin')}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg"
              >
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            {inviteRole === 'admin' && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted">Granular Permissions</p>
                {PERMISSION_LABELS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={invitePerms[key] !== false}
                      onChange={(e) => setInvitePerms((p) => ({ ...p, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Send 24h Invite</Button>
            </div>
          </form>
        </Modal>

        <StepUpModal
          open={stepUpOpen}
          onClose={() => setStepUpOpen(false)}
          onVerified={async () => {
            if (pendingAction) {
              const fn = pendingAction;
              setPendingAction(null);
              await runWithStepUp(fn);
            }
          }}
        />
      </div>
    </SuperAdminGate>
  );
}
