## Context

`docs/ARCHITECTURE.md` §4 lists `analytics/` alongside `comments/`, `moderation/`, `home/`, `media/`, `readers/`, `users/` in the backend module layout — a slot reserved before anything existed to put in it. §13 plans "a read replica for the analytics dashboard, once daily aggregation queries start competing with reads" and "a materialised view on `article_views_daily`, once the dashboard's date ranges exceed a year of data." Both presuppose a view-counting pipeline (§9.1: `article_views_daily`, `view_seen`) that has never been built, because the pages that would generate views don't exist yet — `apps/web/app/news/page.tsx` and `apps/web/app/news/[slug]/page.tsx` are both literal placeholders carrying the comment "Implemented by the `add-web-news-pages` follow-up change," and `apps/web/app/page.tsx` renders `<main>Siders</main>`.

Separately, `dashboard.view` has existed in the permission catalog since `add-auth-foundation` (`0000_useful_red_shift.sql:119`) and is exported from `packages/contracts/src/permission.ts:10`, but zero routes declare it — `apps/admin/src/App.tsx` has no `/dashboard` route at all, and `/` redirects straight to `/articles`.

This change fills the reserved `analytics/` slot with what's actually buildable today: aggregates over data the platform already has, with the `article_views_daily` pipeline explicitly deferred until there's a page to instrument.

## Goals / Non-Goals

See `proposal.md`. In short: six read-only tiles, one endpoint, no migration, no traffic pipeline, no per-tile permission gating, no deep links yet.

## Decisions

**Read-only aggregation over existing tables — no new schema.**

```
   WHAT'S AVAILABLE TODAY                    WHAT THIS CHANGE DOES NOT TOUCH
   ─────────────────────                     ────────────────────────────
   articles: status, publishedAt,       →    article_views_daily  (doesn't exist,
     seoDescription, excerpt,                  deferred to add-web-news-pages)
     featuredMediaId, timestamps
   article_categories, article_tags,    →    comments, moderation  (no schema yet)
     tags, media.alt
   home_curation, reels_curation,       →    materialized views / read replica
     reels.status                             (ARCHITECTURE §13 — not yet warranted
   readers.createdAt, lastLoginAt              at this data volume)
```

Every tile is a `SELECT` — `COUNT`, `GROUP BY`, or an `EXISTS` check — against tables that already have the columns needed. This is what makes the change buildable without a migration or a write-path risk.

**Timezone: `Asia/Jakarta`, pinned now, for the one calendar-bucketed computation.**

Only the cadence tile buckets by calendar period (`date_trunc('week', published_at AT TIME ZONE 'Asia/Jakarta')`). Every other tile uses point-in-time comparisons (`now()`, rolling windows like "trailing 30 days") or raw counts, neither of which depends on a timezone convention. Pinning it here anyway, in the first change that does any calendar bucketing at all, means the future view-counting pipeline inherits a decided convention instead of introducing its own — a mismatch between "this week" as computed by the dashboard's cadence tile and "this week" as computed by a future traffic tile would be a confusing, hard-to-notice bug.

- Alternative considered: bare `current_date` / UTC bucketing, deferring the timezone decision until the traffic pipeline forces it. Rejected — deciding it twice risks deciding it differently twice, and the cost of pinning it now is one `AT TIME ZONE` clause.

**One board, gated on `dashboard.view` alone — not per-tile permissions.**

```
   dashboard.view holder sees:
   ┌────────────┬────────────┬────────────┬────────────┬────────────┬────────────┐
   │  Pipeline   │  Cadence   │  Content   │  Homepage/ │  Up next   │  Readers   │
   │             │            │  debt      │  reels     │            │            │
   └────────────┴────────────┴────────────┴────────────┴────────────┴────────────┘
        news.manage-shaped data              user.manage-shaped data
        (content, curation)                  (readers, staff activity — none
                                              shown yet, but future tiles
                                              like staff dormancy would be)
```

Accepted, not overlooked: a role holding only `dashboard.view` (with neither `news.manage` nor `user.manage`) sees reader signup/activity counts it would otherwise have no access to. This is a deliberate simplification for a small team where dashboard access already implies broad trust. It does **not** currently create dead links, because this change ships no click-throughs at all (see Non-Goals) — the moment a future change adds a clickable count that resolves to a `news.manage`-gated list, that follow-up needs its own answer for a `dashboard.view`-only caller hitting a 403. Noted here so it isn't rediscovered as a surprise.

- Alternative considered: each tile declares its own permission; the endpoint returns the caller's intersection. Rejected for this change on explicit product direction — everyone with admin access should see one shared board, not a personalized subset.

**Content debt: published-scoped for article metadata, platform-wide for media and tags.**

```
   missingSeoDescription   articles.status = 'published' AND seo_description IS NULL
   missingExcerpt          articles.status = 'published' AND excerpt IS NULL
   missingFeaturedImage    articles.status = 'published' AND featured_media_id IS NULL
   uncategorized           articles.status = 'published'
                             AND NOT EXISTS (SELECT 1 FROM article_categories
                                              WHERE article_id = articles.id)
   mediaMissingAlt         media.alt IS NULL                        -- ALL media, any status
   unusedTags               tags with zero rows in article_tags      -- ALL tags, any status
```

Article-metadata counts are scoped to `published` only — a draft missing its SEO description is unfinished work, not debt; counting it would make the tile noisy with articles nobody has asked to ship yet. Media and tags have no status concept of their own, so those two counts are platform-wide.

