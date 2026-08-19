import { useEffect, useState } from 'react';
import type { ReelResponse, ReelStatus, ReelUpdateRequest } from '@siders/contracts';
import { parseReelUrl, reelStatusSchema } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { mediaApi } from '../lib/mediaApi.js';
import { reelsApi } from '../lib/reelsApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { REEL_STATUS_STYLES } from '../lib/reelStatusStyles.js';
import { Button } from '../components/ui/Button.js';
import { Select } from '../components/ui/Select.js';

const STATUS_LABELS: Record<ReelStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  unavailable: 'Unavailable — source video no longer available',
};

const MAX_STAGGERED_ROWS = 8;
const STAGGER_STEP_MS = 40;

const FIELD_LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]';
const TEXT_INPUT =
  'w-full rounded-md border border-[var(--rule)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted)]/60 focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20';
const FILE_LABEL =
  'inline-block cursor-pointer rounded-md border border-[var(--rule)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)]/30';

/**
 * The reel library: create, edit, and delete reels that reference a third-party provider's
 * video. There is no video upload here — only a URL, parsed client-side for an immediate
 * preview and re-parsed server-side as the actual source of truth
 * (specs/reels-curation/spec.md - "Provider allowlist"). A poster image, uploaded through the
 * existing media endpoint, is optional — a reel is playable via its third-party embed with or
 * without one (specs/reels-curation/spec.md - "Every reel has a locally stored poster image").
 * No live provider embed is ever rendered here — only the stored poster (or a placeholder when
 * there is none), consistent with the facade rule this capability depends on (design.md -
 * "Facade rendering: poster first, frame only on user activation"). The provider and identifier
 * are immutable after creation (`reelUpdateRequestSchema` has no `url` field), so editing a reel
 * only ever touches caption, poster, and status — never re-parses a URL.
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

  const canCreate = parsed !== null && !createState.loading && !uploadingPoster;

  async function handleCreate() {
    if (!parsed) return;
    try {
      const created = await runCreate({
        url: url.trim(),
        posterMediaId: posterMediaId ?? null,
        caption: caption.trim() || undefined,
      });
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
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-1">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">{reels.length} in the library</p>
          <h1 className="font-display text-3xl">Reel library</h1>
        </div>
        <p className="mb-6 max-w-xl text-sm text-[var(--muted)]">
          Reels reference a video hosted on Instagram, TikTok, or YouTube — this system stores no video of its own,
          only a poster image and the video&apos;s identity.
        </p>

        {forbidden && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
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

        <div className="mb-8 space-y-4 rounded-lg border border-[var(--rule)] p-5">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">New reel</p>
          <div>
            <label className={FIELD_LABEL}>Reel URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.instagram.com/reel/..."
              className={TEXT_INPUT}
            />
            {parsed && (
              <p className="mt-1.5 font-mono text-xs text-[var(--status-published)]">
                Recognized: {parsed.provider} · {parsed.externalId}
              </p>
            )}
            {urlIsInvalid && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                This URL doesn&apos;t match a recognized provider (Instagram, TikTok, or YouTube Shorts).
              </p>
            )}
          </div>

          <div>
            <label className={FIELD_LABEL}>Poster image (optional)</label>
            <div className="flex items-center gap-3">
              <label className={FILE_LABEL}>
                Choose file
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePosterSelected(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              {uploadingPoster && <span className="font-mono text-xs text-[var(--muted)]">Uploading…</span>}
              {posterPreviewUrl && <img src={posterPreviewUrl} alt="" className="h-14 w-14 rounded-md object-cover" />}
            </div>
            {posterUploadError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{posterUploadError}</p>}
          </div>

          <div>
            <label className={FIELD_LABEL}>Caption (optional)</label>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} className={TEXT_INPUT} />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="button" variant="primary" onClick={handleCreate} disabled={!canCreate}>
              {createState.loading ? 'Adding…' : 'Add reel'}
            </Button>
            {createState.errorMessage && !createState.forbidden && (
              <p className="text-sm text-red-600 dark:text-red-400">{createState.errorMessage}</p>
            )}
          </div>
        </div>

        {loadError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {loadError}
          </p>
        )}
        {loading && <p className="font-mono text-sm text-[var(--muted)]">Loading…</p>}

        {!loading && reels.length === 0 && <p className="text-sm text-[var(--muted)]">No reels yet.</p>}

        <ul className="space-y-1">
          {reels.map((reel, index) => {
            const statusStyle = REEL_STATUS_STYLES[reel.status];
            return (
              <li
                key={reel.id}
                className="relative motion-safe:animate-[fadeInUp_0.4s_ease_forwards] motion-safe:opacity-0"
                style={{ animationDelay: `${Math.min(index, MAX_STAGGERED_ROWS) * STAGGER_STEP_MS}ms` }}
              >
                {editingId === reel.id ? (
                  <div className="space-y-3 rounded-lg border border-[var(--rule)] p-4">
                    <p className="text-xs text-[var(--muted)]">
                      Editing {reel.provider} · {reel.externalId} — the video reference itself can&apos;t change.
                      Status is set from the dropdown on the list row; this form is caption and poster only.
                    </p>
                    <div>
                      <label className={FIELD_LABEL}>Caption</label>
                      <input value={editCaption} onChange={(e) => setEditCaption(e.target.value)} className={TEXT_INPUT} />
                    </div>
                    <div>
                      <label className={FIELD_LABEL}>Replace poster (optional)</label>
                      <div className="flex items-center gap-3">
                        <label className={FILE_LABEL}>
                          Choose file
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleEditPosterSelected(e.target.files?.[0] ?? null)}
                            className="hidden"
                          />
                        </label>
                        {editUploadingPoster && <span className="font-mono text-xs text-[var(--muted)]">Uploading…</span>}
                        {editPosterPreviewUrl && (
                          <img src={editPosterPreviewUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
                        )}
                      </div>
                      {editPosterUploadError && (
                        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{editPosterUploadError}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleSaveEdit}
                        disabled={updateState.loading || editUploadingPoster}
                      >
                        {updateState.loading ? 'Saving…' : 'Save'}
                      </Button>
                      <Button type="button" variant="ghost" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 rounded-lg py-3 pl-5 pr-3 transition-colors hover:bg-[var(--ink)]/[0.03]">
                    <span className={`absolute inset-y-2 left-0 w-1 rounded-full ${statusStyle.rule}`} aria-hidden="true" />
                    {reel.posterUrl ? (
                      <img src={reel.posterUrl} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-[var(--ink)]/[0.06] font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]">
                        No poster
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg capitalize">
                        {reel.provider} · {reel.externalId}
                      </p>
                      {reel.caption && <p className="mt-0.5 truncate font-mono text-xs text-[var(--muted)]">{reel.caption}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Select
                        size="sm"
                        value={reel.status}
                        onChange={(e) => handleStatusChange(reel.id, reelStatusSchema.parse(e.target.value))}
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      <Button type="button" variant="ghost" onClick={() => startEdit(reel)}>
                        Edit
                      </Button>
                      <Button type="button" variant="ghost" tone="danger" onClick={() => handleRemove(reel.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
