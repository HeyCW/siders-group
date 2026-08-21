## Why

The `/news` page's filter bar has three controls — Kategori, Anak usaha, Tanggal — but only Kategori
works today, and it is single-select. Anak usaha and Tanggal are visual stubs per
`specs/web-public-site/spec.md`'s "News page category filtering is real; unsupported filters are
inert": their options render but every `onClick` is a no-op, so visitors can select them and nothing
happens. Anak usaha's options are also hardcoded display strings, not the real catalog the
`anak-usaha-management` capability already exposes publicly. This change makes all three controls
functional: Kategori and Anak usaha become multi-select (matching how each already behaves as a
many-articles-per-value catalog), and Tanggal becomes a working single-select date-range filter.

## What Changes

- **Kategori**: single-select → multi-select. `?category=slug` becomes a comma-separated multi-value
  param; selecting a second category adds to the set instead of replacing it.
- **Anak usaha**: dead stub → real multi-select filter, backed by the `anak-usaha-management`
  capability's existing public listing (`GET /anak-usaha`) instead of the hardcoded
  `SUB_BRAND_OPTIONS` list. New `?anakUsaha=slug1,slug2` URL param.
- **Tanggal**: dead stub → real single-select date-range filter with options "7 hari terakhir", "30
  hari terakhir", "Tahun ini", "Rentang khusus" (custom range, with a from/to date input). New
  `?date=` URL param (`7d` | `30d` | `year` | `custom`) plus `?dateFrom=`/`?dateTo=` for the custom
  case.
- Backend (`public-news-api`): `GET /articles` gains multi-value category filtering (currently an
  equality match, becomes a set match), a new multi-value anak usaha filter, and a new published-date
  range filter. **BREAKING**: the repository's internal `PublicListFilter.categorySlug` (singular)
  is replaced by a plural/array shape — no external contract break, since the public query param
  keeps accepting a single value as a one-element set.
- Removes the `web-public-site` requirement that Anak usaha and Tanggal have no effect on results —
  they now filter for real.

## Capabilities

### Modified Capabilities
- `public-news-api`: `GET /articles` filtering gains multi-category-slug, anak-usaha-slug, and
  published-date-range support.
- `web-public-site`: News page filter bar requirements change — Kategori and Anak usaha become
  multi-select and Anak usaha is real; Tanggal becomes a functional single-select filter.

## Impact

- **Affected specs**: `public-news-api` (MODIFIED), `web-public-site` (MODIFIED)
- **Affected code**:
  - `packages/contracts/src/article.ts` (`articlePublicListQuerySchema`: `categorySlug` gains the
    same comma-separated/repeated-array normalization `excludeIds` already uses; new
    `anakUsahaSlug` (same normalization) and `publishedAfter`/`publishedBefore` fields)
  - `apps/api/src/modules/articles/article.repository.ts` (`PublicListFilter` and `listPublished`:
    `categorySlug` → `categorySlugs: string[]` using `inArray` instead of `eq`; new
    `anakUsahaSlugs: string[]` join-filter mirroring the category subquery; new
    `publishedAfter`/`publishedBefore` range condition)
  - `apps/api/src/modules/articles/article.controller.ts` (passes the new query fields through)
  - `apps/web/lib/api.ts` (`GetArticlesParams`: `categorySlug` → `categorySlugs: string[]`, plus
    `anakUsahaSlugs`, `publishedAfter`, `publishedBefore`; add `getAnakUsahaList()` reusing
    `getCategories()`'s pattern against `GET /anak-usaha`)
  - `apps/web/app/news/page.tsx` (reads `?category=`, `?anakUsaha=`, `?date=`, `?dateFrom=`,
    `?dateTo=` as the source of truth; fetches the anak usaha list alongside categories)
  - `apps/web/components/news/NewsExplorer.tsx` (Kategori and Anak usaha become checkbox-style
    multi-select against real state; Tanggal becomes a radio-style single-select with a custom-range
    sub-form; all three drive `router.push` against the URL)
  - `apps/web/components/news/FilterTrigger.tsx` (no interface change expected; `FilterOption`
    already takes a `selected` boolean, reusable for both single- and multi-select)
- **Migration**: none — no schema change, only new query-parameter handling on an existing endpoint
