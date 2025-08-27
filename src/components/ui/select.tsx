import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cn } from '../../lib/utils';

export const Select = SelectPrimitive.Root;

export const SelectGroup = SelectPrimitive.Group;

export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Trigger
		ref={ref}
		className={cn(
			'inline-flex h-9 w-full items-center justify-between rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] px-3 text-sm text-[var(--text)] placeholder-[var(--muted)] shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--primary)] hover:border-[var(--primary)]',
			className
		)}
		{...props}
	>
		{children}
	</SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectContent = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Portal>
		<SelectPrimitive.Content
			ref={ref}
			className={cn(
				'z-[9999] min-w-[10rem] overflow-hidden rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] text-[var(--text)] shadow-xl backdrop-blur',
				className
			)}
			{...props}
		>
			<SelectPrimitive.Viewport className="py-1">
				{children}
			</SelectPrimitive.Viewport>
		</SelectPrimitive.Content>
	</SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectItem = React.forwardRef<
	React.ElementRef<typeof SelectPrimitive.Item>,
	React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
	<SelectPrimitive.Item
		ref={ref}
		className={cn(
			'relative flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none transition-colors focus:bg-[var(--panel-border)] data-[state=checked]:bg-[var(--panel-border)] hover:bg-white/5',
			className
		)}
		{...props}
	>
		<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
	</SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;


