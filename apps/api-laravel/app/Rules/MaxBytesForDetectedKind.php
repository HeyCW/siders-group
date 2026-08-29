<?php

declare(strict_types=1);

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Http\UploadedFile;

/**
 * Image and video uploads get different size ceilings. Decides which ceiling applies from the
 * file's *sniffed* MIME (`getMimeType()`, backed by PHP's fileinfo/magic-byte detection), never
 * the client-declared one, so a renamed file can't buy itself a bigger allowance.
 */
class MaxBytesForDetectedKind implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! $value instanceof UploadedFile) {
            return;
        }

        $mime = $value->getMimeType();
        $limit = str_starts_with((string) $mime, 'video/')
            ? (int) config('media.max_video_bytes')
            : (int) config('media.max_image_bytes');

        if ($value->getSize() > $limit) {
            $fail("The :attribute exceeds the maximum allowed size for its file type ({$limit} bytes).");
        }
    }
}
