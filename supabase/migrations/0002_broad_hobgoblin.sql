CREATE TABLE IF NOT EXISTS "app"."home_curation" (
	"article_id" uuid PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_curation_position_unique" UNIQUE("position")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."home_curation" ADD CONSTRAINT "home_curation_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- RLS default-deny (docs/ARCHITECTURE.md §6.3), matching every other table in this schema. No
-- policies granted to anon/authenticated; the API's Postgres role has BYPASSRLS and is the only
-- intended writer (openspec/changes/add-home-curation/tasks.md - 1.3, 1.5).
ALTER TABLE "app"."home_curation" ENABLE ROW LEVEL SECURITY;
-- No new rows are added to app.permissions here: curation is carried by the existing
-- news.manage, already seeded by 0000_useful_red_shift.sql and already granted to Owner
-- (openspec/changes/add-home-curation/tasks.md - 1.5).
