## 1. Data model

- [x] 1.1 Add `anakUsahaProfile` table to `packages/db/src/schema/anakUsaha.ts`: `anakUsahaId`
      (uuid, PK, FK to `anakUsaha.id`, `onDelete: 'cascade'`), `logoMediaId` (uuid, nullable, FK to
      `media.id`, `onDelete: 'set null'`), `description` (text, nullable), `kind` (text, not
      null), `links` (jsonb, not null, default `[]`), `sortOrder` (integer, not null),
      `isActive` (boolean, not null, default true), `createdAt`, `updatedAt`
- [x] 1.2 Export the new table from `packages/db/src/schema/index.ts`
- [x] 1.3 Generate migration via `pnpm --filter db db:generate`; no seed/backfill data (per
      `design.md` - Migration Plan)

## 2. Contracts

- [x] 2.1 In `packages/contracts/src/anak-usaha.ts`, add `anakUsahaLinkSchema`
      (`{ label: string, href: <http/https-only, reusing partner.ts's isHttpUrl guard> }`)
- [x] 2.2 Add `anakUsahaKindSchema` (`z.enum(['Media Platform', 'News & Community'])`)
- [x] 2.3 Add `anakUsahaProfileCreateRequestSchema` (`{ logoMediaId?: nullable, description?:
      nullable, kind, links?: anakUsahaLinkSchema[] }` — the target entry's id comes from the
      route, not the body) and `anakUsahaProfileUpdateRequestSchema` (same fields, all optional,
      plus `isActive`)
- [x] 2.4 Add `anakUsahaProfileReorderRequestSchema` (`{ anakUsahaIds: string[] }`, whole-list
      replacement, mirroring `partnerReorderRequestSchema`)
- [x] 2.5 Add `anakUsahaAdminResponseSchema` (taxonomy fields + optional profile: logoUrl,
      description, kind, links, sortOrder, isActive — profile fields absent/null when no profile
      exists) for the admin screen's list
- [x] 2.6 Extend the existing public anak usaha response schema so every entry keeps its current
      `{id, name, slug}` shape, with `logoUrl`, `description`, `kind`, `links`, `sortOrder` added
      only when the entry has an active profile — the endpoint keeps returning every entry
      (needed by the `/news` filter and article editor); the web app decides which entries to
      render in the Anak Usaha section
- [x] 2.7 Export all new schemas from the contracts package entry point

## 3. API

- [x] 3.1 Extend `apps/api/src/modules/anak-usaha/anakUsaha.repository.ts` with profile CRUD
      (create, update, delete, findByAnakUsahaId) and a `list()` that joins taxonomy rows with
      their optional profile
- [x] 3.2 Extend `apps/api/src/modules/anak-usaha/anakUsaha.service.ts`: enforce one-profile-per-
      entry (reject create if a profile already exists for the id — enforced by the shared-PK
      schema, translated to a 409 in the repository), validate the referenced `anakUsahaId` and
      `logoMediaId` exist (FK violations translated to 400s), assign `sortOrder` at the end on
      create
- [x] 3.3 Add a reorder method to the service: atomic whole-list replacement, rejecting requests
      that omit an existing profile id or include an unknown one — same locking strategy as
      `apps/api/src/modules/partners/partner.repository.ts`'s reorder, reimplemented rather than
      calling the shared `replaceSortOrder` helper directly (that helper assumes a column named
      `id`; this table's key column is `anak_usaha_id` — see `anakUsaha.repository.ts`'s
      `reorderProfiles`)
- [x] 3.4 Extend `apps/api/src/modules/anak-usaha/anakUsaha.mapper.ts` with `toAnakUsahaAdminResponse`
      (full shape incl. profile, active or not) and `toPublicAnakUsaha` (profile fields only when
      active), derived via `publicUrlFor` for the logo (mirrors `partner.mapper.ts`)
- [x] 3.5 Extend `apps/api/src/modules/anak-usaha/anakUsaha.controller.ts` and
      `anakUsaha.routes.ts`. Note: unlike partners, every anak usaha route already lives on one
      router mounted at `/anak-usaha` (not split `/admin/partners` + `/partners`), so the new
      routes are added there instead: `GET /anak-usaha/admin` (full admin listing incl. inactive
      profiles), `POST /anak-usaha/:id/profile`, `PATCH /anak-usaha/:id/profile`,
      `DELETE /anak-usaha/:id/profile`, `PUT /anak-usaha/profile/order` — all gated on
      `anak-usaha.manage`
- [x] 3.6 Update the existing public `GET /anak-usaha` handler to use `toPublicAnakUsaha` so
      entries with an active profile carry the extra fields and entries without one are unchanged
- [x] 3.7 Confirm deleting an anak usaha entry (existing `DELETE /anak-usaha/:id`) still works
      unchanged — the profile's cascading FK deletes it automatically, no service-level cleanup
      code needed; add a test asserting the profile row is gone afterward (see section 6)

## 4. Admin UI

- [x] 4.1 Add profile methods to a new `apps/admin/src/lib/anakUsahaApi.ts` (list-with-profile,
      create/update/delete profile, reorder) — do not extend the generic `taxonomyApi.ts`, which
      stays scoped to plain `{id, name, slug}` CRUD
