// Sign/verify the access JWT and rotate refresh token families.
// Fleshed out by the auth/users follow-up change.

export interface AccessTokenClaims {
  subjectId: string;
  subjectType: 'staff' | 'reader';
}

export function signAccessToken(_claims: AccessTokenClaims): string {
  throw new Error('signAccessToken not yet implemented (see the auth/users follow-up change)');
}

export function verifyAccessToken(_token: string): AccessTokenClaims {
  throw new Error('verifyAccessToken not yet implemented (see the auth/users follow-up change)');
}
