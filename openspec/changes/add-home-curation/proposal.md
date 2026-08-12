## Why

`docs/ARCHITECTURE.md` §8.1 states that `/` is rendered with ISR plus on-demand revalidation so that "editors publish curation and see it within seconds" — but no curation capability is specified anywhere in the project. `apps/web/app/page.tsx` is still a stub, and without this change the homepage can only ever be reverse-chronological: whatever published most recently sits at the top, with no editorial control over what leads.

`add-news-management-system/design.md` already anticipated this work by name — it refers to "the homepage curation change (`home-curation`)" and added the `excludeIds` parameter to the public list endpoint specifically so a composed homepage would not repeat an article it had already placed in a curated slot. That consumer was never written. This change writes it.

## What Changes

- Add `app.home_curation`: a single, global, ordered list of articles that lead the homepage. `article_id` is the primary key (an article cannot occupy two positions) and carries `ON DELETE CASCADE` to `app.articles`, so hard-deleting an article removes its pick automatically.
- Add an admin read endpoint and a **whole-list replacement** write endpoint. The client submits an ordered array of article ids; the server assigns positions from the array index inside one transaction. There is no per-position endpoint and no reorder endpoint.
- Gate both admin endpoints on the existing `news.manage` permission. **No new permission catalog row is added and no migration seeds one** — deciding the front page is treated as part of the news-editing job.
- Allow curation to reference articles that are not currently publicly visible (drafts, and articles scheduled for the future). Such picks are simply absent from public output until they become visible, which makes pre-building a front page for a scheduled story work with no additional machinery. The admin read endpoint reports each pick's status so an editor can see which ones are not yet live.
- Add a **composed** public endpoint that returns the homepage feed as a single ordered array: the visible curated picks first, then the most recently published articles backfilling the remainder, with no article appearing twice. Composition happens server-side, not in the consumer.
- Reuse the canonical public visibility rule from `public-news-api` rather than re-deriving it, so a curated article that is `scheduled` with `published_at <= now()` appears on the homepage exactly when it appears everywhere else.
- Revalidate `/` whenever the curated list is written. Article-lifecycle events that affect the homepage (publish, unpublish, delete, scheduled promotion) already revalidate `/` under `add-news-management-system`; this change adds no new revalidation paths beyond the curation write itself.
- Add an admin curation screen: a drag-and-drop ordered list with an article picker, a not-yet-live badge per pick, and a single save that submits the resulting order.
- **BREAKING**: none. All additions.

## Non-Goals

- **Rendering the homepage.** `apps/web/app/page.tsx` is untouched. This change ships the table, the endpoints, and the admin screen; consuming the composed endpoint belongs to the same follow-up that renders `/news` (see `apps/web/app/news/page.tsx`, which defers itself to `add-web-news-pages`).
- **Curation of any surface other than the homepage.** No category-page highlights, no sidebar collections, no named reusable lists. There is exactly one curated list and it has no scope key.
- **Named layout slots.** The stored list carries order only. That the first entry renders as a hero is a decision that lives in `apps/web`, so a homepage redesign costs CSS rather than a migration and a contract change.
- **Scheduled curation.** There is no way to say "make this the lead at 9am Monday" as a property of the curated list. The equivalent is achieved by curating an article that is itself scheduled for that time.
- **A separate `curation.manage` permission.** Reconsider if authors who must not touch the front page are ever hired.

## Capabilities

### New Capabilities

- `home-curation`: the curated homepage list — its data model, the permission-gated admin read and whole-list replacement endpoints, validation rules, the composed public homepage endpoint with chronological backfill, its interaction with the article lifecycle, and revalidation of `/`.

### Modified Capabilities

_None._ The composed public endpoint is specified as part of `home-curation` rather than as a delta on `public-news-api`, because `public-news-api` does not yet exist in `openspec/specs/` — `add-news-management-system` is specified but unarchived and unimplemented. This change consumes that capability's canonical visibility rule and list query layer; it does not alter them.

## Impact

- **Affected code**: `packages/db` (new `home_curation` table + migration), `packages/contracts` (curation request/response Zod schemas), `apps/api/src/modules/curation/**` (new: routes, controller, service, repository, mapper), `apps/api/src/lib/revalidate.ts` (a `/` call on curation write — the module itself is created by `add-news-management-system`), `apps/admin` (curation screen). `apps/web` is not modified.
- **Dependencies**: this change is **stacked behind `add-news-management-system`**, which is currently specified with 0 of 90 tasks implemented. `app.articles` must exist before the FK can be declared, and the public list query layer must exist before the composed endpoint can reuse it. The specs here can be reviewed and approved now; implementation cannot start until the news system lands.
- **Docs**: none required. `docs/ARCHITECTURE.md` §8.1 already describes `/` as ISR with on-demand revalidation, which this change satisfies rather than changes.
- **Reconciliation needed**: `add-news-management-system/design.md` justifies `excludeIds` by saying the homepage curation change "fills uncurated slots from this endpoint", i.e. that the consumer composes. This change composes server-side instead (see `design.md` — "Composition happens in the API"). The parameter is still required and still used, but by the API's own composed endpoint rather than by `apps/web`. That rationale sentence should be reworded when `add-news-management-system` is next updated; it is not edited here, because rewriting another in-flight change's design from this proposal would leave two changes disagreeing about who owns the decision.
- **Migration**: one new table. No existing data affected, no permission rows seeded, no backfill. Rollback is dropping `app.home_curation` and the module's route registrations.
