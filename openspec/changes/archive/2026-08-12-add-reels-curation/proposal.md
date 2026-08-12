## Why

The system has no short-form vertical video. The only notion of "video" anywhere in it is a Tiptap `video` node inside an article body — `{ type: 'video', attrs: { src } }` — which `apps/api/src/lib/sanitizeHtml.ts` deliberately renders as a plain `<a>` link and never as a frame. `packages/db/src/schema/media.ts` stores images only, and `media-management`'s spec pins the accepted types to `image/jpeg`, `image/png`, `image/webp`, `image/gif`, and `image/avif`, rejecting everything else by content inspection. There is therefore nothing on the platform that a reels rail could be built from.

`home-curation` established the pattern for editorially ordering a public surface: one ordered list, whole-list replacement, gated on the existing `news.manage` permission, composed server-side. This change reuses that pattern for a second surface, and adds the thing being ordered.

The choice of *what a reel is* is the load-bearing decision here, and this change takes the narrow reading: **a reel is a reference to a video hosted by a recognized third-party provider, not a video this system stores.** That is not a shortcut around `media-management` — it is the path `sanitizeHtml.ts:129-134` already anticipated in writing:

> Video is rendered as a plain link, never an `<iframe>` — embedding an arbitrary third-party URL in a frame is exactly the kind of "pass it through unchanged" behavior the allowlist exists to prevent. **The public site is free to upgrade recognized providers to a real embed client-side; this layer only guarantees the stored HTML is inert on its own.**

The stance being protected is *stored HTML is inert*, not *never embed*. This change honours that stance exactly: nothing about a reel ever enters stored HTML, and the embed is constructed at render time from a validated provider identifier.

## What Changes

- Add `app.reels`: the reel library. Each row carries a `provider` (an enum over the recognized providers), an `external_id`, a required poster `media_id`, a caption, a `status`, and timestamps. The submitted URL is parsed at write time and **only the extracted provider and id are persisted** — no raw third-party URL is ever stored.
- Add `app.reels_curation`: a single, global, ordered list of reels. `reel_id` is the primary key (a reel cannot occupy two positions) with `ON DELETE CASCADE` to `app.reels`, mirroring `app.home_curation` exactly.
- Add admin CRUD endpoints for the reel library and an admin read plus **whole-list replacement** write endpoint for the ordering, gated on the existing `news.manage` permission. **No new permission catalog row is added and no migration seeds one** — deciding the reels rail is treated as part of the news-editing job, the same call `home-curation` made.
- Add a public endpoint returning the ordered, publicly visible reels. It carries `provider`, `externalId`, poster URL, and caption as **structured data**. It does not return HTML, an embed URL, or an iframe.
- Require a locally-stored poster image on every reel, reusing `media-management` unchanged (posters are ordinary images and are already an accepted type). Because the video itself is remote, the poster is the only asset this system controls, and it is what makes the rail degrade gracefully rather than break.
- Treat third-party link rot as a first-class state. A reel carries an `unavailable` status that staff can set when the source post is deleted or made private; the rail skips it without an editor having to also re-save the ordering.
- Revalidate `/` when the ordering is written or a reel's status changes.
- **BREAKING**: none. All additions. `sanitizeHtml.ts` is not modified and the Tiptap `video` node is untouched.

## Non-Goals

- **Hosting video.** No upload, no transcoding, no duration, no `mp4`. `media-management`'s image-only accepted-type list is unchanged, and this change adds no delta against it. Self-hosted reels remain a possible future change; this one deliberately does not open that door.
- **Rendering the rail.** `apps/web/app/page.tsx` is untouched, exactly as `home-curation` left `/` untouched. This change ships the tables, the endpoints, and the admin screen. Consuming them — including the facade-then-frame rendering described in `design.md` — belongs to the follow-up that renders `/`.
- **Reels inside article bodies.** `sanitizeHtml.ts` is not modified, and the article editor's `video` node keeps rendering as an inert link. A reel is a rail item, not a body block.
- **Automated link-rot detection.** No background poller checks whether a provider post still exists. The `unavailable` status is a manual lever; the required poster means an unnoticed dead reel degrades to a static image with a link rather than a broken frame.
- **More than one rail.** There is exactly one ordered reels list, applying to the homepage, with no scope key — the same restraint `home-curation` applied. No per-category reels, no sidebar variants.
- **Chronological backfill.** Unlike the homepage feed, a short reels list is not topped up from the library. See `design.md` — the reels library is small and editorial, and a rail that silently fills with whatever was added most recently is worse than a rail that is simply shorter.
- **Analytics.** No view counts, no play tracking, no per-reel engagement.
- **Scheduled reels.** No "publish this reel at 9am". Consistent with `home-curation`, which has no scheduled curation.

## Capabilities

### New Capabilities

- `reels-curation`: the reel library and the curated reels rail — the provider allowlist and URL normalization rules, the data model, the permission-gated admin surfaces, whole-list replacement semantics for the ordering, the required poster and graceful degradation, the structured public endpoint, and revalidation of `/`.

### Modified Capabilities

_None._ This change consumes `media-management` (poster storage), `authorization` (`requirePermission`), and the revalidation helper added by `add-news-management-system` without altering any of their specs. In particular, `media-management`'s accepted-type list is **not** widened — posters are images, which it already accepts.

## Impact

- **Affected code**: `packages/db` (new `reels` and `reels_curation` tables + migration), `packages/contracts` (reel and reels-curation Zod schemas, provider enum, URL parsing), `apps/api/src/modules/reels/**` (new: routes, controller, service, repository, mapper, provider parser), `apps/api/src/lib/revalidate.ts` (reuses the existing `revalidateHomePath` added by `add-home-curation`), `apps/admin` (reel library screen + rail ordering screen). `apps/web` and `apps/api/src/lib/sanitizeHtml.ts` are not modified.
- **Dependencies**: `add-home-curation` is implemented and archived (`archive/2026-08-12-add-home-curation/`), so `revalidateHomePath` and the whole-list-replacement transaction pattern — including the lock ordering it discovered empirically — exist in `main` today and are reused rather than rediscovered. `media-management` is implemented, so poster upload needs no new work.
- **Security**: the one genuinely new surface is accepting a third-party URL. It is mitigated structurally rather than by escaping: the URL is parsed against a per-provider pattern, only the extracted id is persisted, and the embed URL is composed server-side from `(provider, externalId)`. There is no code path in which caller-supplied text reaches a frame `src`. See `design.md` — "Provider identity, not URLs".
- **Privacy/performance**: the facade rendering rule keeps all third-party scripts and frames off the initial homepage load, so adding a reels rail does not hand every anonymous homepage visitor to Meta or ByteDance on page load, and does not regress the ISR-rendered `/` described in `docs/ARCHITECTURE.md` §8.1.
- **Docs**: none required.
- **Migration**: two new tables and one new enum. No existing data affected, no permission rows seeded, no backfill. Rollback is dropping `app.reels_curation`, `app.reels`, the provider enum, and the module's route registrations.
