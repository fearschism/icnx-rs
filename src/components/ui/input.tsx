import * as React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn('flex h-10 w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--muted)] outline-none focus:ring-2 focus:ring-[var(--primary)]', className)}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };


