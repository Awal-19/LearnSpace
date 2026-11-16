import { AlertTriangle, Check, Copy, Download, FileText, RotateCcw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Modal, Spinner } from '../../design';
import {
  fetchAttachmentBlob,
  type AiAction,
  type ChatMessage,
  type MessageAttachment,
} from './chatApi';
import { formatBytes } from './imagePrep';
import { MarkdownContent } from './MarkdownContent';

const QUICK_ACTIONS: Array<{ id: AiAction; label: string }> = [
  { id: 'explain_simple', label: 'Explain simply' },
  { id: 'example', label: 'Give an example' },
  { id: 'quiz_me', label: 'Quiz me' },
  { id: 'summarize', label: 'Summarize' },
];

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onQuickAction: (action: AiAction) => void;
  onRetryLast: () => void;
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
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface2 hover:text-fg"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function AuthAttachmentThumb({
  att,
  onOpenLightbox,
}: {
  att: MessageAttachment;
  onOpenLightbox: (url: string, name: string) => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    if (att.kind === 'image') {
      fetchAttachmentBlob(att.url)
        .then((blob) => {
          if (!active) return;
          created = URL.createObjectURL(blob);
          setObjectUrl(created);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [att.kind, att.url]);

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
        className="overflow-hidden rounded-lg border border-white/20 bg-black/20"
      >
        {objectUrl ? (
          <img
            src={objectUrl}
            alt={att.originalName}
            className="h-24 w-24 object-cover transition-transform hover:scale-105"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center text-xs text-white/80">
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
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/20"
    >
      <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="max-w-[140px] truncate">{att.originalName}</span>
      <span className="opacity-75">({formatBytes(att.sizeBytes)})</span>
      <Download className="h-3 w-3 shrink-0" aria-hidden="true" />
    </button>
  );
}

export function MessageList({
  messages,
  isStreaming,
  onQuickAction,
  onRetryLast,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <div className="mb-3 rounded-full bg-primary-50 p-3 text-primary-600 dark:bg-primary-950/50 dark:text-primary-400">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-fg">Meet AWAL, your Academic AI Assistant</h2>
        <p className="mt-1 max-w-md text-sm text-muted">
          Ask AWAL for step-by-step explanations, math &amp; coding help, exam prep, or questions about your uploaded lecture notes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.map((msg, index) => {
          const isLast = index === messages.length - 1;
          const isUser = msg.role === 'user';

          if (isUser) {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] space-y-2 rounded-2xl rounded-br-sm bg-primary-600 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-sm sm:max-w-[75%]">
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
            <div key={msg.id} className="flex items-start gap-3">
              <div
                aria-hidden="true"
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600/10 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400"
              >
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                  AWAL
                </div>
                {msg.content ? (
                  <MarkdownContent content={msg.content} />
                ) : isStreaming && isLast ? (
                  <div className="flex items-center gap-2 py-1 text-sm text-muted">
                    <Spinner />
                    <span>AWAL is thinking...</span>
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
                  <span className="font-medium">Sources:</span>
                  {msg.sources.map((src, sIdx) => (
                    <span
                      key={`${src.filename}-${src.section}-${sIdx}`}
                      className="rounded-md bg-surface2 px-2 py-0.5 text-[11px]"
                    >
                      {src.filename} (§{src.section})
                    </span>
                  ))}
                </div>
              ) : null}

              {msg.content && !(isStreaming && isLast) ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <CopyMessageButton text={msg.content} />
                  {isLast ? (
                    <Button type="button" size="sm" variant="ghost" onClick={onRetryLast}>
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
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-line">
                  {QUICK_ACTIONS.map((qa) => (
                    <button
                      key={qa.id}
                      type="button"
                      onClick={() => onQuickAction(qa.id)}
                      className="rounded-full border border-line bg-bg px-3 py-1 text-xs font-medium text-fg transition-colors hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400"
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
              className="mx-auto max-h-[75vh] rounded-lg object-contain"
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

