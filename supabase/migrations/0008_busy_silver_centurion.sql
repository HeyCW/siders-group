CREATE TABLE IF NOT EXISTS "app"."guide_picks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" text NOT NULL,
	"place" text NOT NULL,
	"description" text NOT NULL,
	"photo_media_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."guide_picks" ADD CONSTRAINT "guide_picks_photo_media_id_media_id_fk" FOREIGN KEY ("photo_media_id") REFERENCES "app"."media"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- RLS default-deny (docs/ARCHITECTURE.md §6.3), matching every other table in this schema. No
-- policies granted to anon/authenticated; the API's Postgres role has BYPASSRLS and is the only
-- intended writer.
ALTER TABLE "app"."guide_picks" ENABLE ROW LEVEL SECURITY;
-- No new rows are added to app.permissions here: guide picks are carried by the existing
-- news.manage, already seeded by 0000_useful_red_shift.sql and already granted to Owner
-- (openspec/changes/add-guide-of-the-week-management/design.md - "Permission: reuse news.manage").
