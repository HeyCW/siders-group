import { z } from 'zod';

export const tagCreateRequestSchema = z
  .object({
    name: z.string().min(1).max(200),
  })
  .strict();
export type TagCreateRequest = z.infer<typeof tagCreateRequestSchema>;

export const tagUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(200),
  })
  .strict();
export type TagUpdateRequest = z.infer<typeof tagUpdateRequestSchema>;

export const tagResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});
export type TagResponse = z.infer<typeof tagResponseSchema>;
