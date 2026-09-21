import type { HyperlocalSpotlightResponse } from '@siders/contracts';
import { apiFetch } from './api.js';

interface Envelope<T> {
  success: true;
  data: T;
}

/**
 * Read-only — there is no write endpoint here. The spotlight is set through
 * `articlesApi.create`/`articlesApi.update`'s `isHyperlocalSpotlight` field, not through this
 * client (specs/hyperlocal-spotlight/spec.md - "No separate write surface exists"). Its one job
 * is telling `ArticleEditPage` what the spotlight currently shows, so its checkbox can name what
 * checking it would displace.
 */
export const hyperlocalSpotlightApi = {
  get(): Promise<HyperlocalSpotlightResponse> {
    return apiFetch<Envelope<HyperlocalSpotlightResponse>>('/admin/hyperlocal-spotlight').then((r) => r.data);
  },
};
