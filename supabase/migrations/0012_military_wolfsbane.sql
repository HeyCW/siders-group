CREATE TABLE IF NOT EXISTS "app"."anak_usaha_profile" (
	"anak_usaha_id" uuid PRIMARY KEY NOT NULL,
	"logo_media_id" uuid,
	"description" text,
	"kind" text NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."anak_usaha_profile" ADD CONSTRAINT "anak_usaha_profile_anak_usaha_id_anak_usaha_id_fk" FOREIGN KEY ("anak_usaha_id") REFERENCES "app"."anak_usaha"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."anak_usaha_profile" ADD CONSTRAINT "anak_usaha_profile_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "app"."media"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
