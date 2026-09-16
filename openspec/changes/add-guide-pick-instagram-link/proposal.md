## Why

Each guide pick's self-hosted video plays inline and dead-ends on the home page, with no way for a
reader to reach the source Instagram post or account it came from — the marketing team wants that
credit/traffic path back to Instagram.

This is not the `self-hosted-guideline-videos` change's rejected "reference the video from
Instagram" idea (that proposal keeps video self-hosted for durability and no third-party tracking
in the page). This change leaves the video exactly as-is; it only adds an optional outbound link a
reader can follow after — or instead of — watching.

## What Changes

- A guide pick gains an optional `instagramUrl` field, admin-settable on create and update,
  validated to `http`/`https` the same way `partnerCreateRequestSchema.websiteUrl` is
  (`isHttpUrl`).
- The public guide-pick listing includes `instagramUrl` when present.
- On the public home page, a guide-pick card with an `instagramUrl` set renders as a link to that
  URL (`target="_blank"`, `rel="noopener noreferrer"`), wrapping the whole card. The video keeps
  autoplaying as the same muted, looping, scroll-triggered preview every card already has — it
  just loses its native `controls` on a linked card, so a click can only navigate, never toggle
  play/pause or open the browser's own player UI. A card with no `instagramUrl` renders exactly as
  it does today: inline video with `controls`, click-to-play/pause, unchanged.
- The admin "Guide of the Week" screen gains an Instagram URL field in the create form and the
  edit row, mirroring `PartnersPage.tsx`'s optional website-URL field and validation.

## Impact

- **Affected specs**: guide-of-the-week-management
- **Affected code**: `packages/db/src/schema/guidePicks.ts`, `packages/contracts/src/guidePick.ts`,
  `apps/api/src/modules/guidePicks/*`, `apps/admin/src/pages/GuidePicksPage.tsx`,
  `apps/admin/src/lib/guidePicksApi.ts`, `apps/web/src/components/home/GuideOfWeek.tsx`
- **Migration**: additive, nullable `instagram_url` column on `guide_picks` — no backfill, no data
  loss, existing rows simply have no link and keep rendering as inline video
