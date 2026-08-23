import { useEffect, useState } from 'react';
import { anakUsahaKindSchema, isHttpUrl, type AnakUsahaAdminResponse, type AnakUsahaLink } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { mediaApi } from '../lib/mediaApi.js';
import { anakUsahaPresentationApi } from '../lib/anakUsahaApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { Button } from '../components/ui/Button.js';

const FIELD_LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]';
const TEXT_INPUT =
  'w-full rounded-md border border-[var(--rule)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted)]/60 focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20';
const FILE_LABEL =
  'inline-block cursor-pointer rounded-md border border-[var(--rule)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)]/30';

/** The fixed set of groupings — pulled from the same enum the server validates against
 *  (`anakUsahaKindSchema`) rather than a locally re-typed list, so this form cannot drift from
 *  what the API will actually accept (design.md - "kind as a text column with contract-level
 *  validation"). */
const KIND_OPTIONS = anakUsahaKindSchema.options;

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

interface EditableLink extends AnakUsahaLink {
  /** Local-only React key — links carry no id of their own (packages/contracts/src/anak-usaha.ts). */
  key: string;
}

function emptyLink(): EditableLink {
  return { key: crypto.randomUUID(), label: '', href: '' };
}

/** Matches `paper` in `apps/web/tailwind.config.ts` — the tile's look with no color chosen. */
const DEFAULT_BACKGROUND_COLOR = '#F7F6F2';

interface ProfileFormState {
  description: string;
  kind: string;
  backgroundColor: string;
  links: EditableLink[];
  isActive: boolean;
  /** `undefined` = leave the stored logo as it is, `null` = clear it, a string = replace it with
   *  this newly-uploaded media id — the same three-state shape `logoMediaId` takes on the wire
   *  (packages/contracts/src/anak-usaha.ts's `.nullable().optional()`). */
  logoMediaId: string | null | undefined;
  logoPreviewUrl: string | null;
  logoUploadError: string | null;
  uploadingLogo: boolean;
}

function formFromEntry(entry: AnakUsahaAdminResponse): ProfileFormState {
  const profile = entry.profile;
  return {
    description: profile?.description ?? '',
    kind: profile?.kind ?? KIND_OPTIONS[0],
    backgroundColor: profile?.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    links: (profile?.links ?? []).map((link) => ({ ...link, key: crypto.randomUUID() })),
    isActive: profile?.isActive ?? true,
    logoMediaId: undefined,
    logoPreviewUrl: profile?.logoUrl ?? null,
    logoUploadError: null,
    uploadingLogo: false,
  };
}

/**
 * The admin-managed public presentation for anak usaha entries: logo, description, kind, links,
 * order, and visibility, backing the home page tiles, masthead logo row, footer, and Contact page
 * (specs/anak-usaha-presentation/spec.md). Distinct from `/anak-usaha` (`TaxonomyManagementPage`),
 * which manages the plain name/slug catalog these profiles present
 * (design.md - "Separate anak_usaha_profile table, not new columns on anak_usaha") — deleting a
 * profile here never deletes the taxonomy entry or its article tags.
 */
