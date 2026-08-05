## Purpose

Defines the admin-facing article lifecycle: draft/schedule/publish/unpublish/delete, associated metadata (slug, SEO, featured image, categories, tags, author, timestamps), server-side content sanitization, and the admin CRUD API contract.

## ADDED Requirements

### Requirement: Draft creation and automatic saving
Authenticated staff SHALL be able to create a new article, which starts in `draft` status. While editing a draft, the system SHALL automatically persist content changes without requiring an explicit manual save action.

#### Scenario: New article starts as draft
- **WHEN** a staff member creates a new article
- **THEN** the article is stored with status `draft` and no `published_at` value

#### Scenario: Edits are autosaved
- **WHEN** a staff member edits a draft's content and pauses typing
- **THEN** the updated content is persisted without the user clicking a save button

### Requirement: Admin CRUD API
The system SHALL expose authenticated admin endpoints to create, retrieve, update, and delete articles. All admin article endpoints SHALL require a staff session and SHALL reject requests from unauthenticated or non-staff callers.

#### Scenario: Non-staff request rejected
- **WHEN** a request to an admin article endpoint is made without a valid staff session
- **THEN** the system rejects the request and makes no change to any article

#### Scenario: Staff creates an article via API
- **WHEN** an authenticated staff member submits a valid create-article request
- **THEN** the system persists a new article and returns its representation including its id and generated slug

### Requirement: Article preview
Staff SHALL be able to preview a draft or scheduled article rendered as it will appear when published, without changing its status.

#### Scenario: Preview a draft
- **WHEN** a staff member requests a preview of a draft article
- **THEN** the system returns a rendered representation of the current content and the article's status remains `draft`

### Requirement: Publish, unpublish, and delete
Staff SHALL be able to publish a draft or scheduled article immediately, unpublish a published article back to draft, and delete an article regardless of its current status.

#### Scenario: Publish immediately
- **WHEN** a staff member publishes a draft article
- **THEN** the article's status becomes `published` and its `published_at` is set to the current time if not already set

#### Scenario: Unpublish a live article
- **WHEN** a staff member unpublishes a published article
- **THEN** the article's status becomes `draft` and it is no longer returned by any public API

#### Scenario: Delete an article
- **WHEN** a staff member deletes an article, regardless of its status
- **THEN** the article is removed and is no longer retrievable via any admin or public endpoint

### Requirement: Scheduled publishing
Staff SHALL be able to set a future `published_at` timestamp on a draft, placing it in `scheduled` status. The system SHALL treat a scheduled article as published once its `published_at` time has passed, regardless of any background process's timing.

#### Scenario: Schedule for the future
- **WHEN** a staff member sets a future publish time on a draft
- **THEN** the article's status becomes `scheduled` with that `published_at` value

#### Scenario: Scheduled time arrives
- **WHEN** a scheduled article's `published_at` time is at or before the current time
- **THEN** the article is treated as published by every public-facing read, even before any background job has updated its stored status

#### Scenario: Reschedule before the time arrives
- **WHEN** a staff member changes the `published_at` value of a still-future scheduled article
- **THEN** the article remains in `scheduled` status with the updated time

### Requirement: Slug generation and override
The system SHALL automatically generate a URL-safe slug from an article's title, and SHALL allow staff to manually override it. Slugs SHALL be unique across all articles.

#### Scenario: Auto-generated slug
- **WHEN** a staff member creates an article titled "Local Team Wins Regional Cup" without specifying a slug
- **THEN** the system generates a kebab-case, URL-safe slug derived from the title

#### Scenario: Manual override
- **WHEN** a staff member sets a custom slug value for an article
- **THEN** the system stores that value as the article's slug instead of the auto-generated one

#### Scenario: Slug collision
- **WHEN** a staff member saves a slug that already belongs to another article
- **THEN** the system rejects the save with a slug-conflict error, and does not create two articles sharing one slug

### Requirement: Article metadata
Articles SHALL support SEO metadata (title and description), a featured image, one or more categories or tags, an author derived from the authenticated staff member, and creation/update/publication timestamps.

#### Scenario: Save SEO metadata
- **WHEN** a staff member sets an SEO title and description on an article
- **THEN** those values are persisted and returned with the article

#### Scenario: Assign categories and tags
- **WHEN** a staff member assigns a category and one or more tags to an article
- **THEN** the article's stored representation includes those associations

#### Scenario: Author attribution
- **WHEN** a staff member creates an article
- **THEN** the article's author is recorded as that staff member, not a value supplied by the client

### Requirement: Author derived from session
The system SHALL always set an article's `author_id` from the authenticated staff session, and SHALL ignore any `author_id` value present in the request body. Request schemas SHALL NOT declare an `author_id` field.

#### Scenario: Client-supplied author is ignored
- **WHEN** a request to create or update an article includes an `author_id` field in the body
- **THEN** the stored article's `author_id` is the authenticated staff member, not the value from the body

### Requirement: Only sanitized HTML is served publicly
The public read path SHALL return only the stored `body_html` and SHALL never expose the editor's `body_json`. Mappers and response contracts SHALL omit `body_json` from every public response.

#### Scenario: Public response omits body_json
- **WHEN** a client requests a published article via a public endpoint
- **THEN** the response includes `body_html` and any other public fields, but no `body_json` field

### Requirement: Server-side content sanitization
On every save (autosave or explicit), the system SHALL generate sanitized, semantic HTML from the editor's structured content using an allowlist, and SHALL never store or serve unsanitized HTML derived from user input.

#### Scenario: Disallowed markup is stripped
- **WHEN** an article's structured content contains a node or attribute outside the allowlist
- **THEN** the generated HTML omits that node or attribute rather than passing it through unchanged

#### Scenario: Sanitization happens on write, not on read
- **WHEN** an article is saved
- **THEN** its sanitized HTML is generated and stored at save time, and simply read back (not regenerated) on subsequent requests

#### Scenario: Subsequent reads return the stored HTML unchanged
- **WHEN** an article has been saved
- **THEN** every subsequent read (admin or public) returns the stored `body_html` without re-running the sanitizer
