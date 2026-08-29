import { z } from 'zod';
/** Matches `packages/db/src/schema/contact.ts`'s `contact_message_status` enum exactly. */
export const CONTACT_MESSAGE_STATUSES = ['new', 'read'];
export const contactMessageStatusSchema = z.enum(CONTACT_MESSAGE_STATUSES);
// Exported (not module-private) so `apps/web/components/contact/ContactForm.tsx` can enforce the
// same caps client-side instead of guessing at them, matching how `COMMENT_MAX_LENGTH`
// (`engagement.ts`) is shared between its Zod schema and `CommentSection.tsx`.
export const CONTACT_NAME_MAX_LENGTH = 200;
export const CONTACT_ORGANISATION_MAX_LENGTH = 200;
export const CONTACT_EMAIL_MAX_LENGTH = 320; // RFC 5321 4.5.3.1.3 — max total mailbox length
export const CONTACT_SUBJECT_MAX_LENGTH = 200;
export const CONTACT_MESSAGE_MAX_LENGTH = 5000;
/**
 * `.strict()` — the submitter is anonymous, so there is no session-derived field (an actor id, a
 * reader id) a caller might invent, unlike the moderation schemas' rationale for `.strict()`. Here
 * it guards against a caller attaching an unexpected field (e.g. `status`) to a public endpoint
 * that accepts no such input from outside.
 */
export const contactMessageSubmitRequestSchema = z
    .object({
    name: z.string().trim().min(1).max(CONTACT_NAME_MAX_LENGTH),
    organisation: z.string().trim().min(1).max(CONTACT_ORGANISATION_MAX_LENGTH).optional(),
    email: z.string().trim().email().max(CONTACT_EMAIL_MAX_LENGTH),
    subject: z.string().trim().min(1).max(CONTACT_SUBJECT_MAX_LENGTH).optional(),
    message: z.string().trim().min(1).max(CONTACT_MESSAGE_MAX_LENGTH),
})
    .strict();
/** Confirms what was recorded, mirroring `commentReportResponseSchema`'s role for the reporting
 *  reader — the submitter's own confirmation, not a shape any other caller ever sees. */
export const contactMessageSubmitResponseSchema = z.object({
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
});
/** `all` is a read-side filter value only, matching `commentQueueStatusFilterSchema`'s convention
 *  — never a value a caller sets a message *to*. */
export const CONTACT_MESSAGE_STATUS_FILTERS = ['new', 'read', 'all'];
export const contactMessageStatusFilterSchema = z.enum(CONTACT_MESSAGE_STATUS_FILTERS);
export const contactMessageQuerySchema = z.object({
    status: contactMessageStatusFilterSchema.default('all'),
});
/** The admin inbox row. No reply affordance in the shape itself
 *  (specs/contact-messages/spec.md - "The admin panel is not itself the reply channel") — the
 *  page renders `email` for reference only. */
export const contactMessageRowSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    organisation: z.string().nullable(),
    email: z.string(),
    subject: z.string().nullable(),
    message: z.string(),
    status: contactMessageStatusSchema,
    createdAt: z.string().datetime(),
});
/** A bare array, matching `readerQueueResponseSchema` — this list is unpaginated
 *  (specs/contact-messages/spec.md names no pagination requirement, unlike the comment queue). */
export const contactMessageListResponseSchema = z.array(contactMessageRowSchema);
export const contactMessageUnreadCountResponseSchema = z.object({
    count: z.number().int().nonnegative(),
});
/** `.strict()` — a message's id is named by the path, so `id` is exactly the field this schema
 *  refuses, matching `commentModerateRequestSchema`'s convention. */
export const contactMessageUpdateRequestSchema = z
    .object({
    status: contactMessageStatusSchema,
})
    .strict();
