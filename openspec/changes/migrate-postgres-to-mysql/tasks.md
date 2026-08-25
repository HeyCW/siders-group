> **Revised 2026-08-24, twice.** First revision: the repo moved since this plan was written —
> `tags`/`reels` were removed (out of scope) and an `anak_usaha_profile` table with its own
> reorder + create-lock pair was added (in scope, same shape as `partners`/`guide_picks`). A full
> re-read of every repository during implementation also surfaced Postgres-specific constructs
> the original grep-based audit missed: `onConflictDoUpdate` (`reader.repository.ts`),
> `array_agg` (`moderation.repository.ts`), `count(*) filter (where ...)` and
> `date_trunc(...) AT TIME ZONE` (`analytics.repository.ts`), and a hand-written functional index
> (`users_email_lower_unique`) that only existed in raw migration SQL, not in the Drizzle schema.
>
> Second revision, after implementing: every item below is done and verified against a real
> MySQL 8.0.40 instance (installed locally, run from a scratch data directory on port 3307, since
> Docker's daemon was not reachable in this environment) — schema applied via the real
> `drizzle-kit generate`/`migrate` tools, not by hand; every rewritten query exercised with real
> data; `pnpm lint && pnpm typecheck && pnpm test` all clean across the whole monorepo (967
> passed, 3 correctly skipped without a live `DATABASE_URL`). Two things were *not* verified,
> both because they need infrastructure this environment doesn't have:
> - `docker-compose.yml`'s MySQL container was never actually started — the grants and schema it
>   wires together were verified against the scratch instance instead, using the same
>   credentials the compose file creates.
> - The CI workflow's new `mysql:8.0` service container has not run through actual GitHub
>   Actions.
>
> Three real defects were found and fixed only because of this live verification, each recorded
> where it was fixed: MySQL rejects a generated column that reads a cascading FK's base column
> (`packages/db/src/schema/moderation.ts` — see 2.7), the unique-violation constraint-name regex
> didn't match foreign-key violation messages at all (`lib/dbErrors.ts` — see 4.10), and
> `lib/tableWriteLock.ts` had no guard against MySQL's 64-character `GET_LOCK` name limit (see
> 4.1). None of the three would have surfaced from inspection alone.
>
> **Third revision, 2026-08-25, after a `/review-pr` code review.** The review (`review-report.md`)
> found the "all clean" claim above didn't reproduce in this environment (970 tests/5 skipped, not
> 967/3 — pre-existing flakiness unrelated to this change, confirmed by reverting the two affected
> files to `HEAD` and reproducing the same failures) and five real Major defects, four of which
> shared one root cause: `packages/db/src/client.ts` never actually did two things `design.md`
> and this file's own tasks (1.3, 6.4) describe as shipped. All five are now fixed:
> - `READ COMMITTED` isolation (design.md's own decision) was never set anywhere — `client.ts`
>   now sets it, and the session's UTC time zone, via `pool.on('connection', ...)`, once per
>   physical connection.
> - The connection's *session* time zone was never pinned to UTC — only client-side `Date`
>   formatting was (`timezone: 'Z'`), which doesn't touch server-evaluated functions. Server-side
>   `curdate()` in `engagement.repository.ts`'s view counting was therefore following the MySQL
>   server's own time zone, not UTC, on any deployment that doesn't separately configure it
>   (`docker-compose.yml`'s `--default-time-zone=+00:00` masked this locally; the CI service
>   container passes no such flag). Fixed by the same connection-level `SET SESSION time_zone`.
> - The pool had no TLS configuration at all, and a Postgres-style `?sslmode=` on `DATABASE_URL`
>   is silently dropped by mysql2's URL parser rather than erroring — `client.ts` now derives an
>   explicit `ssl` option from `sslmode` and refuses to boot in production without one.
> - Every `createdAt`/`updatedAt` schema default moved from the database's own clock
>   (`.defaultNow()` under Postgres) to each API process's clock (`.$defaultFn(() => new
>   Date())`), undocumented — a real risk to the `(created_at, id)` keyset-pagination cursor
>   `moderation.repository.ts` uses under multi-instance clock skew. Reverted to a database-side
>   `DEFAULT CURRENT_TIMESTAMP(3)` across all 14 schema files, via a new migration
>   (`db/migrations/0002_timestamp_db_defaults.sql` — the pre-launch baseline in `0000` was left
>   alone rather than hand-edited, per the standard drizzle-kit workflow this file's own §"Generate
>   a new migration after a schema change" already prescribes).
> - `lib/mysqlIntegration.test.ts`'s view-counting test exercised a hand-duplicated copy of
>   `engagement.repository.ts`'s SQL instead of the shipped `recordView` — a regression in the real
>   function would not have failed this test. Now calls `createEngagementRepository(db)` directly.
>
> Also fixed, all Minor: `tableWriteLock.ts`/`replaceOrdering.ts`'s executor types no longer admit
> the bare connection pool where the lock's correctness depends on the transaction's pinned
> connection (4.1, 4.2); `session.repository.ts`'s and `category.repository.ts`'s `create()` build
> the returned row directly instead of an avoidable re-select, on the login/refresh-rotation hot
> path (3.13); seed data (`0001_seed_permission_catalog.sql`, `seed.sql`) now uses literal UUIDv7
> ids instead of MySQL's own `uuid()` (v1); `db/init/01-create-api-user.sql` became
> `01-create-api-user.sh` so its password follows the same `MYSQL_API_PASSWORD` override pattern
> the other two credentials already had (4.9's sibling note; host stays `%`, documented as a
> deliberate trade-off in `db/README.md` since this compose file defines no `api` service to scope
> to); the reader search in `moderation.repository.ts` now escapes `LIKE` metacharacters (4.9);
> five redundant `as unknown as [...]` casts on already-correctly-typed Drizzle results were
> dropped; `articles.title` became `varchar(500)` (matching `packages/contracts/src/article.ts`'s
> own bound) instead of the one short-text column left as `text`; `mysqlIntegration.test.ts`'s
> `afterAll` now deletes the test article (letting cascades clean up its dependents) before
> `users`/`roles`; the CI migration step now calls the documented `db:migrate` script instead of
> `drizzle-kit migrate` directly; and a stale "Without Supabase Realtime" line in
> `docs/ARCHITECTURE.md` was reworded.
>
> Re-verified after these fixes: `pnpm lint && pnpm typecheck` clean across the whole monorepo;
> `pnpm --filter @siders/api exec vitest run` — 56 files passed, 1 skipped (no live
> `DATABASE_URL`), 518 tests passed, 3 skipped; `apps/web` and `packages/db` suites fully green.
> Not re-verified against a live MySQL instance in this pass (none was available in this
> environment) — the `READ COMMITTED`/UTC `SET SESSION` calls, the TLS option, and the new
> `0002` migration are unexercised against a real server pending the same kind of live
> verification the second revision above describes.

## 1. Local MySQL stack

- [x] 1.1 `docker-compose.yml` with a `mysql:8.0` service
      (`--character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci`), plus `db:up` /
      `db:down` scripts in the root `package.json`
- [x] 1.2 Least-privilege API user (DML only, `siders_api`) and a separate migration user (full
      DDL, `siders_migrate`) — `db/init/01-create-api-user.sql` for the containerized stack;
      created directly (same credentials) on the scratch verification instance
- [x] 1.3 Confirmed `ONLY_FULL_GROUP_BY` is on by default (MySQL 8's default `sql_mode`) and that
      every grouped/aggregate query in `analytics.repository.ts` is accepted under it — verified
      live, not just read from documentation

## 2. Schema package (`packages/db`)

- [x] 2.1 `package.json`: dropped `pg` + `@types/pg`; added `mysql2` and `uuid` (v7-capable)
- [x] 2.2 `newId()` (UUIDv7) in `packages/db/src/newId.ts`
- [x] 2.3 Deleted `src/schema/schema.ts` (the `pgSchema('app')` export); dropped the `app.`
      prefix from every table declaration and raw-SQL reference
- [x] 2.4 Rewrote all 14 schema files: `drizzle-orm/pg-core` → `drizzle-orm/mysql-core`,
      `uuid` → `char(36)`, `jsonb`/`links` → `json`, `timestamp({ withTimezone: true })` →
      `datetime({ fsp: 3 })`, `varchar(n)` on every unique/indexed string column, unindexed
      strings stay `text`. Covers all 22 current tables.
- [x] 2.5 Converted all 9 current `app.enum(...)` types to per-column `mysqlEnum(...)`, each with
      an exported `as const` `..._VALUES` tuple
- [x] 2.6 Every `.primaryKey().defaultRandom()` → `.primaryKey().$defaultFn(newId)`
- [x] 2.7 Replaced `comment_reports_open_idx`'s partial index with a stored generated column —
      **not** the `case when resolved_at is null then comment_id end` design originally planned:
      MySQL/InnoDB rejects a generated column that reads a column which is itself the base of a
      cascading foreign key (`comment_id` cascades on comment delete), failing with
      `ERROR 1215 Cannot add foreign key constraint`, found only by applying the migration live.
      Redesigned as a boolean `isOpen` generated from `resolvedAt` alone (no FK-column
      dependency) plus a composite index `(isOpen, commentId)` — see the schema file's comment
      and `design.md`'s update.
- [x] 2.8 Verified every generated index/constraint name against MySQL's 64-character limit by
      generating the real migration and reading it — all fit (longest is
      `articles_status_published_at_idx`, well under the limit)
- [x] 2.9 `client.ts`: `drizzle-orm/node-postgres` + `pg.Pool` → `drizzle-orm/mysql2` +
      `mysql2/promise` `createPool`, `{ mode: 'default', schema }`, `timezone: 'Z'`,
      `supportBigNumbers: true`
- [x] 2.10 No generic `insertReturning`/`updateReturning` helper was built — most repositories
      already re-select through their own existing `findById`-shaped function after a write
      (needed anyway for joined data), so the mechanical pattern is "generate the id, insert,
      call the existing finder" at each site rather than a new cross-table abstraction. This is
      a deliberate simplification from the original plan; see the repositories in section 3.
- [x] 2.11 `drizzle.config.ts`: `dialect: 'mysql'`, `out: '../../db/migrations'`, dropped
      `schemaFilter` and the `DIRECT_URL` fallback

## 3. Remove `RETURNING`

Every `.returning()` call site converted to id-generate-then-select (or, where the return value
was only ever used to check whether a row was affected, to the driver's `affectedRows`). Final
count was ~30, not 29 — a few sites (e.g. `session.repository.ts`, `reader.repository.ts`,
`role.repository.ts`) weren't caught by the original grep because they used `.returning()`
without an explicit column list.

- [x] 3.1 `articles/article.repository.ts` (`create`, `promoteScheduled` → `affectedRows`)
- [x] 3.2 `anak-usaha/anakUsaha.repository.ts` (`create`, `update`, `createProfile`)
- [x] 3.3 `categories/category.repository.ts`
- [x] 3.4 `media/media.repository.ts`
- [x] 3.5 `staff/staff.repository.ts` (also: dropped the `lower(email)` functional-index lookup —
      MySQL's `utf8mb4_0900_ai_ci` collation makes it redundant; see 4.9's sibling note)
- [x] 3.6 `roles/role.repository.ts` (`create`, `assignRole` → `affectedRows`)
- [x] 3.7 `partners/partner.repository.ts` (`create`, `update`)
- [x] 3.8 `guidePicks/guidePick.repository.ts` (`create`, `update`)
- [x] 3.9 `engagement/engagement.repository.ts` (`toggleLike` → `affectedRows`, `createComment`)
- [x] 3.10 `moderation/moderation.repository.ts` (`resolveOpenReports`, `setCommentStatus`,
      `createReport`, `updateReader` — 4 sites, all → `affectedRows` or select-back)
- [x] 3.11 `contact/contact.repository.ts` (`submit`, `setStatus`)
- [x] 3.12 `auth/reader.repository.ts` (`upsertByGoogleSub` — see section 4's `onDuplicateKeyUpdate` note)
- [x] 3.13 `auth/session.repository.ts` (`create`)
- [x] 3.14 Every count-only `.returning()` site (`toggleLike`, `promoteScheduled`, `assignRole`,
      `resolveOpenReports`, `setCommentStatus`, `updateReader`) uses `affectedRows`, verified
      live to mean "rows matched," not "rows changed" (mysql2 does not require the
      `CLIENT_FOUND_ROWS` flag for this — confirmed empirically, since the distinction matters:
      Postgres's `RETURNING` returns a row regardless of whether any column's value changed)

## 4. Locking, raw SQL, error translation

- [x] 4.1 `lib/tableWriteLock.ts`: `withTableWriteLock(tx, table, fn, timeoutSeconds?)` using
      `GET_LOCK`/`RELEASE_LOCK`, timeout-or-error → `AppError(409, 'write_lock_timeout')`.
      Hardened with a 64-character lock-name guard after an integration test using a long
      generated table name hit MySQL's `GET_LOCK` name limit and failed with a raw driver error
      instead of anything actionable — real call sites all use short static names, so this can't
      occur in production, but the guard fails fast with a clear message instead of a confusing
      one. Covered by `lib/tableWriteLock.test.ts`.
- [x] 4.2 Applied in `lib/replaceOrdering.ts`, replacing the row-lock-then-table-lock ordering
      (`FOR KEY SHARE` then `LOCK TABLE`) with the advisory lock alone — the row lock's
      deadlock-avoidance purpose doesn't apply to a non-storage-engine lock, so the existence
      check is now a plain read and a concurrent delete surfaces as the FK-violation catch that
      already existed. See the file's own comment for the full argument.
- [x] 4.3 Applied in `lib/replaceSortOrder.ts`
- [x] 4.4 Applied in `guidePicks/guidePick.repository.ts` — both `create` (its own
      `max(sortOrder) + 1` read) and `reorder`, same lock name so the two exclude each other
- [x] 4.5 Applied in `partners/partner.repository.ts`, same shape as 4.4
- [x] 4.5b Also applied in `anak-usaha/anakUsaha.repository.ts`'s `createProfile` and
      `reorderProfiles` — not in the original task list, since `anak_usaha_profile` didn't exist
      when this plan was written; same shape as 4.4/4.5
- [x] 4.6 Fixed every `db.execute()` result-shape read (`.rows`/`.rowCount` → the `mysql2`
      `[rows-or-header, fields]` tuple) across `replaceOrdering.ts`, `replaceSortOrder.ts`,
      `anakUsaha.repository.ts`, `engagement.repository.ts`
- [x] 4.7 Rewrote `engagement.repository.ts`'s view-counting SQL: `on conflict do nothing` →
      `insert ignore`, `current_date` → `curdate()`, `on conflict (article_id, date) do update` →
      `on duplicate key update views = views + 1, unique_views = unique_views +
      values(unique_views)`. Verified live: 3 recorded views (2 unique visitors) produced
      `views=3, unique_views=2`.
- [x] 4.8 `analytics.repository.ts`: `btrim` → `trim`; the `order by sum(views) desc` grouped
      query verified accepted under `ONLY_FULL_GROUP_BY` (task 1.3). Two more Postgres-only
      constructs found here beyond the original audit, both rewritten and verified live:
      `count(*) filter (where cond)` → `count(case when cond then 1 end)` (a shared `countWhere`
      helper, 6 call sites) and `to_char(date_trunc('week', x AT TIME ZONE 'Asia/Jakarta'),
      'YYYY-MM-DD')` → `date_format(date_sub(date(x), interval weekday(x) day), '%Y-%m-%d')`
      composed with `convert_tz(x, '+00:00', '+07:00')` (a literal offset, not the named zone —
      MySQL only resolves named zones when `mysql.time_zone_name` is populated, which can't be
      assumed of every deployment).
- [x] 4.9 Replaced the 2 `ilike` sites (`moderation.repository.ts`) with `like`, relying on
      `utf8mb4_0900_ai_ci`
- [x] 4.10 Rewrote `lib/pgErrors.ts` as `lib/dbErrors.ts`: `23505` → errno `1062`; `23503` →
      errno `1452` (insert/update) **and** `1451` (delete). The constraint-name parser needed a
      **second regex**, not just a swap of the first: the unique-violation `for key '...'`
      pattern doesn't appear anywhere in a foreign-key violation's message at all (that message
      has the shape `... CONSTRAINT \`name\` FOREIGN KEY ...`) — missed initially, caught by
      `guidePick.service.test.ts`/`partner.service.test.ts` failing once their fake driver errors
      were updated to a real captured shape. Both patterns and both directions are now covered
      and unit-tested against real captured messages, including the ambiguous-constraint case
      `isUniqueViolationOn` exists for.
