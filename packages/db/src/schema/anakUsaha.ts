import { sql } from 'drizzle-orm';
import { boolean, char, datetime, int, json, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core';
import { newId } from '../newId.js';
import { media } from './media.js';

/**
 * The anak usaha (sub-brand) catalog: Siders Culture, Jakarta Siders, Surabaya Siders, and
 * SidersVox (seeded by migration, matching `SUB_BRANDS` in `apps/web/lib/content.tsx`). Same
 * `{id, name, slug}` shape as `categories` (`taxonomy.ts`), but an article relates to at most one
 * via `articles.anakUsahaId` rather than a many-to-many join table
 * (specs/anak-usaha-management/spec.md - "Articles relate to anak usaha one-to-many"). Declared
 * before `articles` so `articles.anakUsahaId` can reference it inline.
 */
export const anakUsaha = mysqlTable('anak_usaha', {
  id: char('id', { length: 36 }).primaryKey().$defaultFn(newId),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 191 }).notNull().unique(),
  createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

/**
 * The optional public presentation for an anak usaha entry — logo, description, kind, links,
 * order, and visibility — kept separate from the lightweight taxonomy row above so an entry used
 * only for article tagging never needs to carry unused presentation columns
 * (design.md - "Separate anak_usaha_profile table, not new columns on anak_usaha"). `anakUsahaId`
 * is both the primary key and the foreign key: this makes "at most one profile per entry" a
 * schema-level guarantee rather than an application check, and `onDelete: 'cascade'` deletes the
 * profile automatically when its entry is deleted (design.md - "One-to-one via a shared primary
 * key"). `logoMediaId` is nullable / `set null`, unlike `partners.logoMediaId`, because a
 * logo-less profile is a valid public entry here (design.md - "Logo FK is nullable"). `kind` is
 * `text`, validated by the Zod enum in `packages/contracts/src/anak-usaha.ts` rather than a
 * database enum. `links` is `json` (Postgres `jsonb` has no MySQL equivalent; MySQL's `json` type
 * covers the same "no child table" reasoning `articles.bodyJson` follows).
 */
export const anakUsahaProfile = mysqlTable('anak_usaha_profile', {
  anakUsahaId: char('anak_usaha_id', { length: 36 })
    .primaryKey()
    .references(() => anakUsaha.id, { onDelete: 'cascade' }),
  logoMediaId: char('logo_media_id', { length: 36 }).references(() => media.id, { onDelete: 'set null' }),
  /** Hex color (`#rrggbb`) behind the logo on the home page tile, admin-picked per entry. `null`
   *  falls back to the tile's default paper background (`AnakUsahaTiles.tsx`). */
  backgroundColor: varchar('background_color', { length: 32 }),
  description: text('description'),
  kind: varchar('kind', { length: 64 }).notNull(),
  links: json('links').notNull().default([]),
  sortOrder: int('sort_order').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: datetime('created_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime('updated_at', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});
