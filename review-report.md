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

The work is careful and the reasoning in the comments is largely load-bearing rather than decorative:
the visibility gate answers 404 rather than 403 on all five operations, `readerRequest` reuse means
the 401→refresh→retry cycle keeps one implementation, the rate-limit namespaces are per-budget, and
comment bodies never touch `sanitizeHtml` or `dangerouslySetInnerHTML`.

**One Major finding.** It is a client-side ordering defect, not an API defect: the engagement summary
is fetched anonymously for a returning reader whose access token has expired, so the Like button
renders un-pressed on an article they have already liked — and pressing it deletes the like. Four
Minors and two Nits follow. Nothing here is a security defect.

Standards used: `CLAUDE.md`, `docs/ARCHITECTURE.md` (§6.3, §8.1, §9.1–9.4, §11), this change's own
spec artifacts, and the sibling patterns in `authApi.ts`, `rateLimit.ts`, and `article.repository.ts`.
There is no `docs/adr/`, no `CONTRIBUTING.md`, and no review guide.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Major | correctness | `apps/web/components/article/useArticleEngagement.ts:60` | Expired access token makes the summary anonymous, so the like button un-likes |
| 2 | Minor | correctness | `apps/web/components/article/EngagementBar.tsx:81` | Signed-out visitors never see the like count |
| 3 | Minor | conventions | `apps/admin/src/pages/DashboardPage.tsx:260` | `topArticles.slug` is fetched and contracted but never rendered |
| 4 | Minor | correctness | `apps/web/components/article/useArticleEngagement.ts:160` | Offset paging repeats a comment when one is posted between pages |
| 5 | Minor | performance | `apps/api/src/modules/engagement/engagement.service.ts:31` | Three redundant visibility SELECTs per article page load |
| 6 | Nit | conventions | `apps/web/components/article/CommentSection.tsx:123` | Comment count formatted two different ways on one page |
| 7 | Nit | hygiene | `supabase/migrations/0005_fast_vindicator.sql:75` | Migration comment names BYPASSRLS; the architecture says table ownership |

## Details

### 1. Major — expired access token makes the summary anonymous, so the like button un-likes

`apps/web/components/article/useArticleEngagement.ts:60`, with
`apps/web/components/article/EngagementBar.tsx:81`

`GET /articles/:id/engagement` is declared `requirePublic()`. `authenticate` treats a missing,
invalid, **or expired** access token as anonymous and never errors
(`apps/api/src/middleware/authenticate.ts:30`), so an expired credential produces a perfectly
ordinary 200 with `likedByReader: false` — no 401, so `withRecovery` never refreshes and never
retries. The endpoint is right in isolation; the client's request ordering is what breaks.

The access token TTL is 15 minutes (`apps/api/src/lib/tokens.ts:7`), and the mount sequence loses
the race by construction rather than by luck:

- Child effects run before parent effects, so `EngagementBar`'s effect fires before
  `ReaderSessionProvider`'s. `POST /view` goes out at t=0.
- `GET /auth/me` goes out at t≈0, returns 401 at t≈RTT, and `POST /auth/refresh` starts at t≈RTT.
- The view POST resolves at t≈RTT, and `getArticleEngagement` starts *there* — concurrent with the
  refresh, roughly a full round trip before the new `sid_at` cookie exists.

So for any reader returning after 15 minutes — the ordinary case that refresh tokens exist to serve —
the summary is read anonymously. The failure is then silent and destructive:

1. Summary arrives with `likedByReader: false`.
2. The session resolves to `authenticated`, so `EngagementBar:81` renders `LikeButton` with
   `liked={false}` — hollow star, `aria-pressed="false"` — on an article the reader has already liked.
3. The reader presses it. By now the refresh has landed, so `POST /like` succeeds, the server finds
   the existing row and **deletes it**, returning `{ liked: false, likeCount: n-1 }`.
4. The optimistic update flashes liked, then settles back to un-liked with the count one lower.

The reader pressed "like" and lost their like, with no error anywhere. This contradicts
`specs/article-engagement/spec.md` — "A signed-in reader's own like state is reported" — at the level
that matters, which is what the reader sees.

Not covered by the tests: `EngagementBar.test.tsx:69-79` stubs `fetch` to resolve `/auth/me`
immediately and mocks `engagementApi` wholesale, so the summary's `likedByReader` is supplied
directly and the token-expiry path is never exercised.

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

That costs one extra GET for signed-in readers only, and it is the same shape as the existing
"replace the optimistic guess with the server's number" rule the toggle already follows.

An alternative worth considering instead: make the like control render disabled-pending (not
un-pressed) until `likedByReader` is known to have been read with a live session. The refetch is
simpler and matches the file's existing idiom, so I'd take it.

### 2. Minor — signed-out visitors never see the like count

`apps/web/components/article/EngagementBar.tsx:81-88`

