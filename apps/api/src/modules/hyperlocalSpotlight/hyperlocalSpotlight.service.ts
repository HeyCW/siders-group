import type { HyperlocalSpotlightResponse, PublicHyperlocalSpotlight } from '@siders/contracts';
import type { Env } from '../../config/env.js';
import { isPubliclyVisible, type ArticleRepository } from '../articles/article.repository.js';
import { toPublicCard } from '../articles/article.mapper.js';
import type { HyperlocalSpotlightRepository } from './hyperlocalSpotlight.repository.js';
import { toArticleSummary } from './hyperlocalSpotlight.mapper.js';

type MediaUrlEnv = Pick<Env, 'MEDIA_PUBLIC_BASE_URL'>;

export interface HyperlocalSpotlightService {
  /**
   * The stored editor pick (whatever its visibility) plus what the spotlight currently resolves
   * to publicly (specs/hyperlocal-spotlight/spec.md - "Admin read of the current spotlight").
   */
  getAdmin(): Promise<HyperlocalSpotlightResponse>;
  /**
   * The resolved article in public card shape, or none — never a 404 for an ordinary empty
   * state (specs/hyperlocal-spotlight/spec.md - "Public spotlight read").
   */
  getPublic(): Promise<PublicHyperlocalSpotlight>;
}

export function createHyperlocalSpotlightService(
  spotlightRepository: HyperlocalSpotlightRepository,
  articleRepository: ArticleRepository,
  env: MediaUrlEnv,
): HyperlocalSpotlightService {
  return {
    async getAdmin() {
      const now = new Date();
      const pickId = await spotlightRepository.getArticleId();
      const pick = pickId ? await articleRepository.findById(pickId) : null;

      const editorPick = pick
        ? { article: toArticleSummary(pick), status: pick.status, isPubliclyVisible: isPubliclyVisible(pick, now) }
        : null;

      if (pick && isPubliclyVisible(pick, now)) {
        return { editorPick, resolved: toArticleSummary(pick), resolvedIsEditorPick: true };
      }

      // No editor pick, or one that isn't currently publicly visible — resolve by fallback
      // rather than leaving the section blank (specs/hyperlocal-spotlight/spec.md - "The
      // spotlight falls back to the newest published article"). The fallback is never written
      // back into the slot; it is recomputed on every read.
      const [fallback] = await articleRepository.listPublished({ limit: 1, offset: 0, now });
      return {
        editorPick,
        resolved: fallback ? toArticleSummary(fallback) : null,
        resolvedIsEditorPick: false,
      };
    },

    async getPublic() {
      const now = new Date();
      const pickId = await spotlightRepository.getArticleId();
      if (pickId) {
        const [visiblePick] = await articleRepository.findManyPubliclyVisible([pickId], now);
        if (visiblePick) return { article: toPublicCard(env, visiblePick), isEditorPick: true };
      }
      const [fallback] = await articleRepository.listPublished({ limit: 1, offset: 0, now });
      return fallback ? { article: toPublicCard(env, fallback), isEditorPick: false } : { article: null, isEditorPick: false };
    },
  };
}
