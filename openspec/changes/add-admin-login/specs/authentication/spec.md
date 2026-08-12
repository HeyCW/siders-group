## MODIFIED Requirements

### Requirement: State-changing requests require a CSRF token
Every state-changing request (any method other than GET, HEAD, or OPTIONS) that is authenticated by session cookie SHALL be rejected unless it carries a CSRF token matching a separate, script-readable CSRF cookie issued when the session was established. The check SHALL fail closed: a missing, empty, or mismatched token is a rejection. Requests carrying no session credential SHALL be unaffected by this check.

The CSRF cookie SHALL persist for at least as long as the refresh credential it accompanies, rather than expiring at the end of the browser session. A CSRF cookie that could disappear while its refresh credential remains valid would leave a returning caller unable to perform any state-changing request — including the sign-in, refresh, and sign-out requests that would otherwise recover from it.

#### Scenario: State-changing request without a CSRF token is rejected
- **WHEN** a request carrying valid session cookies but no CSRF token attempts a state-changing operation
- **THEN** the request is rejected and no state change occurs

#### Scenario: Mismatched CSRF token is rejected
- **WHEN** the CSRF token submitted with a state-changing request does not match the CSRF cookie
- **THEN** the request is rejected and no state change occurs

#### Scenario: Request from a same-site sibling origin is still rejected without a token
- **WHEN** a state-changing request originates from a different origin that nonetheless shares the session cookie's domain, with cookies attached but no matching CSRF token
- **THEN** the request is rejected

#### Scenario: CSRF cookie survives a browser restart
- **WHEN** a browser holding a still-valid refresh credential is closed and reopened, discarding any cookie that carries no explicit lifetime of its own
- **THEN** the CSRF cookie issued at sign-in is still present, and a subsequent state-changing request is not rejected for a missing CSRF token

The CSRF token SHALL be bound to the session that issued it, and that binding SHALL be verified on every state-changing request that presents an identifiable session — which is what retires the previous token on rotation, since rotation establishes a new session identity. The binding SHALL be carried in the token itself and verified against the session claim already present on the request, without a database read.

Session refresh is the single exception, and it is a structural one: refresh exists to be called once the access credential has expired, so there is no session claim to bind against. At that endpoint the token's signature SHALL still be verified, the session binding SHALL NOT be relied upon, and the response SHALL issue a replacement token bound to the newly established session. An unexpired-but-superseded token therefore remains usable at refresh alone, where it authorizes nothing beyond rotating a refresh credential the caller already holds.

#### Scenario: A new CSRF token is issued on session rotation
- **WHEN** a session is established or its credentials are rotated
- **THEN** a matching CSRF cookie is issued alongside, bound to the newly established session

#### Scenario: A token bound to a superseded session is rejected
- **WHEN** a state-changing request presents an identifiable session together with a CSRF token bound to a different session
- **THEN** the request is rejected

#### Scenario: Refresh verifies the token's signature where no session can be identified
- **WHEN** a refresh request arrives with an expired access credential, so no session claim is available, carrying a validly signed CSRF token
- **THEN** the signature is verified, the request proceeds, and the response issues a replacement token bound to the new session

#### Scenario: A forged CSRF token is rejected even where the binding cannot be checked
- **WHEN** a refresh request arrives with a CSRF token that does not verify against the signing secret
- **THEN** the request is rejected

### Requirement: Session refresh
The system SHALL allow a caller holding a valid, unrevoked, unexpired refresh credential to obtain a new access credential without re-entering sign-in credentials, and SHALL invalidate the presented refresh credential when doing so. Refresh SHALL match the presented credential against a session of the same account type, SHALL confirm the referenced account still exists and is active, and SHALL reject any session that is revoked or past its expiry. Every session SHALL additionally have an absolute maximum lifetime beyond which refresh is refused regardless of recent activity. Reuse detection SHALL NOT attempt to distinguish a stolen credential from a second, otherwise-legitimate presentation of the same credential racing the first — both SHALL be treated as compromise identically, which places on any caller integration the responsibility of never holding more than one in-flight refresh request per session.

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

#### Scenario: A second presentation is treated as reuse regardless of intent
- **WHEN** a refresh credential already treated as used is presented again, whether by an attacker or by the credential's own holder racing a second request against the first
- **THEN** the system revokes the lineage exactly as specified above, without attempting to determine which case occurred
