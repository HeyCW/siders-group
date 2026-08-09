## Purpose

Defines the admin-facing article lifecycle: draft/schedule/publish/unpublish/delete, associated metadata (slug, SEO, featured media, categories, tags, author, timestamps), permission-gated access, server-side content sanitization, and the admin CRUD API contract.

## ADDED Requirements

### Requirement: Permission-gated article endpoints
Every admin article endpoint SHALL declare the `news.manage` permission. Authorization SHALL be evaluated against the caller's permissions, and SHALL NOT branch on the name of any role. A caller holding an active staff session but lacking `news.manage` SHALL be rejected.

#### Scenario: Staff member without news.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `news.manage` requests any admin article endpoint
- **THEN** the system rejects the request as forbidden and makes no change to any article

#### Scenario: Staff member with news.manage is allowed
- **WHEN** an authenticated staff member whose role includes `news.manage` requests an admin article endpoint
- **THEN** the request is allowed

#### Scenario: Unauthenticated request rejected
- **WHEN** a request to an admin article endpoint is made without a valid staff session
- **THEN** the system rejects the request and makes no change to any article

#### Scenario: Authorization does not depend on role names
- **WHEN** a role that grants `news.manage` is renamed, or a new role granting `news.manage` is created at runtime
- **THEN** callers holding that role retain access to admin article endpoints without any code or configuration change

### Requirement: Draft creation and automatic saving
Staff holding `news.manage` SHALL be able to create a new article, which starts in `draft` status. While editing a draft, the system SHALL automatically persist content changes without requiring an explicit manual save action. Autosave SHALL NOT change the article's slug or its status.

#### Scenario: New article starts as draft
- **WHEN** a staff member creates a new article
- **THEN** the article is stored with status `draft` and no `published_at` value

#### Scenario: Edits are autosaved
- **WHEN** a staff member edits a draft's content and pauses typing
- **THEN** the updated content is persisted without the user clicking a save button

#### Scenario: Autosave never alters the slug
- **WHEN** a staff member edits the title of an article that already has a slug, and autosave fires
- **THEN** the article's slug is unchanged and the autosave succeeds without a slug-conflict error

### Requirement: Admin CRUD API
The system SHALL expose admin endpoints to create, retrieve, update, and delete articles, each gated on `news.manage`.

#### Scenario: Staff creates an article via API
- **WHEN** a staff member holding `news.manage` submits a valid create-article request
- **THEN** the system persists a new article and returns its representation including its id and generated slug

### Requirement: Article preview
Staff holding `news.manage` SHALL be able to preview a draft or scheduled article rendered as it will appear when published, without changing its status.

#### Scenario: Preview a draft
- **WHEN** a staff member requests a preview of a draft article
- **THEN** the system returns a rendered representation of the current content and the article's status remains `draft`

### Requirement: Publish, unpublish, and delete
Staff holding `news.manage` SHALL be able to publish a draft or scheduled article immediately, unpublish a published article back to draft, and delete an article regardless of its current status.

#### Scenario: Publish immediately
- **WHEN** a staff member publishes a draft article
- **THEN** the article's status becomes `published` and its `published_at` is set to the current time

#### Scenario: Publishing a scheduled article early overwrites its future timestamp
- **WHEN** a staff member publishes an article that is `scheduled` with a `published_at` in the future
- **THEN** the article's status becomes `published` and its `published_at` is replaced with the current time, so no published article ever carries a future publication timestamp

#### Scenario: Unpublish a live article
- **WHEN** a staff member unpublishes a published article
- **THEN** the article's status becomes `draft`, its `published_at` is cleared to no value, and it is no longer returned by any public API

#### Scenario: Republish after unpublish
- **WHEN** a staff member publishes an article that was previously published and then unpublished
- **THEN** its `published_at` is set to the current time rather than to any earlier publication time

#### Scenario: Delete an article
- **WHEN** a staff member deletes an article, regardless of its status
- **THEN** the article is removed and is no longer retrievable via any admin or public endpoint, and its category and tag associations are removed with it

### Requirement: Scheduled publishing
Staff holding `news.manage` SHALL be able to set a future `published_at` timestamp on a draft, placing it in `scheduled` status. The system SHALL treat a scheduled article as published once its `published_at` time has passed, regardless of any background process's timing.

#### Scenario: Schedule for the future
- **WHEN** a staff member sets a future publish time on a draft
- **THEN** the article's status becomes `scheduled` with that `published_at` value

#### Scenario: Scheduled time arrives
- **WHEN** a scheduled article's `published_at` time is at or before the current time
- **THEN** the article is treated as published by every public-facing read, even before any background job has updated its stored status

