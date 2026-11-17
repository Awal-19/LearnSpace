import {
  AlertTriangle,
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
import { memo, useEffect, useRef, useState } from 'react';
import { Button, Modal } from '../../design';
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
    prompt:
      'Walk me through a difficult concept step by step. Ask me which subject or topic I want to understand, then explain it clearly with an analogy and an example.',
  },
  {
    title: 'Summarize my lecture notes',
    description: 'Turn long readings or uploaded PDFs into key takeaways',
    icon: FileText,
    prompt:
      'Summarize my lecture notes into clear, structured key takeaways. Use any uploaded lecture PDFs if available, or ask me to paste or attach my notes.',
  },
  {
    title: 'Help me solve a problem',
    description: 'Work through equations, code, or coursework step by step',
    icon: Compass,
    prompt:
      'Help me solve an academic problem step by step. Ask me to share or attach the problem so we can reason through it together.',
  },
  {
    title: 'Generate practice questions',
    description: 'Test what you know with tailored revision questions',
    icon: HelpCircle,
    prompt:
      'Generate practice questions to test my understanding. Use my uploaded study materials if available, or ask me which topic and difficulty level I want.',
  },
] as const;

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onQuickAction: (action: AiAction) => void;
  onRetryLast: () => void;
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
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy response"
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
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
  const [objectUrl, setObjectUrl] = useState<string | null>(
    () => (att.kind === 'image' ? getCachedAttachmentPreview(att.id) ?? null : null),
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
        className="overflow-hidden rounded-xl border border-black/[0.08] bg-surface2/60 dark:border-white/[0.1]"
      >
        {objectUrl ? (
          <img
            src={objectUrl}
            alt={att.originalName}
            className="h-24 w-24 object-cover transition-transform hover:scale-105"
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
      className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white/80 px-2.5 py-1.5 text-xs text-fg transition-colors hover:bg-white dark:border-white/[0.1] dark:bg-white/[0.08] dark:hover:bg-white/[0.14]"
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />
      <span className="max-w-[140px] truncate font-medium">{att.originalName}</span>
      <span className="text-muted">({formatBytes(att.sizeBytes)})</span>
      <Download className="h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
});

export function MessageList({
  messages,
  isStreaming,
  onQuickAction,
  onRetryLast,
  onSelectStarterPrompt,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8 text-center sm:px-6">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl liquid-glass text-primary-600 dark:text-primary-400">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
          Where should we start learning?
        </h2>
        <p className="mt-2.5 max-w-lg text-sm leading-relaxed text-muted sm:text-[15px]">
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
                className="group liquid-glass-subtle flex items-start gap-3.5 rounded-2xl p-4 text-left transition-all duration-fast ease-soft hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-md dark:hover:bg-white/[0.08]"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-muted transition-colors group-hover:bg-primary-600/10 group-hover:text-primary-600 dark:bg-white/[0.06] dark:group-hover:text-primary-400">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-8 pb-4">
        {messages.map((msg, index) => {
          const isLast = index === messages.length - 1;
          const isUser = msg.role === 'user';

          if (isUser) {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[82%] space-y-2.5 rounded-[22px] rounded-br-md border border-black/[0.07] bg-white/85 px-4 py-3 text-[15px] leading-relaxed text-fg shadow-sm backdrop-blur-md dark:border-white/[0.09] dark:bg-white/[0.09] sm:max-w-[72%]">
                  {msg.attachments && msg.attachments.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {msg.attachments.map((att) => (
                        <AuthAttachmentThumb
                          key={att.id}
                          att={att}
                          onOpenLightbox={(url, name) => setLightbox({ url, name })}
                        />
                      ))}
                    </div>
                  ) : null}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            );
          }

          const showQuickActions =
            isLast && !isStreaming && msg.status === 'complete' && msg.content.length > 0;
          const showRetry =
            isLast && !isStreaming && (msg.status === 'partial' || msg.status === 'error');

          return (
            <div key={msg.id} className="group flex items-start gap-3.5 sm:gap-4">
              <div
                aria-hidden="true"
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full liquid-glass-subtle text-primary-600 dark:text-primary-400"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-muted">
                  <span className="text-fg/80">AWAL</span>
                </div>

                {msg.content ? (
                  <MarkdownContent content={msg.content} />
                ) : isStreaming && isLast ? (
                  <div className="flex items-center gap-2 py-1 text-sm text-muted">
                    <span className="inline-flex items-center gap-1" aria-hidden="true">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500 [animation-delay:300ms]" />
                    </span>
                    <span>Thinking...</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted italic">No response generated.</p>
                )}

                {msg.status === 'partial' && !isStreaming ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Response stopped early.</span>
                  </div>
                ) : null}

                {msg.status === 'error' && !isStreaming ? (
                  <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>The AI service hit an error.</span>
                  </div>
                ) : null}

                {msg.sources && msg.sources.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted">
                    <BookOpen className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    <span className="font-medium">Sources:</span>
                    {msg.sources.map((src, sIdx) => (
                      <span
                        key={`${src.filename}-${src.section}-${sIdx}`}
                        className="liquid-glass-subtle rounded-lg px-2 py-0.5 text-[11px] text-fg/80"
                      >
                        {src.filename} (§{src.section})
                      </span>
                    ))}
                  </div>
                ) : null}

                {msg.content && !(isStreaming && isLast) ? (
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    <CopyMessageButton text={msg.content} />
                    {isLast ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={onRetryLast}
                        className="h-7 rounded-lg px-2 text-xs font-medium text-muted hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        {showRetry ? 'Retry' : 'Regenerate'}
                      </Button>
                    ) : null}
                  </div>
                ) : showRetry ? (
                  <Button type="button" size="sm" variant="ghost" onClick={onRetryLast}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Retry
                  </Button>
                ) : null}

                {showQuickActions ? (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {QUICK_ACTIONS.map((qa) => (
                      <button
                        key={qa.id}
                        type="button"
                        onClick={() => onQuickAction(qa.id)}
                        className="liquid-glass-subtle rounded-full px-3 py-1 text-xs font-medium text-muted transition-all hover:border-primary-400/50 hover:text-fg"
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <Modal
        open={Boolean(lightbox)}
        onClose={() => setLightbox(null)}
        title={lightbox?.name ?? 'Image preview'}
        className="max-w-3xl"
      >
        {lightbox ? (
          <div className="p-4">
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

