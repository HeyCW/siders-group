# article-engagement Specification

## Purpose

Defines reader engagement on publicly visible articles: how anonymous reads are counted and
deduplicated, how a signed-in reader likes and unlikes an article, how a signed-in reader posts a
comment and how comments are served, which of these a muted reader may still do, and the rule that
every one of these endpoints resolves its article through the same public-visibility predicate the
rest of the public API uses.

## Requirements

### Requirement: Engagement endpoints act only on publicly visible articles
Every view, like, comment, and engagement-summary endpoint SHALL resolve its target article by the
same public-visibility rule the public article API uses, and SHALL respond as not-found for an
article that is not publicly visible, without distinguishing it from an article that does not
exist.

#### Scenario: An unknown article identifier is not found
- **WHEN** any engagement endpoint is called with an identifier matching no article
- **THEN** the request is rejected as not found, and no view, like, or comment is recorded

#### Scenario: A draft article is not found rather than forbidden
- **WHEN** any engagement endpoint is called with the identifier of an article that is not publicly visible
- **THEN** the response is indistinguishable from the response for an identifier that matches no article at all

#### Scenario: A scheduled article whose time has passed is engageable
- **WHEN** an engagement endpoint is called for a scheduled article whose publication time has already passed
- **THEN** the article is treated as publicly visible, matching the public article API's own reading of that state

### Requirement: Views are counted anonymously and deduplicated per visitor per day
Recording a view SHALL require no reader session. Each recorded view SHALL increment that
article's total for the current day. A view SHALL additionally increment that day's unique total
only when the visitor has not already been counted for that article on that day.

#### Scenario: An anonymous visitor's view is counted
- **WHEN** a visitor holding no session records a view of a publicly visible article
- **THEN** the article's view total increases

#### Scenario: A repeat view on the same day adds to totals but not to uniques
- **WHEN** the same visitor records a second view of the same article on the same day
- **THEN** the article's total view count increases and its unique view count for that day does not

#### Scenario: The same visitor is counted as unique again on a later day
- **WHEN** a visitor who was already counted for an article records a view of it on a later day
- **THEN** that later day's unique view count includes them

#### Scenario: A visitor is never identified by their address in storage
- **WHEN** a view is recorded
- **THEN** the visitor is represented by a keyed digest of their address rather than the address itself

### Requirement: Recording a view never blocks the reader
A failure to record a view — including rejection by the rate limiter — SHALL NOT prevent the
article's engagement counts and comments from being displayed.

#### Scenario: A rejected view still yields counts
- **WHEN** recording a view fails or is rate limited
- **THEN** the engagement counts and comments still load and render

### Requirement: Likes require a reader session and toggle
Liking SHALL be available only to an authenticated reader, and SHALL toggle: a reader who has not
liked an article likes it, and a reader who has liked it removes that like. A reader SHALL hold at
most one like per article. Anonymous callers SHALL be rejected.

#### Scenario: An anonymous caller cannot like
- **WHEN** a caller holding no reader session attempts to like an article
- **THEN** the request is rejected and no like is recorded

#### Scenario: A first like is recorded
- **WHEN** a signed-in reader who has not liked an article likes it
- **THEN** a like is recorded for that reader and article, and the article's like count increases by one

#### Scenario: Liking again removes the like
- **WHEN** a signed-in reader who has already liked an article invokes like again
- **THEN** their like is removed and the article's like count decreases by one

#### Scenario: A reader cannot like the same article twice
- **WHEN** a reader's like requests for one article race each other
- **THEN** at most one like exists for that reader and article

### Requirement: A sanctioned reader may still like
Muting or banning SHALL restrict a reader from authoring content and SHALL NOT restrict liking,
since a like publishes no reader-authored text.

#### Scenario: A muted reader likes an article
- **WHEN** a reader whose mute period has not elapsed likes an article
- **THEN** the like is recorded

#### Scenario: A muted reader cannot comment
- **WHEN** a reader whose mute period has not elapsed submits a comment
- **THEN** the request is rejected and no comment is recorded

