## REMOVED Requirements

### Requirement: Article engagement affordances carry no fabricated activity

**Reason**: Superseded. The like button, comment count, and comment composer are now backed by the
`article-engagement` capability, so the rule forbidding them from carrying activity no longer
describes the page. The half of it that still matters — that no count may be invented — is carried
forward by "Article engagement renders only real activity" below, and by the existing "No
hardcoded sample content ships" scenario, which continues to forbid the design prototype's sample
counts.

**Migration**: The share count remains absent: nothing in this change records shares, so no share
figure is displayed. The comment composer, previously inert, now submits.

## ADDED Requirements

### Requirement: Article engagement renders only real activity
The article detail page's view count, like count, comment count, and comment list SHALL come from
the `article-engagement` capability, and SHALL render no count or comment that did not come from a
real backend response. Until those responses arrive, the page SHALL render a placeholder that
reserves the final layout's space rather than a provisional number.

#### Scenario: No count is invented
- **WHEN** the engagement bar renders
- **THEN** every figure it shows corresponds to a value returned by the backend

#### Scenario: The loading state reserves its own space
- **WHEN** the engagement bar is waiting for its first response
- **THEN** it renders a placeholder occupying the height the loaded bar will occupy, and the article content around it does not shift when the counts arrive

#### Scenario: A failed load is reported, not faked
- **WHEN** the engagement counts cannot be loaded
- **THEN** the bar indicates that engagement is unavailable rather than displaying zeroes

### Requirement: The article page counts its own view without becoming dynamic
Loading an article page SHALL record one view, and SHALL do so from the client after the page has
rendered. The article route SHALL remain incrementally statically regenerated; no part of this
behavior SHALL make it render per request.

#### Scenario: A visit records a view
- **WHEN** a visitor loads an article page
- **THEN** exactly one view is recorded for that article

#### Scenario: The route stays statically regenerated
- **WHEN** the article route is built
- **THEN** it remains incrementally statically regenerated at its existing interval, and no engagement data is fetched during server rendering

#### Scenario: The reader's own view is included in what they see
- **WHEN** the engagement counts render for a visitor
- **THEN** the view count includes that visitor's own view

### Requirement: A signed-out reader is prompted to sign in, never shown a dead control
Where liking or commenting requires a reader session that the visitor does not hold, the page
SHALL render an inline sign-in prompt in that control's place. It SHALL NOT hide the control, and
SHALL NOT render an interactive control that fails on use. The prompt SHALL return the reader to
the article they were reading.

#### Scenario: The like control becomes a sign-in prompt
- **WHEN** a visitor holding no reader session views an article
- **THEN** an inline sign-in prompt appears in place of the like control, and no like control is rendered

#### Scenario: The comment composer becomes a sign-in prompt
- **WHEN** a visitor holding no reader session views an article
- **THEN** an inline sign-in prompt appears in place of the comment composer, and no comment input is rendered

#### Scenario: Comments remain readable while signed out
- **WHEN** a visitor holding no reader session views an article that has comments
- **THEN** those comments are displayed, with only the composer replaced by the prompt

#### Scenario: Signing in returns to the article
- **WHEN** a visitor activates an inline sign-in prompt
- **THEN** they are returned to the article they were reading after signing in

#### Scenario: Neither control is shown before the session is known
- **WHEN** reader session resolution is still in flight
- **THEN** neither the interactive control nor the sign-in prompt is rendered in its place

### Requirement: The comment list is flat and newest-first, with no reply affordance
The article page SHALL display comments as a flat list ordered newest first, SHALL offer a control
to load older comments while more exist, and SHALL present no reply, threading, or nesting
affordance.

#### Scenario: Comments display newest first
- **WHEN** an article's comments are displayed
- **THEN** the most recently posted comment appears first

#### Scenario: No reply control is present
- **WHEN** a comment is displayed
- **THEN** no reply, quote, or nesting control is offered for it

#### Scenario: Older comments load on demand
- **WHEN** more comments exist than are currently displayed
- **THEN** a control to load older comments is shown, and activating it appends them to the existing list

#### Scenario: The load control disappears at the end
- **WHEN** a request for older comments returns fewer than requested
- **THEN** the load control is no longer shown

### Requirement: A posted comment appears without a reload
Submitting a comment SHALL place it at the top of the displayed list and update the comment count,
without requiring the reader to reload the page. A rejected submission SHALL report the rejection
and SHALL retain what the reader typed.

#### Scenario: A submitted comment appears immediately
- **WHEN** a signed-in reader submits a valid comment
- **THEN** it appears at the top of the comment list and the comment count increases, with no page reload

#### Scenario: A rejected comment keeps the reader's text
- **WHEN** a comment submission is rejected
- **THEN** the reason is shown and the reader's text remains in the composer
