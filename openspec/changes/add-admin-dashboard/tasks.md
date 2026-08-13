## 0. Prerequisites

- [ ] 0.1 Confirm `dashboard.view` is seeded in the permission catalog (`0000_useful_red_shift.sql:120`) and exported from `packages/contracts/src/permission.ts` — it is; no migration needed
- [ ] 0.2 Confirm `requirePermission` (`apps/api/src/middleware/authorize.ts`) is usable unmodified for the new route
- [ ] 0.3 Confirm `isPubliclyVisible` (`apps/api/src/modules/articles/article.repository.ts`) and `isReelPubliclyVisible` (`apps/api/src/modules/reels/reel.repository.ts`) are exported and importable from the new module without duplicating their logic

## 1. Contracts

- [ ] 1.1 Add `packages/contracts/src/dashboard.ts` with a `dashboardResponseSchema` covering all six sections: `pipeline`, `cadence`, `contentDebt`, `curationIntegrity`, `upNext`, `readers`
- [ ] 1.2 `pipeline`: `{ draft: number, scheduled: number, published: number }`
- [ ] 1.3 `cadence`: array of exactly 8 `{ weekStart: string (YYYY-MM-DD, Jakarta calendar date, not a UTC-shifted ISO timestamp), count: number }`, ordered oldest to newest, covering the current partial Jakarta week and the seven complete weeks before it
- [ ] 1.4 `contentDebt`: `{ missingSeoDescription, missingExcerpt, missingFeaturedImage, uncategorized, unusedTags }`, all `number` — no `mediaMissingAlt` (dropped, see `design.md`)
- [ ] 1.5 `curationIntegrity`: `{ home: { total: number, visible: number }, reels: { total: number, visible: number } }`
- [ ] 1.6 `upNext`: `{ dueWithin48h: Array<{ id: string, title: string, slug: string, publishedAt: string }>, dueWithin48hTotal: number, overdueUnpromotedCount: number }` — `dueWithin48h` is capped at 20 rows (see 2.8); `dueWithin48hTotal` lets the UI render "…and N more" when the true count exceeds the cap
- [ ] 1.7 `readers`: `{ newLast7d: number, activeLast30d: number }`
- [ ] 1.8 Export `DashboardResponse` type inferred from the schema
- [ ] 1.9 Unit-test the schema shape in `packages/contracts/src/dashboard.test.ts`

## 2. Analytics module — repository

- [ ] 2.1 Scaffold `apps/api/src/modules/analytics/` (routes, controller, service, repository, mapper) matching the module-per-feature layout every other module already uses
- [ ] 2.2 `analytics.repository.ts`: `getPipelineCounts()` — `GROUP BY status` over `app.articles`
- [ ] 2.3 `getCadence()` — compute `$cutoff` once as the `timestamptz` start of the Jakarta calendar week seven weeks before the current Jakarta week (Monday-aligned, per `design.md`); filter `WHERE status = 'published' AND published_at >= $cutoff` on the bare column so `articles_status_published_at_idx` stays usable, then `GROUP BY date_trunc('week', published_at AT TIME ZONE 'Asia/Jakarta')` for bucketing only — never wrap `published_at` in the `WHERE` clause. Select the bucket label as `to_char(date_trunc('week', published_at AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD')` so it never round-trips through a JS `Date` (avoids a timezone-dependent shift on `.toISOString()`). Fill any missing week — including the current partial week if it has zero publications — with a zero count in application code rather than relying on the query to produce empty buckets
- [ ] 2.4 `getContentDebt()` — one query over `app.articles WHERE status = 'published'` using `count(*) FILTER (WHERE ...)` for `missingSeoDescription`, `missingExcerpt`, `missingFeaturedImage`, `uncategorized`, plus one query each for `unusedTags` (different table). Predicates from `design.md`: `missingSeoDescription`/`missingExcerpt` are blank-aware (`col IS NULL OR btrim(col) = ''`), not bare `IS NULL`; `missingFeaturedImage` is `featured_media_id IS NULL`; `uncategorized` and `unusedTags` per 2.5/2.6 below
- [ ] 2.5 `uncategorized` uses `NOT EXISTS` against `article_categories`, not a `LEFT JOIN … IS NULL`, to avoid row multiplication from the join
- [ ] 2.6 `unusedTags` uses `NOT EXISTS` against `article_tags`
- [ ] 2.7 `getCurationIntegrity()` — load `home_curation` joined to `articles` (status, publishedAt) and `reels_curation` joined to `reels` (status); compute total/visible in application code using the imported `isPubliclyVisible`/`isReelPubliclyVisible` predicates, not a re-derived SQL condition
- [ ] 2.8 `getUpNext()` — `dueWithin48h` + `dueWithin48hTotal` in one query: `status = 'scheduled' AND published_at BETWEEN now() AND now() + interval '48 hours'`, ordered by `published_at` ascending, `LIMIT 20`, with `count(*) OVER ()` selected alongside each row to get the true total in the same round trip; `overdueUnpromotedCount` is a second query: `status = 'scheduled' AND published_at <= now() - interval '5 minutes'` (five-minute grace period against the one-minute publish-worker cron, per `design.md`)
- [ ] 2.9 `getReaderActivity()` — one query over `app.readers` using two `count(*) FILTER (WHERE ...)` aggregates: `newLast7d` (`created_at >= now() - interval '7 days'`) and `activeLast30d` (`last_login_at >= now() - interval '30 days'`)
- [ ] 2.10 Confirm every query is read-only — no repository method in this module performs an `INSERT`, `UPDATE`, or `DELETE`

## 3. Analytics module — service, controller, routes

