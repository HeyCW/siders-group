import { sql } from 'drizzle-orm';
import type { Database } from '@siders/db';
import { AppError } from '../middleware/errorHandler.js';
import { isForeignKeyViolation } from './pgErrors.js';

export type OrderingExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ReplaceOrderingConfig<TRow> {
  db: Database;
  ids: string[];
  /** Fully-qualified name of the table `ids` reference, e.g. `"app.articles"`. Interpolated as
   *  raw SQL into a `FOR KEY SHARE` existence check — safe only because every call site passes a
   *  literal, never a value derived from a request. Not a configuration point. */
  referencedTable: string;
  /** Fully-qualified name of the ordering table being replaced, e.g. `"app.home_curation"`.
   *  Interpolated as raw SQL into a `LOCK TABLE` statement — same literal-only constraint as
   *  `referencedTable`. */
  orderingTable: string;
  /** Deletes every row of the ordering table, within the transaction. */
  deleteAll: (tx: OrderingExecutor) => Promise<unknown>;
  /** Inserts one row per id with `position` set to its index in `ids`, within the transaction.
   *  Not called when `ids` is empty. */
  insertOrdered: (tx: OrderingExecutor, ids: string[]) => Promise<unknown>;
  /** Reads the resulting joined rows back, within the same transaction. */
  selectJoined: (tx: OrderingExecutor) => Promise<TRow[]>;
  /** Thrown when a submitted id names no row in `referencedTable`, or on a foreign-key violation
   *  caught from the insert. */
  onInvalidReference: () => AppError;
}

/**
 * Whole-list replacement in one transaction, in the lock order `add-home-curation` found
 * empirically against live Postgres 16, reused verbatim by `add-reels-curation`: row locks on
 * the referenced ids first (`FOR KEY SHARE`), then the ordering table lock, then
 * delete-and-reinsert.
 *
 * - **Row locks first.** The cycle this avoids arises when a concurrent hard delete targets an
 *   entity that is itself in this replace's submitted list: the delete takes that entity's row
 *   lock first and only then needs a lock on the ordering table (to run its `ON DELETE CASCADE`),
 *   while taking the table lock first here would need the same entity's row lock only afterward
 *   (via the insert's foreign-key check) — an unavoidable `40P01` deadlock reaching the caller as
 *   a 500 for a save that looked ordinary. `FOR KEY SHARE` on the submitted ids *before* the
 *   table lock removes the cycle, and doubles as the existence check.
 * - **Table lock second.** Without it, two overlapping replaces can both `DELETE` before either
 *   `INSERT`s (`READ COMMITTED` only removes rows visible to its own snapshot), and the second
 *   `INSERT` then collides with the first's rows on the ordering table's primary key or its
 *   `UNIQUE(position)` constraint — an unhandled `23505` surfacing as a 500 instead of the
 *   last-write-wins semantics these callers promise. Safe to take after the row locks: `FOR KEY
 *   SHARE` is a shared lock, so two concurrent replaces never block each other there, only here,
 *   in whichever order they arrive.
 *
 * Shared by `curation.repository.ts` (`home_curation`) and `reelsCuration.repository.ts`
 * (`reels_curation`) — structurally identical tables (`UNIQUE(position)`, `ON DELETE CASCADE`,
 * whole-list replacement) — so a correction to this ordering only has to happen once.
 */
export async function replaceOrdering<TRow>(config: ReplaceOrderingConfig<TRow>): Promise<TRow[]> {
  const { db, ids, referencedTable, orderingTable, deleteAll, insertOrdered, selectJoined, onInvalidReference } =
    config;
  try {
    return await db.transaction(async (tx) => {
      if (ids.length > 0) {
        const rows = await tx.execute(sql`
          select id from ${sql.raw(referencedTable)}
          where id in (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )})
          for key share
        `);
        if (rows.rows.length !== ids.length) throw onInvalidReference();
      }
      await tx.execute(sql`LOCK TABLE ${sql.raw(orderingTable)} IN EXCLUSIVE MODE`);
      await deleteAll(tx);
      if (ids.length > 0) {
        await insertOrdered(tx, ids);
      }
      return selectJoined(tx);
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (isForeignKeyViolation(err)) throw onInvalidReference();
    throw err;
  }
}
