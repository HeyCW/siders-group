# Review report

**Verdict:** Approve with changes

## Reviewed at

| Range | Files | +/- | Date |
|---|---|---|---|
| `origin/main...origin/add-guide-of-the-week-management` (PR #21, head `1938f82`, base `6bcebf2`) | 32 | +4679 / -45 | 2026-08-19 |

## Summary

PR #21 adds the `guide-of-the-week-management` capability end to end: a `guide_picks` table with a
mandatory `ON DELETE RESTRICT` photo FK, an `apps/api/src/modules/guidePicks` module gated on
`news.manage`, a rate-limited public `GET /guide-picks`, an admin management page, and a rewrite of
`GuideOfWeek.tsx` from two hardcoded picks to a dynamically-sized grid fed by real data.

**Every requirement in the change's own spec delta is met** — see Spec conformance below. The work is
a close, faithful port of the `partner-management` precedent, and the places it deliberately departs
from that precedent (`news.manage` instead of `settings.manage`, no pick-count cap, no
`http`/`https` allowlist) are each justified in `design.md` and correct: `photoUrl` is derived
server-side from `media.storage_path` and never reaches an `href`, so partner's URL-scheme guard has
nothing to guard here.

Nothing found is a defect in the running code, and nothing blocks merge. Four Minor findings: the
spec delta omits the revalidate-on-write requirement that a test cites by name, the PR description
describes a proposal-only change the diff outgrew, the new grid stacks two separator mechanisms, and
the reorder logic is duplicated verbatim from `partner.repository.ts`. CI (`lint` → `typecheck` →
`test` → `build`, one job) is green on `1938f82`.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Minor | conventions | `openspec/changes/add-guide-of-the-week-management/specs/guide-of-the-week-management/spec.md:117` | Spec delta omits the revalidate-on-write requirement a test cites by name |
| 2 | Minor | hygiene | (PR #21 description) | PR body describes a proposal-only change; the diff is the full implementation |
| 3 | Minor | conventions | `apps/web/components/home/GuideOfWeek.tsx:29` | Grid stacks `gap-px`/`bg-rule` *and* per-card borders — 2px interior rules against a 1px frame |
| 4 | Minor | conventions | `apps/api/src/modules/guidePicks/guidePick.repository.ts:86` | Reorder predicate and transaction duplicated verbatim from `partner.repository.ts` |
| 5 | Nit | conventions | `openspec/changes/add-guide-of-the-week-management/tasks.md:16` | `tasks.md` names a contract type the code does not export |

## Details

### 1 — Minor — Spec delta omits the revalidate-on-write requirement

`guidePick.service.ts` calls `revalidateHomePath` on every create, update, delete and reorder. Three
artifacts in this PR treat that as required:

- `proposal.md` (Impact): "guide-pick writes revalidate the home page"
- `tasks.md` 3.3: "Each write calls the home-page revalidation helper"
- `guidePick.service.revalidation.test.ts:9`: `The claim under test here is "Revalidation failure
  does not fail the write" (specs/guide-of-the-week-management/spec.md)`

That quoted string appears nowhere in the delta — `grep -i revalidat` over
`specs/guide-of-the-week-management/spec.md` returns nothing. The delta's seven requirements end at
"Public read serves only active guide picks in order". `partner-management`, which `design.md` says
this change "follows … almost exactly, differing only in permission and the absence of a pick-count
cap", carries it as a requirement of its own (`openspec/specs/partner-management/spec.md:158`).

The behaviour is correct and is covered by `guidePick.service.test.ts` and
`guidePick.service.revalidation.test.ts`, so nothing is broken today — which is why this is Minor
rather than higher. What it costs is the record: when the change is archived and synced, the
permanent capability spec will not contain the guarantee, and the test's citation points at nothing.
Add the requirement, mirroring the partner wording:

```markdown
### Requirement: Guide-pick writes revalidate the home page
The system SHALL trigger revalidation of the home page path whenever a guide pick is created,
updated, deleted, or reordered, or whenever a guide pick's active flag changes. A failed
revalidation SHALL be logged and SHALL NOT fail the write, which is already committed.

#### Scenario: Saving a guide-pick change revalidates the home page
- **WHEN** a staff member creates, updates, deletes, or reorders a guide pick
- **THEN** the system requests revalidation of the home page path
```

**Rule:** `openspec/specs/partner-management/spec.md` — "Partner writes revalidate the home page".

### 2 — Minor — PR body describes a proposal-only change

The description says:

> Proposal-only change: `proposal.md`, `design.md`, `tasks.md`, and spec deltas … **No
> implementation code in this PR.**
> - [ ] On approval, implement per `tasks.md` in a follow-up change

It was accurate for the first commit (`28447ba docs(spec): add guide-of-the-week-management change
proposal`) and was not updated when the second (`1938f82 feat(spec): add guide of the week`) added
28 code files: migration `0008` plus snapshot, the schema, the contracts, the API module, five admin
endpoints, the public route, `GuidePicksPage.tsx` and the `GuideOfWeek.tsx` rewrite. Every checkbox
in `tasks.md` is already `[x]`, including 8.1 and 8.2.

The diff is visible to anyone reviewing, so this misleads rather than hides — Minor, not more. Still
worth fixing before merge, along with the reference line `CLAUDE.md`'s Pull Requests section asks
for:

```
Implements: openspec/changes/add-guide-of-the-week-management
```

**Rule:** `CLAUDE.md` — Pull Requests.

### 3 — Minor — Two separator mechanisms stacked in the new grid

```tsx
// apps/web/components/home/GuideOfWeek.tsx:29
className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-px border-l border-t border-rule bg-rule"
// :34
className="border-b border-r border-rule bg-paper p-[clamp(14px,2vw,28px)]"
```

`gap-px` with `bg-rule` on the container draws a 1px line in each gutter, *and* every card draws its
own `border-r`/`border-b`. Between two adjacent cards that is card 1's right border plus the gutter
— 2px — while the outer frame (container `border-l`/`border-t`, last card's `border-r`/`border-b`)
stays 1px. Interior rules therefore render twice as heavy as the frame, at every count and every
wrap. (`rule` is `#E3E1D9`, so the difference is subtle but visible.)

The redundancy is the point: either mechanism alone gives a uniform 1px. `design.md` describes one
approach ("every cell gets its own full border … with a shared `gap`"), `PartnerGrid.tsx:91` uses
the other (collapsed borders, no gap), and this is a hybrid of the two. Matching `PartnerGrid` is
the smaller change:

```diff
-        className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-px border-l border-t border-rule bg-rule"
+        className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] border-l border-t border-rule"
```

`GuideOfWeek.test.tsx` asserts on card classes only, so it keeps passing. Worth noting *why* the
tests did not catch this: they check that every card's class string is **identical**, which is
exactly what the spec requirement asks ("No divider, padding, or border rule … SHALL depend on a
pick's position"). Uniformity holds; evenness is a separate property no assertion covers, and
`tasks.md` 8.2 records the visual check as delegated to those same structural assertions.

**Rule:** `design.md` — "Dynamic-count layout: uniform bordered cards, not positional dividers".

### 4 — Minor — Reorder logic duplicated verbatim

`isExactGuidePickIdSet` (`guidePick.repository.ts:86`) is character-for-character
`isExactPartnerIdSet` (`partner.repository.ts:86`) with the name changed, and the `reorder`
transaction at `:190` — `LOCK TABLE … IN EXCLUSIVE MODE`, read current ids, validate the set, loop
`update … set sortOrder = index`, re-select joined — is a verbatim copy. The new file says as much
("Mirrors `partner.repository.ts`'s `reorder` — see its comment for why the lock is table-level").

That comment is the reason this is worth raising rather than shrugging at: the lock-strategy
rationale is load-bearing and now lives in one file while governing two. `design.md` reasons
explicitly about duplication elsewhere — the media-upload flow is accepted as a deliberate scope
boundary, "if a fourth copy is ever needed, that is the point to extract" — but is silent on this
one, which reads as an oversight rather than a decision. The repo has already made the opposite call
in the identical situation: `apps/api/src/lib/replaceOrdering.ts` was extracted when `home_curation`
and `reels_curation` needed one transaction, documented as "so a correction to this ordering only
has to happen once".

Extract a `replaceSortOrder` helper into `apps/api/src/lib/`, parameterised by the Drizzle table,
the qualified name for the `LOCK TABLE` statement, and the error factory — or, if the team prefers
the modules stay independent, record it in `design.md`'s Non-Goals the way the upload duplication is,
so the next reviewer does not re-raise it.

**Rule:** `CLAUDE.md` — Coding Standards, "no duplicated logic"; `apps/api/src/lib/replaceOrdering.ts`
precedent.

### 5 — Nit — `tasks.md` names a type the code does not export

Tasks 2.1 and 3.2 call the public contract type `PublicGuidePickResponse`. The shipped export is
`PublicGuidePick` / `publicGuidePickSchema` — the correct name, since it mirrors `PublicPartner`.
Fix the task text, not the code.

## Spec conformance

Each requirement in this change's own spec deltas, and whether the implementation meets it.

### `guide-of-the-week-management` (new capability)

| Requirement | Met | Where |
|---|---|---|
| Permission-gated guide-pick endpoints (`news.manage`, never a role name, no new catalog entry) | Yes | `guidePick.routes.ts` — five `requirePermission('news.manage')`; migration adds no `app.permissions` row |
| Guide-pick CRUD; admin list includes inactive | Yes | `guidePick.controller.ts`; `list()` → `listAllJoined()`, unfiltered |
| A guide pick requires a photo (existing media rules, rejected if unknown) | Yes | `photoMediaId: z.string().uuid()` required; `notNull` + `ON DELETE RESTRICT`; FK violation mapped to `invalid_photo_media` |
| Deactivating hides from public output without changing stored order | Yes | `isActive` filter in `listActiveJoined()`; `sortOrder` untouched by the flag |
| A single ordered list with no maximum | Yes | No cap in contract, service, repository, migration or admin UI; asserted at 25–30 entries in three test files |
| Order replaced as a whole list, atomic, no per-item move endpoint | Yes | `reorder` in one transaction under `EXCLUSIVE`; `sortOrder` absent from both request schemas; no move route |
| Reorder submits every existing id; rejection leaves order untouched | Yes | `isExactGuidePickIdSet` inside the transaction; throw rolls back |
| Deleting heals the stored order | Yes | Plain row delete; no ordering table to leave dangling |
| Public read: active only, in order, no admin-only fields | Yes | `PublicGuidePick` carries city/place/description/photoUrl only — no `id`, `isActive`, `sortOrder` |
| *Writes revalidate the home page* | Implemented, **not specified** | Finding 1 |

### `web-public-site` (modified capability)

| Requirement | Met | Where |
|---|---|---|
| Section renders real admin-managed picks, no placeholder content | Yes | `GUIDE_OF_THE_WEEK` and `GuidePick` removed from `content.tsx`; `MediaSlot` placeholder replaced by a real `<img>`; `EDITION` correctly retained for `SiteFooter` |
| No guide picks means no section (including on fetch failure) | Yes | `return null` at `GuideOfWeek.tsx:24`; `.catch(() => [])` in `page.tsx`; the wrapping `Container` has horizontal padding only, so an empty section leaves no band |
| Layout accommodates any number of picks; no rule depends on being first of two | Yes | No per-index conditional; asserted at 1, 2 and 6 picks in `GuideOfWeek.test.tsx` |

## Rule check

| Rule / record | Complies |
|---|---|
| `CLAUDE.md` — TypeScript strict, never `any` | Yes — no `any`; the `as never` casts in tests match the existing admin test convention (`RouteGuards.test.tsx`, `SessionContext.test.tsx`) |
| `CLAUDE.md` — no duplicated logic | No — finding 4 |
| `CLAUDE.md` — typed `AppError`, formatted once in `errorHandler` | Yes — `invalid_photo_media`, `not_found`, `invalid_guide_pick_set`; controllers only `next(err)` |
| `CLAUDE.md` — UUID PKs, migrations, transactions where appropriate | Yes — UUID PK; journal and snapshot chain intact (`prevId` matches `0007`'s `id`); create and reorder both transactional |
| `CLAUDE.md` — PRs reference the OpenSpec change | No — finding 2 |
| `CLAUDE.md` — build, lint, tests, no TS errors before completion | Yes — CI's single `build` job runs `pnpm lint` → `typecheck` → `test` → `build` and is green on `1938f82` |
| `ARCHITECTURE.md` §4 — controllers hold no business `if`; services never import Drizzle; repositories never import Express | Yes |
| `ARCHITECTURE.md` §4 — no raw row reaches the client | Yes — both shapes mapped; `photoUrl` derived at map time via `publicUrlFor`, never stored |
| `ARCHITECTURE.md` §5.5 — explicit declaration on every route; permission, never a role name | Yes — five `requirePermission`, one `requirePublic` |
| `ARCHITECTURE.md` §6.3 — RLS enabled, default deny | Yes — matches `0004`'s partners block verbatim |
| `ARCHITECTURE.md` §9.2 — one error envelope, clients branch on `code` | Yes |
| `ARCHITECTURE.md` §9.3 — per-route rate-limit buckets | Yes — `publicReadRateLimiter('public-guide-picks')`, a distinct bucket from `public-partners` |
| `ARCHITECTURE.md` §8.1 — `/` stays ISR at 60s | Yes — `revalidate = 60` on route and fetch; no cookie or header read introduced |

## Checked and cleared

Recorded because each looked like a finding and is not:

- **`/guide-picks` is absent from `apps/web/scripts/ci-mock-api.mjs`.** Correct, and consistent:
  the mock serves only the endpoints whose failure would break the build (`/home`, `/reels`,
  `/articles`, `/categories`). `/partners` is likewise absent because `.catch(() => [])` already
  degrades it, and the new fetch is wrapped the same way.
- **No `http`/`https` scheme allowlist on any guide-pick field.** Correct — `partner.ts`'s
  `isHttpUrl` exists because a partner URL reaches an `href`. `photoUrl` is server-derived from
  `media.storage_path` and only ever reaches an `<img src>`, so there is no analogous hole.
- **No index on `guide_picks`.** Matches `partners` exactly; the table is bounded by a handful of
  rows per week.
- **Plain `<img>` rather than `next/image`.** The repo's documented choice — see
  `MediaSlot.tsx:22`, and every other content image in `apps/web`.
- **Admin route carries no per-route permission guard.** No admin page has one; `RequireSession`
  plus the API's `forbidden` response is the established pattern.
- **Delete and edit-save untested in `GuidePicksPage.test.tsx`.** `PartnersPage.test.tsx` does not
  test them either — coverage is equivalent (5 tests each), so this is precedent, not a gap.
- **New lines exceeding `.prettierrc`'s `printWidth: 100`.** Prettier is in neither
  `eslint.config.js` nor CI, and the repo is broadly not prettier-clean; flagging it here would be
  noise.
- **Photo `<label>`s with no `htmlFor` that do not wrap their input.** A real a11y wrinkle, copied
  verbatim from `PartnersPage.tsx` — a pre-existing pattern to fix repo-wide, not this PR's to
  correct in isolation.

## Verification

CI's `build` check on head `1938f82` is green, and that single job runs `pnpm lint`, `pnpm
typecheck`, `pnpm test` and `pnpm build` in sequence — so `tasks.md` 8.1's claims (clean lint and
typecheck, 905/905 tests, a real `next build`) are corroborated by CI, not merely asserted. Those
commands were not re-run locally for this review: `node_modules` is absent here and dependency
installation is not permitted in this environment. Everything else above is from static reading of
the diff, the files on disk, and the repo's specs.

---

*This report is local-only — nothing was posted to GitHub. Next step if you want the findings
applied: `/fix-issues` for 1–5, or hand finding 2 straight to the PR description.*