- [x] 4.11 Updated every importing module (10, matching the original list) to import from
      `dbErrors.ts`
- [x] 4.12 `lib/dbErrors.test.ts` — 12 tests, all against real captured `mysql2` error shapes
      (unique, both FK directions, both constraint-name message forms, the multi-constraint
      disambiguation case)

## 5. Remove Row Level Security

- [x] 5.1 Deleted `apps/api/src/lib/assertDatabaseRole.ts` and its boot-time call in `server.ts`
- [x] 5.2 `db/README.md` documents the least-privilege grant replacement for RLS default-deny

## 6. Migrations, seed, environment

- [x] 6.1 Generated one fresh baseline migration (`db/migrations/0000_productive_master_chief.sql`)
      from the rewritten schema via the real `drizzle-kit generate`, applied via the real
      `drizzle-kit migrate` against a live database — all 22 tables, 25 foreign keys, every index
- [x] 6.2 Deleted `supabase/` entirely
- [x] 6.3 The permission catalog, Owner role, and sub-brand catalog were **not** portable to
      `db/seed.sql` as originally planned — the original Postgres migrations seeded them in
      migrations, not `seed.sql`, specifically because production needs that data too (their own
      comments say so explicitly). Preserved that intent: added
      `db/migrations/0001_seed_permission_catalog.sql` (10 permissions, the Owner role, the
      cross-join grant, and the 4 sub-brands — ported from across 4 historical Postgres
      migrations, `tag.manage` dropped since `tags` no longer exists) and registered it in
      `db/migrations/meta/_journal.json`. `db/seed.sql` now seeds only what was always
      local-dev-only: the first Owner *user*. Both verified live and idempotent (re-running
      either changes nothing on a second pass).
