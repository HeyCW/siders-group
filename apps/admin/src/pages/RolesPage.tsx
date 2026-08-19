import { useEffect, useRef, useState } from 'react';
import type { PermissionKey, RoleResponse, RoleSummaryResponse } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { rolesApi, type PermissionCatalogEntry } from '../lib/rolesApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { useSession } from '../session/SessionContext.js';
import { Button } from '../components/ui/Button.js';

const FIELD_LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]';
const TEXT_INPUT =
  'w-full rounded-md border border-[var(--rule)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted)]/60 focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20';

function togglePermission(set: ReadonlySet<PermissionKey>, key: PermissionKey): Set<PermissionKey> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** Module-scope, not a closure — it captures nothing from `RolesPage` and would otherwise be
 *  re-created on every render for no reason (the file's other pure helper, `togglePermission`,
 *  is at module scope for the same reason). */
function toSummary(role: RoleResponse): Omit<RoleSummaryResponse, 'holderCount'> {
  return { id: role.id, name: role.name, slug: role.slug, isSystem: role.isSystem };
}

interface PermissionEditorProps {
  catalog: PermissionCatalogEntry[];
  selected: ReadonlySet<PermissionKey>;
  onChange: (next: Set<PermissionKey>) => void;
  /** The reserved system role's `role.manage` entry cannot be cleared here — the checkbox
   *  renders disabled, and its checked state simply follows whatever the fetched detail already
   *  reported (the system role always holds `role.manage`, so in practice it renders checked and
   *  locked together), matching what the server would reject anyway
   *  (specs/rbac-management/spec.md - "The system role is protected in the console"). */
  lockedKeys?: ReadonlySet<PermissionKey> | undefined;
  idPrefix: string;
}