- [ ] 3.1 `analytics.service.ts`: `getDashboard()` composes the repository calls (pipeline 1, cadence 1, content debt 2, curation integrity 2, up next 2, readers 1 — 9 queries total) via `Promise.all`. All 9 fit comfortably under the db pool's default `max` of 10, so no further batching is needed
- [ ] 3.2 `analytics.mapper.ts`: map raw rows to the contract shape, formatting `weekStart` and `publishedAt` as ISO strings
- [ ] 3.3 `analytics.controller.ts`: `getDashboard` handler returning `{ success: true, data }`, matching the envelope used by `curation.controller.ts`
- [ ] 3.4 `analytics.routes.ts`: `router.get('/', requirePermission('dashboard.view'), controller.getDashboard)`
- [ ] 3.5 Mount in `apps/api/src/server.ts` as `app.use('/admin/dashboard', analyticsRoutes(db))`, alongside the other `/admin/*` mounts
- [ ] 3.6 Confirm `auditAuthorizationDeclarations` (invoked at server boot) accepts the new route — it declares `requirePermission`, matching every other admin route's shape

## 4. Admin UI

- [ ] 4.1 Add `apps/admin/src/lib/dashboardApi.ts`: `dashboardApi.get()` calling `GET /admin/dashboard`, unwrapping the envelope, matching `curationApi.ts`'s pattern
- [ ] 4.2 Add `apps/admin/src/pages/DashboardPage.tsx` rendering the six tiles: Pipeline, Cadence (inline SVG or CSS-sized bars over the 8 fixed data points — no charting library; `apps/admin` has no charting dependency today and this route is not lazy-loaded, see 4.7), Content debt (single rolled-up count plus the five-line breakdown), Homepage/reels integrity (`visible / total` for each), Up next (due-soon list capped at 20 rows with a "…and N more" using `dueWithin48hTotal` + overdue count), Readers
- [ ] 4.3 Content-debt and pipeline tiles show counts only — no links to filtered article lists in this change (see `proposal.md` — Non-Goals); the up-next tile shows title/slug rows since that is its purpose
- [ ] 4.4 Up-next tile's overdue-count copy explicitly frames it as a scheduling-worker signal (e.g. "N scheduled articles are past due — check the publish worker"), never as "N articles failed to publish" — per `design.md`'s warning that `isPubliclyVisible` already serves an overdue-but-unflipped article as published
- [ ] 4.5 Readers tile is labeled with sign-in language counting readers, not events (e.g. "N readers signed in during the last 30 days") — never "visitors", "traffic", or a raw "N sign-ins" phrasing, since `activeLast30d` counts distinct readers by most-recent login, not login events
- [ ] 4.6 Cadence and readers tiles show a plain empty/low-data state rather than implying a trend when history is short; the cadence tile's newest bucket (the current, partial Jakarta week) is visually marked as partial rather than rendered as a drop
- [ ] 4.7 Register `/dashboard` in `apps/admin/src/App.tsx`
- [ ] 4.8 Change the `/` route's `Navigate` target from `/articles` to `/dashboard`
- [ ] 4.9 No nav entry is added in this change. `apps/admin/src/components/` has no shared nav/layout component today (only `MultiSelectChips`, `PreviewModal`, `SaveStatusIndicator`), `App.tsx` renders a bare `<Routes>` with no chrome, and no other admin route is linked from any page — there is no "existing navigation" or "per-page convention" to match. `/dashboard` is reachable as the `/` redirect target (4.8); introducing admin navigation generally is separate scope.
- [ ] 4.10 `DashboardPage` handles a 403 response from `GET /admin/dashboard` by rendering a readable "you don't have access to the dashboard" message rather than a blank screen or an unhandled error — the `/` redirect (4.8) is unconditional and `App.tsx` has no route-level permission check today, so a staff member without `dashboard.view` will reach this page and hit the 403 on every login until admin route guarding exists (see `design.md`'s "Landing page moves" decision)

## 5. Tests

- [ ] 5.1 Repository tests: each aggregate against seeded fixtures — pipeline counts; cadence bucketing (including a zero week, a published_at near the Asia/Jakarta day boundary, and the current-week bucket being partial rather than missing); each content-debt predicate including a published article with `seo_description = ''` and one with `excerpt = ''` (both counted as missing, not just the `NULL` case), published vs. draft scoping, and `uncategorized`/`missingFeaturedImage` positive and negative cases; curation integrity (visible vs. total, including an unavailable reel and an unpublished curated article); up-next due-soon window boundaries, the `LIMIT 20` cap against `dueWithin48hTotal`, and the overdue count both just inside (not counted) and just outside (counted) the five-minute grace period; reader windows
- [ ] 5.2 Permission test: confirm the route is covered by the existing generic `requirePermission` test in `middleware/authorize.test.ts`, matching the established convention (no new per-route permission test file)
- [ ] 5.3 Contract test: `dashboardResponseSchema` accepts a well-formed payload and rejects a malformed one (e.g. wrong `cadence` length)
- [ ] 5.4 Regression test: `health.routes.test.ts`'s full `createServer()` boot test still passes with the new route mounted, confirming `auditAuthorizationDeclarations` accepts it

## 6. Completion

- [ ] 6.1 `pnpm build` — clean across all apps/packages
- [ ] 6.2 `pnpm lint` — clean
- [ ] 6.3 `pnpm test` — all passing, including the new analytics tests
- [ ] 6.4 `pnpm typecheck` — clean, no `any`
- [ ] 6.5 Confirm `apps/web` is untouched by this change — the traffic pipeline stays deferred to `add-web-news-pages`
