# reels-curation Specification

## Purpose

Defines the reels capability: a library of short-form vertical videos referenced by recognized third-party provider rather than stored by this system, the provider allowlist and URL normalization that admits them, the optional local poster image, the single ordered rail that presents them on the homepage with whole-list replacement write semantics, and the structured public endpoint that serves the rail without ever emitting embed markup.

## Requirements

### Requirement: Permission-gated reels endpoints
Every admin endpoint that reads or writes a reel or the reels ordering SHALL declare the `news.manage` permission. Authorization SHALL be evaluated against the caller's permissions and SHALL NOT branch on the name of any role. No new permission catalog entry SHALL be introduced by this capability.

#### Scenario: Staff member without news.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `news.manage` attempts to create a reel or replace the reels ordering
- **THEN** the system rejects the request as forbidden, no reel is created, and the ordering is unchanged

#### Scenario: Staff member with news.manage is allowed
- **WHEN** an authenticated staff member whose role includes `news.manage` creates a reel or replaces the reels ordering
- **THEN** the request is allowed and the result is persisted

#### Scenario: Anonymous caller cannot reach the admin surface
- **WHEN** a client with no session requests any admin reels endpoint
- **THEN** the system rejects the request as unauthenticated

#### Scenario: No new permission is required to manage reels
- **WHEN** the permission catalog is inspected after this capability is deployed
- **THEN** it contains no reels-specific entry, and the ability to manage reels is carried entirely by `news.manage`

### Requirement: A reel references a third-party video and does not store one
A reel SHALL identify a video hosted by a recognized third-party provider. The system SHALL NOT accept, store, or serve video file content for a reel. The accepted media types defined by `media-management` SHALL remain unchanged by this capability.

#### Scenario: Video upload is not offered
- **WHEN** the reels admin surface is inspected
- **THEN** it offers no endpoint that accepts video file content, and a reel is created by reference to a provider

#### Scenario: Media type list is unaffected
- **WHEN** the accepted media types are inspected after this capability is deployed
- **THEN** they are exactly the image types accepted before it, with no video type added

#### Scenario: Provider hosts the playback
- **WHEN** a reel is served to any consumer
- **THEN** the system supplies a reference to the provider's video and no video bytes of its own

### Requirement: Provider allowlist
The system SHALL accept a reel only when its submitted URL matches one of an explicitly enumerated set of recognized providers. A URL that matches no recognized provider SHALL be rejected. The set of providers SHALL be fixed in code and SHALL NOT be extendable by configuration or by any runtime input.

#### Scenario: Recognized provider accepted
- **WHEN** a staff member submits a URL belonging to a recognized provider, in that provider's expected form
- **THEN** the reel is created

#### Scenario: Unrecognized host rejected
- **WHEN** a staff member submits a URL whose host is not one of the recognized providers
- **THEN** the system rejects the request and creates no reel

#### Scenario: Recognized host in an unexpected form rejected
- **WHEN** a staff member submits a URL whose host is a recognized provider but whose path does not match that provider's expected form
- **THEN** the system rejects the request and creates no reel

#### Scenario: Providers cannot be added at runtime
- **WHEN** the system is deployed
- **THEN** no configuration value, request field, or stored row can introduce a provider that was not enumerated in code

### Requirement: Only a provider identity is persisted
On accepting a reel, the system SHALL parse the submitted URL and SHALL persist only the identified provider and the extracted video identifier. It SHALL NOT persist the submitted URL. The extracted identifier SHALL be constrained to a character set that cannot express a scheme, a host, a path separator, or a quoting character.

#### Scenario: Submitted URL is discarded
- **WHEN** a reel is created from a submitted URL
- **THEN** the stored record holds the provider and the extracted identifier, and holds no copy of the submitted URL

#### Scenario: Tracking parameters do not survive
- **WHEN** a staff member submits a provider URL carrying query parameters or a fragment
- **THEN** those parts are discarded, and two submissions of the same video differing only in such parts yield the same stored identity

#### Scenario: Identifier character set is constrained
- **WHEN** a submitted URL would yield an identifier containing a character outside the permitted set for that provider
- **THEN** the system rejects the request rather than storing the identifier

#### Scenario: The same video cannot be stored twice
- **WHEN** a staff member creates a reel for a provider and identifier that an existing reel already holds
- **THEN** the system rejects the request, so one video cannot occupy two positions in the rail through two records

### Requirement: Embed references are composed server-side from the stored identity
Any embed reference for a reel SHALL be composed from the stored provider and identifier using a template fixed in code for that provider. Caller-supplied text SHALL NOT reach an embed reference. The system SHALL NOT store or serve HTML, an iframe, or a script for a reel.

