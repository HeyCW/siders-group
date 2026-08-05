## Context

`docs/ARCHITECTURE.md` §5 already specifies most of the authentication mechanics: Google OAuth for readers, invite-only email+password for staff, a shared `app.sessions` table with refresh rotation and reuse detection, EdDSA-signed short-lived access credentials in httpOnly cookies, and an `authenticate` middleware that treats missing or invalid credentials as anonymous rather than an error. None of it is implemented — `apps/api/src/middleware/authenticate.ts` currently does the opposite (unconditional 401), `apps/api/src/lib/{tokens,password,mailer}.ts` are throwing stubs, and `apps/api/src/lib/google.ts` does not exist yet. `apps/api/src/middleware/rateLimit.ts` exists but is a pass-through that ignores its options.

What §5 does *not* cover, and what this change adds, is permission-based RBAC. The prior plan was a fixed `role` enum (`owner | editor | author`) checked by name; this change replaces it with roles-as-permission-bundles, because `add-news-management-system` and later modules need to gate on capability rather than on a role string every new admin screen has to know about.

See `proposal.md` - Why for motivation and `specs/{authentication,authorization,staff-account-management,rbac-management}/spec.md` for the behavior contract.

## Goals / Non-Goals

**Goals:**
- Make `authenticate`/`authorize` real, matching the architecture doc's contract: identification never rejects, authorization always does.
- Replace the fixed staff role enum with permission-based RBAC, with an Owner role that can neither be locked out nor impersonated.
- Give every future module the same declaration vocabulary (public / reader-only / staff-only / named permission), enforced fail-closed.
- Unblock `add-news-management-system`'s `author_id → app.users` reference and its staff gating.

**Non-Goals:**
- **Audit logging is deferred to a separate follow-up change.** `docs/ARCHITECTURE.md` §11 lists `audit_log` on every admin mutation as a requirement, and nothing currently covers it. This change deliberately does not add it, to keep the auth foundation reviewable in one pass. The privileged mutations introduced here (role CRUD, role assignment, staff disable, credential reset) therefore ship without a trail until that change lands — recorded as a required follow-up in `proposal.md` - Impact so it cannot be lost.
- Implementing the reader-facing features that consume reader auth (likes, comments) — only the `requireReader` mechanism and one reader-only endpoint (`GET /auth/me`) to prove it.
- Rewiring `add-news-management-system`'s article routes onto `requirePermission('news.manage')` — that happens when that change resumes. `news.manage` therefore ships seeded but unenforced.
- Social sign-in providers other than Google.
- An admin UI for role/permission management — API and data model only.
- A shared/distributed cache or session store. See the authorization-lookup decision below.

## Decisions

**Two-tier check: identification is stateless, authorization is stateful.** This is the central decision, and it replaces an earlier sketch that put `roleId` in the access credential and kept all authorization DB-free.

```
every request
     │
     ▼
authenticate ──────────── local EdDSA verify only, NO database read
     │                    claims: sub, type, sid (session id)
     │                    populates req.auth; never rejects
     ▼
declaration?
     ├── public ───────► handler          (DB-free path, high volume)
     └── reader-only / staff-only / permission
             │
             ▼
        one indexed query: session ⋈ subject ⋈ role ⋈ role_permissions
        rejects if: session revoked/expired · subject not active · permission absent
             │
             ▼
          handler
```

The access credential carries a **session id (`sid`)** and no role or permission data. Every authorization guard resolves the session, the subject's current status, the subject's current `role_id`, and that role's permissions in a single indexed query. This is what makes the specs' revocation guarantees achievable: sign-out, account disable, reader ban, role reassignment, and permission edits all bite on the caller's very next gated request, because none of that state is carried in the credential.
- Alternative considered (and rejected): embed `roleId` in the credential and keep authorization DB-free. This cannot satisfy `specs/rbac-management` "effective on their next request", `specs/staff-account-management` disable-revokes-sessions, or `specs/authentication` sign-out — a credential minted before the change still asserts the old role, and nothing reads `app.sessions` on the access path. The earlier draft of this design made exactly that mistake.
- Alternative considered (and rejected for v1): an in-process cache in front of that query. `docs/ARCHITECTURE.md` §11 anticipates more than one API instance, where in-process state is inherently per-replica and never truly invalidated cluster-wide — the same constraint this change's own rate-limit counter store (§6) and the archived `bootstrap-monorepo`'s in-process `node-cron` both accept. The difference here isn't the mechanism, it's the consequence of staleness: a rate-limit window that's briefly too loose, or a cron job that fires twice across replicas, degrades gracefully and is bounded (an advisory lock closes the cron case outright). A stale permission cache degrades by **silently granting access that was just revoked** — the exact failure this design exists to close. That asymmetry, not "no in-process state" as a blanket rule, is why this one query stays uncached while the other two don't. Gated traffic is admin actions plus reader-authored actions — not the hot path — so the extra query is affordable. Revisit only with a measured need, and then with a shared store rather than per-process state.
- Consequence accepted: a **public** endpoint that reads `req.auth` for personalization sees identity without a revocation check, for up to the access credential's lifetime. Public endpoints must therefore not make authorization decisions from `req.auth` — that is what a declaration is for.

