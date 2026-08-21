## 1. Data model

- [ ] 1.1 Add `anakUsahaProfile` table to `packages/db/src/schema/anakUsaha.ts`: `anakUsahaId`
      (uuid, PK, FK to `anakUsaha.id`, `onDelete: 'cascade'`), `logoMediaId` (uuid, nullable, FK to
      `media.id`, `onDelete: 'set null'`), `description` (text, nullable), `kind` (text, not
      null), `links` (jsonb, not null, default `[]`), `sortOrder` (integer, not null),
      `isActive` (boolean, not null, default true), `createdAt`, `updatedAt`
- [ ] 1.2 Export the new table from `packages/db/src/schema/index.ts`
- [ ] 1.3 Generate migration via `pnpm --filter db db:generate`; no seed/backfill data (per
      `design.md` - Migration Plan)

## 2. Contracts

- [ ] 2.1 In `packages/contracts/src/anak-usaha.ts`, add `anakUsahaLinkSchema`
      (`{ label: string, href: <http/https-only, reusing partner.ts's isHttpUrl guard> }`)
- [ ] 2.2 Add `anakUsahaKindSchema` (`z.enum(['Media Platform', 'News & Community'])`)
- [ ] 2.3 Add `anakUsahaProfileCreateRequestSchema` (`{ anakUsahaId, logoMediaId?: nullable,
      description?: nullable, kind, links: anakUsahaLinkSchema[] }`) and
      `anakUsahaProfileUpdateRequestSchema` (all profile fields optional except identity)
- [ ] 2.4 Add `anakUsahaProfileReorderRequestSchema` (`{ anakUsahaIds: string[] }`, whole-list
      replacement, mirroring `partnerReorderRequestSchema`)
- [ ] 2.5 Add `anakUsahaAdminResponseSchema` (taxonomy fields + optional profile: logoUrl,
      description, kind, links, sortOrder, isActive — profile fields absent/null when no profile
      exists) for the admin screen's list
- [ ] 2.6 Extend the existing public anak usaha response schema so entries with an active profile
      include `logoUrl`, `description`, `kind`, `links` (entries without one keep the current
      `{id, name, slug}`-only shape and are filtered out of this rendering server-side, not
      client-side)
- [ ] 2.7 Export all new schemas from the contracts package entry point

## 3. API

- [ ] 3.1 Extend `apps/api/src/modules/anak-usaha/anakUsaha.repository.ts` with profile CRUD
      (create, update, delete, findByAnakUsahaId) and a `list()` that joins taxonomy rows with
      their optional profile
- [ ] 3.2 Extend `apps/api/src/modules/anak-usaha/anakUsaha.service.ts`: enforce one-profile-per-
      entry (reject create if a profile already exists for the id), validate the referenced
      `anakUsahaId` and `logoMediaId` exist, assign `sortOrder` at the end on create
- [ ] 3.3 Add a reorder method to the service: atomic whole-list replacement, rejecting requests
      that omit an existing profile id or include an unknown one — mirror
      `apps/api/src/modules/partners/partner.service.ts`'s reorder
