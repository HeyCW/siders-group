## Context

Per `docs/ARCHITECTURE.md` §4 and §8.1: the API is module-per-feature, Drizzle over Supabase Postgres in the `app` schema, and `/` is rendered by `apps/web` with ISR plus on-demand revalidation.

This change builds on three implemented-and-archived changes:

```
add-auth-foundation          authenticate + requirePermission, news.manage seeded
add-news-management-system   app.media, sanitizeHtml.ts, revalidate.ts
add-home-curation            revalidateHomePath, and the whole-list replacement
                             transaction pattern + lock ordering (reused verbatim)
```

The starting point is that **the platform has no video**. `packages/db/src/schema/media.ts` stores images; `media-management`'s spec rejects every non-image type by inspecting file content. The single existing "video" is a Tiptap node rendered as an inert link. So this change must decide what a reel *is* before it can decide how to order them.

## Goals / Non-Goals

**Goals:**
- Give editors an ordered reels rail without introducing a video pipeline.
- Accept third-party video references without ever creating an arbitrary-URL-into-a-frame sink.
- Keep third-party scripts off the initial homepage render.
- Degrade to something presentable when a provider post is deleted, made private, or the provider is down.

**Non-Goals:** see `proposal.md` — Non-Goals. In short: no hosted video, no rendering of `/`, no reels in article bodies, no link-rot poller, one rail only, no backfill, no analytics, no scheduling.

## Decisions

**A reel references a provider's video; it does not contain one.**

```
 SELF-HOSTED  (rejected, for now)          EXTERNAL REFERENCE  (chosen)
 ┌────────────────────────────┐          ┌────────────────────────────┐
 │ upload .mp4                │          │ paste provider URL         │
 │ probe duration/codec       │          │ parse → (provider, id)     │
 │ transcode ladder           │          │ store id + local poster    │
 │ generate poster frame      │          │                            │
 │ storage growth, CDN cost   │          │ provider hosts the bytes   │
 └────────────────────────────┘          └────────────────────────────┘
 media-management must widen              media-management unchanged
 to accept video/*                        (a poster is just an image)
 Weeks of work, new infra                 Days of work, no new infra
                                          Cost: we don't own the content
```

- Alternative considered: make a reel a kind of `app.articles` row. Rejected because a reel has no title, body, categories, or tags, and inheriting the article lifecycle would mean every reel drags an editor surface built for prose. The overlap is the *ordering*, not the entity — and the ordering is the part being reused here anyway.
- Alternative considered: self-hosting (widen `media-management` to accept `video/*`). Rejected **for this change**, not on the merits. It is a materially larger change — content-inspected video types, a size limit far above the 10 MiB image ceiling, duration limits, poster-frame extraction, and a transcode story — and none of it is needed to put an ordered rail on the homepage. Left as a clean future change because nothing here forecloses it: `provider` is an enum, and a self-hosted variant is a new value plus a nullable `media_id` for the video, not a redesign.
- Accepted trade-off: the content is not ours. It can vanish without notice, the provider decides what plays, and an embed carries the provider's tracking. The next three decisions are all consequences of accepting this.

**Provider identity, not URLs.** The API accepts a URL, but never stores one.

```
  POST /admin/reels
  { "url": "https://www.instagram.com/reel/AbC-123x/?igsh=tracking..." }
                     │
                     ▼
        parse against per-provider pattern
                     │
      ┌──────────────┴──────────────┐
      │ no pattern matches → reject │
      └──────────────┬──────────────┘
                     ▼
        provider = 'instagram'      ← enum, not free text
        externalId = 'AbC-123x'     ← [A-Za-z0-9_-]{5,32}, nothing else
                     │
                     ▼
        stored: (provider, external_id)      ← query params, tracking,
                NOT the submitted URL          and host are all discarded

  at render time, composed server-side:
        instagram → https://www.instagram.com/reel/<id>/embed
        tiktok    → https://www.tiktok.com/embed/v2/<id>
        youtube   → https://www.youtube.com/embed/<id>
```

