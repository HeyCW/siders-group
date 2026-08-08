# Manual QA — add-auth-foundation

## What this list is for

127 automated tests already cover the business logic — but every one of them runs against
in-memory fakes or a hand-written stub query builder. **Six things have never executed a
single line of SQL against real Postgres:**

| Never run against a real database |
|---|
| `apps/api/src/modules/auth/session.repository.ts` |
| `apps/api/src/modules/auth/reader.repository.ts` |
| `apps/api/src/modules/staff/staff.repository.ts` |
| `apps/api/src/modules/roles/role.repository.ts` |
| `apps/api/src/modules/users/user.repository.ts` |
| the 4-table gated-path join inside `middleware/authorize.ts` |

A wrong column name, a broken join, a missing `.returning()`, a constraint that surfaces as a
500 instead of a 409 — none of that is catchable by the test suite as written. **That is the
entire point of this list.** Everything below is ordered so the code that has never run gets
exercised first, and so a failure surfaces as early as possible.

Section 9 at the end lists what is deliberately **not** here, and why.

---

## How to drive it

Staff onboarding has no email step. Creation and reset each return a system-generated
`temporaryPassword` **once**, in the response body. There is no invite link and no
`accept-invite` endpoint — both were removed when the email flow was dropped.

Cookies: `sid_at` (access, httpOnly) · `sid_rt` (refresh, httpOnly) · `csrf_token` (script-readable)

**The one thing that will waste your time if you skip it:** any `POST`/`PATCH`/`DELETE` that
carries a session cookie needs an `x-csrf-token` header whose value **exactly** matches the
`csrf_token` cookie — the whole value, nothing appended. A `POST` carrying *no* session cookie
skips the check entirely, which is why sign-in itself needs no header. If you get `csrf_failed`
on sign-in, it means a **stale** session cookie is still attached; clear the cookie jar.

In Postman, add this to the **Tests** tab of the sign-in and refresh requests so the token
tracks rotation automatically:

```js
const t = pm.cookies.get('csrf_token');
if (t) pm.collectionVariables.set('csrf_token', t);
```

Then every other request uses the header `x-csrf-token: {{csrf_token}}`.

---

## 0. Prerequisites

- [v] `supabase start`, migration applied, catalog + Owner role seeded, `.env` valid, API boots
- [ ] Confirm the API's DB role has `BYPASSRLS` — **skip if you connect as the `postgres` superuser**, which bypasses RLS anyway. This only matters when the API runs under a restricted role, i.e. on Supabase proper, not locally.

> ⚠️ **Any tick made before the temporary-password rewrite is void.** Earlier passes tested
> the invite-by-email flow, against code that no longer exists — including `POST /staff`,
> whose response shape and resulting row both changed. Start section 1 from scratch.

---

## 1. The spine — run this first

Five requests, in order. They exercise `staff.repository` (3 methods), `session.repository` (2),
`user.repository` (1), the gated-path join, and `ownerRole.ts` — more real SQL per minute than
anything else on this list. If this sequence passes, most of the untested surface is proven.

- [v] **1.1** `POST /auth/staff/login` → `owner@example.com` / `local-dev-owner-password` → `204`, and `sid_at` + `sid_rt` + `csrf_token` all appear in `Set-Cookie`
  *Proves: `staff.repository.findByEmail`, `session.repository.create`, token signing, cookie flags.*

- [v] **1.2** `GET /users/me` → `200`, body shows `roleName: "Owner"` and `mustChangePassword: true`
  *Proves: `user.repository.findById`'s join to `app.roles`, and the `allowPendingPasswordChange` exemption.*

- [v] **1.3** `GET /roles/permissions` → **`403` with code `password_change_required`** (not `forbidden`)
  *Proves: the 4-table gated-path join actually runs, and the pending-change gate fires **before** the Owner bypass. If this returns `200`, the gate is broken. If it returns a 500, the join is broken.*

