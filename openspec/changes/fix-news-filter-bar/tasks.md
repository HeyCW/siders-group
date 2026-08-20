## 1. Contracts

- [x] 1.1 In `packages/contracts/src/article.ts`, factor the `excludeIds` comma-separated/repeated-
      array normalization into a reusable helper (or inline the same `z.preprocess` shape) and apply
      it to `categorySlug` (rename to `categorySlugs`, `z.array(z.string()).optional()`)
- [x] 1.2 Add `anakUsahaSlug` to `articlePublicListQuerySchema` using the same normalization
      (`anakUsahaSlugs`, `z.array(z.string()).optional()`)
- [x] 1.3 Add `publishedAfter`/`publishedBefore` (`z.coerce.date().optional()`) to
      `articlePublicListQuerySchema`
- [x] 1.4 Export the updated `ArticlePublicListQuery` type

## 2. Backend

- [x] 2.1 In `apps/api/src/modules/articles/article.repository.ts`, rename
      `PublicListFilter.categorySlug` to `categorySlugs: string[] | undefined` and change the
      category condition from `eq(categories.slug, ...)` to `inArray(categories.slug, ...)`
- [x] 2.2 Add `anakUsahaSlugs: string[] | undefined` to `PublicListFilter` and a new condition:
      `inArray(articles.anakUsahaId, db.select({ id: anakUsaha.id }).from(anakUsaha).where(inArray(anakUsaha.slug, filter.anakUsahaSlugs)))`,
      pushed only when the array is non-empty
- [x] 2.3 Add `publishedAfter`/`publishedBefore` to `PublicListFilter` and push
      `gte(articles.publishedAt, ...)`/`lte(articles.publishedAt, ...)` conditions when present
- [x] 2.4 Update `article.controller.ts`'s public list handler to pass the new parsed fields into
      `repository.listPublished(...)` — no change needed: the controller already spreads the parsed
      query object (`{ ...query, now: new Date() }`) into the filter, and the renamed/added query
      fields already match the `PublicListFilter` field names
- [x] 2.5 Add/extend repository or controller tests: multi-category OR match, anak usaha filter
      match, published-date range bounds (inclusive edges), combined filters, empty-array filters
      treated as "no filter" — added at the contract-schema level
      (`packages/contracts/src/article.test.ts`); `article.repository.test.ts` has no existing
      coverage of `listPublished`'s query building (it requires a live Postgres connection, unlike
      the pure-function `isPubliclyVisible` tests already there), so no DB-integration test was
      added, consistent with pre-existing category/tag filter coverage in this file (none)

## 3. Frontend API client

- [x] 3.1 In `apps/web/lib/api.ts`, change `GetArticlesParams.categorySlug` to
      `categorySlugs?: string[]`, add `anakUsahaSlugs?: string[]`, `publishedAfter?: string`,
      `publishedBefore?: string`; update `getArticles`'s `buildQuery` call accordingly
      (`buildQuery` already supports `string[]` values)
- [x] 3.2 Add `getAnakUsahaList(init?: RequestInit): Promise<AnakUsahaResponse[]>` calling
      `GET /anak-usaha`, following `getCategories`'s exact shape

## 4. Frontend page and filter bar

- [x] 4.1 In `apps/web/app/news/page.tsx`, read `category`, `anakUsaha`, `date`, `dateFrom`,
      `dateTo` from `searchParams`; split `category`/`anakUsaha` on commas into arrays; resolve
      `date` (`7d`/`30d`/`year`/`custom`) plus `dateFrom`/`dateTo` into `publishedAfter`/
      `publishedBefore` before calling `getArticles`; fetch `getAnakUsahaList()` alongside
      `getCategories()`; pass `activeCategorySlugs`, `activeAnakUsahaSlugs`, `activeDateOption`,
      `activeDateFrom`, `activeDateTo`, and `anakUsahaOptions` into `NewsExplorer`; update the
      `key` prop to vary on all active filters, not just category
- [x] 4.2 In `NewsExplorer.tsx`, replace `SUB_BRAND_OPTIONS` with the `anakUsahaOptions` prop
- [x] 4.3 Generalize `selectCategory` into a toggle-into-array helper reused by both Kategori and
      Anak usaha (add to the set / remove from the set), each pushing the full updated query string
      via `router.push`
- [x] 4.4 Wire the Tanggal `FilterOption`s to a replace-select handler (radio behavior) that sets
      `?date=` and clears `dateFrom`/`dateTo` unless the option is `custom` — implemented with a
      local `draftDateOption` (see design note added in `NewsExplorer.tsx`) so the custom-range
      sub-form can appear before the URL round-trip commits anything
- [x] 4.5 Add a "Rentang khusus" sub-form (from/to date inputs) inside the Tanggal `FilterTrigger`,
      shown only when `date=custom` is selected, that sets `dateFrom`/`dateTo` on submit
- [x] 4.6 Update the active-filter-chips row and "Hapus semua" control to reflect and clear all
      three filter dimensions (category, anak usaha, date), not just category
- [x] 4.7 Update the empty-state's clear-filters control to clear all three dimensions

## 5. Verification

- [x] 5.1 Update `NewsExplorer.test.tsx` for: selecting a second category adds rather than replaces;
      deselecting one category leaves the other active; Anak usaha selection pushes
      `?anakUsaha=...` and renders real options from a passed-in prop; Tanggal selection pushes
      `?date=...`; selecting "Rentang khusus" reveals and submits `dateFrom`/`dateTo`; "Hapus semua"
      resets all three dimensions (the empty-state clear control shares the same `clearAllFilters`
      handler, so it is covered by the same assertion)
- [x] 5.2 Ran the full monorepo suite (`npx vitest run`) and `typecheck`/`lint` on every touched
      package: 970/970 tests pass, no type errors, no lint errors. Also caught and fixed two callers
      the task list didn't anticipate: `apps/web/components/article/RelatedArticles.tsx` (still
      called `getArticles({ categorySlug })`) and its test's assertion — both updated to the new
      `categorySlugs` array shape.
- [x] 5.3 Manual check against the real local dev stack (Postgres in Docker, `apps/api` on :4000,
      `apps/web` on :3000) — browser extension wasn't available in this environment, so verified
      via the same requests a browser would make: `GET /articles?categorySlugs=qa8-football,qa8-basketball`
      returned the OR-matched set including an article tagged with both; temporarily assigning an
      article's `anak_usaha_id` and filtering by that slug returned exactly it (reverted after);
      filtering by an unrelated anak usaha slug returned 0; a 2020 `publishedAfter`/`publishedBefore`
      range correctly excluded all (newer) content. Server-rendered `/news?category=...`,
      `/news?anakUsaha=...`, and `/news?date=7d` all returned 200 with the correct chip labels
      (`Kategori QA8 Football`, `Kategori QA8 Basketball`, `Anak usaha SidersVox` — the real catalog
      name, not a hardcoded string — and `Tanggal 7 hari terakhir`). Did not click through the
      custom-range sub-form or the multi-select checkbox interactions live in a browser.
