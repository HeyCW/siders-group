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
