import { z } from 'zod';
import { articleStatusSchema } from './article-status.js';
import { articlePublicCardSchema } from './article.js';
import { homeCurationArticleSummarySchema } from './curation.js';

/**
 * The admin read of the hyperlocal spotlight (specs/hyperlocal-spotlight/spec.md - "Admin read
 * of the current spotlight"). Two things are reported, deliberately kept apart rather than
 * collapsed into one:
 *
 * - `editorPick`: the raw stored pick, `null` when none is set, returned even when the picked
 *   article is not publicly visible (a draft, a future-scheduled article, an unpublished one) —
 *   staff need to see it to know what they chose, not just what the public sees.
 * - `resolved` / `resolvedIsEditorPick`: what the spotlight currently shows in public — the
 *   editor pick when it is publicly visible, otherwise the automatic newest-article fallback, or
 *   `null` when nothing publicly visible exists at all.
 *
 * There is no separate "is there anything to show" field: `resolved === null` already answers
 * that (specs/hyperlocal-spotlight/spec.md - "Nothing to resolve reads as success").
 */
export const hyperlocalSpotlightResponseSchema = z.object({
  editorPick: z
    .object({
      article: homeCurationArticleSummarySchema,
      status: articleStatusSchema,
      isPubliclyVisible: z.boolean(),
    })
    .nullable(),
  resolved: homeCurationArticleSummarySchema.nullable(),
  resolvedIsEditorPick: z.boolean(),
});
export type HyperlocalSpotlightResponse = z.infer<typeof hyperlocalSpotlightResponseSchema>;

/**
 * The public read (specs/hyperlocal-spotlight/spec.md - "Public spotlight read"). `article` is
 * the resolved article in the standard public card shape, or `null` when nothing publicly
 * visible exists — never a 404 for an ordinary empty state. `isEditorPick` distinguishes a
 * deliberate pick from the automatic newest-article fallback; the public page does not have to
 * act on it (a fallback renders identically to a pick), but it is there for anyone who does.
 */
export const publicHyperlocalSpotlightSchema = z.object({
  article: articlePublicCardSchema.nullable(),
  isEditorPick: z.boolean(),
});
export type PublicHyperlocalSpotlight = z.infer<typeof publicHyperlocalSpotlightSchema>;
