import { z } from 'zod';
export const pingResponseSchema = z.object({
    status: z.literal('ok'),
    timestamp: z.string().datetime(),
});
