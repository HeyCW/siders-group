## Why

Siders publishes under four sub-brands (Siders Culture, Jakarta Siders, Surabaya Siders,
SidersVox — see `apps/web/lib/content.tsx`'s `SUB_BRANDS`), but an article carries no record of
which one it belongs to. Editors currently have no way to tag an article with its owning
sub-brand, so nothing downstream (admin filtering, future public sectioning) can key off it.

## What Changes

- Add an `anak_usaha` catalog table (id, name, unique slug), seeded with the four existing
  sub-brands, each with a name and slug.
- Add a nullable `anak_usaha_id` foreign key on `articles`: one anak usaha has many articles, one
  article has at most one anak usaha (one-to-many, not the many-to-many pattern used for
  categories/tags).
- Add full admin CRUD for the anak usaha catalog (create, rename, delete, list) — same shape and
  screen as Categories/Tags (`TaxonomyManagementPage`) — reachable at `/anak-usaha` and gated on a
  new `anak-usaha.manage` permission for writes; listing is public, matching categories/tags (it
  is reference data needed to render both the admin select and, potentially, public filters).
- Add a single-select "Anak Perusahaan" field to the article edit page's metadata sidebar
  (`apps/admin/src/pages/ArticleEditPage.tsx`), alongside Categories/Tags.
- Article create/update/autosave requests accept an optional `anakUsahaId` (nullable, to allow
  clearing); the admin article response includes the resolved anak usaha (id + name), or `null`.

## Impact

- **Affected specs**: `anak-usaha-management` (new), `rbac-management` (MODIFIED — adds anak usaha
  management to the fixed permission catalog)
- **Affected code**:
  - `packages/db/src/schema/` (new `anakUsaha` table, `articles.anakUsahaId` column)
  - `supabase/migrations/` (new migration: table, column, permission catalog row + Owner grant,
    seed of the 4 known sub-brands)
  - `packages/contracts/src/` (new `anak-usaha.ts` contract; `permission.ts` gains
    `anak-usaha.manage`; `article.ts` write/response schemas gain `anakUsahaId`/`anakUsaha`)
  - `apps/api/src/modules/anak-usaha/` (new module: repository, service, controller, routes —
    mirrors `modules/categories/`)
  - `apps/api/src/modules/articles/` (resolves/persists `anakUsahaId`)
  - `apps/admin/src/pages/ArticleEditPage.tsx` (new sidebar field)
  - `apps/admin/src/App.tsx`, `apps/admin/src/components/Sidebar.tsx` (new `/anak-usaha` route
    and nav entry)
  - `apps/admin/src/lib/taxonomyApi.ts` (new `anakUsahaApi`)
- **Migration**: required — new table, new nullable FK column, new permission catalog row granted
  to Owner, seed data for the 4 existing sub-brands (matched by name to `SUB_BRANDS` in
  `apps/web/lib/content.tsx`)
