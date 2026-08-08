-- Feature changes append their seed data here (categories, sub-brands, first Owner, etc).

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
insert into app.users (email, name, role_id, password_hash, must_change_password, status)
select
  'owner@example.com',
  'Owner',
  r.id,
  '$argon2id$v=19$m=19456,t=2,p=1$4x6YR8sXe78xEF9oREkGzg$Nr2KuVbciDaJkYyZky1UTyJ0c+rowovSwL6d8QoAZL8',
  true,
  'active'
from app.roles r
where r.slug = 'owner'
on conflict (email) do nothing;
