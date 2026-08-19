## Why

The home page's "Siders Guide of the Week" section renders `GUIDE_OF_THE_WEEK` — two hardcoded
Surabaya/Jakarta picks (city, place, description) in `apps/web/lib/content.tsx` — with no backend
model behind it, and each pick's `MediaSlot` renders `src={null}` (a "Drop city guide photo"
placeholder, never a real image). This was a deliberate Non-Goal of `add-web-news-pages`
("`GUIDE_OF_THE_WEEK` ... don't fit the `Article` shape ... there's no separate 'guide' entity"),
carried since as static editorial content with no way for staff to change it short of a code
deploy. There is now a decision to close that gap, following the same "ordered list + permission-
gated writes + public read + revalidate-on-write" pattern `partner-management` already established
for the same class of problem.

## What Changes

- Add a new `guide-of-the-week-management` capability: a `guide_picks` table, admin CRUD +
  reorder endpoints, and a public read endpoint, following `partner-management`'s shape exactly
  (directly-owned entities, not a curated selection over an independent pool — there is no
  "guide library" separate from what's currently shown).
- Each guide pick has a city, a place name, a one-line description, and a required photo
  (uploaded through the existing media module, mirroring `partners.logoMediaId` and
  `reels.posterMediaId`).
- Admin write endpoints are gated by the existing `news.manage` permission — a weekly city guide
  is editorial content, unlike a partner logo, so this reuses `home-curation`'s permission rather
  than `partner-management`'s `settings.manage` or a new catalog entry.
- The list is a single flat, ordered collection with no history and no draft/publish workflow:
  editors overwrite this week's picks directly, with no per-week snapshot kept and nothing to
  schedule ahead of time. There is no maximum pick count — following `partners`' precedent
  (bounded only by how many rows exist) rather than `home-curation`'s fixed cap of ten, since
  editors were explicitly asked for and given the freedom to add as many as they want in a given
  week.
- Add a new admin page for managing guide picks: create/edit/delete, drag-to-reorder, photo
  upload, active toggle (temporarily hide a pick without deleting it).
- Rewrite `GuideOfWeek.tsx`'s layout so it is correct for any number of picks (today's markup
  special-cases exactly two — a first-column/second-column border split that has no defined
  behavior for one, three, or a wrapped second row).
- When the public listing returns zero picks (nothing configured yet, or the request fails), the
  entire section (heading, edition trailer, and grid) is omitted from the home page rather than
  rendering empty or broken — the home page must not go down because this one section's data is
  unavailable.
- Remove `GUIDE_OF_THE_WEEK` and the `GuidePick` interface from `apps/web/lib/content.tsx` and wire
  the home page to fetch real data instead. `EDITION` is untouched: it labels the whole print
  edition (also read by `SiteFooter`'s colophon line), not a guide-pick field, so it is not part of
  this capability's data model.

Non-goals: no edition history or past-weeks archive, no draft/scheduled-publish workflow for a
future week's guide, no cap on the number of picks, no change to `EDITION` or the footer colophon,
no shared media-upload component extraction (the upload flow is copied from `PartnersPage.tsx`'s
existing pattern, same as `ReelLibraryPage.tsx` already does independently — a shared
`MediaUploadField` is a separate refactor, not required by this change).

## Capabilities

### New Capabilities
- `guide-of-the-week-management`: admin-managed list of city guide picks (city, place,
  description, photo, ordering, active status) backing the public home page's "Siders Guide of the
  Week" section — DB table, admin CRUD + reorder API, public read API, and the admin management
  page.

### Modified Capabilities
- `web-public-site`: the home page's guide-of-the-week section changes from static hardcoded
  content with no photos to a dynamically-sized grid fed by real backend data, and gains a defined
  empty state.

## Impact

- **DB**: new `guide_picks` table (migration), referencing `media` via `photo_media_id`
  (`ON DELETE RESTRICT`, matching `partners.logo_media_id` / `reels.posterMediaId`).
- **API**: new `apps/api/src/modules/guidePicks` module (routes, controller, service, repository,
  mapper); new admin routes under `/admin/guide-picks` (`news.manage`); new public route
  `/guide-picks` (`requirePublic()` + rate limited); guide-pick writes revalidate the home page.
- **Admin**: new `apps/admin/src/pages/GuidePicksPage.tsx` plus navigation entry.
- **Web**: `apps/web/components/home/GuideOfWeek.tsx` rewritten to take fetched picks as props and
  render a layout correct for any count; `apps/web/lib/api.ts` gains `getGuidePicks()`;
  `apps/web/app/page.tsx` fetches real picks (degrading to an empty list, not a page failure, on
  error) and omits the section entirely when empty; `apps/web/lib/content.tsx` loses
  `GUIDE_OF_THE_WEEK` and `GuidePick` (keeps `EDITION`).
- **Contracts**: `packages/contracts` gains guide-pick request/response types, following the
  pattern of `partner.ts`.
