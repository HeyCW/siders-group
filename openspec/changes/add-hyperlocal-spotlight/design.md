## Context

`home_curation` (`packages/db/src/schema/homeCuration.ts`) is a join table keyed by `article_id`
with a unique `position`, written through `replaceOrdering.ts`'s delete-and-reinsert helper and
capped at `MAX_HOME_CURATION_ENTRIES = 10` in `packages/contracts/src/curation.ts`. Its public
read, `homeFeed.service.ts`, filters invisible picks with `isPubliclyVisible`, preserves stored
order at the head of the feed, and backfills chronologically to the requested limit.

Every admin article route in `article.routes.ts` is already gated by
`requirePermission('news.manage')` — the same permission `curation.routes.ts` uses. So moving the
spotlight decision into the article editor changes no authorization question: an editor who can
save the article can already curate the front page.

`packages/contracts/src/article.ts` builds `articleCreateRequestSchema` and
`articleUpdateRequestSchema` from one `articleWriteFieldsSchema` (`.strict()`, and `.partial()`
for update), while `articleAutosaveRequestSchema` is a deliberately narrower hand-written schema
that "structurally cannot move the slug or the status even if a client tried." That split is the
precedent this change follows for keeping the spotlight out of autosave.

## Goals / Non-Goals

**Goals:**
- Make "at most one spotlighted article" structurally true, not validated in one code path.
- Put the decision in the article editor, where the editorial judgement is already happening.
- Reuse the existing visibility rule (`isPubliclyVisible`) and the `news.manage` permission
  unchanged.
- Keep an unset slot a first-class, ordinary state: the section falls back to the newest published
  article rather than disappearing, so the home page never shows a hole.

**Non-Goals:**
- Any notion of locality (city, region, coordinates, geo tags). The slot is global and the article
  carries no locality field.
- Scheduling, expiry, or rotation of the spotlight. It changes when an editor changes it.
- History of past spotlights. The slot stores the current pick only.
- De-duplication against `home-curation` or the chronological feed.

## Decisions

### The checkbox is UI over a singleton slot, not a boolean column on `articles`

This is the central decision, because the checkbox makes `articles.is_hyperlocal_spotlight BOOLEAN`
look like the obvious implementation. It is the wrong one: nothing in the column prevents two rows
from carrying `true`, so "exactly one" would depend on every write path remembering to clear the
previous holder — and a single missed path (an import, a backfill, a future bulk edit) silently
breaks the invariant with no error.

Instead, `hyperlocal_spotlight` is its own table with a `slot` primary key whose only permitted
value is the constant `'default'`, alongside a **nullable** `article_id`, `updated_at`, and
`updated_by`. A second row is rejected by the primary key. The checkbox in the editor reads and writes *that* slot; the
article row itself is unchanged. This is the same reasoning that made `article_id` the primary key
of `home_curation` so a duplicate pick is "structurally impossible instead of merely validated."

The API still presents the field *as if* it were an article property —
`isHyperlocalSpotlight: boolean` on the article response and on the create/update requests — so the
editor stays a plain checkbox and no client has to know about a second resource. Only the service
layer knows it writes a different table.

*Alternatives rejected:* a boolean column on `articles` (above); reusing `home_curation` with a
`section` discriminator (a single ten-entry replacement write could still wipe the spotlight); a
standalone `PUT /admin/hyperlocal-spotlight` as the primary write (a second write surface for one
decision, and not what the editor asked for).

### Exactly one row, forever; `article_id NULL` means "newest article"

The row is created once by the migration and never inserted or deleted again. Every spotlight
write is a plain `UPDATE` of that single row: set `article_id` to an article id to pick, set it to
`NULL` to release. There is no upsert, no insert-or-update branch, no delete path — "is there a row
yet?" is never a question any code has to answer, and the invariant "at most one spotlight" holds
by the table's shape rather than by any write being careful.

`NULL` is the release state and resolves to the fallback on the very next read, with nothing else
to clean up.

(If the row is somehow absent — a database restored without the seed — reads treat that exactly as
`NULL` rather than erroring, so a missing seed degrades to the fallback instead of breaking the
home page.)

