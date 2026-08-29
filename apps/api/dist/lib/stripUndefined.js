/**
 * Removes keys whose value is `undefined`, and — critically — types the result so each
 * remaining key's value excludes `undefined` too. Needed at every Drizzle `.set()` call site:
 * this codebase's `exactOptionalPropertyTypes` makes "partial update" input types spell out
 * `field?: T | undefined` (so a destructured, possibly-absent property is assignable back into
 * another optional-input type), but Drizzle's generated `.set()` parameter type declares its
 * optional columns without the explicit `| undefined` — so passing the input type straight
 * through, even with the `undefined`-valued keys actually absent at runtime, fails to satisfy
 * the narrower target type. This closes that gap once instead of at every call site.
 */
export function stripUndefined(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined)
            result[key] = value;
    }
    return result;
}
