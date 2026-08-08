## Purpose

Identifies who is making a request — reader Google sign-in, staff email-and-password sign-in, and the shared session lifecycle both rely on — without making any access-control decision about what that caller may do.

## ADDED Requirements

### Requirement: Authentication only identifies, never authorizes
Authentication SHALL determine the caller's identity (or that the caller is anonymous) and SHALL NOT reject a request based on that identity. Rejecting a caller is exclusively the responsibility of authorization.

#### Scenario: A valid session is never rejected during identification
- **WHEN** a request carrying a valid session reaches an endpoint that declares no authorization requirement beyond being reachable by any caller
- **THEN** the request is not rejected, and the endpoint observes the caller's identity

#### Scenario: Missing credentials are not an authentication error
- **WHEN** a request carries no session credential
- **THEN** the request is treated as anonymous and is not rejected during identification

### Requirement: Anonymous requests remain valid
A request with no credentials, or with an invalid or expired session, SHALL continue processing as an anonymous request rather than being rejected during identification.

#### Scenario: Expired credential is treated as anonymous
- **WHEN** a request presents an access credential that has expired or fails verification
- **THEN** the request proceeds as anonymous, and no error is raised during identification

#### Scenario: Anonymous caller reaches a public endpoint
- **WHEN** an anonymous request is made to an endpoint declared public
- **THEN** the request completes normally with no identity attached

### Requirement: Session credentials are only ever delivered as protected cookies
Access and refresh credentials SHALL be transmitted solely as cookies marked httpOnly and Secure, with SameSite protection, scoped to the shared application domain. They SHALL NOT appear in any response body, URL, query parameter, or header readable by client script.

#### Scenario: Credentials are absent from the response body
- **WHEN** a sign-in or refresh succeeds
- **THEN** the response body contains no access or refresh credential, and both are set only as httpOnly Secure cookies

#### Scenario: Client script cannot read session credentials
- **WHEN** client-side script enumerates the cookies available to it after sign-in
- **THEN** neither session credential is visible to it

### Requirement: State-changing requests require a CSRF token
Every state-changing request (any method other than GET, HEAD, or OPTIONS) that is authenticated by session cookie SHALL be rejected unless it carries a CSRF token matching a separate, script-readable CSRF cookie issued when the session was established. The check SHALL fail closed: a missing, empty, or mismatched token is a rejection. Requests carrying no session credential SHALL be unaffected by this check.

#### Scenario: State-changing request without a CSRF token is rejected
- **WHEN** a request carrying valid session cookies but no CSRF token attempts a state-changing operation
- **THEN** the request is rejected and no state change occurs

#### Scenario: Mismatched CSRF token is rejected
- **WHEN** the CSRF token submitted with a state-changing request does not match the CSRF cookie
- **THEN** the request is rejected and no state change occurs

#### Scenario: Request from a same-site sibling origin is still rejected without a token
- **WHEN** a state-changing request originates from a different origin that nonetheless shares the session cookie's domain, with cookies attached but no matching CSRF token
- **THEN** the request is rejected

#### Scenario: A new CSRF token is issued on session rotation
- **WHEN** a session is established or its credentials are rotated
- **THEN** a matching CSRF cookie is issued alongside, and the previously issued CSRF token is no longer accepted

### Requirement: Revoked sessions are rejected without waiting for expiry
Every access credential SHALL reference the session that issued it. Wherever an authenticated identity is relied upon to grant access, the system SHALL reject a caller whose referenced session has been revoked or whose underlying account is no longer active, without waiting for the access credential's own expiry. This check SHALL fail closed: if session or account state cannot be determined, the caller is treated as unauthorized.

#### Scenario: Access credential stops working the moment its session is revoked
- **WHEN** a session is revoked and a request is then made with an access credential issued by that session, before that credential would otherwise expire
- **THEN** the request is rejected

#### Scenario: Access credential stops working when the account is deactivated
- **WHEN** an account is disabled or banned and a request is then made with an access credential issued before the deactivation
- **THEN** the request is rejected

### Requirement: Sessions can be revoked in bulk
The system SHALL support revoking every session belonging to a given account, and revoking every session system-wide, without requiring a change to any signing key.

#### Scenario: Revoking an account's sessions ends them everywhere
- **WHEN** every session for an account is revoked
- **THEN** no credential issued by any of those sessions is accepted on any subsequent request

### Requirement: Reader sign-in via Google
Readers SHALL be able to sign in using their Google account. The system SHALL initiate sign-in with a random `state` value, a PKCE code challenge, and a random `nonce`, bound to the browser in a short-lived httpOnly cookie. The system SHALL reject the callback unless `state` matches that cookie, the code exchange presents the matching PKCE verifier, and the verified identity assertion's `nonce` matches the value from the authorization request. The identity assertion SHALL be verified against Google's published keys for issuer, audience, and expiry. These checks SHALL fail closed — an absent binding cookie is a rejection, not a skipped check — and the binding cookie SHALL be single-use. Google's own access and refresh tokens SHALL be discarded after the exchange and never stored. Returning readers SHALL be identified by Google's stable subject identifier rather than by email address.

#### Scenario: New reader signs in with Google
- **WHEN** a person who has never signed in before completes Google sign-in successfully
- **THEN** a reader account is created for them and a reader session is established

#### Scenario: Returning reader is recognized after changing their Google email
- **WHEN** a previously-registered reader signs in again with Google after changing the email address on their Google account
- **THEN** the system recognizes them as the same reader, not a new one

