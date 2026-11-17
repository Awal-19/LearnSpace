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
  attachments: DraftAttachment[];
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
          ? att.error ?? 'Upload failed'
          : formatBytes(att.file.size);

  return (
    <div
      className={`motion-safe:animate-fade-up relative flex h-14 items-center gap-2.5 rounded-xl border px-2 py-1.5 text-xs ${
        att.status === 'error'
          ? 'border-danger/50 bg-danger/10 text-danger'
          : 'liquid-glass-subtle text-fg'
      }`}
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface2">
        {att.previewUrl ? (
          <img
            src={att.previewUrl}
            alt={att.file.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <FileText className="h-5 w-5 text-primary-600" aria-hidden="true" />
        )}
        {isBusy ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 px-1">
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

      <div className="min-w-0 w-[132px]">
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
            className="rounded p-1 text-danger hover:bg-danger/15"
            title="Retry upload"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={`Remove ${att.file.name}`}
          onClick={() => onRemove(att.localId)}
          className="rounded p-1 text-muted hover:bg-surface2 hover:text-fg"
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
  attachments,
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
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [text]);

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

  const hasUploading = attachments.some((a) => a.status === 'uploading' || a.status === 'preparing');
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
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 bg-gradient-to-t from-app via-app/95 to-transparent px-3 pb-3 pt-2 sm:px-6 sm:pb-4"
    >
      <div className="mx-auto w-full max-w-3xl space-y-2">
        <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Quick actions">
          {ACTION_OPTIONS.map((opt) => {
            const selected = action === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled || isStreaming}
                aria-pressed={selected}
                onClick={() => setAction(selected ? null : opt.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  selected
                    ? 'bg-fg text-app shadow-sm'
                    : 'liquid-glass-subtle text-muted hover:text-fg'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="liquid-glass rounded-[26px] p-2.5 transition-shadow focus-within:ring-2 focus-within:ring-primary-500/35 sm:p-3">
          {attachments.length > 0 ? (
            <div className="mb-2.5 space-y-2 px-1">
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
                <div className="flex flex-wrap gap-1.5" aria-label="Attachment quick actions">
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
                      className="rounded-full border border-primary-300/60 bg-primary-50/70 px-2.5 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100 dark:border-primary-800/70 dark:bg-primary-950/40 dark:text-primary-300"
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
            className="min-h-[42px] max-h-44 w-full resize-none border-0 bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-fg placeholder:text-muted focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-60"
          />

          <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
            <div ref={menuContainerRef} className="relative flex items-center gap-1">
              <button
                type="button"
                disabled={disabled || isStreaming || attachments.length >= 5}
                aria-label="Attach file, image, or photo"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/[0.05] hover:text-fg disabled:opacity-40 dark:hover:bg-white/[0.08]"
              >
                <Paperclip className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  aria-label="Attachment options"
                  className="liquid-glass absolute bottom-full left-0 z-20 mb-2 max-h-60 w-56 overflow-y-auto rounded-2xl p-1.5"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      docInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                  >
                    <FileText className="h-4 w-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
                    Upload file (PDF, DOCX...)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      imgInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                  >
                    <ImageIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    Upload image
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleTakePhoto}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
                  >
                    <Camera className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
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
                      : 'text-muted hover:bg-black/[0.05] hover:text-fg dark:hover:bg-white/[0.08]'
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
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-fg text-app shadow-sm transition-opacity hover:opacity-90"
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
                      ? 'bg-fg text-app shadow-sm hover:scale-[1.03] hover:opacity-90'
                      : 'bg-black/[0.06] text-muted/60 dark:bg-white/[0.08]'
                  }`}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted/80">
          AWAL can make mistakes. Verify important details with your course materials.
        </p>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => onFilesSelected([file])}
      />
    </form>
  );
}
