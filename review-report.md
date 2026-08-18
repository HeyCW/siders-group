# Resolvable review — `add-contact-us-feature`

**Verdict:** All threads resolved · **0 items remain**
**Range:** `origin/main...a22063e` (PR #17) · 30 files · +3482 / −40 · 2026-08-18
**Implements:** `openspec/changes/add-contact-us-feature`

Commits: `197ee40` change proposal · `a22063e` implementation · *(this pass)* `dad9fda` the R1–R12
fixes below, pushed to `add-contact-us-feature`.

Each thread is self-contained: location, the problem, the exact patch applied, and how it was
verified. All twelve threads from the original review are resolved by code or doc fix — none were
withdrawn.

---

## Resolution tracker

| Thread | Severity | Blocked merge | File | Status |
|---|---|---|---|---|
| [R1](#r1--modified-named-a-requirement-absent-from-the-main-spec) | **Major** | ✅ was | `specs/web-public-site/spec.md` | ✅ **Resolved** |
| [R2](#r2--task-44-claimed-automated-tests-that-didnt-exist) | Minor | no | `apps/api/src/modules/contact/contact.routes.test.ts` | ✅ **Resolved** |
| [R3](#r3--client-validation-omitted-the-servers-length-caps) | Minor | no | `apps/web/components/contact/ContactForm.tsx` | ✅ **Resolved** |
| [R4](#r4--email-had-no-length-bound) | Minor | no | `packages/contracts/src/contact.ts` | ✅ **Resolved** |
| [R5](#r5--polled-load-had-no-cancellation-guard) | Minor | no | `apps/admin/src/pages/ContactMessagesPage.tsx` | ✅ **Resolved** |
| [R6](#r6--dead-findbyid-on-the-repository) | Minor | no | `apps/api/src/modules/contact/contact.repository.ts` | ✅ **Resolved** |
| [R7](#r7--shell-test-fired-an-unmocked-network-poll) | Minor | no | `apps/admin/src/components/AppShell.test.tsx` | ✅ **Resolved** |
| [R8](#r8--designmd-said-and-paginated-the-list-isnt) | Nit | no | `openspec/changes/add-contact-us-feature/design.md` | ✅ **Resolved** |
| [R9](#r9--permission-catalog-enumeration-not-refreshed) | Nit | no | `openspec/changes/add-contact-us-feature/specs/rbac-management/spec.md` | ✅ **Resolved** |
| [R10](#r10--artifacts-said-newread-code-shipped-newread) | Nit | no | `tasks.md`, `design.md`, `proposal.md`, `specs/contact-messages/spec.md` | ✅ **Resolved** |
| [R11](#r11--badge-markup-repeated-three-times) | Nit | no | `apps/admin/src/components/Sidebar.tsx` | ✅ **Resolved** |
| [R12](#r12--query-string-hand-built) | Nit | no | `apps/admin/src/lib/contactApi.ts` | ✅ **Resolved** |

**Re-verified after all fixes:** `eslint` clean, `tsc --noEmit` clean across all six projects,
**815/815** tests passing across 94 files (7 new: 6 in `contact.routes.test.ts`, 1 in
`ContactForm.test.tsx`, up from 808/93 pre-fix).

---

## Details

### R1 — `MODIFIED` named a requirement absent from the main spec

`openspec/changes/add-contact-us-feature/specs/web-public-site/spec.md`, with
`openspec/specs/web-public-site/spec.md:215`

The delta's `## MODIFIED Requirements` block was keyed to a header —
`### Requirement: Contact form validates client-side and submits to a real endpoint` — that does
not exist in the main spec (whose header there reads `...does not fabricate submission success`).
This violates the repo's own documented validation rule
(`.claude/skills/openspec-shared/cli-fallback.md:98`, *"`MODIFIED` and `REMOVED` name requirements
that exist in the corresponding main spec"*) and would strand the now-false original requirement —
*"since no backend endpoint accepts a contact submission"* — on sync, alongside a newly added
duplicate.

**Fix applied.** Added a `## RENAMED Requirements` block beneath the existing `MODIFIED` block,
matching the precedent in `add-community-moderation`'s `article-engagement` delta exactly (which
renamed "A muted reader may still like" the same way):

```markdown
## RENAMED Requirements
- FROM: `### Requirement: Contact form validates client-side and does not fabricate submission success`
- TO: `### Requirement: Contact form validates client-side and submits to a real endpoint`
```

**Verification.** Hand-checked against `cli-fallback.md`'s structural rules: `RENAMED` now names a
requirement present under its old name in the main spec and absent under its new name — exactly
what line 99 requires. No CLI is installed in this environment to re-run `openspec validate
--strict`; the hand-check is the verification available here.

### R2 — Task 4.4 claimed automated tests that didn't exist

`apps/api/src/modules/contact/contact.routes.test.ts` (new), with
`openspec/changes/add-contact-us-feature/tasks.md:25`

Task 4.4 was checked off for "tests for permission gating (missing permission, no session), the
rate limit on submission, validation rejection, and the toggle behavior", but only the toggle and
validation halves shipped. Nothing exercised `contact.routes.ts`'s wiring of
`requirePermission('contact.manage')` or `contactRateLimiter()` — a route mis-declared as
`requirePublic()` would have booted clean and passed the whole suite.

**Fix applied.** New `contact.routes.test.ts`, following the two established patterns in this repo
rather than inventing a third:

- **Rate limiting** — mounts the real exported `contactRateLimiter()` in front of a stub handler,
  the same shape `authRateLimit.test.ts` uses for `staffLoginRateLimiters()`:

```ts
function createSubmitApp(): Express {
  const app = express();
  app.use(express.json());
  app.post('/contact-messages', requirePublic(), contactRateLimiter(), (_req, res) => {
    res.status(201).json({ success: true, data: { id: 'msg-1', createdAt: new Date().toISOString() } });
  });
  app.use(createErrorHandler(silentLogger));
  return app;
}
```

  Asserts 3 submissions succeed, a 4th within the hour returns 429 `rate_limited`, and the budget
  resets cleanly via `__resetRateLimitStoreForTests()`.

- **Permission gating** — mounts the real exported `requirePermission('contact.manage')` in front
  of a stub handler, mocking `lib/db.js` / `config/env.js` / `lib/ownerRole.js` the same way
  `authorize.test.ts` does for `resolveStaffAccess`:

```ts
it('rejects a caller with no session', async () => {
  const res = await request(app).get('/admin/contact-messages');
  expect(res.status).toBe(403);
});

it('rejects a staff caller lacking contact.manage', async () => {
  vi.mocked(getDatabase).mockReturnValue(fakeDbReturning([
    { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'editor-role-id', permissionKey: null },
  ]) as never);
  // ... 403
});

it('allows a staff caller holding contact.manage', async () => {
  vi.mocked(getDatabase).mockReturnValue(fakeDbReturning([
    { subjectId: 'staff-1', ...liveSession(), status: 'active', roleId: 'editor-role-id', permissionKey: 'contact.manage' },
  ]) as never);
  // ... 200
});
```

`tasks.md` 4.4 now names what actually covers each clause: routes.test.ts for gating and the rate
limit, `contracts/src/contact.test.ts` for validation rejection, `contact.service.test.ts` for the
toggle and unknown-id cases.

**Test added.** `contact.routes.test.ts` — 6 tests: 3 rate-limit (accepts up to 3/hour, rejects the
4th, namespace isolation after reset), 3 permission-gate (no session → 403, lacking permission →
403, holding permission → 200). All pass.

### R3 — Client validation omitted the server's length caps

`apps/web/components/contact/ContactForm.tsx`, with `packages/contracts/src/contact.ts`

`contactMessageSubmitRequestSchema` caps name/organisation/subject at 200 and message at 5000
chars, but `ContactForm.tsx`'s `validate()` checked only presence and email shape, and no input
carried a `maxLength`. An over-length submission passed client validation, got a 400, and surfaced
as the generic "Sending failed — try again" — a retry that could never succeed.

**Fix applied.** Exported the length constants from `contact.ts` (previously module-private) and
used them on both sides:

```ts
// packages/contracts/src/contact.ts
export const CONTACT_NAME_MAX_LENGTH = 200;
export const CONTACT_ORGANISATION_MAX_LENGTH = 200;
export const CONTACT_SUBJECT_MAX_LENGTH = 200;
export const CONTACT_MESSAGE_MAX_LENGTH = 5000;
```

```tsx
// ContactForm.tsx
function validate(form: FormState): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = 'Required';
  else if (form.name.trim().length > CONTACT_NAME_MAX_LENGTH) errors.name = `Keep it under ${CONTACT_NAME_MAX_LENGTH} characters`;
  // ... same pattern for organisation, email, subject, message
}
```

Every input also gained a `maxLength` attribute matching its schema cap, and organisation/subject
now render their error state (previously only name/email/message did).

**Test added.** `ContactForm.test.tsx` — *"blocks submission and shows an error for a message over
the server's length cap"*: fills a valid form, sets the message to 5001 chars, asserts the inline
error and that `submitContactMessage` is never called. Passes.

### R4 — `email` had no length bound

`packages/contracts/src/contact.ts:23`

Every sibling field was `.max()`-bounded except `email: z.string().trim().email()`. Zod's email
check has no length ceiling, so a 90,000-character local part validated; the only real cap was
`express.json()`'s default 100 KB body limit.

**Fix applied.**

```ts
export const CONTACT_EMAIL_MAX_LENGTH = 320; // RFC 5321 4.5.3.1.3 — max total mailbox length
// ...
email: z.string().trim().email().max(CONTACT_EMAIL_MAX_LENGTH),
```

Also wired into `ContactForm.tsx`'s `validate()` and the email input's `maxLength` (R3's mechanism
covers this field too).

**Verification.** `contracts/src/contact.test.ts`'s existing schema tests continue to pass
unmodified (valid emails well under 320 chars); `tsc --noEmit` confirms the new export threads
through both consumers with no type errors.

### R5 — Polled load had no cancellation guard

`apps/admin/src/pages/ContactMessagesPage.tsx`

`loadMessages` fired and unconditionally called `setMessages`/`setLoadError` on resolve, with no
guard against a slower, earlier response landing after a newer one (a fast filter switch) or after
unmount (a poll tick in flight). Every background tick also called `setLoading(true)`, flashing
"Loading…" every 30 seconds even when nothing changed. `Sidebar.tsx`'s own poll, added in the same
change, already had this guard — it just wasn't applied here.

**Fix applied.** Merged the initial-load and poll effects into one, with a single `cancelled` flag
scoped to the effect (torn down and reset on every `statusFilter` change, exactly like
`Sidebar.tsx:241-256`), and a `showLoading` parameter so only the initial load, filter change, and
an explicit Refresh action show the loading state:

```tsx
useEffect(() => {
  let cancelled = false;

  function load(showLoading: boolean) {
    if (showLoading) setLoading(true);
    setLoadError(null);
    contactApi.list({ status: statusFilter })
      .then((rows) => { if (!cancelled) setMessages(rows); })
      .catch((err) => { if (!cancelled) setLoadError(...); })
      .finally(() => { if (!cancelled && showLoading) setLoading(false); });
  }

  load(true);
  const id = setInterval(() => load(false), POLL_INTERVAL_MS);
  return () => { cancelled = true; clearInterval(id); };
}, [statusFilter, reloadToken]);
```

The Refresh button now bumps a `reloadToken` state to force a fresh, guarded run through the same
path, rather than calling an ungated `loadMessages` directly.

**Verification.** `tsc --noEmit` and `eslint` clean; no existing test exercised this page's timing
behavior, so none needed updating, and the full suite still passes at 815/815.

### R6 — Dead `findById` on the repository

`apps/api/src/modules/contact/contact.repository.ts:26`, with `contact.service.test.ts:36`

`findById` was declared on `ContactMessageRepository` and implemented, but nothing called it —
`setStatus` already relies on the update returning `null` for an unknown id. Its only consumer was
the test fake.

**Fix applied.** Removed from the interface, the implementation, and the test fake.

**Verification.** `tsc --noEmit` clean (no dangling references); `contact.service.test.ts`'s
"rejects setting the status of an unknown message" test still passes unmodified, confirming
`setStatus`'s own null-check was always sufficient.

### R7 — Shell test fired an unmocked network poll

`apps/admin/src/components/AppShell.test.tsx:7`

`Sidebar` calls `contactApi.unreadCount()` on mount for the badge poll. `AppShell.test.tsx` mocked
only `SessionContext.js`, so its tests fired a real `fetch` (silently swallowed by the `.catch`)
and left a live interval running after each test.

**Fix applied.** Added a mock matching how `SessionContext.test.tsx` mocks `sessionApi.js` for the
identical reason:

```ts
vi.mock('../lib/contactApi.js', () => ({
  contactApi: { unreadCount: vi.fn().mockResolvedValue({ count: 0 }) },
}));
```

**Verification.** `AppShell.test.tsx`'s 4 existing tests still pass, now hermetically.

### R8 — `design.md` said "(and paginated)"; the list isn't

`openspec/changes/add-contact-us-feature/design.md:32`

The design doc justified the separate unread-count endpoint partly on the grounds that "the inbox
list is fetched (and paginated) only when an admin actually opens the page." No pagination shipped
— correctly, since neither `specs/contact-messages/spec.md` nor `tasks.md` requires it, and
`contracts/src/contact.ts`'s own comment already documents the choice accurately. Only the design
doc's parenthetical disagreed with the shipped, spec-compliant behavior.

**Fix applied.** Corrected the sentence to state the actual, spec-compliant decision instead of an
aspiration that was never in scope:

> A dedicated `GET .../unread-count` avoids inheriting that problem: the badge polls a cheap,
> pagination-free count, independent of whatever the inbox list itself does. The inbox list has no
> pagination requirement in this change's spec (unlike the comment queue) and is unpaginated as
> shipped — see `packages/contracts/src/contact.ts`'s note on `contactMessageListResponseSchema`.

No code change — this was a doc-only defect.

### R9 — Permission catalog enumeration not refreshed

`openspec/changes/add-contact-us-feature/specs/rbac-management/spec.md` (new)

`contact.manage` joined `PERMISSION_KEYS` with no `rbac-management` delta, unlike
`add-community-moderation`, which carried one for `moderation.manage`. The requirement's "at
minimum" wording meant this never made the spec factually wrong, but it broke the habit of keeping
the enumeration current for a change that otherwise updates every other artifact carefully.

**Fix applied.** Added the delta, matching the prior change's structure exactly:

```markdown
## MODIFIED Requirements

### Requirement: Fixed permission catalog
The system SHALL maintain a fixed catalog of permissions covering at minimum: news management,
category management, tag management, media management, user management, role management,
dashboard access, system settings, community moderation, and contact-message management. ...
```

Also added `rbac-management` to `proposal.md`'s "Modified Capabilities" list, alongside the
existing `web-public-site` entry.

**Verification.** Structural hand-check: `MODIFIED` names a requirement ("Fixed permission
catalog") that exists verbatim in the main spec, satisfying `cli-fallback.md:98`.

### R10 — Artifacts said `NEW`/`READ`; code shipped `new`/`read`

`tasks.md`, `design.md`, `proposal.md`, `specs/contact-messages/spec.md`

The Postgres enum, Zod enum, API, and admin UI all use lowercase `'new'`/`'read'`, but the change's
own planning artifacts named the states `NEW`/`READ` throughout — inconsistent with every other
`app.enum` in the codebase and with how existing specs (e.g. `community-moderation`) quote enum
values verbatim in lowercase.

**Fix applied.** Lowercased every occurrence across the four files (13 sites total), leaving the
code untouched since the code was the side that was right. Included one instance in `proposal.md`
("stays in the inbox as `READ` or `NEW`") that the original review pass missed.

**Verification.** `grep -rn "NEW\|READ"` across the change's artifacts now returns nothing.

### R11 — Badge markup repeated three times

`apps/admin/src/components/Sidebar.tsx`

The same unread-count pill markup (wordmark, nav item) and dot markup (collapsed nav item) were
each written out in full at three separate call sites, diverging from the file's own convention of
factoring repeated presentational pieces into small local components (`IconShell`, the `Icon*`
set).

**Fix applied.** Extracted two local components:

```tsx
function UnreadCountBadge({ count, title }: { count: number; title?: string }) {
  return (
    <span className="rounded-full bg-[var(--panel-signal)] px-1.5 py-0.5 text-[10px] font-medium leading-none text-white" title={title}>
      {count}
    </span>
  );
}

function UnreadDot() {
  return <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--panel-signal)]" />;
}
```

All three call sites now use them.

**Verification.** `eslint` and `tsc --noEmit` clean; visual output is unchanged (same class
strings, just deduplicated) — no visible-behavior test existed or was needed.

### R12 — Query string hand-built

`apps/admin/src/lib/contactApi.ts:17`

The status filter was interpolated directly into the URL (`?status=${query.status}`) where the
sibling client it's modelled on, `moderationApi.ts`, builds every query string through a
`URLSearchParams`-based `queryString()` helper. Zero risk today (a closed Zod enum), but a shape
divergence from the established pattern.

**Fix applied.** Added the same local helper and used it:

```ts
function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
```

**Verification.** `tsc --noEmit` clean; behavior is identical for the closed enum this call site
actually passes.

---

## Standards used

`CLAUDE.md`, `docs/ARCHITECTURE.md` (§4, §5.5, §6.3, §9.2, §9.3, §11), this change's own spec
artifacts, `.claude/skills/openspec-shared/cli-fallback.md` (delta structural rules), and sibling
patterns in `authRateLimit.test.ts`, `authorize.test.ts`, `SessionContext.test.tsx`,
`moderationApi.ts`, and `CommentSection.tsx`.