This is the security-load-bearing decision. Storing the submitted URL and later interpolating it into an `iframe src`, an `<a href>`, or a redirect is precisely the "pass it through unchanged" behaviour `sanitizeHtml.ts` exists to prevent — and the file says so. Storing `(provider, externalId)` makes the embed URL *structurally* server-constructible: the host is a literal in our code, the id is constrained to a character class that cannot express a scheme, a host, a path traversal, or a quote. There is no escaping to get wrong, because caller text never reaches a frame `src` — only an id that has already been proven to match `^[A-Za-z0-9_-]{5,32}$` does.

- Alternative considered: store the URL and sanitize on the way out. Rejected — it moves the guarantee from "structurally impossible" to "we remembered to escape at every call site", and there will be more call sites later (admin preview, public API, OG tags, an eventual RSS feed).
- Consequence: adding a provider is a deliberate act — an enum value, a parse pattern, and an embed template, reviewed together. There is no configuration path that adds one at runtime.

**Two tables: the library and the ordering.**

```
  app.reels                              app.reels_curation
  ┌──────────────────────────┐           ┌──────────────────────────┐
  │ id            uuid PK    │◀───FK─────│ reel_id   uuid PK        │
  │ provider      enum       │  CASCADE  │ position  int UNIQUE     │
  │ external_id   text       │           │ created_at               │
  │ poster_media_id → media  │           └──────────────────────────┘
  │ caption       text       │            rewritten in full on
  │ status        enum       │            every save
  │ created_at / updated_at  │
  └──────────────────────────┘
   survives every reordering
   UNIQUE (provider, external_id)
```

Whole-list replacement deletes and reinserts every ordering row on each save. If the reel's content lived in that same table, each save would destroy and recreate the reels themselves — losing `created_at`, orphaning poster media, and making "removed from the rail" indistinguishable from "deleted". Splitting them keeps replacement cheap and non-destructive, and it exactly mirrors the `articles` / `home_curation` split already in `main`.

`UNIQUE (provider, external_id)` means the same source video cannot be added twice under two records, which would otherwise let it appear twice in one rail while passing the duplicate-id check.

**Writes replace the whole ordering, and reuse the lock ordering `add-home-curation` paid for.**

```
PUT /admin/reels-curation
{ "reelIds": ["…a", "…b", "…c"] }        ← the client never sends a position
                                          ← a sibling of /admin/reels, not nested under it
                                            (see reels.routes.ts and tasks.md - 5.1)

  BEGIN
    SELECT id FROM app.reels WHERE id IN (a,b,c) FOR KEY SHARE   ← 1. row locks FIRST
    LOCK TABLE app.reels_curation IN EXCLUSIVE MODE              ← 2. table lock SECOND
    DELETE FROM app.reels_curation
    INSERT (reel_id, position) VALUES (a,0), (b,1), (c,2)
  COMMIT
      ↓
  revalidate "/"
```

Both halves of that ordering are inherited findings, not fresh caution. From `archive/2026-08-12-add-home-curation/design.md`, both verified empirically against live Postgres:

- **Without the table lock**, two overlapping replaces can both `DELETE` before either `INSERT`s — under READ COMMITTED a `DELETE` only removes rows visible to its own snapshot — and the second `INSERT` then collides on the `UNIQUE(position)` constraint, surfacing a `23505` as a 500 for a save that looked ordinary to the editor.
- **With the table lock taken first**, a concurrent hard-delete of *any* reel deadlocks (`40P01`): the delete holds the reel's row lock while waiting on `reels_curation`, and the replace holds `reels_curation` while waiting on the row. Taking `FOR KEY SHARE` on the submitted ids *before* the table lock removes the cycle, and doubles as the existence check.

Reels inherit this unchanged because they inherit the same shape: `UNIQUE(position)`, `ON DELETE CASCADE`, whole-list replacement. Re-deriving it would mean re-finding the same two bugs.

**A locally-stored poster is required, not optional.** The poster is an ordinary image in `app.media`, uploaded through the existing media endpoint — `media-management` needs no change to accept it.

