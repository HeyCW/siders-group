## Why

`dashboard.view` has been in the fixed permission catalog since `add-auth-foundation` (`0000_useful_red_shift.sql:119`, `packages/contracts/src/permission.ts:10`) and `docs/ARCHITECTURE.md` §4 reserves an `analytics/` module slot in the backend layout — but no route has ever enforced the permission and no dashboard exists. Meanwhile several operational states are currently invisible to every editor: `homeFeed.service.ts` and `publicReels.service.ts` silently drop curated picks whose underlying article or reel is no longer publicly visible, published articles routinely go live missing SEO metadata or a featured image, and the scheduled-publish worker's backlog has no signal anywhere in the product. This change gives `dashboard.view` its first real use and surfaces exactly those states, using only data that already exists.

## What Changes

- Add `apps/api/src/modules/analytics/` (routes, controller, service, repository, mapper) exposing `GET /admin/dashboard`, gated on `requirePermission('dashboard.view')`. No new permission catalog row is introduced — the permission already exists and has never been enforced anywhere.
- Six read-only tiles, computed entirely from existing tables with no new migration:
  - **Pipeline** — article counts by status (`draft` / `scheduled` / `published`)
  - **Cadence** — articles published per calendar week, trailing 8 weeks
  - **Content debt** — published articles missing SEO description, excerpt, or featured image; published articles with no category; media rows missing alt text; tags attached to zero articles
  - **Homepage & reels integrity** — for each curated ordering, the total entry count versus the count whose underlying content is actually publicly visible right now, reusing `isPubliclyVisible` and `isReelPubliclyVisible` verbatim rather than re-deriving the predicate
  - **Up next** — scheduled articles due within 48 hours, plus a count of scheduled articles whose `published_at` has already passed (a worker-health signal, not a "content is unpublished" signal — see `design.md`)
  - **Readers** — new reader signups (trailing 7 days) and active readers by `lastLoginAt` (trailing 30 days), explicitly labeled as sign-in activity, not page-view traffic
- Add the response contract to `packages/contracts`.
- Add `apps/admin/src/pages/DashboardPage.tsx`, `apps/admin/src/lib/dashboardApi.ts`, and a `/dashboard` route.
- **BREAKING (admin UX)**: change `App.tsx`'s `/` redirect target from `/articles` to `/dashboard`, making the dashboard the default landing screen for every authenticated staff member. No API contract changes; this only affects where the admin SPA navigates on load.
- Pin `Asia/Jakarta` as the fixed timezone for the one calendar-bucketed computation in this change (the weekly cadence buckets), establishing the convention a future view-counting pipeline must inherit rather than independently decide.

## Non-Goals

- **No traffic/view-counting pipeline.** `article_views_daily` and `view_seen` (`docs/ARCHITECTURE.md` §9.1) are not built here. `apps/web/app/news/[slug]/page.tsx` and `apps/web/app/news/page.tsx` are still literal placeholders ("Implemented by the `add-web-news-pages` follow-up change") — there is nothing to instrument yet. Deferred to `add-web-news-pages`, where the view beacon can be designed in from the start rather than retrofitted onto a live SSG site.
- **No per-tile permission gating.** The board is gated on `dashboard.view` alone; any caller holding it sees every tile, including staff dormancy and reader/moderation counts. Accepted trade-off — see `design.md`.
- **No deep-linkable filtered views.** `apps/admin/src/pages/ArticleListPage.tsx` filters by status only, in local component state, with no URL search params. Turning a content-debt count into a clickable filtered list is separate scope; tiles show counts only in this change.
- **No comments/moderation tiles.** Reserved as a later slot — no `comments` or `moderation` schema exists yet.
- **No orphaned-media reclaim tooling.** Media referenced only from an article's `bodyJson` (Tiptap image nodes) cannot be distinguished from truly orphaned media without parsing that document, which this change does not do.
- **No caching or materialized view.** `docs/ARCHITECTURE.md` §13 names this upgrade explicitly for "once the dashboard's date ranges exceed a year of data" — not yet applicable.

## Impact

- **Affected specs**: `admin-dashboard` (new capability)
- **Affected code**: `apps/api/src/modules/analytics/**` (new), `apps/api/src/server.ts` (mount `/admin/dashboard`), `packages/contracts/src/dashboard.ts` (new), `apps/admin/src/pages/DashboardPage.tsx` (new), `apps/admin/src/lib/dashboardApi.ts` (new), `apps/admin/src/App.tsx` (new route + redirect target)
- **Migration**: none — every tile reads existing tables (`articles`, `article_categories`, `article_tags`, `tags`, `media`, `home_curation`, `reels_curation`, `reels`, `readers`)
