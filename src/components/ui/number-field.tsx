// no React import needed with jsx: 'react-jsx'
import { cn } from '../../lib/utils';

type Props = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
};

export function NumberField({ value, onChange, min, max, step = 1, className }: Props) {
  const clamp = (n: number) => {
    if (typeof min === 'number' && n < min) return min;
    if (typeof max === 'number' && n > max) return max;
    return n;
  };
  const set = (n: number) => onChange(clamp(n));
  return (
    <div className={cn('flex h-10 w-full items-stretch rounded-md border border-[var(--panel-border)] bg-[var(--panel)]', className)}>
      <button
        type="button"
        className="px-3 border-r border-[var(--panel-border)] text-[var(--text)] hover:bg-[var(--panel-border)]"
        onClick={() => set(value - step)}
      >
        −
      </button>
      <input
        type="text"
        className="flex-1 bg-transparent px-3 text-sm text-[var(--text)] placeholder-[var(--muted)] outline-none"
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(e) => {
          const raw = e.target.value.trim();
          const num = Number(raw);
          if (!Number.isNaN(num)) set(num);
          if (raw === '') onChange(NaN as any);
        }}
        onBlur={(e) => {
          const num = Number(e.target.value);
          if (!Number.isNaN(num)) set(num);
        }}
      />
      <button
        type="button"
        className="px-3 border-l border-[var(--panel-border)] text-[var(--text)] hover:bg-[var(--panel-border)]"
        onClick={() => set(value + step)}
      >
        +
      </button>
    </div>
  );
}


