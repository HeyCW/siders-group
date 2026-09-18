/** Turns the stored comma-separated `keywords` string into display-ready chips. */
export function splitKeywords(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
