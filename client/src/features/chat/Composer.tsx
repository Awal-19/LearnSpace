import {
  ArrowUp,
  Camera,
  FileText,
  Image as ImageIcon,
  Mic,
  MicOff,
  Paperclip,
  RotateCcw,
  Square,
  X,
} from 'lucide-react';
import {
  memo,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { CameraCaptureModal } from './CameraCaptureModal';
import type { AiAction, MessageAttachment } from './chatApi';
import { formatBytes } from './imagePrep';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ACTION_OPTIONS: Array<{ id: AiAction; label: string }> = [
  { id: 'explain_simple', label: 'Explain simply' },
  { id: 'example', label: 'Give an example' },
  { id: 'quiz_me', label: 'Quiz me' },
  { id: 'summarize', label: 'Summarize' },
];

const ATTACHMENT_QUICK_PROMPTS = [
  'Explain this',
  'Summarize',
  'Solve this problem',
  'Extract the text',
  'Make flashcards from this',
  'Quiz me on this',
];

export interface DraftAttachment {
  localId: string;
  file: File;
  previewUrl?: string;
  kind: 'image' | 'document';
  progress: number;
  status: 'preparing' | 'uploading' | 'ready' | 'error';
  showPreparing?: boolean;
  error?: string;
  uploaded?: MessageAttachment;
}

interface ComposerProps {
  disabled?: boolean;
  isStreaming: boolean;
  isEmptyConversation?: boolean;
  attachments: DraftAttachment[];
  prefillText?: string;
  onPrefillConsumed?: () => void;
  onFilesSelected: (files: File[]) => void;
  onRemoveAttachment: (localId: string) => void;
  onRetryAttachment?: (localId: string) => void;
  onSend: (content: string, action: AiAction | null) => void;
  onStop: () => void;
}

const DraftAttachmentChip = memo(function DraftAttachmentChip({
  att,
  onRemove,
  onRetry,
}: {
  att: DraftAttachment;
  onRemove: (localId: string) => void;
  onRetry?: (localId: string) => void;
}) {
  const isBusy = att.status === 'uploading' || att.status === 'preparing';
  const statusText =
    att.status === 'preparing'
      ? att.showPreparing
        ? 'Preparing...'
        : formatBytes(att.file.size)
      : att.status === 'uploading'
        ? `Uploading ${att.progress}%`
        : att.status === 'error'
          ? (att.error ?? 'Upload failed')
          : formatBytes(att.file.size);

  return (
    <div
      className={`motion-safe:animate-fade-up relative flex h-14 items-center gap-2.5 rounded-xl border px-2 py-1.5 text-xs shadow-sm ${
        att.status === 'error'
          ? 'border-danger/50 bg-danger/10 text-danger'
          : 'border-line/80 bg-app text-fg dark:bg-surface'
      }`}
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-50 dark:bg-surface2">
        {att.previewUrl ? (
          <img src={att.previewUrl} alt={att.file.name} className="h-full w-full object-cover" />
        ) : (
          <FileText className="h-5 w-5 text-primary-600 dark:text-primary-400" aria-hidden="true" />
        )}
        {isBusy ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/55 px-1">
            <span className="text-[10px] font-semibold text-white tabular-nums">
              {att.status === 'preparing' && att.showPreparing ? '...' : `${att.progress}%`}
            </span>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full bg-white transition-[width] duration-100 motion-reduce:transition-none"
                style={{ width: `${att.progress}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="w-[132px] min-w-0">
        <p className="truncate font-medium">{att.file.name}</p>
        <p className="truncate text-[11px] text-muted" title={statusText}>
          {statusText}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {att.status === 'error' && onRetry ? (
          <button
            type="button"
            aria-label={`Retry ${att.file.name}`}
            onClick={() => onRetry(att.localId)}
            className="rounded-lg p-1 text-danger hover:bg-danger/15"
            title="Retry upload"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={`Remove ${att.file.name}`}
          onClick={() => onRemove(att.localId)}
          className="rounded-lg p-1 text-muted hover:bg-surface2 hover:text-fg"
          title={isBusy ? 'Cancel upload' : 'Remove'}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
});

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function Composer({
  disabled,
  isStreaming,
  isEmptyConversation = false,
  attachments,
  prefillText,
  onPrefillConsumed,
  onFilesSelected,
  onRemoveAttachment,
  onRetryAttachment,
  onSend,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [action, setAction] = useState<AiAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (!prefillText) return;
    setText(prefillText);
    onPrefillConsumed?.();
  }, [prefillText, onPrefillConsumed]);

  const docInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const mobileCamRef = useRef<HTMLInputElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const speechSupported = getSpeechRecognitionCtor() !== null;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Auto-grow up to ~5 lines (120px) and then scroll internally
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const updateInset = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setKeyboardInset(inset > 80 ? inset : 0);
    };
    updateInset();
    vv.addEventListener('resize', updateInset);
    vv.addEventListener('scroll', updateInset);
    return () => {
      vv.removeEventListener('resize', updateInset);
      vv.removeEventListener('scroll', updateInset);
    };
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const hasUploading = attachments.some(
    (a) => a.status === 'uploading' || a.status === 'preparing',
  );
  const hasReadyAttachment = attachments.some((a) => a.status === 'ready');
  const canSend =
    !disabled &&
    !isStreaming &&
    !hasUploading &&
    (Boolean(text.trim()) || Boolean(action) || hasReadyAttachment);

  const toggleVoiceInput = () => {
    if (listening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i]?.isFinal) {
          transcript += event.results[i]?.[0]?.transcript ?? '';
        }
      }
      if (transcript.trim()) {
        setText((prev) => (prev ? `${prev.trimEnd()} ${transcript.trim()}` : transcript.trim()));
      }
    };
    recognition.onerror = () => {
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const submit = () => {
    if (!canSend) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
    }
    onSend(text.trim(), action);
    setText('');
    setAction(null);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // On desktop, Enter sends and Shift+Enter adds a newline.
    // On touch/mobile devices, Enter adds a newline and the Send button submits.
    if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice()) {
      e.preventDefault();
      submit();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const pastedImages: File[] = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) pastedImages.push(f);
      }
    }
    if (pastedImages.length > 0) {
      e.preventDefault();
      onFilesSelected(pastedImages);
    }
  };

  const handleTakePhoto = () => {
    setMenuOpen(false);
    if (isTouchDevice()) {
      mobileCamRef.current?.click();
    } else {
      setCameraOpen(true);
    }
  };

  const showQuickActions = isFocused || isEmptyConversation || action !== null;

  return (
    <form
      onSubmit={handleSubmit}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsFocused(false);
        }
      }}
      style={{
        paddingBottom:
          keyboardInset > 0 ? `${keyboardInset}px` : 'max(0.5rem, env(safe-area-inset-bottom))',
      }}
      className="shrink-0 bg-gradient-to-t from-surface via-surface/95 to-transparent px-3 pt-1.5 sm:px-6 sm:pb-3"
    >
      <div className="mx-auto w-full max-w-3xl space-y-1.5">
        {showQuickActions ? (
          <div
            className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 sm:justify-center"
            role="group"
            aria-label="Quick actions"
          >
            {ACTION_OPTIONS.map((opt) => {
              const selected = action === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled || isStreaming}
                  aria-pressed={selected}
                  onClick={() => setAction(selected ? null : opt.id)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    selected
                      ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                      : 'border-line/80 bg-surface text-muted shadow-sm hover:border-primary-300 hover:text-primary-600 dark:bg-surface2 dark:hover:text-primary-300'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="rounded-[22px] border border-line/90 bg-surface p-2 shadow-[0_8px_30px_-10px_rgba(15,23,42,0.09)] transition-all focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-500/10 dark:bg-surface2/80 sm:p-2.5">
          {attachments.length > 0 ? (
            <div className="mb-2 max-h-28 space-y-1.5 overflow-y-auto px-1">
              <div className="flex flex-wrap gap-2" aria-label="Selected attachments">
                {attachments.map((att) => (
                  <DraftAttachmentChip
                    key={att.localId}
                    att={att}
                    onRemove={onRemoveAttachment}
                    onRetry={onRetryAttachment}
                  />
                ))}
              </div>

              {hasReadyAttachment && !isStreaming ? (
                <div
                  className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5"
                  aria-label="Attachment quick actions"
                >
                  {ATTACHMENT_QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={hasUploading || disabled}
                      onClick={() => {
                        onSend(prompt, null);
                        setText('');
                        setAction(null);
                      }}
                      className="shrink-0 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100 dark:border-primary-500/30 dark:bg-primary-500/15 dark:text-primary-300"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled || isStreaming}
            placeholder="Ask AWAL anything, paste an image, or drop files..."
            aria-label="Message to AWAL"
            className="min-h-[38px] max-h-[120px] w-full resize-none overflow-y-auto border-0 bg-transparent px-2.5 py-1 text-[15px] leading-relaxed text-fg placeholder:text-muted focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-60"
          />

          <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
            <div ref={menuContainerRef} className="relative flex items-center gap-1">
              <button
                type="button"
                disabled={disabled || isStreaming || attachments.length >= 5}
                aria-label="Attach file, image, or photo"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-primary-50 hover:text-primary-600 disabled:opacity-40 dark:hover:bg-white/[0.08] dark:hover:text-primary-400"
              >
                <Paperclip className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  aria-label="Attachment options"
                  className="absolute bottom-full left-0 z-20 mb-2 max-h-60 w-56 overflow-y-auto rounded-2xl border border-line bg-surface p-1.5 shadow-xl dark:bg-surface2"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      docInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-primary-50/70 hover:text-primary-700 dark:hover:bg-white/[0.08]"
                  >
                    <FileText
                      className="h-4 w-4 text-primary-600 dark:text-primary-400"
                      aria-hidden="true"
                    />
                    Upload file (PDF, DOCX...)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      imgInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-primary-50/70 hover:text-primary-700 dark:hover:bg-white/[0.08]"
                  >
                    <ImageIcon
                      className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    Upload image
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleTakePhoto}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-primary-50/70 hover:text-primary-700 dark:hover:bg-white/[0.08]"
                  >
                    <Camera className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                    Take photo
                  </button>
                </div>
              ) : null}

              <input
                ref={docInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.pptx,.csv,application/pdf,text/plain,text/csv"
                className="sr-only"
                aria-label="Choose document files"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (files.length > 0) onFilesSelected(files);
                }}
              />
              <input
                ref={imgInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,.heic"
                className="sr-only"
                aria-label="Choose image files"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (files.length > 0) onFilesSelected(files);
                }}
              />
              <input
                ref={mobileCamRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label="Capture photo with camera"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (files.length > 0) onFilesSelected(files);
                }}
              />
            </div>

            <div className="flex items-center gap-1.5">
              {speechSupported ? (
                <button
                  type="button"
                  disabled={disabled || isStreaming}
                  onClick={toggleVoiceInput}
                  aria-label={listening ? 'Stop voice input' : 'Voice input'}
                  title={listening ? 'Stop listening' : 'Dictate message'}
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                    listening
                      ? 'bg-danger/15 text-danger animate-pulse'
                      : 'text-muted hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-white/[0.08] dark:hover:text-primary-400'
                  }`}
                >
                  {listening ? (
                    <MicOff className="h-[18px] w-[18px]" aria-hidden="true" />
                  ) : (
                    <Mic className="h-[18px] w-[18px]" aria-hidden="true" />
                  )}
                </button>
              ) : null}

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Stop generating"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm transition-opacity hover:bg-primary-700"
                >
                  <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label="Send message"
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                    canSend
                      ? 'bg-primary-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.32)] hover:scale-[1.03] hover:bg-primary-700'
                      : 'bg-surface2 text-muted/60 dark:bg-white/[0.08]'
                  }`}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        {text.trim().length === 0 ? (
          <p className="hidden text-center text-[11px] text-muted/80 sm:block">
            AWAL can make mistakes. Verify important details.
          </p>
        ) : null}
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => onFilesSelected([file])}
      />
    </form>
  );
}
