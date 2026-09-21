## ADDED Requirements

### Requirement: The spotlight holds at most one article
The system SHALL maintain exactly one hyperlocal spotlight slot, applying to the public home page
only. The slot SHALL hold either no article or exactly one article. It SHALL be structurally
impossible for the slot to hold two articles at once, rather than prevented by validation alone.
The slot SHALL NOT store an order, a position, a layout role, or any locality value.

#### Scenario: Two articles cannot occupy the slot
- **WHEN** the spotlight storage is inspected after any sequence of writes
- **THEN** it holds at most one article, and no write path exists by which a second could be added
  alongside the first

#### Scenario: An empty slot is a valid state
- **WHEN** no article has ever been spotlighted, or the spotlight has been released
- **THEN** reads succeed and report an empty slot, and no error is raised

#### Scenario: No locality is stored
- **WHEN** the spotlight is read
- **THEN** it carries the article and nothing else describing a city, region, or geographic area

### Requirement: The spotlight is set from the article editor
An article SHALL carry a spotlight flag in its admin write and read shapes, settable when the
article is created and when it is edited. Saving an article with the flag set SHALL place that
article in the spotlight slot. The system SHALL NOT expose a separate endpoint that writes the
spotlight, and SHALL NOT require the editor to visit a second screen to make the pick.

#### Scenario: Spotlight set at creation
- **WHEN** a staff member creates an article with the spotlight flag set
- **THEN** the article is created and occupies the spotlight slot

#### Scenario: Spotlight set on an existing article
- **WHEN** a staff member edits an existing article, sets the spotlight flag, and saves
- **THEN** that article occupies the spotlight slot

#### Scenario: The flag is reported back
- **WHEN** a staff member reads an article through the admin API
- **THEN** the response reports whether that article currently holds the spotlight

#### Scenario: No separate write surface exists
- **WHEN** the admin surface is inspected
- **THEN** the spotlight is writable only through the article create and update endpoints, and no
  endpoint exists that sets the spotlight without saving an article

#### Scenario: Saving an article without the flag changes nothing
- **WHEN** a staff member saves an article that does not hold the spotlight, with the flag unset
- **THEN** the save succeeds and the spotlight slot is unchanged, whatever it holds

### Requirement: Spotlighting one article releases the previous holder
Setting the spotlight flag on an article SHALL remove the spotlight from whichever article held it
before. The previously spotlighted article SHALL NOT be otherwise altered: its status, publication
state, curated-list membership, and content SHALL be unchanged.

#### Scenario: The previous holder loses the spotlight
- **WHEN** a staff member spotlights an article while a different article holds the spotlight
- **THEN** the slot afterwards holds only the newly saved article, and the previous article no
  longer holds the spotlight

#### Scenario: The previous holder is otherwise untouched
- **WHEN** an article loses the spotlight because another article took it
- **THEN** its status, `published_at`, content, categories, tags, and curated-list position are
  exactly as they were

#### Scenario: Re-saving the current holder keeps the spotlight
- **WHEN** a staff member saves the article that already holds the spotlight, with the flag still
  set
- **THEN** the save succeeds and that article still holds the spotlight

#### Scenario: Concurrent spotlight saves do not fail
- **WHEN** two staff members save two different articles with the spotlight flag set at the same
  time
- **THEN** both saves succeed, the slot afterwards holds exactly one of the two articles, and
  neither request is rejected because of the other

### Requirement: Clearing the spotlight
Saving the spotlighted article with the flag unset SHALL empty the spotlight slot. Saving an
article that does not hold the spotlight with the flag unset SHALL leave the slot unchanged and
SHALL NOT be treated as an error.

#### Scenario: Unchecking on the holder empties the slot
- **WHEN** a staff member unsets the spotlight flag on the article that holds the spotlight and
  saves
- **THEN** the slot becomes empty and the save succeeds

#### Scenario: Unchecking on a non-holder is a no-op
- **WHEN** a staff member saves any article that does not hold the spotlight, with the flag unset
- **THEN** the save succeeds and the spotlighted article is still spotlighted

### Requirement: The spotlight write is atomic with the article save
The spotlight change and the article write SHALL succeed or fail together as one transaction. A
rejected article save SHALL leave the spotlight exactly as it was, and a failed spotlight write
SHALL leave the article exactly as it was.

