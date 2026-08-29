import { z } from 'zod';
/** Matches `packages/db/src/schema/contact.ts`'s `contact_message_status` enum exactly. */
export declare const CONTACT_MESSAGE_STATUSES: readonly ["new", "read"];
export declare const contactMessageStatusSchema: z.ZodEnum<["new", "read"]>;
export type ContactMessageStatus = z.infer<typeof contactMessageStatusSchema>;
export declare const CONTACT_NAME_MAX_LENGTH = 200;
export declare const CONTACT_ORGANISATION_MAX_LENGTH = 200;
export declare const CONTACT_EMAIL_MAX_LENGTH = 320;
export declare const CONTACT_SUBJECT_MAX_LENGTH = 200;
export declare const CONTACT_MESSAGE_MAX_LENGTH = 5000;
/**
 * `.strict()` — the submitter is anonymous, so there is no session-derived field (an actor id, a
 * reader id) a caller might invent, unlike the moderation schemas' rationale for `.strict()`. Here
 * it guards against a caller attaching an unexpected field (e.g. `status`) to a public endpoint
 * that accepts no such input from outside.
 */
export declare const contactMessageSubmitRequestSchema: z.ZodObject<{
    name: z.ZodString;
    organisation: z.ZodOptional<z.ZodString>;
    email: z.ZodString;
    subject: z.ZodOptional<z.ZodString>;
    message: z.ZodString;
}, "strict", z.ZodTypeAny, {
    message: string;
    name: string;
    email: string;
    organisation?: string | undefined;
    subject?: string | undefined;
}, {
    message: string;
    name: string;
    email: string;
    organisation?: string | undefined;
    subject?: string | undefined;
}>;
export type ContactMessageSubmitRequest = z.infer<typeof contactMessageSubmitRequestSchema>;
/** Confirms what was recorded, mirroring `commentReportResponseSchema`'s role for the reporting
 *  reader — the submitter's own confirmation, not a shape any other caller ever sees. */
export declare const contactMessageSubmitResponseSchema: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
}, {
    id: string;
    createdAt: string;
}>;
export type ContactMessageSubmitResponse = z.infer<typeof contactMessageSubmitResponseSchema>;
/** `all` is a read-side filter value only, matching `commentQueueStatusFilterSchema`'s convention
 *  — never a value a caller sets a message *to*. */
export declare const CONTACT_MESSAGE_STATUS_FILTERS: readonly ["new", "read", "all"];
export declare const contactMessageStatusFilterSchema: z.ZodEnum<["new", "read", "all"]>;
export type ContactMessageStatusFilter = z.infer<typeof contactMessageStatusFilterSchema>;
export declare const contactMessageQuerySchema: z.ZodObject<{
    status: z.ZodDefault<z.ZodEnum<["new", "read", "all"]>>;
}, "strip", z.ZodTypeAny, {
    status: "new" | "read" | "all";
}, {
    status?: "new" | "read" | "all" | undefined;
}>;
export type ContactMessageQuery = z.infer<typeof contactMessageQuerySchema>;
/** The admin inbox row. No reply affordance in the shape itself
 *  (specs/contact-messages/spec.md - "The admin panel is not itself the reply channel") — the
 *  page renders `email` for reference only. */
export declare const contactMessageRowSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    organisation: z.ZodNullable<z.ZodString>;
    email: z.ZodString;
    subject: z.ZodNullable<z.ZodString>;
    message: z.ZodString;
    status: z.ZodEnum<["new", "read"]>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    name: string;
    status: "new" | "read";
    id: string;
    createdAt: string;
    email: string;
    organisation: string | null;
    subject: string | null;
}, {
    message: string;
    name: string;
    status: "new" | "read";
    id: string;
    createdAt: string;
    email: string;
    organisation: string | null;
    subject: string | null;
}>;
export type ContactMessageRow = z.infer<typeof contactMessageRowSchema>;
/** A bare array, matching `readerQueueResponseSchema` — this list is unpaginated
 *  (specs/contact-messages/spec.md names no pagination requirement, unlike the comment queue). */
export declare const contactMessageListResponseSchema: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    organisation: z.ZodNullable<z.ZodString>;
    email: z.ZodString;
    subject: z.ZodNullable<z.ZodString>;
    message: z.ZodString;
    status: z.ZodEnum<["new", "read"]>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
    name: string;
    status: "new" | "read";
    id: string;
    createdAt: string;
    email: string;
    organisation: string | null;
    subject: string | null;
}, {
    message: string;
    name: string;
    status: "new" | "read";
    id: string;
    createdAt: string;
    email: string;
    organisation: string | null;
    subject: string | null;
}>, "many">;
export type ContactMessageListResponse = z.infer<typeof contactMessageListResponseSchema>;
export declare const contactMessageUnreadCountResponseSchema: z.ZodObject<{
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    count: number;
}, {
    count: number;
}>;
export type ContactMessageUnreadCountResponse = z.infer<typeof contactMessageUnreadCountResponseSchema>;
/** `.strict()` — a message's id is named by the path, so `id` is exactly the field this schema
 *  refuses, matching `commentModerateRequestSchema`'s convention. */
export declare const contactMessageUpdateRequestSchema: z.ZodObject<{
    status: z.ZodEnum<["new", "read"]>;
}, "strict", z.ZodTypeAny, {
    status: "new" | "read";
}, {
    status: "new" | "read";
}>;
export type ContactMessageUpdateRequest = z.infer<typeof contactMessageUpdateRequestSchema>;
