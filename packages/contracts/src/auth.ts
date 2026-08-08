import { z } from 'zod';

export const staffSignInRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type StaffSignInRequest = z.infer<typeof staffSignInRequestSchema>;

/** No `body`/`path`/anything readable by client script — the CSRF token travels as a header. */
export const csrfHeaderName = 'x-csrf-token';
