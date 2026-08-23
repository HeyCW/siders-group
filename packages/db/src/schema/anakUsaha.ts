import { boolean, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';
import { media } from './media';

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
 * Postgres enum — no `pgEnum` is used elsewhere in this schema. `links` is `jsonb` rather than a
 * child table for the same reason `articles.bodyJson` is (design.md - "links as jsonb").
 */
export const anakUsahaProfile = app.table('anak_usaha_profile', {
  anakUsahaId: uuid('anak_usaha_id')
    .primaryKey()
    .references(() => anakUsaha.id, { onDelete: 'cascade' }),
  logoMediaId: uuid('logo_media_id').references(() => media.id, { onDelete: 'set null' }),
  /** Hex color (`#rrggbb`) behind the logo on the home page tile, admin-picked per entry. `null`
   *  falls back to the tile's default paper background (`AnakUsahaTiles.tsx`). */
  backgroundColor: text('background_color'),
  description: text('description'),
  kind: text('kind').notNull(),
  links: jsonb('links').notNull().default([]),
  sortOrder: integer('sort_order').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
