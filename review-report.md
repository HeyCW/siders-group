# Review report

**Verdict:** Approve with changes → **Approved** (all 28 findings fixed, see Disposition below)

## Reviewed at
| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...HEAD` (PR #9, `claude/admin-dashboard-analytics-3lxi20`, head `f30ea0b`) | 5 | +338 / -0 | 2026-08-13 |

Round 2 (`73b382b`): all 28 findings fixed — 27 posted as inline GitHub review comments and resolved as threads; #26 was merged into #8's comment since both anchor `proposal.md:17`. Directory renamed `add-dashboard-admin` → `add-admin-dashboard` (#25), so file paths below are pre-rename; the same content now lives under the new path.

## Summary

Spec-only change: the `add-dashboard-admin` OpenSpec proposal for a `GET /admin/dashboard`
endpoint returning six read-only tiles. No implementation code, so this review checks two things —
whether the change's many factual claims about the existing codebase are true, and whether the
design holds up if built exactly as written.

Both largely check out. The factual claims are unusually accurate for a document of this density
(see "Verified as accurate"), and the reasoning — deferring the traffic pipeline, reusing the
public-visibility predicates rather than re-deriving them, pinning a timezone before a second
consumer forces it — is sound and well-argued. Two findings rise to **Major**, and both are
resolvable by editing the artifacts before task 1.1 begins: the content-debt tile is specified with
`IS NULL` against columns this codebase deliberately fills with the empty string, so its two
headline counts would read ~zero on a database full of real debt; and `upNext` is specified to
return pre-publication titles and slugs while `proposal.md:24` states the board shows "counts
only", leaving the one row-level disclosure unrecorded in the normative spec. Everything else is
Minor or Nit.

Standards used: `CLAUDE.md`, `docs/ARCHITECTURE.md`, the five archived changes in
`openspec/changes/archive/`, and the existing capability specs in `openspec/specs/`. There is no
`docs/adr/`, no `CONTRIBUTING.md`, and no `openspec/AGENTS.md`, and `openspec/config.yaml` is an
unfilled template — so conventions findings cite `file:line` precedent from an archived change
rather than a named rule.

## Severity calibration

A first pass graded this 1 Critical + 7 Major, which was wrong on both counts. Corrections made
after re-verifying each claim against the repo:

- **No finding is Critical.** The scale reserves Critical for data loss, a security hole, or a
  break in production behaviour. This PR ships zero lines of executable code; merging it breaks
  nothing. Every defect here is in a *plan*, and the remedy in every case is editing a markdown
  line before anyone writes the query — which is precisely what the spec-first workflow exists to
  buy. Finding 1 remains the most valuable item in the review; it is not Critical.
- **The landing-page finding was out of context and is now Minor.** The first pass demanded a
  permission-aware `/` redirect so staff lacking `dashboard.view` are not stranded. But
  `apps/admin/src/App.tsx` has no auth or permission gating on *any* route today, and `LoginPage`
  is a literal `<div>Login</div>` stub — admin route protection is unbuilt work that belongs to an
  auth-routing change, not to a dashboard spec. What survives is the narrow, in-scope part: a
  change that declares itself BREAKING has no spec coverage for the breaking behaviour.
- **Four findings were downgraded Major → Minor** for blast radius: the overdue grace period (a
  transient sub-60s false positive, fixed by one interval clause), the overdue scenario wording (an
  implementer reading `design.md` would not build the broken version), `mediaMissingAlt` (a
  cosmetically stuck number on one tile), and the missing `## Capabilities` section (a documentation
  gap — grading a missing markdown heading alongside a silently-wrong query is inflation).
- **The cadence finding was downgraded Major → Minor.** The first pass called `spec.md:38`
  ("exactly eight weekly buckets") a contradiction of `tasks.md:23`'s unspecified window. It is not:
  the spec is normative and already gives the answer, so the task line is merely looser than the
  spec, not in conflict with it. The genuinely unresolved parts — week start day, and whether the
  current partial week is one of the eight — are worth fixing and are what the finding now says.

Net: 2 Major, 22 Minor, 4 Nit → **Approve with changes** under the standing rule (1–2 Major, or
any Minor).

## Findings

