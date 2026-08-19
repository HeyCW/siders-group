import { text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';

/**
 * The anak usaha (sub-brand) catalog: Siders Culture, Jakarta Siders, Surabaya Siders, and
 * SidersVox (seeded by migration, matching `SUB_BRANDS` in `apps/web/lib/content.tsx`). Same
 * `{id, name, slug}` shape as `categories`/`tags` (`taxonomy.ts`), but an article relates to at
 * most one via `articles.anakUsahaId` rather than a many-to-many join table
 * (specs/anak-usaha-management/spec.md - "Articles relate to anak usaha one-to-many"). Declared
 * before `articles` so `articles.anakUsahaId` can reference it inline.
 */
export const anakUsaha = app.table('anak_usaha', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
