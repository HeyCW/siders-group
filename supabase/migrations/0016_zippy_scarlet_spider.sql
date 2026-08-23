-- The reels-curation capability is removed; self-hosted video now lives on guide_picks
-- (openspec/changes/self-hosted-guideline-videos).
DROP TABLE "app"."reels" CASCADE;--> statement-breakpoint
DROP TABLE "app"."reels_curation" CASCADE;--> statement-breakpoint
DROP TYPE "app"."reel_provider";--> statement-breakpoint
DROP TYPE "app"."reel_status";