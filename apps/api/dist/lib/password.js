import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
/** OWASP baseline: 19 MiB memory, 2 iterations, parallelism 1 (docs/ARCHITECTURE.md §5.4). */
const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19 * 1024, // KiB
    timeCost: 2,
    parallelism: 1,
};
export function hashPassword(plaintext) {
    return argon2.hash(plaintext, ARGON2_OPTIONS);
}
export function verifyPassword(plaintext, hash) {
    return argon2.verify(hash, plaintext);
}
// Excludes visually confusable characters (0/O, 1/I/l) so an admin reading this off a screen
// can retype it without ambiguity — the one time it will ever be typed by anyone but the
// staff member it belongs to (specs/staff-account-management/spec.md - "Temporary passwords
// are generated, disclosed once, and hashed at rest").
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const TEMP_PASSWORD_LENGTH = 24; // ~140 bits of entropy at this alphabet size, well over the 128-bit floor
/**
 * A random password for staff onboarding and admin-triggered reset — generated server-side,
 * never caller-supplied, disclosed to the caller exactly once by whoever calls this, and
 * hashed at rest through the same `hashPassword` as any user-chosen password.
 */
export function generateTemporaryPassword() {
    const bytes = randomBytes(TEMP_PASSWORD_LENGTH);
    let result = '';
    for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
        result += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
    }
    return result;
}
let dummyHashPromise;
/**
 * A precomputed Argon2id hash of a random value nobody will ever type. Sign-in verifies
 * against this for unknown-email and non-active accounts so those paths cost the same as a
 * real wrong-password check — short-circuiting before hashing is what turns "identical
 * failure response" into a timing side-channel (specs/authentication/spec.md - "Unknown
 * email costs the same as a wrong password").
 */
export function getDummyHash() {
    if (!dummyHashPromise) {
        dummyHashPromise = hashPassword(randomBytes(32).toString('hex'));
    }
    return dummyHashPromise;
}
