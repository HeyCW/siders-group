<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Partner;
use App\Services\Contracts\DeployNotifierInterface;

class PartnerService
{
    public function __construct(
        private readonly ReplaceOrderingService $replaceOrderingService,
        private readonly DeployNotifierInterface $deployNotifier,
    ) {}

    public function create(array $data): Partner
    {
        $sortOrder = (int) (Partner::max('sort_order') ?? -1) + 1;

        $partner = Partner::create([
            'name' => $data['name'],
            'logo_media_id' => $data['logoMediaId'],
            'website_url' => $data['websiteUrl'] ?? null,
            'sort_order' => $sortOrder,
            'is_active' => $data['isActive'] ?? true,
        ]);

        $this->deployNotifier->triggerRebuild();

        return $partner;
    }

    public function update(Partner $partner, array $data): Partner
    {
        $partner->update(array_filter([
            'name' => $data['name'] ?? null,
            'logo_media_id' => $data['logoMediaId'] ?? null,
            'website_url' => $data['websiteUrl'] ?? null,
            'is_active' => $data['isActive'] ?? null,
        ], fn ($v) => $v !== null));

        $this->deployNotifier->triggerRebuild();

        return $partner;
    }

    /** Deleting self-heals order — there's no separate ordering row to leave dangling. */
    public function delete(Partner $partner): void
    {
        $partner->delete();
        $this->deployNotifier->triggerRebuild();
    }

    /** @param array<int, string> $orderedIds */
    public function reorder(array $orderedIds): void
    {
        $this->replaceOrderingService->reorderExisting('partners', 'partners', $orderedIds);
        $this->deployNotifier->triggerRebuild();
    }
}
