## Why

Every module needs to know who's calling and what they're allowed to do, but today `authenticate` (`apps/api/src/middleware/authenticate.ts`) is a stub that unconditionally rejects with 401, and `authorize.ts` only checks a fixed role string. There is no permission system, no staff identity table, and no reader identity table. `add-news-management-system` is already blocked on this: its `author_id` needs a real `app.users` row to reference and its admin endpoints need a real staff gate. Building auth as a one-off inside the news change would tie a foundational capability to a single consumer; every future module (comments, media, dashboard, system settings) would otherwise duplicate or depend on news's internals.

## What Changes

- Replace the `authenticate` stub with a real implementation: verifies the access-credential cookie when present, populates `req.auth` for staff and readers, and always calls `next()` — anonymous is a valid outcome, not an error. This matches `docs/ARCHITECTURE.md` §5.5's own reference contract, which the current stub contradicts.
- Introduce authorization as a layer separate from authentication, and make it **fail closed**: every route declares one of public / reader-only / staff-only / a named permission, an undeclared route is denied, and the app refuses to boot if any registered route lacks a declaration.
- Make revocation real by splitting the two tiers: identification stays stateless and DB-free, while every authorization guard resolves session, account status, role, and permissions from storage. Sign-out, account disable, reader ban, role reassignment, and permission edits all take effect on the caller's next gated request rather than lingering until a credential expires.
- Add reader identity: Google OAuth sign-in (server-side authorization-code flow with `state`, PKCE, and `nonce`, rejecting unverified emails and validating the post-sign-in redirect target, per §5.2), reader account upsert keyed on `google_sub`, reader sessions.
- Add staff identity: invite-only account creation (no public signup), email+password login with timing-equivalent failure handling, Argon2id password hashing, credential reset — with a `staff_tokens` table holding single-use, hashed, 24-hour invitation and reset tokens.
- Add refresh-credential session handling shared by both audiences: one `app.sessions` table, rotation with reuse detection (a replayed, already-revoked credential revokes the whole family), an absolute session lifetime cap, bulk revocation, and httpOnly Secure cookies that never appear in a response body.
- Add CSRF protection: a double-submit token mounted globally on state-changing requests, since a `.siders.id` cookie domain makes every sibling subdomain same-site and `SameSite=Lax` alone is not the specified defense (§5.3).
- Implement enforcement in `rateLimit.ts` (today a no-op that ignores its options), covering sign-in per source-and-email pair, per-source spraying across accounts, and attempts against invitation-acceptance and reset-token submission.
- Add permission-based RBAC for staff: `roles`, `permissions`, and `role_permissions` tables, each staff member holding exactly one role. Seed a fixed catalog covering news, category, tag, media, user, and role management plus dashboard and system settings. Admin endpoints declare the permission they require instead of checking a role name.
- Protect the Owner role against both lockout and impersonation: it cannot be deleted or stripped of role management, its identity is reserved to the seeded record and unclaimable through any API, granting it requires already holding it, and no staff member may change their own role or disable their own account.
- **BREAKING**: none against shipped behavior. `authenticate`/`authorize` have one caller today (`GET /users/me`), whose 401-for-anonymous outcome is preserved — the route gains an explicit `requireStaff` declaration, so rejection moves from identification to authorization. The `StaffRole` union (`owner | editor | author`) is deleted, which also changes `requireStaff`'s signature and the users DTO.

## Capabilities

### New Capabilities
- `authentication`: identifying the caller — reader Google sign-in, staff email+password login, session issuance, rotation, revocation, CSRF, rate limiting, anonymous passthrough.
- `authorization`: enforcing access separately from identification — explicit fail-closed declarations, reader-only, staff-only, and permission-based guards, and the guarantee that public content stays reachable anonymously.
- `staff-account-management`: staff lifecycle — invite, accept, disable, and reset credentials, gated on user management with Owner-only protection around granting Owner.
- `rbac-management`: role and permission administration — role CRUD, assigning permissions to roles, assigning one role per staff member, the fixed catalog, and the Owner role's reserved identity.

### Modified Capabilities
_None — no existing main spec covers auth yet. `bootstrap-monorepo` shipped only stub middleware with `skip_specs: true`. `add-news-management-system`'s specs are not yet synced to main; they declare staff-session gating on admin article endpoints, which this change preserves, so no requirement of theirs changes._

## Impact

- **Affected code**: `apps/api/src/middleware/{authenticate,authorize,rateLimit}.ts` (all three rewritten from stubs), `apps/api/src/lib/{tokens,password,mailer}.ts` (fleshed out), new `apps/api/src/lib/{google,csrf}.ts`, new `apps/api/src/modules/{auth,staff,roles}/`, `apps/api/src/modules/users/` (DTO loses the `StaffRole` union; route gains a declaration), `packages/db` (seven new tables + migration), `packages/contracts` (session, role, permission, and staff-admin Zod schemas).
- **Dependencies**: `arctic` (Google OAuth flow), `jose` (credential signing/verification and Google JWKS), an Argon2id implementation (e.g. `@node-rs/argon2`), Resend (already scaffolded via `mailer.ts`).
- **Env vars**: adds `ACCESS_TOKEN_PRIVATE_KEY` / `ACCESS_TOKEN_PUBLIC_KEY`. Repurposes the already-required `SESSION_SECRET` as the CSRF signing secret rather than leaving it consumerless. The `GOOGLE_*` vars already exist and are already required.
- **Migration**: None to existing data — all new tables.
- **Documentation**: `docs/ARCHITECTURE.md` §4, §5.1, §5.3, §5.5, and §11 describe the fixed `staff_role` enum, a `role` claim in the access credential, and a `req.auth` shape this change supersedes. Those sections are updated as part of this change so the doc does not contradict the shipped design.
- **Deferred, and tracked here so it is not lost**: `docs/ARCHITECTURE.md` §11 requires `audit_log` on every admin mutation, and no change currently covers it. This change introduces the mutations that most need a trail (role CRUD, role assignment, staff disable, credential reset) and deliberately ships without one — an `add-audit-logging` follow-up change is required.
- **Follow-up edits required in `add-news-management-system` when it resumes**: its `design.md` Context still asserts that staff roles are `owner | editor | author` and that auth "already exists and is out of scope"; its Non-Goals say the same. Both need correcting to the permission catalog. Its task 4.2 gates article writes on `requireStaff` alone, so `news.manage` ships seeded but unenforced until that task swaps in `requirePermission('news.manage')`. Its `articles.author_id` foreign key has no task at all — only a line in its design's data model — so it needs one now that `app.users` exists.
- **Blocks/unblocks**: unblocks `add-news-management-system`'s admin write path and every future module needing staff- or reader-gated endpoints.
