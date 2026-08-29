import { sql } from 'drizzle-orm';
import { AppError } from '../middleware/errorHandler.js';
/** Namespaced so this server's advisory locks never collide with another application's if the
 *  two ever share a MySQL instance — `GET_LOCK` names are global to the server, not scoped to a
 *  database (openspec/changes/migrate-postgres-to-mysql/design.md - "table-level reorder locks
 *  become named advisory locks"). */
const LOCK_PREFIX = 'siders:table-write:';
const DEFAULT_TIMEOUT_SECONDS = 10;
function lockConflictError(table) {
    return new AppError(`Another write to ${table} is in progress; try again`, 409, 'write_lock_timeout');
}
/**
 * Serializes every caller that wraps its critical section in this helper with the same `table`
 * name — the MySQL replacement for the Postgres `LOCK TABLE ... IN [EXCLUSIVE|SHARE ROW
 * EXCLUSIVE] MODE` statements this migration removes. Unlike a real table lock, `GET_LOCK` is
 * purely cooperative: it only excludes other callers that also acquire the same named lock, not
 * every possible writer of the table. That's sufficient here because every Postgres call site
 * this replaces used the stronger lock for exactly one of two reasons — serializing a whole-list
 * reorder against another reorder, or serializing a `max(sortOrder) + 1` read against another
 * create (or a reorder) — and both sides of each pair now acquire this same lock. An ordinary
 * `update`/`delete` on these tables never needed the table lock in the first place (see each
 * repository's own comment), so it doesn't need this either.
 *
 * `GET_LOCK` is connection-scoped, not transaction-scoped: it is not released by `ROLLBACK`. The
 * `finally` below is what makes release unconditional, and this must be called with a `tx` from
 * inside `db.transaction(...)` so acquire and release run on the one connection Drizzle pins to
 * that callback — a lock taken on one pooled connection is invisible to every other connection.
 */
/** MySQL rejects a `GET_LOCK` name over 64 characters outright (`ER_USER_LOCK_WRONG_NAME`, a
 *  SQL syntax error, not something `dbErrors.ts` can classify) — every real call site passes a
 *  short static table name, so hitting this is a programming error, not a runtime condition to
 *  degrade gracefully from. Failing here with a clear message beats a raw driver error surfacing
 *  from inside `tx.execute`. */
function assertLockNameFits(lockName) {
    if (lockName.length > 64) {
        throw new Error(`Advisory lock name "${lockName}" is ${lockName.length} characters; MySQL's GET_LOCK rejects names over 64.`);
    }
}
export async function withTableWriteLock(tx, table, fn, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS) {
    const lockName = `${LOCK_PREFIX}${table}`;
    assertLockNameFits(lockName);
    const [rows] = (await tx.execute(sql `select get_lock(${lockName}, ${timeoutSeconds}) as acquired`));
    if (rows[0]?.acquired !== 1)
        throw lockConflictError(table);
    try {
        return await fn();
    }
    finally {
        await tx.execute(sql `select release_lock(${lockName})`);
    }
}
