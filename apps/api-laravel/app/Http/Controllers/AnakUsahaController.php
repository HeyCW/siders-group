<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\AnakUsaha;
use App\Models\AnakUsahaProfile;
use App\Services\AnakUsahaService;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnakUsahaController extends Controller
{
    public function __construct(
        private readonly AnakUsahaService $anakUsahaService,
        private readonly MediaService $mediaService,
    ) {}

    /** Public listing — extended with presentation fields only when an active profile exists. */
    public function publicIndex(): JsonResponse
    {
        $entries = AnakUsaha::with(['profile' => fn ($q) => $q->where('is_active', true)])
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $entries->map(fn (AnakUsaha $a) => $this->publicShape($a))]);
    }

    public function adminIndex(): JsonResponse
    {
        $entries = AnakUsaha::with('profile')->orderBy('name')->get();

        return response()->json(['data' => $entries->map(fn (AnakUsaha $a) => $this->adminShape($a))]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate(['name' => ['required', 'string', 'max:255']]);
        $anakUsaha = $this->anakUsahaService->create($request->string('name')->value());

        return response()->json(['data' => $this->adminShape($anakUsaha)], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $request->validate(['name' => ['required', 'string', 'max:255']]);
        $anakUsaha = $this->anakUsahaService->update(AnakUsaha::findOrFail($id), $request->string('name')->value());

        return response()->json(['data' => $this->adminShape($anakUsaha)]);
    }

    public function destroy(string $id): JsonResponse
    {
        $this->anakUsahaService->delete(AnakUsaha::findOrFail($id));

        return response()->json(['data' => null]);
    }

    public function storeProfile(Request $request, string $id): JsonResponse
    {
        $data = $this->validatedProfileData($request);
        $this->anakUsahaService->createProfile(AnakUsaha::findOrFail($id), $data);

        return response()->json(['data' => $this->adminShape(AnakUsaha::with('profile')->findOrFail($id))], 201);
    }

    public function updateProfile(Request $request, string $id): JsonResponse
    {
        $data = $this->validatedProfileData($request, true);
        $profile = AnakUsahaProfile::where('anak_usaha_id', $id)->firstOrFail();
        $this->anakUsahaService->updateProfile($profile, $data);

        return response()->json(['data' => $this->adminShape(AnakUsaha::with('profile')->findOrFail($id))]);
    }

    public function destroyProfile(string $id): JsonResponse
    {
        $this->anakUsahaService->deleteProfile(AnakUsahaProfile::where('anak_usaha_id', $id)->firstOrFail());

        return response()->json(['data' => null]);
    }

    /** Returns the reordered list, not null — AnakUsahaPresentationPage replaces its local state
     *  with this response directly after a drag-reorder (same pattern as
     *  PartnerController::reorder). */
    public function reorderProfiles(Request $request): JsonResponse
    {
        $request->validate(['anakUsahaIds' => ['required', 'array']]);
        $this->anakUsahaService->reorderProfiles($request->input('anakUsahaIds'));

        $entries = AnakUsaha::with('profile')->orderBy('name')->get();

        return response()->json(['data' => $entries->map(fn (AnakUsaha $a) => $this->adminShape($a))]);
    }

    private function validatedProfileData(Request $request, bool $isUpdate = false): array
    {
        $rulePrefix = $isUpdate ? 'sometimes' : 'required';

        return $request->validate([
            'logoMediaId' => ['nullable', 'string', 'exists:media,id'],
            'backgroundColor' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'description' => ['nullable', 'string'],
            'kind' => [$rulePrefix, 'string', 'in:Media Platform,News & Community'],
            'links' => ['sometimes', 'array', 'max:10'],
            'links.*.label' => ['required_with:links', 'string'],
            'links.*.href' => ['required_with:links', 'url', 'regex:/^https?:\/\//'],
            'sortOrder' => ['sometimes', 'integer'],
            'isActive' => ['sometimes', 'boolean'],
        ]);
    }

    private function publicShape(AnakUsaha $anakUsaha): array
    {
        $base = ['id' => $anakUsaha->id, 'name' => $anakUsaha->name, 'slug' => $anakUsaha->slug];

        if ($anakUsaha->profile === null) {
            return $base;
        }

        return [...$base, ...$this->profileShape($anakUsaha->profile)];
    }

    private function adminShape(AnakUsaha $anakUsaha): array
    {
        return [
            'id' => $anakUsaha->id,
            'name' => $anakUsaha->name,
            'slug' => $anakUsaha->slug,
            'profile' => $anakUsaha->profile ? $this->profileShape($anakUsaha->profile) : null,
        ];
    }

    private function profileShape(AnakUsahaProfile $profile): array
    {
        return [
            'logoUrl' => $profile->logoMedia ? $this->mediaService->publicUrl($profile->logoMedia) : null,
            'backgroundColor' => $profile->background_color,
            'description' => $profile->description,
            'kind' => $profile->kind,
            'links' => $profile->links,
            'sortOrder' => $profile->sort_order,
            'isActive' => $profile->is_active,
        ];
    }
}
