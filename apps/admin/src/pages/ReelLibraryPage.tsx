import { useEffect, useState } from 'react';
import type { ReelResponse, ReelStatus, ReelUpdateRequest } from '@siders/contracts';
import { parseReelUrl, reelStatusSchema } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { mediaApi } from '../lib/mediaApi.js';
import { reelsApi } from '../lib/reelsApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';

const STATUS_LABELS: Record<ReelStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  unavailable: 'Unavailable — source video no longer available',
};

/**
 * The reel library: create, edit, and delete reels that reference a third-party provider's
 * video. There is no video upload here — only a URL, parsed client-side for an immediate
 * preview and re-parsed server-side as the actual source of truth
 * (specs/reels-curation/spec.md - "Provider allowlist"). A poster image, uploaded through the
 * existing media endpoint, is required before a reel can be created
 * (specs/reels-curation/spec.md - "Every reel has a locally stored poster image"). No live
 * provider embed is ever rendered here — only the stored poster, consistent with the facade
 * rule this capability depends on (design.md - "Facade rendering: poster first, frame only on
 * user activation"). The provider and identifier are immutable after creation
 * (`reelUpdateRequestSchema` has no `url` field), so editing a reel only ever touches caption,
 * poster, and status — never re-parses a URL.
 */
