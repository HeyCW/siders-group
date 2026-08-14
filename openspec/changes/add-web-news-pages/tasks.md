## 0. Prerequisites

All satisfied on `main` today; recorded here for traceability rather than as an open gate.

- [ ] 0.1 Confirm `public-news-api`, `home-curation`, `reels-curation`, `category-management` are implemented and archived (`openspec/specs/{public-news-api,home-curation,reels-curation,category-management}/spec.md` all exist as real specs, not deltas)
- [ ] 0.2 Confirm `buildReelEmbedUrl` and `PublicReelItem` are exported from `@siders/contracts` (`packages/contracts/src/index.ts`)
- [ ] 0.3 Confirm `NEXT_PUBLIC_API_URL` and `env.APP_ORIGIN` (API-side CORS) are documented for local dev (`docs/ARCHITECTURE.md` §10) — no code change, just confirm the local `.env` a developer needs is written down somewhere reachable

## 1. Tailwind + visual tokens

- [ ] 1.1 Add `tailwindcss`, `postcss`, `autoprefixer` to `apps/web/package.json` devDependencies, matching the versions `apps/admin` already pins
- [ ] 1.2 Add `apps/web/tailwind.config.ts` with the `paper`/`ink`/`signal`/`rule`/`rule-strong`/`muted` color tokens, `serif`/`sans` font families, and `borderRadius: { DEFAULT: '2px' }`
- [ ] 1.3 Add `apps/web/postcss.config.js` (mirrors `apps/admin`'s)
- [ ] 1.4 Add `apps/web/app/globals.css` with the Tailwind directives, the `Source Serif 4` / `Libre Franklin` `@font-face`/Google Fonts import (matching the prototype's exact weight ranges), and the prototype's global resets (`::selection`, link hover-to-signal, no-scrollbar utility for the Reels rail)
- [ ] 1.5 Wire `globals.css` into `apps/web/app/layout.tsx`
- [ ] 1.6 Spot-check one static page against the prototype's computed styles (paper background, ink text, signal selection color) before building anything data-driven on top

## 2. API client

- [ ] 2.1 Add `@siders/contracts` as a real dependency of `apps/web/package.json` (`workspace:^`, matching `apps/admin`'s reference)
- [ ] 2.2 Add `apps/web/lib/env.ts` reading `NEXT_PUBLIC_API_URL`, throwing a clear error at import time if unset (fail loud, not with a silently-broken fetch base)
- [ ] 2.3 Add `apps/web/lib/api.ts`: `apiFetch<T>(path, init)` — no credentials, parses the `{ success, data }` / `{ success: false, error }` envelope, throws `ApiError` (message, status, code) on failure or non-2xx
- [ ] 2.4 Add typed wrapper functions per endpoint used: `getHomeFeed(limit?)`, `getArticles({ categorySlug?, limit?, offset?, excludeIds? })`, `getArticleBySlug(slug)`, `getCategories()`, `getReels()` — each returning `@siders/contracts` types, no hand-duplicated shapes
- [ ] 2.5 Unit test `apiFetch`'s envelope parsing and error mapping against a mocked `fetch` (success, `success:false` body, non-2xx with no parseable body)

## 3. Shared layout

- [ ] 3.1 Build the masthead: sticky top nav (SIDERS wordmark, Home/News/Contact links) + the large rule-bordered masthead header, matching the prototype's rule weights (1px/3px) and the `ruledraw` transform-scale-in treatment
- [ ] 3.2 Build the footer: wordmark + description column, page-links column, Anak Usaha column (four static sub-brand names linking to `/news` — see `design.md`, no per-sub-brand page exists), redaksi column (static address/email/phone/social), colophon row (company name, edition string, copyright)
- [ ] 3.3 Wrap both in `apps/web/app/layout.tsx` so every route gets them without per-page duplication
- [ ] 3.4 Confirm active-route styling on the nav (current page indicated, matching the prototype's `bg` swap on the active nav item)

## 4. `/contact`

- [ ] 4.1 Static get-in-touch blocks: address, WhatsApp, email — content as static strings (no CMS field for these exists; same treatment as the footer's redaksi block)
- [ ] 4.2 Sub-brand "Follow our sub-brands" links row — static, same links as the footer's Anak Usaha column
- [ ] 4.3 Message form: name/organisation/email/subject/message fields with the prototype's underline-input styling, client-side required + email-shape validation, inline error state on blur
- [ ] 4.4 Submit handler shows "Sending isn't wired up yet — email karyasiders@gmail.com directly" rather than a fake success toast or a silent no-op (`design.md` — "Contact form: client-side validation, honest non-submission")
- [ ] 4.5 Map image slot rendered as a static placeholder image (no `<image-slot>` custom element — that's Claude Design's own editor tooling, per `proposal.md` — Non-Goals)
- [ ] 4.6 No `revalidate` export; confirm the page has no dynamic fetch and builds fully static

## 5. `/news/[slug]`

- [ ] 5.1 Replace the stub with a Server Component calling `getArticleBySlug(params.slug)`; `notFound()` on a 404-coded `ApiError`
- [ ] 5.2 Render kicker (first category name), title, byline ("Oleh {authorName}"), lead image (`featuredImageUrl`, with a static fallback for articles that have none, per `articlePublicCardSchema` allowing a null)
- [ ] 5.3 Render `bodyHtml` with the drop-cap treatment on the first paragraph's first letter (CSS `::first-letter`, not a manual string-split — `bodyHtml` is server-sanitized HTML and should not be parsed client-side)
- [ ] 5.4 Related rail: `getArticles({ categorySlug: article's first category's slug, excludeIds: [article.id], limit: 5 })`; omit the rail entirely if the article has no categories (`design.md` — "Article detail")
- [ ] 5.5 Engagement bar: static like/comment-count/share-count markup, no real counts (see 5.6), comment input visually present but disabled with an explanatory caption
- [ ] 5.6 Confirm no comment count, like count, or share count is hardcoded from the prototype's sample numbers ("55 Comments," "960 Shares") anywhere in the shipped component
- [ ] 5.7 `export const revalidate = 60;`
- [ ] 5.8 Set page metadata (title, OG tags) from the article's `seoTitle`/`seoDescription`/`title`/`featuredImageUrl`, falling back to `title`/`excerpt` when SEO fields are null

## 6. `/news`

- [ ] 6.1 Replace the stub with a Server Component reading `searchParams.category`
- [ ] 6.2 Fetch `getCategories()` for the Kategori popover's option list and `getArticles({ categorySlug: searchParams.category, limit, offset: 0 })` for the initial page
- [ ] 6.3 Kategori popover: single-select (despite the prototype's multi-select styling — `design.md` — "`/news`'s filters"), selecting an option navigates to `?category=<slug>` (real navigation, so results are shareable per `docs/ARCHITECTURE.md` §8.1), a "Reset" clears the param
- [ ] 6.4 Anak usaha, Tanggal, Urutkan popovers: full prototype styling, `onClick` no-ops, each with a one-line comment citing `proposal.md` — Non-Goals
- [ ] 6.5 Search input: Client Component, debounced, `.filter()`s the currently-loaded articles by title/excerpt substring match; placeholder text reads "Search this page…"
- [ ] 6.6 Active-filter chip for the selected category (with an × that clears `?category`); "Hapus semua" only shown when a category is selected
- [ ] 6.7 Result count line reflects the count of articles fetched so far (no server-reported total exists)
- [ ] 6.8 Featured-article band: the first article of the current result set, full-width treatment per the prototype
- [ ] 6.9 Article grid: remaining articles, prototype's grid/border treatment
- [ ] 6.10 Empty state: shown when the fetched page (after client-side search) has zero articles, with a "Hapus semua filter" action that clears `?category`
- [ ] 6.11 Load-more: Client Component wrapping the list, advances `offset` by the page size (`perLoad`, default 6 per the prototype's own prop), appends results, hides itself when a fetch returns fewer than the page size
- [ ] 6.12 No `revalidate` export — server-rendered per request, matching `docs/ARCHITECTURE.md` §8.1

## 7. `/`

- [ ] 7.1 Replace the stub with a Server Component; `export const revalidate = 60;`
- [ ] 7.2 Hero manifesto copy + three-column intro blurb: static content, authored directly in the component (no data source — `design.md`/`proposal.md` — Non-Goals treats this as editorial copy, same category as the stats band)
- [ ] 7.3 Stats band: static numbers (500+/450+/100.000.000+), explicitly not wired to `apps/api/src/modules/analytics` (admin-only, no public traffic endpoint exists)
- [ ] 7.4 "Siders Guide of the Week": static two-up content (Surabaya/Jakarta place cards) — no backend entity fits this shape (`proposal.md` — Non-Goals)
- [ ] 7.5 "SidersVox — News & Community" showcase: `getHomeFeed(limit: 3)` (or slice the first 3 of a larger fetch shared with other sections — decide during implementation whichever avoids a duplicate request), real article cards
- [ ] 7.6 Reels rail: `getReels()`, horizontal-scroll rail rendering each item's `posterUrl` with a "PLAY" badge, no `<iframe>` created on initial render (`reels-curation/spec.md` — "Third-party embeds load only on user activation")
- [ ] 7.7 Reels lightbox: Client Component, opens on poster click, creates exactly one `<iframe src={buildReelEmbedUrl(item.provider, item.externalId)}>` for the activated reel, unmounts it on close; activating a second reel never leaves the first one's frame mounted
- [ ] 7.8 Anak Usaha tile row: static four-tile grid (dark/light tile treatment per sub-brand, matching the prototype's `tile`/`tileInk` per-brand styling), links point at `/news` (`proposal.md` — Non-Goals: no per-sub-brand page exists)
- [ ] 7.9 Partner grid: static placeholder tiles (name-as-text, matching the prototype's own placeholder-tile precedent per `chats/chat1.md`)
- [ ] 7.10 Closing CTA band: static copy + editorial-style links to `/contact` and `/news` (not styled as buttons, per `chats/chat1.md`'s "i dont like the hubungi kami button in bottom" → underlined text links)

## 8. Tests

- [ ] 8.1 `apps/web/lib/api.test.ts` — envelope parsing, error mapping (task 2.5)
- [ ] 8.2 Component test: Kategori filter navigation sets/clears `?category` correctly
- [ ] 8.3 Component test: load-more appends results and hides itself at the end of the list
- [ ] 8.4 Component test: client-side search filters the currently-loaded set without issuing a new fetch
- [ ] 8.5 Component test: Reels lightbox mounts exactly one iframe on activation and none before it; a second activation doesn't leave the first mounted
- [ ] 8.6 Component test: contact form rejects an invalid email and a blank required field before ever reaching the inert-submit handler
- [ ] 8.7 Component test: an article with no categories renders with no Related rail rather than an empty one

## 9. Verification

- [ ] 9.1 Run build, lint, typecheck, and the full test suite across `apps/web` with no TypeScript errors
- [ ] 9.2 Manually verify all four routes against a local `apps/api` with seeded categories/articles/reels/curation, comparing computed styles (colors, rule weights, spacing) against the prototype at a handful of key breakpoints
- [ ] 9.3 Verify network tab shows zero requests to any reels provider before activating a reel, and exactly one iframe request after activating one
- [ ] 9.4 Verify `/news?category=<slug>` is a shareable URL — reload the URL directly and confirm the same filtered result renders
- [ ] 9.5 Verify no prototype sample content (article titles, comment authors/counts, share counts) appears anywhere in the shipped pages
