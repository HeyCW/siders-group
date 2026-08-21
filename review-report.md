# Review report

**Verdict:** Rejected with changes

## Reviewed at

| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...origin/add-anak-usaha-presentation` | 35 | +4574 / -172 | 2026-08-21 |

Commits: `f0216d6` (proposal), `3e67ae7` (implementation).
Of the +4574 lines, 2455 are the generated Drizzle snapshot (`meta/0012_snapshot.json`); the real
review surface is ~1700 lines.

## Summary

This replaces the hardcoded `SUB_BRANDS` array with an admin-managed `anak_usaha_profile`
presentation layer over the existing anak usaha taxonomy — new table, contracts, API profile CRUD
+ reorder, an admin screen, and four rewired public surfaces. The engineering is careful and
unusually well-documented: the shared-primary-key one-to-one, the nullable logo FK, the
contract-level `kind` enum and the http/https link guard are all correctly reasoned and correctly
implemented, and the decision records are cited at the point of use throughout.

The verdict is driven by one deploy-time defect, not by the design. The change deletes
`SUB_BRANDS` **and** the four logo PNGs in the same commit that creates an empty profile table with
no seed, while every public renderer returns `null` on an empty list. On deploy, the entire public
Anak Usaha presentation disappears until an editor manually recreates four profiles by hand. The
change's own Migration Plan says to ship these as two steps and this PR does them as one. Four
Major findings follow: a duplicated shared helper, a form control silently discarded on create, and
two gaps where the tests do not cover the invariant they appear to.

**Standards used:** `CLAUDE.md` and `docs/ARCHITECTURE.md` were found; `openspec/` supplied the
change's own proposal, design and spec. No repo review guide exists, so the skill's default rubrics
and severity scale apply.

**Not verified:** `pnpm install` is blocked in this sandbox, so **build, lint, typecheck and tests
were not executed**. Every finding below comes from static reading. Task 6.4 (manual check of the
four sub-brands end to end) is also still unchecked in `tasks.md` — that is the step that would
have caught finding #1.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Critical | correctness, conventions | `apps/web/lib/content.tsx` (deleted) | Public Anak Usaha section goes blank on deploy — no seed, no fallback |
| 2 | Major | conventions | `apps/api/src/modules/anak-usaha/anakUsaha.repository.ts:316` | Reorder reimplements the shared `replaceSortOrder` helper |
| 3 | Major | correctness | `apps/admin/src/pages/AnakUsahaPresentationPage.tsx:170` | "Active" checkbox silently discarded when creating a profile |
| 4 | Major | correctness, security | `apps/api/src/modules/anak-usaha/anakUsaha.mapper.ts:46` | The inactive-profile privacy rule has no test |
| 5 | Major | correctness | `apps/api/src/modules/anak-usaha/anakUsaha.service.test.ts:94` | Reorder rejection untested; the fake models the opposite behaviour |
| 6 | Minor | performance, conventions | `supabase/migrations/0012_military_wolfsbane.sql:1` | No indexes, though the proposal says the migration adds them |
| 7 | Minor | correctness | `apps/api/src/modules/anak-usaha/anakUsaha.repository.ts:308` | Concurrent delete turns a profile update into a 500 |
| 8 | Minor | security, conventions | `apps/web/app/contact/page.tsx:94` | `rel="noopener"` without `noreferrer`, unlike the cited precedent |
| 9 | Minor | correctness | `apps/web/app/contact/page.tsx:87` | Contact page silently renders only a brand's first link |
| 10 | Nit | hygiene | `apps/api/src/modules/anak-usaha/anakUsaha.routes.ts:26` | Garbled and factually wrong route-ordering comment |
| 11 | Nit | hygiene | `apps/admin/src/pages/AnakUsahaPresentationPage.tsx:93` | `loadError` never cleared on reload |
| 12 | Nit | hygiene | `packages/db/src/schema/anakUsaha.ts:7` | Doc comments still reference the removed `SUB_BRANDS` |

## Details

### 1. Critical — Public Anak Usaha section goes blank on deploy

`apps/web/lib/content.tsx` (–60, `SUB_BRANDS` removed), `apps/web/public/*.png` (4 files deleted),
`supabase/migrations/0012_military_wolfsbane.sql:1` (table created, no seed).

The change deletes the four sub-brand records — names, kinds, the approved Indonesian
descriptions, and the real Instagram/TikTok links — plus the four logo images, and creates
`anak_usaha_profile` empty. Every consumer bails on an empty list:

- `apps/web/components/home/AnakUsahaTiles.tsx:12` — `if (brands.length === 0) return null`
- `apps/web/components/home/ConnectedPlatforms.tsx:12` — same
- `apps/web/components/layout/SiteFooter.tsx:41` — column omitted
- `apps/web/app/contact/page.tsx:80` — section omitted

So from the moment this merges and deploys, the home page tiles, the masthead logo row, the footer
column and the Contact sub-brand list are all gone from the live site, and stay gone until someone
logs into the admin, creates four profiles by hand, and re-uploads four logos whose source files
this same commit deleted from the repo.

The change's own `design.md` — Migration Plan already prescribes the fix:

> Ship API + admin screen before removing `SUB_BRANDS` from the web app, so there's a window to
> populate all four profiles before the static fallback is deleted.

This PR does both halves in one commit. The stated justification for shipping no backfill —
"no machine-readable source for the current `SUB_BRANDS` copy exists" — is not accurate:
`SUB_BRANDS` was a literal TypeScript array, and name, kind, description and links all translate
directly into a seed. Only the logo binaries genuinely require an upload, and the code already
degrades to a name-only tile when `logoUrl` is null.

**Fix (either):**

- Seed the four profiles in `0012`, joining on the slugs the `add-article-anak-usaha` migration
  already seeded, with `logo_media_id` null so the name fallback renders until logos are uploaded:
  ```sql
  insert into app.anak_usaha_profile (anak_usaha_id, kind, description, links, sort_order)
  select id, 'News & Community',
         'Platform media yang menghadirkan perspektif, opini, dan cerita ...',
         '[{"label":"Instagram","href":"https://www.instagram.com/sidersvox"}]'::jsonb, 0
    from app.anak_usaha where slug = 'sidersvox';
  -- ... one per sub-brand, sort_order 0..3
  ```
  and keep the four PNGs until the logos are in the media library.
- Or split this into two PRs exactly as the Migration Plan says: API + admin screen first, remove
  `SUB_BRANDS` only after the profiles are populated in production.

**Rule:** `design.md` — Migration Plan.

### 2. Major — Reorder reimplements the shared `replaceSortOrder` helper

`apps/api/src/modules/anak-usaha/anakUsaha.repository.ts:316`

`reorderProfiles` hand-rolls the transaction, the `LOCK TABLE ... IN EXCLUSIVE MODE`, the
current-id read, the `isExactIdSet` check and the index-write loop that
`apps/api/src/lib/replaceSortOrder.ts:60` already encapsulates for `app.partners` and
`app.guide_picks`. The inline comment justifies the copy on the grounds that the helper "assumes an
`id` column" — true, but the whole coupling is one line, `replaceSortOrder.ts:64`:

```ts
const current = await tx.execute(sql`select id from ${sql.raw(table)}`);
```

That helper exists specifically so this logic and its lock rationale live in one place — its own
docblock says it was extracted "so a correction to it only has to happen once". This adds a third
copy that any future correction will now miss.

**Fix:** add an optional `idColumn` to `ReplaceSortOrderConfig` (default `'id'`) and alias it:

```ts
const current = await tx.execute(sql`select ${sql.raw(idColumn)} as id from ${sql.raw(table)}`);
```

then reduce `reorderProfiles` to a `replaceSortOrder({ db, ids: anakUsahaIds,
table: 'app.anak_usaha_profile', idColumn: 'anak_usaha_id', updateSortOrder, selectJoined,
onInvalidSet: invalidProfileSetError })` call, matching `partner.repository.ts:179`.

**Rule:** `CLAUDE.md` — "no duplicated logic".

### 3. Major — "Active" checkbox silently discarded when creating a profile

`apps/admin/src/pages/AnakUsahaPresentationPage.tsx:170`, `packages/contracts/src/anak-usaha.ts:55`

The edit form renders the Active checkbox unconditionally, but only the update branch of
`handleSave` sends it (line 166). The create branch omits `isActive` — necessarily, because
`anakUsahaProfileCreateRequestSchema` is `.strict()` and has no `isActive` key, so sending it would
be rejected with a 400.

The result: an editor who unchecks "Active (visible on the public site)" while creating a profile
gets a profile that is immediately live, because the column defaults to `true`. The control appears
to work and does nothing.

`partnerCreateRequestSchema` (`packages/contracts/src/partner.ts:32`) — the precedent this screen
says it mirrors — does carry `isActive: z.boolean().optional()`.

**Fix:** add `isActive: z.boolean().optional()` to `anakUsahaProfileCreateRequestSchema`, thread it
through `CreateAnakUsahaProfileInput` and the insert in `createProfile`. (Hiding the checkbox on
create would also close the bug, but "create a hidden profile, then populate it before revealing
it" is a genuinely useful workflow and the spec's "an active flag defaulting to active" allows it.)

**Rule:** spec — "Profile fields"; precedent `packages/contracts/src/partner.ts:32`.

### 4. Major — The inactive-profile privacy rule has no test

`apps/api/src/modules/anak-usaha/anakUsaha.mapper.ts:46`

`toPublicAnakUsaha`'s `if (!row.profile || !row.profile.isActive)` guard is the single point
enforcing two spec requirements — "Inactive profile is not public" and "Entry with an inactive
profile keeps its plain shape". There is no `anakUsaha.mapper.test.ts`, and no other test exercises
the function.

`*.mapper.test.ts` is an established convention in this codebase (`analytics`, `engagement`,
`moderation`, `staff` all have one). If a refactor dropped `|| !row.profile.isActive`, the
description, links and logo of a brand an editor deliberately hid would start being served
publicly, and the whole suite would stay green.

**Fix:** add `apps/api/src/modules/anak-usaha/anakUsaha.mapper.test.ts` with three cases — no
profile, inactive profile, active profile — asserting that the first two produce exactly
`{id, name, slug}` and the third carries every presentation field.

### 5. Major — Reorder rejection untested, and the fake models the opposite behaviour

`apps/api/src/modules/anak-usaha/anakUsaha.service.test.ts:94`

The spec requires: "Missing or unknown identifiers are rejected … the system rejects the request
and the stored order is unchanged." The real repository enforces that via `isExactIdSet`. The test
fake does the opposite:

```ts
async reorderProfiles(anakUsahaIds) {
  anakUsahaIds.forEach((id, index) => {
    const existing = profiles.get(id);
    if (existing) profiles.set(id, { ...existing, sortOrder: index });  // skips unknown ids
  });
  return joined();
}
```

It silently ignores unknown ids and happily applies a partial list — exactly the behaviour the
production code forbids. No test submits a short list or an unknown id, so the requirement is
unverified, and deleting the `isExactIdSet` check from the repository would break nothing in CI.

**Fix:** make the fake reuse `isExactIdSet` and throw `invalidProfileSetError()` on a non-exact
set, then add two cases: a list omitting an existing profile, and a list naming an id that has no
profile — both rejected, stored order unchanged.

### 6. Minor — No indexes, though the proposal says the migration adds them

`supabase/migrations/0012_military_wolfsbane.sql:1`

`proposal.md` — Impact promises "new migration: table + indexes"; the migration creates the table
and two FK constraints and no index at all. Most relevant is `logo_media_id`: it is an unindexed FK
with `ON DELETE SET NULL`, so every media deletion scans this table, and the media join in
`listWithProfileJoined` has no support. With four rows this costs nothing today — flagged because
the claim and the artifact disagree, and the FK index is one cheap line.

**Fix:** `create index if not exists anak_usaha_profile_logo_media_id_idx on
app.anak_usaha_profile (logo_media_id);`

### 7. Minor — Concurrent delete turns a profile update into a 500

`apps/api/src/modules/anak-usaha/anakUsaha.repository.ts:308` (and `:291` for create)

`updateProfile` re-reads the row after writing and throws a bare
`Error('anak usaha profile missing immediately after update')` if it is gone. The service
(`anakUsaha.service.ts:81`) already checked existence, so this only fires when a concurrent delete
lands between the two — and it surfaces as a generic 500 rather than the `profileNotFoundError()`
404 the service is holding right there.

**Fix:** have the repository return `null` from the post-write read and let the service map that to
`profileNotFoundError()`.

**Rule:** `CLAUDE.md` — "Handle errors gracefully via typed `AppError` subclasses".

### 8. Minor — `rel="noopener"` without `noreferrer`

`apps/web/app/contact/page.tsx:94`

The adjacent comment cites `PartnerGrid.tsx` as the model; that file uses
`rel="noopener noreferrer"` (`PartnerGrid.tsx:58`). Modern browsers imply `noopener` for
`target="_blank"`, so there is no window-handle exposure — the actual delta is the referrer sent to
third-party social hosts, which is precisely what `noreferrer` suppresses and what the cited
precedent includes.

**Fix:** `rel="noopener noreferrer"`. `AnakUsahaTiles.tsx:53` has the same gap (pre-existing, not
introduced here) and is worth fixing in the same pass.

### 9. Minor — Contact page silently renders only a brand's first link

`apps/web/app/contact/page.tsx:87` — `const link = brand.links[0];`

Which link a brand's Contact-page tag points at is decided by position in the jsonb array, and
nothing in the admin form marks the first row as special. Surabaya Siders and Jakarta Siders each
have Instagram *and* TikTok in the data being removed by this change; on the Contact page only the
first would ever be reachable.

**Fix:** render all links (as `AnakUsahaTiles` does), or label the first row "primary link" in the
admin form so the ordering is a visible, deliberate choice.

### 10. Nit — Garbled route-ordering comment

`apps/api/src/modules/anak-usaha/anakUsaha.routes.ts:26`

> `profile/order` is a syntactically valid `:id/profile`-shaped path is not — three segments vs
> two — so there is no actual ambiguity here

The sentence has lost a clause, and the segment count is wrong: `/profile/order` and `/:id/profile`
are both two segments. The conclusion is right for a different reason — the literal second segment
differs (`order` vs `profile`), and the methods differ (`PUT` vs `POST`). Worth rewriting so the
next reader isn't misled about *why* there's no conflict.

### 11. Nit — `loadError` never cleared on reload

`apps/admin/src/pages/AnakUsahaPresentationPage.tsx:93`

`load()` sets `loading` but never resets `loadError`. `handleDrop`'s catch path calls `load()`; if
that retry succeeds, the previous error banner stays on screen next to freshly loaded data. Add
`setLoadError(null)` alongside `setLoading(true)`.

### 12. Nit — Doc comments still reference the removed `SUB_BRANDS`

`packages/db/src/schema/anakUsaha.ts:7` describes the seed as "matching `SUB_BRANDS` in
`apps/web/lib/content.tsx`", and `apps/web/components/home/ConnectedPlatforms.tsx:9` refers to "the
old hardcoded `SubBrand.kind` string". Both identifiers are deleted by this change. The
`ConnectedPlatforms` one reads fine as history; the schema one now points at a file that no longer
contains what it claims.

## Rule check

| Rule | Source | Complies |
|---|---|---|
| Migration Plan: ship API + admin before removing `SUB_BRANDS` | `design.md` | **No** — finding #1 |
| Separate `anak_usaha_profile` table, not columns on `anak_usaha` | `design.md` | Yes |
| One-to-one via shared primary key, cascade delete | `design.md` | Yes — `anakUsaha.ts:36` |
| Logo FK nullable / `set null` | `design.md` | Yes |
| `kind` as text + Zod enum, no `pgEnum` | `design.md` | Yes |
| `links` as jsonb, not a child table | `design.md` | Yes |
| Ordering + reorder mirror `partners` exactly | `design.md` | Behaviour yes; implementation duplicated — finding #2 |
| Public data folded into existing `GET /anak-usaha` | `design.md` | Yes — plain shape preserved for profile-less entries |
| Permission-gated profile endpoints, no role-name branching | spec | Yes — `anakUsaha.routes.ts:29-35`, all `anak-usaha.manage` |
| Profile links must be http/https, enforced in shared contract | spec | Yes — `anak-usaha.ts:42`, tested incl. `javascript:`/`data:`/`vbscript:` |
| Profile fields: optional logo/description, required fixed `kind`, active flag | spec | Partial — `isActive` unreachable on create, finding #3 |
| Deactivating hides from public without deleting | spec | Implemented, untested — finding #4 |
| Order replaced as a whole list, atomic, rejects incomplete sets | spec | Implemented, rejection untested — finding #5 |
| Deleting a profile leaves taxonomy + article tags intact | spec | Yes — tested |
| Deleting an entry cascades to its profile | spec | Yes — tested |
| Public site renders only entries with an active profile | spec | Yes — `presentedAnakUsaha`, `lib/anakUsaha.ts:30` |
| TypeScript strict, no `any` | `CLAUDE.md` | Yes — casts used, no `any` |
| Typed `AppError` subclasses, formatted once | `CLAUDE.md` | Mostly — finding #7 |
| No duplicated logic | `CLAUDE.md` | **No** — finding #2 |
| Build, lint, tests, no TS errors before completion | `CLAUDE.md` | **Not verified** — install blocked in this sandbox |
