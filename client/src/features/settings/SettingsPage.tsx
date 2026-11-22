import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Download, GraduationCap, Palette, ShieldCheck, Timer } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useTheme } from '../../app/ThemeProvider';
import { Button, Card, Checkbox, ErrorState, Input, Skeleton, useToast } from '../../design';
import { ApiError, downloadFile, request } from '../../lib/apiClient';
import {
  fetchCommunityNotifPrefs,
  updateCommunityNotifPrefs,
  type CommunityNotificationPrefs,
} from '../community/communityApi';

interface UserSettings {
  theme: 'system' | 'light' | 'dark';
  timezone: string;
  notifyInApp: boolean;
  notifyEmailReminders: boolean;
  notifyProductEmail: boolean;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  classReminderMinutes: number;
  examReminderMinutes?: number;
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
  const { user, updateUser } = useAuth();
  const { setPreference } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['users', 'me', 'settings'],
    queryFn: () => request<UserSettings>('/users/me/settings'),
  });

  const commPrefsQuery = useQuery({
    queryKey: ['community', 'notif-prefs'],
    queryFn: fetchCommunityNotifPrefs,
  });

  const [form, setForm] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [learnerType, setLearnerType] = useState<'university' | 'shs'>(
    user?.learnerType ?? 'university',
  );
  const [schoolYear, setSchoolYear] = useState<string>(user?.schoolYear ?? 'SHS 1');
  const [schoolName, setSchoolName] = useState<string>(user?.schoolName ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  useEffect(() => {
    if (user) {
      setLearnerType(user.learnerType ?? 'university');
      setSchoolYear(user.schoolYear ?? 'SHS 1');
      setSchoolName(user.schoolName ?? '');
    }
  }, [user]);

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
      <ErrorState title="Could not load settings" onRetry={() => void settingsQuery.refetch()} />
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
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['users', 'me', 'settings'] }),
        qc.invalidateQueries({ queryKey: ['timetable'] }),
        qc.invalidateQueries({ queryKey: ['exams'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
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
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Personalize your theme, timezone, study reminders, and Pomodoro timer defaults.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/10 text-primary-600 dark:text-primary-400">
            <Palette className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-base font-semibold text-fg">Appearance &amp; timezone</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="setting-theme" className="mb-1.5 block text-sm font-medium text-fg">
              Theme
            </label>
            <select
              id="setting-theme"
              value={form.theme}
              onChange={(e) => setForm({ ...form, theme: e.target.value as UserSettings['theme'] })}
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
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
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
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
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-base font-semibold text-fg">Notifications</h2>
        </div>
        <Checkbox
          label="In-app task & class reminders"
          checked={form.notifyInApp}
          onChange={(e) => setForm({ ...form, notifyInApp: e.target.checked })}
        />
        <div>
          <Checkbox
            label="Email reminders for due tasks & upcoming classes"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="setting-class-reminder"
              className="mb-1.5 block text-sm font-medium text-fg"
            >
              Default class reminder lead time
            </label>
            <select
              id="setting-class-reminder"
              value={String(form.classReminderMinutes ?? 15)}
              onChange={(e) => setForm({ ...form, classReminderMinutes: Number(e.target.value) })}
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            >
              <option value="0">At class start time</option>
              <option value="5">5 minutes before</option>
              <option value="10">10 minutes before</option>
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="setting-exam-reminder"
              className="mb-1.5 block text-sm font-medium text-fg"
            >
              Default exam reminder lead time
            </label>
            <select
              id="setting-exam-reminder"
              value={String(form.examReminderMinutes ?? 1440)}
              onChange={(e) => setForm({ ...form, examReminderMinutes: Number(e.target.value) })}
              className="h-10 w-full rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            >
              <option value="0">Off</option>
              <option value="60">1 hour before</option>
              <option value="720">12 hours before</option>
              <option value="1440">1 day before</option>
              <option value="4320">3 days before</option>
              <option value="10080">7 days before</option>
            </select>
          </div>
        </div>
        <Checkbox
          label="Product updates & study tips"
          checked={form.notifyProductEmail}
          onChange={(e) => setForm({ ...form, notifyProductEmail: e.target.checked })}
        />
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Timer className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="text-base font-semibold text-fg">Pomodoro timer durations (minutes)</h2>
        </div>
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

      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/10 text-primary-600 dark:text-primary-400">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-fg">Community Notifications</h2>
            <p className="text-xs text-muted">
              Choose which course community &amp; study group alerts you receive.
            </p>
          </div>
        </div>
        {commPrefsQuery.data ? (
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            {(
              [
                ['inAppAnswer', 'In-app: New answer to my question'],
                ['inAppAccepted', 'In-app: My answer accepted'],
                ['inAppReply', 'In-app: Reply to my post'],
                ['inAppGroupInvite', 'In-app: Study group invite'],
                ['inAppMention', 'In-app: @mention in group chat'],
                ['emailAnswer', 'Email: New answer to my question'],
                ['emailAccepted', 'Email: My answer accepted'],
                ['emailGroupInvite', 'Email: Study group invite'],
                ['emailDailyDigest', 'Email: Daily unanswered digest'],
              ] as Array<[keyof CommunityNotificationPrefs, string]>
            ).map(([key, label]) => (
              <Checkbox
                key={key}
                label={label}
                checked={commPrefsQuery.data[key]}
                onChange={async (e) => {
                  await updateCommunityNotifPrefs({ [key]: e.target.checked });
                  void commPrefsQuery.refetch();
                  toast.show({ kind: 'success', title: 'Notification preference saved' });
                }}
              />
            ))}
          </div>
        ) : null}
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/10 text-primary-600 dark:text-primary-400">
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-fg">Learner Type &amp; Academic Profile</h2>
            <p className="text-xs text-muted">
              Switch between University and Ghanaian SHS mode. Your existing courses or subjects
              stay intact.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs">
            <span className="font-medium text-fg">Learner type</span>
            <select
              value={learnerType}
              onChange={(e) => setLearnerType(e.target.value as 'university' | 'shs')}
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
            >
              <option value="university">University student</option>
              <option value="shs">SHS student (Ghana)</option>
            </select>
          </label>
          {learnerType === 'shs' ? (
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-fg">SHS Year</span>
              <select
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value)}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg"
              >
                <option value="SHS 1">SHS 1</option>
                <option value="SHS 2">SHS 2</option>
                <option value="SHS 3">SHS 3</option>
              </select>
            </label>
          ) : null}
        </div>
        {learnerType === 'shs' ? (
          <Input
            label="School name (optional)"
            placeholder="e.g. Achimota School"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
          />
        ) : null}
        <div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={savingProfile}
            onClick={async () => {
              const changingType = learnerType !== (user?.learnerType ?? 'university');
              if (
                changingType &&
                !window.confirm(
                  `Switch to ${learnerType === 'shs' ? 'SHS student' : 'University student'} mode? Your existing courses/subjects will remain intact.`,
                )
              ) {
                return;
              }
              setSavingProfile(true);
              try {
                const updated = await request<{
                  learnerType?: 'university' | 'shs';
                  schoolYear?: string | null;
                  schoolName?: string | null;
                }>('/users/me', {
                  method: 'PATCH',
                  body: {
                    learnerType,
                    schoolYear: learnerType === 'shs' ? schoolYear : null,
                    schoolName: learnerType === 'shs' ? schoolName.trim() || null : null,
                  },
                });
                if (user) {
                  updateUser({
                    ...user,
                    learnerType: updated.learnerType ?? learnerType,
                    schoolYear: updated.schoolYear ?? null,
                    schoolName: updated.schoolName ?? null,
                  });
                }
                toast.show({ kind: 'success', title: 'Academic profile updated' });
              } catch (err) {
                toast.show({
                  kind: 'error',
                  title: 'Could not update profile',
                  description: err instanceof ApiError ? err.message : 'Please try again.',
                });
              } finally {
                setSavingProfile(false);
              }
            }}
          >
            Update academic profile
          </Button>
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600/10 text-primary-600 dark:text-primary-400">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-fg">Data &amp; Privacy</h2>
            <p className="text-xs text-muted">
              Download a portable JSON copy of your courses, notes, flashcards, grades, and
              schedules.
            </p>
          </div>
        </div>
        <div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await downloadFile(
                  '/users/me/export',
                  `learnspace-export-${new Date().toISOString().slice(0, 10)}.json`,
                  { cookie: true },
                );
                toast.show({ kind: 'success', title: 'Data export downloaded' });
              } catch {
                toast.show({
                  kind: 'error',
                  title: 'Could not export data',
                  description: 'Please try again in a moment.',
                });
              } finally {
                setExporting(false);
              }
            }}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export my data (JSON)
          </Button>
          <a
            href="/LearnSpace_Agile_Documentation_Full.pdf"
            download="LearnSpace_Agile_Documentation_Full.pdf"
            className="ml-2 inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface2/60 px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-primary-300"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download System Docs (PDF)
          </a>
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
