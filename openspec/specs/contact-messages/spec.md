# contact-messages Specification

## Purpose

Defines the public contact-form intake endpoint and the permission-gated admin inbox staff use to read the messages it receives, including the unread-count signal the admin panel polls to notify staff of new arrivals.

## Requirements

### Requirement: Any visitor can submit a contact message without authentication
The contact-message submission endpoint SHALL accept a name, email, message, and optional organisation and subject from any caller, without requiring a reader or staff session.

#### Scenario: An anonymous visitor submits a message
- **WHEN** a caller with no session submits a contact message with a valid name, email, and message
- **THEN** the message is recorded

### Requirement: A submission is validated server-side before it is recorded
The endpoint SHALL reject a submission missing a required field (name, email, message) or containing a malformed email, independent of any client-side validation.

#### Scenario: A malformed submission is rejected
- **WHEN** a submission is missing a required field or has a malformed email address
- **THEN** the submission is rejected and no message is recorded

### Requirement: Contact submissions are rate-limited per address
The submission endpoint SHALL limit each caller address to 3 submissions per hour, independent of any other endpoint's rate limit.

#### Scenario: A fourth submission within an hour is rejected
- **WHEN** a caller address has already submitted 3 contact messages within the past hour and submits a fourth
- **THEN** the fourth submission is rejected and no message is recorded

### Requirement: Reading contact messages requires the contact.manage permission
Every endpoint that lists, reads, or changes the read state of contact messages SHALL require the caller to hold the `contact.manage` permission.

#### Scenario: A caller without the permission is rejected
- **WHEN** a staff caller lacking `contact.manage` requests the contact-message inbox
- **THEN** the request is rejected and no messages are returned

#### Scenario: An anonymous caller is rejected
- **WHEN** a caller holding no staff session requests the contact-message inbox
- **THEN** the request is rejected

### Requirement: The inbox lists messages filterable by read status, newest first
A permitted caller SHALL be able to list contact messages ordered newest-first, optionally filtered to only unread (`NEW`) or only read (`READ`) messages.

#### Scenario: Listing without a filter returns all messages
- **WHEN** a permitted caller lists contact messages with no status filter
- **THEN** all messages are returned newest-first, regardless of read state

#### Scenario: Listing with a status filter returns only matching messages
- **WHEN** a permitted caller lists contact messages filtered to `NEW`
- **THEN** only messages that have not been marked read are returned

### Requirement: A message body is rendered as plain text in the admin inbox
The admin inbox SHALL render a message's body as literal text and SHALL NOT interpret it as markup, since it originates from an unauthenticated, untrusted submitter.

#### Scenario: Markup in a message body is not rendered
- **WHEN** a contact message whose body contains markup is displayed in the inbox
- **THEN** it is shown as literal text rather than rendered as markup

### Requirement: A permitted caller can mark a message read or unread
A permitted caller SHALL be able to set a specific message's state to `READ` or back to `NEW`. There is no third state and no removal — a message persists in the inbox indefinitely.

#### Scenario: Marking a message read
- **WHEN** a permitted caller marks a `NEW` message as read
- **THEN** the message's state becomes `READ`

#### Scenario: Marking a message unread again
- **WHEN** a permitted caller marks a `READ` message as unread
- **THEN** the message's state becomes `NEW`

#### Scenario: An unknown message is rejected
- **WHEN** a permitted caller attempts to change the read state of a message id that does not exist
- **THEN** the request is rejected

### Requirement: A permitted caller can retrieve the current unread count
A permitted caller SHALL be able to retrieve the number of contact messages currently in the `NEW` state, independent of retrieving the message list itself.

#### Scenario: Unread count reflects only NEW messages
- **WHEN** a permitted caller retrieves the unread count while some messages are `NEW` and others are `READ`
- **THEN** the count returned equals the number of `NEW` messages only

### Requirement: The admin panel is not itself the reply channel
The admin inbox SHALL surface a message's sender email for reference, and SHALL NOT provide any mechanism to send a reply from within the admin panel.

#### Scenario: A message can be read but not replied to in-app
- **WHEN** a permitted caller views a contact message
- **THEN** the sender's email is shown, and no send-reply action is available
