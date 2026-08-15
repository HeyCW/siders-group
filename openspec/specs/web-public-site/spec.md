# web-public-site Specification

## Purpose

Defines `apps/web`'s public-facing rendering behavior across `/`, `/news`, `/news/[slug]`, and `/contact`: what each route fetches from the real backend, how `/news`'s filter bar behaves given which filters that backend actually supports, how the Article detail's related rail and engagement bar are composed, how the Reels rail defers third-party embeds until activation, and the rule that no route may render fabricated data in place of a capability the backend does not yet provide.

## Requirements

### Requirement: Every route renders real backend data, never invented data
No route SHALL render article, category, or reel content that did not come from `apps/api`. Where the visual design implies a capability the backend does not provide (sub-brand filtering, full-text search across the archive, comments, likes, share counts, contact submission), the page SHALL either omit that element's data-dependent behavior or clearly scope it (e.g. "search this page" rather than "search stories") rather than fabricate a plausible-looking result.

#### Scenario: No hardcoded sample content ships
- **WHEN** any of the four routes is rendered
- **THEN** no article title, comment, comment count, share count, or like count from the design prototype's sample data appears in the output

#### Scenario: A missing capability is visibly scoped, not silently faked
- **WHEN** a page element corresponds to a capability the backend does not implement (e.g. the News page's Anak usaha filter)
- **THEN** interacting with that element has no effect on the displayed results, and no request is made that pretends to filter by it

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

### Requirement: News page category filtering is real; unsupported filters are inert
The News page SHALL fetch articles filtered by a single category slug taken from the URL's query string, so that a filtered URL is shareable and reloadable. Filter controls corresponding to sub-brand, date range, or sort SHALL be visually present per the approved design but SHALL have no effect on the displayed results.

#### Scenario: Selecting a category updates the URL and the results
- **WHEN** a visitor selects a category from the Kategori filter
- **THEN** the URL's query string reflects the selected category and the displayed articles are limited to that category

#### Scenario: A filtered URL is shareable
- **WHEN** a visitor loads a `/news` URL that already carries a category query parameter
- **THEN** the page renders already filtered to that category, with no additional interaction required

#### Scenario: Only one category can be active at a time
- **WHEN** a visitor selects a second category while one is already active
- **THEN** the second selection replaces the first rather than both applying together

#### Scenario: Sub-brand, date, and sort controls do not filter results
- **WHEN** a visitor interacts with the Anak usaha, Tanggal, or Urutkan controls
- **THEN** the displayed article set is unchanged

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
The News page SHALL show an explicit empty state when the active category filter and search term together produce no results, offering a control that clears the active category filter.

#### Scenario: Empty state appears when nothing matches
- **WHEN** the active category filter and search term together match no loaded articles
- **THEN** an empty-state message is shown instead of an empty grid

#### Scenario: Clearing filters recovers results
- **WHEN** a visitor activates the empty state's clear-filters control
- **THEN** the category filter is removed from the URL and the full unfiltered result set is fetched

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

### Requirement: Article engagement affordances carry no fabricated activity
The like button, comment count, share count, and comment composer SHALL render with the approved design's visual treatment but SHALL display no fabricated count and SHALL NOT submit a comment, like, or share to any endpoint.

#### Scenario: No count is fabricated
- **WHEN** the engagement bar renders
- **THEN** it shows no comment count, like count, or share count that did not come from a real backend response

#### Scenario: Comment submission is inert
- **WHEN** a visitor attempts to submit a comment
- **THEN** no request is sent to any backend endpoint, and the visitor sees an indication that commenting is not yet available

### Requirement: Contact form validates client-side and does not fabricate submission success
The Contact page's message form SHALL validate required fields and email format before allowing submission, and SHALL NOT report a successful submission or silently discard input, since no backend endpoint accepts a contact submission.

#### Scenario: Invalid input blocks submission
- **WHEN** a visitor attempts to submit the contact form with a missing required field or a malformed email
- **THEN** submission is blocked and the invalid field is indicated

#### Scenario: Valid submission is honestly reported as not yet available
- **WHEN** a visitor submits the contact form with all fields valid
- **THEN** the page shows that sending is not yet available and provides a direct email address as an alternative, rather than indicating the message was sent
