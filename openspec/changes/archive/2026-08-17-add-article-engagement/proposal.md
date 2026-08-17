## Why

`/news/[slug]` renders an engagement bar with a disabled like button, the fixed text "No comments yet", and a disabled comment input. That is deliberate — `web-public-site`'s "Article engagement affordances carry no fabricated activity" requirement exists because no comments table, likes table, or view counter has ever been built. The consequence is that reader sign-in, shipped in `add-reader-web-sign-in`, currently buys a reader nothing: they authenticate, the masthead learns their name, and there is no action anywhere on the site that a session unlocks.

Separately, the editorial side has no traffic signal at all. `admin-dashboard` reports pipeline, cadence, content debt, curation integrity, and reader sign-in activity — nothing about which articles are actually read.

## What Changes

- Add an `article-engagement` capability: view counting, likes, and comments for published articles, with a public read endpoint for the aggregate counts.
- **Views** are anonymous and deduplicated per visitor per article per day, following `docs/ARCHITECTURE.md` §9.1's two-statement/one-transaction design and the `sessions.ip_hash` keyed-digest precedent. Counted totals are shown to readers on the article page and to staff on the admin dashboard.
- **Likes** require a reader session and toggle: one row per `(reader_id, article_id)`, no anonymous likes.
- **Comments** require a reader session, publish instantly with no pre-publish hold, and are flat — no replies or threading.
- The article page's engagement bar becomes a Client Component island that fetches counts and comments on mount. `/news/[slug]` stays ISR at 60s; nothing about this change makes the route dynamic.
- A signed-out reader sees an inline sign-in prompt in place of the like control and the comment composer — the controls are never simply hidden.
- The admin dashboard gains a views section: reads and unique reads over the trailing 7 days, plus the most-read articles over the trailing 30 days.

Non-goals: no admin moderation queue, no report/flag system, no ban or mute UI, no comment threading, no anonymous likes, no comment editing by readers, no per-comment reactions.

## Capabilities

### New Capabilities
- `article-engagement`: view counting, reader likes, and reader comments for publicly visible articles — DB tables, the public and reader-gated API endpoints, and the article page's client-side engagement island.

### Modified Capabilities
- `web-public-site`: the article detail page's engagement affordances change from inert placeholders carrying no activity to a real, backend-backed island. The "carry no fabricated activity" requirement is replaced by one that governs how real activity renders, including the loading state and the signed-out presentation.
- `admin-dashboard`: gains a views section alongside the existing six.

## Impact

- **DB**: new `likes`, `comments`, `article_views_daily`, and `view_seen` tables (one migration), all referencing `articles` (and `readers`, for likes and comments) with `ON DELETE CASCADE`; new `comment_status` enum.
- **API**: new `apps/api/src/modules/engagement` module (routes, controller, service, repository, mapper); new public routes `POST /articles/:id/view`, `GET /articles/:id/engagement`, `GET /articles/:id/comments`; new reader-gated routes `POST /articles/:id/like`, `POST /articles/:id/comments`; three new rate limiters in `middleware/rateLimit.ts` per `docs/ARCHITECTURE.md` §9.3.
- **Web**: `EngagementBar` rewritten as a client island with `LikeButton`, `CommentSection`, `SignInPrompt`, and a `useArticleEngagement` hook; new `lib/engagementApi.ts`; `lib/authApi.ts` exports its recovery-wrapped request function so the engagement calls reuse the one 401→refresh→retry cycle rather than growing a second.
- **Admin**: `DashboardPage` gains a views section.
- **Contracts**: `packages/contracts` gains `engagement.ts`; `dashboard.ts` gains a views section.

## Moderation

Moderation is manual for this launch, by direct SQL: `app.readers.status` / `app.readers.muted_until` for the reader, `app.comments.status = 'removed'` for the comment. `requireReader({ createsContent: true })` already rejects a muted reader at the comment endpoint, and the public comment listing already filters on `status = 'visible'`, so both levers work the moment a row is updated — with no admin surface built for either.
