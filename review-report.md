# Review report

**Verdict:** Approve with changes → **Approved** (all findings resolved, see Disposition below)

## Reviewed at
| Range | Files | +/- | Date |
|---|---|---|---|
| `ef42d4b...462c0c5` (PR #7, `claude/add-reels-curation`) | 41 | +4234 / -85 | 2026-08-12 |

Re-review of PR #7 at head `462c0c5`. The previous round reviewed `c023f87`; six commits have
landed since (`ae031b2`, `6067fac`, `e3c99da`, `24dd18e`, `d322629`, `462c0c5`).

## Summary

Second pass over `add-reels-curation`. All twelve findings from the first review are resolved:
eleven fixed and verified in the code, one (poster-upload orphaning) knowingly deferred with a
sound rationale — it matches the article editor's existing upload-then-create pattern and the
orphan is inert under `ON DELETE RESTRICT`.

Standards used: `CLAUDE.md`, `docs/ARCHITECTURE.md`, the `add-reels-curation` OpenSpec artifacts,
and the archived `2026-08-12-add-home-curation` change as precedent. No `docs/adr/` or
`CONTRIBUTING.md` exists, so "conventions" findings cite `file:line` precedent or an
ARCHITECTURE section.

**Verified at head, not taken on trust:** `pnpm typecheck` (6 projects, clean), `pnpm lint`
(clean), `pnpm test` (48 files, **398** tests, all passing), `pnpm build` (web, admin, api).
That satisfies `CLAUDE.md`'s completion gate and tasks 9.1–9.4.

The two refactors landed since the last round are behaviour-preserving and well-executed. The
`replaceOrdering` extraction (`6067fac`) keeps the empirically-derived statement order intact —
`FOR KEY SHARE` on the referenced ids, then `LOCK TABLE`, then delete-and-reinsert — and moves the
full deadlock/race rationale into one doc comment instead of two. Both `sql.raw()` interpolation
points are documented as literal-only and both call sites pass literals, so the raw SQL is not a
new injection surface. The `publicReadRateLimiter(name)` consolidation (`e3c99da`) preserves each
endpoint's bucket namespace exactly.

The one Minor is in `d322629`'s new inline-edit UI — the code path added in response to the last
review, and the only substantial surface that had never itself been reviewed. It is an admin
feedback bug, not a public-output or data bug: a failed status change or delete has nowhere on
screen to report itself.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Minor | correctness | `apps/admin/src/pages/ReelLibraryPage.tsx:113` | Status-change and delete failures are structurally undisplayable |
| 2 | Nit | hygiene | `apps/admin/src/pages/ReelsCurationPage.tsx:164` | `=== false` is vestigial now that the field is a required boolean |
| 3 | Nit | conventions | `apps/admin/src/pages/ReelsCurationPage.tsx:78` | Reel visibility rule re-derived client-side |
| 4 | Nit | hygiene | `openspec/changes/add-reels-curation/tasks.md:114` | Task 9.3's test counts are stale and don't add up |
| 5 | Nit | correctness | `apps/admin/src/pages/ReelLibraryPage.tsx:141` | Failed poster re-upload silently keeps the previous replacement |

## Details

### 1. Minor — status-change and delete failures are structurally undisplayable

`ReelLibraryPage.tsx:113` and `:169` both catch with `/* surfaced via …State.errorMessage */`, but
neither message can reach the screen from those paths:

- `updateState.errorMessage` renders **only** at `:308`, inside the `editingId === reel.id`
  branch. The status `<select>` that calls `handleStatusChange` exists **only** in the other
  branch (`:324`). The two are mutually exclusive by construction, so a row showing the select can
  never show its own error.
- `removeState.errorMessage` is never rendered anywhere in the file.

Failure scenario: an editor flips a reel from Draft to Published, the `PATCH` fails (500, or a
`invalid_poster_media` 400 after the poster's media row was removed). `setReels` never runs, so
the controlled `<select value={reel.status}>` snaps back to Draft with no explanation. The editor
retries, sees the same silent revert, and has no way to tell a permission problem from a server
problem — only the blanket `forbidden` banner at `:183` distinguishes 403.

There is a second-order effect: because one `useAsyncAction` backs both actions, a status-change
failure leaves `updateState.errorMessage` set, and the next `startEdit` on **any** row immediately
renders that stale, misattributed error inside the newly-opened edit form.

Suggested fix — hoist a list-level error line next to the `forbidden` banner, so both actions have
somewhere to report regardless of which branch is rendering:

```tsx
{updateState.errorMessage && !updateState.forbidden && (
  <p className="mb-4 text-sm text-red-600 dark:text-red-400">{updateState.errorMessage}</p>
)}
{removeState.errorMessage && !removeState.forbidden && (
  <p className="mb-4 text-sm text-red-600 dark:text-red-400">{removeState.errorMessage}</p>
)}
```

and either drop the in-form copy at `:308` or give the edit form its own `useAsyncAction` so the
two actions stop sharing state.

Rule: `docs/ARCHITECTURE.md` §9.2 — clients branch on the error contract rather than discarding
it. `HomeCurationPage.tsx:108` and `TaxonomyManagementPage.tsx:117` both render their action error
at page level, which is the precedent to follow.

Related wording nit in the same area: the edit form's header at `:262` says "only the caption,
poster, and status can" change, but the form offers caption and poster only — the status control
lives in the collapsed row, which is hidden while editing.

### 2. Nit — `=== false` is vestigial

`ReelsCurationPage.tsx:164` still tests `item.isPubliclyVisible === false`. That form was
meaningful when the field was optional; `24dd18e` made `PickedItem.isPubliclyVisible` a required
`boolean` (`:19`), so `!item.isPubliclyVisible` now says the same thing without implying a third
state. `HomeCurationPage.tsx:142` keeps `=== false` correctly — its field is still `?: boolean`
(`:21`) — so the two pages now look identical while meaning different things.

### 3. Nit — reel visibility rule re-derived client-side

`ReelsCurationPage.tsx:78` computes `isPubliclyVisible: reel.status === 'published'`. That is the
same rule as `isReelPubliclyVisible` in `apps/api/src/modules/reels/reel.repository.ts:67`, whose
own doc comment says it is exported precisely "so `reelsCuration.mapper.ts` and the public reels
service share this one definition rather than re-deriving it."

The admin app cannot import it — it lives in `apps/api`. Unlike article visibility, which depends
on `publishedAt` and is genuinely server-side, this one is a pure function of a status enum that
`packages/contracts` already owns. Moving it next to `reelStatusSchema` in
`packages/contracts/src/reel.ts` would let all three consumers share it, which is the guarantee
`docs/ARCHITECTURE.md` §3 describes ("A field renamed in one place fails the build in the other
two"). Worth doing when the follow-up renders the rail and `apps/web` becomes a fourth consumer.

### 4. Nit — task 9.3's test counts are stale

`tasks.md:114` reads "48 files, 397 tests … (49 new: 30 contracts + 17 api)". Measured at head:
**398** tests across 48 files. `ae031b2` added the caption-edit revalidation test
(`reel.service.test.ts`, "revalidates '/' when an already-published reel's caption is edited") and
the count was not bumped. The breakdown is separately inconsistent — `30 + 17 = 47`, not 49 — and
the api figure is now 18 (`reel.service.test.ts` 7 + `reelsCuration.service.test.ts` 6 +
`publicReels.service.test.ts` 5), giving 48 new.

Same class as the `design.md` and delta-spec drift fixed in `462c0c5`; flagging it so the artifact
set is self-consistent when archived.

### 5. Nit — failed poster re-upload keeps the previous replacement

`handleEditPosterSelected` (`:141`) sets an error on failure but leaves `editPosterMediaId` and
`editPosterPreviewUrl` at their previous values. The create-side `handlePosterSelected` (`:83`)
clears both.

Failure scenario: the editor picks poster A (uploads fine), then picks poster B (upload fails).
The error appears, but the preview still shows A and Save still submits A — the editor's last
intent was B, and nothing on screen says A is what will be saved. Clearing on failure, or
disabling Save while an upload error is unacknowledged, would match the create form.

Also at `:135`: `if (!file) return` leaves the edit form's poster state untouched where the create
form treats a cleared file input as "no poster". Harmless in practice — cancelling a file dialog
fires no `change` event in current browsers — but the asymmetry is unexplained.

## Rule check

| Rule | Where | Complies |
|---|---|---|
| TypeScript strict, no `any` | `CLAUDE.md` | Yes — `pnpm typecheck` clean; no `any` in the diff. The one `as ReelStatus` assertion is gone (`d322629`), replaced by `reelStatusSchema.parse`. |
| No duplicated logic | `CLAUDE.md` | Yes, now — both duplications raised last round are extracted (`replaceOrdering`, `publicReadRateLimiter`). Finding 3 is a remaining third-order case. |
| Errors as typed `AppError`, formatted once in `errorHandler` | `CLAUDE.md`, ARCHITECTURE §4 | Yes — `invalid_reel_url`, `invalid_poster_media`, `duplicate_reel`, `invalid_reel_reference` all thrown as `AppError` and translated from pg codes in the service/repository, never in a controller. |
| Controllers hold no business `if`; services never import Drizzle; repositories never import Express | ARCHITECTURE §4 | Yes across all five new module files. |
| No raw row reaches the client | ARCHITECTURE §4 | Yes — `reel.mapper.ts` / `reelsCuration.mapper.ts` on every path; `posterUrl` derived at map time, never stored. |
| Contracts shared, not redeclared | ARCHITECTURE §3 | Yes, now — `reelProviderSchema` used in the curation summary and `MAX_REELS_CURATION_ENTRIES` imported by the admin page (`24dd18e`). Finding 3 is the one remaining re-derivation. |
| UUID PKs, migrations, transactions | `CLAUDE.md` | Yes — `0003_boring_mercury.sql`; whole-list replace in one transaction. |
| RLS enabled, default deny | ARCHITECTURE §6.3, §11 | Yes — both new tables, with the rationale inline in the migration. |
| Every route carries an explicit authorisation declaration | ARCHITECTURE §5.5, §11 | Yes — `news.manage` on all seven admin routes, `requirePublic()` on `GET /reels`; the boot-time audit accepts them (`health.routes.test.ts` still passes). |
| Zod validation on every body | ARCHITECTURE §11 | Yes — `.strict()` on both request schemas, so a caller-supplied `provider`/`position` is a 400 rather than silently ignored. |
| Rate limits enforced, not merely mounted | ARCHITECTURE §11 | Yes — `publicReadRateLimiter('public-reels')` on the public rail, namespaced so it shares no bucket with articles or the home feed. |
| No iframe / embed markup in stored or served content | `sanitizeHtml.ts:129-134`, delta spec | Yes — `PublicReelItem` is four scalar fields; `buildReelEmbedUrl` has no production caller and composes from a code literal with a re-validated identifier. `sanitizeHtml.ts` untouched. |
| Build, lint, tests, no TS errors before completion | `CLAUDE.md` | Yes — all four verified at `462c0c5` (see Summary). Finding 4 is only the artifact's record of the count. |
| PR references the approved OpenSpec change | `CLAUDE.md` | Yes — PR body opens with `Proposes: openspec/changes/add-reels-curation/`. |

## Round 1 findings — disposition

| # | Prior finding | Fixed in | Verified |
|---|---|---|---|
| 1 | Major — caption/poster edit on a published reel never revalidated `/` | `ae031b2` | `reel.service.ts:96` now gates on `wasVisible \|\| isVisible`; test added |
| 2 | `findManyByIds` dead code + stale comment | `ae031b2` | Interface member, impl, and test stub all gone |
| 3 | `replace()` duplicated the home-curation lock sequence | `6067fac` | Extracted to `lib/replaceOrdering.ts`; statement order preserved |
| 4 | Third copy of the public read rate limiter | `e3c99da` | Moved to `middleware/rateLimit.ts:138`; three call sites import it |
| 5 | `provider: z.string()` dropped the provider enum | `24dd18e` | `reelsCuration.ts:32` uses `reelProviderSchema`; `PickedItem.provider` is `ReelProvider` |
| 6 | `design.md` documented a route the code rejected | `462c0c5` | Now `PUT /admin/reels-curation` with a pointer to `tasks.md` 5.1 |
| 7 | Delta spec requirement reads as delivered once archived | `462c0c5` | Note added on the requirement itself |
| 8 | tasks.md 7.1 claimed "edit" but only status was editable | `d322629` | Inline caption + poster editing shipped — see round 2 finding 1 |
| 9 | Local `MAX_ENTRIES` shadowed the contract constant | `24dd18e` | Imports `MAX_REELS_CURATION_ENTRIES` |
| 10 | `as ReelStatus` unchecked assertion | `d322629` | `reelStatusSchema.parse(e.target.value)` |
| 11 | "not live" badge missing for a freshly-added reel | `24dd18e` | `addReel` sets `isPubliclyVisible`; field now required — see round 2 finding 2 |
| 12 | Poster uploaded before the reel exists → orphaned media row | — | Deferred deliberately; rationale accepted (pre-existing pattern, inert orphan) |

## Round 2 findings — disposition

All five findings from this review round were replied to inline on PR #7 and resolved on
`claude/add-reels-curation` at `a2b38a1`, pushed after this report was written.

| # | This round's finding | Outcome | Where |
|---|---|---|---|
| 1 | Minor — status-change/delete errors structurally undisplayable | Fixed | `updateState`/`removeState.errorMessage` hoisted to page level next to the `forbidden` banner; redundant in-form copy dropped; edit-form header wording corrected |
| 2 | Nit — `=== false` vestigial | Fixed | `!item.isPubliclyVisible` |
| 3 | Nit — reel visibility rule re-derived client-side | **Not fixed — deferred** | Agreed with the finding's own conclusion: no second caller yet (`apps/admin` is the only consumer), so moving `isReelPubliclyVisible` into `packages/contracts` now would be churn without a use. Left as a follow-up for when the rail-rendering change gives `apps/web` a reason to share it — same posture as round 1's finding 12. |
| 4 | Nit — stale test counts in `tasks.md` 9.3 | Fixed | `48 files, 398 tests … (48 new: 30 contracts + 18 api)` |
| 5 | Nit — failed poster re-upload keeps stale replacement | Fixed | Falls back to the reel's current poster on a failed re-upload, matching the create form |

Verified after the fixes: `pnpm typecheck`, `pnpm lint`, `pnpm build` clean; `pnpm test` 398/398
(unchanged — all four fixes were admin-UI-only, no test surface added or removed).
