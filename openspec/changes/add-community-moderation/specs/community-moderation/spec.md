## Purpose

Defines staff moderation of reader-generated activity from `article-engagement`: the permission
gating every moderation endpoint, the comment queue and its filters and pagination, removing and
restoring a comment, muting and banning a reader and reversing both, the record kept of every such
action, and the rule that a banned reader's existing comments are not touched by the ban that
silenced them.

## ADDED Requirements

### Requirement: Moderation endpoints require the moderation.manage permission
Every endpoint that lists, removes, restores, mutes, unmutes, bans, or unbans SHALL declare the
`moderation.manage` permission. Authorization SHALL be evaluated against the caller's permissions
and SHALL NOT branch on the name of any role.

#### Scenario: Staff member without moderation.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `moderation.manage` attempts to list, remove, restore, mute, unmute, ban, or unban
- **THEN** the request is rejected as forbidden and no comment or reader record is changed

#### Scenario: Staff member with moderation.manage is allowed
- **WHEN** an authenticated staff member whose role includes `moderation.manage` performs any moderation action
- **THEN** the request is allowed

#### Scenario: Anonymous caller cannot reach any moderation endpoint
- **WHEN** a client with no session requests any moderation endpoint
- **THEN** the request is rejected as unauthenticated

### Requirement: The comment queue lists comments filterable by status, newest first
The comment queue SHALL be reachable only by a permitted caller. It SHALL return comments ordered
newest first, SHALL accept a status filter of `visible`, `removed`, or `all`, and SHALL include each
comment's article title and slug and its author's name.

#### Scenario: The unfiltered queue includes every status
- **WHEN** a permitted caller requests the queue with no status filter
- **THEN** both visible and removed comments are returned

#### Scenario: Filtering to removed comments
- **WHEN** a permitted caller requests the queue filtered to `removed`
- **THEN** only comments currently in the removed state are returned

#### Scenario: Filtering to visible comments
- **WHEN** a permitted caller requests the queue filtered to `visible`
- **THEN** only comments currently in the visible state are returned

#### Scenario: Newest comments come first
- **WHEN** the queue contains comments from several points in time
- **THEN** they are returned most recently created first

#### Scenario: Each row carries its article and author context
- **WHEN** a comment is returned in the queue
- **THEN** it is accompanied by its article's title and slug and its author's name

### Requirement: The queue is paginated by cursor, not offset
The queue SHALL accept a cursor derived from the last row of a previous page and SHALL return only
comments ordered strictly after that position. The queue SHALL NOT accept a numeric offset.

#### Scenario: The first page requires no cursor
- **WHEN** a permitted caller requests the queue with no cursor
- **THEN** the newest page of comments is returned, along with a cursor for the following page

#### Scenario: A later page continues from the cursor
- **WHEN** a permitted caller requests the queue using a cursor from a previous page
- **THEN** the comments returned are exactly those ordered after that cursor's position, continuing the same newest-first order

#### Scenario: A comment created after the first page was fetched does not skip a row
- **WHEN** a new comment is created after a caller has fetched the first page, and the caller then requests the next page using their existing cursor
- **THEN** every comment that was already positioned after that cursor is still returned, none of them skipped by the new comment's arrival

### Requirement: A comment can be removed and restored
A permitted caller SHALL be able to set a comment's status to `removed`, hiding it from the public
comment listing and count without deleting its row, and SHALL be able to set it back to `visible`
at any later time, restoring it to the public listing and count. Both actions SHALL accept an
optional reason.

#### Scenario: Removing a comment hides it from public output
- **WHEN** a permitted caller removes a comment
- **THEN** the comment's status becomes removed, and it no longer appears in the public comment listing or count for its article

#### Scenario: Restoring a removed comment returns it to public output
- **WHEN** a permitted caller restores a comment that is currently removed
- **THEN** the comment's status becomes visible, and it reappears in the public comment listing and count for its article

#### Scenario: Restoration is available at any later time
- **WHEN** a comment has been in the removed state for an extended period
- **THEN** a permitted caller can still restore it, with no time limit on when restoration may occur

### Requirement: A reader can be muted for a bounded period
A permitted caller SHALL be able to set a reader's mute expiry to a future point in time. A reader
whose mute period has not elapsed SHALL be restricted from authoring content, per the reader's
existing content-creation gate, and SHALL retain read access.

