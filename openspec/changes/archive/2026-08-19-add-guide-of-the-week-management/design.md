## Context

See `proposal.md` — Why. The current section is `apps/web/components/home/GuideOfWeek.tsx`
rendering `GUIDE_OF_THE_WEEK` from `apps/web/lib/content.tsx` (two hardcoded picks, each with a
`MediaSlot src={null}` placeholder — there are no real photos today). This design covers the new
`guide-of-the-week-management` capability (DB, API, admin UI) and the layout rewrite needed to
support a dynamic pick count.

Ten scoping decisions were made before this design was written (recorded here so later readers
don't have to reconstruct the reasoning from `partner-management`/`home-curation` by inference):

1. No edition history — editors overwrite this week's picks; nothing is archived.
2. Pick count is dynamic — editors may add as many as they want; the layout must not assume a
   fixed number.
3. `EDITION` is a site-wide label (also used by the footer colophon), not a guide-pick field.
4. Admin writes are gated by `news.manage` (editorial content), not a new permission.
5. A failed or empty `/guide-picks` fetch hides the section; it must never fail the home page.
6. The capability is named `guide-of-the-week-management`, distinct from `home-curation` (which
   curates articles, not city guides).
7. Data is a flat `guide_picks` list — no separate library/edition split.
8. Photos are real, admin-managed media, not a `src={null}` placeholder.
9. No draft/publish workflow — editors edit the current list directly.
10. Guide picks are their own entity (`city`, `place`, `description`, `photo`), not forced into the
    `Article` shape.

Existing precedent this design follows directly:
- `partner-management` (`apps/api/src/modules/partners`) — directly-owned entities (not a curated
  selection over an independent pool), whole-collection reorder, `settings.manage`-style
  permission gating, revalidate-on-write via `apps/api/src/lib/revalidate.ts`. This design follows
  its shape almost exactly, differing only in permission and the absence of a pick-count cap.
- `partners.logoMediaId` / `reels.posterMediaId` — a required, `ON DELETE RESTRICT` reference to
  `media`, because a record that cannot degrade gracefully without its image should fail loudly
  rather than silently.
- `home-curation`'s reuse of `news.manage` rather than inventing a new permission — the same
  reasoning applies here (decision 4).

## Goals / Non-Goals

**Goals:**
- Guide-pick data (city, place, description, photo, order, active flag) is fully admin-managed,
  closing the hardcoded-placeholder gap and giving every pick a real photo.
- The home page section renders correctly for any number of active picks — one, two, ten, or zero
  — with no layout assumption baked in for exactly two.
- The public section degrades safely: a failed or empty fetch hides the section rather than
  breaking or half-rendering the home page.

**Non-Goals:**
- Any form of edition history, scheduling, or draft/publish workflow (decisions 1, 9).
- A maximum pick count (decision 2) — see Decisions below for what replaces a cap.
- Any change to `EDITION` or `SiteFooter`'s colophon (decision 3).
- Extracting a shared `MediaUploadField` component — this change copies the existing upload
  pattern from `PartnersPage.tsx` a third time (after `ReelLibraryPage.tsx`), consistent with how
  those two already coexist without that extraction having happened between them. A shared
  component is a separate refactor with its own review, not a prerequisite for this feature.

## Decisions

### Guide picks are directly-owned entities, not a curated selection
Mirrors `partner-management`'s own decision against modeling this like `home-curation`/
`reels-curation` (an ordered subset of an independent pool). A guide pick has no existence or use
outside this section, so this follows the direct-CRUD-plus-reorder shape rather than adding a
"guide library" with a separate curation join table.

**Alternative considered:** library + edition split (a pool of picks, with an ordered subset
selected for "this week"), matching `reels`/`reelsCuration`. Rejected per decision 1: there is no
history to preserve between weeks, so the pool and the selection would always be identical sets,
making the split pure indirection with no behavior it enables.

### No maximum pick count
Per decision 2, editors were explicitly given the freedom to add as many picks as they want in a
given week. This follows `partners`' precedent (no cap, bounded only by how many rows exist)
instead of `home-curation`'s fixed cap of ten. The public payload and the home page layout both
scale with whatever count exists; there is no server-side truncation.

**Alternative considered:** cap at some fixed number (e.g. `home-curation`'s ten), for payload-size
and layout-sanity reasons. Rejected — decision 2 was explicit that this should be dynamic, and nothing
about a city-guide list's realistic size (a handful of venues per week) creates the kind of
unbounded-growth risk a cap exists to prevent.

### Permission: reuse `news.manage`
Per decision 4. A weekly city guide is editorial judgment about what to feature, unlike a partner
logo (`partner-management`'s `settings.manage`, justified there as "site configuration, not
editorial content"). This is the same category `home-curation` already put under `news.manage`, so
this capability reuses it rather than growing the permission catalog.

**Alternative considered:** `settings.manage`, matching `partner-management` structurally.
Rejected — a guide pick is a content decision (what to recommend this week), not a configuration
value, and `news.manage` already exists to gate exactly that kind of decision.

### Photo is mandatory: NOT NULL + ON DELETE RESTRICT
Per decision 8. Mirrors `partners.logoMediaId` and `reels.posterMediaId`: a guide pick with no
photo has no graceful degraded presentation to fall back to — the whole point of this change is
that picks no longer render `MediaSlot`'s placeholder box. `photoMediaId` references `media.id`
with `onDelete: 'restrict'`, so a photo cannot be deleted out from under a pick that still uses it.

**Alternative considered:** optional photo, keeping `MediaSlot`'s placeholder as a legitimate
fallback state. Rejected — decision 8 was explicit that photos must be real and admin-managed, and
an optional field would let the placeholder state persist indefinitely instead of closing the gap
this change exists to close.

### Active flag is kept, even with no draft workflow
Per decisions 2 and 9 read together: there is no draft/publish workflow (9), but the pick count is
dynamic and editors may want to pull a specific venue from display without losing its row —
e.g. a place has temporarily closed, or an editor wants to shrink this week's grid without
retyping a pick they'll likely reuse later. `isActive` (default `true`) serves that single purpose,
exactly as it does for `partners`; it is not a scheduling or draft mechanism.

### Dynamic-count layout: uniform bordered cards, not positional dividers
Per decision 2. The current `GuideOfWeek.tsx` renders exactly two cells with position-based
styling (`i === 0` gets a right border and right padding; every other index gets left padding only)
— correct for two items, undefined for one, three, or a wrapped second row (no divider appears
between the last item of row one and the first item of row two). This is replaced with a uniform
card treatment: every cell gets its own full border (`border border-rule`) and equal padding,
arranged on `grid-cols-[repeat(auto-fit,minmax(280px,1fr))]` with a shared `gap`. This holds
identically for any count, including a wrap onto additional rows, with no per-index conditional.

**Alternative considered:** keep positional divider logic and extend it with `nth-child`/
column-count math (e.g. right-border every column except the last in each row). Rejected — that
math depends on how many columns actually fit at the current viewport width, which
`auto-fit`/`minmax` intentionally leaves fluid; encoding it would mean either hardcoding a column
count (reintroducing the fixed-count assumption decision 2 rejects) or replicating the grid's own
fitting logic in CSS `nth-child` selectors, which breaks the moment the viewport changes which
column count applies.

### Zero-pick hiding
Per decision 5. `app/page.tsx` conditionally omits the heading, edition trailer, and grid together
when the public guide-pick listing is empty — whether because no picks are configured yet or
because the fetch failed — mirroring `partner-management`'s zero-partner hiding and
`web-public-site`'s existing rule against showing a capability with nothing behind it. The fetch
itself is wrapped the same way `getPartners()` already is in `page.tsx` (`.catch(() => [])`), so a
`/guide-picks` failure cannot take down the rest of the home page via the same `Promise.all`.

## Risks / Trade-offs

- **No cap means no payload/layout ceiling** — an editor who adds a very large number of picks in
  one week gets a very large grid with no server-side limit to stop them. Accepted per decision 2;
  if this becomes a real problem, a cap can be added later the same way `home-curation`'s already
  is, without a data-model change (positions are already derived server-side).
- **Reorder endpoint requires the full id set on every write** — same trade-off `partner-management`
  and `home-curation` already accept (atomic whole-list replace over incremental move/insert/
  remove); simpler correctness story, at the cost of the admin UI submitting the complete list on
  every reorder rather than a single move operation.
- **A third hand-rolled media-upload flow** — `PartnersPage.tsx` and `ReelLibraryPage.tsx` each
  already carry their own upload state (`uploadingLogo`/`uploadingPoster`, preview URL, media id,
  error, file-input remount key); this change adds a third near-identical copy rather than
  extracting a shared component now (see Non-Goals). Accepted as a deliberate scope boundary, not
  an oversight — if a fourth copy is ever needed, that is the point to extract.

## Migration Plan

1. DB migration adding the `guide_picks` table (additive only, no existing table touched).
2. Ship API + admin UI behind the existing deploy pipeline; the public `/guide-picks` endpoint
   returns an empty collection until staff add picks, which the zero-pick hiding rule already
   renders safely.
3. Deploy the web change; until picks are added, the section stays hidden (equivalent to today's
   two-pick grid being replaced by nothing, not by a broken empty grid).
4. Staff add guide picks via the new admin page, with real photos; the section appears
   automatically on the next `revalidate: 60` window or immediately via the write-triggered
   revalidation.
5. Remove `GUIDE_OF_THE_WEEK` and `GuidePick` from `apps/web/lib/content.tsx` once the web change
   lands (no consumers left); `EDITION` stays.

Rollback: revert the web change (grid → nothing, or restore the old two-pick static markup
temporarily) independently of the API/DB, since the public endpoint is additive and non-breaking;
the DB migration has no down-side risk since nothing else references the new table.
