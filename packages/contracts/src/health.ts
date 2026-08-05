import { z } from 'zod';

export const pingResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime(),
});

export type PingResponse = z.infer<typeof pingResponseSchema>;
