import { useEffect, useState } from 'react';
import { isHttpUrl, type PartnerResponse } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { mediaApi } from '../lib/mediaApi.js';
import { partnersApi } from '../lib/partnersApi.js';
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
 * The same predicate the server enforces, imported rather than re-derived: `isHttpUrl` is what
 * `partnerCreateRequestSchema.websiteUrl` refines on, so this form cannot drift from the rule that
 * actually decides the request (packages/contracts/src/partner.ts). A local `new URL()` check
 * would accept `javascript:` and hand the operator a 400 they could not have predicted.
 */
const isValidWebsiteUrl = isHttpUrl;

const WEBSITE_URL_HINT = 'Enter a valid http(s) URL.';

/**
 * The partner directory: create, edit, delete, reorder, and toggle active partners backing the
 * public home page's partner ticker. A logo is required before a partner can be created
 * (specs/partner-management/spec.md - "A partner requires a logo"), mirroring
 * `ReelLibraryPage.tsx`'s required-poster upload. Reordering saves immediately on drop — unlike
 * `HomeCurationPage.tsx`, there is no separate "pick from a pool" step to batch with the reorder,
 * so there is nothing to gain by deferring the write behind an explicit save button
 * (design.md - "Partners are directly-owned entities, not a curated selection").
 */
