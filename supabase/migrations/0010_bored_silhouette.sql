CREATE TABLE IF NOT EXISTS "app"."anak_usaha" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anak_usaha_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "app"."articles" ADD COLUMN "anak_usaha_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."articles" ADD CONSTRAINT "articles_anak_usaha_id_anak_usaha_id_fk" FOREIGN KEY ("anak_usaha_id") REFERENCES "app"."anak_usaha"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_anak_usaha_idx" ON "app"."articles" USING btree ("anak_usaha_id");
--> statement-breakpoint
-- RLS default-deny (docs/ARCHITECTURE.md §6.3), matching every other table in this schema. No
-- policies granted to anon/authenticated; the API's Postgres role has BYPASSRLS and is the only
-- intended writer.
ALTER TABLE "app"."anak_usaha" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Fixed permission catalog addition (specs/rbac-management/spec.md - "Fixed permission catalog"),
-- following the pattern of 0006_rare_reptil.sql / 0007_wandering_omega_flight.sql.
INSERT INTO "app"."permissions" ("key", "description") VALUES
	('anak-usaha.manage', 'Create, rename, and delete anak usaha (sub-brand) catalog entries')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- Granted to Owner explicitly, the same way every catalog permission added after 0000's initial
-- CROSS JOIN has been.
INSERT INTO "app"."role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "app"."roles" r, "app"."permissions" p
WHERE r.slug = 'owner' AND p.key = 'anak-usaha.manage'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Seed the four existing sub-brands (specs/anak-usaha-management/spec.md - "Anak usaha catalog"),
-- matching `SUB_BRANDS` in apps/web/lib/content.tsx.
INSERT INTO "app"."anak_usaha" ("name", "slug") VALUES
	('Siders Culture', 'siders-culture'),
	('Jakarta Siders', 'jakarta-siders'),
	('Surabaya Siders', 'surabaya-siders'),
	('SidersVox', 'sidersvox')
ON CONFLICT ("slug") DO NOTHING;