-- Restores a database-side default for every `created_at`/`updated_at` column. The original
-- MySQL port (openspec/changes/migrate-postgres-to-mysql) generated these with
-- `.$defaultFn(() => new Date())`, moving the source of truth from the single Postgres server's
-- clock (`.defaultNow()`) to each API process's own clock — undetected until code review, since
-- it only diverges under multi-instance clock skew. `moderation.repository.ts` keys a keyset-
-- pagination cursor on `(created_at, id)`, and specs/data-layer/spec.md's "no row skipped or
-- duplicated across a page boundary" scenario depends on `created_at` coming from one clock.
-- `CURRENT_TIMESTAMP(3)` restores that: MySQL's own clock stamps the row at insert time, same as
-- the Postgres default it replaces.
ALTER TABLE `roles` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `roles` MODIFY COLUMN `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `readers` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `readers` MODIFY COLUMN `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `sessions` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `media` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `anak_usaha` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `anak_usaha_profile` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `anak_usaha_profile` MODIFY COLUMN `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `articles` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `articles` MODIFY COLUMN `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `categories` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `home_curation` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `partners` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `partners` MODIFY COLUMN `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `guide_picks` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `guide_picks` MODIFY COLUMN `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `comments` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `likes` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `comment_reports` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `moderation_actions` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);--> statement-breakpoint
ALTER TABLE `contact_messages` MODIFY COLUMN `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);