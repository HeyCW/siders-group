import { z } from 'zod';
export declare const ARTICLE_STATUSES: readonly ["draft", "scheduled", "published"];
export declare const articleStatusSchema: z.ZodEnum<["draft", "scheduled", "published"]>;
export type ArticleStatus = z.infer<typeof articleStatusSchema>;
