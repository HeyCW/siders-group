import { z } from 'zod';
export const categoryCreateRequestSchema = z
    .object({
    name: z.string().min(1).max(200),
})
    .strict();
export const categoryUpdateRequestSchema = z
    .object({
    name: z.string().min(1).max(200),
})
    .strict();
export const categoryResponseSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
});