#### Scenario: Callback with a mismatched or absent state is rejected
- **WHEN** a sign-in callback arrives whose `state` does not match the stored value, or arrives with no binding cookie at all
- **THEN** no reader account is created, no session is established, and the request is rejected

#### Scenario: Identity assertion with a mismatched nonce is rejected
- **WHEN** the verified identity assertion's `nonce` does not match the value from the authorization request
- **THEN** no session is established and the request is rejected

#### Scenario: Replayed callback is rejected
- **WHEN** a sign-in callback that has already been consumed is presented a second time
- **THEN** it is rejected and no additional session is established

#### Scenario: Unverified Google email cannot create a reader
- **WHEN** Google sign-in completes but the verified identity assertion does not assert that the email address is verified
- **THEN** no reader account is created, no session is established, and the request is rejected

### Requirement: Post-sign-in redirect targets are validated
The post-sign-in redirect target SHALL be validated against an allowlist of application origins. A target that is absent, unsafe, or outside the allowlist SHALL be replaced with a fixed default in-application path.

#### Scenario: Off-site redirect target is ignored
- **WHEN** sign-in completes with a requested redirect target pointing at an origin outside the allowlist
- **THEN** the caller is redirected to the default in-application path instead

### Requirement: Staff sign-in via email and password
Staff SHALL sign in with an email address and password belonging to an active staff account. The system SHALL reject sign-in for accounts that are not active, and SHALL respond identically regardless of whether the failure was due to an unknown email address, a non-active account, or an incorrect password. The system SHALL perform equivalent password-verification work in all three cases so that response timing does not distinguish them.

#### Scenario: Active staff member signs in successfully
- **WHEN** a staff member with an active account submits their correct email and password
- **THEN** a staff session is established

#### Scenario: Sign-in does not reveal which field was wrong
- **WHEN** a sign-in attempt fails, whether because the email belongs to no account or because the password is incorrect
- **THEN** the system returns the same generic failure response in both cases

#### Scenario: Unknown email costs the same as a wrong password
- **WHEN** sign-in is attempted for an email address with no account and, separately, for an existing account with an incorrect password
- **THEN** both perform equivalent verification work and are not distinguishable by response timing

#### Scenario: Disabled staff account cannot sign in
- **WHEN** a staff member whose account has been disabled submits otherwise-correct credentials
- **THEN** the sign-in is rejected with the same generic failure response

### Requirement: Authentication attempts are rate limited
Rate limiting SHALL be enforced, not merely declared. The system SHALL limit failed sign-in attempts per source-and-email pair, SHALL additionally cap failed sign-in attempts per source address across all email addresses, and SHALL limit attempts against the password-change endpoint, session refresh, and the sign-in callback. Throttled responses SHALL be indistinguishable from ordinary failure responses for the same endpoint.

#### Scenario: Repeated failures for one account are throttled
- **WHEN** sign-in attempts for the same email address from the same source fail repeatedly within a short window
- **THEN** further attempts are rejected regardless of whether the submitted credentials would otherwise be correct

#### Scenario: Password spraying across many accounts is throttled
- **WHEN** a single source makes failed sign-in attempts against many different email addresses, none of which individually exceeds the per-account limit
- **THEN** further attempts from that source are rejected

#### Scenario: Brute-forcing a current password at the change endpoint is throttled
- **WHEN** repeated password-change attempts carrying an incorrect current password are submitted from the same source within a short window
- **THEN** further attempts are rejected

#### Scenario: Throttling does not leak account existence
- **WHEN** a caller is throttled after repeated failures
- **THEN** the response is indistinguishable from an ordinary failure response for that endpoint

### Requirement: Session refresh
The system SHALL allow a caller holding a valid, unrevoked, unexpired refresh credential to obtain a new access credential without re-entering sign-in credentials, and SHALL invalidate the presented refresh credential when doing so. Refresh SHALL match the presented credential against a session of the same account type, SHALL confirm the referenced account still exists and is active, and SHALL reject any session that is revoked or past its expiry. Every session SHALL additionally have an absolute maximum lifetime beyond which refresh is refused regardless of recent activity.

#### Scenario: Refresh extends a session
- **WHEN** a caller's access credential has expired but their refresh credential is still valid and unrevoked
- **THEN** the system issues a new access credential and the caller remains signed in

#### Scenario: Reusing an already-refreshed credential ends the session
- **WHEN** a refresh credential that has already been used to obtain a new one is presented again
- **THEN** the system treats this as compromise, revokes every session in that credential's lineage, and requires signing in again

#### Scenario: Refresh for a deactivated account is refused
- **WHEN** a valid, unrevoked refresh credential is presented for an account that has since been disabled or banned
- **THEN** refresh is refused and the session is revoked

#### Scenario: Session past its absolute lifetime cannot be refreshed
- **WHEN** a session that has been continuously refreshed reaches its absolute maximum lifetime
- **THEN** further refresh is refused and re-authentication is required

### Requirement: Sign-out ends the session
A signed-in caller SHALL be able to end their own session. After sign-out, neither the refresh credential nor any access credential issued by that session SHALL be accepted.

#### Scenario: Signed-out access credential is no longer accepted
- **WHEN** a caller signs out and then presents the access credential issued by that session, before it would otherwise expire
- **THEN** the request is rejected

#### Scenario: Signed-out refresh credential cannot renew
- **WHEN** a caller signs out and then presents that session's refresh credential
- **THEN** refresh is refused and no new access credential is issued
