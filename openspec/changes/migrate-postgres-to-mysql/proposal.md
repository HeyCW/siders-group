## Why

The stack currently runs on PostgreSQL via Supabase (`docs/ARCHITECTURE.md` §1). The team has
decided to move the data layer to MySQL 8.0. This is not a portable move: the schema and API
depend on eight Postgres-only features — `RETURNING` (29 call sites), table-level advisory locks
via `LOCK TABLE`, a partial index, Row Level Security, a shared schema namespace, native `uuid`,
shared enum types, and Postgres-specific driver error codes. None of these translate directly, so
this change fixes the replacement behavior for each one rather than leaving it to be improvised
per call site during implementation.

## What Changes

- Replace the Postgres/Supabase data layer with MySQL 8.0 (`mysql2` driver,
  `drizzle-orm/mysql2`) across `packages/db` and every `apps/api` repository. No behavior visible
  to `apps/web` or `apps/admin` changes — this is confined to the persistence layer and the JSON
  responses/status codes already specified elsewhere stay identical.
- **BREAKING**: primary keys and foreign keys switch from Postgres `uuid` to `char(36)` holding an
  application-generated UUIDv7 — insert paths that relied on the database generating an id
  (`gen_random_uuid()` / `.defaultRandom()`) now generate it in application code before the
  insert.
- **BREAKING**: every repository method that used `RETURNING` to hand back the written row now
  performs the insert/update and a follow-up read inside one transaction; callers see no
  difference, but any future code must use the same pattern, not `.returning()`, which does not
  exist on the MySQL dialect.
- **BREAKING**: the four table-level reorder locks (`replaceOrdering`, `replaceSortOrder`, guide
  picks, partners) move from Postgres `LOCK TABLE ... IN EXCLUSIVE MODE` to MySQL named advisory
  locks (`GET_LOCK`/`RELEASE_LOCK`), because `LOCK TABLES` implicitly commits the open transaction
  in MySQL and cannot serialize a multi-statement reorder the way the Postgres statement did.
- **BREAKING**: driver-level unique/foreign-key violation detection moves from Postgres SQLSTATE
  codes (`23505`/`23503`) and `err.constraint` to MySQL error numbers (`1062`, and `1452`/`1451`
  for the two directions of a foreign-key violation Postgres reported as one code) with the
  violated constraint name parsed out of `err.sqlMessage`.
- Row Level Security is removed entirely — MySQL has no equivalent — and replaced with
  least-privilege database grants (the API's user gets DML only; a separate user holds DDL for
  migrations).
- The one partial index (`comment_reports_open_idx`, unresolved reports only) is replaced with a
  stored generated column plus a regular index on it, since MySQL has no partial index.
- Timestamps move from `timestamp with time zone` to `datetime(3)` with the connection pinned to
  UTC; the millisecond precision is required because `moderation.repository.ts` uses
  `(created_at, id)` as a keyset-pagination cursor and second-level rounding would produce
  duplicate rows at boundary collisions.
- The transaction isolation level is pinned to `READ COMMITTED` per session, because MySQL
  defaults to `REPEATABLE READ` and the existing transactional repositories were written against
  Postgres's `READ COMMITTED` default.
- The 12 existing `supabase/migrations/*.sql` files are not ported (they contain `CREATE TYPE`,
  `gen_random_uuid()`, RLS DDL, and schema-qualified names, none of which are valid MySQL). They
  are replaced by one fresh baseline migration generated from the rewritten schema, in a new
  `db/migrations/` directory; `supabase/` is deleted.
- CI gets a real `mysql:8.0` service container and integration tests for the three highest-risk
  rewrites (constraint-name parsing, the view-count upsert, and concurrent reorder under the new
  advisory lock) — today's CI never runs against a real database, so none of this would otherwise
  be caught before production.
- `docs/ARCHITECTURE.md` and `CLAUDE.md` are updated to describe MySQL instead of
  Postgres/Supabase wherever they currently do.

## Impact

- **Affected specs**: `data-layer` (new)
- **Affected code**:
  - `packages/db/` — every file in `src/schema/`, `src/client.ts`, `drizzle.config.ts`,
    `package.json` (drop `pg`/`@types/pg`, add `mysql2` and a UUIDv7 dependency)
  - `apps/api/src/lib/` — `pgErrors.ts` (rewritten as `dbErrors.ts`), `assertDatabaseRole.ts`
    (deleted), `replaceOrdering.ts`, `replaceSortOrder.ts`, `db.ts`
  - `apps/api/src/modules/*/*.repository.ts` — every repository using `.returning()`, raw
    Postgres SQL, or the two lock sites (articles, anak-usaha, categories, tags, media, staff,
    users, roles, reels, partners, guidePicks, engagement, moderation, contact, analytics)
  - `apps/api/src/config/env.ts` — `DATABASE_URL` now a `mysql://` URL, `DIRECT_URL` removed
  - `supabase/` (deleted) → `db/migrations/`, `db/seed.sql` (new)
  - `.github/workflows/ci.yml` — new MySQL service container
  - `docs/ARCHITECTURE.md`, `CLAUDE.md`
  - `apps/web`, `apps/admin` — no changes; they only ever call the API's JSON contracts
- **Migration**: required. If production data exists at cutover time, it is exported with
  `pg_dump --data-only`, transformed (schema-qualifier stripped, booleans to `0`/`1`, timestamps
  to UTC `datetime(3)` literals, ids preserved as-is since UUIDv7 text format is unchanged), and
  loaded with foreign-key checks disabled for the duration of the load. This step is scoped as
  optional/deferred in tasks.md since the target environment's data state is not yet confirmed.
