## MODIFIED Requirements

### Requirement: Every route renders real backend data, never invented data
No route SHALL render article, category, or guide-pick content that did not come from `apps/api`.
Where the visual design implies a capability the backend does not provide (full-text search across
the archive, comments, likes, share counts, contact submission), the page SHALL either omit that
element's data-dependent behavior or clearly scope it (e.g. "search this page" rather than "search
stories") rather than fabricate a plausible-looking result.

#### Scenario: No fabricated search scope
- **WHEN** a page element visually implies full-text search across the entire archive
- **THEN** interacting with that element has no effect on the displayed results, and no request is made that pretends to filter or sort by it

### Requirement: Home page composes the curated feed and the guideline video section
`/` SHALL render its article showcase from the public home feed endpoint and its guideline video
section from the guide-of-the-week-management capability's public listing, and SHALL request
revalidation at a 60-second interval consistent with `docs/ARCHITECTURE.md` §8.1.

#### Scenario: Showcase reflects the curated feed
- **WHEN** the home feed endpoint returns curated articles followed by chronologically backfilled ones
- **THEN** the homepage showcase renders them in that same order, with no distinction shown between curated and backfilled entries

#### Scenario: Guideline section reflects the public listing in order
- **WHEN** the guide-of-the-week-management capability's public listing returns an ordered set of
  active guide picks
- **THEN** the homepage guideline section renders them in that order, each represented by its
  poster image before playback and grouped by city as described below

### Requirement: The guide-of-the-week section renders real, admin-managed picks
The home page's "Siders Guideline of the Week" section SHALL render the active guide picks returned
by the guide-of-the-week-management capability's public listing, grouped by city, and SHALL NOT
render any hardcoded or placeholder guide-pick content.

#### Scenario: Guide picks come from the backend
- **WHEN** the home page renders its guideline-of-the-week section
- **THEN** every pick shown corresponds to an active guide-pick record, and no placeholder city,
  place, description, video, or poster appears

#### Scenario: No guide picks means no section
- **WHEN** the guide-of-the-week-management capability's public listing returns no active guide
  picks, whether because none are configured or because the request fails
- **THEN** the home page renders no guideline-of-the-week heading or grid for that section

## ADDED Requirements

### Requirement: The guideline section groups its videos by city
The homepage's guideline-of-the-week section SHALL group the picks it renders by city, presenting
each city as its own labeled group. Grouping SHALL be derived entirely from the public listing's
existing order and each entry's city value: no fixed or hardcoded set of cities SHALL be used, and a
city not seen before SHALL form its own group with no code change.

A city group's position among the other groups SHALL be determined by the position of that city's
first-appearing pick in the public listing's order. Within a group, picks SHALL appear in the order
the public listing returns them.

City values SHALL be compared for grouping purposes case-insensitively and with surrounding
whitespace ignored, so that trivially different spellings of the same city do not form separate
groups. The label displayed for a group SHALL be the city value as first encountered.

#### Scenario: Picks are grouped by city
- **WHEN** the public listing contains picks for more than one city
- **THEN** the homepage renders one labeled group per distinct city, each containing only that
  city's picks

#### Scenario: A new city needs no code change
- **WHEN** the public listing contains a pick whose city has not appeared before
- **THEN** the homepage renders it as its own group without any change to the deployed code

#### Scenario: Group order follows first appearance in the editorial order
- **WHEN** the public listing's order places a Jakarta pick before any Surabaya pick
- **THEN** the Jakarta group renders before the Surabaya group

#### Scenario: Case and whitespace do not split a city into two groups
- **WHEN** the public listing contains picks with city values that differ only in case or
  surrounding whitespace, such as "Surabaya" and " surabaya "
- **THEN** they render as a single group, labeled with the city value as it first appeared

#### Scenario: A single active city renders one group
- **WHEN** every active guide pick shares the same city
- **THEN** the homepage renders exactly one group, with no empty group for any other city

### Requirement: Guideline videos play only on activation
Video playback for each guideline pick SHALL begin only when a visitor activates that pick, and
activating one pick SHALL NOT begin playback for any other pick.

#### Scenario: No video plays before activation
- **WHEN** the homepage's guideline section renders and a visitor does not interact with it
- **THEN** no pick's video is playing

#### Scenario: Activation plays exactly one video
- **WHEN** a visitor activates a single guideline pick
- **THEN** that pick's video begins playback, and every other pick's video remains unplayed

#### Scenario: Closing playback stops cleanly
- **WHEN** a visitor closes an actively playing guideline pick
- **THEN** that pick's video stops, with no video left playing in the background

## REMOVED Requirements

### Requirement: Reels defer third-party embeds until user activation

**Reason**: The reels capability is removed. The vertical-video section it served is superseded by
the guideline-of-the-week section rendering self-hosted video, which needs no third-party embed to
defer in the first place — see "Guideline videos play only on activation" above.

**Migration**: There is no reels rail to migrate; it is deleted from the homepage along with its
admin surface. Visitors who previously saw the reels rail now see only the guideline-of-the-week
section, in its new grouped, video-carrying form.
