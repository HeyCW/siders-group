## Table vs. enum for the "many" side

An `articleStatus`-style Postgres enum would be simpler than a table, but the four sub-brands
already carry display metadata elsewhere (`SUB_BRANDS` has `name`, `kind`, `tile` color, and a
`logo` path) and a real row can be referenced by id from the admin response the same way
`categories`/`tags` are, without re-deriving a label from a code. A table also leaves room for a
future management change to add/rename entries without a schema migration. Cost is one extra table
and a seed migration — small enough to prefer the more extensible option.

## One-to-many, not a join table

Categories and tags are many-to-many because an article can carry several of each
(`specs/category-management/spec.md` — "No single-category column SHALL exist on an article").
Anak usaha is different: the product intent (confirmed by the request) is that an article belongs
to at most one sub-brand. Modeling it as a nullable FK column on `articles` (same shape as
`featuredMediaId`) is both simpler and correctly expresses the cardinality — a join table would
under-constrain it and require an extra "at most one row" invariant that the column gives for
free.

## `onDelete: 'set null'`, not `restrict`

`featuredMediaId` uses `set null` because losing the image is tolerable (design.md of the news
system already established this). The same reasoning applies here: an anak usaha row is not
expected to be deleted while this change ships (no delete UI exists), but if one ever is, an
article should not become undeletable/unupdatable as a side effect — it should just lose its
sub-brand tag, the same degrade path as losing a featured image.

## Full CRUD, reusing the existing taxonomy screen

Initially scoped as seed-only (the four sub-brands are a fixed masthead —
`apps/web/lib/content.tsx`'s `MANIFESTO` copy: "Four properties, two cities, one masthead"), but
the request was adjusted to include management. `TaxonomyManagementPage` already implements
`{id, name, slug}` CRUD generically, driven by a `TaxonomyApi` prop
(`apps/admin/src/pages/TaxonomyManagementPage.tsx`) — Categories and Tags are both just that
component with a different API and label. Anak usaha is the same shape, so this reuses the
component and the category module's controller/service/repository/routes structure verbatim
rather than inventing a new pattern; the only new code is the `anak_usaha` table, its API module,
and the wiring (route, nav entry, `anakUsahaApi`).

## New permission vs. reusing `settings.manage`

Categories and tags each get their own catalog permission (`category.manage`, `tag.manage`)
rather than sharing `settings.manage`, because they are content-taxonomy CRUD that editorial
roles may hold independently of broad system settings. Anak usaha CRUD is the same kind of
capability — a content-classification catalog edited occasionally by editorial staff — so it
follows that precedent with its own `anak-usaha.manage` permission instead of `settings.manage`
(which partner-management uses, but partners are a site-settings directory, not content
taxonomy).

## Listing stays public, like categories/tags

Category and tag listing use `requirePublic()` "categories are reference data needed to render
public filters" — and, not incidentally, this is also what lets any authenticated staff member
populate a select in the article editor without needing the management permission themselves.
Anak usaha listing follows the same rule for the same reason: an author with `news.manage` but not
`anak-usaha.manage` still needs to see the options to tag their article.
