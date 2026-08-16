# Review report

**Verdict:** Approve with changes

## Reviewed at
| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...add-login-reader` (PR #12, head `49b03dd`) | 14 | +1220 / -4 | 2026-08-16 |

Counts exclude `review-report.md` itself, which is on the branch as a review artifact rather than
product code and is not reviewed here. The full range reads 15 files / +1413 / −622 with it
included.

## Summary

This is the implementation of the `add-reader-web-sign-in` spec reviewed on this branch earlier —
an authenticated fetch client with a bounded recovery cycle, a reader session provider, and a
session-dependent masthead control, plus 20 new tests. The spec artifacts themselves are unchanged
apart from checking tasks off, so this review is of the code.

**The implementation matches its spec closely, and the verification claims in `tasks.md` are
true.** I ran them: `tsc --noEmit` is clean, `eslint` is clean on every changed file, and the suite
is 545 passing across 77 files (41 in `apps/web`, 20 of them new). Every normative requirement in
`specs/reader-session/spec.md` traces to code and to a test — the anonymous fast path, the
single-retry bound across both recovery paths, single-flight refresh, sign-out succeeding
regardless of the call's outcome, and the undifferentiated anonymous presentation for a rejected
reader. The recovery cycle in `authApi.ts:125-146` is genuinely careful: `alreadyRetried` bounds
both paths with one flag, and `refreshSession`/`bootstrapCsrfCookie` call `rawFetch` directly so
neither can re-enter recovery, which is exactly what the spec requires.

One Minor finding and two Nits. The Minor is a real spec gap — the sign-in return target drops the
query string — and its obvious fix would break static prerendering, so it is worth stating
carefully. Nothing here is a correctness, security, or performance defect in the recovery cycle
itself.

Standards used: `CLAUDE.md`, `docs/ARCHITECTURE.md`, this change's own spec artifacts, and the
sibling `apps/admin/src/lib/api.ts` the design mirrors. There is no `docs/adr/`, no
`CONTRIBUTING.md`, and no `openspec/AGENTS.md`; `openspec/config.yaml` is an unfilled template.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Minor | correctness | `apps/web/components/layout/ReaderControl.tsx:19` | Sign-in return target drops the query string, losing the news filter |
| 2 | Nit | conventions | `apps/web/components/layout/StickyNav.tsx:31` | The control becomes a third `justify-between` child, re-centering `NavLinks` |
| 3 | Nit | correctness | `apps/web/components/layout/ReaderControl.tsx:42` | A broken avatar URL has no fallback, unlike a null one |

## Details

### 1. Minor — Sign-in return target drops the query string

`ReaderControl.tsx:19` takes the return target from `usePathname()`:

```tsx
const pathname = usePathname();
// …
<a href={signInHref(pathname ?? '/')} …>
```

`usePathname()` returns the path only — never the search string. `spec.md:15` requires the site to
"supply the reader's current in-app location as the post-sign-in return target", and `/news` is
searchParams-driven precisely so that filter state is part of the location:
`docs/ARCHITECTURE.md` §8.1 records the reason as "Filters live in the URL, so results are
shareable", and `app/news/page.tsx:21-22` reads `categorySlug` from it.

So a reader browsing `/news?category=budaya` who signs in lands back on an unfiltered `/news`. The
spec's own scenario uses an article, which has no query string, so this is invisible to the tests
— `ReaderControl.test.tsx:65` asserts only `encodeURIComponent('/news/some-article')`.

**Fix, with a trap worth naming.** The obvious change — adding `useSearchParams()` — is the wrong
one here. In the App Router, `useSearchParams()` in a Client Component forces the nearest Suspense
boundary and deopts static prerendering for routes that lack one, which is exactly what tasks 7.2
and 7.3 exist to protect. Two safer options:

- Build the href at click time from `window.location.pathname + window.location.search`, keeping
  the anchor a plain full-document navigation:
  ```tsx
  <a
    href={signInHref(pathname ?? '/')}
    onClick={(e) => {
      e.currentTarget.href = signInHref(window.location.pathname + window.location.search);
    }}
  >
  ```
- Or wrap `ReaderControl` in an explicit `<Suspense>` where it is rendered, and use
  `useSearchParams()` deliberately — more code, but no click-time mutation.

Either way, add a test asserting a `?`-bearing location survives into `next=`. Note the server side
already handles it: `resolveRedirectTarget` (`apps/api/src/lib/redirect.ts:14-29`) resolves the
relative target against `APP_ORIGIN` and preserves the query, so only the client is dropping it.

### 2. Nit — The control becomes a third `justify-between` child, re-centering `NavLinks`

`StickyNav.tsx:26-32` was a two-child `justify-between` row — wordmark left, `NavLinks` right.
`StickyNav.tsx:31` adds `<ReaderControl className="shrink-0" />` as a third child, so the browser
now distributes three items and `NavLinks` moves to the centre of the sticky bar.

`design.md:124` described this as rendering "in the sticky bar's existing right-hand space", which
reads as the control joining the right edge rather than the nav relocating. The result may well be
what you want — a centred nav in a sticky bar is a perfectly reasonable broadsheet treatment — but
it is a visible change to existing chrome that no requirement asks for, so it is worth confirming
it was chosen rather than inherited from the flex algebra.

**If unintended**, group the two right-hand items so the row stays two-child:

```tsx
<Link href="/" …>SIDERS</Link>
<div className="flex items-center gap-4">
  <NavLinks />
  <ReaderControl className="shrink-0" />
