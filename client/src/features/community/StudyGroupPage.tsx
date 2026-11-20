import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  BellOff,
  CalendarPlus,
  Copy,
  Flag,
  Paperclip,
  Pin,
  Send,
  Timer,
  Trash2,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import { Badge, Button, Card, ErrorState, Input, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { MarkdownContent } from '../chat/MarkdownContent';
import {
  communityAttachmentUrl,
  createGroupTask,
  deleteGroupMessage,
  fetchGroupDetail,
  fetchGroupMessages,
  leaveStudyGroup,
  pinGroupMessage,
  sendGroupMessage,
  sendGroupTyping,
  startGroupFocus,
  subscribeGroupStream,
  syncGroupTaskToPlanner,
  toggleGroupTask,
  toggleMuteStudyGroup,
  uploadCommunityAttachment,
  type GroupMessageItem,
} from './communityApi';
import { ReportModal } from './ReportAndBlockModal';

export function StudyGroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const path = useAppPath();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [messages, setMessages] = useState<GroupMessageItem[]>([]);
  const [composer, setComposer] = useState('');
  const [replyTo, setReplyTo] = useState<GroupMessageItem | null>(null);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [reportTarget, setReportTarget] = useState<{
    type: 'message';
    id: string;
    label?: string;
  } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const listRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);

  const detailQuery = useQuery({
    queryKey: ['community', 'group', groupId],
    queryFn: () => fetchGroupDetail(groupId!),
    enabled: Boolean(groupId),
  });

  const messagesQuery = useQuery({
    queryKey: ['community', 'group-messages', groupId],
    queryFn: () => fetchGroupMessages(groupId!),
    enabled: Boolean(groupId),
  });

  useEffect(() => {
    if (messagesQuery.data?.items) {
      setMessages(messagesQuery.data.items);
    }
  }, [messagesQuery.data]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Real-time SSE subscription with automatic reconnect
  useEffect(() => {
    if (!groupId) return;
    let active = true;
    let unsub: (() => void) | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (!active) return;
      unsub = subscribeGroupStream(groupId, {
        onEvent: (event, data) => {
          if (event === 'message') {
            const msg = data as GroupMessageItem;
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          } else if (event === 'message_deleted') {
            const { id } = data as { id: string };
            setMessages((prev) => prev.filter((m) => m.id !== id));
          } else if (event === 'typing') {
            const { userName } = data as { userName: string };
            setTypingUser(userName);
            if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
            typingTimerRef.current = window.setTimeout(() => setTypingUser(null), 2500);
          } else if (
            event === 'pinned_updated' ||
            event === 'task_created' ||
            event === 'task_updated' ||
            event === 'focus_started'
          ) {
            void qc.invalidateQueries({ queryKey: ['community', 'group', groupId] });
          }
        },
        onError: () => {
          if (active) {
            reconnectTimer = window.setTimeout(connect, 3000);
          }
        },
      });
    };

    connect();
    return () => {
      active = false;
      unsub?.();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, [groupId, qc]);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setShowScrollBottom(false);
  };

  useEffect(() => {
    if (!showScrollBottom) scrollToBottom();
  }, [messages.length]);

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <ErrorState
        title="Could not load study group"
        message={
          detailQuery.error instanceof ApiError ? detailQuery.error.message : 'Group not found.'
        }
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  const group = detailQuery.data;
  const isMod = group.myRole === 'owner' || group.myRole === 'moderator';
  const focusRemainingSec = group.activeFocusEndsAt
    ? Math.max(0, Math.floor((new Date(group.activeFocusEndsAt).getTime() - nowMs) / 1000))
    : 0;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composer.trim() || sending) return;
    setSending(true);
    const clientMessageId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    try {
      const sent = await sendGroupMessage(group.id, {
        body: composer.trim(),
        replyToId: replyTo?.id ?? null,
        clientMessageId,
        attachmentIds,
      });
      setMessages((prev) =>
        prev.some((m) => m.id === sent.id) ? prev : [...prev, { ...sent, isOwn: true }],
      );
      setComposer('');
      setReplyTo(null);
      setAttachmentIds([]);
      scrollToBottom();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not send message',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(path(`/community/courses/${group.communityId}`))}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to {group.communityName}
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const inviteUrl = `${window.location.origin}${path(`/community?join=${encodeURIComponent(group.inviteCode)}`)}`;
              void navigator.clipboard?.writeText(inviteUrl);
              toast.show({
                kind: 'success',
                title: 'Invite link copied!',
                description: `Share this link or code (${group.inviteCode}) with classmates.`,
              });
            }}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copy invite link ({group.inviteCode})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await toggleMuteStudyGroup(group.id, !group.muted);
              void detailQuery.refetch();
              toast.show({ kind: 'success', title: group.muted ? 'Group unmuted' : 'Group muted' });
            }}
          >
            <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
            {group.muted ? 'Unmute' : 'Mute'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await leaveStudyGroup(group.id);
              navigate(path('/community'));
            }}
          >
            Leave
          </Button>
        </div>
      </div>

      {/* Group Header & Focus Timer */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold text-fg">{group.name}</h1>
              <Badge tone="neutral">{group.members.length} members</Badge>
            </div>
            {group.description ? <p className="text-xs text-muted">{group.description}</p> : null}
          </div>

          <div className="flex items-center gap-2">
            {focusRemainingSec > 0 ? (
              <Badge tone="success" className="inline-flex items-center gap-1.5 px-3 py-1">
                <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                {group.activeFocusTitle}: {Math.floor(focusRemainingSec / 60)}:
                {String(focusRemainingSec % 60).padStart(2, '0')}
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await startGroupFocus(group.id, 'Study Together (25m)', 25);
                  void detailQuery.refetch();
                }}
              >
                <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                Start 25m Focus
              </Button>
            )}
          </div>
        </div>

        {group.pinnedMessage ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary-500/10 px-3 py-2 text-xs text-fg">
            <Pin className="h-3.5 w-3.5 shrink-0 text-primary-500" aria-hidden="true" />
            <span className="truncate">
              <strong>Pinned ({group.pinnedMessage.authorName}):</strong> {group.pinnedMessage.body}
            </span>
          </div>
        ) : null}
      </Card>

      {/* Main Split: Real-time Chat + Shared Tasks */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Chat Column */}
        <Card className="relative flex h-[62vh] flex-col overflow-hidden p-0 lg:col-span-2">
          <div
            ref={listRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
              setShowScrollBottom(!atBottom);
            }}
            className="flex-1 space-y-3 overflow-y-auto p-4"
          >
            {messages.length === 0 ? (
              <p className="py-12 text-center text-xs text-muted">
                No messages yet. Say hi or mention <strong>@AWAL</strong> to ask a study question!
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col gap-1 rounded-2xl p-3 text-sm ${
                    m.isAiGenerated
                      ? 'border border-primary-300/60 bg-primary-500/10'
                      : m.isOwn
                        ? 'ml-8 bg-primary-600/10'
                        : 'mr-8 bg-surface2/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-fg">
                      {m.author.name}
                      {m.isAiGenerated ? ' (AI)' : ''}
                    </span>
                    <div className="flex items-center gap-1 text-muted">
                      <span>
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setReplyTo(m)}
                        className="rounded px-1 hover:bg-surface"
                      >
                        Reply
                      </button>
                      {isMod ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await pinGroupMessage(group.id, m.id);
                            void detailQuery.refetch();
                          }}
                          title="Pin message"
                          className="rounded p-0.5 hover:bg-surface"
                        >
                          <Pin className="h-3 w-3" aria-hidden="true" />
                        </button>
                      ) : null}
                      {m.isOwn || isMod ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteGroupMessage(group.id, m.id);
                            setMessages((prev) => prev.filter((x) => x.id !== m.id));
                          }}
                          title="Delete message"
                          className="rounded p-0.5 text-danger hover:bg-surface"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setReportTarget({ type: 'message', id: m.id })}
                          title="Report message"
                          className="rounded p-0.5 hover:bg-surface"
                        >
                          <Flag className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                  {m.replyTo ? (
                    <p className="rounded-lg bg-surface/60 px-2 py-1 text-[11px] text-muted">
                      Replying to {m.replyTo.authorName}: {m.replyTo.body}
                    </p>
                  ) : null}
                  <div className="text-xs text-fg">
                    <MarkdownContent content={m.body} />
                  </div>
                  {m.linkPreview ? (
                    <a
                      href={m.linkPreview.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] text-primary-600 underline"
                    >
                      {m.linkPreview.domain}
                    </a>
                  ) : null}
                  {m.attachments?.map((att) => (
                    <a
                      key={att.id}
                      href={communityAttachmentUrl(att.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary-600 underline"
                    >
                      <Paperclip className="h-3 w-3" aria-hidden="true" />
                      {att.originalName}
                    </a>
                  ))}
                </div>
              ))
            )}
          </div>

          {showScrollBottom ? (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-20 right-4 inline-flex items-center gap-1 rounded-full bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-md"
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
              Latest
            </button>
          ) : null}

          {typingUser ? (
            <div className="px-4 py-1 text-[11px] text-muted">{typingUser} is typing...</div>
          ) : null}

          <form onSubmit={handleSend} className="border-t border-line bg-surface/80 p-3">
            {replyTo ? (
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                <span className="truncate">Replying to {replyTo.author.name}</span>
                <button type="button" onClick={() => setReplyTo(null)} className="underline">
                  Cancel
                </button>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <label className="cursor-pointer rounded-xl p-2 text-muted hover:bg-surface2 hover:text-fg">
                <Paperclip className="h-4 w-4" aria-hidden="true" />
                <input
                  type="file"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const att = await uploadCommunityAttachment(f);
                      setAttachmentIds((prev) => [...prev, att.id]);
                      toast.show({ kind: 'success', title: `Attached ${att.originalName}` });
                    } catch {
                      toast.show({ kind: 'error', title: 'Attachment upload failed' });
                    }
                  }}
                />
              </label>
              <input
                type="text"
                value={composer}
                onChange={(e) => {
                  setComposer(e.target.value);
                  void sendGroupTyping(group.id).catch(() => undefined);
                }}
                placeholder="Message group (use @AWAL to ask AI)..."
                className="h-10 flex-1 rounded-xl border border-line bg-surface2/60 px-3 text-sm text-fg focus:border-primary-500 focus:outline-none"
              />
              <Button type="submit" size="sm" loading={sending}>
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </form>
        </Card>

        {/* Shared Space Sidebar: Tasks & Members */}
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <h2 className="font-display text-sm font-semibold text-fg">Shared Study Tasks</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newTaskTitle.trim()) return;
                await createGroupTask(group.id, newTaskTitle.trim());
                setNewTaskTitle('');
                void detailQuery.refetch();
              }}
              className="flex gap-2"
            >
              <Input
                label="New task"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Add group task..."
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm">
                Add
              </Button>
            </form>
            <div className="space-y-2">
              {group.tasks.length === 0 ? (
                <p className="text-xs text-muted">No shared tasks yet.</p>
              ) : (
                group.tasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-surface2/50 px-2.5 py-2 text-xs"
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={async (e) => {
                          await toggleGroupTask(group.id, t.id, e.target.checked);
                          void detailQuery.refetch();
                        }}
                      />
                      <span className={t.done ? 'line-through text-muted' : 'text-fg'}>
                        {t.title}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        await syncGroupTaskToPlanner(group.id, t.id);
                        toast.show({ kind: 'success', title: 'Added to your Planner!' });
                      }}
                      title="Sync to my Planner"
                      className="text-primary-600 hover:text-primary-700"
                    >
                      <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="space-y-2 p-4">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-primary-500" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold text-fg">
                Members ({group.members.length})
              </h2>
            </div>
            <div className="space-y-1.5 text-xs">
              {group.members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between">
                  <span className="text-fg">{m.name}</span>
                  <Badge tone="neutral">{m.role}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  );
}
