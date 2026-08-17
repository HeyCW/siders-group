# Review report

**Verdict:** Approved

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

**Original pass: one Major, three Nits.** All four are now resolved — two by code fix, one by a
design-doc note, one withdrawn after verification showed it isn't this PR's to fix. Details and
outcomes below. Re-ran the full suite after: `eslint` clean, `tsc --noEmit` clean, **682/682**
passing (2 new, both exercising the Major's fix).

Everything else traced back to a deliberate, documented decision. The visibility gate answers 404
rather than 403 on all five operations; `readerRequest` reuse keeps the 401→refresh→retry cycle in
one place per §8.1; rate-limit namespaces are per-budget with the two historical collision bugs
recorded at the option; comment bodies never touch `sanitizeHtml` or `dangerouslySetInnerHTML`; the
`visible` predicate has one definition serving both the listing and the count. No security findings.

Standards used: `CLAUDE.md`, `docs/ARCHITECTURE.md` (§6.3, §8.1, §9.1–9.4, §11), this change's own
spec artifacts, and the sibling patterns in `authApi.ts`, `rateLimit.ts`, and `article.repository.ts`.
There is no `docs/adr/`, no `CONTRIBUTING.md`, and no review guide.

## Findings

| # | Severity | Aspect(s) | File:line | Title | Outcome |
|---|---|---|---|---|---|
| 1 | Major | correctness | `apps/web/components/article/useArticleEngagement.ts:60` | Summary fetched without a session after the access cookie expires, so the like button un-likes | **Fixed** |
| 2 | Nit | hygiene | `apps/api/src/modules/engagement/engagement.repository.ts:168` | Offset paging drifts when a comment is posted between pages — inherent, but unrecorded | **Fixed** (doc note) |
| 3 | Nit | conventions | `apps/web/components/article/CommentSection.tsx:123` | Comment count formatted two different ways on one page | **Fixed** |
| 4 | Nit | hygiene | `supabase/migrations/0005_fast_vindicator.sql:75` | Migration comment names BYPASSRLS; the architecture says table ownership | **Withdrawn** |

## Details

### 1. Major — summary fetched without a session after the access cookie expires, so the like button un-likes — Fixed

`apps/web/components/article/useArticleEngagement.ts:60`, with
`apps/web/components/article/EngagementBar.tsx:81`

`GET /articles/:id/engagement` is declared `requirePublic()`, and `authenticate` treats a missing or
expired credential as anonymous without erroring (`apps/api/src/middleware/authenticate.ts:30`). No
401 means `withRecovery` never refreshes and never retries — the response is an ordinary 200 with
`likedByReader: false`. The endpoint is correct in isolation; the client's request ordering was the
defect.

Cookie lifetimes made the precondition deterministic rather than a narrow race
(`apps/api/src/lib/cookies.ts:8-9`, `csrf.ts` via `auth.routes.ts:155`):

| Cookie | maxAge |
|---|---|
| `sid_at` (access) | 15 minutes |
| `sid_rt` (refresh) | 30 days |
| `csrf_token` | 30 days — "CSRF cookie lifetime tracks the refresh cookie's" |

After 15 minutes idle the browser has **deleted** `sid_at`, while `hasCsrfCookie()` still returns
true for up to 30 days. On the next article page load, `EngagementBar`'s mount effect (child) fires
before `ReaderSessionProvider`'s (parent), so `getArticleEngagement` was requested before the
401→refresh cycle on `/auth/me` had landed a fresh `sid_at` — read anonymously, `likedByReader:
false`, on an article the reader had actually liked. The button then rendered un-pressed, and
pressing it deleted the real like.

**Scope, as originally stated:** this needed a reader whose last request was more than 15 minutes
ago — a direct link, a shared URL, a search result, a browser restart — not client-side navigation
within an active session.

**Fix applied.** `useArticleEngagement.ts` now takes a `readerId: string | null` parameter and a
second effect that re-reads the summary once the reader session resolves to authenticated:

```ts
useEffect(() => {
  if (readerId === null) return;
  let cancelled = false;
  getArticleEngagement(articleId)
    .then((summary) => {
      if (cancelled) return;
      setState((current) => (current.status === 'ready' ? { ...current, summary } : current));
    })
    .catch(() => undefined); // the mount load already owns the unavailable state
  return () => { cancelled = true; };
}, [articleId, readerId]);
```

`EngagementBar.tsx` derives `readerId` from `session.status === 'authenticated' ? session.account.id
: null` and passes it through. One extra GET for signed-in readers only, on the same "replace the
guess with the server's number" pattern the like toggle already used.

**Test added.** `EngagementBar.test.tsx` — `'re-reads the summary once the session resolves,
correcting a like state read anonymously'` — queues an anonymous-looking first response
(`likedByReader: false`) followed by the authenticated re-read (`likedByReader: true`), and asserts
the button ends up `aria-pressed="true"`. A companion test confirms the re-read effect never fires
for a signed-out visitor (`getArticleEngagement` called exactly once). Both pass; full suite is
682/682.

### 2. Nit — offset paging drifts when a comment is posted between pages — Fixed (doc note)

`apps/api/src/modules/engagement/engagement.repository.ts:162-174`, with
`apps/web/components/article/useArticleEngagement.ts:158-161`

`loadMoreComments` sends `offset: state.comments.length` against a newest-first listing. If another
reader posts between the first page load and the reader pressing "Komentar lama", every row shifts
down one: the last comment of page 1 reappears as the first of page 2, and one comment becomes
unreachable.

**Not a deviation** — `specs/article-engagement/spec.md` specifies offset paging by name ("Further
comments are reachable by offset"), so head-insertion drift is inherent to what was asked for.
Self-posted comments are unaffected: `submitComment` prepends locally and the server's list grows by
the same one, so the offset stays aligned. Fixing it properly means keyset paging on
`(createdAt, id)`, which is a wire-contract change out of scope for this pass.

**Fix applied.** Recorded as a known limit in
`openspec/changes/add-article-engagement/design.md`, in the "Comments" section, alongside the
existing "Known limits, accepted rather than solved here" callouts for view counting:

> **Known limit, accepted rather than solved here.** Offset paging drifts under insertion: if
> another reader's comment lands ahead of the page boundary between one page load and the next,
> every row after it shifts down one, and the following `offset` re-serves the previous page's last
> comment instead of the next one. […] Fixing it properly means keyset paging on `(created_at, id)`,
> which changes the wire contract this section just established; offset is what was asked for here,
> so this is recorded rather than silently worked around.

No code change, matching the assessment that the current behavior is the spec's own choice, not a
bug.

### 3. Nit — comment count formatted two different ways on one page — Fixed

`apps/web/components/article/CommentSection.tsx:123` vs
`apps/web/components/article/EngagementBar.tsx:10-12, 94`

`EngagementBar` ran counts through a local `formatCount` (`toLocaleString('id-ID')`);
`CommentSection`'s heading rendered `{commentCount}` raw — invisible below 1000, divergent above it
("1.200 komentar" vs "1200").

**Fix applied.** Extracted `formatCount` to `apps/web/lib/formatCount.ts` (matching the existing
`readingTime.ts` / `signInHref.ts` pattern of small focused lib modules — importing it from
`EngagementBar.tsx` directly would have made `CommentSection.tsx` depend on its own parent, a
circular import). Both components now import the shared function.

### 4. Nit — migration comment names BYPASSRLS; the architecture says table ownership — Withdrawn

`supabase/migrations/0005_fast_vindicator.sql:75`

Re-checked before touching it, since this is infra-adjacent security documentation. Two things
changed my assessment:

- **The exact phrasing is not new to this PR.** `grep` across `supabase/migrations/*.sql` finds the
  identical sentence — *"policies granted to anon/authenticated; the API's Postgres role has
  BYPASSRLS and is the only intended writer"* — in every migration since `0000_useful_red_shift.sql`.
  It is inherited boilerplate, not something `add-article-engagement` introduced.
- **I cannot verify which claim is true.** `docs/ARCHITECTURE.md` §6.3 says the API role owns the
  tables; the migrations say the role has the `BYPASSRLS` attribute. These are not mutually
  exclusive — a role can own tables *and* separately carry `BYPASSRLS` — and nothing in this repo
  provisions the actual Postgres role (no `CREATE ROLE` / `ALTER ROLE ... BYPASSRLS` / `OWNER TO`
  anywhere in `supabase/`; that's infrastructure set up outside version control). Editing only
  `0005`'s comment would leave it disagreeing with the five migrations before it, on a claim I have
  no way to confirm either direction of.

Editing one file's wording to match `ARCHITECTURE.md` would look like a fix while actually just
guessing which of two plausible, non-contradictory mechanisms is the accurate one — and doing it
only in the newest migration would make that migration inconsistent with its five predecessors for
no verified reason. This is a documentation question for whoever owns the Supabase project's role
grants, not a code-review fix. No change made; withdrawn from this PR's findings rather than
resolved incorrectly.

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
| `CLAUDE.md` — build, lint, tests, no TS errors before completion | — | Yes — eslint clean, typecheck clean, 682/682 passing |
| `article-engagement` — draft article 404s, not 403 | `engagement.service.ts:20-22` | Yes — identical response for unknown and non-public |
| `article-engagement` — a muted reader may still like | `engagement.routes.ts:48` | Yes — `createsContent: false` |
| `article-engagement` — comment count matches the listing | `engagement.repository.ts:53-55` | Yes — one `visibleComments` predicate serves both |
| `article-engagement` — a reader cannot like the same article twice | `engagement.repository.ts:104-112`, `likes_reader_article_unique` | Yes — unique index is the race backstop |
| `article-engagement` — a signed-in reader's own like state is reported | `engagement.service.ts:53-62`, `useArticleEngagement.ts` | Yes — endpoint always honoured it; client now asks with a session (finding 1, fixed) |
| `article-engagement` — exhausting one budget does not exhaust another | `rateLimit.ts:157-161` | Yes — separate `name` per budget |
| `article-engagement` — readers behind one address have separate comment budgets | `rateLimit.ts:174-176` | Yes — keyed on reader id |
| `web-public-site` — failed load reported, not faked | `EngagementBar.tsx:61-69` | Yes — unavailable state, never zeroes |
| `web-public-site` — signed-out reader prompted, never shown a dead control | `EngagementBar.tsx:80`, `CommentSection.tsx:130-135` | Yes — prompt replaces both controls |
| `web-public-site` — neither control before the session is known | `EngagementBar.tsx:80-88`, `CommentSection.tsx:130-135` | Yes |
| `web-public-site` — the load control disappears at the end | `useArticleEngagement.ts:164` | Yes — `next.length === COMMENT_PAGE_SIZE` |
| `admin-dashboard` — top articles with title, public path, read count | `analytics.repository.ts:303-306`, `dashboard.ts` | Yes — the scenarios are framed on what the dashboard *returns*, and `slug` is in the response |
| `admin-dashboard` — readership shares the dashboard's instant and timezone | `analytics.service.ts:15-24` | Yes — one shared `now`, existing Jakarta helpers |
