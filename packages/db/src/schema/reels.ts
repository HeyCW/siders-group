import { text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { app } from './schema';
import { media } from './media';

/**
 * Fixed in code, not extendable at runtime — adding a provider is a deliberate, reviewed act:
 * an enum value, a parse pattern, and an embed template together
 * (openspec/changes/add-reels-curation/design.md - "Provider identity, not URLs").
 */
export const reelProvider = app.enum('reel_provider', ['instagram', 'tiktok', 'youtube']);

/**
 * `unavailable` exists because this system does not own the referenced content — the source
 * post can be deleted or made private without notice. Marking a reel `unavailable` removes it
 * from public output without touching the ordering, so its position survives for a later
 * restore (design.md - "Link rot is a status, not an exception").
 */
export const reelStatus = app.enum('reel_status', ['draft', 'published', 'unavailable']);

/**
 * The reel library. A reel references a video hosted by a recognized third-party provider; this
 * system stores no video bytes of its own — only the parsed `(provider, externalId)` identity,
 * never the submitted URL (design.md - "Provider identity, not URLs"). `posterMediaId` is
 * optional — a reel is playable via its third-party embed with or without one
 * (specs/reels-curation/spec.md - "Every reel has a locally stored poster image") — but when set,
 * it is `ON DELETE RESTRICT` rather than `SET NULL` or `CASCADE`: a reel that does have a stored
 * poster cannot degrade gracefully if that poster's media row disappears out from under it, so
 * losing a poster that was actually referenced must fail loudly rather than silently leave a
 * dangling reference.
 */
export const reels = app.table(
  'reels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: reelProvider('provider').notNull(),
    externalId: text('external_id').notNull(),
    posterMediaId: uuid('poster_media_id').references(() => media.id, { onDelete: 'restrict' }),
    caption: text('caption'),
    status: reelStatus('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The same source video cannot be stored under two records, which would otherwise let it
    // appear twice in one rail while passing the ordering's own duplicate-id check
    // (specs/reels-curation/spec.md - "Only a provider identity is persisted" - "The same video
    // cannot be stored twice").
    providerExternalIdUnique: uniqueIndex('reels_provider_external_id_unique').on(table.provider, table.externalId),
  }),
);