**Owner recognition keys on the seeded row's immutable id, never on a slug.** `requirePermission` grants an automatic pass to the Owner role, so how the system *recognizes* Owner is security-critical. Recognition is by the seeded role's primary key, resolved once at boot. A caller-editable string in that path would be a privilege-escalation vector: any holder of `role.manage` could create a role named "Owner", receive the bypass, and inherit the entire catalog. `is_system` and role identity are therefore set only by migration and are rejected from every request payload.
- Alternative considered: drop the bypass entirely and rely on the Owner role holding every catalog permission through ordinary assignment rows. Rejected — a partially-applied migration or an accidental permission removal could then lock out all administration with no recovery short of a manual DB edit. The bypass is availability insurance; keying it on an immutable id is what keeps it from becoming an escalation path.

**Granting Owner is Owner-only, and self-mutation is barred.** Ordinary staff administration gates on permissions (`user.manage`, `role.manage`), but two operations additionally require the caller to *hold* the Owner role: assigning the Owner role, and inviting a staff account whose initial role is Owner. Without this, `user.manage` or `role.manage` is a complete path to Owner. Separately, no staff member may change their own role assignment or disable their own account, closing the self-escalation and self-lockout variants.

**Authorization is fail-closed, with a startup route audit.** Every registered route carries an explicit declaration; a route with none is denied, and boot fails if any registered route lacks one. The old always-401 stub made a forgotten guard impossible to miss; a default-public rule would turn the same mistake into a silently world-readable admin endpoint. The audit runs at startup over the registered route table so the failure is a failed deploy, not a discovered breach.

**CSRF: double-submit token, mounted globally.** Cookie-borne credentials plus `SameSite=Lax` and a `.siders.id` cookie domain means every sibling subdomain is same-site, so `SameSite` alone does not stop forged state-changing calls. Per `docs/ARCHITECTURE.md` §5.3 the defense is a double-submit token: a script-readable CSRF cookie issued with the session, echoed in a header, compared server-side. Mounted globally and skipped only for safe methods and credential-less requests — never opt-in per route, for the same fail-closed reason as the declaration audit.

**Rate limiting has to be built, not just wired.** `apps/api/src/middleware/rateLimit.ts` is currently a no-op that accepts `RateLimitOptions` and ignores them, so "wire up rate limiting" would close nothing. This change implements the counter store behind it. Coverage is not just login: invitation-acceptance and reset-token submission are guessable-secret endpoints and need attempt caps, and per-source caps across all emails are needed so per-account limits can't be sidestepped by spraying. Per-account-only lockout is also avoided on its own, since it lets anyone deny service to a known staff address.

**Data model** (new tables in the `app` schema, RLS default-deny per `docs/ARCHITECTURE.md` §6.3, API role has `BYPASSRLS`):
- `app.roles`: `id`, `name` (unique), `slug` (unique), `is_system` (true only for the seeded Owner row), `created_at`, `updated_at`.
- `app.permissions`: `id`, `key` (unique — `news.manage`, `category.manage`, `tag.manage`, `media.manage`, `user.manage`, `role.manage`, `dashboard.view`, `settings.manage`), `description`. Seeded **by migration only**, never by `supabase/seed.sql` — that file is local-dev seed data, so seeding the catalog there would leave production with an empty catalog and every permission check failing.
- `app.role_permissions`: `role_id`, `permission_id` (composite PK).
- `app.users` (staff): `id`, `email` (unique), `password_hash` (null until invite accepted), `name`, `role_id` (fk → `app.roles`, exactly one), `status` (`invited | active | disabled`), `last_login_at`, `created_at`, `updated_at`. This is the table `add-news-management-system`'s `articles.author_id` references.
- `app.readers`: `id`, `google_sub` (unique — keyed on this, not email, per §5.1), `email`, `email_verified`, `name`, `avatar_url`, `status`, `muted_until`, `last_login_at`, `created_at`, `updated_at`.
- `app.sessions`: `id` (the `sid` claim), `subject_id`, `subject_type` (`staff | reader`), `refresh_token_hash` (unique), `family_id` (rotation lineage), `absolute_expires_at` (hard cap independent of sliding refresh), `user_agent`, `ip_hash`, `expires_at`, `revoked_at`, `created_at`. One table for both audiences; every lookup filters on `subject_type` and re-validates the subject row, since a polymorphic `subject_id` cannot carry a foreign key.
- `app.staff_tokens`: `id`, `user_id` (fk → `app.users`), `purpose` (`invite | reset`), `token_hash` (unique), `expires_at`, `consumed_at`, `created_at`. The specs require single-use, expiring, hashed-at-rest invitation and reset tokens; without this table there is nowhere to store them.

