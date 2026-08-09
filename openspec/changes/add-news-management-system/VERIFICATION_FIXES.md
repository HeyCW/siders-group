# Verification Fixes

Remediation plan for defects found by `/opsx:verify` and two follow-up manual re-reviews against
the implementation on `claude/implement-news-management-system` (PR #4). All five are small and
contained; none require a database. Everything here should land on the PR branch **before
archiving the change**.

Fixes 1-3 came from `/opsx:verify`. Fixes 4 and 5 each came from a manual re-review after the
prior batch landed — each pass traced every touched code path for regressions and, while doing
so, caught one more defect the previous passes hadn't been looking for. Status: **all five
fixed, committed, and live-verified** (see each fix's own section).

Nothing in this document covers the eight environment-blocked tasks (2.9, 13.2, 13.4, 13.7–13.11,
13.13) — those need a live Postgres and are tracked in `tasks.md` with their reasons.

---

## Decision required before starting: Fix 2

Fix 2 is the only item that isn't a straight bug. Spec and implementation disagree about what a
too-large `limit` does, and **one of the two has to move**. Pick before writing code:

| Option | Behavior | Cost |
|---|---|---|
| **A — clamp (recommended)** | `limit=500` returns 100 items, 200 OK | One-line schema change; spec unchanged |
| B — reject | `limit=500` returns 400 | Requires amending an approved spec scenario |

**Recommendation: A.** The spec scenario is the approved artifact and already says *"returns at
most the maximum"*; moving code to match an approved spec is cheaper and less disruptive than
re-approving a spec to match code that was written without consulting it. Clamping is also the
friendlier contract for the `home-curation` consumer, which composes this endpoint and would
otherwise need to know the cap to avoid a 400.

Choose B only if the team actively wants a loud failure over a silent truncation — in which case
`specs/public-news-api/spec.md` "Scenario: Limit is capped" must be rewritten in the same commit,
not left contradicting the code.

The rest of this plan assumes **Option A**.

---

## Fix 1 — Guard against empty auto-generated slugs

**Severity:** critical · **Scope:** 3 services + 1 lib + tests · **Status:** ✅ fixed

### The defect

`slugify()` returns `""` for any input with no ASCII alphanumerics (`"!!!"`, `"---"`, `"你好"`).
None of the three new services guard against it, so the first such record saves with an empty
slug — violating `specs/article-management/spec.md` ("generates a kebab-case, **URL-safe** slug")
and leaving the article unreachable via `GET /articles/:slug`. The next one then fails with a
409 *"slug already in use"* that makes no sense to an editor who never touched the slug field.

It is also internally inconsistent: a **manual** empty slug is already rejected by
`articleSlugSchema` (`.min(1)` + regex), so the same value is refused on one path and accepted on
the other.

`role.service.ts:40` already solves this exact problem — this fix propagates that existing pattern.

### Changes

**1. `apps/api/src/lib/slugify.ts`** — add a throwing variant beside the pure one:

```ts
import { AppError } from '../middleware/errorHandler.js';

/**
 * `slugify` for callers that require a usable result. A value with no ASCII alphanumerics
 * ("!!!", "你好") slugifies to an empty string, which is not a URL-safe slug and must never
 * reach the database — `articles.slug` is unique, so the first empty slug silently claims it
 * and every later one fails with a slug-conflict error the user cannot act on.
 */
export function slugifyRequired(value: string, subject: string): string {
  const slug = slugify(value);
  if (!slug) {
    throw new AppError(`${subject} must contain at least one letter or number`, 400, 'invalid_slug');
  }
  return slug;
}
```

A shared helper rather than three inline copies, per CLAUDE.md's "no duplicated logic".
`lib/google.ts` already establishes that `lib/` may throw `AppError`. `role.service.ts` keeps its
own inline guard — different domain, different message, and it is outside this change.

**2. `apps/api/src/modules/articles/article.service.ts:77-83`** — guard the fallback branch only.
A caller-supplied slug is already schema-validated, so only the auto-generated path can be empty:

```ts
async function resolveSlug(desired: string | undefined, title: string, excludeId?: string): Promise<string> {
  const candidate = desired && desired.length > 0 ? desired : slugifyRequired(title, 'Title');
  if (await repository.slugExists(candidate, excludeId)) {
    throw slugConflictError();
  }
  return candidate;
}
```

**3. `apps/api/src/modules/categories/category.service.ts:23,31`** and
**`apps/api/src/modules/tags/tag.service.ts:23,31`** — replace `slugify(name)` with
`slugifyRequired(name, 'Category name')` / `slugifyRequired(name, 'Tag name')` in both `create`
and `update` on each.

### Tests

- `apps/api/src/lib/slugify.test.ts` (**new file** — `slugify` currently has no direct tests):
  kebab-case conversion, diacritic stripping (`"Café" → "cafe"`), punctuation collapsing, and
  `slugifyRequired` throwing `invalid_slug` on `"!!!"`, `"---"`, `"你好"`, `"   "`.
- `article.service.test.ts`: creating an article titled `"!!!"` rejects with `invalid_slug` and
  persists nothing.
- `category.service.test.ts` / `tag.service.test.ts`: same, for create and update.

---

## Fix 2 — Clamp the public list `limit` instead of rejecting

**Severity:** critical · **Scope:** 1 schema line + 1 corrected test · **Status:** ✅ fixed (Option A — clamp — as recommended)

### The defect

```
spec  specs/public-news-api/spec.md:44   THEN the system returns at most the maximum
impl  packages/contracts/src/article.ts:78   .max(100)   ← rejects with a 400
```

The existing test **asserts the wrong behavior while being named for the right one**, so the
green suite is actively concealing the divergence:

```ts
it('caps the limit at 100', () => {
  expect(articlePublicListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
});
```

### Changes

**`packages/contracts/src/article.ts:78`:**

```ts
// Clamped, not rejected: a client asking for more than the cap gets the cap
// (specs/public-news-api/spec.md - "Scenario: Limit is capped").
limit: z.coerce.number().int().min(1).default(20).transform((n) => Math.min(n, MAX_PUBLIC_LIST_LIMIT)),
```

Export `MAX_PUBLIC_LIST_LIMIT = 100` and `DEFAULT_PUBLIC_LIST_LIMIT = 20` as named constants so
the cap is referenceable from tests and from `home-curation` later, rather than being a magic
number in a schema chain.

`.min(1)` still **rejects** `0` and negatives — those are malformed, not merely oversized, and
no spec scenario asks for them to be clamped.

**`packages/contracts/src/article.test.ts:75`** — rewrite to match:

```ts
it('clamps a limit above the maximum down to the cap', () => {
  expect(articlePublicListQuerySchema.parse({ limit: '500' }).limit).toBe(MAX_PUBLIC_LIST_LIMIT);
});

it('still rejects a zero or negative limit as malformed', () => {
  expect(articlePublicListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  expect(articlePublicListQuerySchema.safeParse({ limit: '-5' }).success).toBe(false);
});
```

---

## Fix 3 — Stop a null `published_at` from becoming a public 500

**Severity:** warning · **Scope:** 1 predicate · **Status:** ✅ fixed

### The defect

`publiclyVisible()` (`article.repository.ts:112-114`) admits any `status='published'` row without
checking `publishedAt`. `toPublicCard()` (`article.mapper.ts:17`) then throws a **raw `Error`**,
not an `AppError`, so it surfaces as `500 internal_error` on the public path.

No code path in this change can produce that state — the lifecycle always sets `publishedAt` on
publish. But a manual DB edit, a backfill, or any future writer turns a single bad row into a
public outage rather than one quietly-omitted article. The invariant belongs in the query.

### Changes

**`apps/api/src/modules/articles/article.repository.ts:112`:**

```ts
function publiclyVisible(now: Date) {
  return or(
    // `published` requires a timestamp too: without this, a row whose publishedAt is somehow
    // null reaches the mapper, which cannot build a public DTO and throws — turning one bad
    // row into a 500 for the whole listing instead of omitting it.
    and(eq(articles.status, 'published'), isNotNull(articles.publishedAt)),
    and(eq(articles.status, 'scheduled'), lte(articles.publishedAt, now)),
  );
}
```

Add `isNotNull` to the `drizzle-orm` import. The `scheduled` branch needs no change —
`lte(publishedAt, now)` already evaluates to NULL (and so excludes the row) when `publishedAt`
is null.

Keep the `toPublicCard` throw as a defensive invariant assertion; it simply becomes unreachable.

### Tests

Genuinely DB-dependent — the predicate is SQL. Add it to the `tasks.md` §13 list of
database-blocked checks rather than faking a repository test that would assert nothing about
the real query. The mapper-level guard is already implicitly covered by existing tests.

---

## Fix 4 — "New article" breaks permanently after its first successful use

**Severity:** critical · **Scope:** 1 line (`NewArticlePage.tsx`) + 2 cleanup items · **Status:** ✅ fixed
**Found by:** manual re-review after Fixes 1-3 landed, not `/opsx:verify` — this defect was in
frontend code the automated pass never traced.

### The defect

`NewArticlePage.tsx` hardcoded the same literal title on every click, with no slug override:

```ts
articlesApi.create({ title: 'Untitled' })
```

Traced through code that is correct in isolation:

```
resolveSlug(undefined, 'Untitled')
  → slugify('Untitled') = 'untitled'
  → repository.slugExists('untitled')?
        1st click ever: false → creates fine, slug = "untitled"
        every click after:      true  → throws slugConflictError()  (409)
```

Slugs freeze after first save and are never auto-suffixed on collision by design (`design.md` —
"it does not auto-append -2, -3 variants"), so the slug stays "untitled" forever regardless of
what the draft's title is later changed to. Reproduction is not an edge case — it is the second
click of the primary "New article" button in the most ordinary workflow: create a draft, get
distracted, come back and click "New article" again.

`article.service.test.ts`'s existing `'rejects a slug that collides with another article'` test
proves the backend is behaving exactly as designed. The bug is the frontend handing it a
guaranteed duplicate, not the backend's rejection of it.

### Changes

**`apps/admin/src/pages/NewArticlePage.tsx`:**

```ts
articlesApi.create({ title: 'Untitled', slug: `untitled-${crypto.randomUUID().slice(0, 8)}` })
```

`crypto.randomUUID()` is available in both the dev server (`localhost` is a secure context by
browser exception) and any HTTPS production deployment. The title stays editable and
human-friendly; only the disposable placeholder slug needs to be collision-proof.

**Two related cleanup items caught while tracing this fix's surrounding code**, in
`apps/admin/src/editor/EditorCanvas.tsx`:
- Removed a manual `editor?.destroy()` on unmount — `@tiptap/react`'s own `useEditor` hook
  already owns full lifecycle management including destroy-on-unmount (confirmed in its source).
  The manual call double-destroyed the editor on every unmount. Not visibly harmful
  (`EditorView.destroy()` tolerated being called twice in the installed version), but it
  duplicated lifecycle ownership the library already had — deleted rather than left as
  redundant defensive code.
- Removed the `onEditorReady` prop — defined and wired internally, never passed by its only
  caller (`ArticleEditPage.tsx`). Dead API surface.

### Verification

Live-tested with a real A/B comparison, not just re-running the suite:
1. Confirmed the *old* code fails deterministically: two full-page loads of `/articles/new` in
   a row, second one lands on the error screen ("Could not create a new article"), network trace
   shows no successful redirect.
2. Restored the fix, re-ran the identical test: both loads redirect to distinct article ids,
   request bodies show distinct random-suffixed slugs, both requests return `201`.

```
old code, 2nd click →  stays on /articles/new, "Could not create a new article"
new code, 2nd click →  {"success":true,"data":{"id":"id-10","slug":"untitled-5b4c1b76",...}}
```

### Tests

No new automated test — this was a frontend integration bug (a UI page calling the API with a
predictable colliding value), not new business logic, and the admin app has no existing
integration-test harness to add one to cheaply (only `apiFetch`'s unit tests exist today). The
live A/B verification above is the evidence of record; a Playwright-based admin E2E suite would
be the right place to add regression coverage for this class of bug, but standing one up is
out of scope for a fix this size.

---

## Fix 5 — Clearing Excerpt, SEO Title, or SEO Description via autosave silently did nothing

**Severity:** critical · **Scope:** 3 lines (`ArticleEditPage.tsx`) · **Status:** ✅ fixed
**Found by:** manual re-review after Fix 4 landed.

### The defect

`ArticleEditPage.tsx`'s autosave payload coerced these three fields with `|| undefined`:

```ts
excerpt: formRef.current.excerpt || undefined,
seoTitle: formRef.current.seoTitle || undefined,
seoDescription: formRef.current.seoDescription || undefined,
```

`||` treats an empty string as falsy, so the moment a user deleted all the text in any of these
fields, the coercion sent `undefined` for it. That collides with how `toRepositoryFields` in
`article.service.ts` interprets `undefined` — as PATCH semantics, "don't touch this field," not
"clear it":

```ts
if (input.excerpt !== undefined) fields.excerpt = input.excerpt;   // undefined ⇒ omitted entirely
```

The full chain: user deletes all text in Excerpt → textarea shows empty → autosave fires with
`excerpt: undefined` → `JSON.stringify` drops the key entirely → the service sees no `excerpt`
key and never touches the column → the old value persists in the database forever → the save
still reports "Saved," with nothing to indicate the clear had no effect. `setArticle(updated)`
overwrites `article` state with the server's response (which still carries the stale value), but
`form` state — what the textarea is bound to — is untouched, so the UI kept showing empty while
the database, and everything the public site reads from it, kept the old content silently.

None of the three write-side schemas have `.min()` on these fields, so an empty string was
always a valid value to send — the fix only needed to stop suppressing it.

### Changes

**`apps/admin/src/pages/ArticleEditPage.tsx`:** removed the `|| undefined` coercion from all
three fields; they are now sent as-is.

### Verification

Live-tested with the same real A/B methodology as Fix 4 — not just re-running the suite. Built a
mock API that faithfully replicates the real service's PATCH-omit-means-untouched semantics
(only overwrites a field when the JSON key is actually present), then:

1. Loaded an article with a real excerpt, cleared the Excerpt textarea, waited past the 1200ms
   debounce, and inspected the actual PATCH request body.
2. **Old code:** `excerpt` key absent from the payload entirely (`hasOwnProperty` false).
3. Restored the fix, repeated the identical steps.
4. **New code:** `excerpt` key present with value `""` (`hasOwnProperty` true).

```
old code →  PATCH body keys: [title, bodyJson, categoryIds, tagIds, featuredMediaId, seoTitle, seoDescription]
                                                 ^ excerpt missing entirely
new code →  PATCH body keys: [title, bodyJson, excerpt, categoryIds, tagIds, featuredMediaId, seoTitle, seoDescription]
                                                 excerpt: ""  (present, clears correctly)
```

### Tests

No new automated test, for the same reason as Fix 4 — this is UI-to-API wiring, not business
logic, and the admin app has no integration-test harness to extend cheaply. Swept the rest of
`apps/admin/src` for the same `|| undefined` pattern during this fix; these three lines were the
only occurrences. `categoryIds`/`tagIds` are arrays (always truthy, even `[]`, so immune to this
class of bug) and `featuredMediaId`/`title`/`bodyJson` were already sent without the coercion.

---

## Sequencing

Fixes 1-3 were independent, touched disjoint files, and were executed in the planned order
(cheapest feedback first: Fix 2, then Fix 1, then Fix 3), landing in one commit together after
each passed its own local verification. Fix 4 was found and fixed in a separate follow-up pass
after 1-3 were already on the branch, and landed in its own commit for the same reason the
original plan wanted Fix 2's correction isolated — a defect discovered during re-review belongs
in history as its own change, not folded silently into the batch that didn't catch it.

---

## Verification

**Result, after Fixes 1-3 (first commit):** full gate green.

```
pnpm -r run typecheck   → clean, all 6 packages
pnpm test                → 297/297 (up from 285: +12 across slugify.test.ts and the
                            article/category/tag service guard tests)
pnpm lint                → zero issues
pnpm build                → web + api + admin all build
```

**Result, after Fix 4 (second commit):** re-ran the same gate — still 297/297 (Fix 4 had no
automated test, per its own section above), typecheck/lint/build all still clean. Additionally
live-verified in a real browser per Fix 4's own "Verification" subsection: an A/B comparison
against the actual pre-fix code, not just re-running the existing suite.

**Result, after Fix 5 (third commit):** same gate, still 297/297, clean typecheck/lint/build. Same
live A/B methodology as Fix 4, this time against a mock API purpose-built to replicate the real
service's PATCH-omit-means-untouched semantics — see Fix 5's own "Verification" subsection for
the actual before/after request payloads captured.

### `tasks.md` updates

- §13.11: the Fix 3 predicate note was added to the database-blocked list.
- No task checkboxes changed state. Fix 1 and Fix 2 were defects in tasks 6.4 / 7.3 and 3.6 / 8.4
  respectively; Fixes 4 and 5 were both defects in the UI work under task 11.2 ("create/edit
  view"). All five are corrections to work already marked complete, not new scope — the tasks
  remain `[x]`.

---

## Explicitly out of scope

- **Task 10.6** (image resize / alignment / caption editor UI) — a real feature gap, not a
  defect. The data model and sanitizer already support all three attributes. Build it as its own
  piece of work; it does not block archiving the rest.
- **The eight database-blocked verification tasks** — unchanged, still require a live Postgres.
- **The `toPreviewResponse` epoch fallback** (`article.mapper.ts:85`) — flagged as a SUGGESTION
  during verification. Currently unobservable (`PreviewModal` does not render the date). Worth
  fixing when a preview consumer needs the field, by giving the preview DTO a nullable
  `publishedAt` rather than fabricating `1970-01-01`.