| # | Severity | Aspect(s) | File:line | Title | Disposition |
|---|---|---|---|---|---|
| 1 | Major | correctness | [design.md:59](openspec/changes/add-dashboard-admin/design.md:59) | `IS NULL` is the wrong emptiness test — content-debt reads ~0 forever | Fixed |
| 2 | Major | security | [tasks.md:14](openspec/changes/add-dashboard-admin/tasks.md:14) | `upNext` discloses pre-publication titles and slugs the spec never records | Fixed (documented, kept fields) |
| 3 | Minor | correctness | [tasks.md:23](openspec/changes/add-dashboard-admin/tasks.md:23) | Cadence week boundary unspecified: start day, and the partial current week | Fixed |
| 4 | Minor | correctness | [design.md:93](openspec/changes/add-dashboard-admin/design.md:93) | Overdue count has no grace period against a one-minute cron | Fixed |
| 5 | Minor | correctness | [spec.md:94](openspec/changes/add-dashboard-admin/specs/admin-dashboard/spec.md:94) | Overdue scenario's wording contradicts its own predicate | Fixed |
| 6 | Minor | correctness | [design.md:65](openspec/changes/add-dashboard-admin/design.md:65) | `mediaMissingAlt` is unactionable — nothing in the product sets `media.alt` | Fixed (dropped the tile) |
| 7 | Minor | conventions | [proposal.md:29](openspec/changes/add-dashboard-admin/proposal.md:29) | Missing the `## Capabilities` section the archived proposals carry | Fixed |
| 8 | Minor | correctness, conventions | [proposal.md:17](openspec/changes/add-dashboard-admin/proposal.md:17) | Declared BREAKING behaviour has no spec coverage | Fixed |
| 9 | Minor | correctness | [design.md:73](openspec/changes/add-dashboard-admin/design.md:73) | Pipeline/cadence/debt re-derive published-ness, against this design's own rule | Fixed (documented as intentional) |
| 10 | Minor | correctness | [spec.md:45](openspec/changes/add-dashboard-admin/specs/admin-dashboard/spec.md:45) | Three of six content-debt counts have no covering scenario | Fixed |
| 11 | Minor | security | [spec.md:20](openspec/changes/add-dashboard-admin/specs/admin-dashboard/spec.md:20) | Anonymous scenario mandates a 401 the declared guard never returns | Fixed |
| 12 | Minor | performance | [design.md:113](openspec/changes/add-dashboard-admin/design.md:113) | "No purpose-built index" premise is false, and it licenses a seq scan | Fixed |
| 13 | Minor | performance | [tasks.md:34](openspec/changes/add-dashboard-admin/tasks.md:34) | ~14 parallel round-trips against a pool whose default max is 10 | Fixed (9 queries) |
| 14 | Minor | performance | [tasks.md:28](openspec/changes/add-dashboard-admin/tasks.md:28) | `dueWithin48h` is the response's only uncapped output | Fixed |
| 15 | Minor | performance | [tasks.md:44](openspec/changes/add-dashboard-admin/tasks.md:44) | Charting dependency would land eagerly on the new landing route | Fixed |
| 16 | Minor | correctness | [tasks.md:35](openspec/changes/add-dashboard-admin/tasks.md:35) | `weekStart` timezone unspecified; bucket labels shift off a naive timestamp | Fixed |
| 17 | Minor | correctness | [tasks.md:47](openspec/changes/add-dashboard-admin/tasks.md:47) | "N sign-ins" mislabels a distinct-reader count | Fixed |
| 18 | Minor | correctness | [proposal.md:23](openspec/changes/add-dashboard-admin/proposal.md:23) | Non-Goals names tiles this change does not ship | Fixed |
| 19 | Minor | correctness, hygiene | [tasks.md:24](openspec/changes/add-dashboard-admin/tasks.md:24) | "five queries" for six content-debt counts | Fixed |
| 20 | Minor | hygiene | [design.md:84](openspec/changes/add-dashboard-admin/design.md:84) | Flat vs nested `curationIntegrity` field names across documents | Fixed |
| 21 | Minor | correctness | [design.md:5](openspec/changes/add-dashboard-admin/design.md:5) | Migration citation off by one line (`:119` is `role.manage`) | Fixed |
| 22 | Minor | conventions | [proposal.md:31](openspec/changes/add-dashboard-admin/proposal.md:31) | Impact drops the standard `Dependencies` and `Docs` bullets | Fixed |
| 23 | Minor | conventions | [design.md:11](openspec/changes/add-dashboard-admin/design.md:11) | Goals are stated nowhere; the deferral target has no Goals section | Fixed |
| 24 | Minor | conventions | [tasks.md:51](openspec/changes/add-dashboard-admin/tasks.md:51) | Task 4.9 hedges on a repo fact; both of its branches are false | Fixed |
| 25 | Nit | conventions | [.openspec.yaml:1](openspec/changes/add-dashboard-admin/.openspec.yaml:1) | Change directory name inverts the capability slug it introduces | Fixed |
| 26 | Nit | conventions | [proposal.md:17](openspec/changes/add-dashboard-admin/proposal.md:17) | BREAKING bullet deviates from the uniform label and terminal position | Fixed |
| 27 | Nit | correctness | [design.md:89](openspec/changes/add-dashboard-admin/design.md:89) | Worker header comment is misquoted | Fixed |
| 28 | Nit | hygiene | [design.md:115](openspec/changes/add-dashboard-admin/design.md:115) | Cross-reference to `tasks.md` without a section number | Fixed |

All 28/28 fixed. Verified: `openspec/changes/add-admin-dashboard/` (post-rename) contains blank-aware content-debt predicates, the five-minute overdue grace period, Monday-pinned/partial-week-inclusive cadence bucketing with a sargable filter, `dueWithin48h` capped at 20 with `dueWithin48hTotal`, `mediaMissingAlt` fully removed from all four artifacts, 9 consolidated queries (was ~14), `## Capabilities` + `Dependencies`/`Docs` Impact bullets + explicit `Goals:` list added to match the archived-proposal shape, task 4.9's hedge resolved, and the directory renamed to `add-admin-dashboard`. `spec.md` grew from 8 requirements/22 scenarios to 9 requirements/33 scenarios to cover the gaps.

## Is it worth acting on?

Not all 28 earn a round trip. Triaged by whether the cost of *not* fixing it lands after
implementation starts:

**Fix before task 1.1 (4 items, ~20 minutes of edits).** These change what gets built:
findings **1** (blank-aware predicates), **2** (decide and record what `upNext` returns),
**3** + **16** (pin week start day, partial-week inclusion, and the `weekStart` format), and
**4** (grace-period interval). Each is a one-to-three-line edit now; each is a rewritten query,
a contract change, and a test after implementation.

**Fold in while editing (cheap, no debate).** **19**, **20**, **21**, **5**, **17**, **18**, **28**
— internal inconsistencies and wrong citations, all single-line corrections. **12** matters
slightly more than its size suggests: the false "no index exists" premise is what would let an
implementer write the cadence query non-sargably.

