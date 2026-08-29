import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import * as schema from './schema/index.js';
export * from './schema/index.js';
export { newId } from './newId.js';
/**
 * `sslmode` isn't a mysql2 connection option — it's a Postgres/`pg-connection-string` convention
 * that can survive unmodified in a `DATABASE_URL` carried over from the Supabase connection
 * string this migration replaces. mysql2's URL parser doesn't recognize it and silently drops it
 * (confirmed against `mysql2/lib/connection_config.js`'s `parseUrl`), so without this the pool
 * connects in plaintext with no error. Fails closed in production rather than doing that quietly.
 */
function resolveSsl(databaseUrl, nodeEnv) {
    const sslmode = new URL(databaseUrl).searchParams.get('sslmode');
    if (sslmode === null || sslmode === 'disable') {
        if (nodeEnv === 'production') {
            throw new Error("DATABASE_URL must set sslmode (e.g. 'require') in production — refusing to connect to MySQL in plaintext.");
        }
        return undefined;
    }
    return { rejectUnauthorized: sslmode !== 'require' };
}
export function getDb(env) {
    const ssl = resolveSsl(env.DATABASE_URL, env.NODE_ENV);
    // `timezone: 'Z'` is load-bearing, not cosmetic: every `datetime` column is stored and read as
    // UTC (openspec/changes/migrate-postgres-to-mysql/design.md - "timestamps are `datetime(3)`,
    // connection pinned to UTC"). Note this only governs how the driver formats/parses JS `Date`s
    // — it does *not* touch the MySQL session's own time zone, which server-side date/time
    // functions (e.g. `curdate()` in engagement.repository.ts) evaluate against. That's what the
    // `pool.on('connection', ...)` handler below is for. `supportBigNumbers` avoids precision loss
    // on the `bigint` aggregates (`count(*)`, `sum(...)`) the analytics and engagement repositories
    // run.
    const pool = createPool({
        uri: env.DATABASE_URL,
        timezone: 'Z',
        supportBigNumbers: true,
        dateStrings: false,
        ...(ssl ? { ssl } : {}),
        connectionLimit: 10,
        queueLimit: 50,
        idleTimeout: 60_000,
    });
    // Both of these are per-*connection* session state, not per-query, so they're set once here
    // rather than reissued on every `tx.execute`/`db.query`:
    // - MySQL defaults a new session to `REPEATABLE READ`; every transactional repository in this
    //   codebase was written and reviewed against Postgres's `READ COMMITTED` default
    //   (design.md - "the transaction isolation level is pinned to READ COMMITTED per session").
    // - A new session's time zone defaults to the server's, not UTC — see the `timezone: 'Z'`
    //   comment above for why that matters to server-evaluated date/time functions.
    // `mysql2` fires `'connection'` once per physical connection, before it's handed back to the
    // pool for acquisition, so these run ahead of anything the application queues on it.
    pool.on('connection', (connection) => {
        const raw = connection;
        raw.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED', (err) => {
            if (err)
                console.error('failed to set MySQL session isolation level', err);
        });
        raw.query("SET SESSION time_zone = '+00:00'", (err) => {
            if (err)
                console.error('failed to set MySQL session time zone', err);
        });
    });
    return drizzle(pool, { schema, mode: 'default' });
}
