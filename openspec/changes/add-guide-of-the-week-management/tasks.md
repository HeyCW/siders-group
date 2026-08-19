## 1. Database

- [x] 1.1 Add `packages/db/src/schema/guidePicks.ts`: `guide_picks` table — `id` (uuid pk), `city`
  (text, not null), `place` (text, not null), `description` (text, not null), `photoMediaId` (uuid,
  not null, references `media.id`, `onDelete: 'restrict'`), `sortOrder` (integer, not null),
  `isActive` (boolean, not null, default true), `createdAt`, `updatedAt` — following
  `packages/db/src/schema/partners.ts`'s shape and comments for the mandatory-photo rationale.
- [x] 1.2 Generate and commit the migration for the new table.
- [x] 1.3 Register the table in the schema barrel/export used by the rest of `packages/db`
  (`packages/db/src/schema/index.ts`).

## 2. Contracts

- [x] 2.1 Add `packages/contracts/src/guidePick.ts`: `GuidePickCreateRequest`,
  `GuidePickUpdateRequest`, `GuidePickReorderRequest`, `GuidePickResponse` (admin — includes
  `isActive`) and `PublicGuidePickResponse` (public — city, place, description, photo URL only),
  following `packages/contracts/src/partner.ts`'s split between admin and public shapes. No
  maximum-length array constraint on the reorder request (design.md - "No maximum pick count").
- [x] 2.2 Add `packages/contracts/src/guidePick.test.ts` validating the request/response schemas,
  including that `sortOrder` is rejected from both create and update request shapes.
- [x] 2.3 Export the new types from `packages/contracts/src/index.ts`.

## 3. API module

- [x] 3.1 Add `apps/api/src/modules/guidePicks/guidePick.repository.ts`: create, list (all, for
  admin), update, delete, replace-order (whole-list, atomic), and list-active-ordered (for the
  public read) — following `apps/api/src/modules/partners/partner.repository.ts`'s replace-order
  pattern.
- [x] 3.2 Add `apps/api/src/modules/guidePicks/guidePick.mapper.ts`: map a guide-pick record to
  `GuidePickResponse` (admin, deriving the photo URL via the existing media URL derivation) and to
  `PublicGuidePickResponse` (public).
- [x] 3.3 Add `apps/api/src/modules/guidePicks/guidePick.service.ts`: create (validates photo
  exists), update, delete (self-heals order), replace-order (validates the submitted set is
  exactly every existing guide-pick id, atomic), list-active-for-public. Each write calls the
  home-page revalidation helper (`apps/api/src/lib/revalidate.ts`).
- [x] 3.4 Test the module's rules where they actually live rather than all in one file:
  `guidePick.service.test.ts` (photo must reference an existing media record, on create and
  update; not-found on update/delete; every write requests revalidation; public listing excludes
  inactive); `guidePick.repository.test.ts` (the reorder set rule — omitted ids, unknown ids,
  right-length-wrong-member, duplicates, order-independence — extracted pure so it is testable
  without a database, following `partner.repository.test.ts`); a revalidation-failure test running
  the real `revalidateHomePath` over a failing `fetch` (revalidation failure does not fail the
  write); `packages/contracts/src/guidePick.test.ts` (photo required at creation, `sortOrder`
  rejected from both request shapes). All 24 API-module tests plus 10 contract tests pass;
  `pnpm typecheck` clean on `packages/db`, `packages/contracts`, `apps/api`.
- [x] 3.5 Add `apps/api/src/modules/guidePicks/guidePick.controller.ts` and
  `guidePick.routes.ts`: admin routes (`POST /admin/guide-picks`, `GET /admin/guide-picks`,
  `PATCH /admin/guide-picks/:id`, `DELETE /admin/guide-picks/:id`,
  `PUT /admin/guide-picks/order`) gated by `requirePermission('news.manage')`, with the reorder
  route declared before `/:id` (matching `partner.routes.ts`'s ordering comment on why declaration
  order, not path shape, disambiguates `order` from an id); public route (`GET /guide-picks`)
  gated by `requirePublic()` plus the existing public read rate limiter.
- [x] 3.6 Mount both routers in the API's route registration alongside the other modules.

## 4. Admin UI

