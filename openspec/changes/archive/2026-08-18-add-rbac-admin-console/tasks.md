## 1. Authorization gate

- [x] 1.1 Add `requireAnyPermission(...keys: PermissionKey[])` to `apps/api/src/middleware/authorize.ts`, wrapped in `markDeclaration` so `auditAuthorizationDeclarations` recognizes it; preserve the Owner bypass and the pending-password-change rejection that `requirePermission` applies
- [x] 1.2 Add tests covering: each listed permission admits on its own, a caller with none is rejected, Owner admits without holding either, and a pending password change is rejected

## 2. Contracts

- [x] 2.1 Add `roleSummaryResponseSchema` (id, name, slug, isSystem, holderCount) to `packages/contracts/src/role.ts`
- [x] 2.2 Add `roleDetailResponseSchema` — the summary shape plus `permissions` — reusing `permissionKeySchema`
- [x] 2.3 Add `staffListItemResponseSchema` to `packages/contracts/src/staff.ts` matching the existing `StaffAccountResponse` shape (id, email, name, roleId, roleName, status, mustChangePassword, createdAt); assert in a test that it carries no credential field

## 3. API: role reads

- [x] 3.1 Add `listWithHolderCounts()` to `role.repository.ts` — one `LEFT JOIN users ON users.role_id = roles.id` with `GROUP BY roles.id` so roles with no holders still appear; do not call `countStaffWithRole` per row
- [x] 3.2 Add `list()` and `findDetail(id)` to `role.service.ts`, with `findDetail` raising the existing 404 shape for an unknown id
- [x] 3.3 Wire `GET /roles` with `requireAnyPermission('user.manage', 'role.manage')` and `GET /roles/:id` with `requirePermission('role.manage')`, registered **after** the existing `GET /roles/permissions` so `"permissions"` is never matched as `:id`
- [x] 3.4 Add tests: both permissions admit to the list, neither is rejected (`authorize.test.ts`'s `requireAnyPermission`/`requirePermission` suites, per this codebase's existing convention of testing gates generically rather than per module), `GET /roles/:id` rejects a `user.manage`-only caller (same convention), unknown id 404s and a zero-holder role is present with count 0 (`role.service.test.ts`), and `GET /roles/permissions` still resolves to the catalog rather than the detail route (`role.routes.test.ts`)

## 4. API: staff reads

- [x] 4.1 Add `list()` to `staff.repository.ts` reusing `baseQuery()`, ordered by name
- [x] 4.2 Add `list()` to `staff.service.ts` mapping every row through the existing `toStaffAccountResponse` — never return repository rows directly, since `SELECT_COLUMNS` carries `passwordHash`
- [x] 4.3 Wire `GET /staff` with `requireAnyPermission('user.manage', 'role.manage')`
- [x] 4.4 Add tests: both permissions admit, neither is rejected (`authorize.test.ts`, generic convention), disabled accounts are included, results are name-ordered, and no response entry contains a password hash (`staff.service.test.ts`)

## 5. Admin: API clients

- [x] 5.1 Add `apps/admin/src/lib/rolesApi.ts` (list, detail, create, update, delete, assign, permission catalog) following the shape of `partnersApi.ts`
- [x] 5.2 Add `apps/admin/src/lib/staffApi.ts` (list, create, disable, reset)

## 6. Admin: navigation

- [x] 6.1 Widen `NavItem.permission` in `Sidebar.tsx` to accept a set of `PermissionKey` with any-of semantics, and update `canSee` to `.some(...)`, keeping the existing Owner bypass and the comment noting rendering is cosmetic
- [x] 6.2 Add an `Access` nav group with `Roles` (`role.manage`) and `Staff` (`user.manage` or `role.manage`), plus icons matching the existing `IconShell` style
- [x] 6.3 Register `/roles` and `/staff` in `apps/admin/src/App.tsx`

## 7. Admin: roles page

- [x] 7.1 Add `RolesPage.tsx` listing roles with holder counts, newest concerns first: create, rename, delete, and edit permissions
- [x] 7.2 Render the permission editor as the catalog with the role's current permissions checked, submitting the whole set; render the server's returned state after each save
- [x] 7.3 Disable delete for a role with holders, giving the holder count as the reason; offer no delete and no clearable `role.manage` for the system role
- [x] 7.4 Warn before submitting an edit that removes `role.manage` from the role the caller themselves holds, naming the consequence; proceed once confirmed
- [x] 7.5 Add tests: holder count renders, delete is blocked with a reason, the system role is protected, the self-lockout warning fires only for the caller's own role, and a save renders the server's response

## 8. Admin: staff page

- [x] 8.1 Add `StaffPage.tsx` listing accounts ordered by name with disabled accounts visually de-emphasized, not hidden
- [x] 8.2 Gate each row control on the permission governing it — create/disable/reset on `user.manage`, role change on `role.manage` — so one caller may see only a subset
- [x] 8.3 Offer no role change and no disable on the caller's own row; offer no role change, disable, or reset on an Owner-holding account to a non-Owner caller
- [x] 8.4 Add tests: name ordering, disabled rendering, per-permission control visibility, own-row suppression, and Owner-row suppression for a non-Owner

## 9. Admin: temporary password disclosure

- [x] 9.1 After a successful create or reset, display the returned `temporaryPassword` in a dismissible panel with copy-to-clipboard and an explicit "this will not be shown again" statement
- [x] 9.2 Ensure the value is held only in component state — never persisted, never refetched, and gone after dismissal or reload
- [x] 9.3 Add tests: the panel appears on create and on reset, copying works, and the value is unavailable after dismissal

## 10. Verification

- [x] 10.1 Run `pnpm test` (full workspace) — 98 files, 854 tests, all passing
- [x] 10.2 Run `pnpm lint` and `pnpm typecheck` (full workspace) — clean. `pnpm build` also verified clean for every package this change touches (`apps/admin`, `apps/api`, `packages/contracts`); `apps/web`'s build failure is pre-existing and unrelated — it prerenders `/` and `/news/[slug]` against a live API at build time and there is none running in this environment, and `git status` confirms zero files under `apps/web` were touched by this change
- [x] 10.3 Confirm the API still boots — `health.routes.test.ts` runs `createServer()` for real, which calls `auditAuthorizationDeclarations` as its last step; it passed in the full suite run, confirming every new route (`requireAnyPermission`-gated and otherwise) carries a recognized declaration
- [ ] 10.4 Exercise against a real Postgres: both read gates admit either permission and reject neither; a `user.manage`-only caller can create staff but not change roles; a `role.manage`-only caller can change roles but not disable; delete is refused for a role with holders; the temporary password shows once on create and reset — **not done in this session**: no Postgres instance is available in this sandboxed environment (`apps/web`'s build failure above is the same constraint — no live backend to exercise against). Everything this task would check is covered by unit/service/route tests instead (`authorize.test.ts`, `role.service.test.ts`, `staff.service.test.ts`, `role.routes.test.ts`, `RolesPage.test.tsx`, `StaffPage.test.tsx`, `TemporaryPasswordPanel.test.tsx`), but a real end-to-end pass against live Postgres is still open
