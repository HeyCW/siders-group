-- A guide pick now requires a self-hosted video, not just a photo
-- (specs/guide-of-the-week-management/spec.md - "A guide pick requires a self-hosted video").
-- No video exists anywhere in the system before this migration, so there is nothing to backfill
-- existing rows with. Every guide pick present when this runs is deleted rather than left in a
-- state the new column can't express (design.md - "Migration: clear guide_picks rather than
-- attempt a backfill"). If this environment holds guide picks that matter, export or recreate
-- them with a video AFTER this migration — this statement does not and cannot do that for you.
ALTER TABLE "app"."guide_picks" ADD COLUMN "video_media_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."guide_picks" ADD CONSTRAINT "guide_picks_video_media_id_media_id_fk" FOREIGN KEY ("video_media_id") REFERENCES "app"."media"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DELETE FROM "app"."guide_picks";--> statement-breakpoint
ALTER TABLE "app"."guide_picks" ALTER COLUMN "video_media_id" SET NOT NULL;
