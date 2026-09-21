## ADDED Requirements

### Requirement: The spotlight holds at most one editor pick
The system SHALL maintain exactly one hyperlocal spotlight slot, applying to the public home page
only. The slot SHALL hold either no editor pick or exactly one. It SHALL be structurally
impossible for the slot to hold two articles at once, rather than prevented by validation alone.
The slot SHALL NOT store an order, a position, a layout role, or any locality value.

#### Scenario: Two articles cannot occupy the slot
- **WHEN** the spotlight storage is inspected after any sequence of writes
- **THEN** it holds at most one article, and no write path exists by which a second could be added
  alongside the first

#### Scenario: An unset slot is a valid state
- **WHEN** no article has ever been spotlighted, or the editor pick has been released
- **THEN** reads succeed and resolve the spotlight by the fallback rule, and no error is raised

#### Scenario: No locality is stored
- **WHEN** the spotlight is read
- **THEN** it carries the article and nothing else describing a city, region, or geographic area

### Requirement: The spotlight falls back to the newest published article
The spotlight SHALL resolve to the editor pick when one is stored and that article is publicly
visible, and otherwise to the most recently published publicly visible article. The fallback SHALL
be resolved at read time and SHALL NOT be written into the slot. "Most recently published" SHALL
use the same newest-first ordering and the same canonical public visibility rule as every other
public article read, with no second definition of either.

#### Scenario: No editor pick resolves to the newest article
- **WHEN** the slot holds no editor pick and the spotlight is read
- **THEN** the spotlight resolves to the most recently published publicly visible article

#### Scenario: The fallback stays current as articles publish
- **WHEN** the spotlight is resolving by fallback and a newer article is published
- **THEN** the next read resolves to that newer article, with no spotlight write and no editorial
  action

#### Scenario: The fallback is not persisted
- **WHEN** the spotlight storage is inspected while the spotlight is resolving by fallback
- **THEN** the slot holds no article, so a fallback pick is never mistaken for an editor pick

#### Scenario: An editor pick outranks the newest article
- **WHEN** the slot holds a publicly visible editor pick and a different article is the most
  recently published
- **THEN** the spotlight resolves to the editor pick

#### Scenario: An invisible editor pick falls back without being released
- **WHEN** the slot holds an editor pick that is not publicly visible
- **THEN** the spotlight resolves to the most recently published article, and the editor pick
  remains stored

#### Scenario: No published articles at all
- **WHEN** the slot holds no publicly visible editor pick and the site has no publicly visible
  article
- **THEN** the spotlight resolves to no article, and reads succeed rather than failing

### Requirement: The spotlight is set from the article editor
An article SHALL carry a spotlight flag in its admin write and read shapes, settable when the
article is created and when it is edited. Saving an article with the flag set SHALL make that
article the editor pick. The system SHALL NOT expose a separate endpoint that writes the
spotlight, and SHALL NOT require the editor to visit a second screen to make the pick.

#### Scenario: Spotlight set at creation
- **WHEN** a staff member creates an article with the spotlight flag set
- **THEN** the article is created and becomes the editor pick

#### Scenario: Spotlight set on an existing article
- **WHEN** a staff member edits an existing article, sets the spotlight flag, and saves
- **THEN** that article becomes the editor pick

#### Scenario: The flag is reported back
- **WHEN** a staff member reads an article through the admin API
- **THEN** the response reports whether that article is the current editor pick

#### Scenario: The flag reflects only an editor pick
- **WHEN** a staff member reads the article that the spotlight currently resolves to by fallback,
  with no editor pick stored
- **THEN** the article's spotlight flag reads as unset, because no editor chose it

#### Scenario: No separate write surface exists
- **WHEN** the admin surface is inspected
- **THEN** the spotlight is writable only through the article create and update endpoints, and no
  endpoint exists that sets the spotlight without saving an article

#### Scenario: Saving an article without the flag changes nothing
- **WHEN** a staff member saves an article that is not the editor pick, with the flag unset
- **THEN** the save succeeds and the slot is unchanged, whatever it holds

### Requirement: Spotlighting one article releases the previous pick
Setting the spotlight flag on an article SHALL remove the editor pick from whichever article held
it before. The previously picked article SHALL NOT be otherwise altered: its status, publication
state, curated-list membership, and content SHALL be unchanged.

#### Scenario: The previous pick is released
- **WHEN** a staff member spotlights an article while a different article is the editor pick
- **THEN** the slot afterwards holds only the newly saved article, and the previous article is no
  longer the editor pick

#### Scenario: The previous pick is otherwise untouched
- **WHEN** an article loses the editor pick because another article took it
- **THEN** its status, `published_at`, content, categories, tags, and curated-list position are
  exactly as they were

#### Scenario: Re-saving the current pick keeps it
- **WHEN** a staff member saves the article that is already the editor pick, with the flag still
  set
