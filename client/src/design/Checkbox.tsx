import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  id?: string;
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { id, label, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-fg/90',
        className,
      )}
    >
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="h-4 w-4 rounded border-line bg-surface2/50 accent-primary-600 text-primary-600 transition-colors focus:ring-primary-500"
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
});

