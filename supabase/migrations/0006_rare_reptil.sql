CREATE TYPE "app"."comment_report_reason" AS ENUM('spam', 'harassment', 'off_topic', 'other');--> statement-breakpoint
CREATE TYPE "app"."moderation_action" AS ENUM('comment_removed', 'comment_restored', 'comment_reports_dismissed', 'reader_muted', 'reader_unmuted', 'reader_banned', 'reader_unbanned');--> statement-breakpoint
CREATE TYPE "app"."moderation_target_type" AS ENUM('comment', 'reader');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."comment_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" "app"."comment_report_reason" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"target_type" "app"."moderation_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"action" "app"."moderation_action" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."comment_reports" ADD CONSTRAINT "comment_reports_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "app"."comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."comment_reports" ADD CONSTRAINT "comment_reports_reporter_id_readers_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "app"."readers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."comment_reports" ADD CONSTRAINT "comment_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."moderation_actions" ADD CONSTRAINT "moderation_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comment_reports_comment_reporter_unique" ON "app"."comment_reports" USING btree ("comment_id","reporter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_reports_open_idx" ON "app"."comment_reports" USING btree ("comment_id") WHERE "app"."comment_reports"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_actions_target_history_idx" ON "app"."moderation_actions" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_actions_created_at_idx" ON "app"."moderation_actions" USING btree ("created_at");--> statement-breakpoint
-- RLS default-deny (docs/ARCHITECTURE.md §6.3), matching every other table in this schema. No
-- policies granted to anon/authenticated; the API's Postgres role has BYPASSRLS and is the only
-- intended writer.
ALTER TABLE "app"."comment_reports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app"."moderation_actions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- No column is added to "app"."comments" or "app"."readers" here. `status` (both tables) and
-- `muted_until` (readers) already exist and were already enforced — by the `visibleComments()`
-- predicate in engagement.repository.ts and by `requireReader` in
-- apps/api/src/middleware/authorize.ts — before this table or the surface that writes to them
-- existed. This migration adds two new tables — moderation_actions and comment_reports — and the
-- permission below, and no retrofit of either existing table.
--
-- A new permission key, `moderation.manage`, rather than reusing an existing one.
-- `0004_steep_leper_queen.sql` (add-brand-section) reused `settings.manage` for partners because
-- a partner directory is squarely "site configuration"; moderation is neither that nor
-- "editorial content" like `news.manage` covers — it is its own axis of control, who may act on
-- reader behaviour, that no existing catalog entry names (design.md - Decision 2). Filing a
-- report is a reader action authorized by `requireReader`, not by this permission — see
-- `specs/community-moderation/spec.md` - "A reader can report a comment".
INSERT INTO "app"."permissions" ("key", "description") VALUES
	('moderation.manage', 'Remove or restore reader comments, dismiss comment reports, and mute, unmute, ban, or unban readers')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- Granted to Owner explicitly, the same way every catalog permission was for the seeded Owner
-- role in 0000_useful_red_shift.sql — that migration's `CROSS JOIN` ran once, at Owner's
-- creation, so a permission added afterward needs its own grant rather than inheriting it.
INSERT INTO "app"."role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "app"."roles" r, "app"."permissions" p
WHERE r.slug = 'owner' AND p.key = 'moderation.manage'
ON CONFLICT DO NOTHING;