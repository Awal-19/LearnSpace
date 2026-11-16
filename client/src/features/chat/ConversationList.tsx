import { MessageSquarePlus, Pencil, Search, Trash2, Check, X } from 'lucide-react';
import { useState } from 'react';
import { Button, Skeleton } from '../../design';
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
}: ConversationListProps) {
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

  const usagePercent = usage
    ? Math.min(100, Math.round((usage.tokensUsed / Math.max(1, usage.tokenLimit)) * 100))
    : 0;

  return (
    <aside
      aria-label="Conversations"
      className="flex h-full w-full flex-col border-r border-line bg-surface"
    >
      <div className="space-y-3 border-b border-line p-3">
        <Button
          type="button"
          className="w-full justify-center"
          loading={isCreating}
          onClick={onCreate}
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          New chat
        </Button>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search chats..."
            aria-label="Search conversations"
            className="w-full rounded-lg border border-line bg-bg py-1.5 pl-8 pr-3 text-sm text-fg placeholder:text-muted focus:border-primary-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
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
                <div key={conv.id} className="flex items-center gap-1 rounded-lg bg-surface2 p-1.5">
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitEdit(conv.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    aria-label="Rename conversation"
                    className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1 text-sm text-fg focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Save title"
                    onClick={() => void commitEdit(conv.id)}
                    className="rounded p-1 text-emerald-600 hover:bg-surface"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel rename"
                    onClick={() => setEditingId(null)}
                    className="rounded p-1 text-muted hover:bg-surface"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={conv.id}
                className={`group flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300'
                    : 'text-fg hover:bg-surface2'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  className="min-w-0 flex-1 truncate text-left font-medium"
                >
                  {conv.title}
                </button>
                <div className="ml-1 flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={`Rename ${conv.title}`}
                    onClick={() => startEdit(conv)}
                    className="rounded p-1 text-muted hover:bg-surface hover:text-fg"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${conv.title}`}
                    onClick={() => void onDelete(conv.id)}
                    className="rounded p-1 text-muted hover:bg-surface hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {usage ? (
        <div className="border-t border-line p-3 text-xs text-muted">
          <div className="flex items-center justify-between">
            <span>Daily AI tokens</span>
            <span>
              {usage.tokensUsed.toLocaleString()} / {usage.tokenLimit.toLocaleString()}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full bg-primary-600 transition-all"
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}

