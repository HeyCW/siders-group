## Context

Per `docs/ARCHITECTURE.md` §4 and §8.1: the API is module-per-feature, Drizzle over Supabase Postgres in the `app` schema, and `/` is rendered by `apps/web` with ISR (60s) plus on-demand revalidation, explicitly so that "editors publish curation and see it within seconds". The curation that sentence assumes has never been specified.

This change builds directly on `add-news-management-system`, which is **implemented and archived** (`archive/2026-08-11-add-news-management-system/`). It relies on three things that change delivers, all present in `main` today:

```
app.articles                    the FK target and the thing being curated
public visibility rule          "scheduled && published_at <= now()  ⇒  published",
                                 expressed ONCE in the public read query layer
                                 (apps/api/src/modules/articles/article.repository.ts)
revalidate.ts                   the REVALIDATE_SECRET-protected webhook caller
                                 (apps/api/src/lib/revalidate.ts)
```

It also relies on `add-auth-foundation` (implemented and archived) for `authenticate` + `requirePermission`, and on the `news.manage` row already seeded by `0000_useful_red_shift.sql`.

## Goals / Non-Goals

**Goals:**
- Give editors ordered control over what leads the homepage, without letting the homepage ever go sparse.
- Make the stored representation survive homepage redesigns.
- Make the article lifecycle (unpublish, delete, schedule) self-heal the curated list rather than leaving it to break.
- Express public homepage composition once, server-side.

**Non-Goals:** see `proposal.md` — Non-Goals. In short: no rendering of `/`, no surface other than the homepage, no named slots, no scheduled curation, no separate permission.

## Decisions

**Order, not layout.** The table stores an ordered list of article ids and nothing about presentation. That the first entry renders as a hero, the next two as secondaries, and so on is a decision that lives entirely in `apps/web`.

```
   NAMED SLOTS  (rejected)                ORDERED LIST  (chosen)
 ┌─────────────────┐                    ┌─────────────────┐
 │      hero       │ ← column "hero"    │  0.   A         │
 ├────────┬────────┤                    │  1.   B         │
 │  sec1  │  sec2  │ ← named columns    │  2.   C         │
 ├───┬────┼────┬───┤                    │  …              │
 │ s │ s  │ s  │ s │                    └─────────────────┘
 └───┴────┴────┴───┘
 Layout is DATA                          Layout is PRESENTATION
 Redesign ⇒ migration + contract change  Redesign ⇒ CSS
```

- Alternative considered: named slot columns (`hero_article_id`, `secondary_1_article_id`, …). Rejected because the first homepage redesign that wants a 3-up hero instead of a 1-up becomes a schema migration and a breaking contract change, and because a fixed set of nullable slot columns makes "an empty slot" a state that has to be handled at every layer instead of simply being a shorter list.

**Writes replace the whole list; there is no reorder endpoint.** `PUT /admin/curation` accepts an ordered array of article ids. The server validates it, deletes every existing row, and inserts one row per id with `position` set to the array index — all in one transaction.

```
PUT /admin/curation
{ "articleIds": ["…a", "…b", "…c"] }          ← the client never sends a position

  BEGIN
    LOCK TABLE app.home_curation IN EXCLUSIVE MODE
    validate: ≤ 10 ids · no duplicates · every id exists
    DELETE FROM app.home_curation
    INSERT (article_id, position) VALUES (a,0), (b,1), (c,2)
  COMMIT
      ↓
  revalidate "/"
```

This is the central simplification. A `UNIQUE(position)` column with per-item "move up / move down" operations cannot swap two rows in two statements without transiently colliding, so every such API grows either a deferrable constraint or a shuffle through temporary positions. Whole-list replacement makes the constraint free instead of painful, makes the write idempotent, and matches what a drag-and-drop UI already has in hand — the complete resulting order.
- Alternative considered: `POST /admin/curation/:articleId` + `PATCH .../position` + `DELETE .../:articleId`. Rejected for the collision problem above, and because it turns one editorial act ("this is the front page now") into a sequence of requests that can half-apply.
- **The table lock is load-bearing, not defensive filler.** Without it, two overlapping `PUT`s can both execute their `DELETE` before either `INSERT`s — under READ COMMITTED, a `DELETE` only removes rows visible as of its own statement snapshot, so the second `DELETE` does not see the first transaction's not-yet-committed rows. The second `INSERT` then collides with the first's on `home_curation_pkey` or `home_curation_position_unique`, and an unhandled `23505` reaches the caller as a 500 for a request that, from the editor's side, looked identical to a normal save. `LOCK TABLE ... IN EXCLUSIVE MODE` as the transaction's first statement forces the second writer to wait for the first to commit, so its `DELETE` runs against a fresh snapshot that already includes the first writer's rows — the second write then cleanly and fully overwrites the first. Verified empirically against a live Postgres instance: without the lock, two concurrent replaces reliably produced a `23505`; with it, the second write always completed cleanly.
- Accepted trade-off: two editors saving concurrently is last-write-wins on the entire list, not a per-item merge — now genuinely delivered as a clean overwrite rather than as a 50/50 chance of a 500. Consistent with the last-write-wins autosave already accepted for articles, and a shared front page is a place where a silent partial merge would be worse than a clean overwrite.

