import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { Button } from '../components/ui/Button.js';

interface TaxonomyItem {
  id: string;
  name: string;
  slug: string;
}

export interface TaxonomyApi {
  list(): Promise<TaxonomyItem[]>;
  create(name: string): Promise<TaxonomyItem>;
  update(id: string, name: string): Promise<TaxonomyItem>;
  remove(id: string): Promise<void>;
}

const MAX_STAGGERED_ROWS = 8;
const STAGGER_STEP_MS = 40;

/**
 * Category and anak usaha management share this one screen shape — both are `{id, name, slug}`
 * CRUD gated on their own permission (specs/category-management/spec.md - "Permission-gated ...
 * endpoints"). Shown only to callers holding the matching permission — enforced by the server;
 * this screen reacts to a 403 rather than pre-computing who may see it.
 */
export function TaxonomyManagementPage({
  title,
  singularLabel,
  api,
}: {
  title: string;
  singularLabel: string;
  api: TaxonomyApi;
}) {
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [createState, runCreate] = useAsyncAction((name: string) => api.create(name));
  const [updateState, runUpdate] = useAsyncAction((id: string, name: string) => api.update(id, name));
  const [removeState, runRemove] = useAsyncAction((id: string) => api.remove(id));

  function load() {
    setLoading(true);
    api
      .list()
      .then(setItems)
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [api]);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const created = await runCreate(newName.trim());
      setItems((prev) => [...prev, created]);
      setNewName('');
    } catch {
      /* surfaced via createState.errorMessage */
    }
  }

  function startEdit(item: TaxonomyItem) {
    setEditingId(item.id);
    setEditingName(item.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName('');
  }

  async function handleSaveEdit(id: string) {
    if (!editingName.trim()) return;
    try {
      const updated = await runUpdate(id, editingName.trim());
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setEditingId(null);
    } catch {
      /* surfaced via updateState.errorMessage */
    }
  }

  async function handleRemove(id: string) {
    if (!window.confirm('Delete this? Articles keep their other associations.')) return;
    try {
      await runRemove(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      /* surfaced via removeState.errorMessage */
    }
  }

  const forbidden = createState.forbidden || updateState.forbidden || removeState.forbidden;

  return (
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-6">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">
            {items.length} defined
          </p>
          <h1 className="font-display text-3xl">{title}</h1>
        </div>

        {forbidden && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to manage {title.toLowerCase()}.
          </p>
        )}

        <div className="mb-6">
          <label htmlFor="new-taxonomy-name" className="mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]">
            New {singularLabel}
          </label>
          <div className="flex gap-2">
            <input
              id="new-taxonomy-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder={`${singularLabel} name`}
              className="flex-1 rounded-md border border-[var(--rule)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted)]/60 focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20"
            />
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={createState.loading || !newName.trim()}
              className="shrink-0"
            >
              {createState.loading ? 'Adding…' : 'Add'}
            </Button>
          </div>
          {createState.errorMessage && !createState.forbidden && (
            <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{createState.errorMessage}</p>
          )}
        </div>

        {loadError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {loadError}
          </p>
        )}
        {loading && <p className="font-mono text-sm text-[var(--muted)]">Loading…</p>}

        {!loading && !loadError && items.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No {title.toLowerCase()} yet. Add the first one above.</p>
        )}

        <ul className="space-y-1">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="motion-safe:animate-[fadeInUp_0.4s_ease_forwards] motion-safe:opacity-0"
              style={{ animationDelay: `${Math.min(index, MAX_STAGGERED_ROWS) * STAGGER_STEP_MS}ms` }}
            >
              {editingId === item.id ? (
                <div className="flex items-center gap-2 rounded-lg py-2 pl-3 pr-2">
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(item.id)}
                    autoFocus
                    className="flex-1 rounded-md border border-[var(--rule)] bg-transparent px-2.5 py-1.5 text-sm focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20"
                  />
                  <Button
                    variant="ghost"
                    onClick={() => handleSaveEdit(item.id)}
                    disabled={updateState.loading}
                    className="shrink-0"
                  >
                    Save
                  </Button>
                  <Button variant="ghost" onClick={cancelEdit} className="shrink-0">
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg py-2.5 pl-3 pr-2 transition-colors hover:bg-[var(--ink)]/[0.03]">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--ink)]">{item.name}</p>
                    <p className="truncate font-mono text-xs text-[var(--muted)]">{item.slug}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Button variant="ghost" onClick={() => startEdit(item)}>
                      Rename
                    </Button>
                    <Button variant="ghost" tone="danger" onClick={() => handleRemove(item.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {removeState.errorMessage && !removeState.forbidden && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{removeState.errorMessage}</p>
        )}
        {updateState.errorMessage && !updateState.forbidden && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{updateState.errorMessage}</p>
        )}
      </div>
    </div>
  );
}
