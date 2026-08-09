import { index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';
import { users } from './users';

/**
 * The canonical media record (openspec/changes/add-news-management-system/design.md -
 * "Media storage"). `storagePath` is relative to `MEDIA_STORAGE_PATH`, never an absolute URL —
 * the public URL is derived at map time so relocating storage is a config change, not a
 * migration. Declared before `articles` so `articles.featuredMediaId` can reference it inline.
 */
export const media = app.table(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storagePath: text('storage_path').notNull().unique(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    originalFilename: text('original_filename').notNull(),
    alt: text('alt'),
    caption: text('caption'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uploadedByIdx: index('media_uploaded_by_idx').on(table.uploadedBy),
  }),
);
