# Verification Fixes

Remediation plan for the three defects found by `/opsx:verify` against the implementation on
`claude/implement-news-management-system` (PR #4). All three are small and contained; none
require a database. Everything here should land on the PR branch **before archiving the change**.

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

**Severity:** critical · **Scope:** 3 services + 1 lib + tests

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

**Severity:** critical · **Scope:** 1 schema line + 1 corrected test

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

**Severity:** warning · **Scope:** 1 predicate

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

## Sequencing

The three fixes are independent and touch disjoint files. Suggested order (cheapest feedback
first):

1. **Fix 2** — one line plus a test correction; confirms the contracts suite is honest again.
2. **Fix 1** — the largest, and the only one adding a new file.
3. **Fix 3** — one predicate; no local test to run, so do it last and rely on review.

One commit per fix keeps the "test asserted the wrong thing" correction in Fix 2 legible in
history rather than buried in a combined diff.

---

## Verification

After all three, the full gate from CLAUDE.md must pass:

```bash
pnpm -r run typecheck   # all 6 packages
pnpm test               # expect > 285 (new slugify + guard tests)
pnpm lint               # zero issues
pnpm build              # web + api + admin
```

Then re-run `/opsx:verify add-news-management-system` and confirm the CRITICAL section is empty.

### `tasks.md` updates

- §13: add the Fix 3 predicate test to the database-blocked list.
- No task checkboxes change state — these are corrections to work already marked complete, not
  new scope. Fix 1 and Fix 2 are defects in tasks 6.4 / 7.3 and 3.6 / 8.4 respectively; the tasks
  remain done once the defects are fixed.

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
