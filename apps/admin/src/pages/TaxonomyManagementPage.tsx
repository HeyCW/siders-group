import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';

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

/**
 * Category and tag management share this one screen shape — both are `{id, name, slug}` CRUD
 * gated on their own permission (specs/category-management/spec.md,
 * specs/tag-management/spec.md - "Permission-gated ... endpoints"; tasks.md 11.5). Shown only
 * to callers holding the matching permission — enforced by the server; this screen reacts to a
 * 403 rather than pre-computing who may see it (tasks.md 11.6).
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
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>

      {forbidden && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          You don&apos;t have permission to manage {title.toLowerCase()}.
        </p>
      )}

      <div className="mb-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder={`New ${singularLabel} name`}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={createState.loading}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {createState.errorMessage && !createState.forbidden && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{createState.errorMessage}</p>
      )}

      {loadError && <p className="text-red-600 dark:text-red-400">{loadError}</p>}
      {loading && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}

      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between py-2">
            {editingId === item.id ? (
              <input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(item.id)}
                autoFocus
                className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
              />
            ) : (
              <div>
                <p className="text-sm text-gray-900 dark:text-white">{item.name}</p>
                <p className="text-xs text-gray-400">{item.slug}</p>
              </div>
            )}
            <div className="flex gap-2 text-xs">
              {editingId === item.id ? (
                <button type="button" onClick={() => handleSaveEdit(item.id)} className="text-blue-600 dark:text-blue-400">
                  Save
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditingName(item.name);
                  }}
                  className="text-gray-500 dark:text-gray-400"
                >
                  Rename
                </button>
              )}
              <button type="button" onClick={() => handleRemove(item.id)} className="text-red-600 dark:text-red-400">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
