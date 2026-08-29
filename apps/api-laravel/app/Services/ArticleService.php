<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\InvalidArticleTransitionException;
use App\Exceptions\SlugConflictException;
use App\Models\Article;
use App\Services\Contracts\DeployNotifierInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Mews\Purifier\Facades\Purifier;

class ArticleService
{
    public function __construct(private readonly DeployNotifierInterface $deployNotifier) {}

    public function create(array $data, string $authorId): Article
    {
        $slug = $this->resolveSlug($data['slug'] ?? null, $data['title']);

        return DB::transaction(function () use ($data, $authorId, $slug) {
            $article = Article::create([
                'title' => $data['title'],
                'slug' => $slug,
                'body_json' => $data['bodyJson'],
                'body_html' => $this->sanitize($data['bodyHtml']),
                'excerpt' => $data['excerpt'] ?? null,
                'status' => 'draft',
                'author_id' => $authorId,
                'featured_media_id' => $data['featuredMediaId'] ?? null,
                'anak_usaha_id' => $data['anakUsahaId'] ?? null,
                'seo_title' => $data['seoTitle'] ?? null,
                'seo_description' => $data['seoDescription'] ?? null,
            ]);

            if (! empty($data['categoryIds'])) {
                $article->categories()->sync(array_unique($data['categoryIds']));
            }

            return $article;
        });
    }

    public function update(Article $article, array $data): Article
    {
        return DB::transaction(function () use ($article, $data) {
            $wasVisible = $article->isCurrentlyVisible();
            $oldSlug = $article->slug;

            $attributes = [];

            if (array_key_exists('title', $data)) {
                $attributes['title'] = $data['title'];
            }

            // A title edit alone never moves an existing slug — only an explicit slug field does.
            if (array_key_exists('slug', $data) && $data['slug'] !== null) {
                $attributes['slug'] = $this->resolveSlug($data['slug'], null, $article->id);
            }

            if (array_key_exists('bodyJson', $data)) {
                $attributes['body_json'] = $data['bodyJson'];
            }

            if (array_key_exists('bodyHtml', $data)) {
                $attributes['body_html'] = $this->sanitize($data['bodyHtml']);
            }

            foreach (['excerpt', 'featuredMediaId', 'anakUsahaId', 'seoTitle', 'seoDescription'] as $field) {
                if (array_key_exists($field, $data)) {
                    $attributes[Str::snake($field)] = $data[$field];
                }
            }

            $article->update($attributes);

            if (array_key_exists('categoryIds', $data)) {
                $article->categories()->sync(array_unique($data['categoryIds']));
            }

            if ($wasVisible || $article->isCurrentlyVisible()) {
                $this->deployNotifier->triggerRebuild();
            }

            return $article->fresh();
        });
    }

    /**
     * Autosave is intentionally narrower than update() — it can never touch slug or status, so
     * an autosave call can't accidentally publish/reslug an article.
     */
    public function autosave(Article $article, array $data): Article
    {
        $article->update(array_filter([
            'title' => $data['title'] ?? null,
            'body_json' => $data['bodyJson'] ?? null,
            'body_html' => isset($data['bodyHtml']) ? $this->sanitize($data['bodyHtml']) : null,
            'excerpt' => $data['excerpt'] ?? null,
        ], fn ($v) => $v !== null));

        return $article->fresh();
    }

    public function delete(Article $article): void
    {
        $wasVisible = $article->isCurrentlyVisible();
        $article->delete();

        if ($wasVisible) {
            $this->deployNotifier->triggerRebuild();
        }
    }

    /** Allowed from draft or scheduled; always overwrites published_at to now, even if it was already scheduled. */
    public function publish(Article $article): Article
    {
        if (! in_array($article->status, ['draft', 'scheduled'], true)) {
            throw new InvalidArticleTransitionException('Only a draft or scheduled article can be published.');
        }

        $article->update(['status' => 'published', 'published_at' => now()]);
        $this->deployNotifier->triggerRebuild();

        return $article;
    }

    public function unpublish(Article $article): Article
    {
        if ($article->status !== 'published') {
            throw new InvalidArticleTransitionException('Only a published article can be unpublished.');
        }

        $article->update(['status' => 'draft', 'published_at' => null]);
        $this->deployNotifier->triggerRebuild();

        return $article;
    }

    public function schedule(Article $article, Carbon $publishAt): Article
    {
        if (! in_array($article->status, ['draft', 'scheduled'], true)) {
            throw new InvalidArticleTransitionException('Only a draft or scheduled article can be (re)scheduled.');
        }

        if ($publishAt->isPast()) {
            throw new InvalidArticleTransitionException('The scheduled time must be in the future.');
        }

        $wasVisible = $article->isCurrentlyVisible();
        $article->update(['status' => 'scheduled', 'published_at' => $publishAt]);

        // Rescheduling a due-but-unpromoted article into the future effectively un-publishes it.
        if ($wasVisible || $article->isCurrentlyVisible()) {
            $this->deployNotifier->triggerRebuild();
        }

        return $article;
    }

    private function sanitize(string $html): string
    {
        return Purifier::clean($html);
    }

    private function resolveSlug(?string $requestedSlug, ?string $title, ?string $ignoreId = null): string
    {
        $slug = $requestedSlug ?: Str::slug($title);

        $exists = Article::where('slug', $slug)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new SlugConflictException();
        }

        return $slug;
    }
}
