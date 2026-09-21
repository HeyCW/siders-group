import { and, eq } from 'drizzle-orm';
import { hyperlocalSpotlight, type Database } from '@siders/db';
import type { OrderingExecutor } from '../../lib/replaceOrdering.js';

/** The table's one legal `slot` value — see `packages/db/src/schema/hyperlocalSpotlight.ts`. */
const SLOT = 'default' as const;

/**
 * The low-level singleton-row accessor. `set`/`clearIfHeldBy` deliberately take
 * `OrderingExecutor`, not the bare `Database` pool — same reasoning as `OrderingExecutor` itself
 * gives: both writes must run inside the article write's own transaction so the spotlight change
 * and the article save succeed or fail together
 * (specs/hyperlocal-spotlight/spec.md - "The spotlight write is atomic with the article save"),
 * and a caller passing the pool instead would silently run outside it.
 */
export interface HyperlocalSpotlightRepository {
  /**
   * The stored editor pick's article id, or `null` when none is set. A missing row — the seed
   * row deleted or never applied — degrades to `null` exactly like an explicit `NULL` rather
   * than throwing (design.md - "Exactly one row, forever").
   */
  getArticleId(): Promise<string | null>;
  /** Makes `articleId` the editor pick, replacing whatever it held before. Idempotent. */
  set(executor: OrderingExecutor, articleId: string): Promise<void>;
  /** Releases the editor pick only if it currently points at `articleId`; a no-op otherwise. */
  clearIfHeldBy(executor: OrderingExecutor, articleId: string): Promise<void>;
}

export function createHyperlocalSpotlightRepository(db: Database): HyperlocalSpotlightRepository {
  return {
    async getArticleId() {
      const [row] = await db
        .select({ articleId: hyperlocalSpotlight.articleId })
        .from(hyperlocalSpotlight)
        .where(eq(hyperlocalSpotlight.slot, SLOT))
        .limit(1);
      return row?.articleId ?? null;
    },

    async set(executor, articleId) {
      await executor
        .update(hyperlocalSpotlight)
        .set({ articleId, updatedAt: new Date() })
        .where(eq(hyperlocalSpotlight.slot, SLOT));
    },

    async clearIfHeldBy(executor, articleId) {
      await executor
        .update(hyperlocalSpotlight)
        .set({ articleId: null, updatedAt: new Date() })
        .where(and(eq(hyperlocalSpotlight.slot, SLOT), eq(hyperlocalSpotlight.articleId, articleId)));
    },
  };
}
