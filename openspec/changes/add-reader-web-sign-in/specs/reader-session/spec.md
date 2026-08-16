## Purpose

Defines how the public site establishes, holds, recovers, and ends a reader's identity: the
sign-in entry point, the fast path that keeps anonymous visitors off the session endpoints
entirely, the recovery cycle that keeps a session usable across the access credential's short
lifetime without risking the refresh credential's reuse detection, and the session-dependent
rendering in the masthead.

## ADDED Requirements

### Requirement: Sign-in is initiated by a top-level navigation
The public site SHALL begin reader sign-in by navigating the browser to the API's Google sign-in
endpoint as a full document navigation, never as a background request. The site SHALL supply the
reader's current in-app location as the post-sign-in return target, and SHALL supply only a
location within the public site itself. The site SHALL NOT implement any part of the authorization
exchange itself: it neither generates nor inspects the state, code challenge, or nonce, and it
never handles the authorization code.

#### Scenario: Signing in returns the reader to where they were

- **WHEN** an anonymous reader activates the sign-in control while viewing an article
- **THEN** the browser navigates to the sign-in endpoint carrying that article's location as the return target, and the reader arrives back at that article after a successful sign-in

#### Scenario: The return target names only the public site

- **WHEN** the site supplies a post-sign-in return target
- **THEN** that target names a location within the public site, and never a different origin

#### Scenario: The site performs no part of the exchange

- **WHEN** a reader signs in
- **THEN** the site issues no request carrying an authorization code, state value, code verifier, or nonce

### Requirement: A reader with no session marker triggers no session request
The site SHALL treat the absence of the script-readable CSRF cookie as conclusive evidence that
the browser holds no reader session, and SHALL resolve such a caller as anonymous without issuing
any request to the session, refresh, or CSRF endpoints. This fast path is required, not an
optimization: the refresh endpoint is rate limited per client address, and attempting refresh on
behalf of callers who hold no credential would let anonymous traffic sharing one address exhaust
that budget and deny recovery to genuine returning readers behind it.

#### Scenario: An anonymous visitor makes no session request

- **WHEN** a visitor whose browser holds no CSRF cookie loads any public route
- **THEN** the site resolves them as anonymous and issues no request to the session, refresh, or CSRF endpoints

#### Scenario: A visitor holding the marker is resolved over the network

- **WHEN** a visitor whose browser holds a CSRF cookie loads any public route
- **THEN** the site requests the caller's own reader account to determine whether a session exists

### Requirement: Session resolution recovers an expired access credential
When the request for the caller's own reader account is rejected as unauthenticated, the site
SHALL attempt one session refresh and, if that refresh succeeds, retry the request exactly once
before concluding that no session exists. A refresh that fails SHALL resolve the caller as
anonymous. A retry that is rejected again SHALL resolve the caller as anonymous, and SHALL NOT
trigger a further refresh or retry.

#### Scenario: An expired access credential is recovered

- **WHEN** the caller's account request is rejected as unauthenticated while the browser still holds a valid refresh credential
- **THEN** the site refreshes the session, retries the request once, and resolves the caller as signed in

#### Scenario: A failed refresh resolves the caller as anonymous

- **WHEN** the caller's account request is rejected as unauthenticated and the subsequent refresh is also rejected
- **THEN** the site resolves the caller as anonymous and does not retry the original request

#### Scenario: A request is not retried a second time

- **WHEN** a request has already been retried once following a refresh and is rejected again
- **THEN** the site attempts no further refresh or retry and resolves the caller as anonymous

### Requirement: Refresh is single-flight
Regardless of how many requests are rejected as unauthenticated at approximately the same time,
the site SHALL have at most one refresh request in flight at any time, and every request that
discovers a rejection while a refresh is already in flight SHALL await that same attempt rather
than starting its own. The refresh request itself, and the CSRF re-pairing request, SHALL be
issued outside the recovery cycle so that a rejection from either is resolved by the caller that
issued it rather than re-entering recovery.

#### Scenario: Concurrent rejections share one refresh attempt

- **WHEN** multiple requests are rejected as unauthenticated at approximately the same time
- **THEN** the site issues exactly one refresh request, and every rejected request retries only after that one attempt resolves

#### Scenario: The refresh request does not re-enter recovery

- **WHEN** the refresh request is itself rejected
- **THEN** the site does not attempt to recover it by refreshing again

