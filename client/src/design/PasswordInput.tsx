import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface PasswordInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'type'
> {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
}

/** Labelled password field with an accessible show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ id, label, hint, error, leftIcon, className, ...rest }, ref) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const [visible, setVisible] = useState(false);

    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-[13px] font-medium text-fg">
          {label}
        </label>
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
            type={visible ? 'text' : 'password'}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              'h-11 w-full rounded-xl border bg-surface2/40 pl-3.5 pr-11 text-sm text-fg placeholder:text-muted/65',
              'transition duration-fast ease-soft focus:bg-surface focus-visible:ring-offset-0',
              error
                ? 'border-danger focus:border-danger'
                : 'border-line hover:border-primary-300 focus:border-primary-500',
              'disabled:cursor-not-allowed disabled:opacity-60',
              leftIcon ? 'pl-10' : '',
              className,
            )}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="absolute inset-y-1.5 right-2 flex w-8 items-center justify-center rounded-full text-muted transition duration-fast hover:bg-surface2 hover:text-fg"
          >
            {visible ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-sm text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
