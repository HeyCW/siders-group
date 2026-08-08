import { z } from 'zod';
import { staffEmailSchema } from './staff.js';

// Same normalization as staff creation — otherwise an account created as `owner@x.com` could
// not be signed into as `Owner@x.com`, and the two paths would disagree about identity.
export const staffSignInRequestSchema = z.object({
  email: staffEmailSchema,
  password: z.string().min(1),
});
export type StaffSignInRequest = z.infer<typeof staffSignInRequestSchema>;

/** No `body`/`path`/anything readable by client script — the CSRF token travels as a header. */
export const csrfHeaderName = 'x-csrf-token';
