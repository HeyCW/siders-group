// Allowlist renderer for article bodies (Tiptap/ProseMirror JSON -> semantic HTML).
//
// This never parses untrusted HTML. It walks a ProseMirror document tree and emits HTML
// itself, one string literal per allowlisted node/mark type — an unrecognized node, mark, or
// attribute is simply never turned into a tag, rather than being scrubbed out of markup after
// the fact. That is what "allowlist" means here: nothing reaches the output that this file did
// not deliberately choose to emit (specs/article-management/spec.md -
// "Server-side content sanitization").
const HEADING_TAGS = { 1: 'h1', 2: 'h2', 3: 'h3' };
/** `language-<lang>` classes are common CSS-injection-free, so only constrain the charset. */
const LANGUAGE_PATTERN = /^[a-zA-Z0-9_+-]{1,32}$/;
const ALIGN_VALUES = new Set(['left', 'center', 'right']);
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
}
/**
 * Accepts only http(s) absolute URLs or root-relative paths. Rejects `javascript:`, `data:`,
 * and every other scheme that could execute in the reader's browser when clicked or loaded.
 */
function sanitizeUrl(value) {
    if (typeof value !== 'string' || value.length === 0)
        return null;
    if (value.startsWith('/') && !value.startsWith('//'))
        return value;
    try {
        const url = new URL(value);
        if (url.protocol === 'http:' || url.protocol === 'https:')
            return url.toString();
        return null;
    }
    catch {
        return null;
    }
}
function sanitizePositiveInt(value, max) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max)
        return null;
    return value;
}
function nodeArray(content) {
    if (!Array.isArray(content))
        return [];
    return content.filter((n) => typeof n === 'object' && n !== null);
}
function markArray(marks) {
    if (!Array.isArray(marks))
        return [];
    return marks.filter((m) => typeof m === 'object' && m !== null);
}
/** Wraps already-escaped text in every allowlisted mark it carries. Unknown marks are dropped. */
function renderMarks(innerHtml, marks) {
    return marks.reduce((html, mark) => {
        switch (mark.type) {
            case 'bold':
                return `<strong>${html}</strong>`;
            case 'italic':
                return `<em>${html}</em>`;
            case 'underline':
                return `<u>${html}</u>`;
            case 'strike':
                return `<s>${html}</s>`;
            case 'link': {
                const href = sanitizeUrl(mark.attrs?.href);
                if (!href)
                    return html;
                return `<a href="${escapeAttr(href)}" rel="noopener noreferrer nofollow" target="_blank">${html}</a>`;
            }
            default:
                return html;
        }
    }, innerHtml);
}
function renderText(node) {
    if (typeof node.text !== 'string' || node.text.length === 0)
        return '';
    return renderMarks(escapeHtml(node.text), markArray(node.marks));
}
/** Code block content is rendered as plain escaped text — marks never apply inside code. */
function renderCodeText(nodes) {
    return nodes
        .map((n) => (n.type === 'text' && typeof n.text === 'string' ? escapeHtml(n.text) : ''))
        .join('');
}
function renderChildren(node) {
    return nodeArray(node.content).map(renderNode).join('');
}
function renderImage(node) {
    const attrs = node.attrs ?? {};
    const src = sanitizeUrl(attrs.src);
    if (!src)
        return '';
    const alt = typeof attrs.alt === 'string' ? escapeAttr(attrs.alt) : '';
    const width = sanitizePositiveInt(attrs.width, 4000);
    const align = typeof attrs.align === 'string' && ALIGN_VALUES.has(attrs.align) ? attrs.align : 'center';
    const caption = typeof attrs.caption === 'string' && attrs.caption.length > 0 ? attrs.caption : null;
    const widthAttr = width !== null ? ` width="${width}"` : '';
    const img = `<img src="${escapeAttr(src)}" alt="${alt}"${widthAttr}>`;
    const figcaption = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
    return `<figure class="align-${align}">${img}${figcaption}</figure>`;
}
/**
 * Video is rendered as a plain link, never an `<iframe>` — embedding an arbitrary third-party
 * URL in a frame is exactly the kind of "pass it through unchanged" behavior the allowlist
 * exists to prevent. The public site is free to upgrade recognized providers to a real embed
 * client-side; this layer only guarantees the stored HTML is inert on its own.
 */
