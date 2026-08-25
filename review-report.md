# Review report

**Verdict:** Rejected with changes

## Reviewed at

| Range | Files | +/- | Date |
|---|---|---|---|
| `HEAD` (working tree, untracked files included) | 111 | +2482 / −33074 | 2026-08-25 |

Change under review: `openspec/changes/migrate-postgres-to-mysql` — replace the
PostgreSQL/Supabase data layer with MySQL 8.0.

## Summary

This is a genuinely good migration. The hard parts are handled deliberately rather than
improvised: `RETURNING` removal, `LOCK TABLE` → `GET_LOCK`, the partial-index rewrite, the
`ONLY_FULL_GROUP_BY` and `filter (where ...)` fallout in analytics, and the two-shape constraint-name
parser in `dbErrors.ts` are each argued in `design.md` and carry the reasoning forward into the
code comments. Three of the four Postgres-only constructs the original audit missed were found and
fixed by live verification. `pnpm lint` and `pnpm typecheck` are clean; index parity holds; the
raw-SQL rewrites are free of injection; `affectedRows` really does mean "rows matched" here
(mysql2 sets `FOUND_ROWS` in its default client flags — `connection_config.js:230`), so the ~6
count-only conversion sites are correct as written.

The verdict is driven by five Major findings, four of which sit in one file — `packages/db/src/client.ts`
— and share one root cause: **connection/session configuration that `design.md` promised but never
shipped.** `READ COMMITTED` appears nowhere in the repo (#1); the connection is not actually pinned
to UTC, so server-side `curdate()` in the view-counting hot path silently follows the server's local
date (#2); and TLS is off by default with the Postgres URL's `sslmode` silently ignored (#3). Each is
small to fix. #4 (timestamps moved from the database clock to each API process's clock) is an
undocumented semantic change that touches a guarantee `spec.md` makes explicitly. #5 is a test that
claims to cover the highest-risk rewrite but exercises a hand-copied duplicate of it instead.

**On the test suite.** `tasks.md` §7.3 claims "`pnpm lint && pnpm typecheck && pnpm test` all clean
(967 passed, 3 correctly skipped)". That is not reproducible here: the suite reports **970 tests, 5
skipped**, with 8–12 failures varying run to run. I checked whether the change caused them, and it
did not — `StaffPage.test.tsx` fails identically with both changed files reverted to `HEAD` (this
change edits only comments in them), and `health.routes.test.ts` passes 3/3 in isolation and fails
only under full-suite load. The failures are pre-existing flakiness in this environment, out of scope
for this review. The claim in `tasks.md` should still be re-checked and restated, since the test/skip
counts alone show it was written against a different tree state.

No repo review guide (`CONTRIBUTING.md`, `docs/reviewing.md`) exists; rubrics come from this skill's
defaults, and rules are cited against `CLAUDE.md`, `docs/ARCHITECTURE.md`, and the change's own
`proposal.md` / `design.md` / `spec.md`.

## Findings

| # | Severity | Aspect(s) | File:line | Title |
|---|---|---|---|---|
| 1 | Major | correctness, performance, conventions | `packages/db/src/client.ts:18` | `READ COMMITTED` isolation is never set anywhere, despite being a stated decision |
| 2 | Major | correctness | `apps/api/src/modules/engagement/engagement.repository.ts:95` | `curdate()` follows the *server's* time zone; the connection is not pinned to UTC, and the comment claiming it is is wrong |
| 3 | Major | security | `packages/db/src/client.ts:18` | Pool has no TLS; a `sslmode=require` carried over from the Postgres URL is silently ignored |
| 4 | Major | correctness | `packages/db/src/schema/engagement.ts:61` | Timestamp defaults moved from the database clock to each API process's clock, undocumented |
| 5 | Major | conventions, correctness | `apps/api/src/lib/mysqlIntegration.test.ts:55` | The integration test for `recordView` exercises a hand-copied duplicate of its SQL, not the shipped function |
| 6 | Minor | correctness | `apps/api/src/lib/tableWriteLock.ts:5` | `LockExecutor` permits passing the bare pool, which silently breaks the lock's connection-scoping |
| 7 | Minor | performance | `apps/api/src/modules/auth/session.repository.ts:79` | Avoidable post-insert `SELECT` on every login and refresh rotation (and 3 sibling sites) |
| 8 | Minor | performance | `packages/db/src/client.ts:18` | No `connectionLimit` / `queueLimit` / `idleTimeout`, so mysql2's unbounded queue gives no backpressure |
| 9 | Minor | correctness | `db/migrations/0001_seed_permission_catalog.sql:16` | Seed rows use MySQL's `uuid()` (v1), violating the change's own UUIDv7 primary-key invariant |
| 10 | Minor | security | `db/init/01-create-api-user.sql:8` | `siders_api` password hardcoded with no env override, unlike its two sibling credentials |
| 11 | Minor | security | `db/init/01-create-api-user.sql:8` | Grant issued to `'siders_api'@'%'` rather than a scoped host |
| 12 | Minor | security | `apps/api/src/modules/moderation/moderation.repository.ts:405` | `LIKE` wildcard metacharacters unescaped in the reader search term (carried over, not new) |
| 13 | Minor | conventions | `apps/api/src/modules/engagement/engagement.repository.ts:114` | Redundant `as unknown as [...]` casts on Drizzle results that are already typed (5 sites) |
| 14 | Minor | conventions | `packages/db/src/schema/articles.ts:23` | `articles.title` stayed `text` while every sibling short-text column became `varchar` |
| 15 | Minor | correctness | `apps/api/src/lib/mysqlIntegration.test.ts:36` | `afterAll` leaves orphaned article/view rows referencing a deleted user |
| 16 | Minor | conventions, hygiene | `docs/ARCHITECTURE.md:513` | Stale "Without Supabase Realtime" survived the straggler sweep |
| 17 | Nit | conventions | `.github/workflows/ci.yml:60` | CI calls `drizzle-kit migrate` directly instead of the `db:migrate` script `db/README.md` documents |

## Details

### 1. Major — `READ COMMITTED` isolation is never set anywhere

`packages/db/src/client.ts:18`

`proposal.md` states it as a shipped change: *"The transaction isolation level is pinned to `READ
COMMITTED` per session, because MySQL defaults to `REPEATABLE READ` and the existing transactional
repositories were written against Postgres's `READ COMMITTED` default."* `design.md` repeats the
decision.

It is not implemented. A repo-wide grep for `READ COMMITTED`, `isolationLevel`,
`transaction_isolation`, and `tx_isolation` across `apps/`, `packages/`, `db/`, `docker-compose.yml`
and `.github/` returns nothing. `createPool()` sets no isolation level, `docker-compose.yml` passes no
`--transaction-isolation`, and the CI service container passes no server args at all. There is also no
task covering it in `tasks.md` §1–8, so it was not merely deferred — it was dropped without being
noticed.

Every transaction therefore runs under `REPEATABLE READ`: consistent-snapshot reads for the life of
the transaction, and next-key/gap locking rather than plain row locking. The eight transactional
repositories were written and reviewed against `READ COMMITTED` semantics, and the change never
re-examined them under the isolation level they actually got.

**Fix** — set it once per physical connection rather than per query:

```ts
const pool = createPool({ uri: env.DATABASE_URL, timezone: 'Z', supportBigNumbers: true, dateStrings: false });
pool.on('connection', (conn) => {
  conn.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
  conn.query("SET SESSION time_zone = '+00:00'"); // see finding #2
});
```

Add `--transaction-isolation=READ-COMMITTED` to `docker-compose.yml`'s `command:` and to the CI
service container as defence in depth, and add a task to `tasks.md` so the decision is tracked.

**Rule:** `proposal.md` — "The transaction isolation level is pinned to `READ COMMITTED` per session".

---

### 2. Major — `curdate()` follows the server's time zone, not the connection's

`apps/api/src/modules/engagement/engagement.repository.ts:95` and `:101`

The comment at lines 86–88 is load-bearing and incorrect:

> `current_date` → `curdate()`, resolved in the connection's UTC session
> (`packages/db/src/client.ts` pins `timezone: 'Z'`)

mysql2's `timezone` option is a **client-side** setting: it controls how the driver formats
JavaScript `Date` values into SQL literals and parses `DATETIME` values back. It issues no
`SET time_zone` statement, so the MySQL **session** time zone is untouched and stays at the server
default (`SYSTEM` unless configured). `curdate()` is evaluated server-side, in that session zone.

Consequences: column values written from JS `Date`s *are* correct UTC (the driver's `'Z'` handles
those), so this is not a blanket timestamp bug — but `curdate()` specifically is not. It keys both
`view_seen.date` and `article_views_daily.date`, so on a server in `Asia/Jakarta` (UTC+7) the daily
view bucket rolls over at 17:00 UTC while every other timestamp in the system is UTC. `spec.md`'s
"Timestamps are stored and compared in UTC" scenario promises exactly what this breaks.

`docker-compose.yml:8` passes `--default-time-zone=+00:00`, which is why local verification did not
catch it. The **CI service container** (`.github/workflows/ci.yml:12–23`) passes no such argument,
and no managed MySQL can be assumed to. The integration test cannot catch it either, since it uses
`curdate()` on both sides of its assertion (`mysqlIntegration.test.ts:59,64`).

**Fix** — pin the session zone on the connection, as in #1's snippet, so correctness does not depend
on server configuration. Then correct the comment at lines 86–88 to say the *session* zone is pinned
by `SET time_zone`, not by mysql2's `timezone` option. Optionally use `utc_date()` at both call sites
as belt-and-braces.

**Rule:** `proposal.md` — "the connection pinned to UTC"; `specs/data-layer/spec.md` §"Timestamps are
stored and compared in UTC".

---

### 3. Major — the MySQL pool has no TLS, and `sslmode` is silently ignored

`packages/db/src/client.ts:18`

The replaced code was `new Pool({ connectionString: env.DATABASE_URL })`. `pg` parses the connection
string through `pg-connection-string`, which honours `?sslmode=require` — the form a Supabase
`DATABASE_URL` normally carries. The new `createPool({ uri: env.DATABASE_URL, ... })` does not:
mysql2 recognises only an `ssl` key, and `connection_config.js:149` defaults it to `false`
(`this.ssl = ... || options.ssl || false`). `sslmode` is not in its option table.

So a `DATABASE_URL` migrated across with its `sslmode=require` intact now connects **in plaintext**,
with no error and no warning. Everything on that wire is sensitive: the database credentials
themselves, staff password hashes, session and refresh-token hashes, and reader PII.

This gap is not mentioned in `design.md`, `db/README.md`, or `docs/ARCHITECTURE.md` §11's security
checklist, all of which this change rewrote.

**Fix** — configure TLS explicitly and fail closed in production:

```ts
const pool = createPool({
  uri: env.DATABASE_URL,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
  // ...
});
```

Better still, validate in `apps/api/src/config/env.ts` that a production `DATABASE_URL` carries an
explicit TLS directive and refuse to boot otherwise, and add the requirement to `docs/ARCHITECTURE.md`
§11.

**Rule:** `docs/ARCHITECTURE.md` §11 (security checklist).

---

### 4. Major — timestamp defaults moved from the database clock to the application clock

`packages/db/src/schema/engagement.ts:61`, and systemically across all 14 schema files
(`moderation.ts:101`, `articles.ts:37–38`, `sessions.ts`, `rbac.ts:14–15`, …)

Every timestamp default changed shape, not just type:

```diff
- createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
+ createdAt: datetime('created_at', { fsp: 3 }).notNull().$defaultFn(() => new Date()),
```

`.defaultNow()` emitted a DDL default evaluated by the single database server's clock. `$defaultFn`
is evaluated in the API process, so the source of truth is now each API instance's clock. `design.md`
documents the type change and the `fsp: 3` precision decision but never mentions this, and the
generated DDL confirms it — `db/migrations/0000_productive_master_chief.sql` has no
`DEFAULT CURRENT_TIMESTAMP(3)` on any column.

This matters because `moderation.repository.ts:300` uses `(created_at, id)` as a keyset-pagination
cursor, and `spec.md` promises "no row skipped or duplicated across a page boundary" for it. With
per-process clocks, a row inserted later can carry an earlier `created_at` than one already returned,
and a paginating client skips it. `fsp: 3` was chosen specifically to protect this cursor; moving the
clock off the server undercuts the same guarantee from the other direction.

Latent while the API runs single-instance, real as soon as it does not — and `scheduler.ts`'s own
comment already anticipates multiple replicas.

**Fix** — keep the database as the clock:

```ts
createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
```

and regenerate the baseline migration so the `DEFAULT CURRENT_TIMESTAMP(3)` clause is present. If the
application clock is deliberate, say so in `design.md` and state what it means for the cursor
guarantee.

**Rule:** `specs/data-layer/spec.md` §"Timestamp precision supports keyset pagination without
collision".

---

### 5. Major — the integration test for `recordView` tests a copy, not the shipped code

`apps/api/src/lib/mysqlIntegration.test.ts:55`

`proposal.md` justifies this whole test file plainly: *"today's CI never runs against a real database,
so none of this would otherwise be caught before production."* The file's own doc comment names
`engagement.repository.ts`'s `recordView` as one of the three highest-risk rewrites it exists to
protect.

The test then declares a **local** `recordView` (lines 55–69) that retypes the `insert ignore` /
`on duplicate key update ... values(unique_views)` SQL verbatim, and asserts against that. It never
constructs `createEngagementRepository(db)`. A future edit to the real repository — a renamed column,
a changed conflict clause, a dropped `values()` reference — leaves this test passing against its
frozen copy while the shipped path regresses. That is precisely the failure mode CI was added to
prevent, and it also duplicates logic `CLAUDE.md` asks to keep in one place.

**Fix** — import and call the real thing:

```ts
import { createEngagementRepository } from '../modules/engagement/engagement.repository.js';
const repo = createEngagementRepository(db);
await repo.recordView(articleId, visitorHash);
```

and delete the hand-copied SQL block. Worth checking the advisory-lock test in the same file against
the same standard.

**Rule:** `CLAUDE.md` §Coding Standards ("no duplicated logic"); `proposal.md` — rationale for the CI
MySQL service.

---

### 6. Minor — `LockExecutor` permits the one misuse the lock's correctness depends on avoiding

`apps/api/src/lib/tableWriteLock.ts:5`

```ts
export type LockExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
```

The file's own comment (lines 35–38) explains why this must be a transaction executor: `GET_LOCK` is
connection-scoped, so acquire and release must run on the one connection Drizzle pins to the
transaction callback. But the union admits the bare `Database` pool. Pass that, and acquire and
release land on different pooled connections — `RELEASE_LOCK` returns `0` without releasing anything,
and the lock stays held until the acquiring connection is closed, wedging that table's reorder path.

All five current call sites correctly pass `tx`. This is a latent trap, not a live bug — but it fails
silently and only under concurrency.

**Fix** — drop `Database` from the union so passing a pool is a compile error. (`OrderingExecutor` in
`replaceOrdering.ts:7` has the same shape and is worth the same treatment.)

**Rule:** `design.md` §Risks / trade-offs — `GET_LOCK`'s connection scoping.

---

### 7. Minor — avoidable post-insert `SELECT` on the auth path

`apps/api/src/modules/auth/session.repository.ts:79`

`create()` generates the id, inserts, then re-selects the row it just wrote — but every field
`toSessionRow` reads is already in hand (`id`, `input.*`, `revokedAt: null`). The extra primary-key
lookup runs on every login and every refresh-token rotation.

`design.md` is explicit that the re-select exists for call sites returning a *joined* view; it is not
required where the row is fully known. Same pattern, lower traffic, at
`category.repository.ts:37`, `contact.repository.ts`, and `media.repository.ts`.

**Fix** — build the returned row from `id` and `input` directly and drop the `db.select()`. Note this
becomes mandatory rather than optional if finding #4 is fixed by moving defaults back to
`CURRENT_TIMESTAMP(3)`, since the row would then contain a database-generated value; in that case
keep the re-select here and drop it only where no DB-side default applies.

**Rule:** `design.md` — "`RETURNING` becomes insert/update-then-select".

---

### 8. Minor — pool has no connection or queue limits

`packages/db/src/client.ts:18`

`createPool` sets no `connectionLimit`, `queueLimit`, or `idleTimeout`. mysql2 defaults `queueLimit`
to `0` — unlimited — so a database slowdown produces an unbounded backlog of queued queries and
memory growth rather than fast failure and backpressure.

**Fix** — set explicit `connectionLimit`, a bounded `queueLimit`, and `idleTimeout`/`maxIdle` sized
to the API's expected concurrency.

---

### 9. Minor — seed rows use MySQL's `uuid()` instead of UUIDv7

`db/migrations/0001_seed_permission_catalog.sql:16`, `db/seed.sql:18`

Both call MySQL's `uuid()`, which is UUID **v1** — time-low-first, exactly the clustered-index
scatter `design.md` rejected option 2 to avoid, and a literal violation of `spec.md`'s
"Application-generated primary keys". Practical impact is small (a fixed number of bootstrap rows),
but it puts rows in the database that do not satisfy the invariant the rest of the schema enforces.

**Fix** — hardcode UUIDv7 literals generated once by `newId()`, or seed through a small script that
calls it.

**Rule:** `specs/data-layer/spec.md` §"Application-generated primary keys"; `design.md` §"primary keys
are `char(36)` holding an application-generated UUIDv7".

---

### 10. Minor — API user password is hardcoded with no override

`db/init/01-create-api-user.sql:8`

`docker-compose.yml` parameterises the root and migrate passwords
(`${MYSQL_ROOT_PASSWORD:-…}`, `${MYSQL_MIGRATE_PASSWORD:-…}`), but the third credential is a literal
in a committed SQL file with no override path — so the pattern that keeps the other two out of any
non-local deployment does not extend to it.

**Fix** — convert to a `.sh` init script (`docker-entrypoint-initdb.d` executes those too) that
substitutes `${MYSQL_API_PASSWORD:-local-dev-api-password}` before issuing `CREATE USER`.

---

### 11. Minor — grant issued to `'siders_api'@'%'`

`db/init/01-create-api-user.sql:8`

The privilege set itself is right — `SELECT, INSERT, UPDATE, DELETE` on `siders.*`, no DDL, no
`GRANT OPTION`, no `ALL PRIVILEGES` — which is a faithful replacement for RLS default-deny given the
API is the only client. The host wildcard is the loose part, and `docker-compose.yml:15` publishes
3306 to the host.

**Fix** — scope the host to the compose network, or state explicitly in `db/README.md` that host
scoping is delegated to network policy.

---

### 12. Minor — `LIKE` wildcards unescaped in the reader search

`apps/api/src/modules/moderation/moderation.repository.ts:405`

`filter.search` is interpolated into a `like` pattern without escaping `%`, `_`, or `\`. Not a new
regression — the `ilike` version had the same gap, and the endpoint is staff-only and
permission-gated — but the line was touched by this change, so it is the moment to fix it.

**Fix** — escape metacharacters before building the term:
`filter.search.replace(/[%_\\]/g, '\\$&')`, with a matching `ESCAPE` clause.

---

### 13. Minor — redundant `as unknown as [...]` casts

`apps/api/src/modules/engagement/engagement.repository.ts:114`;
`moderation.repository.ts:280`, `:332`, `:420`; `roles/role.repository.ts:191`

These are plain Drizzle `.update()` / `.delete()` calls, which `drizzle-orm/mysql2` already types as
`[ResultSetHeader, FieldPacket[]]`. The double cast erases that and would hide a genuine shape change
behind a silent lie. The casts *are* warranted on `db.execute()` calls, where the return type is
loose — `article.repository.ts:346–352` shows the cast-free form for the typed case.

**Fix** — drop the casts on the typed calls; keep them only on `execute()`.

**Rule:** `CLAUDE.md` §Coding Standards (TypeScript strict mode; never `any` unless unavoidable).

---

### 14. Minor — `articles.title` stayed `text`

`packages/db/src/schema/articles.ts:23`

`tasks.md` §2.4 states the rule as "`varchar(n)` on every unique/indexed string column, unindexed
strings stay `text`", which would justify this — but that is not the rule that shipped.
`contactMessages.name`/`organisation`/`subject` and `guidePicks.city`/`place` are all unindexed and
all became `varchar`. The de-facto convention is "short single-line human-entered field → `varchar`;
long-form body → `text`", and `articles.title` is the one short single-line field left behind.

**Fix** — convert to `varchar('title', { length: 255 })` (matching whatever bound the admin article
form enforces), or add a one-line comment saying the unbounded type is deliberate. Either way,
restate §2.4's rule so it describes what was actually applied.

---

### 15. Minor — integration test leaves orphaned rows

`apps/api/src/lib/mysqlIntegration.test.ts:36`

`afterAll` deletes the `users` and `roles` rows but not the `articles`, `article_views_daily`, or
`view_seen` rows the first test creates, leaving rows referencing a deleted user behind on any
non-ephemeral database the suite is pointed at.

**Fix** — delete the article first and let `ON DELETE CASCADE` clear its dependents, ahead of the
existing deletes.

---

### 16. Minor — stale Supabase reference

`docs/ARCHITECTURE.md:513`

> The moderation queue polls every 30 seconds. Without Supabase Realtime, a websocket layer would be
> the only alternative…

This asserts a currently-false fact about the system rather than recording history, so it is not
covered by §7.8's deliberate exemption for comparative "here's what Postgres did" comments.

**Fix** — reword generically: "Without a managed realtime layer, …".

**Rule:** `tasks.md` §7.8.

---

### 17. Nit — CI bypasses the documented migrate script

`.github/workflows/ci.yml:60`

Calls `drizzle-kit migrate` directly, while `db/README.md` — added by this same change — documents
`pnpm --filter @siders/db db:migrate` as the way to apply migrations. Two ways to do one thing, and
the script is the one that will pick up future flags.

**Fix** — use `pnpm --filter @siders/db db:migrate`.

## Rule check

| Rule | Source | Complies? |
|---|---|---|
| Backend is MySQL, not PostgreSQL | `CLAUDE.md` §Technology Stack | Yes — updated; one stale Supabase mention remains (#16) |
| TypeScript strict; never `any` unless unavoidable | `CLAUDE.md` §Coding Standards | Mostly — no new `any`; 5 redundant double casts (#13) |
| No duplicated logic | `CLAUDE.md` §Coding Standards | No — integration test duplicates repository SQL (#5) |
| Typed `AppError` subclasses, formatted once in `errorHandler` | `CLAUDE.md` §API | Yes — `write_lock_timeout` → 409 follows existing precedent |
| UUID PKs, migrations, transactions where appropriate | `CLAUDE.md` §Database | Mostly — UUIDv7 throughout; seed rows use `uuid()` v1 (#9) |
| Build, lint, tests, no TS errors before completion | `CLAUDE.md` §Testing | Partly — lint and typecheck clean; `pnpm test` fails, though on pre-existing flakiness unrelated to this change (see Summary) |
| Security checklist | `docs/ARCHITECTURE.md` §11 | No — TLS gap not covered or documented (#3) |
| Primary keys are `char(36)` holding application-generated UUIDv7 | `design.md` | Yes, except seed data (#9) |
| `RETURNING` → insert/update-then-select inside one transaction | `design.md` | Yes — ~30 sites, shape-consistent; 4 avoidable re-selects (#7) |
| Reorder locks become `GET_LOCK`/`RELEASE_LOCK` | `design.md` | Yes — release in `finally`, all call sites pass `tx`; type permits misuse (#6) |
| Constraint violations classified independent of driver | `design.md` | Yes — both errnos, both message shapes, 12 tests against captured errors |
| Partial index → stored generated column | `design.md` | Yes — and `moderation.repository.ts:132` correctly queries `isOpen` so the index is actually used; index no longer self-prunes to open rows, a documented trade-off |
| Transaction isolation pinned to `READ COMMITTED` | `proposal.md`, `design.md` | **No — never implemented (#1)** |
| Timestamps `datetime(3)`, connection pinned to UTC | `proposal.md`, `spec.md` | **Partly — column values are UTC; the session is not pinned, so `curdate()` is not (#2)** |
| Timestamp precision supports keyset pagination | `spec.md` | **Partly — `fsp: 3` present, but the clock moved to the app process (#4)** |
| RLS replaced by least-privilege grants | `proposal.md` §5 | Yes — `authorize.ts` enforces authz per-request independently; grants are DML-only; host wildcard is loose (#11) |
| CI runs against a real MySQL 8.0 | `proposal.md` §7 | Yes — service container and migration step added; not yet exercised on GitHub Actions, and the container omits the server flags `docker-compose.yml` sets (relevant to #2) |

---

*Local review only — nothing was committed, staged, or posted. `review-report.md` is a draft for you
to check.*
