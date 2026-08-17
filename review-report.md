# Review report

**Verdict:** Approve with changes

## Reviewed at
| Range | Files | +/- | Date |
|---|---|---|---|
| `2c0685c..bb64012` (PR #14, `add-view-comment-like-feature`) | 46 | +4889 / -50 | 2026-08-17 |

## Summary

Views, likes, and comments on the article page: four new tables with RLS default-deny, a five-endpoint
engagement module, three rate-limit budgets, a Client Component island on `/news/[slug]`, and a
Readership tile on the admin dashboard. The route's `revalidate = 60` is untouched and nothing
engagement-related is fetched during server rendering, so the ISR constraint the design is built
around genuinely holds.

**The verification claims in `tasks.md` are true.** I ran them: `eslint` clean, `tsc --noEmit` clean
across all six projects, 680 tests passing across 88 files. Task 8.3 is correctly left unchecked —
the three behaviours it names really are the ones no test here reaches.

**One Major finding, three Nits.** The Major is a client-side ordering defect: on the first article
load after the access token expires, the engagement summary is fetched with no session, so the Like
button renders un-pressed on an article the reader has already liked — and pressing it deletes the
like. The three Nits are comment-accuracy and formatting.

Everything else I checked traced back to a deliberate, documented decision. The visibility gate
answers 404 rather than 403 on all five operations; `readerRequest` reuse keeps the
401→refresh→retry cycle in one place per §8.1; rate-limit namespaces are per-budget with the two
historical collision bugs recorded at the option; comment bodies never touch `sanitizeHtml` or
`dangerouslySetInnerHTML`; the `visible` predicate has one definition serving both the listing and
the count. No security findings.

Standards used: `CLAUDE.md`, `docs/ARCHITECTURE.md` (§6.3, §8.1, §9.1–9.4, §11), this change's own
spec artifacts, and the sibling patterns in `authApi.ts`, `rateLimit.ts`, and `article.repository.ts`.
There is no `docs/adr/`, no `CONTRIBUTING.md`, and no review guide.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Major | correctness | `apps/web/components/article/useArticleEngagement.ts:60` | Summary fetched without a session after the access cookie expires, so the like button un-likes |
| 2 | Nit | hygiene | `apps/api/src/modules/engagement/engagement.repository.ts:168` | Offset paging drifts when a comment is posted between pages — inherent, but unrecorded |
| 3 | Nit | conventions | `apps/web/components/article/CommentSection.tsx:123` | Comment count formatted two different ways on one page |
| 4 | Nit | hygiene | `supabase/migrations/0005_fast_vindicator.sql:75` | Migration comment names BYPASSRLS; the architecture says table ownership |

## Details

### 1. Major — summary fetched without a session after the access cookie expires, so the like button un-likes

`apps/web/components/article/useArticleEngagement.ts:60`, with
`apps/web/components/article/EngagementBar.tsx:81`

`GET /articles/:id/engagement` is declared `requirePublic()`, and `authenticate` treats a missing or
expired credential as anonymous without erroring (`apps/api/src/middleware/authenticate.ts:30`). No
401 means `withRecovery` never refreshes and never retries — the response is an ordinary 200 with
`likedByReader: false`. The endpoint is correct in isolation; the client's request ordering is the
defect.

The cookie lifetimes make the precondition deterministic rather than a narrow race
(`apps/api/src/lib/cookies.ts:8-9`, `csrf.ts` via `auth.routes.ts:155`):

| Cookie | maxAge |
|---|---|
| `sid_at` (access) | 15 minutes |
| `sid_rt` (refresh) | 30 days |
| `csrf_token` | 30 days — "CSRF cookie lifetime tracks the refresh cookie's" |

So after 15 minutes idle the browser has **deleted** `sid_at`, while `hasCsrfCookie()` still returns
true for up to 30 days. On the next article page load:

- Child effects run before parent effects, so `EngagementBar`'s effect fires before
  `ReaderSessionProvider`'s. `POST /view` goes out at t=0.
- `GET /auth/me` (`requireReader()`, `auth.routes.ts:131`) goes out at t≈0 and returns 401 at t≈RTT,
  so `POST /auth/refresh` starts at t≈RTT.
- The view POST resolves at t≈RTT and `getArticleEngagement` starts *there* — concurrent with the
  refresh, with no `sid_at` cookie to send.

The summary is therefore read anonymously, and the failure is silent and destructive:

1. Summary arrives with `likedByReader: false`.
2. The session resolves to `authenticated`, so `EngagementBar:81` renders `LikeButton` with
   `liked={false}` — hollow star, `aria-pressed="false"` — on an article the reader has already liked.
3. The reader presses it. The refresh has landed by now, so `POST /like` succeeds, the server finds
   the existing row and **deletes it**, returning `{ liked: false, likeCount: n-1 }`.
4. The optimistic update flashes liked, then settles back to un-liked with the count one lower.

The reader pressed "like" and lost their like, with no error anywhere.

**Scope, stated honestly.** This needs a reader whose last request was more than 15 minutes ago — a
direct link, a shared URL, a search result, a browser restart. It does *not* affect client-side
navigation within an active session, where `sid_at` is still live. It is the ordinary return visit,
not every visit.

**On which rule this breaks.** No requirement in this change's specs literally forbids it.
`specs/article-engagement/spec.md` — "A signed-in reader's own like state is reported" — is written
about the endpoint, and the endpoint honours it whenever it is asked with a session. What is missing
is the web client asking with one. I'd rather name it as a plain correctness bug than dress it in a
citation it doesn't quite have.

Not covered by the tests: `EngagementBar.test.tsx:69-79` stubs `fetch` to resolve `/auth/me`
immediately and mocks `engagementApi` wholesale, so `likedByReader` is supplied directly and the
expiry path is never exercised.

**Fix.** Re-read the summary once the session resolves. Pass the settled identity into the hook and
key a refetch on it:

```ts
// EngagementBar.tsx
const { session } = useReaderSession();
const readerId = session.status === 'authenticated' ? session.account.id : null;
const { state, ... } = useArticleEngagement(articleId, readerId);

// useArticleEngagement.ts — alongside the existing mount effect
useEffect(() => {
  if (readerId === null) return;
  let cancelled = false;
  getArticleEngagement(articleId)
    .then((summary) => {
      if (!cancelled) {
        setState((current) => (current.status === 'ready' ? { ...current, summary } : current));
      }
    })
    .catch(() => undefined); // the mount load already owns the unavailable state
  return () => { cancelled = true; };
}, [articleId, readerId]);
```

One extra GET for signed-in readers only, and it is the same shape as the "replace the optimistic
guess with the server's number" rule the toggle already follows. A test that renders with an expired
`sid_at` and asserts the button ends up `aria-pressed="true"` would pin it.

### 2. Nit — offset paging drifts when a comment is posted between pages

`apps/api/src/modules/engagement/engagement.repository.ts:162-174`, with
`apps/web/components/article/useArticleEngagement.ts:158-161`

`loadMoreComments` sends `offset: state.comments.length` against a newest-first listing. If another
reader posts between the first page load and the reader pressing "Komentar lama", every row shifts
down one: the last comment of page 1 reappears as the first of page 2 (a duplicate React `key`), and
one comment becomes unreachable.

**This is not a deviation.** `specs/article-engagement/spec.md` specifies offset paging by name —
"Further comments are reachable by offset" — so head-insertion drift is inherent to what was asked
for, and fixing it properly means keyset paging on `(createdAt, id)` and a wire-contract change.
Self-posted comments are unaffected: `submitComment` prepends locally and the server's list grows by
the same one, so the offset stays aligned.

The `desc(comments.id)` tie-break at `:171` is right and its comment is accurate about its own
scope — it fixes equal timestamps, which is a different problem.

**Worth doing here:** one line in the PR description's "Known limits" section, which already records
`view_seen` growth, the `current_date` timezone skew, carrier NAT, and StrictMode double-mounting.
This belongs in that list and is the only one missing. No code change.

### 3. Nit — comment count formatted two different ways on one page

`apps/web/components/article/CommentSection.tsx:123` vs
`apps/web/components/article/EngagementBar.tsx:10-12, 94`

`EngagementBar` runs counts through `formatCount` (`toLocaleString('id-ID')`); `CommentSection`'s
heading renders `{commentCount}` raw. Below 1000 they render identically, so this is invisible today
and only diverges on an article with four-digit comments — "1.200 komentar" in the bar, "1200" in the
heading a few pixels below.

**Fix.** Lift `formatCount` beside `formatCommentDate` (or into a shared module) and use it in both.

### 4. Nit — migration comment names BYPASSRLS; the architecture says table ownership

`supabase/migrations/0005_fast_vindicator.sql:75`

> `-- policies granted to anon/authenticated; the API's Postgres role has BYPASSRLS and is the only`

`docs/ARCHITECTURE.md` §6.3 describes a different mechanism: *"The API connects as a role that owns
the tables and is unaffected."* Owners bypass RLS implicitly unless `FORCE ROW LEVEL SECURITY` is
set — that is not the `BYPASSRLS` role attribute. The two predict different things the day someone
sets `FORCE ROW LEVEL SECURITY` or moves the API onto a non-owning role, and this file is where a
future reader will look for the security model.

**Fix.** Match §6.3's wording: "the API connects as the role that owns these tables and is unaffected".

## Rule check

| Rule | Where | Complies |
|---|---|---|
| `docs/ARCHITECTURE.md` §6.3 — app schema, RLS default-deny on every table | `0005_fast_vindicator.sql:74-80`, `assertDatabaseRole.ts` | Yes — all four tables enabled and added to the boot check |
| §8.1 — reader session resolved client-side, ISR preserved | `page.tsx:89`, `EngagementBar.tsx` | Yes — `revalidate = 60` untouched, only `articleId` crosses the boundary |
| §8.1 — one fetch wrapper owns 401→refresh→retry | `authApi.ts:162`, `engagementApi.ts` | Yes — `readerRequest` exported and reused, no second cycle |
| §9.1 — view counting: two statements, one transaction, no locks | `engagement.repository.ts:73-95` | Yes — implemented as written, `rowCount` is the uniqueness decision |
| §9.2 — clients branch on `code`, never `message` | `CommentSection.tsx:18-26` | Yes |
| §9.3 — views 60/h, likes 60/h, comments 10/h | `rateLimit.ts:157-201` | Yes — each namespaced, reader-keyed where reader-gated |
| §9.4 — sanitise on write, never on render | `engagement.ts` schema, `CommentSection.tsx:166` | Yes — plain text stored, rendered as a text node |
| §11 — Zod validation on every body and query string | `engagement.controller.ts:71,82` | Yes — `.strict()` rejects invented `parentId`/`readerId`/`status` |
| §11 — every route carries an explicit authorisation declaration | `engagement.routes.ts:40-50` | Yes — all five declare, boot audit passes |
| §11 — CSRF double-submit on state-changing requests | `authApi.ts:44-49` via `readerRequest` | Yes |
| `CLAUDE.md` — TS strict, no `any` | whole diff | Yes — `tsc --noEmit` clean, no `any` introduced |
| `CLAUDE.md` — build, lint, tests, no TS errors before completion | — | Yes — eslint clean, typecheck clean, 680/680 passing |
| `article-engagement` — draft article 404s, not 403 | `engagement.service.ts:20-22` | Yes — identical response for unknown and non-public |
| `article-engagement` — a muted reader may still like | `engagement.routes.ts:48` | Yes — `createsContent: false` |
| `article-engagement` — comment count matches the listing | `engagement.repository.ts:53-55` | Yes — one `visibleComments` predicate serves both |
| `article-engagement` — a reader cannot like the same article twice | `engagement.repository.ts:104-112`, `likes_reader_article_unique` | Yes — unique index is the race backstop |
| `article-engagement` — a signed-in reader's own like state is reported | `engagement.service.ts:53-62` | Yes at the endpoint; the web client does not always ask with a session (finding 1) |
| `article-engagement` — exhausting one budget does not exhaust another | `rateLimit.ts:157-161` | Yes — separate `name` per budget |
| `article-engagement` — readers behind one address have separate comment budgets | `rateLimit.ts:174-176` | Yes — keyed on reader id |
| `web-public-site` — failed load reported, not faked | `EngagementBar.tsx:61-69` | Yes — unavailable state, never zeroes |
| `web-public-site` — signed-out reader prompted, never shown a dead control | `EngagementBar.tsx:80`, `CommentSection.tsx:130-135` | Yes — prompt replaces both controls |
| `web-public-site` — neither control before the session is known | `EngagementBar.tsx:80-88`, `CommentSection.tsx:130-135` | Yes |
| `web-public-site` — the load control disappears at the end | `useArticleEngagement.ts:164` | Yes — `next.length === COMMENT_PAGE_SIZE` |
| `admin-dashboard` — top articles with title, public path, read count | `analytics.repository.ts:303-306`, `dashboard.ts` | Yes — the scenarios are framed on what the dashboard *returns*, and `slug` is in the response |
| `admin-dashboard` — readership shares the dashboard's instant and timezone | `analytics.service.ts:15-24` | Yes — one shared `now`, existing Jakarta helpers |
