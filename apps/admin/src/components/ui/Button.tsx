import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonTone = 'default' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]/40 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50';

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
};

/** Ghost is an inline text action (Edit / Delete / Cancel / Active toggle), never boxed — it
 *  takes its size from the surrounding row, not from `size`. */
const GHOST = 'font-mono text-xs uppercase tracking-wide rounded-sm';

function variantClasses(variant: ButtonVariant, tone: ButtonTone): string {
  const danger = tone === 'danger';
  if (variant === 'primary') {
    return danger
      ? 'bg-red-600 font-medium text-white hover:bg-red-700'
      : 'bg-[var(--signal)] font-medium text-white hover:bg-[var(--signal-hover)]';
  }
  if (variant === 'secondary') {
    return danger
      ? 'border border-red-300 font-medium text-red-600 hover:border-red-400 dark:border-red-800 dark:text-red-400'
      : 'border border-[var(--rule)] font-medium text-[var(--ink)] hover:border-[var(--ink)]/30';
  }
  return danger
    ? 'text-[var(--muted)] hover:text-red-600 dark:hover:text-red-400'
    : 'text-[var(--muted)] hover:text-[var(--ink)]';
}

/**
 * The one button primitive for the admin console, covering every shape already in use across
 * the app (`git grep 'bg-\[var(--signal)\]'` / `'uppercase tracking-wide'` before this component
 * existed): a filled `primary` per view, an outlined `secondary` for a lower-emphasis action
 * (Preview, Focus mode), and an unboxed `ghost` for row-level actions (Edit, Delete, Active).
 * `ghost` previously had no focus-visible ring anywhere in the app — ` rounded-sm` plus the
 * shared `focus-visible:ring` in `BASE` is a real accessibility fix, not decoration.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', tone = 'default', size = 'md', className = '', type = 'button', ...rest },
  ref,
) {
  const shape = variant === 'ghost' ? GHOST : `${SIZE[size]} rounded-md`;
  return (
    <button
      ref={ref}
      type={type}
      className={`${BASE} ${shape} ${variantClasses(variant, tone)} ${className}`.trim()}
      {...rest}
    />
  );
});
