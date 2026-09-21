## 1. Data model

- [ ] 1.1 Add `packages/db/src/schema/hyperlocalSpotlight.ts`: table `hyperlocal_spotlight` with
      `slot` (single-permitted-value primary key, so a second row is impossible), **nullable**
      `article_id` (`char(36)`, `references(() => articles.id, { onDelete: 'set null' })`),
      nullable `updated_by` (`references(() => users.id)`), `updated_at`. Document in the file
      header (a) why this is a separate singleton table and not an `articles` boolean, and (b) why
      the FK is `SET NULL` and not `CASCADE` as `homeCuration.ts` uses — the row is the slot, not
      the pick, so it must outlive any article.
- [ ] 1.2 Export it from `packages/db/src/schema/index.ts`
- [ ] 1.3 Add the migration under `apps/api-laravel/database/migrations/` (the applied path — see
      `add-guide-pick-instagram-link/tasks.md` 1.2 on the stale drizzle migrations), following the
      existing create-table migrations' conventions
- [ ] 1.4 Seed the one row in that same migration (`slot = 'default'`, `article_id = NULL`), so no
      code path ever has to create it
- [ ] 1.5 Confirm no column is added to `articles`

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
      `get()` (left join to article for status/publishedAt) and `set(articleId | null, userId, tx)`
      — one `UPDATE` of the single row, no upsert and no delete path. Add
      `clearIfHeldBy(articleId, tx)` as the same `UPDATE` guarded by `WHERE article_id = ?`. Both
      accept the caller's transaction. `get()` treats a missing row exactly as a null reference
      rather than throwing, so a database restored without the seed degrades to the fallback.
- [ ] 3.2 Add `hyperlocalSpotlight.service.ts` + `hyperlocalSpotlight.mapper.ts` +
      `hyperlocalSpotlight.controller.ts` for the two reads. Resolution order: editor pick when
      stored *and* publicly visible, else the newest published article via the existing
      `articleRepository.listPublished({ limit: 1 })` — the same newest-first, same-visibility
      query the home feed backfills with. Decide visibility with `isPubliclyVisible` from
      `article.repository.ts` — no second visibility rule, no second definition of "newest".
- [ ] 3.2a Never write the fallback into the slot — a null `article_id` resolves to the newest
      article on the very next read, so a newly published article takes over with no write. Both
      read shapes carry `isEditorPick` so admin and web can tell a chosen pick from an automatic
      one.
- [ ] 3.3 Add `hyperlocalSpotlight.routes.ts`: admin `GET /admin/hyperlocal-spotlight` behind
      `requirePermission('news.manage')`, public `GET /home/hyperlocal-spotlight` behind
      `requirePublic()` + `publicReadRateLimiter`, mirroring `curation.routes.ts`. No write route.
- [ ] 3.4 Mount both in `apps/api/src/server.ts` next to the existing curation mounts

## 4. API — the flag on article writes

- [ ] 4.1 In `article.service.ts`, handle `isHyperlocalSpotlight` on create and update inside the
      existing article transaction: `true` → `set()` (which replaces the previous pick),
      `false` → `clearIfHeldBy(thisArticle)`, which nulls the reference and lets the fallback take
      over on the next read — no compensating write; omitted → no spotlight write at all
- [ ] 4.2 On create, order the slot write after the article insert within the same transaction
- [ ] 4.3 Include the flag in the admin article read/mapper (`article.mapper.ts`), resolved from
      the slot, not from an article column
- [ ] 4.4 Confirm the autosave path never reaches the spotlight code

## 5. API tests

- [ ] 5.1 One test per spec scenario: set at creation, set on update, move from A to B, A otherwise
      untouched, re-save pick keeps it, unset on the pick releases it, unset on a non-pick is a
      no-op, omitted flag leaves the slot alone
- [ ] 5.2 Atomicity: a rejected article save moves nothing; a failed slot write persists no article
      change
- [ ] 5.3 Autosave fires repeatedly on the holder and the slot is unchanged
- [ ] 5.4 Fallback resolution: no pick resolves to the newest published article; publishing a newer
      article moves the fallback with no write; an editor pick outranks a newer article; releasing
      a pick hands the spotlight to the newest article and does not freeze it; no published
      articles at all resolves to nothing without erroring
- [ ] 5.5 Status behavior: a draft/scheduled pick is held while the public read shows the fallback,
      the pick takes over at its scheduled time, unpublishing returns the public spotlight to the
      fallback without releasing the pick
- [ ] 5.6 Article hard-delete nulls the reference (the slot row survives — assert it still exists)
      and the spotlight continues on the newest article; concurrent spotlight saves both succeed
- [ ] 5.6a Set → release → set again touches the same row throughout, and a read with the row
      missing entirely resolves to the fallback instead of erroring
- [ ] 5.7 Curated-list independence both ways, including both holding the same article

## 6. Admin UI

- [ ] 6.1 Add the spotlight read to `apps/admin/src/lib/articlesApi.ts` (or a small
      `hyperlocalSpotlightApi.ts`), typed off `@siders/contracts`
- [ ] 6.2 Add a "Spotlight as hyperlocal story" checkbox to `ArticleEditPage.tsx` beside the
      existing SEO/metadata fields, bound to `isHyperlocalSpotlight` on explicit save only —
      never in the autosave payload built around line 120
- [ ] 6.3 Same checkbox in `NewArticlePage.tsx` for create
- [ ] 6.4 Next to the checkbox, show what the spotlight currently shows and where it came from:
      "Currently: <title>" for another article's editor pick, "Currently: <title> — automatic,
      newest article" when no pick is stored, and a set state when this article is the pick — so
      taking the spotlight names what it displaces
- [ ] 6.5 When the box is unchecked on the article that holds it, state that the spotlight returns
      to the newest published article — never wording that implies the section goes blank
- [ ] 6.6 Tests: checkbox reflects pick/not-pick, names the other pick, distinguishes fallback from
      editor pick, sets on create, sets on update, releases on update, is absent from autosave
      payloads, and a rejected save leaves the displayed state unchanged

## 7. Public web page

- [ ] 7.1 Add `apps/web/src/components/home/HyperlocalSpotlight.tsx` — single-article section,
      returns `null` only when the read resolved no article at all (same guard style as
      `GuideOfWeek.tsx`). A fallback article renders identically to an editor pick — `isEditorPick`
      is not surfaced to readers.
- [ ] 7.2 Add the public fetch to `apps/web/src/lib/api.ts` and call it from `HomePage.tsx`
      alongside the existing guide-pick/partner loads, rendering the section above `Showcase`
- [ ] 7.3 Failed or empty spotlight read leaves every other section rendering — no thrown error, no
      placeholder
- [ ] 7.4 Tests: renders an editor pick, renders a fallback article identically, renders nothing
      when no article resolves, renders nothing when the read fails

## 8. Verification

- [ ] 8.1 `pnpm build`, `pnpm lint`, `pnpm test` clean, no TypeScript errors
- [ ] 8.2 Walk it in the running app: spotlight a draft (public section shows the newest article
      meanwhile, checkbox set in admin), publish it (takes over with no second write), spotlight
      another article (the first silently loses the pick, nothing else about it changes), uncheck
      it (section shows the newest article), publish something newer (section follows it), delete
      the pick (section continues on the newest article)
