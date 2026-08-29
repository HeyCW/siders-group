import { z } from 'zod';
export const ARTICLE_STATUSES = ['draft', 'scheduled', 'published'];
export const articleStatusSchema = z.enum(ARTICLE_STATUSES);
