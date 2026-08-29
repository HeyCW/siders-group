import { getDb } from '@siders/db';
let cachedDb;
export function getDatabase(env) {
    if (!cachedDb) {
        cachedDb = getDb(env);
    }
    return cachedDb;
}
/** Test-only: clears the memoized connection pool so a test can reload with a fresh one. */
export function __resetDatabaseCacheForTests() {
    cachedDb = undefined;
}
