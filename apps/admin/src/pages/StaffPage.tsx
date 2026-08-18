import { useEffect, useState } from 'react';
import type { RoleSummaryResponse, StaffListItemResponse } from '@siders/contracts';
import { ApiError } from '../lib/api.js';
import { rolesApi } from '../lib/rolesApi.js';
import { staffApi } from '../lib/staffApi.js';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { useSession } from '../session/SessionContext.js';
import { TemporaryPasswordPanel } from '../components/TemporaryPasswordPanel.js';

const FIELD_LABEL = 'mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]';
const TEXT_INPUT =
  'w-full rounded-md border border-[var(--rule)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--muted)]/60 focus:border-[var(--signal)] focus:outline-none focus:ring-2 focus:ring-[var(--signal)]/20';

interface DisclosedPassword {
  accountLabel: string;
  temporaryPassword: string;
}

/**
 * Staff administration: list accounts, create them, disable them, reset their credentials, and
 * change their assigned role (specs/staff-account-management/spec.md - "Staff administration
 * console"). Each row's controls follow the permission that governs the underlying operation,
 * not page access, so a `role.manage`-only caller sees the role-change control and nothing
 * else. Controls the server would certainly reject are withheld: the caller's own row offers no
 * role change or disable, and a non-Owner sees no role-change, disable, or reset control on an
 * Owner-held account.
 */
