## Purpose

Defines the public, read-only API surface for published news articles, consumed by the public site, with no authentication required and no access to unpublished content.

## ADDED Requirements

### Requirement: List published articles
The system SHALL expose a public endpoint that returns published articles ordered by publish date descending, with pagination, and SHALL support filtering by category and by tag.

#### Scenario: Default listing
- **WHEN** a client requests the article list endpoint with no filters
- **THEN** the system returns published articles ordered from most to least recently published, paginated

#### Scenario: Filter by category
- **WHEN** a client requests the article list endpoint with a category filter
- **THEN** only published articles assigned to that category are returned

#### Scenario: Filter by tag
- **WHEN** a client requests the article list endpoint with a tag filter
- **THEN** only published articles associated with that tag are returned

#### Scenario: List endpoint serves due-but-unflipped scheduled articles
- **WHEN** one or more articles are in `scheduled` status with `published_at <= now()` but the worker has not yet flipped their stored status
- **THEN** those articles appear in the public list endpoint as if they were already `published`

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
