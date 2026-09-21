## 1. Data model

- [ ] 1.1 Add `packages/db/src/schema/hyperlocalSpotlight.ts`: table `hyperlocal_spotlight` with
      `slot` (single-permitted-value primary key, so a second row is impossible), `article_id`
      (`char(36)`, `references(() => articles.id, { onDelete: 'cascade' })`), `updated_by`
      (`references(() => users.id)`), `updated_at`. Document in the file header why this is a
      separate singleton table and not an `articles` boolean, the way `homeCuration.ts` documents
      its primary-key choice.
- [ ] 1.2 Export it from `packages/db/src/schema/index.ts`
- [ ] 1.3 Add the migration under `apps/api-laravel/database/migrations/` (the applied path — see
      `add-guide-pick-instagram-link/tasks.md` 1.2 on the stale drizzle migrations), following the
      existing create-table migrations' conventions
- [ ] 1.4 Confirm no column is added to `articles`

## 2. Contracts

- [ ] 2.1 Add `isHyperlocalSpotlight: z.boolean().optional()` to `articleWriteFieldsSchema` in
      `packages/contracts/src/article.ts`, so it flows into both
      `articleCreateRequestSchema` and `articleUpdateRequestSchema`
- [ ] 2.2 Add `isHyperlocalSpotlight: z.boolean()` to the admin article response schema
- [ ] 2.3 Leave `articleAutosaveRequestSchema` untouched — it is hand-written and narrower on
      purpose, and must stay structurally unable to move the spotlight
- [ ] 2.4 Add `packages/contracts/src/hyperlocalSpotlight.ts` with
      `hyperlocalSpotlightResponseSchema` (`{ article: summary | null, status, isPubliclyVisible }`,
      reusing `homeCurationArticleSummarySchema` and `articleStatusSchema`) and
      `publicHyperlocalSpotlightSchema` (`{ article: ArticlePublicCard | null }`)
- [ ] 2.5 Export from `packages/contracts/src/index.ts`
- [ ] 2.6 Unit tests: flag accepted on create and update, omitted flag valid, non-boolean rejected,
      autosave schema still rejects the field as an unknown key

## 3. API — spotlight storage and reads

- [ ] 3.1 Add `apps/api/src/modules/hyperlocalSpotlight/hyperlocalSpotlight.repository.ts`:
      `get()` (join to article for status/publishedAt), `set(articleId, userId, tx)` and
      `clearIfHeldBy(articleId, tx)`, all accepting the caller's transaction
- [ ] 3.2 Add `hyperlocalSpotlight.service.ts` + `hyperlocalSpotlight.mapper.ts` +
      `hyperlocalSpotlight.controller.ts` for the two reads; decide public visibility with
      `isPubliclyVisible` from `article.repository.ts` — no second visibility rule
- [ ] 3.3 Add `hyperlocalSpotlight.routes.ts`: admin `GET /admin/hyperlocal-spotlight` behind
      `requirePermission('news.manage')`, public `GET /home/hyperlocal-spotlight` behind
      `requirePublic()` + `publicReadRateLimiter`, mirroring `curation.routes.ts`. No write route.
- [ ] 3.4 Mount both in `apps/api/src/server.ts` next to the existing curation mounts

## 4. API — the flag on article writes

- [ ] 4.1 In `article.service.ts`, handle `isHyperlocalSpotlight` on create and update inside the
      existing article transaction: `true` → `set()` (which replaces the previous holder),
      `false` → `clearIfHeldBy(thisArticle)`, omitted → no spotlight write at all
- [ ] 4.2 On create, order the slot write after the article insert within the same transaction
- [ ] 4.3 Include the flag in the admin article read/mapper (`article.mapper.ts`), resolved from
      the slot, not from an article column
- [ ] 4.4 Confirm the autosave path never reaches the spotlight code

## 5. API tests

- [ ] 5.1 One test per spec scenario: set at creation, set on update, move from A to B, A otherwise
      untouched, re-save holder keeps it, unset on holder clears, unset on non-holder is a no-op,
      omitted flag leaves the slot alone
- [ ] 5.2 Atomicity: a rejected article save moves nothing; a failed slot write persists no article
      change
- [ ] 5.3 Autosave fires repeatedly on the holder and the slot is unchanged
- [ ] 5.4 Status behavior: draft/scheduled held but absent publicly, scheduled goes live at its
      time, unpublish hides publicly without releasing the slot
- [ ] 5.5 Article hard-delete cascades the slot empty; concurrent spotlight saves both succeed
- [ ] 5.6 Curated-list independence both ways, including both holding the same article

## 6. Admin UI

- [ ] 6.1 Add the spotlight read to `apps/admin/src/lib/articlesApi.ts` (or a small
      `hyperlocalSpotlightApi.ts`), typed off `@siders/contracts`
- [ ] 6.2 Add a "Spotlight as hyperlocal story" checkbox to `ArticleEditPage.tsx` beside the
      existing SEO/metadata fields, bound to `isHyperlocalSpotlight` on explicit save only —
      never in the autosave payload built around line 120
- [ ] 6.3 Same checkbox in `NewArticlePage.tsx` for create
- [ ] 6.4 Next to the checkbox, show the current holder: "Currently: <title>" when another article
      holds it, "Currently: none" when empty, and a set state when this article holds it — so
      taking the spotlight names what it displaces
- [ ] 6.5 Tests: checkbox reflects held/not-held/empty, names the other holder, sets on create,
      sets on update, clears on update, is absent from autosave payloads, and a rejected save
      leaves the displayed state unchanged

## 7. Public web page

- [ ] 7.1 Add `apps/web/src/components/home/HyperlocalSpotlight.tsx` — single-article section,
      returns `null` when there is no article (same guard style as `GuideOfWeek.tsx`)
- [ ] 7.2 Add the public fetch to `apps/web/src/lib/api.ts` and call it from `HomePage.tsx`
      alongside the existing guide-pick/partner loads, rendering the section above `Showcase`
- [ ] 7.3 Failed or empty spotlight read leaves every other section rendering — no thrown error, no
      placeholder
- [ ] 7.4 Tests: renders a filled spotlight, renders nothing when empty, renders nothing when the
      read fails

## 8. Verification

- [ ] 8.1 `pnpm build`, `pnpm lint`, `pnpm test` clean, no TypeScript errors
- [ ] 8.2 Walk it in the running app: spotlight a draft (absent publicly, checkbox set in admin),
      publish it (appears with no second write), spotlight another article (first one silently
      loses it, nothing else about it changes), delete the holder (slot empties)
