<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\GuidePick\StoreGuidePickRequest;
use App\Http\Requests\GuidePick\UpdateGuidePickRequest;
use App\Models\GuidePick;
use App\Services\GuidePickService;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GuidePickController extends Controller
{
    public function __construct(
        private readonly GuidePickService $guidePickService,
        private readonly MediaService $mediaService,
    ) {}

    public function adminIndex(): JsonResponse
    {
        $picks = GuidePick::with(['photoMedia', 'videoMedia'])->orderBy('sort_order')->get();

        return response()->json(['data' => $picks->map(fn (GuidePick $p) => $this->shape($p))]);
    }

    public function publicIndex(): JsonResponse
    {
        $picks = GuidePick::with(['photoMedia', 'videoMedia'])->where('is_active', true)->orderBy('sort_order')->get();

        return response()->json(['data' => $picks->map(fn (GuidePick $p) => $this->shape($p))]);
    }

    public function store(StoreGuidePickRequest $request): JsonResponse
    {
        $pick = $this->guidePickService->create($request->validated());

        return response()->json(['data' => $this->shape($pick->load(['photoMedia', 'videoMedia']))], 201);
    }

    public function update(UpdateGuidePickRequest $request, string $id): JsonResponse
    {
        $pick = $this->guidePickService->update(GuidePick::findOrFail($id), $request->validated());

        return response()->json(['data' => $this->shape($pick->load(['photoMedia', 'videoMedia']))]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->guidePickService->delete(GuidePick::findOrFail($id));

        return response()->json(['data' => null]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $request->validate(['guidePickIds' => ['required', 'array']]);
        $this->guidePickService->reorder($request->input('guidePickIds'));

        return response()->json(['data' => null]);
    }

    private function shape(GuidePick $pick): array
    {
        return [
            'id' => $pick->id,
            'city' => $pick->city,
            'place' => $pick->place,
            'description' => $pick->description,
            'photoUrl' => $this->mediaService->publicUrl($pick->photoMedia),
            'videoUrl' => $this->mediaService->publicUrl($pick->videoMedia),
            'sortOrder' => $pick->sort_order,
            'isActive' => $pick->is_active,
        ];
    }
}
