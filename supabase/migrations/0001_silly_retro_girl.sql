CREATE TYPE "app"."article_status" AS ENUM('draft', 'scheduled', 'published');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_path" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"original_filename" text NOT NULL,
	"alt" text,
	"caption" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_storage_path_unique" UNIQUE("storage_path")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"body_json" jsonb NOT NULL,
	"body_html" text NOT NULL,
	"excerpt" text,
	"status" "app"."article_status" DEFAULT 'draft' NOT NULL,
	"author_id" uuid NOT NULL,
	"featured_media_id" uuid,
	"seo_title" text,
	"seo_description" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."article_categories" (
	"article_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "article_categories_article_id_category_id_pk" PRIMARY KEY("article_id","category_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."article_tags" (
	"article_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "article_tags_article_id_tag_id_pk" PRIMARY KEY("article_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "app"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "app"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."articles" ADD CONSTRAINT "articles_featured_media_id_media_id_fk" FOREIGN KEY ("featured_media_id") REFERENCES "app"."media"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."article_categories" ADD CONSTRAINT "article_categories_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."article_categories" ADD CONSTRAINT "article_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."article_tags" ADD CONSTRAINT "article_tags_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "app"."articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."article_tags" ADD CONSTRAINT "article_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "app"."tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_uploaded_by_idx" ON "app"."media" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_status_published_at_idx" ON "app"."articles" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_author_idx" ON "app"."articles" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_featured_media_idx" ON "app"."articles" USING btree ("featured_media_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_categories_category_idx" ON "app"."article_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_tags_tag_idx" ON "app"."article_tags" USING btree ("tag_id");--> statement-breakpoint
-- RLS default-deny on every table (docs/ARCHITECTURE.md §6.3), matching 0000's pattern. No
-- policies granted to anon/authenticated; the API's Postgres role has BYPASSRLS and is the
-- only intended writer (openspec/changes/add-news-management-system/tasks.md - 2.7, 2.9).
ALTER TABLE "app"."media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."articles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."article_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."article_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."tags" ENABLE ROW LEVEL SECURITY;
-- No new rows are added to app.permissions here: news.manage, category.manage, tag.manage and
-- media.manage were already seeded by 0000_useful_red_shift.sql and already granted to Owner
-- through that migration's role_permissions CROSS JOIN
-- (openspec/changes/add-news-management-system/tasks.md - 2.10).