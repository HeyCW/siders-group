CREATE TABLE IF NOT EXISTS "app"."partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"logo_media_id" uuid NOT NULL,
	"website_url" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."partners" ADD CONSTRAINT "partners_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "app"."media"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- RLS default-deny (docs/ARCHITECTURE.md §6.3), matching every other table in this schema. No
-- policies granted to anon/authenticated; the API's Postgres role has BYPASSRLS and is the only
-- intended writer.
ALTER TABLE "app"."partners" ENABLE ROW LEVEL SECURITY;
-- No new rows are added to app.permissions here: partners are carried by the existing
-- settings.manage, already seeded by 0000_useful_red_shift.sql and already granted to Owner
-- (openspec/changes/add-brand-section/design.md - "Permission: reuse settings.manage").
