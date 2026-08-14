export interface ChipOption {
  id: string;
  name: string;
}

/** A reusable multi-select rendered as toggleable chips — used for both categories and tags,
 *  which are structurally identical `{id, name, slug}` associations
 *  (specs/article-management/spec.md - "Articles carry multiple categories and multiple tags"). */
export function MultiSelectChips({
  label,
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  options: ChipOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 && <span className="text-xs text-[var(--muted)]">None defined yet</span>}
        {options.map((option) => {
          const active = selectedIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => toggle(option.id)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? 'border-[var(--signal)] bg-[var(--signal-soft)] text-[var(--signal)]'
                  : 'border-[var(--rule)] text-[var(--muted)] hover:border-[var(--ink)]/30 hover:text-[var(--ink)]'
              }`}
            >
              {option.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