#### Scenario: Host comes from code, not from data
- **WHEN** an embed reference is composed for a reel
- **THEN** its scheme and host are taken from the provider's template in code, and only the stored identifier is substituted

#### Scenario: No markup is stored
- **WHEN** a reel record is inspected
- **THEN** it contains no HTML, no iframe, and no script

#### Scenario: No markup is served
- **WHEN** a reel is returned by any admin or public endpoint
- **THEN** the response carries structured fields and contains no HTML, iframe, or script for the reel

#### Scenario: Article body rendering is unaffected
- **WHEN** an article body containing a video node is rendered after this capability is deployed
- **THEN** it is rendered exactly as before, as an inert link rather than a frame

### Requirement: Every reel has a locally stored poster image
A reel MAY reference a poster image stored by this system as a media record. A reel MAY be created
and left with no poster. When a poster is supplied, it SHALL be an ordinary image subject to the
existing media rules.

#### Scenario: A reel can be created with no poster image
- **WHEN** a staff member creates a reel and supplies no poster image
- **THEN** the system accepts the request and creates the reel with no poster

#### Scenario: A reel can be created with a poster image
- **WHEN** a staff member creates a reel and supplies a poster image
- **THEN** the system persists the reel with that poster

#### Scenario: Poster is a normal media record
- **WHEN** a poster image is uploaded
- **THEN** it is accepted, validated, stored, and its URL derived by the existing media rules, with no reels-specific storage path

#### Scenario: Poster survives provider failure
- **WHEN** a reel's provider is unreachable or its source video no longer exists, and the reel has a poster
- **THEN** the reel's poster image is still served, because it is stored by this system rather than by the provider

### Requirement: Reel status governs public visibility
A reel SHALL carry a status of `draft`, `published`, or `unavailable`. Only a `published` reel SHALL appear in public output. The `unavailable` status SHALL denote a reel whose source video can no longer be played.

#### Scenario: Draft reel is not public
- **WHEN** a reel in `draft` status is present in the ordering
- **THEN** it does not appear in public output

#### Scenario: Published reel is public
- **WHEN** a reel in `published` status is present in the ordering
- **THEN** it appears in public output in its stored position

#### Scenario: Unavailable reel is not public
- **WHEN** a staff member marks a reel `unavailable`
- **THEN** it stops appearing in public output

#### Scenario: Status change does not require an ordering write
- **WHEN** a reel's status changes
- **THEN** public output reflects the change with no write to the reels ordering

#### Scenario: Restoring a reel restores its position
- **WHEN** a reel that was marked `unavailable` is returned to `published` status, and other reels precede and follow it in the stored order
- **THEN** it appears between exactly those reels, in the order originally saved

### Requirement: A single ordered reels rail
The system SHALL maintain exactly one ordered list of reels, applying to the homepage only. The list SHALL be ordered, and its order SHALL be preserved across reads. The stored representation SHALL carry order only and SHALL NOT encode layout positions, slot names, or presentation roles.

#### Scenario: Order is preserved
- **WHEN** a staff member saves the reels ordering in a given order and later reads it back
- **THEN** the reels are returned in exactly that order

#### Scenario: Order survives unrelated reel edits
- **WHEN** a reel's caption or poster is edited
- **THEN** its position in the ordering is unchanged

#### Scenario: No layout information is stored
- **WHEN** the ordering is read
- **THEN** each entry carries its reel and its ordinal position, and carries no slot name, size, or layout role

#### Scenario: There is no second rail
- **WHEN** the stored ordering is inspected
- **THEN** it carries no scope key, and no second ordered list of reels exists for any other surface

### Requirement: The ordering is replaced as a whole list
The write endpoint SHALL accept a complete ordered collection of reel identifiers and SHALL replace the entire ordering with it. Positions SHALL be derived from the submitted order rather than supplied by the client. The replacement SHALL be atomic: either the whole new ordering is stored or the previous ordering remains entirely intact. The system SHALL NOT expose an endpoint that moves, inserts, or removes an individual entry.

#### Scenario: Replacement overwrites the previous ordering
- **WHEN** a staff member submits a new ordered collection of reel identifiers
- **THEN** the ordering afterwards contains exactly those reels in exactly that order, and no reel from the previous ordering remains unless it was resubmitted

#### Scenario: Client does not supply positions
- **WHEN** a staff member submits an ordered collection of reel identifiers
- **THEN** the system assigns each entry's position from its place in the submitted order, and any position value supplied by the client is ignored

#### Scenario: Reordering is expressed as a replacement
- **WHEN** a staff member changes the order of two already-ordered reels
- **THEN** the change is submitted as the full resulting order and is applied without any intermediate state in which two entries share a position

#### Scenario: A rejected write leaves the ordering untouched
- **WHEN** a submitted collection fails validation
- **THEN** the previously stored ordering remains exactly as it was, with no entries added, removed, or reordered

