## 1. Database

- [x] 1.1 Add `packages/db/src/schema/partners.ts`: `partners` table — `id` (uuid pk), `name` (text, not null), `logoMediaId` (uuid, not null, references `media.id`, `onDelete: 'restrict'`), `websiteUrl` (text, not null), `sortOrder` (integer, not null), `isActive` (boolean, not null, default true), `createdAt`, `updatedAt` — following `packages/db/src/schema/reels.ts`'s shape and comments for the mandatory-logo rationale.
- [x] 1.2 Generate and commit the migration for the new table.
- [x] 1.3 Register the table in the schema barrel/export used by the rest of `packages/db`.

## 2. Contracts

- [x] 2.1 Add `packages/contracts/src/partner.ts`: `Partner`, `PartnerCreateRequest`, `PartnerUpdateRequest`, `PartnerReorderRequest`, `PartnerResponse` (admin — includes `isActive`) and `PublicPartnerResponse` (public — name, logo URL, website URL only), following `packages/contracts/src/reel.ts`'s split between admin and public shapes.
- [x] 2.2 Add `packages/contracts/src/partner.test.ts` validating the request/response schemas, including the website-URL-must-be-absolute-URL rule.
- [x] 2.3 Export the new types from `packages/contracts/src/index.ts`.

## 3. API module

- [x] 3.1 Add `apps/api/src/modules/partners/partner.repository.ts`: create, list (all, for admin), update, delete, replace-order (whole-list, atomic), and list-active-ordered (for the public read) — following `apps/api/src/modules/curation/curation.repository.ts`'s replace-order pattern.
- [x] 3.2 Add `apps/api/src/modules/partners/partner.mapper.ts`: map a partner record to `PartnerResponse` (admin, deriving the logo URL via the existing media URL derivation) and to `PublicPartnerResponse` (public).
- [x] 3.3 Add `apps/api/src/modules/partners/partner.service.ts`: create (validates logo exists), update, delete (self-heals order), replace-order (validates the submitted set is exactly every existing partner id, atomic), list-active-for-public. Each write calls the home-page revalidation helper (`apps/api/src/lib/revalidate.ts`).
- [x] 3.4 Add `apps/api/src/modules/partners/partner.service.test.ts` covering: logo required at creation, logo must reference an existing media record, website URL validation, reorder rejects missing/unknown ids, reorder is atomic, delete self-heals order, deactivating hides from public listing without altering order, revalidation failure does not fail the write.
- [x] 3.5 Add `apps/api/src/modules/partners/partner.controller.ts` and `partner.routes.ts`: admin routes (`POST /admin/partners`, `GET /admin/partners`, `PATCH /admin/partners/:id`, `DELETE /admin/partners/:id`, `PUT /admin/partners/order`) gated by `requirePermission('settings.manage')`; public route (`GET /partners`) gated by `requirePublic()` plus the existing public read rate limiter.
- [x] 3.6 Mount both routers in the API's route registration alongside the other modules.

## 4. Admin UI

- [x] 4.1 Add `apps/admin/src/pages/PartnersPage.tsx`: list (name, logo thumbnail, website URL, active toggle), create/edit form (logo upload via the existing media upload flow, name, website URL, active), delete, and drag-to-reorder submitting the full ordered id list — following `ReelLibraryPage.tsx`'s upload pattern and `HomeCurationPage.tsx`'s reorder pattern.
- [x] 4.2 Add a corresponding API client module (e.g. `apps/admin/src/lib/partnersApi.ts`) for the admin endpoints.
- [x] 4.3 Register the route and navigation entry in `apps/admin/src/App.tsx` / the app shell nav, gated the same way other `settings.manage`-only pages are gated (if the shell conditionally hides nav entries by permission).
- [x] 4.4 Add tests for `PartnersPage.tsx` covering: logo required before save is enabled, website URL validation feedback, reorder submission, and the active toggle.

## 5. Web ticker

- [x] 5.1 Add the `marquee` keyframe/animation to `apps/web/tailwind.config.ts` alongside `ruledraw`/`inkfade`/`riseIn` (`translateX(0)` → `translateX(-50%)`).
- [x] 5.2 Add `getPartners()` to `apps/web/lib/api.ts` (`GET /partners`, `revalidate: 60`, matching `getHomeFeed`/`getReels`).
- [x] 5.3 Rewrite `apps/web/components/home/PartnerGrid.tsx` as a ticker: repeat the partner list enough times that one half of the track exceeds the widest supported viewport width (not a hardcoded ×2), apply the `marquee` animation under `motion-safe:`, pause via `:hover` and `:focus-within` on the track container, `aria-hidden="true"` + `tabIndex={-1}` on every copy beyond the first, fixed row height with `object-contain` logos preserving original color (no grayscale filter).
- [x] 5.4 Add the `motion-reduce` fallback: render all active partners in the current static wrapping-grid layout instead of the ticker.
- [x] 5.5 In `apps/web/app/page.tsx`, fetch partners via `getPartners()` and pass them to `PartnerGrid`; omit the heading, rule, and ticker entirely when the list is empty.
- [x] 5.6 Remove `PARTNERS` from `apps/web/lib/content.tsx` and its now-unused import in `PartnerGrid.tsx`.

## 6. Web tests

- [x] 6.1 Test that the partner section renders nothing when the public listing is empty.
- [x] 6.2 Test that every active partner from the fetched data appears in the rendered output (no placeholder content).
- [x] 6.3 Test that duplicate (looped) copies of each partner are `aria-hidden` and their links are not tab-reachable, while the first canonical copy's links are.
- [x] 6.4 Test that the reduced-motion render path shows every partner without the `motion-safe` ticker markup.

## 7. Caching verification

- [x] 7.1 Confirm `revalidate = 60` still holds on `app/page.tsx` and that adding the partners fetch does not change the page's static/dynamic rendering classification. Verified with a clean-cache `next build` against the live local API+DB (migration `0004` applied): `/` still reports `○ Static`, no route became dynamic.
- [x] 7.2 Confirm a partner create/update/delete/reorder in the admin UI triggers home page revalidation and the change is visible on next load. Verified end-to-end: a partner inserted directly in the dev database appeared on `http://localhost:3000/` (ticker markup, `animate-marquee`, correct logo URL, correct link) on the next request, and removing it made the section disappear again. The admin-UI write path itself is covered by `partner.service.test.ts` (every create/update/delete/reorder calls `revalidateHomePath`) composed with the already-passing `lib/revalidate.test.ts` (that call reaches `/api/revalidate`); the admin dev server was not running in this environment to drive the UI directly, so the write-then-revalidate leg is verified through those two test suites rather than a live click-through.

## 8. Completion

- [x] 8.1 Run build, lint, and the full test suite across `apps/api`, `apps/admin`, `apps/web`, and `packages/contracts`/`packages/db`; confirm no TypeScript errors and no `any`. `pnpm typecheck` clean across all 6 workspaces; `eslint` clean on every new/modified file; `pnpm test` 577/577 passing across 81 files monorepo-wide (up from 547 before this change); `next build` (apps/web), `tsc -p` (apps/api), and `tsc -b && vite build` (apps/admin) all succeed. The `next build` was run against this environment's live local API + Postgres with migration `0004` applied — a genuinely clean, non-degraded build, not the graceful-failure case documented in earlier changes.
- [ ] 8.2 Manually verify in a browser: create several partners with differently-shaped logos, confirm the ticker scrolls, pauses on hover and on keyboard focus, and that reduced-motion (OS/browser setting) shows the static fallback with every partner visible.
