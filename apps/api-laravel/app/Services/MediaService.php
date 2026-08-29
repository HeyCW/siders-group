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
    public function store(UploadedFile $file, ?string $alt, ?string $caption, User $uploader): Media
    {
        $extension = $file->getMimeType() === 'video/mp4' ? 'mp4' : $file->extension();
        $filename = Str::uuid()->toString().'.'.$extension;
        $datedSubdir = now()->format('Y/m');

        $storagePath = Storage::disk('media')->putFileAs($datedSubdir, $file, $filename);

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
        Storage::disk('media')->delete($path);
    }

    public function publicUrl(Media $media): string
    {
        $base = rtrim((string) config('media.public_base_url'), '/');

        return $base.'/'.$media->storage_path;
    }
}
