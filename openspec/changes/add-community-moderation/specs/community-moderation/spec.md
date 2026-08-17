## Purpose

Defines staff moderation of reader-generated activity from `article-engagement`, and the
reader-facing report intake that feeds it: the permission gating every staff moderation endpoint,
the comment queue and its filters (including comments carrying open reports) and pagination, filing
and dismissing a report, removing and restoring a comment, muting and banning a reader and reversing
both, the record kept of every staff action, the rule that a banned reader's existing comments are
not touched by the ban that silenced them, and the rule that report volume alone never triggers an
automatic action.

## ADDED Requirements

### Requirement: Moderation endpoints require the moderation.manage permission
Every endpoint that lists, removes, restores, dismisses a comment's reports, mutes, unmutes, bans,
or unbans SHALL declare the `moderation.manage` permission. Authorization SHALL be evaluated against
the caller's permissions and SHALL NOT branch on the name of any role. Filing a report is a reader
action, not a staff one, and is excluded from this requirement — see "A reader can report a
comment".

#### Scenario: Staff member without moderation.manage is rejected
- **WHEN** an authenticated staff member whose role does not include `moderation.manage` attempts to list, remove, restore, dismiss reports, mute, unmute, ban, or unban
- **THEN** the request is rejected as forbidden and no comment or reader record is changed

#### Scenario: Staff member with moderation.manage is allowed
- **WHEN** an authenticated staff member whose role includes `moderation.manage` performs any moderation action
- **THEN** the request is allowed

#### Scenario: Anonymous caller cannot reach any moderation endpoint
- **WHEN** a client with no session requests any moderation endpoint
- **THEN** the request is rejected as unauthenticated

### Requirement: The comment queue lists comments filterable by status, newest first
The comment queue SHALL be reachable only by a permitted caller. It SHALL return comments ordered
newest first, SHALL accept a status filter of `visible`, `removed`, `all`, or `reported` — `reported`
returning only comments currently carrying at least one unresolved report — and SHALL include each
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

#### Scenario: Filtering to reported comments
- **WHEN** a permitted caller requests the queue filtered to `reported`
- **THEN** only comments currently carrying at least one unresolved report are returned

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

### Requirement: A reader can report a comment
Any authenticated reader SHALL be able to file a report against a comment, supplying a reason from a
fixed set and an optional note. Filing a report SHALL NOT require the `moderation.manage`
permission — it is authorized as an ordinary reader action, not a staff one.

#### Scenario: A reader files a report
- **WHEN** an authenticated reader reports a comment, supplying a reason
- **THEN** a report is recorded against that comment, attributed to that reader

#### Scenario: An anonymous caller cannot report
- **WHEN** a caller holding no reader session attempts to report a comment
- **THEN** the request is rejected and no report is recorded

### Requirement: A reader may report a given comment only once
A reader who has already reported a comment SHALL be rejected on a further report of that same
comment.

#### Scenario: A second report from the same reader on the same comment is rejected
- **WHEN** a reader who has already reported a comment attempts to report that same comment again
- **THEN** the second report is rejected and only the first report remains recorded

### Requirement: A sanctioned reader may still report
Neither a mute nor a ban SHALL restrict a reader from filing a report, since a report is not
reader-authored content shown to anyone else — it is consistent with the rule that neither sanction
restricts liking, for the same reason.

#### Scenario: A muted reader reports a comment
- **WHEN** a reader whose mute period has not elapsed reports a comment
- **THEN** the report is recorded

#### Scenario: A banned reader reports a comment
- **WHEN** a reader who is banned reports a comment
- **THEN** the report is recorded

### Requirement: A comment's open report count and reasons are never themselves an action
Each comment returned by the reported filter SHALL report its number of unresolved reports and the
distinct reasons given across them. No number of unresolved reports SHALL, by itself, remove a
comment, restrict its author, or otherwise act — the count exists to help a permitted caller decide
what to look at, and every consequence still requires that caller's explicit action.

#### Scenario: A reported row carries its open count and reasons
- **WHEN** a comment with unresolved reports is returned by the reported filter
- **THEN** it is accompanied by the number of unresolved reports against it and the distinct reasons given

