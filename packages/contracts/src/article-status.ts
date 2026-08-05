import { z } from 'zod';

export const ARTICLE_STATUSES = ['draft', 'scheduled', 'published'] as const;

export const articleStatusSchema = z.enum(ARTICLE_STATUSES);

export type ArticleStatus = z.infer<typeof articleStatusSchema>;
