import { forwardRef, type SelectHTMLAttributes } from 'react';

export type SelectSize = 'sm' | 'md';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Visual size — distinct from the native `size` attribute (visible row count), which this
   *  console never uses. */
  size?: SelectSize;
}

const SIZE: Record<SelectSize, string> = {
  sm: 'py-1 pl-2 pr-6 text-xs',
  md: 'py-2 pl-3 pr-8 text-sm',
};

const CHEVRON_SIZE: Record<SelectSize, string> = {
  sm: 'right-1.5 h-3 w-3',
  md: 'right-2.5 h-3.5 w-3.5',
};

/**
 * A bare `<select>` renders the OS's own arrow glyph, which is the one control in the console
 * that couldn't be made to match `--ink`/`--rule` — this hides that glyph (`appearance-none`)
 * and draws the same hairline chevron the sidebar already uses, so a dropdown reads as part of
 * this design system rather than a stock browser widget. Still a native `<select>` underneath:
 * no custom listbox, so keyboard and screen-reader behavior stay exactly what they already were.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 'md', className = '', disabled, ...rest },
  ref,
) {
  return (
    <span className={`relative inline-block ${disabled ? 'opacity-50' : ''} ${className}`}>
      <select
        ref={ref}
        disabled={disabled}
        className={`w-full appearance-none rounded-md border border-[var(--rule)] bg-[var(--paper)] ${SIZE[size]} text-[var(--ink)] focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20 disabled:cursor-not-allowed`}
        {...rest}
      />
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--muted)] ${CHEVRON_SIZE[size]}`}
      >
        <path d="M5.5 8 10 12.5 14.5 8" />
      </svg>
    </span>
  );
});