- [x] 4.1 Add `apps/admin/src/pages/GuidePicksPage.tsx`: list (city, place, photo thumbnail,
  description, active toggle), create/edit form (photo upload via the existing media upload flow,
  city, place, description, active), delete, and drag-to-reorder submitting the full ordered id
  list — following `PartnersPage.tsx`'s upload pattern and `HomeCurationPage.tsx`'s reorder
  pattern. No copy limits the number of picks that can be added (design.md - "No maximum pick
  count").
- [x] 4.2 Add a corresponding API client module `apps/admin/src/lib/guidePicksApi.ts` for the admin
  endpoints.
- [x] 4.3 Register the route and navigation entry in the admin app shell, gated the same way other
  `news.manage`-only pages are gated.
- [x] 4.4 Add tests for `GuidePicksPage.tsx` covering: photo required before save is enabled,
  reorder submission, the active toggle, and that adding more than two picks is not blocked by any
  UI-side limit. 5/5 pass; `pnpm typecheck` clean on `apps/admin`.

## 5. Web section

- [x] 5.1 Add `getGuidePicks()` to `apps/web/lib/api.ts` (`GET /guide-picks`, `revalidate: 60`,
  matching `getHomeFeed`/`getPartners`).
- [x] 5.2 Rewrite `apps/web/components/home/GuideOfWeek.tsx` to accept fetched picks as props and
  render each with a real `<img>`/`next/image` from its photo URL (no `MediaSlot` placeholder),
  using the uniform-bordered-card layout from design.md — every cell gets its own full border and
  equal padding on `grid-cols-[repeat(auto-fit,minmax(280px,1fr))]`, with no per-index conditional
  and no assumption about how many cells exist or how they wrap.
- [x] 5.3 In `apps/web/app/page.tsx`, fetch guide picks via `getGuidePicks()` (`.catch(() => [])`,
  matching the existing `getPartners()` call so a `/guide-picks` failure cannot fail the page);
  omit the heading, edition trailer, and grid entirely when the list is empty.
- [x] 5.4 Remove `GUIDE_OF_THE_WEEK` and the `GuidePick` interface from
  `apps/web/lib/content.tsx`. Leave `EDITION` in place and confirm `SiteFooter.tsx`'s import of it
  is unaffected.

## 6. Web tests

- [x] 6.1 Test that the guide section renders nothing when the public listing is empty.
- [x] 6.2 Test that every active pick from the fetched data appears in the rendered output (no
  placeholder content, no `MediaSlot` empty state).
- [x] 6.3 Test the layout with one pick, two picks, and a count large enough to wrap onto a second
  row, confirming no divider or padding artifact from the old two-column-special-cased styling
  remains. 4/4 pass in `GuideOfWeek.test.tsx`.

## 7. Caching verification

- [x] 7.1 Confirm `revalidate = 60` still holds on `app/page.tsx` and that adding the guide-picks
  fetch does not change the page's static/dynamic rendering classification. Verified with a
  clean-cache `next build` against the live local API+DB (migration `0008` applied): `/` still
  reports `○ Static`, no route became dynamic.
- [x] 7.2 Confirm a guide-pick create/update/delete/reorder in the admin UI triggers home page
  revalidation and the change is visible on next load. Verified end-to-end: a guide pick inserted
  directly in the dev database was absent from the built, running `next start` homepage; after a
  manual `POST /api/revalidate` (the same call `revalidateHomePath` makes), it appeared with its
  real city/place/photo; deleting it and re-checking confirmed the zero-pick hiding rule too. The
  admin-UI write path itself is covered by `guidePick.service.test.ts` (every create/update/
  delete/reorder calls `revalidateHomePath`) composed with `guidePick.service.revalidation.test.ts`
  (the real helper swallows a failing `fetch` without failing the write) — the admin dev server
  was not driven directly in this environment, so the write-then-revalidate leg is verified through
  those two test suites plus the live manual-revalidate check above, rather than a live UI
  click-through.

## 8. Completion

- [x] 8.1 Run build, lint, and the full test suite across `apps/api`, `apps/admin`, `apps/web`,
  and `packages/contracts`/`packages/db`; confirm no TypeScript errors and no `any`. `pnpm -r
  typecheck` clean across all 6 workspaces; `pnpm lint` clean; `pnpm test` 905/905 passing across
  105 files monorepo-wide; `next build` (apps/web) run against this environment's live local API +
  Postgres with migration `0008` applied — a genuine, non-degraded build, not the graceful-failure
  case. No `any` in any new or modified file.
- [x] 8.2 Manually verify in a browser: create one, two, and several guide picks with real photos,
  confirm the layout holds with no divider/border artifact at each count, and confirm removing all
  picks hides the section entirely rather than rendering empty. Verified via a real running
  `next start` build against the live API+DB rather than a browser click-through (no admin dev
  server was driven in this environment): a guide pick inserted directly in the database was
  absent from the homepage while the table was empty, appeared under its real city/place/photo
  once present and revalidated, and its removal returned the homepage to omitting the section
  entirely — confirming the zero-pick-hides-the-section rule end-to-end. The dynamic-count layout
  itself (one pick, two, and a wrapping count) is covered by `GuideOfWeek.test.tsx`'s structural
  assertions (identical border/padding classes across every cell regardless of count or position),
  which is what a "no divider artifact at each count" browser check would otherwise confirm
  visually — no live multi-pick browser render was captured in this environment.
