# home-curation Specification

## Purpose

Defines the curated homepage list: a single ordered selection of articles that lead the public homepage, its permission-gated admin surface, the whole-list replacement write semantics, and the composed public endpoint that serves curated picks followed by chronological backfill.

## Requirements

### Requirement: Permission-gated curation endpoints
Every admin endpoint that reads or writes the curated list SHALL declare the `news.manage` permission. Authorization SHALL be evaluated against the caller's permissions and SHALL NOT branch on the name of any role. No new permission catalog entry SHALL be introduced by this capability.

#### Scenario: Staff member without news.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `news.manage` attempts to read or replace the curated list
- **THEN** the system rejects the request as forbidden and the curated list is unchanged

#### Scenario: Staff member with news.manage is allowed
- **WHEN** an authenticated staff member whose role includes `news.manage` replaces the curated list
- **THEN** the request is allowed and the new order is persisted

#### Scenario: Anonymous caller cannot reach the admin surface
- **WHEN** a client with no session requests the admin curation endpoints
- **THEN** the system rejects the request as unauthenticated

#### Scenario: No new permission is required to curate
- **WHEN** the permission catalog is inspected after this capability is deployed
- **THEN** it contains no curation-specific entry, and the ability to curate is carried entirely by `news.manage`

### Requirement: A single ordered curated list
The system SHALL maintain exactly one curated list, applying to the homepage only. The list SHALL be ordered, and its order SHALL be preserved across reads. The stored representation SHALL carry order only and SHALL NOT encode layout positions, slot names, or presentation roles.

#### Scenario: Order is preserved
- **WHEN** a staff member saves a curated list in a given order and later reads it back
- **THEN** the articles are returned in exactly that order

#### Scenario: Order survives unrelated article edits
- **WHEN** a curated article's title, body, categories, or tags are edited
- **THEN** its position in the curated list is unchanged

#### Scenario: No layout information is stored
- **WHEN** the curated list is read
- **THEN** each entry carries its article and its ordinal position, and carries no slot name, size, or layout role

### Requirement: Curation is replaced as a whole list
The write endpoint SHALL accept a complete ordered collection of article identifiers and SHALL replace the entire curated list with it. Positions SHALL be derived from the submitted order rather than supplied by the client. The replacement SHALL be atomic: either the whole new list is stored or the previous list remains entirely intact. The system SHALL NOT expose an endpoint that moves, inserts, or removes an individual entry.

#### Scenario: Replacement overwrites the previous list
- **WHEN** a staff member submits a new ordered collection of article identifiers
- **THEN** the curated list afterwards contains exactly those articles in exactly that order, and no article from the previous list remains unless it was resubmitted

#### Scenario: Client does not supply positions
- **WHEN** a staff member submits an ordered collection of article identifiers
- **THEN** the system assigns each entry's position from its place in the submitted order, and any position value supplied by the client is ignored

#### Scenario: Reordering is expressed as a replacement
- **WHEN** a staff member changes the order of two already-curated articles
- **THEN** the change is submitted as the full resulting order and is applied without any intermediate state in which two entries share a position

#### Scenario: A rejected write leaves the list untouched
- **WHEN** a submitted collection fails validation
- **THEN** the previously stored curated list remains exactly as it was, with no entries added, removed, or reordered

#### Scenario: Clearing the list
- **WHEN** a staff member submits an empty collection
- **THEN** the curated list becomes empty and the request succeeds

#### Scenario: Concurrent replacements do not fail
- **WHEN** two staff members submit different replacement collections at the same time
- **THEN** both requests succeed, the curated list afterwards matches exactly one of the two submitted collections in full, and neither request is rejected because of the other

#### Scenario: A concurrent article deletion does not deadlock a replacement
- **WHEN** a staff member replaces the curated list at the same time as any article is hard-deleted
- **THEN** each request completes with a normal success or a normal validation failure, and neither request fails with an internal error caused by the other