#### Scenario: Reschedule before the time arrives
- **WHEN** a staff member changes the `published_at` value of a still-future scheduled article
- **THEN** the article remains in `scheduled` status with the updated time

#### Scenario: Worker promotion preserves the scheduled time
- **WHEN** the scheduled-publish worker promotes an article whose `published_at` has passed
- **THEN** the article's status becomes `published` and its `published_at` retains the scheduled time rather than being reset to the promotion time

### Requirement: Slug generation and override
The system SHALL automatically generate a URL-safe slug from an article's title when the article has no slug yet, and SHALL allow staff to manually override it at any time. Once an article has a slug, the system SHALL NOT regenerate it — not on a title change, not on autosave, and not on publish. Slugs SHALL be unique across all articles.

#### Scenario: Auto-generated slug
- **WHEN** a staff member creates an article titled "Local Team Wins Regional Cup" without specifying a slug
- **THEN** the system generates a kebab-case, URL-safe slug derived from the title

#### Scenario: Manual override
- **WHEN** a staff member sets a custom slug value for an article
- **THEN** the system stores that value as the article's slug instead of the auto-generated one

#### Scenario: Title change does not move an existing slug
- **WHEN** a staff member changes the title of an article that already has a slug
- **THEN** the article's slug is unchanged

#### Scenario: Slug collision
- **WHEN** a staff member saves a slug that already belongs to another article
- **THEN** the system rejects the save with a slug-conflict error, and does not create two articles sharing one slug

### Requirement: Article metadata
Articles SHALL support SEO metadata (title and description), a featured image referenced from the media library, zero or more categories, zero or more tags, an author derived from the authenticated staff member, and creation/update/publication timestamps.

#### Scenario: Save SEO metadata
- **WHEN** a staff member sets an SEO title and description on an article
- **THEN** those values are persisted and returned with the article

#### Scenario: Author attribution
- **WHEN** a staff member creates an article
- **THEN** the article's author is recorded as that staff member, not a value supplied by the client

### Requirement: Featured image references a media record
An article's featured image SHALL be stored as a reference to an `app.media` record (`featured_media_id`), and SHALL NOT be stored as an independent URL on the article. The displayed URL SHALL be derived from the referenced media record when the article is mapped for a response.

#### Scenario: Assign a featured image
- **WHEN** a staff member sets an uploaded media item as an article's featured image
- **THEN** the article stores a reference to that media record, and responses expose a URL derived from the media record rather than a URL stored on the article

#### Scenario: Referenced media is deleted
- **WHEN** a media record referenced as an article's featured image is deleted
- **THEN** the article's featured image reference is cleared and the article itself remains intact and retrievable

#### Scenario: Article without a featured image
- **WHEN** an article has no featured image assigned
- **THEN** the article is valid, saveable, and publishable, and its representation reports no featured image

### Requirement: Articles carry multiple categories and multiple tags
An article SHALL be assignable to any number of categories and any number of tags. Assigning categories or tags to an article is an article edit and SHALL be gated on `news.manage`.

#### Scenario: Assign several categories
- **WHEN** a staff member assigns two or more categories to one article
- **THEN** all of those categories are persisted as associations of that article and are returned with it

#### Scenario: Assign categories and tags together
- **WHEN** a staff member assigns one or more categories and one or more tags to an article
- **THEN** the article's stored representation includes all of those associations

#### Scenario: Replace an article's categories
- **WHEN** a staff member saves an article with a category set that omits a previously assigned category
- **THEN** the omitted association is removed and only the submitted categories remain associated

#### Scenario: Article with no categories
- **WHEN** an article is saved with no categories assigned
- **THEN** the save succeeds and the article is publishable

#### Scenario: Assigning taxonomy requires news.manage, not category.manage
- **WHEN** a staff member holding `news.manage` but not `category.manage` assigns an existing category to an article
- **THEN** the assignment succeeds, because attaching existing taxonomy to an article is an article edit rather than a change to the category catalog

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

### Requirement: Public pages are revalidated when an article changes
When an article change alters what the public site would render, the system SHALL request revalidation of the article's detail path, the news listing path, and the homepage path. A failed revalidation SHALL NOT fail the write that triggered it.

#### Scenario: Publishing revalidates all affected paths
- **WHEN** a staff member publishes an article
- **THEN** the system requests revalidation of `/news/<slug>`, `/news`, and `/`

#### Scenario: Unpublishing and deletion revalidate all affected paths
- **WHEN** a staff member unpublishes or deletes a publicly visible article
- **THEN** the system requests revalidation of `/news/<slug>`, `/news`, and `/`

#### Scenario: Revalidation failure does not fail the write
- **WHEN** an article is published successfully but the revalidation request fails
- **THEN** the publish is still committed and reported as successful, and the failure is logged
