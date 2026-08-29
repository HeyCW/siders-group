<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Article;
use App\Models\HomeCuration;
use Illuminate\Support\Collection;

class HomeFeedService
{
    /**
     * Curated entries are filtered to only those *currently* publicly visible (relative order
     * preserved), then backfilled with the most recent published articles (excluding anything
     * already included) if the curated head doesn't fill the requested limit. Entirely
     * server-side composition — reuses Article::scopePubliclyVisible, never re-derives it.
     *
     * @return Collection<int, Article>
     */
    public function compose(int $limit): Collection
    {
        $curated = HomeCuration::with('article')
            ->orderBy('position')
            ->get()
            ->map(fn (HomeCuration $c) => $c->article)
            ->filter(fn (?Article $a) => $a !== null && $a->isCurrentlyVisible())
            ->values()
            ->take($limit);

        if ($curated->count() >= $limit) {
            return $curated;
        }

        $excludeIds = $curated->pluck('id')->all();
        $remaining = $limit - $curated->count();

        $backfill = Article::publiclyVisible()
            ->when($excludeIds !== [], fn ($q) => $q->whereNotIn('id', $excludeIds))
            ->orderByDesc('published_at')
            ->limit($remaining)
            ->get();

        return $curated->concat($backfill)->values();
    }
}
