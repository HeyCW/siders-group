## Why

Role and staff administration is fully implemented on the server and completely unreachable from the admin panel. Every mutation exists and is carefully guarded — create/rename/delete a role, replace its permissions, assign a role to a staff member, create/disable/reset a staff account — but there is no endpoint that lists roles and no endpoint that lists staff, and no page in `apps/admin` for any of it.

The gap is structural, not an oversight. `specs/rbac-management` is written entirely as enforcement guarantees ("SHALL reject", "SHALL prevent"), and enforcement needs no enumeration. The only read it specifies is the permission catalog. `specs/staff-account-management` is the same: eight requirements, none of them UI-facing, no listing.

The practical consequence is that the surface is unusable today. Creating a staff member requires a `roleId` UUID, and no API will tell you one — an administrator has to query the database directly to operate the API at all. This change adds the read surface RBAC has never had, then renders it.

## What Changes

- Add `GET /roles` returning a summary per role (id, name, slug, `isSystem`, `holderCount`), and `GET /roles/:id` returning that plus the role's assigned permissions.
- Add `GET /staff` returning every staff account (id, name, email, roleId, roleName, status, `mustChangePassword`, createdAt), sorted by name, disabled accounts included.
- Add a `requireAnyPermission(...)` gate. `GET /roles` and `GET /staff` are readable by a caller holding **either** `user.manage` or `role.manage`, because the two administration flows are mutually dependent: assigning a role needs the staff list, and creating a staff account needs a role id. Gating each read on only its "own" permission would leave both flows unusable by half the callers entitled to them. `GET /roles/:id`, which exposes a role's permission set, stays `role.manage`.
- Add an **Access** sidebar group with two pages: `Roles` (`role.manage`) and `Staff` (`user.manage` or `role.manage`).
- The Roles page lists roles with holder counts, and creates/renames/deletes roles and edits their permission sets via checkboxes against the catalog. Delete is disabled with a reason when `holderCount > 0`, rather than letting the caller hit a blind 409.
- The Staff page lists accounts, creates them, disables them, resets their credentials, and changes their assigned role — each control shown only when the caller holds the permission that governs it, so one row may offer role changes but not disabling, or the reverse.
- After a staff account is created or reset, the admin UI displays the server-generated temporary password once, with copy-to-clipboard and an explicit "this will not be shown again" note. The API already returns it and never re-discloses it; nothing reads it today.
- Removing `role.manage` from the caller's own (non-system) role stays permitted, but the UI warns first. The Owner role remains the recovery path, so this is a self-lockout, not a system-wide one.
- Role permission edits remain a whole-set replace with last-write-wins. Two administrators editing one role concurrently is rare enough here that optimistic-concurrency machinery is not worth its cost; the UI renders the server's response after each save so the winning state is never ambiguous on screen.
- No pagination or filtering on either list — staff and role counts are in the tens.
- **BREAKING**: none. Every existing endpoint, schema, and permission keeps its current shape; this is additive.

## Capabilities

### Modified Capabilities

- `rbac-management`: gains the enumeration it never specified — listing roles with holder counts, reading one role's permissions, and the console affordances that render them (Owner protections, delete-blocked-while-assigned, the self-lockout warning). The permission catalog and every existing enforcement requirement are unchanged.
- `staff-account-management`: gains staff enumeration and the admin console requirements for creating, disabling, resetting, and role-assigning accounts, including one-time display of the generated temporary password.

## Impact

- **apps/api**: `middleware/authorize.ts` gains `requireAnyPermission` (wrapped in the existing `markDeclaration`, so the startup declaration audit recognizes it with no change). `modules/roles/` gains list + detail routes, controller handlers, service methods, and a `listWithHolderCounts` repository query. `modules/staff/` gains a list route and a `list` repository query.
- **apps/admin**: new `RolesPage.tsx` and `StaffPage.tsx`, new `rolesApi.ts` and `staffApi.ts`, new `Access` nav group, two routes in `App.tsx`. `Sidebar.tsx`'s `NavItem.permission` widens from a single `PermissionKey` to accept a set with any-of semantics, and `canSee` follows.
- **packages/contracts**: new response schemas for the role summary/detail and the staff list item. Existing role and staff request schemas are untouched.
- **Database**: no migration. `holderCount` is an aggregate over the existing `users.role_id`, computed in a single grouped query rather than per-row.
- **Security-sensitive**: the staff list must map through the existing `toStaffAccountResponse`, which strips `password_hash` from a row shape that carries it. A list endpoint that selects rows and returns them directly would leak hashes.
