## Context

`docs/ARCHITECTURE.md` §8.1 fixes the rendering strategy per route:

```
/            ISR, 60s + on-demand revalidate   — editors publish curation and see it within seconds
/news        Server-rendered, searchParams-driven — filters live in the URL, so results are shareable
/news/[slug] SSG + on-demand revalidate on publish — fastest possible article load, correct OG tags
/contact     Static
```

and: "Server Components fetch from the API directly over the internal URL... Only genuinely interactive leaves... are Client Components." This change follows both directly — nothing here revisits the strategy table, it fills it in.

Four things this change consumes are implemented and archived on `main` today:

```
GET /categories          category-management   — public, no auth
GET /articles             public-news-api       — categorySlug, limit/offset, excludeIds
GET /articles/:slug       public-news-api       — bodyHtml, categories, tags
GET /home                 home-curation         — curated + chronological-backfill feed
GET /reels                reels-curation        — structured items, no embed markup
buildReelEmbedUrl()        @siders/contracts     — provider+id → embed URL, called only on activation
```

All five are `requirePublic()`, rate-limited, and return the `{ success: true, data }` / `{ success: false, error: { code, message } }` envelope every other client in this repo already parses (`apps/admin/src/lib/api.ts`).

The visual design comes from a Claude Design export (`Siders Broadsheet.dc.html` at `/home/claude/repo`, plus `chats/chat1.md`). That file is a design-tool prototype: `<x-dc>`, `<sc-for>`, `<sc-if>`, and `{{ }}` bindings are Claude Design's own templating syntax, not React, and its content (article titles, comment authors, stat numbers) is prototype sample data, not real. Per the handoff bundle's own instructions: recreate the visual output pixel-for-pixel; do not carry over the markup structure or the sample content as if real.

## Goals / Non-Goals

