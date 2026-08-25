-- Local-dev only. The permission catalog, Owner role, and sub-brand catalog are seeded by
-- db/migrations/0001_seed_permission_catalog.sql, which runs in every environment — this file
-- adds only what a fresh local database additionally needs to sign in as Owner.
--
-- Seeds the first Owner account so the very first sign-in is an ordinary sign-in followed by
-- the same forced password change every account goes through, not a special-case code path
-- (see openspec/changes/add-auth-foundation/design.md - Decisions: "Bootstrapping the first
-- Owner"). No API path can create the first staff account, since creation requires
-- user.manage and granting Owner requires already holding Owner.
--
-- Local-dev convenience only: the raw password is "local-dev-owner-password" — sign in with
-- it, then change it (POST /staff/me/password) since must_change_password starts true. The
-- hash below is a real Argon2id hash of that fixed password at the app's OWASP-baseline
-- parameters (apps/api/src/lib/password.ts); never seed a fixed password outside local dev,
-- and change the email below before running this against anything but a local dev stack.
-- Literal UUIDv7, not MySQL's `uuid()` (v1) — same reasoning as
-- db/migrations/0001_seed_permission_catalog.sql's header comment.
insert into users (id, email, name, role_id, password_hash, must_change_password, status, created_at, updated_at)
select
  '01a036a7-78a2-7228-b788-2fc546cf97d2',
  'owner@example.com',
  'Owner',
  r.id,
  '$argon2id$v=19$m=19456,t=2,p=1$4x6YR8sXe78xEF9oREkGzg$Nr2KuVbciDaJkYyZky1UTyJ0c+rowovSwL6d8QoAZL8',
  true,
  'active',
  utc_timestamp(3),
  utc_timestamp(3)
from roles r
where r.slug = 'owner'
on duplicate key update email = email;
