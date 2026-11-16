import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useTheme } from '../../app/ThemeProvider';
import { Button, Card, Checkbox, ErrorState, Input, Skeleton, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';

interface UserSettings {
  theme: 'system' | 'light' | 'dark';
  timezone: string;
  notifyInApp: boolean;
  notifyEmailReminders: boolean;
  notifyProductEmail: boolean;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
}

const COMMON_TIMEZONES = [
  'UTC',
  'Africa/Accra',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
];

export function SettingsPage() {
  const { user } = useAuth();
  const { setPreference } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['users', 'me', 'settings'],
    queryFn: () => request<UserSettings>('/users/me/settings'),
  });

  const [form, setForm] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  if (settingsQuery.isLoading || !form) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (settingsQuery.isError) {
    return (
      <ErrorState
        title="Could not load settings"
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await request<UserSettings>('/users/me/settings', {
        method: 'PATCH',
        body: form,
      });
      setPreference(updated.theme);
      await qc.invalidateQueries({ queryKey: ['users', 'me', 'settings'] });
      toast.show({ kind: 'success', title: 'Settings saved' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not save settings',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-fg">Appearance &amp; timezone</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="setting-theme" className="mb-1.5 block text-sm font-medium text-fg">
              Theme
            </label>
            <select
              id="setting-theme"
              value={form.theme}
              onChange={(e) =>
                setForm({ ...form, theme: e.target.value as UserSettings['theme'] })
              }
              className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div>
            <label htmlFor="setting-tz" className="mb-1.5 block text-sm font-medium text-fg">
              Timezone
            </label>
            <select
              id="setting-tz"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-fg"
            >
              {!COMMON_TIMEZONES.includes(form.timezone) ? (
                <option value={form.timezone}>{form.timezone}</option>
              ) : null}
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-fg">Notifications</h2>
        <Checkbox
          label="In-app task reminders"
          checked={form.notifyInApp}
          onChange={(e) => setForm({ ...form, notifyInApp: e.target.checked })}
        />
        <div>
          <Checkbox
            label="Email reminders for due tasks"
            disabled={!user?.emailVerified}
            checked={form.notifyEmailReminders}
            onChange={(e) => setForm({ ...form, notifyEmailReminders: e.target.checked })}
          />
          {!user?.emailVerified ? (
            <p className="mt-1 pl-6 text-xs text-muted">
              Verify your email address to enable email reminders.
            </p>
          ) : null}
        </div>
        <Checkbox
          label="Product updates & study tips"
          checked={form.notifyProductEmail}
          onChange={(e) => setForm({ ...form, notifyProductEmail: e.target.checked })}
        />
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-fg">Pomodoro timer durations (minutes)</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Focus"
            type="number"
            min={1}
            max={120}
            value={String(form.focusMinutes)}
            onChange={(e) => setForm({ ...form, focusMinutes: Number(e.target.value) || 25 })}
          />
          <Input
            label="Short break"
            type="number"
            min={1}
            max={60}
            value={String(form.shortBreakMinutes)}
            onChange={(e) => setForm({ ...form, shortBreakMinutes: Number(e.target.value) || 5 })}
          />
          <Input
            label="Long break"
            type="number"
            min={1}
            max={90}
            value={String(form.longBreakMinutes)}
            onChange={(e) => setForm({ ...form, longBreakMinutes: Number(e.target.value) || 15 })}
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Save settings
        </Button>
      </div>
    </form>
  );
}