- [v] **1.4** `POST /staff/me/password` with `{"currentPassword":"local-dev-owner-password","newPassword":"<something new>"}` → `204`
  *Proves: `setPassword`, `clearPasswordChangeFlag`, `revokeAllForSubjectExcept`.*

- [v] **1.5** `GET /roles/permissions` again, **same session, no re-login** → `200`, exactly 8 keys
  *Proves: the flag cleared, the caller's own session survived its own password change, and the Owner bypass works against real permission rows.*

## 2. Constraints and errors only a real database produces

- [v] **2.1** `POST /roles` `{"name":"Editor","permissions":["news.manage","category.manage"]}` → `201`, response has a server-derived `slug: "editor"`
- [v] **2.2** `POST /roles` with the same name again → **`409`, not a 500** — the unique constraint must be caught, not leaked
- [v] **2.3** `POST /roles` `{"name":"editor","permissions":[]}` (different name, same slug) → **`409`, not a 500**
- [v] **2.4** `POST /roles` `{"name":"!!!","permissions":[]}` → `400` (slugifies to nothing)
- [v] **2.5** `POST /staff` `{"email":"editor@test.local","name":"Editor One","roleId":"<Editor id>"}` → `201` **with a `temporaryPassword` in the body**, and the row lands `status = 'active'`, `must_change_password = true`
- [v] **2.6** `POST /staff` with that same email again → **`409`, not a 500**
- [v] **2.7** `POST /staff` with a `password` field in the body → `400` (`.strict()` — the initial password is never caller-supplied)
- [v] **2.8** `DELETE /roles/<Editor id>` while that staff member holds it → rejected (FK still referenced)
- [v] **2.9** `DELETE /roles/<Owner role id>` → rejected

## 3. Permission enforcement against real rows

- [v] **3.1** Sign in as `editor@test.local` with its temporary password → `204`
- [v] **3.2** Any gated route → `403 password_change_required`
- [v] **3.3** Change its password via `POST /staff/me/password` → `204`
- [v] **3.4** `GET /roles/permissions` as the Editor → **`403 forbidden`** (a *different* code from 3.2 — Editor genuinely lacks `role.manage`)
- [v] **3.5** As Editor, `POST /staff` → `403` (lacks `user.manage`)
- [v] **3.6** As Owner, `POST /roles/assign/<editor staff id>` with `{"roleId":"<Owner role id>"}` → allowed. As a non-Owner holding `role.manage`, the same request → rejected.

## 4. Revocation — the guarantee the whole two-tier design exists for

Each of these needs **two sessions open at once** (two Postman environments, or one Postman +
one curl cookie jar). The point is that a change takes effect on the *other* session's very
next request, without waiting for its access token to expire.

- [v] **4.1** Sign in as Editor in session B. As Owner in session A, `POST /staff/<editor id>/disable` → session B's next request is rejected **immediately**
  *Proves: `revokeAllForSubject` and the session-validity columns in the join.*
- [v] **4.2** Sign in as Editor again. As Owner, `POST /staff/<editor id>/reset` → `200` with a **new** `temporaryPassword`; session B dies immediately; the old password no longer signs in; the new one does, and lands back in `password_change_required`
- [v] **4.3** As Owner, demote the Editor's role to one lacking a permission they had — their next request to that route is refused, no re-login involved
- [v] **4.4** `POST /staff/<owner's own id>/disable` as that Owner → rejected (self-disable bar)
- [v] **4.5** As a non-Owner holding `user.manage`, disable an Owner → rejected
- [v] **4.6** `POST /staff/<nonexistent uuid>/reset` → `404` (reset is authenticated now — there is no unauthenticated path left to protect from enumeration)

## 5. Session lifecycle

- [v] **5.1** `POST /auth/refresh` → `204`, **new** `sid_at`/`sid_rt`/`csrf_token`; the old refresh cookie is now dead
- [v] **5.2** Replay a refresh token you already rotated → rejected, **and every session in that family is revoked** — confirm a second device on the same lineage is now signed out
  *Proves: `findByRefreshTokenHash` + `revokeFamily`. This is the highest-value item in the section — reuse detection is pure repository code.*
