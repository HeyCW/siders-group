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
`GuideOfWeek.tsx` from two hardcoded picks to a dynamically-sized grid fed by real data. The work is
a close, faithful port of the `partner-management` precedent — layering, lock strategy, mapper
discipline, envelope shape, revalidate-on-write and the admin/public service split all match, and
the one place the precedent deliberately does *not* apply (partner's `http`/`https` allowlist,
needed because a partner URL reaches an `href`) is correctly absent, since `photoUrl` is derived
server-side from `media.storage_path` and never client-supplied. Repo standards were found:
`CLAUDE.md`, `docs/ARCHITECTURE.md`, `.prettierrc`/`eslint.config.js`, and the `openspec/specs`
capability records; there is no `docs/adr/` or review guide, so the rubric below is this skill's
default.

Two Major findings drive the verdict, and neither is a defect in the running code. The capability
spec omits the revalidate-on-write requirement that the implementation, the proposal, the task list
and a test all treat as binding — the test even cites a spec string that does not exist — so
archiving this change would sync a permanent spec that is missing a guarantee the code makes. And
the PR description states the change is proposal-only with no implementation code, which is not what
the diff contains. The Minor findings are a doubled border rule in the new grid, a verbatim
duplication of the reorder logic the repo has already extracted once before for exactly this reason,
and two test-coverage gaps. `build` is green on the head commit; the local checks (`pnpm lint`,
`pnpm test`, `pnpm typecheck`) could not be run here because dependency installation is not
permitted in this environment.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Major | conventions | `openspec/changes/add-guide-of-the-week-management/specs/guide-of-the-week-management/spec.md:117` | Spec delta omits the revalidate-on-write requirement the code implements and a test cites |
| 2 | Major | hygiene | (PR #21 description) | PR body describes a proposal-only change; the diff is the full implementation |
| 3 | Minor | conventions | `apps/web/components/home/GuideOfWeek.tsx:29` | Grid uses both `gap-px`/`bg-rule` and per-card borders, doubling interior rules |
| 4 | Minor | conventions | `apps/api/src/modules/guidePicks/guidePick.repository.ts:86` | Reorder-set predicate and transaction duplicated verbatim from `partner.repository.ts` |
| 5 | Minor | correctness | `apps/api/src/modules/guidePicks/guidePick.service.test.ts:148` | Invalid-photo-on-update test does not assert revalidation was skipped |
| 6 | Minor | correctness | `apps/admin/src/pages/GuidePicksPage.test.tsx` | Delete and edit-save paths are untested |
| 7 | Nit | hygiene | `apps/admin/src/pages/GuidePicksPage.tsx:241` | Several new lines are not prettier-formatted at `printWidth: 100` |
| 8 | Nit | hygiene | `apps/admin/src/pages/GuidePicksPage.tsx:299`, `:388` | Photo labels are orphaned — no `htmlFor`, and they do not wrap the input |
| 9 | Nit | conventions | `openspec/changes/add-guide-of-the-week-management/tasks.md:16` | `tasks.md` names a contract type the code does not export |

## Details

### 1 — Major — Spec delta omits the revalidate-on-write requirement

`guidePick.service.ts` calls `revalidateHomePath` on every create, update, delete and reorder, and
three other artifacts treat that as a requirement:

- `proposal.md` (Impact): "guide-pick writes revalidate the home page"
- `tasks.md` 3.3: "Each write calls the home-page revalidation helper"
- `guidePick.service.revalidation.test.ts:9`: `The claim under test here is "Revalidation failure
  does not fail the write" (specs/guide-of-the-week-management/spec.md)`

That quoted string does not appear anywhere in the spec delta — `grep -i revalidat` over
`specs/guide-of-the-week-management/spec.md` returns nothing. The delta's seven requirements stop at
"Public read serves only active guide picks in order". `partner-management`, the precedent this
change follows throughout, carries it as a requirement of its own
(`openspec/specs/partner-management/spec.md:158`).

This matters beyond tidiness: when the change is archived and synced, the permanent capability spec
will not contain the revalidation guarantee, and a later change could drop revalidation without
failing anything. Add the requirement, mirroring the partner wording:

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

### 2 — Major — PR body describes a proposal-only change

The description says:

> Proposal-only change: `proposal.md`, `design.md`, `tasks.md`, and spec deltas … **No
> implementation code in this PR.**
> - [ ] On approval, implement per `tasks.md` in a follow-up change

The head commit `1938f82 feat(spec): add guide of the week` adds 28 code files: migration `0008`
plus its snapshot, the `guide_picks` schema, the contracts, the whole API module, five admin
endpoints, the public `/guide-picks` route, `GuidePicksPage.tsx`, and the `GuideOfWeek.tsx` rewrite.
Every checkbox in `tasks.md` is already `[x]`, including 8.1 and 8.2. A reviewer who reads the body
and approves "spec only" is approving a schema migration and a new unauthenticated public endpoint
without being told they are in scope.

Rewrite the body to describe what actually ships, and add the reference line `CLAUDE.md`'s Pull
Requests section asks for:

```
Implements: openspec/changes/add-guide-of-the-week-management
```

**Rule:** `CLAUDE.md` — Pull Requests.

### 3 — Minor — Doubled interior rules in the new grid

```tsx
// apps/web/components/home/GuideOfWeek.tsx:29
className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-px border-l border-t border-rule bg-rule"
// :34
className="border-b border-r border-rule bg-paper p-[clamp(14px,2vw,28px)]"
```

Two separator mechanisms are stacked. The `gap-px` + `bg-rule` pair draws a 1px line in the gutter,
*and* each card draws its own `border-r`/`border-b`. Between two adjacent cards that is card 1's
right border plus the gap — 2px — while the outer frame (container `border-l`/`border-t`, last
card's `border-r`/`border-b`) stays 1px. Interior rules therefore render twice as heavy as the
frame, at every count and every wrap.

`design.md` ("Dynamic-count layout") and `tasks.md` 5.2 describe one approach (full border per card
plus a gap); `PartnerGrid.tsx:91` uses the other (collapsed borders, no gap). This is a hybrid of
the two. The smaller fix is to match `PartnerGrid`:

```diff
-        className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-px border-l border-t border-rule bg-rule"
+        className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] border-l border-t border-rule"
```

`GuideOfWeek.test.tsx`'s assertions are on the card classes only, so they keep passing. Note this is
precisely the "no divider/border artifact at each count" that `tasks.md` 8.2 records as verified by
the structural test rather than a live multi-pick render — the structural test cannot see it,
because it only checks that every card's class string is *identical*, not that the resulting rules
are even.

**Rule:** `design.md` — "Dynamic-count layout: uniform bordered cards, not positional dividers".

### 4 — Minor — Reorder logic duplicated verbatim

`isExactGuidePickIdSet` (`guidePick.repository.ts:86`) is character-for-character
`isExactPartnerIdSet` (`partner.repository.ts:86`) with the name changed, and the `reorder`
transaction at `:190` — `LOCK TABLE … IN EXCLUSIVE MODE`, read current ids, validate the set, loop
`update … set sortOrder = index`, re-select joined — is a verbatim copy of `partner.repository.ts`'s.
The new file's own comment says so ("Mirrors `partner.repository.ts`'s `reorder`").

`design.md`'s Non-Goals reserve one duplication explicitly — the media-upload form state, "a third
hand-rolled media-upload flow … accepted as a deliberate scope boundary" — and say nothing about
this one. Meanwhile the repo has already made the opposite call in the same situation:
`apps/api/src/lib/replaceOrdering.ts` was extracted when `home_curation` and `reels_curation` needed
the same transaction, documented as "so a correction to this ordering only has to happen once". That
reasoning applies identically here — a lock-strategy correction now has to be made in two places.

Extract a `replaceSortOrder` helper into `apps/api/src/lib/`, parameterised by the Drizzle table,
the qualified table name for the `LOCK TABLE` statement, and the error factory, and call it from
both repositories. If the team would rather keep the modules independent, say so in `design.md`'s
Non-Goals the way the upload duplication is recorded, so the next reviewer does not re-raise it.

**Rule:** `CLAUDE.md` — Coding Standards, "no duplicated logic"; `apps/api/src/lib/replaceOrdering.ts`
precedent.

### 5 — Minor — Update-path revalidation is not asserted

The create test asserts both halves of the contract:

```ts
// guidePick.service.test.ts:112
await expect(service.create({…})).rejects.toMatchObject({ code: 'invalid_photo_media' });
expect(revalidateHomePathMock).not.toHaveBeenCalled();
```

Its update counterpart at `:148` asserts only the error code. A regression that revalidated before
the write, or in the catch path, would pass. Add the same two lines:

```diff
+    revalidateHomePathMock.mockClear();
     await expect(service.update('a', { photoMediaId: 'missing' })).rejects.toMatchObject({
       code: 'invalid_photo_media',
     });
+    expect(revalidateHomePathMock).not.toHaveBeenCalled();
```

### 6 — Minor — Delete and edit-save are untested in the admin page

`GuidePicksPage.test.tsx` covers create, the active toggle, reorder, and the no-cap rule — the four
`tasks.md` 4.4 names. Two paths with real conditional logic are left out:

- `handleRemove` — `window.confirm` gate, optimistic filter, and `if (editingId === id) cancelEdit()`
- `handleSaveEdit` — `...(editPhotoMediaId ? { photoMediaId: editPhotoMediaId } : {})`, the branch
  that decides whether an edit replaces the photo or leaves it alone

The second is the more valuable of the two: sending `photoMediaId` when the operator did not upload
a new photo, or omitting it when they did, are both silent data bugs the current suite would not
catch.

### 7 — Nit — Prettier formatting

`GuidePicksPage.tsx:241` is 124 characters and `guidePicksApi.ts:1` is 107; both are shapes prettier
would break at `printWidth: 100`. Worth noting that the repo is broadly not prettier-clean
(`Sidebar.tsx`, `content.tsx`, `App.tsx` all carry breakable lines over 100) and `pnpm format` is not
run in CI, so this is consistent with existing state rather than a broken gate. Optional.

### 8 — Nit — Orphaned `<label>` elements

`<label className={FIELD_LABEL}>Photo (required)</label>` (`:299`) and `Replace photo (optional)`
(`:388`) have no `htmlFor` and do not wrap a control — the file input sits in a sibling
`<label>Choose file</label>`. Assistive tech announces nothing for them. Copied verbatim from
`PartnersPage.tsx`, so it matches adjacent code; fixing it here alone would create an inconsistency,
which is why it is a nit rather than a change request.

### 9 — Nit — `tasks.md` names a type the code does not export

Tasks 2.1 and 3.2 call the public contract type `PublicGuidePickResponse`. The shipped export is
`PublicGuidePick` / `publicGuidePickSchema` — which is the correct name, since it mirrors
`PublicPartner`. Fix the task text, not the code.

## Rule check

| Rule / record | Applies to | Complies |
|---|---|---|
| `CLAUDE.md` — TypeScript strict, never `any` | all new files | Yes — no `any`; the `as never` casts in tests match the existing admin test convention (`RouteGuards.test.tsx`, `SessionContext.test.tsx`) |
| `CLAUDE.md` — no duplicated logic | `guidePick.repository.ts` | **No** — finding 4 |
| `CLAUDE.md` — typed `AppError`, formatted once in `errorHandler` | service, repository | Yes — `invalid_photo_media`, `not_found`, `invalid_guide_pick_set` all thrown as `AppError`, controllers only `next(err)` |
| `CLAUDE.md` — UUID PKs, migrations, transactions where appropriate | `0008_busy_silver_centurion.sql` | Yes — UUID PK, journal + snapshot chain intact (`prevId` matches `0007`'s `id`), create and reorder both transactional |
| `CLAUDE.md` — Pull Requests reference the OpenSpec change | PR #21 body | **No** — finding 2 |
| `CLAUDE.md` — build, lint, tests, no TS errors before completion | whole change | Claimed in `tasks.md` 8.1; `build` is green on `1938f82`. Not independently re-run here — see Verification note |
| `docs/ARCHITECTURE.md` §4 — controllers hold no business `if`; services never import Drizzle; repositories never import Express | API module | Yes |
| `docs/ARCHITECTURE.md` §4 — no raw row reaches the client | `guidePick.mapper.ts` | Yes — both shapes mapped; `photoUrl` derived at map time via `publicUrlFor`, never stored |
| `docs/ARCHITECTURE.md` §5.5 — every route carries an explicit declaration; permission, never a role name | `guidePick.routes.ts` | Yes — five `requirePermission('news.manage')`, one `requirePublic()` |
| `docs/ARCHITECTURE.md` §6.3 — RLS enabled, default deny | migration | Yes — `ALTER TABLE "app"."guide_picks" ENABLE ROW LEVEL SECURITY`, no policies, matching `0004`'s partners block |
| `docs/ARCHITECTURE.md` §9.2 — one error envelope, clients branch on `code` | controller, admin API client | Yes |
| `docs/ARCHITECTURE.md` §9.3 — per-route rate-limit buckets | `publicGuidePickRoutes` | Yes — `publicReadRateLimiter('public-guide-picks')`, a distinct bucket name from `public-partners` |
| `docs/ARCHITECTURE.md` §8.1 — `/` stays ISR at 60s | `app/page.tsx` | Yes — `revalidate = 60` on both the route and the new fetch; no cookie/header read introduced |
| `specs/partner-management` — whole-list reorder, exact id set, atomic | repository `reorder` | Yes, including the table-level `EXCLUSIVE` lock and its stated reason |
| `specs/web-public-site` — no route renders invented data | `GuideOfWeek.tsx`, `content.tsx` | Yes — `GUIDE_OF_THE_WEEK` and `GuidePick` removed; `EDITION` correctly retained for `SiteFooter` |
| New delta — "Public read serves only active guide picks in order" | public mapper + `listActiveOrdered` | Yes — no `id`, `isActive` or `sortOrder` in `PublicGuidePick` |
| New delta — "No guide picks means no section" | `GuideOfWeek.tsx:24`, `page.tsx` | Yes — early `return null`, `.catch(() => [])`, and the wrapping `Container` has horizontal padding only, so an empty section leaves no band |
| New delta — revalidate on write | — | **Missing** — finding 1 |

## Verification note

`pnpm lint`, `pnpm test` and `pnpm typecheck` were **not** run for this review: `node_modules` is
absent in this environment and dependency installation was denied, so the checks `tasks.md` 8.1
reports (905/905 tests, clean lint and typecheck) are unverified here. The `build` check on head
commit `1938f82` is green on GitHub. Everything above is from static reading of the diff, the files
on disk, and the repo's specs.

---

*This report is local-only — nothing was posted to GitHub, committed, or pushed. Next steps: `/fix-issues`
for the individual findings, or `/security-review` if you want a dedicated pass on the new public
endpoint.*
