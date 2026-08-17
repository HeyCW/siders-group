## Context

`apps/web/app/contact/page.tsx` renders "Find us" via `MediaSlot` with `src={null}`, which always shows the labeled placeholder box — there is no map data source to point it at. `CONTACT_INFO` (`apps/web/lib/content.tsx`) already hardcodes the office address, WhatsApp number, and emails as static site content, not backend data. See `proposal.md` - Why.

`ReelsRail` (`apps/web/components/home/ReelsRail.tsx`) is the codebase's one existing pattern for a third-party embed: it renders a static poster image and only mounts the third-party `<iframe>` after a user click, closing (unmounting) it again on dismiss.

## Goals / Non-Goals

**Goals:**
- Render a real map on `/contact` with zero new npm dependencies and zero backend changes.
- Keep the location as a single hardcoded string, reusing `CONTACT_INFO` rather than introducing a second source of truth (e.g. separate lat/lng constants).
- Fix the section's aspect ratio so the map is legible on mobile.

**Non-Goals:**
- Not building a click-to-load facade for this embed (unlike `ReelsRail`). Deferred for a later iteration if the always-loaded third-party request becomes a real concern — tracked as a known trade-off, not solved here.
- Not adopting a map library (Leaflet, Mapbox GL, etc.) or the official Google Maps Embed API (which requires an API key and billing account). Both are heavier than a static, low-traffic embed needs.
- Not attempting to geocode a precise pin from the address. The address string (`"Jalan Raya Darmo, Surabaya"`) has no street number; the embed centers on that string as-is, at street-level precision, not building-level.

## Decisions

**Google Maps keyless `output=embed` iframe, not the Embed API, not a map library.**
`https://maps.google.com/maps?q=<query>&output=embed` requires no API key, no billing account, and no new dependency — just a `src` string. The official Maps Embed API (`google.com/maps/embed/v1/place?key=...`) would need a Google Cloud project and key management for a single static embed, which is disproportionate. A library (`react-leaflet`, etc.) would need `'use client'`, a tile provider, and marker styling for one pin — also disproportionate. Trade-off: the keyless URL form is undocumented; see Risks.

**`mapQuery` reuses the existing address string, not separate coordinates.**
`CONTACT_INFO.mapQuery` is set to the same string as `CONTACT_INFO.address.join(', ')` conceptually (concretely: `"Jalan Raya Darmo, Surabaya"`). This avoids a second hardcoded location value that could drift from the displayed address if the office moves. Google resolves the query server-side at render time (embed time), so no geocoding step is needed in this codebase.

**No click-to-load gate, unlike `ReelsRail`.**
`ReelsRail` defers its iframe because reel embeds are numerous, heavy (video), and per-item. A single static map iframe is a materially smaller, one-time cost per page view. Gating it behind a click would also mean the map — arguably the most useful part of "Find us" for a visitor trying to get there — is invisible by default. This is called out explicitly in the proposal as a deliberate simplification, not a silent inconsistency.

**Server Component, no client-side JS.**
The iframe needs no interactivity beyond what the embed provides natively (pan/zoom/directions), so `ContactMap` stays a plain Server Component — no `'use client'`, no new client bundle weight.

## Risks / Trade-offs

- **Undocumented URL form** (`maps.google.com/maps?...&output=embed`) could change or be retired without notice, since it isn't part of Google's supported API surface → Mitigation: isolate it behind the single `ContactMap` component so a future switch to the official Embed API (or another provider) touches one file.
- **Always-loaded third-party request** on every `/contact` page view (cookies, network call to Google) → Mitigation: `loading="lazy"` defers the fetch until the iframe is near-viewport; full click-to-load gating is left as a documented future option (see Non-Goals), not solved now.
- **Street-level, not building-level, precision** — the address has no house number, so the map centers on the street/area, not the exact office → Mitigation: none needed for this change; if a precise address or place ID becomes available later, only `CONTACT_INFO.mapQuery` needs to change.
