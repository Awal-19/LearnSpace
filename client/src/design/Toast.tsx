import { CheckCircle2, Info, XCircle } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from './cn';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  dedupeKey?: string;
}

interface ToastApi {
  show: (toast: Omit<Toast, 'id' | 'kind'> & { kind?: ToastKind }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons = { success: CheckCircle2, error: XCircle, info: Info };
const accents: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-info',
};

const DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>(
    ({ kind = 'info', dedupeKey, ...toast }) => {
      const key = dedupeKey ?? `${kind}:${toast.title}`;
      const id = nextId.current++;
      setToasts((current) => {
        const existing = current.find((t) => (t.dedupeKey ?? `${t.kind}:${t.title}`) === key);
        if (existing) {
          const oldTimer = timers.current.get(existing.id);
          if (oldTimer !== undefined) {
            window.clearTimeout(oldTimer);
            timers.current.delete(existing.id);
          }
          const updated = { id, kind, dedupeKey: key, ...toast };
          return current.map((t) => (t.id === existing.id ? updated : t));
        }
        return [...current.slice(-3), { id, kind, dedupeKey: key, ...toast }];
      });
      const timer = window.setTimeout(() => dismiss(id), DURATION_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Announced politely to screen readers; sits above the mobile bottom nav */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6"
      >
        {toasts.map((toast) => {
          const Icon = icons[toast.kind];
          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-lg border border-line bg-surface p-4 shadow-lg"
            >
              <Icon
                className={cn('mt-0.5 h-5 w-5 shrink-0', accents[toast.kind])}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-sm text-muted">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded text-sm text-muted hover:text-fg"
              >
                Dismiss
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
