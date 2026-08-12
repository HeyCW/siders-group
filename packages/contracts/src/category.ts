import { z } from 'zod';

export const categoryCreateRequestSchema = z
  .object({
    name: z.string().min(1).max(200),
  })
  .strict();
export type CategoryCreateRequest = z.infer<typeof categoryCreateRequestSchema>;

export const categoryUpdateRequestSchema = z
  .object({
    name: z.string().min(1).max(200),
  })
  .strict();
export type CategoryUpdateRequest = z.infer<typeof categoryUpdateRequestSchema>;

export const categoryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
});
export type CategoryResponse = z.infer<typeof categoryResponseSchema>;
