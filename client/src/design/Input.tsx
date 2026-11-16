import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

interface FieldChromeProps {
  label: string;
  hint?: ReactNode;
  /** Error message; sets aria-invalid and is announced via aria-describedby. */
  error?: string;
}

const controlClasses = (error?: string) =>
  cn(
    'w-full rounded-md border bg-surface px-3 text-fg placeholder:text-muted/70',
    'transition duration-fast ease-soft',
    'focus-visible:ring-offset-0',
    error ? 'border-danger' : 'border-line hover:border-primary-300',
    'disabled:cursor-not-allowed disabled:opacity-60',
  );

function Chrome({
  id,
  label,
  hint,
  error,
  children,
}: FieldChromeProps & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint: ReactNode, error?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>,
    FieldChromeProps {
  id?: string;
}

/** Labelled text input; forwards ref so it works with react-hook-form's register(). */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, hint, error, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Chrome id={inputId} label={label} hint={hint} error={error}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={cn(controlClasses(error), 'h-11', className)}
        {...rest}
      />
    </Chrome>
  );
});

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>,
    FieldChromeProps {
  id?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { id, label, hint, error, className, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Chrome id={inputId} label={label} hint={hint} error={error}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={cn(controlClasses(error), 'py-2.5', className)}
        {...rest}
      />
    </Chrome>
  );
});

