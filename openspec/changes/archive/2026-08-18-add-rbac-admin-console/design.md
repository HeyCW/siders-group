# Design

## Context

The RBAC and staff modules are mutation-complete and read-empty. `role.repository.ts` has `findById`, `findByName`, `findBySlug`, `countStaffWithRole` — and no `listRoles`. `staff.repository.ts` has `findById`, `findByEmail` — and no `list`. `users/user.routes.ts` exposes only `GET /me`.

That shape follows directly from how the specs were written: as enforcement guarantees. Nothing in `rbac-management` or `staff-account-management` asks the system to *show* anything except the permission catalog, so nothing was built to. Putting a human in front of the API is what forces enumeration to exist.

## Decisions

### The read gate is "either permission", not "both" and not "each its own"

`GET /roles` and `GET /staff` are gated on `user.manage` **OR** `role.manage`.

The two flows are mutually dependent, which the obvious gating gets wrong:

| Control | Endpoint | Governing permission | Also needs |
|---|---|---|---|
| Change a staff member's role | `POST /roles/assign/:staffId` | `role.manage` | the **staff** list |
| Create a staff account | `POST /staff` (takes `roleId`) | `user.manage` | the **role** list |
| Disable / reset | `POST /staff/:id/{disable,reset}` | `user.manage` | the staff list |

Gate the staff list on `user.manage` alone and a `role.manage` holder cannot see who to assign roles to. Gate the role list on `role.manage` alone and a `user.manage` holder cannot create anyone, because they can never learn a `roleId`. Either choice makes one legitimate administrator's job impossible.

`GET /roles/:id` is the exception and stays `role.manage`: a role's *permission set* is role-administration data, and a `user.manage`-only caller picking a role from a dropdown does not need it.

**Implementation.** `authorize.ts` currently exposes four gate shapes, each wrapped by `markDeclaration(fn)`, which stamps a `DECLARATION_MARKER` symbol. The startup `auditAuthorizationDeclarations` walk only checks for that marker — it is deliberately agnostic about which shape produced it. So `requireAnyPermission(...keys)` is a fifth shape that the fail-closed audit recognizes for free, with no change to the audit itself. It must preserve the Owner bypass that `requirePermission` has, and the pending-password-change rejection.

**Alternative rejected:** giving the pickers their own unguarded-ish endpoint (`GET /roles/options`). It adds a third read surface to keep in sync for no benefit over widening one gate.

### Summary list, detail on demand

`GET /roles` returns `{ id, name, slug, isSystem, holderCount }`. `GET /roles/:id` adds `permissions[]`.

The list drives the table and the assignment dropdown, and neither needs permission sets. The split is also what lets the list be readable under the OR gate while permission data stays behind `role.manage`. `findById` already returns `RoleWithPermissions`, so the detail endpoint is nearly free.

**Route ordering hazard:** `GET /roles/permissions` already exists. It must stay registered *before* `GET /roles/:id`, or Express matches `"permissions"` as `:id` and the request dies on UUID validation. It is currently first in `role.routes.ts` — the constraint is to not reorder it.

### `holderCount` is one grouped query

The Roles table shows how many staff hold each role, so Delete can be disabled with a reason instead of letting the caller hit a blind 409 from the existing `role_in_use` guard.

`countStaffWithRole(id)` already exists but is per-role; calling it once per row is N+1. The list needs a single `LEFT JOIN users ON users.role_id = roles.id … GROUP BY roles.id`. Roles with no holders must still appear, hence the left join.

### Last-write-wins on permission edits

`PATCH /roles/:id` replaces the whole permission set, which is what a checkbox grid naturally produces. Two administrators editing one role concurrently would silently clobber each other, and there is no version or ETag to prevent it.

Accepted. The population is a handful of administrators editing a handful of roles; optimistic-concurrency machinery costs more than the collision it prevents. The mitigation is presentational: the page renders the server's response after each save, so the surviving state is never ambiguous on screen.

### Self-lockout is permitted, with a warning

`role.service.ts` blocks removing `role.manage` only from the *system* (Owner) role. A non-Owner holding a custom role with `role.manage` can therefore strip it from their own role and lose role administration.

This stays permitted. The Owner role always retains `role.manage` and cannot be deleted, so this is a self-lockout recoverable by an Owner — not the system-wide loss the existing requirement guards against. But it is surprising enough to warrant an explicit confirmation naming the consequence, rather than a silent success that logs the caller out of a capability they still expect to have.

### Two pages, not one tabbed page

Roles-as-permission-bundles and people-with-roles are different mental models with different primary keys, and only the assignment control spans both. Two routes under a shared **Access** sidebar group keeps each page's gating honest — `Roles` on `role.manage`, `Staff` on the OR gate — which a single page cannot express, since it would have to be visible under the union and then hide half its own content.

### The temporary password is displayed exactly once

`create` and `triggerReset` both return a generated `temporaryPassword` that is never re-readable — `toStaffCreateResponse` is documented as "the one response that also carries a plaintext credential". No UI reads it today, which is the missing first link in an otherwise complete chain:

```
admin creates/resets  →  temp password shown ONCE   ← the only gap
        ↓
staff signs in        →  mustChangePassword = true
        ↓
RequireSession confines the app to /change-password   (already built)
        ↓
POST /staff/me/password clears the flag, kills other sessions   (already built)
```

Everything downstream of the first arrow already exists and is specced in `admin-session`. This change adds only the disclosure surface: a panel with copy-to-clipboard and an explicit statement that the value cannot be retrieved again.

### Sidebar gating widens to any-of

`NavItem.permission` is a single `PermissionKey`, and `canSee` is `account.isOwner || account.permissionKeys.includes(permission)`. The `Staff` item needs any-of semantics, so the field becomes a set and `canSee` becomes a `.some(...)`. Group hiding already handles the rest — a group whose items all fail `canSee` is dropped.

This rendering stays cosmetic. Per `admin-session`, a 403 from the server remains authoritative regardless of what the sidebar shows.

## Risks

- **Password hash leakage.** `staff.repository.ts`'s `SELECT_COLUMNS` includes `passwordHash`, and `baseQuery()` is the natural thing for a list to reuse. Every row must go through `toStaffAccountResponse`, which strips it. A list handler that returns repository rows directly leaks hashes for every staff account to anyone holding either read permission.
- **Widening a gate is a permission change.** `requireAnyPermission` makes staff and role data readable by strictly more callers than any single existing gate. The mitigation is that both lists are non-secret administrative metadata; no credential, hash, or session data is in either payload.
- **The startup audit is load-bearing.** If `requireAnyPermission` is written without `markDeclaration`, the new routes are reported undeclared and the server refuses to boot. That is the fail-closed behavior working correctly, but it will look like a mysterious startup failure if the marker is forgotten.
