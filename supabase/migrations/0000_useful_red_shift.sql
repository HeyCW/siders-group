CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "app"."reader_status" AS ENUM('active', 'banned');--> statement-breakpoint
CREATE TYPE "app"."subject_type" AS ENUM('staff', 'reader');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name"),
	CONSTRAINT "roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"role_id" uuid NOT NULL,
	"status" "app"."user_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."readers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"status" "app"."reader_status" DEFAULT 'active' NOT NULL,
	"muted_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "readers_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"subject_type" "app"."subject_type" NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"user_agent" text,
	"ip_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "app"."permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "app"."roles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "app"."users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_subject_idx" ON "app"."sessions" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_family_idx" ON "app"."sessions" USING btree ("family_id");
--> statement-breakpoint
-- RLS default-deny on every table (docs/ARCHITECTURE.md §6.3). No policies granted to
-- anon/authenticated; the API's Postgres role has BYPASSRLS and is the only intended writer.
ALTER TABLE "app"."permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app"."role_permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app"."roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app"."users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app"."readers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app"."sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Fixed permission catalog (openspec/changes/add-auth-foundation/specs/rbac-management/spec.md
-- "Fixed permission catalog"). Seeded here, in the migration, only — never in
-- supabase/seed.sql, which is local-dev-only and would leave production with an empty catalog.
INSERT INTO "app"."permissions" ("key", "description") VALUES
	('news.manage', 'Create, edit, publish, schedule, and delete news articles'),
	('category.manage', 'Create, edit, and delete article categories'),
	('tag.manage', 'Create, edit, and delete article tags'),
	('media.manage', 'Upload and manage media assets'),
	('user.manage', 'Create, disable, and reset staff accounts'),
	('role.manage', 'Create, edit, and delete roles and their permission assignments'),
	('dashboard.view', 'View the admin dashboard'),
	('settings.manage', 'Manage system-wide settings')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- The Owner role: is_system = true blocks delete and blocks stripping role.manage
-- (enforced in application code, not SQL). Seeded with every catalog permission, and the
-- authorization layer additionally recognizes it by this seeded row's immutable id, never
-- by name or slug (openspec/changes/add-auth-foundation/design.md - Decisions).
INSERT INTO "app"."roles" ("name", "slug", "is_system") VALUES
	('Owner', 'owner', true)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app"."role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "app"."roles" r
CROSS JOIN "app"."permissions" p
WHERE r.slug = 'owner'
ON CONFLICT DO NOTHING;