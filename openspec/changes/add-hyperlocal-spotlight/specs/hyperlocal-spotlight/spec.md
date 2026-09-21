## ADDED Requirements

### Requirement: Permission-gated spotlight endpoints
Every admin endpoint that reads or writes the hyperlocal spotlight SHALL declare the
`news.manage` permission. Authorization SHALL be evaluated against the caller's permissions and
SHALL NOT branch on the name of any role. No new permission catalog entry SHALL be introduced by
this capability.

#### Scenario: Staff member without news.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `news.manage` attempts to
  read or replace the spotlight
- **THEN** the system rejects the request as forbidden and the spotlight is unchanged

#### Scenario: Staff member with news.manage is allowed
- **WHEN** an authenticated staff member whose role includes `news.manage` replaces the spotlight
- **THEN** the request is allowed and the new pick is persisted

#### Scenario: Anonymous caller cannot reach the admin surface
- **WHEN** a client with no session requests the admin spotlight endpoints
- **THEN** the system rejects the request as unauthenticated

#### Scenario: No new permission is required to spotlight an article
- **WHEN** the permission catalog is inspected after this capability is deployed
- **THEN** it contains no spotlight-specific entry, and the ability to spotlight is carried
  entirely by `news.manage`

### Requirement: The spotlight holds at most one article
The system SHALL maintain exactly one hyperlocal spotlight slot, applying to the public home page
only. The slot SHALL hold either no article or exactly one article. It SHALL be structurally
impossible for the slot to hold two articles at once, rather than prevented by validation alone.
The slot SHALL NOT store an order, a position, a layout role, or any locality value.

#### Scenario: Setting a pick replaces the previous one
- **WHEN** an article is spotlighted while a different article already occupies the slot
- **THEN** the slot afterwards holds only the newly submitted article, and the previous article is
  no longer spotlighted

#### Scenario: Two articles cannot occupy the slot
- **WHEN** the spotlight storage is inspected after any sequence of writes
- **THEN** it holds at most one article, and no write path exists by which a second could be added
  alongside the first

#### Scenario: An empty slot is a valid state
- **WHEN** no article has ever been spotlighted, or the slot has been cleared
- **THEN** reads succeed and report an empty slot, and no error is raised

#### Scenario: No locality is stored
- **WHEN** the spotlight is read
- **THEN** it carries the article and nothing else describing a city, region, or geographic area

### Requirement: The spotlight is replaced as a whole slot
The write endpoint SHALL accept either a single article identifier or an explicit empty value, and
SHALL replace the whole slot with it. The replacement SHALL be atomic: either the new pick is
stored or the previous pick remains entirely intact. The system SHALL NOT expose an endpoint that
appends to, removes from, or otherwise mutates part of the slot. Submitting the article already
spotlighted SHALL succeed and leave the pick unchanged.

#### Scenario: Clearing the slot
- **WHEN** a staff member submits an explicit empty value
- **THEN** the slot becomes empty and the request succeeds

#### Scenario: Re-submitting the current pick is accepted
- **WHEN** a staff member spotlights the article that is already spotlighted
- **THEN** the request succeeds and the slot still holds exactly that article

#### Scenario: A rejected write leaves the slot untouched
- **WHEN** a submitted write fails validation
- **THEN** the previously spotlighted article remains spotlighted, and an empty slot remains empty

#### Scenario: No partial write surface exists
- **WHEN** the admin spotlight surface is inspected
- **THEN** it offers one read and one whole-slot replacement, and no endpoint that mutates the
  slot's contents in place

#### Scenario: Concurrent replacements do not fail
- **WHEN** two staff members spotlight different articles at the same time
- **THEN** both requests succeed, the slot afterwards holds exactly one of the two submitted
  articles, and neither request is rejected because of the other

### Requirement: Spotlight validation
The system SHALL reject a write naming an article that does not exist. The system SHALL reject a
write whose article identifier is not a well-formed identifier. A rejected write SHALL leave the
slot unchanged.

#### Scenario: Unknown article rejected
- **WHEN** a staff member submits an identifier that matches no article
- **THEN** the system rejects the request and the slot is unchanged

#### Scenario: Malformed identifier rejected
- **WHEN** a staff member submits a value that is neither a well-formed article identifier nor the
  explicit empty value
- **THEN** the system rejects the request and the slot is unchanged

### Requirement: An article in any status may be spotlighted
The system SHALL permit an article in any status to be spotlighted, including a draft and an
article scheduled for a future time. Such a pick SHALL be stored and SHALL contribute nothing to
public output until the article becomes publicly visible, at which point it SHALL appear in the
spotlight without further editorial action. Public visibility SHALL be decided by the same rule
that governs every other public article read.

#### Scenario: Draft article can be spotlighted
- **WHEN** a staff member spotlights an article in `draft` status
- **THEN** the write succeeds and the pick is stored

