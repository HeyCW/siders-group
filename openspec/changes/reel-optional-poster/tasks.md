## 1. Database

- [x] 1.1 Drop `.notNull()` from `posterMediaId` in `packages/db/src/schema/reels.ts` (keep the `.references(() => media.id, { onDelete: 'restrict' })`)
- [x] 1.2 Run `pnpm --filter @siders/db db:generate` to emit the migration into `supabase/migrations`, and check in the generated SQL (`0011_zippy_the_enforcers.sql` — `ALTER TABLE "app"."reels" ALTER COLUMN "poster_media_id" DROP NOT NULL;`)

## 2. Contracts

- [x] 2.1 In `packages/contracts/src/reel.ts`: `reelCreateRequestSchema.posterMediaId` → `z.string().uuid().nullable().optional()`; `reelUpdateRequestSchema.posterMediaId` → add `.nullable()` (keep `.optional()`); `reelResponseSchema.posterUrl` and `publicReelItemSchema.posterUrl` → `z.string().nullable()`
- [x] 2.2 In `packages/contracts/src/reelsCuration.ts`, `reelsCurationReelSummarySchema.posterUrl` → `z.string().nullable()`
- [x] 2.3 Updated `packages/contracts/src/reel.test.ts`: replaced "requires posterMediaId" with tests for absent and explicit-`null` posterMediaId on create succeeding, and added an explicit-`null`-clears-it test on update

## 3. API

- [x] 3.1 In `apps/api/src/modules/reels/reel.repository.ts`: changed `findByIdJoined`'s and `list()`'s `innerJoin(media, ...)` on `posterMediaId` to `leftJoin`; widened `ReelRow.posterMediaId`/`posterStoragePath` and `CreateReelInput.posterMediaId` to allow `null`; `create` normalizes `posterMediaId ?? null` before `.values()` (same `exactOptionalPropertyTypes` fix as the partner change)
- [x] 3.2 In `apps/api/src/modules/reels/reel.mapper.ts`, `posterUrl` now derives conditionally: `row.posterStoragePath ? publicUrlFor(env, row.posterStoragePath) : null`
- [x] 3.3 In `apps/api/src/modules/reels/reel.service.ts`, widened `CreateReelServiceInput.posterMediaId` to allow `null`/absent
- [x] 3.4 In `apps/api/src/modules/reels/reel.controller.ts`'s `create`, normalized `posterMediaId: body.posterMediaId ?? null` alongside the existing `caption` normalization
- [x] 3.5 In `apps/api/src/modules/reels/reelsCuration.repository.ts`'s `selectJoined`, changed the `innerJoin(media, ...)` on `reels.posterMediaId` to `leftJoin`; widened `ReelsCurationEntryRow.posterStoragePath` to allow `null`
- [x] 3.6 In `apps/api/src/modules/reels/reelsCuration.mapper.ts`, `posterUrl` now derives conditionally in both `toReelsCurationEntryResponse` and `toPublicReelItem`
- [x] 3.7 Updated `apps/api/src/modules/reels/reel.service.test.ts`: fixed the fake repository's `create`/`update` to distinguish omitted from explicit `null` (same fix as the partner change); added tests for creating with no poster, clearing via explicit `null`, and leaving it unchanged when omitted — 10 tests pass
- [x] 3.8 Added a poster-less-reel test to both `apps/api/src/modules/reels/reelsCuration.service.test.ts` and `apps/api/src/modules/reels/publicReels.service.test.ts` — 23 tests pass across the three reels API test files

## 4. Admin UI

- [x] 4.1 In `apps/admin/src/pages/ReelLibraryPage.tsx`: removed the `posterMediaId !== null` clause from `canCreate` and the `!posterMediaId` early return in `handleCreate` (now sends `posterMediaId ?? null`); relabeled "Poster image (required)" to "Poster image (optional)"; updated the file's doc comment
- [x] 4.2 List row renders a "No poster" placeholder box in place of `<img src={reel.posterUrl}>` when absent; the edit form's preview already handles `null` gracefully via its existing `{editPosterPreviewUrl && <img .../>}` falsy check, no change needed there
- [x] 4.3 Created `apps/admin/src/pages/ReelLibraryPage.test.tsx` (none existed): covers "Add reel" enabling on a recognized URL alone, creating with `posterMediaId: null`, an unrecognized URL still blocking, and the list's "No poster" placeholder — 4 tests pass
- [x] 4.4 (Found via typecheck, not in original scope) `apps/admin/src/pages/ReelsCurationPage.tsx` also consumes `posterUrl` in its `PickedItem` type and two `<img>` tags (the picked-rail list and the pickable-library list) — widened the type to `string | null` and gave both `<img>`s the same "No poster" placeholder fallback as `ReelLibraryPage`. No test file exists for this page (pre-existing gap, not introduced here); left uncovered, consistent with the rest of the untested surface

## 5. Public web

- [x] 5.1 In `apps/web/components/home/ReelsRail.tsx`, the tile's `<img>` renders only when `reel.posterUrl` is present; when absent, the existing `bg-ink` background and "PLAY" badge alone form the fallback tile — the `onClick` activation handler is unchanged either way
- [x] 5.2 Updated `apps/web/components/home/ReelsRail.test.tsx`: added a poster-less fixture and tests confirming no `<img>` renders for that tile and that clicking it still mounts the correct iframe — 6 tests pass

## 6. Verification

- [x] 6.1 Ran the full test suite — 106 files / 947 tests pass, no remaining assertion assumed `posterUrl` is always present
- [x] 6.2 Ran `pnpm -r typecheck` — caught `apps/admin/src/pages/ReelsCurationPage.tsx` as a consumer missed in the original scope (see 4.4); all packages now typecheck clean. Re-ran the full suite afterward: 945/947 pass, the only 2 failures are in `auth.routes.csrf.test.ts` (unrelated to this change — a pre-existing timing-sensitive rate-limit test that passes cleanly in isolation, confirmed not caused by this change)
- [x] 6.3 Applied both pending migrations to the dev DB (`pnpm --filter @siders/db db:migrate` — succeeded) and confirmed `GET /reels` still responds `{"success":true,"data":[]}` post-migration
