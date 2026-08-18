CREATE TYPE "app"."contact_message_status" AS ENUM('new', 'read');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"organisation" text,
	"email" text NOT NULL,
	"subject" text,
	"message" text NOT NULL,
	"status" "app"."contact_message_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_messages_created_at_idx" ON "app"."contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_messages_status_idx" ON "app"."contact_messages" USING btree ("status");--> statement-breakpoint
-- RLS default-deny (docs/ARCHITECTURE.md §6.3), matching every other table in this schema. No
-- policies granted to anon/authenticated; the API's Postgres role has BYPASSRLS and is the only
-- intended writer — including the public submission endpoint, which writes through that same role
-- rather than through a policy scoped to an anonymous Postgres session.
ALTER TABLE "app"."contact_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- A new permission key, `contact.manage`, rather than reusing `settings.manage`. Reading a
-- stranger's submitted name, email, and message is a materially different privilege than editing
-- site settings (design.md - "New contact.manage permission, not reuse of settings.manage").
-- Submitting a message requires no permission at all — it is a public, unauthenticated action
-- (specs/contact-messages/spec.md - "Any visitor can submit a contact message without
-- authentication").
INSERT INTO "app"."permissions" ("key", "description") VALUES
	('contact.manage', 'View contact-form submissions and mark them read or unread')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- Granted to Owner explicitly, the same way every catalog permission was for the seeded Owner
-- role in 0000_useful_red_shift.sql — that migration's CROSS JOIN ran once, at Owner's creation,
-- so a permission added afterward needs its own grant rather than inheriting it.
INSERT INTO "app"."role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "app"."roles" r, "app"."permissions" p
WHERE r.slug = 'owner' AND p.key = 'contact.manage'
ON CONFLICT DO NOTHING;