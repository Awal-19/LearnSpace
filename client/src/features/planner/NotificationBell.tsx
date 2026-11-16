import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { request } from '../../lib/apiClient';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const notifQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      request<{ items: NotificationItem[]; unreadCount: number }>('/notifications?limit=10'),
    refetchInterval: 60_000,
  });

  const unread = notifQuery.data?.unreadCount ?? 0;
  const items = notifQuery.data?.items ?? [];

  const markRead = async (id: string) => {
    await request<void>(`/notifications/${id}/read`, { method: 'POST' });
    await qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markAll = async () => {
    await request<void>('/notifications/read-all', { method: 'POST' });
    await qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications (${unread} unread)`}
        className="relative rounded-md p-2 text-muted hover:bg-surface2 hover:text-fg"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-80 rounded-xl border border-line bg-surface shadow-lg z-30"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAll()}
                className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-72 divide-y divide-line overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted">You are all caught up.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void markRead(item.id)}
                  className={`w-full px-4 py-3 text-left text-xs transition-colors hover:bg-surface2 ${
                    item.readAt ? 'opacity-70' : 'bg-primary-50/40 dark:bg-primary-950/20'
                  }`}
                >
                  <p className="font-medium text-fg">{item.title}</p>
                  <p className="mt-0.5 text-muted">{item.body}</p>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