export function ReelLibraryPage() {
  const [reels, setReels] = useState<ReelResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [posterMediaId, setPosterMediaId] = useState<string | null>(null);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [posterUploadError, setPosterUploadError] = useState<string | null>(null);
  const [uploadingPoster, setUploadingPoster] = useState(false);

  // Edit form state, active for at most one reel at a time. `editPosterMediaId` stays `null`
  // until the editor picks a replacement poster — omitted from the PATCH body entirely in that
  // case, so leaving it untouched means "keep the current poster", not "clear it" (mirrors
  // `reelUpdateRequestSchema`'s `posterMediaId` being optional, not nullable).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editPosterMediaId, setEditPosterMediaId] = useState<string | null>(null);
  const [editPosterPreviewUrl, setEditPosterPreviewUrl] = useState<string | null>(null);
  const [editPosterUploadError, setEditPosterUploadError] = useState<string | null>(null);
  const [editUploadingPoster, setEditUploadingPoster] = useState(false);

  const [createState, runCreate] = useAsyncAction(reelsApi.create);
  const [updateState, runUpdate] = useAsyncAction((id: string, input: ReelUpdateRequest) =>
    reelsApi.update(id, input),
  );
  const [removeState, runRemove] = useAsyncAction(reelsApi.remove);

  function load() {
    setLoading(true);
    reelsApi
      .list()
      .then(setReels)
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const parsed = url.trim() ? parseReelUrl(url.trim()) : null;
  const urlIsInvalid = url.trim().length > 0 && parsed === null;

  async function handlePosterSelected(file: File | null) {
    setPosterUploadError(null);
    if (!file) {
      setPosterPreviewUrl(null);
      setPosterMediaId(null);
      return;
    }
    setUploadingPoster(true);
    try {
      const media = await mediaApi.upload(file);
      setPosterPreviewUrl(media.url);
      setPosterMediaId(media.id);
    } catch (err) {
      setPosterUploadError(err instanceof ApiError ? err.message : 'Poster upload failed');
      setPosterPreviewUrl(null);
      setPosterMediaId(null);
    } finally {
      setUploadingPoster(false);
    }
  }

  const canCreate = parsed !== null && posterMediaId !== null && !createState.loading && !uploadingPoster;

  async function handleCreate() {
    if (!parsed || !posterMediaId) return;
    try {
      const created = await runCreate({ url: url.trim(), posterMediaId, caption: caption.trim() || undefined });
      setReels((prev) => [created, ...prev]);
      setUrl('');
      setCaption('');
      setPosterPreviewUrl(null);
      setPosterMediaId(null);
    } catch {
      /* surfaced via createState.errorMessage */
    }
  }

  async function handleStatusChange(id: string, status: ReelStatus) {
    try {
      const updated = await runUpdate(id, { status });
      setReels((prev) => prev.map((reel) => (reel.id === id ? updated : reel)));
    } catch {
      /* surfaced via updateState.errorMessage */
    }
  }

  function startEdit(reel: ReelResponse) {
    setEditingId(reel.id);
    setEditCaption(reel.caption ?? '');
    setEditPosterMediaId(null);
    setEditPosterPreviewUrl(reel.posterUrl);
    setEditPosterUploadError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCaption('');
    setEditPosterMediaId(null);
    setEditPosterPreviewUrl(null);
    setEditPosterUploadError(null);
  }

  async function handleEditPosterSelected(file: File | null) {
    setEditPosterUploadError(null);
    if (!file) return;
    setEditUploadingPoster(true);
    try {
      const media = await mediaApi.upload(file);
      setEditPosterPreviewUrl(media.url);
      setEditPosterMediaId(media.id);
    } catch (err) {
      setEditPosterUploadError(err instanceof ApiError ? err.message : 'Poster upload failed');
      // Fall back to the reel's current poster rather than leaving a stale replacement selected
      // — mirrors handlePosterSelected's failure handling on the create form.
      setEditPosterPreviewUrl(editingId ? (reels.find((reel) => reel.id === editingId)?.posterUrl ?? null) : null);
      setEditPosterMediaId(null);
    } finally {
      setEditUploadingPoster(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    try {
      const updated = await runUpdate(editingId, {
        caption: editCaption.trim() || null,
        ...(editPosterMediaId ? { posterMediaId: editPosterMediaId } : {}),
      });
      setReels((prev) => prev.map((reel) => (reel.id === editingId ? updated : reel)));
      cancelEdit();
    } catch {
      /* surfaced via updateState.errorMessage */
    }
  }

  async function handleRemove(id: string) {
    if (!window.confirm('Delete this reel? It will also be removed from the reels rail if it is ordered.')) return;
    try {
      await runRemove(id);
      setReels((prev) => prev.filter((reel) => reel.id !== id));
      if (editingId === id) cancelEdit();
    } catch {
      /* surfaced via removeState.errorMessage */
    }
  }

  const forbidden = createState.forbidden || updateState.forbidden || removeState.forbidden;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">Reel Library</h1>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Reels reference a video hosted on Instagram, TikTok, or YouTube — this system stores no video of its own,
        only a poster image and the video&apos;s identity.
      </p>

      {forbidden && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          You don&apos;t have permission to manage the reel library.
        </p>
      )}
      {/* Page-level rather than scoped to the edit form: the status <select> and Delete button
          that trigger updateState/removeState both live in the row's non-editing branch, so an
          error from either would otherwise have nowhere to render. */}
      {updateState.errorMessage && !updateState.forbidden && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{updateState.errorMessage}</p>
      )}
      {removeState.errorMessage && !removeState.forbidden && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{removeState.errorMessage}</p>
      )}

      <div className="mb-6 space-y-3 rounded-md border border-gray-200 p-4 dark:border-gray-700">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Reel URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/reel/..."
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
          {parsed && (
            <p className="mt-1 text-xs text-green-600 dark:text-green-400">
              Recognized: {parsed.provider} · {parsed.externalId}
            </p>
          )}
          {urlIsInvalid && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              This URL doesn&apos;t match a recognized provider (Instagram, TikTok, or YouTube Shorts).
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Poster image (required)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handlePosterSelected(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          {uploadingPoster && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Uploading…</p>}
          {posterUploadError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{posterUploadError}</p>}
          {posterPreviewUrl && (
            <img src={posterPreviewUrl} alt="" className="mt-2 h-24 w-auto rounded-md object-cover" />
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
            Caption (optional)
          </label>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={!canCreate}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {createState.loading ? 'Adding…' : 'Add reel'}
        </button>
        {createState.errorMessage && !createState.forbidden && (
          <p className="text-sm text-red-600 dark:text-red-400">{createState.errorMessage}</p>
        )}
      </div>

      {loadError && <p className="text-red-600 dark:text-red-400">{loadError}</p>}
      {loading && <p className="text-gray-500 dark:text-gray-400">Loading…</p>}

      <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
        {!loading && reels.length === 0 && (
          <li className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">No reels yet.</li>
        )}
        {reels.map((reel) =>
          editingId === reel.id ? (
            <li key={reel.id} className="space-y-2 px-3 py-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Editing {reel.provider} · {reel.externalId} — the video reference itself can&apos;t change. Status is
                set from the dropdown on the list row; this form is caption and poster only.
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Caption</label>
                <input
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Replace poster (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleEditPosterSelected(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
                {editUploadingPoster && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Uploading…</p>}
                {editPosterUploadError && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{editPosterUploadError}</p>
                )}
                {editPosterPreviewUrl && (
                  <img src={editPosterPreviewUrl} alt="" className="mt-2 h-20 w-auto rounded-md object-cover" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={updateState.loading || editUploadingPoster}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {updateState.loading ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </li>
          ) : (
            <li key={reel.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <img src={reel.posterUrl} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-gray-900 dark:text-white">
                    {reel.provider} · {reel.externalId}
                  </p>
                  {reel.caption && <p className="truncate text-xs text-gray-400">{reel.caption}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={reel.status}
                  onChange={(e) => handleStatusChange(reel.id, reelStatusSchema.parse(e.target.value))}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => startEdit(reel)} className="text-xs text-blue-600 dark:text-blue-400">
                  Edit
                </button>
                <button type="button" onClick={() => handleRemove(reel.id)} className="text-xs text-red-600 dark:text-red-400">
                  Delete
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