**Worth a decision, not necessarily a change.** **6** (drop `mediaMissingAlt` or commit to making
it settable), **9** (state whether pipeline/cadence/debt intentionally report authoring status
rather than public visibility), **11** (match the scenario to `requirePermission`'s actual 403),
**14**/**15** (cap the list; avoid a charting dependency on the landing route). Answer them in
`design.md` so they read as decisions rather than oversights.

**Optional / defer.** **7**, **8**, **22**, **23**, **24**, **25**, **26** are documentation-shape
conventions, and **13** is a pool-sizing concern that is real but not yet load-bearing. Worth doing
if another pass happens anyway; not worth blocking on by themselves. **10** is judgement — add the
`uncategorized` scenario at minimum, since it is the one count with non-obvious semantics.

## Details

### 1. Major — `IS NULL` is the wrong emptiness test; the content-debt tile reads ~0 forever
`design.md:59-60` (mirrored in `tasks.md:24` and `spec.md:45`) specifies `missingSeoDescription`
as `status = 'published' AND seo_description IS NULL`, and `missingExcerpt` as `excerpt IS NULL`.
In this codebase those columns hold the empty string, not NULL, for essentially every article the
editor has touched:

- `apps/admin/src/pages/ArticleEditPage.tsx:32,34` seed the form with `article.excerpt ?? ''` and
  `article.seoDescription ?? ''`.
- The debounced autosave at `:107,112` sends both fields unconditionally, and the comment at
  `:102-106` says this is deliberate — an empty string is a valid, intentional value, and
  `articleAutosaveRequestSchema` has no `.min()` on any of them.
- `packages/contracts/src/article.ts` confirms `excerpt: z.string().max(1000).optional()` and
  `seoDescription: z.string().max(500).optional()` — no `.min(1)`.
- `apps/api/src/modules/articles/article.service.ts:96,99` pass the value straight through, so
  `''` lands in the column verbatim. Nothing coerces `''` to NULL anywhere.

So a published article saved without an SEO description has `seo_description = ''` and is excluded
by the specified predicate. The two headline debt counts would report zero on a database full of
actual debt. `featured_media_id` is unaffected — it is a uuid FK and genuinely NULL when unset.

**Fix:** make the predicates blank-aware —
`status = 'published' AND (seo_description IS NULL OR btrim(seo_description) = '')`, likewise for
`excerpt`. Update `design.md:59-60`, `tasks.md:24`, and `spec.md:45` ("missing an SEO description"
→ "having no non-blank SEO description") together, and add a `spec.md` scenario for a published
article whose SEO description is an empty string. Normalizing `''` → NULL at the service boundary
plus a backfill is the alternative, but it contradicts this change's own "no migration" claim
(`proposal.md:33`), so the blank-aware predicate is the cheaper fix.

### 2. Major — `upNext` discloses pre-publication headlines and slugs to a `dashboard.view`-only role
`tasks.md:14` specifies `upNext.dueWithin48h` as `Array<{ id, title, slug, publishedAt }>` over
articles with `status = 'scheduled'` and `published_at BETWEEN now() AND now() + 48h`
(`tasks.md:28`). Every row in that window has a strictly future `published_at`, and
`isPubliclyVisible` (`apps/api/src/modules/articles/article.repository.ts:171-175`) treats a
`scheduled` article as visible only when `publishedAt <= now` — so the entire list is content the
public cannot reach. Today those titles and slugs are obtainable only through routes gated on
`requirePermission('news.manage')` (`apps/api/src/modules/articles/article.routes.ts:23-32`).

This is reachable, not theoretical: only Owner is seeded, and
`openspec/specs/rbac-management/spec.md:27-33` lets any `role.manage` holder create a role with an
arbitrary subset of the catalog. A `dashboard.view`-only role is constructible today.

The no-per-tile-gating decision itself is deliberate and is not the finding. The problem is that
the documented trade-off is written entirely in aggregate terms and never names the one tile that
returns identifiable rows: `design.md:52` enumerates only reader signup/activity counts;
`design.md:114` says the permission becomes "meaningfully more powerful" without naming anything
row-level; `proposal.md:24` asserts "tiles show counts only in this change", which `tasks.md:14`
contradicts outright; and `spec.md:83` never states the field set, so nothing normative records
the disclosure. On a news site an embargoed headline is exactly the class of data that leaks early,
and the analysis that justified single-permission gating was made against a payload that does not
match what `tasks.md` specifies.

**Fix — pick one, and record it normatively either way:**
- **(a) Keep the single gate, drop the sensitive fields.** Change `tasks.md` 1.6 to
  `dueWithin48h: Array<{ id: string, publishedAt: string }>` (or a bare `dueWithin48hCount`), and
  add to the spec requirement: "The due-soon report SHALL NOT include the title, slug, or any other
  content of an article that is not yet publicly visible." Preserves the operational value (how
  many, and when) with no embargo exposure.
- **(b) Keep the titles, state the exposure.** Add a `spec.md` requirement and scenario recording
  that the report includes titles and slugs of not-yet-visible articles, amend `design.md:52` to
  name it, and fix `proposal.md:24`, which is false as specified.

### 3–24. Minor

3. **`tasks.md:23` — the cadence week boundary is unspecified in two ways that matter.** 2.3 says
   to group by `date_trunc('week', published_at AT TIME ZONE 'Asia/Jakarta')` "over published
   articles in the trailing 8 weeks" without stating the filter, and `design.md:34` supplies none.
   `spec.md:38` is normative and already settles the bucket count ("exactly eight"), so the task
   line is looser than the spec rather than in conflict with it. What is genuinely unresolved:
   (a) the **week start day** — Postgres `date_trunc('week', …)` is ISO/Monday-based, a convention
   this change explicitly sets out to pin (`design.md:32`) yet leaves implicit; and (b) whether the
   current, still-running week is one of the eight — if it is, the newest bucket renders as a
   publishing collapse every single week unless the UI marks it partial. A third, smaller point:
   writing the filter the natural way alongside the bucketing
   (`WHERE date_trunc('week', published_at AT TIME ZONE …) >= …`) wraps the indexed column in a
   function and loses `articles_status_published_at_idx` (see finding 12).
   **Fix:** state in `design.md:32` that weeks start Monday and in `spec.md:34/38` that the newest
   bucket is the current incomplete week; pair the latter with `tasks.md:46`. Pin the filter shape
   in 2.3 as `WHERE status = 'published' AND published_at >= $cutoff`, with `$cutoff` computed as
   the start of the Jakarta week seven weeks back and `AT TIME ZONE` confined to the GROUP BY.
   The grouping expression itself is correct — `published_at` is `timestamptz`, so the Jakarta
   truncation gives genuine Jakarta weeks exactly as `spec.md:40-42` claims.
4. **`design.md:93` — the overdue count has no grace period.** `design.md:89` claims a nonzero
   count means "the worker (or its cron trigger) likely isn't running", but `apps/api/src/server.ts`
   registers it on a one-minute cron (`scheduler.registerJob('* * * * *', …)`, verified). So in
   normal operation every scheduled article sits in the overdue set for up to ~60s after its
   publish time — longer for a batch, since the worker awaits `revalidateArticlePaths` per article.
   Combined with the copy `tasks.md:48` prescribes ("check the publish worker"), a healthy system
   occasionally tells editors to go investigate. Transient and cosmetic, but it is the exact false
   alarm `design.md:89` sets out to avoid, reintroduced by its own predicate. **Fix:** one clause —
   `published_at <= now() - interval '5 minutes'` — updated across `design.md:93`, `tasks.md:28`,
   `spec.md:83`, plus a scenario that an article one minute past due is not yet counted.
5. **`spec.md:94` — the overdue scenario's wording contradicts its predicate.** "…whether or not
   the scheduled-publish worker has yet promoted it to `published`" cannot hold alongside
   `status = 'scheduled'`: once promoted, the row necessarily leaves the predicate, and that is the
   mechanism that makes the count a health signal. An implementer reading `design.md:89-95` will
   build the right thing, which is why this is wording rather than a defect — but `spec.md` is the
   normative artifact and should not need `design.md` to disambiguate it. **Fix:** "…because the
   worker has not yet promoted it", plus the negative scenario (once promoted, no longer counted).
6. **`design.md:65` — `mediaMissingAlt` is unactionable as the product stands.** `IS NULL` is the
   right test here (`mediaApi.ts` only appends `alt` when truthy; `media.service.ts:31` writes
   `input.alt ?? null`). The problem is that nothing sets it: all four upload call sites
   (`ArticleEditPage.tsx:169,185`, `ReelLibraryPage.tsx:80,138`) omit the metadata argument,
   `mediaApi` exposes no `update` for the `PATCH /media/:id` endpoint that `mediaService.update`
   already backs, and `apps/admin/src/pages/` has no media page (all verified). The tile would show
   a number equal to total media that no editor can reduce. **Fix:** drop the count from this
   change, or add tasks to make it settable — and either way state the choice in `design.md` so it
   reads as a decision rather than an oversight.
7. **`proposal.md:29` — no `## Capabilities` section.** Verified present in the archived proposals
   (`add-reels-curation:35`, `add-home-curation:27`, `add-auth-foundation:19`), each with
   `### New Capabilities` / `### Modified Capabilities` between Non-Goals and Impact. The
   information is instead folded into an `- **Affected specs**` Impact bullet, which drops the
   `### Modified Capabilities: _None._` declaration that `add-home-curation:35` and
   `add-reels-curation:43` both make explicitly, along with their statement of which capabilities
   are *consumed without a delta*. This change consumes exactly that way (`isPubliclyVisible`,
   `isReelPubliclyVisible`, `requirePermission`), so a reader cannot tell whether those specs were
   considered and deliberately left undeltaed. **Fix:** add the section, matching
   `openspec/changes/archive/2026-08-12-add-reels-curation/proposal.md:35-45`.
8. **`proposal.md:17` — the declared BREAKING behaviour has no spec coverage.** The proposal flags
   the `/` → `/dashboard` redirect as BREAKING and `tasks.md:50` implements it, but
   `specs/admin-dashboard/spec.md` contains no requirement or scenario about the admin landing
   route at all — so the one behaviour the change calls breaking is entirely unspecified.
   **Scope note:** an earlier draft of this review also demanded a permission-aware redirect so
   staff lacking `dashboard.view` are not stranded on a 403ing screen. That is out of scope here.
   `apps/admin/src/App.tsx` has no auth or permission gating on *any* route today and `LoginPage`
   is a `<div>Login</div>` stub — admin route protection is unbuilt work belonging to an
   auth-routing change, not to this one. **Fix:** add a requirement covering the landing behaviour,
   and note in `design.md` that a role without `dashboard.view` lands on a screen it cannot load
   until admin route guarding exists — so the follow-up owner inherits the question rather than
   rediscovering it.

9. **`design.md:73` — the "never re-derive visibility" rule is broken by three of the six tiles.**
   The design establishes that visibility must reuse `isPubliclyVisible` so a tile "can never
   drift from what the public site truly shows", and the curation tile follows it. But cadence
   (`tasks.md:23`), pipeline (`tasks.md:22`), and all four article debt predicates
   (`design.md:59-62`) use bare `status = 'published'`. Per
   `article.repository.ts:171-175` a `scheduled` article past its publish time *is* publicly
   visible — live on the site — yet is counted as `scheduled` in the pipeline, excluded from
   cadence, and exempt from every debt check while serving a page with no SEO description. Normally
   a ~60s window, but unbounded whenever the worker is down — the very condition the up-next tile
   detects. **Fix:** extend the predicates to `(status = 'published' AND published_at IS NOT NULL)
   OR (status = 'scheduled' AND published_at <= now())`, or state in `design.md:73` that these
   tiles intentionally report authoring status rather than public visibility, and why.
10. **`spec.md:45` — three of six content-debt counts have no scenario.** `missingExcerpt`,
    `missingFeaturedImage`, and `uncategorized` are named in the requirement and nowhere else.
    `uncategorized` is the notable omission: it is the only count with non-trivial semantics
    (`tasks.md:25` mandates `NOT EXISTS` specifically to avoid join row multiplication) and the one
    most likely to be got subtly wrong. **Fix:** add scenarios for a published article with zero
    `article_categories` rows (counted), one with two categories (counted once, excluded), and a
    published-vs-draft pair for `missingFeaturedImage`.
11. **`spec.md:20` — the anonymous scenario mandates a 401 the guard never returns.**
    `requirePermission` throws `AppError('Staff session required', 403, 'forbidden')` when
    `req.auth` is absent (`apps/api/src/middleware/authorize.ts:218-219`); the staff guards
    deliberately do not distinguish no-session from no-permission, unlike `requireReader`
    (`:110-114`). Taken literally this scenario yields either a failing test or a bespoke second
    auth path on one route — against the one-declaration-per-route shape
    `auditAuthorizationDeclarations` (`:289`) exists to police. **Fix:** reword the THEN to "rejects
    the request and returns no dashboard data, without distinguishing an absent session from an
    insufficient permission."
12. **`design.md:113` — the "no purpose-built index" premise is false.**
    `articles_status_published_at_idx` (`0001_silly_retro_girl.sql:104`) covers the pipeline GROUP
    BY, the cadence window, and both up-next predicates; `article_tags_tag_idx` (`0001:108`)
    supports the `unusedTags` anti-join; `article_categories`' composite PK (`0001:36`) leads with
    `article_id`, supporting the `uncategorized` `NOT EXISTS`. Only `media.alt IS NULL`,
    `readers.created_at`, and `readers.last_login_at` are genuinely unindexed — cheap scans on small
    tables, so the bullet's *conclusion* (add no index now) is right. The premise still matters: a
    reader who believes no index is in play has no reason to write the cadence query sargably, which
    is the trap in finding 3. **Fix:** restate the bullet accurately and add the corollary that the
    cadence query must keep `articles_status_published_at_idx` usable.
13. **`tasks.md:34` — ~14 parallel round-trips against a pool whose default max is 10.** Counting
    what the plan implies: pipeline 1, cadence 1, content debt 6, curation integrity 2, up next 2,
    readers 2. `Promise.all` over the shared handle is safe (precedent:
    `article.repository.ts:220`), but `packages/db/src/client.ts:12` constructs `new Pool({
    connectionString })` with no `max`, so pg's default of 10 applies — one dashboard load requests
    more connections than the pool holds and starves concurrent public reads. **Fix:** make the
    consolidation in 2.4 mandatory rather than parenthetical (`count(*) FILTER (WHERE …)` for the
    four article counts), and collapse 2.8 and 2.9 into one query each. Takes the fan-out to ~7.
14. **`tasks.md:28` — `dueWithin48h` is the only uncapped output.** Every other section is bounded
    by construction (scalars, or 8 fixed buckets). The 48-hour window is an editorial bound, not a
    technical one — a bulk import or batch scheduling makes both the query result and the payload
    grow without a ceiling, on a glance tile. **Fix:** add `LIMIT 20` and either cap the array in
    the 1.6 contract or add a sibling `dueWithin48hTotal: number` so the tile can render "…and N
    more".
15. **`tasks.md:44` — a charting dependency would land eagerly on the landing route.** 4.2 says
    "sparkline or bar chart"; `apps/admin/package.json` has no charting dependency, and 4.7
    registers `/dashboard` as a non-lazy route while 4.8 makes it the `/` target — so whatever it
    imports is in the initial bundle of every session. `App.tsx:11-14` sets the opposite precedent,
    lazy-loading the editor because Tiptap is ~450KB, citing `CLAUDE.md`'s "lazy-load large
    features"; lazy-loading is not available here because the dashboard is the landing screen. The
    tile renders 8 points and needs no library. **Fix:** specify inline SVG or CSS-sized bars, and
    state that no charting dependency is added.
16. **`tasks.md:35` — `weekStart` timezone unspecified.** `AT TIME ZONE 'Asia/Jakarta'` returns
    `timestamp without time zone`, so `date_trunc` yields a naive Jakarta-local Monday midnight;
    node-postgres parses that into a JS `Date` in the API process's local timezone, and
    `.toISOString()` then shifts it — landing the label on the preceding Sunday or following
    Tuesday depending on where the API runs, and not reproducing on a UTC CI box. **Fix:** format
    in SQL — `to_char(date_trunc(…), 'YYYY-MM-DD') AS week_start` — never round-tripping through a
    JS `Date`, and assert it in the 5.1 boundary test.
17. **`tasks.md:47` — "N sign-ins in the last 30 days" mislabels a distinct-reader count.**
    `activeLast30d` is `last_login_at >= now() - interval '30 days'` — readers whose *most recent*
    login is recent, not sign-in events. `readers.last_login_at` is a single overwritten timestamp,
    so event counts are not derivable at all: a reader who signed in forty times contributes one.
    This matters because `design.md:99` makes correct labelling of this exact tile a stated goal.
    **Fix:** "N readers signed in during the last 30 days".
18. **`proposal.md:23` — Non-Goals names tiles the change does not ship.** It says a
    `dashboard.view` holder "sees every tile, including staff dormancy and reader/moderation
    counts". `proposal.md:25` excludes moderation (confirmed — no such tables in any migration) and
    `design.md:48-49` places staff dormancy in the future. **Fix:** describe what actually ships,
    and note that future tiles inherit the same trade-off. (Fixing finding 2 touches this
    paragraph too.)
19. **`tasks.md:24` — "five queries" for six counts.** Task 1.4 lists six fields, `design.md:59-65`
    tabulates six predicates, `proposal.md:11` enumerates six, and `tasks.md:44` says "the six-line
    breakdown". "Five" is the lone outlier. **Fix:** say six.
20. **`design.md:84-85` — flat vs nested `curationIntegrity` field names.** design.md uses
    `curatedTotal`/`curatedVisible` and `reelsCuratedTotal`/`reelsVisible`; `tasks.md:15` specifies
    `{ home: { total, visible }, reels: { total, visible } }`. **Fix:** align on the nested form and
    restate `design.md:84-85` as `home.total`/`home.visible` and `reels.total`/`reels.visible`.
21. **`design.md:5` — migration citation off by one.** `0000_useful_red_shift.sql:119` is
    `('role.manage', …)`; `dashboard.view` is line 120. The substance is right and
    `packages/contracts/src/permission.ts:10` is exact, but `tasks.md:3` is a verification step
    someone will actually follow. **Fix:** change all three citations (`design.md:5`,
    `proposal.md:3`, `tasks.md:3`) to `:120`.
22. **`proposal.md:31` — Impact drops `Dependencies` and `Docs`.** Archived Impact sections use a
    recurring set: `Affected code` (5/5), `Dependencies` (5/5), `Migration` (5/5), `Docs` (4/5).
    `Dependencies` matters here because `tasks.md:3-7` does the prerequisite verification but the
    proposal never surfaces it; `Docs` because the change leans on `docs/ARCHITECTURE.md` §4 and
    §13 without saying whether either needs an edit (precedent for the answer:
    `add-home-curation/proposal.md`'s `- **Docs**: none required.`).
23. **`design.md:11` — Goals are stated nowhere.** All five archived designs open the section with
    an explicit `**Goals:**` list; the two most recent defer *only* Non-Goals to the proposal
    (`add-reels-curation/design.md:23`). This defers both, and `proposal.md` has no Goals section —
    so the sentence that follows restates scope, not goals. **Fix:** restore the split form.
24. **`tasks.md:51` — task 4.9 hedges, and both branches are false.** There is no shared nav
    component (`apps/admin/src/components/` holds only `MultiSelectChips`, `PreviewModal`,
    `SaveStatusIndicator`; `App.tsx:26-47` renders a bare `<Routes>`), and there is no "current
    per-page navigation convention" either — the only nav link anywhere is
    `ArticleEditPage.tsx:266`'s back-link, and `/curation`, `/reels`, `/categories`, `/tags` are all
    URL-only. The house style is to settle facts, not hedge (`tasks.md:3` ends "— it is; no
    migration needed"). **Fix:** state the finding and make a scoped decision.

### 25–28. Nits

25. **`.openspec.yaml:1` — the change directory inverts the capability slug.** Single-capability
    changes are named `add-` + the capability slug so the directory, delta path, and eventual
    `openspec/specs/` entry all read the same (`add-home-curation` → `specs/home-curation/`,
    `add-reels-curation` → `specs/reels-curation/`). This is `add-dashboard-admin/` introducing
    `specs/admin-dashboard/`. The slug `admin-dashboard` itself is fine. **Fix:** rename the
    directory to `add-admin-dashboard/`. (File contents are otherwise correct — `schema:
    spec-driven` plus a `created:` line matching the archived changes.)
26. **`proposal.md:17`** — all five archived proposals close `## What Changes` with a final bullet
    whose label is exactly `**BREAKING**`, qualification carried in the prose after the colon. Here
    the label itself is qualified (`**BREAKING (admin UX)**`) and sits fourth of six. The uniform
    terminal form is what makes `grep -rn 'BREAKING' openspec/` return one clean hit per proposal.
27. **`design.md:89`** — the worker header is quoted as naming `isPubliclyVisible()`;
    `scheduledPublishWorker.ts:9-11` actually names `article.repository.ts`'s `publiclyVisible()`.
    The two are deliberate twins (`article.repository.ts:161-175`) so the substance holds, but
    `publiclyVisible()` is the private SQL builder and `isPubliclyVisible()` the exported JS
    predicate — a distinction the rest of `design.md` depends on. Quote it as written or paraphrase.
28. **`design.md:115`** — "see `tasks.md`" should pin the section: `tasks.md` 4.6.

## Verified as accurate

Checked against the repo and found correct, so no finding was raised: `dashboard.view` is seeded
and exported from `packages/contracts/src/permission.ts:10` (exact); `isPubliclyVisible` and
`isReelPubliclyVisible` are exported and are what `homeFeed.service.ts` and `publicReels.service.ts`
actually use; `App.tsx`'s current routes and `/` → `/articles` redirect; the `apps/web` news-page
placeholders; `auditAuthorizationDeclarations` at `server.ts:73`; the `{ success: true, data }`
envelope in `curation.controller.ts`; the generic `requirePermission` test in `authorize.test.ts`
and the no-per-route-test convention that task 5.2 relies on; `extensions.ts:28`; every
`docs/ARCHITECTURE.md` §4/§9.1/§13 citation; the full column and nullability set including `app.`
schema qualification; the spec delta's structure (`## Purpose` → `## ADDED Requirements` → `###
Requirement:` → `#### Scenario:` → `- **WHEN**`/`- **THEN**`), which matches the archived deltas
exactly, with every requirement carrying at least one scenario; `SHALL` voice and snake_case column
references consistent with existing specs; the module layout `apps/api/src/modules/<feature>/{routes,
controller,service,repository,mapper}` and `analytics` as the name `docs/ARCHITECTURE.md:105` §4
reserves; `/admin/dashboard` fitting the `/admin/*` mounts at `server.ts:59-66`; colocated
`*.test.ts` in `packages/contracts/src`.

Two things assessed as explicit non-problems: the curation-integrity tile is **not** an N+1 — both
orderings are capped at ten entries by spec (`openspec/specs/home-curation/spec.md:75`,
`openspec/specs/reels-curation/spec.md:189`), and computing total/visible in application code is
the exact shape `curation.repository.ts:31-43` already uses. And no new index is warranted: the
three genuinely unindexed predicates are cheap scans on small tables, so
`docs/ARCHITECTURE.md` §13's deferral holds.

## Rule check

| Rule / precedent | Complies? |
|---|---|
| `CLAUDE.md` — TypeScript strict, no `any` | n/a (no code); `tasks.md` 6.4 carries the gate |
| `CLAUDE.md` — REST conventions, consistent JSON envelope | Yes — `tasks.md` 3.3 matches `curation.controller.ts` |
| `CLAUDE.md` — typed `AppError`, formatted once in `errorHandler` | Not addressed; nothing in the plan deviates |
| `CLAUDE.md` — UUID PKs, migrations, transactions | Yes — read-only, no migration (`tasks.md` 2.10) |
| `CLAUDE.md` — lazy-load large features | At risk — finding 15 (no dependency chosen yet) |
| `CLAUDE.md` — build, lint, tests, no TS errors before completion | Yes — `tasks.md` 6.1–6.4 |
| `CLAUDE.md` — PRs reference the approved OpenSpec change | Yes — PR body cites the change |
| `docs/ARCHITECTURE.md` §4 — `analytics/` module slot | Yes |
| `docs/ARCHITECTURE.md` §13 — defer read replica / materialized view | Yes; but finding 12 on the stated premise |
| `openspec/specs/authorization` — permission-based, no role-name branching | Yes (`spec.md:8`); but findings 2 and 11 |
| Archived-proposal structure (`## Capabilities`, Impact bullets, BREAKING form) | **No** — findings 7, 22, 26 |
| Archived-design structure (`**Goals:**` list) | **No** — finding 23 |
| Spec-delta format (header levels, `SHALL`, ≥1 scenario per requirement) | Yes |
| Change-directory naming (`add-` + capability slug) | **No** — finding 25 |

---

Round 1. No findings resolved yet — a Disposition column will be added on re-review once the
branch has been updated, matching the round-2 format used for PR #7.

---

# Round 3 — implementation review

**Verdict:** Approve with changes → **Approved** (all 5 findings fixed, see Disposition below)

## Reviewed at
| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...HEAD` (PR #9, head `596e501`) | 22 | +1811 / -179 | 2026-08-14 |

All 5 findings fixed in `c270a33`, posted as inline GitHub review comment replies and resolved as
threads. See "Disposition" below.

Rounds 1–2 above reviewed the `add-admin-dashboard` proposal while it was spec-only; commit
`596e501` added the implementation, and that implementation is what this round reviews.

## Summary

Implements `GET /admin/dashboard` — six read-only aggregate tiles — across `packages/contracts`,
a new `apps/api/src/modules/analytics` module, and a new `apps/admin` dashboard page that becomes
the admin landing route.

The backend is correct. Rather than reason about the SQL from the diff, I stood up PostgreSQL 16,
applied all four migrations from `supabase/migrations/`, seeded fixtures targeting the spec's edge
cases, and executed all six repository methods against it. Every query runs and returns
spec-correct values — including the three constructs most likely to fail only at runtime: the
correlated `NOT EXISTS` nested inside an aggregate `FILTER` clause, `count(*) OVER ()` paired with
`LIMIT`, and the `date_trunc('week', … AT TIME ZONE 'Asia/Jakarta')` bucketing. Jakarta week
boundaries were checked at the two instants that actually distinguish the implementations
(`2026-08-09T17:00Z` = Monday 00:00 Jakarta, `2026-08-09T16:59Z` = Sunday 23:59 Jakarta); they
landed in adjacent buckets, so the SQL bucketing and the JS `jakartaWeekStart`/`jakartaDateLabel`
helpers agree. The 20-row due-soon cap was checked with 26 matching rows: 20 returned, total 26.

`pnpm typecheck`, `pnpm lint`, and `pnpm test` (418 tests, 52 files) all pass. Module layering
matches `article.repository.ts` and `curation.routes.ts`; the route is authorization-declared, so
`auditAuthorizationDeclarations` accepts it at boot. No `any`, no dead code, no leftover debug
output.

No finding is Critical or Major — nothing here is a bug I could make fire. What drove
"Approve with changes" is three Minor items: one factual claim in `tasks.md` that my own
verification contradicts, and two UI defects that produce misleading output rather than wrong
data.

Standards used: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `openspec/changes/add-admin-dashboard/`
(proposal, design, spec, tasks), and `file:line` precedent from the existing `articles`,
`curation`, and `reels` modules. There is no `docs/adr/` and no `CONTRIBUTING.md`, so conventions
findings cite precedent rather than a named rule.

## Findings

| # | Severity | Aspect(s) | File:line | Title | Disposition |
|---|---|---|---|---|---|
| 1 | Minor | correctness, conventions | `apps/api/src/modules/analytics/analytics.repository.test.ts` | `tasks.md` 5.1's reason for skipping live-DB tests is not accurate | Fixed |
| 2 | Minor | correctness | `apps/admin/src/pages/DashboardPage.tsx:118` | Content-debt headline sums incommensurable units | Fixed |
| 3 | Minor | correctness | `apps/admin/src/pages/DashboardPage.tsx:57` | Due-soon times render in the viewer's timezone, not Jakarta | Fixed |
| 4 | Nit | performance | `apps/api/src/modules/analytics/analytics.repository.ts:144` | Cadence query has no upper bound | Fixed |
| 5 | Nit | hygiene | `.claude/launch.json` | Unrelated tooling file bundled into the change | Fixed |

## Details

### 1 — `tasks.md` 5.1's reason for skipping live-DB tests is not accurate (Minor)

The gap itself is disclosed, which is the right instinct. The justification is what does not hold.
Task 5.1 states that seeded-fixture repository tests were *"never actually buildable here"*. That
claim is false, and the disproof is cheap: `initdb` + the repo's own four migrations from
`supabase/migrations/` + `getDb({ DATABASE_URL })` brought a working schema up in a few minutes,
and all six repository methods ran against it unmodified.

This matters because of what is currently unexercised. `analytics.repository.test.ts` covers the
two pure date helpers only. Every `sql` fragment in the module — the four `count(*) filter (where …)`
aggregates, the correlated `notExists`, `count(*) over ()`, and the Jakarta bucketing expression —
executes for the first time in production. The service test's fake repository cannot catch a
regression in any of them, because it replaces exactly the layer that holds the risk.

The queries are correct **today** — I verified that directly. The finding is that nothing in CI
would notice if they stopped being correct, and the recorded reason for accepting that risk does
not survive contact with the evidence.

Suggested fix: add `analytics.repository.integration.test.ts`, skipped unless a
`TEST_DATABASE_URL` is set, so it is free locally and in CI until someone wires a Postgres service.
Two cases carry most of the value: the Sunday-23:59-Jakarta vs Monday-00:00-Jakarta pair, and a
26-row due-soon fixture asserting `dueWithin48h.length === 20 && dueWithin48hTotal === 26`.
If the preference is to leave this to a follow-up change, correcting 5.1's wording is still worth
doing — a future reader will otherwise take "not buildable" at face value.

### 2 — Content-debt headline sums incommensurable units (Minor)

```ts
const contentDebtTotal =
  data.contentDebt.missingSeoDescription +   // published articles
  data.contentDebt.missingExcerpt +          // published articles
  data.contentDebt.missingFeaturedImage +    // published articles
  data.contentDebt.uncategorized +           // published articles
  data.contentDebt.unusedTags;               // tags, all statuses
```

Two problems compound. The first four are per-article counts over the same population, so a single
article missing all four fields contributes **4** to the headline. The fifth counts tags across
articles of any status — a different table and a different scope, by design
(`spec.md` — *"across all tags regardless of article status"*).

The result is not a count of anything. On my fixture it rendered **8** against 3 published
articles and 2 tags. The spec's "Content debt counts" requirement defines five separate counts and
no total; this aggregate is a UI invention, and it is the largest number on the tile.

Suggested fix: drop the headline and let the five itemized rows stand — they are already
individually actionable, which the sum is not. If a single number is wanted for scanning, count
distinct articles carrying at least one debt signal and label it "articles needing attention",
leaving `unusedTags` out of it. That needs a new repository field, so it is a spec change, not a
UI edit.

### 3 — Due-soon times render in the viewer's timezone, not Jakarta (Minor)

```ts
return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
```

`undefined` locale plus no `timeZone` resolves to the browser's zone. Every other time-bearing
value on this board is pinned to Asia/Jakarta — the cadence bucket labels are Jakarta calendar
dates produced in SQL, and `design.md`'s "Timezone: Asia/Jakarta, pinned now" decision is what
`jakartaWeekStart` exists to honour. An editor outside UTC+7 therefore reads Jakarta-bucketed week
labels directly above publish times in their own zone, with nothing on screen distinguishing them.
For a tile whose entire job is "is this going out when I think it is", that is the wrong failure
mode.

This is the first date formatter in `apps/admin` — `grep` for `toLocaleString` across
`apps/admin/src` and `apps/web/` returns only this line — so it sets the precedent rather than
following one.

Suggested fix:

```ts
return new Date(iso).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});
```

and label the tile or column "WIB" so the pinning is visible rather than merely correct.

### 4 — Cadence query has no upper bound (Nit)

```ts
.where(and(eq(articles.status, 'published'), gte(articles.publishedAt, cutoff)))
```

Bounded below by `cutoff`, unbounded above. A `published` row dated beyond the current Jakarta week
is scanned, bucketed by `to_char(...)`, and then silently discarded, because
`countByWeek.get(label)` finds no matching bucket. I confirmed the behaviour by inserting a
published article dated three weeks ahead: output stayed correct, the row was fetched for nothing.

Output is right either way, so this is a Nit. Adding the upper bound turns
`articles_status_published_at_idx` into a bounded range scan and makes "eight weeks, ending with
the current one" legible in the query rather than only in the loop below it:

```ts
const nextWeekStart = new Date(currentWeekStart.getTime() + WEEK_MS);
// … and(eq(articles.status, 'published'), gte(articles.publishedAt, cutoff), lt(articles.publishedAt, nextWeekStart))
```

### 5 — Unrelated tooling file bundled into the change (Nit)

`.claude/launch.json` configures a `pnpm --filter @siders/admin dev` launch. It is not referenced
by `proposal.md`, `design.md`, `tasks.md`, or the spec, and has nothing to do with the dashboard
capability. Not harmful — just noise in the diff of a change whose artifacts otherwise account for
every file they touch. Worth splitting out, or adding a line to `tasks.md` so it is accounted for.

## Rule check

| Rule | Source | Complies |
|---|---|---|
| TypeScript strict, no `any` | `CLAUDE.md` — Coding Standards | Yes — no `any` in the change; the one narrowing in `getUpNext` uses a documented type predicate |
| Typed `AppError`, formatted once in `errorHandler` | `CLAUDE.md` — API | Yes — the controller delegates to `next(err)` and adds no local formatting |
| Consistent JSON envelope | `CLAUDE.md` — API | Yes — `{ success: true, data }`, matching `articles`/`curation`/`reels` |
| Composition over inheritance, small focused functions | `CLAUDE.md` — Coding Standards | Yes — factory functions throughout, matching the sibling modules |
| No duplicated logic | `CLAUDE.md` — Coding Standards | Yes — `isPubliclyVisible` / `isReelPubliclyVisible` are imported, not re-derived in SQL, per `design.md` |
| Controller → service → repository layering | precedent: `curation.routes.ts:19-29` | Yes — the mapper is the only added layer, matching `article.mapper.ts` |
| UUID PKs, migrations | `CLAUDE.md` — Database | N/A — read-only change, no schema delta |
| Lazy-load large features | `CLAUDE.md` — Frontend | Yes — `DashboardPage` is eager, but it is the landing route with no editor dependency; the rationale is recorded at `DashboardPage.tsx:24-28` |
| Every route declares authorization | `specs/authorization/spec.md` | Yes — `requirePermission('dashboard.view')`; `health.routes.test.ts`'s boot test passes with the route mounted |
| No new permission catalog entry | `specs/admin-dashboard/spec.md` | Yes — `dashboard.view` already exists at `packages/contracts/src/permission.ts:10` and `supabase/migrations/0000_useful_red_shift.sql:120` |
| Build, lint, tests, no TS errors before completion | `CLAUDE.md` — Testing | Yes — `pnpm typecheck`, `pnpm lint`, `pnpm test` (418 passing) all clean |

## Verification performed

Not inferred from the diff — executed:

- PostgreSQL 16 cluster, all four `supabase/migrations/*.sql` applied clean.
- Fixtures covering: blank-vs-null `excerpt`/`seo_description`; a published article on each side of
  the Jakarta week boundary; a draft-only tag association; a reader with `last_login_at IS NULL`;
  a curated-but-not-visible article; an `unavailable` curated reel.
- All six `AnalyticsRepository` methods executed against it. Results matched the spec on every
  tile — content debt `{1,2,2,2,1}`, curation `home 1/2, reels 1/2`, readers `newLast7d 1,
  activeLast30d 2` (correctly excluding the null-login reader), cadence bucketed to
  `2026-08-03` / `2026-08-10` across the Sunday/Monday Jakarta boundary.
- Due-soon cap re-run with 26 matching rows: 20 returned, `dueWithin48hTotal` 26.

## Disposition

All 5 findings fixed in `c270a33`, on top of the reviewed commit `596e501`.

- **#1** — `tasks.md` 5.1 corrected to state the accurate reason (buildable, verified directly
  against a live Postgres; not run because `.github/workflows/ci.yml` has no database service),
  replacing the false "never actually buildable here" claim. The integration-test harness itself
  was deliberately *not* added: confirmed first that nothing in the repo uses a `skipIf`-gated
  test and CI has no `TEST_DATABASE_URL`, so building one now would be a pattern that's always
  skipped as written — out of proportion for a Minor finding.
- **#2** — `contentDebtTotal` and its headline `<p>` removed from `DashboardPage.tsx`; the five
  itemized rows stand alone. The "articles needing attention" alternative was left for a follow-up
  since it needs a new repository field.
- **#3** — `formatDate` now passes `timeZone: 'Asia/Jakarta'`; the "Up next" tile is relabeled
  "Up next (times in WIB)".
- **#4** — `lt` added to the `analytics.repository.ts` `drizzle-orm` import; the cadence `WHERE`
  is now bounded above by `nextWeekStart`. Re-verified against a live Postgres: a published
  article dated three weeks out is now excluded by the query itself rather than fetched and
  discarded downstream, and the other three buckets matched prior output exactly.
- **#5** — `.claude/launch.json` deleted. Confirmed first that nothing references it
  (`grep -rn "launch.json"` matched only this review) before removing.

`pnpm typecheck`, `pnpm lint`, and `pnpm test` (418 tests) all re-run clean after the fixes.