- **THEN** the save succeeds and that article is still the editor pick

#### Scenario: Concurrent spotlight saves do not fail
- **WHEN** two staff members save two different articles with the spotlight flag set at the same
  time
- **THEN** both saves succeed, the slot afterwards holds exactly one of the two articles, and
  neither request is rejected because of the other

### Requirement: Releasing the spotlight hands it to the newest article
Saving the editor pick with the flag unset SHALL remove the editor pick, after which the spotlight
SHALL resolve to the most recently published publicly visible article. Releasing the pick SHALL
NOT leave the section blank while any publicly visible article exists, and SHALL NOT write the
fallback article into the slot. Saving an article that is not the editor pick with the flag unset
SHALL leave the slot unchanged and SHALL NOT be treated as an error.

#### Scenario: Unchecking on the pick hands the spotlight to the newest article
- **WHEN** a staff member unsets the spotlight flag on the article that is the editor pick and
  saves
- **THEN** the save succeeds, that article is no longer the editor pick, and the spotlight resolves
  to the most recently published publicly visible article

#### Scenario: The handed-over spotlight is not frozen
- **WHEN** an editor pick is released and a newer article is published afterwards
- **THEN** the spotlight resolves to that newer article, rather than staying on whichever article
  was newest at the moment of the release

#### Scenario: Releasing the pick when it is itself the newest article
- **WHEN** a staff member unsets the flag on the editor pick, and that same article is also the
  most recently published article
- **THEN** the spotlight resolves to that article by fallback, and its spotlight flag reads as
  unset

#### Scenario: Unchecking on a non-pick is a no-op
- **WHEN** a staff member saves any article that is not the editor pick, with the flag unset
- **THEN** the save succeeds and the editor pick is unchanged

### Requirement: The spotlight write is atomic with the article save
The spotlight change and the article write SHALL succeed or fail together as one transaction. A
rejected article save SHALL leave the slot exactly as it was, and a failed spotlight write SHALL
leave the article exactly as it was.

#### Scenario: A rejected article save does not move the spotlight
- **WHEN** a staff member saves an article with the spotlight flag set and the save is rejected as
  invalid
- **THEN** no article is created or modified, and the slot is unchanged

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
- **WHEN** a staff member edits the body of the editor pick and autosave fires repeatedly
- **THEN** that article is still the editor pick, unchanged, and no spotlight write occurs

### Requirement: An article in any status may be spotlighted
The system SHALL permit an article in any status to be made the editor pick, including a draft and
an article scheduled for a future time. Such a pick SHALL be stored and SHALL contribute nothing to
public output until the article becomes publicly visible, at which point it SHALL take over the
spotlight from the fallback without further editorial action.

#### Scenario: Draft article can be spotlighted
- **WHEN** a staff member saves an article in `draft` status with the spotlight flag set
- **THEN** the save succeeds and that article is the editor pick

#### Scenario: A draft pick shows the fallback publicly
- **WHEN** the editor pick is an article in `draft` status
- **THEN** the public spotlight resolves to the most recently published article, and no part of the
  draft is disclosed

#### Scenario: A scheduled pick takes over at its scheduled time
- **WHEN** the editor pick is scheduled for a future time, and that time passes
- **THEN** the public spotlight resolves to it instead of the fallback, with no further spotlight
  write

#### Scenario: Unpublishing the pick returns the spotlight to the fallback
- **WHEN** the editor pick is unpublished
- **THEN** the public spotlight resolves to the most recently published article, the pick remains
  stored, and its editor checkbox still reads as set

### Requirement: The editor reports what the spotlight currently shows
The article editor SHALL show whether the article being edited is the editor pick, and, when it is
not, SHALL identify the article the spotlight currently shows and whether that article is an editor
pick or the automatic newest-article fallback. An editor SHALL NOT be able to displace another
article's editor pick without that article being named.

#### Scenario: Current editor pick is named
- **WHEN** a staff member opens the editor for an article that is not the editor pick, while
  another article is
- **THEN** the spotlight control names that article and shows it as an editor pick

#### Scenario: Fallback is shown as automatic
- **WHEN** a staff member opens the editor while no editor pick is stored
- **THEN** the spotlight control names the article the spotlight currently shows and marks it as
  the automatic newest-article fallback, not an editorial choice

#### Scenario: The edited article's own state is shown
- **WHEN** a staff member opens the editor for the article that is the editor pick
- **THEN** the spotlight control shows it as set

#### Scenario: Unchecking states what happens next
- **WHEN** a staff member unsets the spotlight flag on the editor pick
- **THEN** the control states that the spotlight will return to the newest published article,
  rather than implying the section will be empty

### Requirement: Admin read of the current spotlight
The system SHALL expose one admin read that reports the article the spotlight currently resolves
to, whether that came from the editor pick or the fallback, and the stored editor pick even when it
is not publicly visible, along with enough information to determine whether it is currently live.
When nothing resolves, the read SHALL report no article as an ordinary success. This read SHALL
declare the `news.manage` permission and SHALL introduce no new permission catalog entry.