#### Scenario: Muting a reader sets a future expiry
- **WHEN** a permitted caller mutes a reader with a given duration
- **THEN** the reader's mute expiry is set to that duration from now

#### Scenario: A muted reader is restricted from authoring content
- **WHEN** a reader whose mute period has not elapsed attempts to submit a comment
- **THEN** the attempt is rejected

### Requirement: A reader can be banned
A permitted caller SHALL be able to set a reader's status to banned. A banned reader's account
SHALL be rejected on their next authenticated request, and their existing session SHALL no longer
be honoured.

#### Scenario: Banning a reader rejects their next request
- **WHEN** a permitted caller bans a reader
- **THEN** the reader's next authenticated request is rejected as though they held no session

### Requirement: A banned reader's existing comments remain visible
Banning a reader SHALL NOT change the status of any comment that reader has already posted. A
comment authored by a now-banned reader SHALL remain subject only to the comment moderation actions
described above, independent of its author's account status.

#### Scenario: A ban does not remove the reader's past comments
- **WHEN** a reader with previously posted visible comments is banned
- **THEN** those comments remain visible in the public comment listing and count, unchanged by the ban

#### Scenario: Removing a banned reader's comment is a separate, explicit action
- **WHEN** a permitted caller wants a banned reader's past comment taken down
- **THEN** that requires removing the comment directly, which is not a side effect of the ban

### Requirement: A reader can be unmuted and unbanned
A permitted caller SHALL be able to clear a reader's mute expiry immediately, restoring their
ability to author content, and SHALL be able to set a banned reader's status back to active,
restoring their ability to authenticate.

#### Scenario: Unmuting clears an active mute immediately
- **WHEN** a permitted caller unmutes a reader whose mute period has not yet elapsed
- **THEN** the reader's mute expiry is cleared and they may immediately author content again

#### Scenario: Unbanning restores account access
- **WHEN** a permitted caller unbans a reader
- **THEN** the reader's status returns to active and their subsequent authenticated requests are honoured again

### Requirement: A moderation action targeting an unknown comment or reader is rejected
Removing, restoring, muting, unmuting, banning, or unbanning SHALL resolve its target by id and
SHALL be rejected as not found when no comment or reader matches that id, without changing any
record.

#### Scenario: An unknown comment id is not found
- **WHEN** a permitted caller attempts to remove or restore a comment identifier matching no comment
- **THEN** the request is rejected as not found and no comment or moderation record is changed

#### Scenario: An unknown reader id is not found
- **WHEN** a permitted caller attempts to mute, unmute, ban, or unban a reader identifier matching no reader
- **THEN** the request is rejected as not found and no reader or moderation record is changed

### Requirement: Every moderation action is recorded
Every remove, restore, mute, unmute, ban, and unban SHALL be recorded with the acting staff member,
the target's type and identifier, the action taken, an optional reason, and the time it occurred.

#### Scenario: Each action type produces its own record
- **WHEN** a permitted caller performs any of remove, restore, mute, unmute, ban, or unban
- **THEN** a record is created identifying the acting staff member, the target's type and identifier, the specific action taken, and the time it occurred

#### Scenario: A reason is recorded when given
- **WHEN** a permitted caller performs a moderation action and supplies a reason
- **THEN** that reason is stored with the record of that action

#### Scenario: A record persists after later actions on the same target
- **WHEN** a target has been moderated more than once over time
- **THEN** every prior action's record remains readable, not overwritten by the most recent one

### Requirement: The moderation record is written atomically with the state change
The state change a moderation action causes and the record of that action SHALL be committed
together, such that the record exists if and only if the state change was applied.

#### Scenario: A failure applying the state change leaves no record
- **WHEN** a moderation action's underlying state change fails to apply
- **THEN** no record of that action is created

#### Scenario: A failure writing the record rolls back the state change
- **WHEN** a moderation action's state change would apply but recording the action fails
- **THEN** the state change is not left in effect

### Requirement: Comment bodies are rendered as plain text in the moderation queue
The moderation queue SHALL render a comment's body as literal text and SHALL NOT interpret it as
markup, matching how the body is stored.

#### Scenario: Markup in a comment body is not rendered in the queue
- **WHEN** a comment whose body contains markup is displayed in the moderation queue
- **THEN** it is shown as literal text rather than rendered as markup