### Requirement: A CSRF failure is recovered by re-pairing, not by refreshing
When a state-changing request is rejected for a missing or invalid CSRF token, the site SHALL
recover by calling the CSRF re-pairing endpoint and retrying the original request once, and SHALL
NOT attempt a session refresh for that rejection. A request SHALL be retried at most once across
both recovery paths combined, and one path SHALL NOT chain into the other for the same rejection.
Regardless of how many requests discover this rejection at approximately the same time, the site
SHALL have at most one re-pairing request in flight at any time, and every request that discovers
the rejection while one is already in flight SHALL await that same attempt rather than starting
its own.

#### Scenario: A stale CSRF cookie is re-paired and the request retried

- **WHEN** a state-changing request is rejected for a missing or invalid CSRF token
- **THEN** the site calls the re-pairing endpoint and retries the original request exactly once

#### Scenario: Concurrent CSRF failures share one re-pairing attempt

- **WHEN** multiple requests are rejected for a missing or invalid CSRF token at approximately the same time
- **THEN** the site issues exactly one re-pairing request, and every rejected request retries only after that one attempt resolves

#### Scenario: A CSRF failure does not trigger a refresh

- **WHEN** a request is rejected for a missing or invalid CSRF token
- **THEN** the site does not attempt a session refresh for it

#### Scenario: Recovery paths do not chain

- **WHEN** a request retried after CSRF re-pairing is rejected again for any reason
- **THEN** the site does not then attempt a session refresh and retry for that same request

### Requirement: The masthead reflects session state
The site SHALL present a sign-in control to a caller resolved as anonymous, and SHALL present the
signed-in reader's name, their avatar when one is available, and a sign-out control to a caller
resolved as signed in. While session state is still being resolved, the site SHALL NOT present the
signed-in presentation. The session-dependent control SHALL be reachable from every public route.

#### Scenario: An anonymous caller sees a sign-in control

- **WHEN** a caller is resolved as anonymous
- **THEN** the masthead presents a sign-in control and presents no reader name, avatar, or sign-out control

#### Scenario: A signed-in reader sees their identity and a way out

- **WHEN** a caller is resolved as signed in
- **THEN** the masthead presents that reader's name and a sign-out control

#### Scenario: A reader without an avatar still renders

- **WHEN** a signed-in reader's account carries no avatar
- **THEN** the masthead presents their name and sign-out control without a broken or placeholder-less image

#### Scenario: Unresolved state does not claim a session

- **WHEN** session state has not yet resolved
- **THEN** the masthead does not present the signed-in presentation

### Requirement: Public content rendering does not vary by session
The content of every public route SHALL be identical for anonymous and signed-in callers, and the
site SHALL NOT make any public route's cacheability depend on session state. Session resolution
SHALL happen after the route's content is rendered and SHALL affect only the session-dependent
control.

#### Scenario: A cached route serves both anonymous and signed-in readers

- **WHEN** a signed-in reader and an anonymous visitor load the same public route
- **THEN** both receive the same rendered content, and the route's existing caching behavior is unchanged

#### Scenario: No reader-identifying content is cached

- **WHEN** any public route's content is cached
- **THEN** that cached content contains no reader's name, avatar, or account information

### Requirement: Sign-out ends the local session regardless of the call's outcome
Activating the sign-out control SHALL call the sign-out endpoint and SHALL resolve the caller as
anonymous whether or not that call succeeds. After signing out, the site SHALL present the
anonymous state without requiring a page reload.

#### Scenario: Ordinary sign-out returns to the anonymous state

- **WHEN** a signed-in reader signs out and the call succeeds
- **THEN** the site presents the anonymous state

#### Scenario: A failed sign-out call still ends the local session

- **WHEN** a signed-in reader signs out and the call fails
- **THEN** the site still presents the anonymous state

### Requirement: A rejected reader is presented as signed out, without explanation
When the API rejects a caller's session for any reason — an expired or revoked session, or a
reader account that is no longer active — the site SHALL present the anonymous state and SHALL NOT
present a message distinguishing one cause from another. The site SHALL NOT infer or display a
reader's account status.

#### Scenario: A banned reader is presented as signed out

- **WHEN** a reader whose account has been deactivated loads a public route while holding session cookies
- **THEN** the site presents the anonymous state with no message indicating that the account was deactivated

#### Scenario: An expired session is presented identically

- **WHEN** a reader's session has expired or been revoked
- **THEN** the site presents the same anonymous state it presents for a deactivated account