function PermissionEditor({ catalog, selected, onChange, lockedKeys, idPrefix }: PermissionEditorProps) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
      {catalog.map((entry) => {
        const locked = lockedKeys?.has(entry.key) ?? false;
        const inputId = `${idPrefix}-${entry.key}`;
        return (
          <label key={entry.key} htmlFor={inputId} className="flex items-start gap-2 text-sm">
            <input
              id={inputId}
              type="checkbox"
              className="mt-0.5"
              checked={selected.has(entry.key)}
              disabled={locked}
              onChange={() => onChange(togglePermission(selected, entry.key))}
            />
            <span title={entry.description} className={locked ? 'text-[var(--muted)]' : ''}>
              {entry.key}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Role administration: list roles with holder counts, create, rename, delete, and edit
 * permission sets via a checkbox grid against the fixed catalog
 * (specs/rbac-management/spec.md - "Role administration console"). Affordances the server would
 * certainly reject are not offered: no delete for the system role or a role with holders, and
 * the system role's `role.manage` checkbox cannot be cleared. Rendering stays cosmetic — a
 * rejection from the server is still authoritative.
 */
export function RolesPage() {
  const { session } = useSession();
  const account = session.status === 'authenticated' ? session.account : null;

  const [roles, setRoles] = useState<RoleSummaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[]>([]);

  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<Set<PermissionKey>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPermissions, setEditPermissions] = useState<Set<PermissionKey>>(new Set());
  const [editOriginalPermissions, setEditOriginalPermissions] = useState<Set<PermissionKey>>(new Set());
  const [editDetailError, setEditDetailError] = useState<string | null>(null);
  const [editDetailLoading, setEditDetailLoading] = useState(false);
  /** The id `startEdit` most recently requested a detail fetch for. A response is applied only
   *  if it still matches — otherwise a slower first fetch (Edit clicked on A, then B before A's
   *  response lands) would land after B's and silently overwrite B's editor with A's permission
   *  set, which a whole-set `PATCH` would then persist. */
  const editRequestRef = useRef<string | null>(null);

  const [createState, runCreate] = useAsyncAction(rolesApi.create);
  const [updateState, runUpdate] = useAsyncAction((id: string, input: Parameters<typeof rolesApi.update>[1]) =>
    rolesApi.update(id, input),
  );
  const [removeState, runRemove] = useAsyncAction(rolesApi.remove);

  // One `load()`, matching `HomeCurationPage`/`ReelsCurationPage`/`StaffPage`'s
  // `Promise.all` + single `loadError` pattern — the permission catalog is as load-bearing as
  // the role list itself (neither create nor edit works without it), so a failure to fetch it
  // is surfaced the same way a failure to fetch roles is, rather than silently rendering an
  // empty checkbox grid.
  function load() {
    setLoading(true);
    Promise.all([rolesApi.list(), rolesApi.permissionCatalog()])
      .then(([roleList, catalogList]) => {
        setRoles(roleList);
        setCatalog(catalogList);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const canCreate = name.trim().length > 0 && !createState.loading;

  async function handleCreate() {
    if (!canCreate) return;
    try {
      const created = await runCreate({ name: name.trim(), permissions: [...permissions] });
      setRoles((prev) => [...prev, { ...toSummary(created), holderCount: 0 }]);
      setName('');
      setPermissions(new Set());
    } catch {
      /* surfaced via createState.errorMessage */
    }
  }

  function startEdit(role: RoleSummaryResponse) {
    setEditingId(role.id);
    setEditName(role.name);
    setEditDetailError(null);
    setEditDetailLoading(true);
    editRequestRef.current = role.id;
    rolesApi
      .detail(role.id)
      .then((detail) => {
        if (editRequestRef.current !== role.id) return;
        const current = new Set(detail.permissions);
        setEditPermissions(current);
        setEditOriginalPermissions(current);
      })
      .catch((err: unknown) => {
        if (editRequestRef.current !== role.id) return;
        setEditDetailError(err instanceof ApiError ? err.message : 'Could not load role');
      })
      .finally(() => {
        if (editRequestRef.current === role.id) setEditDetailLoading(false);
      });
  }

  function cancelEdit() {
    editRequestRef.current = null;
    setEditingId(null);
    setEditName('');
    setEditPermissions(new Set());
    setEditOriginalPermissions(new Set());
    setEditDetailError(null);
  }

  async function handleSaveEdit() {
    if (!editingId || editName.trim().length === 0 || updateState.loading) return;
    const nextPermissions = [...editPermissions];

    // Warn before submitting an edit that removes role.manage from the role the caller
    // themselves holds — the change stays permitted once confirmed, since an Owner can always
    // restore it (specs/rbac-management/spec.md - "Warning before removing one's own
    // role-management access").
    const isOwnRole = account !== null && editingId === account.roleId;
    const removingOwnRoleManage =
      isOwnRole && editOriginalPermissions.has('role.manage') && !editPermissions.has('role.manage');
    if (removingOwnRoleManage) {
      const proceed = window.confirm(
        'This removes role-management access from your own role. You will lose the ability to manage roles ' +
          'and staff until an Owner restores it. Continue?',
      );
      if (!proceed) return;
    }

    try {
      const updated = await runUpdate(editingId, { name: editName.trim(), permissions: nextPermissions });
      setRoles((prev) => prev.map((r) => (r.id === editingId ? { ...r, ...toSummary(updated) } : r)));
      cancelEdit();
    } catch {
      /* surfaced via updateState.errorMessage */
    }
  }

  async function handleRemove(role: RoleSummaryResponse) {
    if (!window.confirm(`Delete the "${role.name}" role? This cannot be undone.`)) return;
    try {
      await runRemove(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      if (editingId === role.id) cancelEdit();
    } catch {
      /* surfaced via removeState.errorMessage */
    }
  }

  const forbidden = createState.forbidden || updateState.forbidden || removeState.forbidden;

  return (
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-1">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">{roles.length} roles</p>
          <h1 className="font-display text-3xl">Roles</h1>
        </div>
        <p className="mb-6 max-w-xl text-sm text-[var(--muted)]">
          Create roles, assign them a set of permissions from the fixed catalog, and see how many staff members
          currently hold each one.
        </p>

        {forbidden && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to manage roles.
          </p>
        )}
        {updateState.errorMessage && !updateState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{updateState.errorMessage}</p>
        )}
        {removeState.errorMessage && !removeState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{removeState.errorMessage}</p>
        )}

        <div className="mb-8 space-y-4 rounded-lg border border-[var(--rule)] p-5">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">New role</p>
          <div>
            <label htmlFor="role-name" className={FIELD_LABEL}>
              Name
            </label>
            <input id="role-name" value={name} onChange={(e) => setName(e.target.value)} className={TEXT_INPUT} />
          </div>
          <div>
            <p className={FIELD_LABEL}>Permissions</p>
            <PermissionEditor catalog={catalog} selected={permissions} onChange={setPermissions} idPrefix="new-role" />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button variant="primary" onClick={handleCreate} disabled={!canCreate}>
              {createState.loading ? 'Adding…' : 'Add role'}
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
        {!loading && roles.length === 0 && <p className="text-sm text-[var(--muted)]">No roles yet.</p>}

        <ul className="rounded-lg border border-[var(--rule)]">
          {roles.map((role, index) => (
            <li key={role.id} className={index > 0 ? 'border-t border-[var(--rule)]' : ''}>
              {editingId === role.id ? (
                <div className="space-y-3 p-4">
                  {editDetailLoading && <p className="font-mono text-xs text-[var(--muted)]">Loading permissions…</p>}
                  {editDetailError && (
                    <div className="space-y-3">
                      <p className="text-sm text-red-600 dark:text-red-400">{editDetailError}</p>
                      {/* Save has nothing valid to submit here — no permission set ever loaded —
                          but Cancel must stay reachable, or a failed fetch leaves this row with
                          no way back to its normal Edit/Delete controls until the page reloads. */}
                      <Button variant="ghost" onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  )}
                  {!editDetailLoading && !editDetailError && (
                    <>
                      <div>
                        <label htmlFor={`edit-role-name-${role.id}`} className={FIELD_LABEL}>
                          Name
                        </label>
                        <input
                          id={`edit-role-name-${role.id}`}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className={TEXT_INPUT}
                        />
                      </div>
                      <div>
                        <p className={FIELD_LABEL}>Permissions</p>
                        <PermissionEditor
                          catalog={catalog}
                          selected={editPermissions}
                          onChange={setEditPermissions}
                          lockedKeys={role.isSystem ? new Set<PermissionKey>(['role.manage']) : undefined}
                          idPrefix={`edit-role-${role.id}`}
                        />
                      </div>
                      <div className="flex items-center gap-3 pt-1">
                        <Button
                          variant="primary"
                          onClick={handleSaveEdit}
                          disabled={editName.trim().length === 0 || updateState.loading}
                        >
                          {updateState.loading ? 'Saving…' : 'Save'}
                        </Button>
                        <Button variant="ghost" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--ink)]/[0.03]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--ink)]">
                      {role.name}
                      {role.isSystem && (
                        <span className="ml-2 rounded-full bg-[var(--ink)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]">
                          System
                        </span>
                      )}
                    </p>
                    <p className="truncate font-mono text-xs text-[var(--muted)]">
                      {role.holderCount} {role.holderCount === 1 ? 'holder' : 'holders'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Button variant="ghost" onClick={() => startEdit(role)}>
                      Edit
                    </Button>
                    {role.isSystem ? null : role.holderCount > 0 ? (
                      <span
                        className="font-mono text-xs uppercase tracking-wide text-[var(--muted)]/50"
                        title={`Held by ${role.holderCount} staff member${role.holderCount === 1 ? '' : 's'} — reassign them first`}
                      >
                        Delete
                      </span>
                    ) : (
                      <Button variant="ghost" tone="danger" onClick={() => handleRemove(role)}>
                        Delete
                      </Button>
                    )}
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