export function StaffPage() {
  const { session } = useSession();
  const account = session.status === 'authenticated' ? session.account : null;

  const [staff, setStaff] = useState<StaffListItemResponse[]>([]);
  const [roles, setRoles] = useState<RoleSummaryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState('');

  const [disclosed, setDisclosed] = useState<DisclosedPassword | null>(null);

  const [createState, runCreate] = useAsyncAction(staffApi.create);
  const [disableState, runDisable] = useAsyncAction(staffApi.disable);
  const [resetState, runReset] = useAsyncAction(staffApi.reset);
  const [assignState, runAssign] = useAsyncAction((staffId: string, targetRoleId: string) =>
    rolesApi.assign(staffId, targetRoleId),
  );

  function load() {
    setLoading(true);
    Promise.all([staffApi.list(), rolesApi.list()])
      .then(([staffList, roleList]) => {
        setStaff([...staffList].sort((a, b) => a.name.localeCompare(b.name)));
        setRoles(roleList);
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : 'Could not load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const canCreateOrManageAccounts = account !== null && (account.isOwner || account.permissionKeys.includes('user.manage'));
  const canChangeRoles = account !== null && (account.isOwner || account.permissionKeys.includes('role.manage'));

  const canCreate = email.trim().length > 0 && name.trim().length > 0 && roleId !== '' && !createState.loading;

  function roleIsSystem(id: string): boolean {
    return roles.find((r) => r.id === id)?.isSystem ?? false;
  }

  async function handleCreate() {
    if (!canCreate) return;
    try {
      const created = await runCreate({ email: email.trim(), name: name.trim(), roleId });
      setStaff((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setDisclosed({ accountLabel: created.name, temporaryPassword: created.temporaryPassword });
      setEmail('');
      setName('');
      setRoleId('');
    } catch {
      /* surfaced via createState.errorMessage */
    }
  }

  async function handleDisable(entry: StaffListItemResponse) {
    if (!window.confirm(`Disable ${entry.name}'s account? They will be signed out immediately.`)) return;
    try {
      await runDisable(entry.id);
      setStaff((prev) => prev.map((s) => (s.id === entry.id ? { ...s, status: 'disabled' } : s)));
    } catch {
      /* surfaced via disableState.errorMessage */
    }
  }

  async function handleReset(entry: StaffListItemResponse) {
    if (!window.confirm(`Reset ${entry.name}'s credentials? Their current sessions will be signed out.`)) return;
    try {
      const { temporaryPassword } = await runReset(entry.id);
      setDisclosed({ accountLabel: entry.name, temporaryPassword });
      setStaff((prev) => prev.map((s) => (s.id === entry.id ? { ...s, mustChangePassword: true } : s)));
    } catch {
      /* surfaced via resetState.errorMessage */
    }
  }

  async function handleAssign(entry: StaffListItemResponse, newRoleId: string) {
    if (newRoleId === entry.roleId) return;
    try {
      await runAssign(entry.id, newRoleId);
      const role = roles.find((r) => r.id === newRoleId);
      setStaff((prev) =>
        prev.map((s) => (s.id === entry.id ? { ...s, roleId: newRoleId, roleName: role?.name ?? s.roleName } : s)),
      );
    } catch {
      /* surfaced via assignState.errorMessage — the select below reverts on the next render
         since it is driven by `entry.roleId`, which the failed call left unchanged */
    }
  }

  const forbidden = createState.forbidden || disableState.forbidden || resetState.forbidden || assignState.forbidden;

  return (
    <div className="siders-scope min-h-full bg-[var(--paper)] text-[var(--ink)]">
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-1">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">{staff.length} accounts</p>
          <h1 className="font-display text-3xl">Staff</h1>
        </div>
        <p className="mb-6 max-w-xl text-sm text-[var(--muted)]">
          Create staff accounts, disable them, reset their credentials, and assign roles.
        </p>

        {forbidden && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            You don&apos;t have permission to perform that action.
          </p>
        )}
        {disableState.errorMessage && !disableState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{disableState.errorMessage}</p>
        )}
        {resetState.errorMessage && !resetState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{resetState.errorMessage}</p>
        )}
        {assignState.errorMessage && !assignState.forbidden && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">{assignState.errorMessage}</p>
        )}

        {disclosed && (
          <TemporaryPasswordPanel
            accountLabel={disclosed.accountLabel}
            temporaryPassword={disclosed.temporaryPassword}
            onDismiss={() => setDisclosed(null)}
          />
        )}

        {canCreateOrManageAccounts && (
          <div className="mb-8 space-y-4 rounded-lg border border-[var(--rule)] p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--muted)]">New account</p>
            <div>
              <label htmlFor="staff-name" className={FIELD_LABEL}>
                Name
              </label>
              <input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} className={TEXT_INPUT} />
            </div>
            <div>
              <label htmlFor="staff-email" className={FIELD_LABEL}>
                Email
              </label>
              <input
                id="staff-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={TEXT_INPUT}
              />
            </div>
            <div>
              <label htmlFor="staff-role" className={FIELD_LABEL}>
                Role
              </label>
              <select id="staff-role" value={roleId} onChange={(e) => setRoleId(e.target.value)} className={TEXT_INPUT}>
                <option value="">Select a role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate}
                className="rounded-md bg-[var(--signal)] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--signal-hover)] disabled:opacity-50"
              >
                {createState.loading ? 'Creating…' : 'Create account'}
              </button>
              {createState.errorMessage && !createState.forbidden && (
                <p className="text-sm text-red-600 dark:text-red-400">{createState.errorMessage}</p>
              )}
            </div>
          </div>
        )}

        {loadError && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {loadError}
          </p>
        )}
        {loading && <p className="font-mono text-sm text-[var(--muted)]">Loading…</p>}
        {!loading && staff.length === 0 && <p className="text-sm text-[var(--muted)]">No staff accounts yet.</p>}

        <ul className="rounded-lg border border-[var(--rule)]">
          {staff.map((entry, index) => {
            const isOwnRow = account !== null && entry.id === account.id;
            const targetHoldsOwner = roleIsSystem(entry.roleId);
            const showRoleChange = canChangeRoles && !isOwnRow && (!targetHoldsOwner || (account?.isOwner ?? false));
            const showDisable = canCreateOrManageAccounts && !isOwnRow && (!targetHoldsOwner || (account?.isOwner ?? false));
            const showReset = canCreateOrManageAccounts && (!targetHoldsOwner || (account?.isOwner ?? false));

            return (
              <li
                key={entry.id}
                className={`flex items-center gap-3 px-3 py-2.5 ${index > 0 ? 'border-t border-[var(--rule)]' : ''} ${
                  entry.status === 'disabled' ? 'opacity-50' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--ink)]">
                    {entry.name}
                    {entry.status === 'disabled' && (
                      <span className="ml-2 rounded-full bg-[var(--ink)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]">
                        Disabled
                      </span>
                    )}
                    {entry.mustChangePassword && (
                      <span className="ml-2 rounded-full bg-[var(--ink)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]">
                        Pending password change
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-xs text-[var(--muted)]">{entry.email}</p>
                </div>

                {showRoleChange ? (
                  <select
                    aria-label={`Role for ${entry.name}`}
                    value={entry.roleId}
                    disabled={assignState.loading}
                    onChange={(e) => handleAssign(entry, e.target.value)}
                    className="shrink-0 rounded-md border border-[var(--rule)] bg-transparent px-2 py-1 text-xs"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="shrink-0 font-mono text-xs text-[var(--muted)]">{entry.roleName}</span>
                )}

                <div className="flex shrink-0 items-center gap-3">
                  {showReset && (
                    <button
                      type="button"
                      onClick={() => handleReset(entry)}
                      disabled={resetState.loading}
                      className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      Reset
                    </button>
                  )}
                  {showDisable && entry.status === 'active' && (
                    <button
                      type="button"
                      onClick={() => handleDisable(entry)}
                      disabled={disableState.loading}
                      className="font-mono text-xs uppercase tracking-wide text-[var(--muted)] hover:text-red-600 dark:hover:text-red-400"
                    >
                      Disable
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