#### Scenario: Clearing the rail
- **WHEN** a staff member submits an empty collection
- **THEN** the ordering becomes empty and the request succeeds

#### Scenario: Concurrent replacements do not fail
- **WHEN** two staff members submit different replacement collections at the same time
- **THEN** both requests succeed, the ordering afterwards matches exactly one of the two submitted collections in full, and neither request is rejected because of the other

#### Scenario: A concurrent reel deletion does not deadlock a replacement
- **WHEN** a staff member replaces the ordering at the same time as any reel is deleted
- **THEN** each request completes with a normal success or a normal validation failure, and neither request fails with an internal error caused by the other

### Requirement: Ordering validation
The system SHALL reject a submitted collection that contains more entries than the permitted maximum, that names the same reel more than once, or that names a reel that does not exist. The permitted maximum SHALL be ten entries. There SHALL be no minimum.

#### Scenario: Too many entries rejected
- **WHEN** a staff member submits more than the permitted maximum number of reel identifiers
- **THEN** the system rejects the request and the ordering is unchanged

#### Scenario: Duplicate entries rejected
- **WHEN** a staff member submits a collection naming the same reel twice
- **THEN** the system rejects the request and no reel occupies two positions

#### Scenario: Unknown reel rejected
- **WHEN** a staff member submits a collection containing an identifier that matches no reel
- **THEN** the system rejects the request and the ordering is unchanged

#### Scenario: Empty collection accepted
- **WHEN** a staff member submits a collection with no entries
- **THEN** the request succeeds, because there is no minimum number of ordered reels

### Requirement: Reels that are not publicly visible may be ordered
The system SHALL permit a reel in any status to be placed in the ordering, including a `draft` and an `unavailable` reel. Such an entry SHALL be stored and SHALL contribute nothing to public output until the reel becomes `published`, at which point it SHALL appear in its stored position without further editorial action.

#### Scenario: Draft reel can be ordered
- **WHEN** a staff member places a reel in `draft` status into the ordering
- **THEN** the write succeeds and the entry is stored

#### Scenario: Ordered draft is absent from public output
- **WHEN** the ordering contains a reel in `draft` status
- **THEN** that reel does not appear in the public rail

#### Scenario: Position is held while invisible
- **WHEN** an invisible ordered reel later becomes `published`, and other reels precede and follow it in the stored order
- **THEN** it appears between exactly those reels, in the order originally saved

### Requirement: Admin reads report each entry's visibility
The admin read endpoint SHALL return every stored entry, including entries whose reels are not publicly visible, and SHALL report for each entry enough information to determine whether it is currently live.

#### Scenario: Invisible entries are returned to staff
- **WHEN** a staff member reads the ordering and some entries reference draft or unavailable reels
- **THEN** all entries are returned, not only the publicly visible ones

#### Scenario: Live status is reported per entry
- **WHEN** a staff member reads the ordering
- **THEN** each entry reports its reel's status and whether that reel is currently publicly visible

### Requirement: Public reels endpoint serves structured data
The system SHALL expose a public endpoint returning the publicly visible reels in their stored
order. Each item SHALL carry its provider, its video identifier, its caption, and its poster URL
when one is stored, as structured fields. The endpoint SHALL require no authentication.

#### Scenario: Rail is served in stored order
- **WHEN** a client requests the public reels endpoint and publicly visible ordered reels exist
- **THEN** they are returned in their stored order

#### Scenario: Structured fields rather than markup
- **WHEN** a client reads the public reels endpoint
- **THEN** each item carries provider, identifier, caption, and its poster URL when one is stored, and carries no HTML or embed markup

#### Scenario: A reel with no poster is served without one
- **WHEN** the public reels endpoint includes a reel that has no stored poster
- **THEN** that reel's entry in the response carries no poster URL, rather than an empty string or placeholder value

#### Scenario: Anonymous and staff callers receive identical output
- **WHEN** a staff member holding `news.manage` requests the public reels endpoint
- **THEN** the response is identical to what an anonymous caller receives, containing no draft or unavailable reel

#### Scenario: Invisible reels are omitted server-side
- **WHEN** the ordering contains reels that are not publicly visible
- **THEN** the API omits them before responding, and no consumer is required to filter them out

### Requirement: The rail is not backfilled
The public reels endpoint SHALL return only the reels present in the stored ordering. It SHALL NOT top the collection up from reels that are absent from the ordering, and an empty ordering SHALL yield an empty collection.

#### Scenario: Short rail stays short
- **WHEN** the ordering contains fewer publicly visible reels than the rail could display, and other published reels exist in the library
- **THEN** the response contains only the ordered reels, and no unordered reel is added

