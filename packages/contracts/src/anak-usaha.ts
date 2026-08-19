import { z } from 'zod';

export const anakUsahaCreateRequestSchema = z
  .object({
    name: z.string().min(1).max(200),
  })
  .strict();
export type AnakUsahaCreateRequest = z.infer<typeof anakUsahaCreateRequestSchema>;

export const anakUsahaUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(200),
  })
  .strict();
export type AnakUsahaUpdateRequest = z.infer<typeof anakUsahaUpdateRequestSchema>;

export const anakUsahaResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});
export type AnakUsahaResponse = z.infer<typeof anakUsahaResponseSchema>;
