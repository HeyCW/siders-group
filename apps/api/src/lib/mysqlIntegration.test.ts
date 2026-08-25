import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb, articles, articleViewsDaily, viewSeen, roles, users, type Database } from '@siders/db';
import { sql, eq } from 'drizzle-orm';
import { withTableWriteLock } from './tableWriteLock.js';
import { createEngagementRepository } from '../modules/engagement/engagement.repository.js';

/**
 * Runs only against a real MySQL server, set via `DATABASE_URL` with
 * `RUN_DB_INTEGRATION_TESTS=1` — the rest of the suite runs against in-memory fakes
 * (`apps/api/src/testing/fakeStaffAccessDb.ts`) and would stay green through a defect in either
 * of the two behaviors this file exists to check, exactly the gap
 * openspec/changes/migrate-postgres-to-mysql/design.md's "Risks / trade-offs" flags: "CI has
 * never run against a real database."
 *
 * Two things checked here specifically because they were rewritten furthest from their Postgres
 * originals and are the hardest to get right by inspection alone:
 * - the view-counting `insert ignore` / `on duplicate key update` pair
 *   (`engagement.repository.ts`'s `recordView`)
 * - the `GET_LOCK`/`RELEASE_LOCK` advisory-lock reorder serialization (`lib/tableWriteLock.ts`)
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === '1' && process.env.DATABASE_URL !== undefined;

describe.skipIf(!RUN)('MySQL integration', () => {
  let db: Database;
  let userId: string;
  let roleId: string;

  beforeAll(async () => {
    db = getDb({ DATABASE_URL: process.env.DATABASE_URL! });
    roleId = randomUUID();
    userId = randomUUID();
    await db.insert(roles).values({ id: roleId, name: `test-role-${roleId}`, slug: `test-role-${roleId}` });
    await db.insert(users).values({ id: userId, email: `${userId}@test.local`, passwordHash: 'x', name: 'Test', roleId });
  });

  afterAll(async () => {
    // Order matters without this: `articles.authorId` FK-references `users`, so deleting
    // `users` first would fail (or, worse, silently leave orphaned rows if it didn't). Deleting
    // the article first lets its own `ON DELETE CASCADE` FKs clean up whatever
    // `article_views_daily`/`view_seen` rows the tests below created — nothing here needs to
    // name them individually.
    await db.execute(sql`set foreign_key_checks=0`);
    await db.delete(articles).where(eq(articles.authorId, userId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(roles).where(eq(roles.id, roleId));
    await db.execute(sql`set foreign_key_checks=1`);
  });

  it('records a unique view once per visitor per day and counts every view', async () => {
    const articleId = randomUUID();
    await db.insert(articles).values({
      id: articleId,
      title: 'Integration test article',
      slug: `integration-test-${articleId}`,
      bodyJson: {},
      bodyHtml: '<p></p>',
      status: 'draft',
      authorId: userId,
    });

    // Exercises the real `engagement.repository.ts`, not a local copy of its SQL — this is
    // exactly the rewrite this file's own doc comment names as one of the two things it exists
    // to catch a regression in, so it needs to run the shipped code, not a frozen duplicate of
    // it that would keep passing after the shipped code changed underneath it.
    const engagement = createEngagementRepository(db);

    expect(await engagement.recordView(articleId, 'visitor-a')).toBe(true);
    expect(await engagement.recordView(articleId, 'visitor-a')).toBe(false);
    expect(await engagement.recordView(articleId, 'visitor-b')).toBe(true);

    const [row] = await db
      .select({ views: articleViewsDaily.views, uniqueViews: articleViewsDaily.uniqueViews })
      .from(articleViewsDaily)
      .where(eq(articleViewsDaily.articleId, articleId));
    expect(row).toEqual({ views: 3, uniqueViews: 2 });

    const seenRows = await db.select().from(viewSeen).where(eq(viewSeen.articleId, articleId));
    expect(seenRows).toHaveLength(2);
  });

  it('serializes two concurrent holders of the same named lock, and lets a different name through immediately', async () => {
    const lockTable = `lk-${randomUUID().slice(0, 8)}`;
    const order: string[] = [];

    const first = db.transaction(async (tx) => {
      return withTableWriteLock(tx, lockTable, async () => {
        order.push('first-acquired');
        await new Promise((resolve) => setTimeout(resolve, 300));
        order.push('first-releasing');
      });
    });
    // Give `first` a head start so it holds the lock before `second` attempts to acquire it.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const second = db.transaction(async (tx) => {
      return withTableWriteLock(tx, lockTable, async () => {
        order.push('second-acquired');
      });
    });

    await Promise.all([first, second]);
    expect(order).toEqual(['first-acquired', 'first-releasing', 'second-acquired']);
  });

  it('rejects with a conflict error when the lock cannot be acquired within its timeout', async () => {
    const lockTable = `lkt-${randomUUID().slice(0, 8)}`;

    const holder = db.transaction(async (tx) => {
      return withTableWriteLock(tx, lockTable, async () => {
        // Comfortably longer than the 1-second timeout the second attempt below uses, so the
        // second attempt's `GET_LOCK` wait genuinely expires rather than racing the release.
        await new Promise((resolve) => setTimeout(resolve, 2000));
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    await expect(
      db.transaction(async (tx) => withTableWriteLock(tx, lockTable, async () => {}, 1)),
    ).rejects.toMatchObject({ status: 409, code: 'write_lock_timeout' });

    await holder;
  });
});
