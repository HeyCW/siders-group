<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Media\StoreMediaRequest;
use App\Models\Media;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MediaController extends Controller
{
    public function __construct(private readonly MediaService $mediaService) {}

    public function store(StoreMediaRequest $request): JsonResponse
    {
        $media = $this->mediaService->store(
            $request->file('file'),
            $request->input('alt'),
            $request->input('caption'),
            $request->user('staff'),
            $request->input('context'),
        );

        return response()->json(['data' => $this->show($media)], 201);
    }

    public function showById(string $id): JsonResponse
    {
        return response()->json(['data' => $this->show(Media::findOrFail($id))]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $media = Media::findOrFail($id);
        $media = $this->mediaService->update($media, $request->input('alt'), $request->input('caption'));

        return response()->json(['data' => $this->show($media)]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->mediaService->delete(Media::findOrFail($id));

        return response()->json(['data' => null]);
    }

    private function show(Media $media): array
    {
        return [
            'id' => $media->id,
            'url' => $this->mediaService->publicUrl($media),
            'mime' => $media->mime,
            'sizeBytes' => $media->size_bytes,
            'originalFilename' => $media->original_filename,
            'alt' => $media->alt,
            'caption' => $media->caption,
            'createdAt' => $media->created_at->toIso8601String(),
        ];
    }
}
