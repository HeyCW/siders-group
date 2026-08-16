## Context

See `proposal.md` — Why. The current partner section is `apps/web/components/home/PartnerGrid.tsx`
rendering `PARTNERS` from `apps/web/lib/content.tsx` (12 hardcoded `'Brand'` strings). This design
covers the new `partner-management` capability (DB, API, admin UI) and the presentation rewrite of
`PartnerGrid` into a ticker.

Existing precedent this design follows directly:
- `home-curation` / `reels-curation` (`apps/api/src/modules/curation`, `apps/api/src/modules/reels`) —
  permission-gated admin writes, a public read endpoint, revalidate-on-write via
  `apps/api/src/lib/revalidate.ts`.
- `reels.posterMediaId` (`packages/db/src/schema/reels.ts`) — a required, `ON DELETE RESTRICT`
  reference to `media`, because a record that cannot degrade gracefully without its image must fail
  loudly rather than silently.
- `tag-management` / `category-management` — plain CRUD admin surface for a directly-owned entity,
  as opposed to curation's "select from an existing pool" model.

## Goals / Non-Goals

**Goals:**
- Partner data (logo, name, website, order, active flag) is fully admin-managed, closing the
  hardcoded-placeholder gap.
- The public ticker degrades safely: reduced motion, zero partners, few partners, and mixed logo
  aspect ratios all have a defined, non-broken presentation.

**Non-Goals:**
- Per-partner analytics or click tracking.
- Partner self-service (partners never authenticate; only staff manage records).
- Any change to `SUB_BRANDS` (Anak Usaha) or the `SIDERS` masthead wordmark.

## Decisions

### Partners are directly-owned entities, not a curated selection
`home-curation` and `reels-curation` both curate an *ordered subset* of a larger pool (articles,
reels) that exists independently. Partners have no such independent pool — a partner record only
exists to appear in the ticker. So this follows the `tag-management`/`category-management` shape
(direct CRUD) plus one addition: an explicit reorder endpoint, since presentation order matters here
but not for tags/categories. Reordering is exposed as `PUT /admin/partners/order` accepting the full
ordered list of every existing partner id — the same "whole-collection replace, positions derived
from submitted order" semantics `home-curation`'s replace endpoint already uses, scoped to reordering
rather than membership.

**Alternative considered:** model partners like curated articles (a `partner_curation` join table
over a separate partner "library"). Rejected — there's no independent use for a partner record
outside the ticker, so the extra join table and two-surface admin UI (library + curation) would add
indirection with no behavior it enables.

### Logo is mandatory: NOT NULL + ON DELETE RESTRICT
Mirrors `reels.posterMediaId` exactly, and for the same reason stated in that schema's own comment:
a partner tile with no logo has no graceful degraded state to fall back to (unlike an article's
`featuredMediaId`, which is optional and `SET NULL`-able because an article still reads fine without
one). `name` stops being displayed text and becomes `alt` text plus the admin list's identifying
label.

### Permission: reuse `settings.manage`
`settings.manage` already exists in `packages/contracts/src/permission.ts`, is currently exercised by
exactly one route, and best fits "site configuration" — a partner is not editorial content the way
an article or reel is. This follows `home-curation`'s own precedent of reusing `news.manage` rather
than inventing `curation.manage`: don't grow the permission catalog for a capability that fits an
existing entry.

**Alternative considered:** `news.manage` (what `home-curation`/`reels-curation` use, on the theory
that partners are front-page furniture like curation/reels). Rejected in favor of `settings.manage`
because partners aren't editorial judgment calls about content — they're closer to site identity/
configuration, and `settings.manage` is otherwise nearly unused.

### Ticker is pure CSS, not JS-driven
A `marquee` keyframe (`translateX(0) → translateX(-50%)`) added to `tailwind.config.ts` alongside
the existing `ruledraw`/`inkfade`/`riseIn` keyframes, applied to a track containing the partner list
rendered twice back-to-back. No scroll-position JS, no `requestAnimationFrame` — consistent with
every other animation already in this codebase.

- **Seamless loop with few partners**: the two-copies-of-the-list track only loops seamlessly once
  one copy's rendered width is at least the viewport width; with very few partners, the list is
  repeated enough times (not a hardcoded ×2) that one half of the full track exceeds the widest
  supported viewport before the animation is applied.
- **Duplicate accessibility**: every copy beyond the first canonical one is `aria-hidden="true"`
  with every link inside it given `tabIndex={-1}` — visual repetition without assistive-tech or
  keyboard repetition.
- **Pause**: `animation-play-state: paused` applied via both `:hover` and `:focus-within` on the
  track's container, so a focused link doesn't ride offscreen mid-scroll.
- **`motion-reduce` fallback**: reuses today's static wrapping-grid markup (the current
  `PartnerGrid` layout becomes the reduced-motion branch, not deleted code) — this is also the
  natural point to note that a mixed grid layout has always coexisted with the ticker as the
  no-motion presentation, not a new component.

**Alternative considered:** a JS-driven carousel (e.g. re-measuring scroll position, cloning nodes on
demand). Rejected — adds a client dependency and runtime complexity for a purely visual effect that
CSS already handles, and the codebase has no existing JS-animation precedent to extend.

### Zero-partner hiding
`app/page.tsx` conditionally omits the heading, rule, and ticker together when the public partner
listing is empty, mirroring `web-public-site`'s existing rule against showing a capability with
nothing behind it (the same principle that already scopes search and filter controls elsewhere on
the site).

## Risks / Trade-offs

- **Mixed logo dimensions in one row** → fixed row height + `object-contain` on every logo bounds
  the visual inconsistency, but a very wide wordmark next to a square badge will still look uneven.
  Accepted as an editorial/asset-quality concern, not something the ticker can fully normalize.
- **Reorder endpoint requires the full id set on every write** → same trade-off `home-curation`
  already accepts (atomic whole-list replace over incremental move/insert/remove); simpler
  correctness story, at the cost of the admin UI needing to submit the complete list on every
  reorder rather than a single move operation.
- **`settings.manage` is a repurposed, barely-used permission** → if a future capability wants a
  narrower "site configuration" boundary than "partners + whatever else settings.manage already
  gates," splitting it later is a migration; accepted now because the alternative (a
  single-capability permission) repeats the exact pattern `home-curation` deliberately avoided.

## Migration Plan

1. DB migration adding the `partners` table (additive only, no existing table touched).
2. Ship API + admin UI behind the existing deploy pipeline; the public `/partners` endpoint returns
   an empty collection until staff add partners, which the zero-partner hiding rule already renders
   safely.
3. Deploy the web ticker; until partners are added, the section stays hidden (equivalent to today's
   grid being replaced by nothing, not by a broken empty ticker).
4. Staff add partners via the new admin page; the section appears automatically on the next
   `revalidate: 60` window or immediately via the write-triggered revalidation.
5. Remove `PARTNERS` from `apps/web/lib/content.tsx` once the web change lands (no consumers left).

Rollback: revert the web change (ticker → nothing, or restore static grid temporarily) independently
of the API/DB, since the public endpoint is additive and non-breaking; the DB migration has no
down-side risk since nothing else references the new table.