export function AnakUsahaPresentationPage() {
  const [entries, setEntries] = useState<AnakUsahaAdminResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormState | null>(null);

  const [createState, runCreate] = useAsyncAction(anakUsahaPresentationApi.createProfile);
  const [updateState, runUpdate] = useAsyncAction(anakUsahaPresentationApi.updateProfile);
  const [removeState, runRemove] = useAsyncAction(anakUsahaPresentationApi.removeProfile);
  const [reorderState, runReorder] = useAsyncAction(anakUsahaPresentationApi.reorderProfiles);

  function load() {
    setLoading(true);
    anakUsahaPresentationApi
      .list()
      .then(setEntries)
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const withProfile = entries.filter((e) => e.profile !== null);
  const withoutProfile = entries.filter((e) => e.profile === null);

  function startEdit(entry: AnakUsahaAdminResponse) {
    setEditingId(entry.id);
    setForm(formFromEntry(entry));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(null);
  }

  async function handleLogoSelected(file: File | null) {
    if (!form) return;
    if (!file) return;
    setForm({ ...form, uploadingLogo: true, logoUploadError: null });
    try {
      const media = await mediaApi.upload(file);
      setForm((prev) => (prev ? { ...prev, logoMediaId: media.id, logoPreviewUrl: media.url, uploadingLogo: false } : prev));
    } catch (err) {
      setForm((prev) =>
        prev
          ? {
              ...prev,
              uploadingLogo: false,
              logoUploadError: err instanceof ApiError ? err.message : 'Logo upload failed',
            }
          : prev,
      );
    }
  }

  function updateLink(key: string, field: 'label' | 'href', value: string) {
    if (!form) return;
    setForm({ ...form, links: form.links.map((l) => (l.key === key ? { ...l, [field]: value } : l)) });
  }

  function addLink() {
    if (!form) return;
    setForm({ ...form, links: [...form.links, emptyLink()] });
  }

  function removeLink(key: string) {
    if (!form) return;
    setForm({ ...form, links: form.links.filter((l) => l.key !== key) });
  }

  const linksAreValid = form?.links.every((l) => l.label.trim().length > 0 && isHttpUrl(l.href.trim())) ?? true;
  const backgroundColorIsValid = form ? /^#[0-9a-fA-F]{6}$/.test(form.backgroundColor) : true;
  const canSave = form !== null && linksAreValid && backgroundColorIsValid && !form.uploadingLogo;

  async function handleSave() {
    if (!editingId || !form || !canSave) return;
    const entry = entries.find((e) => e.id === editingId);
    const links = form.links.map((l) => ({ label: l.label.trim(), href: l.href.trim() }));
    try {
      let updated: AnakUsahaAdminResponse;
      if (entry?.profile) {
        updated = await runUpdate(editingId, {
          description: form.description.trim() || null,
          kind: form.kind as (typeof KIND_OPTIONS)[number],
          backgroundColor: form.backgroundColor,
          links,
          isActive: form.isActive,
          ...(form.logoMediaId !== undefined ? { logoMediaId: form.logoMediaId } : {}),
        });
      } else {
        updated = await runCreate(editingId, {
          description: form.description.trim() || null,
          kind: form.kind as (typeof KIND_OPTIONS)[number],
          backgroundColor: form.backgroundColor,
          links,
          ...(form.logoMediaId ? { logoMediaId: form.logoMediaId } : {}),
        });
      }
      setEntries((prev) => prev.map((e) => (e.id === editingId ? updated : e)));
      cancelEdit();
    } catch {
      /* surfaced via createState/updateState.errorMessage */
    }
  }

  async function handleRemoveProfile(id: string) {
    if (
      !window.confirm(
        'Remove this profile? It disappears from the home page, masthead, footer, and Contact page immediately. The anak usaha entry and any articles tagged with it are unaffected.',
      )
    ) {
      return;
    }
    try {
      await runRemove(id);
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, profile: null } : e)));
      if (editingId === id) cancelEdit();
    } catch {
      /* surfaced via removeState.errorMessage */
    }
  }

  async function handleDrop(targetId: string) {
    if (dragId === null || dragId === targetId) {
      setDragId(null);
      return;
    }
    const current = withProfile;
    const dragIndex = current.findIndex((e) => e.id === dragId);
    const targetIndex = current.findIndex((e) => e.id === targetId);
    if (dragIndex === -1 || targetIndex === -1) {
      setDragId(null);
      return;
    }
    const next = [...current];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) {
      setDragId(null);
      return;
    }
    next.splice(targetIndex, 0, moved);
    setDragId(null);
    setEntries([...next, ...withoutProfile]);
    try {
      const reordered = await runReorder(next.map((e) => e.id));
      setEntries(reordered);
    } catch {
      load();
    }
  }

  const forbidden =
    createState.forbidden || updateState.forbidden || removeState.forbidden || reorderState.forbidden;

  function renderForm() {
    if (!form) return null;
    // `isActive` has no effect on create — `anakUsahaProfileCreateRequestSchema` has no such
    // field, so a new profile always starts active (spec: "an active flag defaulting to
    // active"). Hiding the control here instead of sending a value the API would reject.
    const hasExistingProfile = entries.find((e) => e.id === editingId)?.profile != null;
    return (
      <div className="space-y-3 border-t border-[var(--rule)] p-4">
        <div>
          <label className={FIELD_LABEL}>Logo</label>
          <div className="flex items-center gap-3">
            <label className={FILE_LABEL}>
              Choose file
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                onChange={(e) => handleLogoSelected(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            {form.uploadingLogo && <span className="font-mono text-xs text-[var(--muted)]">Uploading…</span>}
            {form.logoPreviewUrl && (
              <>
                <img src={form.logoPreviewUrl} alt="" className="h-14 w-14 rounded-md object-contain" />
                <Button
                  variant="ghost"
                  tone="danger"
                  onClick={() => setForm({ ...form, logoMediaId: null, logoPreviewUrl: null })}
                >
                  Clear logo
                </Button>
              </>
            )}
          </div>
          {form.logoUploadError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{form.logoUploadError}</p>}
        </div>

        <div>
          <label className={FIELD_LABEL}>Kind</label>
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
            className={TEXT_INPUT}
          >
            {KIND_OPTIONS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={FIELD_LABEL}>Tile background color</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.backgroundColor}
              onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })}
              className="h-9 w-14 cursor-pointer rounded-md border border-[var(--rule)] bg-transparent p-1"
            />
            <input
              value={form.backgroundColor}
              onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })}
              placeholder="#F7F6F2"
              className={`${TEXT_INPUT} w-32 font-mono`}
            />
          </div>
          {!backgroundColorIsValid && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Must be a hex color like #F7F6F2.</p>
          )}
        </div>

        <div>
          <label className={FIELD_LABEL}>Description (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className={TEXT_INPUT}
          />
        </div>

        <div>
          <label className={FIELD_LABEL}>Links</label>
          <div className="space-y-2">
            {form.links.map((link) => {
              const hrefInvalid = link.href.trim().length > 0 && !isHttpUrl(link.href.trim());
              return (
                <div key={link.key} className="flex gap-2">
                  <div className="w-1/3">
                    <input
                      value={link.label}
                      onChange={(e) => updateLink(link.key, 'label', e.target.value)}
                      placeholder="Instagram"
                      className={TEXT_INPUT}
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      value={link.href}
                      onChange={(e) => updateLink(link.key, 'href', e.target.value)}
                      placeholder="https://instagram.com/..."
                      className={TEXT_INPUT}
                    />
                    {hrefInvalid && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Must be a valid http(s) URL.</p>}
                  </div>
                  <Button variant="ghost" tone="danger" onClick={() => removeLink(link.key)}>
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>
          <Button variant="secondary" size="sm" className="mt-2" onClick={addLink}>
            Add link
          </Button>
        </div>

        {hasExistingProfile && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active (visible on the public site)
          </label>
        )}

        <div className="flex items-center gap-3 pt-1">
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            {createState.loading || updateState.loading ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" onClick={cancelEdit}>
            Cancel
          </Button>
        </div>
        {(createState.errorMessage && !createState.forbidden) && (
          <p className="text-sm text-red-600 dark:text-red-400">{createState.errorMessage}</p>
        )}
        {(updateState.errorMessage && !updateState.forbidden) && (
          <p className="text-sm text-red-600 dark:text-red-400">{updateState.errorMessage}</p>
        )}
      </div>
    );
  }

  function renderRow(entry: AnakUsahaAdminResponse, draggable: boolean) {
    const profile = entry.profile;
    return (
      <li key={entry.id} className="border-t border-[var(--rule)] first:border-t-0">
        <div
          draggable={draggable && editingId === null}
          onDragStart={() => setDragId(entry.id)}
          onDragOver={(e) => draggable && e.preventDefault()}
          onDrop={() => draggable && handleDrop(entry.id)}
          className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--ink)]/[0.03] ${
            draggable ? 'cursor-move' : ''
          } ${profile && !profile.isActive ? 'opacity-50' : ''}`}
        >
          {draggable ? (
            <IconGrip className="h-4 w-4 shrink-0 text-[var(--muted)]/50" />
          ) : (
            <span className="w-4 shrink-0" />
          )}
          {profile?.logoUrl ? (
            <img src={profile.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-contain" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--rule)] text-[9px] text-[var(--muted)]">
              no logo
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-[var(--ink)]">{entry.name}</p>
            <p className="truncate font-mono text-xs text-[var(--muted)]">
              {profile ? `${profile.kind} · ${profile.isActive ? 'Active' : 'Inactive'}` : 'No profile yet'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Button variant="ghost" onClick={() => startEdit(entry)}>
              {profile ? 'Edit' : 'Create profile'}
            </Button>
            {profile && (
              <Button variant="ghost" tone="danger" onClick={() => handleRemoveProfile(entry.id)}>
                Remove
              </Button>
            )}
          </div>
        </div>
        {editingId === entry.id && renderForm()}
      </li>
    );
  }

  return (
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-1">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">
            {withProfile.length} of {entries.length} presented
          </p>
          <h1 className="font-display text-3xl">Anak Usaha — Presentation</h1>
        </div>
        <p className="mb-6 max-w-xl text-sm text-[var(--muted)]">
          Manage the logo, description, links, and visibility shown on the public site. This is
          separate from the plain name/slug catalog managed at Anak Perusahaan — removing a
          profile here never deletes that entry or untags any article.
        </p>

        {forbidden && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to manage anak usaha profiles.
          </p>
        )}
        {removeState.errorMessage && !removeState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{removeState.errorMessage}</p>
        )}
        {reorderState.errorMessage && !reorderState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{reorderState.errorMessage}</p>
        )}

        {loadError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {loadError}
          </p>
        )}
        {loading && <p className="font-mono text-sm text-[var(--muted)]">Loading…</p>}

        {!loading && entries.length === 0 && <p className="text-sm text-[var(--muted)]">No anak usaha entries yet.</p>}

        {!loading && entries.length > 0 && (
          <ul className="rounded-lg border border-[var(--rule)]">
            {withProfile.map((entry) => renderRow(entry, true))}
            {withoutProfile.map((entry) => renderRow(entry, false))}
          </ul>
        )}
      </div>
    </div>
  );
}
