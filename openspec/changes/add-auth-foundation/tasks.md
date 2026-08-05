## 1. Data model

- [ ] 1.1 Add `app.roles` (`id`, `name` unique, `slug` unique, `is_system`, `created_at`, `updated_at`), `app.permissions` (`id`, `key` unique, `description`), and `app.role_permissions` (composite PK) to the Drizzle schema in `packages/db`
- [ ] 1.2 Add `app.users` (staff) with a single `role_id` fk → `app.roles`, `status` (`invited | active | disabled`), and `updated_at`
- [ ] 1.3 Add `app.readers` (`google_sub` unique, `email_verified`, `status`, `muted_until`, `updated_at`)
- [ ] 1.4 Add `app.sessions` (`id` — the session-id claim, `subject_id`, `subject_type`, `refresh_token_hash` unique, `family_id`, `expires_at`, `absolute_expires_at`, `revoked_at`, `user_agent`, `ip_hash`)
- [ ] 1.5 Add `app.staff_tokens` (`id`, `user_id` fk → `app.users`, `purpose` (`invite | reset`), `token_hash` unique, `expires_at`, `consumed_at`, `created_at`)
- [ ] 1.6 Enable RLS with default deny on all seven new tables
- [ ] 1.7 Seed the fixed permission catalog (`news.manage`, `category.manage`, `tag.manage`, `media.manage`, `user.manage`, `role.manage`, `dashboard.view`, `settings.manage`) **in the migration only** — not in `supabase/seed.sql`, which is local-dev-only and would leave production with an empty catalog
- [ ] 1.8 Seed the `owner` role (`is_system = true`) with every catalog permission, in the same migration
- [ ] 1.9 Generate and apply the migration via `drizzle-kit` against `DIRECT_URL`
- [ ] 1.10 Extend `supabase/seed.sql` to create the first `app.users` row in `invited` status against the seeded owner role, for an operator-supplied email
- [ ] 1.11 Add an index supporting the gated-path lookup (session → subject → role → permissions) so the per-request authorization query is indexed
- [ ] 1.12 Confirm the API's database role has `BYPASSRLS` (no-op if `add-news-management-system` already verified it)

## 2. Contracts

- [ ] 2.1 Add `PERMISSION_KEYS` as an `as const` tuple plus `permissionKeySchema = z.enum(PERMISSION_KEYS)` in `packages/contracts`, mirroring the existing `article-status.ts` pattern (not a TS `enum`)
- [ ] 2.2 Add Zod schemas for staff sign-in, role create/update, role assignment, and staff invite/disable/reset requests
- [ ] 2.3 Add Zod schemas for the reader and staff session/account responses returned by the auth module, asserting no credential field is present in any response body

## 3. Core identity libraries

