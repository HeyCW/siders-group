## 1. Data model

- [ ] 1.1 Add `packages/db/src/schema/hyperlocalSpotlight.ts`: table `hyperlocal_spotlight` with
      `slot` (single-permitted-value primary key, so a second row is impossible), `article_id`
      (`char(36)`, `references(() => articles.id, { onDelete: 'cascade' })`), `updated_by`
      (`references(() => users.id)`), `updated_at`. Document the singleton reasoning in the file
      header comment, the way `homeCuration.ts` documents its primary-key choice.
- [ ] 1.2 Export it from `packages/db/src/schema/index.ts`
- [ ] 1.3 Add the migration under `apps/api-laravel/database/migrations/` (the applied path — see
      `add-guide-pick-instagram-link/tasks.md` 1.2 on the stale drizzle migrations), following the
      existing create-table migrations' conventions

## 2. Contracts

- [ ] 2.1 Add `packages/contracts/src/hyperlocalSpotlight.ts` with
      `hyperlocalSpotlightReplaceRequestSchema` = `{ articleId: z.string().uuid().nullable() }`,
      `.strict()` — `null` is the explicit clear, an absent key is rejected
- [ ] 2.2 Add `hyperlocalSpotlightResponseSchema`: `{ article: summary | null, status, isPubliclyVisible }`,
      reusing `homeCurationArticleSummarySchema` and `articleStatusSchema` rather than redeclaring
      the summary shape
- [ ] 2.3 Add `publicHyperlocalSpotlightSchema`: `{ article: ArticlePublicCard | null }`
- [ ] 2.4 Export from `packages/contracts/src/index.ts`
- [ ] 2.5 Unit tests: uuid accepted, explicit `null` accepted, missing key rejected, unknown key
      rejected, non-uuid string rejected

## 3. API

- [ ] 3.1 Add `apps/api/src/modules/hyperlocalSpotlight/hyperlocalSpotlight.repository.ts`:
      `get()` (join to article for status/publishedAt) and `replace(articleId | null, userId)` as a
      single atomic upsert/delete on the singleton row
- [ ] 3.2 Add `hyperlocalSpotlight.service.ts`: rejects an unknown article id with the existing
      `AppError` subclass used for the same case in `curation.service.ts`; decides public
      visibility with `isPubliclyVisible` from `article.repository.ts` — no second visibility rule
- [ ] 3.3 Add `hyperlocalSpotlight.mapper.ts` (admin response + public card via `toPublicCard`)
      and `hyperlocalSpotlight.controller.ts`
- [ ] 3.4 Add `hyperlocalSpotlight.routes.ts`: `GET`/`PUT` at `/admin/hyperlocal-spotlight` behind
      `requirePermission('news.manage')`, and public `GET /home/hyperlocal-spotlight` behind
      `requirePublic()` + `publicReadRateLimiter`, mirroring `curation.routes.ts`
- [ ] 3.5 Mount both in `apps/api/src/server.ts` next to the existing curation mounts
- [ ] 3.6 Service/repository tests, one per spec scenario: set, replace, clear, re-submit current
      pick, unknown id rejected leaves slot unchanged, draft/scheduled stored but absent from the
      public read, scheduled becomes visible at its time, unpublish hides without clearing, article
      delete cascades the slot empty, concurrent writes both succeed
- [ ] 3.7 Test that replacing the curated home list leaves the spotlight untouched and vice versa,
      and that both may hold the same article

## 4. Admin UI

- [ ] 4.1 Add `apps/admin/src/lib/hyperlocalSpotlightApi.ts` (get + replace), typed off
      `@siders/contracts`, matching `curationApi.ts`
- [ ] 4.2 Add a "Hyperlocal Spotlight" panel to `HomeCurationPage.tsx`: current pick with its
      not-yet-live badge (reuse `articleStatusStyles.ts`), an article picker reusing the page's
      existing search/select, and a Clear action
- [ ] 4.3 Make the empty slot an ordinary state in the UI — no error styling, a plain "No article
      spotlighted" line
- [ ] 4.4 Tests in `HomeCurationPage.test.tsx`: renders current pick, sets a pick, replaces a pick,
      clears to empty, badges a draft pick as not live, surfaces a rejected write without losing
      the displayed pick

## 5. Public web page

- [ ] 5.1 Add `apps/web/src/components/home/HyperlocalSpotlight.tsx` — single-article section,
      returns `null` when there is no article (same guard style as `GuideOfWeek.tsx`)
- [ ] 5.2 Add the public fetch to `apps/web/src/lib/api.ts` and call it from `HomePage.tsx`
      alongside the existing guide-pick/partner loads, rendering the section above `Showcase`
- [ ] 5.3 Failed or empty spotlight read leaves every other section rendering — no thrown error, no
      placeholder
- [ ] 5.4 Tests: renders a filled spotlight, renders nothing when empty, renders nothing when the
      read fails

## 6. Verification

- [ ] 6.1 `pnpm build`, `pnpm lint`, `pnpm test` clean, no TypeScript errors
- [ ] 6.2 Walk each spec scenario against the running app: spotlight a draft (absent publicly,
      visible in admin), publish it (appears with no second write), delete it (slot empties)
