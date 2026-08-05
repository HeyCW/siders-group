## Purpose

Governs the lifecycle of staff accounts — creation, invitation, disabling, and credential reset — gated by the user-management permission, with no self-service signup path and additional Owner-only protection around granting Owner access.

## ADDED Requirements

### Requirement: No unauthenticated staff account creation
No route SHALL create a staff account for an unauthenticated caller. Staff accounts SHALL only come into existence through an invitation issued by a caller holding the user-management permission.

#### Scenario: Anonymous caller cannot create a staff account
- **WHEN** an anonymous caller requests the staff-creation endpoint
- **THEN** the request is rejected and no staff account is created

#### Scenario: No route creates a staff account without the user-management permission
- **WHEN** the set of registered routes is enumerated
- **THEN** no route creates a staff account without requiring a caller holding the user-management permission

### Requirement: Staff invitation
A caller holding the user-management permission SHALL be able to create a new staff account by specifying at least an email address, a name, and a role. The system SHALL send an invitation to that email address rather than setting a password directly. The system SHALL reject creating a staff account for an email address that already belongs to any staff account, in any status.

#### Scenario: Permitted caller invites a new staff member
- **WHEN** a caller holding the user-management permission submits a new staff member's email address, name, and role
- **THEN** a staff account is created in an inactive, invited state, and an invitation is sent to that email address

#### Scenario: Caller without the user-management permission cannot invite staff
- **WHEN** a staff member lacking the user-management permission attempts to create or invite a staff account
- **THEN** the request is rejected and no staff account is created

#### Scenario: Inviting an email that already has an account is rejected
- **WHEN** a staff account is created for an email address that already belongs to an active, invited, or disabled staff account
- **THEN** the request is rejected, and the existing account's status, role, and credentials are unchanged

### Requirement: Only an Owner may grant Owner access
Creating or inviting a staff account whose initial role is the Owner role SHALL require that the caller already holds the Owner role. Holding the user-management permission SHALL NOT be sufficient.

#### Scenario: Non-Owner with user-management permission cannot invite an Owner
- **WHEN** a staff member holding the user-management permission but not the Owner role creates or invites a staff account whose role is the Owner role
- **THEN** the request is rejected and no staff account is created

#### Scenario: Owner may invite another Owner
- **WHEN** a staff member holding the Owner role invites a staff account whose role is the Owner role
- **THEN** the invitation is created

### Requirement: Invitation and reset tokens are single-use, hashed, and short-lived
Invitation and reset tokens SHALL be cryptographically random with at least 128 bits of entropy, SHALL be stored only as hashes, SHALL expire within 24 hours of issuance, and SHALL be single-use. Token comparison SHALL be constant-time. Issuing a new invitation or reset token for an account SHALL invalidate every previously outstanding token of that kind for that account.

#### Scenario: Expired or already-used token is rejected
- **WHEN** a caller submits an invitation or reset token that has expired or has already been consumed
- **THEN** the system rejects it and the account's credentials and status are unchanged

#### Scenario: Issuing a new token invalidates the previous one
- **WHEN** a second invitation or reset is issued for an account that already has an outstanding token of that kind
- **THEN** the earlier token is no longer usable

### Requirement: Invitation acceptance activates the account
A staff member who receives an invitation SHALL be able to set their password through their single-use invitation link, after which their account becomes active and they can sign in.

#### Scenario: Accepting an invitation activates the account
- **WHEN** an invited staff member follows their invitation link and sets a password before it expires
- **THEN** their account becomes active and they can subsequently sign in with that password

#### Scenario: Re-invitation does not alter an active account
- **WHEN** an invitation is re-issued for an account that is already active
- **THEN** the request is rejected, and the account's status, role, and password are unchanged

### Requirement: Disabling a staff account
A caller holding the user-management permission SHALL be able to disable an active staff account. A disabled account SHALL lose the ability to sign in, and all of its existing sessions SHALL be revoked.

#### Scenario: Disabling ends the ability to sign in
- **WHEN** a permitted caller disables a staff account
- **THEN** subsequent sign-in attempts using that account's credentials are rejected

#### Scenario: Disabling revokes existing sessions on the next request
- **WHEN** a permitted caller disables a staff account that holds an active session
- **THEN** requests made with that account's existing access credentials are rejected on their next request, without waiting for credential expiry

#### Scenario: A staff member cannot disable their own account
- **WHEN** a staff member attempts to disable the account they are signed in as
- **THEN** the request is rejected

### Requirement: Credential reset
A caller holding the user-management permission SHALL be able to trigger a credential reset for a staff account, and a staff member SHALL be able to request a reset for their own account without being signed in. Both paths SHALL respond identically whether or not the target account exists, so the endpoint cannot be used to enumerate staff email addresses. Setting a new password through any reset or invitation-acceptance path SHALL revoke every existing session for that account.

#### Scenario: Reset issues a single-use link and retires the old password
- **WHEN** a permitted caller triggers a credential reset for a staff account
- **THEN** a single-use reset link is issued to that account's email address, and the previous password no longer works once a new one is set

#### Scenario: Self-service reset request does not reveal account existence
- **WHEN** a reset is requested for an email address that has no staff account
- **THEN** the system returns the same response it would return for an email address that does have one

#### Scenario: Setting a new password revokes existing sessions
- **WHEN** a staff member's password is set through a reset or invitation-acceptance link while they hold active sessions
- **THEN** none of those sessions' credentials are accepted afterward
