import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-50 disabled:pointer-events-none';
    const variants: Record<string, string> = {
      default: 'bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]',
      secondary: 'bg-[var(--panel)] text-[var(--text)] border border-[var(--panel-border)] hover:bg-[var(--panel-border)]',
      ghost: 'bg-transparent hover:bg-[var(--panel)] text-[var(--text)]',
    };
    const sizes: Record<string, string> = {
      default: 'h-10 px-4 py-2',
      sm: 'h-9 px-3',
      lg: 'h-11 px-6',
    };
    return (
      <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props} />
    );
  }
);
Button.displayName = 'Button';


