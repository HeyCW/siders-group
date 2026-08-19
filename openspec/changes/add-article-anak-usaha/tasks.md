## 1. Data model

- [x] 1.1 Add `anak_usaha` table to `packages/db/src/schema/anakUsaha.ts` (uuid PK, `name`, unique
      `slug`, `createdAt`) — mirrors `categories`/`tags` in `taxonomy.ts`
- [x] 1.2 Add nullable `anak_usaha_id` column to `articles` table, FK to `anak_usaha.id`,
      `onDelete: 'set null'` (same pattern as `featuredMediaId`), with an index; export the new
      table from `packages/db/src/schema/index.ts`
- [x] 1.3 Add `anak-usaha.manage` to `PERMISSION_KEYS` in `packages/contracts/src/permission.ts`
- [x] 1.4 Generate migration via `pnpm --filter db db:generate`
- [x] 1.5 Hand-edit the generated migration to add: the permission catalog INSERT (+ Owner grant),
      matching the style of `supabase/migrations/0006_rare_reptil.sql` /
      `0007_wandering_omega_flight.sql`; and a seed INSERT for the four existing sub-brands
      (Siders Culture, Jakarta Siders, Surabaya Siders, SidersVox — names/slugs matching
      `SUB_BRANDS` in `apps/web/lib/content.tsx`)

## 2. Contracts

- [x] 2.1 Add `packages/contracts/src/anak-usaha.ts`: `anakUsahaCreateRequestSchema`,
      `anakUsahaUpdateRequestSchema` (both `{ name }`, mirroring `category.ts`), and
      `anakUsahaResponseSchema` (`{ id, name, slug }`)
- [x] 2.2 Add `anakUsahaId: z.string().uuid().nullable().optional()` to
      `articleWriteFieldsSchema` and `articleAutosaveRequestSchema` in
      `packages/contracts/src/article.ts`
- [x] 2.3 Add `anakUsaha: anakUsahaResponseSchema.nullable()` to `articleAdminResponseSchema`
- [x] 2.4 Export the new schemas from the contracts package entry point

## 3. API

- [x] 3.1 New `apps/api/src/modules/anak-usaha/` module — repository, service (slugify + conflict
      + not-found handling), controller, routes — copying
      `apps/api/src/modules/categories/category.*.ts` structure exactly
- [x] 3.2 Mount routes in `apps/api/src/server.ts`: `GET /` public, `POST|PATCH|DELETE`
      gated on `anak-usaha.manage`
- [x] 3.3 Update the articles module's create/update/autosave handlers to accept and persist
      `anakUsahaId`
- [x] 3.4 Update the articles module's read/mapper to resolve and include `anakUsaha` (id + name +
      slug, or `null`) on the admin response

## 4. Admin UI

- [x] 4.1 Add `anakUsahaApi` to `apps/admin/src/lib/taxonomyApi.ts`, same shape as
      `categoriesApi`/`tagsApi`
- [x] 4.2 Add `/anak-usaha` route in `App.tsx` using `TaxonomyManagementPage` (title "Anak
      Perusahaan", `singularLabel` "anak perusahaan", `api={anakUsahaApi}`)
- [x] 4.3 Add nav entry in `Sidebar.tsx` under "Content", gated on `anak-usaha.manage`
- [x] 4.4 Add single-select "Anak Perusahaan" field to the metadata sidebar in
      `ArticleEditPage.tsx`, including a "None" option, wired through the existing
      `patchForm`/save path used by Categories/Tags/Excerpt

## 5. Verification

- [x] 5.1 Unit tests covering each scenario in `specs/anak-usaha-management/spec.md`
      (`anakUsaha.service.test.ts`; article create/update/autosave paths already covered by the
      existing `article.service.test.ts` fixtures, updated for the new field)
- [x] 5.2 Migration applies cleanly against the current schema, seeds exactly four catalog rows
      and grants the new permission to Owner — verified against the local dev database
      (`postgresql://localhost:5432/mydatabase`): `anak-usaha.manage` present and granted to
      Owner, `anak_usaha` seeded with exactly the 4 sub-brands, `articles.anak_usaha_id` column
      exists
- [ ] 5.3 Manual check: manage the anak usaha catalog (create/rename/delete) from
      `/anak-usaha`, assign one to an article, reload and confirm it persists, then clear it and
      confirm it saves as `null` — **not run**: requires the migration in 5.2 applied and the app
      running against a real database
