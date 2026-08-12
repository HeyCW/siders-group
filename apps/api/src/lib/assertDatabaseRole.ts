import { sql } from 'drizzle-orm';
import type { Database } from '@siders/db';
import type { Logger } from './logger.js';

/**
 * The tables `add-news-management-system` and `add-home-curation` created with RLS enabled and
 * no policies.
 */
const GUARDED_TABLES = ['media', 'articles', 'categories', 'tags', 'article_categories', 'article_tags', 'home_curation'];

interface TableRlsRow {
  relname: string;
  rls_active: boolean;
  policy_count: string | number;
}

/**
 * RLS is enabled with zero policies on every table this change added (tasks.md - 2.7), which is
 * a default-deny posture: any connection actually *subject* to RLS reads zero rows from them —
 * silently, as ordinary empty 200s, never as an error. This asserts at boot that the API's own
 * connection is not in that state (tasks.md - 2.9, previously unverifiable without a live
 * database).
 *
 * The question is deliberately put to Postgres as `row_security_active()` rather than inferred
 * from `pg_roles.rolbypassrls`. Three distinct things exempt a connection from RLS — the
 * `BYPASSRLS` attribute, superuser, and *being the table's owner* when the table was declared
 * `ENABLE ROW LEVEL SECURITY` rather than `FORCE` (which is what `0001_silly_retro_girl.sql`
 * does). Reading `rolbypassrls` alone sees only the first: on a stock Supabase project the API
 * connects as the role that owns these tables with `rolbypassrls = false`, so a naive check
 * refuses to start a database that was serving correctly. `row_security_active()` collapses all
 * three cases into the one fact that matters.
 *
 * A table that *does* have policies is not reported: RLS being active is then a deliberate
 * configuration, not the vacuous default-deny this guards against.
 */
export async function assertDatabaseRoleCanReadNewsTables(db: Database, logger: Logger): Promise<void> {
  const result = await db.execute(sql`
    select c.relname,
           row_security_active(c.oid) as rls_active,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app'
      and c.relname = any(${GUARDED_TABLES})
  `);

  const rows = result.rows as unknown as TableRlsRow[];
  const blocked = rows
    .filter((row) => row.rls_active && Number(row.policy_count) === 0)
    .map((row) => row.relname);

  if (blocked.length > 0) {
    const message =
      `Row-level security is active for this connection on app.${blocked.join(', app.')} with no ` +
      'policies granting access, so every query against those tables would silently return zero ' +
      'rows. Grant the API role BYPASSRLS, make it the tables\' owner, or write explicit RLS ' +
      'policies (openspec/changes/add-news-management-system/tasks.md - 2.9).';
    logger.fatal({ blockedTables: blocked }, message);
    // Thrown rather than `process.exit(1)`: in development the logger writes through a
    // pino-pretty worker transport, which `process.exit()` does not flush — the operator would
    // get a bare exit code and no reason. An uncaught throw is printed by Node itself.
    throw new Error(message);
  }

  logger.info('news-management tables are readable by this database role');
}
