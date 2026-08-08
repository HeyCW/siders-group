import { getDb, type Database } from '@siders/db';
import type { Env } from '../config/env.js';

let cachedDb: Database | undefined;

export function getDatabase(env: Pick<Env, 'DATABASE_URL'>): Database {
  if (!cachedDb) {
    cachedDb = getDb(env);
  }
  return cachedDb;
}

/** Test-only: clears the memoized connection pool so a test can reload with a fresh one. */
export function __resetDatabaseCacheForTests(): void {
  cachedDb = undefined;
}
