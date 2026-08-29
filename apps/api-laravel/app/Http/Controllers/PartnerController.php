<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Partner\StorePartnerRequest;
use App\Http\Requests\Partner\UpdatePartnerRequest;
use App\Models\Partner;
use App\Services\MediaService;
use App\Services\PartnerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PartnerController extends Controller
{
    public function __construct(
        private readonly PartnerService $partnerService,
        private readonly MediaService $mediaService,
    ) {}

    public function adminIndex(): JsonResponse
    {
        $partners = Partner::with('logoMedia')->orderBy('sort_order')->get();

        return response()->json(['data' => $partners->map(fn (Partner $p) => $this->shape($p))]);
    }

    public function publicIndex(): JsonResponse
    {
        $partners = Partner::with('logoMedia')->where('is_active', true)->orderBy('sort_order')->get();

        return response()->json(['data' => $partners->map(fn (Partner $p) => $this->shape($p))]);
    }

    public function store(StorePartnerRequest $request): JsonResponse
    {
        $partner = $this->partnerService->create($request->validated());

        return response()->json(['data' => $this->shape($partner->load('logoMedia'))], 201);
    }

    public function update(UpdatePartnerRequest $request, string $id): JsonResponse
    {
        $partner = $this->partnerService->update(Partner::findOrFail($id), $request->validated());

        return response()->json(['data' => $this->shape($partner->load('logoMedia'))]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->partnerService->delete(Partner::findOrFail($id));

        return response()->json(['data' => null]);
    }

    /** Returns the reordered list, not null — apps/admin/src/pages/PartnersPage.tsx replaces its
     *  local state with this response directly after a drag-reorder. */
    public function reorder(Request $request): JsonResponse
    {
        $request->validate(['partnerIds' => ['required', 'array']]);
        $this->partnerService->reorder($request->input('partnerIds'));

        $partners = Partner::with('logoMedia')->orderBy('sort_order')->get();

        return response()->json(['data' => $partners->map(fn (Partner $p) => $this->shape($p))]);
    }

    /** Matches packages/contracts/src/partner.ts's partnerResponseSchema. */
    private function shape(Partner $partner): array
    {
        return [
            'id' => $partner->id,
            'name' => $partner->name,
            'logoUrl' => $partner->logoMedia ? $this->mediaService->publicUrl($partner->logoMedia) : null,
            'websiteUrl' => $partner->website_url,
            'sortOrder' => $partner->sort_order,
            'isActive' => $partner->is_active,
            'createdAt' => $partner->created_at->toIso8601String(),
            'updatedAt' => $partner->updated_at->toIso8601String(),
        ];
    }
}