**`SESSION_SECRET` is repurposed, not orphaned.** `apps/api/src/config/env.ts` already requires it, but access credentials are EdDSA-signed and refresh credentials are opaque random values hashed at rest, so nothing in this design would consume it. Rather than leave a required env var with no reader, it becomes the CSRF token signing secret. New env vars are limited to the access-credential key pair (`ACCESS_TOKEN_PRIVATE_KEY` / `ACCESS_TOKEN_PUBLIC_KEY`, PKCS#8 PEM); `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` already exist and are already required.

**Keep the existing `AuthContext` naming.** `authenticate.ts` defines `{ subjectId, subjectType }` and `authorize.ts` and `user.controller.ts` already consume that naming, not the architecture doc's illustrative `id`/`type`. Extend it with `sessionId`; drop `role`. The `StaffRole` union is deleted, which reaches further than the middleware: `user.mapper.ts` hardcodes `'owner' | 'editor' | 'author'` on both `StaffUserRow` and the client-facing `StaffUserDto`, and `requireStaff`'s current signature takes `...allowedRoles: StaffRole[]`. Both change here — `requireStaff` loses its role parameter (role-name checks become `requirePermission`), and the users DTO exposes the assigned role by id and name from `app.roles`.

**Google OAuth and password hashing follow the architecture doc exactly** — server-side authorization-code flow with `state` + PKCE + `nonce` via `arctic`, identity assertion verified against Google's JWKS via `jose` (§5.2), Argon2id at OWASP baseline (19 MiB memory, 2 iterations, parallelism 1) for staff passwords (§5.4). Sign-in additionally rejects an unverified email and validates the post-sign-in redirect target against an origin allowlist, since an unvalidated `next` parameter on a freshly-trusted endpoint is a phishing vector.

**Bootstrapping the first Owner.** No API path can create the first staff account, since creation requires `user.manage` and granting Owner requires holding Owner. The migration seeds the Owner role (`is_system = true`, every catalog permission); `supabase/seed.sql` creates one `app.users` row in `invited` status against that role for an operator-supplied email. The first sign-in is then an ordinary invitation acceptance, with no special-case code path to maintain or attack.

## Risks / Trade-offs

- **[One extra query on every gated request]** → admin and reader-authored traffic each pay an indexed join that the earlier cached design avoided. Mitigation: accepted deliberately in exchange for correct revocation; the high-volume public read path stays DB-free. Revisit with a shared cache only if measurement justifies it.
- **[Personalized public endpoints see unrevoked identity]** → a public endpoint reading `req.auth` can act on an identity whose session was revoked moments ago. Mitigation: public endpoints must not make authorization decisions from `req.auth`; anything access-controlled carries a declaration and therefore goes through the stateful check.
- **[Owner bypass remains a second source of truth]** → even keyed on an immutable id, `requirePermission` has a branch that isn't the permission table. Mitigation: covered by a test asserting an Owner with all `role_permissions` rows deleted still passes, and a second asserting a look-alike role gets no bypass.
- **[Signing-key rotation does not end sessions]** → rotating the access-credential key pair invalidates access credentials only. Refresh credentials are opaque `app.sessions` rows, unaffected by the key, so clients silently refresh and continue. Key rotation is therefore **not** an incident-response tool for session compromise; bulk session revocation is, which is why it is a specified requirement rather than an operational afterthought.
- **[Polymorphic `sessions.subject_id` has no FK]** → referential integrity cannot be enforced across two subject tables. Mitigation: every lookup filters on `subject_type` and joins the correct subject table, re-validating status; a session whose subject row has vanished fails closed.
- **[Fail-closed declarations add per-route ceremony]** → every new route must declare, forever, or boot fails. Mitigation: that is the intended trade; a failed deploy is strictly preferable to a silently public admin endpoint.
- **[New required env vars]** → `ACCESS_TOKEN_PRIVATE_KEY` / `ACCESS_TOKEN_PUBLIC_KEY` become required, so an existing `apps/api/.env` that predates this change will fail Zod validation at boot with "Invalid environment configuration" until they're added. Called out in tasks.md so it isn't discovered mid-implementation.
- **[Audit trail absent until the follow-up lands]** → role changes, role assignments, disables, and resets are unlogged in the interim. Mitigation: deliberate scope decision recorded above and in `proposal.md`; the preventive controls (Owner-only grants, no self-mutation, reserved Owner identity) are in this change, so the gap is detective, not preventive.

## Migration Plan

Net-new tables only (`roles`, `permissions`, `role_permissions`, `users`, `readers`, `sessions`, `staff_tokens`); no existing data affected. Rollback is dropping those seven tables, reverting `authenticate.ts` / `authorize.ts` / `tokens.ts` / `password.ts` / `mailer.ts` / `rateLimit.ts` to their current stub state, deleting the new `google.ts`, and restoring the `StaffRole` union in `authenticate.ts` and `user.mapper.ts`.

Once `app.users` exists, `add-news-management-system` can add the `articles.author_id` foreign key described in its `design.md` - Data model. Note that no task in that change currently adds this FK — its task 1.1 only creates the article tables — so the FK needs an explicit task there when it resumes.

## Open Questions

_None that block this change._ Whether reader sign-in ever needs a non-Google provider is genuinely deferrable — nothing here forecloses it (a `provider` discriminator alongside `google_sub` on `app.readers` covers it when it comes up).