**Curation may reference articles that are not publicly visible.** A draft or a future-scheduled article can be curated. It contributes nothing to public output until the canonical visibility rule says it is visible, at which point it appears in its curated position.

```
curated list:   [ A(published) , B(scheduled → Mon 09:00) , C(draft) ]

  before Monday 09:00        homepage head = [ A ]        ← B, C invisible
  after  Monday 09:00        homepage head = [ A , B ]    ← B appears in position 1
  when C is published        homepage head = [ A , B , C ]
```

This makes "pre-build Monday's front page" work with no scheduling machinery of its own — the article's own `published_at` drives it. The admin read endpoint returns each pick's status so the editor can see which picks are not yet live; the public endpoint simply omits them.
- Alternative considered: reject non-published articles at write time, so the stored list always equals what readers see. Rejected because it makes pre-scheduling a front page impossible, which is a real newsroom workflow given the system already has scheduled publishing — the editor would have to be awake at 09:00 to curate the story they scheduled.
- Accepted trade-off: the stored list is not a literal preview of the homepage. Mitigated by the admin endpoint reporting visibility per pick rather than leaving the editor to guess.

**Composition happens in the API, not in the consumer.** One public endpoint returns the assembled homepage feed:

```
GET /home?limit=12
   │
   ├─ curated picks, in stored order, filtered by the canonical visibility rule   → [A, B, C]
   │
   └─ public list query, excludeIds=[A,B,C], limit = 12 − 3                       → [D … L]
   │
   ▼
   [ A, B, C, D, … L ]        one ordered array of the public article DTO
```

`public-news-api` is emphatic that public visibility is expressed once and that "no consumer SHALL re-derive the published/scheduled predicate independently". Client-side composition would hand `apps/web` exactly that job: it would have to know that a curated pick might be invisible, drop it, and only then count how many backfill items to request. Server-side composition keeps that reasoning inside the query layer that owns it, and makes "exclusion is applied before the limit" — already a specced scenario on the list endpoint — an internal detail rather than a contract every consumer must honour.
- Alternative considered: the consumer fetches `/public/curation` and `/public/articles?excludeIds=…` and assembles them, which is what `add-news-management-system/design.md` assumed when it introduced `excludeIds`. Rejected on the re-derivation argument above. `excludeIds` is still required and still used — by this endpoint — so nothing about that parameter is wasted; only the sentence naming its consumer is now wrong. See `proposal.md` — Impact.
- The response does not mark which items were curated and which were backfilled. Readers are not meant to be able to tell, and `apps/web` renders by position regardless, so the flag would be a field with no reader.

**Backfill means the homepage is never sparse, and an empty list is valid.** With zero curated picks the endpoint returns a purely chronological feed, which is exactly the behaviour the site has today. There is no minimum pick count.
- Alternative considered: enforce a minimum so the front page is never accidentally bare. Rejected — backfill already guarantees a full page, so a minimum would only prevent editors from clearing the list, which is a legitimate act.

**Data model.** One new table in the `app` schema:

```sql
app.home_curation
  article_id  uuid PRIMARY KEY REFERENCES app.articles(id) ON DELETE CASCADE
  position    integer NOT NULL UNIQUE
  created_at  timestamptz NOT NULL DEFAULT now()
```