### Requirement: Curated list validation
The system SHALL reject a submitted collection that contains more entries than the permitted maximum, that names the same article more than once, or that names an article that does not exist. The permitted maximum SHALL be ten entries. There SHALL be no minimum.

#### Scenario: Too many entries rejected
- **WHEN** a staff member submits more than the permitted maximum number of article identifiers
- **THEN** the system rejects the request and the curated list is unchanged

#### Scenario: Duplicate entries rejected
- **WHEN** a staff member submits a collection naming the same article twice
- **THEN** the system rejects the request and no article occupies two positions

#### Scenario: Unknown article rejected
- **WHEN** a staff member submits a collection containing an identifier that matches no article
- **THEN** the system rejects the request and the curated list is unchanged

#### Scenario: Empty collection accepted
- **WHEN** a staff member submits a collection with no entries
- **THEN** the request succeeds, because there is no minimum number of curated articles

### Requirement: Articles that are not publicly visible may be curated
The system SHALL permit an article in any status to be curated, including a draft and an article scheduled for a future time. Such an entry SHALL be stored and SHALL contribute nothing to public output until the article becomes publicly visible, at which point it SHALL appear in its stored position without further editorial action.

#### Scenario: Draft article can be curated
- **WHEN** a staff member curates an article in `draft` status
- **THEN** the write succeeds and the entry is stored

#### Scenario: Curated draft is absent from public output
- **WHEN** the curated list contains an article in `draft` status
- **THEN** that article does not appear in the public homepage feed

#### Scenario: Curated scheduled article appears at its scheduled time
- **WHEN** the curated list contains an article scheduled for a future time, and that time passes
- **THEN** the article appears in the public homepage feed in its stored curated position, with no further curation write

#### Scenario: Position is held while invisible
- **WHEN** an invisible curated article later becomes publicly visible, and other curated articles precede and follow it in the stored order
- **THEN** it appears between exactly those articles, in the order originally saved

### Requirement: Admin reads report each entry's visibility
The admin read endpoint SHALL return every stored entry, including entries whose articles are not publicly visible, and SHALL report for each entry enough information to determine whether it is currently live.

#### Scenario: Invisible entries are returned to staff
- **WHEN** a staff member reads the curated list and some entries reference draft or future-scheduled articles
- **THEN** all entries are returned, not only the publicly visible ones

#### Scenario: Live status is reported per entry
- **WHEN** a staff member reads the curated list
- **THEN** each entry reports its article's status and whether that article is currently publicly visible

### Requirement: Feed request limit
The public homepage feed endpoint SHALL accept an optional result limit, SHALL apply a default limit when none is given, and SHALL cap the limit at the same maximum as the public article list endpoint.

#### Scenario: Default limit applied
- **WHEN** a client requests the homepage feed without specifying a limit
- **THEN** the system returns at most the default number of articles

#### Scenario: Limit is capped
- **WHEN** a client requests a limit above the permitted maximum
- **THEN** the system returns at most the maximum rather than the requested amount

### Requirement: Public homepage feed composes curated picks with chronological backfill
The system SHALL expose a public endpoint that returns a single ordered collection for the homepage, consisting of the publicly visible curated articles in their stored order, followed by the most recently published articles not already present, up to a requested limit. The endpoint SHALL require no authentication.

#### Scenario: Curated articles lead the feed
- **WHEN** a client requests the homepage feed and publicly visible curated articles exist
- **THEN** those articles occupy the leading positions of the response, in their stored curated order

#### Scenario: Remainder is filled chronologically
- **WHEN** the number of visible curated articles is fewer than the requested limit
- **THEN** the remaining positions are filled with published articles ordered from most to least recently published

#### Scenario: No article appears twice
- **WHEN** a curated article would also qualify for the chronological remainder
- **THEN** it appears exactly once in the response, in its curated position

#### Scenario: Empty curation yields a chronological feed
- **WHEN** the curated list is empty
- **THEN** the homepage feed contains only published articles ordered from most to least recently published

