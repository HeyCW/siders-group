## Context

The schema (`packages/db/src/schema/`, 25 tables) and the API repositories that read/write it
(`apps/api/src/modules/*/`) were written specifically against Postgres semantics:
`RETURNING`, table-level `LOCK TABLE`, a partial index, RLS, a `pgSchema('app')` namespace,
native `uuid`, shared `CREATE TYPE` enums, and `pg`'s error shape (`err.code`, `err.constraint`).
MySQL 8.0 has no equivalent for five of those eight, so this is a redesign of the persistence
layer's mechanics, not a mechanical dialect swap. The decisions below are the ones that don't
have an obviously-correct answer and would otherwise get re-litigated inconsistently across the
~30 call sites they touch.

## Decision: primary keys are `char(36)` holding an application-generated UUIDv7

**What was considered:**

1. `binary(16)` — most compact, best clustered-index locality, but every read, write, log line,
   and admin-facing URL would need hex encode/decode. Rejected: the encoding tax is paid on every
   request for a storage saving nobody asked for.
2. `char(36)` + MySQL's `DEFAULT (UUID())` — keeps the database generating ids, closest to today's
   `.defaultRandom()`. Rejected: MySQL's `UUID()` is version 1, time-*low*-first, so successive
   inserts do not sort adjacently and scatter across the clustered primary-key B-tree — exactly
   the fragmentation UUIDv7 exists to avoid, and the schema would inherit it silently.
3. `char(36)` + application-generated UUIDv7 (RFC 9562). **Chosen.** Time-ordered high bits mean
   inserts append to the clustered index the way an auto-increment would, avoiding page splits
   under write load. Text format is unchanged from today's Postgres `uuid` values, so any data
   carried over from Postgres needs no id transformation. It also solves the `RETURNING` removal
   below for free: the application already knows the id before the `INSERT` runs.

**Consequence:** `packages/db` gains a `newId()` helper (backed by a UUIDv7 library) and every
`.primaryKey().defaultRandom()` becomes `.primaryKey().$defaultFn(newId)`. Foreign key columns
are `char(36)` with no default. `id != $1` comparisons, index definitions, and `references()`
calls are otherwise unaffected — this is a storage/generation change, not a modeling change.

## Decision: `RETURNING` becomes insert/update-then-select, using each repository's own finder

MySQL's dialect has no `RETURNING`. Because primary keys are now generated in the application
(previous decision), every call site has the same shape available:

```ts
// insert
const id = newId();
await tx.insert(table).values({ ...input, id });
const [row] = await tx.select().from(table).where(eq(table.id, id));

// update
await tx.update(table).set(patch).where(eq(table.id, id));
const [row] = await tx.select().from(table).where(eq(table.id, id));
```

**Alternative considered, and reversed during implementation:** this document originally called
for a shared cross-table helper (`packages/db/src/insertReturning.ts`, `updateReturning.ts`), on
the grounds that ~29 call sites of the same shape is exactly what `CLAUDE.md`'s "no duplicated
logic" argues against inlining. Implementation found the premise wrong: most repositories
*already* re-select after a write, because the value they hand back is a joined view (e.g.
`partner.repository.ts`'s `create` already calls its own `findByIdJoined` even under Postgres,
purely to attach `logoStoragePath` from `media`), not a bare row a generic helper's `SELECT *`
could produce. A cross-table helper generic enough to cover both the plain and the joined cases
either can't be typed cleanly against Drizzle's per-table generics, or degenerates into "pass in
your own select function," which is the two-line inline pattern with extra ceremony. The two-line
pattern is what shipped; see `openspec/changes/migrate-postgres-to-mysql/tasks.md` §3 for the
per-repository list.