`summary.likeCount` is rendered *only* inside `LikeButton`, and `LikeButton` renders only when
`session.status === 'authenticated'`. View count and comment count render unconditionally. So the
overwhelming majority of visitors — anonymous ones — see "1.200 kali dibaca · 3 komentar" and no
like figure at all, then watch a like count materialise if they ever sign in.

`specs/web-public-site/spec.md` requires that a sign-in prompt appear "in place of the like control",
which is satisfied; it does not ask for the *count* to disappear with it. Hiding a real number from
most of the audience is also in tension with this capability's own founding requirement, "Article
engagement affordances carry no fabricated activity" — the spirit there is that the bar tells the
truth about activity, and to an anonymous reader it currently tells them nothing about likes.

**Fix.** Render the count as a static counter beside the sign-in prompt, matching the view and
comment counters:

```tsx
{session.status === 'anonymous' && (
  <>
    <SignInPrompt action="untuk menyukai artikel ini." />
    <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted tabular-nums">
      {formatCount(summary.likeCount)} suka
    </span>
  </>
)}
```

### 3. Minor — `topArticles.slug` is fetched and contracted but never rendered

`apps/admin/src/pages/DashboardPage.tsx:260-264`, with
`apps/api/src/modules/analytics/analytics.repository.ts:305` and
`packages/contracts/src/dashboard.ts` (`dashboardTopArticleSchema`)

`specs/admin-dashboard/spec.md` — "The most-read articles are listed with their counts": *"it lists
the most-read articles of the trailing 30 days, each with its title, **its public path**, and its
read count."*

`slug` is selected in the repository, grouped on, carried through the mapper, and declared in the
contract — and the tile renders `article.title` and `article.views` only. The public path never
reaches the screen, so the requirement is unmet and the field is dead weight in the response.

**Fix.** Render it — one line, and it makes the row identifiable when two articles share a title:

```tsx
<span className="truncate text-sm text-[var(--ink)]">
  {article.title}
  <span className="ml-2 font-mono text-[10px] text-[var(--muted)]">/news/{article.slug}</span>
</span>
```

Dropping `slug` from the contract instead would be the wrong direction — the spec asks for the path.

### 4. Minor — offset paging repeats a comment when one is posted between pages

`apps/web/components/article/useArticleEngagement.ts:158-161`, with
`apps/api/src/modules/engagement/engagement.repository.ts:162-174`

`loadMoreComments` sends `offset: state.comments.length` against a listing ordered newest-first. If
another reader posts a comment between the first page load and the reader pressing "Komentar lama",
every row shifts down one, so `offset = 10` now points at what was row 9 — the last comment of page 1
appears again as the first of page 2, and one comment is never reachable.

The repository comment at `:168-170` claims the `desc(comments.id)` tie-break makes the sort stable
under limit/offset paging. It does fix *equal timestamps*; it cannot fix *insertions at the head*,
which is the drift that actually bites on a live article. The two are different problems and the
comment currently conflates them.

Self-posted comments are fine — `submitComment` prepends locally and the server's list grows by the
same one, so the offset stays aligned. It is other readers' comments that break it.

**Fix.** Keyset paging: send the last-loaded comment's `(createdAt, id)` as a `before` cursor and let
the repository take `where (created_at, id) < ($1, $2)`, which the existing
`comments_article_created_at_idx` already serves. Note that this changes the wire contract
(`commentListQuerySchema`), so it is a follow-up rather than a one-line fix — the current spec
requirement is written in terms of offset ("Further comments are reachable by offset"), and it would
need to change with it. If you'd rather keep offset for now, at minimum correct the repository
comment so the next reader isn't told the ordering is stable when it isn't.

### 5. Minor — three redundant visibility SELECTs per article page load

`apps/api/src/modules/engagement/engagement.service.ts:30-34`

Every operation opens with `assertEngageable`, which is a separate round trip to `articles`. One
article page load calls three endpoints — view, summary, comments — so the same row is fetched three
times, on top of the summary's own three aggregates and the comment listing. Eight queries per
article read.

The gate itself is right and must stay; `specs/article-engagement/spec.md` requires it on all five
operations, and it is what stops a uuid-guesser inflating counts on a draft. The cost is worth naming
against `docs/ARCHITECTURE.md` §9.1, which opens: *"The one endpoint that must be cheap, since it
fires on every article read."* The view path is now SELECT-then-transaction rather than the two
statements §9.1 specifies.

**Fix.** Fold the gate into the view transaction's first statement so the hot path loses a round trip
while keeping the same semantics — no matching visible article inserts nothing, and the caller reads
the affected-row count as before:

```sql
insert into app.view_seen (article_id, visitor_hash, date)
select ${articleId}, ${visitorHash}, current_date
from app.articles a
where a.id = ${articleId}
  and a.status = 'published'
  and a.published_at is not null and a.published_at <= now()
on conflict do nothing
```

