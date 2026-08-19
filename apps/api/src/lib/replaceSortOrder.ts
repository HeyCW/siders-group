import { sql } from 'drizzle-orm';
import type { Database } from '@siders/db';
import type { AppError } from '../middleware/errorHandler.js';

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
  /** Fully-qualified table name, e.g. `"app.partners"`. Interpolated as raw SQL into the
   *  `LOCK TABLE` statement and the current-id read — safe only because every call site passes a
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
 * `app.partners` and `app.guide_picks`. Takes a table-level `EXCLUSIVE` lock, reads the current id
 * set, requires the submitted collection to name exactly that set, then writes each row's
 * `sortOrder` from its index in the submitted array.
 *
 * **The lock is table-level, not row-level.** `SELECT ... FOR UPDATE` would look sufficient and
 * is not: Postgres row locks take no predicate or gap locks, so they block a concurrent DELETE but
 * never an INSERT — a row created between the read and the validation would leave the checked set
 * already stale. `LOCK TABLE ... IN EXCLUSIVE MODE` conflicts with the ROW EXCLUSIVE that
 * INSERT/UPDATE/DELETE take, so it is what actually makes "exactly the current set" true for the
 * length of the transaction, while still admitting plain reads (ACCESS SHARE). Only one table is
 * ever touched by a call here, so there is no lock-ordering cycle to design around — unlike
 * `replaceOrdering.ts`, which locks referenced rows in a second table first for exactly that
 * reason.
 *
 * Extracted from `partner.repository.ts` and `guidePick.repository.ts`, which each carried this
 * transaction and its lock rationale verbatim — so a correction to it only has to happen once, the
 * same reasoning `replaceOrdering.ts` documents for the curation tables.
 */
export async function replaceSortOrder<TRow>(config: ReplaceSortOrderConfig<TRow>): Promise<TRow[]> {
  const { db, ids, table, updateSortOrder, selectJoined, onInvalidSet } = config;
  return db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE ${sql.raw(table)} IN EXCLUSIVE MODE`);
    const current = await tx.execute(sql`select id from ${sql.raw(table)}`);
    const currentIds = current.rows.map((r) => (r as { id: string }).id);
    if (!isExactIdSet(currentIds, ids)) throw onInvalidSet();

    for (const [index, id] of ids.entries()) {
      await updateSortOrder(tx, id, index);
    }

    return selectJoined(tx);
  });
}
