import {
  Check,
  GraduationCap,
  MessageSquare,
  MessageSquarePlus,
  PanelLeftClose,
  Pencil,
  Search,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import type { AuthUser } from '../../app/AuthContext';
import { useAppPath } from '../../app/basePath';
import { Avatar, Button, Skeleton, VerifiedBadge } from '../../design';
import { CourseBadge } from '../courses/CourseBadge';
import { CourseSelect } from '../courses/CourseSelect';
import type { CourseSummary } from '../courses/coursesApi';
import type { Conversation } from './chatApi';

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
  user?: AuthUser | null;
  courses?: CourseSummary[];
  courseFilter?: string;
  onCourseFilterChange?: (courseId: string) => void;
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

interface ConversationGroup {
  label: string;
  items: Conversation[];
}

function groupConversationsByDate(conversations: Conversation[]): ConversationGroup[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const yesterdayMs = todayMs - 24 * 60 * 60 * 1000;
  const sevenDaysMs = todayMs - 7 * 24 * 60 * 60 * 1000;

  const buckets: Record<'today' | 'yesterday' | 'week' | 'older', Conversation[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  };

  for (const conv of conversations) {
    const ts = new Date(conv.updatedAt).getTime();
    if (Number.isNaN(ts) || ts >= todayMs) {
      buckets.today.push(conv);
    } else if (ts >= yesterdayMs) {
      buckets.yesterday.push(conv);
    } else if (ts >= sevenDaysMs) {
      buckets.week.push(conv);
    } else {
      buckets.older.push(conv);
    }
  }

  return [
    { label: 'Today', items: buckets.today },
    { label: 'Yesterday', items: buckets.yesterday },
    { label: 'Previous 7 days', items: buckets.week },
    { label: 'Earlier', items: buckets.older },
  ].filter((g) => g.items.length > 0);
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
  user,
  courses,
  courseFilter = '',
  onCourseFilterChange,
  onToggleCollapse,
  onMobileClose,
}: ConversationListProps) {
  const path = useAppPath();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const grouped = useMemo(() => groupConversationsByDate(conversations), [conversations]);
  const courseById = useMemo(() => new Map((courses ?? []).map((c) => [c.id, c])), [courses]);

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

  return (
    <aside
      aria-label="Conversations"
      className="flex h-full w-full flex-col border-r border-line/80 bg-app/90 backdrop-blur-xl dark:bg-surface/95"
    >
      {/* Brand Header & Collapse */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_6px_14px_rgba(37,99,235,0.28)]">
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="flex items-center gap-1.5">
            <span className="font-display text-sm font-bold tracking-tight text-fg">
              Learn<span className="text-primary-600 dark:text-primary-400">Space</span>
            </span>
            <span className="rounded-md border border-primary-200/80 bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-700 dark:border-primary-500/30 dark:bg-primary-500/15 dark:text-primary-300">
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
              className="hidden h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-primary-50/80 hover:text-primary-600 dark:hover:bg-white/[0.08] dark:hover:text-primary-400 md:inline-flex"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          {onMobileClose ? (
            <button
              type="button"
              onClick={onMobileClose}
              aria-label="Close sidebar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-primary-50/80 hover:text-fg dark:hover:bg-white/[0.08] md:hidden"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Prominent New Chat & Search */}
      <div className="space-y-2.5 px-3 pb-3">
        <Button
          type="button"
          variant="primary"
          className="h-10 w-full justify-start gap-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-3.5 text-sm font-medium text-white shadow-[0_6px_18px_-4px_rgba(37,99,235,0.34)] transition-all hover:from-primary-700 hover:to-primary-600"
          loading={isCreating}
          onClick={onCreate}
        >
          <MessageSquarePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
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
            placeholder="Search conversations..."
            aria-label="Search conversations"
            className="w-full rounded-xl border border-line/80 bg-surface py-2 pl-8 pr-3 text-xs text-fg shadow-sm placeholder:text-muted transition-all focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/15 dark:bg-surface2/70"
          />
        </div>

        {onCourseFilterChange && (courses?.length ?? 0) > 0 ? (
          <CourseSelect
            ariaLabel="Filter conversations by course"
            mode="filter"
            value={courseFilter}
            onChange={onCourseFilterChange}
            courses={courses ?? []}
            className="h-8 w-full text-xs"
          />
        ) : null}
      </div>

      {/* Organized Conversation History */}
      <div className="flex-1 space-y-4 overflow-y-auto px-2.5 py-1">
        {isLoading ? (
          <div className="space-y-2 px-1 pt-2">
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs font-medium text-muted">
              {search || courseFilter ? 'No matching conversations.' : 'No conversations yet.'}
            </p>
            {!search && !courseFilter ? (
              <p className="mt-1 text-[11px] text-muted/80">
                Start a new chat above to ask AWAL anything.
              </p>
            ) : null}
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.label} className="space-y-0.5">
              <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted/75">
                {group.label}
              </p>
              {group.items.map((conv) => {
                const active = conv.id === activeId;
                const editing = editingId === conv.id;

                if (editing) {
                  return (
                    <div
                      key={conv.id}
                      className="flex items-center gap-1 rounded-xl border border-primary-300 bg-surface p-1.5 shadow-sm"
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
                        className="min-w-0 flex-1 rounded-lg border border-line bg-app px-2 py-1 text-xs text-fg focus:border-primary-400 focus:outline-none"
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
                    className={`group relative flex items-center justify-between rounded-xl px-2.5 py-2 text-[13px] transition-all duration-fast ${
                      active
                        ? 'bg-primary-50 font-medium text-primary-700 shadow-sm dark:bg-primary-500/15 dark:text-primary-300'
                        : 'text-fg/80 hover:bg-surface hover:text-fg hover:shadow-sm dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    {active ? (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary-600 dark:bg-primary-400"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onSelect(conv.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <MessageSquare
                        className={`h-3.5 w-3.5 shrink-0 ${
                          active
                            ? 'text-primary-600 dark:text-primary-400'
                            : 'text-muted/70 group-hover:text-primary-600 dark:group-hover:text-primary-400'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{conv.title}</span>
                      {conv.courseId ? (
                        <CourseBadge
                          course={courseById.get(conv.courseId)}
                          className="ml-auto max-w-[92px] shrink-0 py-0 text-[10px]"
                        />
                      ) : null}
                    </button>
                    <div
                      className={`ml-1.5 flex shrink-0 items-center gap-0.5 transition-opacity ${
                        active
                          ? 'opacity-80 hover:opacity-100'
                          : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={`Rename ${conv.title}`}
                        onClick={() => startEdit(conv)}
                        className="rounded-lg p-1 text-muted transition-colors hover:bg-surface2 hover:text-fg"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${conv.title}`}
                        onClick={() => void onDelete(conv.id)}
                        className="rounded-lg p-1 text-muted transition-colors hover:bg-surface2 hover:text-danger"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Clean User Profile & Settings Footer */}
      {user ? (
        <div className="border-t border-line/80 bg-surface/70 p-3 dark:bg-surface/90">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-line/70 bg-surface px-2.5 py-2 shadow-sm transition-colors hover:border-primary-300 dark:bg-surface2/60">
            <SafeLink to={path('/profile')} className="flex min-w-0 flex-1 items-center gap-2.5">
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-1 text-xs font-semibold text-fg">
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
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-white/[0.08] dark:hover:text-primary-400"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
            </SafeLink>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