- [v] **5.3** After 5.1, a request carrying the **old** `csrf_token` → `csrf_failed`; the new one works
- [v] **5.4** `POST /auth/logout` → all three cookies cleared, and the old `sid_at` is rejected immediately
- [v] **5.5** `SELECT ip_hash FROM app.sessions LIMIT 1` → a hex digest, never a readable IP

## 6. Reader sign-in via Google — zero automated coverage

Nothing in this section is covered by any test. It needs real Google credentials, which
`.env` appears to have.

- [v] **6.1** `GET /auth/google` redirects to Google carrying `state`, `code_challenge`, `nonce`
- [ ] **6.2** Complete the round trip → a row lands in `app.readers`, session cookies are issued, and **no Google token is stored anywhere**
- [ ] **6.3** `GET /auth/me` returns that reader
  *Proves: `reader.repository` and the reader half of the gated-path join.*
- [ ] **6.4** Replay the same callback URL a second time → rejected (binding cookie is single-use)
- [ ] **6.5** Tamper with `state` in the callback URL → rejected
- [ ] **6.6** `?next=https://evil.example.com` → lands on the default in-app path instead
- [ ] **6.7** Set that reader's `status = 'banned'` directly in SQL → their next request is rejected
- [ ] **6.8** Set `muted_until` to a future timestamp → reads still work, content-creating requests are refused

## 7. Credential leakage — cheap to check, expensive to miss

- [ ] **7.1** The `temporaryPassword` appears **only** in the create and reset responses — never in `GET /users/me`, never in any other endpoint
- [ ] **7.2** Grep the API's stdout after running sections 1–3: no plaintext password, no `sid_at`/`sid_rt` value in any log line
- [ ] **7.3** In browser devtools, `document.cookie` shows `csrf_token` but **not** `sid_at`/`sid_rt` (httpOnly holding)
- [ ] **7.4** `SELECT password_hash FROM app.users` → every row starts `$argon2id$`, no plaintext anywhere

## 8. One boot-time check

- [v] **8.1** Add a route with no guard declaration, start the API → **boot fails** naming that route. Remove it again.
  *(Already confirmed once earlier; re-run only if `authorize.ts` changed since.)*

---

## 9. Deliberately not on this list

Cut because the automated suite already proves them, and re-testing by hand buys nothing:

| Skipped | Why |
|---|---|
| Rate-limit ceilings, spraying, throttle indistinguishability | `authRateLimit.test.ts` mounts the **real** exported limiter chains over supertest — same config that ships. Hand-testing means 30+ deliberate failed logins to learn nothing new. |
| Sign-in timing equivalence | `staffLogin.service.test.ts` measures it. A stopwatch in Postman is noise, not signal. |
| CSRF mechanics (missing / mismatched / safe methods / sibling origin) | `csrf.test.ts`, 12 tests. Item 5.3 keeps the one case tests can't reach: rotation across a real cookie round-trip. |
| Owner bypass with `role_permissions` emptied; look-alike role gets no bypass | `authorize.test.ts` covers both. Item 1.5 proves the bypass works on real rows, which is the part that needed a database. |
| Role name/slug/`isSystem` validation rules | `role.service.test.ts`, 15 tests. Items 2.2–2.4 keep only the cases where a **database constraint** decides the status code. |
| `TRUST_PROXY_HOPS` behind a proxy | There is no proxy in front of the local API. Verify when infrastructure exists, not before. |
| Anonymous access to `/health`, expired/garbage tokens treated as anonymous | `health.routes.test.ts` boots the real server; `authenticate.test.ts` covers the token cases. |

## Known gaps that survive this list

- Rate limiting is an **in-process** counter: it resets on restart and does not hold once the API runs more than one instance. Documented in `docs/ARCHITECTURE.md` §13 as a Redis upgrade.
- Losing every Owner account at once needs a manual database edit — there is no unauthenticated recovery path by design (`design.md` - Risks).