- [ ] 3.1 Add `ACCESS_TOKEN_PRIVATE_KEY` and `ACCESS_TOKEN_PUBLIC_KEY` (PKCS#8 PEM) to `apps/api/src/config/env.ts`'s Zod schema, validating the key format rather than just non-empty, and add them to `apps/api/.env`
- [ ] 3.2 Repurpose the already-required `SESSION_SECRET` as the CSRF signing secret and document it as such in `env.ts`, so it is not a required var with no consumer
- [ ] 3.3 Implement `apps/api/src/lib/tokens.ts`: EdDSA sign/verify of the access credential carrying `sub`, `type`, `sid`, `exp` (and no role or permission data), plus refresh-credential issuance (opaque 256-bit random, SHA-256 hashed at rest)
- [ ] 3.4 Implement refresh rotation with reuse detection in `tokens.ts`: rotating revokes the presented credential; presenting an already-revoked one revokes the whole `family_id`
- [ ] 3.5 Implement `apps/api/src/lib/password.ts`: Argon2id `hashPassword`/`verifyPassword` at OWASP baseline (19 MiB memory, 2 iterations, parallelism 1)
- [ ] 3.6 Implement single-use token helpers for `app.staff_tokens`: ≥128-bit random generation, hash-at-rest, constant-time comparison, 24-hour expiry, and consume-once semantics
- [ ] 3.7 Implement `apps/api/src/lib/mailer.ts`'s `sendEmail` against Resend, with invite and reset templates
- [ ] 3.8 Add `apps/api/src/lib/google.ts`: OAuth client config, authorization-URL builder (`state` + PKCE + `nonce`), and identity-assertion verification against Google's JWKS via `jose`
- [ ] 3.9 Add a redirect-target allowlist helper validating the post-sign-in `next` parameter against known application origins, falling back to a fixed default path

## 4. Authentication middleware

- [ ] 4.1 Rewrite `apps/api/src/middleware/authenticate.ts`: local signature verification only, no database read; populate `req.auth = { subjectId, subjectType, sessionId }`; treat missing, invalid, and expired credentials as anonymous; never reject
- [ ] 4.2 Delete the `StaffRole` union from `authenticate.ts` and drop `role` from `AuthContext`, adding `sessionId`
- [ ] 4.3 Add a test asserting anonymous, invalid-credential, and expired-credential requests all reach a public handler unrejected

## 5. CSRF protection

- [ ] 5.1 Add `apps/api/src/lib/csrf.ts`: issue a script-readable CSRF cookie signed with `SESSION_SECRET`, and compare it against the request-header token in constant time
- [ ] 5.2 Mount CSRF verification globally in `server.ts`, skipping only safe methods (GET/HEAD/OPTIONS) and requests carrying no session credential — never opt-in per route
- [ ] 5.3 Issue a fresh CSRF token whenever a session is established or its credentials are rotated, and stop accepting the previous one
- [ ] 5.4 Add tests per scenario in `specs/authentication/spec.md`'s CSRF requirement, including the same-site sibling-origin case

## 6. Rate limiting

- [ ] 6.1 Implement an actual counter store behind `apps/api/src/middleware/rateLimit.ts` so `RateLimitOptions` is enforced instead of ignored, and document the single-instance constraint (shared store required once the API scales out, per `docs/ARCHITECTURE.md` §13)
- [ ] 6.2 Apply limits to sign-in per source-and-email pair, plus a per-source cap across all email addresses so per-account limits cannot be sidestepped by spraying
- [ ] 6.3 Apply limits to invitation-acceptance, reset-token submission, reset requests, session refresh, and the sign-in callback
- [ ] 6.4 Make throttled responses indistinguishable from ordinary failure responses for the same endpoint
- [ ] 6.5 Add tests per scenario in `specs/authentication/spec.md`'s rate-limiting requirement

## 7. Session lifecycle

- [ ] 7.1 Scaffold `apps/api/src/modules/auth/` (routes, controller, service, repository, mapper)
- [ ] 7.2 Implement `POST /auth/refresh`: match the credential against a session of the same `subject_type`, confirm the subject row still exists and is active, reject revoked/expired sessions, enforce `absolute_expires_at`, then rotate
- [ ] 7.3 Implement `POST /auth/logout`: revoke the current session and clear both credential cookies plus the CSRF cookie
- [ ] 7.4 Implement bulk revocation: revoke every session for a given subject, and every session system-wide, without touching any signing key
- [ ] 7.5 Implement `GET /auth/me` as the reference reader-only endpoint (also serves staff), returning the caller's own account
- [ ] 7.6 Assert no endpoint returns an access or refresh credential in a response body, URL, or script-readable header
- [ ] 7.7 Add tests per scenario in `specs/authentication/spec.md` for refresh, reuse detection, deactivated-subject refusal, absolute-lifetime refusal, logout, and bulk revocation

## 8. Reader authentication (Google sign-in)

- [ ] 8.1 Implement `GET /auth/google`: generate `state` + PKCE + `nonce`, store them in a short-lived single-use httpOnly cookie, redirect to Google
- [ ] 8.2 Implement `GET /auth/google/callback`: verify `state` against the cookie (absent cookie = rejection), exchange the code with the PKCE verifier, verify issuer/audience/expiry/`nonce`, clear the binding cookie, and discard Google's own tokens
- [ ] 8.3 Reject sign-in and create no reader when the verified assertion does not assert a verified email
- [ ] 8.4 Implement reader upsert keyed on `google_sub` (never email) and issue our own session cookies on success
- [ ] 8.5 Validate the post-sign-in redirect target via the task 3.9 allowlist
- [ ] 8.6 Add tests per reader-sign-in scenario in `specs/authentication/spec.md`, including changed-Google-email recognition, mismatched/absent `state`, mismatched `nonce`, replayed callback, unverified email, and off-allowlist redirect

## 9. Staff authentication

- [ ] 9.1 Implement `POST /auth/staff/login`: verify email + password against `app.users`, reject non-active accounts, and return an identical generic failure for unknown-email, non-active, and wrong-password cases
- [ ] 9.2 Perform equivalent password-verification work for unknown, non-active, and existing accounts so response timing does not distinguish them (no short-circuit before hashing)
- [ ] 9.3 Add tests per scenario in `specs/authentication/spec.md`'s "Staff sign-in via email and password" requirement, including the timing-equivalence scenario

## 10. Staff account management

- [ ] 10.1 Scaffold `apps/api/src/modules/staff/` (routes, controller, service, repository, mapper)
- [ ] 10.2 Implement create/invite gated on the `user.manage` permission: write `app.users` with `status = 'invited'` and no password hash, issue a `staff_tokens` invite row, and email the link
- [ ] 10.3 Reject creating a staff account for an email that already belongs to any staff account in any status, leaving the existing account's status, role, and credentials untouched
- [ ] 10.4 Require the caller to hold the Owner role (not merely `user.manage`) when the invited account's initial role is the Owner role
- [ ] 10.5 Implement invitation acceptance: consume the token, set the password, flip `status` to `active`, and reject re-invitation of an already-active account
- [ ] 10.6 Implement disable gated on `user.manage`: flip `status` to `disabled` and revoke every session for that account; reject a staff member disabling their own account
- [ ] 10.7 Implement Owner-triggered reset and unauthenticated self-service reset request, both returning an identical response whether or not the account exists
- [ ] 10.8 Revoke every existing session for the account whenever a password is set through a reset or invitation-acceptance path, and invalidate any other outstanding token of that kind
- [ ] 10.9 Add tests per scenario in `specs/staff-account-management/spec.md`

## 11. RBAC — roles and permissions

- [ ] 11.1 Scaffold `apps/api/src/modules/roles/` (routes, controller, service, repository, mapper)
- [ ] 11.2 Implement role create/update/delete gated on the `role.manage` permission, rejecting duplicate role names
- [ ] 11.3 Reject role deletion while the role is still assigned to at least one staff member
- [ ] 11.4 Reject any create/update whose name or slug would resolve to the reserved Owner identity, and ignore/reject a client-supplied `is_system` marker
- [ ] 11.5 Reject deleting the seeded Owner role and reject removing `role.manage` from it
- [ ] 11.6 Implement role assignment (replaces the staff member's single prior role), rejecting self-reassignment
- [ ] 11.7 Require the caller to hold the Owner role (not merely `role.manage`) when assigning the Owner role
- [ ] 11.8 Implement the permission-catalog read endpoint, and reject assigning any permission outside the catalog
- [ ] 11.9 Add tests per scenario in `specs/rbac-management/spec.md`

## 12. Authorization guards

- [ ] 12.1 Rewrite `apps/api/src/middleware/authorize.ts` to export `requirePublic()`, `requireReader()`, `requireStaff()`, and `requirePermission(key)`. `requireStaff` loses its `...allowedRoles` parameter — role-name checks become `requirePermission`
- [ ] 12.2 Implement the single indexed gated-path query resolving session → subject status → `role_id` → permission keys, rejecting a revoked session or non-active subject before evaluating the permission. No in-process cache — correctness over a saved query, per design.md
- [ ] 12.3 Implement Owner recognition against the seeded role's immutable id, resolved once at boot; never against a name or slug
- [ ] 12.4 Enforce reader status and `muted_until` in `requireReader`: reject non-active readers, and reject muted readers at content-creating endpoints while leaving read access intact
- [ ] 12.5 Implement the startup route audit: fail boot if any registered route carries no authorization declaration
- [ ] 12.6 Add declarations to every route this change introduces (`auth`, `staff`, `roles`) and to the existing `health` route
- [ ] 12.7 Add tests per scenario in `specs/authorization/spec.md`, including revocation-on-next-request, demotion-before-expiry, Owner bypass surviving an emptied `role_permissions`, a look-alike role receiving no bypass, and the undeclared-route boot failure

## 13. Reconcile existing code

- [ ] 13.1 Update `apps/api/src/modules/users/user.mapper.ts`: replace the hardcoded `'owner' | 'editor' | 'author'` union on `StaffUserRow` and `StaffUserDto` with the assigned role's id and name from `app.roles`
- [ ] 13.2 Implement `UserRepository.findById` against the real `app.users` table (currently a throwing stub)
- [ ] 13.3 Add a `requireStaff` declaration to `GET /users/me`, preserving its current 401-for-anonymous outcome now that rejection has moved from `authenticate` to authorization
- [ ] 13.4 Grep for remaining `StaffRole` references and confirm none survive

## 14. Documentation

- [x] 14.1 Update `docs/ARCHITECTURE.md` §5.1: replace `role app.staff_role` with `role_id` fk → `app.roles`, and add the `roles`/`permissions`/`role_permissions`/`staff_tokens` tables plus `sessions.absolute_expires_at`
- [x] 14.2 Update `docs/ARCHITECTURE.md` §5.3: the access credential carries `sub`, `type`, `sid`, `exp` — not `role` — and note that signing-key rotation does not end sessions (bulk revocation does)
- [x] 14.3 Update `docs/ARCHITECTURE.md` §5.5: replace the `req.auth = { id, type, role }` snippet with the `{ subjectId, subjectType, sessionId }` shape, and document the two-tier stateless-identification / stateful-authorization split and fail-closed declarations
- [x] 14.4 Update `docs/ARCHITECTURE.md` §4: `authorize.ts` provides declaration guards rather than role guards; add the `roles`/`staff` modules and `csrf.ts`
- [x] 14.5 Update `docs/ARCHITECTURE.md` §11: refine the admin-gating item to cover permission declarations, extend the rate-limit item to invite/reset/refresh/callback, and note that `audit_log` remains outstanding pending the follow-up change
- [x] 14.6 Update `docs/ARCHITECTURE.md` §5.4: gate staff creation on `user.manage` with Owner-only Owner-granting, reject duplicate emails, revoke sessions on password set, and extend rate limiting beyond login

## 15. Verification

- [ ] 15.1 Confirm public routes stay reachable anonymously now that `authenticate` no longer rejects, and that every route carries a declaration (boot succeeds)
- [ ] 15.2 Manual QA: invite a staff member → accept invite → sign in → refresh → hit a `role.manage`-gated route as non-Owner (rejected) → assign a role granting it (allowed) → attempt to create a role claiming the Owner identity (rejected) → attempt to grant Owner as non-Owner (rejected)
- [ ] 15.3 Manual QA: sign in, then disable that account from another session → confirm the first session's next request is rejected without waiting for credential expiry
- [ ] 15.4 Manual QA: reader completes Google sign-in → session survives a refresh → logout → confirm the access cookie is rejected immediately
- [ ] 15.5 Manual QA: confirm a state-changing request without a CSRF token is rejected, and that repeated failed sign-ins are actually throttled
- [ ] 15.6 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` across the workspace and confirm every new and pre-existing test passes
- [ ] 15.7 Confirm `add-news-management-system` can now add its `articles.author_id` fk → `app.users` (it needs a new task for this — its task 1.1 only creates the article tables)
