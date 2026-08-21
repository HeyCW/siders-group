## Context

`GET /articles` (`apps/api/src/modules/articles/article.repository.ts`'s `listPublished`) currently
filters by category and tag with single-value `eq()` conditions against join subqueries (categories
and tags are many-to-many via `articleCategories`/`articleTags`). Anak usaha is a direct nullable FK
on `articles` (`articles.anak_usaha_id -> anak_usaha.id`, one-to-many, no join table — see
`packages/db/src/schema/articles.ts`), already surfaced publicly at `GET /anak-usaha`
(`anakUsaha.routes.ts`, `requirePublic()`) but never wired into the article list filter. The query
schema (`packages/contracts/src/article.ts`'s `articlePublicListQuerySchema`) already has one
precedent for a multi-value param: `excludeIds` normalizes a comma-separated string or a
repeated-key array into `string[]` via `z.preprocess`. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Category and anak usaha filters accept one or more slugs with OR semantics (article matches if
  it has any selected category / its one anak usaha is any of the selected slugs).
- Date filter accepts a single relative-or-custom range, resolved to a `publishedAfter`/
  `publishedBefore` bound.
- The `?category=`/`?anakUsaha=` URL params stay human-readable and shareable (comma-separated),
  matching the existing single-category URL convention rather than introducing repeated-key syntax.
- Reuse the `excludeIds` normalization pattern for the new multi-value params instead of inventing a
  second convention.

**Non-Goals:**
- No change to tag filtering (not exposed in the News page UI at all).
- No change to the admin article editor's anak usaha field (stays single-select there — one article
  has at most one anak usaha; this change only adds a *filter* that can match several).
- No search-endpoint changes — the News page's search box stays a client-side filter over already-
  loaded articles.
- No new sort behavior — Urutkan stays inert per the (updated) `web-public-site` spec.

## Decisions

**Multi-value param encoding: comma-separated string, normalized via the existing `excludeIds`
pattern.** Both `categorySlug` and the new `anakUsahaSlug` move from `z.string().optional()` to the
same `z.preprocess` shape `excludeIds` already uses (accepts a single string, a comma-separated
string, or a repeated-key array; produces `string[] | undefined`). Renaming the query params to
`categorySlugs`/`anakUsahaSlugs` was considered but rejected: the existing single-value
`?category=slug` URLs (already shared/bookmarked in principle since day one per
`web-public-site`'s "a filtered URL is shareable") continue to parse as a one-element array with no
name change, so this is additive, not breaking, at the query-string level.

**Category filter: `eq` → `inArray` on the join subquery.** `article.repository.ts`'s category
condition becomes:
```
inArray(articles.id,
  db.select({ id: articleCategories.articleId }).from(articleCategories)
    .innerJoin(categories, eq(categories.id, articleCategories.categoryId))
    .where(inArray(categories.slug, filter.categorySlugs)))
```
Same shape, `eq` → `inArray` on the inner `where`. OR-across-selected-categories falls out of this
for free (an article with any matching category row is included).

**Anak usaha filter: direct-FK subquery, not a join-table pattern.** Since `anakUsahaId` lives
directly on `articles`, the condition is simpler than category/tag — no join table:
```
inArray(articles.anakUsahaId,
  db.select({ id: anakUsaha.id }).from(anakUsaha).where(inArray(anakUsaha.slug, filter.anakUsahaSlugs)))
```

**Date range: two independent optional bounds, resolved client-side.** The backend accepts
`publishedAfter`/`publishedBefore` (ISO datetime strings, each optional) and applies
`gte(articles.publishedAt, ...)`/`lte(articles.publishedAt, ...)` conditions — it has no concept of
"7 hari terakhir" or "Tahun ini". `NewsExplorer` resolves the selected Tanggal option to concrete
`publishedAfter`/`publishedBefore` values at request time (e.g. "7 hari terakhir" → `now - 7d` as
`publishedAfter`), matching how relative-date UI is conventionally kept out of API contracts. This
keeps the backend timezone-agnostic and avoids baking "hari ini" semantics (which need a timezone)
into the API layer.

**URL shape for date:** `?date=7d|30d|year|custom` plus `?dateFrom=`/`?dateTo=` (ISO date, only
meaningful when `date=custom`). The page derives `publishedAfter`/`publishedBefore` from `date`
(and `dateFrom`/`dateTo` when custom) before calling `getArticles`, so the resolved bounds are never
themselves persisted in the URL — only the user's selection is, keeping the URL stable as "today"
moves.

**Anak usaha options fetched like categories.** `apps/web/lib/api.ts` gains `getAnakUsahaList()`
calling `GET /anak-usaha`, fetched in `apps/web/app/news/page.tsx` alongside `getCategories()` and
passed into `NewsExplorer` as a new `anakUsahaOptions` prop, replacing the hardcoded
`SUB_BRAND_OPTIONS` array.

**Frontend selection model: arrays in component state, still URL-driven.** `NewsExplorer` keeps the
existing pattern of deriving filter state from URL-sourced props (no client-only source of truth)
and calling `router.push` with the full updated query string on every toggle — same as today's
`selectCategory`, generalized to toggle-into-array instead of replace-with-value for Kategori and
Anak usaha, and replace-with-value (unchanged) for Tanggal.

## Risks / Trade-offs

- [Comma-separated slugs break if a slug ever contains a comma] → Slugs are generated
  URL-safe/kebab-case by the existing category/anak-usaha slugify path; commas are already excluded
  there, same assumption `excludeIds` relies on for UUIDs.
- [`inArray` on an empty array] → `filter.categorySlugs`/`anakUsahaSlugs` are only set when the
  normalized array is non-empty (mirrors `excludeIds`'s `ids.length > 0 ? ids : undefined`), so an
  empty selection is treated as "no filter," not "match nothing."
- [Relative date windows ("7 hari terakhir") computed client-side mean the bound depends on the
  visitor's clock] → Acceptable: same trade-off every "last N days" UI makes; the alternative
  (server-resolved relative dates) would require sending the visitor's timezone to the API for no
  real benefit at this traffic/precision level.
- [Combining three filter dimensions with OR-within-dimension, AND-across-dimension could surprise
  users expecting OR-across-everything] → Matches the existing category-filter mental model already
  shipped (a filtered URL narrows, it doesn't broaden) and is called out explicitly in the spec's
  "Filters combine" / "Combined filters narrow further" scenarios.

## Migration Plan

No data migration. Deploy order: backend (`public-news-api`) first (additive query params, existing
callers unaffected), then frontend. Rollback is a plain revert — no persisted state depends on the
new params existing.