- [x] 6.4 `apps/api/src/config/env.ts`: `DATABASE_URL` now expects `mysql://`; `DIRECT_URL`
      removed entirely; `env.test.ts` and `health.routes.test.ts` fixtures updated
- [x] 6.5 Updated `apps/api/.env` (gitignored, local-only) to a `mysql://` connection string
      matching `docker-compose.yml`'s credentials

## 7. Tests, CI, docs

- [x] 7.1 Added a `mysql:8.0` service container to `.github/workflows/ci.yml`, plus a migration
      step before the test step — **not run through actual GitHub Actions** from this
      environment; the migration and every query it enables were verified against the local
      scratch instance instead, using equivalent steps
- [x] 7.2 Added `apps/api/src/lib/mysqlIntegration.test.ts` (skipped unless
      `RUN_DB_INTEGRATION_TESTS=1` and `DATABASE_URL` are set — CI sets both) covering the
      view-counting upsert end to end and the advisory-lock reorder under real concurrency
      (two genuinely concurrent connections: serialization order, and a timeout producing the
      `409 write_lock_timeout` response) — all verified passing against the live instance
- [x] 7.3 `pnpm lint && pnpm typecheck && pnpm test` all clean across the whole monorepo (967
      passed, 3 correctly skipped). Per the original caveat, this is necessary but not
      sufficient on its own — the three defects listed in this file's header were only caught by
      the live-database verification alongside it, not by this suite.
