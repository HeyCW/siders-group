import { useEffect, useState } from 'react';
import type { GuidePickResponse } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { mediaApi } from '../lib/mediaApi.js';
import { guidePicksApi } from '../lib/guidePicksApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';

const FIELD_LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]';
const TEXT_INPUT =
  'w-full rounded-md border border-[var(--rule)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted)]/60 focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20';
const FILE_LABEL =
  'inline-block cursor-pointer rounded-md border border-[var(--rule)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)]/30';

function IconGrip({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 20" fill="currentColor" className={className}>
      <circle cx="3" cy="4" r="1.3" />
      <circle cx="9" cy="4" r="1.3" />
      <circle cx="3" cy="10" r="1.3" />
      <circle cx="9" cy="10" r="1.3" />
      <circle cx="3" cy="16" r="1.3" />
      <circle cx="9" cy="16" r="1.3" />
    </svg>
  );
}

/**
 * The guide-pick list: create, edit, delete, reorder, and toggle active picks backing the public
 * home page's "Siders Guideline of the Week" section. A photo and a video are both required
 * before a pick can be created (specs/guide-of-the-week-management/spec.md - "A guide pick
 * requires a photo", "A guide pick requires a self-hosted video") — the photo now serves as the
 * video's poster — mirroring `PartnersPage.tsx`'s required-logo upload. Reordering saves
 * immediately on drop — a guide pick has no separate "pick from a pool" step to batch with the
 * reorder, so there is nothing to gain by deferring the write behind an explicit save button
 * (design.md - "Guide picks are directly-owned entities, not a curated selection"). No UI-side
 * limit on how many picks can be added (design.md - "No maximum pick count").
 */
