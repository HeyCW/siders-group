DROP TABLE "app"."article_tags" CASCADE;--> statement-breakpoint
DROP TABLE "app"."tags" CASCADE;--> statement-breakpoint
DELETE FROM "app"."permissions" WHERE "key" = 'tag.manage';