<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\GuidePick;
use App\Services\Contracts\DeployNotifierInterface;

class GuidePickService
{
    public function __construct(
        private readonly ReplaceOrderingService $replaceOrderingService,
        private readonly DeployNotifierInterface $deployNotifier,
    ) {}

    public function create(array $data): GuidePick
    {
        $sortOrder = (int) (GuidePick::max('sort_order') ?? -1) + 1;

        $guidePick = GuidePick::create([
            'city' => $data['city'],
            'place' => $data['place'],
            'description' => $data['description'],
            'photo_media_id' => $data['photoMediaId'] ?? null,
            'video_media_id' => $data['videoMediaId'],
            'sort_order' => $sortOrder,
            'is_active' => $data['isActive'] ?? true,
        ]);

        $this->deployNotifier->triggerRebuild();

        return $guidePick;
    }

    public function update(GuidePick $guidePick, array $data): GuidePick
    {
        $guidePick->update(array_filter([
            'city' => $data['city'] ?? null,
            'place' => $data['place'] ?? null,
            'description' => $data['description'] ?? null,
            'photo_media_id' => $data['photoMediaId'] ?? null,
            'video_media_id' => $data['videoMediaId'] ?? null,
            'is_active' => $data['isActive'] ?? null,
        ], fn ($v) => $v !== null));

        $this->deployNotifier->triggerRebuild();

        return $guidePick;
    }

    public function delete(GuidePick $guidePick): void
    {
        $guidePick->delete();
        $this->deployNotifier->triggerRebuild();
    }

    /** @param array<int, string> $orderedIds */
    public function reorder(array $orderedIds): void
    {
        $this->replaceOrderingService->reorderExisting('guide_picks', 'guide_picks', $orderedIds);
        $this->deployNotifier->triggerRebuild();
    }
}
