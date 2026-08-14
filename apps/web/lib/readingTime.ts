/** Estimated from the real sanitized body — not a fabricated per-article number. */
export function estimateReadMinutes(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
