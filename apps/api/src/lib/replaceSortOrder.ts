import { sql } from 'drizzle-orm';
import type { Database } from '@siders/db';
import type { AppError } from '../middleware/errorHandler.js';
import { withTableWriteLock } from './tableWriteLock.js';

export type SortOrderExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * The rule every whole-list reorder in this module enforces: the submitted collection must name
 * every currently existing row, nothing more and nothing fewer. Compared as sets, not just by
 * length: the request schema already rejects duplicates upstream, so a duplicate padding the
 * array to the right length is the backstop case this catches. Pure and exported so the rule is
 * testable without a database.
 */
export function isExactIdSet(currentIds: readonly string[], submittedIds: readonly string[]): boolean {
  if (currentIds.length !== submittedIds.length) return false;
  const current = new Set(currentIds);
  const submitted = new Set(submittedIds);
  if (current.size !== submitted.size) return false;
  for (const id of current) {
    if (!submitted.has(id)) return false;
  }
  return true;
}

export interface ReplaceSortOrderConfig<TRow> {
  db: Database;
  ids: string[];
  /** Bare table name, e.g. `"partners"`. Interpolated as raw SQL into the current-id read, and
   *  passed as the advisory-lock name below — safe only because every call site passes a
   *  literal, never a value derived from a request. Not a configuration point. */
  table: string;
  /** Sets one row's `sortOrder` (and `updatedAt`) to its new position, within the transaction. */
  updateSortOrder: (tx: SortOrderExecutor, id: string, sortOrder: number) => Promise<unknown>;
  /** Reads the resulting joined rows back, in stored order, within the same transaction. */
  selectJoined: (tx: SortOrderExecutor) => Promise<TRow[]>;
  /** Thrown when the submitted id set does not exactly match the table's current rows. */
  onInvalidSet: () => AppError;
}

/**
 * Whole-list reorder for a directly-owned entity with no separate ordering table — today
 * `partners`, `guide_picks`, and `anak_usaha_profile` (the last of which duplicates this shape in
 * `anakUsaha.repository.ts` rather than calling this helper directly, since its primary key
 * column is `anak_usaha_id`, not `id`). Takes the named advisory lock for this table, reads the
 * current id set, requires the submitted collection to name exactly that set, then writes each
 * row's `sortOrder` from its index in the submitted array.
 *
 * Ported from the Postgres version's `LOCK TABLE ... IN EXCLUSIVE MODE`
 * (openspec/changes/migrate-postgres-to-mysql/design.md - "table-level reorder locks become
 * named advisory locks"). The original comment's reasoning for a *table* lock over `SELECT ...
 * FOR UPDATE` still explains why a plain row lock would be insufficient — it just doesn't
 * translate to an available Postgres primitive. `withTableWriteLock` reaches the same end (this
 * reorder cannot interleave with another reorder, or with this table's `create`, which acquires
 * the identical lock name for its own `max(sortOrder) + 1` read) by cooperative exclusion instead
 * of a storage-engine-enforced one; see that helper's comment for exactly what that trades away.
 */
export async function replaceSortOrder<TRow>(config: ReplaceSortOrderConfig<TRow>): Promise<TRow[]> {
  const { db, ids, table, updateSortOrder, selectJoined, onInvalidSet } = config;
  return db.transaction(async (tx) => {
    return withTableWriteLock(tx, table, async () => {
      const [rows] = (await tx.execute(sql`select id from ${sql.raw(table)}`)) as unknown as [{ id: string }[], unknown];
      const currentIds = rows.map((r) => r.id);
      if (!isExactIdSet(currentIds, ids)) throw onInvalidSet();

      for (const [index, id] of ids.entries()) {
        await updateSortOrder(tx, id, index);
      }

      return selectJoined(tx);
    });
  });
}
