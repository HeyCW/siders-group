CREATE TYPE "app"."comment_status" AS ENUM('visible', 'removed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."article_views_daily" (
	"article_id" uuid NOT NULL,
	"date" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"unique_views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "article_views_daily_article_id_date_pk" PRIMARY KEY("article_id","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"reader_id" uuid NOT NULL,
	"body" text NOT NULL,
	"status" "app"."comment_status" DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reader_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."view_seen" (
	"article_id" uuid NOT NULL,
	"visitor_hash" text NOT NULL,
	"date" date NOT NULL,
	CONSTRAINT "view_seen_article_id_visitor_hash_date_pk" PRIMARY KEY("article_id","visitor_hash","date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."article_views_daily" ADD CONSTRAINT "article_views_daily_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."comments" ADD CONSTRAINT "comments_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."comments" ADD CONSTRAINT "comments_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "app"."readers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."likes" ADD CONSTRAINT "likes_reader_id_readers_id_fk" FOREIGN KEY ("reader_id") REFERENCES "app"."readers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."likes" ADD CONSTRAINT "likes_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."view_seen" ADD CONSTRAINT "view_seen_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_views_daily_date_idx" ON "app"."article_views_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_article_created_at_idx" ON "app"."comments" USING btree ("article_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "likes_reader_article_unique" ON "app"."likes" USING btree ("reader_id","article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "likes_article_idx" ON "app"."likes" USING btree ("article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "view_seen_date_idx" ON "app"."view_seen" USING btree ("date");--> statement-breakpoint
-- RLS default-deny (docs/ARCHITECTURE.md §6.3), matching every other table in this schema. No
-- policies granted to anon/authenticated; the API's Postgres role has BYPASSRLS and is the only
-- intended writer. These four tables take reader-initiated writes, so the default-deny matters
-- more here than anywhere else: nothing reaches them except through the API's own endpoints.
ALTER TABLE "app"."likes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."article_views_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."view_seen" ENABLE ROW LEVEL SECURITY;
-- No new rows are added to app.permissions here: reader engagement is gated on a reader session
-- rather than a staff permission, and the dashboard's readership section is carried by the
-- existing dashboard.view (openspec/changes/add-article-engagement/design.md).