## Purpose

Defines the admin dashboard capability: a single permission-gated endpoint that reports content-pipeline, content-quality, homepage/reels curation-integrity, scheduling, and reader-activity aggregates computed entirely from existing data — with no new write path, no traffic/view counting, and no per-tile permission gating.

## ADDED Requirements

### Requirement: Permission-gated dashboard endpoint
The system SHALL expose a single admin dashboard endpoint that requires the `dashboard.view` permission. Authorization SHALL be evaluated against the caller's permissions and SHALL NOT branch on the name of any role. No new permission catalog entry SHALL be introduced by this capability.

#### Scenario: Staff member without dashboard.view is rejected
- **WHEN** an authenticated staff member whose role does not include `dashboard.view` requests the dashboard endpoint
- **THEN** the system rejects the request as forbidden and returns no dashboard data

#### Scenario: Staff member with dashboard.view is allowed
- **WHEN** an authenticated staff member whose role includes `dashboard.view` requests the dashboard endpoint
- **THEN** the system returns the dashboard data described by this capability

#### Scenario: Anonymous caller cannot reach the dashboard
- **WHEN** a client with no session requests the dashboard endpoint
- **THEN** the system rejects the request as unauthenticated

#### Scenario: No new permission is required
- **WHEN** the permission catalog is inspected after this capability is deployed
- **THEN** it contains no dashboard-specific entry beyond the existing `dashboard.view`, and no tile requires any additional permission to appear in the response

### Requirement: Content pipeline counts
The system SHALL report the current count of articles in each status: `draft`, `scheduled`, and `published`.

#### Scenario: Pipeline counts reflect current state
- **WHEN** the dashboard endpoint is requested
- **THEN** the response includes the count of articles with status `draft`, the count with status `scheduled`, and the count with status `published`, each reflecting the database at request time

### Requirement: Publishing cadence
The system SHALL report the count of articles published per calendar week for the eight most recent calendar weeks, with weeks bucketed using the `Asia/Jakarta` calendar.

#### Scenario: Cadence covers eight weeks including weeks with zero publications
- **WHEN** the dashboard endpoint is requested
- **THEN** the response includes exactly eight weekly buckets covering the most recent eight calendar weeks, and a week in which no article was published appears with a count of zero rather than being omitted

#### Scenario: Week boundaries use the Asia/Jakarta calendar
- **WHEN** an article's `published_at` falls near a UTC day boundary such that its `Asia/Jakarta` calendar week differs from its UTC calendar week
- **THEN** the article is counted in the weekly bucket corresponding to its `Asia/Jakarta` week, not its UTC week

### Requirement: Content debt counts
The system SHALL report, among currently published articles, the count missing an SEO description, the count missing an excerpt, the count missing a featured image, and the count with no assigned category. The system SHALL separately report, across all media regardless of the status of any article referencing it, the count of media missing alt text, and, across all tags regardless of article status, the count of tags with no associated article.

#### Scenario: Published article missing SEO description is counted
- **WHEN** a published article has no SEO description
- **THEN** it is included in the missing-SEO-description count

#### Scenario: Draft article missing SEO description is not counted
- **WHEN** a draft article has no SEO description
- **THEN** it is not included in the missing-SEO-description count

#### Scenario: Media missing alt text is counted regardless of the referencing article's status
- **WHEN** a media record has no alt text and is referenced only by a draft article's body content
- **THEN** it is included in the missing-alt-text count

#### Scenario: Tag with no article associations is counted as unused
- **WHEN** a tag has zero rows associating it with any article, of any status
- **THEN** it is included in the unused-tags count

#### Scenario: Tag with only draft-article associations is not counted as unused
- **WHEN** a tag is associated with at least one article, regardless of that article's status
- **THEN** it is not included in the unused-tags count

### Requirement: Homepage and reels curation integrity
The system SHALL report, for the homepage curation ordering, the total number of curated entries and the number whose underlying article is publicly visible by the same predicate the public homepage feed uses. The system SHALL report the equivalent pair of counts for the reels curation ordering, using the same predicate the public reels rail uses.

#### Scenario: Curated article that is no longer publicly visible is excluded from the visible count
- **WHEN** an article is present in the homepage curation ordering but its current status and publish time do not satisfy public visibility
- **THEN** it is included in the total curated count and excluded from the visible count

#### Scenario: Curated reel marked unavailable is excluded from the visible count
- **WHEN** a reel is present in the reels curation ordering with status `unavailable`
- **THEN** it is included in the total curated count and excluded from the visible count

#### Scenario: Fully visible ordering reports equal totals
- **WHEN** every entry in a curation ordering is publicly visible
- **THEN** the visible count equals the total count for that ordering

### Requirement: Upcoming and overdue scheduled articles
The system SHALL report scheduled articles whose `published_at` falls within the next 48 hours, and SHALL separately report a count of scheduled articles whose `published_at` has already passed. This overdue count SHALL be presented as a scheduling-worker health signal, not as an indication that content has failed to publish.

#### Scenario: Article scheduled within 48 hours appears in the due-soon list
- **WHEN** an article has status `scheduled` and a `published_at` between the current time and 48 hours from now
- **THEN** it appears in the due-soon list

#### Scenario: Article scheduled beyond 48 hours does not appear in the due-soon list
- **WHEN** an article has status `scheduled` and a `published_at` more than 48 hours from now
- **THEN** it does not appear in the due-soon list

#### Scenario: Overdue scheduled article is counted regardless of worker state
- **WHEN** an article has status `scheduled` and a `published_at` in the past, whether or not the scheduled-publish worker has yet promoted it to `published`
- **THEN** it is included in the overdue count

### Requirement: Reader growth and activity
The system SHALL report the count of readers created within the trailing 7 days and the count of readers whose last login falls within the trailing 30 days. This data SHALL be presented as sign-in activity, and SHALL NOT be presented or labeled as page-view or traffic data.

#### Scenario: Recently created reader is counted as new
- **WHEN** a reader account was created within the trailing 7 days
- **THEN** it is included in the new-readers count

#### Scenario: Reader with a recent login is counted as active
- **WHEN** a reader's `last_login_at` falls within the trailing 30 days
- **THEN** it is included in the active-readers count

#### Scenario: Reader who never logged in is not counted as active
- **WHEN** a reader has no `last_login_at` recorded
- **THEN** it is not included in the active-readers count

### Requirement: No traffic or view-counting data
The system SHALL NOT report page-view counts, unique-visitor counts, or any other traffic metric as part of this capability.

#### Scenario: Dashboard response contains no view or traffic fields
- **WHEN** the dashboard endpoint response is inspected
- **THEN** it contains no field representing page views, unique visitors, or any other traffic count
