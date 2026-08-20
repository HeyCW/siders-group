## MODIFIED Requirements

### Requirement: Every route renders real backend data, never invented data
No route SHALL render article, category, or reel content that did not come from `apps/api`. Where the visual design implies a capability the backend does not provide (full-text search across the archive, comments, likes, share counts, contact submission), the page SHALL either omit that element's data-dependent behavior or clearly scope it (e.g. "search this page" rather than "search stories") rather than fabricate a plausible-looking result.

#### Scenario: No hardcoded sample content ships
- **WHEN** any of the four routes is rendered
- **THEN** no article title, comment, comment count, share count, or like count from the design prototype's sample data appears in the output

#### Scenario: A missing capability is visibly scoped, not silently faked
- **WHEN** a page element corresponds to a capability the backend does not implement (e.g. the News page's Urutkan sort control)
- **THEN** interacting with that element has no effect on the displayed results, and no request is made that pretends to filter or sort by it

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