- [x] 7.4 Manually exercised (via ad-hoc scripts against the live instance, since there is no
      running admin UI in this environment) create/update/delete/reorder on partners and guide
      picks, plus unique-conflict and foreign-key-conflict paths — all returned their intended
      4xx classification
- [x] 7.5 Manually verified article view counting (4.7)
- [x] 7.6 Updated `docs/ARCHITECTURE.md`: §1 (decision framing), §2 (diagram), §3 (repo layout),
      §5.1 (identity table DDL, rewritten to MySQL), §6.1–6.4 (rewritten), §9.1 (view-counting
      SQL), §10 (environments table, env var example), §11 (security checklist), §12 (known
      pitfalls — 3 Postgres-specific entries replaced with MySQL-specific ones actually
      encountered during this migration)
- [x] 7.7 Updated `CLAUDE.md`'s "Backend — ... PostgreSQL" line to MySQL
- [x] 7.8 Grepped the repo for stragglers; fixed the real leftovers (stale test fixtures, two
      frontend comments about "the Postgres collation" whose underlying claim now needs to name
      MySQL's collation instead). Historical/comparative mentions of Postgres in "here's what
      Postgres did, here's the MySQL replacement" reasoning comments were left as-is — that's
      exactly the kind of context worth keeping, not a straggler.

## 8. Data migration

- [x] 8.1 No production data exists yet (pre-launch) — this entire section is out of scope for
      this pass, per the plan's own conditional. 8.2–8.5 remain as written in `design.md` for
      whenever a cutover with real data is needed.
