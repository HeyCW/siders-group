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
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.length === 0 && <span className="text-xs text-gray-400">None defined yet</span>}
        {options.map((option) => {
          const active = selectedIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => toggle(option.id)}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                active
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/40 dark:text-blue-300'
                  : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
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
