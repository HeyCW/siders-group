import { z } from 'zod';
export declare const staffSignInRequestSchema: z.ZodObject<{
    email: z.ZodPipeline<z.ZodString, z.ZodString>;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type StaffSignInRequest = z.infer<typeof staffSignInRequestSchema>;
/** No `body`/`path`/anything readable by client script — the CSRF token travels as a header. */
export declare const csrfHeaderName = "x-csrf-token";
