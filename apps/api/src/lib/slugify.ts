import { AppError } from '../middleware/errorHandler.js';

// Matches the Unicode "Combining Diacritical Marks" block (U+0300-U+036F) — after NFKD
// normalization splits an accented character into base + mark (e.g. e-acute -> "e" + U+0301),
// stripping this range removes the accent and leaves the plain ASCII base letter.
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/** Kebab-case, lowercase, ASCII, URL-safe. Shared by articles, categories, and tags. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * `slugify` for callers that require a usable result. A value with no ASCII alphanumerics
 * ("!!!", "你好") slugifies to an empty string, which is not a URL-safe slug and must never
 * reach the database — `slug` columns are unique, so the first empty slug silently claims it
 * and every later one fails with a slug-conflict error the caller cannot act on.
 */
export function slugifyRequired(value: string, subject: string): string {
  const slug = slugify(value);
  if (!slug) {
    throw new AppError(`${subject} must contain at least one letter or number`, 400, 'invalid_slug');
  }
  return slug;
}
