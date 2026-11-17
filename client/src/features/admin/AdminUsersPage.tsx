import { useQuery } from '@tanstack/react-query';
import { Download, Search, Users, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar, Badge, Button, Card, EmptyState, Skeleton, useToast, VerifiedBadge } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { bulkAdminUsers, fetchAdminUsers } from './adminApi';

export function AdminUsersPage() {
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [verified, setVerified] = useState('');
  const [authMethod, setAuthMethod] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'name' | 'email' | 'lastActiveAt'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyBulk, setBusyBulk] = useState(false);

  const query = useQuery({
    queryKey: ['admin', 'users', q, role, status, verified, authMethod, sortBy, sortDir, page],
    queryFn: () =>
      fetchAdminUsers({
        q: q.trim() || undefined,
        role: role || undefined,
        status: status || undefined,
        verified: verified || undefined,
        authMethod: authMethod || undefined,
        sortBy,
        sortDir,
        page,
        pageSize: 20,
      }),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const toggleAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((u) => u.id));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleBulk = async (action: 'export_csv' | 'suspend') => {
    if (selectedIds.length === 0) return;
    if (action === 'suspend' && !window.confirm(`Suspend ${selectedIds.length} selected user(s)?`)) {
      return;
    }
    setBusyBulk(true);
    try {
      await bulkAdminUsers({ action, userIds: selectedIds });
      toast.show({
        kind: 'success',
        title: action === 'export_csv' ? 'Exported selected users to CSV' : 'Selected users suspended',
      });
      if (action === 'suspend') {
        setSelectedIds([]);
        await query.refetch();
      }
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Bulk action failed',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setBusyBulk(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <Users className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">Users</h1>
            <p className="mt-0.5 text-sm text-muted">{total} total accounts</p>
          </div>
        </div>

        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{selectedIds.length} selected</Badge>
            <Button
              size="sm"
              variant="secondary"
              disabled={busyBulk}
              onClick={() => void handleBulk('export_csv')}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busyBulk}
              onClick={() => void handleBulk('suspend')}
            >
              <UserX className="mr-1.5 h-3.5 w-3.5" />
              Suspend selected
            </Button>
          </div>
        ) : null}
      </div>

      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, email, programme…"
              className="w-full rounded-xl border border-line bg-surface2/50 py-2 pl-9 pr-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            />
          </div>

          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
          >
            <option value="">All roles</option>
            <option value="student">Student</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>

          <select
            value={verified}
            onChange={(e) => {
              setVerified(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
          >
            <option value="">All verification</option>
            <option value="true">Verified</option>
            <option value="false">Unverified</option>
          </select>

          <select
            value={authMethod}
            onChange={(e) => {
              setAuthMethod(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-line bg-surface2/50 px-3 py-2 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
          >
            <option value="">All sign-in methods</option>
            <option value="email">Email</option>
            <option value="google">Google</option>
          </select>
        </div>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No matching users"
          description="Try clearing or adjusting your search filters."
        />
      ) : (
        <Card className="overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-line bg-surface2/70 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selectedIds.length === items.length}
                      onChange={toggleAll}
                      aria-label="Select all users"
                    />
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSortBy('name');
                        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      }}
                      className="font-semibold hover:text-fg"
                    >
                      User
                    </button>
                  </th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Verified</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSortBy('createdAt');
                        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                      }}
                      className="font-semibold hover:text-fg"
                    >
                      Joined
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/80">
                {items.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-surface2/50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(u.id)}
                        onChange={() => toggleOne(u.id)}
                        aria-label={`Select ${u.email}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.name} size="sm" />
                        <div className="min-w-0">
                          <Link
                            to={`/admin/users/${u.id}`}
                            className="inline-flex items-center gap-1 font-medium text-fg hover:text-primary-600 hover:underline"
                          >
                            <span>{u.name}</span>
                            {u.emailVerified ? <VerifiedBadge /> : null}
                          </Link>
                          <p className="text-xs text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.status === 'active' ? 'success' : 'danger'}>{u.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.emailVerified ? 'success' : 'warning'}>
                        {u.emailVerified ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 capitalize text-muted">{u.authMethod}</td>
                    <td className="px-4 py-3 text-xs text-muted tabular-nums">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/users/${u.id}`}
                        className="inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-950/40"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-muted">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

