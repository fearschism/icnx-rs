import * as React from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border bg-[var(--panel)] border-[var(--panel-border)] shadow-sm p-6', className)} {...props} />;
}


