# Review report

**Verdict:** Approve with changes

## Reviewed at

| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...origin/add-anak-usaha-presentation` | 35 | +4574 / -172 | 2026-08-21 |

Commits: `f0216d6` (proposal), `3e67ae7` (implementation).
2455 of those lines are the generated Drizzle snapshot (`meta/0012_snapshot.json`); the real review
surface is ~1700 lines.

## Summary

This replaces the hardcoded `SUB_BRANDS` array with an admin-managed `anak_usaha_profile`
presentation layer over the existing anak usaha taxonomy — new table, contracts, API profile CRUD
and reorder, an admin screen, and four rewired public surfaces. It is a well-executed change. The
shared-primary-key one-to-one, the nullable logo FK, the contract-level `kind` enum and the
http/https link guard are each correctly reasoned in `design.md` and correctly implemented, the
public response stays backward-compatible for the `/news` filter and article editor, and the
decision records are cited at the point of use throughout.

One real bug: the admin form renders an "Active" checkbox on the create path whose value is
discarded, so a profile an editor meant to stage goes live immediately. Everything else is a
test-coverage gap, a deploy-sequencing note, or a comment fix — none of which block merge.

**Standards used:** `CLAUDE.md` and `docs/ARCHITECTURE.md` were found; `openspec/changes/
add-anak-usaha-presentation/` supplied the proposal, design and spec this change is measured
against. No repo review guide exists, so the skill's default rubrics and severity scale apply.

**Not verified:** `pnpm install` is blocked in this environment, so **build, lint, typecheck and
tests were not executed**. Every finding below comes from static reading. `tasks.md` 6.4 (manual
end-to-end check of the four sub-brands) is also still unchecked.

**Explicitly not flagged.** The public Anak Usaha section will be empty on first deploy, because
`anak_usaha_profile` ships unseeded while `SUB_BRANDS` and the four logo PNGs are removed. That is
not a defect: `proposal.md` declares it **BREAKING**, states "no data backfill … an editor re-enters
it through the new admin screen", and `tasks.md` 5.2/5.8 plan both removals. It is an accepted
consequence of an approved proposal. Only the sequencing question is reviewable — finding #2.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Major | correctness | `apps/admin/src/pages/AnakUsahaPresentationPage.tsx:170` | "Active" checkbox is discarded when creating a profile |
| 2 | Minor | conventions | `openspec/changes/add-anak-usaha-presentation/design.md` | Migration Plan prescribes a two-phase deploy; this is one commit |
| 3 | Minor | correctness | `openspec/changes/add-anak-usaha-presentation/tasks.md:117` | Task 6.1 claims two kinds of coverage the tests don't have |
| 4 | Minor | conventions | `apps/api/src/modules/anak-usaha/anakUsaha.repository.ts:316` | Reorder re-implements the existing `replaceSortOrder` helper |
| 5 | Nit | hygiene | `supabase/migrations/0012_military_wolfsbane.sql:1` | Proposal says the migration adds indexes; it adds none |
| 6 | Nit | hygiene | `apps/api/src/modules/anak-usaha/anakUsaha.routes.ts:26` | Route-ordering comment is garbled and miscounts segments |
| 7 | Nit | hygiene | `apps/admin/src/pages/AnakUsahaPresentationPage.tsx:93` | `loadError` is never cleared on reload |
| 8 | Nit | hygiene | `packages/db/src/schema/anakUsaha.ts:7` | Schema comment points at the now-removed `SUB_BRANDS` |

## Details

### 1. Major — "Active" checkbox is discarded when creating a profile

`apps/admin/src/pages/AnakUsahaPresentationPage.tsx:170`

`renderForm()` is shared by the create and edit paths, so the "Active (visible on the public site)"
checkbox renders in both. Only the update branch sends it (line 166); the create branch omits
`isActive` entirely:

```ts
updated = await runCreate(editingId, {
  description: form.description.trim() || null,
  kind: form.kind as (typeof KIND_OPTIONS)[number],
  links,
  ...(form.logoMediaId ? { logoMediaId: form.logoMediaId } : {}),
});
```

It has to: `anakUsahaProfileCreateRequestSchema` is `.strict()` and has no `isActive` key
(`packages/contracts/src/anak-usaha.ts:55`), so sending one would be a 400.

So an editor who unchecks "Active" while creating a profile gets a profile that is immediately
public, because the column defaults to `true`. The control looks functional and does nothing.

The contract itself is spec-compliant — the spec says the profile has "an active flag defaulting to
active", and its active-flag scenarios are all phrased as updates to an existing profile. So the
minimal, spec-aligned fix is on the UI side:

```ts
// in renderForm(), the checkbox is only meaningful once a profile exists
{entries.find((e) => e.id === editingId)?.profile && (
  <label className="flex items-center gap-2 text-sm"> … </label>
)}
```

If staging a hidden profile before revealing it is wanted behaviour, the alternative is to add
`isActive: z.boolean().optional()` to the create schema and thread it through
`CreateAnakUsahaProfileInput` — which is what `partnerCreateRequestSchema`
(`packages/contracts/src/partner.ts:32`) does. Either closes the bug; the first is smaller and
needs no contract change.

### 2. Minor — Migration Plan prescribes a two-phase deploy; this is one commit

`design.md` — Migration Plan

> Ship API + admin screen before removing `SUB_BRANDS` from the web app, so there's a window to
> populate all four profiles before the static fallback is deleted.

That window is what keeps the public section populated across the cutover, and a single commit
cannot provide it — deploying this PR ships the API, the admin screen and the `SUB_BRANDS` removal
together, so the section is empty from that moment until an editor has entered four profiles and
uploaded four logos.

This is a sequencing note, not a code defect — the outcome itself is the accepted BREAKING change
declared in `proposal.md`. Worth deciding deliberately rather than by default:

- Deploy as-is and populate immediately afterwards, accepting a short empty window (fine if the
  four profiles are entered right after deploy).
- Or split at `tasks.md` 5.2 — API + admin in this PR, the `SUB_BRANDS` removal in a follow-up
  once production profiles exist. This is what the Migration Plan literally describes.
- Or seed the four profiles in `0012` from the copy being deleted, with `logo_media_id` null so
  the existing name-only fallback renders until logos are uploaded. `design.md` declines a backfill
  on the grounds that the copy "is not machine-seeded", which is fair — this would mean
  hand-transcribing the strings into SQL, and that is a reasonable thing to not want.

Also worth keeping the four PNGs (`tasks.md` 5.8) until the logos are in the media library, since
after this commit they only exist in git history.

### 3. Minor — Task 6.1 claims two kinds of coverage the tests don't have

`tasks.md:117` marks 6.1 complete, describing "unit tests for each scenario in
`specs/anak-usaha-presentation/spec.md` … reorder, active/inactive filtering". Two of those are not
actually covered. The production code is correct in both cases — this is a test gap, not a bug.

**a. The public active/inactive rule is untested.** `toPublicAnakUsaha`
(`apps/api/src/modules/anak-usaha/anakUsaha.mapper.ts:46`) is the single point enforcing the spec's
"Inactive profile is not public" and "Entry with an inactive profile keeps its plain shape". There
is no `anakUsaha.mapper.test.ts`, and nothing else exercises the function — `*.mapper.test.ts` is
otherwise the convention here (`analytics`, `engagement`, `moderation`, `staff`). Drop
`|| !row.profile.isActive` and a deliberately hidden brand's description, links and logo start
being served publicly with the suite still green.

Add three cases: no profile, inactive profile, active profile — the first two producing exactly
`{id, name, slug}`.

**b. Reorder rejection is untested, and the fake models the opposite rule.** The spec requires
"Missing or unknown identifiers are rejected … the stored order is unchanged", which the repository
enforces via `isExactIdSet`. The test fake (`anakUsaha.service.test.ts:94`) instead applies a
partial list:

```ts
anakUsahaIds.forEach((id, index) => {
  const existing = profiles.get(id);
  if (existing) profiles.set(id, { ...existing, sortOrder: index });  // unknown ids skipped
});
```

The only reorder test passes a complete, valid list, so the rejection path never runs — and because
the fake models partial application, a test written against it would assert the wrong semantics.
Make the fake reuse `isExactIdSet` and throw, then add a short-list case and an unknown-id case.

### 4. Minor — Reorder re-implements the existing `replaceSortOrder` helper

`apps/api/src/modules/anak-usaha/anakUsaha.repository.ts:316`

`reorderProfiles` hand-rolls the transaction, `LOCK TABLE … IN EXCLUSIVE MODE`, current-id read,
`isExactIdSet` check and index-write loop that `apps/api/src/lib/replaceSortOrder.ts:60` already
provides for `app.partners` and `app.guide_picks`. The inline comment explains why — the helper
"assumes an `id` column" — and that is accurate; the whole coupling is one line
(`replaceSortOrder.ts:64`):

```ts
const current = await tx.execute(sql`select id from ${sql.raw(table)}`);
```

An optional `idColumn` (default `'id'`, aliased as `select … as id`) would make the helper fit, and
the call site would collapse to the same shape as `partner.repository.ts:179`.

Flagged as Minor and not more, for two reasons: nothing is broken, and `design.md` — Non-Goals
explicitly declines "a generalized 'reusable ordered-directory' abstraction shared with `partners`
— this follows the same shape by precedent, not by extracting a shared module." Extending a helper
that already exists is a smaller step than extracting a new one, so this is arguably outside that
Non-Goal, but it is close enough that declining it is a defensible call. The cost of declining is
that the lock-mode rationale now lives in three places instead of one.

### 5. Nit — Proposal says the migration adds indexes; it adds none

`proposal.md` — Impact lists "`supabase/migrations/` (new migration: table + indexes)", but
`0012_military_wolfsbane.sql` creates the table and two FK constraints and no index.

No performance consequence — this is a catalog of four sub-brands, and every query against it is a
full read of a handful of rows. Purely a claim-versus-artifact mismatch: either drop "+ indexes"
from the proposal, or add the one index that would matter if the table ever grew,
`create index … on app.anak_usaha_profile (logo_media_id)`.

### 6. Nit — Route-ordering comment is garbled and miscounts segments

`apps/api/src/modules/anak-usaha/anakUsaha.routes.ts:26`

> `profile/order` is a syntactically valid `:id/profile`-shaped path is not — three segments vs
> two — so there is no actual ambiguity here

The sentence has lost a clause, and the segment count is wrong: `/profile/order` and `/:id/profile`
are both two segments. The conclusion holds for a different reason — the literal second segment
differs (`order` vs `profile`), and the methods differ (`PUT` vs `POST`). Worth rewriting so the
next reader isn't misled about why there's no conflict.

### 7. Nit — `loadError` is never cleared on reload

`apps/admin/src/pages/AnakUsahaPresentationPage.tsx:93`

`load()` sets `loading` but never resets `loadError`. `handleDrop`'s catch path calls `load()`; if
that retry succeeds, the previous error banner stays on screen above freshly loaded data. One line:
`setLoadError(null)` alongside `setLoading(true)`.

### 8. Nit — Schema comment points at the now-removed `SUB_BRANDS`

`packages/db/src/schema/anakUsaha.ts:7` describes the seeded catalog as "matching `SUB_BRANDS` in
`apps/web/lib/content.tsx`" — an identifier this change deletes. Re-point it at the migration that
seeds the four rows.

(`ConnectedPlatforms.tsx:9`'s reference to "the old hardcoded `SubBrand.kind` string" reads as
deliberate history and is fine as-is.)

## Rule check

| Rule | Source | Complies |
|---|---|---|
| Separate `anak_usaha_profile` table, not columns on `anak_usaha` | `design.md` | Yes |
| One-to-one via shared primary key, cascade delete | `design.md` | Yes — `anakUsaha.ts:36` |
| Logo FK nullable / `set null` | `design.md` | Yes |
| `kind` as text + Zod enum, no `pgEnum` | `design.md` | Yes |
| `links` as jsonb, not a child table | `design.md` | Yes |
| Ordering + reorder mirror `partners` | `design.md` | Behaviour yes; helper not reused — finding #4 |
| Public data folded into existing `GET /anak-usaha` | `design.md` | Yes — plain shape preserved for profile-less entries |
| Migration Plan: two-phase deploy | `design.md` | Not achievable as one commit — finding #2 |
| Non-Goal: taxonomy, `/news` filter, permission untouched | `design.md` | Yes |
| Non-Goal: Contact page links only as they fall out | `design.md` | Yes — `links[0]`, no dead `href="#"` |
| Permission-gated profile endpoints, no role-name branching | spec | Yes — `anakUsaha.routes.ts:29-35`, all `anak-usaha.manage` |
| Profile links must be http/https, enforced in shared contract | spec | Yes — `anak-usaha.ts:42`, tested incl. `javascript:`/`data:`/`vbscript:` |
| Profile fields: optional logo/description, required fixed `kind`, active flag | spec | Contract yes; admin create path drops `isActive` — finding #1 |
| Deactivating hides from public without deleting | spec | Correct, untested — finding #3a |
| Order replaced as a whole list, atomic, rejects incomplete sets | spec | Correct, rejection untested — finding #3b |
| Deleting a profile leaves taxonomy + article tags intact | spec | Yes — tested |
| Deleting an entry cascades to its profile | spec | Yes — tested |
| Public site renders only entries with an active profile | spec | Yes — `presentedAnakUsaha`, `lib/anakUsaha.ts:30` |
| Public listing keeps working for existing consumers | spec | Yes — added fields optional, `/news` filter reads `{id,name,slug}` |
| TypeScript strict, no `any` | `CLAUDE.md` | Yes |
| Typed `AppError` subclasses, formatted once | `CLAUDE.md` | Yes — `AppError` throughout, bare post-write `Error` matches existing idiom |
| No duplicated logic | `CLAUDE.md` | Finding #4 |
| Build, lint, tests, no TS errors before completion | `CLAUDE.md` | Not verified — install blocked in this environment |