`mediaMissingAlt` deliberately does **not** attempt to scope to "media in use" — `articles.ts`'s `bodyJson` embeds Tiptap image nodes directly (`apps/admin/src/editor/extensions.ts:28`), so a `media` row unreferenced by `articles.featuredMediaId` or `reels.posterMediaId` may still be live inside an article body. Distinguishing "orphaned" from "embedded in a body" requires parsing `bodyJson`, which is out of scope here (see Non-Goals — no orphaned-media reclaim tooling). Counting all missing-alt media, regardless of usage, avoids a false "unused" implication the data can't back up.

**Homepage & reels integrity reuse the exact public-visibility predicates — never re-derive them.**

```
   app.home_curation  ──┐                    apps/api/.../article.repository.ts
   app.reels_curation ──┼── dashboard query ──  isPubliclyVisible(row, now)
                         │                    apps/api/.../reel.repository.ts
                         └──────────────────    isReelPubliclyVisible(status)
```

Both functions are already exported and are exactly what `homeFeed.service.ts` and `publicReels.service.ts` use to decide what the public site actually serves. Importing them (rather than re-implementing "is this article published-or-due-scheduled" as a second copy of the same three-line predicate) guarantees the integrity tile can never drift from what the public site truly shows — the one failure mode a hand-duplicated predicate would eventually hit.

- `curatedTotal` / `curatedVisible`: total `home_curation` rows vs. the subset whose article passes `isPubliclyVisible`.
- `reelsCuratedTotal` / `reelsVisible`: total `reels_curation` rows vs. the subset whose reel passes `isReelPubliclyVisible`.

**"Up next" folds in worker health as a count, not a separate tile — and the copy must not overclaim.**

`scheduledPublishWorker.ts` promotes due `scheduled` articles to `published`, but its own header comment is explicit: *"Correctness does not depend on this ever running: `isPubliclyVisible()` already treats a due-but-unflipped `scheduled` article as published on every public read."* So a nonzero overdue count means the worker (or its cron trigger) likely isn't running — which stalls ISR revalidation on the static `/news/[slug]` page — **not** that content is failing to go live. The admin copy for this count must say exactly that (see `tasks.md` 4.x) — mislabeling it as "N articles stuck unpublished" would be a false alarm the data doesn't support, and the opposite mistake (staying silent) hides a real cache-freshness problem.

```
   dueWithin48h:   status = 'scheduled' AND published_at BETWEEN now() AND now() + 48h
   overdueUnpromoted: status = 'scheduled' AND published_at <= now()
                       ── nonzero ⇒ worker/cron likely not running, not "content stuck"
```

**Readers tile is rolling-window, not calendar-bucketed, and is explicitly labeled sign-in activity.**

`newLast7d` (`readers.createdAt >= now() - interval '7 days'`) and `activeLast30d` (`readers.lastLoginAt >= now() - interval '30 days'`) are both point-in-time rolling windows, so — unlike cadence — they carry no timezone dependency. The tile's label must say "sign-ins" or equivalent, not "visitors" or "traffic": on a news site the overwhelming majority of readers never authenticate, so this measures membership, not readership. Getting this label wrong is the single easiest way for this tile to mislead whoever's glancing at the board.

**Landing page moves from `/articles` to `/dashboard`.**

The premise of a glance board (per the proposal that shaped this change) is that it's seen every time someone opens the admin — a dashboard reachable only via a nav click doesn't get looked at daily. `App.tsx`'s current `<Route path="/" element={<Navigate to="/articles" replace />} />` becomes `<Navigate to="/dashboard" replace />`.

- Alternative considered: leave `/articles` as the default, add `/dashboard` as an ordinary nav item. Rejected — it's the lower-friction implementation, but it undermines the stated purpose of the tile set; a board that isn't the first thing seen isn't really a glance board.

**One endpoint, not one per tile.**

`GET /admin/dashboard` returns all six sections in a single response. Alternative considered: one endpoint per tile, for independent loading and future per-tile caching. Rejected as premature — this is six lightweight aggregate queries against small tables, issued once per admin page load; splitting them adds request overhead and client-side composition complexity for no present benefit. Revisit if a specific tile's query cost diverges enough to want independent revalidation (e.g., once the traffic pipeline lands and a views tile needs a different refresh cadence than the others).

## Risks / Trade-offs

- **Unindexed aggregate queries.** None of the six tiles has a purpose-built index; at current data volume this is fine, and it's the first concrete candidate for the read-replica/materialized-view upgrade `docs/ARCHITECTURE.md` §13 already names. Not addressed here — premature at this scale.
- **`dashboard.view` becomes a meaningfully more powerful permission than it has ever been.** Accepted per product direction (one board, no per-tile gating). Worth surfacing in role-creation guidance later; out of scope for this change.
- **Cold-start honesty.** The cadence and readers tiles are only meaningful once there's a few weeks of history; nothing in this change fabricates a trend line, but the UI should not imply significance where there's insufficient data (see `tasks.md`).

## Open Questions

- Should "up next" flag same-day scheduling collisions (two articles publishing within minutes of each other)? Not signaled anywhere else in the product today either — left out of v1; revisit if it turns out to be a real editorial pain point.
- The cadence window is fixed at 8 weeks in code. A query-param-driven range is reasonable future work once someone asks for it; not built speculatively here.
