## Why

Readers arriving on the home page get a chronological news feed plus a ten-entry curated list —
nothing tells them which single hyperlocal story the newsroom wants them to read today. The
editorial team wants one deliberate, unmissable pick: a "Hyperlocal" spotlight that holds exactly
one article at a time and reads as a decision, not a ranking.

The pick is made where the editorial decision is already being made — in the article editor, as a
checkbox on the article being written — rather than on a separate curation screen visited after
the fact.

`home-curation` cannot carry this. Its write endpoint is a whole-list replacement capped at ten
entries with no minimum, and a "list of one" would be enforced nowhere — the next editor to save
a ten-article order would silently destroy the spotlight. A one-article slot needs its own
storage, so "exactly one" is structural rather than a convention.

## What Changes

- A new `hyperlocal-spotlight` capability: one global slot holding zero or one article. The slot
  is stored separately from `articles`, so holding two spotlighted articles is impossible by the
  data model rather than by validation.
- The article create and edit forms gain a **"Spotlight as hyperlocal story"** checkbox. Checking
  it and saving puts that article in the slot; unchecking it and saving empties the slot.
- Checking the box on one article **releases it from whichever article held it before** — the
  previous holder is not deleted, unpublished, or otherwise altered, it simply stops being
  spotlighted. The editor shows which article currently holds the spotlight before the save, so
  taking it is never a surprise.
- **The spotlight is never blank.** With no explicit pick — never set, unchecked, deleted, or
  holding an article that is not publicly visible — the section falls back to the newest published
  article, resolved at read time from the same newest-first ordering the home feed's chronological
  backfill already uses. The fallback is not stored, so it stays current as articles publish
  instead of freezing whichever article was newest at the moment of the uncheck.
- Unchecking the box on the article holding the spotlight therefore hands the spotlight to the
  newest published article rather than emptying the section.
- The spotlight rides the existing article write endpoints (`POST /admin/articles`,
  `PATCH /admin/articles/:id`), which already require `news.manage` — the same permission
  `home-curation` uses. No new permission catalog entry, and no separate spotlight write endpoint.
- The spotlight change and the article save are one transaction: a rejected article save never
  moves the spotlight, and a failed spotlight write never half-saves the article.
- Autosave deliberately cannot touch the spotlight, matching the existing narrower autosave schema
  that structurally cannot change an article's slug or status.
- Any article status may be spotlighted, including `draft` and `scheduled`. An invisible pick is
  held as the explicit pick but shows nothing publicly until it becomes publicly visible — the
  fallback covers the section meanwhile — and it takes over at its scheduled time with no second
  editorial action.
- A small admin read (`GET /admin/hyperlocal-spotlight`) tells the editor which article is
  currently spotlighted **and whether that is an explicit pick or the automatic newest-article
  fallback**, so the checkbox can say what it would displace. There is no admin write endpoint.
- Public read (`GET /home/hyperlocal-spotlight`) serves the spotlighted article as a public card —
  the explicit pick when it is publicly visible, otherwise the newest published article — and
  reports no article only when the site has no publicly visible article at all.
- The public home page gains a Hyperlocal section above the existing showcase, rendering nothing
  at all only in that no-published-articles case.
- Locality is **not** modeled: no city, region, or geo field is added anywhere. "Hyperlocal" is
  the section's editorial identity, and the pick is any article the newsroom judges to fit.
- The spotlight is deliberately independent of the curated home feed: the same article may occupy
  both, and neither read filters the other.
- **BREAKING**: none.

## Impact

- **Affected specs**: hyperlocal-spotlight (new capability), article-management (the article write
  shape gains one field; autosave explicitly excluded)
- **Affected code**: `packages/db/src/schema/hyperlocalSpotlight.ts` (new),
  `packages/db/src/schema/index.ts`, `packages/contracts/src/article.ts`,
  `packages/contracts/src/hyperlocalSpotlight.ts` (new), `packages/contracts/src/index.ts`,
  `apps/api/src/modules/articles/article.service.ts`,
  `apps/api/src/modules/articles/article.repository.ts`,
  `apps/api/src/modules/articles/article.mapper.ts`,
  `apps/api/src/modules/hyperlocalSpotlight/*` (new, read + repository only),
  `apps/api/src/server.ts`, `apps/admin/src/pages/ArticleEditPage.tsx`,
  `apps/admin/src/pages/NewArticlePage.tsx`, `apps/admin/src/lib/articlesApi.ts`,
  `apps/web/src/components/home/HyperlocalSpotlight.tsx` (new),
  `apps/web/src/pages/HomePage.tsx`, `apps/web/src/lib/api.ts`
- **Migration**: additive — one new `hyperlocal_spotlight` table with a single-value primary key
  and an `ON DELETE CASCADE` article reference. No backfill, no existing table touched, no data
  loss. Follows the applied migration path in `apps/api-laravel/database/migrations/`.
