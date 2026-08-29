import type { ReactNode } from 'react';

/** The one shared trigger+popover shell behind Anak usaha, Kategori, and Tanggal. */
export function FilterTrigger({
  label,
  valueLabel,
  active,
  open,
  onToggle,
  children,
}: {
  label: string;
  valueLabel?: string | undefined;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <span className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-2 whitespace-nowrap border border-ink px-3.5 py-2 font-sans text-[11px] font-bold uppercase tracking-widest ${
          open ? 'bg-ink text-paper' : active ? 'bg-signal text-ink' : 'bg-transparent text-ink'
        }`}
      >
        {label} {valueLabel !== undefined && <span className="flex-none">{valueLabel}</span>} ▾
      </button>
      {open && (
        <span className="absolute left-0 top-[calc(100%+6px)] z-40 block min-w-[240px] border border-ink bg-paper p-3.5">
          {children}
        </span>
      )}
    </span>
  );
}

export function FilterOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 border-b border-rule py-2 text-left text-[13px] transition-[border-bottom-width,border-color] duration-hover ease-hover hover:border-b-[3px] hover:border-ink focus-visible:border-b-[3px] focus-visible:border-ink"
    >
      <span
        className={`h-3 w-3 flex-none border border-ink ${selected ? 'bg-ink' : 'bg-transparent'}`}
      />
      <span className="mark-group">{label}</span>
    </button>
  );
}
