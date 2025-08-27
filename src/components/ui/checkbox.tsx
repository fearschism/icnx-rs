import * as React from 'react';
import { cn } from '../../lib/utils';

export type CheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ checked, onCheckedChange, disabled, className }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          'inline-flex h-4 w-4 items-center justify-center rounded-sm border border-[var(--panel-border)] bg-[var(--panel)] text-[var(--primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50',
          checked ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : '',
          className
        )}
      >
        {checked ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-white"
          >
            <path
              d="M1 5L4 8L11 1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </button>
    );
  }
);
Checkbox.displayName = 'Checkbox';


