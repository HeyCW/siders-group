# Resolvable review — `delete-comment-mute-ban-reader`

**Verdict:** All code-level threads resolved · **1 item remains, and it needs a live database, not a code change**
**Range:** `main...HEAD` · 36 files · +6066 / −22 · 2026-08-17
**Implements:** `openspec/changes/add-community-moderation`

Commits: `7f1e33e` proposal · `9e1ab7c` ARCHITECTURE §8.1/§8.2 correction · `3b5d2a7` spec revision (ban narrowed, reporting added) · `7486c7f` implementation · *(this pass)* the R1–R9 fixes below.

Each thread below is self-contained: location, the problem, an exact patch, and a definite resolution test. Threads `W1`–`W2` were withdrawn on validation and needed no action. Every `R` thread is now resolved except **task 5.3** itself, which R1–R3's fix makes newly meaningful to run but which no environment here can execute.

---

## Resolution tracker

| Thread | Severity | Blocked merge | File | Status |
|---|---|---|---|---|
| [R1](#r1--array_agg-of-a-pg-enum-returns-a-raw-string) | **Critical** | ✅ was | `moderation.repository.ts:111` | ✅ **Resolved** |
| [R2](#r2--openreportcount-is-a-bigint-returned-as-a-string) | Minor | no | `moderation.repository.ts:106` | ✅ **Resolved** |
| [R3](#r3--the-partial-index-this-change-adds-is-unused-as-written) | Minor | no | `moderation.repository.ts:102` | ✅ **Resolved** |
| [R4](#r4--stale-reason-draft-reused-for-a-later-different-action) | Minor | no | `ReaderModerationPage.tsx:108` | ✅ **Resolved** |
| [R5](#r5--no-reader-facing-report-ui) | Minor | no | `tasks.md` §4 | ✅ **Resolved — scoped out, recorded in `proposal.md`** |
| [R6](#r6--array_agg-comment-describes-the-wrong-postgres-behaviour) | Nit | no | `moderation.repository.ts:107` | ✅ **Resolved** (dissolved by R3) |
| [R7](#r7--comment_queue_select_columns-is-screaming_case-but-is-a-function) | Nit | no | `moderation.repository.ts:120` | ✅ **Resolved** |
| [R8](#r8--bare-unqualified-alias-in-the-reported-filters-where-clause) | Nit | no | `moderation.repository.ts:275` | ✅ **Resolved** |
| [R9](#r9--dismissed-row-lingers-under-the-reported-filter) | Nit | no | `CommentModerationPage.tsx:124` | ✅ **Resolved** |
| [W1](#w1-withdrawn--partial-index-predicate-is-schema-qualified) | ~~Major~~ | — | `0006_rare_reptil.sql:50` | ✅ Withdrawn |
| [W2](#w2-withdrawn--filereport-skips-the-article-visibility-gate) | ~~Minor~~ | — | `moderation.service.ts:175` | ✅ Withdrawn |

**Remaining merge gate:** apply migration 0006 and run task 5.3 — the fixes below are verified by lint/typecheck/782 tests, but the specific driver behavior R1–R3 fix (bigint and enum-array decoding) only shows up against a real Postgres connection, which this environment does not have.

> **R1, R2 and R3 are one edit.** They all live in `reportAggregateSubquery` and its projection. Apply the [combined patch](#combined-patch-for-r1r3) rather than three separate ones.

---

## R1 · `array_agg` of a pg enum returns a raw string

**Critical · correctness**
`apps/api/src/modules/moderation/moderation.repository.ts:111`

✅ **Resolved**

### Problem

```ts
reportReasons: sql<CommentReportReason[] | null>`array_agg(distinct ${commentReports.reason}) filter (where ${commentReports.resolvedAt} is null)`
```

`commentReports.reason` is `app.comment_report_reason`, a user-defined enum. Its array type receives a dynamic OID at `CREATE TYPE` time. Verified against `pg-types@2.2.0`:

- `lib/textParsers.js` registers array parsers by **hardcoded built-in OID only** — `1005` `_int2`, `1007` `_int4`, `1009` `_text`, `1016` `_int8`, `1231` `_numeric`, `1115`, `1182`.
- `index.js` → `getTypeParser` returns `typeParsers[format][oid] || noParse`, and `noParse = (val) => String(val)`.

So the value arrives as the literal string `"{spam,harassment}"`. Three layers that look like checks let it through:

| Layer | Why it doesn't catch it |
|---|---|
| `moderation.mapper.ts:34` | `row.reportReasons.length > 0` — a non-empty **string** satisfies this |
| `commentQueueRowSchema` | declares `z.array(...)`, but nothing in this repo validates outgoing responses |
| `CommentModerationPage.tsx:203` | calls `comment.reportReasons.join(', ')` |

`String.prototype.join` does not exist → `TypeError` during render. `grep componentDidCatch\|ErrorBoundary\|getDerivedStateFromError apps/admin/src` returns **nothing**, so the throw unmounts the tree: the admin page goes blank, not one row. This is also the first array-returning read anywhere in the schema, so no working precedent existed to inherit.

### Patch

Cast inside the aggregate so the driver sees `text[]` (OID 1009, registered). See the [combined patch](#combined-patch-for-r1r3), applied.

### Resolves when

- [x] `reportReasons` is cast to `text[]` in SQL
- [ ] A mapper test exists whose fixture uses the driver's **real** shape (a string, pre-fix) and proves the row no longer reaches `.join()` as one — **not added.** Not left unaddressed by oversight: this bug lived entirely in Drizzle/Postgres decode behavior, which a fixture-based mapper test cannot exercise (the mapper only ever sees already-decoded TS values, by construction). `tasks.md` §3.6 now records this explicitly as a gap only a live-database run can close, rather than leaving it silently implied.
- [ ] Task 5.3 confirms the Reported tab renders a reported comment without blanking — pending a live database, unavailable in this environment

**Resolution:** Fixed by casting the aggregate to `array_agg(distinct ${commentReports.reason}::text)` — see the [combined patch](#combined-patch-for-r1r3). `pnpm lint`/`typecheck`/`test` all clean (782 tests). The specific runtime claim (that `pg-types` mis-decodes an uncast enum array) is verified from `pg-types@2.2.0` source, not from a test run against this fix — that verification is task 5.3's job once a database is available.

---

## R2 · `openReportCount` is a bigint returned as a string

**Minor · correctness, conventions**
`apps/api/src/modules/moderation/moderation.repository.ts:106`, projected at `:129`

✅ **Resolved**

### Problem

Verified: `pg-types` does `register(20, parseBigInteger)` for `int8`, and `parseBigInteger` returns a **string** (its callers `.trim()` the result). `count(*)` is `int8`, and neither site coerces:

```ts
openReportCount: sql<number>`count(*) filter (...)`.as('open_report_count'),   // :106 — no .mapWith
openReportCount: sql<number | null>`${reportAgg.openReportCount}`,             // :129 — re-wrapping discards any mapping
```

Deviates from this repo's universal practice: 11 aggregate sites in `analytics.repository.ts`, plus `commentCount` at `:210` of this same file, all use `.mapWith(Number)`.

**Why Minor and not Major.** The blast radius is narrow. The mapper's omission guard still behaves correctly (`"0"` is truthy but `"0" > 0` is false, so a fully-resolved comment is still omitted), the badge still renders, and the only wrong output is `CommentModerationPage.tsx:202`'s `=== 1` being false for `"1"` — rendering "1 reports". Nothing performs arithmetic on the value, so the contract violation is latent.

### Patch

`.mapWith(Number)` on the aggregate, and project the subquery field directly. See the [combined patch](#combined-patch-for-r1r3), applied.

### Resolves when

- [x] The aggregate carries `.mapWith(Number)` and is projected directly (not re-wrapped in `sql\`\`\`, which discarded the decoder)
- [ ] `typeof openReportCount === 'number'` confirmed on a real query result — pending task 5.3 / a live database
- [ ] A single report renders "1 report", not "1 reports" — same

**Resolution:** Fixed in the same edit as R1 — see the [combined patch](#combined-patch-for-r1r3). The decoder is now correctly attached in code; confirming it against the driver's actual bigint encoding is task 5.3's job.

---

## R3 · The partial index this change adds is unused as written

**Minor · performance**
`apps/api/src/modules/moderation/moderation.repository.ts:102`

✅ **Resolved**

### Problem

This is a **dead-artifact** point, not a latency claim — volume here is explicitly small (`ARCHITECTURE.md` §8.2 calls it "a queue two people look at"), so no performance evidence is offered and none is needed.

`reportAggregateSubquery` groups the whole `comment_reports` table and filters inside the aggregates. `comment_reports_open_idx` — partial on `resolved_at is null`, added **in this same change specifically for this read** — therefore cannot serve the scan.

### Patch

Filter at the subquery level. A comment whose reports are all resolved then produces no row here and falls to the `LEFT JOIN`'s `NULL`, which the existing `coalesce` guards in both the projection and the `reported` filter already treat as zero. The `FILTER` clauses become unnecessary, which also dissolves [R6](#r6--array_agg-comment-describes-the-wrong-postgres-behaviour).

### Resolves when

- [x] The subquery carries `.where(isNull(commentReports.resolvedAt))`
- [ ] `EXPLAIN` on the queue read shows `comment_reports_open_idx` in use — pending task 5.3 / a live database
- [x] The `reported` filter still excludes comments whose reports are all resolved — structurally guaranteed (an all-resolved comment now produces no subquery row at all, so it reads as `NULL` through the `LEFT JOIN`, same as never-reported) and confirmed by the existing service-level passthrough test; full SQL confirmation is task 5.3's job

**Resolution:** Fixed as part of the [combined patch](#combined-patch-for-r1r3). `pnpm test` (782 tests, including the moderation module's 52) stays green, confirming the change didn't alter any behavior the existing suite covers. `EXPLAIN`-level confirmation that the partial index is actually chosen needs task 5.3.

---

## Combined patch for R1–R3

**Applied as planned, plus one addition the plan understated:** the projection function
(`COMMENT_QUEUE_SELECT_COLUMNS`) needed to become `commentQueueSelectColumns`, a plain function
rather than a `sql`-wrapping one — and both call sites (`commentQueueRow`, `listCommentQueue`)
now construct `reportAggregateSubquery` themselves and pass it into `commentQueueBaseQuery`
explicitly, rather than the base-query function building it internally. That threading was
necessary to project the decoded columns directly (R1/R2) and turned out to be exactly what R8
also needed — a real `reportAgg.openReportCount` reference in the `reported` filter instead of a
bare SQL identifier. R7 (renaming the SCREAMING_CASE constant to a function) rides along in the
same edit. Final state in `apps/api/src/modules/moderation/moderation.repository.ts`:

```ts
/**
 * The open-report aggregate, computed once here and left-joined into every comment-queue read
 * rather than expressed as a `GROUP BY` over the joined query — a `LEFT JOIN` to a pre-aggregated
 * subquery keeps every other join in the query at its natural one-row-per-comment cardinality,
 * the same shape `readerRowSelect`'s own `commentCountSubquery` already established.
 *
 * Scoped to unresolved reports at the subquery level, not inside `FILTER` clauses, so
 * `comment_reports_open_idx` (partial on `resolved_at is null`) can serve the scan. A comment
 * whose reports are all resolved produces no row here at all and falls to the `LEFT JOIN`'s
 * `NULL`, which the `coalesce` guards downstream already read as zero.
 */
function reportAggregateSubquery(db: Executor) {
  return db
    .select({
      commentId: commentReports.commentId,
      // `.mapWith(Number)` because `count(*)` is `bigint`, and node-postgres returns `bigint` as
      // a string (`pg-types` registers oid 20 -> `parseBigInteger`). Every other aggregate in
      // this repo coerces the same way — see `analytics.repository.ts` and `:210` below.
      openReportCount: sql<number>`count(*)`.mapWith(Number).as('open_report_count'),
      // `::text` is load-bearing, not cosmetic. A user-defined enum's array type gets a dynamic
      // OID at `CREATE TYPE` time, and `pg-types` parses only built-in array OIDs — so without
      // the cast this arrives as the raw string `'{spam,other}'` and the admin UI's `.join()`
      // throws. `text[]` is oid 1009, which is registered.
      reportReasons: sql<CommentReportReason[]>`array_agg(distinct ${commentReports.reason}::text)`.as(
        'report_reasons',
      ),
    })
    .from(commentReports)
    .where(isNull(commentReports.resolvedAt))
    .groupBy(commentReports.commentId)
    .as('report_agg');
}
```

```ts
function commentQueueSelectColumns(reportAgg: ReturnType<typeof reportAggregateSubquery>) {
  return {
    id: comments.id,
    body: comments.body,
    status: comments.status,
    articleId: comments.articleId,
    articleTitle: articles.title,
    articleSlug: articles.slug,
    authorName: readers.name,
    createdAt: comments.createdAt,
    // Projected directly, not re-wrapped in a `sql` template — wrapping an already-decoded
    // column back in `sql\`${...}\`` discards the decoder (`.mapWith(Number)` above).
    openReportCount: reportAgg.openReportCount,
    reportReasons: reportAgg.reportReasons,
  };
}

function commentQueueBaseQuery(db: Executor, reportAgg: ReturnType<typeof reportAggregateSubquery>) {
  return db
    .select(commentQueueSelectColumns(reportAgg))
    .from(comments)
    .innerJoin(articles, eq(articles.id, comments.articleId))
    .innerJoin(readers, eq(readers.id, comments.readerId))
    .leftJoin(reportAgg, eq(reportAgg.commentId, comments.id));
}
```

Both call sites now build `reportAgg` themselves and thread it through — `commentQueueRow` (used by `findCommentById` and the post-write re-reads) and `listCommentQueue` (which also uses it for the `reported` filter, resolving R8 in the same motion):

```ts
async function commentQueueRow(executor: Executor, id: string): Promise<CommentQueueRow | null> {
  const reportAgg = reportAggregateSubquery(executor);
  const [row] = await commentQueueBaseQuery(executor, reportAgg).where(eq(comments.id, id)).limit(1);
  return row ?? null;
}
```

```ts
async listCommentQueue(filter) {
  const reportAgg = reportAggregateSubquery(db);
  const conditions: SQL[] = [ /* ...unchanged status/cursor conditions... */ ];
  if (filter.status === 'reported') {
    // R8: references the actual subquery column instead of a bare `open_report_count`
    // identifier that only happened to be unambiguous before.
    conditions.push(gt(sql`coalesce(${reportAgg.openReportCount}, 0)`, 0));
  }
  const rows = await commentQueueBaseQuery(db, reportAgg)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(filter.limit + 1);
  // ...unchanged pagination logic...
}
```

`isNull` was already imported at `:1`. `CommentQueueRow` keeps `openReportCount: number | null` / `reportReasons: CommentReportReason[] | null` unchanged — the `LEFT JOIN` can still yield nothing for an unreported comment, and Drizzle's join typing widens the subquery's non-null column types to nullable at the result-row level regardless, so the interface didn't need to change.

**Verified:** `pnpm typecheck` clean across all six packages; `pnpm test` — 782 tests passing, including all 52 in the moderation module — after this edit.

---

## R4 · Stale reason draft reused for a later, different action

**Minor · correctness**
`apps/admin/src/pages/ReaderModerationPage.tsx:108`

✅ **Resolved**

### Problem

Verified: `setReasonDrafts` is called only from the input's `onChange` (`:199`) and never on success. Type a reason, ban a reader, then click "Mute 24h" on that same reader — the ban's reason is written to the **mute's** `moderation_actions` row.

`design.md` Decision 3 justifies the log's existence on the grounds that "a wrong call is reviewable"; a mis-attributed reason erodes precisely that. Held at Minor because the stale text stays visible in the input the moderator is looking at.

### Patch

```ts
  async function applyAction(id: string, input: Parameters<typeof moderationApi.moderateReader>[1]) {
    try {
      const updated = await runModerate(id, { ...input, ...(reasonFor(id) ? { reason: reasonFor(id) } : {}) });
      setReaders((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      // Cleared only on success, so a rejected action keeps the moderator's text — and so the
      // next action on this reader cannot silently inherit this one's reason.
      setReasonDrafts((prev) => ({ ...prev, [id]: '' }));
    } catch {
      /* surfaced via moderateState.errorMessage */
    }
  }
```

### Resolves when

- [x] Ban with a reason, then mute the same reader — the second `moderation_actions` row has `reason = null` (verified by code inspection: `setReasonDrafts` now clears the entry on success, and `planReaderModeration`/`updateReader` build the log entry from the request's `reason` at call time, so a cleared draft means the next call carries none)
- [x] A rejected action still leaves the typed reason in the input — the clear sits inside the `try` block after the `await`, so a thrown/rejected `runModerate` skips it entirely

**Resolution:** Patch applied exactly as proposed — `setReasonDrafts((prev) => ({ ...prev, [id]: '' }))` added after the successful update, inside the `try`. No dedicated component test exists for `ReaderModerationPage` (none did before this fix either), so this is verified by reading the control flow rather than by a new automated test. `pnpm typecheck`/`lint` clean.

---

## R5 · No reader-facing report UI

**Minor · correctness (scope)**
`openspec/changes/add-community-moderation/tasks.md` §4

✅ **Resolved — decision made, recorded**

### Problem

`POST /comments/:id/report` is implemented, reader-gated and rate-limited, but nothing in `apps/web` calls it and no `apps/web` file appears in the diff. `tasks.md` §4 is Admin-only, so **the implementation matches the task list exactly — the gap is in the task list, not the code.**

Consequence: the `reported` filter, the dismiss action and the 20/hour limiter have no organic input source, while `specs/community-moderation/spec.md`'s Purpose names "the reader-facing report intake that feeds it". Task 5.3 exercises reporting via direct API calls, so manual verification is unblocked either way.

### Resolves when — pick one

- [ ] ~~In scope: add a `tasks.md` §4 entry plus an `apps/web` report control and `engagementApi`-style call~~
- [x] **Out of scope**, chosen by the change owner: record the deferral in `proposal.md` Non-goals, so the gap reads as chosen rather than overlooked

**Resolution:** `proposal.md`'s Non-goals section now states explicitly: "No reader-facing report control in `apps/web` this launch — `POST /comments/:id/report` exists, is reader-gated and rate-limited, and is exercised by task 5.3's manual pass, but no UI element in the public site calls it yet; building one is a natural, small follow-up once this change's staff-facing half has been used in practice." It also notes the admin comment queue, `reported` filter, and dismiss action are independently useful without it. No code changes — this was a scope call, not a defect.

---

## R6 · `array_agg` comment describes the wrong Postgres behaviour

**Nit · hygiene**
`apps/api/src/modules/moderation/moderation.repository.ts:107`

✅ **Resolved — dissolved, not patched**

The comment claims `array_agg` over an empty filtered set "returns a one-element array containing `null`". With a `FILTER` clause and zero matching rows it returns `NULL` outright; `{NULL}` is the *no-`FILTER`* case. The code was right and the downstream null guard handled it, so this was comment accuracy only — no behavioural impact.

**Resolves when:** the [combined patch](#combined-patch-for-r1r3) removes the `FILTER` clauses entirely. ✅

**Resolution:** No longer applicable — the wrong claim and the `FILTER` clause it described are both gone. The new comment on `reportAggregateSubquery` describes the actual (and simpler) behavior: a comment with no unresolved reports produces no row in the subquery at all.

---

## R7 · `COMMENT_QUEUE_SELECT_COLUMNS` is SCREAMING_CASE but is a function

**Nit · conventions**
`apps/api/src/modules/moderation/moderation.repository.ts:120`

✅ **Resolved**

It became a factory taking `reportAgg`; the repo reserves `UPPER_SNAKE` for constants (`coding-style.md`).

```ts
function commentQueueSelectColumns(reportAgg: ReturnType<typeof reportAggregateSubquery>) { ... }
```

Two call sites: `:136` and the one inside `commentQueueRow`.

**Resolves when:** renamed and both call sites updated; `pnpm typecheck` clean. ✅

**Resolution:** Renamed as part of the [combined patch](#combined-patch-for-r1r3) (it had to change shape anyway for R1/R2/R8, so the rename rode along). Both call sites updated. `pnpm typecheck` clean.

---

## R8 · Bare unqualified alias in the reported filter's `WHERE` clause

**Nit · conventions**
`apps/api/src/modules/moderation/moderation.repository.ts:275`

✅ **Resolved**

```ts
conditions.push(gt(sql`coalesce(open_report_count, 0)`, 0));
```

Valid SQL — `open_report_count` is a column of the joined subquery, not an output alias — but it reached past Drizzle to a bare identifier, and resolved only because nothing else in the query exposed that name.

```ts
conditions.push(gt(sql`coalesce(${reportAgg.openReportCount}, 0)`, 0));
```

Required threading `reportAgg` into `listCommentQueue`; `commentQueueBaseQuery` used to create it internally, so this needed the base-query function to accept it as a parameter instead.

**Resolves when:** the filter references the subquery field rather than a bare identifier, and the `reported` filter still behaves. ✅

**Resolution:** Fixed as part of the [combined patch](#combined-patch-for-r1r3) — `listCommentQueue` now builds `reportAgg` itself and passes it both to the `reported` condition and to `commentQueueBaseQuery`. The existing service-level test asserting `listCommentQueue` passes the `reported` filter through to the repository still passes unchanged.

---

## R9 · Dismissed row lingers under the Reported filter

**Nit · hygiene**
`apps/admin/src/pages/CommentModerationPage.tsx:124`

✅ **Resolved**

Verified: `confirmDismiss` mapped the row in place, so its badge and dismiss button disappeared but the row stayed listed under a filter it no longer matched for up to 30 seconds.

```ts
      setComments((prev) =>
        statusFilter === 'reported'
          ? prev.filter((c) => c.id !== updated.id)
          : prev.map((c) => (c.id === updated.id ? updated : c)),
      );
```

**Resolves when:** dismissing under the Reported filter removes the row immediately. ✅

**Resolution:** Patch applied exactly as proposed, with a one-line comment explaining why the branch exists. Pure client-side state logic, verified by reading the control flow — no live data needed to confirm a `filter()` behaves as written. `pnpm typecheck`/`lint` clean.

---

## W1 (withdrawn) · Partial-index predicate is schema-qualified

~~Major~~ → **no action required**
`supabase/migrations/0006_rare_reptil.sql:50`

Raised in the first pass, withdrawn on validation. I had flagged my own inability to test as a defect. Postgres resolves a three-part `schema.table.column` reference inside a `CREATE INDEX` predicate against the target relation's range-table entry, so `WHERE "app"."comment_reports"."resolved_at" is null` is valid SQL. Nothing is wrong with the generated migration.

That 0006 has never been applied is real, but `tasks.md` task 5.3 already declares it and is unchecked by design. A documented open item is not a review finding — it appears in the merge gate instead.

---

## W2 (withdrawn) · `fileReport` skips the article-visibility gate

~~Minor~~ → **no action required**
`apps/api/src/modules/moderation/moderation.service.ts:175`

Raised in the first pass, withdrawn on validation. It imported a rule from a different capability's spec. `specs/community-moderation/spec.md` states "**Any** authenticated reader SHALL be able to file a report against a comment" — no visibility qualifier — and "A sanctioned reader may still report" widens access further. The spec's direction here is deliberately permissive, and the gate would arguably contradict it. There is a sound product reason for the openness too: a reader who saw a comment before it was removed should still be able to report it.

The accompanying existence-oracle concern was thin alone (comment ids are not sensitive) and does not stand without the conventions argument. **Security aspect: zero findings.**

---

## Rule check

| Rule | Source | State |
|---|---|---|
| RLS default-deny, no policies, on every new table | `ARCHITECTURE.md` §6.3 | ✅ both tables, plus `GUARDED_TABLES` |
| Errors as typed `AppError`, clients branch on `code` | §9.2 | ✅ `not_found`, `already_reported`, `invalid_cursor`, `invalid_mute_duration`, `reader_banned` |
| Rate limits per route, per identity, own namespace | §9.3 | ✅ `engagement-report`, 20/h, keyed on reader id, after `requireReader` |
| Admin uses `useState`/`useEffect`/`useAsyncAction` | §8.2 (drift recorded in `design.md`) | ✅ |
| Ban/mute restrict only content creation | `specs/authorization/spec.md` | ✅ blast radius verified as exactly the 4 `requireReader` sites |
| Moderation record atomic with the state change | `specs/community-moderation/spec.md` | ✅ all writes in one transaction |
| Removal resolves open reports; restore does not reopen | same | ✅ status-conditional, with tests |
| A reader may report a given comment only once | same | ✅ unique index → `409 already_reported` |
| Any authenticated reader may report; sanctioned readers too | same | ✅ `createsContent: false`, no visibility gate — correct per spec (see W2) |
| Report volume never triggers an automatic action | same | ✅ no threshold anywhere in the code |
| Comment bodies rendered as plain text in the queue | same | ✅ text child, no `dangerouslySetInnerHTML` |
| Open report count and reasons per reported row | same | ✅ fixed — R1, R2 resolved (driver-level confirmation still pending 5.3) |
| Fixed permission catalog extended, never runtime-creatable | `specs/rbac-management/spec.md` | ✅ in `PERMISSION_KEYS`, seeded, granted to Owner |
| Build, lint, tests, no TS errors | root `CLAUDE.md` | ✅ 782 tests, lint and typecheck clean, including after this pass's fixes |
| Migration applied and manually verified | `tasks.md` 5.3 | ⬜ unrun by design — the one remaining merge gate |

---

## What actually changed, this pass

| File | Change |
|---|---|
| `apps/api/src/modules/moderation/moderation.repository.ts` | R1, R2, R3, R7, R8 — `reportAggregateSubquery` rewritten (cast + `.mapWith` + `.where(isNull(...))`), `commentQueueSelectColumns` (renamed, projects decoded columns directly), `commentQueueBaseQuery` now takes `reportAgg` as a parameter, both call sites updated, `reported` filter references the real column |
| `apps/admin/src/pages/ReaderModerationPage.tsx` | R4 — `reasonDrafts` entry cleared on success |
| `apps/admin/src/pages/CommentModerationPage.tsx` | R9 — dismissed row dropped immediately under the Reported filter |
| `openspec/changes/add-community-moderation/proposal.md` | R5 — Non-goals gained the reader-facing-report-UI deferral, per your decision |
| `openspec/changes/add-community-moderation/tasks.md` | R6 context — task 3.6's "not covered" note rewritten to name the actual untestable-without-a-database gap (driver decoding, not `FILTER` semantics), with a note on how this bug shipped past a green suite |

**Verification after every change:** `pnpm lint` clean, `pnpm typecheck` clean across all 6 packages, `pnpm test` — 782 tests passing across 91 files, no regressions.

## What's left

**Task 5.3**, unavoidably — apply migration 0006 to a real Postgres instance and confirm:
- a reported comment's badge renders with real reasons, not a crash
- `openReportCount` really is a JS number end to end
- `EXPLAIN` picks `comment_reports_open_idx` for the aggregate

No environment available here has a live database, so this is the one gate this pass cannot close. Everything else in the tracker is done.
