# Design

## The constraint everything else follows from

`/news/[slug]` is `export const revalidate = 60` — rendered once and served from cache to every
visitor. `docs/ARCHITECTURE.md` §8.1 is explicit that reader session state is deliberately not
forwarded to Server Components, because reading the cookie header even in the root layout would
opt the whole route tree into dynamic rendering and kill ISR on `/` and SSG on `/news/[slug]`.

Views, likes, and comments are all either per-request or per-reader. None of them can be rendered
on the server without either serving a 60-second-stale number to everyone or making the route
dynamic. So the entire engagement surface is a **Client Component island** that fetches its own
data on mount, and the server-rendered article body above it is untouched.

```
  /news/[slug]  —  ISR 60s, one cached HTML for everyone
  ┌──────────────────────────────────────────────────────┐
  │  title · byline · lead image · body html   (server)   │
  │──────────────────────────────────────────────────────│
  │  <EngagementBar articleId={article.id} />  (client)   │
  │    on mount:  POST /articles/:id/view                 │
  │               GET  /articles/:id/engagement           │
  │               GET  /articles/:id/comments             │
  └──────────────────────────────────────────────────────┘
```

`articleId` is the only thing the server hands down — it is already in `ArticlePublicDetail` and
already used for `RelatedArticles`' `excludeId`, so no new server-side fetch is introduced.

## Request order on mount: view first, then counts

The view POST is awaited before the engagement GET, rather than the three calls firing together.
Firing them in parallel means the visitor's own view is never in the number they see — the count
only catches up on their *next* visit, which reads as a broken counter.

The cost is one extra round trip before the counts appear, and it is paid inside a skeleton the
reader is already looking at. A failing or rate-limited view POST is swallowed: the counts still
load, one short.

```
   mount ──► POST /view ──┬──► GET /engagement ──┐
                          │                       ├──► render
             (errors      └──► GET /comments  ────┘
              swallowed)
```

## View counting

Taken from `docs/ARCHITECTURE.md` §9.1 as written — two statements, one transaction, no locks
held:

```sql
insert into app.view_seen (article_id, visitor_hash, date)
values ($1, $2, current_date)
on conflict do nothing;                    -- rowCount tells the caller if this visitor is new today

insert into app.article_views_daily (article_id, date, views, unique_views)
values ($1, current_date, 1, $2::int)
on conflict (article_id, date) do update
  set views        = app.article_views_daily.views + 1,
      unique_views = app.article_views_daily.unique_views + $2::int;
```

`visitor_hash` is `hmacSha256Hex(req.ip, SESSION_SECRET)` — the same keyed-digest reasoning as
`sessions.ip_hash` (`lib/sessionMeta.ts`): an IPv4 address is only 2^32 candidates, so an unkeyed
SHA-256 of one is pseudonymous in name only. A signed-in reader is not keyed on their reader id;
the decision is that views are an anonymous metric, so every visitor is counted the same way.

**Known limits, accepted rather than solved here.** Behind a carrier NAT many readers collapse
into one "unique". `current_date` resolves in the database session's timezone (UTC on Supabase),
while `admin-dashboard` reports in Asia/Jakarta — so a view at 05:00 Jakarta is attributed to the
previous day's bucket. This affects which day a view lands in, never whether it is counted, and
the dashboard's figures are rolling windows rather than single-day readings, so the totals hold.
Both are noted so neither is later mistaken for a bug.

**`view_seen` grows without bound.** One row per (article, visitor, day). It carries a `date`
index specifically so a retention job can delete old rows cheaply; no such job is built here.

## Article resolution: every endpoint checks public visibility

All five endpoints resolve `:id` to an article and require it to be publicly visible by the same
`isPubliclyVisible` predicate `article.repository.ts` already exports — the one that treats a
`scheduled` row whose time has passed as public. Without it, a caller could inflate view counts on
a draft, or comment on an unpublished article, by guessing a uuid. An article that is not publicly
visible answers `404`, not `403`: acknowledging that the id exists would leak the existence of
unpublished work.

## Likes: `createsContent: false`

`requireReader()` defaults `createsContent` to "is this a mutating method", which would make a
muted reader unable to like. `requireReader({ createsContent: false })` is passed explicitly on
the like route instead. Muting is a sanction on speech — `authorize.ts`'s own comment says a muted
reader "keeps read access but is rejected at content-creating endpoints" — and a like publishes no
words. It increments a number nobody can attribute to the muted reader. The comment endpoint takes
the default, so muting works exactly where it is meant to.