function renderVideo(node) {
    const src = sanitizeUrl(node.attrs?.src);
    if (!src)
        return '';
    return `<figure class="video-embed"><a href="${escapeAttr(src)}" rel="noopener noreferrer nofollow" target="_blank">${escapeHtml(src)}</a></figure>`;
}
function renderTableCell(node, tag) {
    const colspan = sanitizePositiveInt(node.attrs?.colspan, 1000);
    const rowspan = sanitizePositiveInt(node.attrs?.rowspan, 1000);
    const colspanAttr = colspan && colspan > 1 ? ` colspan="${colspan}"` : '';
    const rowspanAttr = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : '';
    return `<${tag}${colspanAttr}${rowspanAttr}>${renderChildren(node)}</${tag}>`;
}
function renderNode(node) {
    switch (node.type) {
        case 'doc':
            return renderChildren(node);
        case 'text':
            return renderText(node);
        case 'paragraph':
            return `<p>${renderChildren(node)}</p>`;
        case 'heading': {
            const level = sanitizePositiveInt(node.attrs?.level, 3);
            const tag = level !== null ? HEADING_TAGS[level] : undefined;
            if (!tag)
                return `<p>${renderChildren(node)}</p>`;
            return `<${tag}>${renderChildren(node)}</${tag}>`;
        }
        case 'blockquote':
            return `<blockquote>${renderChildren(node)}</blockquote>`;
        case 'codeBlock': {
            const language = typeof node.attrs?.language === 'string' && LANGUAGE_PATTERN.test(node.attrs.language)
                ? node.attrs.language
                : null;
            const classAttr = language ? ` class="language-${escapeAttr(language)}"` : '';
            return `<pre><code${classAttr}>${renderCodeText(nodeArray(node.content))}</code></pre>`;
        }
        case 'bulletList':
            return `<ul>${renderChildren(node)}</ul>`;
        case 'orderedList': {
            const start = sanitizePositiveInt(node.attrs?.start, 100000);
            const startAttr = start && start !== 1 ? ` start="${start}"` : '';
            return `<ol${startAttr}>${renderChildren(node)}</ol>`;
        }
        case 'listItem':
            return `<li>${renderChildren(node)}</li>`;
        case 'taskList':
            return `<ul class="task-list">${renderChildren(node)}</ul>`;
        case 'taskItem': {
            const checked = node.attrs?.checked === true;
            const checkedAttr = checked ? ' checked' : '';
            return `<li class="task-item" data-checked="${checked}"><input type="checkbox" disabled${checkedAttr}>${renderChildren(node)}</li>`;
        }
        case 'table':
            return `<table><tbody>${renderChildren(node)}</tbody></table>`;
        case 'tableRow':
            return `<tr>${renderChildren(node)}</tr>`;
        case 'tableCell':
            return renderTableCell(node, 'td');
        case 'tableHeader':
            return renderTableCell(node, 'th');
        case 'image':
            return renderImage(node);
        case 'horizontalRule':
            return '<hr>';
        case 'video':
            return renderVideo(node);
        default:
            // Unrecognized node type: omit it and its content entirely. There is no safe way to
            // infer semantics for a type this renderer was never taught, so nothing is emitted
            // rather than guessing (specs/article-management/spec.md -
            // "Disallowed markup is stripped").
            return '';
    }
}
/**
 * Renders sanitized, semantic HTML from a Tiptap/ProseMirror document. Never throws on
 * malformed input — an article whose `body_json` fails to parse as a document renders as an
 * empty body rather than failing the request that reads it.
 */
export function sanitizeHtml(bodyJson) {
    if (typeof bodyJson !== 'object' || bodyJson === null)
        return { html: '' };
    return { html: renderNode(bodyJson) };
}