export function GuidePicksPage() {
  const [guidePicks, setGuidePicks] = useState<GuidePickResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [city, setCity] = useState('');
  const [place, setPlace] = useState('');
  const [description, setDescription] = useState('');
  const [photoMediaId, setPhotoMediaId] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  /** Bumped after a successful create so the file input remounts empty. Without it the input keeps
   *  the previous selection and re-picking the same file fires no `change` event. */
  const [photoInputKey, setPhotoInputKey] = useState(0);

  const [videoMediaId, setVideoMediaId] = useState<string | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoInputKey, setVideoInputKey] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCity, setEditCity] = useState('');
  const [editPlace, setEditPlace] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPhotoMediaId, setEditPhotoMediaId] = useState<string | null>(null);
  const [editPhotoPreviewUrl, setEditPhotoPreviewUrl] = useState<string | null>(null);
  const [editPhotoUploadError, setEditPhotoUploadError] = useState<string | null>(null);
  const [editUploadingPhoto, setEditUploadingPhoto] = useState(false);

  const [editVideoMediaId, setEditVideoMediaId] = useState<string | null>(null);
  const [editVideoPreviewUrl, setEditVideoPreviewUrl] = useState<string | null>(null);
  const [editVideoUploadError, setEditVideoUploadError] = useState<string | null>(null);
  const [editUploadingVideo, setEditUploadingVideo] = useState(false);

  const [createState, runCreate] = useAsyncAction(guidePicksApi.create);
  const [updateState, runUpdate] = useAsyncAction((id: string, input: Parameters<typeof guidePicksApi.update>[1]) =>
    guidePicksApi.update(id, input),
  );
  const [removeState, runRemove] = useAsyncAction(guidePicksApi.remove);
  const [reorderState, runReorder] = useAsyncAction(guidePicksApi.reorder);

  function load() {
    setLoading(true);
    guidePicksApi
      .list()
      .then(setGuidePicks)
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const canCreate =
    city.trim().length > 0 &&
    place.trim().length > 0 &&
    description.trim().length > 0 &&
    photoMediaId !== null &&
    videoMediaId !== null &&
    !createState.loading &&
    !uploadingPhoto &&
    !uploadingVideo;

  const canSaveEdit =
    editCity.trim().length > 0 &&
    editPlace.trim().length > 0 &&
    editDescription.trim().length > 0 &&
    !updateState.loading &&
    !editUploadingPhoto &&
    !editUploadingVideo;

  async function handlePhotoSelected(file: File | null) {
    setPhotoUploadError(null);
    if (!file) {
      setPhotoPreviewUrl(null);
      setPhotoMediaId(null);
      return;
    }
    setUploadingPhoto(true);
    try {
      const media = await mediaApi.upload(file);
      setPhotoPreviewUrl(media.url);
      setPhotoMediaId(media.id);
    } catch (err) {
      setPhotoUploadError(err instanceof ApiError ? err.message : 'Photo upload failed');
      setPhotoPreviewUrl(null);
      setPhotoMediaId(null);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleVideoSelected(file: File | null) {
    setVideoUploadError(null);
    if (!file) {
      setVideoPreviewUrl(null);
      setVideoMediaId(null);
      return;
    }
    setUploadingVideo(true);
    try {
      const uploaded = await mediaApi.upload(file);
      setVideoPreviewUrl(uploaded.url);
      setVideoMediaId(uploaded.id);
    } catch (err) {
      setVideoUploadError(err instanceof ApiError ? err.message : 'Video upload failed');
      setVideoPreviewUrl(null);
      setVideoMediaId(null);
    } finally {
      setUploadingVideo(false);
    }
  }

  async function handleCreate() {
    if (!photoMediaId || !videoMediaId || !canCreate) return;
    try {
      const created = await runCreate({
        city: city.trim(),
        place: place.trim(),
        description: description.trim(),
        photoMediaId,
        videoMediaId,
      });
      setGuidePicks((prev) => [...prev, created]);
      setCity('');
      setPlace('');
      setDescription('');
      setPhotoPreviewUrl(null);
      setPhotoMediaId(null);
      setPhotoInputKey((k) => k + 1);
      setVideoPreviewUrl(null);
      setVideoMediaId(null);
      setVideoInputKey((k) => k + 1);
    } catch {
      /* surfaced via createState.errorMessage */
    }
  }

  function startEdit(pick: GuidePickResponse) {
    setEditingId(pick.id);
    setEditCity(pick.city);
    setEditPlace(pick.place);
    setEditDescription(pick.description);
    setEditPhotoMediaId(null);
    setEditPhotoPreviewUrl(pick.photoUrl);
    setEditPhotoUploadError(null);
    setEditVideoMediaId(null);
    setEditVideoPreviewUrl(pick.videoUrl);
    setEditVideoUploadError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditCity('');
    setEditPlace('');
    setEditDescription('');
    setEditPhotoMediaId(null);
    setEditPhotoPreviewUrl(null);
    setEditPhotoUploadError(null);
    setEditVideoMediaId(null);
    setEditVideoPreviewUrl(null);
    setEditVideoUploadError(null);
  }

  async function handleEditPhotoSelected(file: File | null) {
    setEditPhotoUploadError(null);
    if (!file) return;
    setEditUploadingPhoto(true);
    try {
      const media = await mediaApi.upload(file);
      setEditPhotoPreviewUrl(media.url);
      setEditPhotoMediaId(media.id);
    } catch (err) {
      setEditPhotoUploadError(err instanceof ApiError ? err.message : 'Photo upload failed');
      setEditPhotoPreviewUrl(editingId ? (guidePicks.find((p) => p.id === editingId)?.photoUrl ?? null) : null);
      setEditPhotoMediaId(null);
    } finally {
      setEditUploadingPhoto(false);
    }
  }

  async function handleEditVideoSelected(file: File | null) {
    setEditVideoUploadError(null);
    if (!file) return;
    setEditUploadingVideo(true);
    try {
      const uploaded = await mediaApi.upload(file);
      setEditVideoPreviewUrl(uploaded.url);
      setEditVideoMediaId(uploaded.id);
    } catch (err) {
      setEditVideoUploadError(err instanceof ApiError ? err.message : 'Video upload failed');
      setEditVideoPreviewUrl(editingId ? (guidePicks.find((p) => p.id === editingId)?.videoUrl ?? null) : null);
      setEditVideoMediaId(null);
    } finally {
      setEditUploadingVideo(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingId || !canSaveEdit) return;
    try {
      const updated = await runUpdate(editingId, {
        city: editCity.trim(),
        place: editPlace.trim(),
        description: editDescription.trim(),
        ...(editPhotoMediaId ? { photoMediaId: editPhotoMediaId } : {}),
        ...(editVideoMediaId ? { videoMediaId: editVideoMediaId } : {}),
      });
      setGuidePicks((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
      cancelEdit();
    } catch {
      /* surfaced via updateState.errorMessage */
    }
  }

  async function handleToggleActive(pick: GuidePickResponse) {
    try {
      const updated = await runUpdate(pick.id, { isActive: !pick.isActive });
      setGuidePicks((prev) => prev.map((p) => (p.id === pick.id ? updated : p)));
    } catch {
      /* surfaced via updateState.errorMessage */
    }
  }

  async function handleRemove(id: string) {
    if (!window.confirm('Delete this guide pick? It will be removed from the home page section immediately.')) return;
    try {
      await runRemove(id);
      setGuidePicks((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) cancelEdit();
    } catch {
      /* surfaced via removeState.errorMessage */
    }
  }

  async function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...guidePicks];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) {
      setDragIndex(null);
      return;
    }
    next.splice(targetIndex, 0, moved);
    setDragIndex(null);
    setGuidePicks(next);
    try {
      const reordered = await runReorder(next.map((p) => p.id));
      setGuidePicks(reordered);
    } catch {
      // Revert local order on failure — the server rejected the reorder, so the previous order
      // is still what's actually stored.
      load();
    }
  }

  const forbidden = createState.forbidden || updateState.forbidden || removeState.forbidden || reorderState.forbidden;

  return (
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-1">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">{guidePicks.length} guide picks</p>
          <h1 className="font-display text-3xl">Guide of the Week</h1>
        </div>
        <p className="mb-6 max-w-xl text-sm text-[var(--muted)]">
          Drag to reorder. Only active picks appear in the home page section; inactive picks stay listed here for later
          re-activation. There is no limit on how many picks you can add.
        </p>

        {forbidden && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to manage guide picks.
          </p>
        )}
        {updateState.errorMessage && !updateState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{updateState.errorMessage}</p>
        )}
        {removeState.errorMessage && !removeState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{removeState.errorMessage}</p>
        )}
        {reorderState.errorMessage && !reorderState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{reorderState.errorMessage}</p>
        )}

        <div className="mb-8 space-y-4 rounded-lg border border-[var(--rule)] p-5">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">New guide pick</p>
          <div>
            <label htmlFor="guide-pick-city" className={FIELD_LABEL}>
              City
            </label>
            <input id="guide-pick-city" value={city} onChange={(e) => setCity(e.target.value)} className={TEXT_INPUT} />
          </div>

          <div>
            <label htmlFor="guide-pick-place" className={FIELD_LABEL}>
              Place
            </label>
            <input
              id="guide-pick-place"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              className={TEXT_INPUT}
            />
          </div>

          <div>
            <label htmlFor="guide-pick-description" className={FIELD_LABEL}>
              Description
            </label>
            <textarea
              id="guide-pick-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={TEXT_INPUT}
            />
          </div>

          <div>
            <label className={FIELD_LABEL}>Photo (required)</label>
            <div className="flex items-center gap-3">
              <label className={FILE_LABEL}>
                Choose file
                <input
                  key={photoInputKey}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePhotoSelected(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              {uploadingPhoto && <span className="font-mono text-xs text-[var(--muted)]">Uploading…</span>}
              {photoPreviewUrl && <img src={photoPreviewUrl} alt="" className="h-14 w-14 rounded-md object-cover" />}
            </div>
            {photoUploadError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{photoUploadError}</p>}
          </div>

          <div>
            <label className={FIELD_LABEL}>Video (required, MP4)</label>
            <div className="flex items-center gap-3">
              <label className={FILE_LABEL}>
                Choose file
                <input
                  key={videoInputKey}
                  type="file"
                  accept="video/mp4"
                  onChange={(e) => handleVideoSelected(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              {uploadingVideo && <span className="font-mono text-xs text-[var(--muted)]">Uploading…</span>}
              {videoPreviewUrl && (
                <video src={videoPreviewUrl} className="h-14 w-14 rounded-md object-cover" muted />
              )}
            </div>
            {videoUploadError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{videoUploadError}</p>}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canCreate}
              className="rounded-md bg-[var(--signal)] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--signal-hover)] disabled:opacity-50"
            >
              {createState.loading ? 'Adding…' : 'Add guide pick'}
            </button>
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

        {!loading && guidePicks.length === 0 && <p className="text-sm text-[var(--muted)]">No guide picks yet.</p>}

        <ul className="rounded-lg border border-[var(--rule)]">
          {guidePicks.map((pick, index) => (
            <li
              key={pick.id}
              draggable={editingId === null}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(index)}
              className={index > 0 ? 'border-t border-[var(--rule)]' : ''}
            >
              {editingId === pick.id ? (
                <div className="space-y-3 p-4">
                  <div>
                    <label htmlFor={`edit-guide-pick-city-${pick.id}`} className={FIELD_LABEL}>
                      City
                    </label>
                    <input
                      id={`edit-guide-pick-city-${pick.id}`}
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      className={TEXT_INPUT}
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-guide-pick-place-${pick.id}`} className={FIELD_LABEL}>
                      Place
                    </label>
                    <input
                      id={`edit-guide-pick-place-${pick.id}`}
                      value={editPlace}
                      onChange={(e) => setEditPlace(e.target.value)}
                      className={TEXT_INPUT}
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-guide-pick-description-${pick.id}`} className={FIELD_LABEL}>
                      Description
                    </label>
                    <textarea
                      id={`edit-guide-pick-description-${pick.id}`}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={2}
                      className={TEXT_INPUT}
                    />
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Replace photo (optional)</label>
                    <div className="flex items-center gap-3">
                      <label className={FILE_LABEL}>
                        Choose file
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleEditPhotoSelected(e.target.files?.[0] ?? null)}
                          className="hidden"
                        />
                      </label>
                      {editUploadingPhoto && <span className="font-mono text-xs text-[var(--muted)]">Uploading…</span>}
                      {editPhotoPreviewUrl && (
                        <img src={editPhotoPreviewUrl} alt="" className="h-14 w-14 rounded-md object-cover" />
                      )}
                    </div>
                    {editPhotoUploadError && (
                      <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{editPhotoUploadError}</p>
                    )}
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Replace video (optional, MP4)</label>
                    <div className="flex items-center gap-3">
                      <label className={FILE_LABEL}>
                        Choose file
                        <input
                          type="file"
                          accept="video/mp4"
                          onChange={(e) => handleEditVideoSelected(e.target.files?.[0] ?? null)}
                          className="hidden"
                        />
                      </label>
                      {editUploadingVideo && <span className="font-mono text-xs text-[var(--muted)]">Uploading…</span>}
                      {editVideoPreviewUrl && (
                        <video src={editVideoPreviewUrl} className="h-14 w-14 rounded-md object-cover" muted />
                      )}
                    </div>
                    {editVideoUploadError && (
                      <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{editVideoUploadError}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={!canSaveEdit}
                      className="rounded-md bg-[var(--signal)] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--signal-hover)] disabled:opacity-50"
                    >
                      {updateState.loading ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`flex cursor-move items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--ink)]/[0.03] ${
                    pick.isActive ? '' : 'opacity-50'
                  }`}
                >
                  <IconGrip className="h-4 w-4 shrink-0 text-[var(--muted)]/50" />
                  <img src={pick.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--ink)]">
                      {pick.place} <span className="text-[var(--muted)]">— {pick.city}</span>
                    </p>
                    <p className="truncate font-mono text-xs text-[var(--muted)]">{pick.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(pick)}
                      className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      {pick.isActive ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(pick)}
                      className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(pick.id)}
                      className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-red-600 dark:hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