The like row is `(reader_id, article_id)` unique. The toggle is a delete-then-check-rowcount:
delete the row, and if nothing was deleted, insert one. That is one round trip in the common
un-like case and two in the like case, with the unique constraint as the backstop against a
double-click racing itself.

## Comments: flat, instant, and paginated like everything else

`GET /articles/:id/comments?limit=&offset=` returns a bare array of visible comments, newest
first. Not an envelope with `total` and `hasMore` — the public `/articles` listing already
established limit/offset returning a bare array, and `NewsExplorer` already derives "there is more"
from `returned.length === limit`. A second pagination convention for one endpoint would be the
odd one out.

`status` is `visible | removed` rather than a hard delete, so removing a comment by SQL leaves the
row for whoever needs to see what was said. The public listing filters on `visible`; nothing in
this change ever writes `removed`.

Comment bodies are stored and returned as **plain text**, never HTML. `sanitizeHtml.ts` exists for
article bodies authored by staff through Tiptap; a reader comment has no rich-text affordance and
therefore no reason to admit markup. The web client renders it into a text node, so there is no
render path for markup to escape through.

## Reusing the one recovery cycle

`docs/ARCHITECTURE.md` §8.1: "A single fetch wrapper handles the 401 → refresh → retry cycle in
one place; never scatter that logic across call sites." `lib/authApi.ts` is that wrapper, but its
`withRecovery`/`rawFetch` pair is module-private and only `getReaderAccount`/`signOutReader` are
exported. Rather than build a second cycle in `engagementApi.ts`, `authApi.ts` exports
`readerRequest<T>(path, init)` — `withRecovery(() => rawFetch(path, init))` — and every engagement
call goes through it.

This matters beyond tidiness. Every engagement POST from a signed-in browser carries a session
cookie, which means `csrf.ts` demands the `x-csrf-token` header; `rawFetch` already attaches it
from the readable cookie, and `withRecovery` already handles the `csrf_failed` re-pairing path.
A hand-rolled `fetch` in `engagementApi.ts` would have had to reimplement both, and would have
been the place they drifted.

Anonymous callers hold no session cookie, so `csrf.ts` passes them through untouched — the view
POST works without any CSRF ceremony.

## Rate limits

Per `docs/ARCHITECTURE.md` §9.3, and keyed to match what each endpoint protects:

| Endpoint | Limit | Key |
|---|---|---|
| `POST /articles/:id/view` | 60/hour | hashed client IP |
| `POST /articles/:id/like` | 60/hour | reader id |
| `POST /articles/:id/comments` | 10/hour | reader id |
| `GET .../engagement`, `GET .../comments` | existing public read limiter | client IP |

The two reader-gated limiters key on `req.auth.subjectId`, not IP, so a shared office address does
not let one commenter exhaust everyone's budget. They are declared after `requireReader`, so
`req.auth` is guaranteed present by the time the key generator runs.

Each limiter gets its own `name` namespace. `rateLimit.ts`'s own comment records what happens
without one: limiters whose key generators return the same string silently share a counter, which
has already produced two live bugs in this codebase.

## Dashboard views section

`article_views_daily` is already a daily aggregate, which is exactly the shape a dashboard wants —
no new rollup, no materialized view. The section reports reads and unique reads over the trailing
7 days and the five most-read articles over the trailing 30, joined to `articles` for title and
slug. Windows are computed from the same shared `now` the other six sections use, in Asia/Jakarta,
matching `analytics.repository.ts`'s existing convention.

Likes and comments are deliberately **not** on the dashboard. This change adds a traffic signal
because there was none; adding engagement tiles as well would widen `admin-dashboard`'s purpose
past what the proposal scopes.

## The loading state

The counts go from nothing to a number, and on a broadsheet design a number popping into a
justified rule is visible. The bar renders a skeleton at the final layout's dimensions — the same
bordered strip, with muted placeholder blocks where the counts will land — so the article body
below never reflows. `ReaderControl` sets the precedent for the other half of this: while session
resolution is in flight it renders nothing rather than an anonymous-looking flash, and the like
control does the same, showing neither the interactive button nor the sign-in prompt until the
session is known.