**Consequence:** every call site that currently does `.returning()` and hands the row to a caller
must wrap insert-then-select (or update-then-select) in a transaction, so a concurrent write to
the same row cannot make the response describe a state that never existed. Call sites that only
used `.returning()` to learn whether a row existed (e.g. `toggleLike`'s delete) do not need this —
they switch to the driver's `affectedRows` count instead, which is cheaper and needs no follow-up
read. Confirmed live that MySQL's `affectedRows` reports rows *matched*, not rows *changed*
(a no-op `UPDATE ... SET x = 'same value'` still reports `affectedRows: 1`) — this is the
behavior every count-only site depends on, since `RETURNING`'s replacement has to answer "did
this id match a row," not "did any column's value actually change."

## Decision: table-level reorder locks become named advisory locks (`GET_LOCK`/`RELEASE_LOCK`)

Four call sites (`replaceOrdering.ts`, `replaceSortOrder.ts`, `guidePick.repository.ts`,
`partner.repository.ts`) use `LOCK TABLE ... IN EXCLUSIVE MODE` to serialize a
read-full-id-set/reorder/write sequence. The existing code comments in `replaceSortOrder.ts`
already record why `SELECT ... FOR UPDATE` (row locks) was rejected for this: the reorder reads
the *entire* id set first, so a row lock on already-read rows does not stop a concurrent insert
from making that set stale before the write lands.

**Why not MySQL's `LOCK TABLES`:** it implicitly commits any open transaction before taking the
lock. That is disqualifying here — the whole point of the Postgres statement was to hold the lock
*inside* the same transaction as the reorder, so a failure anywhere in the sequence rolls back
cleanly. `LOCK TABLES` cannot do that.

**Chosen: `SELECT GET_LOCK(name, timeout)`**, one per orderable table (e.g.
`reorder:app.partners`), taken at the top of the transaction and released in a `finally`.
`GET_LOCK` is connection-scoped, not transaction-scoped — it survives a `ROLLBACK` — which is why
the release cannot be left to transaction cleanup and must be explicit. A `0` (timeout) or `null`
(error) return is treated as a `ConflictError` through the existing `AppError` hierarchy, not
silently proceeded past, since silently proceeding is exactly the race this lock exists to
prevent.

**Alternative considered:** a dedicated `reorder_locks(table_name)` row per orderable table, taken
with `SELECT ... FOR UPDATE`. This is transaction-scoped (released automatically on commit or
rollback, no `finally` required) but adds a table and a migration purely to hold a lock.
`GET_LOCK` was chosen for less new schema surface; if the `finally`-based release proves fragile
in practice, this is the fallback and the call sites are small enough to switch later without
disturbing the surrounding logic.

## Decision: the one partial index becomes a stored generated column

`comment_reports_open_idx` (`packages/db/src/schema/moderation.ts`) indexes
`comment_id WHERE resolved_at IS NULL` — MySQL has no partial index. The first design tried was a
generated column that collapses to `NULL` once a report is resolved:

```ts
// Rejected during implementation — see below.
openCommentId: char('open_comment_id', { length: 36 })
  .generatedAlwaysAs(sql`(case when resolved_at is null then comment_id end)`, { mode: 'stored' }),
```

**This fails at the schema level.** Applying it against a live MySQL 8 instance produced
`ERROR 1215 Cannot add foreign key constraint`: `comment_id` carries a cascading foreign key
(`ON DELETE CASCADE` to `comments.id`), and MySQL/InnoDB refuses to let a generated column read a
column that is itself the base column of a cascading foreign key — there is no way for InnoDB to
keep the generated value consistent through a cascaded update to the base column originating from
another table's delete. This is a real, narrow MySQL restriction with no analogue in the Postgres
design, and it would not have been found by inspection; it surfaced only by generating the
migration and applying it.

**Chosen instead:** a boolean generated purely from `resolvedAt`, which has no such dependency:

```ts
isOpen: boolean('is_open')
  .notNull()
  .generatedAlwaysAs(sql`(\`resolved_at\` is null)`, { mode: 'stored' }),
```

paired with a composite index `(isOpen, commentId)` rather than a single-column one — since the
generated value alone is not selective, the index has to lead with it and carry `commentId` to
serve the same "open reports for this comment" access pattern the partial index did. The
moderation queue's open-report aggregate is repointed to filter on `isOpen`, confirmed live (not
just with `EXPLAIN`): inserting two open reports against one comment and resolving one showed the
aggregate's `openReportCount`/`reportReasons` update correctly across the transition.

## Decision: Row Level Security is deleted, not emulated

MySQL has nothing resembling RLS. The alternative — modeling the same default-deny posture in
application code (a query-time tenant/role filter on every read) — was considered and rejected:
it would be new authorization logic invented for this migration, duplicating what
`docs/ARCHITECTURE.md` §2 already states is deliberately centralized in the API layer ("One
security model instead of two"). RLS's actual job here was defense against a hypothetical second
direct-connection client; the replacement is least-privilege MySQL grants (API user: DML only, no
DDL; a separate user for migrations), which defends against the same scenario without adding a
second authorization system. `assertDatabaseRoleCanReadNewsTables` (the Postgres-specific boot
check for RLS misconfiguration) is deleted along with the posture it was guarding.

## Decision: transaction isolation pinned to `READ COMMITTED`

MySQL's default isolation is `REPEATABLE READ`; Postgres's is `READ COMMITTED`, and every
transactional repository (8 of them) was written and reviewed against the latter's snapshot
semantics. Re-auditing all eight for `REPEATABLE READ` correctness (phantom reads, the specific
non-repeatable-read patterns each one may or may not rely on) is strictly more work than pinning
the session to the isolation level the code already assumes:
`SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED` on connection acquisition. This is
revisited only if a future change deliberately wants `REPEATABLE READ` semantics somewhere.

## Decision: timestamps are `datetime(3)`, connection pinned to UTC

`timestamp with time zone` has no MySQL equivalent — MySQL's `TIMESTAMP` type converts through
the session time zone on every read/write and is capped at 2038. `DATETIME` stores exactly what
it is given, so correctness depends entirely on every write going through the same UTC
convention, enforced by pinning the connection pool's `timezone` option to `'Z'` rather than
trusting each call site.

Precision is explicit at `fsp: 3` (milliseconds) because MySQL's default is whole seconds, and
`moderation.repository.ts`'s comment-list pagination uses `(created_at, id)` as a keyset cursor.
Two comments created in the same second would be indistinguishable by `created_at` alone under
second precision, reintroducing skipped/duplicated rows at page boundaries that the composite
cursor was specifically added to prevent.

## Decision: squash to one fresh baseline migration; do not port the 12 existing ones

The existing `supabase/migrations/*.sql` files are generated Postgres DDL: `CREATE TYPE ... AS
ENUM`, `gen_random_uuid()`, `ENABLE ROW LEVEL SECURITY`, and `app.`-qualified names throughout.
None of it is valid MySQL, and hand-translating twelve migrations statement-by-statement to
preserve a history that describes a schema evolution that never happened on MySQL produces a
migration log that is actively misleading to read later. A single `0000_init.sql` generated fresh
from the rewritten schema is the honest artifact: it says "this is where the MySQL schema starts,"
which is true.

## Risks / trade-offs

- **`GET_LOCK`'s connection-scoping is a sharp edge.** If a future change pools connections in a
  way that doesn't guarantee the same physical connection for acquire/release within one request
  (e.g. a middleware that re-borrows from the pool mid-request), the lock silently fails to
  protect anything. Mitigated by keeping acquire/release inside the same `db.transaction()`
  callback, which Drizzle guarantees runs on one connection.
- **The `sqlMessage` constraint-name parse is a string-format dependency**, not a structured
  field, and its exact shape differs between MySQL 8 (`table.constraint`) and MySQL 5.7/MariaDB
  (bare `constraint`) *for unique violations*. Implementation found this risk understated: unique
  and foreign-key violations don't share one message shape at all — a unique violation says
  `for key '...'`, a foreign-key violation says `CONSTRAINT \`name\` FOREIGN KEY ...` with no
  `for key` substring anywhere in it. `lib/dbErrors.ts`'s `violatedConstraint` tries both patterns
  now; it originally tried only the first, which would have silently returned `undefined` for
  every foreign-key-disambiguation call site (`guidePick.service.ts`, `partner.service.ts`,
  `anakUsaha.repository.ts`) — caught by `guidePick.service.test.ts`/`partner.service.test.ts`
  failing once their fake driver errors were updated to a real captured shape, not by inspection.
  If the target server version changes, both patterns need revalidation. Covered by unit tests
  fed real driver error messages captured from a live MySQL 8.0.40 instance.
- **CI had never run against a real database before this change.** Addressed:
  `.github/workflows/ci.yml` now runs a `mysql:8.0` service container, migrates it, and runs
  `apps/api/src/lib/mysqlIntegration.test.ts` against it (gated on `RUN_DB_INTEGRATION_TESTS=1`,
  so the rest of local development is unaffected). Not yet confirmed to actually pass inside
  GitHub Actions — verified locally against an equivalent live instance instead, since this
  implementation environment has no access to Actions.
