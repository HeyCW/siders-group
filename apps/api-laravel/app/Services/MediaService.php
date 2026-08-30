<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Media;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MediaService
{
    /**
     * Laravel's own `public` disk (storage/app/public, symlinked to public/storage via
     * `php artisan storage:link`) — served directly by the web server as a static file, not
     * through a dedicated controller.
     */
    private const DISK = 'public';

    private const PREFIX = 'media';

    /**
     * `$context` (e.g. `anak-perusahaan`, `partners`) only shapes where the file lands on disk —
     * matches `packages/contracts/src/media.ts`'s `mediaContextSchema` — it is never stored on
     * the `Media` row itself.
     */
    public function store(UploadedFile $file, ?string $alt, ?string $caption, User $uploader, ?string $context = null): Media
    {
        $extension = $file->getMimeType() === 'video/mp4' ? 'mp4' : $file->extension();
        $filename = Str::uuid()->toString().'.'.$extension;
        $datedSubdir = self::PREFIX.'/'.now()->format('Y/m').($context ? '/'.$context : '');

        $storagePath = Storage::disk(self::DISK)->putFileAs($datedSubdir, $file, $filename);

        return Media::create([
            'storage_path' => $storagePath,
            'mime' => $file->getMimeType(),
            'size_bytes' => $file->getSize(),
            'original_filename' => $file->getClientOriginalName(),
            'alt' => $alt,
            'caption' => $caption,
            'uploaded_by' => $uploader->id,
        ]);
    }

    public function update(Media $media, ?string $alt, ?string $caption): Media
    {
        $media->update(array_filter([
            'alt' => $alt,
            'caption' => $caption,
        ], fn ($v) => $v !== null));

        return $media;
    }

    /**
     * DB row deleted first, then the file — an orphaned file with no DB row is a safe failure
     * mode (silently unreferenced); a DB row pointing at a deleted file is not (broken links).
     */
    public function delete(Media $media): void
    {
        $path = $media->storage_path;
        $media->delete();
        Storage::disk(self::DISK)->delete($path);
    }

    public function publicUrl(Media $media): string
    {
        return Storage::disk(self::DISK)->url($media->storage_path);
    }
}
