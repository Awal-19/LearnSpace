import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { Badge, Card, VerifiedBadge } from '../../design';
import { request } from '../../lib/apiClient';
import { AvatarUploader } from './AvatarUploader';
import { ProfileDetailsForm } from './ProfileDetailsForm';
import { SecurityTab } from './SecurityTab';
import { StatsGrid, type UserStats } from './StatsGrid';

type Tab = 'details' | 'security';

export function ProfilePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('details');

  const statsQuery = useQuery({
    queryKey: ['users', 'me', 'stats'],
    queryFn: () => request<UserStats>('/users/me/stats'),
    enabled: Boolean(user),
  });

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="relative overflow-hidden border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-6 dark:border-primary-500/20 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="flex items-center gap-1.5 font-display text-2xl font-bold tracking-tight text-fg">
                <span>{user.name}</span>
                {user.emailVerified ? <VerifiedBadge /> : null}
              </h1>
              <Badge tone={user.emailVerified ? 'success' : 'warning'}>
                {user.emailVerified ? 'Verified' : 'Unverified email'}
              </Badge>
            </div>
            <p className="text-sm text-muted">{user.email}</p>
            {(user.programme || user.university) && (
              <p className="text-sm font-medium text-fg/80">
                {[user.programme, user.level, user.university].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <AvatarUploader />
        </div>
      </Card>

      <StatsGrid
        stats={statsQuery.data}
        isLoading={statsQuery.isLoading}
        isError={statsQuery.isError}
        onRetry={() => void statsQuery.refetch()}
      />

      <div
        role="tablist"
        aria-label="Profile sections"
        className="inline-flex gap-1 rounded-xl border border-line bg-surface2/70 p-1"
      >
        {(
          [
            { id: 'details', label: 'Details' },
            { id: 'security', label: 'Security' },
          ] as const
        ).map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                active
                  ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {tab === 'details' ? <ProfileDetailsForm /> : <SecurityTab />}
      </div>
    </div>
  );
}