#### Scenario: Empty ordering yields an empty rail
- **WHEN** the ordering is empty
- **THEN** the public reels endpoint returns an empty collection rather than recently added reels

### Requirement: Third-party embeds load only on user activation for poster-bearing reels
Public rendering of a reel that has a stored poster SHALL present that poster image on initial
render and SHALL NOT create a third-party frame, script, or network request for the provider
until the visitor activates that reel. Activating one reel SHALL NOT load the embed for any
other reel. A reel with no poster is excluded from this requirement — see "A posterless reel's
tile is a live, non-interactive embed" — and instead renders a live provider embed as its tile
from initial render.

This requirement constrains the follow-up change that renders the rail on `/` — see `proposal.md`
("Rendering the rail" - Non-Goals) and `design.md` ("Facade rendering: poster first, frame only
on user activation"). `add-reels-curation` itself ships no consumer of `buildReelEmbedUrl` outside
its own unit test; the rule is recorded here so that follow-up inherits it rather than reaching
for a provider's copy-paste embed snippet.

#### Scenario: Initial render contacts no provider for a poster-bearing reel
- **WHEN** a visitor loads a page carrying the reels rail, at least one rail reel has a poster,
  and the visitor does not interact with it
- **THEN** no frame, script, or request to any provider is created for that reel

#### Scenario: Activation loads one embed
- **WHEN** a visitor activates a single poster-bearing reel
- **THEN** the embed is created for that reel only, and the other poster-bearing reels remain
  posters

#### Scenario: Poster carries a poster-bearing reel's tile before activation
- **WHEN** the reels rail renders and a reel has a poster
- **THEN** that reel is represented by its locally stored poster image, and no third-party frame
  is created for it until it is activated

### Requirement: A posterless reel's tile is a live, non-interactive embed
A reel with no poster SHALL render its provider embed directly in its rail tile from initial
render, in place of the poster image. This embed SHALL NOT be autoplaying and SHALL NOT be
directly interactive — pointer interaction with the tile SHALL activate the same lightbox
playback every other reel uses, rather than any control native to the embed itself.

#### Scenario: Posterless reel shows its own embed on initial render
- **WHEN** the reels rail renders and a reel has no poster
- **THEN** that reel's tile displays a live embed of its provider video rather than a flat
  fallback tile, without requiring any visitor interaction

#### Scenario: The embed does not autoplay
- **WHEN** a posterless reel's tile embed loads
- **THEN** it does not begin video playback on its own

#### Scenario: Clicking a posterless reel's tile opens the same lightbox as any other reel
- **WHEN** a visitor clicks a posterless reel's tile
- **THEN** the same lightbox player used for poster-bearing reels opens and plays that reel,
  and no playback begins inside the tile's own embed

#### Scenario: A poster-bearing reel is unaffected
- **WHEN** the reels rail renders and a reel has a poster
- **THEN** that reel's tile shows its poster image exactly as before, with no embed loaded until
  activation

### Requirement: The reel lifecycle self-heals the ordering
Changes to a reel's lifecycle SHALL take effect on the public rail without any ordering write. A reel that stops being published SHALL leave the rail, and a deleted reel's entry SHALL be removed from the stored ordering automatically.

#### Scenario: Unpublishing removes a reel from the rail
- **WHEN** an ordered reel's status changes away from `published`
- **THEN** it stops appearing in the public rail, and its stored ordering entry remains for use if it is published again

#### Scenario: Deleting a reel removes its ordering entry
- **WHEN** an ordered reel is deleted
- **THEN** its entry is removed from the ordering automatically, and no entry referencing a non-existent reel remains

#### Scenario: Remaining order is preserved
- **WHEN** one ordered reel becomes invisible and others remain visible
- **THEN** the remaining reels keep their relative order in the rail

### Requirement: Reels writes revalidate the homepage
The system SHALL trigger revalidation of the homepage path whenever the reels ordering is written or a reel's publicly visible state changes. It SHALL NOT trigger revalidation of article detail pages or the news listing, which reels do not affect. A failed revalidation SHALL be logged and SHALL NOT fail the write, which is already committed.

#### Scenario: Saving the ordering revalidates the homepage
- **WHEN** a staff member replaces the reels ordering
- **THEN** the system requests revalidation of the homepage path

#### Scenario: A status change revalidates the homepage
- **WHEN** a reel's status changes between publicly visible and not
- **THEN** the system requests revalidation of the homepage path

#### Scenario: Unrelated paths are not revalidated
- **WHEN** a staff member replaces the reels ordering
- **THEN** the system does not request revalidation of the news listing path or of any article detail path

#### Scenario: Revalidation failure does not fail the write
- **WHEN** the revalidation request fails after the write has been committed
- **THEN** the failure is logged, the write remains committed, and the caller receives a success response