That does duplicate the visibility rule in SQL, which `engagement.repository.ts:60-64` explicitly
avoided on the grounds that the rule has one SQL definition and one JS definition. That reasoning is
sound and I would not overrule it for the two read endpoints. If you keep the current shape
everywhere, this is fine as-is at launch scale — the note is here so the §9.1 deviation on the view
path is a recorded decision rather than an accident.

### 6. Nit — comment count formatted two different ways on one page

`apps/web/components/article/CommentSection.tsx:123` vs
`apps/web/components/article/EngagementBar.tsx:10-12, 94`

`EngagementBar` runs counts through `formatCount` (`toLocaleString('id-ID')`); `CommentSection`'s
heading renders `{commentCount}` raw. At 1200 comments the bar reads "1.200 komentar" and the section
heading immediately below reads "1200" — same number, two renderings, a few pixels apart.

**Fix.** Export `formatCount` from a shared module (or lift it beside `formatCommentDate`) and use it
in both places.

### 7. Nit — migration comment names BYPASSRLS; the architecture says table ownership

`supabase/migrations/0005_fast_vindicator.sql:75`

> `-- policies granted to anon/authenticated; the API's Postgres role has BYPASSRLS and is the only`

`docs/ARCHITECTURE.md` §6.3 says the opposite mechanism: *"The API connects as a role that owns the
tables and is unaffected."* Owners bypass RLS implicitly unless `FORCE ROW LEVEL SECURITY` is set —
that is not the `BYPASSRLS` role attribute, and the distinction matters the day someone sets
`FORCE ROW LEVEL SECURITY` or moves the API onto a non-owning role, since only one of the two
descriptions predicts what breaks.

**Fix.** Match §6.3's wording: "the API connects as the role that owns these tables and is unaffected".

## Rule check

| Rule | Where | Complies |
|---|---|---|
| `docs/ARCHITECTURE.md` §6.3 — app schema, RLS default-deny on every table | `0005_fast_vindicator.sql:74-80`, `assertDatabaseRole.ts` | Yes — all four tables enabled and added to the boot check |
| §8.1 — reader session resolved client-side, ISR preserved | `page.tsx:89`, `EngagementBar.tsx` | Yes — `revalidate = 60` untouched, only `articleId` crosses the boundary |
| §8.1 — one fetch wrapper owns 401→refresh→retry | `authApi.ts:162`, `engagementApi.ts` | Yes — `readerRequest` exported and reused, no second cycle |
| §9.1 — view counting: two statements, one transaction | `engagement.repository.ts:73-95` | Yes for the transaction; the added visibility SELECT precedes it (finding 5) |
| §9.2 — clients branch on `code`, never `message` | `CommentSection.tsx:18-26` | Yes |
| §9.3 — views 60/h, likes 60/h, comments 10/h | `rateLimit.ts:157-201` | Yes — each namespaced, reader-keyed where reader-gated |
| §9.4 — sanitise on write, never on render | `engagement.ts` schema, `CommentSection.tsx:166` | Yes — plain text stored, rendered as a text node, no `dangerouslySetInnerHTML` |
| §11 — Zod validation on every body and query string | `engagement.controller.ts:71,82` | Yes — `.strict()` rejects invented `parentId`/`readerId`/`status` |
| §11 — every route carries an explicit authorisation declaration | `engagement.routes.ts:40-50` | Yes — all five declare, boot audit passes |
| §11 — CSRF double-submit on state-changing requests | `authApi.ts:44-49` via `readerRequest` | Yes |
| `CLAUDE.md` — TS strict, no `any` | whole diff | Yes — `tsc --noEmit` clean, no `any` introduced |
| `CLAUDE.md` — build, lint, tests, no TS errors before completion | — | Yes — eslint clean, typecheck clean, 680/680 passing |
| `specs/article-engagement` — "A signed-in reader's own like state is reported" | `useArticleEngagement.ts:60` | **No** — finding 1 |
| `specs/article-engagement` — draft article 404s, not 403 | `engagement.service.ts:20-22` | Yes — identical response for unknown and non-public |
| `specs/article-engagement` — a muted reader may still like | `engagement.routes.ts:48` | Yes — `createsContent: false` |
| `specs/article-engagement` — comment count matches the listing | `engagement.repository.ts:53-55` | Yes — one `visibleComments` predicate serves both |
| `specs/web-public-site` — failed load reported, not faked | `EngagementBar.tsx:61-69` | Yes — unavailable state, never zeroes |
| `specs/web-public-site` — neither control before the session is known | `EngagementBar.tsx:80-88`, `CommentSection.tsx:130-135` | Yes |
| `specs/admin-dashboard` — top articles listed with title, public path, count | `DashboardPage.tsx:260-264` | **No** — finding 3 |