</div>
```

The masthead placement (`SiteHeader.tsx:11-16`) has no such issue — it is its own `justify-end`
row, which is clean.

### 3. Nit — A broken avatar URL has no fallback, unlike a null one

`ReaderControl.tsx:42-53` handles `avatarUrl === null` well, falling back to an initial in a filled
circle, which satisfies the spec scenario "A reader without an avatar still renders … without a
broken or placeholder-less image" (`spec.md:110`).

A non-null URL that fails to load is a different case and is not handled: Google avatar URLs on
`lh3.googleusercontent.com` can start 404ing after a profile change, and the result is the broken
image icon the scenario is trying to avoid. `referrerPolicy="no-referrer"` is the right call and
should stay, but it does mean the request carries less context, not more.

**Fix** — one `onError` that reuses the fallback already written:

```tsx
const [imageFailed, setImageFailed] = useState(false);
// …
{account.avatarUrl && !imageFailed ? (
  <img … onError={() => setImageFailed(true)} />
) : (
  <span …>{account.name.charAt(0).toUpperCase()}</span>
)}
```

## Verified against the spec

Every normative requirement traces to code and a test. Confirmed by reading both, and by running
the suite:

| Requirement (`specs/reader-session/spec.md`) | Implementation | Test |
|---|---|---|
| Sign-in is a top-level navigation, site performs no part of the exchange | `ReaderControl.tsx:7-8,33` — plain `<a href>`, no handler | `ReaderControl.test.tsx:52-66` |
| No session marker → no session request | `readerSession.tsx:29-32` — `hasCsrfCookie()` before any fetch | `readerSession.test.tsx:44-57` asserts `fetch` never called |
| 401 → refresh → retry exactly once | `authApi.ts:133-137` | `authApi.test.ts:67-83` |
| Failed refresh → anonymous, no retry | `authApi.ts:135` | `authApi.test.ts:85-98` |
| No second refresh after a failed retry | `authApi.ts:129` `alreadyRetried` | `authApi.test.ts:100-115` |
| Refresh is single-flight | `authApi.ts:88-99` | `authApi.test.ts:117-140` — asserts exactly 1 refresh across 2 concurrent 401s |
| Refresh/re-pair issued outside the recovery cycle | `authApi.ts:91,109` call `rawFetch` directly | implied by the two counts above |
| CSRF failure re-pairs, never refreshes | `authApi.ts:139-142` | `authApi.test.ts:142-156` asserts no `/auth/refresh` call |
| Recovery paths do not chain | `authApi.ts:129` | `authApi.test.ts:158-173` |
| Masthead reflects session state; nothing signed-in while loading | `ReaderControl.tsx:24-61` | `ReaderControl.test.tsx:37-98` |
| Public content does not vary by session | provider is a Client Component boundary; no `cookies()`/`headers()` added | `revalidate` exports intact on `app/page.tsx:13`, `app/news/[slug]/page.tsx:12` |
| Sign-out ends the local session either way | `readerSession.tsx:38-46` — `finally` sets anonymous | `readerSession.test.tsx` (4.3) |
| Rejected reader presented as signed out, without explanation | `readerSession.tsx:35` — bare `.catch` | covered by the anonymous-state assertions |

Verification claims in `tasks.md:68` (9.2) were re-run and hold:

- `npx tsc --noEmit -p apps/web/tsconfig.json` — exit 0.
- `npx eslint` on all nine changed/new files — exit 0, no output.
- `npx vitest run` — **77 files, 545 tests, all passing**; `apps/web` alone is 41.
- `next build` was not run here either, for the same reason 7.2 gives (no live API or database).
  That caveat is stated honestly in the task rather than glossed, which is the right call.

Also verified: `apps/web/lib/api.ts` is untouched and nothing imports the new module into it
(task 1.7), so the public client stays caching-capable and the authenticated one stays
caching-incapable — the module boundary the design rests on is intact.

## Carried over from the spec review — still open

The implementation was reviewed against the spec, but two of the three findings from the earlier
review of this same branch were resolved only in code, not in the artifacts they were raised
against:

- **`tasks.md:27` (3.4) still reads "Wrap `children`".** The code got this right —
  `app/layout.tsx:31-35` wraps `<SiteHeader />`, `{children}`, and `<SiteFooter />` together, which
  is why `ReaderControl` can read the context from inside the header. The task text that would have
  misled was simply checked off unchanged. Cosmetic now that the code exists, but the task is the
  document that gets archived.
- **`docs/ARCHITECTURE.md` §8.1 is unchanged** and still reads "forwarding the incoming cookie
  header so the server render knows whether the reader is signed in" — the approach this change
  establishes must not be taken from the root layout. Task 9.1's note resolves the *other* doc
  question (`COOKIE_DOMAIN` and `GOOGLE_REDIRECT_URI`, genuinely covered by §10) but not this one.
- **Task 1.4's single-flight qualifier** now has an implementation (`authApi.ts:106-116`) and still
  no spec requirement or concurrency test behind it. Unchanged from the earlier Nit; still not worth
  blocking on.

## Rule check

| Rule / precedent | Complies? |
|---|---|
| `CLAUDE.md` — TypeScript strict, never `any` | Yes — no `any` in any new file; `tsc` clean |
| `CLAUDE.md` — Testing: build, lint, tests, no TS errors before completion | Yes — verified independently; build caveat stated honestly in 7.2/9.2 |
| `CLAUDE.md` — Composition over inheritance, small focused functions | Yes — `withRecovery` takes a `perform` thunk rather than branching per call site |
| `CLAUDE.md` — No duplicated logic | Deliberate and argued: `ApiError`/envelope shape is duplicated from `lib/api.ts` per `design.md:73-75`, so the authenticated client can never accept caching options |
| `CLAUDE.md` — Self-documenting code | Yes — comments explain *why* (the single-flight rationale at `authApi.ts:80-87` cites the reuse-detection spec) rather than restating the code |
| `CLAUDE.md` — Frontend: hooks over classes, reusable components | Yes — one provider + hook, one `ReaderControl` shared by both surfaces |
| `docs/ARCHITECTURE.md` §8.1 — "A single fetch wrapper handles the 401 → refresh → retry cycle in one place; never scatter that logic across call sites" | Yes — `withRecovery` is the only place |
| `docs/ARCHITECTURE.md` §8.1 — Server Components forward the cookie header | No — deliberately deferred and argued in `proposal.md:33`, but §8.1 still unamended (carried over, above) |
| Mirrors `apps/admin/src/lib/api.ts` in shape, keyed on 401 rather than 403 | Yes — and correctly keeps the CSRF branch 403-keyed (`authApi.ts:139`) |

---
_Generated by [Claude Code](https://claude.ai/code)_
