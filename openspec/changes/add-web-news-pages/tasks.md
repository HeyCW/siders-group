## 0. Prerequisites

All satisfied on `main` today; recorded here for traceability rather than as an open gate.

- [x] 0.1 Confirm `public-news-api`, `home-curation`, `reels-curation`, `category-management` are implemented and archived (`openspec/specs/{public-news-api,home-curation,reels-curation,category-management}/spec.md` all exist as real specs, not deltas)
- [x] 0.2 Confirm `buildReelEmbedUrl` and `PublicReelItem` are exported from `@siders/contracts` (`packages/contracts/src/index.ts`)
- [x] 0.3 Confirm `NEXT_PUBLIC_API_URL` and `env.APP_ORIGIN` (API-side CORS) are documented for local dev (`docs/ARCHITECTURE.md` §10) — no code change, just confirm the local `.env` a developer needs is written down somewhere reachable

## 1. Tailwind + visual tokens

- [x] 1.1 Add `tailwindcss`, `postcss`, `autoprefixer` to `apps/web/package.json` devDependencies, matching the versions `apps/admin` already pins
- [x] 1.2 Add `apps/web/tailwind.config.ts` with the `paper`/`ink`/`signal`/`rule`/`rule-strong`/`muted` color tokens, `serif`/`sans` font families, and `borderRadius: { DEFAULT: '2px' }`
- [x] 1.3 Add `apps/web/postcss.config.js` (mirrors `apps/admin`'s)
- [x] 1.4 Add `apps/web/app/globals.css` with the Tailwind directives, the `Source Serif 4` / `Libre Franklin` font loading (implemented via `next/font/google` in `app/layout.tsx` rather than a `<link>` tag — self-hosted at build time, same visual result, no runtime dependency on Google's CDN), and the prototype's global resets (`::selection`, link hover-to-signal, no-scrollbar utility for the Reels rail)
- [x] 1.5 Wire `globals.css` into `apps/web/app/layout.tsx`
- [x] 1.6 Spot-check one static page against the prototype's computed styles — verified via a successful `next build` production compile and manual review of the generated Tailwind classes against the prototype's inline styles (paper/ink/signal tokens, clamp() spacing, rule weights); **not** verified against a live browser screenshot — no running `apps/api`/database was available in this environment to render real content against, and a byte-for-byte pixel diff was out of scope for this pass

## 2. API client

- [x] 2.1 Add `@siders/contracts` as a real dependency of `apps/web/package.json` (`workspace:^`, matching `apps/admin`'s reference)
- [x] 2.2 Add `apps/web/lib/env.ts` reading `NEXT_PUBLIC_API_URL`, throwing a clear error at import time if unset
- [x] 2.3 Add `apps/web/lib/api.ts`: `apiFetch<T>(path, init)` — no credentials, parses the `{ success, data }` / `{ success: false, error }` envelope, throws `ApiError` (message, status, code) on failure or non-2xx
- [x] 2.4 Add typed wrapper functions per endpoint used: `getHomeFeed`, `getArticles`, `getArticleBySlug`, `getCategories`, `getReels` — each returning `@siders/contracts` types
- [x] 2.5 Unit test `apiFetch`'s envelope parsing and error mapping against a mocked `fetch` (success, `success:false` body, non-2xx with no parseable body) — `lib/api.test.ts`

## 3. Shared layout

- [x] 3.1 Build the masthead: sticky top nav (`StickyNav`, hidden until `scrollY > 240` per the prototype's own threshold) + the large rule-bordered masthead header (`SiteHeader`), matching the prototype's rule weights (1px/3px) and the `ruledraw` scale-in animation
- [x] 3.2 Build the footer (`SiteFooter`): wordmark + description column, page-links column, Anak Usaha column (four static sub-brand names linking to `/news`), redaksi column (static address/email/phone/social), colophon row
- [x] 3.3 Wrap both in `apps/web/app/layout.tsx` so every route gets them without per-page duplication
- [x] 3.4 Active-route styling on the nav (`NavLinks`, via `usePathname()`, highlighting News for both `/news` and `/news/[slug]`)

## 4. `/contact`

- [x] 4.1 Static get-in-touch blocks: address, WhatsApp, email
- [x] 4.2 Sub-brand "Follow our sub-brands" links row
- [x] 4.3 Message form (`ContactForm`): name/organisation/email/subject/message fields, client-side required + email-shape validation, inline error state on blur
- [x] 4.4 Submit handler shows "Sending isn't wired up yet — email karyasiders@gmail.com directly" rather than a fake success toast
- [x] 4.5 Map image slot rendered as a static labeled placeholder (`MediaSlot`), no `<image-slot>` custom element
- [x] 4.6 No `revalidate` export; page has no dynamic fetch

## 5. `/news/[slug]`

- [x] 5.1 Server Component calling `getArticleBySlug(params.slug)`; `notFound()` on a 404-coded `ApiError`
- [x] 5.2 Kicker (first category + published date), title, byline ("Oleh {authorName} · {N} menit baca" — read time is computed from the real `bodyHtml` word count via `estimateReadMinutes`, not the prototype's fixed "6 menit baca"), lead image via `MediaSlot`
- [x] 5.3 `bodyHtml` rendered with a drop-cap on the first paragraph via `.article-body > p:first-of-type::first-letter` in `globals.css` (a wrapper-level Tailwind `first-letter:` utility cannot reach a nested `<p>`, so this needed a real CSS rule rather than a utility class)
- [x] 5.4 Related rail (`RelatedArticles`): `getArticles({ categorySlug, excludeIds: [article.id], limit: 5 })`, omitted entirely when the article has no categories
- [x] 5.5 Engagement bar (`EngagementBar`): static like/comment/share markup, comment input `disabled`
- [x] 5.6 Confirmed no comment/like/share count is hardcoded from the prototype's sample numbers — `EngagementBar` renders "No comments yet" and a disabled Like button, no numbers anywhere
- [x] 5.7 `export const revalidate = 60;`
- [x] 5.8 `generateMetadata` from `seoTitle`/`seoDescription`/`title`/`excerpt`/`featuredImageUrl`

## 6. `/news`

- [x] 6.1 Server Component reading `searchParams.category`
- [x] 6.2 `getCategories()` for the Kategori popover + `getArticles({ categorySlug, limit: 6, offset: 0 })` for the initial page
- [x] 6.3 Kategori popover: single-select, `router.push('/news?category=<slug>')` / `router.push('/news')` to clear — real navigation, shareable
- [x] 6.4 Anak usaha, Tanggal, Urutkan: full prototype styling, inert (`FilterTrigger`/`FilterOption` with no-op `onClick`s)
- [x] 6.5 Search input: debounce-free `useState` + `.filter()` over the currently-loaded `articles` array (fast enough at this list size that a debounce added complexity without a measurable benefit); placeholder reads "Search this page…"
- [x] 6.6 Active-filter chip for the selected category with a clearing ×; "Hapus semua" shown when any filter (category or search) is active
- [x] 6.7 Result count reflects `searchFiltered.length` — no fabricated total
- [x] 6.8 Featured-article band: first article of the unfiltered set, shown only when no filters are active
- [x] 6.9 Article grid: remaining articles (`ArticleCard`, reused by the homepage Showcase too)
- [x] 6.10 Empty state with a "Hapus semua filter" action
- [x] 6.11 Load-more: fetches the next page via `offset`, appends, hides itself once a fetch returns fewer than `PAGE_SIZE` (6, matching the prototype's `perLoad` default)
- [x] 6.12 No `revalidate` export

## 7. `/`

- [x] 7.1 Server Component; `export const revalidate = 60;`
- [x] 7.2 Hero manifesto (`Hero`) + three-column intro blurb with drop-cap (`IntroBlurb`) — static content, authored in `lib/content.tsx`
- [x] 7.3 Stats band (`StatsBand`) — static numbers, not wired to any analytics endpoint
- [x] 7.4 "Siders Guide of the Week" (`GuideOfWeek`) — static two-up content
- [x] 7.5 "SidersVox — News & Community" showcase (`Showcase`): `getHomeFeed(3)`, real article cards
- [x] 7.6 Reels rail (`ReelsRail`): `getReels()`, posters only on initial render, no iframe until activation
- [x] 7.7 Reels lightbox (same component, `active` state): exactly one `<iframe src={buildReelEmbedUrl(...)}>` on activation, unmounted on close; a second activation replaces rather than adds
- [x] 7.8 Anak Usaha tile row (`AnakUsahaTiles`) — static, per-brand tile colors from the approved design, links to `/news`
- [x] 7.9 Partner grid (`PartnerGrid`) — static placeholder tiles ('Brand' × 12, matching the prototype's own placeholder precedent)
- [x] 7.10 Closing CTA band (`CtaBand`) — static copy + underlined editorial-style links to `/contact` and `/news`

## 8. Tests

- [x] 8.1 `lib/api.test.ts` — envelope parsing, error mapping
- [x] 8.2 `components/news/NewsExplorer.test.tsx` — Kategori filter navigation sets/clears `?category`
- [x] 8.3 `components/news/NewsExplorer.test.tsx` — load-more appends and hides itself at the end of the list
- [x] 8.4 `components/news/NewsExplorer.test.tsx` — client-side search filters the currently-loaded set without a new fetch (asserted via a mocked `getArticles` never being called)
- [x] 8.5 `components/home/ReelsRail.test.tsx` — mounts exactly one iframe on activation and none before it; a second activation replaces rather than adds; closing unmounts
- [x] 8.6 `components/contact/ContactForm.test.tsx` — rejects a blank required field and a malformed email before reaching the inert-submit state
- [x] 8.7 `components/article/RelatedArticles.test.tsx` — no categorySlug renders nothing (and makes no fetch); an empty result also renders nothing

## 9. Verification

- [x] 9.1 `build`, `lint` (root `eslint .`), `typecheck` (root `pnpm typecheck`, all 6 typechecked packages), and the full workspace test suite (`vitest run` at the repo root: 74 files / 525 tests, including this change's 21) all pass with no TypeScript errors
- [ ] 9.2 Manual verification of all four routes against a local `apps/api` with seeded categories/articles/reels/curation, comparing computed styles against the prototype at a handful of breakpoints — **not done**: no running Postgres/`apps/api` was available in this environment. `next build` was confirmed to fully succeed (all routes compile and prerender) against a throwaway mock HTTP server standing in for the API, which validates the code paths but is not a real-data visual check
- [x] 9.3 Verified zero iframes exist before Reels activation and exactly one after, via `components/home/ReelsRail.test.tsx`'s DOM assertions (`document.querySelectorAll('iframe')`) — a live browser network-tab check was not performed for the same reason as 9.2
- [ ] 9.4 Verify `/news?category=<slug>` is a shareable, reloadable URL — **not done** live (no running server); covered at the unit level by 8.2 asserting the exact `router.push` target, and by `/news`'s Server Component reading `searchParams.category` directly (no client-only state holds the filter)
- [x] 9.5 Verified by code review: no prototype sample content (article titles, comment authors/counts, share counts, "128 stories", "1.3k Likes") appears anywhere in the shipped components — greped for the prototype's literal sample strings and found none outside `lib/content.tsx`'s deliberately-static editorial copy (manifesto, stats, Guide of the Week, footer)