### An unset slot means "newest article", resolved at read time

The spotlight has two layers: an optional explicit pick (`article_id` on the slot row) and an
automatic fallback (the newest publicly visible article). A read resolves the explicit pick when `article_id` is
non-null and that article is publicly visible; otherwise it resolves the fallback. The section is blank only when the site
has no publicly visible article at all.

The fallback is **computed on read, never written into the slot**. Writing "the newest article at
the time of the uncheck" into the slot would freeze it: the next article to publish would not take
over, and the section would quietly drift into showing an old story that no editor chose. Reading
it live keeps it current, and keeps one meaning for a row in the slot — *an editor picked this* —
rather than two indistinguishable ones.

"Newest" reuses the ordering the home feed already backfills with: `listPublished` on
`ArticleRepository`, newest `published_at` first, through the same canonical visibility predicate
as every other public read. No second definition of "newest" and no second visibility rule.

This also covers the cases that would otherwise need their own handling: the explicit pick is a
draft or a future-scheduled article, the pick was unpublished, the pick was hard-deleted. In each,
the read simply falls through to the fallback, and the pick — where it still exists — takes over
again the moment it becomes publicly visible.

*Alternative rejected:* persisting the fallback on uncheck (above — it goes stale, and it makes an
automatic pick indistinguishable from an editorial one in storage).

### Checking the box is a move, not an add

Saving an article with the box checked replaces whatever the slot held. The previous holder is not
touched in any other way — not unpublished, not removed from `home_curation`, not flagged. Because
this silently demotes another article, the editor shows the current holder next to the checkbox
before the save, so taking the spotlight is a visible choice rather than a discovery.

Unchecking the box on the article that currently holds the slot sets `article_id` to `NULL`, and
the spotlight falls back to the newest published article on the next read. Unchecking on an article that does not hold
it is a no-op, not an error — otherwise every ordinary save of every other article would fail.

### One transaction with the article save

The slot write happens inside the same transaction as the article insert/update. A validation
failure on the article body must not move the spotlight, and a slot write that fails must not
leave a half-saved article. On create, the slot row is written after the article insert within
that transaction, since the article id does not exist before it.

### Autosave cannot touch the spotlight

`articleAutosaveRequestSchema` does not gain the field. Autosave fires on a debounce while the
editor types; a spotlight move is an editorial decision that should happen on an explicit save,
once, not repeatedly as a side effect of typing. This mirrors the existing reasoning that keeps
slug and status out of autosave.

### Public read is a separate endpoint, not a field on the home feed

`GET /home/hyperlocal-spotlight` is its own public, rate-limited read returning
`{ "article": ArticlePublicCard | null, "isEditorPick": boolean }` — resolved pick plus whether an
editor chose it or it came from the fallback. Folding it into `GET /home` would make the feed's
limit/backfill arithmetic answer two questions at once, and would force every feed consumer to
care about a section it may not render. The cost is one extra request from the home page, paid in
parallel with the guide-pick and partner reads it already issues.

### Article deletion nulls the pick — `SET NULL`, not `CASCADE`

`article_id` references `articles.id` with `ON DELETE SET NULL`. This is where the singleton row
and `home_curation` deliberately part ways: `home_curation` is a join table whose rows *are* the
picks, so `ON DELETE CASCADE` correctly removes one. Here the row is the slot itself and must
outlive any article, so a cascade would be wrong — it would delete the slot row, reintroducing the
"does the row exist?" question this design just removed. `SET NULL` leaves the row in place holding
`NULL`, which is already the release state, so hard-deleting the spotlighted article hands the
spotlight to the newest published article on the next read with no compensating write.

### Independence from the curated feed is deliberate

The spotlighted article may also appear in the curated list or the chronological backfill, and
neither read excludes the other. Silent cross-filtering would make the home feed's contents depend
on an unrelated section's state, and an editor who wants no repetition can simply not curate the
same article twice. Spec'd explicitly so a later reviewer does not "fix" it as a bug.
