import { getDummyHash, verifyPassword } from '../../lib/password.js';
import { AppError } from '../../middleware/errorHandler.js';
function genericFailure() {
    return new AppError('Invalid email or password', 401, 'invalid_credentials');
}
/**
 * Verifies Argon2id against a real hash if one exists, or a stable dummy hash if it
 * doesn't — every path costs the same, and eligibility (account exists and is active) is
 * checked independently of that result. Anding them together means an unknown email, a
 * disabled account, and a wrong password are all indistinguishable in both response and
 * timing (specs/authentication/spec.md - "Unknown email costs the same as a wrong password").
 * Every staff account carries a password from the moment it's created — there is no
 * not-yet-activated state to model here.
 */
export function createStaffLoginService(repository) {
    return {
        async login(email, password) {
            const staff = await repository.findByEmail(email);
            const hashToVerify = staff?.passwordHash ?? (await getDummyHash());
            const passwordMatches = await verifyPassword(password, hashToVerify);
            const eligible = staff?.status === 'active';
            if (!eligible || !passwordMatches || !staff) {
                throw genericFailure();
            }
            return { subjectId: staff.id };
        },
    };
}
