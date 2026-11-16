import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { Badge, Card } from '../../design';
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
      <Card className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                {user.name}
              </h1>
              <Badge tone={user.emailVerified ? 'success' : 'warning'}>
                {user.emailVerified ? 'Verified' : 'Unverified email'}
              </Badge>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{user.email}</p>
            {(user.programme || user.university) && (
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
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
        className="flex gap-2 border-b border-line pb-px"
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
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
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

