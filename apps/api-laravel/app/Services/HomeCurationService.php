<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Article;
use App\Models\HomeCuration;
use App\Services\Contracts\DeployNotifierInterface;
use Illuminate\Support\Collection;

class HomeCurationService
{
    public function __construct(
        private readonly ReplaceOrderingService $replaceOrderingService,
        private readonly DeployNotifierInterface $deployNotifier,
    ) {}

    /** @return Collection<int, array{article: Article, position: int, isVisible: bool}> */
    public function listWithVisibility(): Collection
    {
        return HomeCuration::with('article')
            ->orderBy('position')
            ->get()
            ->map(fn (HomeCuration $c) => [
                'article' => $c->article,
                'position' => $c->position,
                'isVisible' => $c->article?->isCurrentlyVisible() ?? false,
            ]);
    }

    /**
     * Whole-list replace: delete every existing curated slot and reinsert the submitted article
     * ids in order (position = array index). An unknown article id rolls the whole transaction
     * back rather than partially applying.
     *
     * @param array<int, string> $articleIds
     */
    public function replace(array $articleIds): void
    {
        $this->replaceOrderingService->replaceWhole(
            table: 'home_curation',
            lockName: 'home_curation',
            foreignKeyColumn: 'article_id',
            referencedTable: 'articles',
            orderedForeignIds: $articleIds,
        );

        $this->deployNotifier->triggerRebuild();
    }
}