```
   provider up          provider down / post deleted / user opts out of tracking
   ┌──────────┐         ┌──────────┐
   │  poster  │         │  poster  │   ← still ours, still renders
   │  + play  │         │  + link  │
   └──────────┘         └──────────┘
   click → frame        rail keeps its shape, no dead grey box
```

Requiring it is what makes every failure mode presentable. It is also what makes the facade below possible, since a facade with no image is just an empty box.

**Facade rendering: poster first, frame only on user activation.**

```
  initial homepage render          after the user clicks play
  ┌───────────────────────┐        ┌───────────────────────┐
  │ <img poster>          │        │ <iframe src=…/embed>  │
  │ <button>play</button> │  ───▶  │                       │
  └───────────────────────┘        └───────────────────────┘
  zero third-party JS               provider's player, one reel only
  zero third-party cookies
```

A rail of six auto-loaded provider embeds would put six third-party frames and their scripts on the most-visited page of the site, hand every anonymous visitor to the providers on load, and regress the ISR-rendered `/`. The facade keeps the initial render entirely first-party. This is the client-side upgrade `sanitizeHtml.ts` explicitly permits — and it happens in `apps/web`, at render time, not in stored data.

- Note: the *rule* is specified here and in the spec; the *implementation* is a non-goal of this change, which stops at the API and admin. The rule is recorded now so the follow-up that renders `/` inherits it rather than reaching for the providers' copy-paste embed snippets.

**Link rot is a status, not an exception.** `status` is `draft | published | unavailable`.

```
  draft        editor is still assembling it        → not public
  published    live                                 → public
  unavailable  source post deleted / private / DMCA → not public, stays in the rail
```

`unavailable` exists because we do not own the content, which is the one way this differs fundamentally from articles. Marking a reel unavailable takes it out of public output **without touching the ordering** — the editor fixes the broken thing rather than also re-saving the rail. The stored ordering row survives, so restoring the reel restores its position.

- Alternative considered: delete the reel when its source dies. Rejected — it destroys the poster, the caption, and the position for something that is often temporary (a private account going public again), and it makes the rail silently shrink instead of showing an editor what needs attention.
- Non-goal restated: nothing detects this automatically. A poller against three providers' rate limits is its own change.

**No chronological backfill — an unlike-the-homepage decision.** `home-curation` backfills the homepage feed with recent articles so it can never go sparse. The reels rail does not.

The homepage has hundreds of articles to fall back on and a feed that must fill a page. The reels library is small, hand-made, and entirely editorial — "the most recently added reel" carries no editorial signal, so backfilling would put an arbitrary reel on the front page precisely when nobody had chosen one. An empty ordering yields no rail at all, which is both predictable and correct: a rail with nothing in it should not appear.

**Permission: `news.manage`, and no new row.** Follows `home-curation`'s precedent exactly — deciding the front page is part of the news-editing job. Revisit alongside curation's own note, if authors who must not touch the front page are ever hired.

## Risks / Trade-offs

- **We do not own the content.** Accepted deliberately; `unavailable` + the required poster are the mitigations, and neither is automatic.
- **Provider embed URLs are undocumented surface.** They change. Because they are composed in one server-side template per provider, a change is a one-line fix rather than a data migration — which is itself part of why ids are stored instead of URLs.
- **Rail order is last-write-wins across editors,** exactly as curation already is. Consistent with the accepted trade-off in `add-home-curation`; a shared rail is a place where a clean overwrite beats a silent partial merge.
- **The provider allowlist is a bottleneck by design.** Adding one requires code review. Stated as a feature: it is the mechanism preventing arbitrary hosts from reaching a frame.

## Open Questions

- Which providers ship in the first cut? `tasks.md` assumes Instagram, TikTok, and YouTube Shorts. Dropping one is deleting an enum value, a pattern, and a template.
- Maximum rail length is set at 10, mirroring `home-curation` rather than from a design for the rail. A typical reels strip shows 6-8; if the rendered design lands on a different number, this cap is one contract constant.
