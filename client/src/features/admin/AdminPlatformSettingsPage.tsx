import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { Badge, Button, Card, Input, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  fetchPlatformSettings,
  rollbackPlatformSettings,
  updatePlatformSettings,
  type PlatformSettings,
} from './adminApi';
import { StepUpModal, SuperAdminGate } from './StepUpModal';

export function AdminPlatformSettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState<Partial<PlatformSettings>>({});
  const [allowlistText, setAllowlistText] = useState('');
  const [reason, setReason] = useState('');
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const isSuper = user?.role === 'super_admin';

  const settingsQuery = useQuery({
    queryKey: ['admin', 'super', 'settings'],
    queryFn: fetchPlatformSettings,
    enabled: isSuper,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!settingsQuery.data?.settings) return;
    const s = settingsQuery.data.settings;
    setForm(s);
    setAllowlistText((s.maintenanceAllowlistJson ?? []).join(', '));
  }, [settingsQuery.data?.settings]);

  if (!isSuper) {
    return (
      <Card className="p-6 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-danger" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold">Super Admin Access Required</h1>
        <p className="mt-1 text-sm text-muted">
          Only a super_admin can modify platform security, AI caps, and feature policies.
        </p>
      </Card>
    );
  }

  const runWithStepUp = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.message.toLowerCase().includes('step-up')) {
        setPendingAction(() => fn);
        setStepUpOpen(true);
        return;
      }
      toast.show({
        kind: 'error',
        title: 'Save failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const allowlist = allowlistText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await runWithStepUp(async () => {
      await updatePlatformSettings({
        featureChat: form.featureChat,
        featureUploads: form.featureUploads,
        featureDocuments: form.featureDocuments,
        featureSignups: form.featureSignups,
        featureGoogleLogin: form.featureGoogleLogin,
        maintenanceMode: form.maintenanceMode,
        maintenanceMessage: form.maintenanceMessage,
        maintenanceAllowlistJson: allowlist,
        dailyMessageLimit: form.dailyMessageLimit,
        maxUploadBytes: form.maxUploadBytes,
        dailyUploadQuota: form.dailyUploadQuota,
        dailyCostAlertUsd: form.dailyCostAlertUsd,
        monthlyCostCapUsd: form.monthlyCostCapUsd,
        sessionLifetimeMinutes: form.sessionLifetimeMinutes,
        minPasswordLength: form.minPasswordLength,
        requireEmailVerification: form.requireEmailVerification,
        requireAdminOtp: form.requireAdminOtp,
        maxLoginAttempts: form.maxLoginAttempts,
        lockoutMinutes: form.lockoutMinutes,
        aiModel: form.aiModel,
        aiSystemPromptVersion: form.aiSystemPromptVersion,
        aiMaxTokens: form.aiMaxTokens,
        reason: reason.trim() || undefined,
      });
      setReason('');
      toast.show({ kind: 'success', title: 'Platform settings saved (new version created)' });
      await qc.invalidateQueries({ queryKey: ['admin', 'super', 'settings'] });
    });
  };

  const handleRollback = async (version: number) => {
    if (!window.confirm(`Roll back platform settings to version v${version}?`)) return;
    await runWithStepUp(async () => {
      await rollbackPlatformSettings(version, `Manual rollback to v${version}`);
      toast.show({ kind: 'success', title: `Rolled back to v${version}` });
      await qc.invalidateQueries({ queryKey: ['admin', 'super', 'settings'] });
    });
  };

  if (settingsQuery.isLoading || !settingsQuery.data) {
    return <Skeleton className="h-96" />;
  }

  const { versions, monthlyAiSpendUsd, aiApiConfigured } = settingsQuery.data;

  return (
    <SuperAdminGate>
      <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
              Platform Settings (Super Admin)
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Versioned security, AI cost-cap, maintenance, and feature controls.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={aiApiConfigured ? 'success' : 'warning'}>
            AI Provider: {aiApiConfigured ? 'Configured' : 'Unconfigured'}
          </Badge>
          <Badge tone="neutral">
            Month Spend: ${monthlyAiSpendUsd.toFixed(2)} / ${(form.monthlyCostCapUsd ?? 100).toFixed(2)}
          </Badge>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold">Feature Toggles &amp; Maintenance</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            {(
              [
                ['featureChat', 'AI Chat'],
                ['featureUploads', 'File & Image Uploads'],
                ['featureDocuments', 'Document Study Tools'],
                ['featureSignups', 'New Sign-ups'],
                ['featureGoogleLogin', 'Google Login'],
                ['maintenanceMode', 'Maintenance Mode'],
              ] as Array<[keyof PlatformSettings, string]>
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-lg border border-line p-3">
                <input
                  type="checkbox"
                  checked={Boolean(form[key])}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Maintenance banner message"
              value={form.maintenanceMessage ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, maintenanceMessage: e.target.value }))}
            />
            <Input
              label="Maintenance email allow-list (comma-separated)"
              value={allowlistText}
              onChange={(e) => setAllowlistText(e.target.value)}
              placeholder="admin1@ug.edu.gh, admin2@ug.edu.gh"
            />
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold">Security Policy</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Session lifetime (minutes)"
              type="number"
              value={String(form.sessionLifetimeMinutes ?? 10080)}
              onChange={(e) =>
                setForm((f) => ({ ...f, sessionLifetimeMinutes: Number(e.target.value) }))
              }
            />
            <Input
              label="Minimum password length"
              type="number"
              value={String(form.minPasswordLength ?? 8)}
              onChange={(e) =>
                setForm((f) => ({ ...f, minPasswordLength: Number(e.target.value) }))
              }
            />
            <Input
              label="Max login attempts"
              type="number"
              value={String(form.maxLoginAttempts ?? 5)}
              onChange={(e) =>
                setForm((f) => ({ ...f, maxLoginAttempts: Number(e.target.value) }))
              }
            />
            <Input
              label="Lockout duration (minutes)"
              type="number"
              value={String(form.lockoutMinutes ?? 15)}
              onChange={(e) => setForm((f) => ({ ...f, lockoutMinutes: Number(e.target.value) }))}
            />
            <label className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form.requireEmailVerification)}
                onChange={(e) =>
                  setForm((f) => ({ ...f, requireEmailVerification: e.target.checked }))
                }
              />
              Require email verification
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form.requireAdminOtp)}
                onChange={(e) => setForm((f) => ({ ...f, requireAdminOtp: e.target.checked }))}
              />
              Require OTP for admin login
            </label>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="text-sm font-semibold">AI Model &amp; Global Limits</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="AI Model"
              value={form.aiModel ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, aiModel: e.target.value }))}
            />
            <Input
              label="System Prompt Version"
              value={form.aiSystemPromptVersion ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, aiSystemPromptVersion: e.target.value }))}
            />
            <Input
              label="AI Max Tokens"
              type="number"
              value={String(form.aiMaxTokens ?? 2048)}
              onChange={(e) => setForm((f) => ({ ...f, aiMaxTokens: Number(e.target.value) }))}
            />
            <Input
              label="Daily AI Message Limit"
              type="number"
              value={String(form.dailyMessageLimit ?? 100)}
              onChange={(e) =>
                setForm((f) => ({ ...f, dailyMessageLimit: Number(e.target.value) }))
              }
            />
            <Input
              label="Daily Upload Quota"
              type="number"
              value={String(form.dailyUploadQuota ?? 50)}
              onChange={(e) =>
                setForm((f) => ({ ...f, dailyUploadQuota: Number(e.target.value) }))
              }
            />
            <Input
              label="Monthly AI Cost Cap (USD)"
              type="number"
              step="0.5"
              value={String(form.monthlyCostCapUsd ?? 100)}
              onChange={(e) =>
                setForm((f) => ({ ...f, monthlyCostCapUsd: Number(e.target.value) }))
              }
            />
          </div>
          <Input
            label="Change reason (recorded in version history & audit log)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Tighten login lockout policy"
          />
          <div className="flex justify-end">
            <Button type="submit">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save Platform Settings
            </Button>
          </div>
        </Card>
      </form>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Settings Version History</h2>
        </div>
        {versions.length === 0 ? (
          <p className="text-xs text-muted">No saved setting versions yet.</p>
        ) : (
          <div className="divide-y divide-line text-sm">
            {versions.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <span className="font-medium">v{v.version}</span>{' '}
                  <span className="text-xs text-muted">
                    — {new Date(v.createdAt).toLocaleString()}
                  </span>
                  {v.reason ? <p className="text-xs text-muted">{v.reason}</p> : null}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleRollback(v.version)}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Rollback
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

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

