// Argon2id hash + verify for staff passwords.
// Fleshed out by the auth/users follow-up change.

export function hashPassword(_plaintext: string): Promise<string> {
  throw new Error('hashPassword not yet implemented (see the auth/users follow-up change)');
}

export function verifyPassword(_plaintext: string, _hash: string): Promise<boolean> {
  throw new Error('verifyPassword not yet implemented (see the auth/users follow-up change)');
}