#### Scenario: Spotlighted draft is absent from public output
- **WHEN** the slot holds an article in `draft` status
- **THEN** the public spotlight read reports an empty spotlight, and no part of that article is
  disclosed

#### Scenario: Spotlighted scheduled article appears at its scheduled time
- **WHEN** the slot holds an article scheduled for a future time, and that time passes
- **THEN** the article appears in the public spotlight, with no further spotlight write

#### Scenario: Unpublishing empties the public spotlight without clearing the pick
- **WHEN** the spotlighted article is unpublished
- **THEN** the public spotlight read reports an empty spotlight, and the admin read still reports
  that article as the stored pick

### Requirement: Admin reads report the pick and its visibility
The admin read endpoint SHALL return the stored pick whether or not its article is publicly
visible, and SHALL report enough information to determine whether it is currently live. When the
slot is empty, the endpoint SHALL report an empty slot as an ordinary success.

#### Scenario: Invisible pick is returned to staff
- **WHEN** a staff member reads the spotlight and it holds a draft or future-scheduled article
- **THEN** the pick is returned rather than omitted

#### Scenario: Live status is reported
- **WHEN** a staff member reads the spotlight
- **THEN** the response carries the article's status and whether it is currently publicly visible

#### Scenario: Empty slot reads as success
- **WHEN** a staff member reads an empty spotlight
- **THEN** the request succeeds and reports no pick, rather than failing as not-found

### Requirement: Public spotlight read
The system SHALL expose one public, rate-limited endpoint that serves the spotlighted article in
the same public card shape used by other public article reads, or reports an empty spotlight. The
endpoint SHALL NOT disclose any article that is not publicly visible.

#### Scenario: Visible pick is served
- **WHEN** the slot holds a publicly visible article and a public client reads the spotlight
- **THEN** the response carries that article in the standard public card shape

#### Scenario: Empty spotlight is served as an ordinary response
- **WHEN** the slot is empty, or its article is not publicly visible, and a public client reads
  the spotlight
- **THEN** the response reports no article and succeeds, rather than failing as not-found

#### Scenario: Public read is rate-limited like other public reads
- **WHEN** a public client exceeds the configured request rate for the spotlight endpoint
- **THEN** the system rate-limits it exactly as it does the other public article reads

### Requirement: The spotlight is independent of the curated home feed
The spotlight SHALL be stored and served independently of the curated homepage list. Spotlighting
an article SHALL NOT add it to, remove it from, or reorder the curated list, and replacing the
curated list SHALL NOT change the spotlight. Neither read SHALL exclude an article because it
appears in the other.

#### Scenario: Replacing the curated list leaves the spotlight intact
- **WHEN** a staff member replaces the whole curated homepage list
- **THEN** the spotlighted article is unchanged, whether or not it appears in the submitted list

#### Scenario: Spotlighting does not alter the curated list
- **WHEN** a staff member spotlights an article
- **THEN** the curated homepage list is unchanged

#### Scenario: The same article may appear in both
- **WHEN** the spotlighted article is also present in the curated homepage list
- **THEN** both reads return it, and neither suppresses it because of the other

### Requirement: Deleting the spotlighted article empties the slot
When the spotlighted article is hard-deleted, the slot SHALL become empty rather than retain a
reference to a deleted article. The deletion SHALL NOT be blocked by the article being
spotlighted.

#### Scenario: Deletion clears the spotlight
- **WHEN** the spotlighted article is hard-deleted
- **THEN** the deletion succeeds and the spotlight is afterwards empty

#### Scenario: Reads after deletion are ordinary empty reads
- **WHEN** the spotlight is read after its article was deleted
- **THEN** both the admin and public reads report an empty spotlight and succeed

#### Scenario: A concurrent deletion does not deadlock a write
- **WHEN** a staff member replaces the spotlight at the same time as any article is hard-deleted
- **THEN** each request completes with a normal success or a normal validation failure, and
  neither fails with an internal error caused by the other

### Requirement: The public home page renders the spotlight only when it is filled
The public home page SHALL present the spotlighted article as a distinct hyperlocal section. When
the spotlight is empty, the page SHALL render no section heading, no placeholder, and no empty
container for it, and the rest of the page SHALL be unaffected.

#### Scenario: Filled spotlight renders
- **WHEN** a reader loads the home page while the spotlight holds a publicly visible article
- **THEN** the hyperlocal section is rendered with that article

#### Scenario: Empty spotlight renders nothing
- **WHEN** a reader loads the home page while the spotlight is empty
- **THEN** no hyperlocal section, heading, or placeholder appears, and every other home page
  section renders as it does today

#### Scenario: A failed spotlight read does not break the page
- **WHEN** the public spotlight read fails while the home page loads
- **THEN** the page still renders its other sections, and the hyperlocal section is simply absent
