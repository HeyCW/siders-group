## MODIFIED Requirements

### Requirement: List published articles
The system SHALL expose a public endpoint that returns published articles ordered by publish date
descending, with pagination, and SHALL support filtering by one or more categories, by tag, by one
or more anak usaha, and by a published-date range.

#### Scenario: Default listing
- **WHEN** a client requests the article list endpoint with no filters
- **THEN** the system returns published articles ordered from most to least recently published, paginated

#### Scenario: Filter by category
- **WHEN** a client requests the article list endpoint with a category filter
- **THEN** only published articles associated with that category are returned, including articles that also belong to other categories

#### Scenario: Filter by multiple categories
- **WHEN** a client requests the article list endpoint with more than one category slug
- **THEN** the system returns published articles associated with at least one of those categories, rather than requiring all of them

#### Scenario: Filter by tag
- **WHEN** a client requests the article list endpoint with a tag filter
- **THEN** only published articles associated with that tag are returned

#### Scenario: Filter by one or more anak usaha
- **WHEN** a client requests the article list endpoint with one or more anak usaha slugs
- **THEN** the system returns only published articles whose associated anak usaha matches one of those slugs

#### Scenario: Filter by published-date range
- **WHEN** a client requests the article list endpoint with a `publishedAfter` and/or `publishedBefore` bound
- **THEN** the system returns only published articles whose `published_at` falls within the given bound(s)

#### Scenario: Combined filters narrow further
- **WHEN** a client requests the article list endpoint with a category filter, an anak usaha filter, and a date range together
- **THEN** the system returns only published articles satisfying all of the given filters at once

#### Scenario: List endpoint serves due-but-unflipped scheduled articles
- **WHEN** one or more articles are in `scheduled` status with `published_at <= now()` but the worker has not yet flipped their stored status
- **THEN** those articles appear in the public list endpoint as if they were already `published`
