CREATE TYPE "app"."reel_provider" AS ENUM('instagram', 'tiktok', 'youtube');--> statement-breakpoint
CREATE TYPE "app"."reel_status" AS ENUM('draft', 'published', 'unavailable');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."reels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "app"."reel_provider" NOT NULL,
	"external_id" text NOT NULL,
	"poster_media_id" uuid NOT NULL,
	"caption" text,
	"status" "app"."reel_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."reels_curation" (
	"reel_id" uuid PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reels_curation_position_unique" UNIQUE("position")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."reels" ADD CONSTRAINT "reels_poster_media_id_media_id_fk" FOREIGN KEY ("poster_media_id") REFERENCES "app"."media"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."reels_curation" ADD CONSTRAINT "reels_curation_reel_id_reels_id_fk" FOREIGN KEY ("reel_id") REFERENCES "app"."reels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reels_provider_external_id_unique" ON "app"."reels" USING btree ("provider","external_id");--> statement-breakpoint
-- RLS default-deny (docs/ARCHITECTURE.md §6.3), matching every other table in this schema. No
-- policies granted to anon/authenticated; the API's Postgres role has BYPASSRLS and is the only
-- intended writer (openspec/changes/add-reels-curation/tasks.md - 1.9).
ALTER TABLE "app"."reels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app"."reels_curation" ENABLE ROW LEVEL SECURITY;
-- No new rows are added to app.permissions here: reels are carried by the existing
-- news.manage, already seeded by 0000_useful_red_shift.sql and already granted to Owner
-- (openspec/changes/add-reels-curation/tasks.md - 1.11).