#### Scenario: Invisible pick is returned to staff
- **WHEN** a staff member reads the spotlight and the editor pick is a draft or future-scheduled
  article
- **THEN** that pick is returned rather than omitted, alongside the article the public spotlight
  currently shows

#### Scenario: Live status is reported
- **WHEN** a staff member reads the spotlight
- **THEN** the response carries the article's status and whether it is currently publicly visible

#### Scenario: Fallback resolution is distinguishable
- **WHEN** a staff member reads the spotlight while no editor pick is stored
- **THEN** the response reports the resolved article and marks it as the fallback rather than an
  editor pick

#### Scenario: Nothing to resolve reads as success
- **WHEN** a staff member reads the spotlight while there is no editor pick and no publicly visible
  article
- **THEN** the request succeeds and reports no article, rather than failing as not-found

#### Scenario: Anonymous caller cannot reach the admin read
- **WHEN** a client with no session requests the admin spotlight read
- **THEN** the system rejects the request as unauthenticated

#### Scenario: No new permission is required
- **WHEN** the permission catalog is inspected after this capability is deployed
- **THEN** it contains no spotlight-specific entry, and the ability to spotlight is carried
  entirely by `news.manage`

### Requirement: Public spotlight read
The system SHALL expose one public, rate-limited endpoint that serves the resolved spotlight
article in the same public card shape used by other public article reads, and reports whether it
was an editor pick. The endpoint SHALL NOT disclose any article that is not publicly visible.

#### Scenario: Visible editor pick is served
- **WHEN** the editor pick is publicly visible and a public client reads the spotlight
- **THEN** the response carries that article in the standard public card shape, marked as an editor
  pick

#### Scenario: Fallback is served
- **WHEN** there is no publicly visible editor pick and a public client reads the spotlight
- **THEN** the response carries the most recently published publicly visible article, marked as not
  an editor pick

#### Scenario: No article to serve is an ordinary response
- **WHEN** there is no publicly visible editor pick and no publicly visible article at all
- **THEN** the response reports no article and succeeds, rather than failing as not-found

#### Scenario: An invisible pick is never disclosed
- **WHEN** the editor pick is a draft, a future-scheduled, or an unpublished article
- **THEN** no field of that article appears in the public response

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
- **THEN** the editor pick is unchanged, whether or not it appears in the submitted list

#### Scenario: Spotlighting does not alter the curated list
- **WHEN** a staff member saves an article with the spotlight flag set
- **THEN** the curated homepage list is unchanged

#### Scenario: The same article may appear in both
- **WHEN** the spotlighted article is also present in the curated homepage list
- **THEN** both reads return it, and neither suppresses it because of the other

### Requirement: Deleting the editor pick hands the spotlight to the newest article
When the editor pick is hard-deleted, the slot SHALL be left holding no pick rather than a
reference to a deleted article, and the spotlight SHALL resolve by the fallback rule afterwards.
The deletion SHALL NOT be blocked by the article being spotlighted.

#### Scenario: Deletion releases the pick
- **WHEN** the editor pick is hard-deleted
- **THEN** the deletion succeeds and no editor pick is stored afterwards

#### Scenario: The spotlight continues on the newest article
- **WHEN** the spotlight is read after the editor pick was deleted
- **THEN** both the admin and public reads resolve to the most recently published publicly visible
  article and succeed

#### Scenario: A concurrent deletion does not deadlock a save
- **WHEN** a staff member saves an article with the spotlight flag set at the same time as any
  article is hard-deleted
- **THEN** each request completes with a normal success or a normal validation failure, and
  neither fails with an internal error caused by the other

### Requirement: The public home page renders the resolved spotlight
The public home page SHALL present the resolved spotlight article as a distinct hyperlocal section,
whether it came from the editor pick or the fallback. When nothing resolves, the page SHALL render
no section heading, no placeholder, and no empty container for it, and the rest of the page SHALL
be unaffected.

#### Scenario: Editor pick renders
- **WHEN** a reader loads the home page while a publicly visible editor pick exists
- **THEN** the hyperlocal section is rendered with that article

#### Scenario: Fallback renders identically
- **WHEN** a reader loads the home page while no editor pick is stored
- **THEN** the hyperlocal section is rendered with the most recently published article, presented
  no differently from an editor pick

#### Scenario: Nothing to render renders nothing
- **WHEN** a reader loads the home page while the site has no publicly visible article
- **THEN** no hyperlocal section, heading, or placeholder appears, and every other home page
  section renders as it does today

#### Scenario: A failed spotlight read does not break the page
- **WHEN** the public spotlight read fails while the home page loads
- **THEN** the page still renders its other sections, and the hyperlocal section is simply absent
