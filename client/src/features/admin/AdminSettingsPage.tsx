import { useQuery } from '@tanstack/react-query';
import { Save, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { fetchAdminSettings, updateAdminSettings, type AdminAppSettings } from './adminApi';

export function AdminSettingsPage() {
  const toast = useToast();
  const query = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: fetchAdminSettings,
  });

  const [form, setForm] = useState<AdminAppSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.data?.settings) {
      setForm(query.data.settings);
    }
  }, [query.data]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await updateAdminSettings(form);
      toast.show({ kind: 'success', title: 'Platform settings saved' });
      await query.refetch();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Save failed',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading || !form) return <Skeleton className="h-72" />;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
          <Settings className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
            Platform Settings
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Feature toggles, maintenance mode, rate/upload limits, and allowed file types.
          </p>
        </div>
      </div>

      <Card className="p-5 sm:p-6">
        <form onSubmit={handleSave} className="space-y-5 text-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="font-medium">App name</span>
              <input
                value={form.appName}
                onChange={(e) => setForm({ ...form, appName: e.target.value })}
                className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              />
            </label>
            <label className="space-y-1.5">
              <span className="font-medium">Support email</span>
              <input
                type="email"
                value={form.supportEmail}
                onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
              />
            </label>
          </div>

          <div className="space-y-2.5 rounded-2xl border border-line/80 bg-surface2/40 p-4">
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={form.maintenanceMode}
                onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
              />
              Maintenance mode (displays banner to students)
            </label>
            <input
              value={form.maintenanceMessage}
              onChange={(e) => setForm({ ...form, maintenanceMessage: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:outline-none"
            />
          </div>

          <div className="space-y-2.5">
            <p className="font-medium">Feature Toggles</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {(
                [
                  ['featureChat', 'AI Study Assistant Chat'],
                  ['featureUploads', 'File & Camera Uploads'],
                  ['featureDocuments', 'Study from Documents'],
                  ['featureSignups', 'New Student Sign-ups'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 rounded-xl border border-line/80 bg-surface2/30 p-3 transition-colors hover:bg-surface2/60"
                >
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="font-medium">Allowed file extensions (comma-separated)</span>
            <input
              value={form.allowedFileTypesJson.join(', ')}
              onChange={(e) =>
                setForm({
                  ...form,
                  allowedFileTypesJson: e.target.value
                    .split(',')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean),
                })
              }
              className="w-full rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            />
          </label>

          <Button type="submit" size="sm" loading={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Save settings
          </Button>
        </form>
      </Card>
    </div>
  );
}

