## Why

Readers arriving on the home page get a chronological news feed plus a ten-entry curated list —
nothing tells them which single hyperlocal story the newsroom wants them to read today. The
editorial team wants one deliberate, unmissable pick: a "Hyperlocal" spotlight that holds exactly
one article at a time and reads as a decision, not a ranking.

`home-curation` cannot carry this. Its write endpoint is a whole-list replacement capped at ten
entries with no minimum, and a "list of one" would be enforced nowhere — the next editor to save
a ten-article order would silently destroy the spotlight. A one-article slot needs its own
capability with its own storage, so "exactly one" is structural rather than a convention.

## What Changes

- A new `hyperlocal-spotlight` capability: one global slot holding zero or one article, gated by
  the existing `news.manage` permission. No new permission catalog entry.
- Admin read (`GET /admin/hyperlocal-spotlight`) returns the current pick with its status and
  whether it is publicly visible, or an empty slot.
- Admin write (`PUT /admin/hyperlocal-spotlight`) sets the pick from a single article id, or
  clears it with `null`. Whole-slot replacement, atomic and idempotent — no per-entry insert,
  move, or delete endpoint exists, matching `home-curation`'s write discipline.
- Any article status may be spotlighted, including `draft` and `scheduled`. An invisible pick is
  stored and held but contributes nothing to public output until it becomes publicly visible,
  with no second editorial action.
- Public read (`GET /home/hyperlocal-spotlight`) serves the spotlighted article as a public card,
  or an empty result when the slot is empty or its article is not publicly visible.
- The public home page gains a Hyperlocal section above the existing showcase, rendering nothing
  at all when the slot is empty.
- The admin Home Curation screen gains a single-article Hyperlocal picker alongside the existing
  ordered list.
- Locality is **not** modeled: no city, region, or geo field is added anywhere. "Hyperlocal" is
  the section's editorial identity, and the pick is any article the newsroom judges to fit.
- The spotlight is deliberately independent of the curated home feed: the same article may occupy
  both, and neither read filters the other.
- **BREAKING**: none.

## Impact

- **Affected specs**: hyperlocal-spotlight (new capability)
- **Affected code**: `packages/db/src/schema/hyperlocalSpotlight.ts` (new),
  `packages/db/src/schema/index.ts`, `packages/contracts/src/hyperlocalSpotlight.ts` (new),
  `packages/contracts/src/index.ts`, `apps/api/src/modules/hyperlocalSpotlight/*` (new),
  `apps/api/src/server.ts`, `apps/admin/src/lib/hyperlocalSpotlightApi.ts` (new),
  `apps/admin/src/pages/HomeCurationPage.tsx`,
  `apps/web/src/components/home/HyperlocalSpotlight.tsx` (new),
  `apps/web/src/pages/HomePage.tsx`, `apps/web/src/lib/api.ts`
- **Migration**: additive — one new `hyperlocal_spotlight` table with a single-value primary key
  and an `ON DELETE CASCADE` article reference. No backfill, no existing table touched, no data
  loss. Follows the applied migration path in `apps/api-laravel/database/migrations/`.