#### Scenario: A banned reader likes an article
- **WHEN** a reader who is banned likes an article
- **THEN** the like is recorded

#### Scenario: A banned reader cannot comment
- **WHEN** a reader who is banned submits a comment
- **THEN** the request is rejected and no comment is recorded

### Requirement: Comments require a reader session and publish immediately
Submitting a comment SHALL be available only to an authenticated reader who is neither banned nor
currently muted. An accepted comment SHALL become publicly visible immediately, with no review
step. A comment body SHALL be required, non-blank, and bounded in length.

#### Scenario: An anonymous caller cannot comment
- **WHEN** a caller holding no reader session submits a comment
- **THEN** the request is rejected and no comment is recorded

#### Scenario: An accepted comment is immediately readable
- **WHEN** a signed-in reader submits a valid comment
- **THEN** that comment appears in the article's public comment listing without any intervening approval

#### Scenario: A blank comment is rejected
- **WHEN** a reader submits a comment whose body is empty or only whitespace
- **THEN** the request is rejected as invalid and no comment is recorded

#### Scenario: An over-long comment is rejected
- **WHEN** a reader submits a comment body longer than the permitted maximum
- **THEN** the request is rejected as invalid and no comment is recorded

### Requirement: Comments are flat and stored as plain text
A comment SHALL reference exactly one article and SHALL carry no reference to a parent comment.
A comment body SHALL be stored and served as plain text, and SHALL NOT be interpreted as markup by
any consumer.

#### Scenario: No comment refers to another comment
- **WHEN** a comment is recorded
- **THEN** it carries no parent, and no reply relationship between comments is representable

#### Scenario: Markup in a comment body is not interpreted
- **WHEN** a reader submits a comment body containing markup
- **THEN** that body is served and displayed as literal text rather than rendered as markup

### Requirement: The public comment listing serves only visible comments, newest first
The comment listing SHALL be public, SHALL return only comments in the visible state, SHALL order
them newest first, and SHALL accept a caller-supplied page size and offset so a reader can load
further comments.

#### Scenario: Anyone can read comments
- **WHEN** a caller holding no session requests an article's comments
- **THEN** the visible comments are returned

#### Scenario: A removed comment is not served
- **WHEN** a comment has been placed in the removed state
- **THEN** it does not appear in the public comment listing, and the article's comment count excludes it

#### Scenario: Newest comments come first
- **WHEN** an article has several visible comments
- **THEN** they are returned most recently created first

#### Scenario: Further comments are reachable by offset
- **WHEN** a caller requests comments beyond the first page using an offset
- **THEN** the following comments are returned, continuing the same newest-first order

### Requirement: The engagement summary reports counts and the caller's own like state
A single public endpoint SHALL report an article's view count, like count, and visible-comment
count, together with whether the calling reader has liked it. For a caller holding no reader
session, that last value SHALL be false rather than an error.

#### Scenario: An anonymous caller receives counts
- **WHEN** a caller holding no reader session requests an article's engagement summary
- **THEN** the view, like, and comment counts are returned and the caller's own like state is reported as not liked

#### Scenario: A signed-in reader's own like state is reported
- **WHEN** a reader who has liked an article requests its engagement summary
- **THEN** the summary reports that this caller has liked it

#### Scenario: The comment count matches the listing
- **WHEN** the engagement summary reports a comment count
- **THEN** that count equals the number of comments the public listing would serve for the same article

### Requirement: Engagement writes are rate limited per caller
Recording a view, liking, and commenting SHALL each be rate limited in its own independent budget.
The view limit SHALL be keyed on the caller's address; the like and comment limits SHALL be keyed
on the reader's identity so that readers sharing one address do not share a budget.

#### Scenario: Exhausting one budget does not exhaust another
- **WHEN** a caller exhausts the view budget
- **THEN** their ability to like or comment is unaffected

#### Scenario: Readers behind one address have separate comment budgets
- **WHEN** two readers commenting from the same address each submit comments
- **THEN** neither reader's submissions consume the other's budget
