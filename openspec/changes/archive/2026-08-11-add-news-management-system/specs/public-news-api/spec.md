## Purpose

Defines the public, read-only API surface for published news articles, consumed by the public site, with no authentication required and no access to unpublished content.

## ADDED Requirements

### Requirement: Public endpoints require no authentication
Public article endpoints SHALL be reachable without a session, and SHALL explicitly declare themselves public rather than relying on the absence of an authorization declaration.

#### Scenario: Anonymous client can read published articles
- **WHEN** a client with no session requests the public article list or an article by slug
- **THEN** the request is allowed and published content is returned

#### Scenario: Public endpoints ignore caller permissions
- **WHEN** a staff member holding `news.manage` requests a public endpoint
- **THEN** the response contains exactly the same content an anonymous caller would receive, with no unpublished articles included

### Requirement: List published articles
The system SHALL expose a public endpoint that returns published articles ordered by publish date descending, with pagination, and SHALL support filtering by category and by tag.

#### Scenario: Default listing
- **WHEN** a client requests the article list endpoint with no filters
- **THEN** the system returns published articles ordered from most to least recently published, paginated

#### Scenario: Filter by category
- **WHEN** a client requests the article list endpoint with a category filter
- **THEN** only published articles associated with that category are returned, including articles that also belong to other categories

#### Scenario: Filter by tag
- **WHEN** a client requests the article list endpoint with a tag filter
- **THEN** only published articles associated with that tag are returned

#### Scenario: List endpoint serves due-but-unflipped scheduled articles
- **WHEN** one or more articles are in `scheduled` status with `published_at <= now()` but the worker has not yet flipped their stored status
- **THEN** those articles appear in the public list endpoint as if they were already `published`

### Requirement: List pagination
The public list endpoint SHALL accept a result limit and an offset, SHALL apply a default limit when none is given, SHALL cap the limit at a maximum, and SHALL order results deterministically so that paging does not repeat or skip articles.

#### Scenario: Default limit applied
- **WHEN** a client requests the article list endpoint without specifying a limit
- **THEN** the system returns at most the default number of articles

#### Scenario: Limit is capped
- **WHEN** a client requests a limit above the permitted maximum
- **THEN** the system returns at most the maximum rather than the requested amount

#### Scenario: Stable ordering across pages
- **WHEN** a client pages through the list and two articles share the same publication timestamp
- **THEN** the ordering between them is deterministic, so no article is returned on two pages or omitted from all of them

### Requirement: Excluding specific articles from the list
The public list endpoint SHALL accept an optional set of article identifiers to exclude, and SHALL remove those articles from the result before applying the limit.

#### Scenario: Excluded articles are omitted
- **WHEN** a client requests the article list endpoint with a set of article identifiers to exclude
- **THEN** none of those articles appear in the response

#### Scenario: Exclusion is applied before the limit
- **WHEN** a client requests a limit of N with some articles excluded, and enough other published articles exist
- **THEN** the response contains N articles, none of them excluded, rather than fewer than N

#### Scenario: Unknown identifiers are ignored
- **WHEN** the exclusion set contains identifiers that match no article
- **THEN** the request succeeds and those identifiers have no effect on the result

### Requirement: Fetch a single published article by slug
The system SHALL expose a public endpoint that returns a single published article by its slug, including its sanitized HTML content and metadata. The response SHALL include `body_html` and SHALL NOT include `body_json`.

#### Scenario: Existing published article
- **WHEN** a client requests an article by the slug of a published article
- **THEN** the system returns that article's sanitized content, metadata, and publication timestamp

#### Scenario: Unknown slug
- **WHEN** a client requests an article by a slug that does not match any published article
- **THEN** the system returns a not-found response

#### Scenario: Scheduled article whose time has passed is served immediately
- **WHEN** an article is in `scheduled` status with a `published_at` time at or before the current time, and the scheduled-publish worker has not yet flipped its stored status
- **THEN** the public endpoints return that article as if it were already `published`

### Requirement: Public responses carry categories, tags, and a derived featured image URL
Public article representations SHALL include all of the article's categories and all of its tags, and SHALL express the featured image as a URL derived from the referenced media record.

#### Scenario: All categories returned
- **WHEN** a published article belongs to more than one category
- **THEN** the public representation lists every one of those categories, not just one

#### Scenario: Featured image URL is derived
- **WHEN** a published article has a featured image
- **THEN** the response carries a URL derived from the referenced media record rather than a URL stored on the article row

#### Scenario: Article without a featured image
- **WHEN** a published article has no featured image
- **THEN** the response reports no featured image and remains valid

### Requirement: No access to unpublished content
Public endpoints SHALL never return a draft article, a scheduled article whose `published_at` has not yet passed, or any article that has been unpublished or deleted.

#### Scenario: Draft excluded from listing
- **WHEN** an article exists in `draft` status
- **THEN** it does not appear in the public article list and is not retrievable by its slug via any public endpoint

#### Scenario: Future-scheduled article excluded
- **WHEN** an article is `scheduled` with a `published_at` time still in the future
- **THEN** it does not appear in the public article list and is not retrievable by its slug via any public endpoint

#### Scenario: Unpublished article excluded
- **WHEN** a previously published article is unpublished by staff
- **THEN** it immediately stops appearing in the public article list and stops being retrievable by its slug

### Requirement: One canonical public visibility rule
The system SHALL express public visibility once, in the public read query layer, and every public-facing read SHALL use it. No consumer SHALL re-derive the published/scheduled predicate independently.

#### Scenario: List and by-slug agree
- **WHEN** an article is in `scheduled` status with `published_at` at or before the current time
- **THEN** it is returned both by the list endpoint and by the by-slug endpoint, with no window in which one serves it and the other does not
