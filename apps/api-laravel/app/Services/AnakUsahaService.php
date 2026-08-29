<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\AnakUsahaConflictException;
use App\Exceptions\OrderSetMismatchException;
use App\Exceptions\ProfileConflictException;
use App\Models\AnakUsaha;
use App\Models\AnakUsahaProfile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AnakUsahaService
{
    public function create(string $name): AnakUsaha
    {
        $slug = $this->slugFor($name, null);

        return AnakUsaha::create(['name' => $name, 'slug' => $slug]);
    }

    public function update(AnakUsaha $anakUsaha, string $name): AnakUsaha
    {
        $anakUsaha->update(['name' => $name, 'slug' => $this->slugFor($name, $anakUsaha->id)]);

        return $anakUsaha;
    }

    /** Detaches, never cascades — articles.anak_usaha_id is ON DELETE SET NULL. */
    public function delete(AnakUsaha $anakUsaha): void
    {
        $anakUsaha->delete();
    }

    public function createProfile(AnakUsaha $anakUsaha, array $data): AnakUsahaProfile
    {
        if ($anakUsaha->profile()->exists()) {
            throw new ProfileConflictException();
        }

        return AnakUsahaProfile::create([
            'anak_usaha_id' => $anakUsaha->id,
            'logo_media_id' => $data['logoMediaId'] ?? null,
            'background_color' => $data['backgroundColor'] ?? null,
            'description' => $data['description'] ?? null,
            'kind' => $data['kind'],
            'links' => $data['links'] ?? [],
            'sort_order' => $data['sortOrder'] ?? 0,
            'is_active' => $data['isActive'] ?? true,
        ]);
    }

    public function updateProfile(AnakUsahaProfile $profile, array $data): AnakUsahaProfile
    {
        $profile->update(array_filter([
            'logo_media_id' => $data['logoMediaId'] ?? null,
            'background_color' => $data['backgroundColor'] ?? null,
            'description' => $data['description'] ?? null,
            'kind' => $data['kind'] ?? null,
            'links' => $data['links'] ?? null,
            'sort_order' => $data['sortOrder'] ?? null,
            'is_active' => $data['isActive'] ?? null,
        ], fn ($v) => $v !== null));

        return $profile;
    }

    public function deleteProfile(AnakUsahaProfile $profile): void
    {
        $profile->delete();
    }

    /** @param array<int, string> $orderedAnakUsahaIds */
    public function reorderProfiles(array $orderedAnakUsahaIds): void
    {
        DB::transaction(function () use ($orderedAnakUsahaIds) {
            $existingIds = AnakUsahaProfile::pluck('anak_usaha_id')->all();

            if (count($existingIds) !== count($orderedAnakUsahaIds)
                || array_diff($existingIds, $orderedAnakUsahaIds) !== []
                || array_diff($orderedAnakUsahaIds, $existingIds) !== []
            ) {
                throw new OrderSetMismatchException();
            }

            foreach ($orderedAnakUsahaIds as $index => $id) {
                AnakUsahaProfile::where('anak_usaha_id', $id)->update(['sort_order' => $index]);
            }
        });
    }

    private function slugFor(string $name, ?string $ignoreId): string
    {
        $slug = Str::slug($name);

        $exists = AnakUsaha::where(fn ($q) => $q->where('name', $name)->orWhere('slug', $slug))
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();

        if ($exists) {
            throw new AnakUsahaConflictException();
        }

        return $slug;
    }
}
