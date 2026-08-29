import { sql } from 'drizzle-orm';
import { char, datetime, index, int, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId.js';
import { users } from './users.js';

/**
 * The canonical media record (openspec/changes/add-news-management-system/design.md -
 * "Media storage"). `storagePath` is relative to `MEDIA_STORAGE_PATH`, never an absolute URL —
 * the public URL is derived at map time so relocating storage is a config change, not a
 * migration. Declared before `articles` so `articles.featuredMediaId` can reference it inline.
 */
export const media = mysqlTable(
  'media',
  {
    id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
    storagePath: varchar('storage_path', { length: 512 }).notNull().unique(),
    mime: varchar('mime', { length: 255 }).notNull(),
    sizeBytes: int('size_bytes').notNull(),
    originalFilename: varchar('original_filename', { length: 512 }).notNull(),
    alt: text('alt'),
    caption: text('caption'),
    uploadedBy: char('uploaded_by', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (table) => ({
    uploadedByIdx: index('media_uploaded_by_idx').on(table.uploadedBy),
  }),
);
