import {
  AlertTriangle,
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  Check,
  Compass,
  Copy,
  Download,
  FileText,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { Avatar, Button, Modal } from '../../design';
import { ReadAloudButton } from '../dictation/DictationControls';
import {
  fetchAttachmentBlob,
  type AiAction,
  type ChatMessage,
  type MessageAttachment,
} from './chatApi';
import { formatBytes } from './imagePrep';
import { MarkdownContent } from './MarkdownContent';
import {
  createTrackedBlobUrl,
  getCachedAttachmentPreview,
  registerAttachmentPreview,
} from './previewCache';

const QUICK_ACTIONS: Array<{ id: AiAction; label: string }> = [
  { id: 'explain_simple', label: 'Explain simply' },
  { id: 'example', label: 'Give an example' },
  { id: 'quiz_me', label: 'Quiz me' },
  { id: 'summarize', label: 'Summarize' },
];

const STARTER_PROMPTS = [
  {
    title: 'Explain a difficult concept',
    description: 'Break down any tricky idea with clear steps and analogies',
    icon: Lightbulb,
    tint: 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400',
    prompt:
      'Walk me through a difficult concept step by step. Ask me which subject or topic I want to understand, then explain it clearly with an analogy and an example.',
  },
  {
    title: 'Summarize my lecture notes',
    description: 'Turn long readings or uploaded PDFs into key takeaways',
    icon: FileText,
    tint: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
    prompt:
      'Summarize my lecture notes into clear, structured key takeaways. Use any uploaded lecture PDFs if available, or ask me to paste or attach my notes.',
  },
  {
    title: 'Help me solve a problem',
    description: 'Work through equations, code, or coursework step by step',
    icon: Compass,
    tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    prompt:
      'Help me solve an academic problem step by step. Ask me to share or attach the problem so we can reason through it together.',
  },
  {
    title: 'Generate practice questions',
    description: 'Test what you know with tailored revision questions',
    icon: HelpCircle,
    tint: 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400',
    prompt:
      'Generate practice questions to test my understanding. Use my uploaded study materials if available, or ask me which topic and difficulty level I want.',
  },
] as const;

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  isSubmitting?: boolean;
  onQuickAction: (action: AiAction) => void;
  onRetryLast: () => void;
  onContinueLast?: () => void;
  onSelectStarterPrompt?: (prompt: string) => void;
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy response"
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-white/[0.08] dark:hover:text-primary-400"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const AuthAttachmentThumb = memo(function AuthAttachmentThumb({
  att,
  onOpenLightbox,
}: {
  att: MessageAttachment;
  onOpenLightbox: (url: string, name: string) => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(() =>
    att.kind === 'image' ? (getCachedAttachmentPreview(att.id) ?? null) : null,
  );

  useEffect(() => {
    if (att.kind !== 'image') return;
    const cached = getCachedAttachmentPreview(att.id);
    if (cached) {
      setObjectUrl(cached);
      return;
    }
    let active = true;
    fetchAttachmentBlob(att.url)
      .then((blob) => {
        if (!active) return;
        const created = createTrackedBlobUrl(blob);
        registerAttachmentPreview(att.id, created);
        setObjectUrl(created);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [att.id, att.kind, att.url]);

  const handleDownload = async () => {
    try {
      const blob = await fetchAttachmentBlob(att.url);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  if (att.kind === 'image') {
    return (
      <button
        type="button"
        onClick={() => objectUrl && onOpenLightbox(objectUrl, att.originalName)}
        aria-label={`View ${att.originalName}`}
        className="overflow-hidden rounded-xl border border-line/80 bg-surface shadow-sm transition-all hover:border-primary-300"
      >
        {objectUrl ? (
          <img
            src={objectUrl}
            alt={att.originalName}
            className="h-24 w-24 object-cover transition-transform duration-fast hover:scale-105"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center text-xs text-muted">
            Loading...
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      className="inline-flex items-center gap-2 rounded-xl border border-line/80 bg-surface px-3 py-1.5 text-xs text-fg shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50/40 dark:bg-surface2"
    >
      <FileText
        className="h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400"
        aria-hidden="true"
      />
      <span className="max-w-[150px] truncate font-medium">{att.originalName}</span>
      <span className="text-muted">({formatBytes(att.sizeBytes)})</span>
      <Download className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
});

function isNearBottom(el: HTMLElement, threshold = 64): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

const UserMessageBubble = memo(function UserMessageBubble({
  msg,
  user,
  onOpenLightbox,
}: {
  msg: ChatMessage;
  user: { name: string; avatarUrl?: string | null } | null | undefined;
  onOpenLightbox: (url: string, name: string) => void;
}) {
  return (
    <div className="motion-safe:animate-fade-up flex items-start justify-end gap-3">
      <div className="max-w-[85%] space-y-2.5 sm:max-w-[76%]">
        {msg.attachments && msg.attachments.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            {msg.attachments.map((att) => (
              <AuthAttachmentThumb key={att.id} att={att} onOpenLightbox={onOpenLightbox} />
            ))}
          </div>
        ) : null}
        <div className="rounded-2xl rounded-tr-sm border border-primary-200/70 bg-primary-50/90 px-4 py-2.5 text-[15px] leading-relaxed text-fg shadow-sm dark:border-primary-500/20 dark:bg-primary-500/15">
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
      {user ? (
        <Avatar
          name={user.name}
          src={user.avatarUrl}
          size="sm"
          className="mt-0.5 h-8 w-8 shadow-sm"
        />
      ) : null}
    </div>
  );
});

const AssistantMessageBubble = memo(function AssistantMessageBubble({
  msg,
  isLast,
  generating,
  onQuickAction,
  onRetryLast,
  onContinueLast,
}: {
  msg: ChatMessage;
  isLast: boolean;
  generating: boolean;
  onQuickAction: (action: AiAction) => void;
  onRetryLast: () => void;
  onContinueLast?: () => void;
}) {
  const showQuickActions =
    isLast && !generating && msg.status === 'complete' && msg.content.length > 0;
  const showRetry = isLast && !generating && (msg.status === 'partial' || msg.status === 'error');
  const activelyStreaming = isLast && generating && msg.content.length > 0;

  return (
    <div className="group motion-safe:animate-fade-up flex items-start gap-3.5 sm:gap-4">
      <div
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary-200/80 bg-primary-50 text-primary-600 shadow-sm dark:border-primary-500/30 dark:bg-primary-500/15 dark:text-primary-400"
      >
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-fg/85">
          <span>AWAL</span>
          {activelyStreaming ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-600 dark:bg-primary-400" />
              Responding
            </span>
          ) : null}
        </div>

        {msg.content ? (
          <div className="text-fg">
            <MarkdownContent content={msg.content} isStreaming={activelyStreaming} />
          </div>
        ) : generating && isLast && msg.status !== 'error' ? (
          <div className="flex items-center gap-2.5 py-1.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-600 dark:bg-primary-400" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-600 dark:bg-primary-400 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-600 dark:bg-primary-400 [animation-delay:300ms]" />
            </span>
            <span>Thinking…</span>
          </div>
        ) : msg.status === 'error' ? null : (
          <p className="text-sm italic text-muted">No response generated.</p>
        )}

        {msg.status === 'partial' && !generating ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Response stopped early.</span>
            {isLast && onContinueLast ? (
              <button
                type="button"
                onClick={onContinueLast}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-300"
              >
                Continue
              </button>
            ) : null}
          </div>
        ) : null}

        {msg.status === 'error' && !generating ? (
          <div
            role="alert"
            className="inline-flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-medium text-danger"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{msg.errorMessage ?? 'The AI service hit an error. Please try again.'}</span>
          </div>
        ) : null}

        {msg.sources && msg.sources.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted">
            <BookOpen
              className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400"
              aria-hidden="true"
            />
            <span className="font-medium text-fg/80">Sources:</span>
            {msg.sources.map((src, sIdx) => (
              <span
                key={`${src.filename}-${src.section}-${sIdx}`}
                className="rounded-lg border border-primary-200/70 bg-primary-50/70 px-2 py-0.5 text-[11px] font-medium text-primary-700 dark:border-primary-500/20 dark:bg-primary-500/15 dark:text-primary-300"
              >
                {src.filename} (§{src.section})
              </span>
            ))}
          </div>
        ) : null}

        {msg.content && !(generating && isLast) ? (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            <CopyMessageButton text={msg.content} />
            <ReadAloudButton text={msg.content} />
            {isLast ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onRetryLast}
                className="h-7 rounded-lg px-2.5 text-xs font-medium text-muted hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-white/[0.08] dark:hover:text-primary-400"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {showRetry ? 'Retry' : 'Regenerate'}
              </Button>
            ) : null}
          </div>
        ) : showRetry ? (
          <Button type="button" size="sm" variant="secondary" onClick={onRetryLast}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        ) : null}

        {showQuickActions ? (
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.id}
                type="button"
                onClick={() => onQuickAction(qa.id)}
                className="rounded-full border border-line/80 bg-surface px-3 py-1 text-xs font-medium text-muted shadow-sm transition-all hover:border-primary-300 hover:bg-primary-50/70 hover:text-primary-600 dark:bg-surface2 dark:hover:border-primary-500/40 dark:hover:text-primary-300"
              >
                {qa.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export function MessageList({
  messages,
  isStreaming,
  isSubmitting = false,
  onQuickAction,
  onRetryLast,
  onContinueLast,
  onSelectStarterPrompt,
}: MessageListProps) {
  const { user } = useAuth();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const shouldStickRef = useRef(true);
  const prevLenRef = useRef(messages.length);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const lastContent = messages[messages.length - 1]?.content;
  const generating = isStreaming || isSubmitting;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollContainerRef.current;
    shouldStickRef.current = true;
    setShowScrollButton(false);
    setHasUnread(false);
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else {
      endRef.current?.scrollIntoView?.({ behavior });
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = isNearBottom(el);
    shouldStickRef.current = atBottom;
    setShowScrollButton(!atBottom);
    if (atBottom) setHasUnread(false);
  }, []);

  const handleOpenLightbox = useCallback((url: string, name: string) => {
    setLightbox({ url, name });
  }, []);

  useEffect(() => {
    const grew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length;
    if (grew) {
      // New message sent/received: ensure user message and start of answer are visible
      scrollToBottom('auto');
      return;
    }
    if (shouldStickRef.current) {
      scrollToBottom('auto');
    } else if (generating) {
      setHasUnread(true);
    }
  }, [messages.length, lastContent, generating, scrollToBottom]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10 text-center sm:px-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_12px_28px_-6px_rgba(37,99,235,0.38)]">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          Where should we start learning?
        </h2>
        <p className="mt-2.5 max-w-md text-sm leading-relaxed text-muted sm:text-[15px]">
          Your personal AI learning companion. Ask questions, explore ideas and understand anything.
        </p>

        <div className="mt-8 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-2">
          {STARTER_PROMPTS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => onSelectStarterPrompt?.(item.prompt)}
                className="group flex items-start gap-3.5 rounded-2xl border border-line/80 bg-surface p-4 text-left shadow-sm transition-all duration-fast ease-soft hover:-translate-y-0.5 hover:border-primary-300 hover:bg-primary-50/35 hover:shadow-md dark:bg-surface2/60 dark:hover:border-primary-500/40 dark:hover:bg-surface2"
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-fast group-hover:scale-105 ${item.tint}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-semibold text-fg group-hover:text-primary-600 dark:group-hover:text-primary-400">
                      {item.title}
                    </p>
                    <ArrowUpRight
                      className="h-3.5 w-3.5 shrink-0 text-muted/50 opacity-0 transition-all group-hover:opacity-100 group-hover:text-primary-600"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const lastMessage = messages[messages.length - 1];
  const liveAnnouncement =
    !generating && lastMessage?.role === 'assistant' && lastMessage.status === 'complete'
      ? 'AWAL finished responding.'
      : '';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8"
      >
        <div className="mx-auto max-w-3xl space-y-7 pb-6">
          {messages.map((msg, index) => {
            const isLast = index === messages.length - 1;
            if (msg.role === 'user') {
              return (
                <UserMessageBubble
                  key={msg.id}
                  msg={msg}
                  user={user}
                  onOpenLightbox={handleOpenLightbox}
                />
              );
            }
            return (
              <AssistantMessageBubble
                key={msg.id}
                msg={msg}
                isLast={isLast}
                generating={generating}
                onQuickAction={onQuickAction}
                onRetryLast={onRetryLast}
                onContinueLast={onContinueLast}
              />
            );
          })}
          <div ref={endRef} />
        </div>
      </div>

      <span className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </span>

      {showScrollButton ? (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          aria-label="Scroll to bottom"
          className="absolute bottom-3 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-line/80 bg-surface/95 text-fg shadow-md backdrop-blur-sm transition-all hover:border-primary-400 hover:text-primary-600 dark:bg-surface2/95 sm:right-8"
        >
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
          {hasUnread ? (
            <span
              aria-label="New content available"
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary-600 ring-2 ring-surface"
            />
          ) : null}
        </button>
      ) : null}

      <Modal
        open={Boolean(lightbox)}
        onClose={() => setLightbox(null)}
        title={lightbox?.name ?? 'Preview'}
        className="max-w-3xl"
      >
        {lightbox ? (
          <div className="p-2">
            <img
              src={lightbox.url}
              alt={lightbox.name}
              className="mx-auto max-h-[75vh] rounded-xl object-contain"
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
