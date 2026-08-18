## 1. Authorization gate

- [ ] 1.1 Add `requireAnyPermission(...keys: PermissionKey[])` to `apps/api/src/middleware/authorize.ts`, wrapped in `markDeclaration` so `auditAuthorizationDeclarations` recognizes it; preserve the Owner bypass and the pending-password-change rejection that `requirePermission` applies
- [ ] 1.2 Add tests covering: each listed permission admits on its own, a caller with none is rejected, Owner admits without holding either, and a pending password change is rejected

## 2. Contracts

- [ ] 2.1 Add `roleSummaryResponseSchema` (id, name, slug, isSystem, holderCount) to `packages/contracts/src/role.ts`
- [ ] 2.2 Add `roleDetailResponseSchema` — the summary shape plus `permissions` — reusing `permissionKeySchema`
- [ ] 2.3 Add `staffListItemResponseSchema` to `packages/contracts/src/staff.ts` matching the existing `StaffAccountResponse` shape (id, email, name, roleId, roleName, status, mustChangePassword, createdAt); assert in a test that it carries no credential field

## 3. API: role reads

- [ ] 3.1 Add `listWithHolderCounts()` to `role.repository.ts` — one `LEFT JOIN users ON users.role_id = roles.id` with `GROUP BY roles.id` so roles with no holders still appear; do not call `countStaffWithRole` per row
- [ ] 3.2 Add `list()` and `findDetail(id)` to `role.service.ts`, with `findDetail` raising the existing 404 shape for an unknown id
- [ ] 3.3 Wire `GET /roles` with `requireAnyPermission('user.manage', 'role.manage')` and `GET /roles/:id` with `requirePermission('role.manage')`, registered **after** the existing `GET /roles/permissions` so `"permissions"` is never matched as `:id`
- [ ] 3.4 Add tests: both permissions admit to the list, neither is rejected, `GET /roles/:id` rejects a `user.manage`-only caller, unknown id 404s, a zero-holder role is present with count 0, and `GET /roles/permissions` still resolves to the catalog rather than the detail route

## 4. API: staff reads

- [ ] 4.1 Add `list()` to `staff.repository.ts` reusing `baseQuery()`, ordered by name
- [ ] 4.2 Add `list()` to `staff.service.ts` mapping every row through the existing `toStaffAccountResponse` — never return repository rows directly, since `SELECT_COLUMNS` carries `passwordHash`
- [ ] 4.3 Wire `GET /staff` with `requireAnyPermission('user.manage', 'role.manage')`
- [ ] 4.4 Add tests: both permissions admit, neither is rejected, disabled accounts are included, results are name-ordered, and no response entry contains a password hash

## 5. Admin: API clients

- [ ] 5.1 Add `apps/admin/src/lib/rolesApi.ts` (list, detail, create, update, delete, assign, permission catalog) following the shape of `partnersApi.ts`
- [ ] 5.2 Add `apps/admin/src/lib/staffApi.ts` (list, create, disable, reset)

## 6. Admin: navigation

- [ ] 6.1 Widen `NavItem.permission` in `Sidebar.tsx` to accept a set of `PermissionKey` with any-of semantics, and update `canSee` to `.some(...)`, keeping the existing Owner bypass and the comment noting rendering is cosmetic
- [ ] 6.2 Add an `Access` nav group with `Roles` (`role.manage`) and `Staff` (`user.manage` or `role.manage`), plus icons matching the existing `IconShell` style
- [ ] 6.3 Register `/roles` and `/staff` in `apps/admin/src/App.tsx`

## 7. Admin: roles page

- [ ] 7.1 Add `RolesPage.tsx` listing roles with holder counts, newest concerns first: create, rename, delete, and edit permissions
- [ ] 7.2 Render the permission editor as the catalog with the role's current permissions checked, submitting the whole set; render the server's returned state after each save
- [ ] 7.3 Disable delete for a role with holders, giving the holder count as the reason; offer no delete and no clearable `role.manage` for the system role
- [ ] 7.4 Warn before submitting an edit that removes `role.manage` from the role the caller themselves holds, naming the consequence; proceed once confirmed
- [ ] 7.5 Add tests: holder count renders, delete is blocked with a reason, the system role is protected, the self-lockout warning fires only for the caller's own role, and a save renders the server's response

## 8. Admin: staff page

- [ ] 8.1 Add `StaffPage.tsx` listing accounts ordered by name with disabled accounts visually de-emphasized, not hidden
- [ ] 8.2 Gate each row control on the permission governing it — create/disable/reset on `user.manage`, role change on `role.manage` — so one caller may see only a subset
- [ ] 8.3 Offer no role change and no disable on the caller's own row; offer no role change, disable, or reset on an Owner-holding account to a non-Owner caller
- [ ] 8.4 Add tests: name ordering, disabled rendering, per-permission control visibility, own-row suppression, and Owner-row suppression for a non-Owner

## 9. Admin: temporary password disclosure

- [ ] 9.1 After a successful create or reset, display the returned `temporaryPassword` in a dismissible panel with copy-to-clipboard and an explicit "this will not be shown again" statement
- [ ] 9.2 Ensure the value is held only in component state — never persisted, never refetched, and gone after dismissal or reload
- [ ] 9.3 Add tests: the panel appears on create and on reset, copying works, and the value is unavailable after dismissal

## 10. Verification

- [ ] 10.1 Run `pnpm test` (full workspace)
- [ ] 10.2 Run `pnpm lint` and `pnpm typecheck` (full workspace)
- [ ] 10.3 Confirm the API still boots — a gate missing `markDeclaration` makes `auditAuthorizationDeclarations` fail startup
- [ ] 10.4 Exercise against a real Postgres: both read gates admit either permission and reject neither; a `user.manage`-only caller can create staff but not change roles; a `role.manage`-only caller can change roles but not disable; delete is refused for a role with holders; the temporary password shows once on create and reset