- [x] 4.2 Build a new admin screen (`AnakUsahaPresentationPage.tsx`) mirroring `PartnersPage.tsx`:
      per-entry row showing name (read-only, from taxonomy), logo upload via `mediaApi` (optional
      — a "Clear logo" action sends an explicit `null`, distinct from "leave unchanged"), kind
      select (options read from `anakUsahaKindSchema.options`, not re-typed locally), description
      textarea, dynamic add/remove links list (label + URL, client-side http/https validation via
      the same `isHttpUrl` the server uses), active toggle, drag-to-reorder among entries that
      have a profile (entries without one render undraggable, below), delete-profile action with
      a confirm copy noting it only removes the public presentation
- [x] 4.3 Add a route and nav entry for the new screen: `/anak-usaha-presentation` in `App.tsx`
      (a flat path, not nested under `/anak-usaha` — `Sidebar.tsx`'s `NavLink` has no `end` prop,
      so a nested path would also highlight the plain taxonomy nav item), and a second nav entry
      under "Anak Perusahaan" in `Sidebar.tsx`, both gated on `anak-usaha.manage`

## 5. Web frontend

- [x] 5.1 Update the return type of the existing `getAnakUsahaList()` in `apps/web/lib/api.ts` to
      the extended public shape (no new function — `/news`'s filter already calls this and simply
      ignores the added optional fields); added `presentedAnakUsaha()` in a new
      `apps/web/lib/anakUsaha.ts` to narrow that shape down to what the Anak Usaha section renders
- [x] 5.2 Remove `SUB_BRANDS` and the `SubBrand`/`SubBrandLink` types from `apps/web/lib/content.tsx`
- [x] 5.3 Update `apps/web/app/page.tsx` to fetch anak usaha data via `getAnakUsahaList()`
      (mirroring the existing `getPartners().catch(() => [])` pattern), narrow via the new
      `presentedAnakUsaha()` helper (`apps/web/lib/anakUsaha.ts`), and pass the result into
      `AnakUsahaTiles` and `ConnectedPlatforms`. `layout.tsx` (for `SiteFooter`, rendered on every
      page) and `contact/page.tsx` each make the same call independently — Next.js's request
      memoization dedupes identical fetches within one request, so this is not N network round
      trips
- [x] 5.4 Update `AnakUsahaTiles.tsx` to accept the narrowed list as props, render logo via plain
      `<img>` (per `PartnerGrid.tsx:44` precedent — no `next/image` remote pattern configured;
      falls back to the brand name in text when a profile has no logo), drop the per-brand
      `tile`/`tileInk` background styling in favor of one fixed neutral background, return `null`
      when the list is empty (mirrors `PartnerGrid`'s empty-state rule)
- [x] 5.5 Update `ConnectedPlatforms.tsx` to receive the narrowed list as props and group by the
      now-typed `kind` enum instead of importing `SUB_BRANDS` directly; drop per-brand tile color;
      return `null` when empty
- [x] 5.6 Update `SiteFooter.tsx` to receive the narrowed list as a `brands` prop (fetched once in
      `layout.tsx`, which became an async component) instead of importing `SUB_BRANDS`; hide the
      "Anak Usaha" footer column entirely when the list is empty
- [x] 5.7 Update `apps/web/app/contact/page.tsx`'s sub-brand list to use the fetched, narrowed
      list; wire each entry's first link (if any) as the `href`, and render brands with no link as
      a plain non-interactive tag instead of the previous dead `href="#"`
- [x] 5.8 Deleted the now-unused static logo assets under `apps/web/public/`
      (`jakarta_siders.png`, `siders_culture.png`, `siders_vos.png`, `surabaya_siders.png`) —
      confirmed no remaining source references first

## 6. Verification

- [x] 6.1 Unit tests for each scenario in `specs/anak-usaha-presentation/spec.md`: profile CRUD,
      one-profile-per-entry, kind validation, link scheme validation, reorder, active/inactive
      filtering, and both delete directions — `anakUsaha.service.test.ts` (service-layer, 8 new
      cases) and `packages/contracts/src/anak-usaha.test.ts` (schema-layer, 23 cases); full
      workspace suite (API 519, admin 334, contracts incl. the new file, web 118) passes
- [x] 6.2 Checked `apps/web/components/news/NewsExplorer.test.tsx` and the rest of the web test
      suite — none import `SUB_BRANDS` or render tile colors, so nothing needed changing; full
      suite (118 tests) still passes against the widened `getAnakUsahaList()` return type
- [x] 6.3 Migration applied to the local dev database (`postgresql://localhost:5432/mydatabase`)
      and verified directly: `anak_usaha_profile` has the expected columns, its FK to `anak_usaha`
      is `ON DELETE CASCADE` and to `media` is `ON DELETE SET NULL`; a live cascade-delete test
      (insert anak_usaha + profile, delete the anak_usaha row, confirm the profile row is gone)
      passed, then rolled back
- [ ] 6.4 Manual check: create a profile for each of the four existing sub-brands (logo, kind,
      description, links) from the new admin screen, confirm the home page tiles, masthead logo
      row, footer, and Contact page all render them; deactivate one and confirm it disappears from
      all four surfaces; delete a profile and confirm the taxonomy entry and its article tags are
      unaffected; delete a taxonomy entry with a profile and confirm both are gone — **not run**:
      requires the admin, web, and API dev servers running together with a logged-in
      `anak-usaha.manage` account, same as `add-article-anak-usaha`'s equivalent task 5.3
