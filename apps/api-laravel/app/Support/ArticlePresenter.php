<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Article;
use App\Services\MediaService;
use Illuminate\Support\Collection;

/**
 * Shared response shaping for Article — used by both ArticleController (public list/detail,
 * admin CRUD) and CurationController (home feed), so the two never drift on what
 * packages/contracts/src/article.ts's schemas actually require.
 */
class ArticlePresenter
{
    /** Matches articlePublicCardSchema/articlePublicDetailSchema (a superset, safe for both). */
    public static function public(Article $article): array
    {
        $article->loadMissing(['categories', 'anakUsaha', 'author', 'featuredMedia']);

        return [
            'id' => $article->id,
            'slug' => $article->slug,
            'title' => $article->title,
            'excerpt' => $article->excerpt,
            'featuredImageUrl' => self::mediaUrl($article),
            'categories' => self::categories($article),
            'anakUsaha' => self::anakUsaha($article),
            'authorName' => $article->author?->name ?? '',
            'publishedAt' => $article->published_at?->toIso8601String(),
            'bodyHtml' => $article->body_html,
            'seoTitle' => $article->seo_title,
            'seoDescription' => $article->seo_description,
            'keywords' => $article->keywords,
        ];
    }

    /**
     * The staff preview: everything `public()` returns, except `bodyHtml` is rendered fresh from
     * `body_json` in preview mode rather than read from the stored `body_html` column — the one
     * read path in the system permitted to re-render, specifically so it can include internal
     * note blocks the stored public HTML never contains
     * (specs/article-management/spec.md - "The staff preview is the one read that re-renders").
     */
    public static function preview(Article $article): array
    {
        return [
            ...self::public($article),
            'bodyHtml' => ArticleBodyRenderer::render($article->body_json, 'preview'),
        ];
    }

    /**
     * Matches articleAdminResponseSchema. `$isHyperlocalSpotlight` is resolved by the caller
     * (ArticleController), never derived from `$article` itself — the spotlight lives in its
     * own singleton table, not on the article row
     * (specs/hyperlocal-spotlight/spec.md - "Spotlight flag is not stored on the article row").
     */
    public static function admin(Article $article, bool $isHyperlocalSpotlight = false): array
    {
        $article->loadMissing(['categories', 'anakUsaha', 'author', 'featuredMedia']);

        return [
            'id' => $article->id,
            'title' => $article->title,
            'slug' => $article->slug,
            'bodyJson' => $article->body_json,
            'bodyHtml' => $article->body_html,
            'excerpt' => $article->excerpt,
            'status' => $article->status,
            'authorId' => $article->author_id,
            'authorName' => $article->author?->name ?? '',
            'featuredMediaId' => $article->featured_media_id,
            'featuredImageUrl' => self::mediaUrl($article),
            'categories' => self::categories($article),
            'anakUsaha' => self::anakUsaha($article),
            'seoTitle' => $article->seo_title,
            'seoDescription' => $article->seo_description,
            'keywords' => $article->keywords,
            'publishedAt' => $article->published_at?->toIso8601String(),
            'createdAt' => $article->created_at->toIso8601String(),
            'updatedAt' => $article->updated_at->toIso8601String(),
            'isHyperlocalSpotlight' => $isHyperlocalSpotlight,
        ];
    }

    private static function mediaUrl(Article $article): ?string
    {
        return $article->featuredMedia ? app(MediaService::class)->publicUrl($article->featuredMedia) : null;
    }

    private static function categories(Article $article): Collection
    {
        return $article->categories->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'slug' => $c->slug])->values();
    }

    private static function anakUsaha(Article $article): ?array
    {
        return $article->anakUsaha
            ? ['id' => $article->anakUsaha->id, 'name' => $article->anakUsaha->name, 'slug' => $article->anakUsaha->slug]
            : null;
    }
}