#### Scenario: Feed is filled to the limit
- **WHEN** a client requests a limit of N, the curated list contributes fewer than N visible articles, and enough other published articles exist
- **THEN** the response contains N articles rather than fewer

#### Scenario: More curated articles than the limit truncates rather than overflows
- **WHEN** the number of visible curated articles is at or above the requested limit N
- **THEN** the response contains exactly N articles, all of them curated, in their stored order, and the response is not larger than N

#### Scenario: Anonymous and staff callers receive identical output
- **WHEN** a staff member holding `news.manage` requests the public homepage feed
- **THEN** the response is identical to what an anonymous caller receives, containing no draft or future-scheduled article

#### Scenario: Curated and backfilled articles are indistinguishable
- **WHEN** a client reads the homepage feed
- **THEN** the response does not indicate which articles were curated and which were filled chronologically

### Requirement: Composition happens server-side
The system SHALL assemble the homepage feed within the API. It SHALL NOT require a consumer to fetch curated entries and published articles separately, nor to determine which curated entries are publicly visible, nor to compute which articles to exclude from the chronological remainder.

#### Scenario: One request yields the whole feed
- **WHEN** a consumer needs the homepage feed
- **THEN** a single public request returns the complete assembled ordered collection

#### Scenario: Consumers do not evaluate visibility
- **WHEN** the curated list contains articles that are not publicly visible
- **THEN** the API omits them before responding, and no consumer is required to filter them out

### Requirement: Public visibility is not re-derived
The homepage feed SHALL determine which curated articles are publicly visible using the same canonical public visibility rule used by every other public read, including its treatment of a scheduled article whose publication time has passed. This capability SHALL NOT define its own published/scheduled predicate.

#### Scenario: Due-but-unflipped scheduled article is served
- **WHEN** a curated article is in `scheduled` status with a publication time at or before the current time, and the scheduled-publish worker has not yet flipped its stored status
- **THEN** it appears in the homepage feed in its curated position, as if it were already published

#### Scenario: Homepage agrees with other public reads
- **WHEN** an article is publicly visible according to the public article list
- **THEN** the homepage feed treats it as visible too, with no window in which one serves it and the other does not

### Requirement: The article lifecycle self-heals the curated list
Changes to a curated article's lifecycle SHALL take effect on the homepage without any curation write. An unpublished curated article SHALL leave the feed, a deleted article's entry SHALL be removed from the stored list automatically, and in both cases the feed SHALL remain filled to the requested limit.

#### Scenario: Unpublishing removes an article from the feed
- **WHEN** a curated article is unpublished
- **THEN** it stops appearing in the homepage feed, and its stored curated entry remains for use if it is published again

#### Scenario: Deleting an article removes its curated entry
- **WHEN** a curated article is deleted
- **THEN** its entry is removed from the curated list automatically, and no entry referencing a non-existent article remains

#### Scenario: The feed stays full when a curated article leaves it
- **WHEN** a curated article becomes invisible and enough other published articles exist
- **THEN** the homepage feed still returns the requested number of articles, with the chronological remainder covering the gap

#### Scenario: Remaining curated order is preserved
- **WHEN** one curated article becomes invisible and others remain visible
- **THEN** the remaining curated articles keep their relative order at the head of the feed

### Requirement: Curation writes revalidate the homepage
The system SHALL trigger revalidation of the homepage path whenever the curated list is written. It SHALL NOT trigger revalidation of article detail pages or the news listing, which curation does not affect. A failed revalidation SHALL be logged and SHALL NOT fail the curation write, which is already committed.

#### Scenario: Saving curation revalidates the homepage
- **WHEN** a staff member replaces the curated list
- **THEN** the system requests revalidation of the homepage path

#### Scenario: Unrelated paths are not revalidated
- **WHEN** a staff member replaces the curated list
- **THEN** the system does not request revalidation of the news listing path or of any article detail path

#### Scenario: Revalidation failure does not fail the write
- **WHEN** the revalidation request fails after the curated list has been written
- **THEN** the failure is logged, the write remains committed, and the caller receives a success response
