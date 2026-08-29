const TAG_PATTERN = /<[^>]*>/g;
const WHITESPACE_PATTERN = /\s+/g;
const ELLIPSIS = '…';
const ENTITIES = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
};
function decodeEntities(text) {
    return text.replace(/&amp;|&lt;|&gt;|&quot;/g, (entity) => ENTITIES[entity] ?? entity);
}
/**
 * Plain-text snippet from `sanitizeHtml`'s allowlisted output, for cards whose author left
 * `excerpt` blank. Safe to strip tags with a bare regex only because that renderer always
 * quote-escapes attribute values — untrusted HTML would need a real parser.
 */
export function excerptFromHtml(html, maxLength) {
    const text = decodeEntities(html.replace(TAG_PATTERN, ' ')).replace(WHITESPACE_PATTERN, ' ').trim();
    if (text.length <= maxLength)
        return text;
    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    const boundary = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
    return `${boundary}${ELLIPSIS}`;
}