export function PartnersPage() {
  const [partners, setPartners] = useState<PartnerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [logoMediaId, setLogoMediaId] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  /** Bumped after a successful create so the file input remounts empty. Without it the input keeps
   *  the previous selection and re-picking the same file fires no `change` event. */
  const [logoInputKey, setLogoInputKey] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editWebsiteUrl, setEditWebsiteUrl] = useState('');
  const [editLogoMediaId, setEditLogoMediaId] = useState<string | null>(null);
  const [editLogoPreviewUrl, setEditLogoPreviewUrl] = useState<string | null>(null);
  const [editLogoUploadError, setEditLogoUploadError] = useState<string | null>(null);
  const [editUploadingLogo, setEditUploadingLogo] = useState(false);

  const [createState, runCreate] = useAsyncAction(partnersApi.create);
  const [updateState, runUpdate] = useAsyncAction((id: string, input: Parameters<typeof partnersApi.update>[1]) =>
    partnersApi.update(id, input),
  );
  const [removeState, runRemove] = useAsyncAction(partnersApi.remove);
  const [reorderState, runReorder] = useAsyncAction(partnersApi.reorder);

  function load() {
    setLoading(true);
    partnersApi
      .list()
      .then(setPartners)
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const websiteUrlIsInvalid = websiteUrl.trim().length > 0 && !isValidWebsiteUrl(websiteUrl.trim());
  const canCreate =
    name.trim().length > 0 &&
    logoMediaId !== null &&
    websiteUrl.trim().length > 0 &&
    !websiteUrlIsInvalid &&
    !createState.loading &&
    !uploadingLogo;

  // The edit form validates the same field by the same rule as the create form above — an invalid
  // URL is caught here with field-level feedback rather than only as a generic 400 from the server.
  const editWebsiteUrlIsInvalid = editWebsiteUrl.trim().length > 0 && !isValidWebsiteUrl(editWebsiteUrl.trim());
  const canSaveEdit =
    editName.trim().length > 0 &&
    editWebsiteUrl.trim().length > 0 &&
    !editWebsiteUrlIsInvalid &&
    !updateState.loading &&
    !editUploadingLogo;

  async function handleLogoSelected(file: File | null) {
    setLogoUploadError(null);
    if (!file) {
      setLogoPreviewUrl(null);
      setLogoMediaId(null);
      return;
    }
    setUploadingLogo(true);
    try {
      const media = await mediaApi.upload(file);
      setLogoPreviewUrl(media.url);
      setLogoMediaId(media.id);
    } catch (err) {
      setLogoUploadError(err instanceof ApiError ? err.message : 'Logo upload failed');
      setLogoPreviewUrl(null);
      setLogoMediaId(null);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleCreate() {
    if (!logoMediaId || !canCreate) return;
    try {
      const created = await runCreate({ name: name.trim(), logoMediaId, websiteUrl: websiteUrl.trim() });
      setPartners((prev) => [...prev, created]);
      setName('');
      setWebsiteUrl('');
      setLogoPreviewUrl(null);
      setLogoMediaId(null);
      setLogoInputKey((k) => k + 1);
    } catch {
      /* surfaced via createState.errorMessage */
    }
  }

  function startEdit(partner: PartnerResponse) {
    setEditingId(partner.id);
    setEditName(partner.name);
    setEditWebsiteUrl(partner.websiteUrl);
    setEditLogoMediaId(null);
    setEditLogoPreviewUrl(partner.logoUrl);
    setEditLogoUploadError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditWebsiteUrl('');
    setEditLogoMediaId(null);
    setEditLogoPreviewUrl(null);
    setEditLogoUploadError(null);
  }

  async function handleEditLogoSelected(file: File | null) {
    setEditLogoUploadError(null);
    if (!file) return;
    setEditUploadingLogo(true);
    try {
      const media = await mediaApi.upload(file);
      setEditLogoPreviewUrl(media.url);
      setEditLogoMediaId(media.id);
    } catch (err) {
      setEditLogoUploadError(err instanceof ApiError ? err.message : 'Logo upload failed');
      setEditLogoPreviewUrl(editingId ? (partners.find((p) => p.id === editingId)?.logoUrl ?? null) : null);
      setEditLogoMediaId(null);
    } finally {
      setEditUploadingLogo(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingId || !canSaveEdit) return;
    try {
      const updated = await runUpdate(editingId, {
        name: editName.trim(),
        websiteUrl: editWebsiteUrl.trim(),
        ...(editLogoMediaId ? { logoMediaId: editLogoMediaId } : {}),
      });
      setPartners((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
      cancelEdit();
    } catch {
      /* surfaced via updateState.errorMessage */
    }
  }

  async function handleToggleActive(partner: PartnerResponse) {
    try {
      const updated = await runUpdate(partner.id, { isActive: !partner.isActive });
      setPartners((prev) => prev.map((p) => (p.id === partner.id ? updated : p)));
    } catch {
      /* surfaced via updateState.errorMessage */
    }
  }

  async function handleRemove(id: string) {
    if (!window.confirm('Delete this partner? It will be removed from the home page ticker immediately.')) return;
    try {
      await runRemove(id);
      setPartners((prev) => prev.filter((p) => p.id !== id));
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
    const next = [...partners];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) {
      setDragIndex(null);
      return;
    }
    next.splice(targetIndex, 0, moved);
    setDragIndex(null);
    setPartners(next);
    try {
      const reordered = await runReorder(next.map((p) => p.id));
      setPartners(reordered);
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
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">{partners.length} partners</p>
          <h1 className="font-display text-3xl">Partners</h1>
        </div>
        <p className="mb-6 max-w-xl text-sm text-[var(--muted)]">
          Drag to reorder. Only active partners appear in the home page ticker; inactive partners stay listed here for
          later re-activation.
        </p>

        {forbidden && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to manage partners.
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
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">New partner</p>
          <div>
            <label htmlFor="partner-name" className={FIELD_LABEL}>
              Name
            </label>
            <input id="partner-name" value={name} onChange={(e) => setName(e.target.value)} className={TEXT_INPUT} />
          </div>

          <div>
            <label htmlFor="partner-website-url" className={FIELD_LABEL}>
              Website URL
            </label>
            <input
              id="partner-website-url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              className={TEXT_INPUT}
            />
            {websiteUrlIsInvalid && (
              <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{WEBSITE_URL_HINT}</p>
            )}
          </div>

          <div>
            <label className={FIELD_LABEL}>Logo (required)</label>
            <div className="flex items-center gap-3">
              <label className={FILE_LABEL}>
                Choose file
                <input
                  key={logoInputKey}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleLogoSelected(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              {uploadingLogo && <span className="font-mono text-xs text-[var(--muted)]">Uploading…</span>}
              {logoPreviewUrl && <img src={logoPreviewUrl} alt="" className="h-14 w-14 rounded-md object-contain" />}
            </div>
            {logoUploadError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{logoUploadError}</p>}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canCreate}
              className="rounded-md bg-[var(--signal)] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--signal-hover)] disabled:opacity-50"
            >
              {createState.loading ? 'Adding…' : 'Add partner'}
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

        {!loading && partners.length === 0 && <p className="text-sm text-[var(--muted)]">No partners yet.</p>}

        <ul className="rounded-lg border border-[var(--rule)]">
          {partners.map((partner, index) => (
            <li
              key={partner.id}
              draggable={editingId === null}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(index)}
              className={index > 0 ? 'border-t border-[var(--rule)]' : ''}
            >
              {editingId === partner.id ? (
                <div className="space-y-3 p-4">
                  <div>
                    <label htmlFor={`edit-partner-name-${partner.id}`} className={FIELD_LABEL}>
                      Name
                    </label>
                    <input
                      id={`edit-partner-name-${partner.id}`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className={TEXT_INPUT}
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit-partner-website-url-${partner.id}`} className={FIELD_LABEL}>
                      Website URL
                    </label>
                    <input
                      id={`edit-partner-website-url-${partner.id}`}
                      value={editWebsiteUrl}
                      onChange={(e) => setEditWebsiteUrl(e.target.value)}
                      className={TEXT_INPUT}
                    />
                    {editWebsiteUrlIsInvalid && (
                      <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{WEBSITE_URL_HINT}</p>
                    )}
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Replace logo (optional)</label>
                    <div className="flex items-center gap-3">
                      <label className={FILE_LABEL}>
                        Choose file
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleEditLogoSelected(e.target.files?.[0] ?? null)}
                          className="hidden"
                        />
                      </label>
                      {editUploadingLogo && <span className="font-mono text-xs text-[var(--muted)]">Uploading…</span>}
                      {editLogoPreviewUrl && (
                        <img src={editLogoPreviewUrl} alt="" className="h-14 w-14 rounded-md object-contain" />
                      )}
                    </div>
                    {editLogoUploadError && (
                      <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{editLogoUploadError}</p>
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
                    partner.isActive ? '' : 'opacity-50'
                  }`}
                >
                  <IconGrip className="h-4 w-4 shrink-0 text-[var(--muted)]/50" />
                  <img src={partner.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-contain" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--ink)]">{partner.name}</p>
                    <p className="truncate font-mono text-xs text-[var(--muted)]">{partner.websiteUrl}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(partner)}
                      className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      {partner.isActive ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(partner)}
                      className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(partner.id)}
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