#### Scenario: Report volume alone does not remove a comment or restrict its author
- **WHEN** a comment accumulates any number of unresolved reports without a permitted caller acting on it
- **THEN** the comment remains visible and its author remains unrestricted

### Requirement: A permitted caller can dismiss a comment's open reports without removing it
A permitted caller SHALL be able to dismiss every open report against a comment, judging the comment
fine to remain, without changing the comment's status.

#### Scenario: Dismissing reports leaves the comment visible
- **WHEN** a permitted caller dismisses a comment's open reports
- **THEN** the comment's status is unchanged and its open reports are marked resolved

### Requirement: A comment can be removed and restored
A permitted caller SHALL be able to set a comment's status to `removed`, hiding it from the public
comment listing and count without deleting its row, and SHALL be able to set it back to `visible`
at any later time, restoring it to the public listing and count. Both actions SHALL accept an
optional reason. Removing a comment SHALL also resolve every open report against it, in the same
transaction as the status change; restoring a comment SHALL NOT reopen reports that its earlier
removal resolved.

#### Scenario: Removing a comment hides it from public output
- **WHEN** a permitted caller removes a comment
- **THEN** the comment's status becomes removed, and it no longer appears in the public comment listing or count for its article

#### Scenario: Restoring a removed comment returns it to public output
- **WHEN** a permitted caller restores a comment that is currently removed
- **THEN** the comment's status becomes visible, and it reappears in the public comment listing and count for its article

#### Scenario: Restoration is available at any later time
- **WHEN** a comment has been in the removed state for an extended period
- **THEN** a permitted caller can still restore it, with no time limit on when restoration may occur

#### Scenario: Removing a comment resolves its open reports
- **WHEN** a permitted caller removes a comment carrying open reports
- **THEN** the comment's status becomes removed and every one of its open reports is marked resolved in that same operation

#### Scenario: Restoring a comment does not reopen resolved reports
- **WHEN** a permitted caller restores a comment whose reports were resolved by its earlier removal
- **THEN** the comment's status becomes visible again and its previously resolved reports remain resolved

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
A permitted caller SHALL be able to set a reader's status to banned. A banned reader SHALL be
rejected only at endpoints that create reader-authored content, indefinitely, and SHALL retain
every other reader-only endpoint, including continued use of any existing session.

#### Scenario: Banning a reader blocks their next comment attempt
- **WHEN** a permitted caller bans a reader
- **THEN** that reader's next attempt to submit a comment is rejected

#### Scenario: A banned reader keeps reading, liking, and reporting
- **WHEN** a reader who has been banned requests a read-only endpoint, likes an article, or files a report
- **THEN** the request succeeds

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
restoring their ability to author content.

#### Scenario: Unmuting clears an active mute immediately
- **WHEN** a permitted caller unmutes a reader whose mute period has not yet elapsed
- **THEN** the reader's mute expiry is cleared and they may immediately author content again

#### Scenario: Unbanning restores the reader's ability to comment
- **WHEN** a permitted caller unbans a reader
- **THEN** the reader's status returns to active and their next attempt to submit a comment is no longer rejected on account of the ban

### Requirement: A moderation action targeting an unknown comment or reader is rejected
Removing, restoring, dismissing a comment's reports, muting, unmuting, banning, or unbanning SHALL
resolve its target by id and SHALL be rejected as not found when no comment or reader matches that
id, without changing any record.

#### Scenario: An unknown comment id is not found
- **WHEN** a permitted caller attempts to remove or restore a comment identifier matching no comment
- **THEN** the request is rejected as not found and no comment or moderation record is changed

#### Scenario: An unknown reader id is not found
- **WHEN** a permitted caller attempts to mute, unmute, ban, or unban a reader identifier matching no reader
- **THEN** the request is rejected as not found and no reader or moderation record is changed

### Requirement: Every moderation action is recorded
Every remove, restore, dismissal of a comment's reports, mute, unmute, ban, and unban SHALL be
recorded with the acting staff member, the target's type and identifier, the action taken, an
optional reason, and the time it occurred.

#### Scenario: Each action type produces its own record
- **WHEN** a permitted caller performs any of remove, restore, dismiss reports, mute, unmute, ban, or unban
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
