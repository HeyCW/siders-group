## MODIFIED Requirements

### Requirement: Draft creation and automatic saving
Staff holding `news.manage` SHALL be able to create a new article, which starts in `draft` status. While editing a draft, the system SHALL automatically persist content changes without requiring an explicit manual save action. Autosave SHALL NOT change the article's slug, its status, or its hyperlocal spotlight flag.

#### Scenario: New article starts as draft
- **WHEN** a staff member creates a new article
- **THEN** the article is stored with status `draft` and no `published_at` value

#### Scenario: Edits are autosaved
- **WHEN** a staff member edits a draft's content and pauses typing
- **THEN** the updated content is persisted without the user clicking a save button

#### Scenario: Autosave never alters the slug
- **WHEN** a staff member edits the title of an article that already has a slug, and autosave fires
- **THEN** the article's slug is unchanged and the autosave succeeds without a slug-conflict error

#### Scenario: Autosave never alters the spotlight
- **WHEN** a staff member edits the content of an article and autosave fires
- **THEN** whichever article holds the hyperlocal spotlight still holds it, and the autosave succeeds

### Requirement: Article metadata
Articles SHALL support SEO metadata (title and description), a featured image referenced from the media library, zero or more categories, zero or more tags, an author derived from the authenticated staff member, creation/update/publication timestamps, and a hyperlocal spotlight flag settable on create and update. The spotlight flag SHALL be presented as an article field in the admin API while the spotlight itself is stored as a single global slot, so that setting it on one article releases it from any other.

#### Scenario: Save SEO metadata
- **WHEN** a staff member sets an SEO title and description on an article
- **THEN** those values are persisted and returned with the article

#### Scenario: Author attribution
- **WHEN** a staff member creates an article
- **THEN** the article's author is recorded as that staff member, not a value supplied by the client

#### Scenario: Spotlight flag is part of the article write shape
- **WHEN** a staff member creates or updates an article with the hyperlocal spotlight flag set
- **THEN** the flag is accepted on that request and the article is reported as holding the spotlight

#### Scenario: Spotlight flag is not stored on the article row
- **WHEN** the articles table is inspected after an article is spotlighted
- **THEN** it carries no spotlight column, and the spotlight is recorded in its own single-slot storage
