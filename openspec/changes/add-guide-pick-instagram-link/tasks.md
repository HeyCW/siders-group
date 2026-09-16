## 1. Data model

- [x] 1.1 Add nullable `instagram_url` (`varchar`) column to `guidePicks` in
      `packages/db/src/schema/guidePicks.ts`
- [x] 1.2 Generate the migration (`pnpm --filter @siders/db db:generate`) and review the emitted SQL —
      `drizzle-kit generate` fails in this environment on a pre-existing, unrelated bug (it cannot
      resolve this repo's `.js`-extension imports of `.ts` schema files; reproduces identically on
      `main`). The `db/migrations/` drizzle migrations are already stale versus the real schema (they
      never picked up the earlier `photo_media_id` nullable change either), so the actual applied
      migration path for this table is `apps/api-laravel/database/migrations/`. Added
      `2026_09_16_100001_add_guide_pick_instagram_url.php` there instead, following the same
      `->nullable()` convention as `2026_08_31_110001_make_guide_pick_photo_optional.php`.

## 2. Contracts

- [x] 2.1 Export a reusable `instagramUrlSchema` (or reuse `isHttpUrl` directly) in
      `packages/contracts/src/guidePick.ts`, matching `partner.ts`'s `websiteUrlSchema` shape:
      `.url().refine(isHttpUrl).nullable().optional()`
- [x] 2.2 Add `instagramUrl` to `guidePickCreateRequestSchema` and `guidePickUpdateRequestSchema`
- [x] 2.3 Add `instagramUrl: z.string().nullable()` to `guidePickResponseSchema`
- [x] 2.4 Add `instagramUrl: z.string().nullable()` to `publicGuidePickSchema`
- [x] 2.5 Unit tests for the new schemas: valid http(s) URL accepted, `javascript:`/`data:`
      rejected, absent field valid, explicit `null` valid on update

## 3. API

- [x] 3.1 Add `instagramUrl` to `CreateGuidePickInput`/`UpdateGuidePickInput` and the insert/update
      calls in `guidePick.repository.ts` (plain nullable column write — no join, no media
      reference, no kind validation)
- [x] 3.2 Add `instagramUrl` to `GuidePickRow` and `SELECT_COLUMNS`
- [x] 3.3 Map `instagramUrl` straight through (no derived URL, unlike `photoUrl`/`videoUrl`) in
      `toGuidePickResponse` and `toPublicGuidePick` (`guidePick.mapper.ts`)
- [x] 3.4 Repository/service tests: create and update with an Instagram URL, update clearing it to
      `null`, list/public-list echo it back

## 4. Admin UI

- [x] 4.1 Add `instagramUrl` to `apps/admin/src/lib/guidePicksApi.ts`'s create/update request types
      — no change needed: this file already types its requests directly off
      `GuidePickCreateRequest`/`GuidePickUpdateRequest` from `@siders/contracts`, so the new field
      flows through automatically
- [x] 4.2 Add an "Instagram URL (optional)" field to the create form in `GuidePicksPage.tsx`,
      client-validated with the same `isHttpUrl` rule `PartnersPage.tsx` uses for its website-URL
      field, blocking submit on an invalid value with the same "Enter a valid http(s) URL."
      message
- [x] 4.3 Add the same field to the edit-row form, supporting clearing it to blank (sends `null`,
      not an empty string, matching `PartnersPage.tsx`'s website-URL clear behavior)
- [x] 4.4 Test updates to `GuidePicksPage.test.tsx`: field disables submit on invalid URL, creates
      with the URL, creates/updates with none, clears an existing one to `null`

## 5. Public web page

- [x] 5.1 In `apps/web/src/components/home/GuideOfWeek.tsx`, render a guide-pick card with an
      `instagramUrl` as an `<a href={instagramUrl} target="_blank" rel="noopener noreferrer">`
      wrapping the card content — **revised post-implementation**: the video is not omitted, it
      keeps autoplaying as the usual muted scroll-triggered preview; only its native `controls`
      attribute is dropped on a linked card, so a click can only navigate (product feedback: an
      Instagram-linked card should still show its uploaded video, not just text)
- [x] 5.2 Leave a card with no `instagramUrl` unchanged: `<video>`, autoplay/pause-on-scroll
      behavior, and single-playback enforcement exactly as they are today
- [x] 5.3 Update `apps/web/src/lib/guidePicks.ts` types/grouping helper if it narrows on the
      `PublicGuidePick` shape — no change needed: it only reads `.city`, so it doesn't narrow on
      the rest of the shape
- [x] 5.4 Test updates to `GuideOfWeek.test.tsx`: a pick with `instagramUrl` renders as a link with
      no `<video>` in that card; a pick without one still renders and plays its `<video>` as before

## 6. Verification

- [x] 6.1 `openspec validate add-guide-pick-instagram-link --strict` — passes
- [x] 6.2 Full test suite green on every touched project (`contracts`, `db`, `api`, `admin`, `web`)
      — all new/updated tests pass; the only failures are 36 pre-existing ones (auth/CSRF/session,
      plus one unrelated pre-existing `guidePickCreateRequestSchema` test), identical in count and
      content on `main` before this change, unrelated to guide picks or partners
- [x] 6.3 Typecheck and lint clean on every touched package (`contracts`, `db`, `api`, `admin`,
      `web` all typecheck clean; lint clean on every file touched by this change)
