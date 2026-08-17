## Why

The Contact page's "Find us" section renders a `MediaSlot` placeholder (`src={null}`) instead of a map, because no backend capability provides map data. The office location is not backend content, though — it's a static fact (`CONTACT_INFO.address` is already hardcoded in `apps/web/lib/content.tsx`). The page can render a real map today by sourcing it from the same static content, with no new backend work.

## What Changes

- Add a `mapQuery` field to `CONTACT_INFO` (`apps/web/lib/content.tsx`), reusing the existing hardcoded address string rather than introducing separate coordinates.
- Add a `ContactMap` component (`apps/web/components/contact/ContactMap.tsx`) that renders a Google Maps embed (`output=embed` iframe, no API key, no new dependency) built from `CONTACT_INFO.mapQuery`.
- Replace the `MediaSlot` placeholder in the Contact page's "Find us" section with `ContactMap`.
- Change the section's aspect ratio from a flat `aspect-[21/9]` to `aspect-[4/3]` on mobile and `md:aspect-[21/9]` on desktop, since the current ratio is too short to be usable on small screens.
- The map embed loads unconditionally on page view (no click-to-activate gate), unlike `ReelsRail`'s deferred-iframe pattern for third-party embeds — a deliberate simplification for this iteration, called out explicitly rather than left as a silent inconsistency.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `web-public-site`: adds a requirement that the Contact page's "Find us" section renders a real map derived from static, hardcoded site content (not backend data), replacing the current placeholder.

## Impact

- **Affected code**: `apps/web/lib/content.tsx`, `apps/web/app/contact/page.tsx`, new file `apps/web/components/contact/ContactMap.tsx`.
- **Dependencies**: none added — plain `<iframe>`, no map library, no API key/billing setup.
- **Backend/API**: none — no endpoint, no database change.
- **Third-party**: introduces the Contact page's first unconditionally-loaded third-party embed (Google Maps). Uses the undocumented keyless `output=embed` URL form rather than the official Maps Embed API (which requires an API key and billing account) — acceptable for a static, low-traffic embed, but not backed by an SLA.
