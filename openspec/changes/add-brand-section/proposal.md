## Why

The home page's partner strip ("Thank You For Always Trusting Us") renders 12 hardcoded, identical `"Brand"` placeholder tiles (`PARTNERS` in `apps/web/lib/content.tsx`) — sample data with no backend model, in direct tension with `web-public-site`'s existing rule that no route may render fabricated content in place of a capability the backend doesn't yet provide. There is no way for staff to add, remove, or reorder a real partner today. Separately, the section's current wrapping-grid presentation was requested to become a single-row, continuously auto-scrolling ticker.

## What Changes

- Add a new `partner-management` capability: a `partners` table, admin CRUD endpoints, and a public read endpoint, following the exact "ordered list + permission-gated writes + public read + revalidate-on-write" pattern `home-curation` already established.
- Each partner requires a logo (uploaded through the existing media module), a name (used as alt text/admin identification, not displayed as visible text), and a website URL.
- Admin write endpoints are gated by the existing `settings.manage` permission (partners are site configuration, not editorial content) rather than introducing a new `partner.manage` permission.
- Add a new admin page for managing partners: create/edit/delete, drag-to-reorder, logo upload, active toggle.
- Replace `PartnerGrid`'s static wrapping grid with a horizontal auto-scrolling logo ticker (one row, standard leftward marquee, pause on hover/focus, `motion-reduce` fallback to a static grid, duplicated track for a seamless loop even with few partners).
- When there are zero active partners, the entire section (heading, rule, and ticker) is omitted from the home page rather than rendering empty.
- Remove `PARTNERS` from `apps/web/lib/content.tsx` and wire the home page to fetch real data instead.

Non-goals: no per-partner analytics/click tracking, no partner self-service, no changes to the Anak Usaha sub-brands section or the SIDERS masthead wordmark.

## Capabilities

### New Capabilities
- `partner-management`: admin-managed partner directory (logo, name, website URL, ordering, active status) backing the public home page's partner ticker — DB table, admin CRUD API, public read API, and the admin management page.

### Modified Capabilities
- `web-public-site`: the home page's partner section changes from a static hardcoded grid to a ticker fed by real backend data, closing the existing "no hardcoded sample content" gap for this section.

## Impact

- **DB**: new `partners` table (migration), referencing `media` via `logo_media_id` (`ON DELETE RESTRICT`, matching `reels.posterMediaId`).
- **API**: new `apps/api/src/modules/partners` module (routes, controller, service, repository, mapper); new admin routes under `/admin/partners` (`settings.manage`); new public route `/partners` (`requirePublic()` + rate limited); partner writes revalidate the home page.
- **Admin**: new `apps/admin/src/pages/PartnersPage.tsx` (or similarly named) plus navigation entry.
- **Web**: `apps/web/components/home/PartnerGrid.tsx` rewritten as a ticker; `apps/web/lib/api.ts` gains `getPartners()`; `apps/web/app/page.tsx` fetches and passes real partners; `apps/web/lib/content.tsx` loses `PARTNERS`; `tailwind.config.ts` gains a marquee keyframe/animation.
- **Contracts**: `packages/contracts` gains partner request/response types, following the pattern of existing curation/reels contracts.