- `article_id` as the primary key is what makes duplicate picks structurally impossible rather than validated — the same reasoning `add-news-management-system` applied to server-generated media filenames.
- `ON DELETE CASCADE` matters specifically because articles are **hard**-deleted in this system: without it, deleting an article would leave a curated row pointing at nothing.
- `UNIQUE(position)` is a correctness guard, not a working constraint — whole-list replacement deletes before it inserts, so it is never contended.
- Positions are contiguous and zero-based, assigned from the submitted array index. Nothing reads a position's absolute value; the column exists only to make the stored order recoverable.
- RLS enabled with default deny, consistent with every other table in the `app` schema (`docs/ARCHITECTURE.md` §6.3).
- No `scope` column. The homepage-only decision means there is exactly one list, and adding a scope key "just in case" would create a second, unspecified state (rows with an unknown scope) that nothing validates.

**Authorization: `news.manage`, no new catalog row.**

| Surface | Permission |
|---|---|
| `GET /admin/curation` | `news.manage` |
| `PUT /admin/curation` | `news.manage` |
| `GET /home` | `requirePublic()` |

Mounted bare, not under a `/public` prefix — matching every other public read in this API (`/articles`, `/categories`, `/tags`), none of which carry one either.

Reusing `news.manage` treats "decide the front page" as part of the news-editing job. The permission catalog is fixed and seeded by migration only, so a dedicated `curation.manage` would require this change to be the first to seed a new catalog row — and every existing non-Owner role would then need an explicit grant to keep working.
- Alternative considered: a new `curation.manage`. It is the more correct newsroom model (the front-page editor is often not every author) and remains a clean follow-up: one migration inserting the row, one `requirePermission` argument changed, plus granting it to whichever roles should keep the ability. Deferred until there are staff for whom the distinction is real.

**Revalidation: one path, one trigger.** A curation write revalidates `/` and nothing else — no article's own page changed, and `/news` does not show curation.

Every *other* way the homepage head can change is already covered by `add-news-management-system`, which revalidates `/` on publish, unpublish, delete, and the scheduled-publish worker's promotion. So a curated article being unpublished, deleted, or promoted needs no new revalidation logic here.

| Event | Revalidates `/` via |
|---|---|
| Curated list saved | **this change** |
| Curated article published / unpublished / deleted | `add-news-management-system` |
| Scheduled curated article promoted by the worker | `add-news-management-system` |

As established there, a failed revalidation call is logged and does not fail the originating write; ISR's 60-second window is the backstop.

## Risks / Trade-offs

- **[Last-write-wins on a shared list]** → Two editors curating simultaneously silently overwrite each other, and unlike an article draft the front page is shared. Accepted; a version/etag precondition on `PUT` is a cheap follow-up if editors ever collide in practice.
- **[Curated list drifts out of sync with what readers see]** → An editor curates five articles, three of them drafts, and wonders why the homepage shows two. Mitigated by the admin endpoint reporting per-pick visibility and the admin screen badging not-yet-live picks; it cannot be eliminated without giving up pre-scheduling.
- **[Silent shrinkage]** → If a curated article is unpublished, the head silently gets shorter and backfill quietly covers it. This is the intended behaviour and is strictly better than a hole, but it means an editor is never *told* their pick fell off the front page. No notification system is in scope; the admin screen showing live status is the only signal.
- **[`excludeIds` rationale inaccurate in the archived record]** → `archive/2026-08-11-add-news-management-system/design.md` documents a client-side consumer that this change replaces with server-side composition. Archived changes are not edited after archiving, so the inaccuracy is left there; flagged in `proposal.md` — Impact, with this `design.md` as the authoritative description going forward.

## Build Order

`add-news-management-system` is implemented and merged into `main`; nothing here is blocked.

1. **Data model + contracts** — the table, RLS, the migration, and the Zod schemas. Everything queries against this.
2. **Admin read + write** — the module, whole-list replacement in a transaction, validation, and the `/` revalidation call. This is the whole editorial capability and is testable without any public surface.
3. **Composed public endpoint** — curated head filtered by the canonical visibility rule, then backfill via the existing list query with `excludeIds`. This is the end-to-end test of the composition invariants.
4. **Admin curation screen** — article picker, drag-and-drop reorder, not-yet-live badges, one save.

## Migration Plan

One net-new table, created after `app.articles` exists so the foreign key can be declared inline. No existing data is touched, no contracts change, and no permission rows are seeded — `news.manage` is already in the catalog and already granted to Owner by `0000_useful_red_shift.sql`.

Rollback is dropping `app.home_curation` and removing the module's route registrations. Because the table holds only editorial selections derived from articles that continue to exist, dropping it loses the current front-page arrangement and nothing else.
