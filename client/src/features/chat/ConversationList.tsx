import {
  Check,
  MessageSquarePlus,
  PanelLeftClose,
  Pencil,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import type { AuthUser } from '../../app/AuthContext';
import { useAppPath } from '../../app/basePath';
import { Avatar, Button, Skeleton, VerifiedBadge } from '../../design';
import type { AiUsage, Conversation } from './chatApi';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  search: string;
  onSearchChange: (q: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isLoading: boolean;
  isCreating: boolean;
  usage?: AiUsage;
  user?: AuthUser | null;
  onToggleCollapse?: () => void;
  onMobileClose?: () => void;
}

function SafeLink({
  to,
  className,
  'aria-label': ariaLabel,
  title,
  children,
}: {
  to: string;
  className?: string;
  'aria-label'?: string;
  title?: string;
  children: ReactNode;
}) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return (
      <Link to={to} className={className} aria-label={ariaLabel} title={title}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} className={className} aria-label={ariaLabel} title={title}>
      {children}
    </a>
  );
}

export function ConversationList({
  conversations,
  activeId,
  search,
  onSearchChange,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  isLoading,
  isCreating,
  usage,
  user,
  onToggleCollapse,
  onMobileClose,
}: ConversationListProps) {
  const path = useAppPath();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const startEdit = (conv: Conversation) => {
    setEditingId(conv.id);
    setDraftTitle(conv.title);
  };

  const commitEdit = async (id: string) => {
    const trimmed = draftTitle.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    await onRename(id, trimmed);
    setEditingId(null);
  };

  const usagePercent =
    usage && usage.tokenLimit !== null && usage.tokenLimit > 0
      ? Math.min(100, Math.round((usage.tokensUsed / usage.tokenLimit) * 100))
      : 0;

  return (
    <aside
      aria-label="Conversations"
      className="flex h-full w-full flex-col border-r border-black/[0.07] bg-white/80 backdrop-blur-xl dark:border-white/[0.08] dark:bg-surface/80"
    >
      {/* Logo & Collapse Header */}
      <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl liquid-glass-subtle text-primary-600 dark:text-primary-400">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="flex items-center gap-1.5">
            <span className="font-display text-sm font-semibold tracking-tight text-fg">
              LearnSpace
            </span>
            <span className="rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted dark:bg-white/[0.08]">
              AI
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onToggleCollapse ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="hidden h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08] md:inline-flex"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          {onMobileClose ? (
            <button
              type="button"
              onClick={onMobileClose}
              aria-label="Close sidebar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08] md:hidden"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {/* New Chat & Search */}
      <div className="space-y-2.5 px-3 py-2">
        <Button
          type="button"
          variant="secondary"
          className="w-full justify-start gap-2.5 rounded-xl border border-black/[0.07] bg-white/80 px-3 py-2 text-sm font-medium text-fg shadow-sm transition-all hover:bg-white dark:border-white/[0.09] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
          loading={isCreating}
          onClick={onCreate}
        >
          <MessageSquarePlus className="h-4 w-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
          New chat
        </Button>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search chats..."
            aria-label="Search conversations"
            className="w-full rounded-xl border border-black/[0.06] bg-black/[0.03] py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-muted transition-colors focus:border-primary-500/40 focus:bg-white/90 focus:outline-none dark:border-white/[0.07] dark:bg-white/[0.04] dark:focus:bg-white/[0.08]"
          />
        </div>
      </div>

      {/* Chat History List */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-0.5">
        <p className="px-2.5 pb-1.5 text-[11px] font-medium text-muted/80">
          Recent
        </p>

        {isLoading ? (
          <div className="space-y-2 px-1">
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">
            {search ? 'No matching conversations.' : 'No chats yet. Start one above!'}
          </p>
        ) : (
          conversations.map((conv) => {
            const active = conv.id === activeId;
            const editing = editingId === conv.id;

            if (editing) {
              return (
                <div
                  key={conv.id}
                  className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-sm"
                >
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitEdit(conv.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    aria-label="Rename conversation"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-app px-2 py-1 text-xs text-fg focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Save title"
                    onClick={() => void commitEdit(conv.id)}
                    className="rounded-lg p-1 text-emerald-600 transition-colors hover:bg-surface2"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel rename"
                    onClick={() => setEditingId(null)}
                    className="rounded-lg p-1 text-muted transition-colors hover:bg-surface2"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={conv.id}
                className={`group flex items-center justify-between rounded-xl px-2.5 py-2 text-[13px] transition-colors ${
                  active
                    ? 'bg-black/[0.06] font-medium text-fg dark:bg-white/[0.1]'
                    : 'text-fg/80 hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/[0.05]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {conv.title}
                </button>
                <div className="ml-1.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={`Rename ${conv.title}`}
                    onClick={() => startEdit(conv)}
                    className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-fg"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${conv.title}`}
                    onClick={() => void onDelete(conv.id)}
                    className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-danger"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Usage & User Footer */}
      <div className="border-t border-black/[0.06] p-3 space-y-2.5 dark:border-white/[0.07]">
        {usage ? (
          <div className="px-1 text-[11px] text-muted">
            <div className="flex items-center justify-between gap-2">
              <span>Daily AI tokens</span>
              <span className="tabular-nums">
                {usage.tokenLimit === null
                  ? `${usage.tokensUsed.toLocaleString()} · Unlimited`
                  : `${usage.tokensUsed.toLocaleString()} / ${usage.tokenLimit.toLocaleString()}`}
              </span>
            </div>
            {usage.tokenLimit !== null ? (
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-primary-600/80 transition-all duration-slow dark:bg-primary-400/80"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {user ? (
          <div className="flex items-center justify-between gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
            <SafeLink to={path('/profile')} className="flex min-w-0 flex-1 items-center gap-2.5">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate text-xs font-medium text-fg">
                  <span className="truncate">{user.name}</span>
                  {user.emailVerified ? <VerifiedBadge className="h-3.5 w-3.5" /> : null}
                </p>
                <p className="truncate text-[11px] text-muted">{user.email}</p>
              </div>
            </SafeLink>
            <SafeLink
              to={path('/settings')}
              aria-label="Open settings"
              title="Settings"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </SafeLink>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

