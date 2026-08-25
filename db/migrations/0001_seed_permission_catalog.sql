-- Fixed permission catalog, the Owner system role, and the sub-brand catalog. Ported from
-- across several Postgres migrations (0000_useful_red_shift.sql, 0006_rare_reptil.sql,
-- 0007_wandering_omega_flight.sql, 0010_bored_silhouette.sql) into one file for the fresh MySQL
-- baseline (openspec/changes/migrate-postgres-to-mysql) — the incremental history of which
-- permission was added by which historical Postgres change is preserved in
-- supabase/migrations/*.sql (kept for reference; not applied), not replayed step-by-step here.
--
-- Seeded in a migration, not in db/seed.sql — db/seed.sql is local-dev-only, and this catalog is
-- exactly what production also needs (specs/rbac-management/spec.md - "Fixed permission
-- catalog"; the same reasoning 0000_useful_red_shift.sql's original comment stated).
--
-- `tag.manage`, present in the original Postgres catalog, is not seeded here: the `tags` feature
-- was removed from the codebase before this migration was written (packages/contracts/src/permission.ts
-- no longer lists it).
-- Ids below are literal UUIDv7 values, generated once with the same `uuid` package `newId()`
-- (packages/db/src/newId.ts) uses, not MySQL's own `uuid()` — that function is UUID *v1*
-- (time-low-first), which would leave these bootstrap rows violating the primary-key invariant
-- every other row in this schema is generated under (design.md - "primary keys are `char(36)`
-- holding an application-generated UUIDv7"; caught in review, since it only matters for
-- clustered-index locality, not correctness, on a fixed set of rows this small).
insert into permissions (id, `key`, description) values
	('01a036a6-d046-7362-b59b-cfe758e95139', 'news.manage', 'Create, edit, publish, schedule, and delete news articles'),
	('01a036a6-d04a-71de-ba5f-aa944800b0d4', 'category.manage', 'Create, edit, and delete article categories'),
	('01a036a6-d04a-71de-ba5f-ad2caf4e81d3', 'anak-usaha.manage', 'Create, rename, and delete anak usaha (sub-brand) catalog entries'),
	('01a036a6-d04a-71de-ba5f-b17e285aed56', 'media.manage', 'Upload and manage media assets'),
	('01a036a6-d04a-71de-ba5f-b4e7a13e8468', 'user.manage', 'Create, disable, and reset staff accounts'),
	('01a036a6-d04b-73af-be63-51f8c4b1690a', 'role.manage', 'Create, edit, and delete roles and their permission assignments'),
	('01a036a6-d04b-73af-be63-5594eb932d0c', 'dashboard.view', 'View the admin dashboard'),
	('01a036a6-d04b-73af-be63-5a613ad7a8a7', 'settings.manage', 'Manage system-wide settings'),
	('01a036a6-d04b-73af-be63-5cdda6000643', 'moderation.manage', 'Remove or restore reader comments, dismiss comment reports, and mute, unmute, ban, or unban readers'),
	('01a036a6-d04b-73af-be63-60deb8e05967', 'contact.manage', 'View contact-form submissions and mark them read or unread')
on duplicate key update `key` = `key`;
--> statement-breakpoint
-- The Owner role: `is_system = true` blocks delete and blocks stripping `role.manage` (enforced
-- in application code, not SQL). The authorization layer recognizes it by this seeded row's
-- immutable id, never by name or slug (openspec/changes/add-auth-foundation/design.md).
insert into roles (id, name, slug, is_system, created_at, updated_at)
values ('01a036a6-d04b-73af-be63-6686b21e16e6', 'Owner', 'owner', true, utc_timestamp(3), utc_timestamp(3))
on duplicate key update slug = slug;
--> statement-breakpoint
-- Every catalog permission, granted to Owner.
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.slug = 'owner'
on duplicate key update role_id = role_id;
--> statement-breakpoint
-- The four existing sub-brands (specs/anak-usaha-management/spec.md - "Anak usaha catalog"),
-- matching `SUB_BRANDS` in apps/web/lib/content.tsx.
insert into anak_usaha (id, name, slug, created_at) values
	('01a036a6-d04c-744c-b00d-969e3eccbe08', 'Siders Culture', 'siders-culture', utc_timestamp(3)),
	('01a036a6-d04c-744c-b00d-99cc87d38a57', 'Jakarta Siders', 'jakarta-siders', utc_timestamp(3)),
	('01a036a6-d04c-744c-b00d-9fc615424a7a', 'Surabaya Siders', 'surabaya-siders', utc_timestamp(3)),
	('01a036a6-d04c-744c-b00d-a28628f7120d', 'SidersVox', 'sidersvox', utc_timestamp(3))
on duplicate key update slug = slug;
