import { sql } from 'drizzle-orm';
import type { Database } from '@siders/db';
import { AppError } from '../middleware/errorHandler.js';
import { isForeignKeyViolation } from './dbErrors.js';
import { withTableWriteLock } from './tableWriteLock.js';

/**
 * Deliberately excludes the bare `Database` pool — same reasoning as `LockExecutor` in
 * `tableWriteLock.ts`: `deleteAll`/`insertOrdered`/`selectJoined` all run inside the one
 * transaction `replaceOrdering` opens, and a caller passed the pool instead would silently run
 * outside it.
 */
export type OrderingExecutor = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ReplaceOrderingConfig<TRow> {
  db: Database;
  ids: string[];
  /** Bare table name, e.g. `"articles"`. Interpolated as raw SQL into the existence check — safe
   *  only because every call site passes a literal, never a value derived from a request. Not a
   *  configuration point. */
  referencedTable: string;
  /** Bare table name, e.g. `"home_curation"`, of the ordering table being replaced. Passed as the
   *  advisory-lock name below — same literal-only constraint as `referencedTable`. */
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
 * Whole-list replacement in one transaction. Ported from the Postgres version, which took row
 * locks on the referenced ids (`FOR KEY SHARE`) before the ordering table's lock, in that order,
 * to avoid a specific deadlock against a concurrent hard delete of a referenced entity — see
 * `openspec/changes/migrate-postgres-to-mysql/design.md`, "`RETURNING` becomes
 * insert/update-then-select" section's sibling decision on locking, for the full account of why
 * that ordering existed and why it doesn't carry over:
 *
 * The deadlock the row-lock-first ordering avoided was a cycle between two *storage-engine* locks
 * (a row lock and a table lock) taken in opposite orders by two transactions. `withTableWriteLock`
 * replaces the table lock with a named advisory lock, which is not a storage-engine lock at all —
 * it participates in no lock-ordering relationship with a row lock, so that specific cycle cannot
 * form here regardless of ordering. What the row lock *also* did — guarantee the checked ids are
 * still present at insert time — is preserved differently: the existence check below is a plain
 * read (no lock), and a referenced entity deleted in the window between that check and the insert
 * surfaces as an ordinary foreign-key violation, caught below exactly as it always was for a
 * dangling id supplied by the caller. The two cases are indistinguishable to the caller by design
 * — both are "a submitted id doesn't reference a live row" — so this loses no correctness, only
 * the (Postgres-only) guarantee that the race is prevented rather than caught.
 */
export async function replaceOrdering<TRow>(config: ReplaceOrderingConfig<TRow>): Promise<TRow[]> {
  const { db, ids, referencedTable, orderingTable, deleteAll, insertOrdered, selectJoined, onInvalidReference } =
    config;
  try {
    return await db.transaction(async (tx) => {
      return withTableWriteLock(tx, orderingTable, async () => {
        if (ids.length > 0) {
          const [rows] = (await tx.execute(sql`
            select id from ${sql.raw(referencedTable)}
            where id in (${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )})
          `)) as unknown as [{ id: string }[], unknown];
          if (rows.length !== ids.length) throw onInvalidReference();
        }
        await deleteAll(tx);
        if (ids.length > 0) {
          await insertOrdered(tx, ids);
        }
        return selectJoined(tx);
      });
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (isForeignKeyViolation(err)) throw onInvalidReference();
    throw err;
  }
}
