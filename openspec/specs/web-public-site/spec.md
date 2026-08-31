# web-public-site Specification

## Purpose

Defines `apps/web`'s public-facing rendering behavior across `/`, `/news`, `/news/[slug]`, and `/contact`: what each route fetches from the real backend, how `/news`'s filter bar behaves given which filters that backend actually supports, how the Article detail's related rail and engagement bar are composed, how the Reels rail defers third-party embeds until activation, and the rule that no route may render fabricated data in place of a capability the backend does not yet provide.

## Requirements

### Requirement: Every route renders real backend data, never invented data
No route SHALL render article, category, or reel content that did not come from `apps/api`. Where the visual design implies a capability the backend does not provide (full-text search across the archive, comments, likes, share counts, contact submission), the page SHALL either omit that element's data-dependent behavior or clearly scope it (e.g. "search this page" rather than "search stories") rather than fabricate a plausible-looking result.

#### Scenario: No hardcoded sample content ships
- **WHEN** any of the four routes is rendered
- **THEN** no article title, comment, comment count, share count, or like count from the design prototype's sample data appears in the output

#### Scenario: A missing capability is visibly scoped, not silently faked
- **WHEN** a page element corresponds to a capability the backend does not implement (e.g. the News page's Urutkan sort control)
- **THEN** interacting with that element has no effect on the displayed results, and no request is made that pretends to filter or sort by it

### Requirement: Home page composes the curated feed and the reels rail
`/` SHALL render its article showcase from the public home feed endpoint and its reels rail from the public reels endpoint, and SHALL request revalidation at a 60-second interval consistent with `docs/ARCHITECTURE.md` §8.1.

#### Scenario: Showcase reflects the curated feed
- **WHEN** the home feed endpoint returns curated articles followed by chronologically backfilled ones
- **THEN** the homepage showcase renders them in that same order, with no distinction shown between curated and backfilled entries

#### Scenario: Reels rail reflects the public rail in order
- **WHEN** the reels endpoint returns an ordered set of publicly visible reels
- **THEN** the homepage reels rail renders them in that order, each represented by its poster image

### Requirement: Reels defer third-party embeds until user activation
The homepage reels rail SHALL render only local poster images on initial load and SHALL create no third-party frame, script, or network request until a visitor activates a specific reel. Activating one reel SHALL NOT create an embed for any other reel.

#### Scenario: No provider request before activation
- **WHEN** the homepage loads and a visitor does not interact with the reels rail
- **THEN** no request is made to any reels provider (Instagram, TikTok, or YouTube)

#### Scenario: Activation loads exactly one embed
- **WHEN** a visitor clicks a single reel's poster
- **THEN** an embed is created for that reel alone, composed from its stored provider and identifier, and no other reel's embed is created

#### Scenario: Closing the lightbox removes the embed
- **WHEN** a visitor closes an active reel's lightbox
- **THEN** that reel's embed is removed rather than left mounted in the background

### Requirement: News page category and anak usaha filtering are multi-select; date filtering is single-select. All are real
The News page SHALL fetch articles filtered by zero or more category slugs, zero or more anak usaha
slugs, and at most one date-range selection, all taken from the URL's query string, so that a
filtered URL is shareable and reloadable. The Anak usaha control's options SHALL come from the
`anak-usaha-management` capability's public listing rather than a hardcoded list. The Urutkan (sort)
control SHALL remain visually present per the approved design but SHALL have no effect on the
displayed results.

#### Scenario: Selecting a category adds it to the filter
- **WHEN** a visitor selects a category from the Kategori filter while zero or more categories are already selected
- **THEN** the URL's query string includes the newly selected category slug alongside any already selected, and the displayed articles are limited to articles matching at least one selected category

#### Scenario: Deselecting a category removes only that category
- **WHEN** a visitor deselects one category while more than one is active
- **THEN** that category's slug is removed from the URL's query string, the remaining selected categories stay active, and the result set updates accordingly

#### Scenario: Selecting an anak usaha adds it to the filter
- **WHEN** a visitor selects an anak usaha from the Anak usaha filter
- **THEN** the URL's query string includes the newly selected anak usaha slug alongside any already selected, and the displayed articles are limited to articles matching at least one selected anak usaha

#### Scenario: Anak usaha options reflect the real catalog
- **WHEN** the Anak usaha filter is opened
- **THEN** its options are exactly the entries returned by the anak usaha public listing, not a hardcoded set

#### Scenario: A filtered URL is shareable
- **WHEN** a visitor loads a `/news` URL that already carries category, anak usaha, and/or date query parameters
- **THEN** the page renders already filtered accordingly, with no additional interaction required

#### Scenario: Only one date option can be active at a time
- **WHEN** a visitor selects a second Tanggal option while one is already active
- **THEN** the second selection replaces the first rather than both applying together

#### Scenario: Selecting a relative date option filters results
- **WHEN** a visitor selects "7 hari terakhir", "30 hari terakhir", or "Tahun ini"
- **THEN** the displayed articles are limited to those published within that relative window, and the URL reflects the selected option

#### Scenario: Selecting a custom range reveals from/to inputs
- **WHEN** a visitor selects "Rentang khusus"
- **THEN** the filter panel offers a from-date and to-date input, and once both are provided the displayed articles are limited to that published-date range and the URL reflects both bounds

#### Scenario: Filters combine
- **WHEN** a visitor has an active category selection, anak usaha selection, and date selection at the same time
- **THEN** the displayed articles satisfy all three filters at once

#### Scenario: The sort control does not filter or reorder results
- **WHEN** a visitor interacts with the Urutkan control
- **THEN** the displayed article set and its order are unchanged

### Requirement: News page search is scoped to the currently loaded page
The News page's search input SHALL filter only the articles already fetched into the page, SHALL NOT issue a request to a full-text search endpoint, and its placeholder text SHALL describe this scope rather than imply an archive-wide search.

#### Scenario: Search narrows the visible set without a new fetch
- **WHEN** a visitor types into the search input
- **THEN** the visible article list narrows to those whose title or excerpt match, using only articles already loaded on the page

#### Scenario: A term present only in an unloaded article yields no match
- **WHEN** a visitor searches for a term that exists only in an article beyond the currently loaded page
- **THEN** no result for that article appears, and no additional fetch is triggered by the search input itself

### Requirement: News page pagination loads additional real results
The News page SHALL support loading additional articles via the backend's limit/offset pagination, appending to the currently displayed set, and SHALL hide the load-more control once a request returns fewer articles than requested.

#### Scenario: Load more appends without replacing
- **WHEN** a visitor activates load-more
- **THEN** the newly fetched articles are appended to the existing list rather than replacing it

#### Scenario: Load more disappears at the end of the list
- **WHEN** a load-more request returns fewer articles than the requested page size
- **THEN** the load-more control is no longer shown

### Requirement: News page empty state is reachable and recoverable
The News page SHALL show an explicit empty state when the currently active filters (category, anak
usaha, date) and search term together produce no results, offering a control that clears every
active filter.

#### Scenario: Empty state appears when nothing matches
- **WHEN** the active filters and search term together match no loaded articles
- **THEN** an empty-state message is shown instead of an empty grid

#### Scenario: Clearing filters recovers results
- **WHEN** a visitor activates the empty state's clear-filters control
- **THEN** every active filter (category, anak usaha, date) is removed from the URL and the full unfiltered result set is fetched

### Requirement: Article detail renders the real published article
`/news/[slug]` SHALL fetch and render the article matching its URL slug, including its sanitized HTML body, and SHALL respond to an unknown slug with a not-found result rather than a broken or blank page.

#### Scenario: Known slug renders the article
- **WHEN** a visitor requests `/news/<slug>` for a published article's slug
- **THEN** the page renders that article's title, byline, lead image, and body content

#### Scenario: Unknown slug is a not-found page
- **WHEN** a visitor requests `/news/<slug>` for a slug matching no published article
- **THEN** the page renders as not found rather than rendering with missing or placeholder article content

### Requirement: Article detail's related rail reflects real category overlap
When the current article has at least one category, the related-articles rail SHALL be populated by other published articles sharing that category, excluding the current article, and SHALL be omitted entirely when the current article has no category.

#### Scenario: Related rail excludes the current article
- **WHEN** the related-articles rail is populated
- **THEN** the current article never appears among its own related items

#### Scenario: No categories means no related rail
- **WHEN** the current article has no categories
- **THEN** the related-articles rail section does not render

### Requirement: Article engagement renders only real activity
The article detail page's view count, like count, comment count, and comment list SHALL come from
the `article-engagement` capability, and SHALL render no count or comment that did not come from a
real backend response. Until those responses arrive, the page SHALL render a placeholder that
reserves the final layout's space rather than a provisional number.

#### Scenario: No count is invented
- **WHEN** the engagement bar renders
- **THEN** every figure it shows corresponds to a value returned by the backend

#### Scenario: The loading state reserves its own space
- **WHEN** the engagement bar is waiting for its first response
- **THEN** it renders a placeholder occupying the height the loaded bar will occupy, and the article content around it does not shift when the counts arrive

#### Scenario: A failed load is reported, not faked
- **WHEN** the engagement counts cannot be loaded
- **THEN** the bar indicates that engagement is unavailable rather than displaying zeroes

### Requirement: The article page counts its own view without becoming dynamic
Loading an article page SHALL record one view, and SHALL do so from the client after the page has
rendered. The article route SHALL remain incrementally statically regenerated; no part of this
behavior SHALL make it render per request.

#### Scenario: A visit records a view
- **WHEN** a visitor loads an article page
- **THEN** exactly one view is recorded for that article

#### Scenario: The route stays statically regenerated
- **WHEN** the article route is built
- **THEN** it remains incrementally statically regenerated at its existing interval, and no engagement data is fetched during server rendering

#### Scenario: The reader's own view is included in what they see
- **WHEN** the engagement counts render for a visitor
- **THEN** the view count includes that visitor's own view

### Requirement: A signed-out reader is prompted to sign in, never shown a dead control
Where liking or commenting requires a reader session that the visitor does not hold, the page
SHALL render an inline sign-in prompt in that control's place. It SHALL NOT hide the control, and
SHALL NOT render an interactive control that fails on use. The prompt SHALL return the reader to
the article they were reading.

#### Scenario: The like control becomes a sign-in prompt
- **WHEN** a visitor holding no reader session views an article
- **THEN** an inline sign-in prompt appears in place of the like control, and no like control is rendered

#### Scenario: The comment composer becomes a sign-in prompt
- **WHEN** a visitor holding no reader session views an article
- **THEN** an inline sign-in prompt appears in place of the comment composer, and no comment input is rendered

#### Scenario: Comments remain readable while signed out
- **WHEN** a visitor holding no reader session views an article that has comments
- **THEN** those comments are displayed, with only the composer replaced by the prompt

#### Scenario: Signing in returns to the article
- **WHEN** a visitor activates an inline sign-in prompt
- **THEN** they are returned to the article they were reading after signing in

#### Scenario: Neither control is shown before the session is known
- **WHEN** reader session resolution is still in flight
- **THEN** neither the interactive control nor the sign-in prompt is rendered in its place

### Requirement: The comment list is flat and newest-first, with no reply affordance
The article page SHALL display comments as a flat list ordered newest first, SHALL offer a control
to load older comments while more exist, and SHALL present no reply, threading, or nesting
affordance.

#### Scenario: Comments display newest first
- **WHEN** an article's comments are displayed
- **THEN** the most recently posted comment appears first

#### Scenario: No reply control is present
- **WHEN** a comment is displayed
- **THEN** no reply, quote, or nesting control is offered for it

#### Scenario: Older comments load on demand
- **WHEN** more comments exist than are currently displayed
- **THEN** a control to load older comments is shown, and activating it appends them to the existing list

#### Scenario: The load control disappears at the end
- **WHEN** a request for older comments returns fewer than requested
- **THEN** the load control is no longer shown

### Requirement: A posted comment appears without a reload
Submitting a comment SHALL place it at the top of the displayed list and update the comment count,
without requiring the reader to reload the page. A rejected submission SHALL report the rejection
and SHALL retain what the reader typed.

#### Scenario: A submitted comment appears immediately
- **WHEN** a signed-in reader submits a valid comment
- **THEN** it appears at the top of the comment list and the comment count increases, with no page reload

#### Scenario: A rejected comment keeps the reader's text
- **WHEN** a comment submission is rejected
- **THEN** the reason is shown and the reader's text remains in the composer

### Requirement: Contact form validates client-side and submits to a real endpoint
The Contact page's message form SHALL validate required fields and email format before allowing submission, and SHALL submit valid input to the contact-message intake endpoint, reporting the genuine outcome of that submission rather than fabricating or suppressing it.

#### Scenario: Invalid input blocks submission
- **WHEN** a visitor attempts to submit the contact form with a missing required field or a malformed email
- **THEN** submission is blocked and the invalid field is indicated

#### Scenario: Valid submission succeeds
- **WHEN** a visitor submits the contact form with all fields valid
- **THEN** the message is sent to the contact-message intake endpoint and the page shows that the message was received

#### Scenario: Submission fails
- **WHEN** a visitor submits the contact form with all fields valid but the intake endpoint request fails (network error, server error, or rate limit)
- **THEN** the page reports that sending failed rather than indicating success, and does not silently discard the visitor's input

### Requirement: Contact page renders the office location as a map sourced from static site content
The Contact page's "Find us" section SHALL render a map of the office location, built from a hardcoded location string maintained alongside the page's other static contact details, rather than from any backend-provided data. The map SHALL replace the unfilled placeholder previously shown in this section.

#### Scenario: Map renders from static content
- **WHEN** the Contact page is rendered
- **THEN** the "Find us" section shows a map centered on the configured office location string, with no request to `apps/api` for map data

#### Scenario: Map section is usable on small viewports
- **WHEN** the Contact page is rendered on a mobile-width viewport
- **THEN** the map section uses an aspect ratio tall enough to be legible, rather than the wide aspect ratio used on desktop

### Requirement: The partner section renders real, admin-managed partners
The home page's partner section SHALL render the active partners returned by the partner-management
capability's public listing, in the order that listing returns, and SHALL NOT render any hardcoded
or placeholder partner content.

#### Scenario: Partners come from the backend
- **WHEN** the home page renders its partner section
- **THEN** every partner shown corresponds to an active partner record, and no placeholder name or tile appears

#### Scenario: No partners means no section
- **WHEN** the partner-management capability's public listing returns no active partners
- **THEN** the home page renders no partner heading, rule, or ticker for that section

### Requirement: The partner section is a single-row, auto-scrolling ticker
The partner section SHALL present partners in a single horizontal row that scrolls continuously
from right to left, so that partners not currently visible become visible as the row scrolls,
looping seamlessly regardless of how many partners exist.

#### Scenario: Partners exceeding one screen's width are all reachable
- **WHEN** more partners exist than fit in one row's visible width
- **THEN** every partner becomes visible at some point as the row scrolls, without requiring the reader to resize the window

#### Scenario: The loop has no visible gap or jump
- **WHEN** the ticker completes one full cycle
- **THEN** it continues scrolling with no visible gap, jump, or pause at the seam

#### Scenario: Few partners still scroll continuously
- **WHEN** the number of active partners is small enough that they would not otherwise fill one row's width
- **THEN** the row still scrolls continuously with no visible gap, rather than sitting static or showing a partial row

### Requirement: The ticker pauses only for keyboard interaction
The partner ticker SHALL keep scrolling continuously regardless of pointer hover, and SHALL pause
its scrolling only while keyboard focus is within it, resuming when focus leaves.

#### Scenario: Hovering does not pause the scroll
- **WHEN** a pointer hovers over the partner ticker
- **THEN** the scrolling continues uninterrupted

#### Scenario: Keyboard focus pauses the scroll
- **WHEN** keyboard focus moves to a partner link inside the ticker
- **THEN** the scrolling stops until focus leaves the ticker

#### Scenario: A focused partner link does not scroll out of view
- **WHEN** a reader tabs to a partner link inside the ticker
- **THEN** that link remains in place rather than moving off-screen while it holds focus

### Requirement: A partner with no website URL renders without a link
A partner tile in the partner section SHALL render as a link to that partner's website only when
the partner has a website URL. A partner with no website URL SHALL render its logo as a plain,
non-interactive element — not a link, not a link with an empty or placeholder `href`, and not a
click handler that navigates anywhere.

#### Scenario: A partner without a website URL is not a link
- **WHEN** the partner section renders a partner that has no website URL
- **THEN** that partner's tile contains no anchor element and clicking it causes no navigation

#### Scenario: A partner with a website URL is unaffected
- **WHEN** the partner section renders a partner that has a website URL
- **THEN** that partner's tile is a link to that URL, opening in a new tab, exactly as before this capability existed

### Requirement: Each partner is reachable exactly once by keyboard and screen reader
Regardless of how the ticker's continuous loop is visually achieved, assistive technology and
keyboard navigation SHALL encounter each active partner that has a website URL exactly once. A
partner with no website URL SHALL be announced or visible as content but SHALL NOT be a tab stop,
since it carries no link to land on.

#### Scenario: Tabbing through the ticker visits each linked partner once
- **WHEN** a reader tabs through the partner ticker
- **THEN** each active partner that has a website URL receives focus exactly once, regardless of how many times it appears visually, and a partner with no website URL receives no focus

#### Scenario: Screen reader announces each partner once
- **WHEN** a screen reader user navigates the partner section
- **THEN** each active partner is announced exactly once, as a link if it has a website URL and as non-interactive content if it does not

### Requirement: Reduced motion shows all partners without scrolling
When the reader's system preference indicates reduced motion, the partner section SHALL render all
active partners in a static, non-scrolling layout rather than an auto-scrolling ticker, and every
partner SHALL be reachable without relying on motion.

#### Scenario: Reduced motion disables the scroll
- **WHEN** a reader's system preference requests reduced motion
- **THEN** the partner section does not auto-scroll, and all active partners are visible or reachable through ordinary scrolling of the page

#### Scenario: No partner becomes unreachable under reduced motion
- **WHEN** reduced motion is active and more partners exist than fit in one row
- **THEN** every active partner remains reachable, none hidden behind a paused animation

### Requirement: A partner logo renders undistorted in its own colors
Each partner's logo SHALL render at a consistent row height without stretching, cropping, or
distorting its aspect ratio, and SHALL retain its own colors rather than being recolored to the
site's monochrome palette.

#### Scenario: Logos of different aspect ratios sit evenly in the row
- **WHEN** partner logos of differing width-to-height ratios are rendered in the ticker
- **THEN** each renders at the same row height with its aspect ratio preserved and no cropping

#### Scenario: Logo colors are preserved
- **WHEN** a partner logo containing color is rendered
- **THEN** it displays in its original colors, with no grayscale or monochrome filter applied

### Requirement: The guide-of-the-week section renders real, admin-managed picks
The home page's "Siders Guide of the Week" section SHALL render the active guide picks returned by
the guide-of-the-week-management capability's public listing, in the order that listing returns,
and SHALL NOT render any hardcoded or placeholder guide-pick content.

#### Scenario: Guide picks come from the backend
- **WHEN** the home page renders its guide-of-the-week section
- **THEN** every pick shown corresponds to an active guide-pick record, and no placeholder city,
  place, description, or photo-drop-target appears

#### Scenario: No guide picks means no section
- **WHEN** the guide-of-the-week-management capability's public listing returns no active guide
  picks, whether because none are configured or because the request fails
- **THEN** the home page renders no guide-of-the-week heading, edition trailer, or grid for that
  section

### Requirement: The guide-of-the-week section layout accommodates any number of picks
The guide-of-the-week section SHALL render correctly for any number of active guide picks,
including one, exactly two, more than fit in a single row, and zero. No divider, padding, or
border rule in the layout SHALL depend on a pick's position being the first of exactly two.

#### Scenario: A single pick renders without a dangling divider
- **WHEN** exactly one active guide pick exists
- **THEN** it renders as a complete, self-contained card with no divider implying a missing second
  item

#### Scenario: More picks than fit one row wrap without a missing divider
- **WHEN** enough active guide picks exist that they wrap onto more than one row
- **THEN** every pick, including ones in the second row, renders with the same border and padding
  treatment as picks in the first row
