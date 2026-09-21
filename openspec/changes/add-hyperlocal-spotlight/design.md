## Context

`home_curation` (`packages/db/src/schema/homeCuration.ts`) is a join table keyed by `article_id`
with a unique `position`, written through `replaceOrdering.ts`'s delete-and-reinsert helper and
capped at `MAX_HOME_CURATION_ENTRIES = 10` in `packages/contracts/src/curation.ts`. Its public
read, `homeFeed.service.ts`, filters invisible picks with `isPubliclyVisible`, preserves stored
order at the head of the feed, and backfills chronologically to the requested limit.

The spotlight reuses that capability's *semantics* — any status may be picked, invisible picks are
held silently, writes replace rather than mutate, `news.manage` carries the authorization — while
rejecting its *shape*: a ten-entry ordered list cannot express "exactly one" without a convention
every future writer must remember.

## Goals / Non-Goals

**Goals:**
- Make "at most one spotlighted article" structurally true, not validated in one code path.
- Reuse the existing visibility rule (`isPubliclyVisible`) and the `news.manage` permission
  unchanged.
- Keep the empty slot a first-class, ordinary state — the section simply does not render.

**Non-Goals:**
- Any notion of locality (city, region, coordinates, geo tags). The user's decision is explicit:
  the slot is global and the article carries no locality field.
- Scheduling, expiry, or rotation of the spotlight. It changes when an editor changes it.
- History of past spotlights. The slot stores the current pick only.
- De-duplication against `home-curation` or the chronological feed.

## Decisions

### One row, enforced by the primary key

`hyperlocal_spotlight` has a `slot` primary key whose only permitted value is the constant
`'default'`, alongside `article_id`, `updated_at`, and `updated_by`. A second row is rejected by
the primary key rather than by application logic — the same reasoning that made `article_id` the
primary key of `home_curation` so that a duplicate pick is "structurally impossible instead of
merely validated."

*Alternatives rejected:* a boolean `is_spotlight` column on `articles` (nothing stops two rows
from carrying it, and it puts presentation state on the content table); reusing `home_curation`
with a `section` discriminator (a single ten-entry replacement write would still be able to wipe
the spotlight).

### The write is an upsert of the whole slot

`PUT /admin/hyperlocal-spotlight` takes `{ "articleId": "<uuid>" }` to set and
`{ "articleId": null }` to clear. One endpoint, one verb, idempotent: submitting the article
already in the slot succeeds and changes nothing observable but `updated_at`. There is no
`POST`/`DELETE` pair, mirroring `home-curation`'s refusal to expose per-entry operations.

### Article deletion empties the slot

`article_id` references `articles.id` with `ON DELETE CASCADE`, for the same reason `home_curation`
uses it: articles are hard-deleted in this system, so without a cascade the slot would point at
nothing. The slot becoming empty is a valid state, so the cascade needs no compensating write.

### Public read is a separate endpoint, not a field on the home feed

`GET /home/hyperlocal-spotlight` is its own public, rate-limited read returning
`{ "article": ArticlePublicCard | null }`. Folding it into `GET /home` would make the feed's
limit/backfill arithmetic answer two questions at once, and would force every feed consumer to
care about a section it may not render. The cost is one extra request from the home page, paid in
parallel with the guide-pick and partner reads it already issues.

### Independence from the curated feed is deliberate

The spotlighted article may also appear in the curated list or the chronological backfill, and
neither read excludes the other. Silent cross-filtering would make the home feed's contents depend
on an unrelated section's state, and an editor who wants no repetition can simply not curate the
same article twice. Spec'd explicitly so a later reviewer does not "fix" it as a bug.
