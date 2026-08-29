import { z } from 'zod';
export declare const categoryCreateRequestSchema: z.ZodObject<{
    name: z.ZodString;
}, "strict", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export type CategoryCreateRequest = z.infer<typeof categoryCreateRequestSchema>;
export declare const categoryUpdateRequestSchema: z.ZodObject<{
    name: z.ZodString;
}, "strict", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export type CategoryUpdateRequest = z.infer<typeof categoryUpdateRequestSchema>;
export declare const categoryResponseSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    slug: string;
}, {
    name: string;
    id: string;
    slug: string;
}>;
export type CategoryResponse = z.infer<typeof categoryResponseSchema>;