- [ ] 3.4 Extend `apps/api/src/modules/anak-usaha/anakUsaha.mapper.ts` with `toAnakUsahaAdmin`
      (full shape incl. profile) and update the public mapper to include profile fields when
      present and active, derived via `publicUrlFor` for the logo (mirrors
      `partner.mapper.ts`'s `toPublicPartner`)
- [ ] 3.5 Extend `apps/api/src/modules/anak-usaha/anakUsaha.controller.ts` and
      `anakUsaha.routes.ts`: `POST /admin/anak-usaha/:id/profile`, `PATCH
      /admin/anak-usaha/:id/profile`, `DELETE /admin/anak-usaha/:id/profile`, `PUT
      /admin/anak-usaha/profile/order` — all gated on `anak-usaha.manage`; declare the `order`
      route before any `/:id`-shaped route per `partner.routes.ts`'s registration-order note
- [ ] 3.6 Update the existing public `GET /anak-usaha` handler to use the new mapper so entries
      with an active profile carry the extra fields and entries without one are unchanged
- [ ] 3.7 Confirm deleting an anak usaha entry (existing `DELETE /admin/anak-usaha/:id`) still
      works unchanged — the profile's cascading FK deletes it automatically, no service-level
      cleanup code needed; add a test asserting the profile row is gone afterward

## 4. Admin UI

- [ ] 4.1 Add profile methods to a new `apps/admin/src/lib/anakUsahaApi.ts` (list-with-profile,
      create/update/delete profile, reorder) — do not extend the generic `taxonomyApi.ts`, which
      stays scoped to plain `{id, name, slug}` CRUD
- [ ] 4.2 Build a new admin screen (e.g. `AnakUsahaPresentationPage.tsx`) mirroring
      `PartnersPage.tsx`: per-entry card showing name (read-only, from taxonomy), logo upload via
      `mediaApi` (optional — allow clearing), description textarea, kind select, dynamic
      add/remove links list (label + URL, client-side http/https validation before submit),
      active toggle, drag-to-reorder persisting via the reorder endpoint on drop, delete-profile
      action with a confirm copy noting it only removes the public presentation
- [ ] 4.3 Add a route and nav entry for the new screen in `App.tsx` / `Sidebar.tsx`, gated on
      `anak-usaha.manage` (reuse the existing nav entry from `add-article-anak-usaha` or add a
      second one under it — resolve in review of the existing `/anak-usaha` nav item)

## 5. Web frontend

- [ ] 5.1 Add `getAnakUsaha()` to `apps/web/lib/api.ts`, mirroring `getPartners()`, returning the
      extended public shape
- [ ] 5.2 Remove `SUB_BRANDS` and the `SubBrand`/`SubBrandLink` types from `apps/web/lib/content.tsx`
- [ ] 5.3 Update `apps/web/app/page.tsx` to fetch anak usaha data (mirroring the existing
      `getPartners().catch(() => [])` pattern) and pass it into `AnakUsahaTiles`
- [ ] 5.4 Update `AnakUsahaTiles.tsx` to accept the fetched list as props, render logo via plain
      `<img>` (per `PartnerGrid.tsx:44` precedent — no `next/image` remote pattern configured),
      drop the per-brand `tile`/`tileInk` background styling in favor of one fixed neutral
      background
- [ ] 5.5 Update `ConnectedPlatforms.tsx` to receive the fetched list and group by the now-typed
      `kind` enum instead of importing `SUB_BRANDS` directly; drop per-brand tile color
- [ ] 5.6 Update `SiteFooter.tsx` to receive/fetch the list instead of importing `SUB_BRANDS`
- [ ] 5.7 Update `apps/web/app/contact/page.tsx`'s sub-brand list to use the fetched list; wire
      each entry's first link (if any) as the `href` instead of the current dead `"#"`
- [ ] 5.8 Delete the now-unused static logo assets under `apps/web/public/` if no longer
      referenced anywhere

## 6. Verification

- [ ] 6.1 Unit tests for each scenario in `specs/anak-usaha-presentation/spec.md`: profile
      CRUD, one-profile-per-entry, kind validation, link scheme validation, reorder (replace +
      reject invalid), active/inactive filtering, cascade delete from the taxonomy side, and
      profile-only delete leaving the taxonomy entry and article tags intact
- [ ] 6.2 Update `apps/web/components/news/NewsExplorer.test.tsx` and any other existing test that
      currently imports `SUB_BRANDS` or renders the old tile colors
- [ ] 6.3 Migration applies cleanly against the current schema; manual check against the local dev
      database confirms the new table, its FKs, and cascade-on-delete behavior
- [ ] 6.4 Manual check: create a profile for each of the four existing sub-brands (logo, kind,
      description, links) from the new admin screen, confirm the home page tiles, masthead logo
      row, footer, and Contact page all render them; deactivate one and confirm it disappears from
      all four surfaces; delete a profile and confirm the taxonomy entry and its article tags are
      unaffected; delete a taxonomy entry with a profile and confirm both are gone
