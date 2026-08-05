// Allowlist renderer for article bodies (Tiptap/ProseMirror JSON -> semantic HTML).
// The allowlist itself — one entry per supported block type — is implemented by
// add-news-management-system task 3.1. This file is the extension point that
// module wires into on save.

export interface SanitizeResult {
  html: string;
}

/**
 * Placeholder: throws until add-news-management-system implements the allowlist.
 * Kept as a named export so the articles module can import it now and the
 * follow-up change only has to fill in the body, not add wiring.
 */
export function sanitizeHtml(_bodyJson: unknown): SanitizeResult {
  throw new Error('sanitizeHtml allowlist not yet implemented (see add-news-management-system)');
}
