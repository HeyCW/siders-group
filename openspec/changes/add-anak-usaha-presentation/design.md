## Context

`anak_usaha` (`packages/db/src/schema/anakUsaha.ts`, added by `add-article-anak-usaha`) is a
lightweight `{id, name, slug}` taxonomy row used only for article tagging and the `/news` filter.
The reader-facing "Anak Usaha" section on the public site currently reads from a hardcoded
`SUB_BRANDS` array (`apps/web/lib/content.tsx`) with no relationship to that table at all. See
`proposal.md - Why` for the motivation; this document covers how the new presentation layer is
modeled and wired in.

## Goals / Non-Goals

**Goals:**
- Let an editor manage what the public "Anak Usaha" section shows without a code deploy.
- Keep the existing lightweight taxonomy row (and article tagging behavior) completely unchanged.

**Non-Goals:**
- Reworking article tagging, the `/news` anak usaha filter, or the `anak-usaha.manage` permission
  itself — all untouched, out of scope.
- Fixing the Contact page's dead `href="#"` sub-brand links beyond what naturally falls out of
  wiring real link data through (see `proposal.md - What Changes`).
- A generalized "reusable ordered-directory" abstraction shared with `partners` — this follows the
  same shape by precedent, not by extracting a shared module.

## Decisions

### Separate `anak_usaha_profile` table, not new columns on `anak_usaha`

Two ways to add presentation data: widen `anak_usaha` with nullable columns, or add a second table
in a one-to-one relationship. Widening is simpler for one query, but it means every article-tagging
consumer of `anak_usaha` (the article editor's select, the `/news` filter) now carries logo/
description/links/order/active columns it never reads, and a row created purely for tagging
(no public presence intended) would need to either fake those columns or leave a wide table mostly
null. A separate table keeps the taxonomy row exactly as `add-article-anak-usaha` defined it and
makes "this entry has no public presence yet" the natural state (no row in `anak_usaha_profile`)
rather than a special case of a wide one. Cost is a join wherever both are needed — small, and the
same trade-off `media`/`articles.featuredMediaId` already makes.

### One-to-one via a shared primary key, not a separate id + unique FK

`anak_usaha_profile.anakUsahaId` is both the primary key and the foreign key to `anak_usaha.id`
(no independent `id` column). This makes "at most one profile per entry"
(spec: "A profile presents exactly one anak usaha entry") a schema-level guarantee — a second
insert for the same `anakUsahaId` is a primary-key violation, not an application-level check that
could race. `onDelete: 'cascade'` on that same FK gives the "deleting the entry deletes its
profile" requirement for free, with no application-level cleanup step to forget.

### Logo FK is nullable with `onDelete: 'set null'`, not `restrict` like partners

`partners.logoMediaId` is `NOT NULL` / `restrict` because a partner tile with no logo has no
degraded state to fall back to (`partner.ts` comment). A profile is different: the spec explicitly
allows a logo-less profile (description/links-only is still a valid public entry), so the column
is nullable, and losing the referenced media (if it's ever deleted) should degrade to "no logo"
rather than block the media deletion or the profile — the same reasoning `articles.featuredMediaId`
already uses.

### `kind` as a `text` column with contract-level validation, not a Postgres enum

Nothing in this schema uses `pgEnum` today (`articles.bodyJson` and others use plain `text`/
`jsonb`); a Zod enum in `packages/contracts` (mirroring how `partner.ts`'s `isHttpUrl` guards a
string column rather than a DB constraint) keeps the fixed-choice rule enforced at the one layer
both the API and the admin form already share, without introducing a new schema primitive for a
two-value list.

### `links` as a `jsonb` column, not a child table

At most a handful of links per profile (the current data has 0–2), each a simple `{label, href}`
pair with no independent identity, ordering, or query need of its own — `articles.bodyJson` is the
existing precedent for structured content living in `jsonb` rather than a normalized table. A child
table would add a full CRUD surface for a value that is always read and written as one unit with
its parent profile.

### Ordering and reorder endpoint mirror `partners` exactly

`sortOrder` (plain int) plus a whole-list-replacement reorder endpoint, atomic and rejecting
incomplete/unknown-id submissions, copies `partner-management`'s existing, already-specified
behavior (`specs/partner-management/spec.md` - "Partner order is replaced as a whole list"). No
new pattern is introduced; `sortOrder` only orders rows within `anak_usaha_profile`, independent of
any ordering on the taxonomy table (which has none).

### Public data folded into the existing `GET /anak-usaha` endpoint, not a new route

`GET /anak-usaha` is already public and already the source the article editor and `/news` filter
read from. Rather than adding a second public endpoint the web app would need to fetch and merge
client-side, the existing response is extended: entries with an active profile carry the extra
presentation fields, entries without one are omitted from this rendering (per spec). The admin-side
list (used by the new admin screen) is a separate, permission-gated shape that includes inactive
profiles and entries with no profile at all, so staff can create one.

## Risks / Trade-offs

- **[Risk]** Folding profile fields into the public listing response changes its shape; any other
  consumer of the current plain `{id, name, slug}` public response breaks if it assumes exactly
  that shape. → **Mitigation**: added fields are optional/absent-when-no-profile, so existing
  consumers reading only `id`/`name`/`slug` are unaffected; grep all consumers of `getAnakUsaha`-
  equivalent calls before shipping.
- **[Risk]** `links` in `jsonb` means the http/https scheme guard runs only at the contract layer,
  not the database — a direct DB write (migration, manual fix) could bypass it. → **Mitigation**:
  same trade-off already accepted for `partners.websiteUrl` (a plain `text` column with the same
  contract-only guard); no worse than existing precedent.
- **[Risk]** Cascade-deleting the profile when the taxonomy entry is deleted means a staff member
  deleting an `anak_usaha` row from the plain taxonomy screen silently removes its public
  presentation too, possibly surprising someone who only meant to clean up unused tags. →
  **Mitigation**: `proposal.md`/spec calls this out explicitly; the taxonomy delete confirmation
  copy should mention it will also remove the public profile, if one exists (a copy detail for
  `tasks.md`, not a schema change).

## Migration Plan

- Add `anak_usaha_profile` table (migration only, no backfill — no machine-readable source for the
  current `SUB_BRANDS` copy exists; an editor re-enters it through the new admin screen after
  deploy).
- Ship API + admin screen before removing `SUB_BRANDS` from the web app, so there's a window to
  populate all four profiles before the static fallback is deleted.
- Rollback: dropping the new table and reverting the web app to `SUB_BRANDS` is sufficient; no
  other table is touched.
