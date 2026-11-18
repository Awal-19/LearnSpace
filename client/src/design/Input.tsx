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
    'w-full rounded-xl border bg-surface2/40 px-3.5 text-sm text-fg placeholder:text-muted/65',
    'transition duration-fast ease-soft focus:bg-surface',
    'focus-visible:ring-offset-0',
    error
      ? 'border-danger focus:border-danger'
      : 'border-line hover:border-primary-300 focus:border-primary-500',
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
      <label htmlFor={id} className="block text-[13px] font-medium text-fg">
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
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>, FieldChromeProps {
  id?: string;
  leftIcon?: ReactNode;
}

/** Labelled text input; forwards ref so it works with react-hook-form's register(). */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, hint, error, leftIcon, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Chrome id={inputId} label={label} hint={hint} error={error}>
      <div className="relative">
        {leftIcon ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted"
          >
            {leftIcon}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, hint, error)}
          className={cn(controlClasses(error), 'h-11', leftIcon ? 'pl-10' : '', className)}
          {...rest}
        />
      </div>
    </Chrome>
  );
});

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>, FieldChromeProps {
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
