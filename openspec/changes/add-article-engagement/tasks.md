## 1. Database

- [x] 1.1 Add `packages/db/src/schema/engagement.ts`: `comment_status` enum (`visible | removed`); `likes` (id, `readerId`, `articleId`, `createdAt`; unique on `(readerId, articleId)`, index on `articleId`); `comments` (id, `articleId`, `readerId`, `body`, `status`, `createdAt`; index on `(articleId, createdAt)`); `article_views_daily` (`articleId`, `date`, `views`, `uniqueViews`; composite pk on `(articleId, date)`); `view_seen` (`articleId`, `visitorHash`, `date`; composite pk, plus a `date` index for retention). All article and reader references `ON DELETE CASCADE`.
- [x] 1.2 Export the new tables from `packages/db/src/schema/index.ts`.
- [x] 1.3 Generate the migration and append the `ENABLE ROW LEVEL SECURITY` statements every other table in this schema carries (`docs/ARCHITECTURE.md` §6.3).

## 2. Contracts

- [x] 2.1 Add `packages/contracts/src/engagement.ts`: `ArticleEngagement` (view/like/comment counts + `likedByReader`), `LikeToggleResponse`, `CommentResponse`, `CommentCreateRequest` (trimmed, non-blank, max length), and the comment page-size constant.
- [x] 2.2 Add `packages/contracts/src/engagement.test.ts` covering the body's blank/whitespace/over-length rules, the trim, and rejection of caller-supplied fields.
- [x] 2.3 Add a `views` section to `packages/contracts/src/dashboard.ts` (`last7dViews`, `last7dUniqueViews`, `topArticles`) and extend `dashboard.test.ts`.
- [x] 2.4 Export the new module from `packages/contracts/src/index.ts`.

## 3. API — engagement module

- [x] 3.1 Add `apps/api/src/modules/engagement/engagement.repository.ts`: publicly-visible article lookup by id, the §9.1 two-statement view transaction, like toggle, like/comment/view count reads, comment insert, and the visible-comment listing.
- [x] 3.2 Add `apps/api/src/modules/engagement/engagement.mapper.ts`: row → `CommentResponse` / `ArticleEngagement`.
- [x] 3.3 Add `apps/api/src/modules/engagement/engagement.service.ts`: article-visibility gate on every operation, view recording, like toggle, comment creation, summary composition, comment listing.
- [x] 3.4 Add `apps/api/src/modules/engagement/engagement.controller.ts` and `engagement.routes.ts`. Public: `POST /articles/:id/view`, `GET /articles/:id/engagement`, `GET /articles/:id/comments`. Reader-gated: `POST /articles/:id/like` (`createsContent: false`), `POST /articles/:id/comments` (default). **Deviation from the plan:** mounted as a second router at `/articles` rather than added into `publicArticleRoutes`. Every route here is two segments deep while that router declares only `/` and `/:slug`, so no request either can match belongs to the other, whatever the mount order — and keeping them separate leaves the public article endpoints' file untouched.
- [x] 3.5 Add the three limiters to `apps/api/src/middleware/rateLimit.ts` per §9.3 — views 60/h by hashed IP, likes 60/h by reader id, comments 10/h by reader id — each with its own `name` namespace.
- [x] 3.6 Tests: `engagement.service.test.ts` (not-found for invisible articles on all five operations; toggle both directions; per-reader like counting; the count re-read after a toggle; anonymous vs signed-in `likedByReader`; comment paging) and `engagement.mapper.test.ts` (ISO formatting, null avatar, exactly the public field set). **No `engagement.repository.test.ts`:** unlike `partner.repository.ts`'s `isExactPartnerIdSet`, this repository exports no pure rule to test — every function is a query. **Not covered by any test, and not coverable without a live database:** the §9.1 view transaction's uniqueness decision (it is the first insert's `rowCount`), the like toggle's unique-violation race branch, and the `status = 'visible'` filter agreeing between the listing and the count. All three are exercised by task 8.3.

## 4. API — dashboard readership

- [x] 4.1 Extend `analytics.repository.ts` with a readership query over `article_views_daily` (trailing 7d totals, trailing 30d top articles joined to `articles`), using the existing Jakarta date helpers.
- [x] 4.2 Thread it through `analytics.service.ts` (same shared `now`) and `analytics.mapper.ts`.
- [x] 4.3 Extend the analytics tests for the new section, including the empty case.

## 5. Web — reader fetch reuse

- [x] 5.1 Export `readerRequest` from `apps/web/lib/authApi.ts` and re-express `getReaderAccount`/`signOutReader` in terms of it, so the 401→refresh→retry and `csrf_failed` cycles keep exactly one implementation (`docs/ARCHITECTURE.md` §8.1).
- [x] 5.2 Add `apps/web/lib/engagementApi.ts` over `readerRequest`: record view, get summary, toggle like, list comments, post comment.
- [x] 5.3 Add `apps/web/lib/engagementApi.test.ts`.

## 6. Web — the engagement island

- [x] 6.1 Add `apps/web/components/article/useArticleEngagement.ts`: mount sequence (view POST first, swallowed on failure, then summary + comments), optimistic like toggle with rollback, comment append, older-comment paging.
- [x] 6.2 Add `apps/web/components/article/SignInPrompt.tsx` — inline prompt returning to the current article, reusing `ReaderControl`'s sign-in URL construction.
- [x] 6.3 Add `apps/web/components/article/LikeButton.tsx` and `CommentSection.tsx` (flat list, newest first, load-older control, composer).
- [x] 6.4 Rewrite `apps/web/components/article/EngagementBar.tsx` as the client island root taking `articleId`, with a dimension-reserving skeleton and an explicit unavailable state.
- [x] 6.5 Pass `articleId` from `apps/web/app/news/[slug]/page.tsx`; confirm `export const revalidate = 60` is untouched and nothing engagement-related is fetched during server rendering.
- [x] 6.6 Tests: skeleton then counts, no layout shift on arrival, signed-out prompts in place of both controls, neither control while the session is loading, view POST failure still yields counts, posted comment appears at top, rejected submission keeps the text.

## 7. Admin

- [x] 7.1 Add the readership section to `apps/admin/src/pages/DashboardPage.tsx`, matching the existing tiles' presentation.

## 8. Verification

- [x] 8.1 `pnpm lint`, `pnpm typecheck`, `pnpm test` all clean.
- [x] 8.2 Confirm the route audit still passes at boot — every new route carries an explicit declaration. (All five declare `requirePublic()` or `requireReader()`; `authorize.test.ts`, which fails closed on anything it cannot introspect, passes.)
- [ ] 8.3 **Not yet run — needs a live database.** Manual: apply `0005_fast_vindicator.sql`; sign out, load an article, confirm the view lands and both prompts render; sign in, like/unlike, comment; confirm a `status = 'removed'` SQL update drops the comment from both the listing and the count; confirm a `muted_until` in the future blocks commenting but not liking; confirm a repeat view on the same day raises `views` and not `unique_views`.
