## Why

The reader-facing "Anak Usaha" section (home page tiles, the masthead logo row, the site footer,
and the Contact page's sub-brand list) is entirely hardcoded in `SUB_BRANDS`
(`apps/web/lib/content.tsx`). Updating a sub-brand's description, logo, or social links today
requires a code change and a deploy. `add-article-anak-usaha` already introduced the lightweight
`anak_usaha` taxonomy table (id, name, slug) for tagging articles, but it carries no presentation
data — there is nothing an editor can point at to manage what readers see.

## What Changes

- Add a new `anak_usaha_profile` table: an optional, one-to-one presentation layer over the
  existing `anak_usaha` taxonomy row (not new fields bolted onto that table — the taxonomy row
  stays the same lightweight `{id, name, slug}` catalog used for article tagging).
- Profile fields: nullable logo (media reference), nullable description, a fixed-choice `kind`
  (`Media Platform` | `News & Community` — not free text), 0..n `links` (label + http/https URL
  each), `sortOrder`, and `isActive`. No color fields — the previous per-brand `tile`/`tileInk`
  hex colors are dropped; the logo/design carries the visual identity instead.
- Add admin CRUD for the profile (logo upload, description, kind selector, add/remove links,
  drag-reorder, active toggle) — a dedicated screen mirroring `PartnersPage.tsx`'s pattern, not
  the generic `TaxonomyManagementPage.tsx` used for plain name/slug taxonomies.
- Extend the existing public `GET /anak-usaha` endpoint to include profile fields for entries that
  have an active profile (logo URL, description, kind, links, in `sortOrder` order); entries
  without a profile, or with an inactive one, are omitted from the public response.
- Replace `SUB_BRANDS` in `apps/web/lib/content.tsx` with data fetched from `GET /anak-usaha`,
  consumed by `AnakUsahaTiles`, `ConnectedPlatforms`, `SiteFooter`, and the Contact page.
- Deleting a profile removes only the public presentation (the card disappears from the site); it
  does not touch the underlying `anak_usaha` taxonomy row or any article's `anakUsahaId` tag.
  Deleting the taxonomy row itself (existing `anak-usaha.manage`-gated endpoint) cascades and
  removes its profile too, since a profile cannot outlive the entity it presents.
- **BREAKING**: `SubBrand`/`SUB_BRANDS` and their static logo assets in `apps/web/lib/content.tsx`
  are removed once the API-backed data replaces them.

## Capabilities

### New Capabilities

- `anak-usaha-presentation`: admin-managed public presentation profile (logo, description, kind,
  links, ordering, visibility) for anak usaha entries, and its rendering on the public site.

### Modified Capabilities

(none — `anak-usaha-management`, added by `add-article-anak-usaha`, has not yet been synced into
`openspec/specs/`; this change only adds a new capability layered on top of it, it does not change
that capability's own requirements)

## Impact

- **Affected specs**: `anak-usaha-presentation` (new)
- **Affected code**:
  - `packages/db/src/schema/anakUsaha.ts` (new `anakUsahaProfile` table, FK to `anakUsaha.id` with
    cascade delete, FK to `media.id` nullable)
  - `supabase/migrations/` (new migration: table + indexes)
  - `packages/contracts/src/anak-usaha.ts` (profile create/update/reorder schemas, admin response
    with profile, public response schema)
  - `apps/api/src/modules/anak-usaha/` (extend repository/service/controller/routes for profile
    CRUD, reorder, and the public shape; mirrors `apps/api/src/modules/partners/`)
  - `apps/admin/src/pages/` (new anak usaha presentation screen, mirroring `PartnersPage.tsx`)
  - `apps/admin/src/lib/taxonomyApi.ts` or a new `anakUsahaApi` client module (profile endpoints)
  - `apps/web/lib/api.ts` (new `getAnakUsaha()` fetch, mirroring `getPartners()`)
  - `apps/web/lib/content.tsx` (remove `SUB_BRANDS`/`SubBrand`)
  - `apps/web/components/home/AnakUsahaTiles.tsx`, `ConnectedPlatforms.tsx`,
    `apps/web/components/layout/SiteFooter.tsx`, `apps/web/app/contact/page.tsx` (consume API data
    instead of the static array; drop per-brand tile color rendering)
- **Migration**: required — new `anak_usaha_profile` table, no data backfill (existing sub-brand
  copy in `SUB_BRANDS` is not machine-seeded; an editor re-enters it through the new admin screen)
