## MODIFIED Requirements

### Requirement: Contact form validates client-side and submits to a real endpoint
The Contact page's message form SHALL validate required fields and email format before allowing submission, and SHALL submit valid input to the contact-message intake endpoint, reporting the genuine outcome of that submission rather than fabricating or suppressing it.

#### Scenario: Invalid input blocks submission
- **WHEN** a visitor attempts to submit the contact form with a missing required field or a malformed email
- **THEN** submission is blocked and the invalid field is indicated

#### Scenario: Valid submission succeeds
- **WHEN** a visitor submits the contact form with all fields valid
- **THEN** the message is sent to the contact-message intake endpoint and the page shows that the message was received

#### Scenario: Submission fails
- **WHEN** a visitor submits the contact form with all fields valid but the intake endpoint request fails (network error, server error, or rate limit)
- **THEN** the page reports that sending failed rather than indicating success, and does not silently discard the visitor's input