**Goals:**
- Every route in `docs/ARCHITECTURE.md` §8.1's table renders real content from the real backend, using that table's rendering strategy.
- The visual system (colors, type scale, rule weights, spacing, no-shadow/near-zero-radius, ragged-right text) matches the Claude Design prototype exactly, expressed as Tailwind tokens/utilities and componentized React rather than copied inline-style markup.
- Every prototype affordance that has no backend support today is visually present (so the design isn't silently incomplete) but never fabricates data or pretends to submit somewhere real.

**Non-Goals:** see `proposal.md` — Non-Goals. In short: no sub-brand filtering, no full-text search, no multi-category/date/sort, no comments/likes/shares, no contact submission, no guide/partner/stat data source, no new "image slot" abstraction.

## Decisions

### The fetch client is a plain public reader, not a copy of the admin client

`apps/admin/src/lib/api.ts` is built around CSRF double-submit and a 403-keyed session-refresh cycle, because every admin call is authenticated. Nothing this change calls is. `docs/ARCHITECTURE.md` §8.1 reserves that machinery for a *different* future need — the reader-facing "401 → refresh → retry" cycle for comments/likes, which is explicitly out of scope here (Non-Goals: "Comments, likes, and share counts").

```
apps/web/lib/api.ts

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, { ...init, cache: init?.cache });
  const payload = await res.json();
  if (!res.ok || payload.success === false) {
    throw new ApiError(payload?.error?.message ?? res.statusText, res.status, payload?.error?.code);
  }
  return payload.data as T;
}
```

- No `credentials: 'include'` — every endpoint called is `requirePublic()` and explicitly "ignores caller permissions" (`public-news-api` spec), so there is no session to carry and nothing gated by one.
- `cache` is passed through per call site rather than fixed, because the three routes need three different caching behaviors (ISR-revalidated fetch on `/`, request-time fetch on `/news`, `fetch(..., { next: { revalidate: false } })`-style static fetch backing SSG on `/news/[slug]`) — Next's `fetch` cache option is how each route's strategy from the table above is actually implemented, not a framework-level toggle.
- Response types come from `@siders/contracts` (`ArticlePublicCard`, `ArticlePublicDetail`, `CategoryResponse`, `PublicReelItem`, the `/home` feed's array of `ArticlePublicCard`) rather than hand-duplicated interfaces — this repo's own convention, and the reason `@siders/contracts` becomes a real dependency of `apps/web` for the first time.
- Alternative considered: reuse `apps/admin/src/lib/api.ts` directly (it's already CSRF/session-aware and would "just work" for public calls too, since public routes ignore auth). Rejected — carrying CSRF-cookie-reading and session-refresh-listener code into a Server Component runtime is either dead code (a Client Component reimplementing it) or actively wrong (`document.cookie` doesn't exist during SSR), and every route calling this file today is public, so the machinery has no caller.

### Tailwind is added to `apps/web`, following `apps/admin`'s actual (not `CLAUDE.md`'s stated) precedent

`CLAUDE.md` says the frontend stack is "Tailwind CSS, shadcn/ui." Auditing `apps/admin` — the one app in this repo that already has a real UI — found Tailwind (`apps/admin/tailwind.config.js`, `@tailwindcss/typography`) but no shadcn: no `components.json`, no Radix packages, no `class-variance-authority`, no `clsx`, anywhere in the repo. `CLAUDE.md`'s shadcn mention appears to be aspirational and never adopted. This change follows what `apps/admin` actually does — Tailwind utilities, no component-library layer — rather than introducing shadcn as this repo's first user of it, especially since the design's exact-hex editorial system (specific rule weights at 1/2/3px, `#FFD100` as a literal signal color, no border-radius above 2px) is easier to keep pixel-accurate as raw utilities/tokens than to route through shadcn's themed component primitives.

```ts
// apps/web/tailwind.config.ts
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { paper: '#F7F6F2', ink: '#141414', signal: '#FFD100', rule: '#E3E1D9', 'rule-strong': '#C9C6BC', muted: '#55534D' },
      fontFamily: { serif: ['"Source Serif 4"', 'Georgia', 'serif'], sans: ['"Libre Franklin"', 'sans-serif'] },
      borderRadius: { none: '0px', DEFAULT: '2px' },
    },
  },
};
```

- Colors and fonts are named tokens (`paper`, `ink`, `signal`, `rule`, `muted`), not raw hex in every component — the design names them once (`#F7F6F2` "paper," `#141414` "ink," `#FFD100` "signal") and this change keeps that naming rather than re-deriving it from usage.
- No `border-radius` above `2px` anywhere in the design; `boxShadow` is unextended (default Tailwind shadows are simply never used) rather than explicitly zeroed, since "don't reach for a utility that doesn't exist in this system" is enforced by review, not by config.

### `/news`'s filters: real category filtering, chrome-only for everything else

The design's filter bar has four controls — Anak usaha, Kategori, Tanggal, Urutkan — plus a search box. Per `proposal.md` — Non-Goals, only Kategori has real backend support, and only as a single value:

```
             Anak usaha    Kategori         Tanggal    Urutkan     Search
prototype:   single-select multi-select     single     single      full-text
this change: chrome only   single-select ✓  chrome only chrome only client-side substring
```

- Kategori renders as a real popover backed by `GET /categories`, and selecting one sets `?category=<slug>` in the URL (per §8.1: "filters live in the URL, so results are shareable") which the Server Component reads and passes as `categorySlug` to `GET /articles`.
- Anak usaha, Tanggal, and Urutkan render with their exact visual treatment (border, popover chrome where the design has one) but their `onClick` is a no-op — not hidden, not disabled-looking (disabled styling would contradict the design), just inert. Each carries a one-line code comment: `// Anak usaha filtering has no backend support yet — proposal.md Non-Goals`.
- The search input runs a client-side `.filter()` over the current page's already-fetched `ArticlePublicCard[]` on every keystroke (debounced), and its placeholder reads "Search this page…" rather than the prototype's "Search stories, places, people…" — the latter promises archive-wide search this input cannot perform.
- Load-more advances `offset` by the page size and appends, matching `articlePublicListQuerySchema`'s `limit`/`offset` pagination exactly; there is no separate "count" endpoint, so the result count shown is the count of articles fetched so far, not a server-reported total (the public list endpoint doesn't return one).
- Alternative considered: hide Anak usaha/Tanggal/Urutkan entirely rather than ship inert chrome. Rejected — the user's own instruction (Q&A during proposal drafting) was to match what the backend supports while keeping this a single, cohesive frontend change; hiding three of five prototype controls would visibly diverge from the approved design for a reason (missing backend) that a site visitor has no way to know, whereas inert-but-present controls read as "not yet," which is honest and matches the still-editorial feel of a print-derived masthead where not every control is load-bearing.

### Article detail: related rail from real category overlap, engagement bar inert

`related` in the prototype is a flat sample list. This change derives it for real: `GET /articles?categorySlug=<article's first category>&excludeIds=<current article id>&limit=5`, reusing the same `excludeIds` mechanism `home-curation` already relies on so the current article never appears in its own "Related" rail. If the article has no categories, the rail is omitted rather than falling back to an uncategorized/most-recent list the design never specified.

The engagement bar (like button, comment count, share count, comment composer) ships as static markup with the prototype's exact spacing/border treatment, zero counts (no "55 Comments" — an empty state reading "No comments yet" instead, since inventing a number would misrepresent real activity per `proposal.md` — Non-Goals), and a disabled-looking comment input with a tooltip/caption explaining comments aren't open yet. The like button is presentational only (no toggle persists anywhere).

### Reels: poster-first, embed only on activation — enforced, not merely followed

`reels-curation/spec.md` — "Third-party embeds load only on user activation" is written to bind *this* change specifically (its own text: "this requirement constrains the follow-up change that renders the rail on `/`"). The rail renders `PublicReelItem.posterUrl` as a plain `<img>`; clicking opens the existing lightbox modal from the prototype, and only at that point does the reel's `<iframe>` get created, via `buildReelEmbedUrl(item.provider, item.externalId)` imported straight from `@siders/contracts` — the same function the spec's own scenarios reference, not a re-derived copy. Closing the lightbox unmounts the iframe rather than hiding it, so a second activation doesn't require re-fetching anything but also doesn't leave a background frame running.

### Contact form: client-side validation, honest non-submission

Every field validates client-side (required name/email/message, email shape) using the same pattern the design's inputs already imply (underline-style inputs, inline error state on blur). On submit, since no endpoint exists, the form shows a static message — "Sending isn't wired up yet — email karyasiders@gmail.com directly" — rather than a fake success state or a silent no-op. This is one line different from a real submit-and-toast flow, so swapping in a real endpoint later is a one-function change (replace the inert handler with a real `apiFetch('/contact', { method: 'POST', body })` call) with no UI restructuring.

### Route strategy implementation, one line per route

| Route | Next.js mechanism |
|---|---|
| `/` | `export const revalidate = 60;` + the existing `/api/revalidate` handler (already built, fires on curation/reels writes per their specs) |
| `/news` | Reads `searchParams.category`; no `revalidate` export — server-rendered per request, matching "filters live in the URL" needing fresh data per query |
| `/news/[slug]` | `export const revalidate = 60;` (SSG with on-demand revalidate, mirroring `/`'s mechanism — Next's static generation + ISR are the same primitive at different `generateStaticParams` boundaries) |
| `/contact` | No `revalidate` export, no dynamic fetch — plain static render |

## Risks / Trade-offs

- **[Visible-but-inert controls could read as broken rather than "not yet"]** → Mitigated by each inert control's exact prototype styling (nothing looks disabled) plus this design's explicit call-out in `proposal.md` for anyone auditing the site later; if user testing shows visitors clicking Tanggal/Urutkan and expecting something to happen, the cheap fix is a small "coming soon" affordance, not a re-architecture.
- **[Client-side search reads as full search but isn't]** → Mitigated by "Search this page…" placeholder copy rather than the prototype's "Search stories, places, people…"; still a real risk if a visitor pastes in a term from an article on a page they haven't loaded yet and gets zero results. Accepted for this change; full-text search is backend work out of scope here.
- **[Related-articles rail requires the article have a category]** → Every article created through `apps/admin`'s editor can be published with zero categories (`categoryIds` is optional throughout `article.ts`). An uncategorized article's page ships with no Related rail rather than a broken one.
- **[`NEXT_PUBLIC_API_URL` misconfiguration is a silent full-page failure]** → Every route here depends on it. Mitigated by each Server Component's fetch failing loudly (thrown `ApiError` triggers Next's error boundary) rather than rendering an empty page that looks intentional.

## Build Order

1. **Tailwind + tokens** — `apps/web/tailwind.config.ts`, `app/globals.css`, font loading (`Source Serif 4` / `Libre Franklin`, matching the prototype's Google Fonts `<link>`). Nothing else can be pixel-checked without this.
2. **API client** — `apps/web/lib/api.ts` + `@siders/contracts` as a real dependency. Everything below calls this.
3. **Shared layout** — masthead nav, footer, both static except the sub-brand footer links (static hrefs to `/news`).
4. **`/contact`** — the simplest route (no fetch on the page itself beyond nothing), good end-to-end proof of the layout and Tailwind tokens before tackling data-fetching routes.
5. **`/news/[slug]`** — single-article fetch, drop-cap body rendering from `bodyHtml`, related rail. Simpler data shape than `/news`'s filtering.
6. **`/news`** — category filter wired to real data, inert chrome for the rest, client-side search, load-more.
7. **`/`** — the most composed page: `/home` feed, `/reels` rail with the activation-gated lightbox, plus every static section (manifesto, stats, Guide of the Week, Anak Usaha tiles, partner grid, CTA band).
8. **Tests + verification** — component/unit tests per `apps/web/vitest.config.ts` (already present, currently unused), build/lint/typecheck.

## Migration Plan

None. No database change, no contract change, no new `apps/api` route. Rollback is reverting `apps/web`'s commits; nothing else in the system depends on this change existing.