#### Scenario: A rejected article save does not move the spotlight
- **WHEN** a staff member saves an article with the spotlight flag set and the save is rejected as
  invalid
- **THEN** no article is created or modified, and the spotlight slot is unchanged

#### Scenario: A failed spotlight write does not half-save the article
- **WHEN** the spotlight portion of a save fails
- **THEN** the article's own changes are not persisted either, and the request reports a failure

### Requirement: Autosave never changes the spotlight
The autosave path SHALL NOT accept or apply the spotlight flag. A spotlight change SHALL require
an explicit save.

#### Scenario: Autosave payload carries no spotlight flag
- **WHEN** the autosave request shape is inspected
- **THEN** it contains no spotlight field, so an autosave structurally cannot move the spotlight

#### Scenario: Autosave leaves the spotlight alone
- **WHEN** a staff member edits the body of the spotlighted article and autosave fires repeatedly
- **THEN** the spotlight slot still holds that article, unchanged, and no spotlight write occurs

### Requirement: An article in any status may be spotlighted
The system SHALL permit an article in any status to be spotlighted, including a draft and an
article scheduled for a future time. Such a pick SHALL be stored and SHALL contribute nothing to
public output until the article becomes publicly visible, at which point it SHALL appear in the
spotlight without further editorial action. Public visibility SHALL be decided by the same rule
that governs every other public article read.

#### Scenario: Draft article can be spotlighted
- **WHEN** a staff member saves an article in `draft` status with the spotlight flag set
- **THEN** the save succeeds and the slot holds that article

#### Scenario: Spotlighted draft is absent from public output
- **WHEN** the slot holds an article in `draft` status
- **THEN** the public spotlight read reports an empty spotlight, and no part of that article is
  disclosed

#### Scenario: Spotlighted scheduled article appears at its scheduled time
- **WHEN** the slot holds an article scheduled for a future time, and that time passes
- **THEN** the article appears in the public spotlight, with no further spotlight write

#### Scenario: Unpublishing empties the public spotlight without releasing the slot
- **WHEN** the spotlighted article is unpublished
- **THEN** the public spotlight read reports an empty spotlight, and the article still holds the
  slot, with its editor checkbox still set

### Requirement: The editor reports the current holder before taking the spotlight
The article editor SHALL show whether the article being edited holds the spotlight, and, when it
does not, SHALL identify the article that currently does before the save. An editor SHALL NOT be
able to take the spotlight from another article without that article being named.

#### Scenario: Current holder is named
- **WHEN** a staff member opens the editor for an article that does not hold the spotlight, while
  another article does
- **THEN** the spotlight control names the article that currently holds it

#### Scenario: Holding article is shown as holding
- **WHEN** a staff member opens the editor for the article that holds the spotlight
- **THEN** the spotlight control shows it as set

#### Scenario: Empty slot is shown as empty
- **WHEN** a staff member opens the editor while no article holds the spotlight
- **THEN** the spotlight control shows that the spotlight is empty, and names no article

### Requirement: Admin read of the current spotlight
The system SHALL expose one admin read that reports the article currently holding the spotlight,
including when that article is not publicly visible, along with enough information to determine
whether it is currently live. When the slot is empty, the read SHALL report an empty slot as an
ordinary success. This read SHALL declare the `news.manage` permission and SHALL introduce no new
permission catalog entry.

#### Scenario: Invisible holder is returned to staff
- **WHEN** a staff member reads the spotlight and it holds a draft or future-scheduled article
- **THEN** that article is returned rather than omitted

#### Scenario: Live status is reported
- **WHEN** a staff member reads the spotlight
- **THEN** the response carries the article's status and whether it is currently publicly visible

#### Scenario: Empty slot reads as success
- **WHEN** a staff member reads an empty spotlight
- **THEN** the request succeeds and reports no article, rather than failing as not-found

#### Scenario: Anonymous caller cannot reach the admin read
- **WHEN** a client with no session requests the admin spotlight read
- **THEN** the system rejects the request as unauthenticated

#### Scenario: No new permission is required
- **WHEN** the permission catalog is inspected after this capability is deployed
- **THEN** it contains no spotlight-specific entry, and the ability to spotlight is carried
  entirely by `news.manage`

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
- **WHEN** a staff member saves an article with the spotlight flag set
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

#### Scenario: A concurrent deletion does not deadlock a save
- **WHEN** a staff member saves an article with the spotlight flag set at the same time as any
  article is hard-deleted
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
