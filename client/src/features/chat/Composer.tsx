import {
  Camera,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Send,
  Square,
  X,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Button } from '../../design';
import { CameraCaptureModal } from './CameraCaptureModal';
import type { AiAction, MessageAttachment } from './chatApi';
import { formatBytes } from './imagePrep';

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
  status: 'uploading' | 'ready' | 'error';
  error?: string;
  uploaded?: MessageAttachment;
}

interface ComposerProps {
  disabled?: boolean;
  isStreaming: boolean;
  attachments: DraftAttachment[];
  onFilesSelected: (files: File[]) => void;
  onRemoveAttachment: (localId: string) => void;
  onSend: (content: string, action: AiAction | null) => void;
  onStop: () => void;
}

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
  onSend,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [action, setAction] = useState<AiAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const docInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const mobileCamRef = useRef<HTMLInputElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

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

  const hasUploading = attachments.some((a) => a.status === 'uploading');
  const hasReadyAttachment = attachments.some((a) => a.status === 'ready');
  const canSend =
    !disabled &&
    !isStreaming &&
    !hasUploading &&
    (Boolean(text.trim()) || Boolean(action) || hasReadyAttachment);

  const submit = () => {
    if (!canSend) return;
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
    <form onSubmit={handleSubmit} className="border-t border-line bg-surface p-3 sm:p-4 space-y-2.5">
      {attachments.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2" aria-label="Selected attachments">
            {attachments.map((att) => (
              <div
                key={att.localId}
                className={`relative flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                  att.status === 'error'
                    ? 'border-danger/50 bg-danger/10 text-danger'
                    : 'border-line bg-bg text-fg'
                }`}
              >
                {att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.file.name}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <FileText className="h-5 w-5 shrink-0 text-primary-600" aria-hidden="true" />
                )}
                <div className="min-w-0 max-w-[160px]">
                  <p className="truncate font-medium">{att.file.name}</p>
                  <p className="text-[11px] text-muted">
                    {att.status === 'uploading'
                      ? `Uploading ${att.progress}%`
                      : att.status === 'error'
                        ? att.error ?? 'Upload failed'
                        : formatBytes(att.file.size)}
                  </p>
                  {att.status === 'uploading' ? (
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface2">
                      <div
                        className="h-full bg-primary-600 transition-all"
                        style={{ width: `${att.progress}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${att.file.name}`}
                  onClick={() => onRemoveAttachment(att.localId)}
                  className="rounded p-0.5 text-muted hover:bg-surface2 hover:text-fg"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
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
                  className="rounded-full border border-primary-300 bg-primary-50/70 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-300"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick actions">
        {ACTION_OPTIONS.map((opt) => {
          const selected = action === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled || isStreaming}
              aria-pressed={selected}
              onClick={() => setAction(selected ? null : opt.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                selected
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-line bg-bg text-muted hover:text-fg'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="relative flex items-end gap-2">
        <div ref={menuContainerRef} className="relative">
          <button
            type="button"
            disabled={disabled || isStreaming || attachments.length >= 5}
            aria-label="Attach file, image, or photo"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-bg text-muted transition-colors hover:bg-surface2 hover:text-fg disabled:opacity-50"
          >
            <Paperclip className="h-5 w-5" aria-hidden="true" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              aria-label="Attachment options"
              className="absolute bottom-full left-0 z-20 mb-2 max-h-60 w-56 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  docInputRef.current?.click();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-surface2"
              >
                <FileText className="h-4 w-4 text-primary-600" aria-hidden="true" />
                Upload file (PDF, DOCX...)
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  imgInputRef.current?.click();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-surface2"
              >
                <ImageIcon className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Upload image
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleTakePhoto}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-surface2"
              >
                <Camera className="h-4 w-4 text-amber-600" aria-hidden="true" />
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

        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || isStreaming}
          placeholder="Ask AWAL anything, paste an image, or drop files... (Enter to send)"
          aria-label="Message to AWAL"
          className="min-h-[44px] max-h-40 flex-1 resize-y rounded-xl border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-primary-500 focus:outline-none disabled:opacity-60"
        />

        {isStreaming ? (
          <Button type="button" variant="secondary" onClick={onStop} aria-label="Stop generating">
            <Square className="h-4 w-4" aria-hidden="true" />
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!canSend} aria-label="Send message">
            <Send className="h-4 w-4" aria-hidden="true" />
            Send
          </Button>
        )}
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => onFilesSelected([file])}
      />
    </form>
  );
}
